const db = require('../src/db');

const CONFIRM_FLAG = '--yes-delete-operational-test-data';

const TABLES_TO_COUNT = [
  'transactions',
  'transaction_lines',
  'fnb_orders',
  'fnb_order_items',
  'room_sessions',
  'lc_work_logs',
  'lc_sales_bonus_logs',
  'stock_movements',
  'receipt_print_logs',
  'room_time_logs',
  'room_recovery_logs',
  'cashier_closings',
  'cashier_closing_transactions',
  'cashier_closing_fnb_items',
  'cashier_closing_lc_details',
  'sync_outbox',
  'owner_mirror_snapshots'
];

const DELETE_STATEMENTS = [
  'DELETE FROM cashier_closing_lc_details',
  'DELETE FROM cashier_closing_fnb_items',
  'DELETE FROM cashier_closing_transactions',
  'DELETE FROM cashier_closings',
  'DELETE FROM receipt_print_logs',
  'DELETE FROM lc_sales_bonus_logs',
  'DELETE FROM lc_cash_advances',
  'DELETE FROM lc_payroll_history',
  'DELETE FROM petty_cash_ledger',
  'DELETE FROM transaction_lines',
  'DELETE FROM lc_work_logs',
  'DELETE FROM stock_movements',
  'DELETE FROM room_time_logs',
  'DELETE FROM room_recovery_logs',
  'DELETE FROM tv_control_logs',
  'DELETE FROM fnb_order_items',
  'DELETE FROM fnb_orders',
  'DELETE FROM transactions',
  'DELETE FROM room_sessions',
  'DELETE FROM sync_outbox',
  'DELETE FROM owner_mirror_snapshots'
];

async function tableExists(client, tableName) {
  const result = await client.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return result.rowCount > 0;
}

async function collectCounts(client) {
  const counts = {};
  for (const tableName of TABLES_TO_COUNT) {
    if (!(await tableExists(client, tableName))) {
      counts[tableName] = 'not_found';
      continue;
    }
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    counts[tableName] = result.rows[0].count;
  }
  return counts;
}

function printCounts(title, counts) {
  console.log(title);
  console.log('---------------------------------------------------------');
  Object.entries(counts).forEach(([tableName, count]) => {
    console.log(`${tableName.padEnd(34)} ${String(count).padStart(8)}`);
  });
  console.log('---------------------------------------------------------');
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isConfirmed = process.argv.includes(CONFIRM_FLAG);

  const client = await db.pool.connect();
  try {
    const beforeCounts = await collectCounts(client);
    printCounts('Operational/test data cleanup preview', beforeCounts);

    if (isDryRun) {
      console.log('DRY RUN ONLY - tidak ada data yang dihapus.');
      return;
    }

    if (!isConfirmed) {
      console.log(`Cleanup dibatalkan. Jalankan ulang dengan flag ${CONFIRM_FLAG} jika sudah yakin.`);
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');

    for (const statement of DELETE_STATEMENTS) {
      const tableName = statement.replace(/^DELETE FROM\s+/i, '').trim();
      if (await tableExists(client, tableName)) {
        await client.query(statement);
      }
    }

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

    const afterCounts = await collectCounts(client);
    printCounts('Operational/test data after cleanup', afterCounts);
    console.log('Cleanup data tes operasional selesai.');
    console.log('Catatan: jika stok sempat berkurang karena transaksi F&B lunas, import ulang master XLSX untuk mengembalikan stok baseline spreadsheet.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(err => {
  console.error(`Cleanup gagal: ${err.message}`);
  process.exit(1);
});
