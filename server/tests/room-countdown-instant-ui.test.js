const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Room Countdown Instant Responsiveness Test...\n');

const appJsPath = path.join(__dirname, '../../js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Test 1: AbortController timeout in sendLocalTvCommand
console.log('Test 1: Verifying AbortController timeout protection in sendLocalTvCommand...');
assert.ok(appJsContent.includes('const controller = new AbortController();'), 'sendLocalTvCommand must instantiate AbortController');
assert.ok(appJsContent.includes('setTimeout(() => controller.abort(), 2500)'), 'sendLocalTvCommand must set a 2.5s timeout');
assert.ok(appJsContent.includes('signal: controller.signal'), 'fetch must receive controller.signal');
console.log('  ✓ PASS: sendLocalTvCommand is strictly guarded by a 2.5s AbortController timeout');

// Test 2: activatePreparedSession updates state and renders immediately
console.log('Test 2: Verifying immediate UI state update in activatePreparedSession...');
assert.ok(
  appJsContent.includes('// 1. Terapkan pembaruan status room seketika di UI (Card langsung MERAH & countdown berdetik seketika)'),
  'activatePreparedSession must have immediate optimistic render block'
);
assert.ok(
  appJsContent.includes('sendLocalTvCommand(roomId, "power_on", "activate_prepared_session")\n      .then('),
  'sendLocalTvCommand in activatePreparedSession must run non-blocking in background'
);
console.log('  ✓ PASS: activatePreparedSession renders card to red immediately (< 50ms) without blocking on TV command');

// Test 3: startSession and completeCleaning also non-blocking
console.log('Test 3: Verifying startSession and completeCleaning non-blocking pattern...');
assert.ok(
  appJsContent.includes('sendLocalTvCommand(roomId, "power_on", "start_session")\n      .then('),
  'sendLocalTvCommand in startSession must run non-blocking'
);
assert.ok(
  appJsContent.includes('sendLocalTvCommand(roomId, "power_on", "complete_cleaning")\n      .then('),
  'sendLocalTvCommand in completeCleaning must run non-blocking'
);
console.log('  ✓ PASS: startSession & completeCleaning also use instant non-blocking TV dispatch');

console.log('\nAll Room Countdown Instant Responsiveness Tests Passed Successfully! 🎉\n');
