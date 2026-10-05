$ErrorActionPreference = "Stop"

# Peluncur untuk folder INI (salinan repo). Sejak 2026-10-05 folder yang dijalankan adalah
# folder ini, bukan C:\karaoke-tv-bridge.
$bridgeDir = $PSScriptRoot
$logPath = Join-Path $bridgeDir "..\..\logs\bridge-server.log"

Set-Location $bridgeDir

$listener = Get-NetTCPConnection -LocalPort 3030 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  "[$(Get-Date -Format o)] Bridge sudah mendengarkan di port 3030" | Out-File -FilePath $logPath -Append -Encoding utf8
  exit 0
}

"[$(Get-Date -Format o)] Menyalakan tv-control-bridge dari $bridgeDir" | Out-File -FilePath $logPath -Append -Encoding utf8

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c cd /d `"$bridgeDir`" && node server.js >> `"$logPath`" 2>&1" `
  -WindowStyle Hidden
