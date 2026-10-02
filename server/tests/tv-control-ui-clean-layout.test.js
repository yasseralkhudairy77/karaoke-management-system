const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testTvControlCleanLayout() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const styleCssPath = path.join(__dirname, '../../css/style.css');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');

  console.log('🧪 Running TV Control Clean Layout Tests...');

  // 1. Validasi keberadaan kelas CSS layout baru
  const requiredCssClasses = [
    '.tv-control-section',
    '.tv-header-row',
    '.tv-control-toolbar',
    '.tv-alert-card',
    '.tv-room-chips',
    '.tv-room-chip',
    '.tv-control-table',
    '.tv-pill',
    '.tv-action-grid',
    '.tv-action-btn'
  ];

  for (const cls of requiredCssClasses) {
    assert(
      styleCssContent.includes(cls),
      `css/style.css wajib mendefinisikan kelas ${cls}`
    );
  }
  console.log('  ✓ Seluruh kelas CSS layout TV terdefinisi di css/style.css');

  // 2. Validasi penerapan struktur DOM di createTvControlSectionElement di js/app.js
  assert(
    appJsContent.includes('tv-alert-card') && appJsContent.includes('tv-room-chips') && appJsContent.includes('tv-room-chip'),
    'js/app.js wajib menggunakan komponen tv-alert-card dan chip ruangan'
  );
  assert(
    appJsContent.includes('tv-action-grid') && appJsContent.includes('tv-action-btn'),
    'js/app.js wajib menggunakan grid tombol aksi yang ergonomis'
  );
  assert(
    appJsContent.includes('tv-control-table'),
    'js/app.js wajib menerapkan kelas tv-control-table'
  );
  console.log('  ✓ Struktur DOM rapi terintegrasi di js/app.js');

  // 3. Validasi seluruh aksi tombol TV tetap utuh tanpa perubahan logika
  const requiredActions = [
    'add-tv-device',
    'check-all-tv-devices',
    'toggle-tv-active-filter',
    'check-tv-device',
    'wake-tv-device',
    'sleep-tv-device',
    'test-tv-device',
    'notify-tv-device',
    'edit-tv-device',
    'request-tv-authorization',
    'install-tv-overlay'
  ];

  for (const act of requiredActions) {
    assert(
      appJsContent.includes(`"${act}"`),
      `js/app.js wajib mempertahankan aksi ${act}`
    );
  }
  console.log('  ✓ Seluruh dataset action tombol TV terverifikasi utuh');

  // 4. Aturan antislop: Larangan penggunaan em dash (—)
  const fnMatch = appJsContent.match(/function createTvControlSectionElement\(\)\s*\{([\s\S]*?)\nfunction createSettingsPanelElement/);
  assert(fnMatch, 'Fungsi createTvControlSectionElement harus ditemukan');
  const fnBody = fnMatch[1];
  assert(!fnBody.includes('—'), 'Dilarang menggunakan em dash (—) di teks UI createTvControlSectionElement');
  console.log('  ✓ antislop: copy UI bebas em dash');

  console.log('✅ ALL TV Control Clean Layout tests PASSED SUCCESSFULLY!\n');
}

testTvControlCleanLayout();
