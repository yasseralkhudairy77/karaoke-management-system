const assert = require('assert');
const { deleteTransaction } = require('../src/controllers/transactionsController');
const { cancelBooking } = require('../src/controllers/roomsController');
const db = require('../src/db');

async function runTests() {
  console.log('🧪 Running Delete Transaction Stock Restoration & Cancellation Tests...\n');

  // Test 1: User Incident Simulation - Transaksi Manual (Rokok stok 8 -> 7 -> batal -> kembali 8)
  {
    console.log('  Testing Test 1: Manual transaction cancellation restores F&B inventory stock (8 -> 7 -> 8)...');
    const executedQueries = [];
    let rokokStock = 7; // Kondisi saat transaksi sudah terjadi: stok berkurang jadi 7

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };
        if (trimmedSql.includes('ensureTransactionCorrectionSchema') || trimmedSql.includes('CREATE TABLE')) return { rowCount: 1 };

        if (trimmedSql.includes('FROM employees')) {
          return {
            rows: [{
              employee_id: 'EMP-OWNER-01',
              employee_name: 'Owner Hendra',
              role: 'owner',
              pin: '123456',
              pin_hash: null
            }],
            rowCount: 1
          };
        }

        // Query transaksi lama
        if (trimmedSql.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
          return {
            rows: [{
              transaction_id: 'TRX-MANUAL-01',
              room_id: 'ROOM-VIP-3',
              room_name: 'Ruangan 3 - VIP 3',
              grand_total: 1230000,
              payment_status: 'paid',
              payment_method: 'cash',
              fnb_order_ids: 'FNB-M-001',
              booking_mode: 'regular',
              package_id: null,
              promo_code: null
            }],
            rowCount: 1
          };
        }

        // UPDATE transactions
        if (trimmedSql.includes('UPDATE transactions')) {
          return {
            rows: [{
              transaction_id: 'TRX-MANUAL-01',
              payment_status: 'cancelled'
            }],
            rowCount: 1
          };
        }

        // restoreStockForFnbOrders: ambil item yang terpotong
        if (trimmedSql.includes('FROM fnb_order_items foi') && trimmedSql.includes('JOIN menu m')) {
          return {
            rows: [{
              order_item_id: 'ITEM-ROKOK-01',
              order_id: 'FNB-M-001',
              menu_id: 'MENU-ROKOK-A',
              quantity: 1,
              stock_tracking: 'yes',
              stock_item_id: 'INV-ROKOK-A',
              stock_qty_per_unit: 1,
              menu_name: 'Rokok A',
              stock_deducted: true,
              is_voided: false
            }],
            rowCount: 1
          };
        }

        // Inventory lookup FOR UPDATE
        if (trimmedSql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [{
              stock_item_id: 'INV-ROKOK-A',
              stock_item_name: 'Rokok A',
              stock_qty: rokokStock
            }],
            rowCount: 1
          };
        }

        // UPDATE inventory
        if (trimmedSql.includes('UPDATE inventory SET stock_qty = $1')) {
          rokokStock = params[0];
          return { rowCount: 1 };
        }

        // Snapshot komponen recipe
        if (trimmedSql.includes('FROM fnb_order_item_components')) {
          return { rows: [], rowCount: 0 };
        }
        if (trimmedSql.includes('SELECT * FROM recipe WHERE menu_id = $1')) {
          return { rows: [], rowCount: 0 };
        }

        // Stock movements insert
        if (trimmedSql.includes('INSERT INTO stock_movements')) {
          return { rowCount: 1 };
        }

        // Update fnb_order_items stock_deducted = false
        if (trimmedSql.includes('UPDATE fnb_order_items SET stock_deducted = FALSE')) {
          return { rowCount: 1 };
        }

        // Update fnb_orders status = cancelled
        if (trimmedSql.includes('UPDATE fnb_orders')) {
          return { rowCount: 1 };
        }

        // LC work logs update cancelled
        if (trimmedSql.includes('UPDATE lc_work_logs')) {
          return { rowCount: 1 };
        }

        // LC sales bonus logs update voided
        if (trimmedSql.includes('UPDATE lc_sales_bonus_logs')) {
          return { rowCount: 1 };
        }

        // Sales commission delete
        if (trimmedSql.includes('DELETE FROM sales_commission_logs')) {
          return { rowCount: 1 };
        }

        // Transaction correction log insert
        if (trimmedSql.includes('INSERT INTO transaction_correction_logs')) {
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

        // Refresh closing snapshot
        if (trimmedSql.includes('SELECT closing_id FROM cashier_closings')) {
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
      status: () => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    try {
      await deleteTransaction({}, mockRes, {
        transaction_id: 'TRX-MANUAL-01',
        reason: 'Salah input transaksi manual oleh kasir',
        confirmation: 'HAPUS',
        owner_pin: '123456',
        changed_by: 'Owner Hendra'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response deleteTransaction harus ok: true');
    assert.strictEqual(rokokStock, 8, 'Stok Rokok A harus kembali menjadi 8 (7 + 1 = 8)!');

    // Verifikasi mutasi pemulihan stok
    const restoreMovement = executedQueries.find(q =>
      q.sql.includes('INSERT INTO stock_movements') && q.sql.includes("'in'")
    );
    assert(restoreMovement, 'Harus mencatat mutasi masuk (in) ke stock_movements');
    assert.strictEqual(restoreMovement.params[1], 'INV-ROKOK-A');
    assert.strictEqual(restoreMovement.params[4], 1, 'qty_change harus +1');
    assert.strictEqual(restoreMovement.params[5], 7, 'stock_before harus 7');
    assert.strictEqual(restoreMovement.params[6], 8, 'stock_after harus 8');

    // Verifikasi fnb_orders diupdate menjadi cancelled
    const cancelOrderQuery = executedQueries.find(q =>
      q.sql.includes('UPDATE fnb_orders') && q.sql.includes("order_status = 'cancelled'")
    );
    assert(cancelOrderQuery, 'Harus mengupdate status fnb_orders menjadi cancelled');

    console.log('  ✓ Test 1 PASSED: Stok Rokok A berhasil dipulihkan dari 7 menjadi 8 dan mutasi tercatat!');
  }

  // Test 2: Pembatalan Transaksi Paket Room memulihkan komponen paket
  {
    console.log('\n  Testing Test 2: Room package cancellation restores package component stock...');
    const executedQueries = [];
    let heinekenStock = 46;

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };
        if (trimmedSql.includes('ensureTransactionCorrectionSchema') || trimmedSql.includes('CREATE TABLE')) return { rowCount: 1 };

        if (trimmedSql.includes('FROM employees')) {
          return {
            rows: [{
              employee_id: 'EMP-OWNER-01',
              employee_name: 'Owner Hendra',
              role: 'owner',
              pin: '123456',
              pin_hash: null
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
          return {
            rows: [{
              transaction_id: 'TRX-PKG-01',
              room_id: 'ROOM-VIP',
              room_name: 'VIP Room',
              grand_total: 500000,
              payment_status: 'paid',
              booking_mode: 'package',
              package_id: 'PKG-BEER-01',
              package_name: 'Paket Beer Holic',
              fnb_order_ids: '',
              promo_code: null
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('UPDATE transactions')) {
          return { rows: [{ transaction_id: 'TRX-PKG-01', payment_status: 'cancelled' }], rowCount: 1 };
        }

        // Package details query
        if (trimmedSql.includes('FROM package_details')) {
          return {
            rows: [{
              component_ref_id: 'INV-HEINEKEN',
              component_name: 'Heineken 330ml',
              qty: 4,
              unit: 'botol',
              component_type: 'inventory'
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [{ stock_item_id: 'INV-HEINEKEN', stock_item_name: 'Heineken 330ml', stock_qty: heinekenStock }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('UPDATE inventory SET stock_qty = $1')) {
          heinekenStock = params[0];
          return { rowCount: 1 };
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
      status: () => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    try {
      await deleteTransaction({}, mockRes, {
        transaction_id: 'TRX-PKG-01',
        reason: 'Tamu batal check in paket',
        confirmation: 'HAPUS',
        owner_pin: '123456',
        changed_by: 'Owner Hendra'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response harus ok: true');
    assert.strictEqual(heinekenStock, 50, 'Stok Heineken komponen paket harus kembali menjadi 50 (46 + 4 = 50)!');

    const pkgRestoreMov = executedQueries.find(q =>
      q.sql.includes('INSERT INTO stock_movements') && q.params[1] === 'INV-HEINEKEN' && q.sql.includes("'in'")
    );
    assert(pkgRestoreMov, 'Harus mencatat mutasi masuk komponen paket ke stock_movements');
    assert.strictEqual(pkgRestoreMov.params[4], 4, 'qty_change komponen paket harus +4');
    assert.strictEqual(pkgRestoreMov.params[5], 46, 'stock_before komponen paket harus 46');
    assert.strictEqual(pkgRestoreMov.params[6], 50, 'stock_after komponen paket harus 50');

    console.log('  ✓ Test 2 PASSED: Komponen paket room berhasil dipulihkan ke stok (46 -> 50)!');
  }

  // Test 3: Pembatalan transaksi membatalkan LC Work Logs & LC Sales Bonus & Promo
  {
    console.log('\n  Testing Test 3: Transaction cancellation voids LC work logs, bonus logs, and releases promo...');
    const executedQueries = [];

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };
        if (trimmedSql.includes('ensureTransactionCorrectionSchema') || trimmedSql.includes('CREATE TABLE')) return { rowCount: 1 };

        if (trimmedSql.includes('FROM employees')) {
          return {
            rows: [{
              employee_id: 'EMP-OWNER-01',
              employee_name: 'Owner Hendra',
              role: 'owner',
              pin: '123456',
              pin_hash: null
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE')) {
          return {
            rows: [{
              transaction_id: 'TRX-LC-PROMO-01',
              room_id: 'ROOM-VIP-3',
              grand_total: 900000,
              payment_status: 'paid',
              booking_mode: 'regular',
              package_id: null,
              fnb_order_ids: '',
              promo_code: 'VCH100K'
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('UPDATE transactions')) {
          return { rows: [{ transaction_id: 'TRX-LC-PROMO-01', payment_status: 'cancelled' }], rowCount: 1 };
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
      status: () => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    try {
      await deleteTransaction({}, mockRes, {
        transaction_id: 'TRX-LC-PROMO-01',
        reason: 'Transaksi duplikat sistem',
        confirmation: 'HAPUS',
        owner_pin: '123456',
        changed_by: 'Owner Hendra'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response harus ok: true');

    // Cek lc_work_logs dibatalkan
    const cancelLcQuery = executedQueries.find(q =>
      q.sql.includes('UPDATE lc_work_logs') && q.sql.includes("status = 'cancelled'")
    );
    assert(cancelLcQuery, 'lc_work_logs harus diupdate menjadi status cancelled');

    // Cek lc_sales_bonus_logs dibatalkan
    const voidBonusQuery = executedQueries.find(q =>
      q.sql.includes('UPDATE lc_sales_bonus_logs') && q.sql.includes("source_status = 'voided'")
    );
    assert(voidBonusQuery, 'lc_sales_bonus_logs harus diupdate menjadi voided');

    // Cek promo dibebaskan
    const releasePromoQuery = executedQueries.find(q =>
      q.sql.includes('UPDATE promos') && q.sql.includes('used_in_transaction_id = NULL')
    );
    assert(releasePromoQuery, 'Promo voucher harus dibebaskan kembali');

    console.log('  ✓ Test 3 PASSED: LC work log dibatalkan, bonus sales di-void, dan voucher promo dibebaskan!');
  }

  // Test 4: cancelBooking kamar memulihkan stok pesanan F&B open
  {
    console.log('\n  Testing Test 4: cancelBooking restores stock for open F&B orders in room...');
    const executedQueries = [];
    let snackStock = 5;

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };

        if (trimmedSql.includes('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE')) {
          return {
            rows: [{
              room_id: 'ROOM-02',
              room_name: 'Room 02',
              status: 'paid_waiting_start'
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT order_id FROM fnb_orders WHERE room_id = $1 AND order_status = \'open\' FOR UPDATE')) {
          return {
            rows: [{ order_id: 'FNB-OPEN-01' }],
            rowCount: 1
          };
        }

        // restoreStockForFnbOrders query
        if (trimmedSql.includes('FROM fnb_order_items foi') && trimmedSql.includes('JOIN menu m')) {
          return {
            rows: [{
              order_item_id: 'ITEM-SNACK-01',
              order_id: 'FNB-OPEN-01',
              menu_id: 'MENU-SNACK-01',
              quantity: 2,
              stock_tracking: 'yes',
              stock_item_id: 'INV-SNACK-01',
              stock_qty_per_unit: 1,
              menu_name: 'Mix Snack',
              stock_deducted: true,
              is_voided: false
            }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE')) {
          return {
            rows: [{ stock_item_id: 'INV-SNACK-01', stock_item_name: 'Mix Snack', stock_qty: snackStock }],
            rowCount: 1
          };
        }

        if (trimmedSql.includes('UPDATE inventory SET stock_qty = $1')) {
          snackStock = params[0];
          return { rowCount: 1 };
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
      status: () => mockRes,
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    try {
      await cancelBooking({}, mockRes, {
        room_id: 'ROOM-02',
        reason: 'Tamu membatalkan kedatangan',
        changed_by: 'Kasir Budi'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response cancelBooking harus ok: true');
    assert.strictEqual(snackStock, 7, 'Stok Mix Snack harus dipulihkan dari 5 menjadi 7 (5 + 2 = 7)!');

    console.log('  ✓ Test 4 PASSED: cancelBooking memulihkan stok pesanan F&B open!');
  }

  console.log('\n🎉 ALL DELETE TRANSACTION & CANCELLATION STOCK RESTORATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test execution error:', err);
  process.exit(1);
});
