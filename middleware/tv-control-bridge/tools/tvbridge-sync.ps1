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

# Tabel berkas CERMIN. Tambahkan di sini kalau ada berkas kode/nota baru.
# 'Terkunci' = $true untuk berkas yang tanggal di namanya sudah IKUT TERCETAK di
# dalam isinya (mis. catatan handover yang menyebut tanggal/topiknya). Berkas
# terkunci TIDAK pernah ditimpa atau dihapus oleh sinkronisasi: ia hanya
# DIPERIKSA dan dilaporkan kalau isinya berbeda, supaya catatan hari lain tidak
# hilang tanpa disadari. Catatan terkunci hanya bisa diubah dengan sengaja.
$Tabel = @(
  @{ Rel = 'server.js';                     Terkunci = $false }
  @{ Rel = 'config/rooms.json';             Terkunci = $false }
  @{ Rel = 'package.json';                  Terkunci = $false }
  @{ Rel = 'package-lock.json';             Terkunci = $false }
  @{ Rel = 'README.md';                     Terkunci = $false }
  @{ Rel = 'start-tv-bridge.cmd';           Terkunci = $false }
  @{ Rel = 'start-tv-bridge.ps1';           Terkunci = $false }
  @{ Rel = 'connect-tvs.cmd';               Terkunci = $false }
  @{ Rel = 'connect-tvs.ps1';               Terkunci = $false }
  @{ Rel = 'src/adbService.js';             Terkunci = $false }
  @{ Rel = 'src/countdownService.js';       Terkunci = $false }
  @{ Rel = 'src/roomConfig.js';             Terkunci = $false }
  @{ Rel = 'src/tvEventLog.js';             Terkunci = $false }
  @{ Rel = 'HANDOVER-2026-09-24.md';        Terkunci = $true }
  @{ Rel = 'HANDOVER-2026-09-25.md';        Terkunci = $true }
  @{ Rel = 'HASIL-UJI-OVERLAY-TV.md';       Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/app/build.gradle'; Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/app/src/main/AndroidManifest.xml'; Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/app/src/main/java/com/happysong/tvnotify/OverlayService.java'; Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/build.gradle';     Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/gradle.properties'; Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/settings.gradle';   Terkunci = $false }
  @{ Rel = 'tv-notify-overlay/tv.sh';             Terkunci = $false }
  @{ Rel = 'assets/app-debug.apk';                Terkunci = $false }
  @{ Rel = 'RENCANA-TOMBOL-INSTALL-APK.md';       Terkunci = $false }
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

$beda = @(); $hilang = @(); $sama = @(); $terkunciBeda = @()

foreach ($item in $Tabel) {
  $rel = $item.Rel
  foreach ($pantang in $Terlarang) {
    if ($rel -like "*$pantang*") { throw "Tabel cermin memuat berkas terlarang: $rel (cocok pola '$pantang')" }
  }
  $src = Join-Path $Sumber ($rel -replace '/', '\')
  $dst = Join-Path $Tujuan ($rel -replace '/', '\')

  # Berkas terkunci: hanya diperiksa. Kalau isinya berbeda, sync TIDAK menimpanya -
  # kalau ditimpa, catatan ruangan yang sudah dicetak akan hilang tanpa disadari.
  if ($item.Terkunci) {
    if (-not (Test-Path $dst)) { $hilang += "$rel (terkunci, belum ada di repo)" ; continue }
    if ((Sidik $src) -eq (Sidik $dst)) { $sama += $rel } else { $terkunciBeda += $rel }
    continue
  }

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
if ($terkunciBeda.Count) {
  "  TERKUNCI berbeda, TIDAK disalin ($($terkunciBeda.Count)) :"
  foreach ($t in $terkunciBeda) { "      $t  <- catatan berbeda; sesuaikan dengan sengaja kalau memang perlu" }
}
if ($hilang.Count) {
  "  tidak ada di folder kerja ($($hilang.Count)) :"
  foreach ($h in $hilang) { "      $h" }
}
""
if ($Mode -eq 'periksa' -and ($beda.Count -or $hilang.Count -or $terkunciBeda.Count)) {
  "Kesimpulan: salinan repo TERTINGGAL. Jalankan -Mode sync untuk menyamakan, lalu commit di repo POS."
} elseif ($Mode -eq 'sync' -and $beda.Count) {
  "Kesimpulan: $($beda.Count) berkas disalin. Lanjutkan dengan: git add middleware/ && git commit"
} elseif ($terkunciBeda.Count) {
  "Kesimpulan: berkas kode sudah sama. Ada $($terkunciBeda.Count) catatan terkunci yang isinya berbeda - periksa dengan sengaja, bukan otomatis."
} else {
  "Kesimpulan: salinan repo sudah sama dengan folder kerja."
}