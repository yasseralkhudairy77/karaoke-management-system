const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function shouldUseSsl() {
  const sslMode = String(process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  return ['1', 'true', 'require', 'required'].includes(sslMode);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    sourceId: process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local',
    retentionDays: parseInt(process.env.OWNER_MIRROR_RETENTION_DAYS || '45', 10) || 45
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--source-id') {
      args.sourceId = argv[i + 1] || args.sourceId;
      i += 1;
    } else if (arg === '--retention-days') {
      args.retentionDays = parseInt(argv[i + 1] || '', 10) || args.retentionDays;
      i += 1;
    }
  }

  args.retentionDays = Math.max(7, args.retentionDays);
  return args;
}

function createClient() {
  if (process.env.DATABASE_URL) {
    return new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined
    });
  }

  return new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'happy_song_pos'
  });
}

async function tableStats(client, sourceId) {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE source_id = $1)::int AS source_rows,
      MIN(received_at) FILTER (WHERE source_id = $1) AS oldest_received_at,
      MAX(received_at) FILTER (WHERE source_id = $1) AS newest_received_at,
      pg_size_pretty(pg_total_relation_size('owner_mirror_snapshots')) AS table_size
    FROM owner_mirror_snapshots
  `, [sourceId]);
  return result.rows[0];
}

async function duplicateStats(client, sourceId) {
  const result = await client.query(`
    WITH ranked AS (
      SELECT
        snapshot_id,
        ROW_NUMBER() OVER (
          PARTITION BY source_id, COALESCE(period, ''), operational_date_start, operational_date_end
          ORDER BY received_at DESC, snapshot_id DESC
        ) AS row_number
      FROM owner_mirror_snapshots
      WHERE source_id = $1
    )
    SELECT COUNT(*)::int AS duplicate_rows
    FROM ranked
    WHERE row_number > 1
  `, [sourceId]);
  return result.rows[0].duplicate_rows || 0;
}

async function oldStats(client, sourceId, retentionDays) {
  const result = await client.query(`
    SELECT COUNT(*)::int AS old_rows
    FROM owner_mirror_snapshots
    WHERE source_id = $1
      AND received_at < CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day')
  `, [sourceId, retentionDays]);
  return result.rows[0].old_rows || 0;
}

async function cleanup(client, sourceId, retentionDays) {
  await client.query('BEGIN');
  try {
    const dedupe = await client.query(`
      WITH ranked AS (
        SELECT
          snapshot_id,
          ROW_NUMBER() OVER (
            PARTITION BY source_id, COALESCE(period, ''), operational_date_start, operational_date_end
            ORDER BY received_at DESC, snapshot_id DESC
          ) AS row_number
        FROM owner_mirror_snapshots
        WHERE source_id = $1
      )
      DELETE FROM owner_mirror_snapshots target
      USING ranked
      WHERE target.snapshot_id = ranked.snapshot_id
        AND ranked.row_number > 1
    `, [sourceId]);

    const old = await client.query(`
      DELETE FROM owner_mirror_snapshots
      WHERE source_id = $1
        AND received_at < CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day')
    `, [sourceId, retentionDays]);

    await client.query('COMMIT');
    return {
      duplicate_deleted: dedupe.rowCount || 0,
      old_deleted: old.rowCount || 0
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const client = createClient();
  await client.connect();

  try {
    const before = await tableStats(client, args.sourceId);
    const duplicateRows = await duplicateStats(client, args.sourceId);
    const oldRows = await oldStats(client, args.sourceId, args.retentionDays);

    console.log('OWNER MIRROR SNAPSHOT CLEANUP');
    console.log('---------------------------------------------------------');
    console.log(`Mode           : ${args.apply ? 'APPLY / DELETE' : 'DRY RUN ONLY'}`);
    console.log(`Source ID      : ${args.sourceId}`);
    console.log(`Retention days : ${args.retentionDays}`);
    console.log(`Table size     : ${before.table_size}`);
    console.log(`Total rows     : ${before.total_rows}`);
    console.log(`Source rows    : ${before.source_rows}`);
    console.log(`Duplicate rows : ${duplicateRows}`);
    console.log(`Old rows       : ${oldRows}`);
    console.log(`Oldest         : ${before.oldest_received_at || '-'}`);
    console.log(`Newest         : ${before.newest_received_at || '-'}`);

    if (!args.apply) {
      console.log('---------------------------------------------------------');
      console.log('Tidak ada data dihapus. Jalankan ulang dengan --apply jika sudah siap.');
      return;
    }

    const result = await cleanup(client, args.sourceId, args.retentionDays);
    await client.query('VACUUM ANALYZE owner_mirror_snapshots');
    const after = await tableStats(client, args.sourceId);
    console.log('---------------------------------------------------------');
    console.log(`Duplicate deleted : ${result.duplicate_deleted}`);
    console.log(`Old deleted       : ${result.old_deleted}`);
    console.log(`Rows after        : ${after.source_rows}`);
    console.log(`Table size after  : ${after.table_size}`);
    console.log('Cleanup selesai.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(`Cleanup gagal: ${err.message}`);
  process.exit(1);
});
