const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const {
  buildOwnerMirrorSnapshot,
  mergeOwnerMirrorPayloads,
  filterOwnerMirrorPayloadByDateRange
} = require('../src/services/ownerMirrorService');

async function runTests() {
  console.log('🧪 Running Owner Mirror Physical Consumption Audit (Zero Leakage) Tests...');

  await testOwnerHtmlAuditSection();
  await testBuildOwnerMirrorSnapshotPhysicalConsumption();
  await testMergeOwnerMirrorPayloadsPhysicalConsumption();

  console.log('✅ ALL Owner Mirror Physical Consumption Audit Tests PASSED SUCCESSFULLY!');
}

async function testOwnerHtmlAuditSection() {
  const htmlPath = path.join(__dirname, '../../owner.html');
  assert.ok(fs.existsSync(htmlPath), 'File owner.html wajib ada');

  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Verifikasi judul audit konsumsi fisik di tab F&B Terjual
  assert.ok(
    html.includes('Rekapitulasi Konsumsi Fisik Barang (Audit Gudang - Zero Leakage)'),
    'Judul Rekapitulasi Konsumsi Fisik Barang wajib ada di owner.html'
  );

  // 2. Verifikasi deskripsi audit
  assert.ok(
    html.includes('penjualan satuan + keluar via paket'),
    'Deskripsi audit fisik wajib menjelaskan penjualan satuan dan keluar via paket'
  );

  // 3. Verifikasi kolom-kolom tabel audit
  const requiredHeaders = [
    'No',
    'Kode SKU',
    'Nama Barang Fisik',
    'Kategori',
    'Satuan',
    'Terjual Satuan',
    'Keluar via Paket',
    'Total Fisik Keluar',
    'Sisa Stok Fisik'
  ];
  for (const header of requiredHeaders) {
    assert.ok(html.includes(header), `Header kolom "${header}" wajib ada di tabel audit fisik owner.html`);
  }

  // 4. Verifikasi live search filter untuk tabel fisik
  assert.ok(
    html.includes('id="fnbPhysicalSearch"') || html.includes('id="physicalStockSearch"'),
    'Search input untuk pencarian SKU / nama barang fisik wajib ada'
  );

  // 5. Antislop check: tidak boleh ada em dash (—) di teks tampilan tabel konsumsi fisik
  const fnbSectionStart = html.indexOf('function renderFnb(');
  const fnbSectionEnd = html.indexOf('function renderLc(');
  assert.ok(fnbSectionStart !== -1 && fnbSectionEnd !== -1, 'Fungsi renderFnb harus ditemukan');
  const fnbSectionCode = html.slice(fnbSectionStart, fnbSectionEnd);
  assert.ok(!fnbSectionCode.includes('—'), 'Antislop violation (R-02): em dash (—) tidak boleh ada di renderFnb');

  console.log('  ✓ Struktur owner.html terverifikasi: tabel Rekapitulasi Konsumsi Fisik Barang lengkap dengan search dan badge stok');
}

