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

## Catatan Penting

- start_time adalah jangkar sesi.
- Jangan mengubah start_time saat extend.
- F&B tetap terikat ke room_id + room_start_time.
- scheduled_end_time boleh berubah saat Tambah Waktu.
- Room tidak otomatis kosong saat waktu habis.
- Billing saat ini masih berdasarkan durasi aktual sampai closeSession.
- Billing berdasarkan durasi booking akan dibahas di Fase 5D.

---

## Next Phase

### Fase 5D - Billing Berdasarkan Durasi Booking
Rencana:
- Tagihan room dihitung dari booked_duration_minutes.
- Contoh:
  - Booking 1 jam = tagih 1 jam penuh.
  - Booking 1 jam + extend 30 menit = tagih 1 jam 30 menit.
- Tidak lagi murni berdasarkan stopwatch aktual.
- Perlu diskusi bisnis sebelum coding.