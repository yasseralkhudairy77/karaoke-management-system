# Dashboard Kasir Karaoke

<!--
  Dokumentasi scaffold dashboard statis.
  TODO: Update bagian integrasi ketika Google Apps Script API mulai menggantikan mock-data.js.
-->

Scaffold awal web app statis untuk dashboard kasir karaoke. Project ini memakai HTML, CSS, dan JavaScript murni tanpa framework, tanpa dependency npm, dan tanpa proses build.

Field teknis tetap memakai format database seperti `room_id`, tetapi teks yang tampil ke pengguna memakai Bahasa Indonesia.

## Fase UI-1 - Modular Tab Layout Dashboard

Dashboard kini memakai navigasi tab modular, bukan satu halaman panjang. Tab terakhir yang dibuka disimpan di `localStorage` (`karaoke_active_dashboard_tab`).

| Tab | Isi modul |
| --- | --- |
| Ruangan | Kartu room, mulai sesi, countdown, tambah waktu, selesaikan sesi |
| F&B | Menu, keranjang, order, open order, riwayat order hari ini |
| Stok | Inventory, restock/koreksi, riwayat mutasi stok |
| Laporan | Dashboard Owner, room occupancy, laporan penjualan F&B & stok rendah, laporan pemakaian room |
| Transaksi | Riwayat transaksi, payment, cashier closing, struk |
| Audit | Riwayat tambah waktu room hari ini |
| Pengaturan | Master data ruangan, menu F&B, inventory, dan TV Integration |

Fase ini **frontend-only**. `apps-script/Code.gs` tidak berubah, sehingga tidak perlu deploy Apps Script setelah update UI ini.

## Fase UI-2 - Pagination List & Table Dashboard

List dan tabel panjang di dalam tab kini memakai pagination client-side.

- Default: **15 data per halaman**
- Pagination hanya tampil jika data lebih dari 15 item
- Tombol: `Sebelumnya` / `Berikutnya`
- Info: `Menampilkan x-y dari z data · Halaman n dari m`
- Filter mengembalikan halaman ke 1
- Backend tidak berubah; tidak perlu deploy Apps Script

List yang dipagination: Open Order F&B, Riwayat Order F&B, Inventory, Riwayat Mutasi Stok, Penjualan per Menu, Stok Rendah, Riwayat Transaksi, Riwayat Closing, Riwayat Tambah Waktu Room.

## Fase UI-2A - Filter Tanggal Transaksi & Closing

Tab Transaksi kini memiliki filter periode agar kasir/admin bisa melihat transaksi di luar hari kalender saat ini — berguna untuk operasional karaoke yang lewat tengah malam.

- Default: **Hari Ini**
- Pilihan: **Kemarin**, **7 Hari**, **Bulan Ini**, **Semua**, **Custom** (tanggal mulai & akhir)
- Summary omzet, rekap kasir, dan riwayat closing mengikuti periode terpilih
- Filter status transaksi (Semua / Lunas / Belum Dibayar) tetap berjalan di atas data periode
- Pagination UI-2 tetap aktif; ganti periode mengembalikan halaman ke 1

Backend (`getTodayTransactions`, `getTodayCashierClosings`) menerima parameter opsional `period`, `start_date`, `end_date`. Tanpa parameter, perilaku lama (hari ini) tetap berlaku.

**Perlu deploy Apps Script** setelah update `apps-script/Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase UI-2A - Filter Tanggal Transaksi"
```

## Fase UI-3 - Visual Polish Dashboard

Fase ini merapikan tampilan dashboard secara visual tanpa mengubah logic bisnis atau backend.

- Spacing antar panel dan section lebih konsisten
- Card/panel dengan border radius, shadow halus, dan padding seragam
- Badge status reusable (`.status-badge`) untuk room, transaksi, F&B, stok, audit
- Tombol lebih konsisten (primary / secondary / danger / ghost)
- Form input, select, textarea, dan date filter lebih nyaman
- Responsive diperhalus untuk desktop, tablet (768–1024px), dan mobile (<768px)

Fase **frontend-only**; `apps-script/Code.gs` tidak berubah — **tidak perlu deploy Apps Script**.

## Fase UI-4 - Dashboard Summary Owner

Tab **Laporan** kini menampilkan section **Dashboard Owner** di bagian atas agar owner bisa membaca kondisi shift aktif tanpa membuka tabel panjang.

- Total Revenue Shift Aktif, Revenue Room, Revenue F&B
- Paid Revenue dan Unpaid Revenue dengan badge status
- Total Session, Room Terlaris, Total Durasi Room
- Stok Rendah dari `getInventoryItems`
- Sesi Aktif dari `getRooms`
- Summary utama dari `getRoomUsageReport?period=today`
- Tetap mengikuti tanggal operasional karaoke dengan cutoff jam 10:00 pagi

Fase **frontend-only**. `apps-script/Code.gs` tidak berubah, sehingga **tidak perlu `clasp push` dan tidak perlu deploy Apps Script**.

## Fase 6A - Master Data Management

Dashboard menambahkan tab **Pengaturan** untuk mengelola master data langsung dari UI.

- Pengaturan Ruangan: tambah room, edit room, ubah status aman tanpa mengubah `start_time`, `booked_duration_minutes`, atau `scheduled_end_time`.
- Pengaturan Menu F&B: tambah/edit menu, aktif/nonaktif menu, mapping `stock_item_id` dan `qty_per_unit`.
- Pengaturan Inventory: tambah/edit item inventory, aktif/nonaktif item, edit `min_stock`; restock tetap lewat fitur Stok.
- Backend POST baru: `saveRoomMaster`, `updateRoomMaster`, `saveMenuMaster`, `updateMenuMaster`, `saveInventoryMaster`, `updateInventoryMaster`.
- POST frontend tetap memakai `Content-Type: text/plain;charset=utf-8`.

Perlu `clasp push` dan deploy Apps Script production existing setelah perubahan `apps-script/Code.gs`.

## Fase 6B - Audit Log Master Data dan Delete Permanen

Tab **Pengaturan** menambahkan audit log dan delete permanen aman untuk master data.

- Sheet baru `MasterDataAuditLogs` mencatat create, update, activate/deactivate, maintenance, delete sukses, dan delete ditolak.
- Endpoint audit: `getMasterDataAuditLogs`.
- Endpoint delete permanen: `deleteRoomMaster`, `deleteMenuMaster`, `deleteInventoryMaster`.
- Delete room ditolak jika room `occupied` atau sudah punya histori `Transactions`, `FnbOrders`, atau `RoomTimeLogs`.
- Delete menu ditolak jika sudah pernah masuk `FnbOrderItems`.
- Delete inventory ditolak jika masih dipakai `Menu` atau sudah punya `StockMovements`.
- UI delete memakai konfirmasi berlapis dan user wajib mengetik `HAPUS`.
- Audit log tampil di bawah section master data dengan filter entity/action.

Perlu `clasp push` dan deploy Apps Script production existing setelah perubahan `apps-script/Code.gs`.

## Fase 6C - Master Data Quality Cleanup

Tab **Pengaturan** menambahkan section **Master Data Quality & Cleanup** setelah Audit Log Master Data.

- Deteksi data `TEST`, `QA`, `DUMMY`, `SAMPLE`, dan `COBA`.
- Deteksi nama duplikat, field wajib kosong, harga/tarif tidak valid, status invalid, dan mapping stok bermasalah.
- Deteksi inventory tidak dipakai menu mana pun dan inventory inactive yang masih dipakai menu active.
- Menampilkan summary issue dan tabel issue dengan badge severity.
- Tombol aksi manual memakai form edit existing dan modal delete permanen aman dari Fase 6B.
- Delete cleanup tetap diputuskan backend lewat endpoint delete aman.

Fase **frontend-only**. `apps-script/Code.gs` tidak berubah, sehingga **tidak perlu `clasp push` dan tidak perlu deploy Apps Script**.

