# PROJECT STATUS - Karaoke Management System

## Status Terakhir

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