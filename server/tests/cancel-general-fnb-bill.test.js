const assert = require('assert');
const db = require('../src/db');
const { cancelGeneralFnbBill } = require('../src/controllers/fnbController');

async function runTest() {
  const originalPoolConnect = db.pool.connect;
  const originalQuery = db.query;

  const mockOrders = [
    { order_id: 'FNB-TEST-1', general_bill_id: 'GBILL-TEST-1', order_status: 'open', order_total: 65000, room_id: 'FNB-GENERAL', room_name: 'F&B Umum' },
    { order_id: 'FNB-TEST-2', general_bill_id: 'GBILL-TEST-1', order_status: 'open', order_total: 85000, room_id: 'FNB-GENERAL', room_name: 'F&B Umum' }
  ];

  const queries = [];
  const mockClient = {
    query: async (sql, params) => {
      const text = String(sql).trim();
      queries.push({ text, params });

      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('SELECT * FROM fnb_orders') && text.includes('FOR UPDATE')) {
        const billId = params[0];
        const matched = mockOrders.filter(o => o.general_bill_id === billId && o.order_status === 'open');
        return { rows: matched, rowCount: matched.length };
      }

      if (text.includes('UPDATE fnb_orders') && text.includes("SET order_status = 'cancelled'")) {
        const orderIds = params[2];
        const updated = mockOrders.filter(o => orderIds.includes(o.order_id)).map(o => ({
          ...o,
          order_status: 'cancelled',
          cancel_reason: params[0],
          cancelled_by: params[1],
          cancelled_at: new Date()
        }));
        return { rows: updated, rowCount: updated.length };
      }

      if (text.includes('INSERT INTO operational_audit_events') || text.includes('INSERT INTO audit_logs')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  db.pool.connect = async () => mockClient;
  db.query = async (sql, params) => mockClient.query(sql, params);

  let responseData = null;
  const res = {
    json: (data) => { responseData = data; return data; },
    status: () => res
  };

  try {
    // 1. Successful cancellation
    await cancelGeneralFnbBill(
      {},
      res,
      { general_bill_id: 'GBILL-TEST-1', cancel_reason: 'Tamu batal pesan', cancelled_by: 'Manager Test' }
    );

    assert.strictEqual(responseData.ok, true, 'Response ok should be true');
    assert.strictEqual(responseData.cancelled_orders.length, 2, 'Should cancel 2 orders');
    assert.strictEqual(responseData.cancelled_amount, 150000, 'Cancelled amount should be 150000');
    console.log('Test 1: cancelGeneralFnbBill success passed');

    // 2. Validation error when missing general_bill_id
    responseData = null;
    await cancelGeneralFnbBill({}, res, { cancel_reason: 'No bill id' });
    assert.strictEqual(responseData.ok, false, 'Response ok should be false for missing id');
    console.log('Test 2: validation error passed');

    // 3. Not found or already cancelled
    responseData = null;
    await cancelGeneralFnbBill({}, res, { general_bill_id: 'GBILL-NOTFOUND', cancel_reason: 'Test' });
    assert.strictEqual(responseData.ok, false, 'Response ok should be false for not found');
    console.log('Test 3: not found passed');

    console.log('ALL TESTS PASSED!');
  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalQuery;
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
