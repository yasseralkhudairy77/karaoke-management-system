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
- `paid_waiting_start`
- `occupied`
- `cleaning`
- `maintenance`

`start_time` adalah jangkar sesi dan tidak boleh diubah saat tambah waktu (extend). Hanya `booked_duration_minutes` dan `scheduled_end_time` yang bertambah.

Catatan lifecycle operasional:

- `paid_waiting_start` dipakai setelah booking disiapkan dan sebelum countdown dimulai.
- `cleaning` direncanakan untuk fase setelah sesi selesai tetapi room belum siap dijual kembali.
- Backend legacy masih mendukung `available`, `occupied`, dan `maintenance`; status baru diaktifkan bertahap melalui action lifecycle khusus.

### Fase 6A - Master Room

POST `saveRoomMaster` dan `updateRoomMaster` mengelola data master room.

- ID baru memakai format `ROOM-001`, `ROOM-002`, dst.
- Field yang boleh diubah dari Pengaturan: `room_name`, `rate_per_hour`, `tv_device_id`, `status`.
- Field sesi tidak diubah dari Pengaturan: `start_time`, `booked_duration_minutes`, `scheduled_end_time`.
- Room `occupied` tidak boleh diubah paksa ke `available` atau `maintenance` dari Pengaturan.
- Fase 6B: POST `deleteRoomMaster` menghapus permanen hanya jika room belum punya histori di `Transactions`, `FnbOrders`, atau `RoomTimeLogs`.

### Fase 7B-2C-A - Expired Session Diagnostics

POST `getExpiredRoomRecoveryList` membaca kandidat room yang masih `occupied` tetapi waktu sesi sudah habis atau data waktu selesainya tidak valid.

Action ini read-only:

- Tidak mengubah `Rooms`.
- Tidak mengubah session, status room, transaksi, F&B, stok, atau TV.
- Tidak melakukan auto-close dan tidak melakukan recovery.
- Recovery/mutasi akan dibuat pada fase berikutnya setelah kandidat tervalidasi.

Payload opsional:

```json
{
  "action": "getExpiredRoomRecoveryList",
  "grace_minutes": 5,
  "include_invalid_end_time": true
}
```

Response summary:

- `ok`
- `success`
- `server_time`
- `operational_date`
- `total_rooms_checked`
- `expired_count`
- `invalid_count`
- `candidates`

Field kandidat:

- `room_id`
- `room_name`
- `room_status`
- `session_id`
- `start_time`
- `end_time`
- `duration_minutes`
- `remaining_seconds`
- `expired_minutes`
- `issue_type`: `expired_session`, `invalid_end_time`, atau `occupied_without_session`
- `recommended_action`: `manual_review` atau `eligible_for_recovery`
- `safe_to_recover`
- `reason`

Safety boundary: response diagnostic ini tidak mengirim `payment_status`, `payment_method`, `room_total`, `fnb_total`, `grand_total`, `cashier_name`, data customer, `display_token`, token display, atau detail transaksi sensitif.

### Fase 7B-2C-B-A - Manual Expired Room Recovery

POST `recoverExpiredRoomSession` memulihkan satu room expired yang sudah lolos diagnostic `getExpiredRoomRecoveryList`.

Action ini manual-only:

- Wajib memakai `confirm = RECOVER`.
- Tidak melakukan auto-recovery semua room.
- Tidak menghapus histori session, transaksi, F&B, payment, atau operational date.
- Tidak mengubah `start_time`.
- Tidak menyalakan atau mematikan TV.

Payload:

```json
{
  "action": "recoverExpiredRoomSession",
  "room_id": "ROOM-001",
  "session_id": "ROOM-001-202606221141540700",
  "confirm": "RECOVER",
  "reason": "Manual recovery after expired session diagnostic",
  "actor": "system"
}
```

Validasi:

- Jika `confirm` bukan `RECOVER`, response error memakai `code = RECOVERY_CONFIRMATION_REQUIRED`.
- Jika `room_id` kosong, response error memakai `code = ROOM_ID_REQUIRED`.
- Jika `session_id` dikirim tetapi tidak cocok dengan candidate diagnostic, response error memakai `code = RECOVERY_SESSION_MISMATCH`.
- Recovery hanya boleh untuk candidate dengan `issue_type = expired_session`, `safe_to_recover = true`, dan `recommended_action = eligible_for_recovery`.
- Jika tidak eligible, response error memakai `code = ROOM_NOT_ELIGIBLE_FOR_RECOVERY`.

Response sukses:

```json
{
  "ok": true,
  "success": true,
  "code": "ROOM_RECOVERED",
  "message": "Room berhasil dipulihkan.",
  "server_time": "...",
  "operational_date": "yyyy-MM-dd",
  "recovery": {
    "room_id": "ROOM-001",
    "room_name": "Ruangan 1 - Sakura",
    "previous_status": "occupied",
    "new_status": "available",
    "session_id": "ROOM-001-202606221141540700",
    "issue_type": "expired_session",
    "expired_minutes": 0,
    "recovered_at": "...",
    "reason": "Manual expired room recovery",
    "actor": "system"
  }
}
```

Recovery menulis audit minimal ke sheet `RoomRecoveryLogs`.

Safety boundary: response recovery ini tidak mengirim `payment_status`, `payment_method`, `room_total`, `fnb_total`, `grand_total`, `cashier_name`, data customer, token display, `display_token`, atau detail transaksi sensitif.

## RoomRecoveryLogs

