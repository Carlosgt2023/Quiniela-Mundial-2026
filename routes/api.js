const express = require('express');
const router = express.Router();
const db = require('../db/database');
const liveScores = require('../services/liveScores');

// ── Auth ──────────────────────────────────────────────────────
// Simple session-less auth: password checked server-side, token stored client-side.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const ADMIN_TOKEN = require('crypto').createHash('sha256').update(ADMIN_PASSWORD + '_quiniela_salt').digest('hex');

router.post('/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
  if (password === ADMIN_PASSWORD) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

router.post('/auth/verify', (req, res) => {
  const { token } = req.body;
  res.json({ valid: token === ADMIN_TOKEN });
});

// Middleware: protege las operaciones de escritura. Solo el administrador
// (que posee el token) puede crear, editar o eliminar. Los participantes
// acceden únicamente a las rutas GET (solo lectura).
const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Acción permitida solo para el administrador' });
  }
  next();
};

// ── Participants ──────────────────────────────────────────────
router.get('/participants', async (req, res) => {
  try {
    await db.getDb();
    const rows = db.all("SELECT * FROM participants ORDER BY created_at ASC");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/participants', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    db.run("INSERT INTO participants (id, name) VALUES (?, ?)", [id, name.trim()]);
    res.json({ id, name: name.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ese participante ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/participants/:id', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    db.run("DELETE FROM forecasts WHERE participant_id = ?", [req.params.id]);
    db.run("DELETE FROM participants WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Matches ───────────────────────────────────────────────────
router.get('/matches', async (req, res) => {
  try {
    await db.getDb();
    const { group } = req.query;
    const sql = group
      ? "SELECT * FROM matches WHERE group_name = ? ORDER BY id"
      : "SELECT * FROM matches ORDER BY id";
    const rows = group ? db.all(sql, [group]) : db.all(sql);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/matches/:id/result', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { home, away } = req.body;
    const rh = home === '' || home === null ? null : parseInt(home);
    const ra = away === '' || away === null ? null : parseInt(away);
    db.run("UPDATE matches SET real_home = ?, real_away = ? WHERE id = ?", [rh, ra, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Congela / descongela el marcador de un partido (solo admin). Segunda vía de
// contingencia: si la API de marcadores en vivo falla, el admin carga el
// resultado oficial a mano (PUT /result) y luego lo bloquea aquí para que la
// sincronización deje de tocarlo. Al bloquear un partido que ya tiene marcador
// se marca como Final (status='FT') para que la UI muestre el estado correcto
// aunque la API nunca lo hubiera sincronizado.
router.put('/matches/:id/lock', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const locked = req.body.locked ? 1 : 0;
    if (locked) {
      const m = db.get("SELECT real_home, real_away, status FROM matches WHERE id = ?", [req.params.id]);
      const hasScore = m && m.real_home !== null && m.real_away !== null;
      const finished = ['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(m?.status);
      if (hasScore && !finished) {
        db.run("UPDATE matches SET locked = 1, status = 'FT' WHERE id = ?", [req.params.id]);
      } else {
        db.run("UPDATE matches SET locked = 1 WHERE id = ?", [req.params.id]);
      }
    } else {
      db.run("UPDATE matches SET locked = 0 WHERE id = ?", [req.params.id]);
    }
    res.json({ ok: true, locked: !!locked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Definir las selecciones de un partido (solo eliminatorias, solo admin).
// Permite actualizar el nombre del equipo local y/o visitante cuando se conocen.
router.put('/matches/:id/teams', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { home, away } = req.body;
    const sets = [], params = [];
    if (home !== undefined) { sets.push('home = ?'); params.push(home === null ? '' : String(home).trim()); }
    if (away !== undefined) { sets.push('away = ?'); params.push(away === null ? '' : String(away).trim()); }
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id);
    db.run(`UPDATE matches SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Forecasts ─────────────────────────────────────────────────
router.get('/forecasts/:participantId', async (req, res) => {
  try {
    await db.getDb();
    const rows = db.all(
      "SELECT match_id, home, away FROM forecasts WHERE participant_id = ?",
      [req.params.participantId]
    );
    // Return as { matchId: {home, away} }
    const map = {};
    rows.forEach(r => { map[r.match_id] = { home: r.home, away: r.away }; });
    res.json(map);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/forecasts/:participantId/:matchId', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { home, away } = req.body;
    const rh = home === '' || home === null ? null : parseInt(home);
    const ra = away === '' || away === null ? null : parseInt(away);
    db.run(`
      INSERT INTO forecasts (participant_id, match_id, home, away)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(participant_id, match_id) DO UPDATE SET home=excluded.home, away=excluded.away
    `, [req.params.participantId, req.params.matchId, rh, ra]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Fase Campeón (¿quién ganará el Mundial?) ────────────────────
// Lista cerrada de las 32 selecciones que llegaron a dieciseisavos de final.
const CHAMPION_TEAMS = [
  'Alemania', 'Argentina', 'Argelia', 'Australia', 'Austria', 'Bélgica',
  'Bosnia y Herzegovina', 'Brasil', 'Cabo Verde', 'Canadá', 'Colombia',
  'Costa de Marfil', 'Croacia', 'Ecuador', 'Egipto', 'España',
  'Estados Unidos', 'Francia', 'Ghana', 'Inglaterra', 'Japón', 'Marruecos',
  'México', 'Noruega', 'Países Bajos', 'Paraguay', 'Portugal',
  'RD Congo', 'Senegal', 'Sudáfrica', 'Suecia', 'Suiza',
];

router.get('/champion/teams', (req, res) => {
  res.json(CHAMPION_TEAMS);
});

// Pronósticos de campeón de todos los participantes. Lectura pública.
router.get('/champion/picks', async (req, res) => {
  try {
    await db.getDb();
    res.json(db.getChampionPicks());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/champion/picks/:participantId', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { team } = req.body;
    if (team && !CHAMPION_TEAMS.includes(team)) {
      return res.status(400).json({ error: 'Selección inválida' });
    }
    db.setChampionPick(req.params.participantId, team || null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Selección campeona real (la define el admin al finalizar el torneo).
router.get('/champion/actual', async (req, res) => {
  try {
    await db.getDb();
    res.json({ team: db.getSetting('champion_actual') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/champion/actual', requireAdmin, async (req, res) => {
  try {
    await db.getDb();
    const { team } = req.body;
    if (team && !CHAMPION_TEAMS.includes(team)) {
      return res.status(400).json({ error: 'Selección inválida' });
    }
    db.setSetting('champion_actual', team || null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Live scores ───────────────────────────────────────────────
// Estado de la sincronización en vivo (para que el frontend muestre el
// indicador "EN VIVO" y la hora de última actualización). Lectura pública.
router.get('/live/status', (req, res) => {
  res.json(liveScores.getStatus());
});

// Fuerza una sincronización inmediata (solo admin). Útil para refrescar al
// instante sin esperar al siguiente ciclo del poller.
router.post('/live/sync', requireAdmin, async (req, res) => {
  try {
    if (!liveScores.isEnabled()) {
      return res.status(409).json({ error: 'Marcadores en vivo desactivados (falta FOOTBALL_API_KEY)' });
    }
    const result = await liveScores.safeSync();
    if (result.ok === false) return res.status(502).json({ error: result.error || 'Error al sincronizar' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Standings ─────────────────────────────────────────────────
router.get('/standings', async (req, res) => {
  try {
    await db.getDb();
    const participants = db.all("SELECT * FROM participants ORDER BY created_at ASC");
    const matches = db.all("SELECT * FROM matches WHERE real_home IS NOT NULL AND real_away IS NOT NULL");
    const championPicks = db.getChampionPicks();
    const championActual = db.getSetting('champion_actual');

    const standings = participants.map(p => {
      let pts = 0, exact = 0, winner = 0, miss = 0;
      matches.forEach(m => {
        const fc = db.get(
          "SELECT home, away FROM forecasts WHERE participant_id = ? AND match_id = ?",
          [p.id, m.id]
        );
        if (!fc || fc.home === null || fc.away === null) { miss++; return; }
        if (fc.home === m.real_home && fc.away === m.real_away) {
          pts += 3; exact++;
        } else {
          const fRes = fc.home > fc.away ? 'H' : fc.home < fc.away ? 'A' : 'D';
          const rRes = m.real_home > m.real_away ? 'H' : m.real_home < m.real_away ? 'A' : 'D';
          if (fRes === rRes) { pts += 1; winner++; }
          else miss++;
        }
      });
      // Fase Campeón: +5 puntos si acertó la selección campeona real.
      const championPick = championPicks[p.id] || null;
      const championHit = !!(championActual && championPick && championPick === championActual);
      if (championHit) pts += 5;
      return { participant: p, pts, exact, winner, miss, played: matches.length, championPick, championHit };
    });

    standings.sort((a, b) => b.pts - a.pts || b.exact - a.exact || b.winner - a.winner);
    res.json(standings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Detail ────────────────────────────────────────────────────
router.get('/detail/:participantId', async (req, res) => {
  try {
    await db.getDb();
    const p = db.get("SELECT * FROM participants WHERE id = ?", [req.params.participantId]);
    if (!p) return res.status(404).json({ error: 'Participante no encontrado' });

    const matches = db.all("SELECT * FROM matches ORDER BY id");
    const forecasts = db.all(
      "SELECT match_id, home, away FROM forecasts WHERE participant_id = ?",
      [req.params.participantId]
    );
    const fcMap = {};
    forecasts.forEach(f => { fcMap[f.match_id] = f; });

    const detail = matches.map(m => {
      const fc = fcMap[m.id] || null;
      let score = null;
      if (m.real_home !== null && m.real_away !== null && fc && fc.home !== null && fc.away !== null) {
        if (fc.home === m.real_home && fc.away === m.real_away) {
          score = 3;
        } else {
          const fRes = fc.home > fc.away ? 'H' : fc.home < fc.away ? 'A' : 'D';
          const rRes = m.real_home > m.real_away ? 'H' : m.real_home < m.real_away ? 'A' : 'D';
          score = fRes === rRes ? 1 : 0;
        }
      }
      return { match: m, forecast: fc, score };
    });

    const championPick = db.getChampionPicks()[p.id] || null;
    const championActual = db.getSetting('champion_actual');
    const championHit = !!(championActual && championPick && championPick === championActual);

    res.json({ participant: p, detail, championPick, championActual, championHit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
