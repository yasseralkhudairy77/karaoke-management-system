# Transaksi: kolom Aksi terpotong (hanya "Lihat" yang tampak) — perbaikan 8 Okt 2026

## Keluhan
Di menu Transaksi, kolom paling kanan (Aksi) terpotong: hanya tombol "Lihat" yang
terlihat; "Struk/Cetak", "Opsi", dropdown metode bayar, dan "Tandai Lunas" tidak tampak.
Bagian ID transaksi juga ikut terasa sempit.

## Sebab (terukur)
Baris transaksi adalah grid 10 kolom. Jumlah lebar minimum kolom + jarak menuntut
~1289px, sedangkan wadahnya hanya ~1240px (`.dashboard-shell` = `min(1320px, 100%)`
dikurangi padding). Ditambah `body { overflow-x: hidden }`, kolom terakhir (Aksi)
meluber ~49px ke luar dan terpotong dari kanan.

Bukti angka pada layar venue (1440x900, DPI 96):
- SEBELUM: baris `scrollWidth=1275` sedangkan wadah `clientWidth=1240` → MELUBER;
  grup Aksi `kiri=1173 kanan=1368` (di luar kartu 1240) → "Opsi" & "Tandai Lunas" terpotong.
- SESUDAH: baris `scrollWidth=1238 ≤ 1240` → MUAT; kelima kontrol tampak penuh.

## Perbaikan
Satu lapisan CSS baru: `css/skin-transaksi-layout.css`, dimuat lewat satu baris
`<link>` di `index.html` (paling akhir, setelah seluruh skin). Isinya:
1. Kolom teks dirapatkan ke lebar nyata tiap teks (kiri lebih sempit, ada ruang).
2. Kolom Aksi dilebarkan (min 178px) supaya Lihat + Struk + Opsi + dropdown + Tandai Lunas muat.
3. Paksaan `min-width: 1140px` pada baris (yang membuatnya menuntut 1289px) dibuang.
4. Jarak antar-kolom dirapatkan (6px) dan kolom Aksi dibuat `nowrap` (tidak membungkus).

Tidak ada label/istilah operasional yang diubah. Rollback: hapus baris `<link>` ke
`css/skin-transaksi-layout.css` di `index.html`.

## Hasil uji (Chrome headless, lebar baris = 1240px seperti di PC kasir)
| Lebar jendela | SEBELUM | SESUDAH |
|---|---|---|
| 1440 | 5/5 kontrol, tapi "Opsi" & "Tandai Lunas" terpotong | 5/5 penuh, tidak terpotong |
| 1366 | meluber (1275 vs 1240) | muat |
| 1280 | 3/5 tampak | 5/5 muat |
| 1184 | 0/5 tampak | 5/5 muat |

## Judul kolom (header)
Setiap sel sudah merender judul kolomnya sendiri ("ID TRANSAKSI", "RUANGAN", ... "AKSI"),
tetapi "METODE BAYAR" tadinya terbelah dua baris karena kolomnya terlalu sempit.
Pada lapisan ini kolom disetel mengikuti lebar nyata judul (terpanjang "Metode Bayar" ~98px)
dan `.transaction-label` dibuat `white-space: nowrap`, sehingga KESEPULUH judul tampil utuh
satu baris — termasuk "AKSI" yang sebelumnya tidak terlihat karena terpotong.

Sekaligus: badge "Termasuk F&B" tadinya terpotong di tengah kata ("TERMASU K") karena kolom
Total Akhir dirapatkan; kini dipatahkan hanya di spasi ("Termasuk" / "F&B").

Bukti harness (bisa dibuka di browser): `uji-baris-transaksi-layout.html` (sesudah)
dan `uji-baris-transaksi-layout-sebelum.html` (sebelum).
Tangkapan layar: `bukti/130-before-aksi-terpotong.png`, `bukti/131-after-aksi-terlihat.png`.

Catatan: perbaikan berlaku untuk lebar ≥ 1024px (PC kasir & tablet). Di bawah itu
tata letak sudah beralih ke mode bertumpuk (kartu) dari style.css.