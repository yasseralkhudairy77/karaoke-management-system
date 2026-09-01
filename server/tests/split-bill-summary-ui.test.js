const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAppFunctions() {
  const appPath = path.resolve(__dirname, '../../js/app.js');
  const appSource = fs.readFileSync(appPath, 'utf8');

  // Extract necessary helper and calculation functions from app.js
  const sandbox = {
    Number,
    String,
    Math,
    Boolean,
    console,
    cashierClosingCashActual: 1000000,
    cashierClosingNote: 'Shift 1 Closing'
  };

  const codeToRun = `
    function getTransactionFinalTotal(t) {
      return Number(t?.grand_total || 0);
    }
    function getTransactionCashAmount(t) {
      return Number(t?.cash_amount || 0);
    }
    function getTransactionTransferAmount(t) {
      return Number(t?.transfer_amount || 0);
    }
  ` + appSource.slice(
    appSource.indexOf('function getTransactionPaymentBreakdownForSummary'),
    appSource.indexOf('function createCashierClosingCard')
  );

  vm.createContext(sandbox);
  vm.runInContext(codeToRun, sandbox);

  return sandbox;
}

async function run() {
  console.log('Running Split Bill Summary UI Tests...');
  const { calculateCashierRevenueSummary, calculateCashierClosingPreview } = loadAppFunctions();

  // Test 1: Exact TRX-1788281277792 scenario
  {
    const transactions = [
      {
        transaction_id: 'TRX-1788281277792',
        room_name: 'Room 5',
        grand_total: 1465000,
        payment_method: 'split',
        payment_status: 'paid',
        cash_amount: 1000000,
        transfer_amount: 465000
      }
    ];

    const summary = calculateCashierRevenueSummary(transactions);
    assert.strictEqual(summary.totalRevenue, 1465000, 'Total revenue must be 1.465.000');
    assert.strictEqual(summary.paidRevenue, 1465000, 'Paid revenue must be 1.465.000');
    assert.strictEqual(summary.paidCount, 1, 'Paid count must be 1');
    assert.strictEqual(summary.cashRevenue, 1000000, 'Cash revenue must be 1.000.000');
    assert.strictEqual(summary.cashCount, 1, 'Cash count must be 1');
    assert.strictEqual(summary.transferRevenue, 465000, 'Transfer revenue must be 465.000');
    assert.strictEqual(summary.transferCount, 1, 'Transfer count must be 1');
    assert.strictEqual(summary.unpaidRevenue, 0, 'Unpaid revenue must be 0');

    const preview = calculateCashierClosingPreview(transactions);
    assert.strictEqual(preview.paidRevenue, 1465000, 'Closing paid revenue must be 1.465.000');
    assert.strictEqual(preview.cashExpected, 1000000, 'Closing cash expected must be 1.000.000');
    assert.strictEqual(preview.cashTransactions, 1, 'Closing cash transactions must be 1');
    assert.strictEqual(preview.transferRevenue, 465000, 'Closing transfer revenue must be 465.000');
    assert.strictEqual(preview.transferTransactions, 1, 'Closing transfer transactions must be 1');
    assert.strictEqual(preview.cashActual, 1000000);
    assert.strictEqual(preview.cashDifference, 0, 'Cash difference should be 0 when actual matches expected');

    console.log('  PASS: TRX-1788281277792 split bill allocates 1M cash and 465k transfer correctly');
  }

  // Test 2: Mixed Transactions (Cash, Transfer, Split, and Unpaid)
  {
    const transactions = [
      { transaction_id: 'TRX-1', grand_total: 200000, payment_method: 'cash', payment_status: 'paid' },
      { transaction_id: 'TRX-2', grand_total: 300000, payment_method: 'transfer', payment_status: 'paid' },
      { transaction_id: 'TRX-3', grand_total: 500000, payment_method: 'split', payment_status: 'paid', cash_amount: 200000, transfer_amount: 300000 },
      { transaction_id: 'TRX-4', grand_total: 150000, payment_method: '', payment_status: 'unpaid' },
    ];

    const summary = calculateCashierRevenueSummary(transactions);
    assert.strictEqual(summary.totalRevenue, 1150000);
    assert.strictEqual(summary.paidRevenue, 1000000);
    assert.strictEqual(summary.unpaidRevenue, 150000);
    assert.strictEqual(summary.cashRevenue, 400000); // 200k + 200k
    assert.strictEqual(summary.transferRevenue, 600000); // 300k + 300k
    assert.strictEqual(summary.cashCount, 2);
    assert.strictEqual(summary.transferCount, 2);

    const preview = calculateCashierClosingPreview(transactions);
    assert.strictEqual(preview.cashExpected, 400000);
    assert.strictEqual(preview.transferRevenue, 600000);
    assert.strictEqual(preview.paidRevenue, 1000000);
    assert.strictEqual(preview.unpaidRevenue, 150000);

    console.log('  PASS: Mixed transactions aggregate cash, transfer, split, and unpaid perfectly');
  }

  console.log('All Split Bill Summary UI Tests Passed Successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
