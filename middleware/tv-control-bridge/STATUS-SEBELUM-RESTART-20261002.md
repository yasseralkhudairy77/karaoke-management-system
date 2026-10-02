# STATUS SEBELUM RESTART PC — 2026-10-02 (jam venue)

Catatan ini dibuat tepat sebelum PC karaoke di-restart, supaya pekerjaan hari ini bisa langsung
diverifikasi sesudahnya tanpa menebak-nebak.

## PENTING: apa yang otomatis hidup lagi setelah restart, dan apa yang TIDAK

Diperiksa langsung sebelum restart (folder Startup, scheduled task, service Windows):

    PostgreSQL            : service Windows "postgresql-x64-18" -> Automatic  -> HIDUP SENDIRI
    TV bridge (port 3030) : folder Startup "start-tv-bridge.cmd"              -> HIDUP SENDIRI
                            (skrip itu sendiri menolak jalan kalau 3030 sudah dipakai)
    Server POS (port 3000): TIDAK ADA di folder Startup, TIDAK ada scheduled task,
                            TIDAK ada service Windows                            -> MATI setelah restart

Artinya sesudah restart halaman kasir tidak bisa dibuka dan seluruh perlindungan TV (jadwal
peringatan + tidurkan otomatis) berhenti tanpa pesan galat apa pun. Ini persis lubang yang
tercatat di skill: "dengan server POS mati, tidak ada sesi yang memasang jadwal, dan tidak ada
yang melaporkan masalah - TV hanya tetap menyala".

Cara menyalakannya kembali (dari folder server):

    cd C:\HappySong\happy-song-local\server
    npm start          -> port 3000 (dari server/.env)

Usulan perbaikan (BELUM dikerjakan, menunggu keputusan pemilik): tambahkan POS ke autostart
seperti bridge, supaya restart PC tidak lagi mematikan kasir.

## Keadaan yang sudah benar & terverifikasi hari ini

    POS       : port 3000, /health menjawab
    Bridge    : port 3030, /health menjawab
    Lampu TV  : hijau = VIP 2, VIP 4, VIP 5, VIP 7 | merah = STANDAR 1, STANDAR 3, VIP 6, VIP 8,
                EXECUTIVE (merah itu benar: TV-nya belum dinyalakan; Executive memang di jaringan lain)
    Pemicu sesi              : terbukti (jalur dingin 237 ms, jalur panas 79 ms)
    Penyembuh otomatis       : terbukti (3 TV masuk hijau sendiri tanpa tombol)
    End-to-end dari kasir    : terbukti di VIP-5 (T-15, T-5, WAKTU HABIS, TV tidur sendiri)
    Panel Kontrol TV         : memakai status hidup, bukan catatan uji kemarin
    Perintah TV              : hanya lewat server POS (jalur browser dimatikan, token tidak lagi di halaman)
    Data uji VIP-5           : sudah dihapus bersih (transaksi, sesi, segmen, 2 antrean cloud)
    Sesi menggantung Agustus : 13 sesi ditutup rapi (tidak dihapus, transaksi tidak disentuh)
    sync_outbox 3.015 baris  : dipensiunkan rapi (synced + trigger blokir penulisan baru)

## Checklist verifikasi sesudah restart (jalankan berurutan)

    1. netstat -ano | grep LISTENING | grep -E ":(3000|3030) "
       -> 3030 harus ada (bridge autostart). 3000 kemungkinan BESAR TIDAK ADA -> nyalakan manual.
    2. curl http://127.0.0.1:3030/health   -> service tv-control-bridge
       curl http://127.0.0.1:3000/health   -> status online
    3. curl http://127.0.0.1:3000/api/rooms  -> tv_state per ruangan (perhatikan VE/VP yang menyala)
    4. /c/platform-tools/adb.exe devices -l  -> TV yang menyala harus state "device"
       (penyembuh otomatis bridge berjalan ~3 detik setelah bridge hidup, lalu tiap 15 detik)
    5. C:\Users\<user>\.android harus UTUH (folder itu menyimpan izin ADB TV; kalau hilang,
       SEMUA TV akan bertanya izin ulang)
    6. Kasir: muat ulang halaman sekali (Ctrl+Shift+R) karena versi aset berubah ke tv-lampu-minimal-v4

## Cadangan/berkas bukti (di samping catatan ini)

    BUKTI-TV9-20261002.md                       bukti jaringan TV Executive
    bukti-hapus-transaksi-uji-20261002.json     cadangan transaksi uji VIP-5
    bukti-tutup-rapi-sesi-20261002.json         cadangan 13 sesi Agustus (sebelum/sesudah)
    bukti-pensiun-outbox-20261002.json          cadangan 3.015 baris outbox + cara membatalkan
    scripts-uji/cdp-tv-indicator-check.js       uji lampu kartu
    scripts-uji/cdp-tv-panel-check.js           uji panel Kontrol TV
    scripts-uji/cdp-tv-browserpath-check.js     uji jalur browser sudah mati

## Repo

    C:\HappySong\happy-song-local  branch feat/tv-bridge-schedule-integration, ter-push sampai
    1f75376 (indikator lampu + TV, hijau neon). Mirror middleware/ sudah sinkron.

## Sesi percakapan ini (untuk dibuka kembali setelah restart)

    @session:default/20261002_082346_541f95

Judul: "Cek TV 9 di tv bridge". Isi lengkap keputusan dan bukti hari ini ada di sesi itu; catatan
kunci juga sudah ditulis ke berkas-berkas di folder bridge dan ke repo POS.

Setelah restart, pekerjaan hari ini bisa diverifikasi ulang tanpa membuka sesi: ikuti checklist di
bagian atas catatan ini.
