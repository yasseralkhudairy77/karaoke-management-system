const assert = require('assert');
const db = require('../src/db');
const { toggleInventoryItemStatus } = require('../src/controllers/inventoryController');

async function runTests() {
  console.log('🧪 Running Toggle Inventory Item Status Unit Tests...');

  const originalConnect = db.pool.connect;

  try {
    // State mock database
    let inventoryTable = [
      { stock_item_id: 'ROKOK-001', stock_item_name: 'Esse Change', status: 'active' },
      { stock_item_id: 'MINUM-001', stock_item_name: 'Coca Cola', status: 'inactive' }
    ];

    let menuTable = [
      { menu_id: 'M-ROKOK-001', menu_name: 'Rokok Esse Change', stock_item_id: 'ROKOK-001', status: 'active' },
      { menu_id: 'M-MINUM-001', menu_name: 'Coca Cola Kaleng', stock_item_id: 'MINUM-001', status: 'inactive' }
    ];

    let auditLogs = [];

    const createMockClient = () => ({
      query: async (sql, params) => {
        const text = String(sql).trim();

        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [] };
        }

        if (text.includes('FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          const item = inventoryTable.find(i => i.stock_item_id === params[0]);
          return {
            rowCount: item ? 1 : 0,
            rows: item ? [{ ...item }] : []
          };
        }

        if (text.includes('UPDATE inventory SET status = $1')) {
          const [newStatus, id] = params;
          const item = inventoryTable.find(i => i.stock_item_id === id);
          if (item) item.status = newStatus;
          return { rowCount: item ? 1 : 0, rows: [] };
        }

        if (text.includes('UPDATE menu SET status = $1')) {
          const [newStatus, stockId] = params;
          const affected = [];
          menuTable.forEach(m => {
            if (m.stock_item_id === stockId) {
              m.status = newStatus;
              affected.push({ menu_id: m.menu_id, menu_name: m.menu_name });
            }
          });
          return { rowCount: affected.length, rows: affected };
        }

        if (text.includes('INSERT INTO master_data_audit_logs')) {
          auditLogs.push(params);
          return { rowCount: 1, rows: [] };
        }

        return { rows: [], rowCount: 0 };
      },
      release: () => {}
    });

    db.pool.connect = async () => createMockClient();

    // Helper mock response
    const createMockRes = () => {
      let resData = null;
      let statusCode = 200;
      return {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              resData = { ...data, statusCode };
              return resData;
            }
          };
        },
        json: (data) => {
          resData = { ...data, statusCode };
          return resData;
        },
        getData: () => resData
      };
    };

    // Test 1: Deactivate active inventory item (ROKOK-001)
    {
      const res = createMockRes();
      await toggleInventoryItemStatus({}, res, {
        stock_item_id: 'ROKOK-001',
        status: 'inactive',
        cashier_name: 'Manager Test'
      });

      const data = res.getData();
      assert.strictEqual(data.ok, true, 'Deactivation should return ok: true');
      assert.strictEqual(data.status, 'inactive', 'Returned status should be inactive');
      assert.strictEqual(data.updated_menus_count, 1, 'Should update 1 linked menu');

      const invItem = inventoryTable.find(i => i.stock_item_id === 'ROKOK-001');
      assert.strictEqual(invItem.status, 'inactive', 'Inventory status should be updated to inactive');

      const menuItem = menuTable.find(m => m.menu_id === 'M-ROKOK-001');
      assert.strictEqual(menuItem.status, 'inactive', 'Linked menu status should also become inactive');

      assert(auditLogs.length > 0, 'Audit log must be recorded');
      console.log('  ✓ Test 1 Passed: Deactivate active inventory item and linked menu successfully');
    }

    // Test 2: Activate inactive inventory item (MINUM-001)
    {
      const res = createMockRes();
      await toggleInventoryItemStatus({}, res, {
        stock_item_id: 'MINUM-001',
        status: 'active',
        cashier_name: 'Manager Test'
      });

      const data = res.getData();
      assert.strictEqual(data.ok, true, 'Activation should return ok: true');
      assert.strictEqual(data.status, 'active', 'Returned status should be active');

      const invItem = inventoryTable.find(i => i.stock_item_id === 'MINUM-001');
      assert.strictEqual(invItem.status, 'active', 'Inventory status should be updated to active');

      const menuItem = menuTable.find(m => m.menu_id === 'M-MINUM-001');
      assert.strictEqual(menuItem.status, 'active', 'Linked menu status should also become active');
      console.log('  ✓ Test 2 Passed: Re-activate inactive inventory item and linked menu successfully');
    }

    // Test 3: Validation - Missing stock_item_id
    {
      const res = createMockRes();
      await toggleInventoryItemStatus({}, res, { status: 'inactive' });
      const data = res.getData();
      assert.strictEqual(data.ok, false, 'Should fail when stock_item_id is missing');
      console.log('  ✓ Test 3 Passed: Rejects missing stock_item_id');
    }

    // Test 4: Validation - Invalid status value
    {
      const res = createMockRes();
      await toggleInventoryItemStatus({}, res, { stock_item_id: 'ROKOK-001', status: 'archived' });
      const data = res.getData();
      assert.strictEqual(data.ok, false, 'Should fail when status is invalid');
      console.log('  ✓ Test 4 Passed: Rejects invalid status values');
    }

    // Test 5: Validation - Non-existent item
    {
      const res = createMockRes();
      await toggleInventoryItemStatus({}, res, { stock_item_id: 'DOES-NOT-EXIST', status: 'inactive' });
      const data = res.getData();
      assert.strictEqual(data.ok, false, 'Should fail when item does not exist');
      console.log('  ✓ Test 5 Passed: Returns error for non-existent stock_item_id');
    }

    console.log('✅ ALL Toggle Inventory Item Status Unit Tests PASSED SUCCESSFULLY!\n');
  } finally {
    db.pool.connect = originalConnect;
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
