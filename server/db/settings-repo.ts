import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { APP_LANGUAGES, type AppLanguage } from '../../shared/i18n.ts';

export type AgentProvider = 'local' | 'gemini' | 'openai';

export interface AppPreferences {
  systemLanguage: AppLanguage;
  agentAutoExecute: boolean;
  llmProvider: AgentProvider;
  llmModel: string;
  hasApiKey: boolean;
  hasAppPin: boolean;
  autoLockMinutes: number;
  autoBackupEnabled: boolean;
  autoBackupDir: string;
  lastAutoBackupDate: string;
  updatedAt: string;
}

interface AppPreferencesInternal extends AppPreferences {
  llmApiKey: string;
  appPinHash: string;
}

export interface AgentHistoryRecord {
  id: string;
  commandText: string;
  detectedLanguage: AppLanguage;
  systemLanguage: AppLanguage;
  intent: string;
  replyText: string;
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  createdAt: string;
}

function getRawPreferences(db: DatabaseSync): AppPreferencesInternal {
  const row = db
    .prepare('SELECT * FROM app_preferences WHERE id = 1')
    .get() as unknown as
    | {
        system_language: string;
        agent_auto_execute: number;
        llm_provider: string;
        llm_api_key: string;
        llm_model: string;
        app_pin_hash?: string;
        auto_lock_minutes?: number;
        auto_backup_enabled?: number;
        auto_backup_dir?: string;
        last_auto_backup_date?: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return {
      systemLanguage: 'en',
      agentAutoExecute: true,
      llmProvider: 'local',
      llmApiKey: '',
      llmModel: '',
      hasApiKey: false,
      hasAppPin: false,
      autoLockMinutes: 0,
      autoBackupEnabled: false,
      autoBackupDir: '',
      lastAutoBackupDate: '',
      appPinHash: '',
      updatedAt: new Date().toISOString(),
    };
  }

  const lang = (APP_LANGUAGES as readonly string[]).includes(row.system_language)
    ? (row.system_language as AppLanguage)
    : 'en';
  const provider: AgentProvider =
    row.llm_provider === 'gemini' || row.llm_provider === 'openai' ? row.llm_provider : 'local';

  return {
    systemLanguage: lang,
    agentAutoExecute: row.agent_auto_execute === 1,
    llmProvider: provider,
    llmApiKey: row.llm_api_key || '',
    llmModel: row.llm_model || '',
    hasApiKey: Boolean(row.llm_api_key && row.llm_api_key.trim().length > 0),
    hasAppPin: Boolean(row.app_pin_hash && row.app_pin_hash.length > 0),
    autoLockMinutes: row.auto_lock_minutes ?? 0,
    autoBackupEnabled: (row.auto_backup_enabled ?? 0) === 1,
    autoBackupDir: row.auto_backup_dir || '',
    lastAutoBackupDate: row.last_auto_backup_date || '',
    appPinHash: row.app_pin_hash || '',
    updatedAt: row.updated_at,
  };
}

export function getAppPreferences(db: DatabaseSync): AppPreferences {
  const internal = getRawPreferences(db);
  return {
    systemLanguage: internal.systemLanguage,
    agentAutoExecute: internal.agentAutoExecute,
    llmProvider: internal.llmProvider,
    llmModel: internal.llmModel,
    hasApiKey: internal.hasApiKey,
    hasAppPin: internal.hasAppPin,
    autoLockMinutes: internal.autoLockMinutes,
    autoBackupEnabled: internal.autoBackupEnabled,
    autoBackupDir: internal.autoBackupDir,
    lastAutoBackupDate: internal.lastAutoBackupDate,
    updatedAt: internal.updatedAt,
  };
}

export function getAgentApiKeySecret(db: DatabaseSync): { provider: AgentProvider; apiKey: string; model: string } {
  const internal = getRawPreferences(db);
  return {
    provider: internal.llmProvider,
    apiKey: internal.llmApiKey,
    model: internal.llmModel,
  };
}

