# Ruangan — Audit & arah desain baru (2026-10-06)

Lingkup: tab **Ruangan** saja. Tidak mengubah data, tidak mengubah `style.css`
(tetap menumpuk lewat `css/skin-fnb-layout.css`). Semua perubahan bisa dibalik.

## Hasil audit (sebelum)

Diukur langsung dari DOM pada layar kasir 1366x768 (9 ruangan, semuanya "Kosong"):

| # | Temuan | Angka |
|---|--------|-------|
| R1 | **Kontras gagal** di kartu berwarna: teks putih di atas gradien terang #35b779 | 2,10-2,56 : 1 (butuh 4,5) |
| R2 | Nama ruangan **terpotong**: "STANDAR 1"/"STANDAR 3" jadi "STAND…" | 101px ruang, butuh 119px |
| R3 | Badge TV tak terbaca: titik merah #ff6b6b di kartu hijau | 1,08 : 1 |
| R4 | Tidak ada ringkasan/filter okupansi | kasir harus menyapu 9 kartu |
| R5 | Ruang kosong besar; timer 48px dominan padahal tanpa sesi | kartu 279px, 3 blok |
| R6 | Hanya 8 dari 9 kartu terlihat penuh | 1 kartu terpotong |

## Perubahan (sesudah)

| # | Perubahan | Bukti ukur |
|---|-----------|------------|
| R1 | Gradien digelapkan; seluruh teks kartu ≥ 4,5:1 | **0 gagal**, rasio 5,88-16,31 (dulu 2,10-2,56 di sisi terang) |
| R1b | **"Kosong" jadi NETRAL** (abu gelap + garis aksen kiri hijau). Warna penuh disimpan untuk Terisi / Menunggu Bayar / Booking / Perbaikan | kartu kosong: rgb(28,32,29) → rgb(16,19,17) |
| R2 | Nama ruangan dapat barisnya sendiri; badge status turun | **0 nama terpotong** (9/9 terbaca penuh, termasuk EXECUTIVE) |
| R3 | Badge TV: pil berlatar gelap, teks jelas; di ruangan kosong titiknya netral abu (TV mati = wajar) | rasio 5,88 : 1 (dulu 1,08) |
| R4 | **Ringkasan okupansi yang bisa diklik** (sekaligus filter); angka nol dibuat redup | 3 chip 44px: Semua 9 / Terisi 0 / Kosong 9; klik "Kosong" → menyaring, klik lagi → kembali |
| R5 | Kartu dipadatkan; untuk ruangan kosong "Durasi sesi 00:00:00" tidak ditampilkan (tidak ada sesinya) | kartu **279px → 216px** |
| R6 | Grid lebih padat (minmax 210px) | **9 dari 9 kartu terlihat penuh**, tinggi halaman 1216 → 775 |

## Bukti tanpa-regresi
- Tab **F&B tidak berubah**: chip 3 kolom, kartu 212px, panah kategori masih ada,
  ringkasan ruangan tidak bocor ke sana (0).
- Kontras: 7/7 elemen di kartu ruangan lolos; `node --check js/app.js` lolos.
- 1280x720: 5 kartu penuh, sisanya digulir — sama seperti perilaku sebelum perubahan
  (bukan regresi, hanya layar lebih pendek).

## Cara membalik
1. Cepat: hapus `<link ... skin-fnb-layout.css?v=1>` di `index.html` → kartu ruangan
   kembali ke gaya lama (hijau terang), tetapi ringkasan okupansi tetap ada karena
   dibuat di `app.js`.
2. Penuh: `git revert <commit ini>`.
3. Cadangan sebelum semua pekerjaan UI: `backups/uiux-fnb-20261006-124823/`.

## Sisa usulan (belum dikerjakan, butuh keputusan)
- Grid 5+4 menyisakan satu slot kosong di kanan bawah. 3x3 akan lebih seimbang,
  tetapi kolom jadi lebih besar; sekarang kartu 238px.
- Nomor ruangan melompat (STANDAR 1, VIP 2, STANDAR 3 …) — nomor itu indeks global,
  bukan hitungan per tipe. Merapikan ini berarti mengubah data master ruangan.
- Badge "KOSONG" (hijau) vs chip ringkasan "Kosong" (netral) — dua gaya untuk status
  yang sama; bisa diseragamkan bila diinginkan.