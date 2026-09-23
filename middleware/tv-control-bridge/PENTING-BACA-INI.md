# CATATAN: ini CERMIN kode, bukan tempat kerja

Folder ini adalah salinan kode bridge yang ikut masuk repo ini agar ikut ter-versi dan ter-backup.

  Folder yang DIJALANKAN (memuat .env, node_modules, logs, data):
      C:\karaoke-tv-bridge

  Setelah mengubah kode di folder kerja di atas, jalankan dari folder ini:

      powershell -ExecutionPolicy Bypass -File tools/tvbridge-sync.ps1 -Mode periksa
      powershell -ExecutionPolicy Bypass -File tools/tvbridge-sync.ps1 -Mode sync

  lalu commit di repo ini (git add middleware/ && git commit).

Kenapa dipisah: folder kerja berisi rahasia (API_TOKEN bersama POS) dan limbah
runtime, dan repo ini publik. Lebih rinci lihat `tools/CATATAN-SINKRONISASI.md`.
