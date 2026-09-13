const assert = require('assert');
const { createManualOutageTransaction } = require('../src/controllers/transactionsController');
const db = require('../src/db');

async function runTests() {
  console.log('🧪 Running Manual Outage Transaction Stock Deduction & LC Work Log Tests...\n');

  // Test 1: Transaksi Manual dengan FnB (Sampoerna Mild 16) & LC
  {
    console.log('  Testing Test 1: Manual Transaction with FnB stock deduction & LC work log creation...');
    const executedQueries = [];
    let inventoryStock = 20;

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        // BEGIN, COMMIT, ROLLBACK
        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') {
          return { rowCount: 1 };
        }

        // Idempotency check
        if (trimmedSql.includes('SELECT * FROM transactions WHERE idempotency_key = $1')) {
          return { rows: [], rowCount: 0 };
        }

        // Room check
        if (trimmedSql.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rows: [
              {
                room_id: 'ROOM-01',
                room_name: 'Room Suite 01',
                rate_per_hour: 100000,
                status: 'available'
              }
            ],
            rowCount: 1
          };
        }

        // Menu check (Sampoerna Mild 16)
        if (trimmedSql.includes('SELECT * FROM menu WHERE menu_id = $1 AND status = $2')) {
          return {
            rows: [
              {
                menu_id: 'MENU-SAMPOERNA-01',
                menu_name: 'Sampoerna Mild 16',
                category: 'Cigarette',
                price: 35000,
                stock_tracking: 'yes',
                stock_item_id: 'INV-SAMPOERNA-01',
                stock_qty_per_unit: 1,
                bonus_sales_lc: 0,
                status: 'active'
              }
            ],
            rowCount: 1
          };
        }

        // LC check
        if (trimmedSql.includes('SELECT lc_id, lc_name, rate_per_hour FROM lc_master WHERE lc_id = $1 AND status = $2')) {
          return {
            rows: [
              {
                lc_id: 'LC-01',
                lc_name: 'Bella',
                rate_per_hour: 150000,
                status: 'active'
              }
            ],
            rowCount: 1
          };
        }

        // F&B orders insert
        if (trimmedSql.includes('INSERT INTO fnb_orders')) {
          return { rowCount: 1 };
        }

        // F&B order items insert
        if (trimmedSql.includes('INSERT INTO fnb_order_items')) {
          return { rowCount: 1 };
        }

        // Select inventory FOR UPDATE
        if (trimmedSql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [
              {
                stock_item_id: 'INV-SAMPOERNA-01',
                stock_item_name: 'Sampoerna Mild 16',
                stock_qty: inventoryStock
              }
            ],
            rowCount: 1
          };
        }

        // Update inventory
        if (trimmedSql.includes('UPDATE inventory SET stock_qty = $1')) {
          inventoryStock = params[0];
          return { rowCount: 1 };
        }

        // Stock movements insert
        if (trimmedSql.includes('INSERT INTO stock_movements')) {
          return { rowCount: 1 };
        }

        // Recipe check
        if (trimmedSql.includes('SELECT r.*, i.stock_item_name FROM recipe r JOIN inventory i')) {
          return { rows: [], rowCount: 0 };
        }

        // LC work logs insert
        if (trimmedSql.includes('INSERT INTO lc_work_logs')) {
          return { rowCount: 1 };
        }

        // Transactions insert
        if (trimmedSql.includes('INSERT INTO transactions')) {
          return { rowCount: 1 };
        }

        // Operational audit insert
        if (trimmedSql.includes('INSERT INTO operational_audit_events')) {
          return { rowCount: 1 };
        }

        // Sync outbox insert
        if (trimmedSql.includes('INSERT INTO sync_outbox')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      },
      release: () => {}
    };

    const origConnect = db.pool.connect;
    const origQuery = db.query;
    db.pool.connect = async () => mockClient;
    db.query = async (sql, params) => mockClient.query(sql, params);

    let responseData = null;
    const mockRes = {
      status: (code) => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    const payload = {
      idempotency_key: `manual-test-${Date.now()}`,
      mode: 'room',
      room_id: 'ROOM-01',
      duration_minutes: 120, // 2 jam = Rp 200.000
      start_time: '2026-09-14T01:00:00.000Z',
      operational_date: '2026-09-13',
      cashier_name: 'Kasir Alfin',
      entered_by: 'Owner Hendra',
      source_note: 'Nota manual saat listrik mati',
      payment_method: 'cash',
      payment_status: 'paid',
      fnb_items: [
        { menu_id: 'MENU-SAMPOERNA-01', quantity: 2 } // 2 bks @ Rp 35.000 = Rp 70.000
      ],
      lc_assignments: [
        { lc_id: 'LC-01', duration_minutes: 120 } // 2 jam @ Rp 150.000 = Rp 300.000
      ]
    };

    try {
      await createManualOutageTransaction({}, mockRes, payload);
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData, 'Response data harus ada');
    assert.strictEqual(responseData.ok, true, 'Response status harus ok: true');
    assert.strictEqual(responseData.transaction.room_total, 200000, 'Room total harus 200.000');
    assert.strictEqual(responseData.transaction.fnb_total, 70000, 'FnB total harus 70.000');
    assert.strictEqual(responseData.transaction.lc_total, 300000, 'LC total harus 300.000');
    assert.strictEqual(responseData.transaction.grand_total, 570000, 'Grand total harus 570.000');
    assert(responseData.transaction.fnb_order_ids.startsWith('FNB-M-'), 'fnb_order_ids harus terisi dengan order manual');

    // Cek pemotongan stok inventory
    assert.strictEqual(inventoryStock, 18, 'Stok inventory Sampoerna Mild harus berkurang 2 (dari 20 menjadi 18)');

    // Cek kueri stock_movements
    const stockMovQuery = executedQueries.find(q => q.sql.includes('INSERT INTO stock_movements'));
    assert(stockMovQuery, 'Harus mencatat mutasi ke stock_movements');
    assert.strictEqual(stockMovQuery.params[1], 'INV-SAMPOERNA-01', 'stock_item_id harus INV-SAMPOERNA-01');
    assert.strictEqual(stockMovQuery.params[3], 'out', 'movement_type harus out');
    assert.strictEqual(stockMovQuery.params[6], -2, 'qty_change harus -2');
    assert.strictEqual(stockMovQuery.params[7], 20, 'stock_before harus 20');
    assert.strictEqual(stockMovQuery.params[8], 18, 'stock_after harus 18');
    assert(stockMovQuery.params[9].includes('Sampoerna Mild 16'), 'Note harus mencantumkan Sampoerna Mild 16');

    // Cek kueri fnb_order_items
    const fnbItemQuery = executedQueries.find(q => q.sql.includes('INSERT INTO fnb_order_items'));
    assert(fnbItemQuery, 'Harus membuat fnb_order_items');
    assert.strictEqual(fnbItemQuery.params[2], 'MENU-SAMPOERNA-01');
    assert.strictEqual(fnbItemQuery.params[6], 2);
    assert.strictEqual(fnbItemQuery.params[7], 70000);

    // Cek kueri lc_work_logs
    const lcLogQuery = executedQueries.find(q => q.sql.includes('INSERT INTO lc_work_logs'));
    assert(lcLogQuery, 'Harus membuat lc_work_logs');
    assert.strictEqual(lcLogQuery.params[4], 'LC-01', 'lc_id harus LC-01');
    assert.strictEqual(lcLogQuery.params[5], 'Bella', 'lc_name harus Bella');
    assert.strictEqual(lcLogQuery.params[6], 120, 'duration_minutes harus 120');
    assert.strictEqual(lcLogQuery.params[8], 300000, 'rate harus 300.000');
    assert.strictEqual(lcLogQuery.params[10], 'closed', 'status harus closed');
    assert.strictEqual(lcLogQuery.params[12], responseData.transaction.transaction_id, 'closed_transaction_id harus terhubung ke transaksi');

    // Cek detail pada response
    assert(Array.isArray(responseData.fnb_orders), 'Response harus mengembalikan fnb_orders array');
    assert.strictEqual(responseData.fnb_orders.length, 1, 'Harus ada 1 order fnb');
    assert.strictEqual(responseData.fnb_orders[0].items.length, 1, 'Harus ada 1 order item');
    assert.strictEqual(responseData.fnb_orders[0].items[0].menu_name, 'Sampoerna Mild 16');

    assert(Array.isArray(responseData.lc_details), 'Response harus mengembalikan lc_details');
    assert.strictEqual(responseData.lc_details.length, 1, 'Harus ada 1 LC di lc_details');
    assert.strictEqual(responseData.lc_details[0].lc_name, 'Bella');

    console.log('  ✓ Test 1 PASSED: Stok Sampoerna Mild terpotong, mutasi tercatat, order F&B tersimpan, dan LC work log terhubung!');
  }

  // Test 2: Bonus Sales LC & Package Details Stock Deduction
  {
    console.log('\n  Testing Test 2: Bonus sales LC & Room package component stock deduction...');
    const executedQueries = [];
    let beerStock = 50;

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };
        if (trimmedSql.includes('SELECT * FROM transactions WHERE idempotency_key = $1')) return { rows: [], rowCount: 0 };
        
        if (trimmedSql.includes('SELECT * FROM rooms WHERE room_id = $1')) {
          return {
            rows: [{ room_id: 'ROOM-VIP', room_name: 'VIP Room', rate_per_hour: 150000 }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM package_master WHERE package_id = $1 AND status = $2')) {
          return {
            rows: [{ package_id: 'PKG-BEER-01', package_name: 'Paket Beer Holic', selling_price: 350000 }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM menu WHERE menu_id = $1 AND status = $2')) {
          return {
            rows: [{
              menu_id: 'MENU-BEER-BUCKET',
              menu_name: 'Beer Bucket 4 Btl',
              category: 'Beer',
              price: 180000,
              stock_tracking: 'no',
              stock_item_id: null,
              bonus_sales_lc: 10000, // Bonus Rp 10.000 untuk LC
              status: 'active'
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT lc_id, lc_name, rate_per_hour FROM lc_master WHERE lc_id = $1 AND status = $2')) {
          return {
            rows: [{ lc_id: 'LC-02', lc_name: 'Citra', rate_per_hour: 150000, status: 'active' }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('FROM package_details')) {
          return {
            rows: [
              {
                component_ref_id: 'INV-BEER-HEIN',
                component_name: 'Heineken 330ml',
                qty: 4,
                unit: 'Btl',
                component_type: 'raw'
              }
            ],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [{ stock_item_id: 'INV-BEER-HEIN', stock_item_name: 'Heineken 330ml', stock_qty: beerStock }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('UPDATE inventory SET stock_qty = $1')) {
          beerStock = params[0];
          return { rowCount: 1 };
        }

        if (trimmedSql.includes('SELECT r.*, i.stock_item_name FROM recipe r JOIN inventory i')) {
          return { rows: [], rowCount: 0 };
        }

        return { rows: [], rowCount: 1 };
      },
      release: () => {}
    };

    const origConnect = db.pool.connect;
    const origQuery = db.query;
    db.pool.connect = async () => mockClient;
    db.query = async (sql, params) => mockClient.query(sql, params);

    let responseData = null;
    const mockRes = {
      status: (code) => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    const payload = {
      idempotency_key: `manual-pkg-${Date.now()}`,
      mode: 'room',
      room_id: 'ROOM-VIP',
      package_id: 'PKG-BEER-01',
      duration_minutes: 120,
      start_time: '2026-09-14T02:00:00.000Z',
      operational_date: '2026-09-13',
      cashier_name: 'Kasir Rudi',
      entered_by: 'Owner Hendra',
      source_note: 'Nota manual paket beer',
      payment_method: 'cash',
      payment_status: 'paid',
      fnb_items: [
        { menu_id: 'MENU-BEER-BUCKET', quantity: 1 }
      ],
      lc_assignments: [
        { lc_id: 'LC-02', duration_minutes: 120 }
      ]
    };

    try {
      await createManualOutageTransaction({}, mockRes, payload);
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response harus ok: true');

    // Verifikasi stok komponen paket terpotong
    assert.strictEqual(beerStock, 46, 'Stok Heineken komponen paket harus terpotong 4 (50 - 4 = 46)');

    // Verifikasi lc_sales_bonus_logs dicatat
    const bonusQuery = executedQueries.find(q => q.sql.includes('INSERT INTO lc_sales_bonus_logs'));
    assert(bonusQuery, 'Harus mencatat lc_sales_bonus_logs');
    assert.strictEqual(bonusQuery.params[7], 'LC-02', 'lc_id harus LC-02');
    assert.strictEqual(bonusQuery.params[10], 10000, 'bonus_total harus Rp 10.000');

    console.log('  ✓ Test 2 PASSED: Stok komponen paket room terpotong & bonus sales LC tercatat!');
  }

  console.log('\n🎉 ALL MANUAL TRANSACTION STOCK & LC TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test execution error:', err);
  process.exit(1);
});
