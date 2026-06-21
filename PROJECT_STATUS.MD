# PROJECT STATUS - Karaoke Management System

## Status Terakhir

### Fase 6D - User Role dan Admin PIN Protection
Status: PASS LOKAL

Hasil:
- Sheet `Employees` distandarkan dengan kolom `employee_id`, `employee_name`, `role`, `pin`, `status`, `created_at`, `updated_at`.
- Endpoint GET baru: `getEmployees` untuk menampilkan daftar akses tanpa membocorkan PIN.
- Endpoint POST baru: `validateAdminPin` untuk validasi PIN owner/admin dan audit `pin_validation`.
- Delete permanen Room, Menu F&B, dan Inventory kini wajib `admin_pin`; backend menolak tanpa PIN owner/admin valid.
- Audit akses memakai `entity_type=access`, `action_type=pin_validation`, dan tidak menyimpan PIN.
- UI tab Pengaturan menambahkan section `Pengaturan Akses`.
- Modal PIN admin reusable memakai input password stabil dan tidak me-render ulang modal setiap keypress.
- Aksi sensitif edit tarif room, edit harga menu, dan status maintenance room meminta PIN owner/admin sebelum simpan.

Catatan:
- `Code.gs` berubah; `clasp push` dan deploy production existing sudah dilakukan.
- Deployment ID tetap `AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1`.
- Deploy Apps Script version 39.
- Smoke test production: health OK, getEmployees OK tanpa PIN, status employee kosong ternormalisasi `active`, PIN contoh ditolak `INVALID_PIN`, delete tanpa PIN ditolak `INVALID_ADMIN_PIN`, audit akses tercatat tanpa PIN.
- Audit log append memakai `LockService` agar `log_id` tidak tabrakan saat request paralel.
- PIN masih plain text di sheet untuk fase ini; perlu hashing/salting di fase security hardening berikutnya.
- PASS FINAL menunggu validasi browser UI dan test PIN valid dengan data employee production.

---

### Fase 6C - Master Data Quality Cleanup
Status: PASS LOKAL

Hasil:
- Section `Master Data Quality & Cleanup` ditambahkan di tab Pengaturan setelah Audit Log Master Data.
- Deteksi issue Room, Menu F&B, dan Inventory dari data frontend existing (`getRooms`, `getMenuItems`, `getInventoryItems`).
- Summary card: total issue, issue per entity, data TEST/QA, duplikat nama, field kosong, dan cleanup candidate.
- Tabel issue menampilkan tipe, ID, nama, issue, severity, rekomendasi, dan aksi.
- Aksi `Edit` memakai form master data existing.
- Aksi `Delete Permanen` memakai modal delete Fase 6B yang input `HAPUS`-nya sudah stabil.
- Fase frontend-only; `Code.gs` tidak berubah.

Catatan:
- Tidak perlu `clasp push` dan tidak perlu deploy Apps Script.
- PASS FINAL menunggu validasi browser UI dan test cleanup manual.

---

### Fase 6B - Audit Log Master Data dan Delete Permanen
Status: PASS LOKAL + DEPLOYED

Hasil:
- Sheet baru `MasterDataAuditLogs` ditambahkan via backend helper.
- Endpoint GET baru: `getMasterDataAuditLogs`.
- Endpoint POST baru: `deleteRoomMaster`, `deleteMenuMaster`, `deleteInventoryMaster`.
- Endpoint 6A (`save/update` room/menu/inventory) kini mencatat audit create/update/status change.
- Delete permanen menolak data yang punya histori transaksi/order/mutasi/log dan mencatat `delete_blocked`.
- UI tab Pengaturan menambahkan tombol `Delete Permanen`, modal konfirmasi wajib ketik `HAPUS`, dan section `Audit Log Master Data`.
- Audit log UI menampilkan 100 log terbaru dengan filter entity/action dan badge action/result.
- Fix frontend: input konfirmasi `HAPUS` tidak lagi memicu render ulang modal setiap keypress; tombol delete ditoggle langsung via DOM ringan.

