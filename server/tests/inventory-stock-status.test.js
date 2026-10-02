const assert = require('assert');
const db = require('../src/db');
const { getInventoryStatus, getInventoryItems } = require('../src/controllers/inventoryController');

async function runTests() {
  console.log('Running Inventory Stock Status & Summary Unit Tests...');

  // Test 1: getInventoryStatus calculation
  assert.strictEqual(getInventoryStatus(-5, 10), 'negative', 'Negative stock should be negative');
  assert.strictEqual(getInventoryStatus(-1, 0), 'negative', 'Negative stock should be negative');
  assert.strictEqual(getInventoryStatus(0, 10), 'low', '0 stock with min 10 should be low');
  assert.strictEqual(getInventoryStatus(2, 10), 'low', '2 stock with min 10 should be low (Jack Daniels case)');
  assert.strictEqual(getInventoryStatus(10, 10), 'low', '10 stock with min 10 should be low (boundary)');
  assert.strictEqual(getInventoryStatus(11, 10), 'safe', '11 stock with min 10 should be safe (Atlas Leci case)');
  assert.strictEqual(getInventoryStatus(47, 10), 'safe', '47 stock with min 10 should be safe (Abidin case)');
  console.log('  ✓ getInventoryStatus calculation tests passed');

  // Test 2: getInventoryItems controller output structure test with mocked db
  const originalQuery = db.query;
  try {
    const mockRows = [
      { stock_item_id: 'MENU-030', stock_item_name: 'Jack Daniels', category: 'American Whisky', unit: 'botol', stock_qty: '2.00', min_stock: '10.00', status: 'active', updated_at: new Date() },
      { stock_item_id: 'MENU-040', stock_item_name: 'Abidin', category: 'Anggur', unit: 'botol', stock_qty: '47.00', min_stock: '10.00', status: 'active', updated_at: new Date() },
      { stock_item_id: 'MENU-035', stock_item_name: 'Anggur Merah', category: 'Anggur', unit: 'botol', stock_qty: '4.00', min_stock: '10.00', status: 'active', updated_at: new Date() },
      { stock_item_id: 'ITEM-NEG', stock_item_name: 'Minus Item', category: 'Other', unit: 'botol', stock_qty: '-2.00', min_stock: '5.00', status: 'active', updated_at: new Date() }
    ];

    db.query = async () => ({ rows: mockRows });

    let responseData = null;
    const mockRes = {
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    await getInventoryItems({}, mockRes);

    assert(responseData, 'Response should not be null');
    assert.strictEqual(responseData.ok, true, 'ok should be true');
    assert.strictEqual(responseData.items.length, 4, 'Should return 4 items');

    const jd = responseData.items.find(i => i.stock_item_id === 'MENU-030');
    assert.strictEqual(jd.stock_status, 'low', 'Jack Daniels stock_status must be "low"');

    const abidin = responseData.items.find(i => i.stock_item_id === 'MENU-040');
    assert.strictEqual(abidin.stock_status, 'safe', 'Abidin stock_status must be "safe"');

    const neg = responseData.items.find(i => i.stock_item_id === 'ITEM-NEG');
    assert.strictEqual(neg.stock_status, 'negative', 'Minus Item stock_status must be "negative"');

    assert(responseData.summary, 'Summary object should exist');
    assert.strictEqual(responseData.summary.total_items, 4);
    assert.strictEqual(responseData.summary.safe_items, 1);
    assert.strictEqual(responseData.summary.low_items, 2);
    assert.strictEqual(responseData.summary.negative_items, 1);
    console.log('  ✓ getInventoryItems controller integration & summary tests passed');
    console.log('✅ ALL Inventory Stock Status tests PASSED SUCCESSFULLY!');
  } finally {
    db.query = originalQuery;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
