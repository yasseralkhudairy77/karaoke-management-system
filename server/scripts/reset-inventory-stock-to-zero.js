const db = require('../src/db');

async function resetInventoryStockToZero(options = { actor: 'Stock Opname Initializer' }) {
  console.log('\n🔄 [RESET STOK INVENTORY] Memulai proses reset stok ke 0...');

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    // 1. Ambil semua item stok aktif yang ada di tabel inventory
    const invRes = await client.query(`
      SELECT stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status
      FROM inventory
      WHERE (status = 'active' OR status IS NULL OR status = '')
      ORDER BY category ASC, stock_item_name ASC
    `);

    const items = invRes.rows;
    console.log(`📊 Ditemukan ${items.length} item stok aktif di database.`);

    const nonZeroItems = items.filter(item => Number(item.stock_qty || 0) !== 0);
    console.log(`⚡ Terdapat ${nonZeroItems.length} item dengan stok bukan 0 yang akan disesuaikan ke 0.`);

    const now = Date.now();
    let resetCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stockBefore = Number(item.stock_qty || 0);
      const stockAfter = 0;
      const qtyChange = stockAfter - stockBefore;

      // Update stok menjadi 0
      await client.query(`
        UPDATE inventory
        SET stock_qty = 0, updated_at = CURRENT_TIMESTAMP
        WHERE stock_item_id = $1
      `, [item.stock_item_id]);

      // Catat log pergerakan stok jika sebelumnya ada pergerakan/stok bukan 0
      if (stockBefore !== 0) {
        const movementId = `MOV-RESET-OPNAME-${now}-${i + 1}`;
        await client.query(`
          INSERT INTO stock_movements (
            movement_id, stock_item_id, stock_item_name, movement_type,
            reference_type, reference_id, qty_change, stock_before, stock_after,
            note, cashier_name, idempotency_key
          ) VALUES ($1, $2, $3, 'adjustment', 'stock_audit', $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          movementId,
          item.stock_item_id,
          item.stock_item_name,
          `OPNAME-RESET-${now}`,
          qtyChange,
          stockBefore,
          stockAfter,
          'Reset stok awal ke 0 untuk persiapan input hasil Stock Opname fisik',
          options.actor || 'Stock Opname Initializer',
          movementId
        ]);
        resetCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ SUKSES! Seluruh stok (${items.length} item) berhasil di-reset menjadi 0.`);
    console.log(`📝 Sebanyak ${resetCount} item dengan kuantitas sebelumnya telah dicatat di log mutasi stok.`);
    console.log(`🎉 Sekarang Anda siap menginput stok fisik hasil Stock Opname!`);

    return {
      success: true,
      totalItems: items.length,
      adjustedCount: resetCount
    };
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Gagal melakukan reset stok:', err.message);
    throw err;
  } finally {
    if (client) client.release();
    if (db.pool && !options.keepPoolAlive) {
      await db.pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  resetInventoryStockToZero()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Eksekusi terhenti:', err.message);
      process.exit(1);
    });
}

module.exports = resetInventoryStockToZero;
