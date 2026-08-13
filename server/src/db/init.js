const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function initDatabase() {
  const targetDb = process.env.PGDATABASE || 'happy_song_pos';
  const config = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  };

  console.log(`Connecting to PostgreSQL host ${config.host}:${config.port} as user ${config.user}...`);

  // Step 1: Connect to default 'postgres' database to ensure target database exists
  const rootClient = new Client({ ...config, database: 'postgres' });
  try {
    await rootClient.connect();
    const res = await rootClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );

    if (res.rowCount === 0) {
      console.log(`Database '${targetDb}' does not exist. Creating database...`);
      await rootClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`Database '${targetDb}' created successfully.`);
    } else {
      console.log(`Database '${targetDb}' already exists.`);
    }
  } catch (err) {
    console.error('Error checking/creating database:', err.message);
    throw err;
  } finally {
    await rootClient.end();
  }

  // Step 2: Connect to target database and execute schema DDL
  const dbClient = new Client({ ...config, database: targetDb });
  try {
    await dbClient.connect();
    console.log(`Executing DDL schema on '${targetDb}'...`);
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await dbClient.query(schemaSql);
    console.log(`Schema initialization completed successfully for '${targetDb}'.`);
  } catch (err) {
    console.error('Error executing schema DDL:', err.message);
    throw err;
  } finally {
    await dbClient.end();
  }
}

if (require.main === module) {
  initDatabase().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}

module.exports = initDatabase;
