const { pool } = require('../src/db');

async function validate() {
  console.log('🔍 Running Data Integrity & Migration Validation...');
  const client = await pool.connect();

  try {
    const tables = [
      'settings', 'employees', 'rooms', 'tv_devices', 'tv_displays',
      'inventory', 'menu', 'package_master', 'lc_master', 'room_sessions',
      'transactions', 'fnb_orders', 'stock_movements', 'cashier_closings'
    ];

    console.log('---------------------------------------------------------');
    console.log('TABLE NAME                  | RECORD COUNT');
    console.log('---------------------------------------------------------');

    for (const table of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      const count = String(res.rows[0].count).padStart(12, ' ');
      console.log(`${table.padEnd(27, ' ')} | ${count}`);
    }

    console.log('---------------------------------------------------------');

    // Revenue validation
    const revRes = await client.query(`
      SELECT 
        COALESCE(SUM(grand_total), 0) as total_grand,
        COALESCE(SUM(room_total), 0) as total_room,
        COALESCE(SUM(fnb_total), 0) as total_fnb
      FROM transactions WHERE payment_status = 'paid'
    `);
    const rev = revRes.rows[0];
    console.log(`💰 Paid Transactions Revenue:`);
    console.log(`   - Room Total : Rp ${Number(rev.total_room).toLocaleString('id-ID')}`);
    console.log(`   - F&B Total  : Rp ${Number(rev.total_fnb).toLocaleString('id-ID')}`);
    console.log(`   - Grand Total: Rp ${Number(rev.total_grand).toLocaleString('id-ID')}`);

    // Inventory validation
    const invRes = await client.query(`
      SELECT COUNT(*) as total_items, COALESCE(SUM(stock_qty), 0) as total_qty
      FROM inventory
    `);
    const inv = invRes.rows[0];
    console.log(`📦 Inventory Status:`);
    console.log(`   - Total Stock Items: ${inv.total_items}`);
    console.log(`   - Total Physical Qty: ${inv.total_qty}`);

    console.log('✅ Validation Check Finished Successfully!');
  } catch (err) {
    console.error('❌ Validation Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

validate();