async function testBuildOwnerMirrorSnapshotPhysicalConsumption() {
  const originalQuery = db.query;

  try {
    db.query = async (sql, params = []) => {
      const text = String(sql);

      if (text.includes('FROM rooms')) {
        return {
          rows: [
            { room_id: 'R01', room_name: 'Room 01', status: 'available', rate_per_hour: 50000, updated_at: new Date() }
          ]
        };
      }

      if (text.includes('FROM transactions')) {
        return {
          rows: [
            {
              transaction_id: 'TRX-001',
              room_id: 'R01',
              room_name: 'Room 01',
              operational_date: '2026-09-23',
              payment_status: 'paid',
              grand_total: 500000,
              room_total: 200000,
              fnb_total: 300000,
              package_id: 'PKG-ROOM-BEER',
              package_name: 'Paket Hemat Beer',
              package_total: 250000,
              fnb_order_ids: 'ORD-101',
              created_at: new Date('2026-09-23T14:00:00+07:00')
            }
          ]
        };
      }

      if (text.includes('FROM cashier_closings')) {
        return { rows: [] };
      }

      if (text.includes('FROM sales_commission_logs')) {
        return { rows: [] };
      }

      if (text.includes('FROM lc_work_logs')) {
        return { rows: [] };
      }

      if (text.includes('FROM inventory')) {
        return {
          rows: [
            { stock_item_id: 'MENU-096', stock_item_name: 'Coca-Cola', category: 'Beverage', unit: 'botol', stock_qty: 15, min_stock: 5, status: 'active' },
            { stock_item_id: 'MENU-019', stock_item_name: 'Draft beer', category: 'Beer', unit: 'botol', stock_qty: 284, min_stock: 24, status: 'active' },
            { stock_item_id: 'MENU-043', stock_item_name: 'Esse double click', category: 'Cigarette', unit: 'pcs', stock_qty: 4, min_stock: 5, status: 'active' }
          ]
        };
      }

      if (text.includes('FROM menu')) {
        return {
          rows: [
            { menu_id: 'MENU-096', stock_tracking: 'yes', stock_item_id: 'MENU-096', stock_qty_per_unit: 1, menu_type: 'food_beverage' },
            { menu_id: 'MENU-019', stock_tracking: 'yes', stock_item_id: 'MENU-019', stock_qty_per_unit: 1, menu_type: 'food_beverage' },
            { menu_id: 'MENU-043', stock_tracking: 'yes', stock_item_id: 'MENU-043', stock_qty_per_unit: 1, menu_type: 'food_beverage' }
          ]
        };
      }

      if (text.includes('FROM fnb_order_items')) {
        return {
          rows: [
            {
              order_id: 'ORD-101',
              menu_id: 'MENU-096',
              menu_name: 'Coca-Cola',
              category: 'Beverage',
              quantity: 7,
              subtotal: 105000,
              line_count: 1
            },
            {
              order_id: 'ORD-101',
              menu_id: 'MENU-043',
              menu_name: 'Esse double click',
              category: 'Cigarette',
              quantity: 7,
              subtotal: 210000,
              line_count: 1
            }
          ]
        };
      }

      if (text.includes('FROM fnb_order_item_components')) {
        return { rows: [] };
      }

      if (text.includes('FROM package_details')) {
        return {
          rows: [
            {
              package_id: 'PKG-ROOM-BEER',
              component_ref_id: 'MENU-019',
              component_name: 'Draft beer',
              qty: 6,
              unit: 'botol'
            }
          ]
        };
      }

      return { rows: [] };
    };

    const snapshot = await buildOwnerMirrorSnapshot({ period: 'today' });

    assert.ok(Array.isArray(snapshot.fnb_physical_consumption), 'snapshot.fnb_physical_consumption wajib berupa array');
    assert.strictEqual(snapshot.fnb_physical_consumption.length, 3, 'Harus ada 3 item fisik yang keluar');

    // Item 1: Coca-Cola (7 ala carte, 0 paket, total 7, sisa 15)
    const coke = snapshot.fnb_physical_consumption.find(i => i.stock_item_id === 'MENU-096');
    assert.ok(coke, 'Coca-Cola harus ada di hasil audit');
    assert.strictEqual(coke.ala_carte_qty, 7, 'Terjual satuan Coca-Cola harus 7');
    assert.strictEqual(coke.package_qty, 0, 'Keluar via paket Coca-Cola harus 0');
    assert.strictEqual(coke.total_consumed, 7, 'Total fisik keluar Coca-Cola harus 7');
    assert.strictEqual(coke.current_stock, 15, 'Sisa stok fisik Coca-Cola harus 15');

    // Item 2: Draft beer (0 ala carte, 6 paket, total 6, sisa 284)
    const beer = snapshot.fnb_physical_consumption.find(i => i.stock_item_id === 'MENU-019');
    assert.ok(beer, 'Draft beer harus ada di hasil audit');
    assert.strictEqual(beer.ala_carte_qty, 0, 'Terjual satuan Draft beer harus 0');
    assert.strictEqual(beer.package_qty, 6, 'Keluar via paket Draft beer harus 6');
    assert.strictEqual(beer.total_consumed, 6, 'Total fisik keluar Draft beer harus 6');
    assert.strictEqual(beer.current_stock, 284, 'Sisa stok fisik Draft beer harus 284');

    // Item 3: Esse double click (7 ala carte, 0 paket, total 7, sisa 4)
    const esse = snapshot.fnb_physical_consumption.find(i => i.stock_item_id === 'MENU-043');
    assert.ok(esse, 'Esse double click harus ada di hasil audit');
    assert.strictEqual(esse.ala_carte_qty, 7);
    assert.strictEqual(esse.package_qty, 0);
    assert.strictEqual(esse.total_consumed, 7);
    assert.strictEqual(esse.current_stock, 4);

    console.log('  ✓ buildOwnerMirrorSnapshot berhasil mengaudit fisik barang ala-carte dan paket secara akurat');
  } finally {
    db.query = originalQuery;
  }
}