Menyimpan audit manual recovery untuk room expired.

| Column | Description |
| --- | --- |
| `log_id` | ID unik log recovery, contoh `RRL-20260623-120000-123`. |
| `timestamp` | Timestamp recovery dibuat. |
| `room_id` | ID room yang dipulihkan. |
| `room_name` | Nama room saat recovery. |
| `session_id` | ID sesi display/room yang divalidasi saat recovery. |
| `issue_type` | Jenis issue, contoh `expired_session`. |
| `expired_minutes` | Lama waktu expired dalam menit saat recovery. |
| `action` | Aksi recovery, contoh `recover_expired_room_session`. |
| `reason` | Alasan manual recovery. |
| `actor` | Operator/sistem yang menjalankan recovery. |
| `result` | Hasil aksi, contoh `success`. |

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

## TVDevices

Menyimpan mapping perangkat TV per room. Fase 7A-0 hanya memakai `control_type = mock`.

| Column | Description |
| --- | --- |
| `tv_device_id` | ID unik perangkat TV/controller, contoh `TV-001`. |
| `room_id` | ID room yang terhubung ke perangkat. |
| `device_name` | Nama perangkat opsional untuk pengaturan. |
| `control_type` | Tipe kontrol: `mock`, `middleware`, `home_assistant`, `manual`. |
| `status` | Status perangkat, `active` atau `inactive`. |
| `middleware_url` | URL endpoint middleware (mis. `https://tunnel.example/tv-command`). Wajib jika `control_type=middleware`. Tidak ditampilkan di card room. |
| `device_identifier` | Identifier teknis perangkat. Tidak ditampilkan di card room. |
| `updated_at` | Waktu terakhir metadata perangkat diperbarui. |

GET `getTvDevices` membaca data dari sheet `TVDevices`.

POST `saveTvDevice` membuat mapping TV baru. Validasi:

- `tv_device_id`, `room_id`, dan `device_name` wajib diisi
- `room_id` harus ada di sheet `Rooms`
- `control_type` hanya `mock`, `middleware`, `home_assistant`, atau `manual`
- `middleware_url` wajib jika `control_type=middleware`
- `status` hanya `active` atau `inactive`
- `tv_device_id` tidak boleh duplikat saat create
- Jika status `active`, device aktif lain di room yang sama otomatis dinonaktifkan

POST `updateTvDevice` memperbarui mapping TV existing dengan validasi yang sama. `tv_device_id` tidak bisa diganti.

## TVDisplays

Menyimpan akses display pelanggan per room. Display pelanggan memakai `room_id + display_token` dan tidak bergantung pada `TVDevices`.

| Column | Description |
| --- | --- |
| `display_id` | ID unik display, contoh `DISPLAY-ROOM-002`. |
| `room_id` | ID room terkait. |
| `display_name` | Nama display yang tampil di response aman. |
| `display_token` | Token rahasia panjang untuk akses display. Tidak dikirim balik oleh endpoint display pelanggan. |
| `display_enabled` | `true` jika display boleh diakses. |
| `refresh_interval_seconds` | Interval refresh yang disarankan untuk halaman display. |
| `notes` | Catatan internal. |
| `created_at` | Timestamp row dibuat. |
| `updated_at` | Timestamp terakhir metadata display diperbarui. |

POST `seedPilotTvDisplay` membuat atau memperbarui row pilot untuk `ROOM-002 / Ruangan 2 - Melati`.

- `display_id`: `DISPLAY-ROOM-002`
- `display_name`: `Display Ruangan 2 - Melati`
- `display_enabled`: `true`
- `refresh_interval_seconds`: `30`
- Token existing tidak dioverwrite jika row sudah ada.
- Response seed boleh menyertakan `token` dan `display_url_hint` untuk admin/dev manual test.

POST `seedTvDisplaysForAllRooms` membuat foundation display untuk semua room valid di sheet `Rooms`.

- Room valid minimal punya `room_id` dan `room_name`.
- Jika display room belum ada, backend membuat row baru di `TVDisplays`.
- Jika display sudah ada, token existing tidak dioverwrite.
- `display_id` memakai format `DISPLAY-{ROOM_ID}`, contoh `DISPLAY-ROOM-001`.
- `display_name` memakai format `Display {room_name}`.
- Response setup admin menyertakan summary `total_rooms_checked`, `created_count`, `existing_count`, `skipped_count`, dan `displays`.

POST `rotateTvDisplayToken` mengganti token display satu room.

Contoh payload:

```json
{
  "action": "rotateTvDisplayToken",
  "room_id": "ROOM-002",
  "confirm": "ROTATE"
}
```

- Token hanya dirotasi jika `confirm` persis `ROTATE`.
- Metadata display existing seperti `display_id`, `room_id`, dan `display_name` tidak diubah kecuali kosong/rusak.
- Response setup admin menyertakan token baru dan `display_url_hint`.

POST `getTvDisplaySetupList` membaca daftar setup display yang sudah ada di `TVDisplays`.

- Action ini ditujukan untuk admin/setup TV dan boleh mengirim `token` serta `display_url_hint`.
- Action ini tidak dipakai oleh halaman Customer TV Display.
- Token setup admin harus tetap diperlakukan sebagai rahasia operasional.

POST `getCustomerDisplayState` membaca state display pelanggan berdasarkan `room_id` dan `token`.

Contoh payload:

```json
{
  "action": "getCustomerDisplayState",
  "room_id": "ROOM-002",
  "token": "TOKEN-PANJANG-DARI-TVDisplays"
}
```

