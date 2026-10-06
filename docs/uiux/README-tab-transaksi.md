# Transaksi — audit & desain ulang (2026-10-06)

Lingkup: tab **Transaksi** beserta ketiga sub-tabnya (Riwayat Transaksi, Shift
Kasir, Input Manual). Tidak ada perubahan data atau perhitungan; hanya tampilan
(`css/skin-transaksi.css`) + label di `app.js`.

## Akar masalah (terukur dari audit DOM)

| # | Temuan | Bukti |
|---|--------|-------|
| T1 | **Kotak isian PUTIH di sub-tab Input Manual.** Aturan warisan `style.css` memberi latar `#f5f5f5` + teks `#182238` | **13 elemen berlatar putih** (tanggal, jam dengan ikon kalender/jam hitam, metode bayar, status, ruangan, durasi, nama tamu, kasir, catatan, pemilih menu/LC) |
| T2 | Tiga sub-tab berupa kartu 300×92 px bergradien; **ketiga judulnya emas** sehingga tab aktif tidak lebih menonjol | 3 gradien, 3 judul emas |
| T3 | Panel Riwayat bergradien permukaan `(38,29,20) → (13,10,7)` | 1 gradien |
| T4 | Kotak keterangan periode operasional memakai **hijau pekat** (garis `#4fd19a` + latar hijau) — satu-satunya blok hijau besar di aplikasi | 1 blok hijau |
| T5/T6 | **Dua hijau berbeda** untuk hal yang sama: tombol periode `rgba(92,213,155)` dan tombol filter status `rgba(120,247,198)` | 2 warna hijau |
| T9 | Kotak catatan cutoff memakai **BIRU penuh** `rgba(59,130,246,.08)` + teks `#bfdbfe` | 1 blok biru |
| T7 | Judul panel "Pemulihan Transaksi Mati Listrik" tidak nyambung dengan nama sub-tab "Input Manual"; "Nama Tamu / Tuan" ambigu; "Tanggal Nota / Periode" mencampur dua hal; "Khusus owner" | 4 label |
| T8 | Metode bayar "Cash"/"Transfer" tidak konsisten bahasa | 1 |
| T10 | 6 kartu ringkasan dengan grid **4 kolom** → baris kedua menggantung 2 kartu, sisa ruang kosong di kanan | 4+2 |
| T11 | Format tanggal tidak seragam: kotak isian `06/10/2026` (garis miring) vs keterangan `06-10-2026` (tanda hubung) | 1 |

## Perbaikan

| # | Perubahan | Bukti ukur |
|---|-----------|-----------|
| T1 | Seluruh kotak isian dipaksa gelap (latar 4,5%, teks tema, tinggi ≥40px, fokus emas, `color-scheme: dark` agar ikon kalender/jam ikut terang) | **elemen berlatar terang (luminansi > 120): 13 → 0** (diukur dengan skin dimatikan di tempat); semua input `rgba(255,255,255,0.043)` + teks `rgb(246,234,210)` |
| T2 | Sub-tab polos; judul non-aktif netral; tab aktif = aksen emas 3px tepi kiri + latar emas 12% | aktif `rgba(255,215,122,0.12)`; non-aktif `rgba(255,255,255,0.024)` |
| T3 | Panel memakai `--surface`, gradien dihapus | gradien Riwayat: **0** |
| T4 | Kotak periode jadi tenang: garis hijau tipis 55% + latar hijau 8% | dari blok hijau pekat |
| T5/T6 | Filter pakai **satu warna saja** (emas untuk aktif); dua hijau dihapus | hijau pada filter: **0** |
| T9 | Kotak catatan cutoff jadi netral | biru: **0** |
| T7 | Judul panel "Pemulihan Transaksi Mati Listrik" **dipertahankan** (istilah yang dipakai staf), tapi sub-tab jadi **"Input Manual (Mati Listrik)"** supaya nyambung; "Nama Tamu / Tuan" → **Nama Tamu**; "Tanggal Nota / Periode" → **Tanggal Nota**; "Khusus owner" → **Khusus pemilik** | terukur di DOM |
| T8 | "Cash" → **Tunai** | 1 |
| T10 | Kartu ringkasan jadi **3 kolom × 2 baris** (rata, tanpa ruang kosong) | `transaction-summary-card` 387×77, 6 kartu = 3+3 |
| T11 | Keterangan periode memakai format sama dengan kotak isian (`06-10-2026` dari `formatOperationalDateId`) | helper baru |
| — | Angka uang memakai `tabular-nums`; angka pengurang (komisi) tidak lagi emas seperti angka penghasilan | `Komisi Marketing` kini netral |

## Bukti ukur (1366×768)
- Kotak putih: **13 → 0** di sub-tab Input Manual (diukur: skin dimatikan = 13, skin aktif = 0).
- emoji **0** di ketiga sub-tab · elemen terang **0** · tidak ada geser mendatar (1366/1366).
- gradien: Riwayat **1 → 0**; yang tersisa di Input Manual (2) hanya tombol aksi emas — sesuai tema.
- **Regresi: 0 perbedaan** di tab Ruangan / F&B / Pengeluaran / Stok / LC / Laporan / Audit.

## Cara membalik
1. Cepat: hapus baris `<link rel="stylesheet" href="css/skin-transaksi.css?v=1" />`
   di `index.html` → kotak putih & tampilan lama kembali.
   (Perubahan label di `app.js` perlu `git revert`.)
2. Penuh: `git revert <commit ini>`.

## Catatan jujur
- Tombol "Tambah" pada baris F&B/LC tetap bisa diklik walau pilihan masih
  kosong (perilaku lama, bukan gaya). Sudah saya ukur bahwa tinggi & perataan
  tombol kini sejajar dengan dropdown-nya (40 px), tapi **menonaktifkannya
  adalah perubahan perilaku**, jadi saya tahan dulu — bilang saja kalau mau.
- Data pada shift ini kosong, jadi kartu ringkasan semuanya Rp 0; variasi warna
  status belum terbukti dengan angka nyata.
- Panel Input Manual adalah alat pemilik untuk mencatat transaksi saat mati
  listrik — saya tidak menyentuh satu pun alur penyimpanannya.