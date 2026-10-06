# Pengeluaran — audit & desain ulang (2026-10-06)

Lingkup: tab **Pengeluaran** saja. Tidak mengubah data, tidak mengubah logika
pencatatan; CSS baru ditumpuk setelah `style.css`, plus perapihan teks di `app.js`.

## Akar masalah "norak" (terukur)

| # | Temuan | Angka |
|---|--------|-------|
| E1 | Modul ini memakai **palet kedua** yang tidak dipakai modul lain: `--surface-2`, `#9e988f`, `#ff6b6b`, `#a0a0a0` | 4+ warna di luar tema venue |
| E2 | Hijau terang `#2ecc71` + **glow** `0 0 6px` pada titik "Sumber Dana" | efek menyala di dashboard |
| E3 | **8 emoji** dipakai sebagai ikon (💸 🧾 🚫 📝 📜 💾 🔄 🖨️ ❌); emoji keadaan kosong 3rem | ikon tidak konsisten antar-Windows |
| E4 | Nilai uang ditulis **merah** `#ff6b6b` walau isinya "Rp 0" | terbaca seperti peringatan |
| E5 | Semua label form emas + semua input bergaris emas | hierarki hilang |
| E6 | Baris dibatalkan: coretan di **semua** kolom | tabel sulit dibaca |
| E7 | Judul kolom "Nominal" tidak rata kanan; tombol aksi berupa ikon 🖨️/❌ | sulit dipindai |

## Perbaikan

| # | Perubahan | Bukti |
|---|-----------|-------|
| E1 | Seluruh warna modul dialihkan ke token tema (`--surface`, `--border`, `--text`, `--muted`, `--gold-*`) | warna di luar palet: **0** (dulu 4+) |
| E2 | Glow dihapus; titik "Sumber Dana" jadi penanda tenang | glow: **0** |
| E3 | Semua emoji ikon dibuang: kartu ringkasan tanpa ikon; judul tanpa emoji; tombol aksi jadi teks **Cetak** / **Batalkan** | emoji: **0** |
| E4 | Nilai uang netral + `font-variant-numeric: tabular-nums` | angka tidak lagi merah |
| E5 | Label form netral (`--muted`), input satu gaya, fokus ikut `--focus-ring` aplikasi | semua label satu warna |
| E6 | Baris batal diredupkan (opacity .5); coretan hanya di nominal | terbaca tanpa mengganggu |
| E7 | Judul "Nominal" rata kanan, "Aksi" rata tengah (piksel: semua nominal berakhir di x=886); tombol **Batalkan** dibedakan merah redup dari **Cetak** netral | dibuktikan lewat ukur piksel |

Selain itu: tinggi input ≥44px (44/44/46/72), tombol simpan 48px, "Segarkan" 38px —
memenuhi pedoman target sentuh; kartu ringkasan 403x80 px dengan label di atas
nilai (pola dashboard, bukan kartu ikon).

## Bukti ukur (1366x768)
- Dashboard asli: emoji 0, warna di luar palet 0, glow 0, tidak ada geser mendatar (1366/1366).
- Tabel (halaman uji dengan markup identik dari `app.js`): emoji 0, palet asing 0,
  lebar tabel 1198 px, perataan kolom Nominal=kanan / Aksi=tengah, badge status
  memakai palet status aplikasi (hijau `rgba(24,199,135,.14)`, merah `rgba(255,61,104,.12)`).
- Catatan: angka contoh di halaman uji saya buat sendiri (bukan data venue) — jadi
  ketidakcocokan "3 transaksi vs 2 baris aktif" di situ memang salah tulis di
  contoh, bukan dari aplikasi. Tabel asli saat ini kosong (0 pengeluaran hari ini).

## Cara membalik
1. Cepat: hapus baris `<link rel="stylesheet" href="css/skin-pengeluaran.css?v=1" />`
   di `index.html` → tampilan lama (emoji + palet kedua) kembali sepenuhnya.
   Perapihan teks di `app.js` (emoji pada judul/tombol) perlu `git revert`.
2. Penuh: `git revert <commit ini>`.

## Sisa usulan (belum dikerjakan)
- Ikon SVG asli untuk tombol Cetak/Batalkan bila Yasser ingin ikon (sekarang teks).
- Tinggi baris tabel bisa dirapatkan sedikit bila daftar pengeluaran sudah panjang.