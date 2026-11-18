import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNotesIntelligence,
  computeVaultSecurityTelemetry,
  type VaultEntryForAudit,
} from './notesVaultAnalytics.ts';
import type { NoteRecord } from '../../lib/api.ts';

const sampleNotes: NoteRecord[] = [
  {
    id: 'n-1',
    title: 'GST Filing & Vendor Invoices',
    body: 'Collect Q3 input tax credit invoices.',
    scope: 'business',
    color: 'honey',
    tags: ['gst', 'audit'],
    pinned: true,
    archived: false,
    remindAt: '2026-11-15T10:00:00.000Z',
    linkedTxId: 'tx-101',
    linkedDueId: null,
    linkedLoanId: null,
    linkedAccountId: null,
    checklist: [
      { id: 'c-1', noteId: 'n-1', text: 'Download GSTR-2B', done: true, sortOrder: 0 },
      { id: 'c-2', noteId: 'n-1', text: 'Reconcile AWS bills', done: false, sortOrder: 1 },
    ],
    attachments: [],
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
  },
  {
    id: 'n-2',
    title: 'Personal SIP Checklist',
    body: '',
    scope: 'personal',
    color: 'mint',
    tags: ['sip'],
    pinned: false,
    archived: false,
    remindAt: null,
    linkedTxId: null,
    linkedDueId: null,
    linkedLoanId: null,
    linkedAccountId: 'acc-1',
    checklist: [
      { id: 'c-3', noteId: 'n-2', text: 'Verify Nifty 50 index debit', done: true, sortOrder: 0 },
      { id: 'c-4', noteId: 'n-2', text: 'Top up liquid fund', done: true, sortOrder: 1 },
    ],
    attachments: [],
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-12T10:00:00.000Z',
  },
];

const sampleVaultEntries: VaultEntryForAudit[] = [
  {
    id: 'v-1',
    label: 'HDFC Corporate NetBanking',
    category: 'Banking',
    lastRotatedAt: '2026-11-01',
    updatedAt: '2026-11-01',
    payload: {
      itemType: 'login',
      linkedAccountId: 'acc-1',
      username: 'corp_admin',
      password: 'V3ry$tr0ng!Password2026',
      url: 'https://netbanking.hdfcbank.com',
      notes: '',
      starred: true,
      secrets: [],
      legacyHistory: [],
    },
  },
  {
    id: 'v-2',
    label: 'Old Card PIN',
    category: 'Credit Card',
    lastRotatedAt: '2025-12-01', // Stale >90d
    updatedAt: '2025-12-01',
    payload: {
      itemType: 'card',
      linkedAccountId: null,
      username: '',
      password: '',
      cardPin: '1234', // Weak
      url: '',
      notes: '',
      starred: false,
      secrets: [],
      legacyHistory: [],
    },
  },
];

describe('notesVaultAnalytics', () => {
  it('computes notes checklist completion, overdue reminders, and Business -> Personal -> Family -> General slices', () => {
    const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
    const intel = computeNotesIntelligence(sampleNotes, nowMs);

    assert.equal(intel.activeCount, 2);
    assert.equal(intel.pinnedCount, 1);
    assert.equal(intel.overdueRemindersCount, 1);
    assert.equal(intel.totalChecklistItems, 4);
    assert.equal(intel.completedChecklistItems, 3);
    assert.equal(intel.openChecklistItems, 1);
    assert.equal(intel.checklistCompletionPct, 75);
    assert.equal(intel.linkedEntityNotesCount, 2);
    assert.equal(intel.scopeSlices[0].scope, 'business');
    assert.equal(intel.scopeSlices[0].count, 1);
    assert.equal(intel.scopeSlices[1].scope, 'personal');
    assert.equal(intel.scopeSlices[1].count, 1);
  });

  it('computes vault health score, weak/stale/reused counts, and credential type distribution', () => {
    const reusedHashes = new Set<string>(['dup-hash']);
    const entryHashById: Record<string, string> = {
      'v-1': 'unique-hash',
      'v-2': 'dup-hash',
    };

    const telemetry = computeVaultSecurityTelemetry(
      sampleVaultEntries,
      reusedHashes,
      entryHashById,
      '2026-11-16',
    );

    assert.equal(telemetry.totalItems, 2);
    assert.equal(telemetry.starredCount, 1);
    assert.equal(telemetry.weakCount, 1);
    assert.equal(telemetry.staleCount, 1);
    assert.equal(telemetry.reusedCount, 1);
    assert.equal(telemetry.linkedAccountsCount, 1);
    assert.equal(telemetry.healthScore, 50);
    assert.equal(telemetry.healthStatus, 'Needs Review');
    assert.equal(telemetry.typeSlices[0].type, 'login');
    assert.equal(telemetry.typeSlices[0].count, 1);
    assert.equal(telemetry.typeSlices[1].type, 'card');
    assert.equal(telemetry.typeSlices[1].count, 1);
  });
});
