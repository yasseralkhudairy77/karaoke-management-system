const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLcDetailModalSolidBg() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const styleCssPath = path.join(__dirname, '../../css/style.css');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');

  console.log('🧪 Running LC Detail Modal Solid Background Tests...');

  // 1. Validasi CSS rule untuk .admin-pin-modal.erp-card dan .erp-card memiliki background solid
  assert(
    styleCssContent.includes('.admin-pin-modal.erp-card') && styleCssContent.includes('background: #1c150e'),
    'css/style.css wajib mendefinisikan background solid untuk .admin-pin-modal.erp-card'
  );
  console.log('  ✓ css/style.css memuat aturan background solid untuk modal card');

  // 2. Validasi inline style solid pada createLcDetailLogsOverlay
  assert(
    appJsContent.includes('formEl.className = "admin-pin-modal erp-card lc-detail-modal-card";'),
    'js/app.js createLcDetailLogsOverlay wajib menandai card modal'
  );
  assert(
    appJsContent.includes('formEl.style.backgroundColor = "#1c150e";'),
    'js/app.js createLcDetailLogsOverlay wajib menetapkan backgroundColor solid'
  );
  assert(
    appJsContent.includes('formEl.style.background = "linear-gradient(180deg, #241c14 0%, #17110b 100%)";'),
    'js/app.js createLcDetailLogsOverlay wajib menetapkan background linear gradient solid'
  );
  console.log('  ✓ js/app.js createLcDetailLogsOverlay memiliki background solid berlapis');

  // 3. Validasi tabel di dalam modal memiliki wrapper dan background yang solid
  assert(
    appJsContent.includes('tableWrapper.style.background = "rgba(10, 8, 6, 0.85)";'),
    'js/app.js createLcDetailLogsOverlay wajib memberikan background solid pada tabel log'
  );
  assert(
    appJsContent.includes('bonusTableWrapper.style.background = "rgba(10, 8, 6, 0.85)";'),
    'js/app.js createLcDetailLogsOverlay wajib memberikan background solid pada tabel bonus'
  );
  console.log('  ✓ Tabel riwayat sesi dan bonus memiliki background kontras solid');

  // 4. Validasi tombol close modal di header dan click-outside
  assert(
    appJsContent.includes('closeIconBtn.innerHTML = "&times;";'),
    'js/app.js createLcDetailLogsOverlay wajib memiliki tombol close ikon di header'
  );
  assert(
    appJsContent.includes('selectedLcDetailForLogs = null;'),
    'js/app.js createLcDetailLogsOverlay wajib mereset state saat ditutup'
  );
  console.log('  ✓ Tombol close header dan handler penutupan terverifikasi');

  // 5. Aturan antislop: larangan em dash (—)
  const fnMatch = appJsContent.match(/function createLcDetailLogsOverlay\(\)\s*\{([\s\S]*?)\nfunction renderDashboardGlobal/);
  assert(fnMatch, 'createLcDetailLogsOverlay harus ditemukan');
  assert(!fnMatch[1].includes('—'), 'Dilarang menggunakan em dash (—) di teks UI createLcDetailLogsOverlay');
  console.log('  ✓ antislop: copy UI bebas em dash');

  console.log('✅ ALL LC Detail Modal Solid Background tests PASSED SUCCESSFULLY!\n');
}

testLcDetailModalSolidBg();
