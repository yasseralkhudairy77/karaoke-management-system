# Opsi A — Perapihan tata letak menu F&B (2026-10-06)

Perubahan ini **hanya tata letak**, tidak menyentuh logika/JS, tidak mengubah data,
tidak mengubah style.css. Semua efek berada di dalam satu berkas baru:
`css/skin-fnb-layout.css` yang dimuat setelah `css/style.css` dari `index.html`.

## Cara membalik (rollback)

1. Cara tercepat (tanpa git): buka `index.html`, hapus baris
   `<link rel="stylesheet" href="css/skin-fnb-layout.css?v=1" />`.
   Tampilan langsung kembali seperti semula pada muat ulang berikutnya.
2. Cara penuh: `git checkout <cabang-sebelumnya>` atau
   `git revert <commit ini>`.
3. Cadangan berkas asli (index.html, css/style.css, js/app.js) ada di
   `backups/uiux-fnb-20261006-124823/`.

## Yang diubah

| # | Sebelum | Sesudah | Bukti ukur (1366x768) |
|---|---------|---------|------------------------|
| 1 | Sub-tab F&B = 4 kartu besar | Bilah tab ringkas + garis aktif emas | 92px → 49px tinggi |
| 2 | Chip kategori 7 baris (24 chip) | Satu baris, geser mendatar | 320px → 44px tinggi |
| 3 | Chip & kotak cari ikut tergulir | Keduanya menempel di bawah header | tetap di 117px / 161px walau digulir 5.000px |
| 4 | Kartu 280–303px, tepi bawah bergerigi | Kartu 212px, semua sejajar | 90 kartu: tinggi halaman 9.870px → 7.386px |
| 5 | Badge "AKTIF" di setiap kartu | Hanya muncul saat *tidak* aktif | −36px per baris |
| 6 | Chip kategori & kotak cari tanpa rona fokus | Garis fokus 2px emas (WCAG) | terverifikasi lewat tombol Tab sungguhan |
| 7 | Baris bawah tertutup panel keranjang | Keranjang di atas daftar kartu | urutan tumpukan diverifikasi |

## Bukti tanpa-regresi

Diukur dengan skin AKTIF lalu dimatikan di halaman yang sama (DOM identik),
7 tampilan dibandingkan: **tab Ruangan, Laporan, Transaksi = 0 perbedaan**;
keempat sub-tab F&B hanya berubah tinggi halaman (bilah sub-tab lebih pendek),
geometri panel lain tidak berubah. Rincian: `regression3.json` (di folder kerja audit).

Uji interaksi (Chrome headless, kasir 1366x768):
- Klik "+ Tambah" pada kartu "Jack Daniels" → toast "Menu ditambahkan ke keranjang."
  dan Total Order F&B berubah Rp 0 → Rp 750.000.
- Kotak cari "bintang" → 3 kartu (Bintang, BEER HOLIC BINTANG, Bir Pitcher bintang).
- Chip kategori "Beer" → 2 kartu tampil, chip aktif berpindah.
- Cakupan uji: data diambil dari server lokal yang sedang berjalan (bukan mock).

## Catatan tinggi baris

Kartu **paket F&B** punya satu baris keterangan isi paket, sehingga tingginya
239px vs 212px kartu biasa — dan baris yang memuatnya ikut lebih tinggi.
Semua kartu di dalam satu baris tetap sama tinggi, tidak ada yang terpotong.
Kalau ingin benar-benar rata 212px, baris isi paket perlu dipotong menjadi satu
baris berelipsis (butuh keputusan: informasi paket jadi tidak utuh).

## Langkah 2 (dikerjakan pada 2026-10-06) — emoji dihapus, bahasa diseragamkan

Berbeda dari langkah 1, langkah ini menyentuh `js/app.js` (teks label + markup chip
kategori + sub-tab) dan `css/skin-fnb-layout.css` (penanda status).