async function testMergeOwnerMirrorPayloadsPhysicalConsumption() {
  const payload1 = {
    period: '2026-09-20',
    operational_date_start: '2026-09-20',
    operational_date_end: '2026-09-20',
    transactions: [],
    cashier_closings: [],
    fnb_physical_consumption: [
      {
        stock_item_id: 'MENU-096',
        stock_item_name: 'Coca-Cola',
        category: 'Beverage',
        unit: 'botol',
        ala_carte_qty: 3,
        package_qty: 0,
        total_consumed: 3,
        current_stock: 18
      },
      {
        stock_item_id: 'MENU-019',
        stock_item_name: 'Draft beer',
        category: 'Beer',
        unit: 'botol',
        ala_carte_qty: 0,
        package_qty: 2,
        total_consumed: 2,
        current_stock: 288
      }
    ]
  };

  const payload2 = {
    period: '2026-09-21',
    operational_date_start: '2026-09-21',
    operational_date_end: '2026-09-21',
    transactions: [],
    cashier_closings: [],
    fnb_physical_consumption: [
      {
        stock_item_id: 'MENU-096',
        stock_item_name: 'Coca-Cola',
        category: 'Beverage',
        unit: 'botol',
        ala_carte_qty: 4,
        package_qty: 0,
        total_consumed: 4,
        current_stock: 15
      },
      {
        stock_item_id: 'MENU-019',
        stock_item_name: 'Draft beer',
        category: 'Beer',
        unit: 'botol',
        ala_carte_qty: 0,
        package_qty: 4,
        total_consumed: 4,
        current_stock: 284
      }
    ]
  };

  const merged = mergeOwnerMirrorPayloads([payload1, payload2], {
    startDate: '2026-09-20',
    endDate: '2026-09-21'
  });

  assert.ok(Array.isArray(merged.fnb_physical_consumption), 'merged.fnb_physical_consumption wajib ada');
  assert.strictEqual(merged.fnb_physical_consumption.length, 2);

  const coke = merged.fnb_physical_consumption.find(i => i.stock_item_id === 'MENU-096');
  assert.strictEqual(coke.ala_carte_qty, 7, 'Akumulasi ala carte Coca-Cola harus 3 + 4 = 7');
  assert.strictEqual(coke.total_consumed, 7, 'Total fisik keluar Coca-Cola harus 7');
  assert.strictEqual(coke.current_stock, 15, 'Sisa stok harus mengikuti snapshot terbaru');

  const beer = merged.fnb_physical_consumption.find(i => i.stock_item_id === 'MENU-019');
  assert.strictEqual(beer.package_qty, 6, 'Akumulasi paket Draft beer harus 2 + 4 = 6');
  assert.strictEqual(beer.total_consumed, 6, 'Total fisik keluar Draft beer harus 6');
  assert.strictEqual(beer.current_stock, 284, 'Sisa stok harus mengikuti snapshot terbaru');

  console.log('  ✓ mergeOwnerMirrorPayloads berhasil mengakumulasi konsumsi fisik lintas hari/periode');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
