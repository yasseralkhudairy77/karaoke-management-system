# LC Payroll, Sales Bonus, Kasbon, dan Petty Cash Foundation

Dokumen ini menjadi pondasi implementasi bonus sales LC dari minuman, kasbon LC, payroll LC, dan petty cash kasir. Tujuannya menjaga dua hal tetap nyambung: hak LC di payroll dan uang fisik kasir di petty cash.

## Prinsip Utama

- Semua hak LC dicatat sebagai earning terlebih dahulu, bukan langsung dianggap sudah dibayar.
- Semua uang keluar dari kasir wajib tercatat di `PettyCashLedger`.
- Kasbon LC adalah uang keluar sekaligus piutang/potongan payroll.
- Payroll LC adalah proses final yang mengunci earning, bonus sales, potongan kasbon, dan net payout.
- Perhitungan harian menampilkan akrual/monitoring; payroll menjadi pembayaran resmi.
- Data transaksi lama harus tetap memakai snapshot nilai bonus saat transaksi terjadi.
- Kasbon dan payroll LC adalah kewenangan kasir sesuai kebijakan management; manager tidak menjadi step approval operasional.

## Komponen Data

### 1. Jasa Room LC

Sumber existing: `LcWorkLogs`.

Fungsi:

- Mencatat LC yang menemani room/session.
- Menyimpan nilai jasa LC pada saat sesi selesai.
- Masuk payroll jika `status = done` dan `payroll_id` masih kosong.

### 2. Bonus Sales LC

Sumber baru: `LcSalesBonusLogs`.

Fungsi:

- Mencatat bonus LC dari item F&B/minuman yang eligible.
- Dibuat otomatis saat order F&B tersimpan dan room punya LC aktif.
- Menyimpan snapshot `bonus_per_item`, `quantity`, dan `bonus_total`.
- Masuk payroll jika `payroll_id` masih kosong.

Aturan awal:

- Bonus hanya muncul untuk item yang punya nilai bonus.
- Sistem mengambil LC aktif dari room saat order dibuat.
- Jika ada 1 LC, bonus penuh masuk ke LC tersebut.
- Jika ada 2 LC, bonus dibagi 2; jika ada 3 LC, bonus dibagi 3; dan seterusnya.
- Jika order/transaksi dibatalkan/refund, bonus harus `voided`.

### 3. Kasbon LC

Sumber baru: `LcCashAdvances`.

Fungsi:

- Mencatat kasbon/uang muka yang diterima LC.
- Kasbon aktif memakai `status = open`.
- Saat payroll diproses, kasbon open dipotong dan status berubah menjadi `deducted`.
- Jika salah input, status berubah menjadi `cancelled`, bukan dihapus.

Kasbon juga wajib membuat baris `PettyCashLedger` karena ada uang fisik keluar dari kasir.

### 4. Petty Cash Kasir

Sumber baru: `PettyCashLedger`.

Fungsi:

- Mencatat semua mutasi uang kecil kasir.
- Kasbon LC: `entry_type = cash_out`, `category = lc_cash_advance`.
- Payout payroll LC: `entry_type = cash_out`, `category = lc_payroll_payout`.
- Top up kas kecil: `entry_type = cash_in`, `category = petty_cash_topup`.
- Koreksi manual harus punya catatan dan nama kasir/operator.

Rumus:

```text
saldo akhir sistem = saldo awal + cash in - cash out
selisih = saldo fisik - saldo akhir sistem
```

## Alur Operasional

### Penjualan Minuman

1. F&B order dibuat seperti biasa.
2. Transaksi room/F&B dilunasi.
3. Backend membaca item F&B yang punya bonus LC.
4. Backend menentukan LC penerima bonus.
5. Backend membuat `LcSalesBonusLogs`.
6. Laporan harian menampilkan bonus sales LC hari itu.

### Kasbon LC

1. Kasir pilih LC dan nominal kasbon.
2. Kasir mengeluarkan uang dan sistem mencatat nama kasir/operator.
3. Backend membuat `LcCashAdvances` status `open`.
4. Backend membuat `PettyCashLedger` cash out.
5. Kasbon tampil sebagai potongan pending di payroll LC.

### Payroll LC

1. Kasir memilih periode payroll sesuai kebijakan management.
2. Backend mengambil:
   - `LcWorkLogs` done dan belum payroll.
   - `LcSalesBonusLogs` earned dan belum payroll.
   - `LcCashAdvances` open dalam/hingga periode yang akan dipotong.
3. Sistem menghitung:

```text
gross earning = jasa room LC + bonus sales LC
net payout = gross earning - kasbon dipotong
```

4. Kasbon hanya dipotong sampai batas gross earning LC; jika belum cukup, sisanya tetap `open` sebagai outstanding.
5. Net payout tidak boleh negatif.
6. Jika payroll dibayar cash oleh kasir, backend membuat `PettyCashLedger` cash out sebesar net payout.
7. Backend mengisi `payroll_id` ke earning dan kasbon yang terpakai.
8. Backend membuat row `LcPayrollHistory`.

## Laporan Harian

Minimal yang perlu tampil:

- Total bonus sales LC hari ini.
- Bonus sales per LC.
- Kasbon LC hari ini.
- Payout payroll LC hari ini.
- Mutasi petty cash hari ini.
- Saldo akhir petty cash sistem.
- Saldo fisik petty cash.
- Selisih dan catatan.

## Guardrail

- Tidak ada penghapusan permanen untuk bonus, kasbon, payroll, atau petty cash yang sudah tercatat.
- Semua koreksi memakai status void/cancel dan catatan.
- Payroll tidak boleh memproses item yang sudah punya `payroll_id`.
- Payroll kosong tidak boleh dibuat hanya karena ada kasbon outstanding.
- Petty cash payout tidak boleh dibuat dua kali untuk payroll yang sama.
- Kasbon tidak boleh dipotong dua kali.
- Bonus sales tidak boleh dibuat dua kali untuk kombinasi `transaction_id + order_id + menu_id + lc_id`.

## Foundation API

### validateLcFinanceFoundation

Read-only validator untuk mengecek kesiapan sheet:

```json
{
  "action": "validateLcFinanceFoundation"
}
```

Response utama:

- `status = ready`: semua sheet dan header valid.
- `status = not_initialized`: ada sheet yang belum dibuat.
- `status = append_required`: sheet lama valid tetapi butuh tambahan header append-only.
- `status = invalid`: ada konflik header/data yang harus direview manual.

### initializeLcFinanceFoundation

Default request adalah dry-run dan tidak mengubah spreadsheet:

```json
{
  "action": "initializeLcFinanceFoundation",
  "dry_run": true
}
```

Execute hanya boleh dengan backup manual dan token konfirmasi:

```json
{
  "action": "initializeLcFinanceFoundation",
  "dry_run": false,
  "backup_confirmed": true,
  "confirm": "INITIALIZE_LC_FINANCE"
}
```

Initializer membuat sheet yang belum ada dan menambah header append-only pada `LcPayrollHistory` jika masih memakai schema lama.

## Tahapan Implementasi

1. Foundation sheet dan schema.
2. Master menu field `lc_sales_bonus`.
3. Generator `LcSalesBonusLogs` saat transaksi paid.
4. UI laporan bonus sales LC harian.
5. Input kasbon LC + mutasi petty cash.
6. Payroll LC v2: jasa room + bonus sales - kasbon.
7. Closing kasir/petty cash report.
