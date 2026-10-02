const assert = require('assert');
const db = require('../src/db');
const { getOperationalAuditReport } = require('../src/controllers/auditController');
const { writeOperationalAudit } = require('../src/services/operationalAuditService');

async function run() {
  const originalQuery = db.query;
  const now = new Date();
  const recoveryAt = new Date(now.getTime() - 60 * 1000);
  const stockAt = new Date(now.getTime() - 2 * 60 * 1000);

  db.query = async sql => {
    const text = String(sql);
    if (text.includes('CREATE TABLE IF NOT EXISTS operational_audit_events')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM operational_audit_events')) {
      return {
        rows: [{
          event_id: 'OAE-TEST-DISCOUNT', occurred_at: now, operational_date: '2026-08-23',
          risk_level: 'high', domain: 'transaction', event_type: 'manual_discount_correction',
          initiated_by_name: 'Kasir Test', authorized_by_name: 'Manager Test',
          target_type: 'transaction', target_id: 'TRX-TEST', transaction_id: 'TRX-TEST',
          reason: 'UAT audit', amount_before: 200000, amount_after: 150000, amount_delta: -50000
        }],
        rowCount: 1
      };
    }
    if (text.includes('FROM stock_movements')) {
      return {
        rows: [{
          movement_id: 'SM-TEST', created_at: stockAt, reference_type: 'manual_adjustment',
          cashier_name: 'Owner Test', stock_item_id: 'STOCK-1', stock_item_name: 'Beer Test',
          movement_type: 'adjustment', stock_before: 20, stock_after: 10, qty_change: -10,
          note: 'Koreksi stok UAT'
        }],
        rowCount: 1
      };
    }
    if (text.includes('FROM room_recovery_logs')) {
      return {
        rows: [{
          log_id: 'RRL-TEST', timestamp: recoveryAt, room_id: 'ROOM-1', room_name: 'Room 1',
          session_id: 'SESSION-1', issue_type: 'stale_session', action: 'reset',
          reason: 'Recovery UAT', actor: 'Manager Test', result: 'success'
        }],
        rowCount: 1
      };
    }
    if (text.includes("FROM fnb_orders WHERE order_status = 'cancelled'")) {
      return {
        rows: [{
          order_id: 'ORD-CANCELLED', cancelled_at: new Date(now.getTime() - 3 * 60 * 1000),
          cancelled_by: 'Kasir Test', room_id: 'FNB-GENERAL', room_name: 'F&B Umum',
          cancel_reason: 'Salah input UAT', order_total: 25000
        }],
        rowCount: 1
      };
    }
    return { rows: [], rowCount: 0 };
  };

  let responsePayload;
  const req = { query: { period: 'today', limit: '200' } };
  const res = { json(payload) { responsePayload = payload; return payload; } };

  try {
    await getOperationalAuditReport(req, res);
  } finally {
    db.query = originalQuery;
  }

  assert.strictEqual(responsePayload.ok, true);
  assert.strictEqual(responsePayload.events.length, 4);
  assert.strictEqual(responsePayload.summary.total_events, 4);
  assert.strictEqual(responsePayload.summary.revenue_reduction, 75000, 'Qty stok tidak boleh dihitung sebagai rupiah.');

  const stockEvent = responsePayload.events.find(event => event.event_id === 'legacy-stock-SM-TEST');
  assert.strictEqual(stockEvent.amount_delta, null);
  assert.strictEqual(stockEvent.metadata_json.qty_change, -10);

  const recoveryEvent = responsePayload.events.find(event => event.event_id === 'legacy-recovery-RRL-TEST');
  assert.strictEqual(recoveryEvent.occurred_at, recoveryAt.toISOString());

  const inserted = [];
  const fakeExecutor = {
    async query(sql, params) {
      inserted.push({ sql: String(sql), params });
      return { rows: [{ event_id: params?.[0] }], rowCount: 1 };
    }
  };
  const eventId = await writeOperationalAudit(fakeExecutor, {
    event_id: 'OAE-ATOMIC-TEST', domain: 'transaction', event_type: 'test_change',
    initiated_by: { employee_id: 'EMP-1', employee_name: 'Owner Test', role: 'owner' }
  });
  assert.strictEqual(eventId, 'OAE-ATOMIC-TEST');
  assert(inserted.some(entry => entry.sql.includes('INSERT INTO operational_audit_events')));

  const rejectingExecutor = { async query() { return { rows: [], rowCount: 0 }; } };
  await assert.rejects(
    () => writeOperationalAudit(rejectingExecutor, {
      event_id: 'OAE-REJECT-TEST', domain: 'transaction', event_type: 'test_change', initiated_by: 'Kasir Test'
    }),
    /Perubahan dibatalkan demi integritas data/
  );
  console.log('Operational audit report tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
