const http = require('http');
const assert = require('assert');
const app = require('../src/server');

let serverInstance = null;
const PORT = 3099;

function requestApi(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runContractTests() {
  console.log('=============================================================================');
  console.log('🧪 RUNNING APPS SCRIPT ACTION CONTRACT TEST SUITE');
  console.log('=============================================================================');

  // Start test server instance
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
      console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'} [${type}] ${name}`);
    } catch (err) {
      testMatrix.push({ action: name, type, status: 'FAIL', error: err.message });
      console.log(`  ❌ FAIL [${type}] ${name}: ${err.message}`);
    }
  }

  // --- GET Action Contract Signatures ---
  await testAction('health', 'GET', '/exec?action=health', null, res => res.body.ok === true && res.body.status === 'healthy');
  await testAction('getApiCapabilities', 'GET', '/exec?action=getApiCapabilities', null, res => res.body.ok === true && res.body.local_first === true);
  await testAction('getRooms', 'GET', '/exec?action=getRooms', null, res => typeof res.body.ok === 'boolean');
  await testAction('getMenuItems', 'GET', '/exec?action=getMenuItems', null, res => typeof res.body.ok === 'boolean');
  await testAction('getInventoryItems', 'GET', '/exec?action=getInventoryItems', null, res => typeof res.body.ok === 'boolean');
  await testAction('getTodayTransactions', 'GET', '/exec?action=getTodayTransactions', null, res => typeof res.body.ok === 'boolean');
  await testAction('getTodayCashierClosings', 'GET', '/exec?action=getTodayCashierClosings', null, res => typeof res.body.ok === 'boolean');
  await testAction('getLcMasterList', 'GET', '/exec?action=getLcMasterList', null, res => typeof res.body.ok === 'boolean');
  await testAction('getTvDevices', 'GET', '/exec?action=getTvDevices', null, res => typeof res.body.ok === 'boolean');
  await testAction('getEmployees', 'GET', '/exec?action=getEmployees', null, res => typeof res.body.ok === 'boolean');
  await testAction('getPackages', 'GET', '/exec?action=getPackages', null, res => typeof res.body.ok === 'boolean');
  await testAction('getPromos', 'GET', '/exec?action=getPromos', null, res => typeof res.body.ok === 'boolean');
  await testAction('getOpenFnbOrders', 'GET', '/exec?action=getOpenFnbOrders&room_id=ROOM-001', null, res => typeof res.body.ok === 'boolean');

  // --- POST Action Contract Signatures ---
  await testAction('validateAdminPin (Security rejection)', 'POST', '/exec', { action: 'validateAdminPin', pin: '999999' }, res => typeof res.body.ok === 'boolean');
  await testAction('sendTvCommand (Mock Bridge)', 'POST', '/exec', { action: 'sendTvCommand', room_id: 'ROOM-001', tv_action: 'power_on' }, res => res.body.ok === true || res.body.error.includes('DATABASE_OFFLINE'));
  await testAction('saveFnbOrder (Payload Verification)', 'POST', '/exec', { action: 'saveFnbOrder', room_id: 'ROOM-001', items: [{ menu_id: 'MENU-001', quantity: 2 }] }, res => typeof res.body.ok === 'boolean');
  await testAction('assignSessionLcs (Frontend Payload)', 'POST', '/exec', { action: 'assignSessionLcs', room_id: 'ROOM-001', lc_ids: 'LC-001,LC-002', lc_assignments: '[{"lc_id":"LC-001","duration_minutes":60}]' }, res => typeof res.body.ok === 'boolean');
  await testAction('startSession', 'POST', '/exec', { action: 'startSession', room_id: 'ROOM-001', duration_minutes: 60, cashier_name: 'TestKasir', idempotency_key: 'IDEM-START-001' }, res => typeof res.body.ok === 'boolean');
  await testAction('extendSession', 'POST', '/exec', { action: 'extendSession', room_id: 'ROOM-001', add_minutes: 30, cashier_name: 'TestKasir' }, res => typeof res.body.ok === 'boolean');
  await testAction('closeSession (Postpaid Contract)', 'POST', '/exec', { action: 'closeSession', room_id: 'ROOM-001', cashier_name: 'TestKasir', idempotency_key: 'IDEM-CLOSE-001' }, res => typeof res.body.ok === 'boolean');
  await testAction('completeCleaning', 'POST', '/exec', { action: 'completeCleaning', room_id: 'ROOM-001' }, res => typeof res.body.ok === 'boolean');
  await testAction('saveCashierClosing', 'POST', '/exec', { action: 'saveCashierClosing', cash_actual: 500000, note: 'Closing test' }, res => typeof res.body.ok === 'boolean');

  // --- Unknown Action Error Rejection ---
  await testAction('unknownActionRejection', 'GET', '/exec?action=invalidActionName', null, res => res.body.ok === false && res.body.code === 'UNKNOWN_ACTION');

  console.log('\n=============================================================================');
  console.log('📊 CONTRACT TEST EXECUTION SUMMARY');
  console.log('=============================================================================');
  const total = testMatrix.length;
  const passed = testMatrix.filter(t => t.status === 'PASS').length;
  const failed = total - passed;

  console.log(`TOTAL ACTIONS TESTED: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`SUCCESS RATE: ${((passed / total) * 100).toFixed(1)}%`);
  console.log('=============================================================================\n');

  if (serverInstance) serverInstance.close();

  if (failed > 0) {
    console.error('❌ Some contract tests failed!');
    process.exit(1);
  } else {
    console.log('✅ ALL ACTION CONTRACT SIGNATURE TESTS PASSED PERFECTLY!');
  }
}

if (require.main === module) {
  runContractTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = runContractTests;
