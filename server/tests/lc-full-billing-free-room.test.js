const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { extendSession, adjustSessionTime, closeSession } = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running LC Full Billing & Free Room Isolation Tests...');

  await testExtendSessionSyncsLcWorkLogs();
  await testAdjustSessionTimeSyncsLcWorkLogs();
    await testCloseSessionLcPaidFullDespiteFreeRoom();
    await testCloseSessionRespectsCustomLcDuration();
    await testAppJsAndAppsScriptConsistency();

  console.log('✅ ALL LC Full Billing & Free Room Tests PASSED SUCCESSFULLY!');
}

async function testExtendSessionSyncsLcWorkLogs() {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  try {
    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ sql: text, params });

        if (text.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              status: 'occupied',
              start_time: new Date('2026-09-10T20:00:00Z'),
              booked_duration_minutes: 180,
              scheduled_end_time: new Date('2026-09-10T23:00:00Z'),
              rate_per_hour: 135000
            }]
          };
        }

        if (text.includes('SELECT log_id, duration_minutes, rate_per_hour, billing_source')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LCW-TEST-1',
              duration_minutes: 180,
              rate_per_hour: 135000,
              billing_source: 'regular'
            }]
          };
        }

        return { rowCount: 1, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;

    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await extendSession(req, res, {
      room_id: 'ROOM-05',
      add_minutes: 120,
      cashier_name: 'Kasir Test',
      note: 'Tamu extend 2 jam'
    });

    assert.ok(responseData, 'Response harus ada');
    assert.strictEqual(responseData.ok, true);

    const updateLcQuery = queries.find(q => q.sql.includes('UPDATE lc_work_logs') && q.sql.includes('SET duration_minutes = $1'));
    assert.ok(updateLcQuery, 'Query UPDATE lc_work_logs wajib dieksekusi pada extendSession');
    assert.strictEqual(updateLcQuery.params[0], 300, 'Durasi LC harus bertambah dari 180 + 120 = 300 menit (5 jam)');
    assert.strictEqual(updateLcQuery.params[1], 675000, 'Rate LC harus 5 jam x Rp 135.000 = Rp 675.000');
    assert.strictEqual(updateLcQuery.params[2], 675000, 'customer_charge_amount harus Rp 675.000');

    console.log('  ✓ extendSession berhasil memperpanjang durasi dan rate LC aktif dari 180m ke 300m (Rp 675.000)');
  } finally {
    db.pool.connect = originalPoolConnect;
  }
}

async function testAdjustSessionTimeSyncsLcWorkLogs() {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  try {
    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ sql: text, params });

        if (text.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              status: 'occupied',
              start_time: new Date('2026-09-10T20:00:00Z'),
              booked_duration_minutes: 120,
              scheduled_end_time: new Date('2026-09-10T22:00:00Z'),
              rate_per_hour: 135000
            }]
          };
        }

        if (text.includes('SELECT * FROM room_sessions')) {
          return {
            rowCount: 1,
            rows: [{
              session_id: 'SES-TEST-1',
              room_id: 'ROOM-05',
              booked_duration_minutes: 120,
              rate_per_hour: 135000,
              booking_mode: 'regular'
            }]
          };
        }

        if (text.includes('SELECT log_id, duration_minutes, rate_per_hour, billing_source')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LCW-TEST-ADJUST',
              duration_minutes: 120,
              rate_per_hour: 135000,
              billing_source: 'regular'
            }]
          };
        }

        return { rowCount: 1, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;

    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await adjustSessionTime(req, res, {
      room_id: 'ROOM-05',
      new_start_time: '20:00',
      duration_minutes: 180,
      reason: 'Koreksi jam dan durasi sesi',
      cashier_name: 'Kasir Test'
    });

    assert.ok(responseData, 'Response harus ada');
    assert.strictEqual(responseData.ok, true);

    const updateLcQuery = queries.find(q => q.sql.includes('UPDATE lc_work_logs') && q.sql.includes('SET duration_minutes = $1'));
    assert.ok(updateLcQuery, 'Query UPDATE lc_work_logs wajib dieksekusi pada adjustSessionTime dengan durationDiff');
    assert.strictEqual(updateLcQuery.params[0], 180, 'Durasi LC harus disesuaikan menjadi 180 menit (+60m)');
    assert.strictEqual(updateLcQuery.params[1], 405000, 'Rate LC harus 3 jam x Rp 135.000 = Rp 405.000');

    console.log('  ✓ adjustSessionTime berhasil menyesuaikan durasi dan rate LC aktif secara proporsional');
  } finally {
    db.pool.connect = originalPoolConnect;
  }
}

