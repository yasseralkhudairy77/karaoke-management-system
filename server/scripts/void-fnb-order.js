/**
 * CLI Helper Script to void an F&B item or order and restore inventory stock in PostgreSQL.
 * Usage: node scripts/void-fnb-order.js [ORDER_ID] [ITEM_KEYWORD] [REASON] [CHANGED_BY]
 * Example: node scripts/void-fnb-order.js FNB-1787164557762 "Red Label" "Pelanggan membatalkan pesanan" "Owner"
 */

const db = require('../src/db');
const { voidTransactionFnbOrder } = require('../src/controllers/transactionsController');

async function main() {
  const orderId = process.argv[2] || 'FNB-1787164557762';
  const itemKeyword = process.argv[3] || 'Red Label';
  const reason = process.argv[4] || 'Void item F&B oleh Owner';
  const changedBy = process.argv[5] || 'Owner';

  console.log('===========================================================');
  console.log(' HAPPY SONG POS - VOID ITEM F&B & STOCK RESTORATION');
  console.log('===========================================================');
  console.log(`Target Order ID : ${orderId}`);
  console.log(`Item Filter     : ${itemKeyword || 'ALL ITEMS IN ORDER'}`);
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

  // 2. Find Items
  const itemsRes = await db.query('SELECT * FROM fnb_order_items WHERE order_id = $1 ORDER BY created_at ASC', [orderId]);
  console.log(`Daftar item pada order ${orderId}:`);
  itemsRes.rows.forEach(it => {
    console.log(` - [${it.order_item_id}] ${it.menu_name} (${it.quantity}x) @ Rp ${Number(it.price).toLocaleString('id-ID')} = Rp ${Number(it.subtotal).toLocaleString('id-ID')} | Voided: ${it.is_voided || false}`);
  });
  console.log('');

  let targetItemIds = [];
  if (itemKeyword && itemKeyword !== 'all') {
    const matched = itemsRes.rows.filter(it => it.menu_name.toLowerCase().includes(itemKeyword.toLowerCase()) && !it.is_voided);
    if (matched.length === 0) {
      console.error(`❌ Tidak ditemukan item aktif yang cocok dengan filter "${itemKeyword}".`);
      process.exit(1);
    }
    targetItemIds = matched.map(it => it.order_item_id);
    console.log(`Item yang akan divoid:`, matched.map(m => `${m.menu_name} (${m.quantity}x)`));
  } else {
    targetItemIds = itemsRes.rows.filter(it => !it.is_voided).map(it => it.order_item_id);
    console.log(`Semua item aktif pada order akan divoid.`);
  }

  // 3. Find Transaction linked to this order
  const trxRes = await db.query(`
    SELECT * FROM transactions
    WHERE $1 = ANY(string_to_array(fnb_order_ids, ','))
       OR fnb_order_ids LIKE '%' || $1 || '%'
       OR room_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [orderId, order.room_id]);

  if (trxRes.rowCount === 0) {
    console.error(`❌ Transaksi spesifik tidak ditemukan untuk order ${orderId}.`);
    process.exit(1);
  }
  const trx = trxRes.rows[0];
  console.log(`Found linked transaction:`, {
    transaction_id: trx.transaction_id,
    room_name: trx.room_name,
    fnb_total: trx.fnb_total,
    grand_total: trx.grand_total,
    payment_status: trx.payment_status
  });

  // 4. Get Owner PIN from database
  const ownerRes = await db.query("SELECT pin FROM employees WHERE role = 'owner' AND is_active = TRUE LIMIT 1");
  const ownerPin = ownerRes.rows[0]?.pin || '123456';

  const transactionId = trx.transaction_id;

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
        console.log('✅ SUKSES: Item F&B berhasil divoid, total tagihan transaksi berkurang, dan stok telah dikembalikan ke inventory.');
      } else {
        console.error('❌ GAGAL:', data.message || data.error);
      }
      process.exit(data.ok || data.success ? 0 : 1);
    }
  };

  const payload = {
    transaction_id: transactionId,
    order_item_ids: targetItemIds,
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
