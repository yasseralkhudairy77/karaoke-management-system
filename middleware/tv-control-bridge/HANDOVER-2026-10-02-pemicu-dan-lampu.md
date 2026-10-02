# Pemicu sesi + lampu status TV — terpasang & terbukti (2026-10-02)

Commit POS: b0edaaf (branch feat/tv-bridge-schedule-integration, sudah di-push ke remote).

## Masalah yang dikerjakan

Setiap TV dinyalakan dari SAKLAR LISTRIK (SOP venue), lalu tidak otomatis tersambung: staf harus
masuk ke pengaturan TV dan menekan "Uji ADB / Minta izin ADB" dulu sebelum status menjadi normal.

## Yang TERBUKTI di TV sungguhan hari ini

1. VIP-7, baru dinyalakan dari saklar, BELUM disentuh siapa pun:
   `adb_enabled=1`, `development_settings_enabled=1`, `service.adb.tcp.port=5555`,
   port 5555 TERBUKA. `persist.adb.tcp.port` kosong.
   -> Setelan ADB BERTAHAN melewati pemutusan listrik. Catatan lama "setelan hilang setiap listrik
      diputus" tidak berlaku untuk TV ini. Yang kurang selama ini bukan setelan TV, melainkan tidak
      ada yang memanggil `adb connect`.
2. Pemicu sesi (power_on) dari jalur DINGIN (VIP-7 sudah diputus dari server ADB lebih dulu):
   selesai `ready: true`, `stage: connect`, 237 ms. Dari jalur panas: 79 ms.
3. Penyembuh otomatis: setelah bridge dijalankan ulang, VIP-4, VIP-5, dan VIP-7 masuk keadaan
   `siap` (hijau) SENDIRI tanpa ada yang menekan tombol apa pun.
4. Lampu di kartu kasir terbukti tergambar (probe Chrome/CDP):
   VIP 4 / VIP 5 / VIP 7 -> hijau (`rgb(16,185,129)`, label "TV siap");
   ruangan lain -> merah (`rgb(239,68,68)`, "TV tidak tersambung"). Nol galat halaman.

## Bentuk teknis

Bridge (C:\karaoke-tv-bridge):

- `src/tvProbe.js` (baru): periksa port TCP; di Windows sambungan gagal = ERROR, bukan `false`.
- `adbService.ensureReadyForCommand(room, {budgetMs})`: connect -> (WoL) -> connect -> tunggu.
  Tidak melempar bila gagal; mengembalikan `{ready, stage, attempts, tookMs, message}`.
- `adbService.refreshTvPortStates()`: satu sambungan TCP per ruangan; ruangan yang portnya TERBUKA
  tetapi belum tersambung LANGSUNG disambungkan di situ (penyembuh otomatis).
- `wakeRoom(room, {wakeOnly:true})`: WoL singkat untuk pemicu sesi (WoL penuh ~60 detik, terlalu lama).
- `POST /tv-command` action `power_on`: menjalankan pemicu sebelum perintah dinyalakan, menjawab
  `readyForCommand` apa adanya.
- `POST /api/rooms/:id/countdown/start`: memicu di latar belakang (jalur jadwal tidak menunggu).
- `GET /api/rooms`: memeriksa port lebih dulu supaya daftar selalu segar.
- Pemeriksa berkala saat start + tiap `TV_PORT_POLL_INTERVAL_MS` (bawaan 15 detik).

POS (C:\HappySong\happy-song-local):

- `server/src/services/tvBridgeService.js`: `getTvRoomStatusMap()` — satu panggilan bridge untuk semua
  ruangan, di-cache ~10 detik, dipetakan lewat id + SEMUA alias, ruangan disabled/tanpa ip dilewati.
- `server/src/controllers/roomsController.js`: `getRooms` menyertakan `tv_state` +
  `tv_state_checked_at`; pencarian ALIAS DULU baru terkaan nomor (ROOM-009 -> Executive/room-13).
- `js/app.js`: `createRoomTvIndicatorElement()` + kolom `tv_state` di `normalizeRooms`.
- `css/style.css`: `.tv-indicator` (hijau/kuning/merah/abu, label disembunyikan di layar kecil).
- `index.html`: versi aset `js/app.js?v=tv-indicator-v1`.

Arti warna: hijau = ADB tersambung; kuning = TV menyala tetapi ADB belum aktif di TV; merah = TV tidak
menjawab sama sekali; abu = belum diperiksa (JANGAN pernah ditampilkan sebagai aman).

## Hal yang masih menggantung

1. KASIR HARUS MUAT ULANG HALAMAN SEKALI (Ctrl+Shift+R) supaya `js/app.js` versi baru terpakai.
2. `TV_BRIDGE_ROOM_ALLOWLIST=ROOM-004` di `server/.env` masih membatasi penyapu jadwal ke VIP-4 saja.
   Harus dikosongkan supaya semua ruangan terlindungi (keputusan pemilik: terapkan ke semuanya).
3. Badge di panel Kontrol TV MASIH memakai kolom simpanan `tv_devices.last_check_result`
   (bukan `tv_state` hidup) — belum diubah, menyusul.
4. TV Executive (POS ROOM-009) berada di jaringan lain: Wi-Fi, hanya link-local, tidak terjangkau.
   Selama itu tidak dipindah ke jaringan karaoke, lampunya akan tetap merah. Itu benar apa adanya.
