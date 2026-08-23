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
    retentionDays: parseInt(process.env.OWNER_MIRROR_RETENTION_DAYS || '45', 10) || 45,
    batchSize: 500
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
    } else if (arg === '--batch-size') {
      args.batchSize = parseInt(argv[i + 1] || '', 10) || args.batchSize;
      i += 1;
    }
  }

  args.retentionDays = Math.max(7, args.retentionDays);
  args.batchSize = Math.min(2000, Math.max(50, args.batchSize));
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

async function withClient(fn) {
  const client = createClient();
  client.on('error', err => {
    console.error(`Koneksi database terputus: ${err.message}`);
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
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

async function deleteDuplicateBatch(client, sourceId, batchSize) {
  await client.query('BEGIN');
  try {
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
      ),
      deletable AS (
        SELECT snapshot_id
        FROM ranked
        WHERE row_number > 1
        LIMIT $2
      )
      DELETE FROM owner_mirror_snapshots target
      USING deletable
      WHERE target.snapshot_id = deletable.snapshot_id
    `, [sourceId, batchSize]);

    await client.query('COMMIT');
    return result.rowCount || 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function deleteOldBatch(client, sourceId, retentionDays, batchSize) {
  await client.query('BEGIN');
  try {
    const result = await client.query(`
      WITH deletable AS (
        SELECT snapshot_id
        FROM owner_mirror_snapshots
        WHERE source_id = $1
          AND received_at < CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day')
        LIMIT $3
      )
      DELETE FROM owner_mirror_snapshots
      USING deletable
      WHERE owner_mirror_snapshots.snapshot_id = deletable.snapshot_id
    `, [sourceId, retentionDays, batchSize]);

    await client.query('COMMIT');
    return result.rowCount || 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function cleanup(sourceId, retentionDays, batchSize) {
  let duplicateDeleted = 0;
  let oldDeleted = 0;

  while (true) {
    const deleted = await withClient(client => deleteDuplicateBatch(client, sourceId, batchSize));
    duplicateDeleted += deleted;
    if (deleted === 0) break;
    console.log(`Duplicate deleted so far: ${duplicateDeleted}`);
  }

  while (true) {
    const deleted = await withClient(client => deleteOldBatch(client, sourceId, retentionDays, batchSize));
    oldDeleted += deleted;
    if (deleted === 0) break;
    console.log(`Old deleted so far: ${oldDeleted}`);
  }

  return {
    duplicate_deleted: duplicateDeleted,
    old_deleted: oldDeleted
  };
}

async function main() {
  const args = parseArgs(process.argv);

  await withClient(async client => {
    const before = await tableStats(client, args.sourceId);
    const duplicateRows = await duplicateStats(client, args.sourceId);
    const oldRows = await oldStats(client, args.sourceId, args.retentionDays);

    console.log('OWNER MIRROR SNAPSHOT CLEANUP');
    console.log('---------------------------------------------------------');
    console.log(`Mode           : ${args.apply ? 'APPLY / DELETE' : 'DRY RUN ONLY'}`);
    console.log(`Source ID      : ${args.sourceId}`);
    console.log(`Retention days : ${args.retentionDays}`);
    console.log(`Batch size     : ${args.batchSize}`);
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
  });

  const result = await cleanup(args.sourceId, args.retentionDays, args.batchSize);

  await withClient(async client => {
    await client.query('VACUUM ANALYZE owner_mirror_snapshots');
    const after = await tableStats(client, args.sourceId);
    console.log('---------------------------------------------------------');
    console.log(`Duplicate deleted : ${result.duplicate_deleted}`);
    console.log(`Old deleted       : ${result.old_deleted}`);
    console.log(`Rows after        : ${after.source_rows}`);
    console.log(`Table size after  : ${after.table_size}`);
    console.log('Cleanup selesai.');
  });
}

main().catch(err => {
  console.error(`Cleanup gagal: ${err.message}`);
  process.exit(1);
});
