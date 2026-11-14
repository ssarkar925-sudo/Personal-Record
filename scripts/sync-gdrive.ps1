<#
.SYNOPSIS
  Automated Backup & Google Drive Sync for Personal Ledger
.DESCRIPTION
  1. Truncates WAL and takes an integrity-verified SQLite snapshot.
  2. Copies the backup to your Google Drive / Cloud Sync folder.
  3. Prunes backups older than 14 days.
#>

param(
    [string]$TargetCloudDir = $env:GOOGLE_DRIVE_BACKUP_DIR
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalBackupsDir = Join-Path $ProjectRoot "data\backups"

# Step 1: Run local SQLite backup and WAL checkpoint
Write-Host "[Google Drive Sync] Step 1: Executing WAL checkpoint and taking snapshot..." -ForegroundColor Cyan
Set-Location $ProjectRoot
node --experimental-strip-types scripts/backup-db.ts

# Step 2: Auto-detect Google Drive folder if not explicitly provided
if (-not $TargetCloudDir) {
    $PossiblePaths = @(
        "G:\My Drive\PersonalLedgerBackups",
        "G:\Shared drives\PersonalLedgerBackups",
        "$env:USERPROFILE\Google Drive\PersonalLedgerBackups",
        "$env:USERPROFILE\OneDrive\PersonalLedgerBackups"
    )
    foreach ($p in $PossiblePaths) {
        $parent = Split-Path -Parent $p
        if (Test-Path $parent) {
            $TargetCloudDir = $p
            break
        }
    }
}

if (-not $TargetCloudDir) {
    Write-Host "[Google Drive Sync] Note: Google Drive folder not detected automatically." -ForegroundColor Yellow
    Write-Host "Set environment variable GOOGLE_DRIVE_BACKUP_DIR or pass -TargetCloudDir 'G:\My Drive\PersonalLedgerBackups'" -ForegroundColor Gray
    Write-Host "[Google Drive Sync] Local backup safely stored at: $LocalBackupsDir" -ForegroundColor Green
    exit 0
}

# Step 3: Copy backups to cloud directory
Write-Host "[Google Drive Sync] Target cloud directory: $TargetCloudDir" -ForegroundColor Cyan
if (-not (Test-Path $TargetCloudDir)) {
    New-Item -ItemType Directory -Path $TargetCloudDir -Force | Out-Null
}

$LatestBackup = Get-ChildItem -Path $LocalBackupsDir -Filter "ledger-backup-*.sqlite" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($LatestBackup) {
    $DestPath = Join-Path $TargetCloudDir $LatestBackup.Name
    Copy-Item -Path $LatestBackup.FullName -Destination $DestPath -Force
    Write-Host "[Google Drive Sync] Successfully copied to Google Drive: $DestPath" -ForegroundColor Green

    # Rotate cloud backups (retain last 14)
    $CloudBackups = Get-ChildItem -Path $TargetCloudDir -Filter "ledger-backup-*.sqlite" | Sort-Object LastWriteTime -Descending
    if ($CloudBackups.Count -gt 14) {
        $ToPrune = $CloudBackups | Select-Object -Skip 14
        foreach ($old in $ToPrune) {
            Remove-Item $old.FullName -Force
            Write-Host "[Google Drive Sync] Pruned old cloud backup: $($old.Name)" -ForegroundColor Gray
        }
    }
}
