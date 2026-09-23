# HASIL UJI: Overlay Peringatan Waktu di Layar TV (Jalur C)

Dijalankan: Rabu 2026-09-23, 15:24-15:43 (waktu lokal).
Tempat uji: VIP-4 (192.168.1.104), Android 12 / SDK 31, POLYTRON4K.
Izin pemilik: ya (pasang perkakas di PC bridge + memakai VIP-4 untuk uji).
Kode POS dan kode bridge yang sedang jalan TIDAK disentuh sama sekali.

Hasil ringkas: SEMUA uji inti LOLOS. Jalur C layak dilanjutkan ke tahap integrasi dengan POS.

## 1. Perkakas build yang dipasang hari ini (sekali saja)

  JDK 17        : sudah ada sejak 2026-09-22 (Temurin 17.0.20.1, JAVA_HOME permanen)
  SDK cmdline   : C:\Users\Dell\AppData\Local\Android\Sdk\cmdline-tools\latest (sdkmanager 14.0-alpha01)
  Platform      : platforms;android-34 (rev 3)
  Build-tools   : build-tools;34.0.0
  Platform-tools: 37.0.1
  Gradle        : C:\tools\gradle-8.7 (Gradle 8.7, JVM 17.0.20.1)
  Ukuran SDK    : 429 MB. Disk C sisa 185 GB.
  Unduhan       : commandlinetools-win-11391160_latest.zip (160 MB) + gradle-8.7-bin.zip (134 MB),
                  keduanya lulus uji integritas zip sebelum dibongkar.
  Variabel      : ANDROID_HOME belum diset permanen (dipakai per-perintah); local.properties
                  proyek sudah menunjuk ke folder SDK, jadi build tidak bergantung env.

## 2. Proyek APK (di luar repo POS, sengaja)

  Lokasi : C:\karaoke-tv-bridge\tv-notify-overlay\
  Berkas : settings.gradle, build.gradle, gradle.properties, local.properties,
           app/build.gradle, app/src/main/AndroidManifest.xml,
           app/src/main/java/com/happysong/tvnotify/OverlayService.java, tv.sh (alat bantu uji)
  Hasil  : app/build/outputs/apk/debug/app-debug.apk = 10.721 byte (10,5 KB) - jauh di bawah target 200 KB
  Build  : 1 menit 36 detik (Gradle 8.7, AGP 8.5.2, tanpa dependensi apa pun)
  Paket  : com.happysong.tvnotify versi 1.0, compileSdk 34, minSdk 26, targetSdk 34

  Spesifikasi jendela yang TERBUKTI jalan di TV ini:
    type   = TYPE_APPLICATION_OVERLAY
    flags  = FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCHABLE | FLAG_LAYOUT_NO_LIMITS
    format = PixelFormat.TRANSLUCENT
    gravity= TOP | CENTER_HORIZONTAL, y = 60dp, lebar minimum 860dp
    isi    = baris besar 60sp putih tebal + baris kecil 28sp kuning, latar hitam pekat
             (alpha 238) dengan bingkai kuning #FFC400 dan sudut membulat
    auto hilang = lewat parameter seconds (param "seconds", dijepit 3-600 detik)

  Perintah pemicu (inilah yang nanti dijalankan bridge):
    adb -s <ip>:5555 shell am start-foreground-service \
        -n com.happysong.tvnotify/.OverlayService \
        --es text "SISA WAKTU 15 MENIT" --es subtext "Hubungi kasir untuk perpanjang" --ei seconds 20
    tambahan: --es cmd hide  -> menutup overlay saat itu juga (untuk uji/rollback)

