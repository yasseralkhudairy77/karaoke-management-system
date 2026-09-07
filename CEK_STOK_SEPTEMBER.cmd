@echo off
title Happy Song POS - Cek Data Stok ^& Barang Masuk September 2026
color 0B
cls

echo =======================================================================
echo    HAPPY SONG POS - PEMERIKSAAN STOK ^& BARANG MASUK SEPTEMBER 2026
echo =======================================================================
echo.
echo Script ini akan:
echo  1. Memeriksa stok terkini Anggur Merah, Intisari, Atlas Leci, Anggur Putih.
echo  2. Mencari semua riwayat barang masuk dari tanggal 01 s/d 07 September 2026.
echo  3. Mencocokkan dengan 5 catatan barang masuk fisik dari supplier.
echo.
echo =======================================================================
echo.

cd /d "%~dp0"
if exist "server\scripts\check-september-stock.js" (
    cd server
)

if not exist "scripts\check-september-stock.js" (
    echo [ERROR] File scripts\check-september-stock.js tidak ditemukan!
    echo Pastikan file ini berada di dalam folder utama Happy Song POS.
    echo.
    pause
    exit /b 1
)

echo Menghubungi database PostgreSQL PC Server...
echo.
node scripts\check-september-stock.js

echo.
echo =======================================================================
echo Pemeriksaan selesai. Hasil laporan tersimpan di:
echo server\scripts\laporan_pemeriksaan_stok_september.txt
echo.
echo Tekan tombol apa saja pada keyboard untuk menutup jendela ini...
echo =======================================================================
pause >nul
