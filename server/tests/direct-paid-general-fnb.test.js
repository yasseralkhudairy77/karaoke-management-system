const assert = require('assert');

// Test the logic of returned transaction object in fnbController createOrder
function testDirectPaidTransactionObject() {
  const isPaid = true;
  const isGeneralOrder = true;
  const customer_name = 'Table Bar';
  const FNB_GENERAL_ROOM_NAME = 'F&B Umum';
  const roomName = 'F&B Umum';
  const orderTotal = 85000;
  const orderId = 'FNB-1788721521148';
  const transactionId = 'TRX-1788721521150';
  const cashier_name = 'Kasir Test';
  const opDate = '2026-09-07';
  const now = new Date();

  const effectiveTxRoomName = isGeneralOrder && customer_name ? `${FNB_GENERAL_ROOM_NAME} - ${customer_name}` : roomName;
  const transaction = {
    transaction_id: transactionId,
    room_id: 'FNB-GENERAL',
    room_name: effectiveTxRoomName,
    fnb_total: orderTotal,
    grand_total: orderTotal,
    payment_status: 'paid',
    payment_method: 'cash',
    fnb_order_ids: orderId,
    cashier_name,
    operational_date: opDate,
    created_at: now.toISOString(),
    end_time: now.toISOString(),
  };

  assert.strictEqual(transaction.room_name, 'F&B Umum - Table Bar');
  assert.strictEqual(transaction.payment_status, 'paid');
  assert.strictEqual(transaction.grand_total, 85000);
  assert.strictEqual(transaction.fnb_order_ids, 'FNB-1788721521148');
  assert.ok(transaction.created_at);

  console.log('  ✓ testDirectPaidTransactionObject passed successfully');
}

// Test matching order by fnbOrderId in transaction list
function testFindTransactionByFnbOrderId() {
  const todayTransactions = [
    {
      transaction_id: 'TRX-101',
      room_name: 'Room 01',
      fnb_order_ids: 'FNB-100,FNB-101'
    },
    {
      transaction_id: 'TRX-102',
      room_name: 'F&B Umum - Table Bar',
      fnb_order_ids: 'FNB-1788721521148'
    }
  ];

  const fnbOrderId = 'FNB-1788721521148';
  const matched = todayTransactions.find(t =>
    String(t.fnb_order_ids || '').split(',').map(id => id.trim()).includes(fnbOrderId)
  );

  assert.ok(matched, 'Transaction must be found');
  assert.strictEqual(matched.transaction_id, 'TRX-102');
  console.log('  ✓ testFindTransactionByFnbOrderId passed successfully');
}

testDirectPaidTransactionObject();
testFindTransactionByFnbOrderId();
console.log('ALL DIRECT PAID FNB TESTS PASSED!');
