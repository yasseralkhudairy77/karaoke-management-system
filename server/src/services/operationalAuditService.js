const db = require('../db');
const { getOperationalDate } = require('../utils/operationalDate');

let schemaChecked = false;

async function ensureOperationalAuditSchema(executor = db) {
  if (schemaChecked) return;
  await executor.query(`
    CREATE TABLE IF NOT EXISTS operational_audit_events (
      event_id VARCHAR(90) PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      operational_date DATE NOT NULL,
      risk_level VARCHAR(20) NOT NULL DEFAULT 'info',
      domain VARCHAR(30) NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      result VARCHAR(20) NOT NULL DEFAULT 'success',
      source_action VARCHAR(80),
      source_table VARCHAR(80),
      source_record_id VARCHAR(100),
      initiated_by_id VARCHAR(50),
      initiated_by_name VARCHAR(100) NOT NULL,
      initiated_by_role VARCHAR(30),
      authorized_by_id VARCHAR(50),
      authorized_by_name VARCHAR(100),
      authorized_by_role VARCHAR(30),
      target_type VARCHAR(40),
      target_id VARCHAR(100),
      transaction_id VARCHAR(50),
      session_id VARCHAR(100),
      order_id VARCHAR(50),
      room_id VARCHAR(50),
      room_name VARCHAR(100),
      reason TEXT,
      amount_before NUMERIC(14,2),
      amount_after NUMERIC(14,2),
      amount_delta NUMERIC(14,2),
      old_value_json JSONB,
      new_value_json JSONB,
      metadata_json JSONB,
      after_closing BOOLEAN NOT NULL DEFAULT FALSE,
      idempotency_key VARCHAR(150),
      reviewed BOOLEAN NOT NULL DEFAULT FALSE,
      reviewed_at TIMESTAMPTZ,
      reviewed_by VARCHAR(100),
      review_note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_audit_source_record
      ON operational_audit_events(source_table, source_record_id)
      WHERE source_table IS NOT NULL AND source_record_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_audit_idempotency
      ON operational_audit_events(idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_operational_audit_occurred_at
      ON operational_audit_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operational_audit_operational_date
      ON operational_audit_events(operational_date DESC);
    CREATE INDEX IF NOT EXISTS idx_operational_audit_risk
      ON operational_audit_events(risk_level, reviewed, occurred_at DESC);
  `);
  schemaChecked = true;
}

function normalizeActor(actor, fallbackName = 'Operator') {
  if (!actor) return { id: '', name: fallbackName, role: '' };
  if (typeof actor === 'string') return { id: '', name: actor.trim() || fallbackName, role: '' };
  return {
    id: String(actor.employee_id || actor.id || '').trim(),
    name: String(actor.employee_name || actor.name || fallbackName).trim(),
    role: String(actor.role || '').trim().toLowerCase()
  };
}

async function isTransactionAfterClosing(executor, transactionId) {
  if (!transactionId) return false;
  const result = await executor.query(
    'SELECT 1 FROM cashier_closing_transactions WHERE transaction_id = $1 LIMIT 1',
    [transactionId]
  );
  return result.rowCount > 0;
}

async function writeOperationalAudit(executor = db, event = {}) {
  // Pastikan DDL selesai di koneksi pool terpisah. Jangan cache DDL yang masih
  // berada di dalam transaksi bisnis karena transaksi tersebut bisa rollback.
  await ensureOperationalAuditSchema();
  const occurredAt = event.occurred_at ? new Date(event.occurred_at) : new Date();
  const initiated = normalizeActor(event.initiated_by, event.initiated_by_name || 'Operator');
  const authorized = event.authorized_by ? normalizeActor(event.authorized_by, '') : { id: '', name: '', role: '' };
  const transactionId = String(event.transaction_id || '').trim() || null;
  const afterClosing = event.after_closing === undefined
    ? await isTransactionAfterClosing(executor, transactionId)
    : Boolean(event.after_closing);
  const amountBefore = event.amount_before === null || event.amount_before === undefined ? null : Number(event.amount_before);
  const amountAfter = event.amount_after === null || event.amount_after === undefined ? null : Number(event.amount_after);
  const amountDelta = event.amount_delta === null || event.amount_delta === undefined
    ? (amountBefore !== null && amountAfter !== null ? amountAfter - amountBefore : null)
    : Number(event.amount_delta);
  const eventId = String(event.event_id || `OAE-${Date.now()}-${Math.floor(Math.random() * 100000)}`);

  const insertResult = await executor.query(`
    INSERT INTO operational_audit_events (
      event_id, occurred_at, operational_date, risk_level, domain, event_type,
      result, source_action, source_table, source_record_id,
      initiated_by_id, initiated_by_name, initiated_by_role,
      authorized_by_id, authorized_by_name, authorized_by_role,
      target_type, target_id, transaction_id, session_id, order_id,
      room_id, room_name, reason, amount_before, amount_after, amount_delta,
      old_value_json, new_value_json, metadata_json, after_closing, idempotency_key
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
    )
    ON CONFLICT DO NOTHING
    RETURNING event_id
  `, [
    eventId,
    occurredAt,
    event.operational_date || getOperationalDate(occurredAt),
    String(event.risk_level || 'info').toLowerCase(),
    String(event.domain || 'system').toLowerCase(),
    String(event.event_type || 'change').toLowerCase(),
    String(event.result || 'success').toLowerCase(),
    event.source_action || null,
    event.source_table || null,
    event.source_record_id || null,
    initiated.id || null,
    initiated.name,
    initiated.role || null,
    authorized.id || null,
    authorized.name || null,
    authorized.role || null,
    event.target_type || null,
    event.target_id || null,
    transactionId,
    event.session_id || null,
    event.order_id || null,
    event.room_id || null,
    event.room_name || null,
    event.reason || null,
    Number.isFinite(amountBefore) ? amountBefore : null,
    Number.isFinite(amountAfter) ? amountAfter : null,
    Number.isFinite(amountDelta) ? amountDelta : null,
    event.old_value || null,
    event.new_value || null,
    event.metadata || null,
    afterClosing,
    event.idempotency_key || null
  ]);

  if (insertResult.rowCount === 0) {
    if (event.idempotency_key) {
      const existing = await executor.query(
        'SELECT event_id FROM operational_audit_events WHERE idempotency_key = $1 LIMIT 1',
        [event.idempotency_key]
      );
      if (existing.rowCount > 0) return existing.rows[0].event_id;
    }
    if (event.source_table && event.source_record_id) {
      const existing = await executor.query(
        'SELECT event_id FROM operational_audit_events WHERE source_table = $1 AND source_record_id = $2 LIMIT 1',
        [event.source_table, event.source_record_id]
      );
      if (existing.rowCount > 0) return existing.rows[0].event_id;
    }
    throw new Error('Audit operasional gagal dicatat. Perubahan dibatalkan demi integritas data.');
  }

  return eventId;
}

module.exports = {
  ensureOperationalAuditSchema,
  normalizeActor,
  writeOperationalAudit
};
