# RENCANA — Tombol "Pasang APK Peringatan" di sub-tab Kontrol TV

Status: SELESAI 2026-09-25. Kode, uji ke TV, dan push ke repo sudah dikerjakan.
Keputusan yang diambil: APK disimpan di middleware/tv-control-bridge/assets/app-debug.apk
(folder itu perlu pengecualian di .gitignore salinan repo, karena salinan repo mengabaikan *.apk).
Keputusan pemilik (sudah final):
  - Fase 1: SATU TOMBOL PER RUANGAN. Tombol "Pasang Semua" tidak dikerjakan dulu.
  - PIN: memakai alur PIN yang sudah ada (sama seperti Cek / Nyalakan / Matikan / Uji ADB).
  - APK overlay (com.happysong.tvnotify) dinyatakan BAWAAN SISTEM POS: harus ikut repo GitHub,
    bukan lagi hanya tinggal di folder bridge.

## 1. Tujuan

Menghapus pekerjaan manual 3 perintah ADB per TV (install, appops set, uji) supaya operator bisa
memasang peringatan overlay langsung dari sub-tab Kontrol TV, per ruangan, seperti tombol Cek dan
Uji ADB yang sudah ada.

## 2. Kenyataan rantai kode saat ini (sesudah diverifikasi 2026-09-25)

UI (kasir)
  js/app.js:26219-26247  menyusun baris tombol per ruangan: Cek, Nyalakan, Matikan, Uji ADB, Pesan, Edit
  js/app.js:36389        handler "check-tv-device"  -> postApiAction({action:"checkTvDevice"})
  js/app.js:36476        handler "test-tv-device"   -> postApiAction({action:"testTvDevice"})
  Keduanya lewat openAdminPinModal (requiredRole "manager").

Server POS
  server/src/controllers/tvController.js:768  testTvDevice()   -> tvBridgeService.sendTvCommand
  server/src/controllers/tvController.js:831  notifyTvDevice()
  server/src/controllers/tvController.js:857  reloadTvBridgeConfig()
  server/src/services/tvBridgeService.js:60   bridgeFetch()  (token diambil dari server/.env, bukan browser)
  server/src/services/tvBridgeService.js:171  sendTvCommand()
  server/src/services/tvBridgeService.js:451  updateBridgeRoomConfig() -> PUT /api/rooms/:id/config
  server/src/services/tvBridgeService.js:128  recordTvLog() -> tabel tv_control_logs
  Catatan penting: tv_control_logs.tv_device_id punya foreign key ke tv_devices. Baris log harus
  memakai id yang benar (resolveTvDeviceId), kalau tidak barisnya hilang diam-diam dan penyapu
  akan mengirim ulang perintahnya selamanya.

Bridge (yang menjalankan ADB)
  C:\karaoke-tv-bridge\server.js:370  POST /tv-command   (bentuk Apps Script; power_on|power_off|test|notify)
  C:\karaoke-tv-bridge\server.js:480  GET  /api/rooms/:roomId/status
  C:\karaoke-tv-bridge\server.js:547  POST /api/rooms/:roomId/app     (launchApp)
  C:\karaoke-tv-bridge\server.js:586  POST /api/rooms/:roomId/notify  (sendOverlay)
  C:\karaoke-tv-bridge\server.js:508  POST /api/config/reload
  C:\karaoke-tv-bridge\src\adbService.js:406  ensureAwakeAndConnected()  (bangunkan TV dulu)
  C:\karaoke-tv-bridge\src\adbService.js:481  sendOverlay()
  C:\karaoke-tv-bridge\src\adbService.js:547  getStatus()
  C:\karaoke-tv-bridge\.env:4  TV_NOTIFY_PACKAGE=com.happysong.tvnotify

## 3. Temuan yang mengubah rencana "masuk repo"

