$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverDir = Join-Path $repoRoot "server"
$envFile = Join-Path $serverDir ".env"

Write-Host "============================================================"
Write-Host " HAPPY SONG POS - UPDATE PC SERVER LOKAL"
Write-Host "============================================================"
Write-Host "Folder aplikasi : $repoRoot"
Write-Host ""

if (-not (Test-Path $serverDir)) {
  throw "Folder server tidak ditemukan: $serverDir"
}

if (-not (Test-Path $envFile)) {
  throw "File .env tidak ditemukan di server\.env. Jangan lanjut sebelum .env PC server dipasang."
}

Write-Host "Menghentikan server lama di port 3000 jika sedang aktif..."
$portUsers = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($portPid in $portUsers) {
  if ($portPid -and $portPid -ne $PID) {
    $proc = Get-Process -Id $portPid -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Stop process port 3000: PID $portPid ($($proc.ProcessName))"
      Stop-Process -Id $portPid -Force
    }
  }
}

Write-Host ""
Write-Host "Update kode dari GitHub..."
Set-Location $repoRoot
git pull --ff-only

Write-Host ""
Write-Host "Install/update dependency server..."
Set-Location $serverDir
npm.cmd install

Write-Host ""
Write-Host "Menyalakan server lokal di window baru..."
Start-Process powershell -WindowStyle Normal -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-Command",
  "cd `"$serverDir`"; npm.cmd start"
)

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Cek health API..."
$health = Invoke-RestMethod "http://localhost:3000/exec?action=health"
Write-Host "Status   : $($health.status)"
Write-Host "Database : $($health.database)"
Write-Host "Timezone : $($health.server_timezone)"
Write-Host "Waktu WIB: $($health.server_time_wib)"

Write-Host ""
Write-Host "UPDATE SELESAI."
Write-Host "Buka dashboard:"
Write-Host "http://localhost:3000/?v=local"
