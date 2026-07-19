/* ================================================================
   Live Scores — Sincronización de marcadores reales con API-Football
   (api-sports.io)
   ================================================================

   Consulta los partidos del Mundial (league=1) y vuelca los marcadores
   reales y su estado en la tabla `matches`. La API es la *fuente de verdad*
   para los partidos en juego o finalizados: sobrescribe siempre su marcador.

   ── Plan gratuito (100 peticiones/día, 10/min) ──────────────────
   Una sola petición ?date= trae todos los partidos del día. Para no agotar la
   cuota, el sondeo es ADAPTATIVO:
     · Hay partidos EN VIVO        → cada LIVE_MS   (def. 10 min)
     · Hay partidos hoy, sin vivo  → cada NEAR_MS   (def. 30 min)
     · No hay Mundial hoy          → cada IDLE_MS   (def. 120 min)
   Además, si la cuota diaria restante baja del umbral de seguridad, se pausa
   hasta que el contador se reinicie (medianoche UTC).

   ── Zona horaria ────────────────────────────────────────────────
   La API lista los partidos por su fecha UTC de inicio. Un partido nocturno
   en América (ej. 21:00 ET = 01:00 UTC) cae en el día UTC siguiente. Para no
   perder partidos que cruzan la medianoche UTC, en la madrugada UTC se
   consulta también el día anterior.

   Configuración por variables de entorno (ver .env.example):
     APIFOOTBALL_KEY              Token de api-sports.io (obligatorio para activar)
     WC_LEAGUE_ID                 ID de liga del Mundial (def. 1)
     LIVE_SYNC_ENABLED            "false" para desactivar aunque haya key
     LIVE_SYNC_LIVE_MS            Intervalo con partidos en vivo (def. 600000)
     LIVE_SYNC_NEAR_MS           Intervalo en día de partidos sin vivo (def. 1800000)
     LIVE_SYNC_IDLE_MS            Intervalo sin partidos hoy (def. 7200000)
   ================================================================ */

const db = require('../db/database');

const API_BASE = 'https://v3.football.api-sports.io';

const API_KEY = process.env.APIFOOTBALL_KEY || process.env.FOOTBALL_API_KEY || '';
const LEAGUE_ID = parseInt(process.env.WC_LEAGUE_ID || '1', 10);
const ENABLED = !!API_KEY && process.env.LIVE_SYNC_ENABLED !== 'false';

const LIVE_MS = Math.max(60000, parseInt(process.env.LIVE_SYNC_LIVE_MS || '600000', 10));   // 10 min
const NEAR_MS = Math.max(60000, parseInt(process.env.LIVE_SYNC_NEAR_MS || '1800000', 10));  // 30 min
const IDLE_MS = Math.max(60000, parseInt(process.env.LIVE_SYNC_IDLE_MS || '7200000', 10));  // 120 min
const SAFETY_REMAINING = parseInt(process.env.LIVE_SYNC_SAFETY || '5', 10); // freno de cuota

// Estados (status.short) de API-Football.
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

// Etapas de la fase eliminatoria (group_name en la BD). En estas llaves la
// quiniela cuenta SOLO el marcador de los 90 minutos reglamentarios: se ignoran
// la prórroga (tiempos extra) y la tanda de penales. La fase de grupos usa las
// letras A–L y conserva su comportamiento original.
const KNOCKOUT_STAGES = new Set(['R32', 'R16', 'QF', 'SF', 'TP', 'FIN']);

/* ── Diccionario de alias: nombre en español (BD) → variantes de la API ── */
const TEAM_ALIASES = {
  'México': ['Mexico'],
  'Sudáfrica': ['South Africa'],
  'Corea del Sur': ['South Korea', 'Korea Republic', 'Korea, South', 'Republic of Korea'],
  'República Checa': ['Czech Republic', 'Czechia'],
  'Canadá': ['Canada'],
  'Bosnia y Herzegovina': ['Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia & Herzegovina', 'Bosnia'],
  'Qatar': ['Qatar'],
  'Suiza': ['Switzerland'],
  'Brasil': ['Brazil'],
  'Marruecos': ['Morocco'],
  'Haití': ['Haiti'],
  'Escocia': ['Scotland'],
  'Estados Unidos': ['United States', 'USA', 'United States of America', 'US'],
  'Paraguay': ['Paraguay'],
  'Australia': ['Australia'],
  'Turquía': ['Turkey', 'Türkiye', 'Turkiye'],
  'Alemania': ['Germany'],
  'Curazao': ['Curacao', 'Curaçao'],
  'Costa de Marfil': ['Ivory Coast', "Côte d'Ivoire", 'Cote d Ivoire'],
  'Ecuador': ['Ecuador'],
  'Países Bajos': ['Netherlands', 'Holland'],
  'Japón': ['Japan'],
  'Suecia': ['Sweden'],
  'Túnez': ['Tunisia'],
  'Bélgica': ['Belgium'],
  'Egipto': ['Egypt'],
  'Irán': ['Iran'],
  'Nueva Zelanda': ['New Zealand'],
  'España': ['Spain'],
  'Cabo Verde': ['Cape Verde', 'Cabo Verde'],
  'Arabia Saudita': ['Saudi Arabia'],
  'Uruguay': ['Uruguay'],
  'Francia': ['France'],
  'Senegal': ['Senegal'],
  'Irak': ['Iraq'],
  'Noruega': ['Norway'],
  'Argentina': ['Argentina'],
  'Argelia': ['Algeria'],
  'Austria': ['Austria'],
  'Jordania': ['Jordan'],
  'Portugal': ['Portugal'],
  'RD Congo': ['DR Congo', 'Congo DR', 'Democratic Republic of Congo', 'Congo, DR', 'Congo-Kinshasa'],
  'Uzbekistán': ['Uzbekistan'],
  'Colombia': ['Colombia'],
  'Inglaterra': ['England'],
  'Croacia': ['Croatia'],
  'Ghana': ['Ghana'],
  'Panamá': ['Panama'],
};

