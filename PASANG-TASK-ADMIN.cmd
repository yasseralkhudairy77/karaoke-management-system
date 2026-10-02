@echo off
REM Pasang pemicu "saat sistem dinyalakan" untuk Happy Song (POS + TV bridge).
REM Klik dua kali berkas ini, lalu setujui pertanyaan izin Windows (Administrator).
REM Cukup SEKALI saja. Setelah itu tidak ada lagi berkas yang harus diklik Run
REM setiap kali PC karaoke dinyalakan.

echo Meminta izin Administrator... (pilih "Yes" pada jendela yang muncul)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','\"C:\HappySong\happy-song-local\PASANG-TASK-AUTOSTART.ps1\"'"