## Fase 6D - User Role dan Admin PIN Protection

Tab **Pengaturan** kini memiliki proteksi PIN owner/admin untuk aksi master data sensitif.

- Sheet `Employees` memakai kolom `employee_id`, `employee_name`, `role`, `pin`, `status`, `created_at`, `updated_at`.
- Endpoint `getEmployees` mengembalikan daftar employee tanpa PIN untuk section **Pengaturan Akses**.
- Endpoint `validateAdminPin` menerima `pin`, `required_role`, `requested_action`, dan `changed_by`.
- Status employee kosong dinormalisasi sebagai `active` untuk kompatibilitas data lama.
- Role `owner` selalu diizinkan, `admin` diizinkan untuk akses admin, sedangkan `cashier` dan `staff` ditolak untuk aksi admin.
- Delete permanen Room, Menu F&B, dan Inventory wajib mengirim `admin_pin` dan tetap dijaga ulang di backend.
- Edit tarif room, edit harga menu, dan perubahan status maintenance room meminta PIN owner/admin di frontend.
- Semua percobaan PIN dicatat ke `MasterDataAuditLogs` sebagai `entity_type=access` dan `action_type=pin_validation` tanpa menyimpan PIN.
- Penulisan audit log memakai lock agar `log_id` tetap unik saat request paralel.
- Modal PIN memakai input password stabil, tidak menyimpan PIN di `localStorage`, dan tidak menulis PIN ke console.

PIN masih disimpan plain text di sheet untuk fase ini. Fase security berikutnya perlu mengganti penyimpanan PIN menjadi hash + salt dan menambahkan prosedur reset PIN.

Perlu `clasp push` dan deploy Apps Script production existing setelah perubahan `apps-script/Code.gs`.

## Fase 7A-0 - TV Control Foundation

Card room menampilkan kontrol TV mock per mapping `TVDevices`:

- Tombol TEST / TV ON / TV OFF di card room (owner, admin, cashier)
- TV OFF memakai modal konfirmasi
- Room tanpa mapping menampilkan "TV belum disetting"
- `middleware_url` dan `device_identifier` tidak ditampilkan di card room
- Command dicatat ke sheet `TVControlLogs`
- Pesan sukses: "Perintah TV berhasil dikirim" (bukan "TV berhasil menyala/mati")
- Tidak ada auto TV ON/OFF saat start/close session

Endpoint: GET `getTvDevices`, GET `getTvControlLogs`, POST `sendTvCommand`.

## Fase 7A-1 - TV Mapping Management UI

Tab **Pengaturan** menambahkan section **TV Integration** untuk mengelola mapping TV tanpa edit manual di Google Sheet.

- Tabel TV Devices: Room, Device Name, Control Type, Status, Last Command, Last Result, Updated At, Aksi
- Tombol Tambah Mapping TV, modal tambah/edit mapping
- Field: `tv_device_id`, `room_id`, `device_name`, `control_type`, `status`, `middleware_url`, `device_identifier`
- `control_type` valid: `mock`, `home_assistant`, `manual`
- `status` valid: `active`, `inactive`
- Tombol Aktifkan / Nonaktifkan device
- Tombol Test command dari Pengaturan (owner/admin)
- Panel TV Control Logs read-only dengan pagination
- Satu room hanya satu device aktif; device aktif lain di room yang sama otomatis dinonaktifkan saat save/update
- Setelah save/update, daftar TV dan card room ikut refresh

Role akses:

- owner/admin: tambah, edit, aktifkan/nonaktifkan, test dari Pengaturan
- cashier: TV ON/OFF/TEST dari card room saja
- staff: tidak bisa akses kontrol TV

Endpoint baru: POST `saveTvDevice`, POST `updateTvDevice`.

Perlu `clasp push` dan deploy Apps Script production existing setelah perubahan `apps-script/Code.gs`.

## Fase UI-2B - Tanggal Operasional / Shift Karaoke

Laporan dan filter periode kini memakai **tanggal operasional karaoke**, bukan tanggal kalender 00:00–23:59.

- Cutoff shift: **jam 10:00 pagi** (Asia/Jakarta)
- Data jam 00:00–09:59 masuk shift hari sebelumnya
- Formula: `operational_date = date(datetime - 10 jam)`
- Default periode UI: **Shift Aktif** (backend: `period=today`)
- Pilihan: Shift Kemarin, 7 Shift, Bulan Ini, Semua, Custom (tanggal operasional)

Endpoint yang memakai operational_date: transaksi, closing, laporan F&B, riwayat order F&B, mutasi stok, audit tambah waktu.

**Perlu deploy Apps Script** setelah update `apps-script/Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase UI-2B - Tanggal Operasional Shift Karaoke"
```

## Fase 5F - Laporan Pemakaian Room & Revenue Shift

Tab **Laporan** menambahkan panel **Laporan Pemakaian Room** dengan filter shift operasional (sama seperti UI-2B).

- Endpoint: `getRoomUsageReport`
- Sumber data: sheet `Transactions`
- Revenue dari `grand_total` (fallback `room_total + fnb_total`)
- Room aktif belum masuk revenue final sampai sesi ditutup (`closeSession`)
- Summary: total sesi, durasi, omzet room/F&B, paid/unpaid, room terlaris
- List pemakaian per room + detail transaksi dengan pagination

**Perlu deploy Apps Script** setelah update `apps-script/Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 5F - Laporan Pemakaian Room"
```

## Fase 5G - Room Occupancy & Utilization

Tab **Laporan** menambahkan section **Room Occupancy & Utilization** setelah Dashboard Owner.

- Mengikuti filter periode laporan room: Shift Aktif, Shift Kemarin, 7 Shift, Bulan Ini, Semua, dan Custom.
- Jam operasional default: 17:00 sampai 10:00 pagi berikutnya (`1020` menit).
- Total room aktif dihitung dari `getRooms`, dengan status `maintenance` tidak dihitung.
- Occupancy rate: `total_used_minutes / total_available_minutes * 100`.
- Revenue per jam: `total_room_revenue / total_used_hours`.
- Tabel per room menampilkan session, durasi, revenue, utilization, revenue per jam, dan status analisis.
- Status analisis: Tinggi, Sedang, Rendah, Belum Terpakai.

Fase **frontend-only**. `apps-script/Code.gs` tidak berubah, sehingga **tidak perlu `clasp push` dan tidak perlu deploy Apps Script**.

## Cara Menjalankan

Buka `index.html` langsung di browser, atau jalankan dengan ekstensi Live Server agar refresh saat file berubah.

Catatan: project ini memakai ES module (`type="module"`) agar `js/app.js` bisa mengambil data dari `js/mock-data.js`. GitHub Pages mendukung ini langsung. Jika browser lokal memblokir module saat membuka file dengan `file://`, gunakan Live Server atau server statis sederhana.

## Struktur Folder

```text
.
+-- index.html
+-- css/
|   +-- style.css
+-- js/
|   +-- config.js
|   +-- app.js
|   +-- mock-data.js
+-- apps-script/
|   +-- Code.gs
|   +-- SCHEMA.md
|   +-- appsscript.json
|   +-- .claspignore
|   +-- CLASP_GUIDE.md
+-- spreadsheet-template/
|   +-- Rooms.csv
|   +-- Transactions.csv
|   +-- Inventory.csv
|   +-- Menu.csv
|   +-- Recipe.csv
|   +-- Employees.csv
|   +-- Settings.csv
|   +-- CashierClosings.csv
|   +-- IMPORT_GUIDE.md
+-- README.md
```

