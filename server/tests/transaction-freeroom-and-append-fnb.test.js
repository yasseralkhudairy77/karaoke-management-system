const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const {
  correctTransactionFreeRoom,
  appendFnbToUnpaidTransaction
} = require('../src/controllers/transactionsController');

async function runTests() {
  console.log('🧪 Running Transaction Free Room Package Correction & Append F&B Tests...\n');

  // Test 1: Frontend Code & Contract Verification
  console.log('Test 1: Verifying frontend UI & contracts in js/app.js...');
  const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf-8');

  assert(appJs.includes('open-append-fnb-transaction'), 'js/app.js harus memiliki action open-append-fnb-transaction');
  assert(appJs.includes('function openAppendFnbTransactionModal'), 'js/app.js harus memiliki fungsi openAppendFnbTransactionModal');
  assert(appJs.includes('async function executeAppendFnbToTransaction'), 'js/app.js harus memiliki fungsi executeAppendFnbToTransaction');
  assert(appJs.includes('action === "open-append-fnb-transaction"'), 'js/app.js click listener harus menangani open-append-fnb-transaction');
  assert(appJs.includes('0 menit (Hapus Free Room / Tanpa Potongan)'), 'js/app.js harus memiliki opsi 0 menit hapus free room');

  console.log('  ✓ PASS: Frontend contracts verified.\n');

  // Test 2: API Route Registration
  console.log('Test 2: Verifying API route registration in server/src/routes/api.js...');
  const apiJs = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf-8');
  assert(apiJs.includes("case 'appendFnbToUnpaidTransaction':"), 'api.js harus mendaftarkan action appendFnbToUnpaidTransaction');
  assert(apiJs.includes("case 'correctTransactionFreeRoom':"), 'api.js harus mendaftarkan action correctTransactionFreeRoom');
  console.log('  ✓ PASS: API route registered.\n');

  // Test 3: Backend Controller Unit Testing with Mocked DB
  console.log('Test 3: Testing correctTransactionFreeRoom on Package Transaction (VIP 2 Case)...');
  const originalPoolConnect = db.pool.connect;
  const originalQuery = db.query;

  // Mock data representing VIP 2 in the user's screenshot
  const mockVip2Transaction = {
    transaction_id: 'TRX-1789249721907',
    room_id: '2',
    room_name: 'Ruangan 2 - VIP 2',
    duration_minutes: 240,
    rate_per_hour: 135000,
    room_total: 650000,
    package_id: 'PKG-CM-4H',
    package_name: 'PAKET CAPTAIN MORGAN APPLE 4 JAM',
    package_total: 650000,
    booking_mode: 'package',
    free_room_minutes: 240,
    room_discount_amount: 540000,
    fnb_total: 193000,
    lc_total: 520000,
    grand_total: 1363000,
    payment_method: 'cash',
    payment_status: 'unpaid',
    cash_amount: 1363000,
    transfer_amount: 0,
    promo_discount: 0,
    manual_discount_room: 0,
    manual_discount_fnb: 0
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('FROM employees') && text.includes("role = 'owner'")) {
        return {
          rows: [{
            employee_id: 'EMP-OWNER',
            employee_name: 'Manager 1 (Owner)',
            role: 'owner',
            pin: '123456',
            pin_hash: null
          }],
          rowCount: 1
        };
      }

      if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
        return { rows: [{ ...mockVip2Transaction }], rowCount: 1 };
      }

      if (text.includes('SELECT rate_per_hour FROM rooms WHERE room_id = $1')) {
        return { rows: [{ rate_per_hour: 135000 }], rowCount: 1 };
      }

      if (text.includes('UPDATE transactions') && text.includes('free_room_minutes = $3')) {
        mockVip2Transaction.booking_mode = params[0];
        mockVip2Transaction.billable_room_minutes = params[1];
        mockVip2Transaction.free_room_minutes = params[2];
        mockVip2Transaction.room_discount_amount = params[3];
        mockVip2Transaction.room_total = params[4];
        mockVip2Transaction.grand_total = params[5];
        mockVip2Transaction.cash_amount = params[6];
        mockVip2Transaction.transfer_amount = params[7];
        return { rows: [{ ...mockVip2Transaction }], rowCount: 1 };
      }

      if (text.includes('INSERT INTO transaction_correction_logs')) {
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('INSERT INTO operational_audit_events')) {
        return { rows: [{ event_id: 'AUDIT-1' }], rowCount: 1 };
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
    // 3a. Case: Menurunkan Free Room menjadi 0 menit (Hapus Free Room)
    // Biaya Paket: 650.000, LC: 520.000, FNB: 193.000 -> Grand Total = 1.363.000
    responseData = null;
    await correctTransactionFreeRoom({}, res, {
      transaction_id: 'TRX-1789249721907',
      free_room_minutes: 0,
      reason: 'Koreksi hapus free room karena operator salah input',
      admin_pin: '123456'
    });

    assert.strictEqual(responseData.ok, true, 'Koreksi free room menjadi 0 harus sukses');
    assert.strictEqual(mockVip2Transaction.free_room_minutes, 0, 'Free room minutes harus 0');
    assert.strictEqual(mockVip2Transaction.room_discount_amount, 0, 'Diskon room harus 0');
    assert.strictEqual(mockVip2Transaction.room_total, 650000, 'Room total harus 650.000');
    assert.strictEqual(mockVip2Transaction.grand_total, 1363000, 'Grand total harus 1.363.000');
    assert.strictEqual(mockVip2Transaction.booking_mode, 'package', 'Booking mode harus tetap package');
    console.log('  ✓ PASS: Koreksi Free Room -> 0 menit (Hapus Free Room) sukses.');

    // 3b. Case: Menurunkan Free Room menjadi 1 jam (60 menit)
    // Diskon 1x 135.000 = 135.000. Biaya Paket bersih = 650.000 - 135.000 = 515.000
    // Grand Total = 515.000 + 520.000 + 193.000 = 1.228.000
    responseData = null;
    await correctTransactionFreeRoom({}, res, {
      transaction_id: 'TRX-1789249721907',
      free_room_minutes: 60,
      reason: 'Koreksi free room diturunkan jadi 1 jam',
      admin_pin: '123456'
    });

    assert.strictEqual(responseData.ok, true, 'Koreksi free room 1 jam harus sukses');
    assert.strictEqual(mockVip2Transaction.free_room_minutes, 60, 'Free room minutes harus 60');
    assert.strictEqual(mockVip2Transaction.room_discount_amount, 135000, 'Diskon room harus 135.000');
    assert.strictEqual(mockVip2Transaction.room_total, 515000, 'Room total harus 515.000');
    assert.strictEqual(mockVip2Transaction.grand_total, 1228000, 'Grand total harus 1.228.000');
    console.log('  ✓ PASS: Koreksi Free Room -> 1 jam (Rp 135.000) sukses, total akhir turun ke Rp 1.228.000.');

    // 3c. Case: Menurunkan Free Room menjadi 2 jam (120 menit)
    // Diskon 2x 135.000 = 270.000. Biaya Paket bersih = 650.000 - 270.000 = 380.000
    // Grand Total = 380.000 + 520.000 + 193.000 = 1.093.000
    responseData = null;
    await correctTransactionFreeRoom({}, res, {
      transaction_id: 'TRX-1789249721907',
      free_room_minutes: 120,
      reason: 'Koreksi free room diturunkan jadi 2 jam',
      admin_pin: '123456'
    });

    assert.strictEqual(responseData.ok, true, 'Koreksi free room 2 jam harus sukses');
    assert.strictEqual(mockVip2Transaction.free_room_minutes, 120, 'Free room minutes harus 120');
    assert.strictEqual(mockVip2Transaction.room_discount_amount, 270000, 'Diskon room harus 270.000');
    assert.strictEqual(mockVip2Transaction.room_total, 380000, 'Room total harus 380.000');
    assert.strictEqual(mockVip2Transaction.grand_total, 1093000, 'Grand total harus 1.093.000');
    console.log('  ✓ PASS: Koreksi Free Room -> 2 jam (Rp 270.000) sukses, total akhir turun ke Rp 1.093.000.');

    // Test 4: Testing appendFnbToUnpaidTransaction (Susulkan Rokok ke Transaksi VIP 2)
    console.log('\nTest 4: Testing appendFnbToUnpaidTransaction (Susulkan Rokok ke VIP 2)...');
    const mockInventoryRokok = {
      stock_item_id: 'INV-ROKOK-1',
      stock_qty: 50
    };

    const mockMenuRokok = {
      menu_id: 'MENU-ESSE-1',
      menu_name: 'Esse Double Click',
      category: 'Rokok',
      price: 65000,
      stock_tracking: 'yes',
      stock_item_id: 'INV-ROKOK-1',
      stock_qty_per_unit: 1
    };

    let insertedFnbOrder = null;
    let insertedFnbItems = [];
    let updatedTxFnb = null;

    mockClient.query = async (sql, params = []) => {
      const text = String(sql).trim();

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
        return { rows: [{ ...mockVip2Transaction }], rowCount: 1 };
      }

      if (text.includes('INSERT INTO fnb_orders')) {
        insertedFnbOrder = { order_id: params[0], order_total: 0 };
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('SELECT * FROM menu WHERE menu_id = $1')) {
        return { rows: [mockMenuRokok], rowCount: 1 };
      }

      if (text.includes('INSERT INTO fnb_order_items')) {
        insertedFnbItems.push({ menu_id: params[2], qty: params[6], subtotal: params[7] });
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
        return { rows: [mockInventoryRokok], rowCount: 1 };
      }

      if (text.includes('UPDATE inventory SET stock_qty = $1')) {
        mockInventoryRokok.stock_qty = params[0];
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('INSERT INTO stock_movements')) {
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('UPDATE fnb_orders SET order_total = $1')) {
        insertedFnbOrder.order_total = params[0];
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('UPDATE transactions') && text.includes('fnb_order_ids = $1')) {
        mockVip2Transaction.fnb_order_ids = params[0];
        mockVip2Transaction.fnb_total = params[1];
        mockVip2Transaction.grand_total = params[2];
        updatedTxFnb = { ...mockVip2Transaction };
        return { rows: [updatedTxFnb], rowCount: 1 };
      }

      if (text.includes('INSERT INTO operational_audit_events')) {
        return { rows: [{ event_id: 'AUDIT-2' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    };

    const initialGrandTotal = mockVip2Transaction.grand_total; // 1.093.000
    const initialFnbTotal = mockVip2Transaction.fnb_total; // 193.000
    const initialStock = mockInventoryRokok.stock_qty; // 50

    responseData = null;
    await appendFnbToUnpaidTransaction({}, res, {
      transaction_id: 'TRX-1789249721907',
      items: [{ menu_id: 'MENU-ESSE-1', quantity: 1 }],
      note: 'Rokok susulan konsumen meja VIP 2',
      cashier_name: 'Manager 1 (Owner)'
    });

    assert.strictEqual(responseData.ok, true, 'Susulkan F&B harus berhasil');
    assert.strictEqual(insertedFnbItems.length, 1, '1 item harus di-insert');
    assert.strictEqual(insertedFnbItems[0].subtotal, 65000, 'Subtotal rokok harus 65.000');
    assert.strictEqual(mockInventoryRokok.stock_qty, initialStock - 1, 'Stok rokok harus terpotong 1 bungkus');
    assert.strictEqual(updatedTxFnb.fnb_total, initialFnbTotal + 65000, 'Total F&B transaksi harus bertambah 65.000');
    assert.strictEqual(updatedTxFnb.grand_total, initialGrandTotal + 65000, 'Grand total transaksi harus bertambah 65.000');
    console.log('  ✓ PASS: Susulan rokok (Rp 65.000) sukses, stok terpotong 1, total F&B dan Grand Total transaksi bertambah.');

  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalQuery;
  }

  console.log('\n🎉 ALL FREE ROOM CORRECTION & APPEND F&B TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