// Quita acentos, signos y espacios para comparar nombres de forma robusta.
const normalize = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// nombre normalizado (español o alias) → nombre español canónico de la BD.
const NORM_LOOKUP = (() => {
  const map = {};
  for (const [es, variants] of Object.entries(TEAM_ALIASES)) {
    map[normalize(es)] = es;
    for (const v of variants) map[normalize(v)] = es;
  }
  return map;
})();

const toCanonical = (name) => NORM_LOOKUP[normalize(name)] || null;

/* ── Estado interno para diagnóstico (expuesto por /api/live/status) ── */
let lastSync = {
  enabled: ENABLED,
  provider: 'api-football',
  leagueId: LEAGUE_ID,
  lastRunAt: null,
  ok: null,
  error: null,
  matchedCount: 0,       // partidos del Mundial emparejados con la BD
  updatedCount: 0,       // partidos cuyo marcador/estado cambió
  liveCount: 0,          // partidos actualmente en vivo
  fixturesToday: 0,      // partidos del Mundial encontrados (hoy / ventana)
  requestsRemaining: null, // cuota diaria restante (header de la API)
  unmatchedTeams: [],    // nombres de la API que no se pudieron mapear
};

let timer = null;

/* ── Fechas a consultar (UTC). Incluye ayer en la madrugada UTC para no
      perder partidos que cruzan la medianoche. ─────────────────────── */
function datesToQuery() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dates = [today];
  if (now.getUTCHours() < 5) {
    const y = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    dates.unshift(y);
  }
  return dates;
}

