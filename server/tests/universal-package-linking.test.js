const assert = require('assert');
const db = require('../src/db');
const { deductStockForRoomPackage } = require('../src/controllers/roomsController');
const { getTodayFnbSalesReport } = require('../src/controllers/fnbController');

async function runTests() {
  console.log('🧪 Running Universal Package Linking & Zero-Leakage Sales Report Tests...');

  await testDeductStockForRoomPackage();
  await testFnbSalesReportWithPackagesAndPhysicalConsumption();

  console.log('✅ ALL Universal Package Linking & Zero-Leakage Tests PASSED SUCCESSFULLY!');
}

async function testDeductStockForRoomPackage() {
  const originalQuery = db.query;
  const queries = [];

  const mockInventory = [
    { stock_item_id: 'BEER-DRAFT', stock_item_name: 'Draft Beer Pitcher', stock_qty: '30' },
    { stock_item_id: 'SNACK-FF', stock_item_name: 'French Fries', stock_qty: '15' }
  ];

  const mockPackageDetails = [
    { component_ref_id: 'BEER-DRAFT', component_name: 'Draft Beer Pitcher', qty: '3' },
    { component_ref_id: 'SNACK-FF', component_name: 'French Fries', qty: '1' }
  ];

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('FROM package_details')) {
        return { rows: mockPackageDetails, rowCount: mockPackageDetails.length };
      }
      if (text.includes('FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
        const item = mockInventory.find(i => i.stock_item_id === params[0]);
        return { rows: item ? [item] : [], rowCount: item ? 1 : 0 };
      }
      if (text.includes('UPDATE inventory')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO stock_movements')) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  const result = await deductStockForRoomPackage(
    mockClient,
    'PKG-BEER-HOLIC',
    'BEER HOLIC DRAFT',
    'TRX-1001',
    'Kasir Utama'
  );

  assert.strictEqual(result.movements.length, 2, 'Must deduct 2 components (Draft Beer & French Fries)');
  
  // Verify Draft Beer deduction (30 - 3 = 27)
  const beerMovement = result.movements.find(m => m.stock_item_id === 'BEER-DRAFT');
  assert.ok(beerMovement);
  assert.strictEqual(beerMovement.stock_before, 30);
  assert.strictEqual(beerMovement.stock_after, 27);

  // Verify French Fries deduction (15 - 1 = 14)
  const friesMovement = result.movements.find(m => m.stock_item_id === 'SNACK-FF');
  assert.ok(friesMovement);
  assert.strictEqual(friesMovement.stock_before, 15);
  assert.strictEqual(friesMovement.stock_after, 14);

  console.log('  ✓ deductStockForRoomPackage successfully deducted components and recorded movements');
}

