# Google Spreadsheet Schema

Desain awal database Karaoke POS memakai satu Google Spreadsheet dengan beberapa tab. Baris pertama setiap tab harus berisi header persis seperti daftar kolom di bawah.

## Rooms

Menyimpan status room karaoke yang akan dibaca dashboard.

| Column | Description |
| --- | --- |
| `room_id` | ID unik room, contoh `ROOM-001`. |
| `room_name` | Nama room yang tampil di dashboard. |
| `status` | Status room. |
| `start_time` | Waktu mulai sesi, kosong jika room tersedia. |
| `booked_duration_minutes` | Durasi booking dalam menit, diisi saat sesi dimulai dan dikosongkan saat sesi selesai. |
| `scheduled_end_time` | Jadwal selesai sesi berdasarkan `start_time + booked_duration_minutes`. Dipakai countdown dashboard, bukan auto-close. |
| `rate_per_hour` | Tarif room per jam dalam IDR. |
| `tv_device_id` | ID perangkat TV atau controller, jika ada. |
| `updated_at` | Waktu terakhir data room diperbarui. |

Contoh `status`:

- `available`
- `occupied`
- `maintenance`

`start_time` adalah jangkar sesi dan tidak boleh diubah saat tambah waktu (extend). Hanya `booked_duration_minutes` dan `scheduled_end_time` yang bertambah.

### Fase 6A - Master Room

POST `saveRoomMaster` dan `updateRoomMaster` mengelola data master room.

- ID baru memakai format `ROOM-001`, `ROOM-002`, dst.
- Field yang boleh diubah dari Pengaturan: `room_name`, `rate_per_hour`, `tv_device_id`, `status`.
- Field sesi tidak diubah dari Pengaturan: `start_time`, `booked_duration_minutes`, `scheduled_end_time`.
- Room `occupied` tidak boleh diubah paksa ke `available` atau `maintenance` dari Pengaturan.
- Fase 6B: POST `deleteRoomMaster` menghapus permanen hanya jika room belum punya histori di `Transactions`, `FnbOrders`, atau `RoomTimeLogs`.

## RoomTimeLogs

Menyimpan audit log perubahan durasi booking room.

| Column | Description |
| --- | --- |
| `log_id` | ID unik log, contoh `RTL-20260620-091500-123`. |
| `created_at` | Timestamp log dibuat. |
| `action_type` | Jenis aksi, contoh `extend_session`. |
| `room_id` | ID room terkait. |
| `room_name` | Nama room saat log dibuat. |
| `old_booked_duration_minutes` | Durasi booking sebelum perubahan. |
| `new_booked_duration_minutes` | Durasi booking setelah perubahan. |
| `old_scheduled_end_time` | Jadwal selesai sebelum perubahan. |
| `new_scheduled_end_time` | Jadwal selesai setelah perubahan. |
| `add_minutes` | Jumlah menit yang ditambahkan. |
| `cashier_name` | Nama kasir yang memproses. |
| `note` | Catatan opsional. |

### Fase 5E - Audit Log Tambah Waktu Room

Sheet `RoomTimeLogs` dibuat otomatis oleh backend jika belum ada.

POST `extendSession` menerima `note` opsional dan menulis log `extend_session` setelah room berhasil di-extend. Jika penulisan log gagal, perubahan durasi dibatalkan.

GET `getTodayRoomTimeLogs` membaca log hari ini (tanggal Jakarta di `created_at`).

Query parameter opsional:

- `room_id` — filter per room.
- `action_type` — filter jenis log; valid: `extend_session`.

Jika `action_type` tidak valid: `{ ok: false, error: "Jenis log waktu room tidak dikenal." }`.

Response:

```json
{
  "ok": true,
  "room_time_logs": [],
  "summary": {
    "total_logs": 0,
    "total_added_minutes": 0,
    "rooms_extended": 0
  }
}
```

Endpoint ini read-only. Tidak mengubah durasi room, billing, F&B, atau stok.

## Transactions

