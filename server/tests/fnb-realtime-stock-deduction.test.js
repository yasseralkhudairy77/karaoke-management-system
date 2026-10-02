const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Running Real-Time F&B Stock Deduction (Anti Ghost Selling) Tests...\n');

  const { deductStockForFnbOrders } = require('../src/controllers/roomsController');
  const { restoreStockForFnbOrders } = require('../src/controllers/fnbController');

  // Test 1: Real-time stock deduction on unpaid room order placement
  {
    console.log('  Testing Test 1: Real-time stock deduction on unpaid room order placement...');
    const executedQueries = [];
    let inventoryStock = 10;

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });

        // Query 1: select undeducted items
        if (sql.includes('FROM fnb_order_items foi')) {
          assert(sql.includes('foi.stock_deducted IS NOT TRUE'), 'Query harus memfilter foi.stock_deducted IS NOT TRUE');
          return {
            rows: [
              {
                order_item_id: 101,
                order_id: 'FNB-1725891111',
                menu_id: 'MENU-ROKOK-01',
                quantity: 1,
                menu_type_snapshot: 'regular',
                stock_tracking: 'yes',
                stock_item_id: 'INV-ROKOK-01',
                stock_qty_per_unit: 1,
                menu_name: 'Sampoerna Mild 16'
              }
            ],
            rowCount: 1
          };
        }

        // Query 2: SELECT inventory item FOR UPDATE
        if (sql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [
              {
                stock_item_id: 'INV-ROKOK-01',
                stock_item_name: 'Sampoerna Mild 16',
                stock_qty: inventoryStock
              }
            ],
            rowCount: 1
          };
        }

        // Query 3: UPDATE inventory stock
        if (sql.includes('UPDATE inventory SET stock_qty = $1')) {
          inventoryStock = params[0];
          return { rowCount: 1 };
        }

        // Query 4: INSERT stock_movements
        if (sql.includes('INSERT INTO stock_movements')) {
          return { rowCount: 1 };
        }

        // Query 5: Recipe / Bundle components check
        if (sql.includes('FROM fnb_order_item_components')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM recipe WHERE menu_id = $1')) {
          return { rows: [], rowCount: 0 };
        }

        // Query 6: UPDATE fnb_order_items SET stock_deducted = TRUE
        if (sql.includes('UPDATE fnb_order_items SET stock_deducted = TRUE')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }
    };

    const orderId = 'FNB-1725891111';
    await deductStockForFnbOrders(mockClient, [orderId], orderId, 'Kasir Siang');

    assert.strictEqual(inventoryStock, 9, 'Stok rokok harus langsung berkurang dari 10 menjadi 9 saat order dibuat');

    const updateInvQuery = executedQueries.find(q => q.sql.includes('UPDATE inventory SET stock_qty = $1'));
    assert(updateInvQuery, 'Harus ada query UPDATE inventory');
    assert.strictEqual(updateInvQuery.params[0], 9, 'Stok baru di inventory harus bernilai 9');

    const movementQuery = executedQueries.find(q => q.sql.includes('INSERT INTO stock_movements'));
    assert(movementQuery, 'Harus ada pencatatan ke stock_movements');
    assert(movementQuery.sql.includes("'out'"), 'Movement type di SQL harus "out"');
    assert.strictEqual(movementQuery.params[3], 'fnb_order', 'Reference type harus "fnb_order" saat order open');
    assert.strictEqual(movementQuery.params[4], orderId, 'Reference id harus orderId');
    assert.strictEqual(movementQuery.params[5], -1, 'Qty change harus -1');
    assert(movementQuery.params[8].includes('F&B Order Menu: Sampoerna Mild 16'), 'Note harus mencantumkan F&B Order Menu');

    const markDeductedQuery = executedQueries.find(q => q.sql.includes('UPDATE fnb_order_items SET stock_deducted = TRUE'));
    assert(markDeductedQuery, 'Item harus ditandai stock_deducted = TRUE');

    console.log('  PASS: Real-time stock deduction on unpaid order works accurately.');
  }

  // Test 2: Zero double-deduction on room checkout
  {
    console.log('  Testing Test 2: Anti double-deduction verification at room checkout...');
    const executedQueries = [];
    let inventoryStock = 9; // Stok yang sudah terpotong saat order dibuat

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });

        // Saat checkout, item sudah bertanda stock_deducted = TRUE
        // Sehingga query SELECT tidak mengembalikan item yang sudah terpotong
        if (sql.includes('FROM fnb_order_items foi')) {
          assert(sql.includes('foi.stock_deducted IS NOT TRUE'), 'Filter harus mengabaikan item yang sudah dipotong');
          return {
            rows: [], // Kosong karena sudah stock_deducted = TRUE
            rowCount: 0
          };
        }

        if (sql.includes('UPDATE inventory SET stock_qty = $1')) {
          inventoryStock = params[0];
          return { rowCount: 1 };
        }

        if (sql.includes('UPDATE fnb_order_items SET stock_deducted = TRUE')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }
    };

    const orderId = 'FNB-1725891111';
    const checkoutTrxId = 'TRX-1725899999';
    await deductStockForFnbOrders(mockClient, [orderId], checkoutTrxId, 'Kasir Malam');

    // Pastikan tidak ada query UPDATE inventory yang dijalankan
    const updateInvQuery = executedQueries.find(q => q.sql.includes('UPDATE inventory SET stock_qty = $1'));
    assert.strictEqual(updateInvQuery, undefined, 'Tidak boleh ada query UPDATE inventory pada checkout jika sudah dipotong');
    assert.strictEqual(inventoryStock, 9, 'Stok tetap 9, TIDAK terpotong ganda menjadi 8');

    const movementQuery = executedQueries.find(q => q.sql.includes('INSERT INTO stock_movements'));
    assert.strictEqual(movementQuery, undefined, 'Tidak boleh ada duplikasi movement pada checkout');

    console.log('  PASS: Zero double-deduction verified on checkout.');
  }

  // Test 3: Stock restoration upon order cancellation / void
  {
    console.log('  Testing Test 3: Inventory stock restoration on order cancellation...');
    const executedQueries = [];
    let inventoryStock = 9;

    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });

        // Query 1: cari item yang foi.stock_deducted IS TRUE
        if (sql.includes('FROM fnb_order_items foi') && sql.includes('foi.stock_deducted IS TRUE')) {
          return {
            rows: [
              {
                order_item_id: 101,
                order_id: 'FNB-1725891111',
                menu_id: 'MENU-ROKOK-01',
                quantity: 1,
                stock_tracking: 'yes',
                stock_item_id: 'INV-ROKOK-01',
                stock_qty_per_unit: 1,
                menu_name: 'Sampoerna Mild 16'
              }
            ],
            rowCount: 1
          };
        }

        // Query 2: SELECT inventory item FOR UPDATE
        if (sql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [
              {
                stock_item_id: 'INV-ROKOK-01',
                stock_item_name: 'Sampoerna Mild 16',
                stock_qty: inventoryStock
              }
            ],
            rowCount: 1
          };
        }

        // Query 3: UPDATE inventory stock (penambahan stok kembali)
        if (sql.includes('UPDATE inventory SET stock_qty = $1')) {
          inventoryStock = params[0];
          return { rowCount: 1 };
        }

        // Query 4: INSERT INTO stock_movements (in / restoration)
        if (sql.includes('INSERT INTO stock_movements')) {
          return { rowCount: 1 };
        }

        // Query 5: Recipe components check
        if (sql.includes('FROM fnb_order_item_components')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('FROM recipe WHERE menu_id = $1')) {
          return { rows: [], rowCount: 0 };
        }

        // Query 6: UPDATE fnb_order_items SET stock_deducted = FALSE
        if (sql.includes('UPDATE fnb_order_items SET stock_deducted = FALSE')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }
    };

    const orderId = 'FNB-1725891111';
    await restoreStockForFnbOrders(mockClient, [orderId], 'Supervisor', 'Pelanggan membatalkan pesanan rokok');

    assert.strictEqual(inventoryStock, 10, 'Stok rokok harus kembali menjadi 10 setelah order dibatalkan');

    const updateInvQuery = executedQueries.find(q => q.sql.includes('UPDATE inventory SET stock_qty = $1'));
    assert(updateInvQuery, 'Harus ada query UPDATE inventory untuk mengembalikan stok');
    assert.strictEqual(updateInvQuery.params[0], 10, 'Stok baru di inventory harus 10');

    const restoreMovementQuery = executedQueries.find(q => q.sql.includes('INSERT INTO stock_movements'));
    assert(restoreMovementQuery, 'Harus ada pencatatan pengembalian stok ke stock_movements');
    assert(restoreMovementQuery.sql.includes("'in'"), 'Movement type pengembalian di SQL harus "in"');
    assert(restoreMovementQuery.sql.includes("'fnb_order'"), 'Reference type di SQL harus "fnb_order"');
    assert.strictEqual(restoreMovementQuery.params[3], orderId, 'Reference ID pengembalian harus orderId');
    assert.strictEqual(restoreMovementQuery.params[4], 1, 'Qty change pengembalian harus +1');
    assert(restoreMovementQuery.params[7].includes('Pengembalian Stok Batal Order: Sampoerna Mild 16'), 'Note harus mencantumkan Pengembalian Stok Batal Order');

    const resetDeductedQuery = executedQueries.find(q => q.sql.includes('UPDATE fnb_order_items SET stock_deducted = FALSE'));
    assert(resetDeductedQuery, 'Item harus direset menjadi stock_deducted = FALSE');

    console.log('  PASS: Stock restoration on cancellation works accurately.');
  }

  // Test 4: Recipe / Bundle components deduction & restoration
  {
    console.log('  Testing Test 4: Recipe / Bundle components deduction & restoration...');
    let beerStock = 10;
    let peanutStock = 10;

    const mockClientDeduct = {
      query: async (sql, params) => {
        if (sql.includes('FROM fnb_order_items foi')) {
          return {
            rows: [
              {
                order_item_id: 201,
                order_id: 'FNB-BUNDLE-01',
                menu_id: 'MENU-PAKET-BEER',
                quantity: 1,
                menu_type_snapshot: 'fnb_bundle',
                stock_tracking: 'no',
                stock_item_id: null,
                menu_name: 'Paket Bir Bintang & Kacang'
              }
            ],
            rowCount: 1
          };
        }

        if (sql.includes('FROM fnb_order_item_components')) {
          return {
            rows: [
              { item_id: 'INV-BEER-01', component_name: 'Bir Bintang 330ml', total_qty: 2, component_mode: 'included' },
              { item_id: 'INV-PEANUT-01', component_name: 'Kacang Bawang', total_qty: 1, component_mode: 'bonus' }
            ],
            rowCount: 2
          };
        }

        if (sql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          const id = params[0];
          return {
            rows: [{
              stock_item_id: id,
              stock_item_name: id === 'INV-BEER-01' ? 'Bir Bintang 330ml' : 'Kacang Bawang',
              stock_qty: id === 'INV-BEER-01' ? beerStock : peanutStock
            }],
            rowCount: 1
          };
        }

        if (sql.includes('UPDATE inventory SET stock_qty = $1') && sql.includes('WHERE stock_item_id = $2')) {
          if (params[1] === 'INV-BEER-01') beerStock = params[0];
          if (params[1] === 'INV-PEANUT-01') peanutStock = params[0];
          return { rowCount: 1 };
        }

        if (sql.includes('INSERT INTO stock_movements')) return { rowCount: 1 };
        if (sql.includes('UPDATE fnb_order_items SET stock_deducted = TRUE')) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
    };

    await deductStockForFnbOrders(mockClientDeduct, ['FNB-BUNDLE-01'], 'FNB-BUNDLE-01', 'Kasir');
    assert.strictEqual(beerStock, 8, 'Stok bir harus berkurang 2 botol (10 -> 8)');
    assert.strictEqual(peanutStock, 9, 'Stok kacang harus berkurang 1 pack (10 -> 9)');

    // Now restore
    const mockClientRestore = {
      query: async (sql, params) => {
        if (sql.includes('FROM fnb_order_items foi')) {
          return {
            rows: [
              {
                order_item_id: 201,
                order_id: 'FNB-BUNDLE-01',
                menu_id: 'MENU-PAKET-BEER',
                quantity: 1,
                stock_tracking: 'no',
                stock_item_id: null,
                menu_name: 'Paket Bir Bintang & Kacang'
              }
            ],
            rowCount: 1
          };
        }

        if (sql.includes('FROM fnb_order_item_components')) {
          return {
            rows: [
              { item_id: 'INV-BEER-01', component_name: 'Bir Bintang 330ml', total_qty: 2, component_mode: 'included' },
              { item_id: 'INV-PEANUT-01', component_name: 'Kacang Bawang', total_qty: 1, component_mode: 'bonus' }
            ],
            rowCount: 2
          };
        }

        if (sql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          const id = params[0];
          return {
            rows: [{
              stock_item_id: id,
              stock_item_name: id === 'INV-BEER-01' ? 'Bir Bintang 330ml' : 'Kacang Bawang',
              stock_qty: id === 'INV-BEER-01' ? beerStock : peanutStock
            }],
            rowCount: 1
          };
        }

        if (sql.includes('UPDATE inventory SET stock_qty = $1') && sql.includes('WHERE stock_item_id = $2')) {
          if (params[1] === 'INV-BEER-01') beerStock = params[0];
          if (params[1] === 'INV-PEANUT-01') peanutStock = params[0];
          return { rowCount: 1 };
        }

        if (sql.includes('INSERT INTO stock_movements')) return { rowCount: 1 };
        if (sql.includes('UPDATE fnb_order_items SET stock_deducted = FALSE')) return { rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
    };

    await restoreStockForFnbOrders(mockClientRestore, ['FNB-BUNDLE-01'], 'Kasir', 'Batal Paket');
    assert.strictEqual(beerStock, 10, 'Stok bir harus kembali 10 setelah batal paket');
    assert.strictEqual(peanutStock, 10, 'Stok kacang harus kembali 10 setelah batal paket');

    console.log('  PASS: Recipe / Bundle components deduction & restoration verified.');
  }

  // Test 5: Frontend sync integrity check
  {
    console.log('  Testing Test 5: Frontend js/app.js sync verification...');
    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');

    assert(appJsContent.includes('loadMenuItems()'), 'js/app.js harus memanggil loadMenuItems()');

    // Verifikasi pemanggilan loadMenuItems di alur simpan order
    const saveOrderSnippet = appJsContent.slice(
      appJsContent.indexOf('async function executeSaveFnbOrder'),
      appJsContent.indexOf('function requestCancelFnbOrder')
    );
    assert(saveOrderSnippet.includes('loadMenuItems()'), 'executeSaveFnbOrder harus memuat ulang menu items');

    // Verifikasi pemanggilan loadMenuItems di alur cancelFnbOrder
    const cancelOrderSnippet = appJsContent.slice(
      appJsContent.indexOf('async function cancelFnbOrder'),
      appJsContent.indexOf('async function cancelFnbOrder') + 1200
    );
    assert(cancelOrderSnippet.includes('loadMenuItems()'), 'cancelFnbOrder harus memuat ulang menu items');

    // Verifikasi pemanggilan loadMenuItems di alur cancelGeneralFnbBill
    const cancelBillSnippet = appJsContent.slice(
      appJsContent.indexOf('async function executeCancelGeneralFnbBill'),
      appJsContent.indexOf('async function executeCancelGeneralFnbBill') + 1200
    );
    assert(cancelBillSnippet.includes('loadMenuItems()'), 'executeCancelGeneralFnbBill harus memuat ulang menu items');

    console.log('  PASS: Frontend contract and real-time sync in js/app.js verified.');
  }

  console.log('\n✅ ALL Real-Time F&B Stock Deduction Tests PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
