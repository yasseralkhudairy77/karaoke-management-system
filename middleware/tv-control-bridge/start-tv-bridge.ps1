$ErrorActionPreference = "Stop"

$bridgeDir = "C:\karaoke-tv-bridge"
$logPath = Join-Path $bridgeDir "windows-bridge.log"

Set-Location $bridgeDir

$listener = Get-NetTCPConnection -LocalPort 3030 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  "[$(Get-Date -Format o)] Bridge already listening on port 3030" | Out-File -FilePath $logPath -Append -Encoding utf8
  exit 0
}

"[$(Get-Date -Format o)] Starting tv-control-bridge" | Out-File -FilePath $logPath -Append -Encoding utf8

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c cd /d C:\karaoke-tv-bridge && node server.js >> windows-bridge.log 2>&1" `
  -WindowStyle Hidden