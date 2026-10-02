const { getOperationalDate, getOperationalDateRange, toJakartaIsoString } = require('../src/utils/operationalDate');
const assert = require('assert');

function runTimezoneBoundaryTests() {
  console.log('🧪 Running Timezone Asia/Jakarta & Operational Date Boundary Tests...');

  // Test 1: 09:59:59 WIB boundary -> Previous Operational Date
  // 2026-06-21T09:59:59+07:00 is 2026-06-21 02:59:59 UTC
  const dt1 = new Date('2026-06-21T09:59:59+07:00');
  const opDate1 = getOperationalDate(dt1);
  assert.strictEqual(opDate1, '2026-06-20', '09:59:59 WIB should belong to previous operational date 2026-06-20');
  console.log('  ✓ 09:59:59 WIB boundary test passed (2026-06-20)');

  // Test 2: 10:00:00 WIB boundary -> Current Operational Date
  // 2026-06-21T10:00:00+07:00 is 2026-06-21 03:00:00 UTC
  const dt2 = new Date('2026-06-21T10:00:00+07:00');
  const opDate2 = getOperationalDate(dt2);
  assert.strictEqual(opDate2, '2026-06-21', '10:00:00 WIB should belong to operational date 2026-06-21');
  console.log('  ✓ 10:00:00 WIB boundary test passed (2026-06-21)');

  // Test 3: Month boundary (July 1 at 09:59:59 WIB vs 10:00:00 WIB)
  const dtMonthBefore = new Date('2026-07-01T09:59:59+07:00');
  const dtMonthAfter = new Date('2026-07-01T10:00:00+07:00');
  assert.strictEqual(getOperationalDate(dtMonthBefore), '2026-06-30', 'Month boundary 09:59:59 WIB test passed');
  assert.strictEqual(getOperationalDate(dtMonthAfter), '2026-07-01', 'Month boundary 10:00:00 WIB test passed');
  console.log('  ✓ Month boundary tests passed (2026-06-30 vs 2026-07-01)');

  // Test 4: Year boundary (Jan 1 at 09:59:59 WIB vs 10:00:00 WIB)
  const dtYearBefore = new Date('2027-01-01T09:59:59+07:00');
  const dtYearAfter = new Date('2027-01-01T10:00:00+07:00');
  assert.strictEqual(getOperationalDate(dtYearBefore), '2026-12-31', 'Year boundary 09:59:59 WIB test passed');
  assert.strictEqual(getOperationalDate(dtYearAfter), '2027-01-01', 'Year boundary 10:00:00 WIB test passed');
  console.log('  ✓ Year boundary tests passed (2026-12-31 vs 2027-01-01)');

  // Test 5: Period Ranges (today, yesterday, last7days, thismonth)
  const refDt = new Date('2026-06-21T15:00:00+07:00'); // OpDate = 2026-06-21
  const rangeToday = getOperationalDateRange('today', null, null, refDt);
  assert.deepStrictEqual(rangeToday, { startDate: '2026-06-21', endDate: '2026-06-21' });

  const rangeYesterday = getOperationalDateRange('yesterday', null, null, refDt);
  assert.deepStrictEqual(rangeYesterday, { startDate: '2026-06-20', endDate: '2026-06-20' });

  const rangeLast7 = getOperationalDateRange('last7days', null, null, refDt);
  assert.deepStrictEqual(rangeLast7, { startDate: '2026-06-15', endDate: '2026-06-21' });

  const rangeMonth = getOperationalDateRange('thismonth', null, null, refDt);
  assert.deepStrictEqual(rangeMonth, { startDate: '2026-06-01', endDate: '2026-06-21' });

  console.log('  ✓ Period ranges (today, yesterday, last7days, thismonth) tests passed');

  console.log('✅ ALL Timezone & Date Boundary Tests PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  try {
    runTimezoneBoundaryTests();
  } catch (err) {
    console.error('❌ Timezone Boundary Test Failed:', err);
    process.exit(1);
  }
}

module.exports = runTimezoneBoundaryTests;
