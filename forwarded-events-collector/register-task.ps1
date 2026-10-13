<#
.SYNOPSIS
    Schedules collector.js to run every 15 minutes on the Windows Event Collector machine.
    Run once in an elevated PowerShell window.
.EXAMPLE
    .\register-task.ps1                                   # runs as SYSTEM
.EXAMPLE
    .\register-task.ps1 -ExtraArguments '--retention-days 14 --include-message'
#>
[CmdletBinding()]
param(
    [string]$InstallDir     = 'C:\UnoChariot\forwarded-collector',
    [string]$BaseDir        = 'C:\UnoChariot',
    [string]$TaskName       = 'Forwarded Events AD Collector',
    [string]$ExtraArguments = '',
    [int]$IntervalMinutes   = 15
)
$ErrorActionPreference = 'Stop'

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe not found. Install Node.js 18+ (LTS) for all users first.' }
if ($node -like "$env:USERPROFILE*") { Write-Warning "node.exe is under your user profile ($node); SYSTEM may not be able to run it. Prefer a machine-wide install in C:\Program Files\nodejs." }

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'collector.js') -Destination $InstallDir -Force

$nodeArgs = "`"$InstallDir\collector.js`" --base-dir `"$BaseDir`" $ExtraArguments".Trim()
$action   = New-ScheduledTaskAction -Execute $node -Argument $nodeArgs -WorkingDirectory $InstallDir
$every    = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$atBoot   = New-ScheduledTaskTrigger -AtStartup; $atBoot.Delay = 'PT2M'
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
              -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($every, $atBoot) `
    -Settings $settings -Principal $principal -Force | Out-Null
wevtutil.exe set-log Microsoft-Windows-TaskScheduler/Operational /enabled:true | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started '$TaskName' (every $IntervalMinutes min, as SYSTEM)."
Write-Host "Output : $BaseDir\data\ad-forwarded-events.json"
Write-Host "Status : $BaseDir\data\forwarded-collector-status.json"
Write-Host "Logs   : $BaseDir\logs\"