5. Setelah allowlist dikosongkan, jadwal T-15/T-5 berlaku untuk semua ruangan — perlu diuji sekali
   dengan satu sesi percobaan pada ruangan yang TV-nya sudah hijau.

## Catatan untuk sesi berikutnya

- Script uji lampu: `C:\karaoke-tv-bridge\scripts-uji\cdp-tv-indicator-check.js`
  (jalankan: `node cdp-tv-indicator-check.js`, butuh Chrome terpasang).
- Scan jaringan: `...\skills\networking\lan-device-inventory\scripts\lan_scan.py 192.168.1.0/24 --ports 5555,8008,6466,7000`.
- Bukti jaringan TV Executive: `C:\karaoke-tv-bridge\BUKTI-TV9-20261002.md`.

## HASIL UJI TAHAP A — peringatan + tidurkan TV (VIP-4, 2026-10-02 09:55-09:57)

Jadwal uji 65 detik dipasang langsung ke bridge (bukan lewat POS), di ruangan VIP-4:

    09:55:22  jadwal_dipasang          berakhir 02:56:27Z, tenggang 10 detik
    09:55:48  peringatan_terkirim      "UJI PERINGATAN - SISA 40 DETIK"   (T-40)
    09:56:08  peringatan_terkirim      "UJI PERINGATAN - SISA 20 DETIK"   (T-20)
    09:56:28  pesan_habis_terkirim     "UJI SELESAI - TV TIDUR"
    09:57:00  tv_ditidurkan            percobaan 1/3, layar Asleep

Bukti dari TV itu sendiri setelah uji (bukan dari balasan perintah):
    mWakefulness=Asleep, mScreenState=OFF, mCurrentFocus=null
    paket com.happysong.tvnotify masih terpasang

Kesimpulan: rantai peringatan -> tidurkan TV bekerja penuh di ruangan nyata, dan tidurnya
diverifikasi dari dalam TV, bukan diasumsikan dari balasan "terkirim".

Belum dibuktikan dari sisi ini: apakah teksnya benar-benar TERLIHAT mata di layar (butuh
orang di ruangan). Kalau ya, seluruh jalur peringatan layak dianggap terbukti.

## Tahap B — masih menunggu

Sesi dimulai OLEH PEMILIK dari aplikasi POS supaya alurnya sesuai kerja kasir. Yang dipantau
setelah itu: baris tv_control_logs baru, jadwal terpasang di bridge, dan lampu kartu tetap hijau.
Menutup sesi itu akan menghasilkan satu transaksi belum dibayar -> laporkan nomornya untuk di-void,
jangan hapus sendiri.

## TAHAP B SELESAI — jalur POS end-to-end TERBUKTI (VIP-5, 2026-10-02 10:11-10:34)

Sesi dimulai PEMILIK dari aplikasi POS (VIP-5, 20 menit). Semua waktu = jam venue.

    10:11:16  DB      : ROOM-005 status=occupied, berakhir 10:31:16
    10:11:16  bridge  : jadwal_dipasang (1200 detik, tenggang 60 detik)
    10:11:16  audit   : schedule_warning | activatePreparedSession | kasir "Manager 1" | success
    10:11:33  bridge  : tv_dinyalakan ("perpanjangan setelah waktu habis")
    10:16:17  bridge  : peringatan_terkirim  "SISA WAKTU 15 MENIT"
    10:26:17  bridge  : peringatan_terkirim  "SISA WAKTU 5 MENIT"
    10:31:17  bridge  : pesan_habis_terkirim "WAKTU HABIS"
    10:32:47  bridge  : tv_sudah_tidur      (layar sudah Asleep)
    10:33+    TV      : mWakefulness=Asleep, mScreenState=OFF

Konfirmasi PEMILIK yang berada di ruangan: "dari T-15 sampai mati sendiri ada semua" — jadi teksnya
benar-benar terlihat di layar dan TV memang mati sendiri. Ini menutup bukti yang tidak bisa dilihat
dari PC.

Catatan perilaku yang ditemukan di log dan BUKAN bug: pada 10:11:33 ada `tv_dinyalakan`
("perpanjangan setelah waktu habis"). Artinya jadwal memeriksa TV lebih dulu; karena TV masih
"habis waktu" dari sesi sebelumnya, TV dibangunkan sebelum jadwal berjalan. Hasilnya benar.

Status jadwal di akhir: state=completed, tvWasPoweredOff=true, kedua peringatan status=sent
(percobaan 1), pesan akhir status=sent. Tidak ada satu pun percobaan ulang atau kegagalan.

## Sisa pekerjaan

1. Sesi uji VIP-5 masih TERBUKA (status active, transaksi BELUM ada karena belum ditutup). Menutupnya
   akan membuat satu transaksi belum dibayar -> pemilik yang memutuskan: ditutup lalu transaksinya
   di-void, atau dibiarkan sampai kasir menanganinya sendiri.
2. Sisa nomor 1 dari rencana lama sudah selesai (panel Kontrol TV memakai status hidup).
3. Sisa dari daftar sebelumnya: tidak ada lagi yang wajib. Yang belum pernah diuji hanya peringatan
   pada durasi panjang T-15/T-5 sesungguhnya - namun mekanismenya sama dan sudah terbukti di T-40/T-20
   (VIP-4) maupun T-15/T-5 (VIP-5).
