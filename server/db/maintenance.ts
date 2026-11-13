import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export interface DatabaseHealthResult {
  ok: boolean;
  integrity: string;
  foreignKeysOk: boolean;
  tablesCount: number;
  error?: string;
}

export interface MaintenanceOptimizeResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface BackupVerificationResult {
  ok: boolean;
  integrity?: string;
  error?: string;
}

export function checkDatabaseHealth(db: DatabaseSync): DatabaseHealthResult {
  try {
    const integrityRow = db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string } | undefined;
    const integrity = Object.values(integrityRow || {})[0] || 'unknown';

    const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
    const foreignKeysOk = fkViolations.length === 0;

    const tablesRow = db
      .prepare("SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';")
      .get() as { count: number } | undefined;
    const tablesCount = tablesRow?.count ?? 0;

    const isHealthy = integrity === 'ok' && foreignKeysOk;
    return {
      ok: isHealthy,
      integrity: String(integrity),
      foreignKeysOk,
      tablesCount,
      error: isHealthy ? undefined : `Integrity: ${integrity}, FK violations: ${fkViolations.length}`,
    };
  } catch (err) {
    return {
      ok: false,
      integrity: 'error',
      foreignKeysOk: false,
      tablesCount: 0,
      error: (err as Error).message,
    };
  }
}

export function checkpointAndOptimize(db: DatabaseSync): MaintenanceOptimizeResult {
  const start = performance.now();
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec('PRAGMA optimize;');
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return { ok: true, durationMs };
  } catch (err) {
    return {
      ok: false,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      error: (err as Error).message,
    };
  }
}

export function verifyBackupIntegrity(backupDbPath: string): BackupVerificationResult {
  try {
    if (!fs.existsSync(backupDbPath)) {
      return { ok: false, error: `Backup file does not exist at ${backupDbPath}` };
    }
    const testDb = new DatabaseSync(backupDbPath);
    try {
      const integrityRow = testDb.prepare('PRAGMA integrity_check;').get() as Record<string, unknown> | undefined;
      const integrity = String(Object.values(integrityRow || {})[0] || 'unknown');
      testDb.close();
      if (integrity === 'ok') {
        return { ok: true, integrity: 'ok' };
      }
      return { ok: false, integrity, error: `Backup file integrity check failed: ${integrity}` };
    } catch (err) {
      try { testDb.close(); } catch {}
      return { ok: false, error: (err as Error).message };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
