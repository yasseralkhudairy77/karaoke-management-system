const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLcSelectorDropdownSolidBg() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const appJsPath = path.join(repoRoot, 'js/app.js');
  const skinLcCssPath = path.join(repoRoot, 'css/skin-lc.css');
  const styleCssPath = path.join(repoRoot, 'css/style.css');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const skinLcCssContent = fs.readFileSync(skinLcCssPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');

  console.log('🧪 Menjalankan LC Selector Dropdown Solid Background & Clean UI Tests...');

  // 1. Validasi dropdownMenu tidak menggunakan class erp-card yang mewarisi transparansi
  assert(
    appJsContent.includes('dropdownMenu.className = "lc-selector-dropdown-menu";'),
    'js/app.js dropdownMenu tidak boleh memakai class erp-card yang terkena efek transparansi'
  );
  console.log('  ✓ js/app.js dropdownMenu terisolasi dari class .erp-card');

  // 2. Validasi background solid pada dropdownMenu di js/app.js
  assert(
    appJsContent.includes('dropdownMenu.style.backgroundColor = "#17110b";'),
    'js/app.js dropdownMenu wajib menetapkan backgroundColor solid pekat'
  );
  assert(
    appJsContent.includes('checklistBox.className = "lc-checklist-box";'),
    'js/app.js checklistBox wajib memiliki class lc-checklist-box'
  );
  console.log('  ✓ js/app.js dropdownMenu dan checklistBox memiliki konfigurasi solid');

  // 3. Validasi emoji orang (👤) tidak ada di tombol trigger selector LC
  const triggerBtnSnippet = appJsContent.substring(
    appJsContent.indexOf('const triggerBtn = document.createElement("button");'),
    appJsContent.indexOf('triggerBtn.onclick = (e) => {')
  );
  assert(
    !triggerBtnSnippet.includes('👤'),
    'Emoji orang (👤) tidak boleh digunakan pada tombol trigger pemilih LC'
  );
  assert(
    triggerBtnSnippet.includes('<svg') && triggerBtnSnippet.includes('viewBox="0 0 24 24"'),
    'Tombol trigger pemilih LC wajib menggunakan ikon SVG vektor profesional'
  );
  console.log('  ✓ Tombol trigger pemilih LC bebas emoji dan memakai ikon SVG profesional');

  // 4. Validasi CSS skin-lc.css memiliki rule solid untuk .lc-selector-dropdown-menu
  assert(
    skinLcCssContent.includes('.lc-selector-dropdown-menu') &&
    skinLcCssContent.includes('background: #17110b !important;'),
    'css/skin-lc.css wajib mendefinisikan background solid !important untuk .lc-selector-dropdown-menu'
  );
  console.log('  ✓ css/skin-lc.css memiliki aturan solid background protektif');

  // 5. Validasi CSS style.css memiliki rule solid untuk .lc-selector-dropdown-menu
  assert(
    styleCssContent.includes('.lc-selector-dropdown-menu') &&
    styleCssContent.includes('background: #17110b !important;'),
    'css/style.css wajib mendefinisikan background solid !important untuk .lc-selector-dropdown-menu'
  );
  console.log('  ✓ css/style.css memiliki aturan solid background protektif');

  console.log('✅ SEMUA TEST Solid Background & Clean UI LC Selector PASSED!');
}

testLcSelectorDropdownSolidBg();
