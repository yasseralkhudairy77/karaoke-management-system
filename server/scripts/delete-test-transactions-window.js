const db = require('../src/db');

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const startTime = process.argv[2] || '2026-08-15T04:00:00.000Z'; // 11:00 WIB (04:00 UTC)
  const endTime = process.argv[3] || '2026-08-15T06:50:00.000Z';   // 13:50 WIB (06:50 UTC)

  console.log(`🔍 Memeriksa transaksi data tes dari ${startTime} s/d ${endTime}...`);

  let client;
  try {
    client = await db.pool.connect();
    const trxsRes = await client.query(`
      SELECT transaction_id, room_id, room_name, grand_total, payment_status, payment_method, cashier_name, created_at, start_time, end_time
      FROM transactions
      WHERE (created_at >= $1 AND created_at <= $2)
         OR (start_time >= $1 AND start_time <= $2)
      ORDER BY created_at ASC
    `, [startTime, endTime]);

    console.log(`\n📋 Ditemukan ${trxsRes.rowCount} transaksi pada rentang waktu 11:00 - 13:50 WIB:`);
    if (trxsRes.rowCount > 0) {
      console.table(trxsRes.rows.map(r => ({
        ID: r.transaction_id,
        Room: r.room_name,
        Total: r.grand_total,
        Status: r.payment_status,
        Metode: r.payment_method,
        Kasir: r.cashier_name,
        Waktu: r.created_at
      })));
    }

    if (trxsRes.rowCount === 0) {
      console.log('\n✅ Tidak ada transaksi tes pada rentang waktu tersebut.');
      return;
    }

    if (isDryRun) {
      console.log('\n⚠️ [DRY RUN ONLY] Tidak ada data yang dihapus dari database.');
      return;
    }

    await client.query('BEGIN');

    const trxIds = trxsRes.rows.map(r => r.transaction_id);

    await client.query(`DELETE FROM receipt_print_logs WHERE transaction_id = ANY($1)`, [trxIds]);
    await client.query(`DELETE FROM cashier_closing_transactions WHERE transaction_id = ANY($1)`, [trxIds]);
    await client.query(`DELETE FROM transaction_lines WHERE transaction_id = ANY($1)`, [trxIds]);
    await client.query(`DELETE FROM transactions WHERE transaction_id = ANY($1)`, [trxIds]);

    await client.query(`
      UPDATE rooms
      SET status = 'available',
          start_time = NULL,
          booked_duration_minutes = 0,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id <> 'FNB-GENERAL'
    `);

    await client.query('COMMIT');
    console.log(`\n🎉 Berhasil menghapus ${trxsRes.rowCount} transaksi tes dan mereset status ruangan ke available.`);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Gagal menghapus transaksi:', err.message);
  } finally {
    if (client) client.release();
    await db.pool.end();
  }
}

main().catch(console.error);