Response sukses berisi `server_time`, `operational_date`, ringkasan `room`, countdown `session`, metadata `display`, dan command TV terakhir jika ada.

Endpoint ini sengaja aman untuk pelanggan:

- Tidak mengirim `token`.
- Tidak mengirim `display_token`.
- Tidak mengirim `payment_status`, `payment_method`, `room_total`, `fnb_total`, atau `grand_total`.
- Tidak mengirim `cashier_name` atau data customer sensitif.
- Jika room tidak punya sesi aktif, `session.has_active_session = false`, `remaining_seconds = 0`, dan `warning_level = idle`.
- Jika room `occupied` tetapi `scheduled_end_time` invalid, response memakai pesan aman `Silakan hubungi kasir.`

## TVControlLogs

Menyimpan audit log semua command TV, termasuk command yang gagal.

| Column | Description |
| --- | --- |
| `log_id` | ID unik log, contoh `TVL-20260621-120000-123`. |
| `created_at` | Timestamp log dibuat. |
| `room_id` | ID room terkait. |
| `tv_device_id` | ID perangkat TV yang ditargetkan. |
| `tv_action` | `test`, `power_on`, atau `power_off`. |
| `trigger_source` | Sumber trigger, contoh `room_card`. |
| `cashier_name` | Nama kasir/operator. |
| `control_type` | Tipe kontrol perangkat saat command dikirim. |
| `result` | `sent`, `failed`, atau `timeout`. |
| `success` | `true` jika command berhasil dikirim ke control layer. |
| `block_reason` | Alasan gagal, contoh `TV_DEVICE_NOT_FOUND`. |
| `message` | Pesan ringkas untuk UI. |
| `raw_response` | Respons mentah dari middleware (jika ada), dipotong maks. 2000 karakter. |

POST `sendTvCommand` menerima `room_id`, `tv_device_id`, `tv_action`, `trigger_source`, dan `cashier_name`.

Perilaku `sendTvCommand` per `control_type`:

- `mock` — simulasi lama (termasuk `TV-FAIL`, `TV-TIMEOUT`)
- `middleware` — POST JSON ke `middleware_url` via `UrlFetchApp.fetch`
- `home_assistant`, `manual` — ditolak `TV_CONTROL_TYPE_UNSUPPORTED`

Block reason middleware (Fase 7A-3):

| block_reason | Deskripsi |
| --- | --- |
| `MIDDLEWARE_URL_EMPTY` | `middleware_url` kosong |
| `INVALID_MIDDLEWARE_URL` | URL tidak valid |
| `MIDDLEWARE_ERROR` | Gagal fetch atau respons error |
| `MIDDLEWARE_TIMEOUT` | Timeout fetch atau middleware mengembalikan timeout |

Payload POST ke middleware:

```json
{
  "room_id": "ROOM-001",
  "tv_device_id": "TV-001",
  "tv_action": "power_on",
  "trigger_source": "room_card",
  "requested_by": "Kasir"
}
```

GET `getTvControlLogs` membaca log TV. Query opsional: `room_id`, `tv_device_id`, `limit`.

### Trigger Source TV (Fase 7A-1)

| trigger_source | Deskripsi |
| --- | --- |
| `room_card` | Command dari tombol TEST / TV ON / TV OFF di card room |
| `settings_page` | Command test dari tab Pengaturan (owner/manager) |

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
| `bonus_sales_lc` | Bonus LC per quantity menu. Bonus otomatis dibagi rata ke LC aktif di room. |
| `hpp` | Harga pokok menu untuk analisa margin. |
| `variable_cost_rate` | Persentase variable cost menu, contoh `5` untuk 5%. |

Fase stok dasar hanya mendukung stok item langsung. Recipe/BOM belum dipakai.

### Fase 6A - Master Menu

POST `saveMenuMaster` dan `updateMenuMaster` mengelola master menu.
POST `bulkUpdateMenuProfitability` mengupdate massal `price`, `hpp`, `variable_cost_rate`, dan `bonus_sales_lc` berdasarkan `menu_id`.

- ID baru memakai format `MENU-001`, `MENU-002`, dst.
- Field yang dikelola: `menu_name`, `category`, `price`, `hpp`, `variable_cost_rate`, `stock_item_id`, `stock_qty_per_unit`, `bonus_sales_lc`, `status`.
- `variable_cost_amount = price * variable_cost_rate / 100`.
- `margin_amount = price - hpp - variable_cost_amount - bonus_sales_lc`.
- `margin_percent = margin_amount / price * 100`.
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

## F&B V2.5A - Package Eligibility and Pricing Preview

READ-ONLY BUSINESS OPERATION.

Fase V2.5A menambahkan endpoint backend read-only untuk evaluasi package dan preview harga. Tidak ada sheet baru, tidak ada initializer, tidak ada perubahan header sheet, dan tidak ada mutasi data Google Sheets.

Endpoint ini hanya membaca:

- `Rooms`
- `PackageMaster`
- `PackageDetail`

Endpoint ini tidak menulis:

- `Inventory`
- `StockMovements`
- `FnbOrders`
- `FnbOrderItems`
- `PricingAuditLogs`
- sheet lain apa pun

### Konstanta bisnis

Supported `booking_mode`:

- `regular`
- `package`

Supported `package_type` V2.5A:

- `room_fnb_bundle`

Supported `valid_day_type`:

