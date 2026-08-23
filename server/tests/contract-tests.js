const fs = require('fs');
const http = require('http');
const path = require('path');
const { Client } = require('pg');

process.env.DISABLE_SYNC_WORKER = '1';
process.env.PGDATABASE = process.env.PGTESTDATABASE || 'happy_song_pos_test';

const app = require('../src/server');
const db = require('../src/db');
const { getOperationalDateRange } = require('../src/utils/operationalDate');
const { getLatestOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

let serverInstance = null;
const PORT = 3099;

const TEST_ROOM_ID = 'ROOM-TEST-001';
const TEST_TARGET_ROOM_ID = 'ROOM-TEST-002';
const TEST_TARGET_ROOM_ID_2 = 'ROOM-TEST-003';
const TEST_ORPHAN_ROOM_ID = 'ROOM-TEST-004';
const TEST_ORPHAN_TARGET_ROOM_ID = 'ROOM-TEST-005';
const TEST_FNB_ROOM_ID = 'ROOM-TEST-FNB';
const TEST_MENU_ID = 'MENU-TEST-001';
const TEST_MENU_ID_2 = 'MENU-TEST-002';
const TEST_LC_ID = 'LC-TEST-001';
const TEST_LC_ID_2 = 'LC-TEST-002';
const TEST_TV_ID = 'TV-TEST-001';

async function ensureTestDatabase() {
  const targetDb = process.env.PGDATABASE;
  const config = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres'
  };

  const rootClient = new Client({ ...config, database: 'postgres', connectionTimeoutMillis: 3000 });
  try {
    await rootClient.connect();
    const existing = await rootClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (existing.rowCount === 0) {
      await rootClient.query(`CREATE DATABASE "${targetDb}"`);
    }
  } catch (err) {
    const detail = err.message || err.code || err.toString();
    throw new Error(`PostgreSQL test database unavailable: ${detail}`);
  } finally {
    await rootClient.end().catch(() => {});
  }

  const testClient = new Client({ ...config, database: targetDb, connectionTimeoutMillis: 3000 });
  try {
    await testClient.connect();
    const schemaSql = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    await testClient.query(schemaSql);
  } finally {
    await testClient.end().catch(() => {});
  }
}

async function seedContractData() {
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  await db.query(`
    INSERT INTO rooms (room_id, room_name, status, start_time, booked_duration_minutes, scheduled_end_time, rate_per_hour)
    VALUES
      ($1, 'Room Test Contract', 'available', NULL, 0, NULL, 100000),
      ($2, 'Room Test FNB', 'occupied', $3, 60, $4, 100000),
      ($5, 'Room Test Target', 'available', NULL, 0, NULL, 150000),
      ($6, 'Room Test Target Same Grade', 'available', NULL, 0, NULL, 150000),
      ($7, 'Room Test Orphan Active', 'occupied', $3, 60, $4, 125000),
      ($8, 'Room Test Orphan Target', 'available', NULL, 0, NULL, 185000)
    ON CONFLICT (room_id) DO UPDATE SET
      room_name = EXCLUDED.room_name,
      status = EXCLUDED.status,
      start_time = EXCLUDED.start_time,
      booked_duration_minutes = EXCLUDED.booked_duration_minutes,
      scheduled_end_time = EXCLUDED.scheduled_end_time,
      rate_per_hour = EXCLUDED.rate_per_hour,
      updated_at = CURRENT_TIMESTAMP
  `, [TEST_ROOM_ID, TEST_FNB_ROOM_ID, now, end, TEST_TARGET_ROOM_ID, TEST_TARGET_ROOM_ID_2, TEST_ORPHAN_ROOM_ID, TEST_ORPHAN_TARGET_ROOM_ID]);

  await db.query(`
    INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
    VALUES ('INV-TEST-001', 'Stok Red Label Test', 'Liquor', 'bottle', 10, 2, 'active'),
           ('INV-TEST-002', 'Stok Coca Cola Test', 'Beverage', 'can', 50, 5, 'active')
    ON CONFLICT (stock_item_id) DO UPDATE SET stock_qty = EXCLUDED.stock_qty, status = 'active'
  `);

  await db.query(`
    INSERT INTO menu (menu_id, menu_name, category, price, status, stock_tracking, stock_item_id, stock_qty_per_unit)
    VALUES ($1, 'JW Red Label Test', 'Liquor', 550000, 'active', 'yes', 'INV-TEST-001', 1),
           ($2, 'Coca Cola Test', 'Beverage', 25000, 'active', 'yes', 'INV-TEST-002', 1)
    ON CONFLICT (menu_id) DO UPDATE SET price = EXCLUDED.price, status = 'active', stock_tracking = EXCLUDED.stock_tracking, stock_item_id = EXCLUDED.stock_item_id
  `, [TEST_MENU_ID, TEST_MENU_ID_2]);

  await db.query(`
    INSERT INTO lc_master (lc_id, lc_name, rate_per_hour, status)
    VALUES
      ($1, 'LC Test 1', 50000, 'active'),
      ($2, 'LC Test 2', 50000, 'active')
    ON CONFLICT (lc_id) DO UPDATE SET rate_per_hour = EXCLUDED.rate_per_hour, status = 'active'
  `, [TEST_LC_ID, TEST_LC_ID_2]);

  await db.query(`
    INSERT INTO tv_devices (tv_device_id, room_id, device_name, control_type, status)
    VALUES ($1, $2, 'TV Test', 'mock', 'active')
    ON CONFLICT (tv_device_id) DO UPDATE SET room_id = EXCLUDED.room_id, control_type = 'mock', status = 'active'
  `, [TEST_TV_ID, TEST_ROOM_ID]);

  await db.query(`
    INSERT INTO employees (employee_id, employee_name, role, pin, salary_type, base_salary, is_active)
    VALUES ('EMP-TEST-OWNER', 'Owner Test', 'owner', '123456', 'monthly', 0, TRUE)
    ON CONFLICT (employee_id) DO UPDATE SET pin = '123456', role = 'owner', is_active = TRUE
  `);
}