Catatan:
- `Code.gs` berubah; `clasp push` dan deploy production existing sudah dilakukan.
- Deployment ID tetap `AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1`.
- Deploy Apps Script version 36.
- Smoke test production: health OK, get audit OK, create/delete room test OK, create/delete menu test OK, delete inventory blocked saat dipakai menu OK.
- PASS FINAL menunggu validasi browser UI dan cleanup/tinjauan data test inventory `ITEM-002` jika diperlukan.

---

### Fase 6A - Master Data Management
Status: PASS LOKAL + DEPLOYED

Hasil:
- Tab baru `Pengaturan` ditambahkan ke dashboard.
- Section: Pengaturan Ruangan, Pengaturan Menu F&B, Pengaturan Inventory.
- UI tambah/edit master data dengan form inline, tabel responsive, badge status, dan reload data setelah save.
- Backend POST baru: `saveRoomMaster`, `updateRoomMaster`, `saveMenuMaster`, `updateMenuMaster`, `saveInventoryMaster`, `updateInventoryMaster`.
- ID generation berurutan: `ROOM-###`, `MENU-###`, `ITEM-###`.
- Validasi dasar backend untuk room, menu, dan inventory.
- Guard room occupied: status room occupied tidak bisa diubah dari menu Pengaturan.
- POST frontend tetap `Content-Type: text/plain;charset=utf-8`.

Catatan:
- `Code.gs` berubah; `clasp push` dan deploy production existing sudah dilakukan.
- Deployment ID tetap `AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1`.
- Deploy Apps Script version 35.
- PASS FINAL menunggu validasi browser UI dan tes tambah/edit data riil.

---

### Fase 5G - Room Occupancy & Utilization
Status: PASS LOKAL

Hasil:
- Section `Room Occupancy & Utilization` ditambahkan setelah Dashboard Owner di tab Laporan.
- Mengikuti filter periode laporan room (`roomUsagePeriodFilter`) sehingga data occupancy sinkron dengan laporan pemakaian room.
- Konstanta frontend: `OPERATIONAL_OPEN_HOUR = 17`, `OPERATIONAL_CLOSE_HOUR = 10`, `OPERATIONAL_WINDOW_MINUTES = 1020`.
- Card summary: total room aktif, total jam tersedia, total jam terpakai, occupancy rate, room terproduktif, room terendah pemakaian, revenue per jam, total session.
- Tabel per room: room, session, durasi, revenue room, utilization, revenue per jam, status analisis.
- Status analisis memakai badge: Tinggi, Sedang, Rendah, Belum Terpakai.
- Fallback angka aman agar tidak tampil NaN, undefined, null, atau RpNaN.
- `node --check js/app.js` PASS.

Catatan:
- Fase frontend-only; `Code.gs` tidak berubah.
- Tidak perlu `clasp push` dan tidak perlu deploy Apps Script.
- PASS FINAL menunggu validasi browser lokal/production oleh user.

---

### Fase UI-4 - Dashboard Summary Owner
Status: PASS LOKAL

Hasil:
- Section `Dashboard Owner` ditambahkan di tab Laporan.
- Summary shift aktif memakai `getRoomUsageReport?period=today`.
- Card: total revenue, revenue room, revenue F&B, paid/unpaid, total session, room terlaris, total durasi.
- Stok rendah dihitung dari `getInventoryItems` dengan filter `stock_qty <= min_stock` dan status bukan inactive.
- Sesi aktif dihitung dari `getRooms` dengan status `occupied`.
- Badge status untuk Paid, Unpaid, Stok Rendah, Room Occupied, dan Room Available.
- UI responsive desktop, tablet, dan mobile.
- `node --check js/app.js` PASS.

Catatan:
- Fase frontend-only; `Code.gs` tidak berubah.
- Tidak perlu `clasp push` dan tidak perlu deploy Apps Script.
- PASS FINAL menunggu validasi browser lokal/production oleh user.

---

### Fase 5F - Laporan Pemakaian Room & Revenue Shift
Status: PASS LOKAL

