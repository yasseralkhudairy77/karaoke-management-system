const assert = require('assert');
const { BACKUP_TABLES, getDatabaseStatus, exportDatabase, restoreDatabase } = require('../src/controllers/backupController');

async function runBackupRestoreTests() {
  console.log('Running Database Backup & Restore Unit Tests...\n');

  // Test 1: Verify Table Count & Schema Coverage
  console.log('Test 1: Validating table coverage and dependency order...');
  assert.strictEqual(BACKUP_TABLES.length, 41, 'Must include exactly 41 relational tables');
  
  // Verify critical independent tables are placed before dependent tables
  const idxInventory = BACKUP_TABLES.indexOf('inventory');
  const idxMenu = BACKUP_TABLES.indexOf('menu');
  const idxRecipe = BACKUP_TABLES.indexOf('recipe');
  const idxTransactions = BACKUP_TABLES.indexOf('transactions');
  const idxFnbOrders = BACKUP_TABLES.indexOf('fnb_orders');
  const idxFnbItems = BACKUP_TABLES.indexOf('fnb_order_items');
  const idxFnbComponents = BACKUP_TABLES.indexOf('fnb_order_item_components');

  assert.ok(idxInventory < idxMenu, 'inventory must precede menu');
  assert.ok(idxMenu < idxRecipe, 'menu must precede recipe');
  assert.ok(idxTransactions < idxFnbOrders, 'transactions must precede fnb_orders');
  assert.ok(idxFnbOrders < idxFnbItems, 'fnb_orders must precede fnb_order_items');
  assert.ok(idxFnbItems < idxFnbComponents, 'fnb_order_items must precede fnb_order_item_components');
  console.log('  ✓ PASS: All 41 tables included with verified foreign key dependency hierarchy');

  // Test 2: Restore requires PIN
  console.log('Test 2: Verifying security PIN requirement...');
  let resStatus = null;
  let resBody = null;
  const mockRes = {
    status: (code) => {
      resStatus = code;
      return {
        json: (data) => {
          resBody = data;
          return data;
        }
      };
    },
    json: (data) => {
      resBody = data;
      return data;
    },
    setHeader: () => {},
    send: (content) => {
      resBody = content;
      return content;
    }
  };

  await restoreDatabase({ body: {} }, mockRes);
  assert.strictEqual(resStatus, 403, 'Must return 403 when PIN is absent');
  assert.strictEqual(resBody.code, 'ADMIN_PIN_REQUIRED');
  console.log('  ✓ PASS: Rejects restore request without PIN (403)');

  // Test 3: Restore requires explicit PULIHKAN confirmation text
  console.log('Test 3: Verifying PULIHKAN confirmation text requirement...');
  resStatus = null;
  resBody = null;
  await restoreDatabase({ body: { admin_pin: '1234', confirmation_text: 'YA' } }, mockRes);
  assert.strictEqual(resStatus, 400, 'Must return 400 when confirmation text is not PULIHKAN');
  assert.strictEqual(resBody.code, 'CONFIRMATION_REQUIRED');
  console.log('  ✓ PASS: Rejects restore request without exact PULIHKAN confirmation (400)');

  // Test 4: Export Format Structure
  console.log('Test 4: Verifying export structure formatting...');
  let exportedData = null;
  const mockExportRes = {
    headers: {},
    setHeader: function(k, v) { this.headers[k] = v; },
    send: function(body) { exportedData = JSON.parse(body); return body; }
  };

  // We can mock db.query to return dummy records
  const db = require('../src/db');
  const originalQuery = db.query;
  db.query = async (text) => {
    return { rows: [{ id: 'sample_id', name: 'sample_name' }] };
  };

  try {
    await exportDatabase({}, mockExportRes);
    assert.ok(mockExportRes.headers['Content-Disposition'].includes('attachment; filename="happy_song_backup_'), 'Header must specify attachment filename');
    assert.strictEqual(exportedData.app, 'Happy Song Karaoke Management System');
    assert.strictEqual(exportedData.schema_version, '1.0');
    assert.strictEqual(exportedData.total_tables, 41);
    assert.ok(exportedData.data && typeof exportedData.data === 'object');
    assert.ok(exportedData.data.settings, 'Export must include settings table');
    assert.ok(exportedData.data.transactions, 'Export must include transactions table');
    console.log('  ✓ PASS: Database export produces valid schema metadata & table data snapshot');
  } finally {
    db.query = originalQuery;
  }

  // Test 5: Status Check Response
  console.log('Test 5: Verifying status check response...');
  let statusData = null;
  const mockStatusRes = {
    json: (d) => { statusData = d; return d; }
  };

  db.query = async (text) => {
    return { rows: [{ count: 12 }] };
  };

  try {
    await getDatabaseStatus({}, mockStatusRes);
    assert.strictEqual(statusData.ok, true);
    assert.strictEqual(statusData.status, 'online');
    assert.strictEqual(statusData.total_tables, 41);
    assert.strictEqual(statusData.counts.transactions, 12);
    console.log('  ✓ PASS: Status endpoint returns connectivity & table row counts');
  } finally {
    db.query = originalQuery;
  }

  console.log('\nAll Backup & Restore Unit Tests Passed Successfully! 🎉\n');
}

runBackupRestoreTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
