# PROJECT STATUS - Karaoke Management System

## Status Terakhir

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
Status: PASS LOKAL

Hasil:
- closeSession menghitung tagihan room dari booked_duration_minutes jika valid.
- Booking 1 jam tetap ditagih 1 jam walau ditutup lebih cepat.
- Tambah waktu ikut menambah durasi tagihan.
- Waktu habis tanpa extend tetap ditagih durasi booking terakhir.
- Tidak ada overtime otomatis.
- Data lama tanpa booked_duration_minutes fallback ke durasi aktual.
- Response closeSession menyertakan billing_basis.
- Ringkasan tagihan dan struk menampilkan dasar tagihan jika tersedia.
- F&B, stok, payment, closing, dan cancel order tetap aman.

Catatan:
- PASS LOKAL berarti implementasi dan syntax check lulus.
- PASS FINAL menunggu deploy backend dan uji production.

---

## Catatan Penting

- start_time adalah jangkar sesi.
- Jangan mengubah start_time saat extend.
- F&B tetap terikat ke room_id + room_start_time.
- scheduled_end_time boleh berubah saat Tambah Waktu.
- Room tidak otomatis kosong saat waktu habis.
- Billing room memakai booked_duration_minutes untuk sesi booking valid.
- Sesi legacy tanpa booked_duration_minutes masih memakai durasi aktual.

---

## Next Phase

### Fase 5E - Audit Extend Session
Rencana:
- Catat riwayat tambah waktu ke sheet audit.
- Belum diimplementasikan.
Fase 5D - Billing Berdasarkan Durasi Booking
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

Bugfix F&B Dropdown Room
Status: PASS

Hasil:
- Room terisi bisa dipilih untuk Order F&B.
- Room kosong dan perbaikan tampil tapi disabled.
- Status room dinormalisasi.
- Backend tidak berubah.