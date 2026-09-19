<#
  Nerve Center - scheduled backup copy to this PC
  ------------------------------------------------
  Run once: right-click this file and choose "Run with PowerShell".

  What it does
    1. Asks where to keep the backups, what time to copy them and how many to keep.
    2. Asks for the PC backup key created in Nerve Center (Administration > Backup >
       Backup Schedule > Copy backups to a PC). The key is saved encrypted for this
       Windows user only (Windows DPAPI); it is never written in plain text.
    3. Creates a daily Windows scheduled task "Nerve Center backup copy" for this user.
       If the PC is off at that time, the copy runs as soon as the PC is back on.
    4. Runs the first copy straight away so you can see it work.

  Each copy downloads the latest completed backup from the server, checks its
  SHA-256 checksum, keeps it in your folder and removes copies older than the
  number you chose to keep. A log is kept in %LOCALAPPDATA%\NerveCenterBackup.
  No administrator rights are needed.
#>
$ErrorActionPreference = 'Stop'
$AppUrl = 'https://bdms.cmll.in'
$TaskName = 'Nerve Center backup copy'
$WorkDir = Join-Path $env:LOCALAPPDATA 'NerveCenterBackup'
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

Write-Host ''
Write-Host 'Nerve Center - scheduled backup copy to this PC' -ForegroundColor Magenta
Write-Host ('App: ' + $AppUrl)
Write-Host ''

$defaultFolder = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Nerve Center Backups'
$folder = Read-Host "Folder for the backups [$defaultFolder]"
if ([string]::IsNullOrWhiteSpace($folder)) { $folder = $defaultFolder }
$folder = $folder.Trim().Trim('"')
New-Item -ItemType Directory -Force -Path $folder | Out-Null

do {
  $time = Read-Host 'Daily copy time, 24-hour HH:mm [03:00] (the server backup runs at 02:00 IST by default)'
  if ([string]::IsNullOrWhiteSpace($time)) { $time = '03:00' }
  $time = $time.Trim()
} until ($time -match '^([01]\d|2[0-3]):[0-5]\d$')

do {
  $keepText = Read-Host 'How many backups to keep on this PC [30] (0 = keep all)'
  if ([string]::IsNullOrWhiteSpace($keepText)) { $keepText = '30' }
} until ($keepText.Trim() -match '^\d{1,4}$')
$keep = [int]$keepText.Trim()

$secureKey = Read-Host 'Paste the PC backup key from Nerve Center, then press Enter' -AsSecureString
if ($secureKey.Length -lt 20) { throw 'That does not look like a PC backup key. Create one in Nerve Center and run this script again.' }
$secureKey | ConvertFrom-SecureString | Set-Content -Path (Join-Path $WorkDir 'key.dat') -Encoding ASCII

@{ appUrl = $AppUrl; folder = $folder; keep = $keep } | ConvertTo-Json | Set-Content -Path (Join-Path $WorkDir 'config.json') -Encoding ASCII

$runner = @'
$ErrorActionPreference = 'Stop'
$WorkDir = Join-Path $env:LOCALAPPDATA 'NerveCenterBackup'
$log = Join-Path $WorkDir 'backup-copy.log'
function Write-Log([string]$message) { ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) | Add-Content -Path $log -Encoding ASCII }
$tmp = $null
try {
  $config = Get-Content -Path (Join-Path $WorkDir 'config.json') -Raw | ConvertFrom-Json
  $secure = Get-Content -Path (Join-Path $WorkDir 'key.dat') | ConvertTo-SecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  New-Item -ItemType Directory -Force -Path $config.folder | Out-Null
  $tmp = Join-Path $config.folder 'download.partial'
  $response = Invoke-WebRequest -Uri ($config.appUrl.TrimEnd('/') + '/api/backups/pc-download/latest') -Headers @{ 'X-Backup-Key' = $key } -OutFile $tmp -PassThru -UseBasicParsing -TimeoutSec 7200
  $name = [string]$response.Headers['X-Backup-File']
  $expected = ([string]$response.Headers['X-Backup-Checksum']).Trim().ToLower()
  if ([string]::IsNullOrWhiteSpace($name)) { $name = 'BDMS-Backup-' + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.ndjson.gz' }
  $name = ($name -replace '[^A-Za-z0-9._-]', '-')
  $target = Join-Path $config.folder $name
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $tmp -Force
    Write-Log ('Already copied ' + $name + ' - nothing new on the server yet.')
  } else {
    $actual = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLower()
    if ($expected -and $actual -ne $expected) { throw ('Checksum mismatch for ' + $name + ' - the file was discarded.') }
    Move-Item -LiteralPath $tmp -Destination $target
    $mb = [math]::Round((Get-Item -LiteralPath $target).Length / 1MB, 1)
    Write-Log ('Copied ' + $name + ' (' + $mb + ' MB, SHA-256 verified).')
  }
  if ([int]$config.keep -gt 0) {
    Get-ChildItem -LiteralPath $config.folder -Filter '*.ndjson.gz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip ([int]$config.keep) | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
      Write-Log ('Removed older copy ' + $_.Name + ' (keeping ' + $config.keep + ').')
    }
  }
  exit 0
} catch {
  if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  $message = $_.Exception.Message
  if ($_.Exception.Response) { try { $message = $message + ' (HTTP ' + [int]$_.Exception.Response.StatusCode + ')' } catch {} }
  Write-Log ('FAILED: ' + $message)
  exit 1
}
'@
$runnerPath = Join-Path $WorkDir 'pull-backup.ps1'
Set-Content -Path $runnerPath -Value $runner -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runnerPath + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Copies the latest Nerve Center backup to this PC every day.' -Force | Out-Null

Write-Host ''
Write-Host ('Scheduled: every day at ' + $time + ' (runs later if the PC was off).') -ForegroundColor Green
Write-Host ('Backups folder: ' + $folder)
Write-Host 'Running the first copy now...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runnerPath
$logPath = Join-Path $WorkDir 'backup-copy.log'
if (Test-Path $logPath) { Write-Host ''; Get-Content $logPath -Tail 3 | ForEach-Object { Write-Host $_ } }
Write-Host ''
Write-Host 'Done. To stop the daily copy later: open Task Scheduler and delete "Nerve Center backup copy".'
Read-Host 'Press Enter to close'
