import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { withTransaction } from './schema.ts';

export interface VaultMetaRecord {
  saltB64: string;
  canaryIv: string;
  canaryCt: string;
  recoverySaltB64?: string | null;
  recoveryIv?: string | null;
  recoveryCt?: string | null;
  waRecoveryKey?: string | null;
  updatedAt: string;
}

export interface VaultEntryCipherRecord {
  id: string;
  label: string;
  category: string;
  iv: string;
  ciphertext: string;
  lastRotatedAt: string;
  updatedAt: string;
}

export function getVaultMeta(db: DatabaseSync): VaultMetaRecord | null {
  const row = db
    .prepare(
      'SELECT salt_b64, canary_iv, canary_ct, recovery_salt_b64, recovery_iv, recovery_ct, wa_recovery_key, updated_at FROM vault_meta WHERE id = 1',
    )
    .get() as
    | {
        salt_b64: string;
        canary_iv: string;
        canary_ct: string;
        recovery_salt_b64: string | null;
        recovery_iv: string | null;
        recovery_ct: string | null;
        wa_recovery_key: string | null;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    saltB64: row.salt_b64,
    canaryIv: row.canary_iv,
    canaryCt: row.canary_ct,
    recoverySaltB64: row.recovery_salt_b64 ?? null,
    recoveryIv: row.recovery_iv ?? null,
    recoveryCt: row.recovery_ct ?? null,
    waRecoveryKey: row.wa_recovery_key ?? null,
    updatedAt: row.updated_at,
  };
}

export function setVaultMeta(
  db: DatabaseSync,
  input: {
    saltB64: string;
    canaryIv: string;
    canaryCt: string;
    recoverySaltB64?: string | null;
    recoveryIv?: string | null;
    recoveryCt?: string | null;
    waRecoveryKey?: string | null;
  },
): VaultMetaRecord {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vault_meta (id, salt_b64, canary_iv, canary_ct, recovery_salt_b64, recovery_iv, recovery_ct, wa_recovery_key, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      salt_b64 = excluded.salt_b64,
      canary_iv = excluded.canary_iv,
      canary_ct = excluded.canary_ct,
      recovery_salt_b64 = COALESCE(excluded.recovery_salt_b64, vault_meta.recovery_salt_b64),
      recovery_iv = COALESCE(excluded.recovery_iv, vault_meta.recovery_iv),
      recovery_ct = COALESCE(excluded.recovery_ct, vault_meta.recovery_ct),
      wa_recovery_key = COALESCE(excluded.wa_recovery_key, vault_meta.wa_recovery_key),
      updated_at = excluded.updated_at
  `).run(
    input.saltB64,
    input.canaryIv,
    input.canaryCt,
    input.recoverySaltB64 ?? null,
    input.recoveryIv ?? null,
    input.recoveryCt ?? null,
    input.waRecoveryKey ?? null,
    now,
  );
  return getVaultMeta(db)!;
}

export function saveVaultRecoveryMeta(
  db: DatabaseSync,
  input: {
    recoverySaltB64: string;
    recoveryIv: string;
    recoveryCt: string;
    waRecoveryKey?: string | null;
  },
): VaultMetaRecord {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE vault_meta
    SET recovery_salt_b64 = ?, recovery_iv = ?, recovery_ct = ?, wa_recovery_key = COALESCE(?, wa_recovery_key), updated_at = ?
    WHERE id = 1
  `).run(input.recoverySaltB64, input.recoveryIv, input.recoveryCt, input.waRecoveryKey ?? null, now);
  return getVaultMeta(db)!;
}

export function listVaultEntries(db: DatabaseSync): VaultEntryCipherRecord[] {
  const rows = db
    .prepare('SELECT * FROM vault_entries ORDER BY category ASC, label ASC')
    .all() as unknown as Array<{
      id: string;
      label: string;
      category: string;
      iv: string;
      ciphertext: string;
      last_rotated_at: string;
      updated_at: string;
    }>;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    iv: r.iv,
    ciphertext: r.ciphertext,
    lastRotatedAt: r.last_rotated_at,
    updatedAt: r.updated_at,
  }));
}

