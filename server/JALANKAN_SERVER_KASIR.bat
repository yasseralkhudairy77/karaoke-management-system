@echo off
title Happy Song POS - Server Kasir & Tablet LAN
color 0A
cls

set "SERVER_DIR=%~dp0"
set "REPO_ROOT=%SERVER_DIR%.."
set "PS_SCRIPT=%REPO_ROOT%\scripts\windows\start-pc-server.ps1"

echo =======================================================================
echo        HAPPY SONG KARAOKE POS - SERVER KASIR & TABLET LAN
echo =======================================================================
echo.

if not exist "%PS_SCRIPT%" (
    echo [ERROR] File launcher tidak ditemukan:
    echo %PS_SCRIPT%
    echo.
    echo Pakai file di folder utama:
    echo JALANKAN HAPPY SONG POS SERVER.bat
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"

if errorlevel 1 (
    echo.
    echo [ERROR] Server belum berhasil dinyalakan. Lihat pesan error di atas.
    echo Jika masalah terkait firewall, klik kanan file BAT ini lalu pilih Run as administrator.
    pause
    exit /b 1
)

echo.
echo Server siap digunakan.
pause
