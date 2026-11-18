import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../db/schema.ts';

export interface PairingTokenInfo {
  token: string;
  expiresAt: number;
}

const activeTokens = new Map<string, number>();

export function getLocalNetworkIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips.length > 0 ? ips : ['127.0.0.1'];
}

export function generatePairingToken(ttlMs = 10 * 60 * 1000): PairingTokenInfo {
  const now = Date.now();
  for (const [k, exp] of activeTokens.entries()) {
    if (now > exp) activeTokens.delete(k);
  }
  const token = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-char token
  const expiresAt = now + ttlMs;
  activeTokens.set(token, expiresAt);
  return { token, expiresAt };
}

export function validatePairingToken(token: string): boolean {
  if (typeof token !== 'string' || token.length === 0 || token.length > 64) return false;
  const now = Date.now();
  const normalized = token.trim().toUpperCase();
  const inputBuf = Buffer.from(normalized, 'utf-8');
  let matchedKey: string | null = null;

  for (const [stored, exp] of activeTokens.entries()) {
    if (now > exp) {
      activeTokens.delete(stored);
      continue;
    }
    const storedBuf = Buffer.from(stored, 'utf-8');
    if (storedBuf.length === inputBuf.length && crypto.timingSafeEqual(storedBuf, inputBuf)) {
      matchedKey = stored;
    }
  }
  return matchedKey !== null;
}

const ALLOWED_SYNC_TABLES = new Set<string>([
  'accounts',
  'transactions',
  'recurring_bills',
  'loans',
  'people_dues',
  'notes',
  'note_checklist_items',
  'savings_goals',
  'investments',
]);

const MAX_SYNC_ROWS_PER_TABLE = 10_000;

function getAllowedTableColumns(db: DatabaseSync, table: string): Set<string> {
  if (!ALLOWED_SYNC_TABLES.has(table)) return new Set();
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as unknown as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

export interface DifferentialSyncPayload {
  version: number;
  timestamp: string;
  tables: {
    accounts: any[];
    transactions: any[];
    recurring_bills: any[];
    loans: any[];
    people_dues: any[];
    notes: any[];
    note_checklist_items: any[];
    savings_goals: any[];
    investments: any[];
  };
}

export function exportDifferentialSync(db: DatabaseSync, sinceIso?: string): DifferentialSyncPayload {
  const safeQuery = (query: string, params: any[] = []) => {
    try {
      return db.prepare(query).all(...params);
    } catch {
      return [];
    }
  };

  const currentTimestamp = new Date().toISOString();
  const filter = sinceIso ? 'WHERE created_at >= ?' : '';
  const filterParams = sinceIso ? [sinceIso] : [];

  return {
    version: 1,
    timestamp: currentTimestamp,
    tables: {
      accounts: safeQuery(`SELECT * FROM accounts ${filter}`, filterParams),
      transactions: safeQuery(`SELECT * FROM transactions ${filter}`, filterParams),
      recurring_bills: safeQuery(`SELECT * FROM recurring_bills ${filter}`, filterParams),
      loans: safeQuery(`SELECT * FROM loans ${filter}`, filterParams),
      people_dues: safeQuery(`SELECT * FROM people_dues ${filter}`, filterParams),
      notes: safeQuery(`SELECT * FROM notes ${filter}`, filterParams),
      note_checklist_items: safeQuery(`SELECT * FROM note_checklist_items`),
      savings_goals: safeQuery(`SELECT * FROM savings_goals ${filter}`, filterParams),
      investments: safeQuery(`SELECT * FROM investments ${filter}`, filterParams),
    },
  };
}

export function ingestDifferentialSync(
  db: DatabaseSync,
  payload: DifferentialSyncPayload
): { ok: boolean; importedCounts: Record<string, number> } {
  if (!payload || typeof payload !== 'object' || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error('Invalid sync payload format');
  }

  const importedCounts: Record<string, number> = {};

  withTransaction(db, () => {
    for (const [table, rows] of Object.entries(payload.tables)) {
      if (!ALLOWED_SYNC_TABLES.has(table)) {
        throw new Error(`Sync rejected: disallowed table "${table}"`);
      }
      if (!Array.isArray(rows) || rows.length === 0) continue;
      if (rows.length > MAX_SYNC_ROWS_PER_TABLE) {
        throw new Error(`Sync rejected: table "${table}" exceeds row limit`);
      }

      const validColumns = getAllowedTableColumns(db, table);
      let count = 0;

      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const columns = Object.keys(row).filter((col) => validColumns.has(col));
        if (columns.length === 0) continue;

        const quotedCols = columns.map((col) => `"${col}"`).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((col) => {
          const val = (row as Record<string, unknown>)[col];
          return val === undefined ? null : val;
        });

        const sql = `INSERT OR REPLACE INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;
        try {
          db.prepare(sql).run(...(values as Array<string | number | null | Uint8Array>));
          count++;
        } catch (err) {
          console.error(`[LAN Sync Ingest Error in ${table}]`, err);
        }
      }
      importedCounts[table] = count;
    }
  });

  return { ok: true, importedCounts };
}