function requestApi(method, pathUrl, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: pathUrl,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (err) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

function failureDetails(res) {
  if (!res.body) return res.text || `HTTP ${res.status}`;
  return String(res.body.message || res.body.error || res.body.code || JSON.stringify(res.body)).slice(0, 240);
}

async function runContractTests() {
  console.log('=============================================================================');
  console.log(`RUNNING APPS SCRIPT ACTION CONTRACT TEST SUITE ON ${process.env.PGDATABASE}`);
  console.log('=============================================================================');

  await ensureTestDatabase();
  await seedContractData();

  await new Promise((resolve) => {
    serverInstance = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Test server running on port ${PORT}...`);
      resolve();
    });
  });

  const testMatrix = [];

  async function testAction(name, type, pathUrl, bodyPayload, expectedCheck) {
    try {
      const res = type === 'GET'
        ? await requestApi('GET', pathUrl)
        : await requestApi('POST', pathUrl, bodyPayload);

      const pass = expectedCheck(res);
      testMatrix.push({ action: name, type, status: pass ? 'PASS' : 'FAIL', httpStatus: res.status, response: res.body });
      console.log(`  ${pass ? 'PASS' : 'FAIL'} [${type}] ${name}`);
      if (!pass) {
        console.log(`    ${failureDetails(res)}`);
      }
      return res;
    } catch (err) {
      testMatrix.push({ action: name, type, status: 'FAIL', error: err.message });
      console.log(`  FAIL [${type}] ${name}: ${err.message}`);
      return null;
    }
  }

  async function testDatabaseState(name, check) {
    try {
      const pass = await check();
      testMatrix.push({ action: name, type: 'DB', status: pass ? 'PASS' : 'FAIL' });
      console.log(`  ${pass ? 'PASS' : 'FAIL'} [DB] ${name}`);
    } catch (err) {
      testMatrix.push({ action: name, type: 'DB', status: 'FAIL', error: err.message });
      console.log(`  FAIL [DB] ${name}: ${err.message}`);
    }
  }

  await testAction('health', 'GET', '/exec?action=health', null, res => res.body.ok === true && res.body.status === 'healthy');
  await testAction('getApiCapabilities', 'GET', '/exec?action=getApiCapabilities', null, res => res.body.ok === true && res.body.local_first === true);
  await testAction('getRooms', 'GET', '/exec?action=getRooms', null, res => res.body.ok === true && Array.isArray(res.body.rooms));
  await testAction('getMenuItems', 'GET', '/exec?action=getMenuItems', null, res => res.body.ok === true && Array.isArray(res.body.items));
  await testAction('getInventoryItems', 'GET', '/exec?action=getInventoryItems', null, res => res.body.ok === true && Array.isArray(res.body.items));
  await testAction('getTodayTransactions', 'GET', '/exec?action=getTodayTransactions', null, res => res.body.ok === true && Array.isArray(res.body.transactions));
  await testAction('getTodayCashierClosings', 'GET', '/exec?action=getTodayCashierClosings', null, res => res.body.ok === true && Array.isArray(res.body.closings));
  await testAction('getLcMasterList', 'GET', '/exec?action=getLcMasterList', null, res => res.body.ok === true && Array.isArray(res.body.lcs));
  await testAction('getTvDevices', 'GET', '/exec?action=getTvDevices', null, res => res.body.ok === true && Array.isArray(res.body.tv_devices));
  await testAction('getEmployees', 'GET', '/exec?action=getEmployees', null, res => res.body.ok === true && Array.isArray(res.body.employees));
  await testAction('getPackages', 'GET', '/exec?action=getPackages', null, res => res.body.ok === true && Array.isArray(res.body.packages));
  await testAction('getPromos', 'GET', '/exec?action=getPromos', null, res => res.body.ok === true && Array.isArray(res.body.promos));
  await testAction('getOpenFnbOrders', 'GET', `/exec?action=getOpenFnbOrders&room_id=${TEST_FNB_ROOM_ID}`, null, res => res.body.ok === true && Array.isArray(res.body.orders));

  await testAction('validateAdminPin invalid rejection', 'POST', '/exec', { action: 'validateAdminPin', pin: '999999' }, res => res.body.ok === false && res.body.code === 'INVALID_ADMIN_PIN');
  await testAction('sendTvCommand mock bridge', 'POST', '/exec', { action: 'sendTvCommand', room_id: TEST_ROOM_ID, tv_action: 'power_on' }, res => res.body.ok === true);
  await testAction('saveFnbOrder payload verification', 'POST', '/exec', { action: 'saveFnbOrder', room_id: TEST_FNB_ROOM_ID, items: [{ menu_id: TEST_MENU_ID, quantity: 2 }], idempotency_key: `IDEM-FNB-${Date.now()}` }, res => res.body.ok === true && res.body.order_id);
  await db.query(`
    UPDATE room_sessions
    SET status = 'voided', updated_at = CURRENT_TIMESTAMP
    WHERE room_id = ANY($1) AND status IN ('starting', 'active')
  `, [[TEST_ORPHAN_ROOM_ID, TEST_ORPHAN_TARGET_ROOM_ID]]);
  await testAction('moveActiveSessionRoom recovers missing session record', 'POST', '/exec', { action: 'moveActiveSessionRoom', room_id: TEST_ORPHAN_ROOM_ID, target_room_id: TEST_ORPHAN_TARGET_ROOM_ID, reason: 'Contract test recover missing session', cashier_name: 'TestKasir', idempotency_key: `IDEM-MOVE-ORPHAN-${Date.now()}` }, res => res.body.ok === true && res.body.target_room?.room_id === TEST_ORPHAN_TARGET_ROOM_ID && Array.isArray(res.body.room_journey) && res.body.room_journey.length === 2);
  await testAction('assignSessionLcs frontend payload', 'POST', '/exec', { action: 'assignSessionLcs', room_id: TEST_ROOM_ID, lc_ids: `${TEST_LC_ID},${TEST_LC_ID_2}`, lc_assignments: `[{"lc_id":"${TEST_LC_ID}","duration_minutes":120}]` }, res => res.body.ok === true);
  await testAction('startSession', 'POST', '/exec', { action: 'startSession', room_id: TEST_ROOM_ID, duration_minutes: 60, cashier_name: 'TestKasir', idempotency_key: `IDEM-START-${Date.now()}` }, res => res.body.ok === true && res.body.session);
  await testAction('extendSession', 'POST', '/exec', { action: 'extendSession', room_id: TEST_ROOM_ID, add_minutes: 30, cashier_name: 'TestKasir' }, res => res.body.ok === true && res.body.room);
  let sessionFnbOrderId = '';
  let redLabelItemId = '';
  let cocaColaItemId = '';
  await testAction('saveFnbOrder active session (Red Label & Coca Cola)', 'POST', '/exec', {
    action: 'saveFnbOrder',
    room_id: TEST_ROOM_ID,
    items: [
      { menu_id: TEST_MENU_ID, quantity: 1 },
      { menu_id: TEST_MENU_ID_2, quantity: 2 }
    ],
    idempotency_key: `IDEM-FNB-SESSION-${Date.now()}`
  }, res => {
    sessionFnbOrderId = res.body.order_id || '';
    const items = res.body.items || [];
    redLabelItemId = items.find(it => it.menu_id === TEST_MENU_ID)?.order_item_id || '';
    cocaColaItemId = items.find(it => it.menu_id === TEST_MENU_ID_2)?.order_item_id || '';
    return res.body.ok === true && sessionFnbOrderId;
  });
  const moveIdempotencyKey = `IDEM-MOVE-${Date.now()}`;
  await testAction('moveActiveSessionRoom', 'POST', '/exec', { action: 'moveActiveSessionRoom', room_id: TEST_ROOM_ID, target_room_id: TEST_TARGET_ROOM_ID, reason: 'Contract test room transfer', cashier_name: 'TestKasir', idempotency_key: moveIdempotencyKey }, res => res.body.ok === true && res.body.target_room?.room_id === TEST_TARGET_ROOM_ID && Array.isArray(res.body.room_journey) && res.body.room_journey.length === 2);
  await testAction('moveActiveSessionRoom idempotent replay', 'POST', '/exec', { action: 'moveActiveSessionRoom', room_id: TEST_ROOM_ID, target_room_id: TEST_TARGET_ROOM_ID, reason: 'Contract test room transfer', cashier_name: 'TestKasir', idempotency_key: moveIdempotencyKey }, res => res.body.ok === true && res.body.idempotent_replay === true);
  await testAction('moveActiveSessionRoom same grade', 'POST', '/exec', { action: 'moveActiveSessionRoom', room_id: TEST_TARGET_ROOM_ID, target_room_id: TEST_TARGET_ROOM_ID_2, reason: 'Contract test same grade transfer', cashier_name: 'TestKasir', idempotency_key: `IDEM-MOVE-SAME-${Date.now()}` }, res => res.body.ok === true && res.body.same_rate === true && res.body.room_journey?.length === 3);
  let checkoutTransactionId = '';
  await testAction('closeSession postpaid contract', 'POST', '/exec', { action: 'closeSession', room_id: TEST_TARGET_ROOM_ID_2, cashier_name: 'TestKasir', idempotency_key: `IDEM-CLOSE-${Date.now()}` }, res => {
    checkoutTransactionId = res.body.transaction?.transaction_id || '';
    return res.body.ok === true && checkoutTransactionId && res.body.transaction?.payment_status === 'unpaid' && res.body.transaction?.fnb_total === 600000 && res.body.transaction?.room_total === 225000 && res.body.transaction?.room_journey?.length === 3;
  });
  await testAction('getTransactionLcEditDetails checkout review', 'GET', `/exec?action=getTransactionLcEditDetails&transaction_id=${encodeURIComponent(checkoutTransactionId)}`, null, res => res.body.ok === true && res.body.can_edit === true && res.body.requires_admin_pin === false && res.body.lc_logs?.length === 1 && res.body.lc_logs[0].duration_minutes === 120);
  await testAction('updateTransactionLcDurations 2h to 3h without PIN', 'POST', '/exec', {
    action: 'updateTransactionLcDurations',
    transaction_id: checkoutTransactionId,
    assignments: [{ lc_id: TEST_LC_ID, duration_minutes: 180 }],
    reason: 'Koreksi informasi koordinator LC',
    changed_by: 'TestKasir'
  }, res => res.body.ok === true && res.body.requires_admin_pin === false && res.body.old_lc_total === 100000 && res.body.lc_total === 150000 && res.body.difference === 50000 && res.body.grand_total === 975000);
  await testAction('getTransactionLcEditDetails after correction', 'GET', `/exec?action=getTransactionLcEditDetails&transaction_id=${encodeURIComponent(checkoutTransactionId)}`, null, res => res.body.ok === true && res.body.current_lc_total === 150000 && res.body.current_grand_total === 975000 && res.body.lc_logs?.[0]?.duration_minutes === 180);
  await testDatabaseState('LC correction audit and exact transaction linkage', async () => {
    const linked = await db.query('SELECT COUNT(*)::int AS count FROM lc_work_logs WHERE closed_transaction_id = $1 AND duration_minutes = 180 AND rate = 150000', [checkoutTransactionId]);
    const audit = await db.query("SELECT COUNT(*)::int AS count FROM transaction_correction_logs WHERE transaction_id = $1 AND correction_type = 'lc_duration_correction'", [checkoutTransactionId]);
    const transaction = await db.query(`
      SELECT room_total, fnb_total, lc_total, grand_total, payment_status
      FROM transactions WHERE transaction_id = $1
    `, [checkoutTransactionId]);
    const row = transaction.rows[0] || {};
    return linked.rows[0].count === 1
      && audit.rows[0].count === 1
      && Number(row.room_total) === 225000
      && Number(row.fnb_total) === 600000
      && Number(row.lc_total) === 150000
      && Number(row.grand_total) === 975000
      && row.payment_status === 'unpaid';
  });
  await testAction('voidTransactionFnbOrder partial item-level (Red Label only, keeping Coca Cola)', 'POST', '/exec', {
    action: 'voidTransactionFnbOrder',
    transaction_id: checkoutTransactionId,
    order_item_ids: [redLabelItemId],
    reason: 'Pelanggan membatalkan pesanan JW Red Label, Coca Cola tetap',
    admin_pin: '123456',
    changed_by: 'TestOwner'
  }, res => res.body.ok === true && res.body.transaction?.fnb_total === 50000 && res.body.transaction?.grand_total === 425000 && res.body.voided_amount === 550000 && Array.isArray(res.body.restored_stock) && res.body.restored_stock.length === 1);
  await testDatabaseState('Partial item void: Red Label is voided & restored, Coca Cola remains active in billed order', async () => {
    const fnbOrder = await db.query('SELECT order_status, order_total FROM fnb_orders WHERE order_id = $1', [sessionFnbOrderId]);
    const items = await db.query('SELECT menu_name, quantity, subtotal, is_voided FROM fnb_order_items WHERE order_id = $1 ORDER BY created_at ASC', [sessionFnbOrderId]);
    const redLabelStock = await db.query("SELECT stock_qty FROM inventory WHERE stock_item_id = 'INV-TEST-001'");
    const cocaColaStock = await db.query("SELECT stock_qty FROM inventory WHERE stock_item_id = 'INV-TEST-002'");
    const audit = await db.query("SELECT COUNT(*)::int AS count FROM transaction_correction_logs WHERE transaction_id = $1 AND correction_type = 'fnb_item_void_correction'", [checkoutTransactionId]);
    const trx = await db.query('SELECT fnb_total, grand_total FROM transactions WHERE transaction_id = $1', [checkoutTransactionId]);

    const redLabel = items.rows.find(i => i.menu_name.includes('Red Label'));
    const cocaCola = items.rows.find(i => i.menu_name.includes('Coca Cola'));

    return fnbOrder.rows[0]?.order_status === 'billed'
      && Number(fnbOrder.rows[0]?.order_total) === 50000
      && redLabel?.is_voided === true
      && cocaCola?.is_voided === false
      && Number(redLabelStock.rows[0]?.stock_qty) === 10
      && Number(cocaColaStock.rows[0]?.stock_qty) === 48
      && audit.rows[0]?.count === 1
      && Number(trx.rows[0]?.fnb_total) === 50000
      && Number(trx.rows[0]?.grand_total) === 425000;
  });
  await testAction('applyTransactionManualDiscount room first then FNB, LC untouched', 'POST', '/exec', {
    action: 'applyTransactionManualDiscount',
    transaction_id: checkoutTransactionId,
    discount_amount: 250000,
    reason: 'Diskon management untuk komplain customer',
    admin_pin: '123456',
    changed_by: 'TestManager'
  }, res => res.body.ok === true
    && res.body.transaction?.room_total === 0
    && res.body.transaction?.fnb_total === 25000
    && res.body.transaction?.lc_total === 150000
    && res.body.transaction?.grand_total === 175000
    && res.body.transaction?.manual_discount === 250000
    && res.body.transaction?.manual_discount_room === 225000
    && res.body.transaction?.manual_discount_fnb === 25000);
  await testDatabaseState('Manual discount audit keeps LC value intact', async () => {
    const audit = await db.query("SELECT COUNT(*)::int AS count FROM transaction_correction_logs WHERE transaction_id = $1 AND correction_type = 'manual_discount_correction'", [checkoutTransactionId]);
    const trx = await db.query('SELECT room_total, fnb_total, lc_total, grand_total, manual_discount, manual_discount_room, manual_discount_fnb FROM transactions WHERE transaction_id = $1', [checkoutTransactionId]);
    const row = trx.rows[0] || {};
    return audit.rows[0]?.count === 1
      && Number(row.room_total) === 0
      && Number(row.fnb_total) === 25000
      && Number(row.lc_total) === 150000
      && Number(row.grand_total) === 175000
      && Number(row.manual_discount) === 250000
      && Number(row.manual_discount_room) === 225000
      && Number(row.manual_discount_fnb) === 25000;
  });
  await testDatabaseState('owner mirror reuses exact-date snapshot after cutoff rollover', async () => {
    const sourceId = `rollover-test-${Date.now()}`;
    const range = getOperationalDateRange('yesterday');
    try {
      await db.query(`
        INSERT INTO owner_mirror_snapshots (
          source_id, mirror_version, generated_at, generated_at_wib, period,
          operational_date_start, operational_date_end, payload_json
        ) VALUES ($1, 'rollover-regression-v1', CURRENT_TIMESTAMP, '', 'today', $2, $3, $4)
      `, [
        sourceId,
        range.startDate,
        range.endDate,
        JSON.stringify({
          mirror_version: 'rollover-regression-v1',
          period: 'today',
          operational_date_start: range.startDate,
          operational_date_end: range.endDate,
          summary: { total_transactions: 7 }
        })
      ]);

      const snapshot = await getLatestOwnerMirrorSnapshot(sourceId, { period: 'yesterday' });
      return snapshot.has_snapshot === true
        && snapshot.period === 'yesterday'
        && snapshot.snapshot_period === 'today'
        && snapshot.period_relabelled === true
        && snapshot.operational_date_start === range.startDate
        && snapshot.operational_date_end === range.endDate
        && snapshot.summary?.total_transactions === 7;
    } finally {
      await db.query('DELETE FROM owner_mirror_snapshots WHERE source_id = $1', [sourceId]);
    }
  });
  await testAction('completeCleaning', 'POST', '/exec', { action: 'completeCleaning', room_id: TEST_ROOM_ID }, res => res.body.ok === true);
  await testAction('completeCleaning target', 'POST', '/exec', { action: 'completeCleaning', room_id: TEST_TARGET_ROOM_ID }, res => res.body.ok === true);
  await testAction('completeCleaning target same grade', 'POST', '/exec', { action: 'completeCleaning', room_id: TEST_TARGET_ROOM_ID_2 }, res => res.body.ok === true);
  await testAction('completeCleaning orphan source', 'POST', '/exec', { action: 'completeCleaning', room_id: TEST_ORPHAN_ROOM_ID }, res => res.body.ok === true);
  await testAction('completeCleaning orphan target', 'POST', '/exec', { action: 'completeCleaning', room_id: TEST_ORPHAN_TARGET_ROOM_ID }, res => res.body.ok === true);
  await testAction('saveCashierClosing', 'POST', '/exec', { action: 'saveCashierClosing', cash_actual: 500000, note: 'Closing test', cashier_name: 'TestKasir' }, res => res.body.ok === true || /sudah dilakukan/i.test(res.body.message || ''));
  await testAction('unknownActionRejection', 'GET', '/exec?action=invalidActionName', null, res => res.body.ok === false && res.body.code === 'UNKNOWN_ACTION');

  console.log('\n=============================================================================');
  console.log('CONTRACT TEST EXECUTION SUMMARY');
  console.log('=============================================================================');
  const total = testMatrix.length;
  const passed = testMatrix.filter(t => t.status === 'PASS').length;
  const failed = total - passed;

  console.log(`TOTAL ACTIONS TESTED: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`SUCCESS RATE: ${((passed / total) * 100).toFixed(1)}%`);
  console.log('=============================================================================\n');

  if (serverInstance) {
    await new Promise(resolve => serverInstance.close(resolve));
  }
  await db.pool.end();

  if (failed > 0) {
    console.error('Some contract tests failed.');
    process.exit(1);
  }

  console.log('All action contract tests passed.');
}

if (require.main === module) {
  runContractTests().catch(async (err) => {
    console.error('Fatal test runner error:', err.message || err);
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
}

module.exports = runContractTests;
