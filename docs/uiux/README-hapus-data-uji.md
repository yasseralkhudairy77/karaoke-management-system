# Penghapusan data uji coba 6 Okt 2026 (15:00-16:35)

## Yang dihapus (setelah diperiksa, bukan dugaan)
3 transaksi + 3 sesi + 3 segmen sesi, semuanya dibuat oleh akun **"Manager 1"**
(EMP-003, role owner) — yaitu uji coba UI kita:

| Transaksi | Ruangan | Nominal | Dibuat (WIB) |
|---|---|---|---|
| TRX-1791279189192 | STANDAR 1 | Rp 30.000 | 16:33:09 |
| TRX-1791279219843 | VIP 2 | Rp 20.000 | 16:33:39 |
| TRX-1791279245430 | STANDAR 3 | Rp 16.667 | 16:34:05 |

Sesi: ROOM-001-20261006091142147, ROOM-002-20261006092736819, ROOM-003-20261006092749672
(+ 3 baris room_session_segments yang mengikutinya.)

## Yang TIDAK dihapus (diverifikasi = 0 atau bukan milik uji coba)
- transaction_lines, sales_commission_logs, transaction_correction_logs,
  receipt_print_logs, cashier_closing_transactions, operational_audit_events: 0 baris.
- fnb_orders sesi uji: 0. lc_work_logs sesi uji: 0.
- stock_movements & lc_work_logs hari ini: dibuat 05:04-08:48 WIB (jauh sebelum uji)
  -> milik operasional, tidak disentuh.
- Transaksi 00:00-04:47 WIB (Admin 1): TIDAK disentuh.
- Tidak ada closing kasir sama sekali di sistem.

## Cadangan
- Dump penuh database sebelum penghapusan:
  `backups/db-uiux-uji/happy_song_pos-20261006-uji1530-1635.dump` (format custom pg_dump).
- Pemulihan bila diperlukan:
  `"C:/Program Files/PostgreSQL/18/bin/pg_restore.exe" -h localhost -U postgres -d happy_song_pos --clean --if-exists <berkas.dump>`

## Sinkronisasi cloud
`DISABLE_SYNC_WORKER=1` dan `OWNER_MIRROR_MODE=local`; `sync_outbox` tidak punya
entri untuk ID uji. Jadi tidak ada salinan di server cloud yang perlu dibersihkan.

## Verifikasi sesudah
- Transaksi di jendela: 0. Transaksi tanggal 6 Okt: 0.
- Sesi terbuka: 0. Semua 10 baris `rooms` berstatus `available`.
- API aplikasi (`getRooms`): 9 ruangan, semua `available`, total F&B terbuka 0.

## Skrip
- `server/periksa-jendela-uji.js` dan `server/periksa-sinkron-uji.js` — pemeriksaan read-only.
- `server/hapus-uji-1530-1635.js` — penghapus dengan pengaman (dry run bawaan, wajib
  cadangan, satu transaksi database, verifikasi akhir). Simpan untuk keperluan serupa.