async function testCloseSessionLcPaidFullDespiteFreeRoom() {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  const now = new Date();
  const sessionStartTime = new Date(now.getTime() - 300 * 60 * 1000);
  try {
    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ sql: text, params });

        if (text.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              status: 'occupied',
              start_time: sessionStartTime,
              booked_duration_minutes: 300,
              scheduled_end_time: now,
              rate_per_hour: 135000
            }]
          };
        }

        if (text.includes('SELECT * FROM room_sessions')) {
          return {
            rowCount: 1,
            rows: [{
              session_id: 'SES-TEST-FULL-LC',
              room_id: 'ROOM-05',
              booked_duration_minutes: 300,
              billable_room_minutes: 240, // 300m - 60m Free Room
              rate_per_hour: 135000,
              booking_mode: 'regular'
            }]
          };
        }

        if (text.includes('SELECT * FROM room_session_segments')) {
          return {
            rowCount: 1,
            rows: [{
              segment_id: 'SEG-1',
              session_id: 'SES-TEST-FULL-LC',
              sequence_no: 1,
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              rate_per_hour: 135000,
              started_at: sessionStartTime,
              ended_at: null,
              allocated_minutes: null
            }]
          };
        }

        if (text.includes('SELECT order_id, order_total FROM fnb_orders')) {
          return { rowCount: 0, rows: [] };
        }

        if (text.includes('SELECT') && text.includes('FROM lc_work_logs')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LCW-TEST-FULL-1',
              session_id: 'SES-TEST-FULL-LC',
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              lc_id: 'LC-01',
              lc_name: 'Bella',
              duration_minutes: 300, // LC bertugas penuh 300m (5 jam)
              rate_per_hour: 135000,
              rate: 675000,
              status: 'active',
              created_at: sessionStartTime
            }]
          };
        }

        return { rowCount: 1, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;

    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await closeSession(req, res, {
      room_id: 'ROOM-05',
      cashier_name: 'Kasir Test'
    });

    assert.ok(responseData, 'Response harus ada');
    assert.strictEqual(responseData.ok, true);

    const insertTxQuery = queries.find(q => q.sql.includes('INSERT INTO transactions'));
    assert.ok(insertTxQuery, 'Query INSERT INTO transactions wajib dieksekusi');

    // Kolom transactions: room_total (params[7]), fnb_total (params[8]), lc_total (params[9]), grand_total (params[10])
    // billable_room_minutes (params[21]), free_room_minutes (params[22])
    const roomTotal = insertTxQuery.params[7];
    const lcTotal = insertTxQuery.params[9];
    const grandTotal = insertTxQuery.params[10];
    const billableRoomMinutes = insertTxQuery.params[21];
    const freeRoomMinutes = insertTxQuery.params[22];

    assert.strictEqual(freeRoomMinutes, 60, 'Free Room harus 60 menit (1 jam)');
    assert.strictEqual(billableRoomMinutes, 240, 'Durasi Room Ditagihkan harus 240 menit (4 jam)');
    assert.strictEqual(roomTotal, 540000, 'Biaya sewa kamar harus 4 jam x Rp 135.000 = Rp 540.000');
    assert.strictEqual(lcTotal, 675000, 'Jasa LC WAJIB dibayar penuh 5 jam x Rp 135.000 = Rp 675.000, TIDAK terpotong oleh Free Room');
    assert.strictEqual(grandTotal, 540000 + 675000, 'Grand total harus Rp 1.215.000');

    console.log('  ✓ closeSession berhasil memastikan LC dibayar PENUH (Rp 675.000 / 5 jam) dan Free Room hanya memotong sewa room (Rp 540.000 / 4 jam)');
  } finally {
    db.pool.connect = originalPoolConnect;
  }
}