Menyimpan riwayat transaksi room.

| Column | Description |
| --- | --- |
| `transaction_id` | ID unik transaksi. |
| `room_id` | ID room terkait. |
| `room_name` | Nama room saat transaksi dibuat. |
| `start_time` | Waktu mulai sesi. |
| `end_time` | Waktu selesai sesi. |
| `duration_minutes` | Durasi sesi dalam menit. |
| `rate_per_hour` | Tarif per jam yang dipakai transaksi. |
| `room_total` | Total biaya room saja. |
| `fnb_total` | Total F&B dari order open yang masuk tagihan. |
| `grand_total` | Total akhir tagihan, yaitu `room_total + fnb_total`. |
| `fnb_order_ids` | Daftar `order_id` F&B yang digabung, dipisahkan koma. |
| `payment_method` | Metode pembayaran. |
| `payment_status` | Status pembayaran. |
| `cashier_name` | Nama kasir yang memproses transaksi. |
| `created_at` | Waktu transaksi dibuat. |

Contoh `payment_method`:

- `cash`
- `qris`
- `transfer`

Contoh `payment_status`:

- `unpaid`
- `paid`
- `cancelled`

### Fase UI-2A / UI-2B - Filter Periode & Tanggal Operasional

GET `getTodayTransactions` tetap backward compatible. Tanpa parameter `period`, default `today` (shift operasional aktif).

Query parameter opsional:

- `period` — `today` (alias `activeshift`), `yesterday`, `last7days`, `thismonth`, `all`, `custom`
- `start_date` — wajib untuk `custom`, format `YYYY-MM-DD` (tanggal operasional)
- `end_date` — wajib untuk `custom`, format `YYYY-MM-DD` (tanggal operasional)

#### Konsep `operational_date` (Fase UI-2B)

Belum ada kolom baru di sheet. `operational_date` dihitung dinamis dari datetime dengan cutoff jam 10:00 pagi (Asia/Jakarta):

`operational_date = date(datetime - 10 jam)`

Contoh:

- `2026-06-20 18:00` → `2026-06-20`
- `2026-06-21 00:31` → `2026-06-20`
- `2026-06-21 09:59` → `2026-06-20`
- `2026-06-21 10:00` → `2026-06-21`

Konstanta backend: `OPERATIONAL_CUTOFF_HOUR = 10`

#### Filter transaksi

Urutan datetime sumber:

1. `created_at`
2. fallback `end_time`
3. fallback `start_time`

Lalu dihitung `operational_date` dan dibandingkan dengan rentang periode.

#### Periode operasional

- `today` — shift operasional aktif sekarang
- `yesterday` — 1 operational day sebelum shift aktif
- `last7days` — 7 operational day terakhir termasuk shift aktif
- `thismonth` — operational_date dari tanggal 1 bulan operasional aktif sampai shift aktif
- `all` — semua data
- `custom` — `start_date` sampai `end_date` berdasarkan operational_date (inklusif)

Error:

- period tidak dikenal → `Periode transaksi tidak dikenal.`
- custom tanpa tanggal → `Tanggal mulai dan tanggal akhir wajib diisi untuk periode custom.`
- `start_date > end_date` → `Tanggal mulai tidak boleh lebih besar dari tanggal akhir.`

Response metadata opsional:

- `operational_date_start`
- `operational_date_end`
- `operational_cutoff_hour`

Summary response dihitung dari hasil filter periode, termasuk `cash_revenue` dan `transfer_revenue`.

### Fase UI-2A / UI-2B - Filter Periode Cashier Closings

GET `getTodayCashierClosings` tetap backward compatible. Tanpa parameter `period`, default shift aktif.

Query parameter opsional (sama dengan transaksi).

Filter `operational_date` dari:

1. `closing_date` jika format `YYYY-MM-DD` (tanpa jam) → dipakai langsung sebagai operational_date
2. jika `closing_date` punya jam → dihitung operational_date
3. fallback `created_at` → dihitung operational_date

