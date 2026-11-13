import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { NOTE_COLORS, type NoteColor, type NoteScope } from '../../shared/ledger-core.ts';
import { withTransaction } from './schema.ts';

export interface ChecklistItemRecord {
  id: string;
  noteId: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

export interface NoteAttachmentRecord {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
  byteSize: number;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  title: string;
  body: string;
  scope: NoteScope;
  color: NoteColor;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  remindAt: string | null;
  linkedTxId: string | null;
  linkedDueId: string | null;
  linkedLoanId: string | null;
  linkedAccountId: string | null;
  orderIndex: number;
  checklist: ChecklistItemRecord[];
  attachments: NoteAttachmentRecord[];
  createdAt: string;
  updatedAt: string;
}

function safeColor(raw: string | undefined): NoteColor {
  return (NOTE_COLORS as readonly string[]).includes(raw ?? '') ? (raw as NoteColor) : 'default';
}

function safeJsonTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function listNotes(
  db: DatabaseSync,
  opts: { scope?: NoteScope; tag?: string; search?: string; includeArchived?: boolean } = {},
): NoteRecord[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (opts.includeArchived === false) {
    clauses.push('archived = 0');
  }
  if (opts.scope) {
    clauses.push('scope = ?');
    params.push(opts.scope);
  }
  if (opts.search) {
    const q = `%${opts.search.trim()}%`;
    clauses.push('(title LIKE ? OR body LIKE ? OR tags_json LIKE ?)');
    params.push(q, q, q);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const notes = db
    .prepare(`SELECT * FROM notes ${where} ORDER BY archived ASC, pinned DESC, order_index ASC, updated_at DESC`)
    .all(...params) as unknown as Array<{
      id: string;
      title: string;
      body: string;
      scope: NoteScope;
      color?: string;
      tags_json?: string;
      pinned: number;
      archived?: number;
      remind_at: string | null;
      linked_tx_id?: string | null;
      linked_due_id?: string | null;
      linked_loan_id?: string | null;
      linked_account_id?: string | null;
      order_index?: number;
      created_at: string;
      updated_at: string;
    }>;

  const items = db
    .prepare('SELECT * FROM note_checklist_items ORDER BY sort_order ASC')
    .all() as unknown as Array<{
      id: string;
      note_id: string;
      text: string;
      done: number;
      sort_order: number;
    }>;

  const byNote = new Map<string, ChecklistItemRecord[]>();
  for (const item of items) {
    const list = byNote.get(item.note_id) ?? [];
    list.push({
      id: item.id,
      noteId: item.note_id,
      text: item.text,
      done: item.done === 1,
      sortOrder: item.sort_order,
    });
    byNote.set(item.note_id, list);
  }

  let attachments: Array<{
    id: string;
    note_id: string;
    filename: string;
    mime_type: string;
    data_base64: string;
    byte_size: number;
    created_at: string;
  }> = [];
  try {
    attachments = db
      .prepare('SELECT * FROM note_attachments ORDER BY created_at DESC')
      .all() as unknown as typeof attachments;
  } catch {
    attachments = [];
  }

  const byNoteAttachments = new Map<string, NoteAttachmentRecord[]>();
  for (const att of attachments) {
    const list = byNoteAttachments.get(att.note_id) ?? [];
    list.push({
      id: att.id,
      noteId: att.note_id,
      filename: att.filename,
      mimeType: att.mime_type,
      dataBase64: att.data_base64,
      byteSize: att.byte_size,
      createdAt: att.created_at,
    });
    byNoteAttachments.set(att.note_id, list);
  }

  let result = notes.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    scope: n.scope,
    color: safeColor(n.color),
    tags: safeJsonTags(n.tags_json),
    pinned: n.pinned === 1,
    archived: n.archived === 1,
    remindAt: n.remind_at,
    linkedTxId: n.linked_tx_id ?? null,
    linkedDueId: n.linked_due_id ?? null,
    linkedLoanId: n.linked_loan_id ?? null,
    linkedAccountId: n.linked_account_id ?? null,
    orderIndex: n.order_index ?? 0,
    checklist: byNote.get(n.id) ?? [],
    attachments: byNoteAttachments.get(n.id) ?? [],
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }));

  if (opts.tag) {
    const targetTag = opts.tag.trim().toLowerCase();
    result = result.filter((n) => n.tags.some((t) => t.toLowerCase() === targetTag));
  }

  return result;
}

