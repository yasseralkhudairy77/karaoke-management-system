const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const outputLines = [];
  const log = (msg = '') => {
    console.log(msg);
    outputLines.push(msg);
  };

  log('=============================================================================');
  log('   🔍 HAPPY SONG POS - LAPORAN PEMERIKSAAN STOK & BARANG MASUK SEPTEMBER 2026');
  log('=============================================================================');
  log(`Waktu Pemeriksaan: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
  log();

  let client;
  try {
    client = await db.pool.connect();
    log('✅ Terhubung ke database PostgreSQL Lokal PC Server.');
  } catch (err) {
    log('❌ [ERROR] Tidak dapat terhubung ke database PostgreSQL lokal di PC Server.');
    log(`Pesan Error: ${err.message}`);
    log('\nPastikan:');
    log('1. Service PostgreSQL di PC ini sudah menyala (Running).');
    log('2. File server/.env memiliki konfigurasi database yang sesuai.');
    process.exit(1);
  }

  try {
    // 1. Ambil data produk target di tabel inventory
    log('\n-----------------------------------------------------------------------------');
    log('📦 1. POSISI STOK TERKINI DI DATABASE (TABEL INVENTORY)');
    log('-----------------------------------------------------------------------------');

    const invRes = await client.query(`
      SELECT stock_item_id, stock_item_name, category, stock_qty, unit, 
             TO_CHAR(updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as last_update
      FROM inventory
      WHERE stock_item_name ILIKE '%Anggur Merah%'
         OR stock_item_name ILIKE '%Intisari%'
         OR stock_item_name ILIKE '%Atlas Leci%'
         OR stock_item_name ILIKE '%Anggur Putih%'
      ORDER BY stock_item_name ASC
    `);

    if (invRes.rows.length === 0) {
      log('⚠️ Tidak ditemukan item yang cocok dengan Anggur Merah, Intisari, Atlas Leci, atau Anggur Putih.');
    } else {
      log('ID ITEM   | NAMA BARANG                   | STOK SISTEM | SATUAN | TERAKHIR DIUPDATE');
      log('----------+-------------------------------+-------------+--------+------------------');
      for (const row of invRes.rows) {
        const id = String(row.stock_item_id).padEnd(9, ' ');
        const name = String(row.stock_item_name).padEnd(29, ' ');
        const qty = String(Number(row.stock_qty || 0)).padStart(11, ' ');
        const unit = String(row.unit || 'botol').padEnd(6, ' ');
        const updated = String(row.last_update || '-').padEnd(16, ' ');
        log(`${id} | ${name} | ${qty} | ${unit} | ${updated}`);
      }
    }

    // 2. Cek semua mutasi barang masuk (in) di bulan September 2026
    log('\n-----------------------------------------------------------------------------');
    log('📥 2. SEMUA MUTASI BARANG MASUK (01 S/D 07 SEPTEMBER 2026)');
    log('-----------------------------------------------------------------------------');

    const inMovementsRes = await client.query(`
      SELECT 
        movement_id,
        stock_item_name,
        movement_type,
        reference_type,
        reference_id,
        qty_change,
        stock_before,
        stock_after,
        note,
        cashier_name,
        TO_CHAR(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as waktu_wib
      FROM stock_movements
      WHERE created_at >= '2026-09-01 00:00:00'
        AND movement_type = 'in'
      ORDER BY created_at ASC
    `);

    if (inMovementsRes.rows.length === 0) {
      log('ℹ️ Belum ada SATUPUN mutasi barang masuk (movement_type = in) di bulan September 2026.');
    } else {
      log(`Ditemukan ${inMovementsRes.rows.length} mutasi barang masuk di September 2026:`);
      log('WAKTU WIB        | NAMA BARANG         | MASUK | REF TYPE        | NO REFERENSI / SJ | PETUGAS');
      log('-----------------+---------------------+-------+-----------------+-------------------+--------');
      for (const m of inMovementsRes.rows) {
        const waktu = String(m.waktu_wib).padEnd(16, ' ');
        const name = String(m.stock_item_name).substring(0, 19).padEnd(19, ' ');
        const qty = String(Math.abs(Number(m.qty_change || 0))).padStart(5, ' ');
        const refType = String(m.reference_type || '-').substring(0, 15).padEnd(15, ' ');
        const refId = String(m.reference_id || '-').substring(0, 17).padEnd(17, ' ');
        const user = String(m.cashier_name || '-').padEnd(8, ' ');
        log(`${waktu} | ${name} | ${qty} | ${refType} | ${refId} | ${user}`);
      }
    }

    // 3. Pencocokan spesifik dengan 5 catatan manual Anda
    log('\n-----------------------------------------------------------------------------');
    log('📋 3. HASIL PENCOCOKAN DENGAN CATATAN FISIK ANDA');
    log('-----------------------------------------------------------------------------');

    const manualChecks = [
      { date: '2026-09-04', name: 'Anggur Merah', qty: 60 },
      { date: '2026-09-04', name: 'Intisari', qty: 60 },
      { date: '2026-09-04', name: 'Atlas Leci', qty: 60 },
      { date: '2026-09-07', name: 'Anggur Putih', qty: 36 },
      { date: '2026-09-07', name: 'Anggur Merah', qty: 12 },
    ];

    log('TANGGAL    | NAMA BARANG     | QTY FISIK | STATUS DI SISTEM PC SERVER');
    log('-----------+-----------------+-----------+------------------------------------------');

    for (const item of manualChecks) {
      // Cari apakah ada mutasi in untuk item ini di tanggal tersebut (+/- 1 hari toleransi jika beda jam cut-off)
      const checkRes = await client.query(`
        SELECT movement_id, qty_change, reference_type, reference_id, note
        FROM stock_movements
        WHERE movement_type = 'in'
          AND stock_item_name ILIKE $1
          AND DATE(created_at AT TIME ZONE 'Asia/Jakarta') = $2
      `, [`%${item.name}%`, item.date]);

      const tgl = item.date.padEnd(10, ' ');
      const nama = item.name.padEnd(15, ' ');
      const qty = String(item.qty).padStart(9, ' ');

      if (checkRes.rows.length > 0) {
        const totalFound = checkRes.rows.reduce((sum, r) => sum + Math.abs(Number(r.qty_change || 0)), 0);
        if (totalFound === item.qty) {
          log(`${tgl} | ${nama} | ${qty} | ✅ TERCATAT TEPAT (${totalFound} pcs - Ref: ${checkRes.rows[0].reference_id})`);
        } else {
          log(`${tgl} | ${nama} | ${qty} | ⚠️ TERCATAT BEDA JUMLAH (Di sistem tercatat: ${totalFound} pcs)`);
        }
      } else {
        // Cek apakah ada di tanggal lain di bulan September
        const otherDateRes = await client.query(`
          SELECT movement_id, qty_change, TO_CHAR(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') as tgl
          FROM stock_movements
          WHERE movement_type = 'in'
            AND stock_item_name ILIKE $1
            AND created_at >= '2026-09-01 00:00:00'
        `, [`%${item.name}%`]);

        if (otherDateRes.rows.length > 0) {
          const info = otherDateRes.rows.map(r => `${r.tgl} (${Math.abs(r.qty_change)} pcs)`).join(', ');
          log(`${tgl} | ${nama} | ${qty} | ⚠️ BELUM DI TGL INI (Ada di tgl: ${info})`);
        } else {
          log(`${tgl} | ${nama} | ${qty} | ❌ BELUM TERCATAT SAMA SEKALI`);
        }
      }
    }

    // 4. Periksa barang keluar / penjualan F&B September 2026
    log('\n-----------------------------------------------------------------------------');
    log('📤 4. PENJUALAN / BARANG KELUAR SEPTEMBER 2026 (01 S/D 07 SEPTEMBER)');
    log('-----------------------------------------------------------------------------');

    const outMovementsRes = await client.query(`
      SELECT 
        stock_item_name,
        SUM(ABS(qty_change)) as total_sold
      FROM stock_movements
      WHERE created_at >= '2026-09-01 00:00:00'
        AND movement_type = 'out'
        AND (
          stock_item_name ILIKE '%Anggur Merah%'
          OR stock_item_name ILIKE '%Intisari%'
          OR stock_item_name ILIKE '%Atlas Leci%'
          OR stock_item_name ILIKE '%Anggur Putih%'
        )
      GROUP BY stock_item_name
      ORDER BY stock_item_name ASC
    `);

    if (outMovementsRes.rows.length === 0) {
      log('ℹ️ Belum ada catatan penjualan/pengeluaran untuk 4 barang ini di September 2026.');
    } else {
      log('NAMA BARANG                   | TOTAL TERJUAL / KELUAR');
      log('------------------------------+-----------------------');
      for (const r of outMovementsRes.rows) {
        log(`${r.stock_item_name.padEnd(29, ' ')} | ${String(r.total_sold).padStart(21, ' ')} botol`);
      }
    }

    log('\n=============================================================================');
    log('📌 KESIMPULAN REKONSILIASI STOK:');
    log('=============================================================================');
    log('1. Jika di Bagian 3 statusnya bertanda "❌ BELUM TERCATAT SAMA SEKALI":');
    log('   Artinya admin gudang / kasir memang belum pernah meng-input barang masuk');
    log('   tersebut ke dalam software POS (stok sistem belum bertambah).');
    log('2. Anda dapat mencatat barang masuk tersebut melalui dashboard menu:');
    log('   -> Manajemen Stok / Admin Gudang -> [Catat Barang Masuk]');
    log('3. Laporan ini juga disimpan otomatis ke file teks di:');
    log('   server\\scripts\\laporan_pemeriksaan_stok_september.txt');
    log('=============================================================================\n');

  } catch (err) {
    log(`❌ Terjadi kesalahan saat memeriksa database: ${err.message}`);
  } finally {
    client.release();
    await db.pool.end();

    const reportPath = path.join(__dirname, 'laporan_pemeriksaan_stok_september.txt');
    fs.writeFileSync(reportPath, outputLines.join('\r\n'), 'utf8');
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
});