| # | Sebelum | Sesudah |
|---|---------|---------|
| 8 | 27 emoji sebagai ikon di panel F&B (🛒 📜 📊 📋 ⭐ 🍔 🍺 🚬 …) + 🖨️/🧾 di tombol laporan | 0 emoji. Chip kategori jadi teks + hitungan; sub-tab jadi teks; tombol laporan jadi teks. Nama kategori tetap punya `aria-label` ("Beer (14 item)") supaya pembaca layar tidak kehilangan info |
| 9 | Label campur: Open, Billed, Refresh Order F&B, Open Order F&B, Total F&B Open, Open Bill, Postpaid | Indonesia: Belum Dibayar, Sudah Ditagih, Muat Ulang Antrean, Antrean Pesanan F&B, Total Nilai F&B, Tagihan Berjalan, Bayar Nanti |
| 10 | Badge status tanpa penanda visual | Titik warna 6px (hijau/kuning/merah) di badge — hanya di panel F&B |
| 11 | Watermark logo tembus di belakang label sub-tab (terlihat sebagai bercak) | Bilah sub-tab diberi latar tipis |

Bukti ukur (Chrome headless, 1366x768, data dari server lokal):

- Sisa emoji di keempat sub-tab F&B: **0** (sebelum: 27 di tab Pesan Menu).
- Sisa label Inggris di panel F&B: **0**.
- Titik status muncul pada 10 badge di Riwayat F&B dan 10 di Laporan Penjualan;
  badge "Aktif" di kartu menu tetap disembunyikan (sengaja).
- Tab lain tidak berubah: dengan skin aktif maupun tidak, jumlah titik baru di
  Ruangan, Transaksi, Stok, Laporan = 0/0 (dibatasi ke panel F&B).
- Interaksi setelah perubahan markup: chip "Beer" → 14 kartu beer, `aria-label`
  "Beer (14 item)"; klik "+ Tambah" → Total Order F&B Rp 0 → Rp 750.000.
- `node --check js/app.js` lolos (sintaks).

## Langkah 3 (2026-10-06) — deretan kategori bisa digeser (keluhan Yasser)

Keluhan: di panel "Cari cepat, pilih kategori..." deretan kategori seperti berhenti
di "Anggur" — tidak ada tanda apa pun bahwa masih ada 17 kategori di sebelah kanan
(24 chip total, lebar 3.070px vs ruang 765px → 2.330px tersembunyi).

| # | Sebelum | Sesudah |
|---|---------|---------|
| 12 | Deretan chip bisa digeser tapi tanpa petunjuk & tanpa cara menggeser dengan mouse | Tombol panah bulat ‹ › di kiri/kanan deretan; otomatis tampil hanya bila ada isi tersembunyi, dan meredup saat sudah di ujung. Roda mouse juga menggeser (tanpa perlu Shift) |

Bukti ukur (Chrome headless, 1366x768):
- Awal: panah kiri meredup, panah kanan menyala; geser maksimum 2.330px.
- Klik panah kanan → bergeser 473px; klik sampai ujung → 2.330px, panah kanan meredup.
- Klik panah kiri → mundur ke 1.883px; roda mouse (deltaY 300) → 1.883 → 2.163px.
- Chip terakhir ("rokok") tercapai, bisa diklik, filter jalan (2 kartu tampil).

Catatan: pada tampilan ujung, terlihat chip duplikat apa adanya dari data master —
"ci", "minuman" vs "Minuman", "roko"/"rokok"/"Rokok". Ini bukti tambahan bahwa
pembersihan data kategori memang perlu (butuh izin karena mengubah data master).

## Langkah 5 (2026-10-06) — temuan Yasser pada kartu status terisi

Keluhan: pada kartu "Menunggu Mulai" tombol Batal terpotong (ikon X tidak
proporsional); kartu terisi terlalu ramping sehingga badge "Tagihan Berjalan"
(ungu) terpotong separuh; tombol "Tambah Waktu", "Ubah Paket", "Pindah Room" ikut
terpotong.

Penyebab yang terukur (halaman uji markup identik, tanpa menyentuh data):

