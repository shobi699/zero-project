# Windows Task Scheduler registration script for Zero Daemon Watchdog
# Run this script as Administrator to register the watchdog task.

$daemonPath = Join-Path (Get-Location) "target\debug\zero-daemon.exe"
if (-not (Test-Path $daemonPath)) {
    $daemonPath = Join-Path (Get-Location) "target\release\zero-daemon.exe"
}

if (-not (Test-Path $daemonPath)) {
    Write-Error "Could not find zero-daemon.exe in debug or release target directories. Please run 'cargo build' first."
    exit 1
}

$taskName = "ZeroDaemonWatchdog"
$description = "Watchdog and auto-start service for Zero STT Daemon"

Write-Host "Registering Zero Daemon Watchdog..." -ForegroundColor Cyan
Write-Host "Executable Path: $daemonPath" -ForegroundColor Gray

# 1. Define Action (run the daemon)
$action = New-ScheduledTaskAction -Execute $daemonPath -WorkingDirectory (Split-Path $daemonPath)

# 2. Define Trigger (at user logon)
$trigger = New-ScheduledTaskTrigger -AtLogon

# 3. Define Settings (restart if failed, keep running)
# Restart on failure: restart 3 times, wait 1 minute between restarts
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# 4. Register Scheduled Task
try {
    Register-ScheduledTask -TaskName $taskName -Description $description -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction Stop
    Write-Host "Watchdog task '$taskName' successfully registered in Windows Task Scheduler." -ForegroundColor Green
    Write-Host "The daemon will start automatically on next logon, or you can start it now by running:" -ForegroundColor Gray
    Write-Host "Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Yellow
} catch {
    Write-Error "Failed to register scheduled task. Ensure you are running PowerShell as Administrator. Error: $_"
}
