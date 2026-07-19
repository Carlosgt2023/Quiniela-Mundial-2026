// Carga variables desde .env en local (Node 20.12+/21.7+). En Railway las
// variables vienen del panel y no hay archivo .env: el try/catch lo ignora.
// Debe ir ANTES de requerir módulos que leen process.env al cargarse.
try { process.loadEnvFile(); } catch { /* sin .env o Node antiguo: usa el entorno */ }

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db/database');
const liveScores = require('./services/liveScores');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', require('./routes/api'));

// SPA fallback — serve index.html for any non-API route
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB then start server
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  ⚽  Quiniela Mundial 2026 | Zseries`);
    console.log(`  🌐  http://localhost:${PORT}\n`);
    // Arranca la sincronización de marcadores en vivo (no-op si no hay API key).
    liveScores.start();
  });
}).catch(err => {
  console.error('Error inicializando DB:', err);
  process.exit(1);
});
