# Cara menjaga kode TV bridge tetap sama di dua tempat

Kode bridge berada di dua tempat dengan tugas berbeda. Ini disengaja, bukan kelalaian.

| | folder kerja | salinan repo |
| --- | --- | --- |
| lokasi | `C:\karaoke-tv-bridge` | `middleware\tv-control-bridge` (repo ini) |
| tugas | yang DIJALANKAN (port 3030) | cermin kode, ikut ter-versi di GitHub |
| isi | kode + `.env`, `node_modules`, `logs\`, `data\`, `bukti-*`, `cadangan-*`, ngrok | kode saja |
| ada `.git`? | tidak | ikut repo ini |

Alasan pemisahan: folder kerja memuat `API_TOKEN` bersama dengan POS dan limbah runtime, sedangkan repo ini
publik. Pemisahan juga mencegah `git pull`/pindah branch menyentuh aplikasi yang sedang dipakai kasir.

## Alur setelah mengubah kode bridge

1. Ubah kode di `C:\karaoke-tv-bridge`, uji di sana (bridge dijalankan dari folder itu).
2. Periksa bedanya:
   `powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode periksa`
3. Samakan:
   `powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode sync`
4. `git add middleware/` lalu commit di repo ini, dan push.

## Aturan yang dijaga oleh skrip

- Perbandingan memakai sidik SHA256 setelah CRLF diseragamkan, jadi perbedaan line-ending tidak lagi membuat
  semua baris tampak berubah.
- Daftar berkas cermin ada di dalam skrip (`$Daftar`). Berkas kode baru harus ditambahkan ke daftar itu.
- Skrip menolak berjalan kalau daftar cermin memuat pola terlarang: `.env`, `*.log`, `node_modules`, `ngrok`,
  `local.properties`, `cadangan-*`, `bukti-*`, `data/jadwal*`, `logs/`.
- Hasil build APK (`tv-notify-overlay/build/`, `*.apk`) tidak dicerminkan, hanya kode sumbernya.

## Hal yang perlu diketahui saat menyentuh config/rooms.json

Alamat IP TV di `config/rooms.json` bergantung pada jaringan setempat, dan pernah berubah total saat provider
internet diganti (router baru -> sewa DHCP baru). Kalau itu terjadi lagi, jangan menambal satu-satu: periksa
daftar klien DHCP di router, lalu kunci alamat TV dengan reservasi DHCP ke MAC NIC kabel TV, di blok alamat di
luar kolam DHCP. Tanpa reservasi, file config akan terus bocor angkanya setiap kali router/pool berubah.