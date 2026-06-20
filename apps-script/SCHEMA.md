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
