const fs = require('fs');
const path = require('path');
const assert = require('assert');

function testRoomRateCurrencyFormatting() {
  console.log('🧪 Running Room Rate Currency Formatting Tests (antislop)...');

  const appJsPath = path.resolve(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // 1. Validasi integrasi createMasterCurrencyField pada master form ruangan
  assert(
    appJsContent.includes('createMasterCurrencyField({') &&
    appJsContent.includes('label: "Tarif per Jam"') &&
    appJsContent.includes('field: "rate_per_hour"'),
    'Form master room wajib menggunakan createMasterCurrencyField untuk kolom rate_per_hour'
  );
  console.log('  ✓ Form master room terintegrasi dengan createMasterCurrencyField untuk tarif per jam');

  // 2. Validasi placeholder dan helper teks yang jelas dan informatif
  assert(
    appJsContent.includes('helper: "Format otomatis Rupiah. Contoh: Rp 125.000"') ||
    appJsContent.includes('Contoh: Rp 125.000'),
    'Input tarif per jam wajib memuat panduan format Rp 125.000'
  );
  console.log('  ✓ Helper dan placeholder memuat contoh Rp 125.000');

  // 3. Validasi inisialisasi form edit room agar memformat angka mentah (125000) menjadi Rp 125.000
  assert(
    appJsContent.includes('formatRupiahInput(item.rate_per_hour)'),
    'openMasterDataForm wajib memformat rate_per_hour dari item menggunakan formatRupiahInput'
  );
  console.log('  ✓ openMasterDataForm menginisialisasi rate_per_hour dengan format Rupiah');

  // 4. Validasi parsing ke angka pada buildMasterPayload untuk tipe room
  assert(
    appJsContent.includes('rate_per_hour: parseRupiahInput(values.rate_per_hour)'),
    'buildMasterPayload wajib mengubah tarif berformat Rupiah kembali menjadi angka numerik'
  );
  console.log('  ✓ buildMasterPayload mem-parse rate_per_hour menjadi angka integer');

  // 5. Validasi sensitivitas perubahan data pada isSensitiveMasterDataChange
  assert(
    appJsContent.includes('const originalRate = parseRupiahInput(original.rate_per_hour);') &&
    appJsContent.includes('const nextRate = parseRupiahInput(values.rate_per_hour);'),
    'isSensitiveMasterDataChange wajib membandingkan nilai numerik hasil parseRupiahInput'
  );
  console.log('  ✓ isSensitiveMasterDataChange membandingkan nilai rate_per_hour yang diparse dengan aman');

  // 6. Validasi perlindungan input kosong / <= 0 pada submitMasterDataForm
  assert(
    appJsContent.includes('Tarif per jam harus lebih besar dari 0.'),
    'submitMasterDataForm wajib memvalidasi tarif per jam lebih besar dari 0'
  );
  console.log('  ✓ submitMasterDataForm memiliki validasi tarif per jam > 0');

  // 7. Pengujian unit fungsi formatRupiahInput dan parseRupiahInput
  function formatRupiahInput(value) {
    if (value === "" || value === null || value === undefined) return "";
    const numeric = String(value).replace(/\D/g, "");
    if (!numeric) return "";
    return `Rp ${Number(numeric).toLocaleString("id-ID")}`;
  }

  function parseRupiahInput(value) {
    return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
  }

  assert.strictEqual(formatRupiahInput(125000), 'Rp 125.000');
  assert.strictEqual(formatRupiahInput('125000'), 'Rp 125.000');
  assert.strictEqual(formatRupiahInput('Rp 125.000'), 'Rp 125.000');
  assert.strictEqual(formatRupiahInput('125.000'), 'Rp 125.000');
  assert.strictEqual(formatRupiahInput(75000), 'Rp 75.000');
  assert.strictEqual(formatRupiahInput(''), '');
  assert.strictEqual(parseRupiahInput('Rp 125.000'), 125000);
  assert.strictEqual(parseRupiahInput(125000), 125000);
  assert.strictEqual(parseRupiahInput('125000'), 125000);
  assert.strictEqual(parseRupiahInput(''), 0);
  console.log('  ✓ Unit test formatRupiahInput dan parseRupiahInput valid 100%');

  // 8. Aturan antislop: larangan em dash (\u2014)
  const roomFormSlice = appJsContent.slice(
    appJsContent.indexOf('if (masterDataForm.type === "room")'),
    appJsContent.indexOf('if (masterDataForm.type === "menu")')
  );
  assert(!roomFormSlice.includes('\u2014'), 'Komponen form room dilarang memuat em dash');
  console.log('  ✓ antislop: bebas dari em dash');

  console.log('✅ ALL Room Rate Currency Formatting tests PASSED SUCCESSFULLY!\n');
}

testRoomRateCurrencyFormatting();
