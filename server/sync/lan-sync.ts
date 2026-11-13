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
  const token = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-char token
  const expiresAt = Date.now() + ttlMs;
  activeTokens.set(token, expiresAt);
  return { token, expiresAt };
}

export function validatePairingToken(token: string): boolean {
  const exp = activeTokens.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    activeTokens.delete(token);
    return false;
  }
  return true;
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
  const importedCounts: Record<string, number> = {};

  withTransaction(db, () => {
    for (const [table, rows] of Object.entries(payload.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      let count = 0;

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((col) => row[col]);

        const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        try {
          db.prepare(sql).run(...values);
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