1. C:\karaoke-tv-bridge SUDAH repo git, TAPI BELUM punya remote. Artinya "masuk GitHub" tetap lewat
   repo POS: folder kerja -> cermin middleware/tv-control-bridge -> commit & push repo POS. Tidak
   perlu repo kedua. Jangan mengubah folder kerja jadi clone repo POS (jalan/instalasi bisa rusak);
   pindahkan salinannya dengan tools/tvbridge-sync.ps1, bukan dengan git.
2. .gitignore repo POS mengabaikan build/ dan dist/ (baris 17-19). Karena itu APK TIDAK BOLEH
   diletakkan di .../tv-notify-overlay/app/build/outputs/... — akan diabaikan git tanpa peringatan.
   APK yang ikut repo harus di folder yang tidak diabaikan, dan folder itu TIDAK boleh bernama
   "build" atau "dist".
3. .gitignore repo POS sudah mengabaikan .env (token bridge). APK sudah diperiksa: tidak memuat
   token/rahasia apa pun (hanya AndroidManifest + 2 dex). Jadi aman untuk repo publik.
4. Cermin saat ini TIDAK ada selisih (22 berkas sama). Perubahan hari ini (PUT /api/rooms/:id/config,
   POST /api/config/reload, getArpTable, penulis rooms.json) sudah tercermin.

## 4. Yang akan dikerjakan

### 4a. Sisi bridge (C:\karaoke-tv-bridge)

1. Salinan APK masuk repo, di folder yang tidak diabaikan:
      C:\karaoke-tv-bridge\assets\app-debug.apk            (<<< DIMINTA PERSETUJUAN NAMANYA)
   Alasan: menjadikan APK bawaan sistem berarti berkasnya harus tinggal di repo, bukan di hasil build
   yang diabaikan. APK tidak akan dibuild ulang di PC lain, jadi disimpan sebagai berkas jadi.
   Mengganti nama jadi "app-debug.apk" agar tidak mengesankan hasil build sementara.
2. .gitignore bridge: TIDAK diubah. Pola "build/" tidak ada di .gitignore bridge, tapi lebih jelas
   memakai folder "assets/" daripada "build/".
