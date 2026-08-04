param(
  [string]$Description = "Deploy update"
)

$ErrorActionPreference = "Stop"

$ProductionDeploymentId = "AKfycbxEGx1bHZs4n5JEhcguczAJKBoRSsgqcwVzYoMP_cmmHmogS7dzV_1y6f4GUAEHrIZH"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $ScriptDir

function Invoke-ClaspCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$StepName
  )

  Write-Host ""
  Write-Host "==> $StepName"
  Write-Host "clasp $($Arguments -join ' ')"

  $output = & clasp @Arguments 2>&1
  $exitCode = $LASTEXITCODE

  if ($output) {
    $output | ForEach-Object { Write-Host $_ }
  }

  if ($exitCode -ne 0) {
    throw "$StepName gagal dengan exit code $exitCode."
  }

  return $output
}

Write-Host "Deploy Apps Script production"
Write-Host "Deskripsi: $Description"
Write-Host "Deployment ID: $ProductionDeploymentId"

Invoke-ClaspCommand -Arguments @("status") -StepName "Cek status clasp"
Invoke-ClaspCommand -Arguments @("push", "--force") -StepName "Push file Apps Script"

$versionOutput = Invoke-ClaspCommand `
  -Arguments @("create-version", $Description) `
  -StepName "Buat versi Apps Script"

$versionText = ($versionOutput | Out-String)
$versionMatch = [regex]::Match($versionText, "(?i)version\s+(\d+)")

if (-not $versionMatch.Success) {
  throw "Gagal membaca nomor version dari output clasp create-version. Output: $versionText"
}

$versionNumber = $versionMatch.Groups[1].Value

Invoke-ClaspCommand `
  -Arguments @(
    "create-deployment",
    "--deploymentId",
    $ProductionDeploymentId,
    "--versionNumber",
    $versionNumber,
    "--description",
    $Description
  ) `
  -StepName "Update deployment production"

Write-Host ""
Write-Host "Deploy berhasil."
Write-Host "Version: $versionNumber"
Write-Host "Deployment ID: $ProductionDeploymentId"
Write-Host "URL Web App production tetap memakai deployment ID yang sama."
