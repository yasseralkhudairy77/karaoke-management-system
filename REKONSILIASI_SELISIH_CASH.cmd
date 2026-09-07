@echo off
title Happy Song POS - Rekonsiliasi Selisih Cash Pasca-Koreksi
color 0B

echo =======================================================================
echo    HAPPY SONG POS - REKONSILIASI SELISIH CASH PASCA-KOREKSI TRANSAKSI
echo =======================================================================
echo.
echo Script ini akan:
echo 1. Memeriksa transaksi yang nominal cash_amount tidak sama dengan grand_total.
echo 2. Menyelaraskan nominal cash/transfer transaksi dengan tagihan akhir setelah koreksi.
echo 3. Mencegah selisih minus pada laporan Closing Kasir dan Overview Management Monitor.
echo 4. Mendorong pembaruan snapshot ke Cloud Mirror Railway (jika token terkonfigurasi).
echo =======================================================================
echo.

cd /d "%~dp0"
if exist "server\scripts\reconcile-corrected-cash-amounts.js" (
    cd server
)

if not exist "scripts\reconcile-corrected-cash-amounts.js" (
    echo [ERROR] File scripts\reconcile-corrected-cash-amounts.js tidak ditemukan!
    echo Pastikan file ini berada di dalam folder utama Happy Song.
    echo.
    pause
    exit /b 1
)

echo Menjalankan rekonsiliasi database...
echo.
node scripts\reconcile-corrected-cash-amounts.js

echo.
echo =======================================================================
echo Selesai. Tekan tombol apa saja untuk menutup jendela ini...
echo =======================================================================
pause >nul
