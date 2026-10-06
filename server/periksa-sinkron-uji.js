/*
  PEMERIKSAAN LANJUTAN (READ-ONLY): sinkronisasi cloud, tabel audit, cetak struk,
  dan semua tabel yang menyimpan jejak 3 transaksi uji coba.
*/
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/db/index.js');

const IDS = ['TRX-1791279189192', 'TRX-1791279219843', 'TRX-1791279245430'];
const SESS = ['ROOM-001-20261006091142147', 'ROOM-002-20261006092736819', 'ROOM-003-20261006092749672'];

(async () => {
  const q = (sql, p) => pool.query(sql, p);
  console.log('=== KONFIG SINKRON ===');
  console.log({
    DISABLE_SYNC_WORKER: process.env.DISABLE_SYNC_WORKER,
    OWNER_MIRROR_MODE: process.env.OWNER_MIRROR_MODE,
    OWNER_MIRROR_CLOUD_URL: process.env.OWNER_MIRROR_CLOUD_URL ? '(terisi)' : '(kosong)',
    RAILWAY_URL: process.env.RAILWAY_API_URL ? '(terisi)' : process.env.SYNC_API_URL ? '(terisi: SYNC_API_URL)' : '(kosong)',
    keys: Object.keys(process.env).filter(k => /RAILWAY|SYNC|MIRROR|CLOUD/i.test(k)),
  });

  console.log('\n=== sync_outbox: entri untuk transaksi/sesi uji ===');
  try {
    const cols = await q(`select column_name from information_schema.columns where table_name='sync_outbox' order by ordinal_position`);
    console.log('kolom:', cols.rows.map(r => r.column_name).join(', '));
    const rows = await q(`select * from sync_outbox where payload::text ilike any($1::text[]) or entity_id = any($2::text[]) order by 1 desc limit 20`,
      [IDS.map(i => '%' + i + '%'), [...IDS, ...SESS]]);
    console.log('jumlah:', rows.rowCount);
    console.log(JSON.stringify(rows.rows.slice(0, 10), null, 1).slice(0, 2000));
  } catch (e) { console.log('ERROR', e.message); }

  console.log('\n=== tabel yang menyebut ID transaksi uji ===');
  const tables = [
    'receipt_print_logs', 'cashier_closing_transactions', 'lc_sales_bonus_logs',
    'operational_audit_events', 'transaction_lines', 'sales_commission_logs',
    'transaction_correction_logs',
  ];
  for (const t of tables) {
    try {
      const cols = await q(`select column_name from information_schema.columns where table_name=$1`, [t]);
      const names = cols.rows.map(r => r.column_name);
      const idCols = names.filter(n => /transaction_id|session_id/.test(n));
      if (!idCols.length) { console.log(`  ${t}: (tidak ada kolom id) kolom: ${names.join(', ')}`); continue; }
      const where = idCols.map(c => `${c} = any($1)`).join(' or ');
      const r = await q(`select count(*)::int n from ${t} where ${where}`, [IDS.concat(SESS)]);
      console.log(`  ${t}: ${r.rows[0].n}  (kolom id: ${idCols.join(', ')})`);
    } catch (e) { console.log(`  ${t}: ERROR ${e.message}`); }
  }

  console.log('\n=== rincian receipt_print_logs untuk transaksi uji ===');
  try {
    const r = await q(`select * from receipt_print_logs where transaction_id = any($1)`, [IDS]);
    console.log('jumlah:', r.rowCount); console.log(JSON.stringify(r.rows, null, 1).slice(0, 1200));
  } catch (e) { console.log('ERROR', e.message); }

  console.log('\n=== cashier_closings: apakah ada closing yang mencakup transaksi uji? ===');
  try {
    const cols = await q(`select column_name from information_schema.columns where table_name='cashier_closings' order by ordinal_position`);
    console.log('kolom:', cols.rows.map(r => r.column_name).join(', '));
    const r = await q(`select * from cashier_closings order by 1 desc limit 5`);
    console.log(JSON.stringify(r.rows, null, 1).slice(0, 1500));
    const ct = await q(`select * from cashier_closing_transactions where transaction_id = any($1)`, [IDS]);
    console.log('cashier_closing_transactions utk transaksi uji:', ct.rowCount);
  } catch (e) { console.log('ERROR', e.message); }

  console.log('\n=== segment sesi + log waktu + LC untuk sesi uji ===');
  for (const [t, c] of [['room_session_segments', 'session_id'], ['room_time_logs', 'session_id'], ['lc_work_logs', 'session_id'],
    ['fnb_orders', 'session_id'], ['operational_audit_events', 'session_id']]) {
    try {
      const r = await q(`select count(*)::int n from ${t} where ${c} = any($1)`, [SESS]);
      console.log(`  ${t}: ${r.rows[0].n}`);
    } catch (e) { console.log(`  ${t}: ERROR ${e.message}`); }
  }

  console.log('\n=== mutasi stok & lc_work_logs: kapan dibuatnya? (pastikan bukan milik uji coba) ===');
  for (const [t, c] of [['stock_movements', 'created_at'], ['lc_work_logs', 'created_at']]) {
    const r = await q(`select min(${c}) a, max(${c}) b, count(*)::int n from ${t} where ${c} >= '2026-10-06 00:00:00+07'`);
    console.log(`  ${t}: ${r.rows[0].n} baris, ${r.rows[0].a?.toISOString()} .. ${r.rows[0].b?.toISOString()}`);
  }

  console.log('\n=== OPERASIONAL: apakah ada transaksi LAIN di 15:00-16:35 yang bukan uji? ===');
  const win = await q(`select transaction_id, room_name, cashier_name, created_at, grand_total from transactions
    where created_at between '2026-10-06 15:00:00+07' and '2026-10-06 16:35:00+07' order by created_at`);
  console.table(win.rows.map(r => ({ id: r.transaction_id, room: r.room_name, cashier: r.cashier_name, total: r.grand_total, created: r.created_at?.toISOString() })));

  await pool.end();
})().catch(async (e) => { console.error('GAGAL:', e.message); try { await pool.end(); } catch (_) {} process.exit(1); });