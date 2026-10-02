const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLcTablePadding() {
  const styleCssPath = path.join(__dirname, '../../css/style.css');
  const indexHtmlPath = path.join(__dirname, '../../index.html');

  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  console.log('🧪 Running LC Table and Panel Padding Tests (antislop)...');

  // 1. Validasi .lc-panel memiliki padding ruang napas
  assert(
    styleCssContent.includes('.lc-panel {') &&
    styleCssContent.includes('padding: var(--panel-padding, 24px);'),
    'css/style.css wajib mendefinisikan padding: var(--panel-padding, 24px) untuk .lc-panel'
  );
  console.log('  ✓ css/style.css menetapkan padding 24px pada .lc-panel');

  // 2. Validasi responsivitas mobile untuk .lc-panel
  assert(
    styleCssContent.includes('@media (max-width: 768px) {') &&
    styleCssContent.includes('padding: 16px;'),
    'css/style.css wajib memiliki padding responsif 16px untuk mobile'
  );
  console.log('  ✓ .lc-panel memiliki breakpoint responsif 16px');

  // 3. Validasi container .table-responsive
  assert(
    styleCssContent.includes('.table-responsive {') &&
    styleCssContent.includes('border: 1px solid rgba(226, 184, 92, 0.2);') &&
    styleCssContent.includes('border-radius: var(--radius-md, 8px);'),
    'css/style.css wajib mendefinisikan container berbingkai untuk .table-responsive'
  );
  console.log('  ✓ .table-responsive memiliki bingkai dan radius yang elegan');

  // 4. Validasi sel .erp-table th dan td memiliki padding
  assert(
    styleCssContent.includes('.erp-table th {') &&
    styleCssContent.includes('padding: 12px 14px;'),
    'css/style.css wajib mendefinisikan padding sel th'
  );
  assert(
    styleCssContent.includes('.erp-table td {') &&
    styleCssContent.includes('padding: 12px 14px;'),
    'css/style.css wajib mendefinisikan padding sel td'
  );
  console.log('  ✓ .erp-table memiliki padding sel 12px 14px');

  // 5. Validasi kolom pertama (ID LC) memiliki padding kiri ekstra
  assert(
    styleCssContent.includes('.erp-table th:first-child,') &&
    styleCssContent.includes('.erp-table td:first-child {') &&
    styleCssContent.includes('padding-left: 18px;'),
    'Kolom pertama .erp-table wajib memiliki padding-left: 18px agar teks ID LC tidak mentok'
  );
  console.log('  ✓ Kolom pertama (ID LC) memiliki padding-left 18px sehingga tidak menempel di border');

  // 6. Validasi cache buster di index.html
  assert(
    /style\.css\?v=[a-z0-9-]+/.test(indexHtmlContent),
    'index.html harus menggunakan cache buster versi untuk style.css'
  );
  assert(
    /app\.js\?v=[a-z0-9-]+/.test(indexHtmlContent),
    'index.html harus menggunakan cache buster versi untuk app.js'
  );
  console.log('  ✓ Cache buster index.html terverifikasi aktif');

  // 7. Aturan antislop: larangan em dash (—)
  assert(!styleCssContent.includes('\u2014'), 'css/style.css dilarang memuat em dash');
  console.log('  ✓ antislop: bebas em dash');

  console.log('✅ ALL LC Table Padding tests PASSED SUCCESSFULLY!\n');
}

testLcTablePadding();