- `all`
- `weekday` = Senin sampai Jumat berdasarkan tanggal kalender Asia/Jakarta
- `weekend` = Sabtu dan Minggu berdasarkan tanggal kalender Asia/Jakarta

Promotion engine belum aktif di V2.5A. Semua response preview mengembalikan:

- `promotion_free_minutes = 0`
- `promotion_benefit = 0`
- `manual_discount = 0`
- `surcharge = 0`

Package dengan `PackageDetail.is_choice = true` belum didukung dan tidak eligible.

### GET `getEligiblePackages`

READ-ONLY BUSINESS OPERATION.

Request:

```text
GET ?action=getEligiblePackages
    &room_id=ROOM-001
    &duration_minutes=120
    &booking_date=2026-07-15
```

`booking_date` opsional. Jika kosong, backend memakai tanggal kalender saat ini di Asia/Jakarta.

Validasi:

- `room_id` wajib
- room harus ada
- room harus `available`
- `duration_minutes` harus angka bulat positif dalam format numeric ketat; hanya numeric primitive dan strict numeric string yang diterima. Array, object, boolean, scientific notation (`"1e2"`), hexadecimal (`"0x78"`), binary (`"0b1111"`), partial numeric string (`"120abc"`), blank, non-finite value, dan decimal saat integer diwajibkan ditolak
- durasi minimum 15 menit
- `booking_date`, jika dikirim, harus string tanggal kalender valid `YYYY-MM-DD`; hanya `undefined`, `null`, atau blank string setelah trim yang dianggap omitted

Kode error stabil:

- `ROOM_ID_REQUIRED`
- `ROOM_NOT_FOUND`
- `ROOM_NOT_AVAILABLE`
- `INVALID_DURATION`
- `INVALID_BOOKING_DATE`

Eligibility package:

- `status = active`
- `package_type = room_fnb_bundle`
- `selling_price` numeric, finite, dan nonnegative
- `duration_minutes` numeric, finite, positive integer
- requested duration >= package duration
- `valid_day_type` cocok dengan tanggal booking
- minimal satu row `PackageDetail` raw
- tidak ada `PackageDetail` malformed
- tidak ada detail dengan `is_choice = true`

PackageDetail diagnostics internal per package:

- `raw_detail_count`
- `valid_detail_count`
- `invalid_detail_count`
- `invalid_choice_count`
- `details`

Eligibility order:

```text
raw_detail_count = 0 -> PACKAGE_DETAILS_REQUIRED
invalid_choice_count > 0 -> PACKAGE_CHOICE_NOT_SUPPORTED
invalid_detail_count > 0 -> PACKAGE_DETAILS_INVALID
valid_detail_count = 0 -> PACKAGE_DETAILS_REQUIRED
```

PackageDetail valid jika:

- `package_detail_id`: required nonblank
- `package_id`: required nonblank
- `line_no`: positive integer, minimum 1
- `component_type`: `service`, `inventory`, atau `menu`
- `component_ref_id`: required nonblank
- `component_name`: required nonblank
- `qty`: numeric, finite, greater than 0
- `unit`: required nonblank
- `hpp`: optional blank defaults `0`; jika diisi harus finite nonnegative
- `additional_price`: optional blank defaults `0`; jika diisi harus finite nonnegative
- `cost_amount`: optional blank defaults `0`; jika diisi harus finite nonnegative
- `is_choice`: valid explicit boolean representation

Supported `is_choice`:

- boolean `true`, `false`
- number `1`, `0`
- string `"1"`, `"0"`, `"true"`, `"false"`, `"yes"`, `"no"` case-insensitive
- blank atau whitespace-only string = `false`

Array/object dan value tidak dikenal dihitung sebagai `invalid_choice_count` dan menghasilkan `PACKAGE_CHOICE_NOT_SUPPORTED` untuk direct preview. Row detail invalid tidak masuk ke `package_snapshot.details`.

Success response:

```json
{
  "ok": true,
  "success": true,
  "room": {
    "room_id": "ROOM-001",
    "room_name": "Room Name",
    "status": "available",
    "rate_per_hour": 300000
  },
  "criteria": {
    "duration_minutes": 120,
    "booking_date": "2026-07-15",
    "day_type": "weekday"
  },
  "packages": [
    {
      "package_id": "PKG-001",
      "package_name": "Beer Holic Package",
      "package_category": "Beer Holic",
      "package_type": "room_fnb_bundle",
      "selling_price": 1100000,
      "duration_minutes": 120,
      "valid_day_type": "all",
      "valid_day_result": "pass",
      "details_preview": []
    }
  ],
  "meta": {
    "eligible_count": 1,
    "evaluated_count": 1,
    "excluded_count": 0,
    "pricing_version": "fnb-v2.5a"
  }
}
```

Eligible package list kosong tetap response sukses.

### POST `previewSessionPricing`

READ-ONLY BUSINESS OPERATION.

Walaupun memakai transport POST, endpoint ini tidak membuat session, tidak menulis audit log, tidak mengubah room, tidak mengubah transaksi, dan tidak mengurangi stok.

Regular request:

```json
{
  "action": "previewSessionPricing",
  "room_id": "ROOM-001",
  "duration_minutes": 120,
  "booking_mode": "regular",
  "cashier_name": "Kasir"
}
```

Package request:

```json
{
  "action": "previewSessionPricing",
  "room_id": "ROOM-001",
  "duration_minutes": 180,
  "booking_mode": "package",
  "package_id": "PKG-001",
  "cashier_name": "Kasir"
}
```

