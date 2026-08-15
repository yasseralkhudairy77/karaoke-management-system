const db = require('../src/db');

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const positionalArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const startTime = positionalArgs[0] || '2026-08-15T04:00:00.000Z'; // 11:00 WIB (04:00 UTC)
  const endTime = positionalArgs[1] || '2026-08-15T06:50:00.000Z';   // 13:50 WIB (06:50 UTC)

  console.log(`🔍 Memeriksa & memulihkan data tes operasional (Sesi, Transaksi, F&B, Stok, & LC)`);
  console.log(`⏱️ Rentang Waktu: ${startTime} s/d ${endTime}\n`);

  let client;
  try {
    client = await db.pool.connect();

    // 1. Transactions
    const trxsRes = await client.query(`
      SELECT transaction_id, room_name, grand_total, payment_status, payment_method, cashier_name, created_at
      FROM transactions
      WHERE (created_at >= $1 AND created_at <= $2)
         OR (start_time >= $1 AND start_time <= $2)
      ORDER BY created_at ASC
    `, [startTime, endTime]);

    // 2. F&B Orders
    const fnbRes = await client.query(`
      SELECT order_id, room_name, order_status, order_total, created_at
      FROM fnb_orders
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at ASC
    `, [startTime, endTime]);

    // 3. LC Work Logs
    const lcRes = await client.query(`
      SELECT log_id, lc_name, room_name, duration_minutes, rate, status, created_at
      FROM lc_work_logs
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at ASC
    `, [startTime, endTime]);

    // 4. Stock Movements
    const stockMovementsRes = await client.query(`
      SELECT movement_id, stock_item_id, stock_item_name, movement_type, qty_change, stock_before, stock_after, created_at
      FROM stock_movements
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at ASC
    `, [startTime, endTime]);

    console.log(`📋 RINGKASAN DATA TES DITEMUKAN:`);
    console.log(`- Transaksi : ${trxsRes.rowCount} baris`);
    console.log(`- Pesanan F&B: ${fnbRes.rowCount} baris`);
    console.log(`- Log LC    : ${lcRes.rowCount} baris`);
    console.log(`- Pergerakan Stok F&B: ${stockMovementsRes.rowCount} baris\n`);

    if (trxsRes.rowCount > 0) {
      console.log('--- Daftar Transaksi Tes ---');
      console.table(trxsRes.rows.map(r => ({
        ID: r.transaction_id,
        Room: r.room_name,
        Total: r.grand_total,
        Status: r.payment_status,
        Metode: r.payment_method,
        Waktu: r.created_at
      })));
    }

    if (fnbRes.rowCount > 0) {
      console.log('--- Daftar Pesanan F&B Tes ---');
      console.table(fnbRes.rows.map(r => ({
        OrderID: r.order_id,
        Room: r.room_name,
        Total: r.order_total,
        Status: r.order_status,
        Waktu: r.created_at
      })));
    }

    if (lcRes.rowCount > 0) {
      console.log('--- Daftar Log Kerja LC Tes ---');
      console.table(lcRes.rows.map(r => ({
        LogID: r.log_id,
        NamaLC: r.lc_name,
        Room: r.room_name,
        Durasi: `${r.duration_minutes} menit`,
        Tarif: r.rate,
        Status: r.status,
        Waktu: r.created_at
      })));
    }

    const hasDataToDelete = trxsRes.rowCount > 0 || fnbRes.rowCount > 0 || lcRes.rowCount > 0 || stockMovementsRes.rowCount > 0;
    if (!hasDataToDelete) {
      console.log('✅ Tidak ada data tes (Transaksi, F&B, LC, Stok) pada rentang waktu tersebut.');
      return;
    }

    if (isDryRun) {
      console.log('\n⚠️ [DRY RUN ONLY] Tidak ada data yang dihapus dari database.');
      return;
    }

    await client.query('BEGIN');

    const trxIds = trxsRes.rows.map(r => r.transaction_id);
    const fnbOrderIds = fnbRes.rows.map(r => r.order_id);
    const lcLogIds = lcRes.rows.map(r => r.log_id);

    // Revert Stock Movements (Restore inventory stock quantity)
    for (const mov of stockMovementsRes.rows) {
      if (mov.stock_item_id && Number(mov.qty_change || 0) !== 0) {
        // If movement was 'out' (qty_change < 0 or positive out), add back to inventory
        const qtyToRestore = mov.movement_type === 'out' ? Math.abs(Number(mov.qty_change)) : -Number(mov.qty_change);
        await client.query(`
          UPDATE inventory
          SET current_stock = current_stock + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE stock_item_id = $2
        `, [qtyToRestore, mov.stock_item_id]);
      }
    }

    // Delete stock movements in window
    await client.query(`DELETE FROM stock_movements WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);

    // Delete LC sales bonus logs & work logs in window
    await client.query(`DELETE FROM lc_sales_bonus_logs WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);
    if (lcLogIds.length > 0) {
      await client.query(`DELETE FROM lc_work_logs WHERE log_id = ANY($1)`, [lcLogIds]);
    }
    await client.query(`DELETE FROM lc_work_logs WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);

    // Delete F&B order items & orders in window
    if (fnbOrderIds.length > 0) {
      await client.query(`DELETE FROM fnb_order_items WHERE order_id = ANY($1)`, [fnbOrderIds]);
      await client.query(`DELETE FROM fnb_orders WHERE order_id = ANY($1)`, [fnbOrderIds]);
    }
    await client.query(`DELETE FROM fnb_orders WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);

    // Delete transactions & logs in window
    if (trxIds.length > 0) {
      await client.query(`DELETE FROM receipt_print_logs WHERE transaction_id = ANY($1)`, [trxIds]);
      await client.query(`DELETE FROM cashier_closing_transactions WHERE transaction_id = ANY($1)`, [trxIds]);
      await client.query(`DELETE FROM transaction_lines WHERE transaction_id = ANY($1)`, [trxIds]);
      await client.query(`DELETE FROM transactions WHERE transaction_id = ANY($1)`, [trxIds]);
    }
    await client.query(`DELETE FROM transactions WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);

    // Delete room_sessions created in window
    await client.query(`DELETE FROM room_sessions WHERE created_at >= $1 AND created_at <= $2`, [startTime, endTime]);

    // Reset all rooms status to available
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
    console.log('\n🎉 PEMULIHAN BERHASIL: Semua data transaksi, pesanan F&B, log LC, dan stok bahan/menu telah dipulihkan ke posisi semula.');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Gagal memulihkan data tes:', err.message);
  } finally {
    if (client) client.release();
    await db.pool.end();
  }
}

main().catch(console.error);
