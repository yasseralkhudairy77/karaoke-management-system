# Migration Plan F&B v2.3B - Inventory Identity Migration

Tanggal rencana: 2026-07-13

## 1. Tujuan Migrasi

Migrasi ini bertujuan menyelesaikan duplicate `stock_item_id` di production agar identity inventory kembali unik dan aman dipakai oleh:

- mapping stok Menu F&B,
- StockMovements,
- fitur restock/koreksi stok,
- stock deduction saat transaksi F&B ditagihkan,
- import PackageMaster/PackageDetail F&B v2.

Migrasi tidak menghapus histori transaksi. Fokus migrasi adalah memisahkan row QA dari identity canonical.

## 2. Canonical Identity

Identity canonical yang harus dipertahankan:

| stock_item_id | stock_item_name | Keterangan |
| --- | --- | --- |
| `ITEM-001` | `Air Mineral 600ml` | Item production/canonical |
| `ITEM-002` | `Teh Botol` | Item production/canonical |

Menu production tetap memakai identity canonical:

| menu_id | menu_name | stock_item_id |
| --- | --- | --- |
| `MENU-001` | `Air Mineral 600ml` | `ITEM-001` |
| `MENU-002` | `Teh Botol` | `ITEM-002` |

## 3. QA Migration Mapping

Row QA duplicate dipisahkan ke ID khusus QA:

| Current stock_item_id | QA stock_item_name | New stock_item_id |
| --- | --- | --- |
| `ITEM-001` | `TEST - INVENTORY QA` | `ITEM-QA-001` |
| `ITEM-002` | `TEST - Inventory Delete QA` | `ITEM-QA-002` |

Catatan:

- Mapping ini hanya untuk row QA.
- Row canonical tidak berubah.
- Migrasi harus dilakukan row-aware, bukan lewat endpoint update biasa, karena endpoint update mencari berdasarkan `stock_item_id` dan bisa mengenai row canonical.

## 4. Tabel Yang Berubah

### Inventory

Perubahan:

- Row `TEST - INVENTORY QA` diubah dari `ITEM-001` menjadi `ITEM-QA-001`.
- Row `TEST - Inventory Delete QA` diubah dari `ITEM-002` menjadi `ITEM-QA-002`.

Kolom lain sebaiknya dipertahankan apa adanya untuk menjaga konteks QA:

- `stock_item_name`
- `category`
- `unit`
- `stock_qty`
- `min_stock`
- `status`
- `updated_at`

### StockMovements

Perubahan hanya untuk movement yang secara historis milik row QA berdasarkan `stock_item_name`:

- Movement dengan `stock_item_id = ITEM-001` dan `stock_item_name = TEST - INVENTORY QA` diubah menjadi `stock_item_id = ITEM-QA-001`.
- Movement dengan `stock_item_id = ITEM-002` dan `stock_item_name = TEST - Inventory Delete QA` diubah menjadi `stock_item_id = ITEM-QA-002`.

Movement canonical tidak berubah:

- `ITEM-001` + `Air Mineral 600ml`
- `ITEM-002` + `Teh Botol`

## 5. Tabel Yang Tidak Berubah

Tabel berikut tidak diubah dalam migrasi ini:

| Tabel | Alasan |
| --- | --- |
| `Menu` | Harus tetap menunjuk canonical `ITEM-001` dan `ITEM-002`. |
| `Transactions` | Tidak menyimpan `stock_item_id` langsung; histori transaksi dipertahankan. |
| `FnbOrders` | Tidak menyimpan `stock_item_id` langsung. |
| `FnbOrderItems` | Mengacu ke `menu_id`, bukan `stock_item_id`. |
| `MasterDataAuditLogs` | Audit trail historis tidak diubah agar jejak lama tetap asli. |

## 6. Urutan Eksekusi

1. Freeze sementara operasi yang dapat mengubah Inventory/F&B:
   - restock,
   - koreksi stok,
   - close session yang membawa F&B,
   - master inventory/menu edit.

2. Buat backup/export spreadsheet production.

