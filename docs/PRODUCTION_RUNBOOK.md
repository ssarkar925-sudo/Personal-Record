# Personal Ledger — Production Operations & Daily Use Runbook

A complete guide for daily use, multi-device local synchronization, automated Google Drive cloud backups, production autostart, and database maintenance.

---

## 1. Daily Financial Accounting Workflow

### Daily Routine (5 Minutes)
1. **Open the App**: Double-click the **Personal Ledger** desktop shortcut on your Windows desktop (or open `http://127.0.0.1:4173/`).
2. **Review the Executive Dashboard**:
   - Check **Total Net Worth** trajectory and **Monthly Cash Flow** surplus.
   - Review the **Financial Command Radar & Action Queue** for any urgent bills or dues due in the next 7 days.
3. **Record Daily Spends**:
   - Press **`Ctrl+Q`** (or click **+ Quick Add** in the top header) to open the Quick Add modal.
   - Enter amount, choose account (e.g. HDFC Salary Bank, ICICI Credit Card), select Category and Scope (`Personal`, `Business`, or `Family`).
   - Attach a receipt screenshot or photo if available (auto-OCR powered by Tesseract).
4. **Credit Card Bill Cycle Monitoring**:
   - In **Money & Cards**, look at the **Credit Cards** tab.
   - Check the visual timeline: `Statement Day ──► Grace Window ──► Due Date`.
   - Track **Billed Statement Due** vs. **Unbilled Spend** to prevent late payment charges and optimize your CIBIL credit score (keeping utilization <30%).
5. **People Khatabook & Udhar**:
   - In **Loans & Dues**, monitor money you owe vs. money owed to you.
   - Click the green **WhatsApp Nudge** icon next to any borrower to instantly generate a polite WhatsApp payment reminder with pre-filled payment details.

---

## 2. Multi-Device Local Sync (Zero Cloud Exposure)

Your Personal Ledger uses an encrypted, local-first SQLite sync engine that synchronizes your phone, tablet, and laptop over your home Wi-Fi network without sending financial data to third-party servers.

### Step-by-Step Device Pairing:
1. **On your Primary Computer (Laptop/Desktop)**:
   - Ensure the server is running (`http://127.0.0.1:4173/`).
   - Click the **Wi-Fi icon** in the top navigation bar to open the **Local Wi-Fi Encrypted Sync** modal.
   - Note the displayed local IP address (e.g., `http://192.168.0.236:4173`) and the 12-character **One-Time Pairing Code** (e.g., `2A0B3BC82242`).
