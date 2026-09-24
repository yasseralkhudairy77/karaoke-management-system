# Spesifikasi Desain: Menu Kontrol TV di Aplikasi POS

- Tanggal: 2026-09-24
- Status: Disetujui untuk Perencanaan Implementasi
- Penulis: Antigravity & Hermes
- Mode Antislop: DURING (berlaku sejak perancangan hingga implementasi)
- Dials Desain: ENERGY 1 / RHYTHM 1 / MOTION 1 (Tenang, presisi, minim motion, fungsional)

---

## 1. Latar Belakang dan Tujuan

Aplikasi POS Happy Song membutuhkan antarmuka terpusat untuk mengelola perangkat TV di setiap ruangan karaoke. Sebelumnya, konfigurasi perangkat (IP, MAC, port ADB) hanya tersimpan statis pada berkas `config/rooms.json` di bridge TV lokal, sehingga kasir atau pemilik tidak dapat memantau status fisik perangkat secara riil tanpa membuka terminal.

Tujuan utama fitur ini:
1. Menghadirkan sub-tab baru "Kontrol TV" di dalam tab menu Pengaturan (Settings) yang dilindungi oleh autentikasi PIN Owner/Admin.
2. Menjadikan database POS (tabel `tv_devices`) sebagai satu-satunya sumber kebenaran (single source of truth) untuk pengaturan TV.
3. Menyediakan kontrol penuh dan pemantauan status perangkat yang jujur (berdasarkan bukti riil `dumpsys power` dan ADB, bukan klaim palsu).
4. Menjaga keamanan sistem dengan merutekan seluruh komunikasi kontrol TV melalui backend Express POS (`/exec`), menjaga kerahasiaan token bridge, dan mencatat seluruh audit jejak di `tv_control_logs`.

---

## 2. Perubahan Skema Database

### 2.1 Skema Tabel `tv_devices`
Menambahkan kolom baru pada tabel `tv_devices` di `server/src/db/schema.sql` serta skrip migrasi runtime:

```sql
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
```

### 2.2 Aturan Validasi dan Integritas Database
1. Satu Ruangan Satu Baris Aktif: ID perangkat dibakukan menjadi `TV-<room_id>` (contoh: `TV-ROOM-004`).
2. Normalisasi MAC Address: Format MAC wajib disimpan dalam huruf kecil dengan pemisah titik dua `:` (contoh: `74:81:9a:ff:72:be`).
3. Validasi IP: Format IPv4 valid tanpa spasi.
4. Migrasi Nilai Lama: Jika `tv_mac` masih kosong namun `device_identifier` memuat format MAC valid, nilai tersebut disalin otomatis ke `tv_mac`. Kolom `device_identifier` tetap dipertahankan sebagai cadangan kompatibilitas.
5. Foreign Key: Tabel `tv_control_logs.tv_device_id` merujuk ke `tv_devices.tv_device_id`. Seluruh pencatatan log wajib memastikan ID perangkat valid sebelum eksekusi insert.

---

## 3. Kontrak API Server POS (`/exec`)

Semua aksi baru didaftarkan pada handler Express di `server/src/routes/api.js` (pada `handleGetAction` dan `handlePostAction`) dan diimplementasikan di `server/src/controllers/tvController.js`.

### 3.1 Aksi GET Baru: `getTvRoomOverview`
Mengembalikan status terpadu seluruh ruangan yang memadukan data tabel `rooms`, konfigurasi `tv_devices`, dan diagnosa langsung dari bridge TV.

Format Respon Sukses:
```json
{
  "ok": true,
  "success": true,
  "rooms": [
    {
      "room_id": "ROOM-004",
      "room_name": "VIP-4",
      "tv_device_id": "TV-ROOM-004",
      "device_name": "TV VIP-4",
      "control_type": "middleware",
      "status": "active",
      "tv_ip": "192.168.1.104",
      "tv_mac": "74:81:9a:ff:72:be",
      "adb_port": 5555,
      "adb_timeout_ms": 15000,
      "wol_broadcast": "192.168.1.255",
      "notify_package": "com.happysong.tvnotify",
      "notes": "Ethernet statis",
      "middleware_url": "http://127.0.0.1:3030",
      "bridge_url": "http://127.0.0.1:3030",
      "bridge_reachable": true,
      "device_connected": true,
      "wakefulness": "Awake",
      "mac_matches_arp": "cocok",
      "arp_mac": "74:81:9a:ff:72:be",
      "last_checked_at": "2026-09-24T07:15:00.000Z",
      "last_check_result": "ok",
      "last_check_message": "Perangkat terhubung dan layar menyala",
      "masalah": []
    }
  ]
}
```

Jika ada anomali atau data belum lengkap, array `masalah` memuat daftar penjelasan jelas (contoh: `["Alamat MAC belum diisi", "Tunnel middleware mati (lhr.life)"]`).

### 3.2 Aksi POST Baru (Wajib Proteksi `admin_pin`)
Setiap payload POST wajib menyertakan `admin_pin` yang divalidasi oleh `validateAdminPin`. Seluruh percobaan dicatat ke `tv_control_logs` dengan `trigger_source = 'kontrol_tv_ui'`.

1. `saveTvDeviceSettings`:
   - Menerima konfigurasi perangkat ruangan.
   - Melakukan validasi format IP & MAC.
   - Menyimpan ke tabel `tv_devices`.
   - Mengirimkan pembaruan konfigurasi ke bridge TV lokal melalui REST endpoint `PUT /api/rooms/:id/config`.
2. `checkTvDevice`:
   - Meminta bridge TV memeriksa ping, ARP, status ADB, dan `dumpsys power` untuk satu ruangan.
   - Memperbarui kolom `last_checked_at`, `last_check_result`, dan `last_check_message` di database.
   - Mengembalikan hasil status terkini.
