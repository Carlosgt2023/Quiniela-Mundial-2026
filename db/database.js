const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// En Railway: define DB_PATH como variable de entorno apuntando al volumen
// ej: DB_PATH=/data/quiniela.db
// En local: usa la carpeta db/ por defecto
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quiniela.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`[DB] Base de datos cargada desde: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`[DB] Nueva base de datos creada en: ${DB_PATH}`);
  }

  initSchema();
  return db;
}

function save() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // Asegura que el directorio exista (importante en Railway)
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Error al guardar:', err.message);
  }
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      group_name TEXT NOT NULL,
      home TEXT NOT NULL,
      away TEXT NOT NULL,
      match_date TEXT,
      real_home INTEGER,
      real_away INTEGER
    );

    CREATE TABLE IF NOT EXISTS forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      match_id INTEGER NOT NULL,
      home INTEGER,
      away INTEGER,
      UNIQUE(participant_id, match_id),
      FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY(match_id) REFERENCES matches(id)
    );

    -- Fase "Campeón": cada participante elige, entre las 32 selecciones que
    -- llegaron a dieciseisavos, quién cree que ganará el Mundial. Acertar
    -- suma +5 puntos (ver settings.champion_actual para el campeón real).
    CREATE TABLE IF NOT EXISTS champion_picks (
      participant_id TEXT PRIMARY KEY,
      team TEXT,
      FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    -- Ajustes globales de la app (clave/valor). Por ahora solo guarda
    -- 'champion_actual': el nombre de la selección campeona real, que el
    -- admin define cuando termina el torneo.
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  ensureMatchColumns();

  const count = db.exec("SELECT COUNT(*) as c FROM matches")[0]?.values[0][0];
  if (!count || count === 0) {
    seedMatches();
  }
  // Fase eliminatoria: idempotente, no sobrescribe partidos ya existentes.
  seedKnockout();
  save();
}

// Agrega columnas para la etiqueta de llave (ej. "2º Grupo A", "Ganador Partido 74").
// Solo aplica para partidos de eliminatorias; en fase de grupos quedan en NULL.
function ensureMatchColumns() {
  const cols = (db.exec("PRAGMA table_info(matches)")[0]?.values || []).map(r => r[1]);
  if (!cols.includes('home_label')) db.run("ALTER TABLE matches ADD COLUMN home_label TEXT");
  if (!cols.includes('away_label')) db.run("ALTER TABLE matches ADD COLUMN away_label TEXT");
  // Estado del partido para marcadores en vivo (sincronización con la API):
  //   SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | …
  // En NULL cuando el partido aún no se ha sincronizado nunca.
  if (!cols.includes('status')) db.run("ALTER TABLE matches ADD COLUMN status TEXT");
  // Marcador congelado por el admin (contingencia ante fallo de la API):
  //   0 = la sincronización en vivo puede sobrescribir el marcador (normal)
  //   1 = el marcador es oficial/manual y la API ya NO lo modifica.
  if (!cols.includes('locked')) db.run("ALTER TABLE matches ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
}

function seedMatches() {
  const matches = [
    // Group A
    [1,'A','México','Sudáfrica','Jun 11'],
    [2,'A','Corea del Sur','República Checa','Jun 11'],
    [3,'A','México','Corea del Sur','Jun 18'],
    [4,'A','República Checa','Sudáfrica','Jun 18'],
    [5,'A','México','República Checa','Jun 24'],
    [6,'A','Corea del Sur','Sudáfrica','Jun 24'],
    // Group B
    [7,'B','Canadá','Bosnia y Herzegovina','Jun 12'],
    [8,'B','Qatar','Suiza','Jun 12'],
    [9,'B','Canadá','Qatar','Jun 18'],
    [10,'B','Suiza','Bosnia y Herzegovina','Jun 18'],
    [11,'B','Canadá','Suiza','Jun 24'],
    [12,'B','Bosnia y Herzegovina','Qatar','Jun 24'],
    // Group C
    [13,'C','Brasil','Marruecos','Jun 12'],
    [14,'C','Haití','Escocia','Jun 12'],
    [15,'C','Brasil','Haití','Jun 19'],
    [16,'C','Escocia','Marruecos','Jun 19'],
    [17,'C','Brasil','Escocia','Jun 25'],
    [18,'C','Marruecos','Haití','Jun 25'],
    // Group D
    [19,'D','Estados Unidos','Paraguay','Jun 12'],
    [20,'D','Australia','Turquía','Jun 12'],
    [21,'D','Estados Unidos','Australia','Jun 19'],
    [22,'D','Turquía','Paraguay','Jun 19'],
    [23,'D','Estados Unidos','Turquía','Jun 25'],
    [24,'D','Paraguay','Australia','Jun 25'],
    // Group E
    [25,'E','Alemania','Curazao','Jun 13'],
    [26,'E','Costa de Marfil','Ecuador','Jun 13'],
    [27,'E','Alemania','Costa de Marfil','Jun 20'],
    [28,'E','Ecuador','Curazao','Jun 20'],
    [29,'E','Alemania','Ecuador','Jun 26'],
    [30,'E','Curazao','Costa de Marfil','Jun 26'],
    // Group F
    [31,'F','Países Bajos','Japón','Jun 13'],
    [32,'F','Suecia','Túnez','Jun 13'],
    [33,'F','Países Bajos','Suecia','Jun 20'],
    [34,'F','Túnez','Japón','Jun 20'],
    [35,'F','Países Bajos','Túnez','Jun 26'],
    [36,'F','Japón','Suecia','Jun 26'],
    // Group G
    [37,'G','Bélgica','Egipto','Jun 14'],
    [38,'G','Irán','Nueva Zelanda','Jun 14'],
    [39,'G','Bélgica','Irán','Jun 21'],
    [40,'G','Nueva Zelanda','Egipto','Jun 21'],
    [41,'G','Bélgica','Nueva Zelanda','Jun 27'],
    [42,'G','Egipto','Irán','Jun 27'],
    // Group H
    [43,'H','España','Cabo Verde','Jun 14'],
    [44,'H','Arabia Saudita','Uruguay','Jun 14'],
    [45,'H','España','Arabia Saudita','Jun 21'],
    [46,'H','Uruguay','Cabo Verde','Jun 21'],
    [47,'H','España','Uruguay','Jun 27'],
    [48,'H','Cabo Verde','Arabia Saudita','Jun 27'],
    // Group I
    [49,'I','Francia','Senegal','Jun 16'],
    [50,'I','Irak','Noruega','Jun 16'],
    [51,'I','Francia','Irak','Jun 22'],
    [52,'I','Noruega','Senegal','Jun 22'],
    [53,'I','Francia','Noruega','Jun 26'],
    [54,'I','Senegal','Irak','Jun 26'],
    // Group J
    [55,'J','Argentina','Argelia','Jun 16'],
    [56,'J','Austria','Jordania','Jun 16'],
    [57,'J','Argentina','Austria','Jun 23'],
    [58,'J','Jordania','Argelia','Jun 23'],
    [59,'J','Argentina','Jordania','Jun 27'],
    [60,'J','Argelia','Austria','Jun 27'],
    // Group K
    [61,'K','Portugal','RD Congo','Jun 17'],
    [62,'K','Uzbekistán','Colombia','Jun 17'],
    [63,'K','Portugal','Uzbekistán','Jun 23'],
    [64,'K','Colombia','RD Congo','Jun 23'],
    [65,'K','Portugal','Colombia','Jun 27'],
    [66,'K','RD Congo','Uzbekistán','Jun 27'],
    // Group L
    [67,'L','Inglaterra','Croacia','Jun 17'],
    [68,'L','Ghana','Panamá','Jun 17'],
    [69,'L','Inglaterra','Ghana','Jun 24'],
    [70,'L','Panamá','Croacia','Jun 24'],
    [71,'L','Inglaterra','Panamá','Jun 27'],
    [72,'L','Croacia','Ghana','Jun 27'],
  ];

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO matches (id, group_name, home, away, match_date) VALUES (?,?,?,?,?)"
  );
  matches.forEach(m => stmt.run(m));
  stmt.free();
  console.log('[DB] Partidos sembrados correctamente.');
}

// Fase eliminatoria (partidos 73–104). Los nombres de las selecciones (home/away)
// se crean vacíos porque aún no se conocen; solo el admin los completa. La etiqueta
// de llave (home_label/away_label) indica de qué clasificado proviene cada equipo.
// Etapas: R32=Dieciseisavos, R16=Octavos, QF=Cuartos, SF=Semifinales,
//         TP=Tercer puesto, F=Final.
function seedKnockout() {
  const ko = [
    // [id, etapa, fecha, etiqueta_local, etiqueta_visitante]
    // Dieciseisavos de final
    [73,'R32','Jun 28','2º Grupo A','2º Grupo B'],
    [74,'R32','Jun 29','1º Grupo E','3º Grupo A/B/C/D/F'],
    [75,'R32','Jun 29','1º Grupo F','2º Grupo C'],
    [76,'R32','Jun 29','1º Grupo C','2º Grupo F'],
    [77,'R32','Jun 30','1º Grupo I','3º Grupo C/D/F/G/H'],
    [78,'R32','Jun 30','2º Grupo E','2º Grupo I'],
    [79,'R32','Jun 30','1º Grupo A','3º Grupo C/E/F/H/I'],
    [80,'R32','Jul 1','1º Grupo L','3º Grupo E/H/I/J/K'],
    [81,'R32','Jul 1','1º Grupo D','3º Grupo B/E/F/I/J'],
    [82,'R32','Jul 1','1º Grupo G','3º Grupo A/E/H/I/J'],
    [83,'R32','Jul 2','2º Grupo K','2º Grupo L'],
    [84,'R32','Jul 2','1º Grupo H','2º Grupo J'],
    [85,'R32','Jul 2','1º Grupo B','3º Grupo E/F/G/I/J'],
    [86,'R32','Jul 3','1º Grupo J','2º Grupo H'],
    [87,'R32','Jul 3','1º Grupo K','3º Grupo D/E/I/J/L'],
    [88,'R32','Jul 3','2º Grupo D','2º Grupo G'],
    // Octavos de final
    [89,'R16','Jul 4','Ganador Partido 74','Ganador Partido 77'],
    [90,'R16','Jul 4','Ganador Partido 73','Ganador Partido 75'],
    [91,'R16','Jul 5','Ganador Partido 76','Ganador Partido 78'],
    [92,'R16','Jul 5','Ganador Partido 79','Ganador Partido 80'],
    [93,'R16','Jul 6','Ganador Partido 83','Ganador Partido 84'],
    [94,'R16','Jul 6','Ganador Partido 81','Ganador Partido 82'],
    [95,'R16','Jul 7','Ganador Partido 86','Ganador Partido 88'],
    [96,'R16','Jul 7','Ganador Partido 85','Ganador Partido 87'],
    // Cuartos de final
    [97,'QF','Jul 9','Ganador Partido 89','Ganador Partido 90'],
    [98,'QF','Jul 10','Ganador Partido 93','Ganador Partido 94'],
    [99,'QF','Jul 11','Ganador Partido 91','Ganador Partido 92'],
    [100,'QF','Jul 11','Ganador Partido 95','Ganador Partido 96'],
    // Semifinales
    [101,'SF','Jul 14','Ganador Partido 97','Ganador Partido 98'],
    [102,'SF','Jul 15','Ganador Partido 99','Ganador Partido 100'],
    // Tercer puesto
    [103,'TP','Jul 18','Perdedor Partido 101','Perdedor Partido 102'],
    // Final
    [104,'FIN','Jul 19','Ganador Partido 101','Ganador Partido 102'],
  ];

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO matches (id, group_name, home, away, match_date, home_label, away_label) VALUES (?,?,?,?,?,?,?)"
  );
  ko.forEach(m => stmt.run([m[0], m[1], '', '', m[2], m[3], m[4]]));
  stmt.free();
  // Reparación: una versión previa pudo sembrar la Final con código 'F', que
  // colisiona con el Grupo F. Reasigna ese partido a 'FIN' sin afectar al grupo.
  db.run("UPDATE matches SET group_name = 'FIN' WHERE id = 104 AND group_name = 'F'");
  console.log('[DB] Partidos de eliminatorias verificados.');
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// Aplica en lote las actualizaciones provenientes de la API de marcadores en vivo.
// `updates` = [{ id, status, [real_home], [real_away] }]. Si una actualización
// omite real_home/real_away (partido aún no iniciado) se conserva el marcador
// actual y solo se refresca el estado. Escribe solo las filas que realmente
// cambian y guarda en disco una sola vez al final.
// Devuelve { changed, total } para registro/diagnóstico.
function applyLiveUpdates(updates = []) {
  if (!db) return { changed: 0, total: 0 };
  let changed = 0;
  const stmt = db.prepare(
    "UPDATE matches SET real_home = ?, real_away = ?, status = ? WHERE id = ?"
  );
  for (const u of updates) {
    const cur = get(
      "SELECT real_home, real_away, status, locked FROM matches WHERE id = ?",
      [u.id]
    );
    if (!cur) continue;
    // Marcador congelado por el admin: la API no toca este partido (ni marcador
    // ni estado). Es la segunda vía de contingencia ante un fallo de la API.
    if (cur.locked) continue;
    // Si la actualización no trae marcador, preserva el actual.
    const hasScore = 'real_home' in u && 'real_away' in u;
    const nextHome = hasScore ? u.real_home : cur.real_home;
    const nextAway = hasScore ? u.real_away : cur.real_away;
    const nextStatus = u.status ?? null;

    const sameScore = cur.real_home === nextHome && cur.real_away === nextAway;
    const sameStatus = (cur.status || null) === nextStatus;
    if (sameScore && sameStatus) continue;
    stmt.run([nextHome, nextAway, nextStatus, u.id]);
    changed++;
  }
  stmt.free();
  if (changed) save();
  return { changed, total: updates.length };
}

// ── Fase Campeón ────────────────────────────────────────────────
// Guarda/actualiza el pronóstico de campeón de un participante.
function setChampionPick(participantId, team) {
  db.run(
    `INSERT INTO champion_picks (participant_id, team) VALUES (?, ?)
     ON CONFLICT(participant_id) DO UPDATE SET team = excluded.team`,
    [participantId, team]
  );
  save();
}

// Devuelve { participantId: team } con todos los pronósticos de campeón.
function getChampionPicks() {
  const rows = all("SELECT participant_id, team FROM champion_picks");
  const map = {};
  rows.forEach(r => { map[r.participant_id] = r.team; });
  return map;
}

// Define (o borra, con null) la selección campeona real del torneo.
function setSetting(key, value) {
  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
  save();
}

function getSetting(key) {
  const row = get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
}

module.exports = {
  getDb, all, get, run, save, applyLiveUpdates,
  setChampionPick, getChampionPicks, setSetting, getSetting,
};
