const db = require('../src/db');

async function patchStockMovementsConstraint() {
  console.log('\n🔄 [PATCH CONSTRAINT] Memperbarui check constraint tabel stock_movements...');
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    console.log('1. Memperbesar tipe kolom reference_type ke VARCHAR(50)...');
    await client.query('ALTER TABLE stock_movements ALTER COLUMN reference_type TYPE VARCHAR(50);');

    console.log('2. Menghapus constraint lama stock_movements_reference_type_check jika ada...');
    await client.query('ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reference_type_check;');

    console.log('3. Menambahkan constraint baru yang mendukung goods_receipt, inventory_audit, dll...');
    await client.query(`
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reference_type_check
      CHECK (reference_type IN (
        'transaction',
        'manual_adjustment',
        'stock_audit',
        'inventory_audit',
        'fnb_order',
        'goods_receipt',
        'initial_stock_revision'
      ));
    `);

    await client.query('COMMIT');
    console.log('✅ [PATCH CONSTRAINT SUKSES] Constraint stock_movements_reference_type_check berhasil diperbarui!\n');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [PATCH CONSTRAINT GAGAL]:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    process.exit(0);
  }
}

if (require.main === module) {
  patchStockMovementsConstraint();
}

module.exports = patchStockMovementsConstraint;
