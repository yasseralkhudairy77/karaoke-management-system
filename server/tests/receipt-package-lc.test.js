const assert = require('assert');
const path = require('path');

async function run() {
  const receiptModulePath = path.resolve(__dirname, '../../js/receipt.js');
  const { buildReceiptData, formatReceipt58mm } = await import('file://' + receiptModulePath.replace(/\\/g, '/'));

  console.log('Running Receipt Package LC Tests...');

  // Test 1: 100% Included LC (Rp 0)
  {
    const transaction = {
      transaction_id: 'TRX-PKG-1',
      room_id: 'ROOM-1',
      room_name: 'Room VIP 1',
      booking_mode: 'package',
      package_id: 'PKG-VIP-1',
      package_name: 'Paket Sultan 2 Jam',
      room_total: 500000,
      fnb_total: 0,
      lc_total: 0,
      grand_total: 500000,
      payment_method: 'cash',
      payment_status: 'paid',
      cashier_name: 'Budi',
      start_time: '2026-09-02T10:00:00.000Z',
      end_time: '2026-09-02T12:00:00.000Z',
      duration_minutes: 120,
      lc_details: {
        detail_available: true,
        lc_logs: [
          {
            lc_id: 'LC-024',
            lc_name: 'Karin',
            duration_minutes: 120,
            included_minutes: 120,
            extra_minutes: 0,
            rate_per_hour: 175000,
            payable_amount: 350000,
            rate: 350000,
            customer_charge_amount: 0,
            billing_source: 'package_included'
          }
        ],
        total: 0
      }
    };

    const receiptData = buildReceiptData(transaction, {
      lcDetails: transaction.lc_details
    });

    assert.strictEqual(receiptData.lc.hasLc, true, 'hasLc should be true even when customer charge is 0');
    assert.strictEqual(receiptData.lc.items.length, 1, 'Should contain 1 LC item');
    assert.strictEqual(receiptData.lc.items[0].name, 'Karin');
    assert.strictEqual(receiptData.lc.items[0].amount, 0, 'Customer amount should be 0');
    assert.strictEqual(receiptData.lc.total, 0, 'LC total should be 0');

    const formatted = formatReceipt58mm(receiptData);
    assert(formatted.includes('DETAIL LC'), 'Receipt should include DETAIL LC section');
    assert(formatted.includes('Karin'), 'Receipt should display LC name Karin');
    assert(formatted.includes('Termasuk Paket'), 'Receipt should show Termasuk Paket status');
    assert(formatted.includes('Tagihan                      Rp0'), 'Receipt should show Tagihan Rp0');
    assert(formatted.includes('SUBTOTAL LC                  Rp0'), 'Receipt should show SUBTOTAL LC Rp0');
    console.log('  PASS: 100% Package Included LC renders Rp 0 with Termasuk Paket status');
  }

  // Test 2: Partial Extra Hours LC
  {
    const transaction = {
      transaction_id: 'TRX-PKG-2',
      room_name: 'Room 2',
      booking_mode: 'package',
      package_name: 'Paket Hemat 2 Jam',
      room_total: 400000,
      fnb_total: 0,
      lc_total: 175000,
      grand_total: 575000,
      lc_details: {
        detail_available: true,
        lc_logs: [
          {
            lc_id: 'LC-024',
            lc_name: 'Karin',
            duration_minutes: 180,
            included_minutes: 120,
            extra_minutes: 60,
            rate_per_hour: 175000,
            payable_amount: 525000,
            rate: 525000,
            customer_charge_amount: 175000,
            billing_source: 'package_partial'
          }
        ],
        total: 175000
      }
    };

    const receiptData = buildReceiptData(transaction, {
      lcDetails: transaction.lc_details
    });

    assert.strictEqual(receiptData.lc.hasLc, true);
    assert.strictEqual(receiptData.lc.items[0].amount, 175000);

    const formatted = formatReceipt58mm(receiptData);
    assert(formatted.includes('Karin'));
    assert(formatted.includes('2 jam included'));
    assert(formatted.includes('Extra Jam'));
    assert(formatted.includes('Tagihan                Rp175.000'));
    assert(formatted.includes('SUBTOTAL LC            Rp175.000'));
    console.log('  PASS: Partial Package LC renders included duration, extra duration, and extra charge');
  }

  // Test 3: Mixed (1 Included LC + 1 Extra LC)
  {
    const transaction = {
      transaction_id: 'TRX-PKG-3',
      room_name: 'Room 3',
      booking_mode: 'package',
      package_name: 'Paket Party',
      room_total: 600000,
      fnb_total: 0,
      lc_total: 300000,
      grand_total: 900000,
      lc_details: {
        detail_available: true,
        lc_logs: [
          {
            lc_id: 'LC-024',
            lc_name: 'Karin',
            duration_minutes: 120,
            included_minutes: 120,
            extra_minutes: 0,
            rate_per_hour: 175000,
            payable_amount: 350000,
            customer_charge_amount: 0,
            billing_source: 'package_included'
          },
          {
            lc_id: 'LC-039',
            lc_name: 'Ketrin',
            duration_minutes: 120,
            included_minutes: 0,
            extra_minutes: 120,
            rate_per_hour: 150000,
            payable_amount: 300000,
            customer_charge_amount: 300000,
            billing_source: 'extra_charge'
          }
        ],
        total: 300000
      }
    };

    const receiptData = buildReceiptData(transaction, {
      lcDetails: transaction.lc_details
    });

    assert.strictEqual(receiptData.lc.items.length, 2);
    const formatted = formatReceipt58mm(receiptData);
    assert(formatted.includes('Karin'));
    assert(formatted.includes('Termasuk Paket'));
    assert(formatted.includes('Ketrin'));
    assert(formatted.includes('Extra LC'));
    assert(formatted.includes('SUBTOTAL LC            Rp300.000'));
    console.log('  PASS: Mixed package LC renders both included and extra LC accurately');
  }

  // Test 4: Transaction without LC
  {
    const transaction = {
      transaction_id: 'TRX-NO-LC',
      room_name: 'Room 4',
      room_total: 100000,
      fnb_total: 0,
      lc_total: 0,
      grand_total: 100000,
      lc_details: {
        detail_available: false,
        lc_logs: [],
        total: 0
      }
    };

    const receiptData = buildReceiptData(transaction, {
      lcDetails: transaction.lc_details
    });

    assert.strictEqual(receiptData.lc.hasLc, false);
    const formatted = formatReceipt58mm(receiptData);
    assert(!formatted.includes('DETAIL LC'), 'Receipt without LC must not render DETAIL LC');
    console.log('  PASS: Transaction without LC cleanly omits DETAIL LC');
  }

  console.log('All Receipt Package LC Tests Passed Successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
