$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverDir = Join-Path $repoRoot "server"
$envFile = Join-Path $serverDir ".env"
$healthUrl = "http://localhost:3000/exec?action=health"
$canonicalBranch = "main"

$gitExe = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
if (-not $gitExe) { $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source }
if (-not $gitExe) {
  throw "Perintah 'git' tidak ditemukan di PATH. Pasang Git for Windows lebih dulu sebelum memakai UPDATE-APP."
}

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

# --- 1. Samakan kode DULU, sebelum server dihentikan. -----------------------
# Urutan ini penting: kalau penarikan gagal, POS yang sedang jalan tidak ikut mati.
Write-Host "Menyamakan kode dengan GitHub (server belum dihentikan)..."
Set-Location $repoRoot

$branch = (& $gitExe rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Branch aktif    : $branch"

if ($branch -ne $canonicalBranch) {
  Write-Host "Branch aktif bukan '$canonicalBranch' -> berpindah ke '$canonicalBranch' agar pembaruan benar..."
  & $gitExe checkout $canonicalBranch
  if ($LASTEXITCODE -ne 0) {
    throw "Gagal berpindah ke branch '$canonicalBranch'. Biasanya karena ada perubahan lokal yang belum di-commit di branch '$branch'. Simpan/commit dulu, lalu jalankan UPDATE-APP lagi."
  }
  $branch = $canonicalBranch
}

$upstream = (& $gitExe rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null)
if (-not $upstream) {
  throw "Branch '$branch' belum punya upstream (belum terhubung ke GitHub). Perbaiki dulu: git branch --set-upstream-to=origin/$branch"
}
Write-Host "Sumber pembaruan: $upstream"

& $gitExe pull --ff-only
if ($LASTEXITCODE -ne 0) {
  throw "git pull GAGAL di branch '$branch'. Server TIDAK dihentikan, jadi POS tetap jalan. Biasanya karena riwayat bercabang atau ada berkas lokal yang bentrok dengan perubahan dari GitHub. Perbaiki dulu (commit/stash) lalu ulangi UPDATE-APP."
}
$head = (& $gitExe log -1 --format="%h %s").Trim()
Write-Host "Kode berhasil disamakan. Versi sekarang: $head"

# --- 2. Baru sekarang hentikan server lama di port 3000. --------------------
Write-Host ""
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

# --- 3. Dependency & schema, lalu nyalakan server. --------------------------
Write-Host ""
Write-Host "Install/update dependency server..."
Set-Location $serverDir
npm.cmd install

Write-Host ""
Write-Host "Menyiapkan/update schema database lokal..."
npm.cmd run db:init

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