3. Verifikasi ulang duplicate sebelum eksekusi:
   - `ITEM-001` hanya duplicate antara `Air Mineral 600ml` dan `TEST - INVENTORY QA`.
   - `ITEM-002` hanya duplicate antara `Teh Botol` dan `TEST - Inventory Delete QA`.

4. Update row QA di `Inventory` secara row-aware:
   - `TEST - INVENTORY QA`: `ITEM-001` -> `ITEM-QA-001`.
   - `TEST - Inventory Delete QA`: `ITEM-002` -> `ITEM-QA-002`.

5. Update `StockMovements` QA berdasarkan kombinasi ID lama + nama QA:
   - `ITEM-001` + `TEST - INVENTORY QA` -> `ITEM-QA-001`.
   - `ITEM-002` + `TEST - Inventory Delete QA` -> `ITEM-QA-002`.

6. Jangan ubah movement canonical.

7. Jangan ubah `Menu`.

8. Jalankan validation checklist.

9. Jika validasi lolos, freeze bisa dibuka kembali.

10. Lanjutkan rencana import PackageMaster/PackageDetail hanya setelah identity inventory valid.

## 7. Backup Requirement

Backup wajib sebelum migrasi:

- Full spreadsheet export.
- Minimal export tab:
  - `Inventory`
  - `StockMovements`
  - `Menu`
  - `Transactions`
  - `FnbOrders`
  - `FnbOrderItems`
  - `MasterDataAuditLogs`

Backup harus diberi timestamp dan disimpan sebelum perubahan pertama dilakukan.

## 8. Validation Checklist Setelah Migrasi

Checklist wajib:

- `getInventoryItems` tidak lagi menampilkan duplicate `stock_item_id`.
- `ITEM-001` hanya muncul sebagai `Air Mineral 600ml`.
- `ITEM-002` hanya muncul sebagai `Teh Botol`.
- `ITEM-QA-001` muncul sebagai `TEST - INVENTORY QA`.
- `ITEM-QA-002` muncul sebagai `TEST - Inventory Delete QA`.
- `Menu` tetap:
  - `MENU-001.stock_item_id = ITEM-001`
  - `MENU-002.stock_item_id = ITEM-002`
- `getTodayStockMovements&period=all&stock_item_id=ITEM-001` hanya menampilkan movement canonical Air Mineral 600ml.
- `getTodayStockMovements&period=all&stock_item_id=ITEM-002` hanya menampilkan movement canonical Teh Botol.
- `getTodayStockMovements&period=all&stock_item_id=ITEM-QA-001` menampilkan histori QA `TEST - INVENTORY QA`.
- `getTodayStockMovements&period=all&stock_item_id=ITEM-QA-002` menampilkan histori QA `TEST - Inventory Delete QA`.
- Stock deduction F&B untuk `MENU-001` mengurangi row `Air Mineral 600ml`.
- Stock deduction F&B untuk `MENU-002` mengurangi row `Teh Botol`.
- MasterDataAuditLogs tetap terbaca.
- Tidak ada perubahan pada `Transactions`, `FnbOrders`, dan `FnbOrderItems`.

## 9. Risiko Rollback

Risiko utama:

- Jika migrasi StockMovements hanya berdasarkan `stock_item_id`, histori canonical dan QA bisa tercampur.
- Jika row Inventory diubah tidak row-aware, row canonical bisa tidak sengaja berubah.
- Jika rollback dilakukan sebagian, Menu bisa tetap benar tetapi StockMovements menjadi tidak konsisten.
- MasterDataAuditLogs tetap menyimpan histori lama `ITEM-001`/`ITEM-002`, sehingga laporan audit harus memahami konteks sebelum dan sesudah migrasi.

Strategi rollback:

- Gunakan backup full spreadsheet sebagai sumber rollback utama.
- Rollback parsial hanya boleh dilakukan jika daftar cell yang berubah terdokumentasi lengkap.
- Jika validasi gagal setelah migrasi, freeze operasi tetap aktif sampai data dikembalikan atau diperbaiki.

## Status

Status migrasi: belum dilakukan.

Package import F&B v2 menunggu migrasi inventory identity ini selesai dan tervalidasi.
