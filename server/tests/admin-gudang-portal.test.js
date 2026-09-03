const assert = require('assert');
const db = require('../src/db');
const { validateAdminPin } = require('../src/controllers/masterDataController');
const { receiveGoodsBatch } = require('../src/controllers/inventoryController');

async function runTests() {
  console.log('🧪 Running Admin Gudang Portal & Goods Receipt Tests...');

  await testAdminGudangPinLogin();
  await testReceiveGoodsBatch();

  console.log('✅ ALL Admin Gudang Portal Tests PASSED SUCCESSFULLY!');
}

async function testAdminGudangPinLogin() {
  const originalQuery = db.query;

  const mockEmployee = {
    employee_id: 'EMP-GUDANG-01',
    employee_name: 'Admin Gudang',
    role: 'inventory',
    pin: '654321',
    pin_hash: null
  };

  db.query = async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM employees')) {
      return { rows: [mockEmployee], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  try {
    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await validateAdminPin(req, res, {
      pin: '654321',
      required_role: 'staff'
    });

    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.role, 'inventory');
    assert.strictEqual(responseData.employee_name, 'Admin Gudang');

    console.log('  ✓ Admin Gudang successfully verified PIN 654321 with role inventory');
  } finally {
    db.query = originalQuery;
  }
}

async function testReceiveGoodsBatch() {
  const originalConnect = db.pool.connect;
  const queries = [];

  const mockInventory = {
    'INV-AM-01': { stock_item_id: 'INV-AM-01', stock_item_name: 'Anggur Merah OT', stock_qty: '10', unit: 'botol' },
    'INV-INT-01': { stock_item_id: 'INV-INT-01', stock_item_name: 'Intisari', stock_qty: '5', unit: 'botol' },
    'INV-ATL-01': { stock_item_id: 'INV-ATL-01', stock_item_name: 'Atlas Leci', stock_qty: '0', unit: 'botol' }
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
        const item = mockInventory[params[0]];
        return { rows: item ? [item] : [], rowCount: item ? 1 : 0 };
      }
      if (text.includes('UPDATE inventory')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO stock_movements')) {
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
      reference_id: 'SJ-7721',
      supplier_name: 'Orang Tua Distributor',
      notes: 'Kiriman restock malam',
      cashier_name: 'Admin Gudang',
      items: [
        { stock_item_id: 'INV-AM-01', quantity: 60 },
        { stock_item_id: 'INV-INT-01', quantity: 60 },
        { stock_item_id: 'INV-ATL-01', quantity: 60 }
      ]
    };

    await receiveGoodsBatch(req, res, payload);

    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.document_number, 'SJ-7721');
    assert.strictEqual(responseData.total_items, 3);

    const items = responseData.items;
    assert.strictEqual(items.length, 3);

    // Verify Anggur Merah: 10 + 60 = 70
    const am = items.find(i => i.stock_item_id === 'INV-AM-01');
    assert.strictEqual(am.stock_before, 10);
    assert.strictEqual(am.qty_in, 60);
    assert.strictEqual(am.stock_after, 70);

    // Verify Intisari: 5 + 60 = 65
    const intisari = items.find(i => i.stock_item_id === 'INV-INT-01');
    assert.strictEqual(intisari.stock_before, 5);
    assert.strictEqual(intisari.qty_in, 60);
    assert.strictEqual(intisari.stock_after, 65);

    // Verify Atlas Leci: 0 + 60 = 60
    const atlas = items.find(i => i.stock_item_id === 'INV-ATL-01');
    assert.strictEqual(atlas.stock_before, 0);
    assert.strictEqual(atlas.qty_in, 60);
    assert.strictEqual(atlas.stock_after, 60);

    // Verify stock_movements queries
    const movementQueries = queries.filter(q => q.text.includes('INSERT INTO stock_movements'));
    assert.strictEqual(movementQueries.length, 3, 'Must insert 3 stock movement ledger records');
    movementQueries.forEach(mq => {
      assert.strictEqual(mq.params[3], 'SJ-7721', 'Document number must be SJ-7721');
      assert.strictEqual(mq.params[4], 60, 'Quantity in must be 60');
      assert.strictEqual(mq.params[8], 'Admin Gudang', 'Recorded by Admin Gudang');
    });

    console.log('  ✓ receiveGoodsBatch successfully updated running balances and recorded 3 audit ledger entries');
  } finally {
    db.pool.connect = originalConnect;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
