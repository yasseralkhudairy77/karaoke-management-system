param(
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [string]$PgPassword = "postgres",
  [string]$TestDatabase = "happy_song_pos_test"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Resolve-Path (Join-Path $scriptDir "..")

Push-Location $serverDir
try {
  $env:PGHOST = $PgHost
  $env:PGPORT = [string]$PgPort
  $env:PGUSER = $PgUser
  $env:PGPASSWORD = $PgPassword
  $env:PGTESTDATABASE = $TestDatabase
  $env:PGDATABASE = $TestDatabase
  $env:DISABLE_SYNC_WORKER = "1"

  Write-Host "Checking PostgreSQL $PgHost`:$PgPort..."
  $tcp = Test-NetConnection -ComputerName $PgHost -Port $PgPort -InformationLevel Quiet
  if (-not $tcp) {
    throw "PostgreSQL is not reachable at $PgHost`:$PgPort. Start PostgreSQL first, then rerun this script."
  }

  Write-Host "Installing Node dependencies if needed..."
  npm.cmd install

  Write-Host "Running schema initialization for test database '$TestDatabase'..."
  npm.cmd run db:init

  Write-Host "Running local contract tests against '$TestDatabase'..."
  npm.cmd run test:contract
}
finally {
  Pop-Location
}
