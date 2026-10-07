# Gabung perbaikan "UI Transaksi" dari GitHub ke cabang kerja UIUX

Tanggal: 8 Okt 2026
Cabang: `uiux/fnb-layout-a`

## Masalah
- Semua kerja UIUX (F&B, Ruangan, Pengeluaran, Stok, LC, Laporan, Transaksi) hanya ada di PC kasir,
  BELUM pernah di-push ke GitHub.
- Commit `969caaf` di `main` ("UI Transaksi: harmonisasi proporsi tombol aksi...") belum ada di PC kasir,
  dan ditulis di atas basis lama `d01fc7e` (basis yang belum punya 6 lapis skin CSS).
- Akibatnya tombol "UPDATE-APP" di desktop gagal: `git pull --ff-only` error karena cabang
  `uiux/fnb-layout-a` tidak punya upstream, lalu skrip berhenti (npm/db/restart tidak jalan).

## Yang dikerjakan
1. Push pengaman `uiux/fnb-layout-a` ke GitHub (16 commit + upstream).
2. `git cherry-pick 969caaf` ke cabang kerja.
3. Penyelesaian konflik `index.html`: pertahankan KEENAM baris `<link>` skin, dan pakai cache buster
   baru `?v=trx-ui-polish` untuk `css/style.css` dan `js/app.js`.
   (`css/style.css` sendiri tergabung otomatis.)
4. Perbaiki akar UPDATE-APP di `scripts/windows/update-pc-server.ps1`:
   deteksi cabang + upstream, `git pull --ff-only` yang gagal dilaporkan terang-terangan.

## Bukti (1366x768, lebar baris nyata 1240px = `--content-max: 1320px`)
Uji: `uji-baris-transaksi.html` (sesudah) dan `uji-baris-transaksi-sebelum.html` (sebelum),
`?v=trx-ui-polish` + `skin-transaksi.css`.

| Item | Sebelum | Sesudah |
|------|---------|---------|
| Badge "BELUM DIBAYAR" | kotak 85px, butuh 93px -> TERPOTONG ("ELUM DIBAYA") | kotak 118px, butuh 118px -> UTUH |
| Tombol Lihat/Struk/Cetak/Opsi | 32px | 32px |
| Dropdown Cash / Tandai Lunas | 32px | 32px |

Tangkapan layar: `bukti/120-before-transaksi.png` dan `bukti/121-after-transaksi.png`.

Catatan: pada layar yang lebih lebar dari ~1300px, badge yang terpotong bisa "kebetulan muat" karena
kolom melebar. Perbaikan 969caaf melebarkan kolom Status (min 120px) sehingga utuh di semua lebar.

## Cara membatalkan
Hapus baris `<link>` skin yang bersangkutan di `index.html` (sesuai konvensi skin).
`git revert` commit gabungan ini untuk membalik seluruh langkah.