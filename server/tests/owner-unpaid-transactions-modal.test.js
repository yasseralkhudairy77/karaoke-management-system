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

  console.log('🧪 Running Owner Unpaid Transactions Modal Tests (antislop)...');

  // 1. Validasi deklarasi state untuk transaksi laporan owner & modal unpaid
  assert(
    appJsContent.includes('let ownerReportTransactions = [];'),
    'js/app.js wajib mendeklarasikan let ownerReportTransactions = [];'
  );
  assert(
    appJsContent.includes('let ownerUnpaidTransactionsModalVisible = false;'),
    'js/app.js wajib mendeklarasikan let ownerUnpaidTransactionsModalVisible = false;'
  );
  console.log('  ✓ State ownerReportTransactions dan ownerUnpaidTransactionsModalVisible terdefinisi');

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

  // 5. Validasi pemicu klik pada card Belum Dibayar dan checklist Tagihan belum dibayar
  assert(
    appJsContent.includes('ownerUnpaidTransactionsModalVisible = true;'),
    'Pemicu klik wajib mengubah ownerUnpaidTransactionsModalVisible menjadi true'
  );
  assert(
    appJsContent.includes('Klik untuk rincian data.'),
    'Checklist Tagihan belum dibayar wajib memiliki petunjuk klik'
  );
  console.log('  ✓ Trigger interaktif pada card Belum Dibayar dan checklist berfungsi');

  // 6. Validasi CSS styling clickable dan action hint
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

  // 7. Validasi cache buster index.html
  assert(
    indexHtmlContent.includes('v=owner-unpaid-modal-v1'),
    'index.html wajib diperbarui ke cache buster owner-unpaid-modal-v1'
  );
  console.log('  ✓ Cache buster index.html diperbarui ke v=owner-unpaid-modal-v1');

  // 8. Aturan antislop: larangan karakter em dash (\u2014)
  const fnMatch = appJsContent.match(/function createOwnerUnpaidTransactionsModalOverlay\(\)\s*\{([\s\S]*?)\nfunction createOwnerDashboardElement/);
  assert(fnMatch, 'createOwnerUnpaidTransactionsModalOverlay harus ditemukan');
  assert(!fnMatch[1].includes('\u2014'), 'Modal tagihan belum dibayar dilarang memuat em dash');
  console.log('  ✓ antislop: copy UI modal bebas em dash');

  console.log('✅ ALL Owner Unpaid Transactions Modal tests PASSED SUCCESSFULLY!\n');
}

testOwnerUnpaidTransactionsModal();
