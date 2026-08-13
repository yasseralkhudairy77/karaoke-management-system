const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiRoutes = require('./routes/api');
const { startSyncWorker, getSyncStatus } = require('./services/railwaySyncWorker');

const app = express();
const PORT = process.env.PORT || 3000;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

// Restricted CORS whitelist for Local/LAN subnets and localhost
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow non-browser / local curl requests
    const isAllowed = allowedOrigins.some(regex => regex.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

// Body parser middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'] }));

// Legacy Web App and REST API Routes
app.use('/', apiRoutes);
app.use('/api', apiRoutes);

// Server Health & Sync Observability Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    server: 'Happy Song POS Local Server (Node.js)',
    timestamp: new Date().toISOString()
  });
});

app.get('/sync/status', async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json({ ok: true, success: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start Railway background sync worker (polls outbox every 30s)
startSyncWorker(parseInt(process.env.SYNC_INTERVAL_MS || '30000', 10));

app.listen(PORT, BIND_HOST, () => {
  console.log('===========================================================');
  console.log(`🎤 HAPPY SONG POS LOCAL SERVER LISTENING ON http://${BIND_HOST}:${PORT}`);
  console.log(`- Web App API Endpoint: http://localhost:${PORT}/exec`);
  console.log(`- Observability Endpoint: http://localhost:${PORT}/sync/status`);
  console.log('===========================================================');
});

module.exports = app;