`cashier_name` hanya informational di V2.5A dan bukan otorisasi.

Kode error tambahan:

- `BOOKING_MODE_REQUIRED`
- `INVALID_BOOKING_MODE`
- `PACKAGE_REQUIRED`
- `PACKAGE_NOT_FOUND`
- `PACKAGE_NOT_ACTIVE`
- `PACKAGE_TYPE_NOT_SUPPORTED`
- `PACKAGE_NOT_ELIGIBLE`
- `INVALID_PACKAGE_DURATION`
- `PACKAGE_DURATION_TOO_SHORT`
- `PACKAGE_DAY_NOT_ELIGIBLE`
- `PACKAGE_DETAILS_REQUIRED`
- `PACKAGE_DETAILS_INVALID`
- `PACKAGE_CHOICE_NOT_SUPPORTED`
- `INVALID_ROOM_RATE`
- `INVALID_PACKAGE_PRICE`
- `PRICING_AMOUNT_INVALID`

Formula regular:

```text
package_subtotal = 0
package_included_minutes = 0
promotion_free_minutes = 0
billable_room_minutes = duration_minutes
base_room_charge = ceil(duration_minutes / 60 * room.rate_per_hour)
excess_room_charge = 0
additional_fnb_total = 0
additional_service_total = 0
surcharge = 0
promotion_benefit = 0
manual_discount = 0
room_total_compat = base_room_charge
grand_total = base_room_charge
```

Jika hasil perhitungan amount menjadi `Infinity`, `NaN`, atau nilai negatif/tidak numeric, response gagal dengan:

```json
{
  "ok": false,
  "success": false,
  "code": "PRICING_AMOUNT_INVALID",
  "message": "Hasil perhitungan harga tidak valid.",
  "error": "Hasil perhitungan harga tidak valid."
}
```

Formula package `room_fnb_bundle`:

```text
package_subtotal = package.selling_price
package_included_minutes = package.duration_minutes
promotion_free_minutes = 0
billable_room_minutes = max(0, requested_duration - package_included_minutes)
base_room_charge = 0
excess_room_charge = ceil(billable_room_minutes / 60 * room.rate_per_hour)
additional_fnb_total = 0
additional_service_total = 0
surcharge = 0
promotion_benefit = 0
manual_discount = 0
room_total_compat = excess_room_charge
grand_total = package_subtotal + excess_room_charge
```

Requested duration lebih kecil dari package duration mengembalikan `PACKAGE_DURATION_TOO_SHORT`; backend tidak menaikkan durasi otomatis.

Response package minimal:

```json
{
  "ok": true,
  "success": true,
  "pricing": {
    "pricing_version": "fnb-v2.5a",
    "booking_mode": "package",
    "requested_duration_minutes": 180,
    "package_included_minutes": 120,
    "promotion_free_minutes": 0,
    "billable_room_minutes": 60,
    "rate_per_hour": 300000,
    "package_subtotal": 1100000,
    "base_room_charge": 0,
    "excess_room_charge": 300000,
    "additional_fnb_total": 0,
    "additional_service_total": 0,
    "surcharge": 0,
    "promotion_benefit": 0,
    "manual_discount": 0,
    "room_total_compat": 300000,
    "grand_total": 1400000,
    "lines": []
  },
  "criteria": {
    "duration_minutes": 180,
    "booking_mode": "package",
    "booking_date": "2026-07-15",
    "day_type": "weekday",
    "valid_day_result": "pass"
  },
  "room": {},
  "package_snapshot": {}
}
```

`package_snapshot` adalah object preview saja dan tidak dipersist. Field snapshot:

- `package_id`
- `package_name`
- `package_category`
- `package_type`
- `selling_price`
- `duration_minutes`
- `valid_day_type`
- `valid_day_result`
- `details`

Detail snapshot diurutkan berdasarkan `line_no`, lalu `package_detail_id`, dan berisi:

- `package_detail_id`
- `line_no`
- `component_type`
- `component_ref_id`
- `component_name`
- `qty`
- `unit`
- `hpp`
- `additional_price`
- `cost_amount`
- `is_choice`
- `choice_group`
- `note`

Komponen service, inventory, dan menu pada package V2.5A bersifat included/informational dan tidak menambah `grand_total`. `PackageDetail.additional_price` tidak otomatis ditagihkan.

## F&B V2.5B Package Session Schema Foundation

Status: PLANNED / INITIALIZER AVAILABLE.

Fase V2.5B menambahkan kontrak schema append-only untuk session dan snapshot package. Schema ini belum dipakai untuk booking package, belum terhubung ke frontend, dan belum terintegrasi ke `startSession`, `extendSession`, atau `closeSession`.

Tidak ada perubahan header pada `Rooms` atau `Transactions`. `Rooms` tetap menjadi active-room compatibility cache untuk UI legacy, sedangkan `RoomSessions` direncanakan menjadi canonical lifecycle record saat fase integrasi berikutnya. Tidak ada deduction inventory package, tidak ada write `TransactionLines`, tidak ada promotion/manual discount aktif, dan tidak ada `PricingAuditLogs` pada fase ini.

### RoomSessions

Purpose: canonical session lifecycle record dengan satu `session_id` permanen per sesi.

Headers:

```text
session_id
room_id
room_name
booking_mode
status
start_time
scheduled_end_time
end_time
booked_duration_minutes
package_included_minutes
promotion_free_minutes
billable_room_minutes
rate_per_hour
cashier_name
created_at
updated_at
closed_transaction_id
idempotency_key
legacy_room_start_time
note
```