export function upsertNote(
  db: DatabaseSync,
  id: string | null,
  input: {
    title: string;
    body: string;
    scope: NoteScope;
    color?: NoteColor;
    tags?: string[];
    pinned: boolean;
    archived?: boolean;
    remindAt?: string | null;
    linkedTxId?: string | null;
    linkedDueId?: string | null;
    linkedLoanId?: string | null;
    linkedAccountId?: string | null;
    checklist: Array<{ id?: string; text: string; done: boolean }>;
  },
): NoteRecord {
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    const noteId = id ?? crypto.randomUUID();
    const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(noteId) as { id: string } | undefined;
    const color = safeColor(input.color);
    const archivedFlag = input.archived ? 1 : 0;
    const tagsJson = JSON.stringify(input.tags ?? []);

    if (existing) {
      db.prepare(`
        UPDATE notes SET
          title = ?, body = ?, scope = ?, color = ?, tags_json = ?, pinned = ?, archived = ?, remind_at = ?,
          linked_tx_id = ?, linked_due_id = ?, linked_loan_id = ?, linked_account_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.title,
        input.body,
        input.scope,
        color,
        tagsJson,
        input.pinned ? 1 : 0,
        archivedFlag,
        input.remindAt ?? null,
        input.linkedTxId ?? null,
        input.linkedDueId ?? null,
        input.linkedLoanId ?? null,
        input.linkedAccountId ?? null,
        now,
        noteId,
      );
      db.prepare('DELETE FROM note_checklist_items WHERE note_id = ?').run(noteId);
    } else {
      db.prepare(`
        INSERT INTO notes (
          id, title, body, scope, color, tags_json, pinned, archived, remind_at,
          linked_tx_id, linked_due_id, linked_loan_id, linked_account_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        noteId,
        input.title,
        input.body,
        input.scope,
        color,
        tagsJson,
        input.pinned ? 1 : 0,
        archivedFlag,
        input.remindAt ?? null,
        input.linkedTxId ?? null,
        input.linkedDueId ?? null,
        input.linkedLoanId ?? null,
        input.linkedAccountId ?? null,
        now,
        now,
      );
    }

    const insertItem = db.prepare(`
      INSERT INTO note_checklist_items (id, note_id, text, done, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    input.checklist.forEach((item, idx) => {
      insertItem.run(item.id || crypto.randomUUID(), noteId, item.text, item.done ? 1 : 0, idx);
    });

    return listNotes(db).find((n) => n.id === noteId)!;
  });
}

export function toggleChecklistItem(
  db: DatabaseSync,
  noteId: string,
  itemId: string,
  done: boolean,
): NoteRecord | null {
  const res = db
    .prepare('UPDATE note_checklist_items SET done = ? WHERE id = ? AND note_id = ?')
    .run(done ? 1 : 0, itemId, noteId);
  if (Number(res.changes) === 0) return null;
  db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), noteId);
  return listNotes(db).find((n) => n.id === noteId) ?? null;
}

export function deleteNote(db: DatabaseSync, id: string): boolean {
  try {
    db.prepare('DELETE FROM note_attachments WHERE note_id = ?').run(id);
  } catch {}
  db.prepare('DELETE FROM note_checklist_items WHERE note_id = ?').run(id);
  const res = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function addNoteAttachment(
  db: DatabaseSync,
  noteId: string,
  input: { filename: string; mimeType: string; dataBase64: string; byteSize?: number },
): NoteAttachmentRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const byteSize = input.byteSize ?? Math.round((input.dataBase64.length * 3) / 4);

  db.prepare(`
    INSERT INTO note_attachments (id, note_id, filename, mime_type, data_base64, byte_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, noteId, input.filename, input.mimeType, input.dataBase64, byteSize, now);

  db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(now, noteId);

  return {
    id,
    noteId,
    filename: input.filename,
    mimeType: input.mimeType,
    dataBase64: input.dataBase64,
    byteSize,
    createdAt: now,
  };
}

export function deleteNoteAttachment(db: DatabaseSync, noteId: string, attachmentId: string): boolean {
  const res = db.prepare('DELETE FROM note_attachments WHERE id = ? AND note_id = ?').run(attachmentId, noteId);
  if (Number(res.changes) > 0) {
    db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), noteId);
    return true;
  }
  return false;
}

