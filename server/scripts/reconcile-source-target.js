const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function reconcileSourceTarget(sourceJsonPath) {
  console.log('=============================================================================');
  console.log('📊 SOURCE VS TARGET DATA RECONCILIATION REPORT');
  console.log('=============================================================================');

  const client = await pool.connect();

  try {
    let sourceData = null;
    if (sourceJsonPath && fs.existsSync(sourceJsonPath)) {
      sourceData = JSON.parse(fs.readFileSync(sourceJsonPath, 'utf8'));
      console.log(`📁 Source Data Loaded: ${sourceJsonPath}`);
    } else {
      console.log('ℹ️ Source JSON not specified or not found. Performing PostgreSQL Target Self-Reconciliation...');
    }

    const tables = [
      'rooms', 'employees', 'inventory', 'menu', 'package_master',
      'lc_master', 'room_sessions', 'transactions', 'fnb_orders',
      'stock_movements', 'cashier_closings', 'petty_cash_ledger'
    ];

    console.log('\n--- 1. ROW COUNT COMPARISON ---');
    console.log('TABLE NAME            | SOURCE ROW COUNT | TARGET ROW COUNT | STATUS');
    console.log('-----------------------------------------------------------------------------');

    for (const tbl of tables) {
      const srcRows = sourceData && Array.isArray(sourceData[tbl]) ? sourceData[tbl].length : 'N/A';
      const targetRes = await client.query(`SELECT COUNT(*) FROM ${tbl}`);
      const tgtCount = parseInt(targetRes.rows[0].count, 10);
      const matchStatus = (srcRows === 'N/A' || srcRows === tgtCount) ? '✅ MATCH' : '⚠️ MISMATCH';

      console.log(`${tbl.padEnd(21, ' ')} | ${String(srcRows).padStart(16, ' ')} | ${String(tgtCount).padStart(16, ' ')} | ${matchStatus}`);
    }

    console.log('\n--- 2. FINANCIAL REVENUE RECONCILIATION ---');
    const revRes = await client.query(`
      SELECT 
        COALESCE(SUM(grand_total), 0) as total_grand,
        COALESCE(SUM(room_total), 0) as total_room,
        COALESCE(SUM(fnb_total), 0) as total_fnb,
        COALESCE(SUM(lc_total), 0) as total_lc,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0) as cash_rev,
        COALESCE(SUM(CASE WHEN payment_method != 'cash' THEN grand_total ELSE 0 END), 0) as transfer_rev
      FROM transactions WHERE payment_status = 'paid'
    `);
    const rev = revRes.rows[0];

    console.log(`   - Paid Grand Total Revenue: Rp ${Number(rev.total_grand).toLocaleString('id-ID')}`);
    console.log(`   - Paid Room Total Revenue : Rp ${Number(rev.total_room).toLocaleString('id-ID')}`);
    console.log(`   - Paid F&B Total Revenue  : Rp ${Number(rev.total_fnb).toLocaleString('id-ID')}`);
    console.log(`   - Paid LC Total Revenue   : Rp ${Number(rev.total_lc).toLocaleString('id-ID')}`);
    console.log(`   - Cash Payment Revenue    : Rp ${Number(rev.cash_rev).toLocaleString('id-ID')}`);
    console.log(`   - Transfer Payment Revenue: Rp ${Number(rev.transfer_rev).toLocaleString('id-ID')}`);

    console.log('\n--- 3. PAYMENT STATUS BREAKDOWN ---');
    const statusRes = await client.query(`
      SELECT payment_status, COUNT(*) as count, COALESCE(SUM(grand_total), 0) as total
      FROM transactions GROUP BY payment_status ORDER BY payment_status
    `);
    statusRes.rows.forEach(r => {
      console.log(`   - Status '${r.payment_status.padEnd(10, ' ')}': ${String(r.count).padStart(4, ' ')} trx | Rp ${Number(r.total).toLocaleString('id-ID')}`);
    });

    console.log('\n--- 4. INVENTORY STOCK AUDIT ---');
    const invRes = await client.query(`
      SELECT COUNT(*) as item_count, COALESCE(SUM(stock_qty), 0) as total_qty
      FROM inventory WHERE status = 'active'
    `);
    console.log(`   - Active Inventory Items: ${invRes.rows[0].item_count}`);
    console.log(`   - Total Stock Quantity  : ${invRes.rows[0].total_qty}`);

    console.log('\n--- 5. RECONCILIATION SUMMARY PER OPERATIONAL DATE ---');
    const opRes = await client.query(`
      SELECT operational_date, COUNT(*) as trx_count, COALESCE(SUM(grand_total), 0) as daily_revenue
      FROM transactions WHERE payment_status = 'paid'
      GROUP BY operational_date ORDER BY operational_date DESC LIMIT 5
    `);
    opRes.rows.forEach(r => {
      const dStr = r.operational_date ? r.operational_date.toISOString().split('T')[0] : 'N/A';
      console.log(`   - OpDate ${dStr}: ${r.trx_count} paid trx | Daily Revenue: Rp ${Number(r.daily_revenue).toLocaleString('id-ID')}`);
    });

    console.log('\n=============================================================================');
    console.log('✅ RECONCILIATION COMPLETED SUCCESSFULLY');
    console.log('=============================================================================');
  } catch (err) {
    console.error('❌ Reconciliation Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const srcPath = process.argv[2] || null;
  reconcileSourceTarget(srcPath);
}

module.exports = reconcileSourceTarget;
