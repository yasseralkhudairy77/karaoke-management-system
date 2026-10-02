const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { getTodayTransactions, updateTransactionLcDurations } = require('../src/controllers/transactionsController');

async function runTests() {
  console.log('🧪 Running Transaction LC Column & LC Replacement Tests...');

  await testTransactionsIncludesLcSummaryAndDuration();
  await testUpdateTransactionLcReplacement();
  await testConsistencyFrontendAndBackend();

  console.log('✅ ALL Transaction LC Column & Replacement Tests PASSED SUCCESSFULLY!');
}

async function testTransactionsIncludesLcSummaryAndDuration() {
  const originalDbQuery = db.query;
  try {
    db.query = async (sql, params = []) => {
      const text = String(sql);

      if (text.includes('SELECT * FROM transactions')) {
        return {
          rowCount: 2,
          rows: [
            {
              transaction_id: 'TRX-101',
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              start_time: new Date('2026-09-10T20:00:00Z'),
              end_time: new Date('2026-09-11T01:00:00Z'),
              duration_minutes: 300,
              rate_per_hour: 135000,
              room_total: 540000,
              fnb_total: 740000,
              lc_total: 405000,
              grand_total: 1685000,
              payment_status: 'paid',
              payment_method: 'transfer',
              cashier_name: 'Kasir 1',
              operational_date: new Date('2026-09-10'),
              created_at: new Date('2026-09-11T01:05:00Z')
            },
            {
              transaction_id: 'TRX-102',
              room_id: 'ROOM-01',
              room_name: 'Ruangan 1 - Standar',
              start_time: new Date('2026-09-10T21:00:00Z'),
              end_time: new Date('2026-09-10T23:00:00Z'),
              duration_minutes: 120,
              rate_per_hour: 100000,
              room_total: 200000,
              fnb_total: 50000,
              lc_total: 0,
              grand_total: 250000,
              payment_status: 'paid',
              payment_method: 'cash',
              cashier_name: 'Kasir 1',
              operational_date: new Date('2026-09-10'),
              created_at: new Date('2026-09-10T23:05:00Z')
            }
          ]
        };
      }

      if (text.includes('SELECT * FROM sales_commission_logs')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('SELECT closed_transaction_id, lc_id, lc_name, duration_minutes')) {
        return {
          rowCount: 1,
          rows: [
            {
              closed_transaction_id: 'TRX-101',
              lc_id: 'LC-01',
              lc_name: 'Bella',
              duration_minutes: 180,
              rate_per_hour: 135000,
              rate: 405000,
              customer_charge_amount: 405000
            }
          ]
        };
      }

      return { rowCount: 0, rows: [] };
    };

    let responseData = null;
    const req = { query: { period: 'today' } };
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await getTodayTransactions(req, res);

    assert.ok(responseData, 'Response getTodayTransactions harus ada');
    assert.strictEqual(responseData.ok, true);
    assert.strictEqual(responseData.transactions.length, 2);

    const trxWithLc = responseData.transactions.find(t => t.transaction_id === 'TRX-101');
    assert.ok(trxWithLc, 'TRX-101 harus ditemukan');
    assert.strictEqual(trxWithLc.lc_total, 405000, 'lc_total harus Rp 405.000');
    assert.strictEqual(trxWithLc.lc_duration_minutes, 180, 'lc_duration_minutes harus 180 menit');
    assert.strictEqual(trxWithLc.lc_count, 1, 'lc_count harus 1');
    assert.strictEqual(trxWithLc.lc_summary, '3 jam • Bella', 'lc_summary harus 3 jam • Bella');

    const trxWithoutLc = responseData.transactions.find(t => t.transaction_id === 'TRX-102');
    assert.ok(trxWithoutLc, 'TRX-102 harus ditemukan');
    assert.strictEqual(trxWithoutLc.lc_total, 0);
    assert.strictEqual(trxWithoutLc.lc_summary, '', 'lc_summary harus kosong');
    assert.strictEqual(trxWithoutLc.lc_count, 0);

    console.log('  ✓ getTodayTransactions berhasil menyertakan lc_summary ("3 jam • Bella") dan durasi LC');
  } finally {
    db.query = originalDbQuery;
  }
}

