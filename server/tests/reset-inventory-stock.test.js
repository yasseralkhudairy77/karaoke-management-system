const assert = require('assert');
const db = require('../src/db');
const resetInventoryStockToZero = require('../scripts/reset-inventory-stock-to-zero');

async function runTests() {
  console.log('🧪 Running Reset Inventory Stock to Zero Unit Tests...');

  const originalConnect = db.pool.connect;
  const originalEnd = db.pool.end;

  try {
    const executedQueries = [];
    const mockInventoryRows = [
      { stock_item_id: 'ITEM-001', stock_item_name: 'Jack Daniels', stock_qty: '2.00', status: 'active' },
      { stock_item_id: 'ITEM-002', stock_item_name: 'Abidin', stock_qty: '47.00', status: 'active' },
      { stock_item_id: 'ITEM-003', stock_item_name: 'Already Zero Item', stock_qty: '0.00', status: 'active' }
    ];

    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        executedQueries.push({ text, params });

        if (text.includes('BEGIN') || text.includes('COMMIT')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('SELECT stock_item_id, stock_item_name')) {
          return { rowCount: mockInventoryRows.length, rows: mockInventoryRows };
        }
        if (text.includes('UPDATE inventory')) {
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO stock_movements')) {
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;
    db.pool.end = async () => {};

    const result = await resetInventoryStockToZero({ actor: 'Unit Test', keepPoolAlive: true });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalItems, 3, 'Total items should be 3');
    assert.strictEqual(result.adjustedCount, 2, '2 items had non-zero stock and should generate movements');

    const updateQueries = executedQueries.filter(q => q.text.includes('UPDATE inventory'));
    assert.strictEqual(updateQueries.length, 3, 'All 3 items should be updated to 0');

    const movementInserts = executedQueries.filter(q => q.text.includes('INSERT INTO stock_movements'));
    assert.strictEqual(movementInserts.length, 2, '2 movements should be inserted for non-zero items');

    console.log('  ✓ resetInventoryStockToZero correctly updated all items to 0');
    console.log('  ✓ Audit log properly recorded for non-zero stock adjustments');
    console.log('✅ ALL Reset Inventory Stock tests PASSED SUCCESSFULLY!');
  } finally {
    db.pool.connect = originalConnect;
    db.pool.end = originalEnd;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
