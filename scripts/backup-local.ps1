<#
.SYNOPSIS
  Creates a complete local backup of the BDMS application and its data.

.DESCRIPTION
  Produces one dated folder containing:
    app-repository.bundle      full Git history, every branch and tag (restore with: git clone app-repository.bundle)
    app-source-<commit>.zip    source code of the currently checked-out commit
    app-working-folder.zip     the project folder including untracked files such as work/ and outputs/
                               (node_modules, dist, .git, .env and .oracle-wallet are excluded)
    bdms-data-<time>.ndjson.gz every database table (restore with scripts/restore-database.mjs)
    bdms-database-<time>.dump  native pg_dump archive, only when pg_dump is installed
    table-counts.json          row count per table
    SHA256SUMS.txt, manifest.json

  The database connection string is read from -DatabaseUrl, then the DATABASE_URL
  environment variable, then the project's .env file. It is never printed.

.PARAMETER Destination
  Folder that receives the dated backup folder. Default: %USERPROFILE%\BDMS-Backups
  Point it at a OneDrive folder to get an automatic cloud copy.

.PARAMETER DatabaseUrl
  PostgreSQL connection string (postgres://user:password@host:5432/db?sslmode=require).

.PARAMETER SkipDatabase
  Back up only the application files.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1
  powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -Destination "D:\Backups\BDMS"
#>
[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'BDMS-Backups'),
  [string]$DatabaseUrl = '',
  [switch]$SkipDatabase
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectName = Split-Path -Leaf $projectRoot
$projectParent = Split-Path -Parent $projectRoot
$stamp = (Get-Date).ToString('yyyy-MM-dd_HHmmss')
$target = Join-Path $Destination "bdms-backup-$stamp"

function Get-DatabaseUrl {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit.Trim() }
  if ($env:DATABASE_URL) { return $env:DATABASE_URL.Trim() }
  $envFile = Join-Path $projectRoot '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      $trimmed = $line.Trim()
      if ($trimmed -match '^(?:export\s+)?DATABASE_URL\s*=\s*(.*)$') {
        $value = $Matches[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
          $value = $value.Substring(1, $value.Length - 2)
        }
        return $value
      }
    }
  }
  return ''
}

function Invoke-Checked {
  param([string]$Label, [scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Write-Host "BDMS local backup"
Write-Host "  Project : $projectRoot"
Write-Host "  Target  : $target"
Write-Host ''

Push-Location $projectRoot
try {
  $commit = (git rev-parse HEAD).Trim()
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()

  Write-Host "[1/5] Git repository bundle (all branches and history)"
  $bundle = Join-Path $target 'app-repository.bundle'
  Invoke-Checked 'git bundle' { git bundle create $bundle --all }
  Invoke-Checked 'git bundle verify' { git bundle verify $bundle }

  Write-Host "[2/5] Source snapshot of commit $commit ($branch)"
  Invoke-Checked 'git archive' { git archive --format=zip --prefix="$projectName/" --output (Join-Path $target "app-source-$commit.zip") HEAD }

  Write-Host "[3/5] Working folder (including untracked work/ and outputs/)"
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (-not (Test-Path $tar)) { $tar = 'tar' }
  $workingZip = Join-Path $target 'app-working-folder.zip'
  Invoke-Checked 'tar' {
    & $tar -a -c -f $workingZip `
      --exclude "$projectName/node_modules" `
      --exclude "$projectName/dist" `
      --exclude "$projectName/.git" `
      --exclude "$projectName/.env" `
      --exclude "$projectName/.env.*" `
      --exclude "$projectName/.oracle-wallet" `
      --exclude "$projectName/backups" `
      -C $projectParent $projectName
  }

  $tableCounts = $null
  if ($SkipDatabase) {
    Write-Host "[4/5] Database skipped (-SkipDatabase)"
  } else {
    Write-Host "[4/5] Database tables"
    $resolvedUrl = Get-DatabaseUrl -Explicit $DatabaseUrl
    if (-not $resolvedUrl) {
      Write-Warning "No DATABASE_URL found. Add DATABASE_URL=... to $projectRoot\.env (that file is git-ignored) or pass -DatabaseUrl."
      Write-Warning "Application files were backed up; the database export was skipped. The daily Azure backup job still covers the database."
    } else {
      $previous = $env:DATABASE_URL
      $env:DATABASE_URL = $resolvedUrl
      try {
        $dataFile = Join-Path $target "bdms-data-$stamp.ndjson.gz"
        $countsFile = Join-Path $target 'table-counts.json'
        Invoke-Checked 'database export' { node (Join-Path $projectRoot 'scripts\backup-database.mjs') --output $dataFile --summary $countsFile }
        $tableCounts = (Get-Content $countsFile -Raw | ConvertFrom-Json).tables

        $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
        if ($pgDump) {
          Write-Host "      pg_dump found; writing a native archive as well"
          Invoke-Checked 'pg_dump' { & pg_dump --format=custom --no-owner --no-privileges --file (Join-Path $target "bdms-database-$stamp.dump") $resolvedUrl }
        } else {
          Write-Host "      pg_dump not installed; native archive skipped (optional: winget install PostgreSQL.PostgreSQL)"
        }
      } finally {
        $env:DATABASE_URL = $previous
      }
    }
  }

  Write-Host "[5/5] Checksums and manifest"
  $files = Get-ChildItem $target -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' -and $_.Name -ne 'manifest.json' }
  $sums = foreach ($file in $files) { '{0}  {1}' -f (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLower(), $file.Name }
  Set-Content -Path (Join-Path $target 'SHA256SUMS.txt') -Value $sums -Encoding ascii
  $manifest = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    computer = $env:COMPUTERNAME
    project = $projectRoot
    branch = $branch
    commit = $commit
    files = @(foreach ($file in $files) { [ordered]@{ name = $file.Name; bytes = $file.Length } })
    tables = $tableCounts
  }
  Set-Content -Path (Join-Path $target 'manifest.json') -Value ($manifest | ConvertTo-Json -Depth 5) -Encoding utf8

  $totalMb = [math]::Round((($files | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
  Write-Host ''
  Write-Host "Backup complete: $($files.Count) files, $totalMb MB"
  Write-Host "Folder: $target"
} finally {
  Pop-Location
}
