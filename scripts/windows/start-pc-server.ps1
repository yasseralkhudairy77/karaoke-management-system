$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverDir = Join-Path $repoRoot "server"
$envFile = Join-Path $serverDir ".env"
$dashboardUrl = "http://localhost:3000/?v=local"
$healthUrl = "http://localhost:3000/exec?action=health"
$serverPort = 3000

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

function Get-LanIpAddresses {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)' -and
      $_.IPAddress -ne '127.0.0.1' -and
      $_.InterfaceAlias -notmatch 'vEthernet|Loopback|VMware|VirtualBox'
    } |
    Select-Object -ExpandProperty IPAddress -Unique

  return @($addresses)
}

function Ensure-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = @(Get-Content $Path -ErrorAction Stop)
  $pattern = "^\s*$([regex]::Escape($Key))\s*="
  $found = $false
  $nextLines = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }

  if (-not $found) {
    $nextLines += "$Key=$Value"
  }

  Set-Content -Path $Path -Value $nextLines -Encoding UTF8
}

function Ensure-FirewallRule {
  try {
    $existing = Get-NetFirewallRule -DisplayName "Happy Song POS Server 3000" -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName "Happy Song POS Server 3000" -Direction Inbound -Protocol TCP -LocalPort $serverPort -Action Allow | Out-Null
      Write-Host "Firewall port $serverPort dibuka untuk akses LAN."
    }
  } catch {
    Write-Host "Peringatan: firewall port $serverPort belum bisa dicek/dibuka otomatis. Jika HP/tablet gagal akses, jalankan launcher sebagai Administrator."
  }
}

function Test-LocalHealth {
  try {
    return Invoke-RestMethod $healthUrl -TimeoutSec 5
  } catch {
    return $null
  }
}

function Test-LanHealth {
  $working = @()
  foreach ($ip in Get-LanIpAddresses) {
    try {
      $url = "http://${ip}:$serverPort/exec?action=health"
      $health = Invoke-RestMethod $url -TimeoutSec 4
      if ($health -and $health.ok -eq $true) {
        $working += $ip
      }
    } catch {
      # LAN endpoint for this IP is not reachable yet.
    }
  }
  return @($working)
}

function Open-Dashboard {
  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  foreach ($chromePath in $chromeCandidates) {
    if ($chromePath -and (Test-Path $chromePath)) {
      Start-Process $chromePath -ArgumentList @($dashboardUrl)
      return
    }
  }

  Write-Host "Google Chrome tidak ditemukan. Membuka dengan browser default Windows..."
  Start-Process $dashboardUrl
}

function Stop-NodeOnServerPort {
  $connections = @(Get-NetTCPConnection -LocalPort $serverPort -State Listen -ErrorAction SilentlyContinue)
  foreach ($connection in $connections) {
    $portPid = $connection.OwningProcess
    if (-not $portPid) { continue }

    $process = Get-Process -Id $portPid -ErrorAction SilentlyContinue
    if (-not $process) { continue }

    if ($process.ProcessName -match '^node$') {
      Write-Host "Menghentikan server lama di port ${serverPort}: PID $portPid"
      Stop-Process -Id $portPid -Force
    } else {
      throw "Port $serverPort sedang dipakai oleh $($process.ProcessName) PID $portPid. Tutup aplikasi itu dulu atau hubungi admin."
    }
  }
}

Write-Host "Menyiapkan mode LAN server..."
Ensure-EnvValue -Path $envFile -Key "BIND_HOST" -Value "0.0.0.0"
Ensure-FirewallRule

$lanIps = Get-LanIpAddresses
if ($lanIps.Count -gt 0) {
  Write-Host "Alamat untuk HP/Tablet/Device lain:"
  foreach ($ip in $lanIps) {
    Write-Host " - http://${ip}:$serverPort"
  }
} else {
  Write-Host "Peringatan: IP LAN/WiFi belum terdeteksi. Pastikan PC kasir tersambung ke jaringan."
}
Write-Host ""

$health = Test-LocalHealth
if ($health -and $health.ok -eq $true) {
  $workingLanIps = Test-LanHealth
  if ($workingLanIps.Count -gt 0) {
    Write-Host "Server sudah menyala dan akses LAN aktif."
    Write-Host "Database : $($health.database)"
    Write-Host "Timezone : $($health.server_timezone)"
    Write-Host "Waktu WIB: $($health.server_time_wib)"
    Write-Host ""
    Write-Host "Akses kasir  : $dashboardUrl"
    foreach ($ip in $workingLanIps) {
      Write-Host "Akses device : http://${ip}:$serverPort"
    }
    Write-Host ""
    Write-Host "Membuka dashboard..."
    Open-Dashboard
    exit 0
  }

  Write-Host "Server sudah hidup, tetapi belum bisa diakses dari LAN. Restart server dengan BIND_HOST=0.0.0.0..."
  Stop-NodeOnServerPort
  Start-Sleep -Seconds 2
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

$workingLanIps = Test-LanHealth

Write-Host ""
Write-Host "Server berhasil menyala."
Write-Host "Database : $($health.database)"
Write-Host "Timezone : $($health.server_timezone)"
Write-Host "Waktu WIB: $($health.server_time_wib)"
Write-Host ""
Write-Host "Akses kasir  : $dashboardUrl"
if ($workingLanIps.Count -gt 0) {
  foreach ($ip in $workingLanIps) {
    Write-Host "Akses device : http://${ip}:$serverPort"
  }
} else {
  Write-Host "Peringatan: health LAN belum terkonfirmasi. Coba dari HP/tablet buka http://192.168.1.4:$serverPort"
}
Write-Host ""
Write-Host "Membuka dashboard..."
Open-Dashboard
