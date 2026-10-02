@echo off
title Happy Song POS - Reset Stok Menjadi 0 (Persiapan Stock Opname)
color 0C

echo =======================================================================
echo    HAPPY SONG POS - RESET SELURUH STOK GUDANG MENJADI 0
echo =======================================================================
echo.
echo [PERHATIAN PENTING]:
echo Script ini akan mengubah seluruh STOK AKTUAL barang di menu Stok menjadi 0.
echo Gunakan script ini HANYA saat Anda sedang melakukan Stock Opname fisik,
echo agar Anda bisa menginput kembali angka riil dari rak gudang dari angka 0.
echo.
echo Semua penyesuaian kuantitas sebelumnya akan dicatat di log mutasi stok.
echo =======================================================================
echo.

cd /d "%~dp0"
if exist "server\scripts\reset-inventory-stock-to-zero.js" (
    cd server
)

if not exist "scripts\reset-inventory-stock-to-zero.js" (
    echo [ERROR] File scripts\reset-inventory-stock-to-zero.js tidak ditemukan!
    echo Pastikan file ini berada di dalam folder happy-song-local.
    echo.
    echo Tekan tombol apa saja untuk menutup...
    pause >nul
    exit /b 1
)

echo Apakah Anda yakin ingin meng-0-kan seluruh stok sekarang?
echo   [1] YA, Reset Semua Stok Menjadi 0 Sekarang
echo   [2] BATAL (Keluar tanpa mengubah apa pun)
echo.

choice /c 12 /n /m "Tekan tombol angka [1] untuk Lanjut, atau [2] untuk Batal: "
set "PILIHAN=%errorlevel%"

if "%PILIHAN%"=="2" goto BATAL

:EKSEKUSI
echo.
echo =======================================================================
echo  MEMPROSES RESET STOK KE 0...
echo =======================================================================
echo.
node scripts/reset-inventory-stock-to-zero.js
if errorlevel 1 (
    echo.
    echo [ERROR] Terjadi kendala saat mereset stok database.
    echo Periksa pesan di atas (pastikan service PostgreSQL aktif).
) else (
    echo.
    echo -----------------------------------------------------------------------
    echo Berhasil! Semua stok telah menjadi 0.
    echo Silakan refresh halaman POS di browser (F5) untuk mulai input stok opname.
)
goto SELESAI

:BATAL
echo.
echo Operasi reset stok dibatalkan. Tidak ada data yang diubah.
goto SELESAI

:SELESAI
echo.
echo =======================================================================
echo Tekan tombol apa saja pada keyboard untuk menutup jendela ini...
echo =======================================================================
pause >nul
exit /b 0