2. **On your Secondary Device (Phone/Tablet/Second Laptop)**:
   - Connect to the same home Wi-Fi network.
   - Open your browser and navigate to `http://192.168.0.236:4173` (replace with your primary computer's IP).
   - The entire application loads instantly on your phone in responsive mobile layout.
   - Click the **Wi-Fi icon** in the header.
   - Enter your primary computer's IP and pairing code, then tap **Pull & Merge Peer Ledger**.
3. **Offline PWA Usage**:
   - In Chrome or Safari on your phone, tap **Add to Home Screen** / **Install App**.
   - The app runs offline as a standalone native app icon with local service worker caching.

---

## 3. Automated Google Drive Cloud Backups

Protect your financial records with daily automated encrypted snapshots synced directly to your Google Drive or OneDrive.

### Method A: In-App Automatic Backup (Zero-Code)
1. In the app header, click the **Settings / Alerts Bell** icon.
2. Under **Automated Local Backups**:
   - Toggle **Enable Daily Auto-Backup** to `ON`.
   - Set **Backup Directory** to your Google Drive for Desktop sync path:
     - Windows Google Drive: `G:\My Drive\PersonalLedgerBackups`
     - Windows OneDrive: `C:\Users\PC\OneDrive\PersonalLedgerBackups`
3. Click **Save Settings**. Every day at midnight or during your morning session, the ledger writes an auto-snapshot and retains the last 14 versions automatically.

### Method B: Automated Scheduled Script (Task Scheduler)
We have provided an automated PowerShell sync script: [scripts/sync-gdrive.ps1](file:///C:/Users/PC/.gemini/antigravity/scratch/personal-ledger/scripts/sync-gdrive.ps1).

1. **Manual / CLI Execution**:
   ```bash
   npm run backup:gdrive
   ```
   - Automatically flushes SQLite WAL memory into disk.
   - Runs `PRAGMA integrity_check`.
   - Copies timestamped `.sqlite` database to your Google Drive / OneDrive folder.
   - Prunes cloud backups older than 14 days.

2. **Schedule Daily at 2:00 AM (Windows Task Scheduler)**:
   Run this in PowerShell as Administrator:
   ```powershell
   $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\scripts\sync-gdrive.ps1"
   $Trigger = New-ScheduledTaskTrigger -Daily -At 2am
   Register-ScheduledTask -TaskName "PersonalLedgerGoogleDriveBackup" -Action $Action -Trigger $Trigger -Description "Daily Google Drive backup for Personal Ledger." -Force
   ```

---

## 4. Production-Grade Readiness & Autostart

### 1. Windows Logon Autostart
To ensure the ledger server boots automatically whenever you turn on or wake your PC:
Run the included autostart script in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\PC\.gemini\antigravity\scratch\personal-ledger\scripts\install-autostart.ps1
```
This registers a background scheduled task `PersonalLedgerAutoWakeup` that silently starts the backend daemon on Windows logon.

### 2. Desktop Shortcut & Silent Launchers
- **Desktop Shortcut**: Located directly at `C:\Users\PC\Desktop\Personal Ledger.lnk`. Double-clicking launches the app in a clean, dedicated window (no address bar).
- **Silent Background Launcher**: Double-click [start-ledger.vbs](file:///C:/Users/PC/.gemini/antigravity/scratch/personal-ledger/start-ledger.vbs) to boot the service without any black command prompt window.

---

## 5. Frontend, Backend & Database Maintenance

### Database Storage Architecture
- Primary Database: `data/personal-ledger.sqlite`
- WAL Log: `data/personal-ledger.sqlite-wal`
- Shared Memory: `data/personal-ledger.sqlite-shm`
- Local Snapshots: `data/backups/`

### Maintenance Commands
| Command | Purpose |
| :--- | :--- |
| `npm run db:backup` | Checkpoints WAL, runs integrity check, and saves a snapshot in `data/backups/`. |
| `npm run backup:gdrive` | Checkpoints WAL, verifies integrity, and syncs to Google Drive / OneDrive. |
| `npm run db:reset:clean` | Takes a safety snapshot, wipes demo data, and leaves a pristine production database ready for real entries. |
| `npm run db:reset:seed` | Restores realistic demonstration data for testing. |
| `npm run typecheck` | Verifies TypeScript compiler types across frontend and backend. |
| `npm run test:all` | Executes all 45 automated unit, integration, stress, and security tests. |
| `npm run build` | Builds the production Vite frontend bundle. |

### Routine Health Checks
1. **Integrity Check**:
   SQLite runs in WAL mode (`PRAGMA journal_mode = WAL;`) for maximum concurrency and zero database locks. Running `npm run db:backup` truncates the WAL file and executes `PRAGMA integrity_check;`.
2. **Database Compaction (Vacuum)**:
   Over years of use, running `npm run db:reset:clean` or `VACUUM` defragments the database file to keep it under a few megabytes.
3. **Port Conflict Resolution**:
   If port 4173 is occupied, check the process with:
   ```powershell
   Get-NetTCPConnection -LocalPort 4173
   ```
   Or set a custom port before starting:
   ```bash
   PORT=5000 npm run start:prod
   ```

---

*Authored by Senior Systems & DevOps Lead · Personal Ledger v2.0-workstation*
