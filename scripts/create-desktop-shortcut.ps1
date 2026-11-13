$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "Personal Ledger.lnk"
$TargetDir = Split-Path -Parent $PSScriptRoot
$TargetScript = Join-Path $TargetDir "scripts\launch-desktop.vbs"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$TargetScript`""
$Shortcut.WorkingDirectory = $TargetDir
$Shortcut.Description = "Personal Ledger - Money, Notes & Vault"
$Shortcut.WindowStyle = 1

# If public icon exists, use it
$IconPath = Join-Path $TargetDir "public\icon-192.svg"
if (Test-Path $IconPath) {
    # Default to shell icon if SVG cannot be icon directly
    $Shortcut.IconLocation = "shell32.dll,220" # Nice ledger/vault icon
}

$Shortcut.Save()
Write-Host "Created Desktop Shortcut at $ShortcutPath"
