import type { NoteRecord } from '../../lib/api.ts';
import {
  calculatePasswordStrength,
  type VaultItemType,
  type VaultSecretPayload,
} from '../../lib/crypto.ts';
import { daysBetweenISO } from '../../lib/format.ts';
import type { NoteScope } from '../../../shared/ledger-core.ts';

export type DossierFoilFinish = 'auto' | 'obsidian' | 'gold' | 'emerald' | 'platinum';

export interface NoteScopeSlice {
  scope: NoteScope;
  label: string;
  count: number;
  sharePct: number;
  color: string;
}

export interface NotesIntelligence {
  activeCount: number;
  pinnedCount: number;
  remindersCount: number;
  overdueRemindersCount: number;
  todayRemindersCount: number;
  checklistsCount: number;
  totalChecklistItems: number;
  completedChecklistItems: number;
  openChecklistItems: number;
  checklistCompletionPct: number;
  linkedEntityNotesCount: number;
  scopeSlices: NoteScopeSlice[];
}

export interface VaultEntryForAudit {
  id: string;
  label: string;
  category: string;
  lastRotatedAt: string;
  updatedAt: string;
  payload: VaultSecretPayload;
}

export interface VaultTypeSlice {
  type: VaultItemType;
  label: string;
  count: number;
  sharePct: number;
  color: string;
}

export interface VaultSecurityTelemetry {
  totalItems: number;
  starredCount: number;
  weakCount: number;
  staleCount: number;
  reusedCount: number;
  healthScore: number;
  healthStatus: 'Strong' | 'Moderate' | 'Needs Review';
  linkedAccountsCount: number;
  typeSlices: VaultTypeSlice[];
}

export function computeNotesIntelligence(
  notes: NoteRecord[],
  nowMs: number = Date.now(),
): NotesIntelligence {
  const activeNotes = notes.filter((n) => !n.archived);
  const activeCount = activeNotes.length;
  const pinnedCount = activeNotes.filter((n) => n.pinned).length;
  const remindersCount = activeNotes.filter((n) => !!n.remindAt).length;

  const overdueRemindersCount = activeNotes.filter(
    (n) => n.remindAt && Date.parse(n.remindAt) < nowMs,
  ).length;
  const todayRemindersCount = activeNotes.filter((n) => {
    if (!n.remindAt) return false;
    const ms = Date.parse(n.remindAt);
    return ms >= nowMs && ms <= nowMs + 24 * 60 * 60 * 1000;
  }).length;

  const checklistsCount = activeNotes.filter((n) => n.checklist.length > 0).length;

  let totalChecklistItems = 0;
  let completedChecklistItems = 0;
  let linkedEntityNotesCount = 0;

  for (const n of activeNotes) {
    totalChecklistItems += n.checklist.length;
    completedChecklistItems += n.checklist.filter((c) => c.done).length;
    if (n.linkedTxId || n.linkedDueId || n.linkedLoanId || n.linkedAccountId) {
      linkedEntityNotesCount += 1;
    }
  }

  const openChecklistItems = Math.max(0, totalChecklistItems - completedChecklistItems);
  const checklistCompletionPct =
    totalChecklistItems > 0
      ? Math.round((completedChecklistItems / totalChecklistItems) * 100)
      : 100;

  // Scope distribution in institutional order: Business -> Personal -> Family -> General
  const scopeDefs: Array<{ scope: NoteScope; label: string; color: string }> = [
    { scope: 'business', label: 'Business', color: '#C59B27' },
    { scope: 'personal', label: 'Personal', color: '#059669' },
    { scope: 'family', label: 'Family', color: '#111318' },
    { scope: 'general', label: 'General', color: '#6B7280' },
  ];

  const denom = Math.max(1, activeCount);
  const scopeSlices: NoteScopeSlice[] = scopeDefs.map((d) => {
    const count = activeNotes.filter((n) => n.scope === d.scope).length;
    return {
      scope: d.scope,
      label: d.label,
      count,
      sharePct: activeCount > 0 ? Math.round((count / denom) * 100) : 0,
      color: d.color,
    };
  });

  return {
    activeCount,
    pinnedCount,
    remindersCount,
    overdueRemindersCount,
    todayRemindersCount,
    checklistsCount,
    totalChecklistItems,
    completedChecklistItems,
    openChecklistItems,
    checklistCompletionPct,
    linkedEntityNotesCount,
    scopeSlices,
  };
}

export function computeVaultSecurityTelemetry(
  entries: VaultEntryForAudit[],
  reusedHashes: Set<string>,
  entryHashById: Record<string, string>,
  todayStr: string,
): VaultSecurityTelemetry {
  const totalItems = entries.length;
  let starredCount = 0;
  let weakCount = 0;
  let staleCount = 0;
  let reusedCount = 0;
  let linkedAccountsCount = 0;

  const typeCounts: Record<VaultItemType, number> = {
    login: 0,
    card: 0,
    upi: 0,
    identity: 0,
    note: 0,
  };

  for (const e of entries) {
    if (e.payload.starred) starredCount += 1;
    if (e.payload.linkedAccountId) linkedAccountsCount += 1;

    const itemType: VaultItemType = e.payload.itemType ?? 'login';
    typeCounts[itemType] = (typeCounts[itemType] ?? 0) + 1;

    const pw = e.payload.password || e.payload.upiMpin || e.payload.cardPin || '';
    if (pw) {
      const strength = calculatePasswordStrength(pw);
      if (strength.label === 'Weak') weakCount += 1;
    }

    const daysSinceRotated = daysBetweenISO(e.lastRotatedAt, todayStr);
    if (daysSinceRotated > 90) staleCount += 1;

    const h = entryHashById[e.id];
    if (h && reusedHashes.has(h)) reusedCount += 1;
  }

  let healthScore = 100;
  if (totalItems > 0) {
    const weakPenalty = (weakCount / totalItems) * 40;
    const reusedPenalty = (reusedCount / totalItems) * 35;
    const stalePenalty = (staleCount / totalItems) * 25;
    healthScore = Math.max(10, Math.round(100 - weakPenalty - reusedPenalty - stalePenalty));
  }

  const healthStatus: VaultSecurityTelemetry['healthStatus'] =
    healthScore >= 80 ? 'Strong' : healthScore >= 60 ? 'Moderate' : 'Needs Review';

  const typeDefs: Array<{ type: VaultItemType; label: string; color: string }> = [
    { type: 'login', label: 'Bank & Portal Logins', color: '#111318' },
    { type: 'card', label: 'Card PINs & CVVs', color: '#C59B27' },
    { type: 'upi', label: 'UPI VPAs & MPINs', color: '#059669' },
    { type: 'identity', label: 'PAN / Aadhaar / IDs', color: '#4B5563' },
    { type: 'note', label: 'Encrypted Keys & Seeds', color: '#9A7418' },
  ];

  const denom = Math.max(1, totalItems);
  const typeSlices: VaultTypeSlice[] = typeDefs.map((d) => {
    const count = typeCounts[d.type] ?? 0;
    return {
      type: d.type,
      label: d.label,
      count,
      sharePct: totalItems > 0 ? Math.round((count / denom) * 100) : 0,
      color: d.color,
    };
  });

  return {
    totalItems,
    starredCount,
    weakCount,
    staleCount,
    reusedCount,
    healthScore,
    healthStatus,
    linkedAccountsCount,
    typeSlices,
  };
}
