const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { buildOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

async function runTests() {
  console.log('🧪 Running Owner Mirror Inventory Tab & Category Filter Tests...');

  await testOwnerHtmlStructure();
  await testBuildOwnerMirrorSnapshotIncludesInventory();

  console.log('✅ ALL Owner Mirror Inventory Tab Tests PASSED SUCCESSFULLY!');
}

async function testOwnerHtmlStructure() {
  const htmlPath = path.join(__dirname, '../../owner.html');
  assert.ok(fs.existsSync(htmlPath), 'File owner.html wajib ada');

  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Verifikasi posisi tab Stok tepat setelah Transaksi
  assert.ok(html.includes('{ key: "inventory", label: "Stok" }'), 'Tab Stok wajib didefinisikan di TABS');
  const transactionsIdx = html.indexOf('{ key: "transactions", label: "Transaksi" }');
  const inventoryIdx = html.indexOf('{ key: "inventory", label: "Stok" }');
  const fnbIdx = html.indexOf('{ key: "fnb", label: "F&B Terjual" }');

  assert.ok(transactionsIdx !== -1, 'Tab Transaksi harus ada');
  assert.ok(inventoryIdx !== -1, 'Tab Stok harus ada');
  assert.ok(fnbIdx !== -1, 'Tab F&B harus ada');
  assert.ok(transactionsIdx < inventoryIdx, 'Tab Stok wajib berada setelah tab Transaksi');
  assert.ok(inventoryIdx < fnbIdx, 'Tab Stok wajib berada sebelum tab F&B');

  // 2. Verifikasi renderer
  assert.ok(html.includes('inventory: renderInventory'), 'renderInventory wajib didaftarkan di renderers');
  assert.ok(html.includes('function renderInventory('), 'Fungsi renderInventory wajib ada');

  // 3. Verifikasi elemen filter interaktif
  assert.ok(html.includes('id="inventoryCategoryFilter"'), 'Dropdown filter kategori wajib ada');
  assert.ok(html.includes('id="inventoryStatusFilter"'), 'Dropdown filter status stok wajib ada');
  assert.ok(html.includes('id="inventorySearch"'), 'Kotak live search inventori wajib ada');

  // 4. Verifikasi CSS pendukung
  assert.ok(html.includes('.filter-bar'), 'CSS .filter-bar wajib ada');
  assert.ok(html.includes('.search-input'), 'CSS .search-input wajib ada');
  assert.ok(html.includes('.select-filter'), 'CSS .select-filter wajib ada');
  assert.ok(html.includes('.negative'), 'CSS class .negative wajib ada');
  assert.ok(html.includes('.low'), 'CSS class .low wajib ada');

  console.log('  ✓ Struktur owner.html terverifikasi: Tab Stok berada di sebelah Transaksi dengan filter kategori, status, dan search');
}

async function testBuildOwnerMirrorSnapshotIncludesInventory() {
  const originalQuery = db.query;

  try {
    db.query = async (sql, params = []) => {
      const text = String(sql);

      if (text.includes('FROM rooms')) {
        return {
          rowCount: 1,
          rows: [{
            room_id: 'ROOM-01',
            room_name: 'Room 01',
            status: 'available',
            rate_per_hour: 100000,
            tv_device_id: '',
            updated_at: new Date()
          }]
        };
      }

      if (text.includes('FROM transactions')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM cashier_closings')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM fnb_orders')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM lc_work_logs')) {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes('FROM inventory')) {
        return {
          rowCount: 3,
          rows: [
            {
              stock_item_id: 'BEV-AQUA-600',
              stock_item_name: 'Aqua 600ml',
              category: 'Beverage',
              unit: 'botol',
              stock_qty: 48,
              min_stock: 20,
              status: 'active',
              updated_at: new Date()
            },
            {
              stock_item_id: 'CIG-SURYA-16',
              stock_item_name: 'Gudang Garam Surya 16',
              category: 'Cigarette',
              unit: 'bungkus',
              stock_qty: 5,
              min_stock: 10,
              status: 'active',
              updated_at: new Date()
            },
            {
              stock_item_id: 'SNK-KACANG',
              stock_item_name: 'Kacang Kulit',
              category: 'Food',
              unit: 'bungkus',
              stock_qty: -2,
              min_stock: 5,
              status: 'active',
              updated_at: new Date()
            }
          ]
        };
      }

      return { rowCount: 0, rows: [] };
    };

    const snapshot = await buildOwnerMirrorSnapshot({ period: 'today' });

    assert.ok(snapshot, 'Snapshot harus berhasil dibuat');
    assert.ok(snapshot.inventory_summary, 'Properti inventory_summary wajib ada di snapshot');
    assert.ok(Array.isArray(snapshot.inventory_items), 'Properti inventory_items wajib berupa array');

    const summary = snapshot.inventory_summary;
    assert.strictEqual(summary.total_items, 3, 'Total item harus 3');
    assert.strictEqual(summary.safe_items, 1, 'Stok aman harus 1 (Aqua)');
    assert.strictEqual(summary.low_items, 1, 'Stok menipis harus 1 (Surya 16)');
    assert.strictEqual(summary.negative_items, 1, 'Stok minus harus 1 (Kacang Kulit)');

    assert.ok(summary.categories.includes('Beverage'), 'Kategori harus mencakup Beverage');
    assert.ok(summary.categories.includes('Cigarette'), 'Kategori harus mencakup Cigarette');
    assert.ok(summary.categories.includes('Food'), 'Kategori harus mencakup Food');

    const items = snapshot.inventory_items;
    assert.strictEqual(items.length, 3);

    const aqua = items.find(i => i.stock_item_id === 'BEV-AQUA-600');
    assert.ok(aqua);
    assert.strictEqual(aqua.stock_status, 'safe');

    const surya = items.find(i => i.stock_item_id === 'CIG-SURYA-16');
    assert.ok(surya);
    assert.strictEqual(surya.stock_status, 'low');

    const kacang = items.find(i => i.stock_item_id === 'SNK-KACANG');
    assert.ok(kacang);
    assert.strictEqual(kacang.stock_status, 'negative');

    console.log('  ✓ buildOwnerMirrorSnapshot berhasil menyertakan data inventori, kalkulasi status aman/menipis/kritis, dan list kategori');
  } finally {
    db.query = originalQuery;
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
