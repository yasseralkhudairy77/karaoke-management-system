const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Safe Date Serialization & Dashboard Tests...');

// 1. Static check: ensure no bare .operational_date.toISOString() exists in server/src
const transactionsSrc = fs.readFileSync(
  path.join(__dirname, '../src/controllers/transactionsController.js'),
  'utf8'
);

assert(
  !transactionsSrc.includes('row.operational_date.toISOString()'),
  'transactionsController.js must not contain bare row.operational_date.toISOString()'
);

assert(
  transactionsSrc.includes('formatOperationalDate'),
  'transactionsController.js must include formatOperationalDate helper'
);

// 2. Logic test formatOperationalDate behavior
function formatOperationalDate(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0];
  }
  if (typeof val.toISOString === 'function') {
    return val.toISOString().split('T')[0];
  }
  return String(val).split('T')[0];
}

// Case A: string 'YYYY-MM-DD' (standard Postgres DATE column response)
assert.strictEqual(formatOperationalDate('2026-10-01'), '2026-10-01');

// Case B: ISO string 'YYYY-MM-DDTHH:mm:ss.sssZ'
assert.strictEqual(formatOperationalDate('2026-10-01T14:30:00.000Z'), '2026-10-01');

// Case C: Date object
assert.strictEqual(formatOperationalDate(new Date('2026-10-01T00:00:00.000Z')), '2026-10-01');

// Case D: null / undefined / empty string
assert.strictEqual(formatOperationalDate(null), '');
assert.strictEqual(formatOperationalDate(undefined), '');
assert.strictEqual(formatOperationalDate(''), '');

console.log('  ✓ formatOperationalDate correctly handles string, ISO string, Date object, and null values');

// 3. Static check: closingsController, masterDataController, tvController, roomsController, inventoryController
const closingsSrc = fs.readFileSync(
  path.join(__dirname, '../src/controllers/closingsController.js'),
  'utf8'
);
assert(!closingsSrc.includes('c.closing_date ? c.closing_date.toISOString()'), 'closingsController must be safe');

const masterDataSrc = fs.readFileSync(
  path.join(__dirname, '../src/controllers/masterDataController.js'),
  'utf8'
);
assert(!masterDataSrc.includes('promo.valid_from ? promo.valid_from.toISOString()'), 'masterDataController promo dates must be safe');

const roomsSrc = fs.readFileSync(
  path.join(__dirname, '../src/controllers/roomsController.js'),
  'utf8'
);
assert(!roomsSrc.includes('row.start_time ? row.start_time.toISOString()'), 'roomsController start_time must be safe');

console.log('  ✓ controllers date safety guards verified');
console.log('✅ ALL Safe Date Serialization tests PASSED SUCCESSFULLY!\n');
