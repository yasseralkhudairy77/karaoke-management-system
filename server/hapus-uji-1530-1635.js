/*
  HAPUS DATA UJI COBA: transaksi 15:00-16:35 tanggal 6 Oktober 2026.

  PENGAMAN:
    - Mode DRY RUN secara bawaan (tanpa --jalankan): hanya melaporkan.
    - Prasyarat: sudah ada berkas cadangan pg_dump (--cadangan=<path>).
    - Hanya menyentuh ID yang berada di dalam jendela waktu DAN dibuat oleh
      akun uji ("Manager 1"). Kalau ketemu baris di luar itu, script BERHENTI.
    - Semua penghapusan dalam SATU transaksi database: kalau ada yang gagal,
      semuanya dibatalkan (rollback).
    - Setelah selesai, script memverifikasi ulang bahwa tidak ada sisa.

  Pemakaian:
    node hapus-uji-1530-1635.js --cadangan=backups/xxx.dump            (dry run)
    node hapus-uji-1530-1635.js --cadangan=backups/xxx.dump --jalankan (eksekusi)
*/
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/db/index.js');

const FROM = '2026-10-06 15:00:00+07';
const TO = '2026-10-06 16:35:00+07';
const CASHIER = 'Manager 1';

const args = process.argv.slice(2);
const RUN = args.includes('--jalankan');
const backupArg = (args.find(a => a.startsWith('--cadangan=')) || '').split('=')[1];

const SELECT_TX = `
  select transaction_id, room_name, cashier_name, created_at, grand_total, payment_status
  from transactions
  where created_at >= $1::timestamptz and created_at <= $2::timestamptz
  order by created_at`;

const SELECT_SESS = `
  select session_id, room_name, status, cashier_name, start_time, end_time, closed_transaction_id
  from room_sessions
  where status = 'closed'
    and cashier_name = $3
    and start_time >= $1::timestamptz and start_time <= $2::timestamptz
    and closed_transaction_id in (select transaction_id from transactions
        where created_at >= $1::timestamptz and created_at <= $2::timestamptz)
  order by start_time`;

(async () => {
  const q = (s, p) => pool.query(s, p);
  console.log('Mode:', RUN ? '*** JALANKAN (menghapus) ***' : 'DRY RUN (tidak menghapus apa pun)');
  console.log('Jendela:', FROM, '->', TO, '| pembuat:', CASHIER);

  const tx = (await q(SELECT_TX, [FROM, TO])).rows;
  const sess = (await q(SELECT_SESS, [FROM, TO, CASHIER])).rows;

  console.log('\nTransaksi ditemukan:', tx.length);
  console.table(tx.map(r => ({ id: r.transaction_id, room: r.room_name, cashier: r.cashier_name,
    created: r.created_at.toISOString(), total: r.grand_total, status: r.payment_status })));
  console.log('\nSesi ditemukan:', sess.length);
  console.table(sess.map(r => ({ id: r.session_id, room: r.room_name, cashier: r.cashier_name,
    start: r.start_time.toISOString(), end: r.end_time ? r.end_time.toISOString() : null, closed_tx: r.closed_transaction_id })));

  // --- pengaman: hanya akun uji, hanya status yang diharapkan
  const wrongCashier = tx.filter(r => r.cashier_name !== CASHIER);
  if (wrongCashier.length) {
    console.error('\nBERHENTI: ada transaksi di jendela yang dibuat akun lain:', wrongCashier.map(r => r.transaction_id));
    await pool.end(); process.exit(2);
  }
  const txIds = tx.map(r => r.transaction_id);
  const sessIds = sess.map(r => r.session_id);

  console.log('\nRencana penghapusan:');
  console.log('  transactions            :', txIds.length);
  console.log('  room_session_segments   :', (await q('select count(*)::int n from room_session_segments where session_id = any($1)', [sessIds])).rows[0].n);
  console.log('  room_sessions           :', sessIds.length);
  for (const [t, col] of [['transaction_lines','transaction_id'], ['sales_commission_logs','transaction_id'],
    ['transaction_correction_logs','transaction_id'], ['receipt_print_logs','transaction_id'],
    ['cashier_closing_transactions','transaction_id'], ['operational_audit_events','transaction_id']]) {
    const n = (await q(`select count(*)::int n from ${t} where ${col} = any($1)`, [txIds])).rows[0].n;
    console.log(`  ${t.padEnd(24)}: ${n}`);
  }

  if (!txIds.length && !sessIds.length) { console.log('\nTidak ada yang perlu dihapus.'); await pool.end(); return; }

  if (!RUN) { console.log('\nDRY RUN selesai. Tidak ada perubahan. Tambahkan --jalankan untuk eksekusi.'); await pool.end(); return; }

  if (!backupArg) { console.error('\nBERHENTI: wajib menyertakan --cadangan=<path berkas pg_dump> sebelum menghapus.'); await pool.end(); process.exit(3); }
  if (!fs.existsSync(backupArg) || fs.statSync(backupArg).size < 1000) {
    console.error('\nBERHENTI: berkas cadangan tidak ada atau kosong:', backupArg); await pool.end(); process.exit(3);
  }
  console.log('\nCadangan terverifikasi:', backupArg, `(${fs.statSync(backupArg).size} byte)`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r1 = await client.query('delete from transaction_lines where transaction_id = any($1)', [txIds]);
    const r2 = await client.query('delete from sales_commission_logs where transaction_id = any($1)', [txIds]);
    const r3 = await client.query('delete from transaction_correction_logs where transaction_id = any($1)', [txIds]);
    const r4 = await client.query('delete from receipt_print_logs where transaction_id = any($1)', [txIds]);
    const r5 = await client.query('delete from cashier_closing_transactions where transaction_id = any($1)', [txIds]);
    const r6 = await client.query('delete from room_session_segments where session_id = any($1)', [sessIds]);
    const r7 = await client.query('delete from transactions where transaction_id = any($1)', [txIds]);
    const r8 = await client.query('delete from room_sessions where session_id = any($1)', [sessIds]);
    await client.query('COMMIT');
    console.log('\nTERHAPUS:', { transaction_lines: r1.rowCount, sales_commission_logs: r2.rowCount,
      transaction_correction_logs: r3.rowCount, receipt_print_logs: r4.rowCount,
      cashier_closing_transactions: r5.rowCount, room_session_segments: r6.rowCount,
      transactions: r7.rowCount, room_sessions: r8.rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nGAGAL, semua dibatalkan (rollback):', e.message);
    client.release(); await pool.end(); process.exit(4);
  }
  client.release();

  // --- verifikasi setelah hapus
  const leftTx = (await q(SELECT_TX, [FROM, TO])).rows.length;
  const leftSess = (await q(SELECT_SESS, [FROM, TO, CASHIER])).rows.length;
  const leftSeg = (await q('select count(*)::int n from room_session_segments where session_id = any($1)', [sessIds])).rows[0].n;
  console.log('\nVERIFIKASI -> sisa transaksi:', leftTx, '| sisa sesi:', leftSess, '| sisa segmen:', leftSeg);
  console.log(leftTx === 0 && leftSess === 0 && leftSeg === 0 ? 'BERSIH: tidak ada sisa.' : 'PERHATIAN: masih ada sisa!');
  await pool.end();
})().catch(async (e) => { console.error('GAGAL:', e.message); try { await pool.end(); } catch (_) {} process.exit(1); });