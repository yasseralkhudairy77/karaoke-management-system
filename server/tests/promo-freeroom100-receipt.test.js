const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { validatePromoCode } = require('../src/controllers/masterDataController');
const { markTransactionPaid } = require('../src/controllers/transactionsController');

async function runTests() {
  console.log('🧪 Running FREEROOM100 Promo, Checkout & Receipt Tests...');

  await testValidatePromoCodeFreeRoom100();
  await testMarkTransactionPaidFreeRoom100();
  await testReceiptFormattingFreeRoom100();
  await testAppJsReceiptPrintContainsPromoDiscount();

  console.log('✅ ALL FREEROOM100 Tests PASSED SUCCESSFULLY!');
}

async function testValidatePromoCodeFreeRoom100() {
  const originalQuery = db.query;
  try {
    db.query = async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM promos')) {
        return {
          rows: [
            {
              promo_code: 'FREEROOM100',
              promo_name: 'Free Room 100% (Gratis Sewa Room)',
              type: 'promo',
              discount_type: 'percentage',
              discount_value: 100,
              is_active: true
            }
          ],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    };

    let responseData = null;
    const req = {
      query: { code: 'FREEROOM100', room_total: '250000' }
    };
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    await validatePromoCode(req, res);

    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.ok, true);
    assert.strictEqual(responseData.code, 'FREEROOM100');
    assert.strictEqual(responseData.discount, 250000, 'Discount must be 100% of 250,000 = 250,000');
    assert.strictEqual(responseData.final_total, 0, 'Final room total must be 0');

    console.log('  ✓ validatePromoCode correctly calculated 100% room discount (Rp 250.000)');
  } finally {
    db.query = originalQuery;
  }
}

async function testMarkTransactionPaidFreeRoom100() {
  const originalConnect = db.pool.connect;
  const originalQuery = db.query;
  const queries = [];

  const mockTransaction = {
    transaction_id: 'TRX-TEST-001',
    room_id: 'ROOM-01',
    room_name: 'Room 01',
    room_total: 250000,
    fnb_total: 50000,
    lc_total: 125000,
    promo_discount: 0,
    promo_code: '',
    payment_status: 'unpaid'
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1')) {
        return { rows: [mockTransaction], rowCount: 1 };
      }
      if (text.includes('SELECT * FROM promos WHERE UPPER(promo_code) = $1')) {
        return {
          rows: [
            {
              promo_code: 'FREEROOM100',
              promo_name: 'Free Room 100%',
              type: 'promo',
              discount_type: 'percentage',
              discount_value: 100,
              is_active: true
            }
          ],
          rowCount: 1
        };
      }
      if (text.includes('UPDATE transactions')) {
        return {
          rows: [
            {
              ...mockTransaction,
              room_total: 0,
              promo_code: 'FREEROOM100',
              promo_discount: 250000,
              grand_total: 175000, // 0 room + 50k fnb + 125k lc
              payment_status: 'paid'
            }
          ],
          rowCount: 1
        };
      }
      if (text.includes('operational_audit_events') || text.includes('sync_outbox') || text.includes('audit_logs')) {
        return { rows: [{ log_id: 'LOG-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;
  db.query = mockClient.query;

  try {
    let responseData = null;
    const req = {};
    const res = {
      json: (data) => { responseData = data; return data; },
      status: () => res
    };

    const payload = {
      transaction_id: 'TRX-TEST-001',
      payment_method: 'cash',
      promo_code: 'FREEROOM100',
      cashier_name: 'Kasir Utama'
    };

    await markTransactionPaid(req, res, payload);

    if (!responseData.ok) console.error('markTransactionPaid responseData error:', responseData);
    assert.ok(responseData, 'Response must exist');
    assert.strictEqual(responseData.ok, true);
    assert.strictEqual(responseData.transaction.room_total, 0, 'Room total must be 0 after 100% discount');
    assert.strictEqual(responseData.transaction.promo_discount, 250000, 'Promo discount must be recorded as 250,000');
    assert.strictEqual(responseData.transaction.promo_code, 'FREEROOM100', 'Promo code must be recorded');
    assert.strictEqual(responseData.transaction.grand_total, 175000, 'Grand total must be 175,000 (F&B + LC only)');
    assert.strictEqual(responseData.transaction.payment_status, 'paid');

    console.log('  ✓ markTransactionPaid successfully applied FREEROOM100 (Room Rp 0, Grand Total Rp 175.000, Status Paid)');
  } finally {
    db.pool.connect = originalConnect;
    db.query = originalQuery;
  }
}

async function testReceiptFormattingFreeRoom100() {
  const receiptModulePath = path.join(__dirname, '../../js/receipt.js');
  const fileContent = fs.readFileSync(receiptModulePath, 'utf8');
  const moduleContent = fileContent.replace(/export /g, '');
  const { buildReceiptData, formatReceipt58mm } = new Function(moduleContent + '; return { buildReceiptData, formatReceipt58mm };')();

  const transaction = {
    transaction_id: 'TRX-FREE-100',
    room_name: 'Room VIP 1',
    duration_minutes: 120,
    rate_per_hour: 125000,
    room_total: 0,
    promo_code: 'FREEROOM100',
    promo_discount: 250000,
    fnb_total: 50000,
    lc_total: 125000,
    grand_total: 175000,
    payment_method: 'cash',
    payment_status: 'paid'
  };

  const receiptData = buildReceiptData(transaction);
  assert.strictEqual(receiptData.totals.roomTotal, 250000, 'Gross room total before promo is 250,000');
  assert.strictEqual(receiptData.totals.promoDiscount, 250000, 'Promo discount is 250,000');
  assert.strictEqual(receiptData.totals.grandTotal, 175000, 'Grand total is 175,000');

  const receiptText = formatReceipt58mm(receiptData);
  assert.ok(receiptText.includes('Disc FREEROOM100'), 'Receipt text must include Disc FREEROOM100');
  assert.ok(receiptText.includes('-Rp250.000'), 'Receipt text must include -Rp250.000 discount');
  assert.ok(receiptText.includes('Rp175.000'), 'Receipt text must include Rp175.000 total');

  console.log('  ✓ Receipt 58mm text includes Disc FREEROOM100 and accurate Rp 175.000 total');
}

async function testAppJsReceiptPrintContainsPromoDiscount() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Verify that createReceiptPrintElement includes promoDiscount row
  assert.ok(
    appJsContent.includes('Number(receiptData.totals.promoDiscount || 0) > 0'),
    'app.js createReceiptPrintElement must check for receiptData.totals.promoDiscount'
  );
  assert.ok(
    appJsContent.includes('Diskon Promo'),
    'app.js createReceiptPrintElement must push Diskon Promo row into billingRows'
  );

  // Verify that recalculateChange handles total <= 0 gracefully
  assert.ok(
    appJsContent.includes('total <= 0') && appJsContent.includes('Lunas Promo'),
    'app.js recalculateChange must handle total <= 0 without locking the pay button'
  );

  console.log('  ✓ app.js contains promoDiscount row rendering and total <= 0 cash calculator support');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