- Grid aksi 2 kolom pada kartu selebar 238px hanya memberi **102px** per tombol,
  padahal label butuh sampai **120px** ("Tambah Waktu" 120px, "Pindah Room" 116px,
  "Ubah Paket" 109px). Ikon emoji di dalam tombol memakan ~20px lagi.
- `.room-card { overflow: hidden }` membuat semua yang meluber terlihat
  "kepotong separuh" — termasuk baris label+nilai yang memakai `white-space: nowrap`
  (terukur scrollWidth 237 > clientWidth 212 di dashboard asli).
- Kartu "Menunggu Mulai"/"Booking" juga memakai grid 2 kolom, sehingga tombol
  kedua (Batal / Batalkan Booking) keluar dari kartu.

Perbaikan:

| # | Perubahan | Bukti |
|---|-----------|-------|
| P1 | Kartu tidak lagi memotong isinya (`overflow: visible`) | — |
| P2 | Tombol aksi: ikon dilepas, label boleh 2 baris, min 44px, `min-width: 0` | tombol punya 227px (dulu 102px) |
| P3 | Kartu Menunggu Mulai/Booking/Cleaning/Menunggu Bayar: aksi 1 kolom penuh | "Batal" & "Batalkan Booking" masuk kartu |
| P4 | Badge sub-baris tidak dipenggal (elipsis bila perlu) | "Tagihan Berjalan" terbaca penuh |
| P5 | Rincian F&B / panel estimasi `min-width: 0` | tidak lagi memaksa kartu melebar |
| P6 | Baris label+nilai boleh membungkus (bukan meluber) | elemen meluber: **0** (dulu 5 di kartu asli) |
| P7 | Kartu TERISI diberi **2 kolom** grid (isi jauh lebih banyak) | tinggi 775→700px, lebar 238→489px, kepala kembali 1 baris |

Bukti ukur akhir (1366x768):
- Halaman uji, 8 status kartu: **0 masalah terpotong** (dulu 4 label terpotong
  mendatar di kartu terisi + 1 tombol keluar kartu di kartu Menunggu Mulai).
- Dashboard asli dengan 1 kamar terisi: **0 elemen terpotong/meluber**
  (dulu 5 di kartu terisi).
- Kartu kosong tetap 238x216 dan seluruh 9 kartu terlihat.

Catatan jujur: kartu terisi tetap **700px** (lebih tinggi dari layar 768px dikurangi
header), jadi untuk kamar yang sedang terisi kasir tetap perlu menggulir sedikit
untuk melihat tombol "Pindah Room"/"Free Gift". Ini konsekuensi dari banyaknya
isi (rincian sesi + hitung mundur + estimasi tagihan + 8 tombol); memendekkannya
lagi berarti menyembunyikan informasi. Kalau Yasser mau, langkah lanjutnya adalah
memindahkan tombol sekunder (Koreksi Jam / Free Gift / Ubah Paket / Pindah Room)
ke satu menu "⋮ Aksi lain" sehingga kartu terisi bisa turun ke ~450px.

## Yang BELUM dikerjakan (butuh keputusan)

- Merapikan data kategori (gabungan "roko/rokok/Rokok", "ci") — menyentuh data master,
  bukan tampilan.
- Emoji di modul lain yang belum jadi lingkup langkah 2 (Pengeluaran, Stok, LC, Analisa,
  tombol cetak di beberapa tempat) — masih terhitung ~200 kemunculan di `app.js`;
  pola penggantiannya sudah terbukti berhasil, tinggal diterapkan per modul.
- Merapikan sisa istilah Inggris di modul lain (mis. label "Paid"/"Unpaid" di kartu
  ringkasan Laporan).

Dicatat juga: percobaan membuat daftar menu bergulir di dalam panel bertinggi tetap
**dibatalkan** karena hasil ukur menunjukkan baris grid menyusut (kartu jadi 22px);
kodenya tidak dipakai dan alasannya ditulis di komentar berkas CSS.