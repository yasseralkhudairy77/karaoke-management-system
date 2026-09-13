const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { buildOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

async function runTests() {
  console.log('🧪 Running Owner Mirror Sales Commission & Deduction Tests...');

  testOwnerHtmlStructure();
  await testBuildOwnerMirrorSnapshotWithSalesCommissions();

  console.log('✅ ALL Owner Mirror Sales Commission Tests PASSED SUCCESSFULLY!');
}

function testOwnerHtmlStructure() {
  const htmlPath = path.join(__dirname, '../../owner.html');
  assert.ok(fs.existsSync(htmlPath), 'File owner.html wajib ada');

  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Verifikasi Metrics Cards
  assert.ok(html.includes('Komisi Sales (5%)'), 'Metrik Komisi Sales (5%) wajib ada di owner.html');
  assert.ok(html.includes('Omzet Bersih (Net)'), 'Metrik Omzet Bersih (Net) wajib ada di owner.html');

  // 2. Verifikasi Tabel Transaksi
  assert.ok(html.includes('{ label: "Total Bill", right: true }'), 'Header Total Bill wajib ada di tabel transaksi');
  assert.ok(html.includes('{ label: "Komisi (5%)", right: true }'), 'Header Komisi (5%) wajib ada di tabel transaksi');
  assert.ok(html.includes('{ label: "Net Omzet", right: true }'), 'Header Net Omzet wajib ada di tabel transaksi');

  // 3. Verifikasi Accounting Summary Bar & Deduction Badges
  assert.ok(html.includes('accounting-summary-bar'), 'Elemen accounting-summary-bar wajib ada di owner.html');
  assert.ok(html.includes('deduction-badge'), 'Class deduction-badge wajib ada di owner.html');

  // 4. Verifikasi Ringkasan Shift & Closing Kasir
  assert.ok(html.includes('Potongan Komisi Sales (5%)'), 'Rincian potongan komisi sales wajib ada di Ringkasan Shift');
  assert.ok(html.includes('{ label: "Komisi Sales", right: true }'), 'Header Komisi Sales wajib ada di tabel Closing Kasir');

  console.log('  ✓ Struktur owner.html terverifikasi: metric cards, tabel transaksi, summary bar, dan closing table telah terintegrasi!');
}

async function testBuildOwnerMirrorSnapshotWithSalesCommissions() {
  const originalQuery = db.query;

  try {
    let salesCommissionQueryExecuted = false;

    db.query = async (sql, params = []) => {
      const text = String(sql);

      if (text.includes('FROM rooms')) {
        return {
          rowCount: 1,
          rows: [{
            room_id: 'ROOM-01',
            room_name: 'Room 01',
            status: 'available',
            rate_per_hour: 100000,
            tv_device_id: '',
            updated_at: new Date()
          }]
        };
      }

      if (text.includes('FROM transactions')) {
        return {
          rowCount: 2,
          rows: [
            {
              transaction_id: 'TRX-1001',
              room_id: 'ROOM-01',
              room_name: 'Room 01',
              grand_total: 1000000,
              room_total: 400000,
              fnb_total: 600000,
              lc_total: 0,
              payment_status: 'paid',
              payment_method: 'cash',
              cash_amount: 1000000,
              transfer_amount: 0,
              promo_discount: 50000,
              promo_code: 'PROMO50',
              manual_discount: 0,
              operational_date: new Date('2026-09-13T00:00:00Z'),
              created_at: new Date('2026-09-13T10:00:00Z')
            },
            {
              transaction_id: 'TRX-1002',
              room_id: 'ROOM-02',
              room_name: 'Room 02',
              grand_total: 500000,
              room_total: 200000,
              fnb_total: 300000,
              lc_total: 0,
              payment_status: 'paid',
              payment_method: 'transfer',
              cash_amount: 0,
              transfer_amount: 500000,
              promo_discount: 0,
              manual_discount: 0,
              operational_date: new Date('2026-09-13T00:00:00Z'),
              created_at: new Date('2026-09-13T11:00:00Z')
            }
          ]
        };
      }

      if (text.includes('FROM sales_commission_logs')) {
        salesCommissionQueryExecuted = true;
        return {
          rowCount: 1,
          rows: [{
            commission_id: 'COMM-1001',
            transaction_id: 'TRX-1001',
            operational_date: new Date('2026-09-13T00:00:00Z'),
            basis_type: 'grand_total',
            basis_amount: 1000000,
            commission_percent: 5,
            commission_amount: 50000,
            recipient_name: 'Budi Sales',
            cashier_name: 'Kasir 1',
            note: 'Komisi marketing 5%',
            created_at: new Date('2026-09-13T10:05:00Z')
          }]
        };
      }

      if (text.includes('FROM cashier_closings')) {
        return {
          rowCount: 1,
          rows: [{
            closing_id: 'CLS-001',
            closing_date: new Date('2026-09-13T00:00:00Z'),
            cashier_name: 'Kasir 1',
            paid_revenue: 1500000,
            unpaid_revenue: 0,
            total_revenue: 1500000,
            cash_expected: 950000,
            cash_actual: 950000,
            cash_difference: 0,
            sales_commission_total: 50000,
            net_revenue_after_commission: 1450000,
            status: 'balanced',
            created_at: new Date('2026-09-13T12:00:00Z'),
            updated_at: new Date('2026-09-13T12:00:00Z')
          }]
        };
      }

      if (text.includes('FROM fnb_orders') || text.includes('FROM fnb_order_items')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM lc_work_logs')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM inventory')) {
        return { rowCount: 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    };

    const snapshot = await buildOwnerMirrorSnapshot({ period: 'yesterday' });

    assert.strictEqual(salesCommissionQueryExecuted, true, 'Query sales_commission_logs wajib dijalankan');
    assert.strictEqual(snapshot.transactions.length, 2, 'Jumlah transaksi harus 2');

    const trxWithComm = snapshot.transactions.find(t => t.transaction_id === 'TRX-1001');
    assert.ok(trxWithComm, 'TRX-1001 harus ada');
    assert.ok(trxWithComm.sales_commission, 'sales_commission harus ada pada TRX-1001');
    assert.strictEqual(trxWithComm.sales_commission_amount, 50000);
    assert.strictEqual(trxWithComm.sales_commission_percent, 5);
    assert.strictEqual(trxWithComm.sales_commission_recipient, 'Budi Sales');
    assert.strictEqual(trxWithComm.net_total, 950000, 'Net total TRX-1001 harus 1.000.000 - 50.000 = 950.000');

    const trxWithoutComm = snapshot.transactions.find(t => t.transaction_id === 'TRX-1002');
    assert.ok(trxWithoutComm, 'TRX-1002 harus ada');
    assert.strictEqual(trxWithoutComm.sales_commission, null);
    assert.strictEqual(trxWithoutComm.sales_commission_amount, 0);
    assert.strictEqual(trxWithoutComm.net_total, 500000);

    // Verifikasi Summary Aggregasi
    assert.strictEqual(snapshot.summary.total_revenue_all, 1500000);
    assert.strictEqual(snapshot.summary.paid_revenue, 1500000);
    assert.strictEqual(snapshot.summary.total_sales_commission, 50000);
    assert.strictEqual(snapshot.summary.paid_sales_commission, 50000);
    assert.strictEqual(snapshot.summary.net_paid_revenue, 1450000, 'Omzet bersih setelah komisi harus 1.450.000');
    assert.strictEqual(snapshot.summary.transactions_with_commission, 1);
    assert.strictEqual(snapshot.summary.total_promo_discount, 50000);

    // Verifikasi sales_commissions di root snapshot
    assert.strictEqual(snapshot.sales_commissions.length, 1);
    assert.strictEqual(snapshot.sales_commissions[0].commission_id, 'COMM-1001');
    assert.strictEqual(snapshot.sales_commissions[0].commission_amount, 50000);

    // Verifikasi cashier_closings
    assert.strictEqual(snapshot.cashier_closings.length, 1);
    assert.strictEqual(snapshot.cashier_closings[0].sales_commission_total, 50000);
    assert.strictEqual(snapshot.cashier_closings[0].net_revenue_after_commission, 1450000);

    console.log('  ✓ buildOwnerMirrorSnapshot berhasil mengintegrasikan komisi sales 5%, kalkulasi omzet bersih, dan rekap closing!');
  } finally {
    db.query = originalQuery;
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
