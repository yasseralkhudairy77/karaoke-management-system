# Catatan Kemajuan Pekerjaan: Integrasi Menu Kontrol TV

Dokumen ini disusun sebagai laporan serah terima pekerjaan integrasi Menu Kontrol TV antara aplikasi POS Karaoke Management System dan TV Control Bridge lokal, mengacu pada pedoman `RENCANA-MENU-KONTROL-TV.md`.

---

## 1. Ringkasan Pekerjaan yang Telah Diselesaikan

1. **Pembaruan Skema Database POS (`tv_devices`):**
   - Menambahkan 10 kolom konfigurasi dan diagnosa: `tv_ip`, `tv_mac`, `adb_port`, `adb_timeout_ms`, `wol_broadcast`, `notify_package`, `notes`, `last_checked_at`, `last_check_result`, dan `last_check_message`.
   - Mengimplementasikan fungsi migrasi otomatis `ensureTvDevicesTableSchema()` di `server/src/db/index.js` agar kolom baru dibuat secara otomatis jika belum ada.
   - Database POS berperan sebagai *single source of truth*.

2. **Endpoint Pembaruan Konfigurasi Bridge (Pilihan Kontrak 7.3a):**
   - Mengimplementasikan `PUT /api/rooms/:roomId/config` dan `POST /api/config/reload` di `middleware/tv-control-bridge/server.js`.
   - Menambahkan fungsi `updateRoomConfig(roomId, updates)` dan `reloadRoomConfig()` di `middleware/tv-control-bridge/src/roomConfig.js` yang memperbarui data memori dan menyimpan berkas JSON konfigurasi secara atomik.
   - Pilihan kontrak yang digunakan adalah **Opsi 1 / Kontrak 7.3a**: POS mengirim data konfigurasi ke bridge setiap kali ada perubahan di POS.

3. **Backend API POS Server:**
   - Menyediakan aksi GET: `getTvRoomOverview` (menggabungkan data DB, status bridge, dan ARP scan) dan `getTvControlLogs` (mengambil catatan audit riwayat).
   - Menyediakan aksi POST: `saveTvDeviceSettings`, `checkTvDevice`, `testTvDevice`, `wakeTvDevice`, `sleepTvDevice`, `notifyTvDevice`, dan `reloadTvBridgeConfig`.
   - Menambahkan proteksi validasi PIN Owner/Manager (`verifyAdminPinPayload`) pada seluruh aksi pengubahan konfigurasi dan pengiriman perintah daya/pesan.
   - Normalisasi format MAC address otomatis (`normalizeMac`) dan validasi format IPv4 (`isValidIpv4`).

4. **Antarmuka Pengguna POS (Frontend):**
   - Menambahkan sub-tab "Kontrol TV" di bawah tab menu Pengaturan (Settings) POS.
   - Default tampilan difokuskan pada 9 ruangan aktif operasional (VIP-1 s/d VIP-8 dan Executive/ROOM-009), dilengkapi tombol toggle untuk melihat seluruh ruangan.
   - Menampilkan tabel status lengkap: Nama Ruangan, Tipe Kontrol, IP TV, MAC TV, Status Sambungan ADB, Status Layar (Menyala/Tidur/Screensaver), Kesesuaian ARP MAC, dan Kolom Masalah/Diagnosa.
   - Modal Konfigurasi Perangkat TV ("+ Tambah / Konfigurasi Ruangan Baru" dan "Edit") dengan tombol "Uji Sambungan Sekarang" langsung di dalam modal.
   - Modal Kirim Pesan Overlay TV dengan pilihan teks utama, subteks, dan durasi penayangan banner tanpa mengganggu lagu.
   - Quick Action per baris: "Cek", "Nyalakan", "Matikan", "Uji ADB", "Pesan", dan "Edit" yang terhubung dengan otorisasi dialog PIN admin POS.
   - Panel Riwayat Log & Aktivitas TV berpaginasi (10 baris per halaman) dilengkapi filter per ruangan dan tombol refresh data.

5. **Cache Versioning:**
   - Memperbarui tag script `js/app.js` pada `index.html` menjadi `js/app.js?v=tv-control-v1` untuk memastikan browser kasir langsung memuat antarmuka terbaru.

---

## 2. Berkas yang Disentuh / Dimodifikasi

| Komponen | Berkas | Deskripsi Perubahan |
| :--- | :--- | :--- |
| **Database** | `server/src/db/schema.sql` | Penambahan 10 kolom konfigurasi & diagnosa di tabel `tv_devices`. |
| **Database** | `server/src/db/index.js` | Fungsi migrasi skema tabel otomatis saat start backend. |
| **Bridge** | `middleware/tv-control-bridge/src/roomConfig.js` | Fungsi `updateRoomConfig` & `reloadRoomConfig`. |
| **Bridge** | `middleware/tv-control-bridge/server.js` | Rute `PUT /api/rooms/:roomId/config` & `POST /api/config/reload`. |
| **POS Backend** | `server/src/services/tvBridgeService.js` | Fungsi `updateBridgeRoomConfig`, `reloadBridgeConfig`, dan `getBridgeRoomStatus`. |
| **POS Backend** | `server/src/controllers/tvController.js` | Implementasi `getTvRoomOverview`, `saveTvDeviceSettings`, `checkTvDevice`, `testTvDevice`, `wakeTvDevice`, `sleepTvDevice`, `notifyTvDevice`, `reloadTvBridgeConfig`, `getTvControlLogs`. |
| **POS Backend** | `server/src/routes/api.js` | Pendaftaran seluruh rute aksi GET & POST baru. |
| **POS Frontend** | `js/app.js` | Sub-tab Kontrol TV, modal form edit, modal pesan overlay, event handlers, dan panel tabel riwayat log. |
| **POS Frontend** | `index.html` | Pembaruan cache buster script ke `v=tv-control-v1`. |

---

## 3. Pilihan Kontrak Sinkronisasi

Sesuai bagian 7.3 dokumen instruksi, kontrak yang dipilih dan diimplementasikan adalah:
- **Kontrak 7.3a (Opsi 1: POS Memanggil Bridge):**
  - Endpoint: `PUT /api/rooms/:roomId/config` pada bridge.
  - Setiap kali operator menyimpan pengaturan TV di POS, POS mengupdate tabel `tv_devices` di PostgreSQL lalu mengirim payload konfigurasi ke bridge.
  - Bridge langsung memperbarui status di memori dan menyimpan ke disk tanpa perlu me-restart proses bridge.

---

## 4. Item Tindak Lanjut / Hal yang Belum Dilakukan di Lapangan

Pekerjaan implementasi kode aplikasi POS dan bridge telah 100% selesai dan terverifikasi uji otomatis. Langkah selanjutnya yang perlu dilakukan oleh tim teknis di lokasi venue:
1. **Pemasangan APK Notifikasi Overlay:**
   - Memasang APK `com.happysong.tvnotify` pada 8 TV lainnya di venue (selain pilot room VIP-4 yang sudah siap).
2. **Konfirmasi IP Statis dan MAC TV Fisik:**
   - Memastikan seluruh TV Android terhubung ke jaringan LAN yang sama dengan TV Control Bridge dan memiliki IP statis atau reservasi DHCP.
3. **Penyalaan Awal:**
   - Menjalankan perintah `adb connect <ip>:5555` dari server bridge dan mengonfirmasi dialog otorisasi USB debugging di layar TV fisik jika baru pertama kali dipasangkan.
