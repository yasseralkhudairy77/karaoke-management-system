const db = require('../src/db');
const { buildOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

async function reconcile() {
  console.log('=== MEMULAI REKONSILIASI PEMBAYARAN TRANSAKSI (POST-PAYMENT CORRECTION) ===\n');

  let client;
  try {
    client = await db.pool.connect();
  } catch (err) {
    console.error('[ERROR] Tidak dapat terhubung ke database PostgreSQL.');
    console.error('Pesan error:', err.message);
    console.error('\nPastikan service PostgreSQL lokal sudah berjalan atau periksa konfigurasi di server/.env.');
    process.exit(1);
  }

  try {
    await client.query('BEGIN');

    // 1. Cari transaksi cash yang tidak sinkron
    const cashMismatchRes = await client.query(`
      SELECT transaction_id, room_name, payment_method, payment_status, grand_total, cash_amount, transfer_amount
      FROM transactions
      WHERE payment_status = 'paid'
        AND payment_method = 'cash'
        AND cash_amount <> grand_total
      ORDER BY created_at DESC
    `);

    console.log(`Ditemukan ${cashMismatchRes.rowCount} transaksi Cash yang tidak sinkron dengan grand_total:`);
    for (const row of cashMismatchRes.rows) {
      console.log(` - ${row.transaction_id} (${row.room_name}): grand_total = Rp ${Number(row.grand_total).toLocaleString('id-ID')}, cash_amount lama = Rp ${Number(row.cash_amount).toLocaleString('id-ID')}`);
    }

    // 2. Cari transaksi transfer yang tidak sinkron
    const transferMismatchRes = await client.query(`
      SELECT transaction_id, room_name, payment_method, payment_status, grand_total, cash_amount, transfer_amount
      FROM transactions
      WHERE payment_status = 'paid'
        AND (payment_method = 'transfer' OR payment_method = 'qris')
        AND transfer_amount <> grand_total
      ORDER BY created_at DESC
    `);

    console.log(`\nDitemukan ${transferMismatchRes.rowCount} transaksi Transfer yang tidak sinkron dengan grand_total:`);
    for (const row of transferMismatchRes.rows) {
      console.log(` - ${row.transaction_id} (${row.room_name}): grand_total = Rp ${Number(row.grand_total).toLocaleString('id-ID')}, transfer_amount lama = Rp ${Number(row.transfer_amount).toLocaleString('id-ID')}`);
    }

    // 3. Update transaksi cash
    const updateCashRes = await client.query(`
      UPDATE transactions
      SET cash_amount = grand_total,
          transfer_amount = 0
      WHERE payment_status = 'paid'
        AND payment_method = 'cash'
        AND cash_amount <> grand_total
      RETURNING transaction_id
    `);
    console.log(`\nBerhasil memperbaiki ${updateCashRes.rowCount} transaksi Cash di tabel transactions.`);

    // 4. Update transaksi transfer
    const updateTransferRes = await client.query(`
      UPDATE transactions
      SET transfer_amount = grand_total,
          cash_amount = 0
      WHERE payment_status = 'paid'
        AND (payment_method = 'transfer' OR payment_method = 'qris')
        AND transfer_amount <> grand_total
      RETURNING transaction_id
    `);
    console.log(`Berhasil memperbaiki ${updateTransferRes.rowCount} transaksi Transfer di tabel transactions.`);

    // 5. Update cashier_closing_transactions jika ada
    try {
      const updateClosingCashRes = await client.query(`
        UPDATE cashier_closing_transactions
        SET cash_amount = grand_total,
            transfer_amount = 0
        WHERE payment_status = 'paid'
          AND payment_method = 'cash'
          AND cash_amount <> grand_total
      `);
      console.log(`Berhasil memperbaiki ${updateClosingCashRes.rowCount} record di cashier_closing_transactions.`);
    } catch (_) {
      // Tabel closing mungkin belum ada di env tertentu
    }

    await client.query('COMMIT');
    console.log('\n✅ Transaksi database berhasil direkonsiliasi secara permanen!');

    // 6. Cek konfigurasi Owner Mirror Cloud push
    const mirrorUrl = process.env.OWNER_MIRROR_CLOUD_URL;
    const token = process.env.OWNER_MIRROR_TOKEN;
    const sourceId = process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local';

    if (mirrorUrl && token) {
      console.log('\nMendorong snapshot terbaru ke Cloud Mirror Railway...');
      const endpoint = new URL(mirrorUrl);
      endpoint.searchParams.set('action', 'pushOwnerMirrorSnapshot');

      for (const period of ['today', 'yesterday', 'last7days', 'thismonth']) {
        try {
          const snapshot = await buildOwnerMirrorSnapshot({ period });
          const response = await fetch(endpoint.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              action: 'pushOwnerMirrorSnapshot',
              source_id: sourceId,
              snapshot
            })
          });

          const result = await response.json().catch(() => null);
          if (response.ok && result?.ok) {
            console.log(` - Periode '${period}': Berhasil di-update ke cloud (Snapshot ID: ${result.snapshot_id})`);
          } else {
            console.warn(` - Periode '${period}': Gagal push (${result?.error || response.status})`);
          }
        } catch (pushErr) {
          console.warn(` - Periode '${period}': Gagal push (${pushErr.message})`);
        }
      }
    } else {
      console.log('\n[INFO] OWNER_MIRROR_CLOUD_URL / OWNER_MIRROR_TOKEN belum diisi di server/.env.');
      console.log('Untuk memperbarui cloud mirror secara otomatis, pastikan kedua env var tersebut terkonfigurasi.');
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[ERROR] Rekonsiliasi gagal:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

reconcile().then(() => {
  console.log('\nSelesai.');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
