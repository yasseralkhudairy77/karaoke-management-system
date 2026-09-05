@echo off
title Buka Folder Laporan Penjualan Manajemen
cd /d "%~dp0"
echo Membuka folder laporan penjualan...
start "" "%~dp0exports\LAPORAN_PENJUALAN_31JULI_30AGUSTUS_2026"
if exist "%~dp0exports\LAPORAN_PENJUALAN_31JULI_30AGUSTUS_2026\LAPORAN_PENJUALAN_HAPPY_SONG_31JULI_30AGUSTUS_2026.xlsx" (
  echo Membuka file Excel...
  start "" "%~dp0exports\LAPORAN_PENJUALAN_31JULI_30AGUSTUS_2026\LAPORAN_PENJUALAN_HAPPY_SONG_31JULI_30AGUSTUS_2026.xlsx"
)
exit /b 0