### Endpoint lain yang memakai operational_date (UI-2B)

Semua endpoint "Today" di bawah ini default ke shift aktif (`period=today`) dan mendukung parameter periode yang sama jika aman:

| Endpoint | Sumber datetime |
| --- | --- |
| `getTodayFnbSalesReport` | `created_at`, fallback `updated_at` |
| `getTodayFnbOrders` | `created_at`, fallback `updated_at` |
| `getTodayStockMovements` | `created_at` |
| `getTodayRoomTimeLogs` | `created_at` |

### Fase 5F - Laporan Pemakaian Room (`getRoomUsageReport`)

GET `getRoomUsageReport` — laporan pemakaian room dan revenue berdasarkan `operational_date`.

Query parameter:

- `period` — `today`, `yesterday`, `last7days`, `thismonth`, `all`, `custom` (default `today` = shift aktif)
- `start_date` — wajib untuk `custom`, format `YYYY-MM-DD` (tanggal operasional)
- `end_date` — wajib untuk `custom`

Sumber data: sheet `Transactions` (hanya transaksi yang sudah dibuat via `closeSession`).

Filter `operational_date` dari:

1. `created_at`
2. fallback `end_time`
3. fallback `start_time`

Revenue:

- `grand_total` jika ada
- fallback `room_total + fnb_total`

Response:

- `summary` — total sesi, durasi, omzet room/F&B/grand, paid/unpaid, room terpakai, room terlaris
- `room_usage[]` — agregat per `room_id` (fallback `room_name`)
- `transactions[]` — detail transaksi hasil filter, termasuk `operational_date`
- metadata: `operational_date_start`, `operational_date_end`, `operational_cutoff_hour`

Error period tidak dikenal: `Periode laporan room tidak dikenal.`

## CashierClosings

Menyimpan hasil tutup kasir sederhana.

| Column | Description |
| --- | --- |
| `closing_id` | ID closing unik, contoh `CLS-20260619-090501-123`. |
| `closing_date` | Tanggal closing format `YYYY-MM-DD` Asia/Jakarta. |
| `cashier_name` | Nama kasir, default `Kasir`. |
| `total_transactions` | Jumlah semua transaksi pada hari closing. |
| `paid_transactions` | Jumlah transaksi lunas. |
| `unpaid_transactions` | Jumlah transaksi belum dibayar. |
| `cash_transactions` | Jumlah transaksi lunas dengan metode cash. |
| `transfer_transactions` | Jumlah transaksi lunas dengan metode transfer. |
| `paid_revenue` | Total nominal transaksi lunas. |
| `cash_expected` | Total nominal transaksi paid cash menurut sistem. |
| `cash_actual` | Uang cash aktual yang diinput kasir. |
| `cash_difference` | Selisih `cash_actual - cash_expected`. |
| `transfer_revenue` | Total nominal transaksi paid transfer. |
| `unpaid_revenue` | Total nominal transaksi belum dibayar. |
| `total_revenue` | Total semua tagihan hari closing. |
| `note` | Catatan kasir. |
| `created_at` | Timestamp closing dibuat. |

Catatan: pada fase sederhana ini backend mencegah duplikat closing berdasarkan `closing_date`.

## Inventory

Menyimpan stok bahan atau item operasional.

| Column | Description |
| --- | --- |
| `stock_item_id` | ID unik item stok, contoh `STOCK-001`. |
| `stock_item_name` | Nama item stok. |
| `category` | Kategori stok, contoh `Minuman` atau `Snack`. |
| `unit` | Satuan stok, contoh `pcs`, `botol`, atau `pack`. |
| `stock_qty` | Jumlah stok saat ini. |
| `min_stock` | Batas stok rendah. |
| `status` | Status item stok, contoh `active` atau `inactive`. |
| `updated_at` | Waktu terakhir stok diperbarui. |

Catatan backward compatibility: data lama dengan header `item_id` atau `item_name` tidak dihapus. Fase stok dasar memakai standar baru `stock_item_id` dan `stock_item_name`.

