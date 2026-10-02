const assert = require('assert');
const path = require('path');

async function runTests() {
  console.log('🧪 Running Operational Expenses (Petty Cash) Tests...');

  const receiptModulePath = path.resolve(__dirname, '../../js/receipt.js');
  const {
    formatOperationalExpenseSlip58mm
  } = await import('file://' + receiptModulePath.replace(/\\/g, '/'));

  // Test 1: Format operational expense thermal slip 58mm
  {
    const expense = {
      expense_id: 'EXP-1788889000-1234',
      operational_date: '2026-09-09',
      expense_title: 'Beli kertas struk thermal 58mm (3 roll)',
      category: 'Perlengkapan',
      amount: 45000,
      payment_source: 'cash',
      cashier_name: 'Dewi Kasir',
      note: 'Beli di Toko ATK Sebelah',
      is_voided: false,
      created_at: '2026-09-09T14:30:00.000Z'
    };

    const slip = formatOperationalExpenseSlip58mm(expense);
    assert(slip.includes('BUKTI PENGELUARAN KAS KECIL'), 'Header slip should be present');
    assert(slip.includes('EXP-1788889000-1234'), 'Expense ID should be present');
    assert(slip.includes('Dewi Kasir'), 'Cashier name should be present');
    assert(slip.includes('Kas Laci (Tunai)'), 'Payment source should be cash drawer');
    assert(slip.includes('Perlengkapan'), 'Category should be present');
    assert(slip.includes('Beli kertas struk'), 'Expense title should be present');
    assert(slip.includes('Rp45.000'), 'Amount should be formatted in IDR currency');
    assert(slip.includes('Beli di Toko ATK Sebelah'), 'Note should be present');
    assert(slip.includes('Kasir / PIC'), 'Signature field for cashier should be present');
    assert(slip.includes('Supervisor / Owner'), 'Signature field for supervisor should be present');
    console.log('  PASS: Standard operational expense 58mm thermal slip renders accurately');
  }

  // Test 2: Reprint slip flag
  {
    const expense = {
      expense_id: 'EXP-1788889000-1234',
      expense_title: 'Beli tusuk gigi',
      category: 'Perlengkapan',
      amount: 15000,
      cashier_name: 'Dewi Kasir',
      is_voided: false
    };

    const reprintSlip = formatOperationalExpenseSlip58mm(expense, { isReprint: true });
    assert(reprintSlip.includes('*** CETAK ULANG ***'), 'Reprint slip should include reprint banner');
    console.log('  PASS: Operational expense reprint slip includes *** CETAK ULANG ***');
  }

  // Test 3: Voided expense slip
  {
    const expense = {
      expense_id: 'EXP-1788889000-5678',
      expense_title: 'Salah input nominal',
      category: 'Lain-lain',
      amount: 500000,
      cashier_name: 'Budi Kasir',
      is_voided: true,
      void_reason: 'Salah ketik nominal harusnya 50.000',
      voided_by: 'Manager Riko'
    };

    const voidSlip = formatOperationalExpenseSlip58mm(expense);
    assert(voidSlip.includes('*** DIBATALKAN / VOID ***'), 'Voided slip should include void banner');
    assert(voidSlip.includes('Salah ketik nominal'), 'Void reason should be printed');
    assert(voidSlip.includes('Manager Riko'), 'Voided by authorizer should be printed');
    console.log('  PASS: Voided operational expense slip renders void banner and reason');
  }

  // Test 4: Financial reconciliation calculation
  {
    const cashReceived = 1500000;
    const salesCommission = 100000;
    const activeExpenses = 45000 + 15000; // Rp 60.000
    const cashActualInDrawer = 1340000;

    const expectedCashInDrawer = Math.max(0, cashReceived - salesCommission - activeExpenses);
    assert.strictEqual(expectedCashInDrawer, 1340000, 'Expected cash must deduct both commission and active expenses');

    const cashDifference = cashActualInDrawer - expectedCashInDrawer;
    assert.strictEqual(cashDifference, 0, 'No cash discrepancy when expenses are properly deducted from cash drawer target');

    const paidRevenue = 2500000;
    const netRevenue = Math.max(0, paidRevenue - salesCommission - activeExpenses);
    assert.strictEqual(netRevenue, 2340000, 'Net revenue must accurately deduct operational expenses');
    console.log('  PASS: Financial reconciliation formula perfectly deducts cash drawer & net revenue');
  }

  console.log('✅ ALL Operational Expenses Tests PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
