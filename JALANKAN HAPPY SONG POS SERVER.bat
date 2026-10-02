@echo off
title Happy Song POS - Jalankan Server Kasir
color 0A
cls

echo ============================================================
echo  HAPPY SONG POS - JALANKAN SERVER KASIR
echo ============================================================
echo.
echo File ini akan:
echo  - menyalakan server lokal Happy Song
echo  - memastikan server bisa diakses HP/Tablet lewat LAN
echo  - membuka dashboard kasir di Google Chrome
echo.

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\windows\start-pc-server.ps1"

if not exist "%PS_SCRIPT%" (
  echo [ERROR] File launcher tidak ditemukan:
  echo %PS_SCRIPT%
  echo.
  echo Pastikan file BAT ini berada di folder utama happy-song-local.
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
