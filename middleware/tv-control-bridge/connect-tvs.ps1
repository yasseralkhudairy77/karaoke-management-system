$ErrorActionPreference = "Stop"

$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $bridgeDir "config\rooms.json"

function Write-Section($Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Resolve-AdbPath {
  if ($env:ADB_BIN -and (Test-Path -LiteralPath $env:ADB_BIN)) {
    return $env:ADB_BIN
  }

  $platformToolsAdb = Join-Path $env:SystemDrive "platform-tools\adb.exe"
  if (Test-Path -LiteralPath $platformToolsAdb) {
    return $platformToolsAdb
  }

  $adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($adbCommand) {
    return $adbCommand.Source
  }

  throw "ADB tidak ditemukan. Pastikan Android platform-tools ada di C:\platform-tools atau set env ADB_BIN."
}

function Get-AdbDeviceMap($AdbPath) {
  $deviceMap = @{}
  $raw = & $AdbPath devices 2>&1

  foreach ($line in $raw) {
    $text = ([string]$line).Trim()
    if (!$text -or $text -like "List of devices*") {
      continue
    }

    $parts = $text -split "\s+"
    if ($parts.Count -ge 2) {
      $deviceMap[$parts[0]] = $parts[1]
    }
  }

  return $deviceMap
}

function Get-ConnectStatus($OutputText) {
  $text = [string]$OutputText

  if ($text -match "connected to|already connected") {
    return "connected"
  }

  if ($text -match "failed to authenticate|unauthorized") {
    return "unauthorized"
  }

  if ($text -match "unable|failed|cannot connect|10060|refused|timed out") {
    return "failed"
  }

  return "unknown"
}

if (!(Test-Path -LiteralPath $configPath)) {
  throw "File config tidak ditemukan: $configPath"
}

$adbPath = Resolve-AdbPath
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$rooms = @($config.rooms | Where-Object {
  $_.enabled -eq $true -and
  [string]::IsNullOrWhiteSpace($_.ip) -eq $false
})

Write-Host "Happy Song TV ADB Connector" -ForegroundColor Green
Write-Host "Bridge folder : $bridgeDir"
Write-Host "ADB          : $adbPath"
Write-Host "Rooms aktif  : $($rooms.Count)"

Write-Section "Start ADB Server"
& $adbPath start-server | Out-Null

$results = @()

Write-Section "Connect TV"
foreach ($room in $rooms) {
  $name = ([string]$room.name).Trim()
  $ip = ([string]$room.ip).Trim()
  $port = if ($room.adbPort) { [int]$room.adbPort } else { 5555 }
  $serial = "${ip}:${port}"

  Write-Host ("{0,-16} {1,-21}" -f $name, $serial) -NoNewline
  $output = (& $adbPath connect $serial 2>&1) -join " "
  $connectStatus = Get-ConnectStatus $output

  if ($connectStatus -eq "connected") {
    Write-Host " OK" -ForegroundColor Green
  } elseif ($connectStatus -eq "unauthorized") {
    Write-Host " UNAUTHORIZED" -ForegroundColor Yellow
  } else {
    Write-Host " FAILED" -ForegroundColor Red
  }

  $results += [PSCustomObject]@{
    Room = $name
    Serial = $serial
    Connect = $connectStatus
    Output = $output
  }
}

Start-Sleep -Milliseconds 700
$deviceMap = Get-AdbDeviceMap $adbPath

Write-Section "Ringkasan Status"
$okCount = 0
$unauthorizedCount = 0
$failedCount = 0

foreach ($result in $results) {
  $deviceState = if ($deviceMap.ContainsKey($result.Serial)) { $deviceMap[$result.Serial] } else { "not-listed" }
  $line = "{0,-16} {1,-21} {2}" -f $result.Room, $result.Serial, $deviceState

  if ($deviceState -eq "device") {
    $okCount++
    Write-Host $line -ForegroundColor Green
  } elseif ($deviceState -eq "unauthorized") {
    $unauthorizedCount++
    Write-Host $line -ForegroundColor Yellow
  } else {
    $failedCount++
    Write-Host $line -ForegroundColor Red
  }
}

Write-Section "Hasil"
Write-Host "Device OK     : $okCount" -ForegroundColor Green
Write-Host "Unauthorized  : $unauthorizedCount" -ForegroundColor Yellow
Write-Host "Belum connect : $failedCount" -ForegroundColor Red

if ($unauthorizedCount -gt 0) {
  Write-Host ""
  Write-Host "Ada TV unauthorized. Buka TV terkait, pilih Allow/OK pada popup ADB, lalu jalankan file ini lagi." -ForegroundColor Yellow
}

if ($failedCount -gt 0) {
  Write-Host ""
  Write-Host "Ada TV belum connect. Cek TV menyala, IP benar, Developer Options/ADB network aktif, dan jaringan sama." -ForegroundColor Red
}

Write-Host ""
Write-Host "Tekan Enter untuk menutup..."
Read-Host | Out-Null
