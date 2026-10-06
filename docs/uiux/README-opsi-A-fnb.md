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

## Yang BELUM dikerjakan (Opsi A tahap berikutnya, butuh keputusan)

- Merapikan data kategori (gabungan "roko/rokok/Rokok", "ci") — menyentuh data master,
  bukan tampilan.
- Mengganti emoji sebagai ikon dengan SVG (Lucide/Heroicons).
- Merapikan bahasa campur ("Open Order F&B", "Total Order", "Billed").

Dicatat juga: percobaan membuat daftar menu bergulir di dalam panel bertinggi tetap
**dibatalkan** karena hasil ukur menunjukkan baris grid menyusut (kartu jadi 22px);
kodenya tidak dipakai dan alasannya ditulis di komentar berkas CSS.