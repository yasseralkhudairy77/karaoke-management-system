# Audit Note F&B v2.3 - Inventory Identity Issue

Tanggal audit: 2026-07-13

## Ringkasan

Audit F&B v2.3 menemukan masalah identitas inventory di production berupa duplicate `stock_item_id`.

Duplicate ini berdampak pada rencana import PackageMaster/PackageDetail karena komponen package harus mengacu ke master reference yang stabil dan tidak ambigu.

## Duplicate Inventory

Duplicate `stock_item_id` yang ditemukan:

| stock_item_id | Nama canonical | Nama duplicate QA |
| --- | --- | --- |
| `ITEM-001` | `Air Mineral 600ml` | `TEST - INVENTORY QA` |
| `ITEM-002` | `Teh Botol` | `TEST - Inventory Delete QA` |

## Dampak

### StockMovement

`ITEM-001` sudah memiliki StockMovements untuk data canonical dan data QA:

- `Air Mineral 600ml`
- `TEST - INVENTORY QA`

`ITEM-002` juga sudah memiliki StockMovements untuk data canonical dan data QA:

- `Teh Botol`
- `TEST - Inventory Delete QA`

Karena `StockMovements` menyimpan `stock_item_id`, duplicate ID membuat histori mutasi stok ambigu jika hanya dilihat berdasarkan ID.

### Transaction History

Data QA duplicate sudah muncul dalam histori transaksi melalui StockMovements dengan `reference_type = transaction`.

Implikasi:

- Rename/delete langsung berisiko memutus konteks histori.
- Perubahan identity harus dilakukan lewat cleanup terencana, bukan koreksi manual cepat.

### Menu Reference

Menu production saat ini mereferensikan ID canonical:

| menu_id | menu_name | stock_item_id |
| --- | --- | --- |
| `MENU-001` | `Air Mineral 600ml` | `ITEM-001` |
| `MENU-002` | `Teh Botol` | `ITEM-002` |

Karena ID yang sama juga dipakai row QA, referensi Menu menjadi rentan ambigu saat backend membangun mapping inventory berdasarkan `stock_item_id`.

## Keputusan

- Tidak melakukan rename sekarang.
- Tidak melakukan delete sekarang.
- Tidak melakukan perubahan production data.
- Cleanup inventory identity dijadikan milestone terpisah sebelum import package.

## Status Package Import

Status: tertunda.

Package import F&B v2.3 menunggu inventory identity cleanup agar referensi PackageDetail aman, terutama untuk komponen inventory baru seperti Beer dan Mineral Water 330ml.

## Rekomendasi Milestone Terpisah

Milestone cleanup perlu menentukan strategi yang aman untuk:

- Memisahkan identity row QA dari ID canonical.
- Menjaga histori StockMovements dan transaksi tetap dapat diaudit.
- Memastikan Menu tetap menunjuk item canonical yang benar.
- Memastikan sequence ID inventory berikutnya tidak bentrok.
