import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db);
  migrateSchema(db);
  createIndexes(db);
  return db;
}

function createIndexes(db: DatabaseSync): void {
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_query ON transactions(occurred_at DESC, account_id, scope);
      CREATE INDEX IF NOT EXISTS idx_notes_filter ON notes(archived, pinned DESC, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vault_lookup ON vault_entries(category, label);
      CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(direction, remaining_minor);
      CREATE INDEX IF NOT EXISTS idx_people_dues_status ON people_dues(status, person_name);
    `);
  } catch {}
}

function migrateSchema(db: DatabaseSync): void {
  const noteCols = (db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!noteCols.includes('color')) {
    db.exec("ALTER TABLE notes ADD COLUMN color TEXT NOT NULL DEFAULT 'default';");
  }
  if (!noteCols.includes('archived')) {
    db.exec('ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;');
  }

  const recCols = (db.prepare('PRAGMA table_info(recurring_bills)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!recCols.includes('auto_post')) {
    db.exec('ALTER TABLE recurring_bills ADD COLUMN auto_post INTEGER NOT NULL DEFAULT 0;');
  }

  const prefCols = (db.prepare('PRAGMA table_info(app_preferences)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!prefCols.includes('app_pin_hash')) {
    db.exec("ALTER TABLE app_preferences ADD COLUMN app_pin_hash TEXT NOT NULL DEFAULT '';");
  }
  if (!prefCols.includes('auto_lock_minutes')) {
    db.exec('ALTER TABLE app_preferences ADD COLUMN auto_lock_minutes INTEGER NOT NULL DEFAULT 0;');
  }
  if (!prefCols.includes('auto_backup_enabled')) {
    db.exec('ALTER TABLE app_preferences ADD COLUMN auto_backup_enabled INTEGER NOT NULL DEFAULT 0;');
  }
  if (!prefCols.includes('auto_backup_dir')) {
    db.exec("ALTER TABLE app_preferences ADD COLUMN auto_backup_dir TEXT NOT NULL DEFAULT '';");
  }
  if (!prefCols.includes('last_auto_backup_date')) {
    db.exec("ALTER TABLE app_preferences ADD COLUMN last_auto_backup_date TEXT NOT NULL DEFAULT '';");
  }

  const accCols = (db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!accCols.includes('account_group')) {
    db.exec("ALTER TABLE accounts ADD COLUMN account_group TEXT NOT NULL DEFAULT 'bank';");
    db.exec("UPDATE accounts SET account_group = 'credit_card' WHERE type = 'credit_card';");
  }
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors if transaction was already aborted
    }
    throw err;
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'credit_card')),
      account_group TEXT NOT NULL DEFAULT 'bank',
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      institution TEXT NOT NULL DEFAULT '',
      last4 TEXT NOT NULL DEFAULT '',
      opening_balance_minor INTEGER NOT NULL DEFAULT 0,
      min_balance_minor INTEGER NOT NULL DEFAULT 0,
      credit_limit_minor INTEGER NOT NULL DEFAULT 0,
      statement_day INTEGER NOT NULL DEFAULT 15,
      due_day INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('income', 'expense', 'transfer')),
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      to_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
      category TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      occurred_at TEXT NOT NULL,
      party TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      source_ref TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_to_account ON transactions(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_tx_scope ON transactions(scope);

    CREATE TABLE IF NOT EXISTS recurring_bills (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      kind TEXT NOT NULL CHECK(kind IN ('expense', 'income')),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      due_day INTEGER NOT NULL,
      last_paid_month TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      auto_post INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scope_budgets (
      scope TEXT PRIMARY KEY CHECK(scope IN ('personal', 'business', 'family')),
      monthly_limit_minor INTEGER NOT NULL CHECK(monthly_limit_minor > 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_budgets (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      category TEXT NOT NULL,
      monthly_limit_minor INTEGER NOT NULL CHECK(monthly_limit_minor > 0),
      updated_at TEXT NOT NULL,
      UNIQUE(scope, category)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      counterparty TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      direction TEXT NOT NULL CHECK(direction IN ('borrowed', 'lent')),
      principal_minor INTEGER NOT NULL CHECK(principal_minor > 0),
      remaining_minor INTEGER NOT NULL CHECK(remaining_minor >= 0),
      annual_rate_bps INTEGER NOT NULL DEFAULT 0,
      tenure_months INTEGER NOT NULL DEFAULT 12,
      emi_minor INTEGER NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      linked_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'closed')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_payments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      principal_minor INTEGER NOT NULL,
      interest_minor INTEGER NOT NULL,
      paid_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people_dues (
      id TEXT PRIMARY KEY,
      person_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL CHECK(direction IN ('give', 'need')),
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      settled_minor INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('open', 'partial', 'settled')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS due_settlements (
      id TEXT PRIMARY KEY,
      due_id TEXT NOT NULL REFERENCES people_dues(id) ON DELETE CASCADE,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      settled_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL CHECK(scope IN ('general', 'personal', 'business', 'family')),
      color TEXT NOT NULL DEFAULT 'default',
      tags_json TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      remind_at TEXT,
      linked_tx_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      linked_due_id TEXT REFERENCES people_dues(id) ON DELETE SET NULL,
      linked_loan_id TEXT REFERENCES loans(id) ON DELETE SET NULL,
      linked_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_checklist_items (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS note_attachments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_note_att_note ON note_attachments(note_id);

    CREATE TABLE IF NOT EXISTS vault_meta (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      salt_b64 TEXT NOT NULL,
      canary_iv TEXT NOT NULL,
      canary_ct TEXT NOT NULL,
      recovery_salt_b64 TEXT,
      recovery_iv TEXT,
      recovery_ct TEXT,
      wa_recovery_key TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_entries (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      last_rotated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_security_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      detail TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_deliveries (
      id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'urgent')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('in_app', 'whatsapp')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'read')),
      error_text TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_preferences (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      system_language TEXT NOT NULL DEFAULT 'en' CHECK(system_language IN ('en', 'hi', 'bn')),
      agent_auto_execute INTEGER NOT NULL DEFAULT 1,
      llm_provider TEXT NOT NULL DEFAULT 'local',
      llm_api_key TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT '',
      app_pin_hash TEXT NOT NULL DEFAULT '',
      auto_lock_minutes INTEGER NOT NULL DEFAULT 0,
      auto_backup_enabled INTEGER NOT NULL DEFAULT 0,
      auto_backup_dir TEXT NOT NULL DEFAULT '',
      last_auto_backup_date TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_history (
      id TEXT PRIMARY KEY,
      command_text TEXT NOT NULL,
      detected_language TEXT NOT NULL,
      system_language TEXT NOT NULL,
      intent TEXT NOT NULL,
      reply_text TEXT NOT NULL,
      actions_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('goal', 'emergency', 'tax_reserve')),
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      target_minor INTEGER NOT NULL CHECK(target_minor > 0),
      current_minor INTEGER NOT NULL DEFAULT 0 CHECK(current_minor >= 0),
      target_date TEXT,
      linked_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('mutual_fund', 'stock', 'fd', 'ppf', 'gold', 'property', 'other')),
      scope TEXT NOT NULL CHECK(scope IN ('personal', 'business', 'family')),
      invested_minor INTEGER NOT NULL CHECK(invested_minor >= 0),
      current_value_minor INTEGER NOT NULL CHECK(current_value_minor >= 0),
      units_qty REAL NOT NULL DEFAULT 0,
      maturity_date TEXT,
      sip_day INTEGER,
      sip_amount_minor INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_rules (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      match_type TEXT NOT NULL CHECK(match_type IN ('contains', 'exact')) DEFAULT 'contains',
      category TEXT NOT NULL,
      scope TEXT,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      kind TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_attachments (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Safe migrations for upgraded notes columns
  try { db.exec(`ALTER TABLE notes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN linked_tx_id TEXT REFERENCES transactions(id) ON DELETE SET NULL`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN linked_due_id TEXT REFERENCES people_dues(id) ON DELETE SET NULL`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN linked_loan_id TEXT REFERENCES loans(id) ON DELETE SET NULL`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN linked_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL`); } catch {}
  try { db.exec(`ALTER TABLE notes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0`); } catch {}

  // Safe migrations for vault emergency recovery escrow
  try { db.exec(`ALTER TABLE vault_meta ADD COLUMN recovery_salt_b64 TEXT`); } catch {}
  try { db.exec(`ALTER TABLE vault_meta ADD COLUMN recovery_iv TEXT`); } catch {}
  try { db.exec(`ALTER TABLE vault_meta ADD COLUMN recovery_ct TEXT`); } catch {}
  try { db.exec(`ALTER TABLE vault_meta ADD COLUMN wa_recovery_key TEXT`); } catch {}
}