Hasil:
- Endpoint GET `getRoomUsageReport` dengan filter operational_date dari Transactions.
- Summary: total sesi, durasi, omzet room/F&B/grand, paid/unpaid, unique rooms, top room.
- Response `room_usage[]` (group per room) dan `transactions[]` (detail).
- UI panel di tab Laporan dengan filter shift sendiri (`roomUsagePeriodFilter`).
- Pagination: `roomUsage` dan `roomUsageTransactions`.
- `node --check js/app.js` PASS; syntax `Code.gs` PASS.

Catatan:
- `Code.gs` berubah; deploy Apps Script diperlukan sebelum test production.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy + validasi production.

---

### Fase UI-2B - Tanggal Operasional / Shift Karaoke
Status: PASS LOKAL

Hasil:
- Konsep `operational_date` dengan cutoff jam 10:00 (Asia/Jakarta), dihitung dinamis tanpa kolom sheet baru.
- Helper backend: `getOperationalCutoffHour_`, `getOperationalDateString_`, `getCurrentOperationalDateString_`, `getOperationalDateRangeForPeriod_`.
- Endpoint memakai operational_date: `getTodayTransactions`, `getTodayCashierClosings`, `getTodayFnbSalesReport`, `getTodayFnbOrders`, `getTodayStockMovements`, `getTodayRoomTimeLogs`.
- Response metadata: `operational_date_start`, `operational_date_end`, `operational_cutoff_hour`.
- UI label shift: Shift Aktif, Shift Kemarin, 7 Shift, Bulan Ini, Semua, Custom + catatan cutoff.
- `node --check js/app.js` PASS; syntax `Code.gs` PASS.

Catatan:
- `Code.gs` berubah; deploy Apps Script diperlukan sebelum test production.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy + validasi skenario lewat tengah malam.

---

### Fase UI-3 - Visual Polish Dashboard
Status: PASS LOKAL

Hasil:
- Design tokens CSS: spacing, radius, shadow, content max-width 1320px.
- Panel/card/list dirapikan di semua tab (Ruangan, F&B, Stok, Laporan, Transaksi, Audit).
- Badge system reusable `.status-badge` dengan tone success/warning/danger/info/neutral.
- Button system reusable `.btn` + variant primary/secondary/danger/ghost/sm.
- Form controls unified: focus ring, min-height, padding konsisten.
- Responsive diperhalus: desktop >1024px, tablet 768–1024px, mobile <768px.
- `node --check js/app.js` PASS; `Code.gs` tidak berubah.

Catatan:
- Fase frontend-only; tidak perlu deploy Apps Script.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu validasi visual user.

---

### Fase UI-2A - Filter Tanggal Transaksi & Closing
Status: PASS LOKAL

Hasil:
- Filter periode di tab Transaksi: Hari Ini (default), Kemarin, 7 Hari, Bulan Ini, Semua, Custom.
- Backend `getTodayTransactions` dan `getTodayCashierClosings` backward compatible dengan parameter `period`, `start_date`, `end_date`.
- Filter tanggal transaksi: `created_at` → fallback `end_time` → fallback `start_time` (timezone Jakarta).
- Filter tanggal closing: `closing_date` → fallback `created_at`.
- Summary omzet, rekap kasir, dan riwayat closing mengikuti periode terpilih.
- Filter status (Semua / Lunas / Belum Dibayar) dan pagination UI-2 tetap berjalan.
- Empty state dinamis: "Belum ada transaksi pada periode ini."
- `node --check js/app.js` PASS; syntax `Code.gs` PASS.

Catatan:
- `Code.gs` berubah; deploy Apps Script diperlukan sebelum test production.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy + validasi production (terutama skenario lewat tengah malam).

---

### Fase UI-2 - Pagination List & Table Dashboard
Status: PASS LOKAL

Hasil:
- Pagination client-side default 15 item per halaman.
- Helper reusable: `getPaginatedSlice`, `createPaginationControlsElement`, `resetPaginationPage`, `clampPaginationPage`.
- Diterapkan ke 9 list: open F&B, riwayat order F&B, inventory, mutasi stok, penjualan menu, stok rendah, transaksi, cashier closing, room time logs.
- Pagination tersembunyi jika data <= 15.
- Filter reset halaman ke 1; refresh data mem-clamp halaman aktif.
- Backend tidak berubah.

