const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const {
  extendSession,
  finalizeAndPriceRoomSegments,
  closeSession
} = require('../src/controllers/roomsController');

async function runTests() {
  console.log('🧪 Running Package Overtime Billing & Free Room Tests...\n');

  // Test 1: Code Contract Verification
  console.log('Test 1: Verifying backend logic contracts in roomsController.js...');
  const controllerCode = fs.readFileSync(path.join(__dirname, '../src/controllers/roomsController.js'), 'utf-8');

  assert(controllerCode.includes("WHEN booking_mode = 'package' THEN GREATEST(0, $1 - COALESCE(package_included_minutes, 0))"),
    'extendSession harus menghitung billable_room_minutes untuk booking_mode package');
  assert(controllerCode.includes('extraPackageRoomCharge'),
    'finalizeAndPriceRoomSegments harus menghitung extraPackageRoomCharge untuk overtime paket');
  assert(controllerCode.includes("const isPkgSession = bookingMode === 'package';"),
    'closeSession harus mengidentifikasi isPkgSession secara akurat');

  console.log('  ✓ PASS: Controller contracts verified.\n');

  // Test 2: Unit Testing finalizeAndPriceRoomSegments with Package Overtime
  console.log('Test 2: Testing finalizeAndPriceRoomSegments with 2-hour package extended to 4 hours...');
  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();
      if (text.includes('SELECT * FROM room_session_segments')) {
        return {
          rows: [
            {
              segment_id: 'SEG-1',
              session_id: 'SES-VIP2',
              sequence_no: 1,
              room_id: '2',
              room_name: 'Ruangan 2 - VIP 2',
              rate_per_hour: 135000,
              allocated_minutes: null,
              ended_at: null
            }
          ],
          rowCount: 1
        };
      }
      if (text.includes('UPDATE room_session_segments')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const mockSession = {
    session_id: 'SES-VIP2',
    room_id: '2',
    booking_mode: 'package',
    package_id: 'PKG-CM-2H',
    package_name: 'PAKET CAPTAIN MORGAN APPLE 2 JAM',
    package_total: 650000,
    package_included_minutes: 120, // 2 jam gratis bawaan paket
    booked_duration_minutes: 240,  // Total 4 jam (tambah 2 jam)
    rate_per_hour: 135000,
    start_time: new Date('2026-09-13T01:00:00Z'),
    note: 'package_id=PKG-CM-2H | package_name=PAKET CAPTAIN MORGAN APPLE 2 JAM | package_total=650000'
  };

  const mockRoom = {
    room_id: '2',
    room_name: 'Ruangan 2 - VIP 2',
    rate_per_hour: 135000,
    booked_duration_minutes: 240,
    start_time: new Date('2026-09-13T01:00:00Z')
  };

  const endTime = new Date('2026-09-13T05:00:00Z'); // 4 jam kemudian

  const pricingResult = await finalizeAndPriceRoomSegments(mockClient, mockSession, mockRoom, endTime);

  console.log('Pricing Result:', {
    totalMinutes: pricingResult.totalMinutes,
    packageIncludedMinutes: pricingResult.packageIncludedMinutes,
    extraPackageMinutes: pricingResult.extraPackageMinutes,
    extraPackageRoomCharge: pricingResult.extraPackageRoomCharge,
    roomTotal: pricingResult.roomTotal,
    billableMinutes: pricingResult.billableMinutes,
    freeMinutes: pricingResult.freeMinutes
  });

  assert.strictEqual(pricingResult.totalMinutes, 240, 'Total durasi harus 240 menit (4 jam)');
  assert.strictEqual(pricingResult.packageIncludedMinutes, 120, 'Durasi paket bawaan harus 120 menit (2 jam)');
  assert.strictEqual(pricingResult.extraPackageMinutes, 120, 'Overtime paket harus 120 menit (2 jam)');
  assert.strictEqual(pricingResult.extraPackageRoomCharge, 270000, 'Biaya overtime harus 2 jam x 135.000 = Rp 270.000');
  assert.strictEqual(pricingResult.roomTotal, 920000, 'Total Room/Paket harus Rp 650.000 + Rp 270.000 = Rp 920.000');
  assert.strictEqual(pricingResult.billableMinutes, 120, 'Billable minutes harus 120 menit (2 jam tambahan)');
  assert.strictEqual(pricingResult.freeMinutes, 120, 'Free minutes hanya 120 menit (2 jam bawaan paket)');
  console.log('  ✓ PASS: finalizeAndPriceRoomSegments properly bills 2 hours extra and keeps 2 hours free room.\n');

  // Test 3: Unit Testing closeSession with Package Overtime
  console.log('Test 3: Testing closeSession transaction persistence with Package Overtime...');
  const originalPoolConnect = db.pool.connect;
  const originalQuery = db.query;

  let insertedTransaction = null;

  const mockDbClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('FROM rooms') && text.includes('WHERE room_id = $1')) {
        return { rows: [{ ...mockRoom, status: 'occupied' }], rowCount: 1 };
      }
      if (text.includes('FROM room_sessions') && text.includes('status IN')) {
        return { rows: [{ ...mockSession, status: 'active', billable_room_minutes: 120 }], rowCount: 1 };
      }
      if (text.includes('SELECT * FROM room_session_segments')) {
        return {
          rows: [{
            segment_id: 'SEG-1', session_id: 'SES-VIP2', sequence_no: 1,
            room_id: '2', rate_per_hour: 135000, allocated_minutes: null, ended_at: null
          }],
          rowCount: 1
        };
      }
      if (text.includes('UPDATE room_session_segments')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('SELECT order_id, order_total FROM fnb_orders')) {
        return { rows: [{ order_id: 'FNB-1', order_total: 193000 }], rowCount: 1 };
      }
      if (text.includes('FROM package_master')) {
        return { rows: [{ package_id: 'PKG-CM-2H', included_lc_count: 0, included_lc_duration_minutes: 0 }], rowCount: 1 };
      }
      if (text.includes('FROM lc_work_logs')) {
        return {
          rows: [{
            log_id: 'LC-1', session_id: 'SES-VIP2', room_id: '2', lc_id: 'LC-DEWI',
            lc_name: 'Dewi', duration_minutes: 240, rate_per_hour: 130000, rate: 520000,
            customer_charge_amount: 520000, payable_amount: 520000, billing_source: 'regular',
            status: 'active', created_at: new Date()
          }],
          rowCount: 1
        };
      }
      if (text.includes('UPDATE fnb_orders') || text.includes('UPDATE lc_work_logs') || text.includes('UPDATE rooms') || text.includes('UPDATE room_sessions')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('INSERT INTO sync_outbox')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('INSERT INTO transactions')) {
        insertedTransaction = {
          transaction_id: params[0],
          room_id: params[1],
          room_name: params[2],
          duration_minutes: params[5],
          rate_per_hour: params[6],
          room_total: params[7],
          fnb_total: params[8],
          lc_total: params[9],
          grand_total: params[10],
          booking_mode: params[15],
          package_id: params[16],
          package_name: params[17],
          package_total: params[18],
          billable_room_minutes: params[21],
          free_room_minutes: params[22],
          room_discount_amount: params[23]
        };
        return { rows: [insertedTransaction], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockDbClient;
  db.query = async (sql, params) => mockDbClient.query(sql, params);

  try {
    let resData = null;
    const res = {
      json: (data) => { resData = data; return data; },
      status: () => res
    };

    await closeSession({}, res, { room_id: '2', cashier_name: 'Kasir' });

    assert.strictEqual(resData.ok, true, 'closeSession harus berhasil');
    assert.ok(insertedTransaction, 'Transaksi harus tersimpan ke database');

    console.log('Saved Transaction:', {
      duration_minutes: insertedTransaction.duration_minutes,
      room_total: insertedTransaction.room_total,
      billable_room_minutes: insertedTransaction.billable_room_minutes,
      free_room_minutes: insertedTransaction.free_room_minutes,
      room_discount_amount: insertedTransaction.room_discount_amount,
      grand_total: insertedTransaction.grand_total
    });

    assert.strictEqual(insertedTransaction.duration_minutes, 240, 'Durasi total transaksi harus 240 menit (4 jam)');
    assert.strictEqual(insertedTransaction.room_total, 920000, 'Biaya Room/Paket harus Rp 920.000 (Paket 650rb + Room 270rb)');
    assert.strictEqual(insertedTransaction.billable_room_minutes, 120, 'Billable room minutes harus 120 menit (2 jam)');
    assert.strictEqual(insertedTransaction.free_room_minutes, 120, 'Free room minutes hanya 120 menit (2 jam paket)');
    assert.strictEqual(insertedTransaction.room_discount_amount, 270000, 'Potongan free room paket harus Rp 270.000');
    // Grand Total: 920.000 (Room/Paket) + 193.000 (F&B) + 520.000 (LC) = 1.633.000
    assert.strictEqual(insertedTransaction.grand_total, 1633000, 'Grand total harus Rp 1.633.000');
    console.log('  ✓ PASS: closeSession accurately persists 2-hour package free room and bills 2 hours extra room charge.\n');
  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalQuery;
  }

  console.log('🎉 ALL PACKAGE OVERTIME BILLING TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