Rules:

- `session_id` wajib, unik, dan immutable.
- `room_id` wajib mengacu ke `Rooms.room_id`.
- `booking_mode`: `regular` atau `package`.
- `status`: `starting`, `active`, `closing`, `closed`, `voided`, `start_failed`, `close_failed`.
- Lifecycle terdokumentasi: `starting -> active`, `starting -> start_failed`, `active -> closing`, `closing -> closed`, `closing -> close_failed`, `active -> voided`.
- Duration/rate fields finite, integer untuk menit, nonnegative; active session minimal `booked_duration_minutes = 15`.
- `package_included_minutes` dan `promotion_free_minutes` default `0`.
- `billable_room_minutes` default sama dengan booked duration untuk regular.
- `rate_per_hour` adalah snapshot.
- `closed_transaction_id` kosong sebelum close dan immutable setelah status `closed`.
- `idempotency_key` optional untuk legacy, unik jika nonblank.

### SessionPackages

Purpose: snapshot package master yang dipilih pada session. Perubahan `PackageMaster` di masa depan tidak boleh mengubah histori.

Headers:

```text
session_package_id
session_id
package_id
package_name
package_category
package_type
selling_price
duration_minutes
valid_day_type
valid_day_result
status
selected_at
selected_by
snapshot_json
void_reason
voided_at
```

Rules:

- `session_package_id` wajib dan unik.
- `session_id` wajib mengacu ke `RoomSessions.session_id`.
- `package_id` adalah snapshot reference.
- `package_type` V2.5: `room_fnb_bundle`.
- `selling_price` finite dan nonnegative.
- `duration_minutes` positive integer.
- `status`: `active` atau `voided`.
- `valid_day_type`: `all`, `weekday`, atau `weekend`.
- `valid_day_result`: `pass`.
- Versi awal maksimal satu row active `SessionPackages` per session.
- Snapshot fields immutable setelah insert, kecuali `status`, `void_reason`, dan `voided_at`.

### SessionPackageDetails

Purpose: snapshot komponen package dan basis fulfillment.

Headers:

```text
session_package_detail_id
session_package_id
session_id
package_detail_id
line_no
component_type
component_ref_id
component_name
qty
unit
hpp
additional_price
cost_amount
is_choice
choice_group
chosen_ref_id
chosen_name
fulfillment_status
fulfilled_qty
fulfilled_at
snapshot_json
```

Rules:

- `session_package_detail_id` wajib dan unik.
- `session_package_id` mengacu ke `SessionPackages.session_package_id`.
- `session_id` mengacu ke `RoomSessions.session_id`.
- `component_type`: `service`, `inventory`, atau `menu`.
- `line_no` positive integer.
- `qty` finite dan lebih dari `0`.
- `is_choice` wajib explicit boolean; initial package V2.5 harus `false`.
- `fulfillment_status`: `pending`, `fulfilled`, `partial`, atau `voided`.
- Initial value `fulfillment_status = pending`.
- `fulfilled_qty` default `0`, finite, nonnegative, dan tidak boleh melebihi `qty`.
- Snapshot fields immutable kecuali fulfillment fields.
- Component package V2.5 bersifat included-only; package inventory belum dipotong pada fase ini.

### TransactionLines

Purpose: planned auditable pricing breakdown setelah transaksi close. Sheet ini belum ditulis pada V2.5B.

Headers:

```text
transaction_line_id
transaction_id
session_id
line_type
source_type
source_id
description
qty
unit
unit_price
gross_amount
discount_amount
net_amount
tax_amount
sort_order
created_at
snapshot_json
```

Rules:

- `transaction_line_id` wajib dan unik.
- `transaction_id` mengacu ke `Transactions.transaction_id` setelah close.
- `session_id` mengacu ke `RoomSessions.session_id`.
- Planned `line_type`: `room_base`, `package_subtotal`, `package_included_room`, `room_excess`, `fnb_order`, `service`, `promotion`, `manual_discount`, `surcharge`.
- Amounts finite.
- `gross_amount`, `discount_amount`, dan `tax_amount` nonnegative.
- `net_amount` boleh negatif hanya untuk future discount line.
- V2.5 package component informational lines dapat memiliki `net_amount = 0`.

### Validator Contract

POST `validatePackageSessionFoundation` adalah read-only walaupun memakai transport POST.

Request:

```json
{
  "action": "validatePackageSessionFoundation"
}
```

Validator membaca apakah empat sheet foundation ada, apakah header persis cocok, dan apakah data existing melanggar kontrak dasar. Validator tidak membuat sheet, tidak menambah header, tidak memperbaiki row invalid, tidak memakai lock, dan tidak mengubah spreadsheet.

Response sukses jika semua sheet ada dan valid:

```json
{
  "ok": true,
  "success": true,
  "status": "ready",
  "sheets": {},
  "summary": {
    "required_sheet_count": 4,
    "existing_sheet_count": 4,
    "valid_sheet_count": 4,
    "missing_sheet_count": 0,
    "invalid_sheet_count": 0
  }
}
```

Jika belum semua sheet dibuat, response tetap terstruktur dengan `status = not_initialized`.

Jika sebagian sheet belum ada tetapi sheet foundation existing memiliki konflik header/data, response memakai `status = partial_invalid` agar conflict tidak tersembunyi sebagai sekadar belum initialized. Jika semua sheet ada tetapi ada konflik, response memakai `status = invalid`.