Catatan:
- Fase frontend-only; `Code.gs` tidak berubah.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu validasi visual user.

---

### Fase UI-1 - Modular Tab Layout Dashboard
Status: PASS LOKAL

Hasil:
- Dashboard memakai 6 tab: Ruangan, F&B, Stok, Laporan, Transaksi, Audit.
- Default tab aktif: Ruangan.
- Tab terakhir disimpan di `localStorage` (`karaoke_active_dashboard_tab`).
- Konten tab tidak aktif disembunyikan; hanya modul aktif yang dirender.
- Refresh ringan saat pindah tab memakai fungsi load existing.
- Pesan global, ringkasan tagihan, dan struk tetap di area atas dashboard.
- Semua fitur bisnis existing tetap berjalan tanpa perubahan backend.

Catatan:
- Fase frontend-only; `Code.gs` tidak berubah.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu validasi visual user.

---

### Fase 5E - Audit Log Tambah Waktu Room
Status: PASS LOKAL

Hasil:
- Sheet `RoomTimeLogs` dibuat otomatis jika belum ada.
- `extendSession` menulis audit log `extend_session` setelah extend berhasil.
- Log mencatat durasi lama/baru, jadwal selesai lama/baru, add_minutes, kasir, dan note.
- Jika penulisan log gagal, perubahan durasi dibatalkan dengan error jelas.
- GET `getTodayRoomTimeLogs` dengan filter `room_id` dan `action_type`.
- Panel `Riwayat Tambah Waktu Room Hari Ini` dengan summary dan filter per room.
- Form tambah waktu punya field catatan opsional.
- `start_time` tidak berubah; billing Fase 5D, F&B, stok, payment, closing tidak berubah.

Catatan:
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy backend dan uji production.

---

### Fase 4M - Laporan Penjualan F&B & Stok Rendah
Status: PASS LOKAL

Hasil:
- Panel `Laporan Penjualan F&B & Stok Rendah` tersedia di dashboard.
- Endpoint GET `getTodayFnbSalesReport` membaca `FnbOrders` billed hari ini, `FnbOrderItems`, dan `Inventory`.
- Ringkasan: total order, item terjual, omzet F&B, menu terlaris, stok rendah, stok minus.
- Penjualan per menu di-group dan diurutkan dari qty terbesar.
- Stok rendah/minus dengan `suggested_restock_qty` dan rekomendasi restock.
- Panel read-only; tidak mengubah stok.
- Laporan refresh otomatis setelah `closeSession` dan restock/koreksi sukses.
- `closeSession`, `adjustInventoryStock`, `getTodayStockMovements`, billing, payment, dan closing tidak berubah.

Catatan:
- Recipe/BOM dipindahkan ke backlog optional.
- Prioritas saat ini adalah laporan penjualan F&B dan stok rendah.
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy backend dan uji production.

---

### Fase 4L - Riwayat Mutasi Stok F&B
Status: PASS LOKAL

Hasil:
- Panel `Riwayat Mutasi Stok Hari Ini` tersedia di area stok F&B.
- Endpoint GET `getTodayStockMovements` membaca `StockMovements` hari ini (tanggal Jakarta).
- Filter opsional: `stock_item_id`, `movement_type`, `reference_type`.
- Ringkasan total mutasi, masuk, keluar, dan koreksi tersedia.
- Mutasi restock tampil sebagai `Masuk`, closeSession F&B sebagai `Keluar`, koreksi sebagai `Koreksi`.
- Panel read-only; tidak mengubah stok.
- Riwayat refresh otomatis setelah restock/koreksi sukses.
- `closeSession`, `adjustInventoryStock`, billing, payment, dan closing tidak berubah.

Catatan:
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy backend dan uji production.

---

### Fase 4K - Restock / Adjustment Stok F&B
Status: PASS LOKAL

