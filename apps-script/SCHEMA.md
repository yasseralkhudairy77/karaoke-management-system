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

### Fase UI-2A - Filter Periode Transaksi

GET `getTodayTransactions` tetap backward compatible. Tanpa parameter `period`, default `today`.

Query parameter opsional:

- `period` — `today`, `yesterday`, `last7days`, `thismonth`, `all`, `custom`
- `start_date` — wajib untuk `custom`, format `YYYY-MM-DD`
- `end_date` — wajib untuk `custom`, format `YYYY-MM-DD`

Filter tanggal memakai timezone Jakarta dengan urutan field:

1. `created_at`
2. fallback `end_time`
3. fallback `start_time`

Periode:

- `today` — hari ini (Jakarta)
- `yesterday` — kemarin (Jakarta)
- `last7days` — 6 hari sebelum hari ini sampai hari ini (7 hari inklusif)
- `thismonth` — tanggal 1 bulan berjalan sampai hari ini
- `all` — semua transaksi
- `custom` — `start_date` sampai `end_date` inklusif

Error:

- period tidak dikenal → `Periode transaksi tidak dikenal.`
- custom tanpa tanggal → `Tanggal mulai dan tanggal akhir wajib diisi untuk periode custom.`
- `start_date > end_date` → `Tanggal mulai tidak boleh lebih besar dari tanggal akhir.`

Summary response dihitung dari hasil filter periode, termasuk `cash_revenue` dan `transfer_revenue`.

### Fase UI-2A - Filter Periode Cashier Closings

GET `getTodayCashierClosings` tetap backward compatible. Tanpa parameter `period`, default `today`.

Query parameter opsional (sama dengan transaksi):

- `period` — `today`, `yesterday`, `last7days`, `thismonth`, `all`, `custom`
- `start_date` — wajib untuk `custom`, format `YYYY-MM-DD`
- `end_date` — wajib untuk `custom`, format `YYYY-MM-DD`

Filter tanggal memakai timezone Jakarta dengan urutan field:

1. `closing_date`
2. fallback `created_at`

Periode dan error mengikuti aturan yang sama dengan `getTodayTransactions`.

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
