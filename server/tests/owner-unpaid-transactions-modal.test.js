const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testOwnerUnpaidTransactionsModal() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const styleCssPath = path.join(__dirname, '../../css/style.css');
  const indexHtmlPath = path.join(__dirname, '../../index.html');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  console.log('🧪 Running Owner Unpaid Transactions Modal & Receipt Tests (antislop)...');

  // 1. Validasi deklarasi state untuk transaksi laporan owner & modal unpaid
  assert(
    appJsContent.includes('let ownerReportTransactions = [];'),
    'js/app.js wajib mendeklarasikan let ownerReportTransactions = [];'
  );
  assert(
    appJsContent.includes('let ownerUnpaidTransactionsModalVisible = false;'),
    'js/app.js wajib mendeklarasikan let ownerUnpaidTransactionsModalVisible = false;'
  );
  assert(
    appJsContent.includes('let selectedUnpaidSlipTransaction = null;'),
    'js/app.js wajib mendeklarasikan let selectedUnpaidSlipTransaction = null;'
  );
  console.log('  ✓ State ownerReportTransactions, ownerUnpaidTransactionsModalVisible, dan selectedUnpaidSlipTransaction terdefinisi');

  // 2. Validasi penyimpanan transaksi di loadOwnerPeriodReport
  assert(
    appJsContent.includes('ownerReportTransactions = Array.isArray(transactionData?.transactions) ? transactionData.transactions : [];'),
    'loadOwnerPeriodReport wajib menyimpan transactionData.transactions ke ownerReportTransactions'
  );
  console.log('  ✓ loadOwnerPeriodReport menyimpan transaksi lengkap periode owner');

  // 3. Validasi helper getOwnerUnpaidTransactions
  assert(
    appJsContent.includes('function getOwnerUnpaidTransactions()'),
    'js/app.js wajib memiliki fungsi getOwnerUnpaidTransactions'
  );
  console.log('  ✓ Fungsi getOwnerUnpaidTransactions terdefinisi');

  // 4. Validasi komponen modal createOwnerUnpaidTransactionsModalOverlay
  assert(
    appJsContent.includes('function createOwnerUnpaidTransactionsModalOverlay()'),
    'js/app.js wajib mendefinisikan createOwnerUnpaidTransactionsModalOverlay'
  );
  assert(
    appJsContent.includes('owner-unpaid-modal-overlay') &&
    appJsContent.includes('owner-unpaid-modal-card'),
    'Modal unpaid wajib memiliki kelas modal dan overlay yang teridentifikasi'
  );
  assert(
    appJsContent.includes('btn-view-trx-slip'),
    'Modal unpaid wajib memuat tombol cetak/lihat struk'
  );
  console.log('  ✓ Komponen modal createOwnerUnpaidTransactionsModalOverlay lengkap dengan tombol aksi struk');

  // 5. Validasi modal popup struk khusus createUnpaidReceiptModalOverlay
  assert(
    appJsContent.includes('function createUnpaidReceiptModalOverlay(transaction)'),
    'js/app.js wajib mendefinisikan createUnpaidReceiptModalOverlay'
  );
  assert(
    appJsContent.includes('unpaid-receipt-modal-overlay') &&
    appJsContent.includes('unpaid-receipt-modal-card'),
    'Modal struk wajib memiliki kelas modal dan overlay yang teridentifikasi'
  );
  assert(
    appJsContent.includes('zIndex = "16000"') || appJsContent.includes('z-index: 16000'),
    'Modal struk wajib memiliki zIndex 16000 agar tampil di atas modal daftar (15000)'
  );
  console.log('  ✓ Komponen popup modal createUnpaidReceiptModalOverlay terverifikasi dengan z-index 16000');

  // 6. Validasi pemicu klik pada card Belum Dibayar dan checklist Tagihan belum dibayar
  assert(
    appJsContent.includes('ownerUnpaidTransactionsModalVisible = true;'),
    'Pemicu klik wajib mengubah ownerUnpaidTransactionsModalVisible menjadi true'
  );
  assert(
    appJsContent.includes('selectedUnpaidSlipTransaction = trx;'),
    'Tombol aksi struk wajib mengeset selectedUnpaidSlipTransaction = trx'
  );
  console.log('  ✓ Trigger interaktif pada card Belum Dibayar dan tombol struk berfungsi');

  // 7. Validasi CSS styling clickable dan action hint
  assert(
    styleCssContent.includes('.finance-overview-card.clickable') &&
    styleCssContent.includes('.finance-checklist-row.clickable'),
    'css/style.css wajib mendefinisikan cursor pointer dan hover state'
  );
  assert(
    styleCssContent.includes('.finance-card-action-hint'),
    'css/style.css wajib mendefinisikan .finance-card-action-hint'
  );
  console.log('  ✓ CSS interaksi klik dan hover state terdefinisi');

  // 8. Validasi cache buster index.html
  assert(
    /style\.css\?v=[a-zA-Z0-9_-]+/.test(indexHtmlContent) &&
    /app\.js\?v=[a-zA-Z0-9_-]+/.test(indexHtmlContent),
    'index.html wajib memiliki parameter cache buster pada style.css dan app.js'
  );
  console.log('  ✓ Cache buster index.html terverifikasi aktif');

  // 9. Aturan antislop: larangan karakter em dash (\u2014)
  const fnMatch = appJsContent.match(/function createOwnerUnpaidTransactionsModalOverlay\(\)\s*\{([\s\S]*?)\nfunction createOwnerDashboardElement/);
  assert(fnMatch, 'createOwnerUnpaidTransactionsModalOverlay harus ditemukan');
  assert(!fnMatch[1].includes('\u2014'), 'Modal tagihan belum dibayar dilarang memuat em dash');
  console.log('  ✓ antislop: copy UI modal bebas em dash');

  console.log('✅ ALL Owner Unpaid Transactions & Receipt Modal tests PASSED SUCCESSFULLY!\n');
}

testOwnerUnpaidTransactionsModal();
