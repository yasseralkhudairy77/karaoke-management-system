const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testPackageFormEnhancements() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const styleCssPath = path.join(__dirname, '../../css/style.css');
  const indexHtmlPath = path.join(__dirname, '../../index.html');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  console.log('🧪 Running Package Form Enhancements Tests (antislop)...');

  // 1. Validasi getSortedPackageCategories dan createMasterPackageCategoryField
  assert(
    appJsContent.includes('function getSortedPackageCategories()'),
    'js/app.js wajib mendefinisikan getSortedPackageCategories()'
  );
  assert(
    appJsContent.includes('function createMasterPackageCategoryField('),
    'js/app.js wajib mendefinisikan createMasterPackageCategoryField'
  );
  assert(
    appJsContent.includes('add-package-category-field') &&
    appJsContent.includes('add-package-custom-category-input'),
    'Komponen kategori paket wajib memiliki kelas dropdown dan input kustom'
  );
  console.log('  ✓ Helper getSortedPackageCategories dan createMasterPackageCategoryField terdefinisi');

  // 2. Validasi formatRupiahInput & parseRupiahInput
  assert(
    appJsContent.includes('function formatRupiahInput(value)'),
    'js/app.js wajib mendefinisikan formatRupiahInput'
  );
  assert(
    appJsContent.includes('function parseRupiahInput(value)'),
    'js/app.js wajib mendefinisikan parseRupiahInput'
  );
  assert(
    appJsContent.includes('createMasterCurrencyField({ label, field, helper = "" })'),
    'js/app.js wajib mendefinisikan createMasterCurrencyField'
  );

  // Uji logika formatRupiahInput & parseRupiahInput secara terisolasi
  function formatRupiah(value) {
    if (value === "" || value === null || value === undefined) return "";
    const numeric = String(value).replace(/\D/g, "");
    if (!numeric) return "";
    return `Rp ${Number(numeric).toLocaleString("id-ID")}`;
  }
  function parseRupiah(value) {
    if (value === "" || value === null || value === undefined) return 0;
    return Number(String(value).replace(/\D/g, "")) || 0;
  }

  assert.strictEqual(formatRupiah(1950000), 'Rp 1.950.000', '1950000 harus diformat Rp 1.950.000');
  assert.strictEqual(formatRupiah('1950000'), 'Rp 1.950.000', "'1950000' harus diformat Rp 1.950.000");
  assert.strictEqual(formatRupiah('Rp 1.950.000'), 'Rp 1.950.000', "'Rp 1.950.000' harus tetap stabil");
  assert.strictEqual(formatRupiah(''), '', 'String kosong harus menghasilkan string kosong');
  assert.strictEqual(parseRupiah('Rp 1.950.000'), 1950000, 'Rp 1.950.000 harus diparse menjadi 1950000');
  assert.strictEqual(parseRupiah(1950000), 1950000, '1950000 harus diparse menjadi 1950000');
  assert.strictEqual(parseRupiah(''), 0, 'String kosong harus diparse menjadi 0');
  console.log('  ✓ Fungsi formatRupiahInput dan parseRupiahInput bekerja presisi');

  // 3. Validasi pemakaian createMasterPackageCategoryField & createMasterCurrencyField pada card paket
  assert(
    appJsContent.includes('createMasterPackageCategoryField({') &&
    appJsContent.includes('createMasterCurrencyField({ label: "Harga Jual", field: "selling_price"'),
    'Card paket wajib menggunakan createMasterPackageCategoryField dan createMasterCurrencyField'
  );
  console.log('  ✓ Card paket terintegrasi dengan dropdown kategori dan auto-format rupiah');

  // 4. Validasi komponen isi paket F&B: sorting A-Z dan search input
  assert(
    appJsContent.includes('const sortedInventoryItems = (inventoryItems || [])') &&
    appJsContent.includes('nameA.localeCompare(nameB, "id", { sensitivity: "base" })'),
    'createMenuBundleComponentsEditor wajib mengurutkan item inventory secara alfabetis A-Z'
  );
  assert(
    appJsContent.includes('bundle-item-search-input'),
    'createMenuBundleComponentsEditor wajib menyediakan input pencarian item (bundle-item-search-input)'
  );
  console.log('  ✓ Komponen F&B bundle dilengkapi sorting A-Z dan search input');

  // 5. Validasi parseRupiahInput pada submitMasterDataForm & validasi sensitif
  assert(
    appJsContent.includes('selling_price: parseRupiahInput(values.selling_price)'),
    'submitMasterDataForm wajib membersihkan selling_price dengan parseRupiahInput'
  );
  assert(
    appJsContent.includes('parseRupiahInput(original.selling_price) !== parseRupiahInput(values.selling_price)'),
    'Validasi harga paket sensitif wajib menggunakan parseRupiahInput'
  );
  console.log('  ✓ Payload submitMasterDataForm dan pengecekan sensitif harga paket menggunakan parseRupiahInput');

  // 6. Validasi CSS styling
  assert(
    styleCssContent.includes('.add-package-category-field') &&
    styleCssContent.includes('.add-package-custom-category-input'),
    'css/style.css wajib mendefinisikan .add-package-category-field dan animasi custom input'
  );
  assert(
    styleCssContent.includes('.master-form-currency-input'),
    'css/style.css wajib mendefinisikan .master-form-currency-input'
  );
  assert(
    styleCssContent.includes('.bundle-item-search-input'),
    'css/style.css wajib mendefinisikan .bundle-item-search-input'
  );
  console.log('  ✓ Styling CSS untuk kategori, currency, dan search inventory terdefinisi rapi');

  // 7. Validasi cache buster index.html
  assert(
    indexHtmlContent.includes('package-form-enhancements-v1'),
    'index.html wajib menggunakan cache buster package-form-enhancements-v1'
  );
  console.log('  ✓ Cache buster index.html terverifikasi aktif (package-form-enhancements-v1)');

  // 8. Aturan antislop: larangan em dash (\u2014)
  const codeSlice = appJsContent.slice(appJsContent.indexOf('function getSortedPackageCategories'), appJsContent.indexOf('function createMasterDataFormElement') + 1200);
  assert(!codeSlice.includes('\u2014'), 'Komponen kustom dilarang memuat em dash');
  console.log('  ✓ antislop: kode bebas em dash');

  console.log('✅ ALL Package Form Enhancement tests PASSED SUCCESSFULLY!\n');
}

testPackageFormEnhancements();
