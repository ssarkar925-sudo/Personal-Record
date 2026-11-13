import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { type AlertModule } from '../../shared/ledger-core.ts';

export interface AlertSettings {
  recipientPhone: string;
  quietStartHour: number;
  quietEndHour: number;
  morningDigestEnabled: boolean;
  morningDigestHour: number;
  twoWayCommandsEnabled: boolean;
  leadDaysCreditCard: number;
  leadDaysLoan: number;
  leadDaysDue: number;
  cardUtilizationThresholdPct: number;
  vaultRotationDays: number;
  enabledModules: Record<AlertModule, boolean>;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  recipientPhone: '',
  quietStartHour: 22,
  quietEndHour: 8,
  morningDigestEnabled: false,
  morningDigestHour: 9,
  twoWayCommandsEnabled: true,
  leadDaysCreditCard: 3,
  leadDaysLoan: 3,
  leadDaysDue: 2,
  cardUtilizationThresholdPct: 75,
  vaultRotationDays: 180,
  enabledModules: {
    credit_cards: true,
    banks: true,
    loans: true,
    people_dues: true,
    budgets: true,
    notes: true,
    vault: true,
    advisor: true,
  },
};

export interface AlertDeliveryRecord {
  id: string;
  dedupeKey: string;
  module: AlertModule;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  channel: 'in_app' | 'whatsapp';
  status: 'pending' | 'sent' | 'failed' | 'read';
  errorText: string | null;
  createdAt: string;
  sentAt: string | null;
}

export function getAlertSettings(db: DatabaseSync): AlertSettings {
  const row = db
    .prepare('SELECT config_json FROM alert_settings WHERE id = 1')
    .get() as { config_json: string } | undefined;
  if (!row) return { ...DEFAULT_ALERT_SETTINGS, enabledModules: { ...DEFAULT_ALERT_SETTINGS.enabledModules } };
  try {
    const parsed = JSON.parse(row.config_json) as Partial<AlertSettings>;
    return {
      ...DEFAULT_ALERT_SETTINGS,
      ...parsed,
      enabledModules: {
        ...DEFAULT_ALERT_SETTINGS.enabledModules,
        ...(parsed.enabledModules ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_ALERT_SETTINGS, enabledModules: { ...DEFAULT_ALERT_SETTINGS.enabledModules } };
  }
}

export function saveAlertSettings(db: DatabaseSync, settings: AlertSettings): AlertSettings {
  db.prepare(`
    INSERT INTO alert_settings (id, config_json, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run(JSON.stringify(settings), new Date().toISOString());
  return getAlertSettings(db);
}

export function recordAlertIfNew(
  db: DatabaseSync,
  input: {
    dedupeKey: string;
    module: AlertModule;
    severity: 'info' | 'warning' | 'urgent';
    title: string;
    message: string;
    channel: 'in_app' | 'whatsapp';
  },
): { inserted: boolean; record: AlertDeliveryRecord } {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const res = db
    .prepare(`
      INSERT OR IGNORE INTO alert_deliveries (
        id, dedupe_key, module, severity, title, message, channel, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `)
    .run(id, input.dedupeKey, input.module, input.severity, input.title, input.message, input.channel, now);

  const inserted = Number(res.changes) > 0;
  const row = db
    .prepare('SELECT * FROM alert_deliveries WHERE dedupe_key = ?')
    .get(input.dedupeKey) as unknown as {
      id: string;
      dedupe_key: string;
      module: AlertModule;
      severity: 'info' | 'warning' | 'urgent';
      title: string;
      message: string;
      channel: 'in_app' | 'whatsapp';
      status: 'pending' | 'sent' | 'failed' | 'read';
      error_text: string | null;
      created_at: string;
      sent_at: string | null;
    };

  return {
    inserted,
    record: {
      id: row.id,
      dedupeKey: row.dedupe_key,
      module: row.module,
      severity: row.severity,
      title: row.title,
      message: row.message,
      channel: row.channel,
      status: row.status,
      errorText: row.error_text,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    },
  };
}

export function markAlertStatus(
  db: DatabaseSync,
  id: string,
  status: 'pending' | 'sent' | 'failed' | 'read',
  errorText: string | null = null,
): void {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE alert_deliveries
    SET status = ?, error_text = ?, sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `).run(status, errorText, sentAt, id);
}

export function listAlertDeliveries(db: DatabaseSync, limit: number = 80): AlertDeliveryRecord[] {
  const rows = db
    .prepare('SELECT * FROM alert_deliveries ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as Array<{
      id: string;
      dedupe_key: string;
      module: AlertModule;
      severity: 'info' | 'warning' | 'urgent';
      title: string;
      message: string;
      channel: 'in_app' | 'whatsapp';
      status: 'pending' | 'sent' | 'failed' | 'read';
      error_text: string | null;
      created_at: string;
      sent_at: string | null;
    }>;

  return rows.map((r) => ({
    id: r.id,
    dedupeKey: r.dedupe_key,
    module: r.module,
    severity: r.severity,
    title: r.title,
    message: r.message,
    channel: r.channel,
    status: r.status,
    errorText: r.error_text,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  }));
}

export function listPendingWhatsAppAlerts(db: DatabaseSync): AlertDeliveryRecord[] {
  return listAlertDeliveries(db, 100).filter(
    (a) => a.channel === 'whatsapp' && (a.status === 'pending' || a.status === 'failed'),
  );
}

export function markAllAlertsRead(db: DatabaseSync): void {
  db.prepare(`UPDATE alert_deliveries SET status = 'read' WHERE channel = 'in_app' AND status = 'pending'`).run();
}
