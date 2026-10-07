# NYALAKAN_SEMUA.ps1 - SATU titik untuk menyalakan seluruh sistem Happy Song.
#
# Cara pakai:
#   -Bagian semua   : untuk operator / pintasan Desktop. Menyalakan yang belum jalan,
#                     menunggu kedua layanan sehat, lalu membuka halaman kasir.
#   -Bagian pos      : dipakai Scheduled Task "HappySong-POS-Server" (dijalankan di depan,
#                     supaya Windows bisa mengulang otomatis kalau server mati).
#   -Bagian bridge   : dipakai Scheduled Task "HappySong-TV-Bridge".
#
# Aman dijalankan berkali-kali: layanan yang sudah jalan TIDAK dinyalakan dua kali
# (dua instance POS/bridge di satu PC justru saling berebut port).
#
# Catatan penting soal log (pernah bikin bridge gagal start):
#   - Setiap layanan menulis ke BERKASNYA SENDIRI lewat redirection cmd ">>".
#     Dua proses yang menulis ke satu berkas lewat PowerShell akan saling mengunci,
#     dan kegagalan itu mematikan proses yang sedang dijalankan.
#   - Fungsi Tulis() tidak boleh menggagalkan skrip: kalau berkas log sedang dipakai
#     proses lain, tulisannya cukup muncul di layar.

param(
  [ValidateSet('semua', 'pos', 'bridge')]
  [string]$Bagian = 'semua',
  [switch]$TanpaBrowser,
  [int]$TungguDetik = 90
)

$ErrorActionPreference = 'Continue'

$PosDir     = 'C:\HappySong\happy-song-local\server'
# Sejak 2026-10-05 bridge DIJALANKAN dari salinan repo ini (satu sumber kode).
$BridgeDir  = 'C:\HappySong\happy-song-local\middleware\tv-control-bridge'
$LogDir     = 'C:\HappySong\happy-song-local\logs'
$LogStatus  = Join-Path $LogDir 'nyalakan-semua.log'
$LogPos     = Join-Path $LogDir 'pos-server.log'
$LogBridge  = Join-Path $LogDir 'bridge-server.log'
$Dashboard  = 'http://localhost:3000'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Tulis([string]$pesan) {
  $baris = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $pesan
  Write-Output $baris
  try {
    Add-Content -LiteralPath $LogStatus -Value $baris -Encoding UTF8 -ErrorAction Stop
  } catch {
    # Berkas log sedang dipakai proses lain: jangan menggagalkan pekerjaan.
  }
}

function PortHidup([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function LayananSehat([int]$port) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 "http://127.0.0.1:$port/health"
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function PastikanPostgres {
  try {
    $svc = Get-Service -Name 'postgresql-x64-18' -ErrorAction Stop
    if ($svc.Status -ne 'Running') {
      Tulis 'Postgres: belum hidup, mencoba menyalakan...'
      Start-Service -Name $svc.Name -ErrorAction Stop
      Tulis 'Postgres: hidup.'
    } else {
      Tulis 'Postgres: hidup (mulai sendiri sebagai service Windows).'
    }
  } catch {
    Tulis ("Postgres: TIDAK bisa dipastikan - {0}" -f $_.Exception.Message)
  }
}

# --- mode layanan (dijalankan di DEPAN oleh Scheduled Task) ----------------------------
# Start-Process ... -Wait : proses PowerShell ini hidup selama layanan hidup, jadi
# Task Scheduler bisa mendeteksi "task berhenti" dan mengulangnya kalau perlu.
function JalankanLayanan([string]$nama, [int]$port, [string]$dir, [string]$perintah, [string]$log) {
  if (PortHidup $port) {
    Tulis "$nama`: port $port sudah dipakai - tidak menyalakan salinan kedua."
    return
  }

  # Tugas Terjadwal bisa berjalan dengan PATH yang lebih sempit daripada shell operator:
  # npm dipanggil lewat alamat lengkapnya supaya tidak bergantung pada PATH.
  $perintahNyata = $perintah -replace '^npm ', ('"{0}" ' -f (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'))
  if ($perintah -eq 'npm start' -and -not (Test-Path (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'))) {
    Tulis "$nama`: PERINGATAN - npm.cmd tidak ditemukan di Program Files; memakai PATH apa adanya."
    $perintahNyata = $perintah
  }

  Tulis "$nama`: menyalakan ($perintahNyata)..."
  # Redirection ">>" dari cmd: aman dipakai bersama proses lain, berbeda dengan
  # Tee-Object/Add-Content PowerShell yang mengunci berkas.
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "$perintahNyata >> `"$log`" 2>&1") `
    -WorkingDirectory $dir -WindowStyle Hidden -Wait
  Tulis "$nama`: berhenti."
}

# --- mode operator: nyalakan yang kurang, lalu buka kasir ------------------------------
function MulaiLatar([string]$bagian) {
  $skrip = Join-Path $PSScriptRoot 'NYALAKAN_SEMUA.ps1'
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
                    '-File', "`"$skrip`"", '-Bagian', $bagian) `
    -WindowStyle Hidden
}

function BukaKasir {
  if ($TanpaBrowser) { return }
  $chrome = @(
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $Dashboard | Out-Null }
  else { Start-Process $Dashboard | Out-Null }
  Tulis 'Operator: halaman kasir dibuka di browser.'
}

function KabariOperator([string]$pesan) {
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
    [System.Windows.MessageBox]::Show($pesan, 'Happy Song - Sistem', 'OK', 'Warning') | Out-Null
  } catch {
    Tulis ("Operator: tidak bisa menampilkan pesan ({0})." -f $_.Exception.Message)
  }
}

function JalankanSemua {
  Tulis '=== Menyalakan seluruh sistem Happy Song ==='
  PastikanPostgres

  if (-not (PortHidup 3000)) { Tulis 'POS: belum jalan - dinyalakan.'; MulaiLatar 'pos' }
  else { Tulis 'POS: sudah jalan.' }

  if (-not (PortHidup 3030)) { Tulis 'Bridge: belum jalan - dinyalakan.'; MulaiLatar 'bridge' }
  else { Tulis 'Bridge: sudah jalan.' }

  $batas = (Get-Date).AddSeconds($TungguDetik)
  while ((Get-Date) -lt $batas) {
    if ((LayananSehat 3000) -and (LayananSehat 3030)) { break }
    Start-Sleep -Seconds 3
  }

  $posOk = LayananSehat 3000
  $bridgeOk = LayananSehat 3030
  Tulis ("Hasil: POS sehat = {0}, TV bridge sehat = {1}." -f $posOk, $bridgeOk)

  if ($posOk) {
    BukaKasir
  } else {
    KabariOperator("Server kasir TIDAK menyala." + [Environment]::NewLine + [Environment]::NewLine +
      "Panggil Yasser. Jangan buka-tutup aplikasi berulang kali." + [Environment]::NewLine +
      "Catatan lengkap: $LogStatus")
  }

  if (-not $bridgeOk) {
    Tulis 'PERINGATAN: tv bridge tidak sehat - perlindungan TV (peringatan + tidur otomatis) TIDAK berjalan.'
  }
}

switch ($Bagian) {
  'pos'    { JalankanLayanan 'POS' 3000 $PosDir 'npm start' $LogPos }
  'bridge' { JalankanLayanan 'Bridge' 3030 $BridgeDir 'node server.js' $LogBridge }
  default  { JalankanSemua }
}