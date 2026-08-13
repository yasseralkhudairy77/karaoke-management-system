$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverDir = Join-Path $repoRoot "server"
$envFile = Join-Path $serverDir ".env"
$dashboardUrl = "http://localhost:3000/?v=local"
$healthUrl = "http://localhost:3000/exec?action=health"

Write-Host "============================================================"
Write-Host " HAPPY SONG POS - START SERVER LOKAL"
Write-Host "============================================================"
Write-Host "Folder aplikasi : $repoRoot"
Write-Host ""

if (-not (Test-Path $serverDir)) {
  throw "Folder server tidak ditemukan: $serverDir"
}

if (-not (Test-Path $envFile)) {
  throw "File .env tidak ditemukan di server\.env. Server tidak bisa konek PostgreSQL tanpa file ini."
}

function Test-LocalHealth {
  try {
    return Invoke-RestMethod $healthUrl -TimeoutSec 5
  } catch {
    return $null
  }
}

$health = Test-LocalHealth
if ($health -and $health.ok -eq $true) {
  Write-Host "Server sudah menyala."
  Write-Host "Database : $($health.database)"
  Write-Host "Timezone : $($health.server_timezone)"
  Write-Host "Waktu WIB: $($health.server_time_wib)"
  Write-Host ""
  Write-Host "Membuka dashboard..."
  Start-Process $dashboardUrl
  exit 0
}

Write-Host "Server belum menyala. Menyalakan server lokal di window baru..."
Start-Process powershell -WindowStyle Normal -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-Command",
  "cd `"$serverDir`"; npm.cmd start"
)

Write-Host "Menunggu server siap..."
$health = $null
for ($i = 1; $i -le 15; $i++) {
  Start-Sleep -Seconds 1
  $health = Test-LocalHealth
  if ($health -and $health.ok -eq $true) {
    break
  }
}

if (-not $health -or $health.ok -ne $true) {
  throw "Server belum menjawab health check. Lihat window server untuk detail error."
}

Write-Host ""
Write-Host "Server berhasil menyala."
Write-Host "Database : $($health.database)"
Write-Host "Timezone : $($health.server_timezone)"
Write-Host "Waktu WIB: $($health.server_time_wib)"
Write-Host ""
Write-Host "Membuka dashboard..."
Start-Process $dashboardUrl
