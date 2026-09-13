const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Running F&B Sales Report Thermal Print (58mm) Tests...\n');

  const receiptPath = path.resolve(__dirname, '../../js/receipt.js');
  const { formatFnbSalesReport58mm } = await import(`file://${receiptPath.replace(/\\/g, '/')}`);

  // Test 1: formatFnbSalesReport58mm formatting & constraints
  {
    console.log('  Testing Test 1: Standard F&B sales report thermal format 58mm...');
    const sampleReportData = {
      period: 'Shift Aktif (14/09/2026)',
      category: 'all',
      status: 'billed',
      summary: {
        total_fnb_orders: 16,
        total_items_sold: 93,
        total_fnb_sales: 8040000,
        top_menu_name: 'Bir Bintang Pint',
        top_menu_quantity: 24,
      },
      categorySummary: [
        { category: 'Beverage', total_quantity: 42, total_sales: 2100000 },
        { category: 'Beer', total_quantity: 36, total_sales: 4320000 },
        { category: 'Food', total_quantity: 15, total_sales: 1620000 },
      ],
      menuSales: [
        { menu_id: 'BEV-AQUA', menu_name: 'Aqua 600ml', price: 15000, quantity_sold: 20, gross_sales: 300000 },
        { menu_id: 'BEER-BINTANG', menu_name: 'Bir Bintang Pint', price: 45000, quantity_sold: 24, gross_sales: 1080000 },
        { menu_id: 'PKG-BEER-HOLIC', menu_name: 'Paket Beer Holic', price: 350000, quantity_sold: 8, gross_sales: 2800000 },
      ],
      physicalConsumption: [
        { stock_item_id: 'BEV-AQUA', stock_item_name: 'Aqua 600ml', unit: 'btl', total_consumed: 20, current_stock: 48 },
        { stock_item_id: 'BEER-BINTANG', stock_item_name: 'Bir Bintang Pint', unit: 'btl', total_consumed: 24, current_stock: 36 },
      ],
    };

    const slip = formatFnbSalesReport58mm(sampleReportData, {
      cashierName: 'Ahmad Kasir',
      periodLabel: 'Shift Aktif (14/09/2026)',
      width: 32,
    });

    assert.ok(slip, 'Output slip thermal tidak boleh kosong');
    const lines = slip.split('\n');

    // 1. Periksa header
    assert.ok(slip.includes('HAPPY SONG KARAOKE'), 'Slip wajib memiliki header Happy Song Karaoke');
    assert.ok(slip.includes('LAPORAN PENJUALAN F&B'), 'Slip wajib memiliki judul Laporan Penjualan F&B');
    assert.ok(slip.includes('(STRUK REKAP 58MM)'), 'Slip wajib mencantumkan subjudul struk rekap 58mm');

    // 2. Periksa periode dan kasir
    assert.ok(slip.includes('Ahmad Kasir'), 'Slip wajib mencantumkan nama kasir/PIC');
    assert.ok(slip.includes('Shift Aktif (14/09/2026)'), 'Slip wajib mencantumkan periode laporan');

    // 3. Periksa ringkasan penjualan
    assert.ok(slip.includes('RINGKASAN PENJUALAN'), 'Slip wajib memiliki seksi Ringkasan Penjualan');
    assert.ok(slip.includes('Rp8.040.000'), 'Slip wajib mencantumkan total omzet Rp8.040.000');
    assert.ok(slip.includes('93 pcs/btl'), 'Slip wajib mencantumkan item terjual 93 pcs/btl');
    assert.ok(slip.includes('16 order'), 'Slip wajib mencantumkan 16 order');
    assert.ok(slip.includes('Bir Bintang Pint (24x)'), 'Slip wajib mencantumkan menu terlaris');

    // 4. Periksa rekap per kategori
    assert.ok(slip.includes('REKAP PER KATEGORI'), 'Slip wajib memiliki seksi Rekap Kategori');
    assert.ok(slip.includes('Beverage (42)'), 'Slip wajib memuat kategori Beverage');
    assert.ok(slip.includes('Beer (36)'), 'Slip wajib memuat kategori Beer');

    // 5. Periksa rincian item terjual
    assert.ok(slip.includes('RINCIAN ITEM TERJUAL'), 'Slip wajib memiliki seksi Rincian Item Terjual');
    assert.ok(slip.includes('Aqua 600ml'), 'Slip wajib memuat Aqua 600ml');
    assert.ok(slip.includes('Paket Beer Holic'), 'Slip wajib memuat Paket Beer Holic');

    // 6. Periksa pengeluaran fisik gudang
    assert.ok(slip.includes('PENGELUARAN FISIK GUDANG'), 'Slip wajib memiliki seksi Pengeluaran Fisik Gudang');
    assert.ok(slip.includes('Keluar: 20 btl'), 'Slip wajib memuat jumlah keluar fisik');

    // 7. Periksa grand total dan tanda tangan
    assert.ok(slip.includes('TOTAL OMZET F&B'), 'Slip wajib memiliki baris penutup TOTAL OMZET F&B');
    assert.ok(slip.includes('Kasir / Bar (PIC)'), 'Slip wajib memiliki kolom tanda tangan kasir');
    assert.ok(slip.includes('Supervisor / Owner'), 'Slip wajib memiliki kolom tanda tangan supervisor/owner');

    // 8. Periksa batasan lebar kolom (maksimal 32 karakter per baris)
    lines.forEach((line, index) => {
      assert.ok(
        line.length <= 32,
        `Baris ke-${index + 1} melebihi lebar 32 kolom: "${line}" (panjang: ${line.length})`
      );
    });

    console.log('  ✓ Test 1 PASSED: Format struk thermal 58mm presisi 32 kolom dan memuat seluruh elemen rekap penjualan F&B!');
  }

  // Test 2: Verifikasi integrasi UI di js/app.js
  {
    console.log('  Testing Test 2: UI Integration in js/app.js...');
    const appJsPath = path.resolve(__dirname, '../../js/app.js');
    const appJs = fs.readFileSync(appJsPath, 'utf8');

    assert.ok(appJs.includes('formatFnbSalesReport58mm'), 'app.js wajib mengimpor formatFnbSalesReport58mm');
    assert.ok(appJs.includes('fnbReportThermalPreviewVisible'), 'app.js wajib memiliki state fnbReportThermalPreviewVisible');
    assert.ok(appJs.includes('🧾 Cetak Struk (58mm)'), 'app.js wajib memiliki tombol Cetak Struk (58mm)');
    assert.ok(appJs.includes('createFnbReportThermalPreviewOverlay'), 'app.js wajib memiliki fungsi createFnbReportThermalPreviewOverlay');
    assert.ok(appJs.includes('🖨️ Kirim ke Printer Thermal'), 'app.js wajib memiliki tombol Kirim ke Printer Thermal di modal preview');
    assert.ok(appJs.includes('📋 Salin Teks'), 'app.js wajib memiliki opsi Salin Teks');

    console.log('  ✓ Test 2 PASSED: Seluruh tombol, modal preview thermal, dan interaksi print thermal terpasang di UI F&B!');
  }

  console.log('\n🎉 ALL F&B SALES REPORT THERMAL (58MM) TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
