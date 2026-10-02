# ARSITEKTUR: satu paket saat sistem dinyalakan — 2026-10-02

Masalah yang diselesaikan: dulu bridge dijalankan dari folder Startup, dan berkasnya membawa
tanda "berasal dari internet". Windows menanyakan **Open File - Security Warning** ("Run / Cancel")
setiap kali PC dinyalakan. Kalau operator tidak menekan Run, TV bridge tidak jalan sama sekali —
dan tidak ada satu pun pesan galat yang memberi tahu.

Bukti lama (jam venue 2026-10-02): PC login 11:14:41, bridge baru hidup 11:20:04, karena ada yang
menekan Run. Percobaan kedua 11:21:50 langsung keluar ("Bridge already listening").

## Bentuk sekarang: satu titik masuk

    NYALAKAN_SEMUA.ps1                     <- SATU skrip, punya tiga mode
      -Bagian semua   (operator)           <- nyalakan yang belum jalan, tunggu sehat, buka kasir
      -Bagian pos     (Tugas Terjadwal)    <- server kasir (npm start) + Postgres
      -Bagian bridge  (Tugas Terjadwal)    <- tv bridge (node server.js)

    NYALAKAN_SEMUA.bat                     <- pembungkus untuk operator (klik dua kali)
    Pintasan Desktop "Happy Song - Nyalakan Sistem" -> menunjuk ke .bat itu
    PASANG-TASK-ADMIN.cmd                  <- klik dua kali SEKALI; memasang Tugas Terjadwal
    PASANG-TASK-AUTOSTART.ps1              <- isi pemasangnya (butuh Administrator)

Sifat yang penting:

    Aman dijalankan berkali-kali   : layanan yang port-nya sudah dipakai TIDAK dinyalakan dua kali
                                     (dua instance POS/bridge justru saling berebut port).
    Ketiga mode memakai skrip yang sama, jadi tidak ada dua salinan logika yang bisa saling
    menyimpang — inilah "satu paket" yang diminta.
    Semua kejadian ditulis ke logs\nyalakan-semua.log, POS ke logs\pos-server.log,
    bridge ke logs\bridge-server.log.

## Pemicu saat sistem dinyalakan (dua lapis)

1. Tugas Terjadwal Windows (utama, tidak bisa dilewati):
     HappySong-POS-Server  : saat login, jalankan -Bagian pos
     HappySong-TV-Bridge   : saat login +10 detik, jalankan -Bagian bridge
   Keduanya dijalankan TANPA hak admin (LogonType Interactive, RunLevel Limited):
   tidak butuh sandi, dan tidak bisa mengubah hal di luar folder kerjanya.
   Setelan "RestartCount 3 / RestartInterval 1 menit": kalau layanan mati, Windows
   menyalakannya lagi sendiri. Ini yang tidak mungkin dilakukan folder Startup.

2. Pintasan Desktop (cadangan manusia): dipakai hanya kalau kedua layanan mati di tengah
   jam kerja. Operator menekan satu pintasan, sisanya otomatis.

Pemicu lama di registry (HKCU Run, nama "HappySong-Sistem") dipakai sebagai jembatan
sebelum Tugas Terjadwal ada, dan akan dihapus otomatis oleh PASANG-TASK-AUTOSTART.ps1.
Selama masih ada, ia tidak berbahaya: skrip menolak menyalakan salinan kedua.

## Berkas Startup lama

    start-tv-bridge.cmd dikeluarkan dari folder Startup dan disimpan di
    C:\HappySong\happy-song-local\cadangan-autostart-lama\start-tv-bridge.cmd.bak-20261002
    (tidak dihapus, supaya bisa dikembalikan kalau perlu).

Tanda internet (MOTW) sudah dicabut dari dua berkas yang membawanya:
    Startup\start-tv-bridge.cmd          <- sekarang di folder cadangan
    C:\karaoke-tv-bridge\start-tv-bridge.ps1
Efeknya: dialog "Open File - Security Warning" tidak muncul lagi.

## Postgres

Service Windows "postgresql-x64-18", StartType Automatic: hidup sendiri saat PC menyala.
Skrip tetap memeriksanya, dan menyalakannya kalau ternyata belum jalan.

## Yang sudah terbukti hari ini (2026-10-02)

    Uji 1: jalankan dari kondisi kedua port MATI, 2 berkas/3 mode
           -> POS sehat + bridge sehat dalam 7-14 detik (log 11:36:03, 11:38:11, 11:39:00)
    Uji 2: perintah PERSIS seperti yang tersimpan untuk autostart (tanpa jendela)
           -> kedua layanan hidup, halaman kasir terbuka sendiri
    Uji 3: dijalankan saat layanan sudah hidup
           -> "POS: sudah jalan", "Bridge: sudah jalan" (tidak ada salinan kedua)
    Uji 4: jumlah instance setelah semua uji = 1 POS + 1 bridge
    Uji 5: TV tersambung SENDIRI tanpa tombol -> VIP-2, VIP-4, VIP-5, VIP-7 "siap"

Jebakan nyata yang ditemukan saat menguji (jangan diulang):

    Dua proses yang menulis ke SATU berkas log lewat PowerShell akan saling mengunci
    ("because it is being used by another process"), dan kegagalan itu MEMATIKAN proses
    yang sedang dijalankan. Karena itu setiap layanan sekarang menulis ke berkasnya
    sendiri lewat redirection ">>" dari cmd, dan fungsi Tulis() tidak pernah
    menggagalkan skrip (kalau berkas log terkunci, tulisannya cukup muncul di layar).
    Juga: npm dipanggil lewat alamat lengkap "C:\Program Files\nodejs\npm.cmd" karena PATH
    di dalam Tugas Terjadwal bisa lebih sempit daripada PATH shell biasa.

## Yang BELUM terbukti

    Restart PC sungguhan tanpa menyentuh apa pun. Uji ini menunggu jam sepi dan
    persetujuan pemilik, karena memutus TV yang sedang dipakai adalah keputusan pemilik,
    bukan keputusan teknis.

    Tugas Terjadwal belum terpasang: akun Windows ini bernama "hp thin client T640",
    dan menjalankan schtasks ditolak ("Access is denied") karena token sesi ini tidak
    dinaikkan ke Administrator — akunnya sendiri sudah anggota grup Administrators.
    Pemasangan menunggu satu klik izin dari pemilik: PASANG-TASK-ADMIN.cmd.

## Masalah lain yang ditemukan bersamaan (belum dikerjakan)

    Alamat 192.168.1.14 (VIP-8) dipegang perangkat lain (MAC 0a:ec:5d:4a:47:d5),
    bukan MAC TV VIP-8 (74:81:9a:ff:75:56). Kalau TV VIP-8 dinyalakan saat alamat itu
    terpakai, TV-nya hilang dari jaringan dan di dashboard tampak seperti TV rusak.
    Penyebab paling mungkin: DHCP membagikan alamat yang seharusnya untuk TV.