async function testCloseSessionRespectsCustomLcDuration() {
  const originalPoolConnect = db.pool.connect;
  const queries = [];
  const now = new Date();
  const sessionStartTime = new Date(now.getTime() - 240 * 60 * 1000);
  try {
    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ sql: text, params });

        if (text.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              room_id: 'ROOM-VIP4',
              room_name: 'VIP 4',
              status: 'occupied',
              start_time: sessionStartTime,
              booked_duration_minutes: 240, // 4 jam
              scheduled_end_time: now,
              rate_per_hour: 135000
            }]
          };
        }

        if (text.includes('SELECT * FROM room_sessions')) {
          return {
            rowCount: 1,
            rows: [{
              session_id: 'SES-VIP4-TEST',
              room_id: 'ROOM-VIP4',
              booked_duration_minutes: 240,
              billable_room_minutes: 240,
              rate_per_hour: 135000,
              booking_mode: 'regular'
            }]
          };
        }

        if (text.includes('SELECT * FROM room_session_segments')) {
          return {
            rowCount: 1,
            rows: [{
              segment_id: 'SEG-VIP4-1',
              session_id: 'SES-VIP4-TEST',
              sequence_no: 1,
              room_id: 'ROOM-VIP4',
              room_name: 'VIP 4',
              rate_per_hour: 135000,
              started_at: sessionStartTime,
              ended_at: null,
              allocated_minutes: null
            }]
          };
        }

        if (text.includes('SELECT order_id, order_total FROM fnb_orders')) {
          return { rowCount: 0, rows: [] };
        }

        if (text.includes('SELECT') && text.includes('FROM lc_work_logs')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LCW-VIP4-LENI',
              session_id: 'SES-VIP4-TEST',
              room_id: 'ROOM-VIP4',
              room_name: 'VIP 4',
              lc_id: 'LC-LENI',
              lc_name: 'Leni',
              duration_minutes: 180, // Durasi LC diubah kasir di card jadi 3 jam (180 menit)
              rate_per_hour: 135000,
              rate: 405000,
              status: 'active',
              created_at: sessionStartTime
            }]
          };
        }

        return { rowCount: 1, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;

    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await closeSession(req, res, {
      room_id: 'ROOM-VIP4',
      cashier_name: 'Kasir VIP'
    });

    assert.ok(responseData, 'Response harus ada');
    assert.strictEqual(responseData.ok, true);

    const insertTxQuery = queries.find(q => q.sql.includes('INSERT INTO transactions'));
    assert.ok(insertTxQuery, 'Query INSERT INTO transactions wajib dieksekusi');

    const roomTotal = insertTxQuery.params[7];
    const lcTotal = insertTxQuery.params[9];
    const grandTotal = insertTxQuery.params[10];

    assert.strictEqual(roomTotal, 540000, 'Biaya room 4 jam x Rp 135.000 = Rp 540.000');
    assert.strictEqual(lcTotal, 405000, 'Jasa LC WAJIB menghormati durasi kustom 3 jam x Rp 135.000 = Rp 405.000 (TIDAK tertimpa ke 4 jam)');
    assert.strictEqual(grandTotal, 540000 + 405000, 'Grand total harus Rp 945.000');

    // Pastikan receipt detail untuk LC Leni tetap 180 menit (3 jam)
    const receiptLcItems = responseData.lc_details?.customer_items || responseData.lc_details?.items || [];
    assert.strictEqual(receiptLcItems.length, 1, 'Harus ada 1 item LC pada receipt detail');
    assert.strictEqual(Number(receiptLcItems[0].duration_minutes), 180, 'Durasi LC di receipt wajib 180 menit (3 jam)');
    assert.strictEqual(Number(receiptLcItems[0].customer_charge_amount), 405000, 'Tagihan LC di receipt wajib Rp 405.000');

    // Pastikan UPDATE lc_work_logs menyimpan duration_minutes: 180
    const updateLcQuery = queries.find(q => q.sql.includes('UPDATE lc_work_logs') && q.sql.includes('duration_minutes = data.duration_minutes'));
    assert.ok(updateLcQuery, 'Query UPDATE lc_work_logs wajib mengupdate duration_minutes');
    const updateRecords = JSON.parse(updateLcQuery.params[3]);
    assert.strictEqual(updateRecords[0].duration_minutes, 180, 'duration_minutes yang disimpan ke lc_work_logs harus 180');
    assert.strictEqual(updateRecords[0].rate, 405000, 'rate yang disimpan ke lc_work_logs harus 405000');

    console.log('  ✓ closeSession BERHASIL menghormati durasi kustom LC (3 jam / Rp 405.000) dan tidak menimpa ke durasi room (4 jam)');
  } finally {
    db.pool.connect = originalPoolConnect;
  }
}

async function testAppJsAndAppsScriptConsistency() {
  const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf8');
  assert.ok(appJs.includes('selectedLcDurationsForRoom[roomId][lcId] ='), 'app.js wajib sinkronisasi selectedLcDurationsForRoom saat extend');
  assert.ok(appJs.includes('Jasa LC (Penuh)'), 'app.js wajib membedakan label Jasa LC saat transaksi memiliki Free Room');

  const codeGs = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
  assert.ok(codeGs.includes('Otomatis perpanjang durasi dan rate LC aktif saat room di-extend'), 'Code.gs wajib auto-extend LC pada extendSession_');
  assert.ok(codeGs.includes('Hak LC selalu dibayar penuh berdasarkan work log dan durasi riil sesi'), 'Code.gs wajib menjamin LC dibayar penuh pada closeSession_');

  console.log('  ✓ app.js dan Code.gs terverifikasi konsisten dalam sinkronisasi durasi LC dan perlindungan Free Room');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