## 3. Hasil uji satu per satu (semua ada bukti tangkapan layar di bukti-overlay-20260923\)

  T1  Pasang APK + izin overlay ................ LOLOS
      adb install -r -> "Success"; pm list packages -> com.happysong.tvnotify
      appops get com.happysong.tvnotify SYSTEM_ALERT_WINDOW -> "SYSTEM_ALERT_WINDOW: allow"

  T2  Overlay saat lagu YouTube berjalan ....... LOLOS SEMUA (ini uji penentu)
      (a) terlihat menimpa video, video tetap terlihat di sekitar kotak .. T2_01, T2_02
      (b) audio lagu tidak berhenti: AudioPlaybackConfiguration
          usage=USAGE_MEDIA content=CONTENT_TYPE_MOVIE state:started tetap started
      (c) video tidak dijeda: activity tetap YouTube MainActivity; posisi media bergerak
          (157440 ms -> 157974 ms pada uji T5); adegan video berbeda-beda antar tangkapan
      (d) tidak ada crash: logcat AndroidRuntime kosong, hanya baris OVERLAY_* milik kita
      (e) hilang sendiri: OVERLAY_SHOWN 15:32:21.331 -> AUTO_HIDE 15:32:41.348 (20,0 detik),
          jendela tvnotify-overlay 0 setelahnya ............................ T2_04

  T4  Dua perintah beruntun -> satu kotak .... LOLOS
      perintah ke-2 pada detik ke-4 hanya memperbarui teks + mereset timer:
      "OVERLAY_SHOWN n=2 text=SISA WAKTU 5 MENIT", tidak ada OVERLAY_ADDED kedua,
      jumlah jendela tetap 1 ............................................. T4

  T5  Remote tetap normal saat overlay tampil .. LOLOS
      keyevent 23 (OK) -> bilah kontrol YouTube muncul BERSAMAAN dengan kotak kita -> T5_01
      keyevent 85 -> state=2 (jeda), keyevent 85 lagi -> state=3 (jalan lagi)
      keyevent 4 (BACK) sekali -> tetap di com.google.android.youtube.tv
      -> overlay sama sekali tidak merebut fokus maupun sentuhan ......... T5_02, T5_03

  T6  Tahan reboot TV ......................... LOLOS
      reboot dilakukan, TV tidak dibuka/dititik sama sekali; setelah boot selesai
      (sys.boot_completed=1) perintah overlay langsung jalan lagi ........ T6
      Catatan: layanan ADB TCP TV baru bisa dihubungi lagi beberapa menit setelah reboot
      (perkiraan 4-6 menit dari percobaan ini, waktunya belum diukur presisi).

  T7  Rollback bersih ......................... LOLOS
      adb uninstall -> "Success"; sisa paket 0, sisa jendela 0,
      appops menjawab "No UID for com.happysong.tvnotify in user 0" ....... T7
      Sesudah uji rollback, APK DIPASANG LAGI + izin overlay diberikan lagi
      supaya VIP-4 siap untuk tahap integrasi (bukti: T8).

## 4. Kendala yang ditemukan dan penyelesaiannya

  1. Argumen teks terpotong saat dikirim lewat `adb shell`.
     Gejala: --es text "SISA WAKTU 15 MENIT" sampai di TV hanya sebagai "SISA" (kata WAKTU
     bahkan sempat dibaca sebagai "pkg=" oleh am), karena shell TV memecah spasi.
     Solusi: bungkus teks dengan kutipan DI DALAM perintah, yaitu --es text "'SISA WAKTU 15 MENIT'".
     Ini sudah diperbaiki di tv.sh dan wajib diingat saat bridge mengirim teks nanti.
  2. `dumpsys media_session` bukan bukti yang bisa dipegang untuk "video masih jalan":
     kolom position bisa beku (846 ms berulang) ketika status pemutar tidak berubah.
     Bukti yang benar: state pemutar (2=jeda, 3=jalan) + AudioPlaybackConfiguration
     state:started + perbandingan isi tangkapan layar.
  3. Menghitung jendela overlay: grep "tvnotify-overlay" pada dumpsys window windows
     menghasilkan 3 baris per jendela (Window #, WindowStateAnimator, mSurface).
     3 baris = 1 jendela, 0 = tidak ada. Dipakai untuk membuktikan "tidak menumpuk".
  4. Percobaan pertama T6 kehabisan waktu tunggu alat uji (>7 menit) karena menunggu ADB
     TV naik. Bukan kegagalan TV; cukup tunggu dan cek ulang, jangan langsung menyimpulkan
     TV bermasalah.

## 5. Keadaan video dan keamanan saat ini

  - TV VIP-4: menyala, berada di layar pilih profil (kondisi sama seperti sebelum uji),
    tidak ada media yang sedang diputar.
  - Aplikasi com.happysong.tvnotify TERPASANG di VIP-4 (user 0) dengan izin overlay aktif.
    Ini disengaja supaya tahap integrasi bisa langsung diuji. Rollback = satu perintah
    `adb uninstall com.happysong.tvnotify` (terbukti bersih di T7).
  - Bridge tetap satu-satunya instansi yang jalan (PID 10872, /health ok). Tidak ada
    perubahan pada server.js / src bridge maupun POS.

## 6. Rekomendasi

  LANJUT ke tahap integrasi, urutannya:
    1. Bridge memegang jadwal: perluas countdownService supaya saat ruangan mulai / diperpanjang,
       bridge menyimpan jam berakhir dan memicu sendiri T-15, T-5, T-0 (overlay -> power_off).
       Termasuk retry + catat hasil tiap percobaan, karena power_off ADB bersifat best-effort.
    2. POS mengirim jadwal ke bridge pada start_session / perpanjang / tutup billing, lewat
       jalur server (bukan hanya browser kasir), supaya perintah tetap jalan walau tab kasir tertutup.
    3. Ambang teks dan durasi disamakan dengan bahasa kasir venue; harga perpanjang ikut di baris kecil.
    4. Sebelum dipasang ke TV lain: ukur presisi berapa lama ADB TV siap setelah dinyalakan
       (dipakai untuk menentukan jeda retry saat power_on), lalu ulangi pemasangan APK + izin
       + sekali uji di tiap TV (biaya per TV: satu kali kunjungan, sama seperti urusan IP statis).