export function listNoteAttachments(db: DatabaseSync, noteId: string): NoteAttachmentRecord[] {
  const rows = db
    .prepare('SELECT * FROM note_attachments WHERE note_id = ? ORDER BY created_at DESC')
    .all(noteId) as unknown as Array<{
      id: string;
      note_id: string;
      filename: string;
      mime_type: string;
      data_base64: string;
      byte_size: number;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    filename: r.filename,
    mimeType: r.mime_type,
    dataBase64: r.data_base64,
    byteSize: r.byte_size,
    createdAt: r.created_at,
  }));
}

export function bulkNoteAction(
  db: DatabaseSync,
  input: {
    ids: string[];
    action: 'scope' | 'color' | 'tag' | 'archive' | 'unarchive' | 'pin' | 'unpin' | 'delete';
    scope?: NoteScope;
    color?: NoteColor;
    tag?: string;
  },
): { count: number } {
  if (input.ids.length === 0) return { count: 0 };
  const now = new Date().toISOString();

  if (input.action === 'delete') {
    let deleted = 0;
    for (const id of input.ids) {
      if (deleteNote(db, id)) deleted++;
    }
    return { count: deleted };
  }

  if (input.action === 'tag' && input.tag) {
    const cleanTag = input.tag.trim();
    let updated = 0;
    for (const id of input.ids) {
      const note = db.prepare('SELECT tags_json FROM notes WHERE id = ?').get(id) as { tags_json?: string } | undefined;
      if (note) {
        const existingTags = safeJsonTags(note.tags_json);
        if (!existingTags.includes(cleanTag)) {
          existingTags.push(cleanTag);
          db.prepare('UPDATE notes SET tags_json = ?, updated_at = ? WHERE id = ?').run(
            JSON.stringify(existingTags),
            now,
            id,
          );
          updated++;
        }
      }
    }
    return { count: updated };
  }

  const placeholders = input.ids.map(() => '?').join(', ');
  let sql = '';
  const params: (string | number)[] = [];

  switch (input.action) {
    case 'scope':
      if (!input.scope) return { count: 0 };
      sql = `UPDATE notes SET scope = ?, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(input.scope, now, ...input.ids);
      break;
    case 'color':
      if (!input.color) return { count: 0 };
      sql = `UPDATE notes SET color = ?, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(safeColor(input.color), now, ...input.ids);
      break;
    case 'archive':
      sql = `UPDATE notes SET archived = 1, pinned = 0, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(now, ...input.ids);
      break;
    case 'unarchive':
      sql = `UPDATE notes SET archived = 0, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(now, ...input.ids);
      break;
    case 'pin':
      sql = `UPDATE notes SET pinned = 1, archived = 0, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(now, ...input.ids);
      break;
    case 'unpin':
      sql = `UPDATE notes SET pinned = 0, updated_at = ? WHERE id IN (${placeholders})`;
      params.push(now, ...input.ids);
      break;
  }

  if (sql) {
    const res = db.prepare(sql).run(...params);
    return { count: Number(res.changes) };
  }
  return { count: 0 };
}

export function reorderNotes(db: DatabaseSync, noteIds: string[]): { ok: boolean; count: number } {
  return withTransaction(db, () => {
    const stmt = db.prepare('UPDATE notes SET order_index = ?, updated_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    let count = 0;
    noteIds.forEach((id, idx) => {
      const res = stmt.run(idx, now, id);
      count += Number(res.changes);
    });
    return { ok: true, count };
  });
}
