const fs = require('fs');
const path = require('path');
const assert = require('assert');

function testRoomsSummaryCockpitBar() {
  console.log('🧪 Running Rooms Summary Cockpit Bar Tests (UI/UX Pro Max & antislop)...');

  const cssPath = path.resolve(__dirname, '../../css/skin-fnb-layout.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const appJsPath = path.resolve(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // 1. Validasi struktur CSS dock container
  assert(
    cssContent.includes('.rooms-summary {') &&
    cssContent.includes('border-radius: 12px;') &&
    cssContent.includes('backdrop-filter: blur(12px);'),
    'skin-fnb-layout.css wajib mendefinisikan .rooms-summary dengan border-radius 12px dan backdrop-filter'
  );
  console.log('  ✓ Dock container .rooms-summary terdefinisi dengan radius 12px dan glassmorphism halus');

  // 2. Validasi struktur segment card (rounded 8px, bukan kapsul lonjong)
  assert(
    cssContent.includes('.rooms-summary-card {') &&
    cssContent.includes('border-radius: 8px;') &&
    !cssContent.includes('.rooms-summary-card {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 44px;\n  padding: 8px 14px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-pill);'),
    'Segment button .rooms-summary-card wajib menggunakan border-radius 8px terpadu'
  );
  console.log('  ✓ Segment button .rooms-summary-card menggunakan sudut membulat modern 8px');

  // 3. Validasi status dot indicator
  assert(
    cssContent.includes('.rooms-summary-dot {') &&
    cssContent.includes('.dot-all') &&
    cssContent.includes('.tone-danger .rooms-summary-dot') &&
    cssContent.includes('.tone-warning .rooms-summary-dot') &&
    cssContent.includes('.tone-success .rooms-summary-dot'),
    'CSS wajib mendefinisikan .rooms-summary-dot dengan pemetaan warna status semantik'
  );
  console.log('  ✓ Status dot indicator terdefinisi dengan pemetaan warna semantik (Emas, Merah, Kuning, Hijau, Biru)');

  // 4. Validasi counter badge capsule
  assert(
    cssContent.includes('.rooms-summary-value {') &&
    cssContent.includes('border-radius: 10px;') &&
    cssContent.includes('tabular-nums;'),
    'Counter badge .rooms-summary-value wajib menggunakan bentuk capsule tersendiri dengan font tabular-nums'
  );
  console.log('  ✓ Counter badge .rooms-summary-value terdefinisi sebagai kapsul badge terpisah');

  // 5. Validasi active state tone highlights
  assert(
    cssContent.includes('.rooms-summary-card.active {') &&
    cssContent.includes('.rooms-summary-card.active.tone-success') &&
    cssContent.includes('.rooms-summary-card.active.tone-warning') &&
    cssContent.includes('.rooms-summary-card.active.tone-danger'),
    'CSS wajib mendefinisikan variasi warna aktif untuk setiap status'
  );
  console.log('  ✓ Variasi active state tone highlights terverifikasi');

  // 6. Validasi mobile responsive container
  assert(
    cssContent.includes('@media (max-width: 768px)') &&
    cssContent.includes('overflow-x: auto;'),
    'CSS wajib melindungi tampilan mobile dengan overflow-x: auto agar tidak meluber'
  );
  console.log('  ✓ Proteksi overflow responsive mobile terdefinisi');

  // 7. Validasi pembuatan elemen di js/app.js
  const summaryFuncSlice = appJsContent.slice(
    appJsContent.indexOf('function createRoomSummaryElement()'),
    appJsContent.indexOf('function getFilteredRooms()')
  );
  assert(
    summaryFuncSlice.includes('rooms-summary-dot dot-all') &&
    summaryFuncSlice.includes('rooms-summary-dot dot-${status}') &&
    summaryFuncSlice.includes('status-${status}'),
    'js/app.js wajib merender rooms-summary-dot dan kelas status semantik'
  );
  console.log('  ✓ DOM generator di js/app.js merender micro dot dan kelas status semantik');

  // 8. antislop rule: Bebas dari em dash (\u2014)
  assert(!cssContent.slice(cssContent.indexOf('/* --- R4:')).includes('\u2014'), 'CSS filter ruangan bebas em dash');
  assert(!summaryFuncSlice.includes('\u2014'), 'Fungsi summary bebas em dash');
  console.log('  ✓ antislop: kode bebas em dash');

  console.log('✅ ALL Rooms Summary Cockpit Bar tests PASSED SUCCESSFULLY!\n');
}

testRoomsSummaryCockpitBar();
