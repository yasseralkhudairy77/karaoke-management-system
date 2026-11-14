@echo off
setlocal
title Happy Song POS - Kiosk Auto Print
set "SCRIPT_DIR=%~dp0"
set "DASHBOARD_URL=http://localhost:3000/?v=local"
set "PROFILE_DIR=%LOCALAPPDATA%\HappySongKasir"

echo ============================================================
echo  HAPPY SONG POS - LAUNCHER KASIR DIRECT AUTO-PRINT
echo ============================================================
echo.
echo Mode: Kiosk Printing Aktif (Langsung cetak ke printer fisik)
echo URL : %DASHBOARD_URL%
echo.

:: Cek apakah server sudah aktif di port 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %ERRORLEVEL% NEQ 0 (
  echo Server lokal belum aktif. Menjalankan START_PC_SERVER.cmd...
  start "Happy Song Server" cmd /c "%SCRIPT_DIR%START_PC_SERVER.cmd"
  timeout /t 5 /nobreak >nul
)

:: Cari Google Chrome
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
  echo Membuka Google Chrome dengan Kiosk Printing...
  start "" "%CHROME_EXE%" --kiosk-printing --user-data-dir="%PROFILE_DIR%" "%DASHBOARD_URL%"
  goto :done
)

:: Cari Microsoft Edge jika Chrome tidak ada
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined EDGE_EXE (
  echo Membuka Microsoft Edge dengan Kiosk Printing...
  start "" "%EDGE_EXE%" --kiosk-printing --user-data-dir="%PROFILE_DIR%" "%DASHBOARD_URL%"
  goto :done
)

echo Browser Chrome/Edge tidak ditemukan. Membuka browser default...
start "" "%DASHBOARD_URL%"

:done
echo Launcher selesai.