Per sheet validator mengembalikan:

- `sheet_name`
- `exists`
- `header_count`
- `expected_header_count`
- `missing_headers`
- `unexpected_headers`
- `header_order_valid`
- `duplicate_headers`
- `data_row_count`
- `missing_primary_id_count`
- `duplicate_primary_id_count`
- `duplicate_*` / `invalid_*` / `missing_*` / `*_mismatch_count` counters sesuai sheet
- `validation_status`

Numeric parsing validator foundation bersifat strict. Nilai numeric hanya valid jika berupa number primitive finite atau strict numeric string. Boolean, array, object, Date, function, `null`, `undefined`, blank string, scientific notation string, hexadecimal string, binary string, partial numeric string, `NaN`, dan `Infinity` ditolak. Integer helpers juga menolak decimal.

Reference maps yang dibaca validator:

- `Rooms.room_id`
- `Transactions.transaction_id`
- `RoomSessions.session_id`
- `SessionPackages.session_package_id`
- `SessionPackages.session_package_id -> session_id`

Validator tidak memakai helper `ensure*`, sehingga sheet `Rooms` atau `Transactions` yang tidak tersedia dilaporkan sebagai missing reference secara terstruktur dan tidak dibuat otomatis.

Counter tambahan utama:

- `RoomSessions`: `missing_room_id_count`, `missing_room_reference_count`, `missing_required_field_count`
- `SessionPackages`: `missing_package_identity_count`, `missing_snapshot_field_count`, `missing_required_field_count`, `invalid_valid_day_type_count`
- `SessionPackageDetails`: `missing_required_field_count`, `session_package_session_mismatch_count`, `invalid_amount_count`
- `TransactionLines`: `missing_transaction_reference_count`, `missing_required_field_count`, `invalid_qty_count`, `invalid_unit_price_count`, `invalid_negative_net_amount_count`

### Initializer Contract

POST `initializePackageSessionFoundation` tersedia tetapi tidak otomatis dipanggil dari `doGet`, `doPost`, `startSession`, `extendSession`, atau `closeSession`.

Default request adalah dry-run:

```json
{
  "action": "initializePackageSessionFoundation",
  "dry_run": true,
  "backup_confirmed": false,
  "confirm": ""
}
```

Dry-run tidak membuat sheet dan tidak mengubah spreadsheet. Response melaporkan sheet yang akan dibuat, blockers, expected headers, dan hasil validator.

Execute hanya boleh berjalan dengan:

```json
{
  "action": "initializePackageSessionFoundation",
  "dry_run": false,
  "backup_confirmed": true,
  "confirm": "INITIALIZE_V25B"
}
```

Safeguards:

- Acquire script lock sebelum write.
- Revalidate state setelah lock.
- Jika semua sheet sudah valid, return `FOUNDATION_ALREADY_INITIALIZED` tanpa write.
- Jika sheet dengan nama sama ada tetapi header/schema konflik, return `FOUNDATION_SCHEMA_CONFLICT` tanpa perbaikan otomatis.
- Buat hanya sheet yang belum ada.
- Tulis satu header row dan freeze row pertama jika tersedia.
- Tidak membuat sample data atau placeholder rows.
- Tidak mengubah sheet existing.
- Jika gagal sebagian, tidak menghapus sheet otomatis; response mencantumkan created/failed sheets dan validator bisa membaca partial state.
- Lock timeout atau failure saat lock/initialize dikembalikan sebagai `FOUNDATION_INITIALIZATION_FAILED`.
- Setelah creation, initializer menjalankan final validation gate. Response sukses hanya jika `status = ready`, required/existing/valid sheet count semua `4`, missing/invalid count `0`, dan tidak ada failed sheets. Jika API creation tidak melempar error tetapi final validation gagal, response memakai `code = FOUNDATION_INITIALIZATION_FAILED` dan `status = post_validation_failed`.

Stable error codes:

- `INITIALIZATION_CONFIRMATION_REQUIRED`
- `BACKUP_CONFIRMATION_REQUIRED`
- `FOUNDATION_SCHEMA_CONFLICT`
- `FOUNDATION_ALREADY_INITIALIZED`
- `FOUNDATION_INITIALIZATION_FAILED`

No production initialization is implied by this documentation. Jalankan initializer production hanya setelah backup manual dan owner approval.

## LC Payroll, Sales Bonus, Kasbon, dan Petty Cash

Pondasi ini menghubungkan hak LC, bonus sales minuman, kasbon, payroll, dan uang fisik kasir.

Prinsip:

- `LcWorkLogs` tetap menjadi sumber jasa room LC.
- `LcSalesBonusLogs` menjadi sumber bonus sales LC dari F&B/minuman.
- `LcCashAdvances` menjadi sumber kasbon/potongan payroll.
- `PettyCashLedger` menjadi sumber mutasi uang fisik kasir.
- `LcPayrollHistory` menjadi ringkasan payroll final per periode.
- Semua row yang sudah tercatat tidak dihapus permanen; koreksi memakai status/catatan.
- Kasbon dan payroll LC dijalankan oleh kasir sesuai kebijakan management; tidak ada step approval manager di pondasi ini.

### LcSalesBonusLogs

Purpose: mencatat bonus sales LC dari item F&B/minuman yang eligible setelah transaksi lunas.

Headers:

```text
bonus_log_id
operational_date
transaction_id
order_id
menu_id
menu_name
category
lc_id
lc_name
quantity
bonus_per_item
bonus_total
source_status
payroll_id
created_at
created_by
voided_at
void_reason
```

