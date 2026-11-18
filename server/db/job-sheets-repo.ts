import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { todayISO, type Scope } from '../../shared/ledger-core.ts';
import {
  buildJobSheetTemplate,
  DEFAULT_STATUS_OPTIONS,
  type JobSheetRecord,
  type SheetColumn,
  type SheetRow,
  type SheetSettings,
  type SheetTabColor,
} from '../../src/workspaces/sheets/jobSheetsAnalytics.ts';

interface RawJobSheetRow {
  id: string;
  name: string;
  scope: Scope;
  color: SheetTabColor;
  columns_json: string;
  rows_json: string;
  settings_json?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function mapRow(r: RawJobSheetRow): JobSheetRecord {
  let columns: SheetColumn[] = [];
  let rows: SheetRow[] = [];
  let settings: SheetSettings = {
    showTotals: false,
    customStatuses: DEFAULT_STATUS_OPTIONS,
  };
  try {
    columns = JSON.parse(r.columns_json);
  } catch {
    columns = [];
  }
  try {
    rows = JSON.parse(r.rows_json);
  } catch {
    rows = [];
  }
  if (r.settings_json) {
    try {
      const parsed = JSON.parse(r.settings_json);
      settings = {
        showTotals: Boolean(parsed.showTotals),
        customStatuses:
          Array.isArray(parsed.customStatuses) && parsed.customStatuses.length > 0
            ? parsed.customStatuses
            : DEFAULT_STATUS_OPTIONS,
      };
    } catch {
      // use defaults
    }
  }
  return {
    id: r.id,
    name: r.name,
    scope: r.scope,
    color: r.color,
    columns,
    rows,
    settings,
    orderIndex: r.order_index,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function ensureStarterJobSheets(db: DatabaseSync): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM job_sheets').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  const now = new Date().toISOString();
  const starters = [
    { ...buildJobSheetTemplate('job_tracker', 'Job 1 · Work & Role Tracker', 'business'), orderIndex: 0 },
    { ...buildJobSheetTemplate('freelance', 'Job 2 · Consulting & Billing', 'business'), orderIndex: 1 },
    { ...buildJobSheetTemplate('salary', 'Job 3 · Executive Payroll', 'personal'), orderIndex: 2 },
  ];

  const stmt = db.prepare(`
    INSERT INTO job_sheets (id, name, scope, color, columns_json, rows_json, settings_json, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of starters) {
    stmt.run(
      `sheet_${crypto.randomUUID().slice(0, 8)}`,
      s.name,
      s.scope,
      s.color,
      JSON.stringify(s.columns),
      JSON.stringify(s.rows),
      JSON.stringify(s.settings ?? { showTotals: false, customStatuses: DEFAULT_STATUS_OPTIONS }),
      s.orderIndex,
      todayISO(),
      now,
    );
  }
}

export function listJobSheets(db: DatabaseSync): JobSheetRecord[] {
  ensureStarterJobSheets(db);
  const rows = db
    .prepare('SELECT * FROM job_sheets ORDER BY order_index ASC, created_at ASC')
    .all() as unknown as RawJobSheetRow[];
  return rows.map(mapRow);
}

export function createJobSheet(
  db: DatabaseSync,
  input: {
    name: string;
    scope?: Scope;
    color?: SheetTabColor;
    columns: SheetColumn[];
    rows: SheetRow[];
    settings?: SheetSettings;
    orderIndex?: number;
  },
): JobSheetRecord {
  const id = `sheet_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const maxOrderRow = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) as max_idx FROM job_sheets')
    .get() as { max_idx: number };
  const orderIndex = input.orderIndex ?? maxOrderRow.max_idx + 1;

  const settings: SheetSettings = {
    showTotals: Boolean(input.settings?.showTotals),
    customStatuses:
      Array.isArray(input.settings?.customStatuses) && input.settings.customStatuses.length > 0
        ? input.settings.customStatuses
        : DEFAULT_STATUS_OPTIONS,
  };

  db.prepare(
    `INSERT INTO job_sheets (id, name, scope, color, columns_json, rows_json, settings_json, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name.trim() || 'Untitled Sheet',
    input.scope ?? 'business',
    input.color ?? 'gold',
    JSON.stringify(input.columns ?? []),
    JSON.stringify(input.rows ?? []),
    JSON.stringify(settings),
    orderIndex,
    todayISO(),
    now,
  );

  const created = db
    .prepare('SELECT * FROM job_sheets WHERE id = ?')
    .get(id) as unknown as RawJobSheetRow;
  return mapRow(created);
}

export function updateJobSheet(
  db: DatabaseSync,
  id: string,
  patch: {
    name?: string;
    scope?: Scope;
    color?: SheetTabColor;
    columns?: SheetColumn[];
    rows?: SheetRow[];
    settings?: SheetSettings;
    orderIndex?: number;
  },
): JobSheetRecord | null {
  const existing = db
    .prepare('SELECT * FROM job_sheets WHERE id = ?')
    .get(id) as unknown as RawJobSheetRow | undefined;
  if (!existing) return null;

  const current = mapRow(existing);
  const nextName = patch.name !== undefined ? patch.name.trim() || current.name : current.name;
  const nextScope = patch.scope ?? current.scope;
  const nextColor = patch.color ?? current.color;
  const nextColumns = patch.columns ?? current.columns;
  const nextRows = patch.rows ?? current.rows;
  const nextSettings: SheetSettings = patch.settings
    ? {
        showTotals:
          patch.settings.showTotals !== undefined
            ? Boolean(patch.settings.showTotals)
            : Boolean(current.settings?.showTotals),
        customStatuses:
          Array.isArray(patch.settings.customStatuses) && patch.settings.customStatuses.length > 0
            ? patch.settings.customStatuses
            : current.settings?.customStatuses ?? DEFAULT_STATUS_OPTIONS,
      }
    : current.settings ?? { showTotals: false, customStatuses: DEFAULT_STATUS_OPTIONS };
  const nextOrder = patch.orderIndex ?? current.orderIndex;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE job_sheets
     SET name = ?, scope = ?, color = ?, columns_json = ?, rows_json = ?, settings_json = ?, order_index = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    nextName,
    nextScope,
    nextColor,
    JSON.stringify(nextColumns),
    JSON.stringify(nextRows),
    JSON.stringify(nextSettings),
    nextOrder,
    now,
    id,
  );

  const updated = db
    .prepare('SELECT * FROM job_sheets WHERE id = ?')
    .get(id) as unknown as RawJobSheetRow;
  return mapRow(updated);
}

export function deleteJobSheet(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM job_sheets WHERE id = ?').run(id);
  return res.changes > 0;
}
