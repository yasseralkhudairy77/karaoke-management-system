const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testSubTabTvControlInAppJs() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert(
    appJsContent.includes('tv_control') || appJsContent.includes('kontrol_tv'),
    'js/app.js wajib mendaftarkan sub-tab Kontrol TV'
  );
  assert(
    appJsContent.includes('createTvControlSectionElement') || appJsContent.includes('renderTvControlSection'),
    'js/app.js wajib memuat fungsi perender tabel Kontrol TV'
  );
  assert(
    appJsContent.includes('Periksa Semua') || appJsContent.includes('check-all-tv-devices'),
    'js/app.js wajib memiliki tombol periksa semua'
  );
  assert(
    appJsContent.includes('Tambah / Konfigurasi Ruangan') || appJsContent.includes('add-tv-device'),
    'js/app.js wajib memiliki tombol tambah/konfigurasi ruangan baru'
  );

  console.log('✓ Struktur sub-tab Kontrol TV terverifikasi di js/app.js.');
}

testSubTabTvControlInAppJs();
