const assert = require('assert');
const db = require('../src/db');
const { cancelBooking } = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running Cancel Booking (Pembatalan Sesi Menunggu Mulai & Booking) Tests...\n');

  await testCancelPaidWaitingStart();
  await testCancelRejectShortReason();
  await testCancelRejectOccupiedRoom();
  await testCancelBookedRoom();

  console.log('\n✅ ALL Cancel Booking Tests PASSED SUCCESSFULLY!');
}

async function testCancelPaidWaitingStart() {
  console.log('Test 1: Membatalkan kamar berstatus paid_waiting_start (Blue Card)...');
  const originalConnect = db.pool.connect;
  const originalQuery = db.query;
  const queries = [];

  const mockRoom = {
    room_id: 'ROOM-2',
    room_name: 'Ruangan 2 - VIP 2',
    status: 'paid_waiting_start',
    start_time: null,
    scheduled_end_time: null,
    booked_duration_minutes: 60
  };

  const mockHandler = async (sql, params = []) => {
    const text = String(sql);
    queries.push({ text, params });

    if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
      return { rows: [mockRoom], rowCount: 1 };
    }
    if (text.includes('UPDATE room_sessions')) {
      assert.ok(text.includes('$1::text'), 'Query UPDATE room_sessions wajib menyertakan typecast $1::text agar terhindar dari error 42P18');
      return { rows: [{ session_id: 'SESS-WAITING-001' }], rowCount: 1 };
    }
    if (text.includes('UPDATE fnb_orders')) {
      return { rowCount: 0 };
    }
    if (text.includes('UPDATE rooms')) {
      return { rowCount: 1 };
    }
    if (text.includes('operational_audit_events')) {
      return { rows: [{ event_id: 'OAE-123' }], rowCount: 1 };
    }
    if (text.includes('sync_outbox')) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const mockClient = {
    query: mockHandler,
    release: () => {}
  };

  db.pool.connect = async () => mockClient;
  db.query = mockHandler;

  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; return data; },
    status: () => mockRes
  };

  try {
    await cancelBooking({}, mockRes, {
      room_id: 'ROOM-2',
      reason: 'Salah pilih durasi room oleh kasir',
      cashier_name: 'Manager 1 (Owner)'
    });

    assert.ok(responseData, 'Response data harus ada');
    assert.strictEqual(responseData.ok, true, 'Status respons harus ok: true');
    assert.ok(responseData.message.includes('Ruangan 2 - VIP 2') || responseData.data?.message?.includes('Ruangan 2 - VIP 2'), 'Pesan harus menyebut nama ruangan');

    // Verifikasi sync_outbox dipanggil
    const outboxCalls = queries.filter(q => q.text.includes('INSERT INTO sync_outbox'));
    assert.ok(outboxCalls.length >= 2, 'Wajib ada sinkronisasi outbox untuk room_sessions dan rooms');

    // Verifikasi rooms diubah ke available
    const roomUpdate = queries.find(q => q.text.includes('UPDATE rooms') && q.text.includes("status = 'available'"));
    assert.ok(roomUpdate, 'Status room wajib diupdate menjadi available');

    console.log('  ✓ PASS: Sesi paid_waiting_start berhasil dibatalkan, status kamar kembali available, dan query PostgreSQL valid');
  } finally {
    db.pool.connect = originalConnect;
    db.query = originalQuery;
  }
}

async function testCancelRejectShortReason() {
  console.log('Test 2: Menolak pembatalan dengan alasan kurang dari 5 karakter...');
  const originalConnect = db.pool.connect;
  const originalQuery = db.query;

  const mockClient = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {}
  };
  db.pool.connect = async () => mockClient;
  db.query = async () => ({ rows: [], rowCount: 0 });

  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; return data; },
    status: () => mockRes
  };

  try {
    await cancelBooking({}, mockRes, {
      room_id: 'ROOM-2',
      reason: 'test', // < 5 karakter
      cashier_name: 'Kasir'
    });

    assert.ok(responseData, 'Response data harus ada');
    assert.strictEqual(responseData.ok, false, 'Harus ditolak karena alasan terlalu pendek');
    assert.ok(responseData.error.includes('minimal 5 karakter'), 'Error message harus menyatakan minimal 5 karakter');
    console.log('  ✓ PASS: Ditolak dengan pesan validasi minimal 5 karakter');
  } finally {
    db.pool.connect = originalConnect;
    db.query = originalQuery;
  }
}

async function testCancelRejectOccupiedRoom() {
  console.log('Test 3: Menolak pembatalan untuk kamar yang sedang aktif (occupied)...');
  const originalConnect = db.pool.connect;
  const originalQuery = db.query;

  const mockRoom = {
    room_id: 'ROOM-4',
    room_name: 'Ruangan 4 - VIP 4',
    status: 'occupied',
    start_time: new Date().toISOString()
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
  db.query = async () => ({ rows: [], rowCount: 0 });

  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; return data; },
    status: () => mockRes
  };

  try {
    await cancelBooking({}, mockRes, {
      room_id: 'ROOM-4',
      reason: 'Mau batalkan sesi aktif',
      cashier_name: 'Kasir'
    });

    assert.ok(responseData, 'Response data harus ada');
    assert.strictEqual(responseData.ok, false, 'Harus ditolak untuk kamar occupied');
    assert.ok(responseData.error.includes('Hanya kamar berstatus booking atau menunggu mulai'), 'Pesan error harus tepat');
    console.log('  ✓ PASS: Pembatalan kamar occupied ditolak dengan tepat');
  } finally {
    db.pool.connect = originalConnect;
    db.query = originalQuery;
  }
}

async function testCancelBookedRoom() {
  console.log('Test 4: Membatalkan kamar berstatus booked...');
  const originalConnect = db.pool.connect;
  const originalQuery = db.query;
  const queries = [];

  const mockRoom = {
    room_id: 'ROOM-3',
    room_name: 'Ruangan 3 - VIP 3',
    status: 'booked',
    start_time: null
  };

  const mockHandler = async (sql, params = []) => {
    const text = String(sql);
    queries.push({ text, params });
    if (text.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
      return { rows: [mockRoom], rowCount: 1 };
    }
    if (text.includes('UPDATE room_sessions')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('UPDATE fnb_orders')) {
      return { rowCount: 0 };
    }
    if (text.includes('UPDATE rooms')) {
      return { rowCount: 1 };
    }
    if (text.includes('operational_audit_events')) {
      return { rows: [{ event_id: 'OAE-124' }], rowCount: 1 };
    }
    if (text.includes('sync_outbox')) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const mockClient = {
    query: mockHandler,
    release: () => {}
  };
  db.pool.connect = async () => mockClient;
  db.query = mockHandler;

  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; return data; },
    status: () => mockRes
  };

  try {
    await cancelBooking({}, mockRes, {
      room_id: 'ROOM-3',
      reason: 'Pelanggan membatalkan reservasi',
      cashier_name: 'Kasir'
    });

    assert.strictEqual(responseData.ok, true, 'Status respons harus ok: true');
    console.log('  ✓ PASS: Status booked berhasil dibatalkan');
  } finally {
    db.pool.connect = originalConnect;
    db.query = originalQuery;
  }
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Cancel Booking Tests FAILED:', err);
      process.exit(1);
    });
}
