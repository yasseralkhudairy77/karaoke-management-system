const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { voidOpenFnbOrderItem } = require('../src/controllers/fnbController');

async function runTests() {
  console.log('🧪 Running Void Open F&B Order Item Tests...\n');

  // Test 1: Frontend Code & Contract Verification
  console.log('Test 1: Verifying frontend UI & contracts in js/app.js & css/style.css...');
  const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(__dirname, '../../css/style.css'), 'utf-8');

  assert(appJs.includes('fnb-breakdown-void-btn'), 'js/app.js harus menyertakan fnb-breakdown-void-btn');
  assert(appJs.includes('dataset.action = "void-room-fnb-item"'), 'js/app.js harus memiliki action void-room-fnb-item');
  assert(appJs.includes('open-fnb-item-void-btn'), 'js/app.js harus menyertakan open-fnb-item-void-btn');
  assert(appJs.includes('dataset.action = "void-open-fnb-order-item"'), 'js/app.js harus memiliki action void-open-fnb-order-item');
  assert(appJs.includes('function requestVoidRoomFnbItem'), 'js/app.js harus memiliki fungsi requestVoidRoomFnbItem');
  assert(appJs.includes('function requestVoidOpenFnbOrderItem'), 'js/app.js harus memiliki fungsi requestVoidOpenFnbOrderItem');
  assert(appJs.includes('async function executeVoidOpenFnbOrderItem'), 'js/app.js harus memiliki fungsi executeVoidOpenFnbOrderItem');
  assert(appJs.includes('action === "void-room-fnb-item"'), 'js/app.js click listener harus menangani void-room-fnb-item');
  assert(appJs.includes('action === "void-open-fnb-order-item"'), 'js/app.js click listener harus menangani void-open-fnb-order-item');

  assert(styleCss.includes('.fnb-breakdown-void-btn'), 'css/style.css harus memiliki styling .fnb-breakdown-void-btn');
  assert(styleCss.includes('.open-fnb-item-void-btn'), 'css/style.css harus memiliki styling .open-fnb-item-void-btn');
  console.log('  ✓ PASS: Frontend contracts and styling verified.\n');

  // Test 2: Backend Route Registration
  console.log('Test 2: Verifying API route registration in server/src/routes/api.js...');
  const apiJs = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf-8');
  assert(apiJs.includes("case 'voidOpenFnbOrderItem':"), 'api.js harus mendaftarkan action voidOpenFnbOrderItem');
  console.log('  ✓ PASS: API route registered.\n');

  // Test 3: Backend Controller Unit Testing with Mocked DB
  console.log('Test 3: Testing fnbController.voidOpenFnbOrderItem logic...');
  const originalPoolConnect = db.pool.connect;
  const originalQuery = db.query;

  let mockInventory = {
    'ITEM-CAPTAIN-APPLE': { stock_item_id: 'ITEM-CAPTAIN-APPLE', stock_item_name: 'Captain Morgan Apple', stock_qty: 10 }
  };

  let mockOrder = {
    order_id: 'FNB-TEST-ROOM9',
    order_status: 'open',
    order_total: 600000,
    room_id: '9',
    room_name: 'Ruangan 9'
  };

  let mockOrderItems = [
    {
      order_item_id: 'ITEM-UUID-1',
      order_id: 'FNB-TEST-ROOM9',
      menu_id: 'MENU-CAPTAIN-APPLE',
      menu_name: 'CAPTEIN MORGAN APPLE',
      category: 'Spirit',
      price: 300000,
      quantity: 2,
      subtotal: 600000,
      is_voided: false,
      stock_deducted: true,
      stock_tracking: 'yes',
      stock_item_id: 'ITEM-CAPTAIN-APPLE',
      stock_qty_per_unit: 1,
      order_status: 'open',
      room_id: '9',
      room_name: 'Ruangan 9'
    }
  ];

  let stockMovements = [];
  let auditLogs = [];

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql).trim();

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      // SELECT items FOR UPDATE
      if (text.includes('FROM fnb_order_items foi') && text.includes('WHERE foi.order_item_id = ANY($1)')) {
        const ids = params[0];
        const matched = mockOrderItems.filter(it => ids.includes(it.order_item_id));
        return { rows: matched, rowCount: matched.length };
      }

      // SELECT inventory FOR UPDATE
      if (text.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
        const inv = mockInventory[params[0]];
        return inv ? { rows: [inv], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      // UPDATE inventory
      if (text.includes('UPDATE inventory SET stock_qty = $1')) {
        const invId = params[1];
        if (mockInventory[invId]) {
          mockInventory[invId].stock_qty = params[0];
        }
        return { rows: [], rowCount: 1 };
      }

      // INSERT INTO stock_movements
      if (text.includes('INSERT INTO stock_movements')) {
        stockMovements.push({
          movement_id: params[0],
          stock_item_id: params[1],
          qty_change: params[4],
          stock_before: params[5],
          stock_after: params[6],
          note: params[7]
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT components for bundle/recipe
      if (text.includes('FROM fnb_order_item_components')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT * FROM recipe WHERE menu_id = $1')) {
        return { rows: [], rowCount: 0 };
      }

      // UPDATE fnb_order_items (void)
      if (text.includes('UPDATE fnb_order_items') && text.includes('SET is_voided = TRUE')) {
        const itemId = params[2];
        const it = mockOrderItems.find(i => i.order_item_id === itemId);
        if (it) {
          it.is_voided = true;
          it.void_reason = params[0];
          it.voided_by = params[1];
        }
        return { rows: [], rowCount: 1 };
      }

      // UPDATE fnb_order_items (partial)
      if (text.includes('UPDATE fnb_order_items') && text.includes('SET quantity = $1, subtotal = $2')) {
        const itemId = params[2];
        const it = mockOrderItems.find(i => i.order_item_id === itemId);
        if (it) {
          it.quantity = params[0];
          it.subtotal = params[1];
        }
        return { rows: [], rowCount: 1 };
      }

      // INSERT INTO fnb_order_items (partial void row)
      if (text.includes('INSERT INTO fnb_order_items')) {
        mockOrderItems.push({
          order_item_id: 'ITEM-VOIDED-PARTIAL',
          order_id: params[0],
          menu_id: params[1],
          menu_name: params[2],
          category: params[3],
          price: params[4],
          quantity: params[5],
          subtotal: params[6],
          is_voided: true,
          void_reason: params[7],
          voided_by: params[8],
          stock_deducted: false
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT remaining active total
      if (text.includes('remaining_total') && text.includes('active_count')) {
        const ordId = params[0];
        const active = mockOrderItems.filter(it => it.order_id === ordId && !it.is_voided);
        const remTotal = active.reduce((sum, it) => sum + Number(it.subtotal), 0);
        return { rows: [{ remaining_total: remTotal, active_count: active.length }], rowCount: 1 };
      }

      // UPDATE fnb_orders (cancel or update total)
      if (text.includes('UPDATE fnb_orders') && text.includes("SET order_status = 'cancelled'")) {
        mockOrder.order_status = 'cancelled';
        mockOrder.order_total = 0;
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('UPDATE fnb_orders') && text.includes('SET order_total = $1')) {
        mockOrder.order_total = params[0];
        return { rows: [], rowCount: 1 };
      }

      // Audit log
      if (text.includes('INSERT INTO operational_audit_events') || text.includes('INSERT INTO audit_logs')) {
        auditLogs.push(params);
        return { rows: [], rowCount: 1 };
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
    // 3a. Validation: missing order_item_id
    responseData = null;
    await voidOpenFnbOrderItem({}, res, {});
    assert.strictEqual(responseData.ok, false, 'Harus gagal jika order_item_id tidak disediakan');
    console.log('  ✓ PASS: Missing order_item_id rejected.');

    // 3b. Successful Full Void
    responseData = null;
    await voidOpenFnbOrderItem({}, res, {
      order_item_ids: ['ITEM-UUID-1'],
      reason: 'Konsumen cancel Captain Morgan',
      voided_by: 'Manager 1 (Owner)'
    });

    assert.strictEqual(responseData.ok, true, 'Void harus sukses');
    assert.strictEqual(mockOrderItems[0].is_voided, true, 'Item harus ditandai is_voided = true');
    assert.strictEqual(mockInventory['ITEM-CAPTAIN-APPLE'].stock_qty, 12, 'Stok harus kembali 2 botol (dari 10 menjadi 12)');
    assert.strictEqual(mockOrder.order_status, 'cancelled', 'Order harus otomatis berstatus cancelled karena semua item telah di-void');
    assert.strictEqual(mockOrder.order_total, 0, 'Total order harus 0');
    assert(stockMovements.length > 0, 'Harus ada riwayat pergerakan stok');
    assert.strictEqual(stockMovements[0].qty_change, 2, 'Pengembalian stok harus 2 botol');
    console.log('  ✓ PASS: Full void correctly restored 2 bottles of Captain Morgan, cancelled order, and logged audit.');

    // 3c. Successful Partial Void (Mengurangi 1 saja dari 2 botol)
    mockInventory['ITEM-CAPTAIN-APPLE'].stock_qty = 10;
    mockOrder.order_status = 'open';
    mockOrder.order_total = 600000;
    mockOrderItems = [
      {
        order_item_id: 'ITEM-UUID-2',
        order_id: 'FNB-TEST-ROOM9',
        menu_id: 'MENU-CAPTAIN-APPLE',
        menu_name: 'CAPTEIN MORGAN APPLE',
        category: 'Spirit',
        price: 300000,
        quantity: 2,
        subtotal: 600000,
        is_voided: false,
        stock_deducted: true,
        stock_tracking: 'yes',
        stock_item_id: 'ITEM-CAPTAIN-APPLE',
        stock_qty_per_unit: 1,
        order_status: 'open',
        room_id: '9',
        room_name: 'Ruangan 9'
      }
    ];

    responseData = null;
    await voidOpenFnbOrderItem({}, res, {
      order_item_ids: ['ITEM-UUID-2'],
      qty_to_void: 1,
      reason: 'Konsumen minta kurangi 1 botol Captain Morgan saja',
      voided_by: 'Manager 1 (Owner)'
    });

    assert.strictEqual(responseData.ok, true, 'Partial void harus sukses');
    assert.strictEqual(mockOrderItems[0].quantity, 1, 'Sisa item aktif harus 1x');
    assert.strictEqual(mockOrderItems[0].subtotal, 300000, 'Subtotal sisa harus Rp 300.000');
    assert.strictEqual(mockOrderItems[0].is_voided, false, 'Item sisa harus tetap aktif (is_voided = false)');
    assert.strictEqual(mockInventory['ITEM-CAPTAIN-APPLE'].stock_qty, 11, 'Stok harus kembali 1 botol (dari 10 menjadi 11)');
    assert.strictEqual(mockOrder.order_status, 'open', 'Order harus tetap OPEN karena masih ada sisa 1 botol');
    assert.strictEqual(mockOrder.order_total, 300000, 'Total order harus terpotong Rp 300.000 menjadi Rp 300.000');
    console.log('  ✓ PASS: Partial void correctly reduced 1 bottle, kept 1 bottle active in room, restored 1 bottle to inventory, and updated order total to Rp 300.000.');

  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalQuery;
  }

  console.log('\n🎉 ALL VOID OPEN F&B TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
