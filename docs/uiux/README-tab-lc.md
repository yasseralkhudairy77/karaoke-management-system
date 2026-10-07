# LC (Lady Companion) — audit & desain ulang (2026-10-06)

Lingkup: tab **LC** beserta keempat sub-tabnya (Master LC, Laporan Kerja & Gaji,
Kasbon & Petty Cash, Payroll LC). Tidak ada perubahan data atau alur kerja; hanya
tampilan (`css/skin-lc.css`) + perbaikan label & dua cacat di `app.js`.

## Akar masalah (semua terukur dari audit DOM)

| # | Temuan | Bukti |
|---|--------|-------|
| L1 | **Kotak isian & pilihan PUTIH.** Modul LC memakai ulang kelas milik editor durasi kamar: `.duration-payment-select` dan `.duration-custom-input` di `style.css` ditulis untuk latar terang (`background rgba(255,255,255,0.94)` + teks `#132238`) | **10 elemen** tembus pandang terang: 6 di Kasbon, 2 di Laporan, 2 di Payroll |
| L2 | Panel `.lc-panel.erp-card` memakai aturan warisan `!important`: latar gradien `#241c14 → #17110b`, bayangan `0 24px 70px`, kilau `0 0 1px` | 1 gradien + 1 kilau per sub-tab (5 di Kasbon) |
| L3 | Sub-tab LC: tab aktif diberi **latar emas penuh + teks gelap** → lebih keras daripada penanda tab aktif di modul lain yang sudah rapi | dibandingkan dengan Stok/Ruangan |
| L4 | Tombol aksi tabel kecil & bergaya lama: "Edit" 44×27 px, "Cetak Slip"; tombol "Ubah Tarif" memakai emoji **⚡** | ukur 44×27 px |
| L5 | `.erp-table` memakai kepala bergaris bawah **2px** dan **semua** tajuk berwarna emas — berat, tidak selaras tabel Stok | 6 tajuk emas |
| L6 | Paginasi memakai lambang "«" dan "»" tanpa keterangan | 2 tombol |

Dua **cacat kode** yang ikut ketemu (bukan sekadar selera):
| # | Temuan | Akibat |
|---|--------|--------|
| L7 | `var(--color-danger)` **tidak pernah didefinisikan** di tema mana pun, tapi dipakai tombol Hapus (tabel Master dan modal konfirmasi) | latar tombol Hapus jatuh ke transparan — tombol merusak tampak sama dengan tombol biasa |
| L8 | Kelas `.badge`, `.badge-success`, `.badge-danger` **tidak pernah didefinisikan**, padahal dipakai kolom Status & Ketersediaan | dua kolom penting hanya teks polos tanpa penanda warna |
| L9 | `<td>` kolom Aksi diberi `display: flex` | merusak tata letak kolom tabel |

## Perbaikan

| # | Perubahan | Bukti ukur |
|---|-----------|-----------|
| L1 | Kotak isian/pilihan dipaksa ke tema gelap (latar 4,5%, teks tema, tinggi ≥42px, fokus emas) | elemen terang (luminansi > 120): **0 di keempat sub-tab** (dari 10) |
| L2 | Panel & kartu memakai `--surface` / kaca tipis; gradien permukaan & kilau dihapus | gradien palet kedua: **0**; kilau: **0** |
| L3 | Sub-tab jadi satu baris pil, tab aktif = emas 14% + garis dalam (pola sama dengan Stok) | `bg rgba(255,215,122,0.14)`, `color rgb(255,215,122)` |
| L4 | Tombol baris tinggi **32px** (dari 27), emoji ⚡ dihapus; tombol Laporan & Payroll (Cetak Rekap/Slip) tanpa emoji | Edit/Hapus 69×32 px |
| L5 | Tajuk tabel netral + garis bawah 1px, selaras tabel Stok; baris hover emas tipis | 6/6 tajuk netral |
| L6 | Paginasi berlabel: **"Sebelumnya" / "Berikutnya"** + jumlah data | "Sebelumnya · Halaman 1 dari 7 (61 data) · Berikutnya" |
| L7 | Tombol Hapus memakai **merah status aplikasi** (perbaikan cacat, bukan sekadar gaya) | `bg rgba(255,61,104,0.14)`, teks `rgb(255,215,223)` |
| L8 | `.badge` didefinisikan pada lingkup LC → pil hijau/merah/kuning | Status `AKTIF` = `rgba(24,199,135,0.14)`, Ketersediaan `TERSEDIA` idem |
| L9 | `<td>` kembali `table-cell`, tombol dibungkus `<div class="lc-actions-group">` | `td Aksi display: table-cell` |
| — | Kolom **Tarif / Jam** rata kanan + angka tabular | `align: right` pada semua baris uji |

## Label yang dirapikan (Inggris → Indonesia)
- "Refresh" → **Segarkan**; "Status Keaktifan" → **Status**
- "Cash In Hari Ini" → **Kas Masuk Hari Ini**; "Cash Out Hari Ini" → **Kas Keluar Hari Ini**; opsi dropdown "Cash In"/"Cash Out" → **Kas Masuk**/**Kas Keluar**
- "Net Payout Payroll" → **Gaji Bersih Payroll**; "Bonus Sales" → **Bonus Penjualan**; "Gross Earning" → **Penghasilan Bruto**; "Total Sesi / Job" → **Total Sesi**; kolom/himpunan "Net Payout" → **Gaji Bersih**
- Emoji dihapus: ⚡ (Ubah Tarif), 🖨️ (Cetak Rekap / Cetak Slip)

("Kasbon & Petty Cash", "Payroll LC", "Master LC", "Terapkan Filter", "Bonus
Penjualan Terbesar" sengaja dipertahankan — istilah yang Yasser dan staf pakai
sehari-hari; mengubahnya justru membingungkan.)

## Bukti ukur (1366×900)
- Elemen terang: **0** di Master, Laporan, Kasbon, Payroll (sebelumnya 10 kotak putih).
- Regresi: **0 perbedaan** di tab Ruangan / F&B / Pengeluaran / Stok / Laporan /
  Transaksi / Audit (skin LC dimatikan di tempat pada DOM & scroll yang sama).
- Tidak ada geser mendatar (1366/1366) di keempat sub-tab.
- Sisa 1 laporan "kontras 1.01" per sub-tab = **positif palsu**: pengukur tidak
  membaca latar gradien tombol emas, padahal teksnya gelap `#1a130b` di atas emas.
  Sudah diperiksa lewat tangkapan layar.

## Cara membalik
1. Cepat: hapus baris `<link rel="stylesheet" href="css/skin-lc.css?v=1" />` di
   `index.html`. (Perubahan label & cacat L7–L9 di `app.js` perlu `git revert`.)
2. Penuh: `git revert <commit ini>`.

## Catatan jujur
- Panel LC belum punya kolom pencarian/filter/sortir, dan paginasi muncul hanya
  bila data lebih dari 10 baris. Itu **fitur yang belum ada**, bukan cacat
  tampilan — menambahkannya berarti menambah fungsi, jadi saya tahan dulu.
- ID LC di database tidak seragam (ada `LC-008`, ada `LC-1786989118241`) dan
  sebagian nama panggilan huruf kecil. Itu **data**, bukan tampilan — perlu izin
  terpisah untuk dirapikan.
- "Ubah Tarif Semua LC" adalah aksi massal; sudah diberi konfirmasi di kode
  (modal), belum ada penanda khusus di tampilan.