- `index.html`: struktur halaman, header, container grid, dan import CSS/JS.
- `css/style.css`: layout dashboard, grid responsif, warna status ruangan, timer, dan tombol touch-friendly.
- `js/config.js`: konfigurasi URL Google Apps Script Web App untuk frontend.
- `js/mock-data.js`: data contoh ruangan sementara untuk testing UI dan timer.
- `js/app.js`: render kartu ruangan, update timer setiap detik, dan placeholder event tombol.
- `apps-script/Code.gs`: backend awal Google Apps Script untuk endpoint JSON.
- `apps-script/SCHEMA.md`: desain tab dan kolom Google Spreadsheet.
- `apps-script/appsscript.json`: manifest Apps Script untuk runtime dan konfigurasi Web App.
- `apps-script/.claspignore`: filter file yang boleh ikut `clasp push`.
- `apps-script/CLASP_GUIDE.md`: panduan menghubungkan folder lokal ke Apps Script dengan clasp.
- `spreadsheet-template/`: template CSV untuk bootstrap Google Spreadsheet awal.

## TODO Integrasi API

Saat integrasi backend siap, ganti sumber data di `js/mock-data.js` dengan fetch ke Google Apps Script API. Untuk tahap scaffold ini belum ada logic billing, QRIS, atau pemanggilan API apa pun.

## Konfigurasi API Frontend

Frontend bisa mengambil data ruangan dari Google Apps Script Web App melalui `js/config.js`.

1. Buka `js/config.js`.
2. Isi `API_BASE_URL` dengan URL Web App Google Apps Script.

```js
export const API_BASE_URL = "https://script.google.com/macros/s/XXXXX/exec";
```

Jika `API_BASE_URL` kosong, dashboard otomatis memakai data contoh dari `js/mock-data.js`.

## Indikator Sumber Data

Badge kanan atas dashboard menunjukkan sumber data yang sedang dipakai:

- `Memuat Data`: dashboard sedang mengambil data.
- `Mode Data Contoh`: API belum dikonfigurasi, memakai mock data.
- `Terhubung ke Server`: dashboard memakai data dari Google Sheets lewat Apps Script.
- `Server Bermasalah`: API gagal, dashboard fallback ke data contoh.

Nama ruangan berasal dari tab `Rooms` di Google Sheets. Jika ingin tampil dalam Bahasa Indonesia, ubah isi kolom `room_name` di spreadsheet, misalnya `Room 1 - Sakura` menjadi `Ruangan 1 - Sakura`.

Cara test:

1. Buka halaman dashboard.
2. Cek console browser untuk melihat apakah dashboard memakai data contoh atau API.
3. Pastikan ruangan dari Spreadsheet muncul saat API URL sudah diisi.
4. Ubah data di tab `Rooms`, refresh halaman, dan pastikan dashboard berubah.

## Backend Google Apps Script

Backend awal ada di folder `apps-script/`. File ini disiapkan untuk ditempel ke Google Apps Script Web App dan membaca data dari Google Spreadsheet.

Langkah setup:

1. Buat Google Spreadsheet baru.
2. Buat tab sesuai desain di `apps-script/SCHEMA.md`.
3. Isi baris pertama setiap tab dengan header yang sesuai.
4. Buka Google Apps Script dari spreadsheet tersebut.
5. Paste isi `apps-script/Code.gs` ke editor Apps Script.
6. Deploy sebagai Web App.
7. Test endpoint berikut dari URL Web App:
   - `?action=health`
   - `?action=getRooms`

TODO: Pada fase berikutnya, frontend akan diarahkan ke endpoint `?action=getRooms` untuk menggantikan `js/mock-data.js`.

## Workflow Apps Script dengan clasp

Backend Apps Script berada di folder `apps-script/`. Masuk ke folder tersebut sebelum menjalankan perintah clasp:

```bash
cd apps-script
```

Gunakan perintah berikut dari dalam folder `apps-script/`:

```bash
clasp status
clasp push
clasp open
```

