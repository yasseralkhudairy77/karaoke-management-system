const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiRoutes = require('./routes/api');
const { startSyncWorker, getSyncStatus } = require('./services/railwaySyncWorker');
const { getServerTimeFields } = require('./utils/response');

const app = express();
const PORT = process.env.PORT || 3000;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(regex => regex.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'] }));

app.use('/', apiRoutes);
app.use('/api', apiRoutes);

const frontendRoot = path.join(__dirname, '../..');
app.use(express.static(frontendRoot, {
  index: 'index.html',
  extensions: ['html']
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    server: 'Happy Song POS Local Server (Node.js)',
    ...getServerTimeFields()
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

function startServer(port = PORT, bindHost = BIND_HOST) {
  if (process.env.DISABLE_SYNC_WORKER !== '1') {
    startSyncWorker(parseInt(process.env.SYNC_INTERVAL_MS || '30000', 10));
  }

  return app.listen(port, bindHost, () => {
    console.log('===========================================================');
    console.log(`HAPPY SONG POS LOCAL SERVER LISTENING ON http://${bindHost}:${port}`);
    console.log(`- Local Dashboard: http://localhost:${port}/`);
    console.log(`- Web App API Endpoint: http://localhost:${port}/exec`);
    console.log(`- Observability Endpoint: http://localhost:${port}/sync/status`);
    console.log('===========================================================');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
