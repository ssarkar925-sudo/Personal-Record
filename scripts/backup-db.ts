import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = process.env.LEDGER_DB_PATH || path.join(dataDir, 'personal-ledger.sqlite');
const backupsDir = path.join(dataDir, 'backups');

fs.mkdirSync(backupsDir, { recursive: true });

console.log(`[Backup Engine] Connecting to database: ${dbPath}`);
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

// Step 1: Checkpoint WAL to flush all active transactions into the main sqlite file
console.log(`[Backup Engine] Truncating WAL log into primary database...`);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

// Step 2: Integrity check
console.log(`[Backup Engine] Verifying database integrity...`);
const integrityRows = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check?: string }>;
const status = integrityRows[0]?.integrity_check ?? 'ok';
if (status !== 'ok') {
  console.error(`[Backup Engine] Integrity check failed: ${status}`);
  process.exit(1);
}
console.log(`[Backup Engine] Integrity check: OK!`);

// Step 3: Create timestamped backup
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupFilename = `ledger-backup-${timestamp}.sqlite`;
const backupPath = path.join(backupsDir, backupFilename);

fs.copyFileSync(dbPath, backupPath);
const stats = fs.statSync(backupPath);
console.log(`[Backup Engine] Backup successfully written: ${backupFilename} (${(stats.size / 1024).toFixed(1)} KB)`);

// Step 4: Backup rotation (keep last 7 backups, prune older)
const existingBackups = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith('ledger-backup-') && f.endsWith('.sqlite'))
  .sort();

if (existingBackups.length > 7) {
  const toDelete = existingBackups.slice(0, existingBackups.length - 7);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupsDir, file));
    console.log(`[Backup Engine] Pruned old backup: ${file}`);
  }
}

console.log(`[Backup Engine] Active backups retained: ${Math.min(7, existingBackups.length)}`);
