@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\windows\start-pc-server.ps1"

if not exist "%PS_SCRIPT%" (
  echo File launcher tidak ditemukan:
  echo %PS_SCRIPT%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"

echo.
pause
