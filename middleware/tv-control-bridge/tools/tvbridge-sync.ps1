# ---------------------------------------------------------------------------
# Sinkronisasi KODE TV bridge: folder kerja -> salinan di repo POS.
#
#   folder kerja : C:\karaoke-tv-bridge            (yang DIJALANKAN, memuat .env,
#                                                     node_modules, logs, data, bukti)
#   salinan repo : middleware\tv-control-bridge    (CERMIN kode saja, ikut ter-commit)
#
# Pakai:
#   powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode periksa
#   powershell -ExecutionPolicy Bypass -File tools\tvbridge-sync.ps1 -Mode sync
#
# -Mode periksa : membandingkan sidik SHA256 (baris CRLF diseragamkan) dan
#                 melaporkan beda. Tidak mengubah apa pun. Jalankan ini dulu.
# -Mode sync    : menyalin berkas kode dari folder kerja ke salinan repo.
#
# Yang TIDAK pernah disalin: .env, *.log, data\, logs\, cadangan-*, bukti-*,
# node_modules, ngrok, dan hasil build APK. Aturan: kode boleh dicerminkan,
# rahasia dan limbah tidak.
# ---------------------------------------------------------------------------

param([ValidateSet('periksa', 'sync')][string]$Mode = 'periksa')

$ErrorActionPreference = 'Stop'

$Sumber = if ($env:TV_BRIDGE_LIVE) { $env:TV_BRIDGE_LIVE } else { 'C:\karaoke-tv-bridge' }
$Tujuan = Split-Path -Parent $PSScriptRoot   # middleware\tv-control-bridge

# Daftar berkas CERMIN. Tambahkan di sini kalau ada berkas kode baru.
$Daftar = @(
  'server.js'
  'config/rooms.json'
  'package.json'
  'package-lock.json'
  'README.md'
  'start-tv-bridge.cmd'
  'start-tv-bridge.ps1'
  'connect-tvs.cmd'
  'connect-tvs.ps1'
  'src/adbService.js'
  'src/countdownService.js'
  'src/roomConfig.js'
  'src/tvEventLog.js'
  'HANDOVER-2026-09-24.md'
  'HASIL-UJI-OVERLAY-TV.md'
  'tv-notify-overlay/app/build.gradle'
  'tv-notify-overlay/app/src/main/AndroidManifest.xml'
  'tv-notify-overlay/app/src/main/java/com/happysong/tvnotify/OverlayService.java'
  'tv-notify-overlay/build.gradle'
  'tv-notify-overlay/gradle.properties'
  'tv-notify-overlay/settings.gradle'
  'tv-notify-overlay/tv.sh'
)

# Pola yang HARAM ikut: pengaman kalau daftar di atas keliru diedit.
$Terlarang = @('.env', '.log', 'node_modules', 'ngrok', 'local.properties',
               'cadangan-', 'bukti-', 'data/jadwal', 'logs/')

function Sidik($path) {
  if (-not (Test-Path $path)) { return $null }
  $isi = [System.IO.File]::ReadAllText($path) -replace "`r`n", "`n"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($isi)
  return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLower()
}

if (-not (Test-Path (Join-Path $Sumber 'server.js'))) {
  throw "Folder kerja tidak wajar: $Sumber tidak memuat server.js. Set TV_BRIDGE_LIVE kalau lokasinya lain."
}

$beda = @(); $hilang = @(); $sama = @()

foreach ($rel in $Daftar) {
  foreach ($pantang in $Terlarang) {
    if ($rel -like "*$pantang*") { throw "Daftar cermin memuat berkas terlarang: $rel (cocok pola '$pantang')" }
  }
  $src = Join-Path $Sumber ($rel -replace '/', '\')
  $dst = Join-Path $Tujuan ($rel -replace '/', '\')
  if (-not (Test-Path $src)) { $hilang += $rel; continue }
  if ((Sidik $src) -eq (Sidik $dst)) { $sama += $rel; continue }
  $beda += $rel
  if ($Mode -eq 'sync') {
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

"=== tvbridge-sync (mode: $Mode) ==="
"folder kerja : $Sumber"
"salinan repo : $Tujuan"
""
"  sama            : $($sama.Count) berkas"
"  berbeda ($($beda.Count)) :"
foreach ($b in $beda) { "      $b" }
if ($hilang.Count) {
  "  tidak ada di folder kerja ($($hilang.Count)) :"
  foreach ($h in $hilang) { "      $h" }
}
""
if ($Mode -eq 'periksa' -and ($beda.Count -or $hilang.Count)) {
  "Kesimpulan: salinan repo TERTINGGAL. Jalankan -Mode sync untuk menyamakan, lalu commit di repo POS."
} elseif ($Mode -eq 'sync' -and $beda.Count) {
  "Kesimpulan: $($beda.Count) berkas disalin. Lanjutkan dengan: git add middleware/ && git commit"
} else {
  "Kesimpulan: salinan repo sudah sama dengan folder kerja."
}