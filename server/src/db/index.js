const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function shouldUseSsl() {
  const sslMode = String(process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  return ['1', 'true', 'require', 'required'].includes(sslMode);
}

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    }
  : {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'happy_song_pos',
    };

const pool = new Pool({
  ...poolConfig,
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

async function runTvDevicesMigration(targetPool = pool) {
  const alterQueries = [
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_ip VARCHAR(45);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_mac VARCHAR(32);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_port INT DEFAULT 5555;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_timeout_ms INT DEFAULT 15000;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS wol_broadcast VARCHAR(45) DEFAULT '192.168.1.255';",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notify_package VARCHAR(100) DEFAULT 'com.happysong.tvnotify';",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notes TEXT;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_result VARCHAR(30);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_message TEXT;"
  ];
  for (const q of alterQueries) {
    try {
      await targetPool.query(q);
    } catch (_e) {
      // Best-effort saat database offline / startup
    }
  }
}

module.exports = {
  query: safeQuery,
  pool,
  runTvDevicesMigration,
};