3. .env bridge, kunci baru:
      TV_OVERLAY_APK=C:\karaoke-tv-bridge\assets\app-debug.apk
   Kalau kosong/tidak ada, endpoint baru mengembalikan galat yang jelas ("berkas APK tidak
   ditemukan di bridge"), BUKAN galat ADB yang membingungkan.
4. src/adbService.js:
      - installOverlay(roomSelector)  -> pastikan bangun+sambung (ensureAwakeAndConnected),
        lalu `adb install -r <TV_OVERLAY_APK>`, lalu `appops set <pkg> SYSTEM_ALERT_WINDOW allow`,
        lalu baca ulang status. Balasan memuat: installed, allowed, packageVersion.
      - readOverlayState(roomSelector) -> pm list packages + appops get (2 perintah baca, cepat).
        Dipakai oleh getStatus() supaya UI bisa menampilkan keadaan sebenarnya.
      - Batas waktu ADB untuk install: 60 detik (adb install ke TV bisa 5-20 detik), tetap dibatasi
        satu nilai bawaan di call site seperti aturan yang sudah berlaku.
5. server.js:
      - POST /api/rooms/:roomId/overlay/install  -> installOverlay + tulis kejadian ke
        logs/tv-events.jsonl (pola sama seperti perintah lain).
      - GET /api/rooms/:roomId/status  ditambah bidang overlayInstalled, overlayAllowed.
   PENTING: path APK TIDAK PERNAH diterima dari body permintaan. Kalau path bisa dikirim dari UI,
   siapa pun yang bisa membuka halaman POS dapat memerintahkan bridge memasang APK apa saja ke TV.

### 4b. Sisi POS

1. server/src/services/tvBridgeService.js:
      installOverlay(roomId, options) -> bridgeFetch(`/api/rooms/<id>/overlay/install`, POST)
      + recordTvLog (action "install_overlay", trigger_source "kontrol_tv_ui").
2. server/src/controllers/tvController.js:
      installTvOverlay(req, res, payload) -> verifyAdminPinPayload (peran manager, sama seperti tombol
      lain), panggil service, kembalikan pesan jujur (terpasang / sudah ada / gagal + alasan).
   Daftarkan aksi barunya di tempat aksi TV lain didaftarkan (routes/api.js, mengikuti pola
   testTvDevice / notifyTvDevice).
3. js/app.js:
      - Satu tombol baru "Pasang Peringatan" di baris tombol (sekitar baris 26247, setelah "Pesan"),
        data-action="install-tv-overlay".
      - Handler baru di dekat penanganan 36476: openAdminPinModal (judul "Otorisasi Pasang Peringatan"),
        lalu postApiAction({action:"installTvOverlay", room_id, admin_pin}), tampilkan "sedang
        memasang..." (jangan 2,5 detik lalu menyerah), lalu muat ulang overview.
      - Tombol hanya ditampilkan bila ruangan terhubung DAN overlay belum lengkap
        (overlayInstalled === false atau overlayAllowed === false). Kalau belum ada data, tampilkan
        tombol dengan status "pasang"; jangan pernah menampilkan tombol yang pasti gagal.
      - Bump versi aset di index.html (js/app.js?v=...) supaya halaman kasir yang sudah terbuka
        memuat kode baru setelah reload.
4. Batas waktu pemanggil POS harus lebih panjang dari batas ADB bridge (aturan yang sudah ada:
   pemanggil 2,5 detik akan membatalkan sementara bridge terus bekerja -> operator menekan dua kali).

## 5. Kriteria terima (bisa dijalankan ulang)

1. `git check-ignore -v <path apk di repo>` TIDAK mengembalikan apa pun (berkas benar-benar ikut repo).
2. Di repo POS: `git ls-files middleware/tv-control-bridge/assets/` memuat app-debug.apk, dan berkas
   itu sama dengan APK yang dipakai bridge (bandingkan sha256).
3. Ruangan yang belum punya overlay (contoh VIP-5 / 192.168.1.8) -> tombol muncul, ditekan, PIN
   manager diminta, dan hasilnya: appops get com.happysong.tvnotify SYSTEM_ALERT_WINDOW = allow.
4. Uji tampil di TV yang menyala: overlay muncul di atas video, suara/gambar tetap jalan, hilang
   sendiri. (Bukti: logcat OVERLAY_SHOWN + tangkapan layar.)
5. Baris baru muncul di tv_control_logs dengan tv_device_id yang SAH (bukan id karangan).
6. Ruangan yang sudah lengkap (VIP-4) -> tombol tidak ditawarkan lagi (atau menjawab "sudah terpasang").
7. TV yang mati/tidak terjangkau -> jawaban "TV tidak terjangkau", bukan "berhasil".
8. Ruangan disabled -> 409, tidak menyentuh TV mana pun.

## 6. Cara mengembalikan

  - Kode: `git revert <commit>` di masing-masing repo (bridge: commit lokal; POS: commit + push).
  - TV: `adb -s <ip>:5555 uninstall com.happysong.tvnotify` (sudah diuji bersih sebelumnya).
  - Config: kunci TV_OVERLAY_APK di .env bridge boleh dibiarkan; endpoint akan menjawab galat jelas.

## 7. Yang sudah selesai terkait (jangan dikerjakan ulang)

  - Sinkronisasi cermin kode: middleware/tv-control-bridge/tools/tvbridge-sync.ps1 (-Mode periksa/sync),
    saat ini 0 selisih.
  - APK overlay sudah terbukti di VIP-4 (uji T1-T7, 2026-09-23), termasuk di atas video YouTube.
  - Pemasangan APK di VIP-5 BELUM dikerjakan (TV sedang menyala, ADB tersambung). Pemasangan manual
    itu masih berguna sebagai uji terima pertama untuk tombol baru ini.

## 8. Yang belum diputuskan pemilik

  a. Nama/lokasi berkas APK di repo: assets/app-debug.apk (usul) atau nama lain?
  b. Apakah fase 2 ("Pasang Semua Ruangan" dengan laporan per ruangan) tetap dilanjutkan setelah ini.