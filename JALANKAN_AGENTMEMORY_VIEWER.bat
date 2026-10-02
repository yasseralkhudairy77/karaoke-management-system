@echo off
title AgentMemory Viewer Launcher
echo =======================================================
echo    Menjalankan AgentMemory Server & Web Viewer
echo =======================================================
echo.

:: Cek apakah port 3113 sudah aktif
netstat -ano | findstr ":3113" >nul
if %errorlevel% equ 0 (
    echo Server AgentMemory sudah aktif!
) else (
    echo Menjalankan agentmemory daemon...
    start "" /B agentmemory
    timeout /t 3 /nobreak >nul
)

echo Membuka AgentMemory Viewer di browser...
start http://localhost:3113

echo.
echo Selesai! Web Viewer dapat diakses di: http://localhost:3113
echo Tekan tombol apa saja untuk menutup jendela terminal ini.
pause >nul
