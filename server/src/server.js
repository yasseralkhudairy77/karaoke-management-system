const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for localhost / LAN cashier clients
app.use(cors());

// Middleware for parsing JSON and text body (Apps Script compatibility)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'] }));

// Attach routes
app.use('/', apiRoutes);
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    server: 'Happy Song POS Local Server (Node.js)',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log('===========================================================');
  console.log(`🎤 HAPPY SONG POS LOCAL SERVER IS RUNNING ON PORT ${PORT}`);
  console.log(`- Web App API Endpoint: http://localhost:${PORT}/exec`);
  console.log(`- Health Check Endpoint: http://localhost:${PORT}/health`);
  console.log('===========================================================');
});

module.exports = app;