Untuk perubahan backend di `apps-script/Code.gs` atau `appsscript.json`, gunakan script deploy otomatis agar perubahan dipush, dibuatkan version baru, dan deployment production diperbarui tanpa redeploy manual dari UI Apps Script:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 3E - Riwayat Transaksi Hari Ini"
```

Jika hanya mengubah frontend (`js`, `css`, atau `index.html`), tidak perlu menjalankan deploy Apps Script.

Deployment ID production harus dipertahankan agar URL Web App tidak berubah. Jika deployment ID berubah, update nilai di `apps-script/deploy.ps1`.

Jangan menjalankan `clasp push` dari root project. Ikuti panduan lengkap di `apps-script/CLASP_GUIDE.md`, termasuk cara membuat `.clasp.json` dengan Script ID project Apps Script.

## Fase 3A - Mulai Sesi

Tombol `Mulai / Selesaikan Sesi` baru mendukung mulai sesi untuk ruangan kosong (`available`). Saat tombol diklik, frontend mengirim aksi `startSession` ke Google Apps Script, lalu backend mengubah data tab `Rooms`:

- `status` menjadi `occupied`
- `start_time` diisi waktu sekarang
- `updated_at` diisi waktu sekarang

Ruangan yang sudah `occupied` belum bisa diselesaikan pada fase ini. Fitur transaksi, billing, QRIS, inventory, dan switch TV juga belum diimplementasikan.

Setelah update Apps Script lewat `clasp push`, Web App mungkin perlu redeploy versi baru dari Apps Script agar endpoint POST terbaru aktif.

Cara test:

1. Pastikan `API_BASE_URL` di `js/config.js` sudah diisi URL Web App Google Apps Script.
2. Pastikan ada ruangan dengan status `available` di tab `Rooms`.
3. Klik tombol `Mulai / Selesaikan Sesi` pada ruangan kosong.
4. Cek Google Sheets: status ruangan berubah menjadi `occupied`.
5. Cek kolom `start_time` dan `updated_at` sudah terisi.
6. Dashboard refresh otomatis dan timer mulai berjalan.

Batasan fase ini:

- Jangan implementasi selesai sesi.
- Jangan implementasi transaksi.
- Jangan implementasi billing.
- Jangan implementasi QRIS.
- Jangan implementasi inventory.
- Jangan implementasi switch TV.

## Fase 3B - Selesaikan Sesi

Tombol pada ruangan `occupied` sekarang menyelesaikan sesi. Sistem menghitung durasi dalam menit, menghitung total biaya ruangan, membuat transaksi baru di tab `Transactions`, lalu mengembalikan status ruangan menjadi `available`.

Saat sesi diselesaikan:

- `duration_minutes` dihitung dari `start_time` sampai waktu selesai, dibulatkan ke atas, minimal 1 menit.
- `room_total` dihitung dari durasi dan `rate_per_hour`.
- Transaksi baru ditambahkan ke tab `Transactions`.
- `payment_status` masih bernilai `unpaid`.
- Kolom `start_time` di tab `Rooms` dikosongkan.
- Dashboard refresh otomatis dan menampilkan total tagihan.

QRIS dan pembayaran belum dibuat pada fase ini.

Cara test:

1. Pastikan ada ruangan dengan status `occupied`.
2. Klik tombol `Selesaikan Sesi`.
3. Cek dashboard: ruangan kembali `Kosong`.
4. Cek tab `Transactions`: muncul transaksi baru.
5. Cek `duration_minutes`, `room_total`, dan `payment_status`.
6. Pastikan `payment_status` bernilai `unpaid`.

Batasan fase ini:

- Belum ada pembayaran.
- Belum ada QRIS.
- Belum ada invoice.
- Belum ada inventory/menu.
- Belum ada switch TV.

## Fase 3C - Ringkasan Tagihan

Setelah sesi diselesaikan, dashboard menampilkan ringkasan tagihan di atas daftar ruangan. Ringkasan ini membantu kasir melihat detail transaksi terakhir tanpa membuka tab `Transactions`.

Ringkasan tagihan menampilkan:

- ID transaksi
- Ruangan
- Waktu mulai
- Waktu selesai
- Durasi
- Tarif per jam
- Total tagihan
- Status pembayaran

Status pembayaran masih `Belum Dibayar`. Tombol pembayaran belum dibuat, QRIS belum dibuat, dan invoice/print belum dibuat pada fase ini. Kasir bisa menutup ringkasan dengan tombol `Tutup Ringkasan` tanpa mengubah data transaksi.

Cara test:

1. Pastikan ada ruangan `occupied`.
2. Klik `Selesaikan Sesi`.
3. Pastikan ringkasan tagihan muncul di atas daftar ruangan.
4. Pastikan total tagihan tampil jelas.
5. Klik `Tutup Ringkasan`.
6. Pastikan ringkasan hilang tanpa mengubah data transaksi.

## Fase 3D - Pembayaran Manual

Transaksi `unpaid` dari ringkasan tagihan bisa ditandai lunas secara manual oleh kasir. Metode pembayaran yang tersedia:

- Cash
- Transfer

Setelah pembayaran ditandai lunas:

- `payment_status` berubah menjadi `paid`
- `payment_method` terisi dengan `cash` atau `transfer`

QRIS belum dibuat pada fase ini. Invoice/print juga belum dibuat.

Cara test:

1. Pastikan ada ringkasan tagihan dengan status `Belum Dibayar`.
2. Pilih metode pembayaran: `Cash` atau `Transfer`.
3. Klik `Tandai Lunas`.
4. Cek ringkasan tagihan berubah menjadi `Lunas`.
5. Cek tab `Transactions`:
   - `payment_status = paid`
   - `payment_method = cash` atau `transfer`

## Fase 3E - Riwayat Transaksi Hari Ini

Dashboard menampilkan transaksi hari ini dari tab `Transactions`, sehingga kasir bisa melihat transaksi terbaru tanpa membuka Google Sheets.

Ringkasan riwayat menampilkan:

- Total transaksi
- Transaksi lunas
- Transaksi belum dibayar
- Omzet lunas

Data riwayat hanya dibaca dari spreadsheet dan tidak mengubah data apa pun.

Cara test:

1. Pastikan ada transaksi di tab `Transactions` dengan `created_at` hari ini.
2. Buka dashboard.
3. Pastikan bagian `Riwayat Transaksi Hari Ini` muncul.
4. Pastikan jumlah transaksi dan omzet sesuai.
5. Tandai transaksi lunas, lalu pastikan ringkasan ikut berubah.

## Fase 3F - Filter dan Aksi Riwayat Transaksi

Riwayat transaksi kini bisa difilter:

- Semua
- Lunas
- Belum Dibayar

Kasir bisa membuka kembali Ringkasan Tagihan dari transaksi di riwayat dengan tombol `Lihat Ringkasan`. Transaksi `unpaid` juga bisa ditandai lunas langsung dari riwayat dengan metode:

- Cash
- Transfer

Backend tidak berubah pada fase ini karena aksi pembayaran memakai endpoint `markTransactionPaid` yang sudah ada.

Cara test:

1. Pastikan ada minimal 1 transaksi `paid` dan 1 transaksi `unpaid` hari ini.
2. Buka dashboard.
3. Cek filter `Semua`, `Lunas`, dan `Belum Dibayar`.
4. Klik `Lihat Ringkasan` pada salah satu transaksi.
5. Pastikan Ringkasan Tagihan muncul di atas grid ruangan.
6. Pada transaksi `unpaid` di riwayat, pilih metode pembayaran.
7. Klik `Tandai Lunas`.
8. Pastikan transaksi berubah menjadi `Lunas`.
9. Pastikan summary `Sudah Lunas`, `Belum Dibayar`, dan `Omzet Lunas` ikut berubah.

## Fase 3G - Rekap Omzet Kasir Hari Ini

Dashboard menampilkan rekap omzet berdasarkan transaksi hari ini. Rekap mencakup:

- Omzet Lunas
- Cash
- Transfer
- Belum Dibayar
- Total Tagihan

Rekap dihitung di frontend dari data `todayTransactions`. Filter riwayat tidak memengaruhi rekap omzet, sehingga tombol `Semua`, `Lunas`, dan `Belum Dibayar` hanya mengubah daftar transaksi. Backend tidak berubah pada fase ini.

Cara test:

1. Pastikan ada transaksi `paid` dengan metode `cash` hari ini.
2. Pastikan ada transaksi `paid` dengan metode `transfer` hari ini jika memungkinkan.
3. Pastikan ada transaksi `unpaid` hari ini.
4. Buka dashboard.
5. Cek panel `Rekap Omzet Kasir`.
6. Pastikan nominal Cash, Transfer, Belum Dibayar, dan Total Tagihan sesuai data transaksi.
7. Klik filter `Lunas` atau `Belum Dibayar`.
8. Pastikan daftar transaksi berubah sesuai filter, tapi rekap omzet tetap total harian penuh.

## Fase 3H - Preview Tutup Kasir

Dashboard bisa menampilkan preview tutup kasir berdasarkan transaksi hari ini. Preview mencakup:

- Total transaksi
- Transaksi lunas
- Transaksi belum dibayar
- Omzet lunas
- Cash sistem
- Transfer
- Sisa belum dibayar
- Total semua tagihan
- Input uang cash aktual
- Selisih cash
- Catatan kasir

Fase ini belum menyimpan closing ke Google Sheets. Tombol simpan masih disabled dan backend tidak berubah.

Cara test:

1. Pastikan ada transaksi hari ini.
2. Buka dashboard.
3. Klik `Preview Tutup Kasir`.
4. Masukkan `Uang Cash Aktual`.
5. Pastikan selisih cash berubah:
   - sesuai
   - lebih
   - kurang
6. Isi Catatan Kasir.
7. Klik filter transaksi atau tandai transaksi lunas.
8. Pastikan preview tetap update sesuai data terbaru.
9. Klik `Tutup Preview`.
10. Pastikan panel hilang.

## Fase 3I - Simpan Closing Kasir

Preview tutup kasir kini bisa disimpan ke tab `CashierClosings`. Backend menghitung ulang summary dari tab `Transactions`, sehingga angka closing tidak bergantung pada data rekap dari frontend.

Data yang disimpan:

- `closing_id`
- `closing_date`
- `cashier_name`
- total transaksi
- transaksi lunas
- transaksi unpaid
- omzet lunas
- cash sistem
- cash aktual
- selisih cash
- transfer
- sisa belum dibayar
- total tagihan
- catatan
- waktu dibuat

Pada fase ini closing boleh disimpan lebih dari satu kali. Validasi anti-duplikat closing dibuat di fase lanjutan. Jika tab `CashierClosings` belum ada, backend akan membuat otomatis dengan header yang sesuai.

Cara test:

1. Pastikan ada transaksi hari ini.
2. Buka dashboard.
3. Klik `Preview Tutup Kasir`.
4. Input `Uang Cash Aktual`.
5. Isi `Catatan Kasir`.
6. Klik `Simpan Closing`.
7. Pastikan muncul pesan `Closing kasir berhasil disimpan.`
8. Cek Google Sheets:
   - tab `CashierClosings` ada
   - row baru tersimpan
   - `cash_expected`, `cash_actual`, dan `cash_difference` benar
9. Jika masih ada transaksi unpaid, pastikan warning tetap muncul tapi closing tetap bisa disimpan.

## Fase 3J - Anti Duplikat Closing dan Riwayat Closing

Dashboard kini membaca closing hari ini dari tab `CashierClosings`. Jika closing hari ini sudah ada, tombol `Simpan Closing` dibuat nonaktif. Backend juga mencegah duplikat closing berdasarkan `closing_date`, sehingga validasi tetap aman walaupun frontend dilewati.

Riwayat closing hari ini menampilkan:

- ID closing
- waktu closing
- kasir
- omzet lunas
- cash sistem
- cash aktual
- selisih cash
- transfer
- belum dibayar
- total tagihan
- catatan

Anti-duplikat saat ini berbasis tanggal, belum multi-shift.

Cara test:

1. Pastikan belum ada closing hari ini di tab `CashierClosings`.
2. Buka dashboard.
3. Klik Preview Tutup Kasir.
4. Simpan closing.
5. Pastikan closing tersimpan.
6. Pastikan panel `Riwayat Closing Hari Ini` muncul.
7. Pastikan tombol `Simpan Closing` menjadi disabled.
8. Coba klik simpan lagi, pastikan tidak membuat row baru.
9. Coba paksa POST `saveCashierClosing`, pastikan backend menolak dengan error `Closing kasir hari ini sudah pernah disimpan.`

## Fase 3K - Print View Closing Kasir

Dashboard bisa menampilkan preview cetak closing kasir. Tombol `Lihat / Cetak` tersedia pada `Riwayat Closing Hari Ini`.

Preview cetak menampilkan:

- ID closing
- tanggal dan waktu closing
- kasir
- ringkasan transaksi
- pembayaran cash/transfer
- selisih cash
- catatan kasir

Cetak menggunakan `window.print()`. Fase ini belum membuat file PDF dan backend tidak berubah.

Cara test:

1. Pastikan ada closing hari ini.
2. Buka dashboard.
3. Lihat panel `Riwayat Closing Hari Ini`.
4. Klik `Lihat / Cetak`.
5. Pastikan preview cetak muncul.
6. Klik `Cetak`.
7. Pastikan dialog print browser muncul.
8. Pastikan tombol tidak ikut tercetak.
9. Klik `Tutup Preview Cetak`.

## Fase 4A - Menu F&B Basic

Dashboard menampilkan panel `Menu F&B` di bawah grid ruangan dan sebelum `Riwayat Transaksi Hari Ini`.

Data menu dibaca dari tab `Menu` di Google Sheets melalui endpoint Apps Script:

```text
?action=getMenuItems
```

Header tab `Menu`:

```text
menu_id,menu_name,category,price,status,updated_at
```

Panel ini bersifat read-only. Fase ini belum membuat order F&B, cart, pengurangan stok, recipe, pembayaran, QRIS, atau invoice.

Fitur panel:

- menampilkan nama menu, kategori, harga, dan status
- filter kategori dengan pilihan `Semua`
- pencarian berdasarkan nama menu atau kategori
- status `active` tampil sebagai `Aktif`
- status `inactive` tampil sebagai `Tidak Aktif`
- saat API belum dikonfigurasi, panel menampilkan pesan bahwa Menu F&B hanya tersedia saat terhubung ke server

## Fase 4B - Keranjang Order F&B

Dashboard memiliki panel `Order F&B` untuk keranjang sementara pesanan makanan dan minuman per ruangan.

Fitur:

- kasir bisa memilih ruangan untuk order F&B
- kasir bisa menambahkan menu aktif ke keranjang
- kasir bisa mengubah qty dan menghapus item
- total order F&B dihitung di frontend
- warning tampil jika ruangan yang dipilih belum memiliki sesi aktif
- tombol `Simpan Order Belum Tersedia` masih disabled

Fase ini belum menyimpan order ke Google Sheets. Backend tidak berubah dan belum ada pembayaran F&B, pengurangan stok, recipe, invoice, print, atau QRIS.

Cara test:

1. Pastikan panel `Menu F&B` muncul.
2. Pastikan ada menu `active`.
3. Buka dashboard.
4. Pilih ruangan di panel `Order F&B`.
5. Klik `Tambah ke Keranjang` pada menu active.
6. Pastikan item masuk keranjang.
7. Klik `+` dan `-`, pastikan qty dan subtotal berubah.
8. Klik `Hapus`, pastikan item hilang.
9. Klik `Kosongkan Keranjang`.
10. Pastikan total kembali Rp0.
11. Pastikan menu inactive tidak bisa ditambahkan.

## Fase 4C - Simpan Order F&B

Keranjang F&B kini bisa disimpan ke Google Sheets.

Saat kasir klik `Simpan Order`, backend membuat:

- 1 row di `FnbOrders`
- beberapa row di `FnbOrderItems`

Validasi backend:

- room harus ada
- room harus sedang `occupied`
- item harus valid
- menu harus `active`
- quantity harus positif
- harga dihitung ulang dari tab `Menu`

Fase ini belum memasukkan F&B ke tagihan `closeSession`, belum mengurangi stok, belum memakai `Recipe`/`Inventory`, dan belum membuat pembayaran F&B terpisah.

Aturan sesi F&B:

- satu sesi ruangan bisa memiliki banyak order F&B
- setiap tambahan makanan/minuman disimpan sebagai order baru dengan `order_status = open`
- order F&B belum dianggap lunas saat dibuat
- order F&B belum memiliki `payment_status`
- pembayaran F&B dilakukan nanti bersama tagihan room saat sesi ditutup
- backend menyimpan `room_id`, `room_name`, dan `room_start_time` agar order bisa dikaitkan ke sesi ruangan yang sedang berjalan
- fase berikutnya dapat mengambil order F&B dengan `room_id` sama, `room_start_time` sama, dan `order_status = open`

Cara test:

1. Pastikan ada ruangan dengan status `occupied`.
2. Pastikan ada menu active.
3. Pilih ruangan occupied di panel `Order F&B`.
4. Tambahkan beberapa menu ke keranjang.
5. Isi catatan order.
6. Klik `Simpan Order`.
7. Pastikan muncul pesan `Order F&B berhasil disimpan.`
8. Cek Google Sheets: tab `FnbOrders` ada, tab `FnbOrderItems` ada, `order_id` sama di kedua tab, `order_total` benar, dan subtotal item benar.
9. Coba simpan order untuk ruangan kosong, pastikan ditolak.
10. Coba menu inactive, pastikan tidak bisa disimpan.

## Fase 4D - Open Order F&B per Sesi Ruangan

Dashboard bisa membaca order F&B dengan status `open`.

Endpoint baru:

```text
?action=getOpenFnbOrders
?action=getOpenFnbOrders&room_id=ROOM-001
?action=getOpenFnbOrders&room_id=ROOM-001&room_start_time=2026-06-19T10:15:00+07:00
```

Panel `Open Order F&B` menampilkan:

- `order_id`
- ruangan
- `room_start_time`
- total order
- catatan
- daftar item

Jika ruangan dipilih di panel `Order F&B`, open order difilter untuk sesi ruangan tersebut. Filter sesi aktif memakai:

- `room_id`
- `room_start_time`
- `order_status = open`

Fase ini belum memasukkan F&B ke tagihan room, belum mengubah status order menjadi `billed`, dan belum mengurangi stok.

Cara test:

1. Pastikan ada ruangan dengan status `occupied`.
2. Simpan minimal 1 order F&B untuk ruangan tersebut.
3. Buka endpoint `?action=getOpenFnbOrders`.
4. Pastikan orders muncul.
5. Buka endpoint dengan filter `?action=getOpenFnbOrders&room_id=ROOM-XXX&room_start_time=...`.
6. Pastikan hanya order sesi itu yang muncul.
7. Buka dashboard.
8. Pilih ruangan yang memiliki order.
9. Pastikan panel `Open Order F&B` hanya menampilkan order sesi ruangan tersebut.
10. Klik `Refresh Order F&B`.
11. Simpan order F&B baru untuk ruangan yang sama.
12. Pastikan panel `Open Order F&B` ikut update.
13. Pilih ruangan kosong.
14. Pastikan muncul pesan bahwa ruangan belum memiliki sesi aktif.

## Fase 4E - Gabungkan F&B ke Tagihan Room

Saat sesi ruangan ditutup, sistem mengambil F&B order dengan:

- `room_id`
- `room_start_time`
- `order_status = open`

Sistem menghitung:

- `room_total`
- `fnb_total`
- `grand_total`

Transaksi menyimpan:

- `room_total`
- `fnb_total`
- `grand_total`
- `fnb_order_ids`

Order F&B yang masuk tagihan berubah dari `open` menjadi `billed`. Pembayaran tetap melalui flow transaksi utama: transaksi dibuat dengan `payment_status = unpaid`, lalu kasir memakai `markTransactionPaid`. F&B tidak dibayar terpisah dan inventory belum dikurangi di fase ini.

Cara test:

1. Mulai sesi ruangan.
2. Simpan order F&B untuk ruangan tersebut.
3. Pastikan order muncul di `Open Order F&B`.
4. Klik `Selesaikan Sesi`.
5. Pastikan Ringkasan Tagihan menampilkan `Biaya Room`, `Total F&B`, dan `Total Tagihan Akhir`.
6. Cek tab `Transactions`: `room_total` benar, `fnb_total` benar, `grand_total = room_total + fnb_total`, dan `fnb_order_ids` terisi.
7. Cek tab `FnbOrders`: order tadi berubah dari `open` menjadi `billed`.
8. Cek endpoint `getOpenFnbOrders`: order tersebut tidak muncul lagi.
9. Tandai transaksi lunas.
10. Pastikan riwayat transaksi dan rekap omzet memakai `grand_total`.

## Fase 4F - Detail Item F&B pada Tagihan

Ringkasan Tagihan bisa menampilkan detail item F&B yang masuk ke transaksi.

`closeSession` mengembalikan `fnb_orders` beserta item, sehingga transaksi yang baru ditutup langsung menampilkan rincian menu F&B. Untuk transaksi dari riwayat, frontend bisa mengambil ulang detail lewat endpoint:

```text
?action=getFnbOrdersByIds&order_ids=FNB-001,FNB-002
```

Riwayat transaksi juga menandai transaksi yang memiliki F&B dengan badge `Termasuk F&B`.

Fase ini belum membuat print struk dan belum mengurangi stok.

Cara test:

1. Mulai sesi ruangan.
2. Simpan order F&B.
3. Tutup sesi.
4. Pastikan Ringkasan Tagihan menampilkan `Biaya Room`, `Total F&B`, `Total Tagihan Akhir`, dan `Detail F&B` beserta item.
5. Cek endpoint `?action=getFnbOrdersByIds&order_ids=FNB-...`.
6. Pastikan item F&B muncul.
7. Klik `Lihat Ringkasan` dari riwayat transaksi.
8. Pastikan detail F&B tetap bisa tampil.
9. Pastikan transaksi tanpa F&B tetap normal.

## Fase 4G - Print Struk Tagihan Room + F&B

Ringkasan Tagihan kini memiliki tombol `Cetak Struk`.

Preview struk menampilkan:

- ID transaksi
- ruangan
- waktu mulai dan selesai
- durasi
- biaya room
- total F&B
- total akhir
- detail item F&B
- status pembayaran
- metode pembayaran

Cetak memakai `window.print()`. Fase ini belum membuat PDF dan backend tidak berubah.

Cara test:

1. Mulai sesi ruangan.
2. Tambahkan order F&B.
3. Tutup sesi.
4. Pastikan Ringkasan Tagihan tampil dengan detail F&B.
5. Klik `Cetak Struk`.
6. Pastikan Preview Struk Tagihan muncul.
7. Klik `Cetak`.
8. Pastikan dialog print browser muncul.
9. Pastikan tombol tidak ikut tercetak.
10. Klik `Tutup Preview`.
11. Test juga transaksi tanpa F&B, pastikan struk tetap normal.

## Fase 4H - Riwayat Order F&B Hari Ini

Dashboard kini bisa membaca semua order F&B hari ini, baik yang masih `open` maupun yang sudah `billed`.

Endpoint baru:

- `?action=getTodayFnbOrders`
- optional `status=open`
- optional `status=billed`
- optional `room_id=ROOM-001`

Panel `Riwayat Order F&B Hari Ini` menampilkan:

- `order_id`
- ruangan
- status `open`/`billed`
- total order
- catatan
- daftar item

Filter status dan ruangan berjalan di frontend dari data yang sudah dimuat. Endpoint bersifat read-only, tidak mengubah status order, tidak membuat cancel/void order, dan belum mengurangi stok.

Cara test:

1. Pastikan ada order F&B `open` hari ini.
2. Pastikan ada order F&B `billed` hari ini.
3. Buka endpoint `?action=getTodayFnbOrders`.
4. Pastikan order `open` dan `billed` muncul.
5. Buka dashboard.
6. Pastikan panel `Riwayat Order F&B Hari Ini` muncul.
7. Test filter `Semua`, `Open`, dan `Billed`.
8. Test filter ruangan.
9. Simpan order F&B baru, pastikan riwayat ikut update.
10. Tutup sesi ruangan dengan open order, pastikan status berubah dari `open` ke `billed` setelah refresh.

## Fase 4I - Cancel / Void Open Order F&B

Kasir bisa membatalkan order F&B yang masih `open`.

Endpoint baru:

- POST `cancelFnbOrder`

Request:

```json
{
  "action": "cancelFnbOrder",
  "order_id": "FNB-...",
  "cancel_reason": "Salah input",
  "cancelled_by": "Kasir"
}
```

Hanya order status `open` yang bisa dibatalkan. Order `billed` tidak bisa dibatalkan. Order `cancelled` tidak dihapus dan tetap tersimpan untuk audit bersama alasan, user pembatal, dan waktu batal.

`getTodayFnbOrders` sekarang mendukung status:

- `open`
- `billed`
- `cancelled`

Cancelled order tidak masuk tagihan saat `closeSession`. Fase ini belum refund dan belum stok.

Cara test:

1. Mulai sesi ruangan.
2. Simpan order F&B.
3. Pastikan order muncul sebagai `open`.
4. Klik `Batalkan`.
5. Isi alasan pembatalan.
6. Konfirmasi pembatalan.
7. Pastikan status berubah menjadi `cancelled`.
8. Pastikan order hilang dari `Open Order F&B`.
9. Pastikan order tetap muncul di `Riwayat Order F&B Hari Ini` dengan status `Dibatalkan`.
10. Cek endpoint `?action=getTodayFnbOrders&status=cancelled`.
11. Pastikan order cancelled muncul.
12. Buat order F&B baru lalu tutup sesi.
13. Pastikan hanya order `open` yang masuk `grand_total`.
14. Pastikan order `cancelled` tidak masuk tagihan.
15. Coba batalkan order `billed`, pastikan ditolak.

## Fase 4J - Stok Dasar F&B

Menu bisa dipetakan ke item stok memakai kolom:

- `stock_tracking`
- `stock_item_id`
- `stock_qty_per_unit`

Stok berkurang saat sesi ditutup dan order F&B berubah menjadi `billed`. Order `open` belum mengurangi stok, dan order `cancelled` tidak mengurangi stok. Setiap pengurangan stok dicatat di tab `StockMovements`.

Endpoint baru:

- `?action=getInventoryItems`

Panel `Stok F&B` menampilkan total item, stok aman, stok rendah, stok minus, dan daftar stok dasar. Jika `closeSession` menghasilkan warning stok rendah, stok minus, atau mapping stok belum lengkap, dashboard menampilkan warning tanpa menggagalkan tagihan.

Fase ini belum memakai Recipe/BOM, belum restock/manual adjustment dari dashboard, dan belum mencegah kasir menjual item stok kosong.

Cara test:

1. Isi tab `Inventory` dengan minimal 3 stok: Air Mineral 600ml, Teh Botol, Snack Kentang.
2. Isi mapping stok di tab `Menu`: `stock_tracking = yes`, `stock_item_id` sesuai Inventory, `stock_qty_per_unit = 1`.
3. Buka endpoint `?action=getInventoryItems`.
4. Pastikan stok muncul.
5. Mulai sesi ruangan.
6. Simpan order F&B.
7. Tutup sesi.
8. Pastikan transaksi berhasil.
9. Pastikan stok berkurang sesuai qty item.
10. Pastikan row mutasi masuk ke `StockMovements`.
11. Pastikan order F&B berubah menjadi `billed`.
12. Pastikan order `cancelled` tidak mengurangi stok.
13. Pastikan panel `Stok F&B` menampilkan stok terbaru.
14. Test stok rendah/minus, pastikan status tampil.

## Fase 4K - Restock / Adjustment Stok F&B

Dashboard bisa menambah stok dan melakukan koreksi stok aktual dari panel `Stok F&B`.

Endpoint baru:

- POST `adjustInventoryStock`

Request restock:

```json
{
  "action": "adjustInventoryStock",
  "stock_item_id": "ITEM-001",
  "adjustment_type": "restock",
  "quantity": 10,
  "note": "Pembelian stok air mineral",
  "cashier_name": "Kasir"
}
```

Request koreksi stok:

```json
{
  "action": "adjustInventoryStock",
  "stock_item_id": "ITEM-001",
  "adjustment_type": "set_stock",
  "quantity": 25,
  "note": "Koreksi hasil cek fisik",
  "cashier_name": "Kasir"
}
```

`adjustment_type`:

- `restock`: menambah stok dan mencatat `movement_type = in`.
- `set_stock`: menyetel stok aktual dan mencatat `movement_type = adjustment`.

Semua perubahan stok dicatat di `StockMovements`. Fase ini belum membuat purchase order, supplier, HPP, atau Recipe/BOM.

Cara test:

1. Buka dashboard.
2. Buka panel `Stok F&B`.
3. Pilih item stok.
4. Pilih `Tambah Stok`.
5. Isi jumlah, misalnya `10`.
6. Klik `Simpan Perubahan Stok`.
7. Pastikan stok bertambah.
8. Cek `StockMovements`, pastikan ada movement `in`.
9. Pilih item stok lagi.
10. Pilih `Koreksi Stok`.
11. Isi stok aktual.
12. Pastikan stok berubah sesuai angka aktual.
13. Cek `StockMovements`, pastikan ada movement `adjustment`.
14. Pastikan quantity invalid ditolak.
15. Pastikan stok tidak berubah tanpa movement.

## Fase 4L - Riwayat Mutasi Stok Hari Ini

Dashboard menampilkan panel `Riwayat Mutasi Stok Hari Ini` di area stok F&B.

Endpoint baru:

- GET `getTodayStockMovements`

Contoh query:

- `?action=getTodayStockMovements`
- `?action=getTodayStockMovements&stock_item_id=ITEM-001`
- `?action=getTodayStockMovements&movement_type=in`
- `?action=getTodayStockMovements&movement_type=out`
- `?action=getTodayStockMovements&movement_type=adjustment`
- `?action=getTodayStockMovements&reference_type=transaction`
- `?action=getTodayStockMovements&reference_type=manual_adjustment`

Panel menampilkan:

- ringkasan total mutasi, total masuk, total keluar, dan total koreksi;
- filter per item stok, jenis mutasi, dan jenis referensi;
- tombol `Refresh Mutasi Stok`;
- daftar mutasi dengan waktu, item, jenis, qty, stok sebelum/sesudah, referensi, catatan, dan kasir.

Label UI:

- `in` → Masuk
- `out` → Keluar
- `adjustment` → Koreksi
- `transaction` → Transaksi
- `manual_adjustment` → Manual

Sumber mutasi:

- keluar dari transaksi F&B saat `closeSession`;
- masuk dari restock manual Fase 4K;
- koreksi dari adjustment manual Fase 4K.

Panel ini read-only. Tidak mengubah stok, billing, payment, atau closing.

Cara test:

1. Buka dashboard dan pastikan panel `Riwayat Mutasi Stok Hari Ini` muncul.
2. Lakukan restock, pastikan mutasi tampil sebagai `Masuk`.
3. Lakukan koreksi stok, pastikan mutasi tampil sebagai `Koreksi`.
4. Tutup sesi dengan F&B, pastikan mutasi tampil sebagai `Keluar`.
5. Uji filter item, `movement_type`, dan `reference_type`.
6. Pastikan ringkasan total mutasi/masuk/keluar/koreksi sesuai data.
7. Pastikan empty state tampil jika tidak ada data.
8. Setelah restock/koreksi sukses, pastikan riwayat ikut refresh otomatis.
9. Pastikan panel tidak mengubah stok.

## Fase 4M - Laporan Penjualan F&B & Stok Rendah

Dashboard menampilkan panel `Laporan Penjualan F&B & Stok Rendah` untuk membantu operasional harian.

Endpoint baru:

- GET `getTodayFnbSalesReport`

Panel menampilkan:

- ringkasan total order F&B billed hari ini, item terjual, omzet F&B, menu terlaris, jumlah stok rendah, dan stok minus;
- daftar penjualan per menu (kategori, qty terjual, total penjualan, jumlah order);
- daftar stok rendah/minus beserta rekomendasi restock;
- tombol `Refresh Laporan F&B`.

Sumber data:

- penjualan dari `FnbOrders` billed hari ini + `FnbOrderItems`;
- stok rendah dari `Inventory` (`stock_qty <= min_stock` atau minus).

Panel ini read-only. Tidak mengubah stok, order F&B, billing, payment, atau closing.

Catatan keputusan produk:

- Recipe/BOM di-skip dulu karena belum dibutuhkan untuk operasional karaoke saat ini.
- Prioritas saat ini adalah laporan penjualan F&B dan stok rendah.

Cara test:

1. Buka dashboard dan pastikan panel `Laporan Penjualan F&B & Stok Rendah` muncul.
2. Tutup sesi dengan order F&B billed, pastikan omzet dan menu terlaris terupdate.
3. Pastikan penjualan per menu tampil benar.
4. Set stok di bawah `min_stock`, pastikan item muncul di stok rendah.
5. Set stok minus, pastikan badge `Stok Minus` dan rekomendasi restock tampil.
6. Pastikan empty state penjualan tampil jika belum ada penjualan billed hari ini.
7. Pastikan empty state stok rendah tampil jika semua stok aman.
8. Setelah `closeSession` atau restock/koreksi sukses, pastikan laporan ikut refresh.
9. Pastikan panel tidak mengubah stok.

## Fase 5A - Pilih Durasi Sesi & Countdown Room Dasar

Dashboard sekarang meminta durasi sebelum memulai sesi room. Klik `Mulai Sesi` pada room `available`, lalu pilih `1 jam`, `2 jam`, `3 jam`, atau isi durasi custom minimal 15 menit.

Backend `startSession` menerima field baru:

```json
{
  "action": "startSession",
  "room_id": "ROOM-001",
  "duration_minutes": 120
}
```

Tab `Rooms` memakai kolom tambahan:

- `booked_duration_minutes`
- `scheduled_end_time`

Saat sesi dimulai, backend tetap mengisi `start_time` sebagai identitas sesi dan menambahkan jadwal selesai dari durasi booking. Saat sesi ditutup, `start_time`, `booked_duration_minutes`, dan `scheduled_end_time` dikosongkan. Countdown hanya indikator visual di dashboard; fase ini belum melakukan auto-close, overtime, reminder, atau perpanjangan durasi.

Cara test:

1. Pastikan ada room berstatus `available`.
2. Klik `Mulai Sesi`.
3. Pilih durasi preset atau isi custom minimal 15 menit.
4. Pastikan room berubah menjadi `occupied`.
5. Pastikan kartu room menampilkan durasi, jam mulai, jam selesai, dan countdown mundur.
6. Tutup sesi dengan `Selesaikan Sesi`.
7. Pastikan tagihan room, F&B, stok, pembayaran, dan transaksi tetap berjalan seperti fase sebelumnya.

## Fase 5B - Peringatan 10 Menit dan Status Waktu Habis

Dashboard menambahkan status visual pada room `occupied` yang memiliki `scheduled_end_time`:

- Sisa waktu lebih dari 10 menit: tampil normal.
- Sisa waktu 10 menit atau kurang: tampil badge `⚠️ 10 Menit Lagi`, countdown tetap mundur, dan kartu room mendapat class `time-warning`.
- Waktu habis: tampil badge `⏰ Waktu Habis`, countdown `00:00:00`, dan kartu room mendapat class `time-expired`.

Room tetap `occupied` saat waktu habis. Kasir tetap harus klik `Selesaikan Sesi` untuk menutup sesi dan membuat transaksi. Fase ini belum membuat Tambah Waktu, overtime otomatis, auto-close, atau perubahan billing room.

Perubahan hanya di frontend (`js/app.js`, `css/style.css`). Backend Apps Script dan schema Google Sheets tidak berubah, jadi tidak perlu `clasp push` atau `deploy.ps1`.

Cara test:

1. Mulai sesi room dengan durasi yang masih jauh dari habis, pastikan tampilan normal.
2. Mulai sesi dengan durasi pendek (misalnya 15 menit) atau tunggu hingga sisa waktu masuk 10 menit terakhir, pastikan badge warning muncul.
3. Tunggu hingga waktu habis, pastikan badge `Waktu Habis` muncul dan room tetap `occupied`.
4. Klik `Selesaikan Sesi`, pastikan `closeSession`, F&B, stok, dan pembayaran tetap normal.
5. Untuk sesi lama tanpa `scheduled_end_time`, pastikan tidak muncul warning/expired dan fallback tetap aman.

## Fase 5C - Tambah Waktu / Extend Session

Room `occupied` kini memiliki tombol `Tambah Waktu` di samping `Selesaikan Sesi`. Kasir bisa memilih tambahan waktu:

- `+30 menit`
- `+1 jam`
- `+2 jam`
- custom minimal 15 menit

Frontend memanggil POST `extendSession`:

```json
{
  "action": "extendSession",
  "room_id": "ROOM-001",
  "add_minutes": 30,
  "cashier_name": "Kasir"
}
```

Backend menambahkan waktu ke sesi aktif:

- `booked_duration_minutes += add_minutes`
- `scheduled_end_time += add_minutes` dari jadwal selesai lama, bukan dari waktu sekarang
- `start_time` tidak berubah
- room tetap `occupied`

Countdown dan status visual Fase 5B otomatis mengikuti `scheduled_end_time` baru setelah refresh rooms. Kasir tetap harus klik `Selesaikan Sesi` untuk menutup sesi dan membuat transaksi.

Fase ini belum membuat audit extend, overtime otomatis, atau perubahan billing room. Schema Google Sheets tidak berubah.

Deploy backend setelah perubahan `Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 5C - Tambah Waktu Extend Session"
```

Cara test:

1. Mulai sesi room dengan durasi pendek.
2. Klik `Tambah Waktu`, pilih `+30 menit`, pastikan `booked_duration_minutes` dan `scheduled_end_time` bertambah.
3. Pastikan `start_time` tidak berubah dan countdown ikut bertambah.
4. Uji `+1 jam`, `+2 jam`, dan custom 15 menit.
5. Uji custom di bawah 15 menit, pastikan ditolak.
6. Uji room warning atau expired, tambah waktu, pastikan status visual kembali normal jika sisa > 10 menit.
7. Klik `Selesaikan Sesi`, pastikan F&B, stok, dan transaksi tetap normal.

## Fase 5D - Billing Berdasarkan Durasi Booking

Tagihan room saat `closeSession` kini memakai `booked_duration_minutes`, bukan durasi aktual dari `start_time` sampai kasir menutup sesi.

Rumus:

```text
room_total = rate_per_hour * booked_duration_minutes / 60
```

Contoh:

- Booking 1 jam, ditutup di menit ke-45 → tetap ditagih 1 jam.
- Booking 1 jam + tambah waktu 30 menit → ditagih 90 menit.
- Waktu habis tanpa extend → tetap ditagih durasi booking terakhir.
- Tidak ada overtime otomatis di fase ini.

Jika `booked_duration_minutes` kosong atau tidak valid (data lama), sistem fallback ke durasi aktual seperti sebelum Fase 5D. Response `closeSession` dapat menyertakan `billing_basis`:

- `booked_duration` untuk sesi booking valid
- `actual_duration` untuk fallback legacy

F&B, stok, payment, closing, dan cancel order tidak berubah. Schema Google Sheets tidak berubah.

Deploy backend setelah perubahan `Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 5D - Billing Berdasarkan Durasi Booking"
```

Cara test:

1. Mulai sesi 1 jam, tutup sebelum 1 jam habis, pastikan `duration_minutes = 60` dan `room_total = rate_per_hour`.
2. Mulai sesi 1 jam, tambah 30 menit, tutup sesi, pastikan `duration_minutes = 90`.
3. Biarkan waktu habis tanpa extend, tutup sesi, pastikan tetap ditagih durasi booking terakhir.
4. Uji sesi lama tanpa `booked_duration_minutes`, pastikan fallback durasi aktual.
5. Pastikan F&B, `grand_total`, stok, payment, closing, riwayat, dan struk tetap normal.

## Fase 5E - Audit Log Tambah Waktu Room

Setiap tambah waktu room (`extendSession`) kini tercatat di sheet `RoomTimeLogs`.

Payload `extendSession` dengan catatan opsional:

```json
{
  "action": "extendSession",
  "room_id": "ROOM-001",
  "add_minutes": 30,
  "cashier_name": "Kasir",
  "note": "Customer tambah 30 menit"
}
```

Log mencatat durasi lama/baru, jadwal selesai lama/baru, menit ditambahkan, kasir, dan catatan. `start_time` tetap tidak berubah. `scheduled_end_time` tetap bertambah dari jadwal lama (Fase 5C). Billing Fase 5D tidak berubah.

Endpoint baru:

- GET `getTodayRoomTimeLogs`

Panel `Riwayat Tambah Waktu Room Hari Ini` menampilkan summary, filter per room, dan daftar log hari ini. Panel read-only.

Deploy backend setelah perubahan `Code.gs`:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 5E - Audit Log Tambah Waktu Room"
```