### Fase 6A - Master Inventory

POST `saveInventoryMaster` dan `updateInventoryMaster` mengelola master inventory.

- ID baru memakai format `ITEM-001`, `ITEM-002`, dst.
- Field yang dikelola: `stock_item_name`, `category`, `unit`, `min_stock`, `status`.
- `stock_qty` untuk item baru dibuat `0`.
- Perubahan stok berjalan tetap melalui POST `adjustInventoryStock` agar `StockMovements` tetap konsisten.
- Fase 6B: POST `deleteInventoryMaster` menghapus permanen hanya jika item tidak dipakai oleh `Menu` dan belum punya `StockMovements`.

## Menu

Menyimpan daftar menu yang bisa dijual.

| Column | Description |
| --- | --- |
| `menu_id` | ID unik menu. |
| `menu_name` | Nama menu. |
| `category` | Kategori menu, contoh `Minuman`, `Snack`, atau `Makanan`. |
| `price` | Harga jual menu. |
| `status` | Status menu, contoh `active` atau `inactive`. |
| `updated_at` | Waktu terakhir menu diperbarui. |
| `stock_tracking` | `yes` jika menu mengurangi stok langsung, `no` jika tidak. |
| `stock_item_id` | ID item stok di tab `Inventory`. |
| `stock_qty_per_unit` | Jumlah stok yang berkurang setiap 1 menu terjual. |

Fase stok dasar hanya mendukung stok item langsung. Recipe/BOM belum dipakai.

### Fase 6A - Master Menu

POST `saveMenuMaster` dan `updateMenuMaster` mengelola master menu.

- ID baru memakai format `MENU-001`, `MENU-002`, dst.
- Field yang dikelola: `menu_name`, `category`, `price`, `stock_item_id`, `stock_qty_per_unit`, `status`.
- Menu `inactive` tidak boleh dipakai dalam order F&B.
- Jika `stock_item_id` kosong, backend menyimpan `stock_tracking = no`.
- Fase 6B: POST `deleteMenuMaster` menghapus permanen hanya jika menu belum pernah muncul di `FnbOrderItems`.

## MasterDataAuditLogs

Mencatat perubahan master data Room, Menu F&B, dan Inventory.

| Column | Description |
| --- | --- |
| `log_id` | ID audit, contoh `AUDIT-000001`. |
| `created_at` | Timestamp audit dibuat. |
| `entity_type` | `room`, `menu`, atau `inventory`. |
| `entity_id` | ID data master terkait. |
| `entity_name` | Nama data master saat audit dibuat. |
| `action_type` | `create`, `update`, `activate`, `deactivate`, `maintenance`, `delete_permanent`, atau `delete_blocked`. |
| `old_value_json` | JSON data sebelum perubahan. |
| `new_value_json` | JSON data setelah perubahan. |
| `changed_by` | User/admin yang melakukan perubahan. |
| `note` | Catatan opsional. |
| `result` | `success`, `blocked`, atau `failed`. |
| `block_reason` | Alasan jika delete permanen ditolak. |

GET `getMasterDataAuditLogs` membaca 100 log terbaru secara default.

Query parameter opsional:

- `entity_type` — `room`, `menu`, `inventory`, atau `all`
- `action_type` — filter jenis aksi
- `limit` — default `100`, maksimum `500`
- `period` — `today`, `last7days`, atau `all`

## StockMovements

Menyimpan audit mutasi stok dari transaksi F&B dan perubahan manual inventory.

| Column | Description |
| --- | --- |
| `movement_id` | ID unik mutasi stok, contoh `MOV-20260620-091500-123`. |
| `created_at` | Timestamp mutasi dibuat. |
| `stock_item_id` | ID item stok. |
| `stock_item_name` | Nama item stok saat mutasi dibuat. |
| `movement_type` | Jenis mutasi: `out` (F&B billed), `in` (restock manual), atau `adjustment` (koreksi stok aktual). |
| `reference_type` | Referensi mutasi, contoh `transaction` atau `manual_adjustment`. |
| `reference_id` | ID transaksi room atau `movement_id` untuk adjustment manual. |
| `qty_change` | Perubahan stok, negatif untuk stok keluar. |
| `stock_before` | Stok sebelum mutasi. |
| `stock_after` | Stok setelah mutasi. |
| `note` | Catatan mutasi. |
| `cashier_name` | Nama kasir yang memproses transaksi. |