Rules:

- `bonus_log_id` wajib dan unik.
- `transaction_id` mengacu ke `Transactions.transaction_id`.
- `order_id` mengacu ke `FnbOrders.order_id`.
- `menu_id` adalah snapshot item menu saat bonus dibuat.
- `lc_id` mengacu ke `LcMaster.lc_id`.
- `quantity`, `bonus_per_item`, dan `bonus_total` finite dan nonnegative.
- `bonus_total = quantity * bonus_per_item`.
- `source_status`: `earned`, `voided`, atau `payrolled`.
- `payroll_id` kosong sebelum masuk payroll.
- Kombinasi `transaction_id + order_id + menu_id + lc_id` tidak boleh dobel untuk bonus aktif.

### LcCashAdvances

Purpose: mencatat kasbon LC yang menjadi potongan payroll dan sekaligus referensi cash out petty cash.

Headers:

```text
cash_advance_id
operational_date
lc_id
lc_name
amount
status
requested_by
cashier_name
petty_cash_ledger_id
payroll_id
note
created_at
deducted_at
cancelled_at
cancel_reason
```

Rules:

- `cash_advance_id` wajib dan unik.
- `lc_id` mengacu ke `LcMaster.lc_id`.
- `amount` finite dan lebih dari `0`.
- `status`: `open`, `deducted`, atau `cancelled`.
- `cashier_name` wajib sebagai operator yang mengeluarkan kasbon.
- `petty_cash_ledger_id` wajib setelah kasbon mengeluarkan uang dari kasir.
- `payroll_id` kosong saat `open`, terisi saat `deducted`.
- Kasbon yang salah input dibatalkan dengan `status = cancelled`, bukan dihapus.

### PettyCashLedger

Purpose: mencatat semua mutasi petty cash kasir.

Headers:

```text
ledger_id
operational_date
entry_type
category
reference_type
reference_id
lc_id
lc_name
cash_in_amount
cash_out_amount
balance_after
cashier_name
note
created_at
voided_at
void_reason
```

Rules:

- `ledger_id` wajib dan unik.
- `entry_type`: `cash_in`, `cash_out`, atau `adjustment`.
- `category` awal: `petty_cash_topup`, `lc_cash_advance`, `lc_payroll_payout`, `operational_expense`, `manual_adjustment`.
- `reference_type` awal: `lc_cash_advance`, `lc_payroll`, `manual`, atau `expense`.
- `cash_in_amount` dan `cash_out_amount` finite dan nonnegative.
- Untuk `cash_in`, `cash_in_amount > 0` dan `cash_out_amount = 0`.
- Untuk `cash_out`, `cash_out_amount > 0` dan `cash_in_amount = 0`.
- `balance_after` adalah saldo petty cash sistem setelah mutasi.
- `cashier_name` wajib sebagai operator mutasi petty cash.
- Koreksi memakai void/adjustment dengan catatan, bukan delete.

### LcPayrollHistory V2 Fields

`LcPayrollHistory` tetap memakai header existing dan ditambah field berikut secara append-only:

```text
room_earning_total
sales_bonus_total
cash_advance_deducted
gross_earning_total
net_payout_total
petty_cash_ledger_id
status
```

Rules:

- `total_amount` dipertahankan untuk kompatibilitas dan sebaiknya sama dengan `net_payout_total` pada payroll v2.
- `room_earning_total` berasal dari `LcWorkLogs`.
- `sales_bonus_total` berasal dari `LcSalesBonusLogs`.
- `cash_advance_deducted` berasal dari `LcCashAdvances`.
- `gross_earning_total = room_earning_total + sales_bonus_total`.
- `net_payout_total = gross_earning_total - cash_advance_deducted`.
- `cash_advance_deducted` tidak boleh membuat `net_payout_total` negatif; kasbon yang belum bisa dipotong tetap `open`.
- `petty_cash_ledger_id` terisi jika payroll dibayar cash oleh kasir.
- `processed_by` berisi nama kasir/operator yang menjalankan payroll.
- `status`: `processed`, `paid`, `voided`, atau `adjusted`.

### LC Finance Foundation API

POST/GET `validateLcFinanceFoundation` adalah read-only.

Request:

```json
{
  "action": "validateLcFinanceFoundation"
}
```

Status response:

- `ready`: semua sheet dan header valid.
- `not_initialized`: ada sheet yang belum dibuat.
- `append_required`: sheet existing valid tetapi butuh tambahan header append-only.
- `partial_invalid`: ada sheet missing sekaligus konflik.
- `invalid`: ada konflik header/data.

POST `initializeLcFinanceFoundation` default dry-run:

```json
{
  "action": "initializeLcFinanceFoundation",
  "dry_run": true
}
```

Execute hanya boleh berjalan dengan:

```json
{
  "action": "initializeLcFinanceFoundation",
  "dry_run": false,
  "backup_confirmed": true,
  "confirm": "INITIALIZE_LC_FINANCE"
}
```

Initializer membuat sheet yang belum ada dan menambah header append-only pada `LcPayrollHistory` jika masih memakai schema lama. Initializer tidak membuat sample data, tidak menghapus sheet, dan berhenti jika menemukan konflik header blocking.

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
| `role` | Peran karyawan: `owner`, `manager`, `cashier`, atau `receptionist`. Nilai lama `admin` diperlakukan sebagai alias `manager`. |
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
