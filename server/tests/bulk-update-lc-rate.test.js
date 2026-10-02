const assert = require('assert');
const { bulkUpdateLcRate } = require('../src/controllers/masterDataController');
const db = require('../src/db');

async function runTests() {
  console.log('🧪 Running Bulk Update LC Rate Tests...\n');

  // Test 1: Menolak jika PIN kosong atau tidak valid
  {
    console.log('  Testing Test 1: Reject missing or invalid PIN...');
    let responseData = null;
    const mockRes = {
      status: () => mockRes,
      json: (data) => { responseData = data; return data; }
    };

    const origQuery = db.query;
    db.query = async (sql) => {
      if (sql.includes('FROM employees')) {
        return { rows: [{ employee_id: 'EMP-01', employee_name: 'Manager', role: 'manager', pin: '123456', pin_hash: null }] };
      }
      return { rows: [] };
    };

    try {
      // PIN kosong
      await bulkUpdateLcRate({}, mockRes, { rate_per_hour: 130000 });
      assert(responseData && !responseData.ok, 'Harus gagal jika PIN kosong');
      assert.strictEqual(responseData.error, 'PIN Manager/Owner wajib diisi.');

      // PIN salah
      responseData = null;
      await bulkUpdateLcRate({}, mockRes, { rate_per_hour: 130000, admin_pin: '999999' });
      assert(responseData && !responseData.ok, 'Harus gagal jika PIN salah');
      assert.strictEqual(responseData.error, 'PIN Manager/Owner tidak valid.');

      console.log('  ✓ Test 1 PASSED: Validasi PIN Manager/Owner berfungsi.');
    } finally {
      db.query = origQuery;
    }
  }

  // Test 2: Menolak jika tarif <= 0
  {
    console.log('\n  Testing Test 2: Reject invalid rate (rate <= 0)...');
    let responseData = null;
    const mockRes = {
      status: () => mockRes,
      json: (data) => { responseData = data; return data; }
    };

    await bulkUpdateLcRate({}, mockRes, { rate_per_hour: 0, admin_pin: '123456' });
    assert(responseData && !responseData.ok, 'Harus gagal jika tarif 0');
    assert.strictEqual(responseData.error, 'Tarif per jam harus berupa angka dan lebih besar dari 0.');

    responseData = null;
    await bulkUpdateLcRate({}, mockRes, { rate_per_hour: -50000, admin_pin: '123456' });
    assert(responseData && !responseData.ok, 'Harus gagal jika tarif negatif');
    assert.strictEqual(responseData.error, 'Tarif per jam harus berupa angka dan lebih besar dari 0.');

    console.log('  ✓ Test 2 PASSED: Validasi tarif per jam berfungsi.');
  }

  // Test 3 & 4 & 5: Sukses mengubah tarif LC aktif secara massal (120rb -> 135rb)
  {
    console.log('\n  Testing Test 3: Successfully bulk update active LCs to new rate (e.g. Weekend rate 135.000)...');
    const executedQueries = [];
    const lcsData = [
      { lc_id: 'LC-001', lc_name: 'Dewi', rate_per_hour: 120000, status: 'active' },
      { lc_id: 'LC-002', lc_name: 'Sinta', rate_per_hour: 120000, status: 'active' },
      { lc_id: 'LC-003', lc_name: 'Bella', rate_per_hour: 120000, status: 'active' },
      { lc_id: 'LC-004', lc_name: 'Maya', rate_per_hour: 120000, status: 'inactive' }
    ];

    const mockClient = {
      query: async (sql, params = []) => {
        const trimmedSql = sql.trim();
        executedQueries.push({ sql: trimmedSql, params });

        if (trimmedSql === 'BEGIN' || trimmedSql === 'COMMIT' || trimmedSql === 'ROLLBACK') return { rowCount: 1 };

        if (trimmedSql.includes('FROM employees')) {
          return {
            rows: [{ employee_id: 'EMP-MGR-01', employee_name: 'Pak Rudi (Manager)', role: 'manager', pin: '123456', pin_hash: null }]
          };
        }

        if (trimmedSql.includes('UPDATE lc_master SET rate_per_hour = $1')) {
          const newRate = params[0];
          const updatedRows = [];
          for (const lc of lcsData) {
            if (trimmedSql.includes("WHERE status = 'active'") && lc.status !== 'active') {
              continue;
            }
            lc.rate_per_hour = newRate;
            updatedRows.push({ ...lc });
          }
          return { rows: updatedRows, rowCount: updatedRows.length };
        }

        if (trimmedSql.includes('INSERT INTO master_data_audit_logs')) {
          return { rowCount: 1 };
        }

        if (trimmedSql.includes('INSERT INTO sync_outbox')) {
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
      json: (data) => { responseData = data; return data; }
    };

    try {
      await bulkUpdateLcRate({}, mockRes, {
        rate_per_hour: 135000,
        admin_pin: '123456',
        changed_by: 'Pak Rudi (Manager)',
        reason: 'Penerapan tarif Weekend'
      });
    } finally {
      db.pool.connect = origConnect;
      db.query = origQuery;
    }

    assert(responseData && responseData.ok, 'Response harus ok: true');
    assert.strictEqual(responseData.updated_count, 3, 'Harus memperbarui tepat 3 LC aktif');
    assert.strictEqual(responseData.rate_per_hour, 135000, 'Tarif di response harus 135000');

    // Cek bahwa hanya LC aktif yang terupdate ke 135000
    assert.strictEqual(lcsData[0].rate_per_hour, 135000, 'LC 1 aktif harus menjadi 135000');
    assert.strictEqual(lcsData[1].rate_per_hour, 135000, 'LC 2 aktif harus menjadi 135000');
    assert.strictEqual(lcsData[2].rate_per_hour, 135000, 'LC 3 aktif harus menjadi 135000');
    assert.strictEqual(lcsData[3].rate_per_hour, 120000, 'LC 4 non-aktif tetap 120000');

    // Cek pencatatan audit log
    const auditQuery = executedQueries.find(q => q.sql.includes('INSERT INTO master_data_audit_logs'));
    assert(auditQuery, 'Harus mencatat log audit ke master_data_audit_logs');
    assert(auditQuery.params.includes('bulk_update_rate'), 'Action type harus bulk_update_rate');

    // Cek sync outbox
    const syncQueries = executedQueries.filter(q => q.sql.includes('INSERT INTO sync_outbox'));
    assert.strictEqual(syncQueries.length, 3, 'Harus mencatat 3 entri ke sync_outbox');

    console.log('  ✓ Test 3 PASSED: Seluruh LC aktif berhasil diperbarui ke tarif Weekend 135.000!');
  }

  console.log('\n🎉 ALL BULK UPDATE LC RATE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test execution error:', err);
  process.exit(1);
});