Cara test:

1. Mulai sesi room, klik `Tambah Waktu`, isi catatan opsional, tambah waktu.
2. Pastikan `RoomTimeLogs` bertambah 1 row dengan data durasi/jadwal lama-baru benar.
3. Pastikan `start_time` tidak berubah.
4. Buka panel `Riwayat Tambah Waktu Room Hari Ini`, pastikan log tampil.
5. Uji filter per room.
6. Tutup sesi, pastikan billing Fase 5D tetap benar.
7. Pastikan F&B, stok, payment, dan closing tetap normal.

## Spreadsheet Template

Folder `spreadsheet-template/` berisi CSV template untuk membuat Google Spreadsheet database awal. Setiap file CSV mewakili satu tab spreadsheet:

- `Rooms.csv`
- `RoomTimeLogs.csv`
- `Transactions.csv`
- `Inventory.csv`
- `Menu.csv`
- `Recipe.csv`
- `Employees.csv`
- `Settings.csv`
- `CashierClosings.csv`
- `FnbOrders.csv`
- `FnbOrderItems.csv`
- `StockMovements.csv`

Cara pakai ringkas:

1. Buat Google Spreadsheet baru.
2. Buat tab dengan nama persis: `Rooms`, `Transactions`, `Inventory`, `Menu`, `Recipe`, `Employees`, `Settings`, `CashierClosings`, `FnbOrders`, `FnbOrderItems`, `StockMovements`.
3. Copy isi CSV ke tab yang sesuai, atau import file CSV satu per satu.
4. Pastikan baris pertama tetap menjadi header.
5. Pastikan angka seperti `rate_per_hour` tidak memakai format Rp, titik, atau koma.
6. Ikuti detail lengkap di `spreadsheet-template/IMPORT_GUIDE.md`.
