const assert = require('assert');
const db = require('../src/db');
const auditAndCleanInventory = require('../scripts/audit-and-clean-inventory-packages');
const { getInventoryItems } = require('../src/controllers/inventoryController');

async function runTests() {
  console.log('🧪 Running Inventory & Package Separation Unit Tests...');

  const originalQuery = db.query;

  try {
    // 1. Test audit identification logic with mocked inventory rows
    const mockInventoryRows = [
      { stock_item_id: 'INV-001', stock_item_name: 'JW Black Label 750ml', category: 'Spirit', unit: 'botol', stock_qty: '12', min_stock: '5', status: 'active' },
      { stock_item_id: 'INV-002', stock_item_name: 'Coca Cola 330ml', category: 'Beverage', unit: 'kaleng', stock_qty: '48', min_stock: '24', status: 'active' },
      { stock_item_id: 'INV-003', stock_item_name: 'Bintang Beer 330ml', category: 'Beer', unit: 'botol', stock_qty: '60', min_stock: '24', status: 'active' },
      { stock_item_id: 'PKG-INV-01', stock_item_name: 'Triple Black Label Package', category: 'Paket Minuman', unit: 'paket', stock_qty: '5', min_stock: '2', status: 'active' },
      { stock_item_id: 'PKG-INV-02', stock_item_name: 'Twin Bottle Vodka Combo', category: 'Promo Paket', unit: 'paket', stock_qty: '3', min_stock: '1', status: 'active' },
      { stock_item_id: 'INV-INACT', stock_item_name: 'Old Discontinued Item', category: 'Snack', unit: 'pcs', stock_qty: '0', min_stock: '0', status: 'inactive' }
    ];

    db.query = async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('FROM inventory')) {
        if (text.includes("status = 'inactive'")) {
          return { rows: mockInventoryRows.filter(r => r.status === 'inactive') };
        }
        if (text.includes("status = 'active'")) {
          return { rows: mockInventoryRows.filter(r => r.status === 'active') };
        }
        return { rows: mockInventoryRows };
      }
      if (text.includes('FROM package_master')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    };

    const auditResult = await auditAndCleanInventory({ dryRun: true });
    assert.strictEqual(auditResult.total, 6, 'Total items should be 6');
    assert.strictEqual(auditResult.legitimateCount, 4, 'Legitimate physical items should be 4');
    assert.strictEqual(auditResult.packagesCount, 2, 'Suspected package items should be 2');

    const pkgNames = auditResult.packages.map(p => p.stock_item_name);
    assert.ok(pkgNames.includes('Triple Black Label Package'));
    assert.ok(pkgNames.includes('Twin Bottle Vodka Combo'));
    console.log('  ✓ auditAndCleanInventory successfully isolated package bundles from physical goods');

    // 2. Test getInventoryItems default filter (only active items)
    let activeResponse = null;
    await getInventoryItems({ query: {} }, { json: (data) => { activeResponse = data; return data; } });
    assert.strictEqual(activeResponse.ok, true);
    assert.strictEqual(activeResponse.items.length, 5, 'Default view should only return active items (5 items)');
    assert.strictEqual(activeResponse.items.every(i => i.status === 'active'), true, 'All items must be active');
    console.log('  ✓ getInventoryItems cleanly excludes inactive items by default');

    // 3. Test getInventoryItems with status=inactive
    let inactiveResponse = null;
    await getInventoryItems({ query: { status: 'inactive' } }, { json: (data) => { inactiveResponse = data; return data; } });
    assert.strictEqual(inactiveResponse.ok, true);
    assert.strictEqual(inactiveResponse.items.length, 1, 'status=inactive should return 1 item');
    assert.strictEqual(inactiveResponse.items[0].stock_item_id, 'INV-INACT');
    console.log('  ✓ getInventoryItems with status=inactive works accurately');

    console.log('✅ ALL Inventory & Package Separation Unit Tests PASSED SUCCESSFULLY!');
  } finally {
    db.query = originalQuery;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