Hasil:
- Panel `Tambah / Koreksi Stok` tersedia di area `Stok F&B`.
- Restock (`adjustment_type = restock`) menambah stok dan mencatat `movement_type = in`.
- Koreksi stok (`adjustment_type = set_stock`) menyetel stok aktual dan mencatat `movement_type = adjustment`.
- Setiap perubahan stok menulis `StockMovements` sebelum mengubah `Inventory.stock_qty`.
- `Inventory.updated_at` ikut diperbarui.
- Item stok tidak aktif ditolak backend.
- `set_stock` ke nilai sama ditolak dengan `Stok tidak berubah.`
- Restock 0 atau negatif ditolak.
- Panel stok refresh setelah sukses.
- `closeSession` dan pengurangan stok F&B saat billing tidak berubah.

Catatan:
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy backend dan uji production.

---

### Fase 5A - Durasi Booking & Countdown Room
Status: PASS FINAL

Hasil:
- Kasir wajib memilih durasi saat Mulai Sesi.
- Pilihan durasi: 1 jam, 2 jam, 3 jam, custom minimal 15 menit.
- Room occupied menampilkan durasi, waktu mulai, waktu selesai, dan countdown.
- Room tetap occupied saat waktu habis.
- Kasir tetap harus klik Selesaikan Sesi.
- start_time tetap menjadi identitas sesi.
- booked_duration_minutes dan scheduled_end_time aktif.

---

### Fase 5B - Warning 10 Menit & Waktu Habis
Status: PASS FINAL

Hasil:
- Jika sisa waktu <= 10 menit, tampil warning: 10 Menit Lagi.
- Jika waktu habis, tampil status: Waktu Habis.
- Room tetap occupied.
- Tidak ada transaksi otomatis.
- Tidak ada F&B otomatis billed.
- Tidak ada stok otomatis berkurang.
- closeSession tetap manual.

---

### Fase 5C - Tambah Waktu / Extend Session
Status: PASS FINAL

Hasil:
- Room occupied punya tombol Tambah Waktu.
- Bisa tambah +30 menit, +1 jam, +2 jam, dan custom minimal 15 menit.
- Custom di bawah 15 menit ditolak.
- scheduled_end_time bertambah dari jadwal selesai lama.
- booked_duration_minutes ikut bertambah.
- start_time tidak berubah.
- Countdown mengikuti jadwal baru.
- Warning / Waktu Habis kembali normal setelah waktu ditambah.
- Room tetap occupied.
- closeSession tetap manual.
- F&B, stok, payment, transaksi, dan closing tetap aman.

---

### Fase 5D - Billing Berdasarkan Durasi Booking
Status: PASS FINAL

Hasil:
- closeSession menghitung tagihan room berdasarkan booked_duration_minutes.
- Booking 1 jam tetap ditagih 1 jam walau selesai lebih cepat.
- Tambah waktu ikut menambah durasi tagihan.
- Contoh test: durasi 90 menit, tarif Rp95.000/jam, biaya room Rp142.500.
- F&B tetap masuk tagihan.
- grand_total = room_total + fnb_total.
- Tidak ada overtime otomatis.
- Data lama fallback ke durasi aktual.
- F&B, stok, payment, transaksi, dan closing tetap aman.

---

### Bugfix F&B Dropdown Room
Status: PASS

Hasil:
- Room terisi bisa dipilih untuk Order F&B.
- Room kosong dan perbaikan tampil tapi disabled.
- Status room dinormalisasi.
- Backend tidak berubah.

---

## Catatan Penting

- start_time adalah jangkar sesi.
- Jangan mengubah start_time saat extend.
- F&B tetap terikat ke room_id + room_start_time.
- scheduled_end_time boleh berubah saat Tambah Waktu.
- Room tidak otomatis kosong saat waktu habis.
- Billing room memakai booked_duration_minutes untuk sesi booking valid.
- Sesi legacy tanpa booked_duration_minutes masih memakai durasi aktual.
- Stok manual wajib lewat StockMovements; jangan update Inventory tanpa movement.

---

## Backlog Optional

### Recipe/BOM F&B
- Di-skip dulu karena belum dibutuhkan untuk operasional karaoke saat ini.
- Bisa dipertimbangkan kembali jika kebutuhan menu komposit muncul.

---

## Next Phase

(TBD — fase berikutnya belum ditetapkan.)