async function testFnbSalesReportWithPackagesAndPhysicalConsumption() {
  const originalQuery = db.query;

  db.query = async (sql, params = []) => {
    const text = String(sql);

    // 1. fnb_order_items: 1 ala carte beer + 1 beer holic bundle
    if (text.includes('FROM fnb_order_items foi')) {
      return {
        rows: [
          {
            order_item_id: 'foi-1',
            order_id: 'ORD-1',
            room_id: 'R1',
            room_name: 'Room 01',
            customer_name: 'Budi',
            cashier_name: 'Kasir',
            order_status: 'billed',
            order_created_at: new Date(),
            menu_id: 'MENU-BEER-SINGLE',
            menu_name: 'Draft Beer (Single)',
            category: 'Beer',
            price: 50000,
            quantity: 2,
            subtotal: 100000,
            menu_type_snapshot: 'regular'
          },
          {
            order_item_id: 'foi-2',
            order_id: 'ORD-2',
            room_id: 'R2',
            room_name: 'Room 02',
            customer_name: 'Andi',
            cashier_name: 'Kasir',
            order_status: 'billed',
            order_created_at: new Date(),
            menu_id: 'PKG-BEER-HOLIC',
            menu_name: 'BEER HOLIC DRAFT',
            category: 'Paket F&B',
            price: 200000,
            quantity: 1,
            subtotal: 200000,
            menu_type_snapshot: 'fnb_bundle'
          }
        ]
      };
    }

    // 2. low stock items
    if (text.includes('WHERE status = \'active\' AND (stock_qty <= min_stock OR stock_qty < 0)')) {
      return { rows: [] };
    }

    // 3. room packages from transactions: 1 Room package sold
    if (text.includes('FROM transactions t')) {
      return {
        rows: [
          {
            transaction_id: 'TRX-ROOM-PKG-1',
            room_id: 'R3',
            room_name: 'VIP 01',
            cashier_name: 'Kasir',
            payment_status: 'paid',
            created_at: new Date(),
            package_id: 'PKG-VIP-ALLIN',
            package_name: 'Paket VIP Sing Along',
            package_total: 850000
          }
        ]
      };
    }

    // 4. bundle components from fnb orders (Beer Holic bundle components)
    if (text.includes('FROM fnb_order_item_components foic')) {
      return {
        rows: [
          { order_item_id: 'foi-2', item_id: 'BEER-DRAFT', component_name: 'Draft Beer', total_qty: 3, component_mode: 'included' },
          { order_item_id: 'foi-2', item_id: 'SNACK-FF', component_name: 'French Fries', total_qty: 1, component_mode: 'bonus' }
        ]
      };
    }

    // 5. package details definitions (VIP room package components)
    if (text.includes('FROM package_details')) {
      return {
        rows: [
          { package_id: 'PKG-VIP-ALLIN', component_ref_id: 'BEER-DRAFT', component_name: 'Draft Beer', qty: 4, unit: 'pitcher' },
          { package_id: 'PKG-VIP-ALLIN', component_ref_id: 'SNACK-FF', component_name: 'French Fries', qty: 2, unit: 'porsi' }
        ]
      };
    }

    // 6. active inventory master
    if (text.includes('FROM inventory')) {
      return {
        rows: [
          { stock_item_id: 'BEER-DRAFT', stock_item_name: 'Draft Beer Pitcher', category: 'Beer', unit: 'pitcher', stock_qty: '21' },
          { stock_item_id: 'SNACK-FF', stock_item_name: 'French Fries', category: 'Food', unit: 'porsi', stock_qty: '12' }
        ]
      };
    }

    // 7. menu master
    if (text.includes('FROM menu')) {
      return {
        rows: [
          { menu_id: 'MENU-BEER-SINGLE', stock_tracking: 'yes', stock_item_id: 'BEER-DRAFT', stock_qty_per_unit: 1, menu_type: 'regular' }
        ]
      };
    }

    return { rows: [], rowCount: 0 };
  };

  try {
    let responseData = null;
    const req = { query: { period: 'today' } };
    const res = { json: (data) => { responseData = data; return data; } };

    await getTodayFnbSalesReport(req, res);

    assert.strictEqual(responseData.ok, true);
    // Total items sold: 2 single beers + 1 beer holic + 1 room package = 4 items
    assert.strictEqual(responseData.summary.total_items_sold, 4);
    // Total sales: 100k + 200k + 850k = 1,150,000
    assert.strictEqual(responseData.summary.total_fnb_sales, 1150000);

    // Check items include Room Package
    const roomPkgEntry = responseData.items.find(i => i.menu_id === 'PKG-VIP-ALLIN');
    assert.ok(roomPkgEntry, 'Room package must appear in sales items');
    assert.strictEqual(roomPkgEntry.gross_sales, 850000);

    // Check Physical Consumption (Zero-Leakage Audit)
    assert.ok(Array.isArray(responseData.physical_consumption), 'physical_consumption array must exist');
    assert.strictEqual(responseData.physical_consumption.length, 2);

    // Draft Beer consumption:
    // 2 (ala carte) + 3 (via Beer Holic bundle) + 4 (via VIP Room package) = 9 pitchers!
    const beerConsumption = responseData.physical_consumption.find(i => i.stock_item_id === 'BEER-DRAFT');
    assert.ok(beerConsumption);
    assert.strictEqual(beerConsumption.ala_carte_qty, 2);
    assert.strictEqual(beerConsumption.package_qty, 7, '3 from bundle + 4 from room package = 7');
    assert.strictEqual(beerConsumption.total_consumed, 9, '2 + 7 = 9 total pitchers consumed');
    assert.strictEqual(beerConsumption.current_stock, 21);

    // French Fries consumption:
    // 0 (ala carte) + 1 (via Beer Holic bundle) + 2 (via VIP Room package) = 3 porsi!
    const friesConsumption = responseData.physical_consumption.find(i => i.stock_item_id === 'SNACK-FF');
    assert.ok(friesConsumption);
    assert.strictEqual(friesConsumption.ala_carte_qty, 0);
    assert.strictEqual(friesConsumption.package_qty, 3, '1 from bundle + 2 from room package = 3');
    assert.strictEqual(friesConsumption.total_consumed, 3);
    assert.strictEqual(friesConsumption.current_stock, 12);

    console.log('  ✓ getTodayFnbSalesReport accurately tracked packages and calculated physical consumption breakdown');
  } finally {
    db.query = originalQuery;
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