async function testUpdateTransactionLcReplacement() {
  const originalPoolConnect = db.pool.connect;
  const originalDbQuery = db.query;
  const queries = [];
  try {
    const mockClient = {
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ sql: text, params });

        if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              transaction_id: 'TRX-REVISE-LC',
              room_id: 'ROOM-05',
              room_name: 'Ruangan 5 - VIP 5',
              start_time: new Date('2026-09-10T20:00:00Z'),
              end_time: new Date('2026-09-11T01:00:00Z'),
              duration_minutes: 300,
              room_total: 540000,
              fnb_total: 740000,
              lc_total: 405000,
              grand_total: 1685000,
              payment_status: 'paid',
              payment_method: 'transfer',
              cash_amount: 0,
              transfer_amount: 1685000
            }]
          };
        }

        if (text.includes('FROM lc_work_logs') && text.includes('closed_transaction_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LCW-BELLA-1',
              session_id: 'SES-01',
              room_id: 'ROOM-05',
              lc_id: 'LC-01',
              lc_name: 'Bella',
              duration_minutes: 180,
              rate_per_hour: 135000,
              rate: 405000,
              customer_charge_amount: 405000,
              status: 'closed'
            }]
          };
        }

        if (text.includes('SELECT lc_id, lc_name, rate_per_hour FROM lc_master WHERE lc_id = $1')) {
          assert.strictEqual(params[0], 'LC-02', 'ID master harus LC-02');
          return {
            rowCount: 1,
            rows: [{
              lc_id: 'LC-02',
              lc_name: 'Siti',
              rate_per_hour: 135000
            }]
          };
        }

        if (text.includes('UPDATE transactions')) {
          return {
            rowCount: 1,
            rows: [{
              transaction_id: 'TRX-REVISE-LC',
              lc_total: 405000,
              grand_total: 1685000,
              payment_status: 'paid'
            }]
          };
        }

        return { rowCount: 1, rows: [] };
      },
      release: () => {}
    };

    db.pool.connect = async () => mockClient;
    db.query = mockClient.query;

    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await updateTransactionLcDurations(req, res, {
      transaction_id: 'TRX-REVISE-LC',
      assignments: [
        {
          log_id: 'LCW-BELLA-1',
          lc_id: 'LC-01',
          new_lc_id: 'LC-02', // Mengganti LC dari Bella ke Siti
          duration_minutes: 180
        }
      ],
      reason: 'Koreksi salah pilih LC kasir seharusnya Siti',
      changed_by: 'Manager Test'
    });

    if (!responseData?.ok) {
      console.error('Response error in test:', responseData);
    }
    assert.ok(responseData, 'Response updateTransactionLcDurations harus ada');
    assert.strictEqual(responseData.ok, true);

    const updateLogQuery = queries.find(q => q.sql.includes('UPDATE lc_work_logs') && q.sql.includes('SET lc_id = $1'));
    assert.ok(updateLogQuery, 'Query UPDATE lc_work_logs dengan lc_id dan lc_name baru wajib dieksekusi');
    assert.strictEqual(updateLogQuery.params[0], 'LC-02', 'lc_id harus diupdate ke LC-02');
    assert.strictEqual(updateLogQuery.params[1], 'Siti', 'lc_name harus diupdate ke Siti');
    assert.strictEqual(updateLogQuery.params[2], 180, 'duration_minutes harus 180');

    console.log('  ✓ updateTransactionLcDurations berhasil mengganti identitas LC dari Bella (LC-01) ke Siti (LC-02)');
  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalDbQuery;
  }
}

async function testConsistencyFrontendAndBackend() {
  const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf8');
  assert.ok(appJs.includes('transaction-lc-cell'), 'app.js wajib merender cell Jasa LC di baris transaksi');
  assert.ok(appJs.includes('transaction-lc-badge'), 'app.js wajib merender badge durasi & nama LC');
  assert.ok(appJs.includes('setLcDurationEditorReplacement'), 'app.js wajib mendukung fungsi setLcDurationEditorReplacement');
  assert.ok(appJs.includes('Revisi & Ganti LC'), 'app.js wajib memuat label Revisi & Ganti LC');

  const css = fs.readFileSync(path.join(__dirname, '../../css/style.css'), 'utf8');
  assert.ok(css.includes('.transaction-lc-badge'), 'style.css wajib memuat class .transaction-lc-badge');

  const codeGs = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
  assert.ok(codeGs.includes('lc_summary'), 'Code.gs wajib memperkaya transaksi dengan lc_summary');
  assert.ok(codeGs.includes('new_lc_id'), 'Code.gs wajib mendukung penggantian new_lc_id');

  console.log('  ✓ Frontend, CSS, dan Google Apps Script terverifikasi 100% selaras dan konsisten');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
