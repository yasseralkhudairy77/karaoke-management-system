const assert = require('assert');
const db = require('../src/db');
const { prepareRoomSession, closeSession } = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running Promo Room 2+1 (Beli 2 Jam Gratis 1 Jam) Tests...');

  await testPrepareRoomSessionPromo2Plus1();
  await testCloseSessionPromo2Plus1Billing();

  console.log('✅ ALL Promo Room 2+1 Tests PASSED SUCCESSFULLY!');
}

async function testPrepareRoomSessionPromo2Plus1() {
  const originalQuery = db.query;
  const originalConnect = db.pool.connect;
  const queries = [];

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM room_sessions WHERE idempotency_key')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return {
          rows: [{ room_id: 'ROOM-01', room_name: 'Room 01', status: 'available', rate_per_hour: 125000 }],
          rowCount: 1
        };
      }
      if (text.includes('INSERT INTO room_sessions')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE rooms')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO sync_outbox')) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    const payload = {
      room_id: 'ROOM-01',
      duration_minutes: 180,
      billable_minutes: 120,
      promo_note: 'PROMO 2+1 (Bayar 2 Jam Gratis 1 Jam)',
      cashier_name: 'Kasir Utama',
      customer_name: 'Bapak Rudi'
    };

    await prepareRoomSession(req, res, payload);

    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.ok, true);

    // Verify INSERT INTO room_sessions query params
    const insertSessionQuery = queries.find(q => q.text.includes('INSERT INTO room_sessions'));
    assert.ok(insertSessionQuery, 'Must execute INSERT INTO room_sessions');

    // params: [$1 sessionId, $2 roomId, $3 roomName, $4 bookingMode, $5 now, $6 scheduledEndTime, $7 durationMinutes, $8 packageIncludedMinutes, $9 billableMinutes, $10 ratePerHour, $11 cashierName, $12 idempotencyKey, $13 note]
    const params = insertSessionQuery.params;
    assert.strictEqual(params[1], 'ROOM-01');
    assert.strictEqual(params[6], 180, 'Total booked duration must be 180 minutes (3 hours)');
    assert.strictEqual(params[8], 120, 'Billable duration must be 120 minutes (2 hours)');
    assert.strictEqual(params[9], 125000, 'Rate per hour must be 125,000');
    assert.ok(params[12].includes('promo=PROMO 2+1'), 'Note must record promo info');
    assert.ok(params[12].includes('free_room_minutes=60'), 'Note must record 60 free minutes');

    console.log('  ✓ prepareRoomSession correctly stored 180m runtime and 120m billable duration with promo note');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function testCloseSessionPromo2Plus1Billing() {
  const originalConnect = db.pool.connect;
  const queries = [];

  const mockActiveSession = {
    session_id: 'SESSION-P21-01',
    room_id: 'ROOM-01',
    room_name: 'Room 01',
    booking_mode: 'regular',
    status: 'active',
    booked_duration_minutes: 180,
    billable_room_minutes: 120,
    rate_per_hour: 125000,
    start_time: new Date(Date.now() - 180 * 60 * 1000),
    cashier_name: 'Kasir Utama'
  };

  const mockRoom = {
    room_id: 'ROOM-01',
    room_name: 'Room 01',
    status: 'occupied',
    rate_per_hour: 125000,
    start_time: mockActiveSession.start_time,
    booked_duration_minutes: 180
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM transactions WHERE idempotency_key')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      if (text.includes('SELECT * FROM room_sessions')) {
        return { rows: [mockActiveSession], rowCount: 1 };
      }
      if (text.includes('SELECT * FROM room_session_segments')) {
        return {
          rows: [
            {
              segment_id: 'SEG-1',
              session_id: mockActiveSession.session_id,
              room_id: 'ROOM-01',
              room_name: 'Room 01',
              rate_per_hour: 125000,
              started_at: mockActiveSession.start_time,
              ended_at: null,
              allocated_minutes: 0,
              sequence_no: 1
            }
          ],
          rowCount: 1
        };
      }
      if (text.includes('SELECT order_id, order_total FROM fnb_orders')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT log_id, session_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO transactions')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE rooms') || text.includes('UPDATE room_sessions') || text.includes('UPDATE room_session_segments') || text.includes('UPDATE lc_work_logs')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO sync_outbox')) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    const payload = {
      room_id: 'ROOM-01',
      cashier_name: 'Kasir Utama'
    };

    await closeSession(req, res, payload);

    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.ok, true);

    const trx = responseData.transaction;
    assert.ok(trx);
    assert.strictEqual(trx.duration_minutes, 180, 'Duration must be 180m');
    assert.strictEqual(trx.billable_room_minutes, 120, 'Billable duration must be 120m (2 hours)');
    assert.strictEqual(trx.free_room_minutes, 60, 'Free duration must be 60m (1 hour)');
    
    // 2 hours x 125,000 = 250,000 (NOT 375,000!)
    assert.strictEqual(trx.room_total, 250000, 'Room total must be Rp 250.000 for 2 hours billed');
    assert.strictEqual(trx.grand_total, 250000, 'Grand total must be Rp 250.000');

    // Verify INSERT INTO transactions query params
    const insertTrxQuery = queries.find(q => q.text.includes('INSERT INTO transactions'));
    assert.ok(insertTrxQuery);
    // params includes billableRoomMinutes (120) and freeRoomMinutes (60)
    assert.ok(insertTrxQuery.params.includes(120), 'Params must include 120 billable minutes');
    assert.ok(insertTrxQuery.params.includes(60), 'Params must include 60 free room minutes');

    console.log('  ✓ closeSession accurately billed Rp 250.000 (2 hours) and granted 60m free promo on 180m session');
  } finally {
    db.pool.connect = originalConnect;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
