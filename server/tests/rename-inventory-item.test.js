const assert = require('assert');
const { renameInventoryItem } = require('../src/controllers/inventoryController');
const db = require('../src/db');

async function runTests() {
  console.log('🧪 Running Rename Inventory Item & Menu Synchronization Tests...\n');

  // Test 1: Mengubah nama item stok dan sinkronisasi ke tabel menu & package_details
  {
    console.log('  Testing Test 1: Rename "MB Merah" -> "Marlboro Merah" with menu sync...');
    const executedQueries = [];
    let currentInventoryName = 'MB Merah';
    let currentMenuName = 'MB Merah';

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') {
          return { rowCount: 1 };
        }

        // Select inventory FOR UPDATE
        if (trimmedSql.includes('SELECT stock_item_id, stock_item_name') && trimmedSql.includes('FROM inventory')) {
          return {
            rows: [
              {
                stock_item_id: 'INV-ROKOK-01',
                stock_item_name: currentInventoryName,
                category: 'Cigarette',
                unit: 'pack',
                status: 'active'
              }
            ],
            rowCount: 1
          };
        }

        // Update inventory name
        if (trimmedSql.includes('UPDATE inventory SET stock_item_name = $1')) {
          currentInventoryName = params[0];
          return { rowCount: 1 };
        }

        // Update menu name
        if (trimmedSql.includes('UPDATE menu SET menu_name = $1')) {
          currentMenuName = params[0];
          return {
            rows: [{ menu_id: 'MENU-ROKOK-01', menu_name: params[0] }],
            rowCount: 1
          };
        }

        // Update package_details
        if (trimmedSql.includes('UPDATE package_details SET component_name = $1')) {
          return { rowCount: 0 };
        }

        // Audit log insert
        if (trimmedSql.includes('INSERT INTO master_data_audit_logs')) {
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

    try {
      await renameInventoryItem({}, mockRes, {
        stock_item_id: 'INV-ROKOK-01',
        new_name: 'Marlboro Merah',
        changed_by: 'Owner Hendra'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData, 'Response data harus ada');
    assert.strictEqual(responseData.ok, true, 'Response ok harus true');
    assert.strictEqual(responseData.old_name, 'MB Merah', 'old_name harus MB Merah');
    assert.strictEqual(responseData.new_name, 'Marlboro Merah', 'new_name harus Marlboro Merah');
    assert.strictEqual(responseData.updated_menus_count, 1, 'Harus mensinkronkan 1 menu terkait');
    assert.strictEqual(currentInventoryName, 'Marlboro Merah', 'Nama di tabel inventory harus terupdate');
    assert.strictEqual(currentMenuName, 'Marlboro Merah', 'Nama di tabel menu harus otomatis terupdate');

    // Cek kueri audit log
    const auditQuery = executedQueries.find(q => q.sql.includes('INSERT INTO master_data_audit_logs'));
    assert(auditQuery, 'Audit log master data harus dicatat');
    assert.strictEqual(auditQuery.params[4], 'rename_item');

    console.log('  ✓ Test 1 PASSED: Nama inventory terupdate, menu otomatis tersinkronkan, audit log tercatat!');
  }

  // Test 2: Validasi input (nama kosong & item tidak ditemukan)
  {
    console.log('\n  Testing Test 2: Validation checks for empty name and non-existent item...');

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM inventory')) return { rows: [], rowCount: 0 };
        return { rowCount: 1 };
      },
      release: () => {}
    };

    const origConnect = db.pool.connect;
    const origQuery = db.query;
    db.pool.connect = async () => mockClient;
    db.query = async (sql, params) => mockClient.query(sql, params);

    let res1 = null;
    const mockRes1 = {
      status: () => mockRes1,
      json: (d) => { res1 = d; return d; }
    };

    // Nama kosong
    await renameInventoryItem({}, mockRes1, {
      stock_item_id: 'INV-01',
      new_name: ' '
    });
    assert.strictEqual(res1.ok, false);
    assert(res1.error.includes('minimal 2 karakter'), 'Harus menolak nama kosong');

    // Item tidak ditemukan
    let res2 = null;
    const mockRes2 = {
      status: () => mockRes2,
      json: (d) => { res2 = d; return d; }
    };

    await renameInventoryItem({}, mockRes2, {
      stock_item_id: 'INV-NONEXIST',
      new_name: 'Item Baru'
    });
    assert.strictEqual(res2.ok, false);
    assert(res2.error.includes('tidak ditemukan'), 'Harus mengembalikan error tidak ditemukan');

    db.pool.connect = origConnect;
    db.query = origQuery;

    console.log('  ✓ Test 2 PASSED: Validasi nama kosong & item tidak ditemukan berjalan tepat!');
  }

  console.log('\n🎉 ALL RENAME INVENTORY ITEM TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test execution error:', err);
  process.exit(1);
});
