const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'happy_song_pos',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

async function safeQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      throw new Error('DATABASE_OFFLINE: Service PostgreSQL lokal (port 5432) tidak dapat dihubungi. Pastikan PostgreSQL sudah dinyalakan.');
    }
    throw err;
  }
}

module.exports = {
  query: safeQuery,
  pool,
};
