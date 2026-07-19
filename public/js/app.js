/* ================================================================
   Quiniela Mundial 2026 | Zseries — Frontend App
   ================================================================ */

/* ── Auth Module ─────────────────────────────────────────────── */
const Auth = (() => {
  const TOKEN_KEY = 'quiniela_admin_token';

  let _isAdmin = false;

  const isAdmin = () => _isAdmin;

  /* Muestra/oculta ojo en el input de contraseña */
  const toggleEye = () => {
    const inp = document.getElementById('login-password');
    const ico = document.getElementById('eye-icon');
    if (inp.type === 'password') {
      inp.type = 'text';
      ico.className = 'fa-solid fa-eye-slash';
    } else {
      inp.type = 'password';
      ico.className = 'fa-solid fa-eye';
    }
  };

  /* Login admin */
  const login = async () => {
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    if (!password) { errEl.textContent = 'Ingresa la contraseña'; return; }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Error al iniciar sesión'; return; }

      localStorage.setItem(TOKEN_KEY, data.token);
      _isAdmin = true;
      applyMode('admin');
      hideOverlay();
    } catch (e) {
      errEl.textContent = 'Error de conexión';
    }
  };

  /* Entrada como invitado */
  const enterAsGuest = () => {
    _isAdmin = false;
    applyMode('guest');
    hideOverlay();
  };

  /* Cerrar sesión */
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    _isAdmin = false;
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    showOverlay();
    applyMode('guest');
  };

  /* Aplica clases CSS según el rol */
  const applyMode = (mode) => {
    document.body.classList.toggle('guest-mode', mode === 'guest');

    // Session badge en sidebar
    const badge = document.getElementById('session-badge');
    if (mode === 'admin') {
      badge.className = 'session-badge admin';
      badge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Administrador';
    } else {
      badge.className = 'session-badge guest';
      badge.innerHTML = '<i class="fa-solid fa-eye"></i> Participante';
    }

    // Badge mobile
    const mob = document.getElementById('mobile-mode-badge');
    if (mode === 'admin') {
      mob.className = 'mobile-mode-badge admin';
      mob.textContent = 'Admin';
    } else {
      mob.className = 'mobile-mode-badge guest';
      mob.textContent = '';
    }

    // En modo guest, ir siempre a standings
    if (mode === 'guest') {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-standings').classList.add('active');
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelector('[data-page="standings"]')?.classList.add('active');
    }
  };

  const hideOverlay = () => {
    document.getElementById('login-overlay').classList.add('hidden');
  };

  const showOverlay = () => {
    document.getElementById('login-overlay').classList.remove('hidden');
  };

  /* Al cargar: verificar token guardado */
  const init = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.valid) {
          _isAdmin = true;
          applyMode('admin');
          hideOverlay();
          return;
        }
      } catch (e) { /* continuar, mostrar overlay */ }
      localStorage.removeItem(TOKEN_KEY);
    }
    // Mostrar overlay de login
    showOverlay();
  };

  // Botón invitado
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-guest').addEventListener('click', enterAsGuest);
    init();
  });

  return { login, logout, toggleEye, isAdmin };
})();

const AVATAR_COLORS = [
  '#f5b800','#00bcd4','#1db954','#e53935','#9c27b0',
  '#ff7043','#26c6da','#d81b60','#43a047','#fb8c00',
  '#7e57c2','#ef5350','#00897b','#f06292','#5c6bc0',
  '#66bb6a','#ffa726','#26a69a','#ec407a','#ab47bc'
];

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

/* Etapas del torneo. Las 12 primeras son la fase de grupos; el resto, eliminatorias.
   - code:  identificador guardado en matches.group_name
   - label: título completo (encabezados, detalle)
   - short: texto corto para las pestañas (pills) */
const STAGES = [
  ...GROUPS.map(g => ({ code: g, label: `Grupo ${g}`, short: `Grupo ${g}` })),
  { code: 'R32', label: 'Dieciseisavos de final', short: '16avos' },
  { code: 'R16', label: 'Octavos de final',       short: 'Octavos' },
  { code: 'QF',  label: 'Cuartos de final',        short: 'Cuartos' },
  { code: 'SF',  label: 'Semifinales',             short: 'Semis' },
  { code: 'TP',  label: 'Tercer puesto',           short: '3er puesto' },
  { code: 'FIN', label: 'Final',                   short: 'Final' },
];

/* Selecciones que llegaron a dieciseisavos de final (fase "Campeón").
   Debe coincidir exactamente con CHAMPION_TEAMS en routes/api.js. */
const CHAMPION_TEAMS = [
  'Alemania', 'Argentina', 'Argelia', 'Australia', 'Austria', 'Bélgica',
  'Bosnia y Herzegovina', 'Brasil', 'Cabo Verde', 'Canadá', 'Colombia',
  'Costa de Marfil', 'Croacia', 'Ecuador', 'Egipto', 'España',
  'Estados Unidos', 'Francia', 'Ghana', 'Inglaterra', 'Japón', 'Marruecos',
  'México', 'Noruega', 'Países Bajos', 'Paraguay', 'Portugal',
  'RD Congo', 'Senegal', 'Sudáfrica', 'Suecia', 'Suiza',
].sort((a, b) => a.localeCompare(b, 'es'));

