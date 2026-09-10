const assert = require('assert');
const db = require('../src/db');
const { adjustSessionTime } = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running Adjust Session Time (Koreksi Jam Sesi / Waktu Mundur) Tests...');

  await testAdjustSessionTimeSuccess();
  await testAdjustSessionTimeRejectFuture();
  await testAdjustSessionTimeRejectNotOccupied();
  await testAdjustSessionTimeInvalidFormat();

  console.log('✅ ALL Adjust Session Time Tests PASSED SUCCESSFULLY!');
}

async function testAdjustSessionTimeSuccess() {
  const originalConnect = db.pool.connect;
  const queries = [];

  // Setup: kamar start di 20:20, durasi 120 menit (end di 22:20)
  // Dikoreksi mundur ke 20:00, end harus menjadi 22:00
  const now = new Date();
  const originalStartTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 menit lalu
  const adjustedStartTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 menit lalu
  const pad = (n) => String(n).padStart(2, '0');
  const inputHHMM = `${pad(adjustedStartTime.getHours())}:${pad(adjustedStartTime.getMinutes())}`;

  const mockRoom = {
    room_id: 'ROOM-TEST-01',
    room_name: 'Room VIP 1',
    status: 'occupied',
    start_time: originalStartTime.toISOString(),
    scheduled_end_time: new Date(originalStartTime.getTime() + 120 * 60 * 1000).toISOString(),
    booked_duration_minutes: 120,
    active_session_id: 'SESS-100'
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      if (text.includes("FROM room_sessions") && (text.includes("status = 'active'") || text.includes("status IN"))) {
        return {
          rows: [{
            session_id: 'SESS-100',
            room_id: 'ROOM-TEST-01',
            status: 'active',
            start_time: originalStartTime.toISOString(),
            scheduled_end_time: new Date(originalStartTime.getTime() + 120 * 60 * 1000).toISOString(),
            booked_duration_minutes: 120
          }],
          rowCount: 1
        };
      }
      if (text.includes("FROM room_sessions") && text.includes("status = 'completed'")) {
        return { rows: [{ session_id: 'SESS-PREV', end_time: new Date(adjustedStartTime.getTime() - 60 * 60 * 1000).toISOString() }], rowCount: 1 };
      }
      if (text.includes('UPDATE rooms SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE room_sessions SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE room_session_segments SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE lc_work_logs SET')) {
        return { rowCount: 2, rows: [] };
      }
      if (text.includes('INSERT INTO room_time_logs')) {
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
    let responseStatus = 200;
    const req = {};
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return data; }
    };

    const payload = {
      room_id: 'ROOM-TEST-01',
      new_start_time: inputHHMM,
      cashier_name: 'Kasir Test'
    };

    await adjustSessionTime(req, res, payload);

    if (responseStatus !== 200) {
      console.error('Unexpected error response:', responseData);
    }
    assert.strictEqual(responseStatus, 200, `Expected status 200 but got ${responseStatus}: ${responseData?.message}`);
    assert.strictEqual(responseData.status, 'success');
    assert.ok(responseData.room, 'Expected response to contain updated room object');
    assert.strictEqual(responseData.room.booked_duration_minutes, 120);

    // Verifikasi query update rooms
    const updateRoomQuery = queries.find(q => q.text.includes('UPDATE rooms') && q.text.includes('start_time'));
    assert.ok(updateRoomQuery, 'Should execute UPDATE rooms query');

    // Verifikasi query audit log
    const auditLogQuery = queries.find(q => q.text.includes('INSERT INTO room_time_logs'));
    assert.ok(auditLogQuery, 'Should insert into room_time_logs');
    assert.ok(auditLogQuery.text.includes("'adjust_start_time'"), "Should contain action_type 'adjust_start_time'");
    assert.strictEqual(auditLogQuery.params[8], 'Kasir Test', 'Should record cashier name in params');

    console.log('  ✓ PASS: testAdjustSessionTimeSuccess');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function testAdjustSessionTimeRejectFuture() {
  const originalConnect = db.pool.connect;
  const now = new Date();
  const futureTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 jam ke depan
  const pad = (n) => String(n).padStart(2, '0');
  const futureHHMM = `${pad(futureTime.getHours())}:${pad(futureTime.getMinutes())}`;

  const mockRoom = {
    room_id: 'ROOM-TEST-02',
    room_name: 'Room 02',
    status: 'occupied',
    start_time: now.toISOString(),
    scheduled_end_time: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    booked_duration_minutes: 60,
    active_session_id: 'SESS-102'
  };

  const mockClient = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    let responseStatus = 200;
    const req = {};
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return data; }
    };

    const payload = {
      room_id: 'ROOM-TEST-02',
      new_start_time: futureHHMM,
      cashier_name: 'Kasir Test'
    };

    await adjustSessionTime(req, res, payload);

    assert.strictEqual(responseData.ok, false);
    assert.ok(responseData.message.includes('melebihi waktu sekarang'), `Expected error message to mention 'melebihi waktu sekarang', got: ${responseData.message}`);

    console.log('  ✓ PASS: testAdjustSessionTimeRejectFuture');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function testAdjustSessionTimeRejectNotOccupied() {
  const originalConnect = db.pool.connect;
  const mockRoom = {
    room_id: 'ROOM-TEST-03',
    room_name: 'Room 03',
    status: 'available', // Bukan occupied
    start_time: null,
    booked_duration_minutes: 60
  };

  const mockClient = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    let responseStatus = 200;
    const req = {};
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return data; }
    };

    const payload = {
      room_id: 'ROOM-TEST-03',
      new_start_time: '20:00',
      cashier_name: 'Kasir Test'
    };

    await adjustSessionTime(req, res, payload);

    assert.strictEqual(responseData.ok, false);
    assert.ok(responseData.message.includes('sedang aktif'), `Expected message to mention 'sedang aktif', got: ${responseData.message}`);

    console.log('  ✓ PASS: testAdjustSessionTimeRejectNotOccupied');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function testAdjustSessionTimeInvalidFormat() {
  const originalConnect = db.pool.connect;
  const now = new Date();
  const mockRoom = {
    room_id: 'ROOM-TEST-04',
    room_name: 'Room 04',
    status: 'occupied',
    start_time: now.toISOString(),
    booked_duration_minutes: 60
  };

  const mockClient = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    let responseStatus = 200;
    const req = {};
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return data; }
    };

    const payload = {
      room_id: 'ROOM-TEST-04',
      new_start_time: 'invalid-time',
      cashier_name: 'Kasir Test'
    };

    await adjustSessionTime(req, res, payload);

    assert.strictEqual(responseData.ok, false);
    assert.ok(responseData.message.includes('Format'), `Expected message to mention 'Format', got: ${responseData.message}`);

    console.log('  ✓ PASS: testAdjustSessionTimeInvalidFormat');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function testAdjustSessionDurationReduction() {
  const originalConnect = db.pool.connect;
  const queries = [];

  const now = new Date();
  const originalStartTime = new Date(now.getTime() - 40 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const inputHHMM = `${pad(originalStartTime.getHours())}:${pad(originalStartTime.getMinutes())}`;

  // Kamar salah ditambah jadi 180 menit, kasir menurunkan kembali ke 120 menit
  const mockRoom = {
    room_id: 'ROOM-TEST-05',
    room_name: 'Room VIP 5',
    status: 'occupied',
    start_time: originalStartTime.toISOString(),
    scheduled_end_time: new Date(originalStartTime.getTime() + 180 * 60 * 1000).toISOString(),
    booked_duration_minutes: 180,
    active_session_id: 'SESS-500'
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
        return { rows: [mockRoom], rowCount: 1 };
      }
      if (text.includes("FROM room_sessions") && (text.includes("status = 'active'") || text.includes("status IN"))) {
        return {
          rows: [{
            session_id: 'SESS-500',
            room_id: 'ROOM-TEST-05',
            status: 'active',
            start_time: originalStartTime.toISOString(),
            scheduled_end_time: new Date(originalStartTime.getTime() + 180 * 60 * 1000).toISOString(),
            booked_duration_minutes: 180,
            billable_room_minutes: 180
          }],
          rowCount: 1
        };
      }
      if (text.includes('UPDATE rooms SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE room_sessions SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE room_session_segments SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('UPDATE lc_work_logs SET')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO room_time_logs')) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;

  try {
    let responseData = null;
    let responseStatus = 200;
    const req = {};
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseData = data; return data; }
    };

    const payload = {
      room_id: 'ROOM-TEST-05',
      new_start_time: inputHHMM,
      duration_minutes: 120, // Diturunkan dari 180 ke 120 menit
      cashier_name: 'Kasir Test',
      reason: 'Salah tambah jam, diturunkan kembali'
    };

    await adjustSessionTime(req, res, payload);

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseData.status, 'success');
    assert.strictEqual(responseData.room.booked_duration_minutes, 120);

    // Cek query UPDATE rooms menurunkan booked_duration_minutes ke 120
    const updateRoomQuery = queries.find(q => q.text.includes('UPDATE rooms') && q.text.includes('booked_duration_minutes'));
    assert.ok(updateRoomQuery, 'Should execute UPDATE rooms query with booked_duration_minutes');
    assert.strictEqual(updateRoomQuery.params[1], 120, 'Rooms booked_duration_minutes should be updated to 120');

    // Cek query UPDATE room_sessions menurunkan booked_duration_minutes dan billable_room_minutes
    const updateSessionQuery = queries.find(q => q.text.includes('UPDATE room_sessions') && q.text.includes('billable_room_minutes'));
    assert.ok(updateSessionQuery, 'Should execute UPDATE room_sessions query');
    assert.strictEqual(updateSessionQuery.params[1], 120, 'Session booked_duration_minutes should be updated to 120');
    assert.strictEqual(updateSessionQuery.params[4], -60, 'Duration diff should be -60 minutes');

    // Cek audit log
    const auditLogQuery = queries.find(q => q.text.includes('INSERT INTO room_time_logs'));
    assert.ok(auditLogQuery, 'Should insert into room_time_logs');
    assert.ok(auditLogQuery.text.includes('adjust_time_and_duration'), 'Action type should be adjust_time_and_duration');
    assert.strictEqual(auditLogQuery.params[3], 180, 'Old duration was 180');
    assert.strictEqual(auditLogQuery.params[4], 120, 'New duration is 120');

    console.log('  ✓ PASS: testAdjustSessionDurationReduction');
  } finally {
    db.pool.connect = originalConnect;
  }
}

async function runTests() {
  console.log('🧪 Running Adjust Session Time (Koreksi Jam Sesi / Waktu Mundur) Tests...');

  await testAdjustSessionTimeSuccess();
  await testAdjustSessionTimeRejectFuture();
  await testAdjustSessionTimeRejectNotOccupied();
  await testAdjustSessionTimeInvalidFormat();
  await testAdjustSessionDurationReduction();

  console.log('✅ ALL Adjust Session Time Tests PASSED SUCCESSFULLY!');
}

module.exports = { runTests };

if (require.main === module) {
  runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}