3. `testTvDevice`:
   - Mengirimkan perintah uji konektivitas ADB ke bridge TV.
4. `wakeTvDevice`:
   - Mengirimkan instruksi penyalaan TV (paket WoL magic packet disusul ADB keyevent 224).
5. `sleepTvDevice`:
   - Mengirimkan instruksi peniduran TV (ADB keyevent 223 setelah pengecekan status layar).
6. `notifyTvDevice`:
   - Mengirimkan teks overlay notifikasi ke layar TV (`text`, `subtext`, `seconds`).
7. `reloadTvBridgeConfig`:
   - Meminta bridge TV memuat ulang berkas `config/rooms.json` ke memori runtime.

---

## 4. Integrasi TV Control Bridge

Sesuai Opsi 1 (rekomendasi Bagian 7.3a dokumen Hermes):
1. Menambahkan endpoint `PUT /api/rooms/:id/config` pada `middleware/tv-control-bridge/server.js`:
   - Menerima pembaruan data konfigurasi ruangan (`ip`, `mac`, `adbPort`, `wolBroadcast`, dll.).
   - Menulis perubahan ke berkas `config/rooms.json` secara aman menggunakan skema file sementara (`rooms.json.tmp`) sebelum di-rename.
   - Memperbarui state cache memori di `src/roomConfig.js` tanpa memerlukan restart proses bridge.
2. Endpoint `POST /api/config/reload`:
   - Memuat ulang isi `config/rooms.json` dari disk ke memori runtime.
3. Sinkronisasi Cermin Kode:
   - Menjalankan `tools/tvbridge-sync.ps1` untuk menjaga keselarasan cermin kode di `middleware/tv-control-bridge/` dengan folder kerja bridge.

---

## 5. Rancangan Antarmuka Pengguna (UI)

### 5.1 Penempatan dan Aksesibilitas
- Lokasi: Sub-tab "Kontrol TV" di dalam tab Pengaturan Sistem (Settings).
- Keamanan: Mengikuti alur modal konfirmasi PIN Owner/Manager saat pertama kali membuka sub-tab atau saat mengeksekusi perubahan.
- Status aktif sub-tab disimpan di `localStorage` sehingga tidak reset saat halaman di-refresh.
- Peningkatan cache buster pada `index.html` (`js/app.js?v=tv-control-v1`).

### 5.2 Tiga Bagian Komponen Utama
1. Tabel Status Ruangan (13 Ruangan Bridge):
   - Kolom: Ruangan, Nama Perangkat, Tipe, Alamat IP, Alamat MAC, Status ADB, Status Layar, Validitas ARP, Terakhir Dicek, Aksi.
   - Indikator Status Jujur:
     - ADB: Lencana Hijau "Tersambung" / Lencana Merah "Terputus" / Lencana Abu "Belum Dicek".
     - Layar: "Menyala" (Awake) / "Tidur" (Asleep) / "Screensaver" (Dreaming/Dozing) / "Tidak Diketahui".
     - Kolom Masalah: Menampilkan badge kuning/merah jika ada kendala (misal: tunnel mati TV-002, MAC belum terisi).
   - Tombol Aksi per Baris: "Cek", "Nyalakan", "Matikan", "Uji ADB", "Kirim Pesan", "Edit".
   - Toolbar Atas: Tombol "Periksa Semua Perangkat" dengan status progress loading yang jelas.
2. Modal Form Pengaturan TV:
   - Pilihan Ruangan (dropdown dari daftar ruangan aktif).
   - Nama Perangkat & Tipe Kontrol (`middleware` atau `mock`).
   - Input Alamat IP & Alamat MAC dengan petunjuk format di bawah kolom.
   - Pengaturan Port ADB (default 5555), Batas Waktu ADB (ms), Alamat WoL Broadcast, Paket Notifikasi, dan Catatan.
   - Tombol "Uji Perangkat Ini" di dalam modal untuk memastikan koneksi sebelum tombol "Simpan Pengaturan" ditekan.
   - Kolom `middleware_url` diisi otomatis oleh server (menunjuk bridge lokal) guna mencegah kesalahan ketik URL.
3. Panel Riwayat Perintah TV:
   - Memuat data log dari `getTvControlLogs`.
   - Menampilkan: Waktu, Ruangan, Aksi, Pemicu, Operator, Status (Berhasil/Gagal), dan Pesan Respon.
   - Paginasi interaktif dengan filter berdasarkan ruangan.

---

## 6. Kriteria Penerimaan dan Rencana Pengujian

1. Sub-tab "Kontrol TV" tampil sempurna di tab Pengaturan, dapat berpindah antar sub-tab tanpa merusak sub-tab lain, dan statusnya bertahan saat halaman dimuat ulang.
2. Seluruh 13 ruangan terdaftar pada tabel dengan status jujur dari bridge. Ruangan VIP-4 terbaca terhubung, menampilkan wakefulness sesuai kondisi fisik, dan MAC cocok dengan entri ARP.
3. Ruangan TV-002 (tunnel lhr.life mati) ditampilkan secara eksplisit dengan penanda masalah.
4. Penyimpanan data via form modal berhasil memperbarui database `tv_devices` dan file `config/rooms.json` di bridge.
5. Percobaan perintah nyala/mati/uji/peringatan tercatat rapi di tabel `tv_control_logs` dengan `trigger_source = 'kontrol_tv_ui'`.
6. Seluruh aksi POST menolak payload tanpa PIN owner/admin yang sah.
7. Lulus pemeriksaan sintaks `node --check js/app.js` tanpa galat.
8. Tidak ada token rahasia atau berkas `.env` yang masuk ke dalam komit git.
9. Pembaruan ringkas dicatat pada berkas `middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md`.
