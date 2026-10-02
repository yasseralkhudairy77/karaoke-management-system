const assert = require('assert');
const { Client } = require('pg');
require('dotenv').config();

const db = require('../src/db');
const masterDataController = require('../src/controllers/masterDataController');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function runTests() {
  console.log('🧪 Running Unified Package Master & Bundle Management Tests...');

  // 1. Pastikan item inventory dummy aktif untuk komponen test
  const testHennessyId = 'INV-TEST-HENNESSY';
  const testFriesId = 'INV-TEST-FRIES';
  const testBeerId = 'INV-TEST-BEER';

  await db.query(`
    INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
    VALUES 
      ($1, 'Hennessy VSOP 700ml', 'Liquor', 'botol', 50, 5, 'active'),
      ($2, 'Kentang Goreng / French Fries', 'Snack', 'porsi', 100, 10, 'active'),
      ($3, 'Beer Bintang 330ml', 'Beer', 'botol', 200, 20, 'active')
    ON CONFLICT (stock_item_id) DO UPDATE SET status = 'active', stock_qty = 100
  `, [testHennessyId, testFriesId, testBeerId]);

  // TEST 1: Simpan Paket F&B Bundle (Twin Hennessy VSOP: 2 botol + 1 kentang goreng)
  const testPkgFnbId = 'PKG-TEST-TWIN-HENNESSY';
  const fnbRes = createMockRes();
  await masterDataController.savePackageMaster({}, fnbRes, {
    package_id: testPkgFnbId,
    package_name: 'Twin Package - Hennessy VSOP',
    package_category: 'Twin Package',
    package_type: 'fnb_bundle',
    selling_price: 3850000,
    duration_minutes: 0,
    included_lc_count: 0,
    included_lc_duration_minutes: 0,
    valid_day_type: 'all',
    status: 'active',
    changed_by: 'Test Runner',
    bundle_components: [
      { item_id: testHennessyId, qty_used: 2, component_mode: 'included' },
      { item_id: testFriesId, qty_used: 1, component_mode: 'bonus' }
    ]
  });

  assert.strictEqual(fnbRes.body.ok, true, 'savePackageMaster F&B bundle should succeed');
  console.log('  ✓ savePackageMaster F&B bundle success');

  // Verifikasi tabel package_master
  const pkgMasterCheck = await db.query('SELECT * FROM package_master WHERE package_id = $1', [testPkgFnbId]);
  assert.strictEqual(pkgMasterCheck.rowCount, 1, 'package_master row must exist');
  assert.strictEqual(pkgMasterCheck.rows[0].package_type, 'fnb_bundle');
  assert.strictEqual(Number(pkgMasterCheck.rows[0].selling_price), 3850000);
  console.log('  ✓ package_master row verified');

  // Verifikasi tabel package_details
  const pkgDetailsCheck = await db.query('SELECT * FROM package_details WHERE package_id = $1 ORDER BY line_no ASC', [testPkgFnbId]);
  assert.strictEqual(pkgDetailsCheck.rowCount, 2, 'package_details must contain 2 component rows');
  assert.strictEqual(pkgDetailsCheck.rows[0].component_ref_id, testHennessyId);
  assert.strictEqual(Number(pkgDetailsCheck.rows[0].qty), 2);
  assert.strictEqual(pkgDetailsCheck.rows[1].component_ref_id, testFriesId);
  assert.strictEqual(Number(pkgDetailsCheck.rows[1].qty), 1);
  assert.strictEqual(pkgDetailsCheck.rows[1].is_choice, true, 'bonus component is marked is_choice');
  console.log('  ✓ package_details component rows verified');

  // Verifikasi sinkronisasi otomatis ke menu & recipe
  const menuCheck = await db.query('SELECT * FROM menu WHERE menu_id = $1', [testPkgFnbId]);
  assert.strictEqual(menuCheck.rowCount, 1, 'menu table must be synchronized with package_id');
  assert.strictEqual(menuCheck.rows[0].menu_type, 'fnb_bundle');
  assert.strictEqual(Number(menuCheck.rows[0].price), 3850000);

  const recipeCheck = await db.query('SELECT * FROM recipe WHERE menu_id = $1 ORDER BY sort_order ASC', [testPkgFnbId]);
  assert.strictEqual(recipeCheck.rowCount, 2, 'recipe table must contain 2 component rows');
  console.log('  ✓ menu and recipe automatic sync verified');

  // TEST 2: Simpan Paket Room All-In (Room 2 jam + 2 LC + 6 Beer)
  const testPkgRoomId = 'PKG-TEST-ROOM-ALLIN';
  const roomRes = createMockRes();
  await masterDataController.savePackageMaster({}, roomRes, {
    package_id: testPkgRoomId,
    package_name: 'Paket VIP All-In 2 Jam',
    package_category: 'VIP Package',
    package_type: 'room_fnb_bundle',
    selling_price: 1500000,
    duration_minutes: 120,
    included_lc_count: 2,
    included_lc_duration_minutes: 120,
    valid_day_type: 'all',
    status: 'active',
    changed_by: 'Test Runner',
    bundle_components: [
      { item_id: testBeerId, qty_used: 6, component_mode: 'included' }
    ]
  });

  assert.strictEqual(roomRes.body.ok, true, 'savePackageMaster Room All-In should succeed');
  const roomPkgMasterCheck = await db.query('SELECT * FROM package_master WHERE package_id = $1', [testPkgRoomId]);
  assert.strictEqual(roomPkgMasterCheck.rows[0].package_type, 'room_fnb_bundle');
  assert.strictEqual(Number(roomPkgMasterCheck.rows[0].duration_minutes), 120);
  assert.strictEqual(Number(roomPkgMasterCheck.rows[0].included_lc_count), 2);
  console.log('  ✓ Room All-In package saved and verified');

  // TEST 3: getPackages & getPackageDetails endpoint
  const getPkgsRes = createMockRes();
  await masterDataController.getPackages({}, getPkgsRes);
  assert.strictEqual(getPkgsRes.body.ok, true);
  const foundFnb = getPkgsRes.body.packages.find(p => p.package_id === testPkgFnbId);
  assert.ok(foundFnb, 'getPackages should return F&B bundle package');
  assert.strictEqual(Array.isArray(foundFnb.bundle_components), true);
  assert.strictEqual(foundFnb.bundle_components.length, 2);

  const getDetailRes = createMockRes();
  await masterDataController.getPackageDetails({ query: { package_id: testPkgFnbId } }, getDetailRes);
  assert.strictEqual(getDetailRes.body.ok, true);
  assert.strictEqual(getDetailRes.body.bundle_components.length, 2);
  console.log('  ✓ getPackages & getPackageDetails endpoint return full bundle components');

  // TEST 4: Validasi error (F&B bundle tanpa komponen wajib ditolak)
  const invalidRes = createMockRes();
  await masterDataController.savePackageMaster({}, invalidRes, {
    package_id: 'PKG-INVALID',
    package_name: 'Paket Kosong',
    package_type: 'fnb_bundle',
    selling_price: 100000,
    bundle_components: []
  });
  assert.strictEqual(invalidRes.body.ok, false, 'Empty F&B bundle must be rejected');
  console.log('  ✓ Validation rejecting empty F&B bundle verified');

  // Cleanup test packages
  await db.query('DELETE FROM package_details WHERE package_id IN ($1, $2)', [testPkgFnbId, testPkgRoomId]);
  await db.query('DELETE FROM recipe WHERE menu_id IN ($1, $2)', [testPkgFnbId, testPkgRoomId]);
  await db.query('DELETE FROM menu WHERE menu_id IN ($1, $2)', [testPkgFnbId, testPkgRoomId]);
  await db.query('DELETE FROM package_master WHERE package_id IN ($1, $2)', [testPkgFnbId, testPkgRoomId]);

  console.log('✅ ALL Unified Package Master & Bundle Management Tests PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
