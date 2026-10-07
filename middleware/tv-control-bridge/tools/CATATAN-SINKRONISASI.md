# Cara menjaga kode TV bridge tetap sama di dua tempat

Kode bridge berada di dua tempat dengan tugas berbeda. Ini disengaja, bukan kelalaian.

| | salinan repo (yang DIJALANKAN sejak 2026-10-05) | folder lama |
| --- | --- | --- |
| lokasi | `C:\HappySong\happy-song-local\middleware\tv-control-bridge` | `C:\karaoke-tv-bridge` |
| tugas | yang dijalankan (port 3030) + cermin kode di GitHub | hanya runtime: `.env`, `node_modules`, `logs\`, `data\`, berkas `bukti-*` |
| isi | kode + `.env`, `node_modules`, `logs\`, `data\` (tidak ikut repo) | kode sudah READ-ONLY (tidak lagi dijalankan) |
| ada `.git`? | ikut repo POS | tidak |

Alasan pemisahan: repo ini memuat kode yang ikut ter-versi, sedangkan `.env` memuat `API_TOKEN` bersama POS dan
tidak boleh masuk repo. Sejak 2026-10-05 folder yang DIJALANKAN adalah salinan repo, supaya tidak ada lagi dua
salinan kode yang bisa saling menyimpang (penyebab serangan lama: bridge menjalankan kode lama tanpa disadari).

## Alur setelah mengubah kode bridge

1. Ubah kode di `middleware\tv-control-bridge` (BUKAN di `C:\karaoke-tv-bridge`; berkas kode di sana read-only).
2. Uji: `node --check src/...`, lalu uji terisolasi `ADB_BIN=<adb-palsu> node scripts-uji/uji-auto-power-off.js`.
3. `git add middleware/` lalu commit dan push di repo POS.
4. Restart bridge supaya kode baru benar-benar berjalan (lihat di bawah).

## Menyalakan / me-restart bridge

- Normal: `powershell -ExecutionPolicy Bypass -File "C:\HappySong\happy-song-local\NYALAKAN_SEMUA.ps1" -Bagian bridge`
  (skrip ini juga dipakai tugas terjadwal `HappySong-TV-Bridge`, dan hanya menyalakan kalau port 3030 belum dipakai).
- Me-restart (kode baru sudah diuji, siap dipakai): hentikan proses `node server.js` yang memegang port 3030,
  lalu jalankan perintah Normal di atas. Log menuju `logs\bridge-server.log` di repo POS.

## Aturan yang dijaga oleh skrip

- Perbandingan memakai sidik SHA256 setelah CRLF diseragamkan, jadi perbedaan line-ending tidak lagi membuat
  semua baris tampak berubah.
- Daftar berkas cermin ada di dalam skrip (`$Tabel`). Berkas kode baru harus ditambahkan ke daftar itu.
- Skrip menolak berjalan kalau daftar cermin memuat pola terlarang: `.env`, `*.log`, `node_modules`, `ngrok`,
  `local.properties`, `cadangan-*`, `bukti-*`, `data/jadwal*`, `logs/`.
- Hasil build APK (`tv-notify-overlay/build/`, `*.apk`) tidak dicerminkan, hanya kode sumbernya.
- Skrip sekarang dibuat HANYA-BACA: `-Mode sync` menolak menimpa dan hanya melaporkan beda, karena folder
  kerjanya sudah menjadi yang dijalankan. Kalau benar-benar perlu menyamakan berkas dari folder lama, pakai
  `-IzinkanTulis`.

## Hal yang perlu diketahui saat menyentuh config/rooms.json

Alamat IP TV di `config/rooms.json` bergantung pada jaringan setempat, dan pernah berubah total saat provider
internet diganti (router baru -> sewa DHCP baru). Kalau itu terjadi lagi, jangan menambal satu-satu: periksa
daftar klien DHCP di router, lalu kunci alamat TV dengan reservasi DHCP ke MAC NIC kabel TV, di blok alamat di
luar kolam DHCP. Tanpa reservasi, file config akan terus bocor angkanya setiap kali router/pool berubah.
