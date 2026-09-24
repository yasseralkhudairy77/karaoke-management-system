const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLogsAndCacheBuster() {
  const indexPath = path.join(__dirname, '../../index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert(
    indexContent.includes('js/app.js?v=tv-control-v1') || indexContent.includes('js/app.js?v=kontrol-tv-v1'),
    'index.html wajib menaikkan versi cache buster js/app.js'
  );

  const catatanPath = path.join(__dirname, '../../middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md');
  assert(fs.existsSync(catatanPath), 'CATATAN-KEMAJUAN-KONTROL-TV.md wajib dibuat');

  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  assert(
    appJsContent.includes('createTvControlLogsSectionElement') || appJsContent.includes('tvControlLogsList'),
    'js/app.js wajib memiliki komponen log riwayat kontrol TV'
  );
  assert(
    appJsContent.includes('getTvControlLogs'),
    'js/app.js wajib memanggil aksi API getTvControlLogs'
  );

  console.log('✓ Cache buster, catatan kemajuan, dan panel log terverifikasi.');
}

testLogsAndCacheBuster();
