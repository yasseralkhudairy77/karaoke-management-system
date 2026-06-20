# Spreadsheet Import Guide

Panduan ini membantu menyiapkan Google Spreadsheet database awal untuk Karaoke POS.

## Langkah Import

1. Buat Google Spreadsheet baru.
2. Buat tab sesuai nama file CSV tanpa `.csv`.
3. Copy isi CSV ke masing-masing tab, atau import CSV satu per satu.
4. Pastikan nama tab persis: `Rooms`, `Transactions`, `Inventory`, `Menu`, `Recipe`, `Employees`, `Settings`, `CashierClosings`.
5. Pastikan baris pertama adalah header.
6. Pastikan angka seperti `rate_per_hour`, `selling_price`, `base_salary`, `cash_expected`, dan `cash_actual` tidak memakai format Rp, titik, atau koma.
7. Setelah spreadsheet siap, buka Apps Script.
8. Paste isi `apps-script/Code.gs`.
9. Deploy sebagai Web App.
10. Test endpoint berikut dari URL Web App:
    - `?action=health`
    - `?action=getRooms`

## Catatan

Template ini hanya untuk bootstrap data awal. Jangan tambahkan logic billing, QRIS, mutasi inventory, atau update spreadsheet pada fase ini.
