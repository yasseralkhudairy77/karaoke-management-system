const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { restoreClosedSession } = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running Restore Closed Room Session Tests...\n');

  // Test 1: Frontend Code & Contract Verification
  console.log('Test 1: Verifying frontend UI & contracts in js/app.js & css/style.css...');
  const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(__dirname, '../../css/style.css'), 'utf-8');

  assert(appJs.includes('room-button-restore-session'), 'js/app.js harus memiliki kelas room-button-restore-session');
  assert(appJs.includes('dataset.action = "restore-room-session"'), 'js/app.js harus memiliki action restore-room-session');
  assert(appJs.includes('function requestRestoreRoomSession'), 'js/app.js harus memiliki fungsi requestRestoreRoomSession');
  assert(appJs.includes('async function executeRestoreRoomSession'), 'js/app.js harus memiliki fungsi executeRestoreRoomSession');
  assert(appJs.includes('action === "restore-room-session"'), 'js/app.js click listener harus menangani restore-room-session');
  assert(appJs.includes('room-actions-cleaning'), 'js/app.js harus menerapkan kelas room-actions-cleaning');

  assert(styleCss.includes('.room-actions-cleaning'), 'css/style.css harus memiliki styling .room-actions-cleaning');
  assert(styleCss.includes('.room-button-restore-session'), 'css/style.css harus memiliki styling .room-button-restore-session');
  console.log('  ✓ PASS: Frontend contracts and styling verified.\n');

  // Test 2: API Route Registration
  console.log('Test 2: Verifying API route registration in server/src/routes/api.js...');
  const apiJs = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf-8');
  assert(apiJs.includes("case 'restoreClosedSession':"), 'api.js harus mendaftarkan action restoreClosedSession');
  console.log('  ✓ PASS: API route registered.\n');

  // Test 3: Backend Controller Unit Testing with Mocked DB
  console.log('Test 3: Testing roomsController.restoreClosedSession logic...');
  const originalPoolConnect = db.pool.connect;
  const originalQuery = db.query;

  const mockRoom = {
    room_id: '9',
    room_name: 'Ruangan 9 - EXECUTIVE',
    status: 'cleaning',
    start_time: null,
    booked_duration_minutes: 0,
    scheduled_end_time: null,
    is_upfront_paid: false
  };

  const originalStartTime = new Date(Date.now() - 40 * 60 * 1000);
  const originalScheduledEndTime = new Date(Date.now() + 20 * 60 * 1000);

  const mockSession = {
    session_id: 'SESS-VIP9-TEST',
    room_id: '9',
    status: 'closed',
    start_time: originalStartTime,
    end_time: new Date(),
    booked_duration_minutes: 60,
    scheduled_end_time: originalScheduledEndTime,
    closed_transaction_id: 'TRX-TEMP-CLOSING-123',
    upfront_transaction_id: null
  };

  const mockTransaction = {
    transaction_id: 'TRX-TEMP-CLOSING-123',
    payment_status: 'unpaid',
    is_voided: false,
    fnb_order_ids: 'FNB-ORDER-1'
  };

  const mockFnbOrders = [
    { order_id: 'FNB-ORDER-1', session_id: 'SESS-VIP9-TEST', room_id: '9', order_status: 'billed' }
  ];

  const mockLcWorkLogs = [
    { log_id: 'LC-1', session_id: 'SESS-VIP9-TEST', closed_transaction_id: 'TRX-TEMP-CLOSING-123', status: 'closed' }
  ];

  let auditEvents = [];

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      // SELECT room FOR UPDATE
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }

      // SELECT room_sessions FOR UPDATE
      if (text.includes('SELECT * FROM room_sessions') && text.includes("status = 'closed'")) {
        return { rows: [mockSession], rowCount: 1 };
      }

      // SELECT transactions FOR UPDATE
      if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE') || text.includes('SELECT * FROM transactions WHERE transaction_id = $1')) {
        return { rows: [mockTransaction], rowCount: 1 };
      }

      // UPDATE transactions (void/cancel)
      if (text.includes('UPDATE transactions') && text.includes("payment_status = 'cancelled'")) {
        mockTransaction.payment_status = 'cancelled';
        mockTransaction.is_voided = true;
        return { rows: [mockTransaction], rowCount: 1 };
      }

      // DELETE FROM sync_outbox
      if (text.includes('DELETE FROM sync_outbox')) {
        return { rows: [], rowCount: 1 };
      }

      // UPDATE fnb_orders (reopen)
      if (text.includes('UPDATE fnb_orders') && text.includes("SET order_status = 'open'")) {
        mockFnbOrders.forEach(o => { o.order_status = 'open'; });
        return { rows: mockFnbOrders, rowCount: mockFnbOrders.length };
      }

      // UPDATE fnb_orders (billed)
      if (text.includes('UPDATE fnb_orders') && text.includes("SET order_status = 'billed'")) {
        return { rows: [], rowCount: 1 };
      }

      // UPDATE lc_work_logs (reopen)
      if (text.includes('UPDATE lc_work_logs') && text.includes("SET status = 'active'")) {
        mockLcWorkLogs.forEach(l => { l.status = 'active'; l.closed_at = null; l.closed_transaction_id = null; });
        return { rows: mockLcWorkLogs, rowCount: mockLcWorkLogs.length };
      }

      // UPDATE room_sessions (reopen)
      if (text.includes('UPDATE room_sessions') && text.includes("SET status = 'active'")) {
        mockSession.status = 'active';
        mockSession.end_time = null;
        mockSession.closed_transaction_id = null;
        return { rows: [mockSession], rowCount: 1 };
      }

      // UPDATE rooms (restore to occupied)
      if (text.includes('UPDATE rooms') && text.includes("SET status = 'occupied'")) {
        mockRoom.status = 'occupied';
        mockRoom.start_time = params[0];
        mockRoom.booked_duration_minutes = params[1];
        mockRoom.scheduled_end_time = params[2];
        return { rows: [mockRoom], rowCount: 1 };
      }

      // INSERT INTO operational_audit_events
      if (text.includes('INSERT INTO operational_audit_events')) {
        auditEvents.push(params);
        return { rows: [{ event_id: 'AUDIT-TEST' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;
  db.query = async (sql, params) => mockClient.query(sql, params);

  let responseData = null;
  const res = {
    json: (data) => { responseData = data; return data; },
    status: () => res
  };

  try {
    // 3a. Validation: missing room_id
    responseData = null;
    await restoreClosedSession({}, res, {});
    assert.strictEqual(responseData.ok, false, 'Harus gagal jika room_id kosong');
    console.log('  ✓ PASS: Missing room_id rejected.');

    // 3b. Success Restore
    responseData = null;
    await restoreClosedSession({}, res, {
      room_id: '9',
      reason: 'Kasir tidak sengaja menekan selesaikan sesi',
      restored_by: 'Manager 1 (Owner)'
    });

    assert.strictEqual(responseData.ok, true, 'Restore session harus sukses');
    assert.strictEqual(mockRoom.status, 'occupied', 'Status room harus kembali occupied');
    assert.strictEqual(mockRoom.booked_duration_minutes, 60, 'Durasi booking harus kembali 60');
    assert.deepStrictEqual(mockRoom.scheduled_end_time, originalScheduledEndTime, 'Jadwal end time harus tetap jadwal semula');
    assert.strictEqual(mockSession.status, 'active', 'Status sesi harus kembali active');
    assert.strictEqual(mockSession.end_time, null, 'End time sesi harus di-reset ke null');
    assert.strictEqual(mockFnbOrders[0].order_status, 'open', 'Pesanan F&B harus kembali open');
    assert.strictEqual(mockTransaction.payment_status, 'cancelled', 'Draft transaksi penutupan harus dibatalkan');
    assert.strictEqual(mockTransaction.is_voided, true, 'Draft transaksi penutupan harus di-void');
    assert.strictEqual(mockLcWorkLogs[0].status, 'active', 'Log LC harus kembali active');
    assert(auditEvents.length > 0, 'Audit event harus tercatat');
    console.log('  ✓ PASS: Session restored to occupied, F&B reopened, TV/closing draft cancelled, and audit logged.');

  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalQuery;
  }

  console.log('\n🎉 ALL RESTORE CLOSED SESSION TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
