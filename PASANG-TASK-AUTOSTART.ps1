# PASANG-TASK-AUTOSTART.ps1 - memasang pemicu "saat sistem dinyalakan" untuk Happy Song.
#
# HARUS dijalankan sebagai Administrator (sekali saja). Pembungkusnya:
#   PASANG-TASK-ADMIN.cmd  ->  klik dua kali, setujui pertanyaan izin Windows.
#
# Kenapa bukan folder Startup lagi:
#   Windows menanyakan "Open File - Security Warning" untuk berkas Startup yang datang
#   dari internet, dan dialog itu baru muncul SETELAH login. Kalau operator tidak menekan
#   Run, bridge tidak jalan sama sekali. Tugas Terjadwal dijalankan oleh Windows sendiri,
#   tanpa dialog izin, dan bisa disuruh mengulang otomatis kalau layanannya berhenti.
#
# Yang dipasang:
#   HappySong-POS-Server  : saat login, menjalankan  NYALAKAN_SEMUA.ps1 -Bagian pos
#                           (server kasir port 3000 + Postgres kalau belum hidup)
#   HappySong-TV-Bridge   : saat login (+10 detik), menjalankan NYALAKAN_SEMUA.ps1 -Bagian bridge
#                           (tv bridge port 3030)
#   Keduanya: "RestartCount 3, RestartInterval 1 menit" - kalau layanan mati, Windows
#   menyalakannya lagi sendiri tiga kali. Kalau tetap mati, ada pintasan Desktop
#   "Happy Song - Nyalakan Sistem" untuk operator.

$ErrorActionPreference = 'Stop'

$Pengguna = "$env:USERDOMAIN\$env:USERNAME"
$Skrip    = 'C:\HappySong\happy-song-local\NYALAKAN_SEMUA.ps1'
$KerjaPos = 'C:\HappySong\happy-song-local\server'

if (-not (Test-Path $Skrip)) { throw "Skrip tidak ditemukan: $Skrip" }

function Daftarkan([string]$nama, [string]$bagian, [int]$tundaDetik, [string]$kerja) {
  Unregister-ScheduledTask -TaskName $nama -Confirm:$false -ErrorAction SilentlyContinue

  $aksi = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Skrip`" -Bagian $bagian" `
    -WorkingDirectory $kerja

  $pemicu = New-ScheduledTaskTrigger -AtLogOn -User $Pengguna
  if ($tundaDetik -gt 0) { $pemicu.Delay = "PT${tundaDetik}S" }

  $aturan = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

  # "Run only when user is logged on" (LogonType Interactive) = tidak butuh sandi,
  # dan tugas ini memang hanya berguna kalau ada yang memakai PC kasir.
  $prinsipal = New-ScheduledTaskPrincipal -UserId $Pengguna -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask -TaskName $nama -Action $aksi -Trigger $pemicu `
    -Settings $aturan -Principal $prinsipal -Description "Happy Song: $bagian" | Out-Null

  $t = Get-ScheduledTask -TaskName $nama
  Write-Output ("TERPASANG: {0} | status={1} | pemicu=saat login {2}" -f $nama, $t.State, $Pengguna)
}

Daftarkan 'HappySong-POS-Server' 'pos' 0 $KerjaPos
Daftarkan 'HappySong-TV-Bridge' 'bridge' 10 'C:\karaoke-tv-bridge'

# Pemicu cadangan di registry tidak diperlukan lagi begitu Tugas Terjadwal ada.
# Dibiarkan pun tidak berbahaya (skrip menolak menyalakan salinan kedua), tetapi
# satu mekanisme lebih mudah dirawat daripada dua.
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
  -Name 'HappySong-Sistem' -ErrorAction SilentlyContinue
Write-Output 'BERSIH: pemicu registry (HKCU Run) dihapus - sekarang hanya Tugas Terjadwal yang bekerja.'

Write-Output ''
Write-Output 'LANGKAH UJI (wajib, tanpa ini belum terbukti):'
Write-Output '  1. Pastikan tidak ada sesi pelanggan yang berjalan.'
Write-Output '  2. Restart PC, lalu JANGAN klik apa pun.'
Write-Output '  3. Di layar login, masuk seperti biasa (tidak ada dialog izin berkas lagi).'
Write-Output '  4. Setelah masuk, periksa dalam 1-2 menit:'
Write-Output '       netstat -ano | findstr LISTENING | findstr ":3000 :3030"'
Write-Output '     Keduanya harus ada.'
Write-Output '  5. Halaman kasir terbuka sendiri, dan kartu ruangan berubah TERSAMBUNG sendiri.'