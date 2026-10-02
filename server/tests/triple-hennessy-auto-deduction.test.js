const assert = require('assert');
const { resolvePackageComponentStockItem, resolvePackageComponentStockItemSync } = require('../src/utils/packageStockResolver');
const { deductStockForRoomPackage } = require('../src/controllers/roomsController');

console.log('🧪 Running Triple Package Hennessy VSOP & Coke Auto-Deduction Simulation...\n');

// Mock data persis seperti yang tampil di layar kasir/dashboard
const mockPackageId = 'PKG-TRIPLE-HENNESSY';
const mockPackageName = 'Triple Package - Hennessy VSOP';

const mockPackageDetails = [
  { component_ref_id: 'SVC-TALENT', component_name: 'Talent', qty: 3, unit: 'talent', component_type: 'service' },
  { component_ref_id: 'SVC-ROOM-3H', component_name: 'Room 3 Jam', qty: 1, unit: 'room', component_type: 'service' },
  { component_ref_id: 'MENU-011', component_name: 'Airtis 330ml', qty: 4, unit: 'botol', component_type: 'inventory' },
  { component_ref_id: 'MENU-001', component_name: 'French Fries', qty: 2, unit: 'pack', component_type: 'inventory' },
  { component_ref_id: 'MENU-002', component_name: 'Fruit Platter', qty: 2, unit: 'pack', component_type: 'inventory' },
  { component_ref_id: 'MENU-005', component_name: 'Sosis', qty: 2, unit: 'pack', component_type: 'inventory' },
  { component_ref_id: 'SVC-COKE', component_name: 'Coke', qty: 6, unit: 'botol', component_type: 'service' },
  { component_ref_id: 'SVC-SPIRIT-CHOICE', component_name: 'Spirit: Hennessy Vsop', qty: 1, unit: 'choice', component_type: 'service' }
];

const mockInventoryDb = {
  'MENU-023': { stock_item_id: 'MENU-023', stock_item_name: 'Hennesy Vsop', category: 'Cognac', stock_qty: 3, unit: 'botol', status: 'active' },
  'MENU-096': { stock_item_id: 'MENU-096', stock_item_name: 'Coca-Cola', category: 'Beverage', stock_qty: 20, unit: 'botol', status: 'active' },
  'MENU-011': { stock_item_id: 'MENU-011', stock_item_name: 'Airtis 330ml', category: 'Beverage', stock_qty: 24, unit: 'botol', status: 'active' },
  'MENU-001': { stock_item_id: 'MENU-001', stock_item_name: 'French Fries', category: 'Food', stock_qty: 15, unit: 'pack', status: 'active' },
  'MENU-002': { stock_item_id: 'MENU-002', stock_item_name: 'Fruit Platter', category: 'Food', stock_qty: 10, unit: 'pack', status: 'active' },
  'MENU-005': { stock_item_id: 'MENU-005', stock_item_name: 'Sosis', category: 'Food', stock_qty: 12, unit: 'pack', status: 'active' }
};

const recordedMovements = [];

const mockClient = {
  query: async (sql, params = []) => {
    const text = String(sql);

    if (text.includes('FROM package_details')) {
      return { rows: mockPackageDetails };
    }

    if (text.includes('SELECT stock_item_id FROM menu')) {
      return { rows: [] };
    }

    if (text.includes('FROM inventory') && text.includes('WHERE stock_item_id = $1')) {
      const id = params[0];
      if (mockInventoryDb[id]) {
        return { rowCount: 1, rows: [{ ...mockInventoryDb[id] }] };
      }
      return { rowCount: 0, rows: [] };
    }

    if (text.includes('FROM inventory') && text.includes('MENU-023')) {
      return { rowCount: 1, rows: [{ stock_item_id: 'MENU-023' }] };
    }

    if (text.includes('FROM inventory') && text.includes('MENU-096')) {
      return { rowCount: 1, rows: [{ stock_item_id: 'MENU-096' }] };
    }

    if (text.includes('UPDATE inventory SET stock_qty')) {
      const newQty = params[0];
      const id = params[1];
      if (mockInventoryDb[id]) {
        mockInventoryDb[id].stock_qty = newQty;
      }
      return { rowCount: 1 };
    }

    if (text.includes('INSERT INTO stock_movements')) {
      recordedMovements.push({
        movement_id: params[0],
        stock_item_id: params[1],
        stock_item_name: params[2],
        reference_id: params[3],
        qty_change: params[4],
        stock_before: params[5],
        stock_after: params[6],
        note: params[7]
      });
      return { rowCount: 1 };
    }

    return { rowCount: 0, rows: [] };
  }
};

