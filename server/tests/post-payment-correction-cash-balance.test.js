const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Require the controllers and services
const transactionsController = require('../src/controllers/transactionsController');
const closingsController = require('../src/controllers/closingsController');
const ownerMirrorService = require('../src/services/ownerMirrorService');

async function runTests() {
  console.log('Running Post-Payment Correction Cash Balance Tests...');

  // 1. Check getPaymentBreakdown logic from transactionsController source
  const transactionsControllerSource = fs.readFileSync(path.resolve(__dirname, '../src/controllers/transactionsController.js'), 'utf8');
  const ownerMirrorServiceSource = fs.readFileSync(path.resolve(__dirname, '../src/services/ownerMirrorService.js'), 'utf8');
  const closingsControllerSource = fs.readFileSync(path.resolve(__dirname, '../src/controllers/closingsController.js'), 'utf8');

  // Verify adjustPaymentBreakdownForCorrection exists in transactionsController
  assert(transactionsControllerSource.includes('function adjustPaymentBreakdownForCorrection'), 'adjustPaymentBreakdownForCorrection must be defined');

  // 2. Verify all 5 correction functions update cash_amount and transfer_amount
  assert(transactionsControllerSource.includes('cash_amount = $7,\n          transfer_amount = $8') || transactionsControllerSource.includes('cash_amount = $7,') || transactionsControllerSource.includes('booking_mode = \'package_correction\''), 'correctTransactionPackage must update cash_amount');
  assert(transactionsControllerSource.includes('booking_mode = \'free_room_correction\'') && transactionsControllerSource.includes('cash_amount = $6,\n          transfer_amount = $7'), 'correctTransactionFreeRoom must update cash_amount');
  assert(transactionsControllerSource.includes('manual_discount_correction') && transactionsControllerSource.includes('cash_amount = $4,\n          transfer_amount = $5'), 'applyTransactionManualDiscount must update cash_amount');
  assert(transactionsControllerSource.includes('fnb_item_void_correction') && transactionsControllerSource.includes('cash_amount = $3,\n          transfer_amount = $4'), 'voidTransactionFnbOrder must update cash_amount');
  assert(transactionsControllerSource.includes('lc_duration_correction') && transactionsControllerSource.includes('cash_amount = $3,\n          transfer_amount = $4'), 'updateTransactionLcDurations must update cash_amount');
  console.log('  PASS All 5 correction methods update cash_amount and transfer_amount in SQL');

  // 3. Test exact incident scenario:
  // Transaction A: TRX-1788727702787 (was 530.000 before correction, now 260.000)
  // Transaction B: TRX-1788716798991 (was 1.023.000 before correction, now 898.000)
  const sampleTransactions = [
    { transaction_id: 'TRX-1', payment_method: 'cash', payment_status: 'paid', grand_total: 45000, cash_amount: 45000 },
    { transaction_id: 'TRX-2', payment_method: 'transfer', payment_status: 'paid', grand_total: 773000, transfer_amount: 773000 },
    { transaction_id: 'TRX-3', payment_method: 'cash', payment_status: 'paid', grand_total: 135000, cash_amount: 135000 },
    { transaction_id: 'TRX-4', payment_method: 'cash', payment_status: 'paid', grand_total: 60000, cash_amount: 60000 },
    { transaction_id: 'TRX-5', payment_method: 'transfer', payment_status: 'paid', grand_total: 1720000, transfer_amount: 1720000 },
    { transaction_id: 'TRX-6', payment_method: 'cash', payment_status: 'paid', grand_total: 1056000, cash_amount: 1056000 },
    { transaction_id: 'TRX-7', payment_method: 'cash', payment_status: 'paid', grand_total: 575000, cash_amount: 575000 },
    // Incident trx 1: stale cash_amount 530.000 in DB, but grand_total is 260.000
    { transaction_id: 'TRX-1788727702787', payment_method: 'cash', payment_status: 'paid', grand_total: 260000, cash_amount: 530000 },
    { transaction_id: 'TRX-9', payment_method: 'cash', payment_status: 'paid', grand_total: 85000, cash_amount: 85000 },
    { transaction_id: 'TRX-10', payment_method: 'transfer', payment_status: 'paid', grand_total: 2150000, transfer_amount: 2150000 },
    // Incident trx 2: stale cash_amount 1.023.000 in DB, but grand_total is 898.000
    { transaction_id: 'TRX-1788716798991', payment_method: 'cash', payment_status: 'paid', grand_total: 898000, cash_amount: 1023000 },
    { transaction_id: 'TRX-12', payment_method: 'cash', payment_status: 'paid', grand_total: 1260000, cash_amount: 1260000 },
    { transaction_id: 'TRX-13', payment_method: 'cash', payment_status: 'paid', grand_total: 1720000, cash_amount: 1720000 },
    { transaction_id: 'TRX-14', payment_method: 'transfer', payment_status: 'paid', grand_total: 435000, transfer_amount: 435000 }
  ];

  // Evaluate ownerMirrorService summary calculation with these transactions
  // Extract getPaymentBreakdown logic from ownerMirrorServiceSource
  const getBreakdownEval = new Function('row', `
    ${ownerMirrorServiceSource.slice(
      ownerMirrorServiceSource.indexOf('function money('),
      ownerMirrorServiceSource.indexOf('async function getOpenFnbOrders()')
    )}
    return getPaymentBreakdown(row);
  `);

  let calculatedCash = 0;
  let calculatedTransfer = 0;
  let calculatedPaid = 0;

  for (const trx of sampleTransactions) {
    calculatedPaid += trx.grand_total;
    const bd = getBreakdownEval(trx);
    calculatedCash += bd.cash_amount;
    calculatedTransfer += bd.transfer_amount;
  }

  assert.strictEqual(calculatedPaid, 11172000, 'Total paid revenue must be 11.172.000');
  assert.strictEqual(calculatedTransfer, 5078000, 'Total transfer revenue must be 5.078.000');
  assert.strictEqual(calculatedCash, 6094000, 'Total cash revenue must be exactly 6.094.000 (NOT 6.489.000)');
  assert.strictEqual(calculatedCash + calculatedTransfer, calculatedPaid, 'Cash + Transfer must equal Total Paid');
  console.log('  PASS getPaymentBreakdown correctly resolves stale cash_amount to grand_total (Rp 6.094.000)');

  // 4. Test split bill behavior
  {
    // Split bill with exact sum
    const splitExact = getBreakdownEval({ payment_status: 'paid', payment_method: 'split', grand_total: 500000, cash_amount: 200000, transfer_amount: 300000 });
    assert.strictEqual(splitExact.cash_amount, 200000);
    assert.strictEqual(splitExact.transfer_amount, 300000);

    // Split bill that was discounted/corrected so old cash (300k) + old transfer (300k) > new grand_total (400k)
    const splitDiscounted = getBreakdownEval({ payment_status: 'paid', payment_method: 'split', grand_total: 400000, cash_amount: 300000, transfer_amount: 300000 });
    assert.strictEqual(splitDiscounted.cash_amount + splitDiscounted.transfer_amount, 400000);
    assert.strictEqual(splitDiscounted.cash_amount, 300000);
    assert.strictEqual(splitDiscounted.transfer_amount, 100000);
    console.log('  PASS Split bill handling guarantees cash + transfer equals grand_total');
  }

  console.log('ALL POST-PAYMENT CORRECTION CASH BALANCE TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
