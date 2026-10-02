const assert = require('assert');
const path = require('path');
const db = require('../src/db');
const { updateTransactionLcDurations } = require('../src/controllers/transactionsController');

async function testLcDurationCorrectionReceiptPrint() {
  console.log('🧪 Testing LC Duration Correction from 4h to 3h in Receipt Print...');

  const receiptModulePath = path.resolve(__dirname, '../../js/receipt.js');
  const { buildReceiptData, formatReceipt58mm } = await import('file://' + receiptModulePath.replace(/\\/g, '/'));

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
              transaction_id: 'TRX-LC-CORRECTION-01',
              room_id: 'ROOM-VIP-4',
              room_name: 'VIP 4',
              start_time: new Date('2026-09-11T20:00:00Z'),
              end_time: new Date('2026-09-12T00:00:00Z'),
              duration_minutes: 240, // 4 jam
              room_total: 400000,
              fnb_total: 150000,
              lc_total: 400000, // 4 jam x 100.000
              grand_total: 950000,
              payment_status: 'paid',
              payment_method: 'cash',
              cash_amount: 950000,
              transfer_amount: 0,
              booking_mode: 'regular'
            }]
          };
        }

        if (text.includes('FROM lc_work_logs') && text.includes('closed_transaction_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              log_id: 'LOG-LC-LENI-1',
              session_id: 'SES-VIP4',
              room_id: 'ROOM-VIP-4',
              room_name: 'VIP 4',
              lc_id: 'LC-LENI',
              lc_name: 'Leni',
              duration_minutes: 240, // awal 4 jam
              rate_per_hour: 100000,
              rate: 400000,
              customer_charge_amount: 400000,
              status: 'closed',
              closed_transaction_id: 'TRX-LC-CORRECTION-01'
            }]
          };
        }

        if (text.includes('UPDATE transactions')) {
          return {
            rowCount: 1,
            rows: [{
              transaction_id: 'TRX-LC-CORRECTION-01',
              room_id: 'ROOM-VIP-4',
              room_name: 'VIP 4',
              room_total: 400000,
              fnb_total: 150000,
              lc_total: 300000, // 3 jam x 100.000
              grand_total: 850000,
              payment_status: 'paid',
              payment_method: 'cash',
              cash_amount: 850000,
              transfer_amount: 0,
              booking_mode: 'regular'
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

    // User mengubah durasi Leni dari 4 jam (240 menit) ke 3 jam (180 menit)
    await updateTransactionLcDurations(req, res, {
      transaction_id: 'TRX-LC-CORRECTION-01',
      assignments: [
        {
          log_id: 'LOG-LC-LENI-1',
          lc_id: 'LC-LENI',
          duration_minutes: 180 // Diubah ke 3 jam
        }
      ],
      reason: 'Koreksi durasi LC Leni dari 4 jam menjadi 3 jam',
      changed_by: 'Kasir'
    });

    assert.ok(responseData, 'Response dari updateTransactionLcDurations harus ada');
    assert.strictEqual(responseData.ok, true, 'Response status harus ok: true');
    assert.strictEqual(responseData.lc_total, 300000, 'Tagihan LC harus menjadi Rp 300.000 (3 jam)');
    assert.strictEqual(responseData.grand_total, 850000, 'Grand total harus menjadi Rp 850.000');

    // 1. Verifikasi response transaction menyertakan lc_details yang sudah ter-update
    assert.ok(responseData.transaction, 'Transaction object harus ada di response');
    assert.ok(responseData.transaction.lc_details, 'lc_details harus ada di response transaction');
    assert.strictEqual(responseData.transaction.lc_details.detail_available, true);
    assert.strictEqual(responseData.transaction.lc_details.lc_logs[0].duration_minutes, 180, 'Durasi pada lc_details harus 180 menit (3 jam)');
    assert.strictEqual(responseData.transaction.lc_details.total, 300000);

    // 2. Verifikasi UPDATE lc_work_logs dieksekusi dengan duration_minutes = 180
    const updateLogQuery = queries.find(q => q.sql.includes('UPDATE lc_work_logs') && q.sql.includes('SET lc_id = $1'));
    assert.ok(updateLogQuery, 'Query UPDATE lc_work_logs harus dieksekusi');
    assert.strictEqual(updateLogQuery.params[2], 180, 'Parameter duration_minutes di query UPDATE harus 180 menit');
    assert.strictEqual(updateLogQuery.params[4], 300000, 'Parameter rate di query UPDATE harus Rp 300.000');
    assert.strictEqual(updateLogQuery.params[5], 300000, 'Parameter customer_charge_amount harus Rp 300.000');

    console.log('  ✓ Backend berhasil memproses koreksi durasi 4 jam -> 3 jam dan menghasilkan lc_details 180 menit');

    // 3. Verifikasi data struk saat buildReceiptData dipanggil
    const receiptData = buildReceiptData(responseData.transaction, {
      lcDetails: responseData.transaction.lc_details
    });

    assert.strictEqual(receiptData.lc.hasLc, true, 'Struk harus memiliki section LC');
    assert.strictEqual(receiptData.lc.detailAvailable, true, 'Detail LC harus available pada struk');
    assert.strictEqual(receiptData.lc.items.length, 1);
    assert.strictEqual(receiptData.lc.items[0].name, 'Leni');
    assert.strictEqual(receiptData.lc.items[0].durationMinutes, 180, 'Struk receiptData harus memuat durasi 180 menit (3 jam)');
    assert.strictEqual(receiptData.lc.items[0].amount, 300000, 'Struk receiptData harus memuat tagihan LC Rp 300.000');
    assert.strictEqual(receiptData.totals.lcTotal, 300000);
    assert.strictEqual(receiptData.totals.grandTotal, 850000);

    console.log('  ✓ buildReceiptData menghasilkan durasi 180 menit (3 jam) untuk cetak struk');

    // 4. Verifikasi teks cetak thermal 58mm
    const thermalText = formatReceipt58mm(receiptData);
    console.log('\n--- THERMAL RECEIPT PREVIEW ---\n' + thermalText + '\n-------------------------------\n');
    assert.ok(thermalText.includes('DETAIL LC'), 'Struk thermal harus memuat header DETAIL LC');
    assert.ok(thermalText.includes('Leni'), 'Struk thermal harus memuat nama Leni');
    assert.ok(thermalText.includes('3 jam'), 'Struk thermal harus memuat durasi 3 jam');
    assert.ok(!thermalText.includes('4 jam'), 'Struk thermal TIDAK BOLEH memuat durasi 4 jam');

    // Pada section DETAIL LC (antara DETAIL LC dan SUBTOTAL LC), tagihannya harus 300.000, bukan 400.000
    const lcSectionOnly = (thermalText.split('DETAIL LC')[1] || '').split('SUBTOTAL LC')[0] || '';
    assert.ok(lcSectionOnly.includes('300.000'), 'Section DETAIL LC harus memuat tagihan 300.000');
    assert.ok(!lcSectionOnly.includes('400.000'), 'Section DETAIL LC TIDAK BOLEH memuat tagihan 400.000');
    assert.ok(lcSectionOnly.includes('3 jam'), 'Section DETAIL LC harus memuat durasi 3 jam');
    assert.ok(!lcSectionOnly.includes('4 jam'), 'Section DETAIL LC TIDAK BOLEH memuat durasi 4 jam');

    // Pada ringkasan tagihan struk, Jasa LC harus Rp300.000
    const summarySection = thermalText.split('RINGKASAN')[1] || '';
    assert.ok(summarySection.includes('Jasa LC                Rp300.000'), 'Ringkasan tagihan struk harus memuat Jasa LC Rp300.000');
    assert.ok(summarySection.includes('TOTAL                  Rp850.000'), 'Ringkasan tagihan struk harus memuat TOTAL Rp850.000');

    console.log('  ✓ formatReceipt58mm mencetak "3 jam", Jasa LC Rp 300.000, dan TOTAL Rp 850.000 (bukan 4 jam)');

    // 5. Verifikasi fallback buildReceiptData jika options.lcDetails null tapi transaction.lc_logs ada
    const fallbackReceiptData = buildReceiptData({
      ...responseData.transaction,
      lc_details: null,
      lc_logs: responseData.transaction.lc_logs
    });
    assert.strictEqual(fallbackReceiptData.lc.items[0].durationMinutes, 180, 'Fallback buildReceiptData harus memuat 180 menit');
    assert.strictEqual(fallbackReceiptData.lc.items[0].amount, 300000);

    console.log('  ✓ Fallback buildReceiptData dari lc_logs berhasil menampilkan 180 menit (3 jam)');

    console.log('✅ ALL LC Duration Correction Receipt Print Tests PASSED SUCCESSFULLY!');
  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalDbQuery;
  }
}

testLcDurationCorrectionReceiptPrint().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
