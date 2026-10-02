# RENCANA — Menu "Kontrol TV" di aplikasi POS

Dokumen ini adalah perintah kerja untuk Antigravity. Tulisannya sengaja rinci supaya tidak perlu
menebak: bagian 3-7 adalah kontrak yang harus diikuti, bagian 8 daftar jebakan yang sudah pernah
menggigit di mesin ini, bagian 9 kriteria terima yang akan diuji ulang lewat Hermes.

Pemilik: Yasser. Penulis rencana: sesi Hermes 2026-09-24. Status: MENUNGGU DIKERJAKAN.

## 1. Tujuan

Di aplikasi POS perlu satu tempat untuk mengurus TV ruangan: mengisi alamat/MAC TV, melihat
perangkat benar-benar terhubung atau tidak, menguji nyala-mati dan peringatan, serta membaca riwayat
perintah. Hari ini semua itu hanya ada sebagai berkas `config/rooms.json` di folder bridge — tidak
bisa dilihat kasir, tidak bisa diperiksa tanpa buka terminal.

Hasil akhir yang diharapkan: sub-tab baru "Kontrol TV" di tab Pengaturan, berisi daftar ruangan
dengan status perangkat yang jujur (bukan klaim "sukses" tanpa bukti), form pengaturan per ruangan,
tombol uji, dan riwayat perintah.

## 2. Keputusan pemilik yang sudah dipatok (jangan ditawar lagi)

  1. MAC address dan pengaturan perangkat lain DISIMPAN DI DATABASE (tabel `tv_devices`), bukan di
     `config/rooms.json`. MAC adalah identitas perangkat — kalau alamat IP bergeser, MAC tetap.
     MAC juga dipakai untuk paket WoL saat menyalakan TV dalam keadaan standby.
  2. Kontrol penuh: nyalakan, matikan, uji, dan kirim peringatan ke layar TV — semuanya dari menu ini.
  3. Aplikasi POS adalah satu-satunya sumber kebenaran pengaturan TV. `config/rooms.json` di folder
     bridge diperlakukan sebagai berkas GENERATED (hasil tulis) — jangan ada orang mengeditnya manual.
  4. Repositori POS PUBLIK. Tidak ada token, tidak ada `.env`, tidak ada alamat rahasia yang masuk ke
     dalam berkas yang di-commit. Token bridge tetap disuntik server lewat `/tv-bridge-config.js`.