(async () => {
  // Test 1: Simulasi Resolusi Otomatis Komponen Paket
  console.log('Test 1: Memverifikasi Smart Auto-Resolver untuk Hennessy & Coke...');
  const hennessyComp = mockPackageDetails.find(c => c.component_ref_id === 'SVC-SPIRIT-CHOICE');
  const resolvedHennessy = await resolvePackageComponentStockItem(mockClient, hennessyComp, mockPackageId, mockPackageName);
  assert.strictEqual(resolvedHennessy, 'MENU-023', 'SVC-SPIRIT-CHOICE wajib ter-resolve otomatis ke MENU-023 (Hennesy Vsop)');
  console.log('  ✓ PASS: SVC-SPIRIT-CHOICE otomatis terarah ke SKU MENU-023 (Hennesy Vsop)');

  const cokeComp = mockPackageDetails.find(c => c.component_ref_id === 'SVC-COKE');
  const resolvedCoke = await resolvePackageComponentStockItem(mockClient, cokeComp, mockPackageId, mockPackageName);
  assert.strictEqual(resolvedCoke, 'MENU-096', 'SVC-COKE wajib ter-resolve otomatis ke MENU-096 (Coca-Cola)');
  console.log('  ✓ PASS: SVC-COKE otomatis terarah ke SKU MENU-096 (Coca-Cola)');

  // Test 2: Simulasi Checkout Sesi (deductStockForRoomPackage)
  console.log('\nTest 2: Menjalankan simulasi Selesaikan Sesi (Checkout Room)...');
  const trxId = 'TRX-SIMULASI-HENNESSY-001';
  const result = await deductStockForRoomPackage(mockClient, mockPackageId, mockPackageName, trxId, 'Admin Kasir');

  console.log('  ✓ Total mutasi stok yang terjadi: ' + result.movements.length + ' item.');

  // Verifikasi Sisa Stok Fisik
  console.log('\nTest 3: Memverifikasi perubahan stok aktual di database...');
  console.log('  • Hennesy Vsop (MENU-023): Stok Awal 3 -> Stok Akhir: ' + mockInventoryDb['MENU-023'].stock_qty + ' botol');
  assert.strictEqual(mockInventoryDb['MENU-023'].stock_qty, 2, 'Stok Hennesy Vsop wajib berkurang 1 botol (dari 3 menjadi 2)');
  console.log('    ✓ PASS: Stok Hennesy Vsop terpotong otomatis dari 3 menjadi 2 botol!');

  console.log('  • Coca-Cola (MENU-096): Stok Awal 20 -> Stok Akhir: ' + mockInventoryDb['MENU-096'].stock_qty + ' botol');
  assert.strictEqual(mockInventoryDb['MENU-096'].stock_qty, 14, 'Stok Coca-Cola wajib berkurang 6 botol (dari 20 menjadi 14)');
  console.log('    ✓ PASS: Stok Coca-Cola terpotong otomatis 6 botol!');

  console.log('  • Airtis 330ml (MENU-011): Stok Awal 24 -> Stok Akhir: ' + mockInventoryDb['MENU-011'].stock_qty + ' botol');
  assert.strictEqual(mockInventoryDb['MENU-011'].stock_qty, 20, 'Stok Airtis wajib berkurang 4 botol (dari 24 menjadi 20)');

  console.log('  • French Fries (MENU-001): Stok Awal 15 -> Stok Akhir: ' + mockInventoryDb['MENU-001'].stock_qty + ' pack');
  assert.strictEqual(mockInventoryDb['MENU-001'].stock_qty, 13, 'Stok French Fries wajib berkurang 2 pack');

  // Verifikasi Kartu Mutasi Stok (stock_movements)
  console.log('\nTest 4: Memverifikasi pencatatan resmi kartu mutasi stok (stock_movements)...');
  const hennessyMovement = recordedMovements.find(m => m.stock_item_id === 'MENU-023');
  assert.ok(hennessyMovement, 'Kartu mutasi untuk MENU-023 wajib tercatat');
  assert.strictEqual(hennessyMovement.qty_change, -1, 'Qty change mutasi Hennessy harus -1');
  assert.strictEqual(hennessyMovement.stock_before, 3, 'Stock before Hennessy harus 3');
  assert.strictEqual(hennessyMovement.stock_after, 2, 'Stock after Hennessy harus 2');
  console.log('  ✓ PASS: Mutasi stok tercatat: ' + hennessyMovement.stock_item_name + ' | Qty: ' + hennessyMovement.qty_change + ' | Ref: ' + hennessyMovement.reference_id);

  // Test 5: Verifikasi Audit Konsumsi Fisik (Zero Leakage)
  console.log('\nTest 5: Memverifikasi integrasi Laporan Konsumsi Fisik (Audit Gudang - Zero Leakage)...');
  const consumptionMap = new Map([
    ['MENU-023', { stock_item_id: 'MENU-023', stock_item_name: 'Hennesy Vsop', package_qty: 0, total_consumed: 0 }],
    ['MENU-096', { stock_item_id: 'MENU-096', stock_item_name: 'Coca-Cola', package_qty: 0, total_consumed: 0 }]
  ]);

  const syncResHennessy = resolvePackageComponentStockItemSync(hennessyComp, mockPackageId, mockPackageName, consumptionMap);
  assert.strictEqual(syncResHennessy, 'MENU-023');
  const syncResCoke = resolvePackageComponentStockItemSync(cokeComp, mockPackageId, mockPackageName, consumptionMap);
  assert.strictEqual(syncResCoke, 'MENU-096');
  console.log('  ✓ PASS: Laporan Audit Konsumsi Fisik otomatis mengenali MENU-023 dan MENU-096 pada paket');

  console.log('\n🎉 SIMULASI SELESAI DENGAN SUKSES! Seluruh alur pemotongan stok otomatis terverifikasi 100% AMAN!\n');
})();
