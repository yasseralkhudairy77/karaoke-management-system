@echo off
title Happy Song POS - Pembersihan Item Paket dari Stok Fisik
color 0B
cls

echo =======================================================================
echo    HAPPY SONG POS - AUDIT ^& PEMBERSIHAN MASTER STOK (INVENTORY)
echo =======================================================================
echo.
echo Tool ini akan mendeteksi item paket/bundle yang tercampur di menu Stok
echo dan memindahkannya agar tabel Stok murni hanya berisi barang fisik.
echo.

cd /d "%~dp0"
if exist "server\scripts\audit-and-clean-inventory-packages.js" (
    cd server
)

if not exist "scripts\audit-and-clean-inventory-packages.js" (
    echo [ERROR] File scripts\audit-and-clean-inventory-packages.js tidak ditemukan!
    echo Pastikan file BAT ini dijalankan di dalam folder happy-song-local.
    pause
    exit /b 1
)

echo Pilih mode yang ingin dijalankan:
echo  [1] Simulasi Cek Data (Dry-Run: hanya melihat daftar paket tanpa mengubah data)
echo  [2] Eksekusi Pembersihan (Langsung bersihkan paket dari tabel stok aktif)
echo  [3] Keluar
echo.
set /p "pilihan=Ketik nomor pilihan Anda (1/2/3) lalu tekan ENTER: "

if "%pilihan%"=="1" (
    cls
    echo =======================================================================
    echo  MENJALANKAN SIMULASI (DRY-RUN)...
    echo =======================================================================
    echo.
    node scripts/audit-and-clean-inventory-packages.js
    echo.
    echo -----------------------------------------------------------------------
    echo Simulasi selesai. Database belum diubah.
    pause
    exit /b 0
)

if "%pilihan%"=="2" (
    cls
    echo =======================================================================
    echo  MENJALANKAN EKSEKUSI PEMBERSIHAN STOK...
    echo =======================================================================
    echo.
    node scripts/audit-and-clean-inventory-packages.js --execute
    echo.
    echo -----------------------------------------------------------------------
    echo Pembersihan selesai! Silakan refresh halaman POS di browser (F5).
    pause
    exit /b 0
)

echo Selesai.
exit /b 0
