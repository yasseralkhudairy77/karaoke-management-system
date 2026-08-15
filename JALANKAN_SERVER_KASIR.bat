@echo off
title Happy Song POS - Server Kasir & Tablet LAN
color 0A
cls

echo =======================================================================
echo        HAPPY SONG KARAOKE POS - SERVER KASIR & TABLET LAN MULTI-DEVICE
echo =======================================================================
echo.

:: Masuk ke direktori skrip ini berada
cd /d "%~dp0"

:: Jika skrip berada di root folder, masuk ke folder server
if exist "server\src\server.js" (
    cd server
)

if not exist "src\server.js" (
    echo [ERROR] Folder server tidak ditemukan. Pastikan file ini berada di folder proyek Happy Song.
    pause
    exit /b 1
)

echo [1/3] Memeriksa Alamat IP Jaringan WiFi / LAN PC Kasir...
echo -----------------------------------------------------------------------
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1 delims= " %%b in ("%%a") do (
        echo  - Alamat untuk Tablet Manager / HP : http://%%b:3000
    )
)
echo -----------------------------------------------------------------------
echo.

echo [2/3] Membuka Dashboard Kasir di Browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo [3/3] Menyalakan Server POS...
echo =======================================================================
echo  STATUS SERVER: ONLINE & AKTIF (JANGAN TUTUP JENDELA INI SAAAT JAM OPERASIONAL)
echo.
echo  - Akses PC Kasir      : http://localhost:3000
echo  - Akses Tablet Manager : http://192.168.1.4:3000 (atau IP WiFi di atas)
echo =======================================================================
echo.

npm start

echo.
echo Server telah dihentikan.
pause
