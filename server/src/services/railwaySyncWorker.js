const db = require('../db');
const { Client } = require('pg');

let isWorkerRunning = false;
let syncIntervalHandle = null;
let lastSyncTime = null;
let lastSyncError = null;

async function processSyncQueue() {
  if (isWorkerRunning) return;
  const railwayUrl = process.env.RAILWAY_PG_URL;
  
  if (!railwayUrl) {
    // Railway URL not configured yet - skip cloud push safely
    return;
  }

  isWorkerRunning = true;

  let cloudClient = null;
  try {
    // Connect to Railway PostgreSQL Cloud
    cloudClient = new Client({ connectionString: railwayUrl, connectionTimeoutMillis: 5000 });
    await cloudClient.connect();

    // Fetch pending sync items ordered by sync_id ASC
    const pendingRes = await db.query(`
      SELECT * FROM sync_outbox 
      WHERE status = 'pending' 
      ORDER BY sync_id ASC 
      LIMIT 50
    `);

    for (const item of pendingRes.rows) {
      try {
        const payload = item.payload_json;
        const entityType = item.entity_type;
        const action = item.action;

        // Execute sync to cloud PostgreSQL idempotently
        if (action === 'INSERT' || action === 'UPDATE') {
          if (entityType === 'transactions') {
            await cloudClient.query(`
              INSERT INTO transactions (
                transaction_id, room_id, room_name, start_time, end_time,
                duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
                grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              ON CONFLICT (transaction_id) DO UPDATE SET
                payment_status = EXCLUDED.payment_status,
                payment_method = EXCLUDED.payment_method,
                grand_total = EXCLUDED.grand_total
            `, [
              payload.transaction_id, payload.room_id, payload.room_name || '',
              payload.start_time || new Date(), payload.end_time || new Date(),
              payload.duration_minutes || 0, payload.rate_per_hour || 0,
              payload.room_total || 0, payload.fnb_total || 0, payload.lc_total || 0,
              payload.grand_total || 0, payload.fnb_order_ids || '',
              payload.payment_method || 'cash', payload.payment_status || 'unpaid',
              payload.cashier_name || 'Kasir', payload.operational_date || new Date()
            ]);
          } else if (entityType === 'cashier_closings') {
            await cloudClient.query(`
              INSERT INTO cashier_closings (
                closing_id, closing_date, cashier_name, total_transactions, paid_transactions,
                paid_revenue, cash_expected, cash_actual, cash_difference, total_revenue
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (closing_id) DO UPDATE SET total_revenue = EXCLUDED.total_revenue
            `, [
              payload.closing_id, payload.closing_date, payload.cashier_name || 'Kasir',
              payload.total_transactions || 0, payload.paid_transactions || 0,
              payload.paid_revenue || 0, payload.cash_expected || 0,
              payload.cash_actual || 0, payload.cash_difference || 0, payload.total_revenue || 0
            ]);
          }
        }

        // Mark item as synced in local outbox
        await db.query(`
          UPDATE sync_outbox 
          SET status = 'synced', last_attempt_at = CURRENT_TIMESTAMP, error_message = NULL
          WHERE sync_id = $1
        `, [item.sync_id]);

        lastSyncTime = new Date().toISOString();
      } catch (itemErr) {
        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = item.max_attempts || 5;
        const nextStatus = attempts >= maxAttempts ? 'dead_letter' : 'pending';

        await db.query(`
          UPDATE sync_outbox 
          SET attempts = $1, status = $2, last_attempt_at = CURRENT_TIMESTAMP, error_message = $3
          WHERE sync_id = $4
        `, [attempts, nextStatus, itemErr.message, item.sync_id]);

        lastSyncError = itemErr.message;
        console.error(`Sync error on item ${item.sync_id} (Attempt ${attempts}/${maxAttempts}):`, itemErr.message);
      }
    }
  } catch (connErr) {
    lastSyncError = connErr.message;
  } finally {
    if (cloudClient) {
      try { await cloudClient.end(); } catch (e) {}
    }
    isWorkerRunning = false;
  }
}

function startSyncWorker(intervalMs = 30000) {
  if (syncIntervalHandle) clearInterval(syncIntervalHandle);
  console.log(`📡 Starting Railway Sync Worker (Polling every ${intervalMs}ms)...`);
  syncIntervalHandle = setInterval(processSyncQueue, intervalMs);
}

function stopSyncWorker() {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }
}

async function getSyncStatus() {
  const countsRes = await db.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'synced') as synced_count,
      COUNT(*) FILTER (WHERE status = 'failed' OR status = 'dead_letter') as dead_letter_count,
      COUNT(*) as total_count
    FROM sync_outbox
  `);

  const counts = countsRes.rows[0];

  return {
    worker_running: isWorkerRunning,
    railway_url_configured: Boolean(process.env.RAILWAY_PG_URL),
    last_sync_time: lastSyncTime,
    last_sync_error: lastSyncError,
    pending_count: parseInt(counts.pending_count || 0, 10),
    synced_count: parseInt(counts.synced_count || 0, 10),
    dead_letter_count: parseInt(counts.dead_letter_count || 0, 10),
    total_outbox_records: parseInt(counts.total_count || 0, 10)
  };
}

module.exports = {
  startSyncWorker,
  stopSyncWorker,
  processSyncQueue,
  getSyncStatus
};