### Fase 4K - Restock / Adjustment Manual

Perubahan stok manual lewat endpoint POST `adjustInventoryStock` wajib menulis row ke tab ini sebelum atau bersamaan dengan update `Inventory.stock_qty`.

- `restock`: `movement_type = in`, `reference_type = manual_adjustment`, `qty_change` positif.
- `set_stock`: `movement_type = adjustment`, `reference_type = manual_adjustment`, `qty_change` = selisih stok aktual baru dengan stok sebelumnya.

Tidak ada sheet baru. Gunakan tab existing `Inventory` dan `StockMovements`.

### Fase 4L - Riwayat Mutasi Stok Hari Ini

Endpoint GET `getTodayStockMovements` membaca tab `StockMovements` dan mengembalikan mutasi hari ini berdasarkan tanggal Jakarta di kolom `created_at`.

Query parameter opsional:

- `stock_item_id` — filter per item stok.
- `movement_type` — filter jenis mutasi.
- `reference_type` — filter jenis referensi.

`movement_type` valid:

- `in` — stok masuk dari restock manual.
- `out` — stok keluar dari transaksi F&B saat `closeSession`.
- `adjustment` — koreksi stok aktual manual.

Jika `movement_type` tidak valid, response: `{ ok: false, error: "Jenis mutasi stok tidak dikenal." }`.

`reference_type` valid:

- `transaction` — mutasi dari penagihan F&B saat sesi ditutup.
- `manual_adjustment` — mutasi dari restock atau koreksi stok manual.

Jika `reference_type` tidak valid, response: `{ ok: false, error: "Jenis referensi mutasi stok tidak dikenal." }`.

Response minimal:

```json
{
  "ok": true,
  "stock_movements": [],
  "summary": {
    "total_movements": 0,
    "total_in_qty": 0,
    "total_out_qty": 0,
    "total_adjustment_abs_qty": 0,
    "in_movements": 0,
    "out_movements": 0,
    "adjustment_movements": 0
  }
}
```

Aturan summary:

- `in`: jumlahkan `qty_change` positif ke `total_in_qty`.
- `out`: jumlahkan nilai absolut `qty_change` ke `total_out_qty`.
- `adjustment`: jumlahkan nilai absolut `qty_change` ke `total_adjustment_abs_qty`.
- Hitung jumlah row per `movement_type`.

Mutasi diurutkan terbaru di atas. Jika sheet kosong atau belum ada, response aman dengan array kosong.

### Fase 4M - Laporan Penjualan F&B & Stok Rendah

Endpoint GET `getTodayFnbSalesReport` hanya membaca data; tidak mengubah stok, billing, payment, atau closing.

Sumber data:

- `FnbOrders` dengan `order_status = billed` dan `created_at` hari ini (tanggal Jakarta).
- `FnbOrderItems` untuk item yang `order_id`-nya termasuk order billed hari ini.
- `Inventory` untuk deteksi stok rendah dan stok minus.
- `Menu` opsional sebagai fallback nama/kategori menu.

Order `open` dan `cancelled` tidak masuk laporan penjualan.

Response minimal:

```json
{
  "ok": true,
  "summary": {
    "total_fnb_orders": 0,
    "total_items_sold": 0,
    "total_fnb_sales": 0,
    "unique_menus_sold": 0,
    "top_menu_name": "",
    "top_menu_quantity": 0,
    "low_stock_count": 0,
    "negative_stock_count": 0
  },
  "menu_sales": [],
  "low_stock_items": []
}
```

