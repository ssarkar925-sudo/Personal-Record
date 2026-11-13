import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, withTransaction } from '../server/db/schema.ts';
import { seedFinancialData } from '../server/db/seed.ts';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = process.env.LEDGER_DB_PATH || path.join(dataDir, 'personal-ledger.sqlite');
const backupsDir = path.join(dataDir, 'backups');

const mode = process.argv[2] || 'clean'; // 'clean' or 'seed'

console.log(`[Ledger Reset] Mode: ${mode.toUpperCase()} on ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log(`[Ledger Reset] Database does not exist yet. Initializing new database...`);
} else {
  // Always take a safety snapshot before any reset operation
  fs.mkdirSync(backupsDir, { recursive: true });
  const backupFile = path.join(backupsDir, `pre-reset-backup-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, backupFile);
  console.log(`[Ledger Reset] Safety backup created: ${path.basename(backupFile)}`);
}

const db = openDatabase(dbPath);

withTransaction(db, () => {
  console.log(`[Ledger Reset] Clearing ledger activity and records...`);

  // Clear transactional tables
  db.exec(`
    DELETE FROM receipt_attachments;
    DELETE FROM note_attachments;
    DELETE FROM savings_contributions;
    DELETE FROM savings_goals;
    DELETE FROM investment_dividends;
    DELETE FROM investments;
    DELETE FROM category_budgets;
    DELETE FROM scope_budgets;
    DELETE FROM person_due_settlements;
    DELETE FROM people_dues;
    DELETE FROM loan_payments;
    DELETE FROM loans;
    DELETE FROM recurring_bills;
    DELETE FROM transactions;
    DELETE FROM notes;
    DELETE FROM category_rules;
    DELETE FROM accounts;
  `);

  if (mode === 'seed') {
    console.log(`[Ledger Reset] Seeding comprehensive realistic dataset...`);
    const summary = seedFinancialData(db);
    console.log(`[Ledger Reset] Seed complete:`, summary);
  } else {
    console.log(`[Ledger Reset] Clean slate achieved. Zero transactions, accounts, or dues.`);
  }

  // Vacuum & WAL checkpoint
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('VACUUM;');
});

console.log(`[Ledger Reset] Done! Database is optimized and ready.`);
