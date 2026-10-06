/*
  PEMERIKSAAN (READ-ONLY). Tidak menghapus/mengubah apa pun.
  Tujuan: melihat persis data apa yang berada di jendela 15:00-16:35 tanggal 6 Okt 2026,
  beserta semua baris turunan yang akan ikut terhapus.
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/db/index.js');

const FROM = "2026-10-06 15:00:00+07";
const TO = "2026-10-06 16:35:00+07";

(async () => {
  const q = (sql, params) => pool.query(sql, params);

  console.log('=== DATABASE ===');
  const db = await q('select current_database() db, current_setting(\'TimeZone\') tz, now() as now_local');
  console.log(db.rows[0]);

  console.log('\n=== TRANSAKSI DALAM JENDELA (start_time) ===');
  const tx = await q(`
    select transaction_id, room_name, start_time, end_time, grand_total,
           payment_status, payment_method, is_upfront, operational_date, cashier_name, created_at
    from transactions
    where created_at >= $1::timestamptz and created_at <= $2::timestamptz
    order by created_at`, [FROM, TO]);
  console.table(tx.rows.map(r => ({
    id: r.transaction_id, room: r.room_name,
    start: r.start_time?.toISOString?.() || r.start_time,
    end: r.end_time?.toISOString?.() || r.end_time,
    total: r.grand_total, status: r.payment_status, upfront: r.is_upfront,
    opdate: r.operational_date, cashier: r.cashier_name,
    created: r.created_at?.toISOString?.() || r.created_at,
  })));

  console.log('\n=== juga cek berdasarkan end_time / start_time (bukan created_at), supaya tidak ada yang lolos ===');
  const tx2 = await q(`
    select transaction_id, room_name, start_time, end_time, created_at, grand_total
    from transactions
    where (start_time between $1::timestamptz and $2::timestamptz)
       or (end_time between $1::timestamptz and $2::timestamptz)
    order by start_time`, [FROM, TO]);
  console.table(tx2.rows.map(r => ({ id: r.transaction_id, room: r.room_name,
    start: r.start_time?.toISOString?.() || r.start_time, end: r.end_time?.toISOString?.() || r.end_time,
    created: r.created_at?.toISOString?.() || r.created_at, total: r.grand_total })));

  const ids = [...new Set([...tx.rows, ...tx2.rows].map(r => r.transaction_id))];
  console.log('\nID transaksi yang masuk jendela:', ids.length, ids);

  console.log('\n=== SEMUA TRANSAKSI HARI INI (2026-10-06) untuk konteks ===');
  const today = await q(`
    select transaction_id, room_name, start_time, created_at, grand_total, payment_status
    from transactions where operational_date = '2026-10-06' order by created_at`);
  console.table(today.rows.map(r => ({ id: r.transaction_id, room: r.room_name,
    start: r.start_time?.toLocaleString?.('id-ID', { timeZone: 'Asia/Jakarta' }),
    created: r.created_at?.toLocaleString?.('id-ID', { timeZone: 'Asia/Jakarta' }),
    total: r.grand_total, status: r.payment_status })));

  if (ids.length) {
    console.log('\n=== BARIS TURUNAN untuk ID di atas ===');
    const dep = [
      ['transaction_lines', 'transaction_id'],
      ['transaction_correction_logs', 'transaction_id'],
      ['sales_commission_logs', 'transaction_id'],
    ];
    for (const [table, col] of dep) {
      try {
        const r = await q(`select count(*)::int n from ${table} where ${col} = any($1)`, [ids]);
        console.log(`  ${table}: ${r.rows[0].n}`);
      } catch (e) { console.log(`  ${table}: ERROR ${e.message}`); }
    }
    console.log('\n=== cek tabel lain yang menyebut transaction_id ===');
    const cols = await q(`
      select table_name, column_name from information_schema.columns
      where column_name in ('transaction_id','upfront_transaction_id','closed_transaction_id')
        and table_schema = 'public' order by table_name`);
    console.table(cols.rows);
  }

  console.log('\n=== SESI RUANGAN hari ini ===');
  const sess = await q(`
    select session_id, room_name, status, start_time, end_time, closed_transaction_id, cashier_name, created_at
    from room_sessions where created_at >= '2026-10-06 00:00:00+07' order by created_at`);
  console.table(sess.rows.map(r => ({ id: r.session_id, room: r.room_name, status: r.status,
    start: r.start_time?.toLocaleString?.('id-ID', { timeZone: 'Asia/Jakarta' }),
    end: r.end_time?.toLocaleString?.('id-ID', { timeZone: 'Asia/Jakarta' }),
    closed_tx: r.closed_transaction_id, cashier: r.cashier_name })));

  console.log('\n=== ORDER F&B hari ini ===');
  const fo = await q(`
    select order_id, room_name, order_status, order_total, session_id, created_at
    from fnb_orders where created_at >= '2026-10-06 00:00:00+07' order by created_at`);
  console.table(fo.rows.map(r => ({ id: r.order_id, room: r.room_name, status: r.order_status,
    total: r.order_total, session: r.session_id,
    created: r.created_at?.toLocaleString?.('id-ID', { timeZone: 'Asia/Jakarta' }) })));

  console.log('\n=== MUTASI STOK / LC / CETAK STRUK / LOG WAKTU (hari ini) ===');
  for (const [table, timeCol] of [['stock_movements', 'created_at'], ['lc_work_logs', 'created_at'],
    ['receipt_print_logs', 'created_at'], ['room_time_logs', 'created_at']]) {
    try {
      const r = await q(`select count(*)::int n from ${table} where ${timeCol} >= '2026-10-06 00:00:00+07'`);
      console.log(`  ${table}: ${r.rows[0].n}`);
    } catch (e) { console.log(`  ${table}: ERROR ${e.message}`); }
  }

  console.log('\n=== CLOSING KASIR hari ini ===');
  try {
    const c = await q(`select closing_id, cashier_name, operational_date, created_at from cashier_closings where operational_date = '2026-10-06'`);
    console.table(c.rows);
  } catch (e) { console.log('ERROR', e.message); }

  await pool.end();
})().catch(async (e) => { console.error('GAGAL:', e.message); try { await pool.end(); } catch (_) {} process.exit(1); });