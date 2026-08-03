# SOP Perubahan Paket Room via Spreadsheet

Dokumen ini dipakai saat perlu mengubah paket room, harga paket, durasi paket, atau memperbaiki sesi room yang terlanjur berjalan sebagai Regular padahal seharusnya Paket.

## Prinsip Utama

- Data paket utama ada di sheet `PackageMaster`.
- Detail isi paket ada di sheet `PackageDetail`.
- Data room aktif ada di sheet `Rooms`.
- Jika sesi sudah berjalan, data canonical sesi biasanya ada di sheet `RoomSessions`.
- Durasi selalu disimpan dalam menit: `60` = 1 jam, `120` = 2 jam, `180` = 3 jam.
- Jangan mengubah `start_time` jika hanya mengganti Regular menjadi Paket.

## A. Mengubah Master Paket

Gunakan langkah ini jika paketnya memang mau diubah untuk booking berikutnya.

1. Buka Google Spreadsheet operasional.
2. Masuk ke sheet `PackageMaster`.
3. Cari paket berdasarkan `package_id` atau `package_name`.
4. Ubah kolom yang diperlukan:

```text
package_name
package_category
package_type
selling_price
status
valid_day_type
duration_minutes
note
```

5. Pastikan nilai wajib tetap benar:

```text
package_type = room_fnb_bundle
status = active
valid_day_type = all / weekday / weekend
duration_minutes = angka menit
selling_price = angka tanpa Rp, titik, atau koma
```

Contoh paket Executive 3 jam:

```text
package_id = PKG-ROOM-EXEC
package_name = Executive Room
selling_price = 450000
duration_minutes = 180
status = active
valid_day_type = all
note = Room only 3 jam, non F&B
```

## B. Memastikan Detail Paket Ada

Paket harus punya minimal satu baris detail valid di `PackageDetail`.

Untuk paket room only, contoh detail:

```text
package_detail_id = PKG-ROOM-EXEC-SVC-001
package_id = PKG-ROOM-EXEC
line_no = 1
component_type = service
component_ref_id = ROOM-ONLY-EXEC
component_name = Executive Room 3 Jam
qty = 1
unit = package
hpp = 0
additional_price = 0
cost_amount = 0
is_choice = false
choice_group =
note = Non F&B service line
```

Jika paket tidak muncul atau tidak bisa dipilih, cek `PackageDetail` terlebih dahulu.

## C. Cara Booking Paket yang Benar

Gunakan dashboard kasir/resepsionis untuk booking baru.

1. Klik room yang masih `KOSONG`.
2. Isi nama customer jika diperlukan.
3. Pada `Jenis Booking`, pilih:

```text
Paket F&B All-In
```

4. Pilih paket, misalnya:

```text
Executive Room
```

5. Klik `Simpan Booking Paket`.

Jangan pilih `Regular (Jam/Menit)` jika harga yang dipakai harus harga paket.

## D. Koreksi Room Aktif yang Terlanjur Regular

Gunakan langkah ini hanya jika room sudah berjalan dan belum dibuat transaksi pembayaran room yang final. Jika transaksi room sudah ada, lakukan koreksi transaksi/refund sesuai prosedur kasir terlebih dahulu.

1. Buka sheet `Rooms`.
2. Cari room yang ingin diperbaiki, contoh:

```text
room_id = ROOM-009
```

3. Isi kolom:

```text
package_id = PKG-ROOM-EXEC
```

4. Pastikan kolom berikut tetap sesuai:

```text
booked_duration_minutes = 180
scheduled_end_time = jangan diubah kecuali durasi memang salah
start_time = jangan diubah
rate_per_hour = boleh tetap, karena paket memakai selling_price dari PackageMaster
```

5. Jika sheet `RoomSessions` ada, cari sesi aktif room tersebut:

```text
room_id = ROOM-009
status = starting / active / closing
```

6. Ubah field sesi aktif:

```text
booking_mode = package
package_id = PKG-ROOM-EXEC
package_included_minutes = 180
billable_room_minutes = 0
booked_duration_minutes = 180
```

7. Jika sheet `SessionPackages` ada dan sesi belum punya snapshot paket, tambahkan snapshot paket sesuai `PackageMaster`. Jika ragu, jangan isi manual; catat kasusnya untuk diperbaiki lewat backend agar histori tidak keliru.

## E. Verifikasi Setelah Perubahan

Refresh dashboard, lalu cek room yang diperbaiki.

Untuk Room 9 Executive, hasil yang diharapkan:

```text
room_id = ROOM-009
package_id = PKG-ROOM-EXEC
booked_duration_minutes = 180
```

Paket master yang diharapkan:

```text
package_id = PKG-ROOM-EXEC
selling_price = 450000
duration_minutes = 180
status = active
```

Jika dashboard masih menampilkan data lama:

1. Tutup tab dashboard.
2. Buka ulang dashboard.
3. Jika memakai GitHub Pages, buka dengan cache buster:

```text
https://yasseralkhudairy77.github.io/karaoke-management-system/?v=lc-duration-hours-v2
```

## F. Yang Tidak Boleh Diubah Sembarangan

Jangan mengubah kolom berikut tanpa alasan operasional yang jelas:

```text
start_time
scheduled_end_time
closed_transaction_id
prepayment_transaction_id
transaction_id
created_at
```

Jangan mengubah transaksi yang sudah paid tanpa membuat catatan koreksi/refund. Perubahan manual di paket tidak otomatis mengubah histori transaksi yang sudah tercatat.

## G. Checklist Singkat

Sebelum selesai, pastikan:

```text
[ ] PackageMaster benar
[ ] PackageDetail ada dan valid
[ ] Rooms.package_id terisi jika sesi aktif perlu dikoreksi
[ ] RoomSessions.booking_mode/package_id benar jika sheet tersedia
[ ] Tidak ada transaksi paid yang tertinggal dengan nominal regular
[ ] Dashboard sudah direfresh dan menampilkan paket yang benar
```
