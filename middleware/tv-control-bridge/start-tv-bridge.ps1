$ErrorActionPreference = "Stop"

$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $bridgeDir "windows-bridge.log"

Set-Location $bridgeDir

# Reconnect every configured TV after the network and Android TVs recover.
$env:AUTO_CONNECT_ALL = "true"
$env:AUTO_CONNECT_DELAY_MS = "15000"
$env:AUTO_CONNECT_RETRIES = "8"

$platformToolsAdb = Join-Path $env:SystemDrive "platform-tools\adb.exe"
if (Test-Path -LiteralPath $platformToolsAdb) {
  $env:ADB_BIN = $platformToolsAdb
}

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match "node(\.exe)?\s+server\.js" -and
    $_.CommandLine -like "*tv-control-bridge*"
  }

if ($existing) {
  "[$(Get-Date -Format o)] tv-control-bridge already running. PID: $($existing.ProcessId -join ', ')" |
    Out-File -FilePath $logPath -Append -Encoding utf8
  exit 0
}

"[$(Get-Date -Format o)] Starting tv-control-bridge from $bridgeDir" |
  Out-File -FilePath $logPath -Append -Encoding utf8

npm start >> $logPath 2>&1
