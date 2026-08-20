/**
 * CLI Helper Script to void an F&B order and restore inventory stock in PostgreSQL.
 * Usage: node scripts/void-fnb-order.js <ORDER_ID> [REASON] [CHANGED_BY]
 * Example: node scripts/void-fnb-order.js FNB-1787164557762 "Pelanggan membatalkan pesanan" "Owner"
 */

const db = require('../src/db');
const { voidTransactionFnbOrder } = require('../src/controllers/transactionsController');

async function main() {
  const orderId = process.argv[2] || 'FNB-1787164557762';
  const reason = process.argv[3] || 'Void koreksi order F&B oleh Owner';
  const changedBy = process.argv[4] || 'Owner';

  console.log('===========================================================');
  console.log(' HAPPY SONG POS - VOID F&B ORDER & STOCK RESTORATION');
  console.log('===========================================================');
  console.log(`Target Order ID : ${orderId}`);
  console.log(`Alasan          : ${reason}`);
  console.log(`Diubah oleh     : ${changedBy}`);
  console.log('');

  // 1. Find Order
  const orderRes = await db.query('SELECT * FROM fnb_orders WHERE order_id = $1', [orderId]);
  if (orderRes.rowCount === 0) {
    console.error(`❌ Order ${orderId} tidak ditemukan di database PostgreSQL.`);
    process.exit(1);
  }
  const order = orderRes.rows[0];
  console.log(`Found order:`, {
    order_id: order.order_id,
    room_name: order.room_name,
    order_total: order.order_total,
    order_status: order.order_status,
    created_at: order.created_at
  });

  // 2. Find Transaction linked to this order
  const trxRes = await db.query(`
    SELECT * FROM transactions
    WHERE $1 = ANY(string_to_array(fnb_order_ids, ','))
       OR fnb_order_ids LIKE '%' || $1 || '%'
       OR room_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [orderId, order.room_id]);

  if (trxRes.rowCount === 0) {
    console.warn(`⚠️ Transaksi spesifik tidak ditemukan untuk order ${orderId}.`);
  } else {
    const trx = trxRes.rows[0];
    console.log(`Found linked transaction:`, {
      transaction_id: trx.transaction_id,
      room_name: trx.room_name,
      fnb_total: trx.fnb_total,
      grand_total: trx.grand_total,
      payment_status: trx.payment_status
    });
  }

  // 3. Get Owner PIN from database
  const ownerRes = await db.query("SELECT pin FROM employees WHERE role = 'owner' AND is_active = TRUE LIMIT 1");
  const ownerPin = ownerRes.rows[0]?.pin || '123456';

  const transactionId = trxRes.rows[0]?.transaction_id || '';

  if (!transactionId) {
    console.error('❌ Tidak dapat menemukan transaction_id untuk order ini.');
    process.exit(1);
  }

  // Mock req & res
  const req = {};
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) {
      console.log('');
      console.log('Result:', JSON.stringify(data, null, 2));
      if (data.ok || data.success) {
        console.log('');
        console.log('✅ SUKSES: Order berhasil divoid, total tagihan transaksi berkurang, dan stok telah dikembalikan ke inventory.');
      } else {
        console.error('❌ GAGAL:', data.message || data.error);
      }
      process.exit(data.ok || data.success ? 0 : 1);
    }
  };

  const payload = {
    transaction_id: transactionId,
    order_id: orderId,
    reason: reason,
    owner_pin: ownerPin,
    changed_by: changedBy
  };

  await voidTransactionFnbOrder(req, res, payload);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
