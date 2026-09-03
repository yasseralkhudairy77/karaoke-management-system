@echo off
title Happy Song POS - Cek Alamat Link untuk HP / Tablet Orang Gudang
color 0A

echo =======================================================================
echo     HAPPY SONG POS - ALAMAT LINK AKSES HP / TABLET ORANG GUDANG
echo =======================================================================
echo.
echo Pastikan HP / Tablet orang gudang sudah terhubung ke Wi-Fi yang SAMA
echo dengan komputer server ini.
echo.
echo -----------------------------------------------------------------------
echo SILAKAN BUKA BROWSER (CHROME / SAFARI) DI HP/TABLET DAN KETIK LINK INI:
echo -----------------------------------------------------------------------
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=* delims= " %%b in ("%%a") do (
        echo   👉  http://%%b:3000
    )
)

echo.
echo -----------------------------------------------------------------------
echo PIN LOGIN ADMIN GUDANG : 654321
echo -----------------------------------------------------------------------
echo.
echo Catatan:
echo Jika link di atas tidak bisa dibuka di HP orang gudang, izinkan akses port
echo 3000 di Windows Firewall komputer ini.
echo.
echo =======================================================================
echo Tekan tombol apa saja pada keyboard untuk menutup jendela ini...
echo =======================================================================
pause >nul
exit /b 0