export function updateAppPreferences(
  db: DatabaseSync,
  patch: {
    systemLanguage?: AppLanguage;
    agentAutoExecute?: boolean;
    llmProvider?: AgentProvider;
    llmApiKey?: string;
    clearApiKey?: boolean;
    llmModel?: string;
    autoLockMinutes?: number;
    autoBackupEnabled?: boolean;
    autoBackupDir?: string;
    lastAutoBackupDate?: string;
  },
): AppPreferences {
  const current = getRawPreferences(db);
  const nextApiKey = patch.clearApiKey
    ? ''
    : patch.llmApiKey !== undefined && patch.llmApiKey.trim().length > 0
      ? patch.llmApiKey.trim()
      : current.llmApiKey;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_preferences (
      id, system_language, agent_auto_execute, llm_provider, llm_api_key, llm_model,
      app_pin_hash, auto_lock_minutes, auto_backup_enabled, auto_backup_dir, last_auto_backup_date, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      system_language = excluded.system_language,
      agent_auto_execute = excluded.agent_auto_execute,
      llm_provider = excluded.llm_provider,
      llm_api_key = excluded.llm_api_key,
      llm_model = excluded.llm_model,
      auto_lock_minutes = excluded.auto_lock_minutes,
      auto_backup_enabled = excluded.auto_backup_enabled,
      auto_backup_dir = excluded.auto_backup_dir,
      last_auto_backup_date = excluded.last_auto_backup_date,
      updated_at = excluded.updated_at
  `).run(
    patch.systemLanguage ?? current.systemLanguage,
    (patch.agentAutoExecute ?? current.agentAutoExecute) ? 1 : 0,
    patch.llmProvider ?? current.llmProvider,
    nextApiKey,
    patch.llmModel ?? current.llmModel,
    current.appPinHash,
    patch.autoLockMinutes ?? current.autoLockMinutes,
    (patch.autoBackupEnabled ?? current.autoBackupEnabled) ? 1 : 0,
    patch.autoBackupDir !== undefined ? patch.autoBackupDir.trim() : current.autoBackupDir,
    patch.lastAutoBackupDate ?? current.lastAutoBackupDate,
    now,
  );

  return getAppPreferences(db);
}

// App-Level Lock PIN (scrypt-salted hash)
export function hashPin(pin: string, saltHex?: string): string {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyAppPin(db: DatabaseSync, pin: string): boolean {
  const current = getRawPreferences(db);
  if (!current.appPinHash) return true;
  const [salt, expectedHex] = current.appPinHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(pin, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function setAppPin(db: DatabaseSync, pin: string): AppPreferences {
  const clean = pin.trim();
  if (!/^\d{4,8}$/.test(clean)) throw new Error('PIN must be 4 to 8 digits');
  const current = getRawPreferences(db);
  const now = new Date().toISOString();
  const nextHash = hashPin(clean);
  db.prepare(`
    INSERT INTO app_preferences (
      id, system_language, agent_auto_execute, llm_provider, llm_api_key, llm_model,
      app_pin_hash, auto_lock_minutes, auto_backup_enabled, auto_backup_dir, last_auto_backup_date, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      app_pin_hash = excluded.app_pin_hash,
      updated_at = excluded.updated_at
  `).run(
    current.systemLanguage,
    current.agentAutoExecute ? 1 : 0,
    current.llmProvider,
    current.llmApiKey,
    current.llmModel,
    nextHash,
    current.autoLockMinutes || 15,
    current.autoBackupEnabled ? 1 : 0,
    current.autoBackupDir,
    current.lastAutoBackupDate,
    now,
  );
  return getAppPreferences(db);
}

export function clearAppPin(db: DatabaseSync): AppPreferences {
  const now = new Date().toISOString();
  db.prepare("UPDATE app_preferences SET app_pin_hash = '', updated_at = ? WHERE id = 1").run(now);
  return getAppPreferences(db);
}

// Encrypted Backup Envelope (PBKDF2-SHA256 + AES-256-GCM)
export interface EncryptedBackupEnvelope {
  format: 'personal-ledger-encrypted-backup-v1';
  saltB64: string;
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
  exportedAt: string;
}

export function encryptBackupSnapshot(snapshot: unknown, passphrase: string): EncryptedBackupEnvelope {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Backup passphrase must be at least 6 characters');
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(snapshot), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: 'personal-ledger-encrypted-backup-v1',
    saltB64: salt.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
    ciphertextB64: encrypted.toString('base64'),
    exportedAt: new Date().toISOString(),
  };
}

export function decryptBackupSnapshot(rawEnvelope: unknown, passphrase: string): unknown {
  const env = rawEnvelope as Partial<EncryptedBackupEnvelope>;
  if (!env || env.format !== 'personal-ledger-encrypted-backup-v1') {
    throw new Error('Invalid encrypted backup format');
  }
  if (!passphrase) throw new Error('Passphrase is required');
  const salt = Buffer.from(env.saltB64 ?? '', 'base64');
  const iv = Buffer.from(env.ivB64 ?? '', 'base64');
  const tag = Buffer.from(env.tagB64 ?? '', 'base64');
  const ct = Buffer.from(env.ciphertextB64 ?? '', 'base64');
  const key = crypto.pbkdf2Sync(passphrase, salt, 210_000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8');
  return JSON.parse(plaintext);
}

export function writeAutoBackupFile(
  targetDir: string,
  todayStr: string,
  payload: unknown,
  keepCount: number = 14,
): string {
  const resolved = path.resolve(targetDir);
  fs.mkdirSync(resolved, { recursive: true });
  const filename = `personal-ledger-backup-${todayStr}.json`;
  const outPath = path.join(resolved, filename);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');

  const files = fs
    .readdirSync(resolved)
    .filter((f) => f.startsWith('personal-ledger-backup-') && f.endsWith('.json'))
    .sort()
    .reverse();
  for (const stale of files.slice(keepCount)) {
    try {
      fs.unlinkSync(path.join(resolved, stale));
    } catch {
      // ignore cleanup failures on locked files
    }
  }
  return outPath;
}

export function appendAgentHistory(
  db: DatabaseSync,
  entry: {
    commandText: string;
    detectedLanguage: AppLanguage;
    systemLanguage: AppLanguage;
    intent: string;
    replyText: string;
    actions: Array<{ tool: string; summary: string; ok: boolean }>;
  },
): AgentHistoryRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_history (
      id, command_text, detected_language, system_language, intent, reply_text, actions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.commandText,
    entry.detectedLanguage,
    entry.systemLanguage,
    entry.intent,
    entry.replyText,
    JSON.stringify(entry.actions),
    createdAt,
  );
  return {
    id,
    commandText: entry.commandText,
    detectedLanguage: entry.detectedLanguage,
    systemLanguage: entry.systemLanguage,
    intent: entry.intent,
    replyText: entry.replyText,
    actions: entry.actions,
    createdAt,
  };
}

export function listAgentHistory(db: DatabaseSync, limit: number = 40): AgentHistoryRecord[] {
  const rows = db
    .prepare('SELECT * FROM agent_history ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as Array<{
      id: string;
      command_text: string;
      detected_language: AppLanguage;
      system_language: AppLanguage;
      intent: string;
      reply_text: string;
      actions_json: string;
      created_at: string;
    }>;

  return rows.reverse().map((r) => ({
    id: r.id,
    commandText: r.command_text,
    detectedLanguage: r.detected_language,
    systemLanguage: r.system_language,
    intent: r.intent,
    replyText: r.reply_text,
    actions: JSON.parse(r.actions_json) as Array<{ tool: string; summary: string; ok: boolean }>,
    createdAt: r.created_at,
  }));
}

export function clearAgentHistory(db: DatabaseSync): void {
  db.prepare('DELETE FROM agent_history').run();
}
