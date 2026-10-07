# Laporan — audit & desain ulang (2026-10-06)

Lingkup: tab **Laporan** beserta keempat sub-tabnya (Ikhtisar, Tutup Shift, F&B,
Room). Tidak ada perubahan data atau perhitungan; hanya tampilan
(`css/skin-laporan.css`) + label di `app.js`.

## Akar masalah (terukur dari audit DOM)

| # | Temuan | Bukti |
|---|--------|-------|
| R1 | Keempat sub-tab berupa **kartu besar 300×102 px** berisi paragraf penjelasan, dan **semua** judulnya berwarna emas → tab aktif hanya dibedakan garis tepi emas setipis tab lain | 4 judul emas, batas aktif tidak kontras |
| R2 | Sub-tab memakai gradien permukaan + `transform: translateY(-2px)` saat disorot — efek "kartu melayang" | 4 gradien + efek angkat |
| R3 | Panel Ikhtisar bergradien radial emas + linier gelap, dan **4 dari 6** kartu metrik bergradien; kartu "Total Penjualan" bergradien emas | **12 gradien** dalam satu sub-tab |
| R4 | Filter periode dibungkus kotak berbingkai bergradien → muncul **garis bingkai ganda** (kotak + tiap pil) | 1 gradien + bingkai ganda |
| R5 | Tombol periode/laporan memakai **hijau warisan** `rgba(92,213,155)` — warna yang tidak dipakai modul lain | 3 tombol hijau |
| R6 | Istilah Inggris: "Refresh Dashboard", "Refresh Laporan Room", "Paid Revenue", "Unpaid Revenue", "Revenue Room/F&B", "Total Session", "Room Occupied/Available", "Occupancy Rate", "Revenue per Jam", judul "Room Occupancy & Utilization", filter "Custom", "Status Order", judul "…Owner…" / "Dashboard Owner" / "Riwayat Closing", "Pilih Tanggal (Custom)" | 20+ label |
| R7 | Emoji 🔍 pada kartu yang bisa diklik | 1 |
| R8 | Nilai uang tidak memakai angka tabular → sulit dibandingkan cepat | 6+ kartu |

## Perbaikan

| # | Perubahan | Bukti ukur |
|---|-----------|-----------|
| R1 | Judul tab non-aktif jadi netral; tab aktif diberi **aksen emas 3px di tepi kiri** + latar emas 12% | aktif `border-left: 3px rgb(255,215,122)`; non-aktif `1px rgba(226,184,92,.22)` |
| R2 | Gradien permukaan & efek angkat dihapus dari sub-tab | `backgroundImage: none` di keempat tombol |
| R3 | Panel & kartu memakai permukaan polos; gradien kartu metrik dihapus. **Warna status dibawa label, bukan gradien kartu** | gradien: **12 → 0** di Ikhtisar |
| R4 | Filter periode jadi satu baris pil tanpa bingkai ganda | bingkai kotak dihapus, pil aktif emas 14% |
| R5 | Tombol laporan: netral dengan emas hanya untuk aksi utama | hijau warisan: **0** |
| R6 | Seluruh label diterjemahkan (daftar di bawah) | lihat daftar |
| R7 | Emoji 🔍 dihapus → "Lihat Rincian" | emoji: **0** di keempat sub-tab |
| R8 | Nilai uang & seluruh angka tabel memakai `tabular-nums` | terpasang |
| — | "Belum Tutup Shift" dibedakan sebagai **lencana pil**, bukan tombol (dulu nyaris sama dengan "Preview Cetak") | `min-height 30px`, pil |

### Label yang dirapikan
- "Refresh Dashboard" → **Segarkan Dashboard**; "Refresh Laporan Room" → **Segarkan Laporan Room**
- "Paid Revenue"/badge "Paid" → **Sudah Dibayar** / **Lunas**
- "Unpaid Revenue"/badge "Unpaid" → **Belum Dibayar** / **Belum Lunas**
- "Revenue Room" → **Penjualan Room**; "Revenue F&B" → **Penjualan F&B**; "Total Session" → **Total Sesi**
- "Room Occupied"/"Room Available" → **Room Terpakai** / **Room Kosong**
- Judul "Room Occupancy & Utilization" → **Pemakaian & Okupansi Room**
- "Occupancy Rate" → **Tingkat Okupansi**; "Revenue per Jam" → **Pendapatan per Jam**
- Judul kolom tabel Room: "Session/Durasi/Revenue/Utilization/Revenue/Jam" → **Sesi/Durasi/Pendapatan/Pemakaian/Pendapatan/Jam**
- Filter "Custom" → **Kustom** (2 tempat); "Pilih Tanggal (Custom)" → **Pilih Tanggal (Kustom)**; "Status Order:" → **Status Pesanan:**
- Judul "Ringkasan Keuangan Owner - …" → **Ringkasan Keuangan - …**; "Dashboard Owner - …" → **Ikhtisar Pemilik - …**; "Riwayat Closing - …" → **Riwayat Tutup Kasir - …**

(Yang sengaja dibiarkan: "Owner" sebagai nama sub-tab — itu sebutan peran yang
Yasser pakai; dan "F&B", "Room", "Terapkan Filter" yang sudah lazim.)

## Bukti ukur (1366×768, keempat sub-tab)
- emoji **0** · elemen terang **0** · tidak ada geser mendatar (1366/1366).
- gradien: Ikhtisar **12 → 0**; Room **6 → 0**; F&B 5 → 2 (dua-duanya **positif sah**: tombol cetak emas); Tutup Shift 4 → 0.
- Tab aktif terbukti: `border-left 3px rgb(255,215,122)`, latar emas 12%, `backgroundImage none`.
- **Regresi: 0 perbedaan** di tab Ruangan / F&B / Pengeluaran / Stok / LC / Transaksi / Audit.

## Cara membalik
1. Cepat: hapus baris `<link rel="stylesheet" href="css/skin-laporan.css?v=1" />`
   di `index.html` → tampilan Laporan lama kembali sepenuhnya.
   (Perubahan label di `app.js` perlu `git revert`.)
2. Penuh: `git revert <commit ini>`.

## Catatan jujur
- Sisa "kontras rendah" yang masih dilaporkan pengukur hanya muncul pada **tombol
  emas bergradien dengan teks gelap** — itu positif palsu, karena pengukur tidak
  membaca latar gradien. Sudah diperiksa lewat tangkapan layar.
- Panel Laporan belum punya kotak pencarian/sortir pada tabel F&B & Room; itu
  penambahan fungsi, jadi saya tahan dulu.
- Data pada shift ini masih kosong (semua Rp 0), jadi variasi warna status
  (mis. "Belum Dibayar" jadi oranye saat ada tagihan berjalan) belum bisa saya
  buktikan dengan angka nyata — tapi aturannya sudah ikut terpasang dan terukur
  di CSS.