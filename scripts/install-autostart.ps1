$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TaskName = "PersonalLedgerAutoWakeup"
$NodeExe = (Get-Command node).Source
$Args = "--experimental-strip-types `"$ProjectRoot\server\index.ts`""

$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument $Args -WorkingDirectory $ProjectRoot
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $TriggerLogon -Settings $Settings -Description "Keeps Personal Ledger & WhatsApp Alert Bridge running locally on login/wake." -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName'. Background server + WhatsApp alerts will start automatically on Windows logon/wake at http://127.0.0.1:4173"
