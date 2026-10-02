@echo off
title Happy Song POS - Pembersihan Item Paket dari Stok Fisik
color 0B

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
    echo Pastikan file BAT ini berada di folder happy-song-local.
    echo.
    echo Tekan tombol apa saja untuk menutup...
    pause >nul
    exit /b 1
)

:MENU
echo.
echo =======================================================================
echo  PILIH MODE OPERASI:
echo =======================================================================
echo   [1] Simulasi Cek Data (Dry-Run: melihat daftar paket tanpa ubah database)
echo   [2] Eksekusi Pembersihan (Langsung bersihkan paket dari tabel stok aktif)
echo   [3] Keluar
echo.
echo Silakan tekan tombol angka [1], [2], atau [3] pada keyboard:

choice /c 123 /n /m "Pilihan Anda (1/2/3): "
set "PILIHAN=%errorlevel%"

if "%PILIHAN%"=="1" goto SIMULASI
if "%PILIHAN%"=="2" goto EKSEKUSI
if "%PILIHAN%"=="3" goto KELUAR

goto MENU

:SIMULASI
echo.
echo =======================================================================
echo  [1] MENJALANKAN SIMULASI (DRY-RUN)...
echo =======================================================================
echo.
node scripts/audit-and-clean-inventory-packages.js
echo.
echo -----------------------------------------------------------------------
echo Simulasi selesai. Database belum diubah.
goto SELESAI

:EKSEKUSI
echo.
echo =======================================================================
echo  [2] MENJALANKAN EKSEKUSI PEMBERSIHAN STOK...
echo =======================================================================
echo.
node scripts/audit-and-clean-inventory-packages.js --execute
if errorlevel 1 (
    echo.
    echo [PERHATIAN] Terjadi kendala saat menjalankan pembersihan database.
    echo Periksa pesan error di atas (pastikan PostgreSQL lokal sedang aktif).
) else (
    echo.
    echo -----------------------------------------------------------------------
    echo Pembersihan selesai! Silakan refresh halaman POS di browser (F5).
)
goto SELESAI

:KELUAR
echo.
echo Operasi dibatalkan oleh pengguna.
goto SELESAI

:SELESAI
echo.
echo =======================================================================
echo Jendela tidak akan tertutup otomatis.
echo Tekan tombol apa saja pada keyboard untuk menutup jendela ini...
echo =======================================================================
pause >nul
exit /b 0
