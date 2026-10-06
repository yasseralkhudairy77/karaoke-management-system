# Stok / Gudang — audit & desain ulang (2026-10-06)

Lingkup: tab **Stok** beserta kelima sub-tabnya. Tidak ada perubahan data,
tidak ada perubahan alur kerja; hanya tampilan (CSS baru) + teks label di `app.js`.
Sebagian besar perubahan ada di `css/skin-stok.css` yang dimuat setelah
`style.css`. Sebagian panel (Catat Barang Masuk) ditulis dengan style inline di
`app.js`, sehingga lapisan CSS memakai `!important` terbatas pada warna/jarak —
disengaja, dan hanya untuk properti tampilan.

## Akar masalah "norak" (terukur, dari audit DOM)

| # | Temuan | Angka |
|---|--------|-------|
| S1 | Sub-tab pakai emoji sebagai ikon; **kelima** tombol bergaris emas sehingga tab aktif tidak lebih menonjol daripada tab lain | 16 elemen beremoji |
| S2 | Panel utama memakai palet kedua: latar `rgba(13,10,7,.45)` dan gradien `(38,29,20) → (16,12,8)` | 2 gradien gelap |
| S3 | Kartu ringkasan memakai **garis tepi kiri 4px** berwarna (emas/hijau **#18c787**/oranye **#ffb347**/pink **#ff6384**) — pola yang tidak dipakai modul lain | 4 garis warna |
| S4 | Kolom pencarian bergaris biru: `var(--border-color, #444)` / `var(--bg-card, #1e1e24)` — variabel yang **tidak ada** di tema | 1 |
| S5 | Nama barang diberi emoji ✏️ yang tampak seperti tombol sunting | 10 baris |
| S6 | Tulisan Inggris di UI: "Adjust / Restock", "SKU / Item Code", "Nama Material", "Min. Stok", "Stok Safe / Normal", "Stok Out / Minus", "SAP/Odoo View", "Refresh", "Submit", "Approve & Posting", "Draft/Counting/Posted" | 20+ label |
| S7 | Sakelar aktif hijau **#10b981** + efek menyala `0 0 8px` | glow 10 |
| S8 | Panel "Catat Barang Masuk" punya dua judul seksi **dua warna berbeda** (#fbbf24 emas dan #10b981 hijau), tabel bergaya kartu `#18181e`, tombol simpan **gradien hijau** | 3 gaya |
| S9 | Angka stok tidak rata kanan dan tidak memakai angka tabular | 125 baris |

## Perbaikan

| # | Perubahan | Bukti ukur |
|---|-----------|-----------|
| S1 | Sub-tab tanpa emoji, dibungkus satu baris pil; tab aktif = emas + latar emas 14% (bukan sekadar garis tepi) | `bg rgba(255,215,122,0.14)`, `color rgb(255,215,122)`, tab lain redup |
| S2 | Panel memakai `--surface` + `--border` + `--radius-lg`, tanpa gradien | gradien panel: **0** |
| S3 | Garis tepi kiri 4px dibatalkan; warna status dipindah ke label | `border-left: 1px` (dari 4px) |
| S4 | Kolom pencarian memakai `--border` + latar netral 4% | `rgba(226,184,92,0.22)` / `rgba(255,255,255,0.04)` |
| S5 | Emoji ✏️ diganti tombol teks **"Ubah"** | emoji di tab Stok: **0** |
| S6 | Seluruh label diterjemahkan (lihat daftar di bawah) | label Inggris tersisa: 0 (kecuali nama kategori data) |
| S7 | Sakelar memakai hijau status aplikasi `rgb(24,199,135)` tanpa glow | glow: **0** |
| S8 | Panel masuk: satu warna judul netral, kartu `--surface-raised`, tombol simpan **emas** | gradien hijau: **0** |
| S9 | Kolom Stok Tersedia & Stok Minimum rata kanan + `tabular-nums` | 2/2 kolom `align: right` |

### Daftar label yang dirapikan
- "Material Management & Stok" → **Stok & Material F&B**
- "↻ Refresh Data" → **Segarkan Data**; "Refresh" → **Segarkan**; "Refresh Mutasi Stok" → **Segarkan Mutasi**
- "Total SKU Material" → **Total Barang**; "Stok Safe / Normal" → **Stok Aman**; "Alert Stok Rendah" → **Stok Rendah**; "Stok Out / Minus" → **Stok Kosong / Minus**
- "SKU / Item Code" → **Kode SKU**; "Nama Material" → **Nama Barang**; "Stok Aktual" → **Stok Tersedia**; "Min. Stok" → **Stok Minimum**
- "Adjust / Restock" → **Sesuaikan Stok**; "Item Stok" → **Barang**; "Pilih item stok" → **Pilih barang**
- "Tambah Stok (Restock)" → **Tambah Stok (Barang Masuk)**; "Koreksi Stok Aktual" → **Koreksi Jumlah Stok**
- "Jenis Movement" → **Jenis Perubahan**; "Stock Opname" → **Cek Fisik**
- "+ Tambah Item F&B Baru" → **Tambah Barang Baru**
- Sub-tab: "📦 Sisa Stok di Rak" → **Sisa Stok di Rak**, dst. (tanpa emoji)
- "Stock Opname Outlet" → **Cek Fisik Stok (Opname)**; "+ Mulai Stock Opname" → **Mulai Cek Fisik**
- "Riwayat Opname" → **Riwayat Cek Fisik**; "Item Berbeda" → **Barang Berbeda**; "Total Beda Absolut" → **Total Selisih**
- "Submit ke Pemeriksa" → **Kirim ke Pemeriksa**; "Approve & Posting" → **Setujui & Terapkan**
- Status cek fisik: "Draft/Counting/Menunggu Approval/Posted" → **Draf / Sedang Dihitung / Menunggu Persetujuan / Sudah Diterapkan**
- "Catat Barang Masuk (Penerimaan dari Supplier)" → **Catat Barang Masuk**; judul seksi tanpa emoji
- Tombol hapus baris "✕" → **Hapus** (tombol teks, merah lembut)

## Bukti ukur (1366x768, kelima sub-tab)
- emoji: **0** di semua sub-tab (sebelumnya 16 elemen)
- glow: **0** (hanya cincin fokus emas pada tombol aktif — memang disengaja)
- gradien gelap palet kedua: **0** (yang tersisa hanya gradien emas pada tombol aksi, sesuai tema)
- tidak ada geser mendatar: 1366/1366 di semua sub-tab
- angka Stok Tersedia & Stok Minimum: `text-align: right` pada 2/2 baris uji
- **Regresi: 0 perbedaan** di tab Ruangan/F&B/Pengeluaran/LC/Laporan/Transaksi/Audit
  (diukur dengan skin aktif lalu dimatikan di tempat pada DOM & scroll yang sama)

## Cara membalik
1. Cepat: hapus baris `<link rel="stylesheet" href="css/skin-stok.css?v=1" />`
   di `index.html` → seluruh tampilan Stok kembali seperti semula.
   Perubahan label di `app.js` perlu `git revert`.
2. Penuh: `git revert <commit ini>`.

## Catatan jujur
- Token/session tidak bisa diakses headless, jadi pengukuran memakai sesi owner
  yang disuntik di sisi browser; perubahannya di akun gudang (role inventory)
  belum saya lihat langsung — struktur DOM-nya sama karena panel yang sama dipakai.
- Saringan "tulisan Inggris" masih menandai dua hal yang bukan masalah:
  "Cek Fisik (**Opname**)" (istilah yang Yasser pakai sendiri) dan nama kategori
  data seperti "Draft beer" (nama barang di database).

## Sisa usulan (belum dikerjakan)
- Ikon SVG asli bila Yasser ingin ikon, bukan teks.
- Nama kategori barang di database masih campur ("Anggur", "Beer", "American Whisky")
  — itu data master, butuh izin terpisah.