`menu_sales` di-group per `menu_id` dengan `quantity_sold`, `gross_sales`, dan `order_count`. Urutan: `quantity_sold` terbesar, lalu `gross_sales` terbesar.

`low_stock_items` memakai `Inventory`:

- `stock_qty < 0` → `stock_status = negative`, masuk daftar, `negative_stock_count` bertambah.
- `stock_qty <= min_stock` → `stock_status = low`, masuk daftar, `low_stock_count` bertambah.
- `stock_qty > min_stock` → tidak masuk daftar.
- `min_stock` kosong dianggap `0`.
- `suggested_restock_qty = max(0, min_stock - stock_qty)`.

Urutan `low_stock_items`: negative dulu, lalu low, lalu `stock_qty` terkecil.

Catatan: Recipe/BOM di-skip dulu. Fase ini fokus laporan operasional penjualan F&B dan stok rendah.

## FnbOrders

Menyimpan header order F&B untuk ruangan.

| Column | Description |
| --- | --- |
| `order_id` | ID order unik, contoh `FNB-20260619-101500-123`. |
| `room_id` | ID room terkait. |
| `room_name` | Nama room saat order dibuat. |
| `room_start_time` | Waktu mulai sesi room saat order dibuat. |
| `order_status` | Status order F&B, contoh `open`, `billed`, atau `cancelled`. Default saat order dibuat adalah `open`. |
| `order_total` | Total order F&B. |
| `cashier_name` | Nama kasir, default `Kasir`. |
| `note` | Catatan order, boleh kosong. |
| `created_at` | Timestamp order dibuat. |
| `updated_at` | Timestamp terakhir order diperbarui. |
| `cancel_reason` | Alasan pembatalan order F&B, kosong jika belum dibatalkan. |
| `cancelled_by` | Nama kasir/user yang membatalkan order, kosong jika belum dibatalkan. |
| `cancelled_at` | Timestamp pembatalan order, kosong jika belum dibatalkan. |

## FnbOrderItems

Menyimpan item detail untuk setiap order F&B.

| Column | Description |
| --- | --- |
| `order_id` | Relasi ke tab `FnbOrders`. |
| `menu_id` | ID menu dari tab `Menu`. |
| `menu_name` | Nama menu saat order dibuat. |
| `category` | Kategori menu saat order dibuat. |
| `price` | Harga menu saat order dibuat. |
| `quantity` | Jumlah item. |
| `subtotal` | `price * quantity`. |
| `created_at` | Timestamp item dicatat. |

## Recipe

Menghubungkan menu dengan item inventory yang dipakai.

| Column | Description |
| --- | --- |
| `recipe_id` | ID unik recipe. |
| `menu_id` | ID menu terkait. |
| `item_id` | ID item inventory yang digunakan. |
| `qty_used` | Jumlah item yang dipakai untuk satu menu. |
| `unit` | Satuan pemakaian. |

## Employees

Menyimpan data karyawan awal.

| Column | Description |
| --- | --- |
| `employee_id` | ID unik karyawan. |
| `employee_name` | Nama karyawan. |
| `role` | Peran karyawan, contoh `cashier`, `admin`, `manager`. |
| `salary_type` | Jenis gaji, contoh `monthly`, `daily`, `shift`. |
| `base_salary` | Nilai gaji dasar. |
| `is_active` | Status aktif karyawan, contoh `TRUE` atau `FALSE`. |

## Settings

Menyimpan konfigurasi sederhana untuk aplikasi.

| Column | Description |
| --- | --- |
| `key` | Nama konfigurasi. |
| `value` | Nilai konfigurasi. |
| `description` | Penjelasan konfigurasi. |

## Catatan Integrasi

Untuk fase ini schema hanya dipakai sebagai dasar backend baca data room. Jangan tambahkan logic billing, QRIS, mutasi inventory, atau update spreadsheet dulu.

TODO: Pada fase berikutnya, frontend akan membaca endpoint Google Apps Script `?action=getRooms` untuk menggantikan data mock.