## 3. Peta sistem apa adanya (sumber, bukan tebakan)

  POS (C:\HappySong\happy-song-local, branch kerja feat/tv-bridge-schedule-integration)

    index.html                41 baris; hanya wadah: #appTabs, #dashboardPanels, dan
                              <script src="/tv-bridge-config.js"> + js/app.js (dengan versi cache).
    js/app.js                 ~36.200 baris. Nama fungsi di bawah ini sudah terverifikasi ada.
      baris 33-40             daftar tab dashboard; "settings" = Pengaturan
      baris 126-142           buildApiUrl(action, params) — pola GET
      baris 411-460           sendLocalTvCommand(roomId, tvAction, triggerSource) — jalur browser -> bridge
      baris 1268              loadRooms()
      baris 1847              loadSettingsData({force})
      baris 23161             createSettingsSection(title, subtitle, addType, tableElement, extraControls)
      baris 23280             createSettingsSubTabsElement() -> daftar sub-tab Pengaturan
      baris 23307             getActiveSettingsSectionElement() -> pemilih isi sub-tab
      baris 24797             createSettingsPanelElement() -> rangkai panel Pengaturan
      baris 34074             saveCashierClosing() (contoh lengkap alur POST)
      baris 34119             postApiAction(payload) — pola POST (Content-Type text/plain;charset=utf-8)
      baris 34500             handleRoomAction(event) — pusat seluruh klik dashboard
      baris 34572             contoh penanganan aksi sub-tab: "switch-settings-subtab"
      baris 3698              showInlineNotice(message, type)

    server/ (Express, port 3000, rute /exec meniru Apps Script)
      src/routes/api.js        handleGetAction (baris ~92) dan handlePostAction (baris ~360) — semua
                              aksi lewat dua switch ini. Tutup switch yang baru di keduanya.
      src/controllers/tvController.js
        getTvDevices (6), getTvControlLogs (26), getTvDisplaySetupList (57),
        getCustomerDisplayState (71), sendTvCommand (105), saveTvDevice (210),
        rotateTvDisplayToken (225), seedTvDisplaysForAllRooms (237), seedPilotTvDisplay (257)
      src/services/tvBridgeService.js   klien bridge: bridgeFetch, sendTvCommand, startSchedule,
                              cancelSchedule, notifyRoom, syncRoom, sweepExpiredRooms, recordTvLog
      src/db/schema.sql        struktur tabel (lihat bagian 4)
      tests/contract-tests.js  contoh uji kontrak; baris 218 contoh uji aksi getTvDevices

  Bridge TV (C:\karaoke-tv-bridge, port 3030, repo git sendiri, kode dicerminkan ke
  middleware/tv-control-bridge di repo POS)

    server.js                 /tv-command, /api/rooms (daftar status), /api/rooms/:id/status,
                              /api/rooms/:id/connect, /wake, /sleep (dan /off), /notify,
                              /api/rooms/:id/countdown/start|cancel, /api/events, /health
    src/roomConfig.js         membaca config/rooms.json SATU KALI saat start (resolveRoom lewat aliases)
    src/adbService.js         connectToRoom, wakeRoom (WoL + keyevent 224), sleepRoom (keyevent 223,
                              memeriksa keadaan dulu), sendOverlay, getTvPowerState, getStatus,
                              getRuntime (keluaran diagnosa lengkap per ruangan)
    src/countdownService.js   jadwal T-15/T-5/T-0, tenggang, retry, log kejadian

  Nama ruangan berbeda antar sistem: POS memakai ROOM-00x, bridge memakai room-0x + daftar `aliases`
  (contoh nyata: POS ROOM-009 / EXECUTIVE = bridge room-13). Semua pemetaan HARUS lewat alias.

## 4. Perubahan database (satu tabel, tambahan kolom)

Tabel `tv_devices` sekarang hanya memuat: tv_device_id, room_id, device_name, control_type, status,
middleware_url, device_identifier, updated_at. Tambahkan kolom berikut (ALTER TABLE, sertakan di
`server/src/db/schema.sql` supaya database baru langsung benar):

    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_ip            VARCHAR(45);
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_mac           VARCHAR(32);
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_port         INT DEFAULT 5555;
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_timeout_ms   INT DEFAULT 15000;
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS wol_broadcast    VARCHAR(45) DEFAULT '192.168.1.255';
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notify_package   VARCHAR(100) DEFAULT 'com.happysong.tvnotify';
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notes            TEXT;
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_checked_at  TIMESTAMPTZ;
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_result VARCHAR(30);
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_message TEXT;

Aturan yang mengikat:

  - Satu ruangan satu baris AKTIF. Pengaman: proses simpan harus menolak (bukan diam-diam
    menonaktifkan) kalau ruangan itu sudah punya baris aktif lain, supaya tidak ada dua pengaturan
    bersaing. `tv_device_id` sebaiknya otomatis `TV-<room_id>` dan tidak bisa diketik bebas.
  - `control_type='middleware'` WAJIB punya `middleware_url`; `control_type='mock'` diperlakukan
    sebagai tanpa perangkat nyata dan harus tampil berbeda di UI (jangan bercampur dengan yang asli).
  - Kolom `device_identifier` yang lama dipakai menyimpan MAC. Saat migrasi: kalau `tv_mac` kosong dan
    `device_identifier` berisi pola MAC, salin nilainya. Setelah itu `tv_mac` yang dipakai, dan
    `device_identifier` jangan dihapus (cadangan).
  - Normalisasi saat simpan: MAC ke huruf kecil dengan pemisah `:` (contoh `74:81:9a:ff:72:be`),
    IP divalidasi format IPv4 tanpa spasi. Tolak simpan dengan pesan jelas kalau formatnya salah.