export function upsertVaultEntry(
  db: DatabaseSync,
  input: {
    id?: string;
    label: string;
    category: string;
    iv: string;
    ciphertext: string;
    lastRotatedAt: string;
  },
): VaultEntryCipherRecord {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vault_entries (id, label, category, iv, ciphertext, last_rotated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      category = excluded.category,
      iv = excluded.iv,
      ciphertext = excluded.ciphertext,
      last_rotated_at = excluded.last_rotated_at,
      updated_at = excluded.updated_at
  `).run(id, input.label, input.category, input.iv, input.ciphertext, input.lastRotatedAt, now);
  return listVaultEntries(db).find((e) => e.id === id)!;
}

export function deleteVaultEntry(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM vault_entries WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function rekeyVaultEntries(
  db: DatabaseSync,
  input: {
    saltB64: string;
    canaryIv: string;
    canaryCt: string;
    recoverySaltB64?: string | null;
    recoveryIv?: string | null;
    recoveryCt?: string | null;
    waRecoveryKey?: string | null;
    entries: Array<{
      id: string;
      label: string;
      category: string;
      iv: string;
      ciphertext: string;
      lastRotatedAt: string;
    }>;
  },
): VaultMetaRecord {
  return withTransaction(db, () => {
    const existingCount = (db.prepare('SELECT COUNT(*) AS c FROM vault_entries').get() as { c: number }).c;
    if (input.entries.length < existingCount) {
      throw new Error('Rekey must include all existing vault entries');
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO vault_meta (id, salt_b64, canary_iv, canary_ct, recovery_salt_b64, recovery_iv, recovery_ct, wa_recovery_key, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        salt_b64 = excluded.salt_b64,
        canary_iv = excluded.canary_iv,
        canary_ct = excluded.canary_ct,
        recovery_salt_b64 = COALESCE(excluded.recovery_salt_b64, vault_meta.recovery_salt_b64),
        recovery_iv = COALESCE(excluded.recovery_iv, vault_meta.recovery_iv),
        recovery_ct = COALESCE(excluded.recovery_ct, vault_meta.recovery_ct),
        wa_recovery_key = COALESCE(excluded.wa_recovery_key, vault_meta.wa_recovery_key),
        updated_at = excluded.updated_at
    `).run(
      input.saltB64,
      input.canaryIv,
      input.canaryCt,
      input.recoverySaltB64 ?? null,
      input.recoveryIv ?? null,
      input.recoveryCt ?? null,
      input.waRecoveryKey ?? null,
      now,
    );

    const updateStmt = db.prepare(`
      UPDATE vault_entries
      SET iv = ?, ciphertext = ?, last_rotated_at = ?, updated_at = ?
      WHERE id = ?
    `);
    for (const e of input.entries) {
      updateStmt.run(e.iv, e.ciphertext, e.lastRotatedAt, now, e.id);
    }

    db.prepare(`
      INSERT INTO vault_security_events (id, event_type, detail, occurred_at)
      VALUES (?, 'vault_initialized', 'Master password changed', ?)
    `).run(crypto.randomUUID(), now);

    return getVaultMeta(db)!;
  });
}

// Records ONLY non-secret security hygiene events (e.g. failed_unlock)
export function recordVaultSecurityEvent(
  db: DatabaseSync,
  eventType: 'failed_unlock' | 'vault_unlocked' | 'vault_initialized',
  detail: string,
): void {
  db.prepare(`
    INSERT INTO vault_security_events (id, event_type, detail, occurred_at)
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), eventType, detail, new Date().toISOString());
}

export function countRecentFailedUnlocks(db: DatabaseSync, withinMinutes: number = 15): number {
  const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM vault_security_events WHERE event_type = 'failed_unlock' AND occurred_at >= ?`,
    )
    .get(cutoff) as unknown as { c: number };
  return row.c;
}