const stageLabel = (code) => (STAGES.find(s => s.code === code)?.label) || code;
/* Es eliminatoria todo lo que no sea un grupo A–L (nombres de selección editables por admin). */
const isKnockout = (code) => !GROUPS.includes(code);

/* ── Estados de partido (códigos status.short de API-Football) ──────────
   En vivo: 1H, HT (medio tiempo), 2H, ET (tiempo extra), BT, P (penales), … */
const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const isLiveStatus = (st) => LIVE_STATUSES.includes(st);
const isFinishedStatus = (st) => FINISHED_STATUSES.includes(st);

/* Devuelve un chip de estado para un partido (EN VIVO / Final), o '' si no aplica. */
const liveStatusChip = (m) => {
  if (isLiveStatus(m.status)) return `<span class="live-chip"><span class="live-dot"></span> EN VIVO</span>`;
  if (isFinishedStatus(m.status)) return `<span class="final-chip">Final</span>`;
  return '';
};

/* Chip que indica que el marcador fue congelado a mano por el admin (oficial). */
const lockChip = (m) =>
  m.locked ? `<span class="lock-chip" title="Marcador oficial fijado por el administrador"><i class="fa-solid fa-lock"></i> Oficial</span>` : '';

const App = (() => {
  /* ── State ─────────────────────────────────────────── */
  let state = {
    participants: [],
    matches: [],
    selForecastParticipant: null,
    selForecastGroup: 'A',
    selResultGroup: 'A',
    selDetailParticipant: null,
    selChampionParticipant: null,
  };

  /* ── API helpers ────────────────────────────────────── */
  const api = async (method, path, body = null) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    // Adjunta el token de admin (si existe) para autorizar operaciones de escritura.
    const adminToken = localStorage.getItem('quiniela_admin_token');
    if (adminToken) opts.headers['X-Admin-Token'] = adminToken;
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error en el servidor');
    return data;
  };

  /* ── Toast ──────────────────────────────────────────── */
  let toastTimer = null;
  const toast = (msg, type = '') => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2500);
  };

  /* ── Navigation ─────────────────────────────────────── */
  // Solo la gestión de participantes (crear / eliminar) queda restringida al admin.
  // Vaticinios, resultados y detalle son accesibles para participantes en modo lectura.
  const ADMIN_PAGES = ['participants'];

  const showPage = (name) => {
    // Bloquear páginas admin a invitados
    if (!Auth.isAdmin() && ADMIN_PAGES.includes(name)) return;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.querySelector(`[data-page="${name}"]`)?.classList.add('active');
    closeSidebar();
    if (name === 'standings') loadStandings();
    if (name === 'participants') renderParticipants();
    if (name === 'forecasts') renderForecasts();
    if (name === 'results') renderResults();
    if (name === 'champion') renderChampion();
    if (name === 'detail') renderDetail();
  };

  /* ── Sidebar (mobile) ───────────────────────────────── */
  const openSidebar  = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); };
  const closeSidebar = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); };

  /* ── Avatar ─────────────────────────────────────────── */
  const avatar = (name, idx, size = 34) => {
    const col = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const init = name.charAt(0).toUpperCase();
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:${col};font-size:${Math.round(size*0.41)}px">${init}</div>`;
  };

  /* ── Participants ────────────────────────────────────── */
  const loadParticipants = async () => {
    state.participants = await api('GET', '/participants');
    renderParticipants();
  };

  const addParticipant = async () => {
    const inp = document.getElementById('new-name');
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    try {
      const p = await api('POST', '/participants', { name });
      state.participants.push(p);
      inp.value = '';
      inp.focus();
      renderParticipants();
      toast(`${p.name} agregado ✓`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeParticipant = async (id, name) => {
    if (!confirm(`¿Eliminar a ${name}? Se borrarán sus vaticinios.`)) return;
    try {
      await api('DELETE', `/participants/${id}`);
      state.participants = state.participants.filter(p => p.id !== id);
      renderParticipants();
      toast(`${name} eliminado`, '');
    } catch (e) { toast(e.message, 'error'); }
  };

  const renderParticipants = () => {
    document.getElementById('participant-count').textContent = state.participants.length;
    const el = document.getElementById('participant-list');
    if (!state.participants.length) {
      el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users"></i><p>No hay participantes. ¡Agrega el primero!</p></div>`;
      return;
    }
    el.innerHTML = `<div class="participant-grid">${
      state.participants.map((p, i) => `
        <div class="participant-chip">
          ${avatar(p.name, i, 30)}
          <span class="name">${esc(p.name)}</span>
          <button class="delete-btn" onclick="App.removeParticipant('${p.id}','${esc(p.name)}')" title="Eliminar">✕</button>
        </div>
      `).join('')
    }</div>`;
  };

  /* ── Forecasts ──────────────────────────────────────── */
  let forecastCache = {};   // participantId → { matchId: {home,away} }
  let matchResultCache = {}; // loaded from /matches

  const renderForecasts = async () => {
    if (!state.participants.length) {
      document.getElementById('forecast-participant-tabs').innerHTML =
        `<p class="empty-state" style="padding:16px 18px">${Auth.isAdmin() ? 'Agrega participantes primero.' : 'Aún no hay participantes registrados.'}</p>`;
      document.getElementById('forecast-group-card').style.display = 'none';
      document.getElementById('forecast-matches').innerHTML = '';
      return;
    }
    document.getElementById('forecast-group-card').style.display = '';

    // Texto guía según el rol
    const subEl = document.getElementById('forecasts-sub');
    if (subEl) subEl.textContent = Auth.isAdmin()
      ? 'Ingresa las predicciones de cada participante'
      : 'Consulta las predicciones de cada participante';

    if (!state.selForecastParticipant ||
        !state.participants.find(p => p.id === state.selForecastParticipant)) {
      state.selForecastParticipant = state.participants[0].id;
    }

    // Participant tabs
    document.getElementById('forecast-participant-tabs').innerHTML =
      state.participants.map(p => `
        <button class="pill ${p.id === state.selForecastParticipant ? 'active' : ''}"
          onclick="App.selectForecastParticipant('${p.id}')">${esc(p.name)}</button>
      `).join('');

    // Stage tabs (grupos + eliminatorias)
    document.getElementById('forecast-group-tabs').innerHTML =
      STAGES.map(s => `
        <button class="pill ${s.code === state.selForecastGroup ? 'active' : ''}"
          data-code="${s.code}" onclick="App.selectForecastGroup('${s.code}')">${s.short}</button>
      `).join('');

    await loadForecastMatches();
  };

  const loadForecastMatches = async () => {
    const pId = state.selForecastParticipant;
    const g = state.selForecastGroup;
    const el = document.getElementById('forecast-matches');
    el.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    try {
      // Load forecasts for participant (cache)
      if (!forecastCache[pId]) {
        forecastCache[pId] = await api('GET', `/forecasts/${pId}`);
      }
      // Load matches for group
      const matches = await api('GET', `/matches?group=${g}`);

      const fcMap = forecastCache[pId] || {};
      const readOnly = !Auth.isAdmin();
      const roAttr = readOnly ? 'disabled' : 'onchange="App.saveForecast(this)"';
      let html = `<div class="matches-card">
        <div class="matches-card-header"><i class="fa-solid fa-layer-group"></i> Vaticinios — ${stageLabel(g)}</div>`;

      matches.forEach(m => {
        const fc = fcMap[m.id] || {};
        const hasResult = m.real_home !== null && m.real_away !== null;
        const score = hasResult && (fc.home !== null && fc.home !== undefined)
          ? calcScore(fc, m) : null;
        const badgeHtml = scoreBadge(score, hasResult);
        const realStr = hasResult ? `${m.real_home}:${m.real_away}` : '-';

        html += `<div class="match-row">
          ${teamCell(m, 'home')}
          <div class="score-input-group">
            <input type="number" min="0" max="30" value="${fc.home ?? ''}" placeholder="-"
              data-pid="${pId}" data-mid="${m.id}" data-side="home" ${roAttr} />
            <span class="score-sep">:</span>
            <input type="number" min="0" max="30" value="${fc.away ?? ''}" placeholder="-"
              data-pid="${pId}" data-mid="${m.id}" data-side="away" ${roAttr} />
          </div>
          ${teamCell(m, 'away')}
          <div class="match-meta">
            <span class="match-date">${m.match_date || ''}</span>
            ${liveStatusChip(m)} ${lockChip(m)}
            ${badgeHtml}
            <span style="font-size:11px;color:${hasResult ? 'var(--green)' : 'var(--text3)'}">
              ${hasResult ? `<span class="dot dot-played"></span> ${realStr}` : '<span class="dot dot-pending"></span> Por jugarse'}
            </span>
          </div>
        </div>`;
      });

      html += '</div>';
      el.innerHTML = html;
    } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
  };

  const saveForecast = async (input) => {
    const { pid, mid, side } = input.dataset;
    const val = input.value;
    try {
      // Get current cached values
      if (!forecastCache[pid]) forecastCache[pid] = {};
      if (!forecastCache[pid][mid]) forecastCache[pid][mid] = {};
      forecastCache[pid][mid][side] = val === '' ? null : parseInt(val);

      const fc = forecastCache[pid][mid];
      await api('PUT', `/forecasts/${pid}/${mid}`, { home: fc.home ?? null, away: fc.away ?? null });
    } catch (e) { toast(e.message, 'error'); }
  };

  /* ── Results ────────────────────────────────────────── */
  const renderResults = async () => {
    const subEl = document.getElementById('results-sub');
    if (subEl) subEl.textContent = Auth.isAdmin()
      ? 'Ingresa los marcadores oficiales para calcular puntos'
      : 'Marcadores oficiales de los partidos';
    document.getElementById('results-group-tabs').innerHTML =
      STAGES.map(s => `
        <button class="pill ${s.code === state.selResultGroup ? 'active' : ''}"
          data-code="${s.code}" onclick="App.selectResultGroup('${s.code}')">${s.short}</button>
      `).join('');
    await loadResultMatches();
  };

  const loadResultMatches = async () => {
    const g = state.selResultGroup;
    const el = document.getElementById('results-matches');
    el.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    try {
      const matches = await api('GET', `/matches?group=${g}`);
      const readOnly = !Auth.isAdmin();
      const roAttr = readOnly ? 'disabled' : 'onchange="App.saveResult(this)"';
      // Solo el admin puede nombrar las selecciones, y solo en eliminatorias.
      const editTeams = Auth.isAdmin() && isKnockout(g);
      let html = `<div class="matches-card">
        <div class="matches-card-header"><i class="fa-solid fa-futbol"></i> Resultados reales — ${stageLabel(g)}</div>`;
      if (editTeams) {
        html += `<div class="stage-hint"><i class="fa-solid fa-circle-info"></i> Escribe las selecciones clasificadas en cada llave; los participantes verán esos nombres en sus vaticinios.</div>`;
      }

      matches.forEach(m => {
        const played = m.real_home !== null && m.real_away !== null;
        // Switch de congelado (solo admin); en lectura, chip "Oficial" si aplica.
        const lockCtl = Auth.isAdmin()
          ? `<label class="lock-toggle ${m.locked ? 'on' : ''}" title="Congela el marcador: la sincronización en vivo dejará de modificarlo">
              <input type="checkbox" ${m.locked ? 'checked' : ''} data-mid="${m.id}" onchange="App.toggleLock(this)" />
              <i class="fa-solid fa-lock"></i><span>Congelar</span>
            </label>`
          : lockChip(m);
        html += `<div class="match-row">
          ${teamCell(m, 'home', editTeams)}
          <div class="score-cell">
            <div class="score-input-group">
              <input type="number" min="0" max="30" value="${played ? m.real_home : ''}" placeholder="-"
                data-mid="${m.id}" data-side="home" ${roAttr} />
              <span class="score-sep">:</span>
              <input type="number" min="0" max="30" value="${played ? m.real_away : ''}" placeholder="-"
                data-mid="${m.id}" data-side="away" ${roAttr} />
            </div>
            ${lockCtl}
          </div>
          ${teamCell(m, 'away', editTeams)}
          <div class="match-meta">
            <span class="match-date">${m.match_date || ''}</span>
            ${liveStatusChip(m)}
            <span>
              <span class="dot ${played ? 'dot-played' : 'dot-pending'}"></span>
              <span style="font-size:11px;color:var(--text3)">${played ? 'Jugado' : 'Pendiente'}</span>
            </span>
          </div>
        </div>`;
      });

      html += '</div>';
      el.innerHTML = html;
    } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
  };

  // Track partial result input (need both sides)
  const resultBuffer = {};
  const saveResult = async (input) => {
    const { mid, side } = input.dataset;
    if (!resultBuffer[mid]) resultBuffer[mid] = {};
    resultBuffer[mid][side] = input.value === '' ? null : parseInt(input.value);

    const buf = resultBuffer[mid];
    // Save when both sides have values (or both cleared)
    const homeSet = buf.home !== undefined;
    const awaySet = buf.away !== undefined;
    if (!homeSet || !awaySet) return;

    try {
      await api('PUT', `/matches/${mid}/result`, { home: buf.home, away: buf.away });
      // Bust forecast cache so scores refresh
      forecastCache = {};
      toast('Resultado guardado ✓', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  // Congela / descongela el marcador de un partido (contingencia ante fallo de
  // la API). Al congelar, la sincronización en vivo deja de tocar ese marcador.
  const toggleLock = async (input) => {
    const mid = input.dataset.mid;
    const locked = input.checked;
    try {
      await api('PUT', `/matches/${mid}/lock`, { locked });
      forecastCache = {};
      toast(locked ? 'Marcador congelado 🔒' : 'Marcador desbloqueado 🔓', 'success');
      await loadResultMatches();
    } catch (e) {
      input.checked = !locked; // revierte el switch si falló
      toast(e.message, 'error');
    }
  };

  // Guarda el nombre de una selección de eliminatorias (solo admin).
  const saveTeam = async (input) => {
    const { mid, side } = input.dataset;
    try {
      await api('PUT', `/matches/${mid}/teams`, { [side]: input.value.trim() });
      toast('Selección actualizada ✓', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  /* ── Fase Campeón ─────────────────────────────────────
     Cada participante elige, entre las 32 selecciones que llegaron a
     dieciseisavos, quién cree que se coronará campeona. Acertar suma +5
     puntos (calculado en el backend a partir de settings.champion_actual). */
  let championPicksCache = null;   // { participantId: team }
  let championActualCache = null;  // team | null

  const loadChampionData = async (force = false) => {
    if (force || championPicksCache === null) {
      championPicksCache = await api('GET', '/champion/picks');
    }
    if (force || championActualCache === null) {
      const r = await api('GET', '/champion/actual');
      championActualCache = r.team || null;
    }
  };

  const renderChampion = async () => {
    if (!state.participants.length) {
      document.getElementById('champion-participant-tabs').innerHTML =
        `<p class="empty-state" style="padding:16px 18px">${Auth.isAdmin() ? 'Agrega participantes primero.' : 'Aún no hay participantes registrados.'}</p>`;
      document.getElementById('champion-pick-card').style.display = 'none';
      return;
    }
    document.getElementById('champion-pick-card').style.display = '';

    if (!state.selChampionParticipant ||
        !state.participants.find(p => p.id === state.selChampionParticipant)) {
      state.selChampionParticipant = state.participants[0].id;
    }

    try {
      await loadChampionData();
    } catch (e) { toast(e.message, 'error'); }

    // Selector de campeón real (solo admin)
    const selEl = document.getElementById('champion-actual-select');
    if (selEl) {
      selEl.innerHTML = `<option value="">— Aún sin definir —</option>` +
        CHAMPION_TEAMS.map(t => `<option value="${esc(t)}" ${t === championActualCache ? 'selected' : ''}>${esc(t)}</option>`).join('');
    }

    renderChampionActualBanner();

    // Participant tabs
    document.getElementById('champion-participant-tabs').innerHTML =
      state.participants.map(p => {
        const pick = championPicksCache[p.id];
        const hit = pick && championActualCache && pick === championActualCache;
        return `<button class="pill ${p.id === state.selChampionParticipant ? 'active' : ''}"
          onclick="App.selectChampionParticipant('${p.id}')">${esc(p.name)}${hit ? ' 👑' : ''}</button>`;
      }).join('');

    renderChampionGrid();
  };

  const renderChampionActualBanner = () => {
    const el = document.getElementById('champion-actual-banner');
    if (!el) return;
    if (!championActualCache) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `<i class="fa-solid fa-trophy"></i> Selección campeona real: ${esc(championActualCache)}`;
  };

  const renderChampionGrid = () => {
    const pId = state.selChampionParticipant;
    const p = state.participants.find(x => x.id === pId);
    const titleEl = document.getElementById('champion-pick-title');
    if (titleEl) titleEl.textContent = p ? `Pronóstico de ${p.name}` : 'Pronóstico';

    const pick = championPicksCache?.[pId] || null;
    const readOnly = !Auth.isAdmin();
    const gridEl = document.getElementById('champion-grid');

    gridEl.innerHTML = CHAMPION_TEAMS.map(team => {
      const selected = team === pick;
      const isActual = team === championActualCache;
      const cls = ['champion-team-btn'];
      if (selected) cls.push('selected');
      if (isActual) cls.push('is-actual');
      const attrs = readOnly
        ? 'disabled'
        : `onclick="App.pickChampion('${esc(team).replace(/'/g, "\\'")}')"`;
      return `<button class="${cls.join(' ')}" ${attrs} title="${isActual ? 'Selección campeona real' : ''}">
        ${selected ? '<i class="fa-solid fa-check"></i>' : ''} ${esc(team)}
      </button>`;
    }).join('');

    const noteEl = document.createElement('div');
    let note = '';
    if (pick) {
      const hit = championActualCache && pick === championActualCache;
      note = hit
        ? `<div class="champion-pick-note hit"><i class="fa-solid fa-crown"></i> ¡Acertó! +5 puntos por elegir a ${esc(pick)}.</div>`
        : `<div class="champion-pick-note">Pronóstico actual: <b>${esc(pick)}</b></div>`;
    } else {
      note = `<div class="champion-pick-note">${readOnly ? 'Aún no hay pronóstico.' : 'Toca una selección para guardar el pronóstico.'}</div>`;
    }
    // Insertar la nota justo después de la grilla
    let noteWrap = document.getElementById('champion-pick-note-wrap');
    if (!noteWrap) {
      noteWrap = document.createElement('div');
      noteWrap.id = 'champion-pick-note-wrap';
      gridEl.insertAdjacentElement('afterend', noteWrap);
    }
    noteWrap.innerHTML = note;
  };

  const selectChampionParticipant = (id) => {
    state.selChampionParticipant = id;
    document.querySelectorAll('#champion-participant-tabs .pill').forEach(b => b.classList.remove('active'));
    document.querySelector(`#champion-participant-tabs .pill[onclick*="${id}"]`)?.classList.add('active');
    renderChampionGrid();
  };

  const pickChampion = async (team) => {
    const pId = state.selChampionParticipant;
    if (!pId) return;
    try {
      await api('PUT', `/champion/picks/${pId}`, { team });
      if (!championPicksCache) championPicksCache = {};
      championPicksCache[pId] = team;
      renderChampionGrid();
      // Refresca las pestañas para mostrar/ocultar la corona 👑
      const p = state.participants.find(x => x.id === pId);
      const hit = team && championActualCache && team === championActualCache;
      const tabBtn = document.querySelector(`#champion-participant-tabs .pill[onclick*="${pId}"]`);
      if (tabBtn) tabBtn.textContent = `${p?.name || ''}${hit ? ' 👑' : ''}`;
      toast(`Campeón elegido: ${team} ✓`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const setActualChampion = async (team) => {
    try {
      await api('PUT', '/champion/actual', { team: team || null });
      championActualCache = team || null;
      renderChampionActualBanner();
      renderChampion();
      toast(team ? `Campeón real definido: ${team} ✓` : 'Campeón real reiniciado', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  /* ── Standings ──────────────────────────────────────── */
  const loadStandings = async () => {
    const wrap = document.getElementById('standings-table-wrap');
    wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Calculando…</div>`;

    try {
      const [standings, allMatches] = await Promise.all([
        api('GET', '/standings'),
        api('GET', '/matches')
      ]);

      renderLiveBanner(allMatches);

      const total = allMatches.length;
      const played = allMatches.filter(m => m.real_home !== null && m.real_away !== null).length;

      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card gold"><div class="stat-num">${standings.length}</div><div class="stat-lbl">Participantes</div></div>
        <div class="stat-card green"><div class="stat-num">${played}</div><div class="stat-lbl">Partidos jugados</div></div>
        <div class="stat-card cyan"><div class="stat-num">${total - played}</div><div class="stat-lbl">Por jugarse</div></div>
        <div class="stat-card gray"><div class="stat-num">${total}</div><div class="stat-lbl">Total partidos</div></div>
      `;

      if (!standings.length) {
        wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users"></i><p>Agrega participantes para ver el ranking.</p></div>`;
        return;
      }

      const pct = Math.round(played / total * 100);
      let html = `
        <div class="standings-wrap">
        <table class="standings-table">
          <thead><tr>
            <th style="width:50px">#</th>
            <th>Participante</th>
            <th class="center">Puntos</th>
            <th class="center">🎯 Exactos</th>
            <th class="center">✓ Ganador</th>
            <th class="center">✗ Fallados</th>
            <th class="center">👑 Campeón</th>
          </tr></thead><tbody>
      `;

      standings.forEach((s, i) => {
        const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
        const pIdx = state.participants.findIndex(p => p.id === s.participant.id);
        const champChip = !s.championPick
          ? `<span class="champion-chip none">—</span>`
          : s.championHit
            ? `<span class="champion-chip hit"><i class="fa-solid fa-crown"></i> ${esc(s.championPick)} (+5)</span>`
            : `<span class="champion-chip">${esc(s.championPick)}</span>`;
        html += `<tr>
          <td><span class="rank-num ${rankClass}">${i + 1}</span></td>
          <td>
            <div class="player-cell">
              ${avatar(s.participant.name, pIdx >= 0 ? pIdx : i)}
              <span class="player-name">${esc(s.participant.name)}</span>
            </div>
          </td>
          <td class="center"><span class="pts-cell">${s.pts}</span></td>
          <td class="center"><span class="sub-stat sub-green">×${s.exact}</span></td>
          <td class="center"><span class="sub-stat sub-cyan">×${s.winner}</span></td>
          <td class="center"><span class="sub-stat">${s.miss}</span></td>
          <td class="center">${champChip}</td>
        </tr>`;
      });

      html += `</tbody></table></div>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-label"><span>Progreso del torneo</span><span>${pct}%</span></div>
        </div>`;

      wrap.innerHTML = html;
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
    }
  };

  /* ── Detail ─────────────────────────────────────────── */
  const renderDetail = async () => {
    if (!state.participants.length) {
      document.getElementById('detail-participant-tabs').innerHTML =
        `<p style="padding:16px 18px;color:var(--text3);font-size:13px">${Auth.isAdmin() ? 'Agrega participantes primero.' : 'Aún no hay participantes registrados.'}</p>`;
      document.getElementById('detail-summary').innerHTML = '';
      document.getElementById('detail-matches').innerHTML = '';
      return;
    }

    if (!state.selDetailParticipant ||
        !state.participants.find(p => p.id === state.selDetailParticipant)) {
      state.selDetailParticipant = state.participants[0].id;
    }

    document.getElementById('detail-participant-tabs').innerHTML =
      state.participants.map(p => `
        <button class="pill ${p.id === state.selDetailParticipant ? 'active' : ''}"
          onclick="App.selectDetailParticipant('${p.id}')">${esc(p.name)}</button>
      `).join('');

    await loadDetailBody();
  };

  const loadDetailBody = async () => {
    const pId = state.selDetailParticipant;
    const sumEl = document.getElementById('detail-summary');
    const detEl = document.getElementById('detail-matches');
    detEl.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;
    sumEl.innerHTML = '';

    try {
      const data = await api('GET', `/detail/${pId}`);
      const { participant, detail, championPick, championActual, championHit } = data;
      const pIdx = state.participants.findIndex(p => p.id === pId);

      // Summary
      let pts = 0, exact = 0, winner = 0, miss = 0, pending = 0;
      detail.forEach(d => {
        if (d.score === 3) { pts += 3; exact++; }
        else if (d.score === 1) { pts += 1; winner++; }
        else if (d.score === 0) miss++;
        else pending++;
      });
      if (championHit) pts += 5;

      const champLine = !championPick
        ? `Sin pronóstico de campeón`
        : championHit
          ? `<span style="color:var(--gold2)"><i class="fa-solid fa-crown"></i> Eligió a <b>${esc(championPick)}</b> — ¡acertó! +5 pts</span>`
          : `Eligió a <b>${esc(championPick)}</b>${championActual ? ` (campeón real: ${esc(championActual)})` : ''}`;

      sumEl.innerHTML = `
        <div class="card" style="border-color:${AVATAR_COLORS[pIdx >= 0 ? pIdx % AVATAR_COLORS.length : 0]}40">
          <div class="card-body">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
              ${avatar(participant.name, pIdx >= 0 ? pIdx : 0, 44)}
              <div>
                <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800">${esc(participant.name)}</div>
                <div style="font-size:12px;color:var(--text3)">${pts} puntos acumulados</div>
              </div>
            </div>
            <div class="detail-summary-grid">
              <div class="stat-card gold"><div class="stat-num">${pts}</div><div class="stat-lbl">Puntos totales</div></div>
              <div class="stat-card green"><div class="stat-num">${exact}</div><div class="stat-lbl">Exactos (+3)</div></div>
              <div class="stat-card cyan"><div class="stat-num">${winner}</div><div class="stat-lbl">Ganador (+1)</div></div>
              <div class="stat-card gray"><div class="stat-num">${miss}</div><div class="stat-lbl">Fallados</div></div>
            </div>
            <div class="champion-pick-note" style="padding:12px 0 0">${champLine}</div>
          </div>
        </div>`;

      // Matches grouped by group
      const byGroup = {};
      detail.forEach(d => {
        const g = d.match.group_name;
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(d);
      });

      let html = '';
      STAGES.forEach(s => {
        const g = s.code;
        if (!byGroup[g]) return;
        html += `<div class="matches-card">
          <div class="matches-card-header"><i class="fa-solid fa-layer-group"></i> ${s.label}</div>`;
        byGroup[g].forEach(d => {
          const { match: m, forecast: fc, score } = d;
          const hasResult = m.real_home !== null && m.real_away !== null;
          const hasFc = fc && fc.home !== null && fc.away !== null;
          html += `<div class="detail-match-row">
            ${teamCell(m, 'home')}
            <div class="score-box forecast">
              <span class="lbl">Vaticio</span>
              <span class="val ${hasFc ? '' : 'pending-val'}">${hasFc ? `${fc.home}:${fc.away}` : '-'}</span>
            </div>
            <div class="score-box real">
              <span class="lbl">Real ${isLiveStatus(m.status) ? '<span class="live-dot"></span>' : ''}</span>
              <span class="val ${hasResult ? '' : 'pending-val'}">${hasResult ? `${m.real_home}:${m.real_away}` : '-'}</span>
            </div>
            ${teamCell(m, 'away')}
            <div>${scoreBadge(score, hasResult)} ${liveStatusChip(m)} ${lockChip(m)}</div>
          </div>`;
        });
        html += '</div>';
      });

      detEl.innerHTML = html;
    } catch (e) {
      detEl.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
    }
  };

  /* ── Live scores ────────────────────────────────────────
     Banner con el estado de la sincronización en vivo y los partidos en curso.
     Consulta /api/live/status para la hora de última actualización. */
  const renderLiveBanner = async (allMatches) => {
    const el = document.getElementById('live-banner');
    if (!el) return;

    const liveMatches = (allMatches || []).filter(m => isLiveStatus(m.status));

    let status = null;
    try { status = await api('GET', '/live/status'); } catch (e) { /* opcional */ }

    // Si la sincronización en vivo no está habilitada en el servidor, ocultamos.
    if (!status || !status.enabled) { el.style.display = 'none'; return; }

    el.style.display = '';
    const updatedAt = status.lastRunAt
      ? new Date(status.lastRunAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';

    if (liveMatches.length) {
      const rows = liveMatches.map(m =>
        `<span class="live-match"><span class="live-dot"></span> ${esc(m.home)} <b>${m.real_home ?? 0}–${m.real_away ?? 0}</b> ${esc(m.away)}</span>`
      ).join('');
      el.className = 'live-banner is-live';
      el.innerHTML = `
        <div class="live-banner-head"><span class="live-dot"></span> EN VIVO · ${liveMatches.length} partido(s) en curso</div>
        <div class="live-matches">${rows}</div>
        <div class="live-foot"></div>`;
    } else {
      el.className = 'live-banner';
      const errNote = status.ok === false ? ' · ⚠ error al sincronizar' : '';
      el.innerHTML = `
        <div class="live-banner-head idle"><i class="fa-solid fa-satellite-dish"></i></div>
        <div class="live-foot"></div>`;
    }
  };

  /* ── Auto-refresco ──────────────────────────────────────
     Refresca automáticamente las vistas de solo lectura (tabla y detalle)
     para reflejar los marcadores en vivo sin recargar la página. No toca las
     páginas con inputs (vaticinios/resultados) para no interrumpir al admin. */
  const REFRESH_MS = 45000;
  let refreshTimer = null;
  const activePageId = () => document.querySelector('.page.active')?.id || '';
  const startAutoRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.hidden) return;                 // no malgastar red en pestaña oculta
      const pid = activePageId();
      if (pid === 'page-standings') loadStandings();
      else if (pid === 'page-detail') loadDetailBody();
    }, REFRESH_MS);
  };

  /* ── Scoring helper ─────────────────────────────────── */
  const calcScore = (fc, m) => {
    const fh = parseInt(fc.home), fa = parseInt(fc.away);
    const rh = parseInt(m.real_home), ra = parseInt(m.real_away);
    if (isNaN(fh) || isNaN(fa)) return null;
    if (fh === rh && fa === ra) return 3;
    const fRes = fh > fa ? 'H' : fh < fa ? 'A' : 'D';
    const rRes = rh > ra ? 'H' : rh < ra ? 'A' : 'D';
    return fRes === rRes ? 1 : 0;
  };

  const scoreBadge = (score, hasResult) => {
    if (!hasResult) return `<span class="badge badge-pending">Sin jugar</span>`;
    if (score === 3) return `<span class="badge badge-exact">🎯 +3 Exacto</span>`;
    if (score === 1) return `<span class="badge badge-winner">✓ +1 Ganador</span>`;
    if (score === 0) return `<span class="badge badge-miss">✗ 0 Fallado</span>`;
    return `<span class="badge badge-pending">Sin vaticio</span>`;
  };

  /* ── XSS escape ─────────────────────────────────────── */
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ── Team cell ──────────────────────────────────────────
     Renderiza el nombre de la selección. En eliminatorias muestra debajo la
     etiqueta de llave (ej. "2º Grupo A"). Si `editable` (admin en Resultados de
     eliminatorias), muestra un input para que el admin ingrese el equipo. */
  const teamCell = (m, side, editable = false) => {
    const sideClass = side === 'home' ? 'team-home' : 'team-away';
    const name = (side === 'home' ? m.home : m.away) || '';
    const label = (side === 'home' ? m.home_label : m.away_label) || '';

    if (editable) {
      const slot = label ? `<span class="team-slot">${esc(label)}</span>` : '';
      return `<div class="team-name ${sideClass}">
        <input class="team-name-input" type="text" value="${esc(name)}"
          placeholder="${esc(label || 'Selección')}" maxlength="40"
          data-mid="${m.id}" data-side="${side}" onchange="App.saveTeam(this)" />
        ${slot}
      </div>`;
    }

    // Sin equipo definido aún: mostramos la etiqueta de llave como referencia.
    if (!name.trim()) {
      const txt = label ? esc(label) : '—';
      return `<div class="team-name ${sideClass} team-pending">${txt}</div>`;
    }
    const slot = label ? `<span class="team-slot">${esc(label)}</span>` : '';
    return `<div class="team-name ${sideClass}">${esc(name)}${slot}</div>`;
  };

  /* ── Selector callbacks ─────────────────────────────── */
  const selectForecastParticipant = async (id) => {
    state.selForecastParticipant = id;
    document.querySelectorAll('#forecast-participant-tabs .pill').forEach(b => {
      const p = state.participants.find(p => p.id === id);
      b.classList.toggle('active', b.textContent.trim() === (p?.name || ''));
    });
    document.querySelectorAll('#forecast-participant-tabs .pill').forEach(b => b.classList.remove('active'));
    document.querySelector(`#forecast-participant-tabs .pill[onclick*="${id}"]`)?.classList.add('active');
    await loadForecastMatches();
  };

  const selectForecastGroup = async (g) => {
    state.selForecastGroup = g;
    document.querySelectorAll('#forecast-group-tabs .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.code === g);
    });
    await loadForecastMatches();
  };

  const selectResultGroup = async (g) => {
    state.selResultGroup = g;
    document.querySelectorAll('#results-group-tabs .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.code === g);
    });
    await loadResultMatches();
  };

  const selectDetailParticipant = async (id) => {
    state.selDetailParticipant = id;
    document.querySelectorAll('#detail-participant-tabs .pill').forEach(b => b.classList.remove('active'));
    document.querySelector(`#detail-participant-tabs .pill[onclick*="${id}"]`)?.classList.add('active');
    await loadDetailBody();
  };

  /* ── Init ───────────────────────────────────────────── */
  const init = async () => {
    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        showPage(link.dataset.page);
      });
    });

    // Mobile sidebar
    document.getElementById('menu-toggle').addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Load participants (needed everywhere)
    await loadParticipants();

    // Initial page
    await loadStandings();

    // Auto-refresco de vistas de solo lectura para marcadores en vivo
    startAutoRefresh();
  };

  document.addEventListener('DOMContentLoaded', init);

  // Public API
  return {
    addParticipant, removeParticipant,
    selectForecastParticipant, selectForecastGroup,
    selectResultGroup, selectDetailParticipant,
    saveForecast, saveResult, saveTeam, toggleLock,
    selectChampionParticipant, pickChampion, setActualChampion,
    loadStandings,
  };
})();