## 5. Kontrak API (lewat /exec, jadi langsung dikenali frontend yang sudah ada)

Aksi GET baru:

    getTvRoomOverview
      -> { ok, success, rooms: [ {
             room_id, room_name,
             tv_device_id, device_name, control_type, status,
             tv_ip, tv_mac, adb_port, adb_timeout_ms, wol_broadcast, notify_package, notes,
             middleware_url,
             bridge_url,
             bridge_reachable,          // bridge menjawab di 127.0.0.1:3030?
             device_connected,          // ADB benar-benar tersambung (dari bridge)
             wakefulness,               // Awake / Asleep / Dozing / Dream / null
             mac_matches_arp,           // cocok / beda / tidak diketahui
             arp_mac,
             last_checked_at, last_check_result, last_check_message,
             masalah: []                // daftar kekurangan yang terbaca manusia, mis.
                                        // ["MAC belum diisi", "IP tidak menjawab ping",
                                        //  "ADB tidak tersambung", "control_type=mock (tanpa perangkat)"]
           } ] }

Aksi POST baru (semua WAJIB menyertakan `admin_pin` seperti aksi sensitif lain, dan semua percobaan
dicatat ke `tv_control_logs` dengan `trigger_source` yang jelas):

    saveTvDeviceSettings   -> simpan kolom bagian 4 untuk satu ruangan + tulis ke bridge (bagian 7)
    checkTvDevice          -> periksa sekarang, perbarui last_checked_*, kembalikan hasil pemeriksaan
    testTvDevice           -> uji ADB (aksi "test" ke bridge)
    wakeTvDevice           -> nyalakan TV
    sleepTvDevice          -> matikan TV
    notifyTvDevice         -> kirim peringatan ke layar TV ({ text, subtext, seconds })
    reloadTvBridgeConfig   -> minta bridge membaca ulang config/rooms.json

Format balasan mengikuti pola yang sudah ada (`successResponse` / `errorResponse`), dengan
`block_reason` terisi kalau gagal, supaya UI bisa menampilkan sebabnya alih-alih "gagal" saja.

## 6. Rancangan tampilan

Sub-tab baru "Kontrol TV" di dalam Pengaturan (tambahkan di `createSettingsSubTabsElement`, tangani di
`getActiveSettingsSectionElement`, dan tangani kliknya di `handleRoomAction` mengikuti pola
"switch-settings-subtab"). Isinya tiga bagian dalam satu halaman:

  A. Tabel status semua ruangan
     Kolom: Ruangan | Perangkat | Tipe | IP | MAC | ADB | Layar | MAC cocok ARP | Terakhir diperiksa | Aksi
     - ADB: "tersambung" / "tidak tersambung" / "belum diperiksa"
     - Layar: "menyala" / "tidur" / "screensaver" / "tidak diketahui"
     - Baris yang belum lengkap diberi penanda, dan kolom "masalah" dari API ditampilkan sebagai
       daftar kekurangan. Jangan sembunyikan masalah di balik lencana hijau.
     - Tombol per baris: Periksa, Nyalakan, Matikan, Uji, Peringatan.
     - Tombol "Periksa semua" di atas tabel.

  B. Form pengaturan per ruangan (modal, pola modal yang sudah ada di app.js)
     Ruangan (pilih dari daftar rooms yang sudah dimuat), Nama perangkat, Tipe kontrol,
     IP TV, MAC TV, Port ADB, Batas waktu ADB (ms), Alamat broadcast WoL, Paket notifikasi,
     Catatan, Status aktif/nonaktif. Setiap kolom diberi keterangan singkat satu baris.
     Tombol tambahan di modal: "Periksa perangkat ini" (memanggil checkTvDevice) supaya orang bisa
     memastikan sebelum menyimpan. Kolom `middleware_url` disembunyikan dari tampilan dan diisi
     server (bridge di PC yang sama), supaya tidak ada yang salah ketik alamat.

  C. Riwayat perintah
     Daftar dari `getTvControlLogs` (sudah ada) difilter per ruangan, tampilkan waktu, aksi, sumber
     pemicu, kasir, hasil (berhasil/gagal), dan pesan. Paginasi mengikuti pola paginasi yang sudah ada.

