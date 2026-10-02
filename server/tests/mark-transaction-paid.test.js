const assert = require('assert');
const db = require('../src/db');
const { markTransactionPaid } = require('../src/controllers/transactionsController');

async function runTests() {
  console.log('🧪 Running markTransactionPaid Comprehensive Tests...\n');

  // Test 1: VIP 8 Transaction (TRX-1789251343586) - 3 Hour Package
  console.log('Test 1: Testing markTransactionPaid for VIP 8 (TRX-1789251343586)...');

  const mockVip8Transaction = {
    transaction_id: 'TRX-1789251343586',
    room_id: '8',
    room_name: 'Ruangan 8 - VIP 8',
    duration_minutes: 180,
    rate_per_hour: 135000,
    room_total: 785000,
    package_id: 'PKG-CM-3H',
    package_name: 'PAKET CAPTAIN MORGAN APPLE 3 JAM',
    package_total: 650000,
    booking_mode: 'package',
    free_room_minutes: 180,
    room_discount_amount: 405000,
    fnb_total: 490000,
    lc_total: 1980000,
    grand_total: 3255000,
    payment_method: 'cash',
    payment_status: 'unpaid',
    cash_amount: 3255000,
    transfer_amount: 0,
    promo_code: '',
    promo_discount: 0
  };

  const originalPoolConnect = db.pool.connect;
  let updatedRow = null;
  let executedQueries = [];

  const mockDbClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();
      executedQueries.push({ text, params });

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('ALTER TABLE transactions')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
        return { rows: [{ ...mockVip8Transaction }], rowCount: 1 };
      }
      if (text.includes('UPDATE transactions') && text.includes('payment_status = \'paid\'')) {
        updatedRow = {
          ...mockVip8Transaction,
          payment_status: 'paid',
          payment_method: params[0],
          room_total: params[1],
          grand_total: params[4],
          cash_amount: params[5],
          transfer_amount: params[6]
        };
        return { rows: [updatedRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockDbClient;

  try {
    let resData = null;
    let resStatus = 200;
    const res = {
      json: (data) => { resData = data; return data; },
      status: (code) => { resStatus = code; return res; }
    };

    await markTransactionPaid({}, res, {
      transaction_id: 'TRX-1789251343586',
      payment_method: 'cash',
      promo_code: '',
      changed_by: 'Manager 1 (Owner)'
    });

    assert.strictEqual(resData?.ok, true, `markTransactionPaid harus berhasil. Error: ${resData?.error || resData?.message}`);
    assert.strictEqual(resData?.transaction?.payment_status, 'paid', 'Status pembayaran harus paid');
    assert.strictEqual(resData?.transaction?.grand_total, 3255000, 'Grand total VIP 8 harus Rp 3.255.000');
    console.log('  ✓ PASS: markTransactionPaid for VIP 8 succeeded without schema errors.\n');

    // Test 2: VIP 2 Transaction (TRX-1789249721907) - 2 Hour Package Overtime to 4 Hours
    console.log('Test 2: Testing markTransactionPaid for VIP 2 with overtime...');
    const mockVip2Transaction = {
      transaction_id: 'TRX-1789249721907',
      room_id: '2',
      room_name: 'Ruangan 2 - VIP 2',
      duration_minutes: 240,
      rate_per_hour: 135000,
      room_total: 650000,
      package_id: 'PKG-CM-2H',
      package_name: 'PAKET CAPTAIN MORGAN APPLE 2 JAM',
      package_total: 650000,
      booking_mode: 'package',
      free_room_minutes: 120,
      fnb_total: 253000,
      lc_total: 520000,
      grand_total: 1423000,
      payment_method: 'cash',
      payment_status: 'unpaid'
    };

    const mockVip2Client = {
      query: async (sql, params = []) => {
        const text = String(sql).trim();
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [], rowCount: 0 };
        if (text.includes('ALTER TABLE')) return { rows: [], rowCount: 0 };
        if (text.includes('FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
          return { rows: [{ ...mockVip2Transaction }], rowCount: 1 };
        }
        if (text.includes('UPDATE transactions') && text.includes('payment_status = \'paid\'')) {
          return {
            rows: [{
              ...mockVip2Transaction,
              payment_status: 'paid',
              room_total: params[1],
              grand_total: params[4],
              billable_room_minutes: 120,
              free_room_minutes: 120
            }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockVip2Client;

    let resDataVip2 = null;
    const resVip2 = {
      json: (data) => { resDataVip2 = data; return data; },
      status: () => resVip2
    };

    await markTransactionPaid({}, resVip2, {
      transaction_id: 'TRX-1789249721907',
      payment_method: 'cash',
      changed_by: 'Kasir'
    });

    assert.strictEqual(resDataVip2?.ok, true, 'markTransactionPaid VIP 2 harus sukses');
    assert.strictEqual(resDataVip2?.transaction?.room_total, 920000, 'Room total VIP 2 harus terkunci ke Rp 920.000 saat lunas');
    assert.strictEqual(resDataVip2?.transaction?.grand_total, 1693000, 'Grand total VIP 2 harus Rp 1.693.000 saat lunas');
    console.log('  ✓ PASS: markTransactionPaid for VIP 2 correctly locked overtime to Rp 1.693.000!\n');

    console.log('🎉 ALL MARK TRANSACTION PAID TESTS PASSED SUCCESSFULLY!');
  } finally {
    db.pool.connect = originalPoolConnect;
  }
}

runTests();