/* ── Llamada HTTP a API-Football para una fecha ───────────────── */
async function fetchByDate(date) {
  const url = `${API_BASE}/fixtures?date=${date}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  const remainingHeader = res.headers.get('x-ratelimit-requests-remaining');
  const remaining = remainingHeader != null ? parseInt(remainingHeader, 10) : null;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API-Football ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = await res.json();

  // API-Football responde 200 con `errors` no vacío ante problemas (cuota, token…).
  const errs = data.errors;
  const hasErr = Array.isArray(errs) ? errs.length > 0 : (errs && Object.keys(errs).length > 0);
  if (hasErr) throw new Error(`API-Football: ${JSON.stringify(errs)}`);

  const fixtures = (data.response || []).filter(f => f.league?.id === LEAGUE_ID);
  return { fixtures, remaining };
}

/* ── Índice de partidos de la BD por par de selecciones ───────── */
function buildMatchIndex() {
  const matches = db.all("SELECT id, home, away, group_name FROM matches");
  const index = {};
  for (const m of matches) {
    const h = toCanonical(m.home);
    const a = toCanonical(m.away);
    if (!h || !a) continue;
    index[`${h}|${a}`] = { id: m.id, knockout: KNOCKOUT_STAGES.has(m.group_name) };
  }
  return index;
}

/* ── Extrae el marcador a registrar para un fixture ────────────────
   · Eliminatorias: SOLO los 90 minutos. Una vez cumplido el tiempo
     reglamentario, API-Football congela `score.fulltime` con ese marcador
     aunque el partido continúe a prórroga o penales; mientras el partido va
     en su tiempo regular, `fulltime` aún es null y se usa `goals` (en vivo).
   · Grupos: comportamiento original (`goals`, con respaldo en `fulltime`).
   Devuelve { home, away } o null si todavía no hay marcador disponible. */
function extractScore(f, isKnockout) {
  const g = f.goals || {};
  const ft = f.score?.fulltime || {};

  if (isKnockout) {
    // Prioriza el marcador de los 90' (fulltime) e ignora prórroga/penales.
    if (ft.home != null && ft.away != null) return { home: ft.home, away: ft.away };
    if (g.home != null && g.away != null) return { home: g.home, away: g.away };
    return null;
  }

  const home = g.home != null ? g.home : (ft.home != null ? ft.home : null);
  const away = g.away != null ? g.away : (ft.away != null ? ft.away : null);
  if (home == null || away == null) return null;
  return { home, away };
}

/* ── Una corrida de sincronización ────────────────────────────── */
async function syncOnce() {
  const dates = datesToQuery();

  // Reúne los fixtures del Mundial (dedup por id) y la cuota mínima restante.
  const byId = new Map();
  let remaining = null;
  for (const d of dates) {
    const { fixtures, remaining: rem } = await fetchByDate(d);
    if (rem != null) remaining = remaining == null ? rem : Math.min(remaining, rem);
    for (const f of fixtures) byId.set(f.fixture.id, f);
  }
  const fixtures = [...byId.values()];

  const index = buildMatchIndex();
  const updates = [];
  const unmatched = new Set();
  let liveCount = 0;

  for (const f of fixtures) {
    const status = f.fixture?.status?.short || null;
    if (LIVE_STATUSES.has(status)) liveCount++;

    const apiHome = f.teams?.home?.name;
    const apiAway = f.teams?.away?.name;
    const h = toCanonical(apiHome);
    const a = toCanonical(apiAway);
    if (!h || !a) {
      if (!h && apiHome) unmatched.add(apiHome);
      if (!a && apiAway) unmatched.add(apiAway);
      continue;
    }

    let entry = index[`${h}|${a}`];
    let swapped = false;
    if (entry === undefined) { entry = index[`${a}|${h}`]; swapped = true; }
    if (entry === undefined) continue;
    const matchId = entry.id;

    const scored = LIVE_STATUSES.has(status) || FINISHED_STATUSES.has(status);
    if (!scored) {
      // Aún no inicia: solo refresca el estado, sin tocar el marcador
      // (no sobrescribe nada que el admin pudiera haber cargado a mano).
      updates.push({ id: matchId, status });
      continue;
    }

    // En eliminatorias se registra solo el marcador de los 90' (sin prórroga
    // ni penales); en grupos, el marcador corriente. Ver extractScore().
    const sc = extractScore(f, entry.knockout);
    if (!sc) { updates.push({ id: matchId, status }); continue; }
    let { home, away } = sc;
    if (swapped) { const t = home; home = away; away = t; }
    updates.push({ id: matchId, real_home: home, real_away: away, status });
  }

  const { changed } = db.applyLiveUpdates(updates);

  lastSync = {
    ...lastSync,
    enabled: ENABLED,
    lastRunAt: new Date().toISOString(),
    ok: true,
    error: null,
    matchedCount: updates.length,
    updatedCount: changed,
    liveCount,
    fixturesToday: fixtures.length,
    requestsRemaining: remaining,
    unmatchedTeams: [...unmatched],
  };
  return lastSync;
}

// Envoltura segura: nunca lanza (para no romper el planificador).
async function safeSync() {
  try {
    await db.getDb();
    const r = await syncOnce();
    if (r.updatedCount > 0 || r.unmatchedTeams.length) {
      console.log(`[LIVE] Sync ok — ${r.updatedCount} cambios, ${r.liveCount} en vivo, ${r.matchedCount}/${r.fixturesToday} emparejados, cuota ${r.requestsRemaining ?? '?'}.`);
      if (r.unmatchedTeams.length) console.warn('[LIVE] Equipos sin mapear:', r.unmatchedTeams.join(', '));
    }
    return r;
  } catch (err) {
    lastSync = { ...lastSync, lastRunAt: new Date().toISOString(), ok: false, error: err.message };
    console.error('[LIVE] Error de sincronización:', err.message);
    return lastSync;
  }
}

/* ── Planificador adaptativo ──────────────────────────────────── */
function decideDelay(r) {
  // Freno por cuota: si queda poca, espera largo (el contador reinicia a medianoche UTC).
  if (r.requestsRemaining != null && r.requestsRemaining <= SAFETY_REMAINING) {
    console.warn(`[LIVE] Cuota diaria casi agotada (${r.requestsRemaining}). Pausando sondeo 1 h.`);
    return Math.max(IDLE_MS, 3600000);
  }
  if (r.liveCount > 0) return LIVE_MS;
  if (r.fixturesToday > 0) return NEAR_MS;
  return IDLE_MS;
}

async function tick() {
  const r = await safeSync();
  // Si falló la llamada, reintenta con cadencia "cercana" (no martillea).
  const delay = r.ok === false ? NEAR_MS : decideDelay(r);
  timer = setTimeout(tick, delay);
  if (timer.unref) timer.unref();
}

function start() {
  if (!ENABLED) {
    console.log('[LIVE] Marcadores en vivo desactivados (define APIFOOTBALL_KEY para activar).');
    return;
  }
  console.log(`[LIVE] Marcadores en vivo activos — API-Football, liga ${LEAGUE_ID}. Sondeo adaptativo (vivo ${Math.round(LIVE_MS/60000)}m / día ${Math.round(NEAR_MS/60000)}m / inactivo ${Math.round(IDLE_MS/60000)}m).`);
  tick();
}

function getStatus() { return lastSync; }
function isEnabled() { return ENABLED; }

module.exports = { start, safeSync, syncOnce, getStatus, isEnabled, extractScore };
