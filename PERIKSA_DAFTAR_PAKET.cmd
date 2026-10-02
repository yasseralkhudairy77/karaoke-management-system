@echo off
title Happy Song POS - Pemeriksaan Hubungan Paket & Stok Fisik
color 0B

echo =======================================================================
echo    HAPPY SONG POS - AUDIT HUBUNGAN PAKET DENGAN STOK FISIK
echo =======================================================================
echo.
echo Tool ini akan menampilkan seluruh paket di database Anda dan mengecek
echo apakah resep komponennya sudah terhubung ke barang fisik di Stok atau belum.
echo.

cd /d "%~dp0"
if exist "server\scripts\inspect-existing-packages.js" (
    cd server
)

if not exist "scripts\inspect-existing-packages.js" (
    echo [ERROR] File scripts\inspect-existing-packages.js tidak ditemukan!
    echo.
    echo Tekan tombol apa saja untuk menutup...
    pause >nul
    exit /b 1
)

node scripts/inspect-existing-packages.js

echo.
echo =======================================================================
echo Tekan tombol apa saja pada keyboard untuk menutup jendela ini...
echo =======================================================================
pause >nul
exit /b 0