## 7. Aturan integrasi yang tidak boleh dilanggar

  1. JANGAN memanggil bridge langsung dari browser untuk menu ini. Semua lewat server POS
     (`/exec` -> tvController -> tvService). Alasannya: token harus tetap di server, dan percobaan
     harus tercatat. Jalur browser `sendLocalTvCommand` yang lama dibiarkan apa adanya untuk tombol
     kartu ruangan; jangan dipakai untuk menu baru.
  2. Alamat bridge diambil dari `process.env.TV_BRIDGE_URL` (default http://127.0.0.1:3030), token dari
     `process.env.TV_BRIDGE_TOKEN`. `middleware_url` per baris hanya dipakai kalau memang menunjuk
     bridge yang sama. Baris rusak yang ada sekarang: TV-002 (ROOM-002) masih menunjuk tunnel mati
     `https://46a6b54de9da7f.lhr.life` dengan status aktif — menu ini harus menampilkan baris seperti
     itu sebagai masalah, dan sebaiknya ada tombol memperbaiki (arahkan ke bridge PC).
  3. Pengaturan per ruangan yang disimpan WAJIB sampai ke bridge, karena bridge tidak punya database.
     Kontrak tulis (pilih satu, jangan dua-duanya):
       a. Bridge menyediakan endpoint tulis config (`PUT /api/rooms/<roomId>/config`) lalu memuat ulang
          config di memori — INI YANG DIUTAMAKAN, tapi berarti ada perubahan di `C:\karaoke-tv-bridge`.
       b. Kalau endpoint itu belum ada, server POS menulis `config/rooms.json` di folder bridge
          (path dari env, jangan di-hardcode) dengan pengaman berkas (tulis ke berkas sementara lalu
          ganti), lalu memanggil `reloadTvBridgeConfig`.
     Kalau dua-duanya tidak bisa dikerjakan di sesi Antigravity, jangan diam-diam menganggapnya
     selesai: tampilkan di UI bahwa perubahan disimpan di database tapi bridge PERLU dijalankan ulang.
     Saya (Hermes) bisa mengerjakan sisi bridge-nya kalau itu yang dipilih.
  4. Jangan menyimpan IP/MAC ke `data/jadwal-ruangan.json`. Berkas itu menyimpan jadwal yang tahan
     restart, dan sudah pernah membuat IP lama tertinggal di jadwal setelah config berubah.
  5. Setelah mengubah kode bridge apa pun, jalankan cermin kode:
       powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode periksa
       powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode sync
     lalu `git add middleware/` dan commit di repo POS. Rahasia (`\.env`) tidak boleh ikut — skrip itu
     sudah menolak daftar terlarang, jangan dilewati.
  6. Frontend: naikkan versi cache di `index.html` (mis. `js/app.js?v=kontrol-tv-v1`) supaya kasir
     tidak memakai berkas lama. Token bridge tetap dari `/tv-bridge-config.js`, jangan ditulis ulang.
  7. Izin: menu ini untuk owner/admin (pola `validateAdminPin` yang sudah ada). Kasir hanya boleh
     nyalakan/matikan dari kartu ruangan seperti sekarang.

## 8. Jebakan yang sudah pernah menggigit (tolong dihindari)

  - `tv_control_logs.tv_device_id` punya FOREIGN KEY ke `tv_devices`. Menulis id karangan membuat baris
    gagal masuk dan hilang tanpa suara. Pastikan baris perangkat benar-benar ada sebelum mencatat.
  - Status sesi ruangan yang benar adalah `'occupied'`. Nilai `'active'` TIDAK ada; filter dengan nama
    itu tidak mencocokkan apa pun dan tidak memunculkan kesalahan.
  - `server/.env` hanya dibaca saat proses server start. Mengubah `.env` tidak mengubah proses yang
    sedang jalan — beri tahu pemilik untuk restart, jangan menganggapnya berlaku.
  - Server POS hanya boleh dijalankan dari folder `server/` (`npm start`). Pernah terjadi proses POS
    dijalankan sambil membawa `PORT=3030` sehingga ia menempati port bridge; gejalanya port 3000 mati
    tetapi 3030 justru menjawab. Bedakan dengan isi balasan `/health`: POS menjawab `status:online`,
    bridge menjawab `service:tv-control-bridge`.
  - ADB ke TV bisa terlihat "offline" hanya karena cache runtime bridge yang basi (setelah bridge
    di-restart). Sembuh dengan `/api/rooms/<room>/connect`. Jangan langsung menuduh TV atau kabelnya.
  - TV bisa hilang dari jaringan sekejap (kejadian nyata 24 Sep: VIP-4 hilang ~1 menit lalu kembali);
    dalam keadaan itu perintah nyala tidak akan berhasil. Hasil "gagal" harus tampil sebagai kegagalan
    yang jujur, bukan "sukses" — TV yang sudah mati fisik tidak bisa dinyalakan lewat WoL.
  - Jangan mengklaim "TV mati/nyala" dari balasan perintah. Balasan `success:true` hanya berarti
    perintah terkirim. Bukti yang dipakai: `dumpsys power` (Awake/Asleep/Dozing/Dream).

## 9. Kriteria terima (akan diuji ulang lewat Hermes, bukan diklaim sendiri)

  1. Sub-tab "Kontrol TV" muncul di Pengaturan, tidak merusak sub-tab lain, dan bertahan setelah
     halaman dimuat ulang (sub-tab aktif tersimpan).
  2. Tabel menampilkan 13 ruangan bridge dengan status yang benar. Untuk VIP-4 (satu-satunya TV yang
     bisa dijangkau hari ini) harus terbaca: ADB tersambung, layar menyala atau tidur sesuai kenyataan,
     MAC cocok dengan ARP.
  3. Baris TV-002 (tunnel mati) tampil sebagai bermasalah, bukan hijau.
  4. Menyimpan IP/MAC lewat form benar-benar tersimpan di `tv_devices`, dan `config/rooms.json` di
     folder bridge ikut berubah (kalau kontrak 7.3a/7.3b dikerjakan).
  5. Uji nyala-mati VIP-4 dari menu berhasil, dan tiap percobaan menambah baris di `tv_control_logs`
     dengan `trigger_source` yang menyebut menu (mis. `kontrol_tv_ui`).
  6. "Peringatan" menampilkan kotak di layar TV tanpa menghentikan lagu yang sedang jalan.
  7. Menyimpan tanpa PIN owner/admin ditolak dengan pesan jelas.
  8. `node --check js/app.js` lulus; tidak ada rambu lint yang baru dinyalakan; tidak ada `.env` atau
     token yang masuk ke berkas yang di-commit (repo ini publik).

## 10. Yang TIDAK dikerjakan di sesi Antigravity ini

  - Memperbaiki jaringan/DHCP dan menyalakan TV yang mati (itu pekerjaan fisik, tanggung jawab pemilik).
  - Meng-merge branch ke `main`.
  - Menyentuh data keuangan atau 13 sesi berstatus `starting` sisa Agustus 2026 (pekerjaan terpisah).
  - Memasang APK overlay di TV selain VIP-4 (kunjungan per TV).

## 11. Cara melapor setelah selesai

  Tulis ringkas di berkas `middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md`:
  apa yang sudah jadi, berkas apa yang disentuh, aksi API apa yang ditambah, apakah kontrak 7.3a atau
  7.3b yang dipilih, dan apa yang belum. Kalau ada keputusan yang tidak ada di dokumen ini, tulis
  pertanyaannya di berkas itu — jangan menebak dan jangan mengubah berkas di luar aplikasi POS tanpa
  membicarakannya lebih dulu.