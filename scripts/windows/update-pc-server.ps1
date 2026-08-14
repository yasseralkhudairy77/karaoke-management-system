$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverDir = Join-Path $repoRoot "server"
$envFile = Join-Path $serverDir ".env"
$healthUrl = "http://localhost:3000/exec?action=health"

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

function Test-LocalHealth {
  try {
    return Invoke-RestMethod $healthUrl -TimeoutSec 5
  } catch {
    return $null
  }
}

Write-Host ""
Write-Host "Menunggu health API siap..."
$health = $null
for ($i = 1; $i -le 20; $i++) {
  Start-Sleep -Seconds 1
  $health = Test-LocalHealth
  if ($health -and $health.ok -eq $true) {
    break
  }
  Write-Host "Menunggu server... ($i/20)"
}

if (-not $health -or $health.ok -ne $true) {
  throw "Server belum menjawab health check. Lihat window server yang baru terbuka untuk detail error, lalu jalankan START SERVER."
}

Write-Host "Cek health API..."
Write-Host "Status   : $($health.status)"
Write-Host "Database : $($health.database)"
Write-Host "Timezone : $($health.server_timezone)"
Write-Host "Waktu WIB: $($health.server_time_wib)"

Write-Host ""
Write-Host "UPDATE SELESAI."
Write-Host "Buka dashboard:"
Write-Host "http://localhost:3000/?v=local"
