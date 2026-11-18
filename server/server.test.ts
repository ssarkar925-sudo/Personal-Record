import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db/schema.ts';
import { createAccount, getAccountById } from './db/accounts-repo.ts';
import {
  createLoan,
  createPersonDue,
  createTransaction,
  deleteTransaction,
  getTransactionAttachment,
  listLoans,
  listTransactions,
  reconcileBankBalance,
  recordLoanPayment,
  settlePersonDue,
  upsertScopeBudget,
  listCategoryBudgets,
  upsertCategoryBudget,
  deleteCategoryBudget,
  bulkUpdateTransactions,
  bulkDeleteTransactions,
} from './db/ledger-repo.ts';
import { toggleChecklistItem, upsertNote } from './db/notes-repo.ts';
import { recordVaultSecurityEvent, upsertVaultEntry } from './db/vault-repo.ts';
import { getAlertSettings, listAlertDeliveries, saveAlertSettings } from './db/alerts-repo.ts';
import {
  getDashboardSummary,
  getDetailedReports,
  exportFullSnapshotJSON,
  restoreFullSnapshotJSON,
  globalSearch,
} from './db/reports-repo.ts';
import {
  type IncomingWhatsAppAudio,
  type IncomingWhatsAppImage,
  type WhatsAppBridgeState,
  type WhatsAppTransport,
} from './whatsapp/bridge.ts';
import {
  handleIncomingWhatsAppAudio,
  handleIncomingWhatsAppCommand,
  handleIncomingWhatsAppImage,
  runAlertCycle,
} from './whatsapp/scheduler.ts';
import { createAppServer } from './index.ts';
import { getAppPreferences, updateAppPreferences, writeAutoBackupFile } from './db/settings-repo.ts';
import { buildAdvisorBriefing } from './agent/advisor.ts';
import { processAgentCommand } from './agent/executor.ts';
import { extractReceiptFieldsFromText, parseStatementInput } from './agent/intelligence.ts';
import {
  createCanary,
  decryptVaultPayload,
  deriveVaultKey,
  encryptVaultPayload,
  generateSaltB64,
  generateStrongPassword,
  verifyCanary,
} from '../src/lib/crypto.ts';
import { listPeopleDues } from './db/ledger-repo.ts';
import { listNotes } from './db/notes-repo.ts';

class MockWhatsAppTransport implements WhatsAppTransport {
  public sent: Array<{ phone: string; text: string }> = [];
  public incomingHandler?: (fromPhone: string, text: string) => Promise<void>;
  public incomingImageHandler?: (fromPhone: string, payload: IncomingWhatsAppImage) => Promise<void>;
  public incomingAudioHandler?: (fromPhone: string, payload: IncomingWhatsAppAudio) => Promise<void>;
  onIncomingText(handler: (fromPhone: string, text: string) => Promise<void>) {
    this.incomingHandler = handler;
  }
  onIncomingImage(handler: (fromPhone: string, payload: IncomingWhatsAppImage) => Promise<void>) {
    this.incomingImageHandler = handler;
  }
  onIncomingAudio(handler: (fromPhone: string, payload: IncomingWhatsAppAudio) => Promise<void>) {
    this.incomingAudioHandler = handler;
  }
  private state: WhatsAppBridgeState = {
    status: 'connected',
    qrDataUrl: null,
    connectedPhone: '919999999999',
    lastError: null,
    updatedAt: new Date().toISOString(),
  };

  getState(): WhatsAppBridgeState {
    return { ...this.state };
  }
  async connect() {
    this.state.status = 'connected';
  }
  async disconnect() {
    this.state.status = 'disconnected';
  }
  async logout() {
    this.state.status = 'disconnected';
  }
  async sendText(recipientPhone: string, text: string) {
    this.sent.push({ phone: recipientPhone || this.state.connectedPhone || '', text });
    return { ok: true };
  }
}

test('unified ledger keeps bank, credit card, and P&L reports exact with zero double counting', () => {
  const db = openDatabase(':memory:');
  const bank = createAccount(db, {
    name: 'HDFC Personal',
    type: 'bank',
    scope: 'personal',
    institution: 'HDFC',
    last4: '1111',
    openingBalanceMinor: 5_000_000, // ₹50,000
    minBalanceMinor: 500_000,
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });

  const card = createAccount(db, {
    name: 'Axis Ace',
    type: 'credit_card',
    scope: 'personal',
    institution: 'Axis',
    last4: '4321',
    openingBalanceMinor: 0,
    minBalanceMinor: 0,
    creditLimitMinor: 10_000_000, // ₹1,00,000
    statementDay: 15,
    dueDay: 5,
  });

  // Swipe ₹6,000 before statement close
  createTransaction(db, {
    kind: 'expense',
    scope: 'personal',
    accountId: card.id,
    category: 'Groceries',
    amountMinor: 600_000,
    occurredAt: '2026-10-10',
  });

  // Pay ₹6,000 card bill from HDFC Personal bank
  createTransaction(db, {
    kind: 'transfer',
    scope: 'personal',
    accountId: bank.id,
    toAccountId: card.id,
    category: 'Card Bill Payment',
    amountMinor: 600_000,
    occurredAt: '2026-11-02',
  });

  const bankNow = getAccountById(db, bank.id, '2026-11-03')!;
  const cardNow = getAccountById(db, card.id, '2026-11-03')!;
  assert.equal(bankNow.currentBalanceMinor, 4_400_000); // ₹44,000
  assert.equal(cardNow.cardCycle?.statementDueMinor, 0);

  const report = getDetailedReports(db, { fromDate: '2026-10-01', toDate: '2026-11-30' }, '2026-11-03');
  // Expense must equal ₹6,000 once—transfer must NOT double count!
  assert.equal(report.scopePnl.personal.expenseMinor, 600_000);

  // Reconcile bank to ₹43,500 (posts ₹500 expense adjustment)
  const adj = reconcileBankBalance(db, bank.id, 4_350_000, '2026-11-03');
  assert.equal(adj?.kind, 'expense');
  assert.equal(adj?.amountMinor, 50_000);
  assert.equal(getAccountById(db, bank.id, '2026-11-03')!.currentBalanceMinor, 4_350_000);

  db.close();
});

test('loans and people dues update balances atomically and summarize net per person', () => {
  const db = openDatabase(':memory:');
  const bizBank = createAccount(db, {
    name: 'ICICI Business',
    type: 'bank',
    scope: 'business',
    institution: 'ICICI',
    last4: '9001',
    openingBalanceMinor: 10_000_000, // ₹1,00,000
    minBalanceMinor: 0,
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });

  const loan = createLoan(db, {
    name: 'Office Equipment Loan',
    counterparty: 'Bajaj Finance',
    scope: 'business',
    direction: 'borrowed',
    principalMinor: 5_000_000, // ₹50,000
    annualRateBps: 1200, // 12%
    tenureMonths: 12,
    emiMinor: 444_244,
    startDate: '2026-10-01',
    nextDueDate: '2026-11-05',
    linkedAccountId: bizBank.id,
  });

  const paid = recordLoanPayment(db, loan.id, {
    amountMinor: 444_244,
    accountId: bizBank.id,
    paidAt: '2026-11-05',
  });
  assert.equal(paid.loan.totalInterestPaidMinor, 50_000); // ₹500
  assert.equal(paid.loan.remainingMinor, 5_000_000 - (444_244 - 50_000));
  assert.equal(paid.loan.nextDueDate, '2026-12-05');
  assert.equal(getAccountById(db, bizBank.id)!.currentBalanceMinor, 10_000_000 - 444_244);

  // People dues: Need ₹3,000 from Rahul, Give ₹1,000 to Rahul -> Net +₹2,000 Need
  const d1 = createPersonDue(db, {
    personName: 'Rahul',
    direction: 'need',
    scope: 'personal',
    amountMinor: 300_000,
    dueDate: '2026-11-10',
  });
  createPersonDue(db, {
    personName: 'Rahul',
    direction: 'give',
    scope: 'personal',
    amountMinor: 100_000,
    dueDate: '2026-11-20',
  });

  // Partial settlement ₹1,500 received from Rahul into Business bank
  const settled = settlePersonDue(db, d1.id, {
    amountMinor: 150_000,
    accountId: bizBank.id,
    settledAt: '2026-11-11',
  });
  assert.equal(settled.due.status, 'partial');
  assert.equal(settled.due.remainingMinor, 150_000);

  const summary = getDashboardSummary(db, undefined, '2026-11-11');
  const rahul = summary.dueSummariesByPerson[0];
  assert.equal(rahul.personName, 'Rahul');
  assert.equal(rahul.netMinor, 50_000); // ₹1,500 need - ₹1,000 give = +₹500

  db.close();
});

test('alerts engine deduplicates WhatsApp alerts, respects checklist completion, and never leaks vault secrets', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();

  const settings = getAlertSettings(db);
  settings.recipientPhone = '9876543210';
  settings.quietStartHour = 23;
  settings.quietEndHour = 6;
  settings.morningDigestEnabled = false;
  saveAlertSettings(db, settings);

  // Trigger a low bank alert + open checklist reminder + vault hygiene alert
  createAccount(db, {
    name: 'Family Joint',
    type: 'bank',
    scope: 'family',
    institution: 'SBI',
    last4: '7777',
    openingBalanceMinor: 100_000, // ₹1,000
    minBalanceMinor: 500_000, // ₹5,000 target
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });

  const note = upsertNote(db, null, {
    title: 'Monthly GST Checklist',
    body: 'Verify invoices',
    scope: 'business',
    pinned: true,
    remindAt: '2026-11-12T03:00:00Z',
    checklist: [
      { text: 'Export sales CSV', done: false },
      { text: 'Pay challan', done: true },
    ],
  });

  // Encrypted vault entry (ciphertext must NEVER appear in alerts)
  upsertVaultEntry(db, {
    label: 'Corporate Banking Login',
    category: 'Finance',
    iv: 'iv-secret-marker',
    ciphertext: 'SUPER_SECRET_CIPHER_BLOB_XYZ',
    lastRotatedAt: '2025-01-01',
  });
  recordVaultSecurityEvent(db, 'failed_unlock', 'bad pass');
  recordVaultSecurityEvent(db, 'failed_unlock', 'bad pass');
  recordVaultSecurityEvent(db, 'failed_unlock', 'bad pass');

  const now = new Date('2026-11-12T10:00:00+05:30');
  const firstRun = await runAlertCycle(db, transport, now);
  assert.ok(firstRun.sentWhatsApp >= 4);

  // Second run in the same window must send 0 duplicates!
  const countAfterFirst = transport.sent.length;
  const secondRun = await runAlertCycle(db, transport, now);
  assert.equal(secondRun.sentWhatsApp, 0);
  assert.equal(transport.sent.length, countAfterFirst);

  // Ensure ZERO vault ciphertext ever leaked into any WhatsApp message
  for (const msg of transport.sent) {
    assert.equal(msg.text.includes('SUPER_SECRET_CIPHER_BLOB_XYZ'), false);
    assert.equal(msg.text.includes('iv-secret-marker'), false);
  }

  // Completing the remaining checklist item stops future un-fired checklist alerts
  const updated = toggleChecklistItem(db, note.id, note.checklist[0].id, true)!;
  assert.equal(updated.checklist.every((c) => c.done), true);

  db.close();
});

test('HTTP server validates input boundaries and exposes security headers', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');

    const badVoice = await fetch(`${baseUrl}/api/agent/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: '', mimeType: '' }),
    });
    assert.equal(badVoice.status, 422);

    const badTx = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'expense', amountMinor: -50 }),
    });
    assert.equal(badTx.status, 422);
    const errBody = (await badTx.json()) as { error: { code: string } };
    assert.equal(errBody.error.code, 'VALIDATION_ERROR');
  } finally {
    server.close();
    db.close();
  }
});

test('morning digest bundles regular alerts and respects quiet hours', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();

  const settings = getAlertSettings(db);
  settings.recipientPhone = '9876543210';
  settings.quietStartHour = 22;
  settings.quietEndHour = 8;
  settings.morningDigestEnabled = true;
  settings.morningDigestHour = 9;
  settings.enabledModules.advisor = false;
  saveAlertSettings(db, settings);

  // Two non-urgent warnings (CC utilization + upcoming CC bill)
  const card = createAccount(db, {
    name: 'HDFC Millennia',
    type: 'credit_card',
    scope: 'personal',
    institution: 'HDFC',
    last4: '5511',
    openingBalanceMinor: 8_000_000, // ₹80,000
    minBalanceMinor: 0,
    creditLimitMinor: 10_000_000, // 80% utilization >= 75%
    statementDay: 10,
    dueDay: 14,
  });
  assert.ok(card.id);

  // At 23:00 (quiet hours), regular alerts stay queued and urgent alerts only fire if urgent
  const quietRun = await runAlertCycle(db, transport, new Date('2026-11-12T23:00:00+05:30'));
  assert.equal(quietRun.suppressedQuietHours, true);
  assert.equal(quietRun.sentWhatsApp, 0);

  // At 09:30 AM (past morningDigestHour), both regular warnings bundle into 1 WhatsApp digest message
  const digestRun = await runAlertCycle(db, transport, new Date('2026-11-12T09:30:00+05:30'));
  assert.equal(digestRun.suppressedQuietHours, false);
  assert.equal(digestRun.sentWhatsApp, 2);
  assert.equal(transport.sent.length, 1);
  assert.ok(transport.sent[0].text.includes('Personal Ledger Daily Summary'));

  db.close();
});

test('AI Agent understands Bengali, Hindi, and English commands and strictly executes in active System Language', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();

  const bank = createAccount(db, {
    name: 'HDFC Personal',
    type: 'bank',
    scope: 'personal',
    institution: 'HDFC',
    last4: '1111',
    openingBalanceMinor: 1_000_000, // ₹10,000
    minBalanceMinor: 0,
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });
  assert.ok(bank.id);

  // 1. System Language = English, Command = Bengali script + Bengali numerals
  updateAppPreferences(db, { systemLanguage: 'en', agentAutoExecute: true });
  const res1 = await processAgentCommand(db, transport, {
    commandText: 'রাহুলের কাছে ১৫০০ টাকা পাবো যোগ করো',
  });
  assert.equal(res1.detectedLanguage, 'bn');
  assert.equal(res1.systemLanguage, 'en');
  assert.ok(res1.replyText.includes('Need from'));
  assert.ok(res1.replyText.includes('1,500'));
  const dues = listPeopleDues(db);
  assert.equal(dues.length, 1);
  assert.equal(dues[0].amountMinor, 150_000);
  assert.equal(dues[0].direction, 'need');

  // 2. Switch System Language to Bengali, Command = Hindi script + Devanagari numerals
  updateAppPreferences(db, { systemLanguage: 'bn', agentAutoExecute: true });
  const res2 = await processAgentCommand(db, transport, {
    commandText: 'आज पर्सनल में ५०० रुपये खाना खर्च लिखो',
  });
  assert.equal(res2.detectedLanguage, 'hi');
  assert.equal(res2.systemLanguage, 'bn');
  assert.ok(/[\u0980-\u09FF]/.test(res2.replyText)); // Response strictly in Bengali!
  assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, 950_000); // ₹9,500

  // 3. Switch System Language to Hindi, Command = English checklist creation
  updateAppPreferences(db, { systemLanguage: 'hi', agentAutoExecute: true });
  const res3 = await processAgentCommand(db, transport, {
    commandText: 'Add checklist Bank Errands: update KYC, pay electricity',
  });
  assert.equal(res3.detectedLanguage, 'en');
  assert.equal(res3.systemLanguage, 'hi');
  assert.ok(/[\u0900-\u097F]/.test(res3.replyText)); // Response strictly in Hindi!
  assert.equal(listNotes(db)[0].checklist.length, 2);

  // 4. Destructive undo command asks confirmation in System Language (Hindi) before deleting
  const confirmReq = await processAgentCommand(db, transport, {
    commandText: 'delete last transaction',
  });
  assert.equal(confirmReq.requiresConfirmation, true);
  assert.equal(confirmReq.systemLanguage, 'hi');
  assert.ok(/[\u0900-\u097F]/.test(confirmReq.replyText));
  assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, 950_000); // not deleted yet

  const confirmExec = await processAgentCommand(db, transport, {
    commandText: 'delete last transaction',
    confirmExecution: true,
    pendingCalls: confirmReq.toolCalls,
  });
  assert.equal(confirmExec.requiresConfirmation, false);
  assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, 1_000_000); // undone!

  // 5. Banglish query & Romanized Web-Speech style due execute cleanly in Hindi System Language
  const banglishQuery = await processAgentCommand(db, transport, {
    commandText: 'amar bank balance koto?',
  });
  assert.equal(banglishQuery.detectedLanguage, 'bn');
  assert.equal(banglishQuery.systemLanguage, 'hi');
  assert.ok(/[\u0900-\u097F]/.test(banglishQuery.replyText));

  const romanizedVoiceDue = await processAgentCommand(db, transport, {
    commandText: 'karim er kache 800 taka pabo',
  });
  assert.equal(romanizedVoiceDue.detectedLanguage, 'bn');
  assert.equal(romanizedVoiceDue.systemLanguage, 'hi');
  const latestDue = listPeopleDues(db)[0];
  assert.equal(latestDue.amountMinor, 80_000);
  assert.equal(latestDue.direction, 'need');

  // 5b. Spoken Bengali/Hindi polite forms & STT navigation/card-create phrasing
  const navReport = await processAgentCommand(db, transport, {
    commandText: 'রিপোর্ট খুলুন',
  });
  assert.equal(navReport.uiEffects.navigateTab, 'reports');
  const navDash = await processAgentCommand(db, transport, {
    commandText: 'dashboard colon',
  });
  assert.equal(navDash.uiEffects.navigateTab, 'dashboard');
  const addCardBn = await processAgentCommand(db, transport, {
    commandText: 'মানিব্যাগ ক্রেডিট কার্ড এড করুন',
  });
  assert.equal(addCardBn.actions[0].tool, 'create_account');
  assert.equal(addCardBn.actions[0].ok, true);

  // 6. Vault Zero-Knowledge Guard never leaks secrets
  const res4 = await processAgentCommand(db, transport, {
    commandText: 'Show my bank password from Vault',
  });
  assert.equal(res4.uiEffects.navigateTab, 'vault');
  assert.equal(res4.actions[0].ok, false);

  db.close();
});

test('Password Vault WebCrypto PBKDF2/AES-GCM, HTTP lifecycle, and zero-knowledge storage hold', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Browser-equivalent WebCrypto key derivation + canary creation
    const saltB64 = generateSaltB64();
    const rightKey = await deriveVaultKey('MyStrongVaultPass#2026', saltB64);
    const wrongKey = await deriveVaultKey('WrongPass123', saltB64);
    const { canaryIv, canaryCt } = await createCanary(rightKey);

    assert.equal(await verifyCanary(rightKey, canaryIv, canaryCt), true);
    assert.equal(await verifyCanary(wrongKey, canaryIv, canaryCt), false);

    // 2. Initialize vault meta once; second attempt must be rejected with 409 Conflict
    const initRes = await fetch(`${baseUrl}/api/vault/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saltB64, canaryIv, canaryCt }),
    });
    assert.equal(initRes.status, 200);

    const dupInitRes = await fetch(`${baseUrl}/api/vault/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saltB64, canaryIv, canaryCt }),
    });
    assert.equal(dupInitRes.status, 409);

    // 3. Encrypt payload client-side & save via API
    const secretPw = generateStrongPassword(18);
    assert.equal(secretPw.length, 18);
    const enc = await encryptVaultPayload(rightKey, {
      username: 'rahul_hdfc_01',
      password: secretPw,
      url: 'https://netbanking.hdfcbank.com',
      notes: 'TOTP backup 9912',
    });
    assert.equal(enc.ciphertext.includes(secretPw), false);
    assert.equal(enc.ciphertext.includes('rahul_hdfc_01'), false);

    const createRes = await fetch(`${baseUrl}/api/vault/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'HDFC NetBanking',
        category: 'Banking',
        iv: enc.iv,
        ciphertext: enc.ciphertext,
        lastRotatedAt: '2026-11-12',
      }),
    });
    assert.equal(createRes.status, 201);
    const created = ((await createRes.json()) as { data: { id: string; iv: string; ciphertext: string } }).data;

    // 4. Verify decrypt succeeds with right key & fails with wrong key
    const decrypted = await decryptVaultPayload(rightKey, created.iv, created.ciphertext);
    assert.equal(decrypted.username, 'rahul_hdfc_01');
    assert.equal(decrypted.password, secretPw);
    assert.equal(decrypted.url, 'https://netbanking.hdfcbank.com');
    await assert.rejects(() => decryptVaultPayload(wrongKey, created.iv, created.ciphertext));

    // 5. Security events + WhatsApp brute-force check after 3 failed unlocks
    const s = saveAlertSettings(db, {
      recipientPhone: '9876543210',
      quietStartHour: 22,
      quietEndHour: 8,
      morningDigestEnabled: false,
      morningDigestHour: 9,
      twoWayCommandsEnabled: true,
      leadDaysCreditCard: 3,
      leadDaysLoan: 3,
      leadDaysDue: 2,
      cardUtilizationThresholdPct: 75,
      vaultRotationDays: 90,
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
    });
    assert.ok(s.recipientPhone);

    for (let i = 0; i < 3; i++) {
      const ev = await fetch(`${baseUrl}/api/vault/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'failed_unlock', detail: 'Wrong password test' }),
      });
      assert.equal(ev.status, 200);
    }
    assert.equal(transport.sent.length >= 1, true);
    assert.equal(transport.sent.some((m) => m.text.includes(secretPw)), false);

    // 6. Delete entry cleanly
    const delRes = await fetch(`${baseUrl}/api/vault/entries/${created.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
  } finally {
    server.close();
    db.close();
  }
});

test('Milestone 1: DELETE reversal for loan/due tx, scope budget isolation, PATCH edits, backup restore, and vault rekey', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Cross-scope dashboard isolation vs allMonthExpenseByScope
    const pBank = createAccount(db, {
      name: 'Personal HDFC',
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC',
      last4: '1111',
      openingBalanceMinor: 5_000_000,
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });
    const bBank = createAccount(db, {
      name: 'Biz ICICI',
      type: 'bank',
      scope: 'business',
      institution: 'ICICI',
      last4: '2222',
      openingBalanceMinor: 5_000_000,
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });
    upsertScopeBudget(db, 'personal', 1_000_000);
    upsertScopeBudget(db, 'business', 2_000_000);

    const today = new Date().toISOString().slice(0, 10);
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: pBank.id,
      category: 'Food',
      amountMinor: 25_000,
      occurredAt: today,
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'business',
      accountId: bBank.id,
      category: 'Software',
      amountMinor: 120_000,
      occurredAt: today,
    });

    const filteredDash = getDashboardSummary(db, 'personal', today);
    assert.equal(filteredDash.allMonthExpenseByScope.personal, 25_000);
    assert.equal(filteredDash.allMonthExpenseByScope.business, 120_000);
    assert.equal(filteredDash.monthTopCategories.length, 1);
    assert.equal(filteredDash.monthTopCategories[0].category, 'Food');

    // 2. Atomic deleteTransaction reversal on linked Loan EMI & Due settlement
    const loan = createLoan(db, {
      name: 'Bike Loan',
      counterparty: 'HDFC',
      scope: 'personal',
      direction: 'borrowed',
      principalMinor: 500_000,
      annualRateBps: 0,
      tenureMonths: 5,
      emiMinor: 500_000,
      startDate: '2026-10-01',
      nextDueDate: '2026-11-01',
      linkedAccountId: pBank.id,
    });
    const payRes = recordLoanPayment(db, loan.id, {
      amountMinor: 500_000,
      accountId: pBank.id,
      paidAt: today,
    });
    assert.equal(payRes.loan.remainingMinor, 0);
    assert.equal(payRes.loan.status, 'closed');

    deleteTransaction(db, payRes.transaction.id);
    const restoredLoan = listLoans(db).find((l) => l.id === loan.id)!;
    assert.equal(restoredLoan.remainingMinor, 500_000);
    assert.equal(restoredLoan.status, 'active');

    const due = createPersonDue(db, {
      personName: 'Ramesh',
      direction: 'need',
      scope: 'personal',
      amountMinor: 40_000,
    });
    const setRes = settlePersonDue(db, due.id, {
      amountMinor: 40_000,
      accountId: pBank.id,
      settledAt: today,
    });
    assert.equal(setRes.due.status, 'settled');
    deleteTransaction(db, setRes.transaction!.id);
    const restoredDue = listPeopleDues(db).find((d) => d.id === due.id)!;
    assert.equal(restoredDue.settledMinor, 0);
    assert.equal(restoredDue.status, 'open');

    // 3. PATCH routes across Accounts, Transactions, Recurring Bills, Loans, and Dues
    const accPatch = await fetch(`${baseUrl}/api/accounts/${pBank.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Personal HDFC Updated' }),
    });
    assert.equal(accPatch.status, 200);
    assert.equal(getAccountById(db, pBank.id)!.name, 'Personal HDFC Updated');

    const txCreate = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'expense',
        scope: 'personal',
        accountId: pBank.id,
        category: 'Groceries',
        amountMinor: 10_000,
        occurredAt: today,
      }),
    });
    const createdTx = ((await txCreate.json()) as { data: { id: string } }).data;
    const txPatch = await fetch(`${baseUrl}/api/transactions/${createdTx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'expense',
        scope: 'personal',
        accountId: pBank.id,
        category: 'Supermarket',
        amountMinor: 15_000,
        occurredAt: today,
      }),
    });
    assert.equal(txPatch.status, 200);
    assert.equal(((await txPatch.json()) as { data: { amountMinor: number; category: string } }).data.category, 'Supermarket');

    const recCreate = await fetch(`${baseUrl}/api/recurring-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Fiber Internet',
        scope: 'personal',
        kind: 'expense',
        accountId: pBank.id,
        category: 'Utilities',
        amountMinor: 99_900,
        dueDay: 10,
      }),
    });
    const recCreated = ((await recCreate.json()) as { data: { id: string } }).data;
    const recPatch = await fetch(`${baseUrl}/api/recurring-bills/${recCreated.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Jio Fiber', amountMinor: 117_900 }),
    });
    assert.equal(recPatch.status, 200);
    assert.equal(((await recPatch.json()) as { data: { title: string } }).data.title, 'Jio Fiber');

    const loanPatch = await fetch(`${baseUrl}/api/loans/${loan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bike Loan Revised', emiMinor: 100_000 }),
    });
    assert.equal(loanPatch.status, 200);

    const duePatch = await fetch(`${baseUrl}/api/dues/${due.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMinor: 60_000, note: 'Updated split' }),
    });
    assert.equal(duePatch.status, 200);

    // 4. Vault rekey & missing-entry 400 guard
    const oldSalt = generateSaltB64();
    const oldKey = await deriveVaultKey('OldSecret#11', oldSalt);
    const oldCanary = await createCanary(oldKey);
    await fetch(`${baseUrl}/api/vault/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saltB64: oldSalt, ...oldCanary }),
    });
    const vEnc = await encryptVaultPayload(oldKey, {
      username: 'user1',
      password: 'OldEntryPassword!',
      url: 'https://example.com',
      notes: '',
    });
    const vCreateRes = await fetch(`${baseUrl}/api/vault/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Portal',
        category: 'Work',
        iv: vEnc.iv,
        ciphertext: vEnc.ciphertext,
        lastRotatedAt: today,
      }),
    });
    assert.equal(vCreateRes.status, 201);
    const vCreated = ((await vCreateRes.json()) as { data: { id: string } }).data;

    const newSalt = generateSaltB64();
    const newKey = await deriveVaultKey('NewMasterKey#99', newSalt);
    const newCanary = await createCanary(newKey);
    const partialRekey = await fetch(`${baseUrl}/api/vault/rekey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saltB64: newSalt, ...newCanary, entries: [] }),
    });
    assert.equal(partialRekey.status, 400);

    const reEnc = await encryptVaultPayload(newKey, {
      username: 'user1',
      password: 'OldEntryPassword!',
      url: 'https://example.com',
      notes: '',
    });
    const fullRekey = await fetch(`${baseUrl}/api/vault/rekey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saltB64: newSalt,
        ...newCanary,
        entries: [
          {
            id: vCreated.id,
            label: 'Portal',
            category: 'Work',
            iv: reEnc.iv,
            ciphertext: reEnc.ciphertext,
            lastRotatedAt: today,
          },
        ],
      }),
    });
    assert.equal(fullRekey.status, 200);

    // 5. Full Backup Export -> Restore Roundtrip on second isolated server/DB + 422 guard
    const snapshot = await (await fetch(`${baseUrl}/api/backup.json`)).json();

    const db2 = openDatabase(':memory:');
    const server2 = createAppServer({ db: db2, transport: new MockWhatsAppTransport() });
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', resolve));
    const baseUrl2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
    try {
      const badRestore = await fetch(`${baseUrl2}/api/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: 'not-an-array' }),
      });
      assert.equal(badRestore.status, 422);

      const goodRestore = await fetch(`${baseUrl2}/api/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      assert.equal(goodRestore.status, 200);
      assert.equal(getAccountById(db2, pBank.id)!.name, 'Personal HDFC Updated');
      assert.equal(listLoans(db2).find((l) => l.id === loan.id)!.name, 'Bike Loan Revised');
    } finally {
      server2.close();
      db2.close();
    }
  } finally {
    server.close();
    db.close();
  }
});

test('Milestone 2: Keep notes migration, color/archive behavior, alert exclusion, legacy backup restore, and multi-secret vault payload', async () => {
  // 1. migrateSchema upgrades legacy notes table lacking color & archived columns without data loss
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-m2-'));
  const tmpDbPath = path.join(tmpDir, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(tmpDbPath);
    legacy.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        remind_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO notes (id, title, body, scope, pinned, remind_at, created_at, updated_at)
      VALUES ('n-legacy', 'Old Note', 'Keep me safe', 'personal', 1, NULL, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
    `);
    legacy.close();

    const migratedDb = openDatabase(tmpDbPath);
    const notesAfterMigrate = listNotes(migratedDb);
    assert.equal(notesAfterMigrate.length, 1);
    assert.equal(notesAfterMigrate[0].title, 'Old Note');
    assert.equal(notesAfterMigrate[0].color, 'default');
    assert.equal(notesAfterMigrate[0].archived, false);
    migratedDb.close();
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }

  // 2. HTTP Keep color & archive roundtrip + dashboard exclusion + scheduler exclusion + legacy backup restore
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const s = getAlertSettings(db);
  s.recipientPhone = '9876543210';
  s.morningDigestEnabled = false;
  s.quietStartHour = 23;
  s.quietEndHour = 5;
  saveAlertSettings(db, s);

  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const createRes = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Keep Tax Checklist',
        body: '',
        scope: 'business',
        color: 'honey',
        pinned: true,
        archived: false,
        remindAt: '2026-11-12T03:00:00Z',
        checklist: [{ text: 'File GSTR-3B', done: false }],
      }),
    });
    assert.equal(createRes.status, 201);
    const createdNote = ((await createRes.json()) as { data: { id: string; color: string; archived: boolean } }).data;
    assert.equal(createdNote.color, 'honey');
    assert.equal(createdNote.archived, false);

    // Pinned active note appears on dashboard
    const dashActive = (await (await fetch(`${baseUrl}/api/dashboard`)).json()) as {
      pinnedNotes: Array<{ id: string }>;
    };
    assert.equal(dashActive.pinnedNotes.some((n) => n.id === createdNote.id), true);

    // Archive it via PUT -> disappears from dashboard pinnedNotes & skipped by scheduler alerts
    const archRes = await fetch(`${baseUrl}/api/notes/${createdNote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Keep Tax Checklist',
        body: '',
        scope: 'business',
        color: 'honey',
        pinned: true,
        archived: true,
        remindAt: '2026-11-12T03:00:00Z',
        checklist: [{ text: 'File GSTR-3B', done: false }],
      }),
    });
    assert.equal(archRes.status, 200);
    assert.equal(((await archRes.json()) as { data: { archived: boolean } }).data.archived, true);

    const dashArchived = (await (await fetch(`${baseUrl}/api/dashboard`)).json()) as {
      pinnedNotes: Array<{ id: string }>;
    };
    assert.equal(dashArchived.pinnedNotes.some((n) => n.id === createdNote.id), false);

    const alertRun = await runAlertCycle(db, transport, new Date('2026-11-12T10:00:00+05:30'));
    assert.equal(alertRun.sentWhatsApp, 0);

    // Legacy backup payload without color/archived fields restores cleanly
    const legacySnapshot = {
      exportedAt: '2026-11-12T00:00:00Z',
      accounts: [],
      transactions: [],
      recurringBills: [],
      scopeBudgets: [],
      loans: [],
      peopleDues: [],
      notes: [
        {
          id: 'restored-1',
          title: 'Pre-Keep Note',
          body: 'Legacy format note',
          scope: 'personal',
          pinned: false,
          remindAt: null,
          checklist: [{ id: 'c1', text: 'Verify', done: true, sortOrder: 0 }],
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ],
      vaultMeta: null,
      vaultEntriesCiphertextOnly: [],
    };
    const restoreRes = await fetch(`${baseUrl}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacySnapshot),
    });
    assert.equal(restoreRes.status, 200);
    const restoredNotes = listNotes(db);
    assert.equal(restoredNotes.length, 1);
    assert.equal(restoredNotes[0].color, 'default');
    assert.equal(restoredNotes[0].archived, false);

    // 3. Multi-secret & Legacy Vault payload encryption roundtrip
    const saltB64 = generateSaltB64();
    const key = await deriveVaultKey('MultiSecretMaster#2026', saltB64);
    const encMulti = await encryptVaultPayload(key, {
      username: 'corp_admin',
      password: 'CurrentLogin#99',
      url: 'https://bank.example.com',
      notes: 'Branch #042',
      starred: true,
      secrets: [
        { id: 's1', label: 'Transaction Password', value: 'TxnPass#882', kind: 'password' },
        { id: 's2', label: 'ATM PIN', value: '4910', kind: 'pin' },
        { id: 's3', label: 'UPI MPIN', value: '771209', kind: 'pin' },
      ],
      legacyHistory: [
        {
          id: 'l1',
          label: 'Previous Login Password',
          value: 'OldLogin#2025',
          archivedAt: '2026-10-15',
          note: 'Rotated Q4',
        },
      ],
    });
    assert.equal(encMulti.ciphertext.includes('TxnPass#882'), false);
    assert.equal(encMulti.ciphertext.includes('4910'), false);
    assert.equal(encMulti.ciphertext.includes('OldLogin#2025'), false);

    const decMulti = await decryptVaultPayload(key, encMulti.iv, encMulti.ciphertext);
    assert.equal(decMulti.starred, true);
    assert.equal(decMulti.secrets?.length, 3);
    assert.equal(decMulti.secrets?.[1].label, 'ATM PIN');
    assert.equal(decMulti.secrets?.[1].value, '4910');
    assert.equal(decMulti.legacyHistory?.length, 1);
    assert.equal(decMulti.legacyHistory?.[0].value, 'OldLogin#2025');
  } finally {
    server.close();
    db.close();
  }
});

test('Personal AI Assistant & Advisor: diagnostics, 30-day cash prediction, multi-task workload, and cleanup automation', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // Low balance bank + over-utilized card + completed checklist + open checklist + stale vault entry
    const bank = createAccount(db, {
      name: 'HDFC Main',
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC',
      last4: '1111',
      openingBalanceMinor: 200_000, // ₹2,000 (below minBalance ₹5,000!)
      minBalanceMinor: 500_000,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });
    const card = createAccount(db, {
      name: 'Axis Gold',
      type: 'credit_card',
      scope: 'personal',
      institution: 'Axis',
      last4: '9999',
      openingBalanceMinor: 0,
      minBalanceMinor: 0,
      creditLimitMinor: 1_000_000, // ₹10,000
      statementDay: 10,
      dueDay: 14,
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: card.id,
      category: 'Shopping',
      amountMinor: 850_000, // ₹8,500 billed on Oct 20 -> 85% utilization & due soon
      occurredAt: '2026-10-20',
    });
    upsertScopeBudget(db, 'personal', 500_000);
    upsertVaultEntry(db, {
      label: 'Old Bank Login',
      category: 'Banking',
      iv: 'iv-1',
      ciphertext: 'SECRET_SHOULD_NEVER_LEAK',
      lastRotatedAt: '2025-01-01',
    });

    // Completed checklist (eligible for auto-archive) + Open checklist (must remain active)
    upsertNote(db, null, {
      title: 'Finished Chores',
      body: '',
      scope: 'personal',
      pinned: false,
      archived: false,
      checklist: [{ text: 'Done task', done: true }],
    });
    upsertNote(db, null, {
      title: 'Pending Errands',
      body: '',
      scope: 'personal',
      pinned: true,
      archived: false,
      checklist: [{ text: 'Open task', done: false }],
    });

    // 1. HTTP GET /api/agent/briefing returns diagnostic risks, 30d shortfall prediction & actionable suggestions
    const briefRes = await fetch(`${baseUrl}/api/agent/briefing`);
    assert.equal(briefRes.status, 200);
    const brief = ((await briefRes.json()) as {
      data: {
        healthScore: number;
        status: string;
        projected30dBalanceMinor: number;
        completedChecklistNotes: number;
        whatsWrong: Array<{ module: string; title: string }>;
        predictions: Array<{ id: string }>;
        suggestions: Array<{ commandText: string }>;
      };
    }).data;

    assert.ok(brief.healthScore < 70);
    assert.ok(brief.status === 'watch' || brief.status === 'critical');
    assert.equal(brief.projected30dBalanceMinor < 0, true); // ₹2,000 cash vs ₹8,500 card bill
    assert.equal(brief.completedChecklistNotes, 1);
    assert.equal(brief.whatsWrong.some((w) => w.module === 'banks'), true);
    assert.equal(brief.whatsWrong.some((w) => w.module === 'vault'), true);
    assert.equal(brief.suggestions.some((s) => s.commandText === 'archive completed notes'), true);
    assert.equal(JSON.stringify(brief).includes('SECRET_SHOULD_NEVER_LEAK'), false);

    // 2. Multilingual advisor command executes in Bengali when systemLanguage='bn'
    updateAppPreferences(db, { systemLanguage: 'bn', agentAutoExecute: true });
    const bnAdv = await processAgentCommand(db, transport, {
      commandText: 'what is wrong and predict future',
    });
    assert.ok(/[\u0980-\u09FF]/.test(bnAdv.replyText));
    assert.ok(bnAdv.suggestions && bnAdv.suggestions.length > 0);

    // 3. Compound multi-task workload executes transaction + archive completed notes + briefing in one shot!
    updateAppPreferences(db, { systemLanguage: 'en', agentAutoExecute: true });
    const compound = await processAgentCommand(db, transport, {
      commandText: 'Spend 100 tea on HDFC Main; archive completed notes; assess my finances',
    });
    assert.equal(compound.actions.length, 3);
    assert.equal(compound.actions.every((a) => a.ok), true);
    assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, 190_000); // ₹2,000 - ₹100
    const activeNotesLeft = listNotes(db, { includeArchived: false });
    assert.equal(activeNotesLeft.length, 1);
    assert.equal(activeNotesLeft[0].title, 'Pending Errands');
    const archivedNotesNow = listNotes(db, { includeArchived: true }).filter((n) => n.archived);
    assert.equal(archivedNotesNow.length, 1);
    assert.equal(archivedNotesNow[0].title, 'Finished Chores');
  } finally {
    server.close();
    db.close();
  }
});

test('6-pillar financial intelligence: 2-way WhatsApp, SMS/CSV import, subscription leaks, debt payoff, goals & runway, receipt parse', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Seed bank + card + multi-month transactions + 2 borrowed loans
    const bank = createAccount(db, {
      name: 'HDFC Savings',
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC',
      last4: '1234',
      openingBalanceMinor: 10_000_000, // ₹1,00,000
      minBalanceMinor: 500_000,
      creditLimitMinor: 0,
      statementDay: 1,
      dueDay: 1,
    });
    const card = createAccount(db, {
      name: 'ICICI Coral',
      type: 'credit_card',
      scope: 'personal',
      institution: 'ICICI',
      last4: '5678',
      openingBalanceMinor: 0,
      minBalanceMinor: 0,
      creditLimitMinor: 5_000_000,
      statementDay: 15,
      dueDay: 5,
    });

    // Seed card debt ₹15,000 (36% default APR) + 2 loans with different APRs
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: card.id,
      category: 'Shopping',
      amountMinor: 1_500_000,
      occurredAt: '2026-10-10',
      party: 'Amazon',
    });
    // Multi-month Netflix subscription with a +31% price hike in latest month!
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: bank.id,
      category: 'Subscriptions & SaaS',
      amountMinor: 49_900, // ₹499
      occurredAt: '2026-08-05',
      party: 'Netflix',
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: bank.id,
      category: 'Subscriptions & SaaS',
      amountMinor: 49_900, // ₹499
      occurredAt: '2026-09-05',
      party: 'Netflix',
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: bank.id,
      category: 'Subscriptions & SaaS',
      amountMinor: 64_900, // ₹649 (+30.1% price hike!)
      occurredAt: '2026-10-05',
      party: 'Netflix',
    });

    createLoan(db, {
      name: 'Personal Loan',
      counterparty: 'Bajaj',
      scope: 'personal',
      direction: 'borrowed',
      principalMinor: 5_000_000,
      annualRateBps: 1600, // 16%
      tenureMonths: 12,
      emiMinor: 453_700,
      startDate: '2026-01-01',
      nextDueDate: '2026-11-05',
      linkedAccountId: bank.id,
    });
    createLoan(db, {
      name: 'Bike Loan',
      counterparty: 'HDFC',
      scope: 'personal',
      direction: 'borrowed',
      principalMinor: 3_000_000,
      annualRateBps: 900, // 9%
      tenureMonths: 12,
      emiMinor: 262_400,
      startDate: '2026-01-01',
      nextDueDate: '2026-11-10',
      linkedAccountId: bank.id,
    });

    // 1. Subscription Leak & Price Hike Detector API
    const subRes = await fetch(`${baseUrl}/api/agent/subscriptions`);
    assert.equal(subRes.status, 200);
    const leaks = ((await subRes.json()) as { data: Array<{ title: string; isPriceHike: boolean; priceHikePct: number }> }).data;
    assert.equal(leaks.some((l) => l.title.toLowerCase().includes('netflix') && l.isPriceHike && l.priceHikePct >= 25), true);

    // 2. Debt Payoff Optimizer (Avalanche vs Snowball)
    const avRes = await fetch(`${baseUrl}/api/planner/debt-payoff?strategy=avalanche&extraMinor=500000`);
    assert.equal(avRes.status, 200);
    const av = ((await avRes.json()) as {
      data: {
        strategy: string;
        monthsSaved: number;
        interestSavedMinor: number;
        items: Array<{ name: string; aprBps: number; payoffOrder: number }>;
      };
    }).data;
    assert.equal(av.strategy, 'avalanche');
    assert.ok(av.monthsSaved > 0);
    assert.ok(av.interestSavedMinor > 0);
    // Highest APR (ICICI card 3600 bps) comes before 1600 bps Loan which comes before 900 bps Bike Loan
    assert.equal(av.items[0].aprBps >= av.items[1].aprBps, true);
    assert.equal(av.items[1].aprBps >= av.items[2].aprBps, true);

    // 3. Bank SMS & CSV Auto-Importer (with duplicate detection + batch commit)
    const csvAndDuplicateRes = await fetch(`${baseUrl}/api/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultAccountId: bank.id,
        text: [
          'Date,Description,Debit,Credit',
          '2026-10-05,Netflix,649.00,', // Duplicate of existing Oct 5 ₹649 Netflix tx!
          '2026-10-18,Swiggy Order,450.00,',
          '2026-10-19,Client Retainer,,2500.00',
        ].join('\n'),
      }),
    });
    assert.equal(csvAndDuplicateRes.status, 200);
    const csvRows = ((await csvAndDuplicateRes.json()) as { data: Array<Record<string, unknown> & { isDuplicate: boolean; party: string; kind: string; amountMinor: number }> }).data;
    assert.equal(csvRows.length, 3);
    assert.equal(csvRows[0].isDuplicate, true);
    assert.equal(csvRows[1].isDuplicate, false);
    assert.equal(csvRows[1].kind, 'expense');
    assert.equal(csvRows[2].kind, 'income');

    // Also verify SMS parser matches A/c last4 automatically
    const smsRes = await fetch(`${baseUrl}/api/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Rs. 1200.00 debited from A/c xx1234 on 20-10-2026 at Zomato UPI',
      }),
    });
    assert.equal(smsRes.status, 200);
    const smsRows = ((await smsRes.json()) as { data: Array<{ accountId: string; amountMinor: number; kind: string; category: string }> }).data;
    assert.equal(smsRows.length, 1);
    assert.equal(smsRows[0].accountId, bank.id);
    assert.equal(smsRows[0].amountMinor, 120_000);
    assert.equal(smsRows[0].kind, 'expense');
    assert.equal(smsRows[0].category, 'Food & Dining');

    const balBeforeCommit = getAccountById(db, bank.id)!.currentBalanceMinor;
    const commitRes = await fetch(`${baseUrl}/api/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [csvRows[1], csvRows[2]] }),
    });
    assert.equal(commitRes.status, 201);
    const balAfterCommit = getAccountById(db, bank.id)!.currentBalanceMinor;
    assert.equal(balAfterCommit, balBeforeCommit - 45_000 + 250_000);

    // 4. Savings Goals, Tax Reserve & Emergency Runway + Backup/Restore (including legacy compatibility)
    const gCreate = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'GST Tax Reserve',
        kind: 'tax_reserve',
        scope: 'business',
        targetMinor: 5_000_000,
        currentMinor: 1_000_000,
        targetDate: '2026-12-31',
      }),
    });
    assert.equal(gCreate.status, 201);
    const goalId = ((await gCreate.json()) as { data: { id: string } }).data.id;

    const gContrib = await fetch(`${baseUrl}/api/goals/${goalId}/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMinor: 500_000, recordAsExpense: false }),
    });
    assert.equal(gContrib.status, 200);
    const goalsRes = await fetch(`${baseUrl}/api/goals`);
    const goalsData = ((await goalsRes.json()) as { data: { taxReserveMinor: number; goals: Array<{ currentMinor: number }> } }).data;
    assert.equal(goalsData.taxReserveMinor, 1_500_000);

    const snap = exportFullSnapshotJSON(db);
    assert.equal(snap.savingsGoals.length, 1);
    const legacySnap = { ...snap } as Record<string, unknown>;
    delete legacySnap.savingsGoals;
    const legacyDb = openDatabase(':memory:');
    const restoredLegacy = restoreFullSnapshotJSON(legacyDb, legacySnap);
    assert.equal(restoredLegacy.counts.savingsGoals, 0);
    legacyDb.close();

    // 5. Smart Receipt Parse (offline text extraction + clean error when image sent without vision API key)
    const rcTextRes = await fetch(`${baseUrl}/api/receipt/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiptText: 'DMART RETAIL STORE\nDate: 19/10/2026\nMilk 120.00\nGrand Total: Rs. 1,450.50\nThank you!',
      }),
    });
    assert.equal(rcTextRes.status, 200);
    const rcData = ((await rcTextRes.json()) as { data: { amountMinor: number; occurredAt: string; category: string } }).data;
    assert.equal(rcData.amountMinor, 145_050);
    assert.equal(rcData.occurredAt, '2026-10-19');
    assert.equal(rcData.category, 'Shopping & Groceries');

    const rcImgNoKey = await fetch(`${baseUrl}/api/receipt/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
      }),
    });
    assert.equal(rcImgNoKey.status, 400);

    // 6. Agent NLU for new capabilities
    updateAppPreferences(db, { systemLanguage: 'en', agentAutoExecute: true });
    const nluGoal = await processAgentCommand(db, transport, {
      commandText: 'create emergency fund 200000',
    });
    assert.equal(nluGoal.actions.every((a) => a.ok), true);
    const nluPlan = await processAgentCommand(db, transport, {
      commandText: 'debt payoff plan with extra 5000',
    });
    assert.ok(nluPlan.replyText.toLowerCase().includes('avalanche'));

    // 7. Two-way WhatsApp command bridge (authorized sender allowed, unauthorized ignored, confirm gate enforced)
    saveAlertSettings(db, {
      recipientPhone: '9876543210',
      quietStartHour: 0,
      quietEndHour: 0,
      morningDigestEnabled: false,
      morningDigestHour: 9,
      twoWayCommandsEnabled: true,
      leadDaysCreditCard: 3,
      leadDaysLoan: 3,
      leadDaysDue: 2,
      cardUtilizationThresholdPct: 75,
      vaultRotationDays: 90,
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
    });
    const sentBefore = transport.sent.length;
    await handleIncomingWhatsAppCommand(db, transport, '911111111111', 'spent 200 snacks'); // Unauthorized phone!
    assert.equal(transport.sent.length, sentBefore);

    const balPreWa = getAccountById(db, bank.id)!.currentBalanceMinor;
    assert.ok(transport.incomingHandler);
    await transport.incomingHandler!('919876543210', 'spent 200 snacks on HDFC Savings');
    assert.equal(transport.sent.length, sentBefore + 1);
    assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, balPreWa - 20_000);

    // Destructive delete via WhatsApp requires "confirm " prefix
    await handleIncomingWhatsAppCommand(db, transport, '919876543210', 'delete last transaction');
    assert.ok(transport.sent[transport.sent.length - 1].text.toLowerCase().includes('confirm'));
    assert.equal(getAccountById(db, bank.id)!.currentBalanceMinor, balPreWa - 20_000); // Not deleted yet!

    // Proactive Advisor WhatsApp alert fires when cash/health becomes critical
    reconcileBankBalance(db, bank.id, -500_000, '2026-10-20');
    const waPreAlert = transport.sent.length;
    await runAlertCycle(db, transport, new Date('2026-10-20T12:00:00Z'));
    assert.equal(
      transport.sent.slice(waPreAlert).some((m) => m.text.includes('AI Advisor') || m.text.includes('30d Safe Cash')),
      true,
    );
  } finally {
    server.close();
    db.close();
  }
});

test('Wave 2: Investments & Net Worth, Rules/Auto-Post/Split, Receipt Attachments, Encrypted/Auto Backups, App PIN & CA Tax Pack', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-autobkp-'));

  try {
    const bank = createAccount(db, {
      name: 'HDFC Main',
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC',
      last4: '8888',
      openingBalanceMinor: 5_000_000, // ₹50,000
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });
    const bizBank = createAccount(db, {
      name: 'ICICI Current',
      type: 'bank',
      scope: 'business',
      institution: 'ICICI',
      last4: '9999',
      openingBalanceMinor: 10_000_000,
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });

    // 1. Investments & Assets -> Net Worth & 30-day Maturity Alert & Backup Roundtrip
    const soonDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const invCreate = await fetch(`${baseUrl}/api/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'SBI 1Y FD',
        kind: 'fd',
        scope: 'personal',
        investedMinor: 10_000_000, // ₹1,00,000
        currentValueMinor: 10_700_000, // ₹1,07,000
        maturityDate: soonDate,
      }),
    });
    assert.equal(invCreate.status, 201);
    const invId = ((await invCreate.json()) as { data: { id: string } }).data.id;
    const invUpdate = await fetch(`${baseUrl}/api/investments/${invId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValueMinor: 10_800_000 }),
    });
    assert.equal(invUpdate.status, 200);

    const dash = getDashboardSummary(db);
    assert.equal(dash.totalInvestmentsMinor, 10_800_000);
    assert.equal(dash.netWorthMinor, 5_000_000 + 10_000_000 + 10_800_000);

    const briefing = buildAdvisorBriefing(db, 'en');
    assert.equal(briefing.totalInvestmentsMinor, 10_800_000);
    assert.equal(
      briefing.predictions.some((p) => p.title.includes('SBI 1Y FD')),
      true,
    );

    // 2. Custom Merchant Auto-Rules -> Override SMS Import & Receipt Parse
    const ruleRes = await fetch(`${baseUrl}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: 'zepto',
        matchType: 'contains',
        category: 'Instant Pantry',
        scope: 'family',
      }),
    });
    assert.equal(ruleRes.status, 201);
    const smsPreview = await fetch(`${baseUrl}/api/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultAccountId: bank.id,
        text: 'Rs. 480.00 debited from A/c xx8888 on 12-11-2026 at Zepto Express',
      }),
    });
    const smsParsed = ((await smsPreview.json()) as { data: Array<{ category: string; scope: string }> }).data;
    assert.equal(smsParsed[0].category, 'Instant Pantry');
    assert.equal(smsParsed[0].scope, 'family');

    const receiptParsedRes = await fetch(`${baseUrl}/api/receipt/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiptText: 'Zepto Instant Delivery\nTotal: Rs. 320.00\nDate: 12-11-2026',
      }),
    });
    const receiptParsed = ((await receiptParsedRes.json()) as { data: { category: string } }).data;
    assert.equal(receiptParsed.category, 'Instant Pantry');

    // 3. Scheduled Recurring Auto-Post + Idempotency (must not double-post on second cycle)
    const cycleDate = new Date('2026-11-10T10:00:00Z');
    const recCreate = await fetch(`${baseUrl}/api/recurring-bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cloud Hosting',
        scope: 'business',
        kind: 'expense',
        accountId: bizBank.id,
        category: 'Software & Hosting',
        amountMinor: 150_000, // ₹1,500
        dueDay: 1,
        autoPost: true,
      }),
    });
    assert.equal(recCreate.status, 201);
    const bizBalBeforeAuto = getAccountById(db, bizBank.id)!.currentBalanceMinor;
    await runAlertCycle(db, transport, cycleDate);
    assert.equal(getAccountById(db, bizBank.id)!.currentBalanceMinor, bizBalBeforeAuto - 150_000);
    // Second run must be idempotent for same YYYY-MM!
    await runAlertCycle(db, transport, cycleDate);
    assert.equal(getAccountById(db, bizBank.id)!.currentBalanceMinor, bizBalBeforeAuto - 150_000);

    // 4. 1-Click Split Expense + Receipt Proof Attachment
    const dummyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const splitTxRes = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'expense',
        scope: 'personal',
        accountId: bank.id,
        category: 'Food & Dining',
        amountMinor: 300_000, // ₹3,000
        occurredAt: '2026-11-12',
        party: 'Bistro',
        attachment: {
          filename: 'dinner-receipt.png',
          mimeType: 'image/png',
          dataBase64: dummyPngBase64,
        },
        split: {
          participants: ['Amit', 'Neha'],
          includeSelf: true,
          dueDate: '2026-11-20',
        },
      }),
    });
    assert.equal(splitTxRes.status, 201);
    const splitPayload = (await splitTxRes.json()) as {
      data: { id: string; hasAttachment?: boolean };
      createdDues: Array<{ personName: string; amountMinor: number; direction: string }>;
    };
    assert.equal(splitPayload.data.hasAttachment, true);
    assert.equal(splitPayload.createdDues.length, 2);
    assert.equal(splitPayload.createdDues[0].amountMinor, 100_000); // ₹1,000 each
    assert.equal(splitPayload.createdDues[0].direction, 'need');

    const attRes = await fetch(`${baseUrl}/api/transactions/${splitPayload.data.id}/attachment`);
    assert.equal(attRes.status, 200);
    const attJson = ((await attRes.json()) as { data: { filename: string; dataBase64: string } }).data;
    assert.equal(attJson.filename, 'dinner-receipt.png');
    assert.equal(attJson.dataBase64, dummyPngBase64);

    // 5. CA / Tax Summary Pack (Indian FY)
    await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'income',
        scope: 'business',
        accountId: bizBank.id,
        category: 'Consulting',
        amountMinor: 2_000_000, // ₹20,000
        occurredAt: '2026-11-08',
      }),
    });
    const taxRes = await fetch(`${baseUrl}/api/reports/tax-pack?fyStartYear=2026`);
    assert.equal(taxRes.status, 200);
    const taxJson = ((await taxRes.json()) as {
      data: {
        fiscalYearLabel: string;
        scopePnl: { business: { incomeMinor: number; expenseMinor: number; netMinor: number } };
        totalInvestedMinor: number;
      };
    }).data;
    assert.equal(taxJson.fiscalYearLabel, 'FY 2026-27');
    assert.equal(taxJson.scopePnl.business.incomeMinor, 2_000_000);
    assert.equal(taxJson.scopePnl.business.expenseMinor, 150_000);
    assert.equal(taxJson.scopePnl.business.netMinor, 1_850_000);
    assert.equal(taxJson.totalInvestedMinor, 10_000_000);
    assert.ok(Array.isArray((taxJson as any).bankAccounts));
    assert.ok(Array.isArray((taxJson as any).loans));
    assert.ok(Array.isArray((taxJson as any).quarterlyPnl));
    assert.equal((taxJson as any).quarterlyPnl.length, 4);
    assert.ok((taxJson as any).deductionEstimates);

    // Test CA CSV Dossier Export
    const csvDossierRes = await fetch(`${baseUrl}/api/reports/tax-pack/export.csv?fyStartYear=2026`);
    assert.equal(csvDossierRes.status, 200);
    assert.ok(csvDossierRes.headers.get('content-type')?.includes('text/csv'));
    const csvText = await csvDossierRes.text();
    assert.ok(csvText.includes('CHARTERED ACCOUNTANT TAX PACK'));
    assert.ok(csvText.includes('SECTION 1: CONSOLIDATED P&L SUMMARY'));
    assert.ok(csvText.includes('SECTION 2: QUARTERLY BREAKDOWN'));
    assert.ok(csvText.includes('SECTION 5: SCHEDULE OF BANK ACCOUNTS'));

    // 6. Encrypted AES-256-GCM Backup + Daily Auto-Backup File Rotation
    const encExportRes = await fetch(`${baseUrl}/api/backup/export-encrypted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: 'MyStrongBackupPassword#2026' }),
    });
    assert.equal(encExportRes.status, 200);
    const encEnv = ((await encExportRes.json()) as { data: Record<string, unknown> }).data;
    assert.equal(encEnv.format, 'personal-ledger-encrypted-backup-v1');

    const badPassRestore = await fetch(`${baseUrl}/api/backup/restore-encrypted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope: encEnv, passphrase: 'WrongPassword!' }),
    });
    assert.equal(badPassRestore.status, 400);

    const dbRestored = openDatabase(':memory:');
    const srvRestored = createAppServer({ db: dbRestored, transport: new MockWhatsAppTransport() });
    await new Promise<void>((resolve) => srvRestored.listen(0, '127.0.0.1', () => resolve()));
    const restoredBaseUrl = `http://127.0.0.1:${(srvRestored.address() as AddressInfo).port}`;
    try {
      const okRestore = await fetch(`${restoredBaseUrl}/api/backup/restore-encrypted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelope: encEnv, passphrase: 'MyStrongBackupPassword#2026' }),
      });
      assert.equal(okRestore.status, 200);
      const counts = ((await okRestore.json()) as { data: { counts: { investments: number; categoryRules: number } } }).data.counts;
      assert.equal(counts.investments, 1);
      assert.equal(counts.categoryRules, 1);
    } finally {
      srvRestored.close();
      dbRestored.close();
    }

    // Verify rolling auto-backup pruning
    const snap = exportFullSnapshotJSON(db);
    for (let d = 1; d <= 5; d++) {
      writeAutoBackupFile(tmpBackupDir, `2026-11-0${d}`, snap, 3);
    }
    const keptFiles = fs.readdirSync(tmpBackupDir).filter((f) => f.endsWith('.json'));
    assert.equal(keptFiles.length, 3);

    // 7. App Lock PIN (scrypt hashed, never leaked in preferences response)
    const setPinRes = await fetch(`${baseUrl}/api/app-lock/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2580', autoLockMinutes: 5 }),
    });
    assert.equal(setPinRes.status, 200);
    const prefsAfterPin = getAppPreferences(db);
    assert.equal(prefsAfterPin.hasAppPin, true);
    assert.equal(prefsAfterPin.autoLockMinutes, 5);
    assert.equal('appPinHash' in prefsAfterPin, false);

    const wrongPin = await fetch(`${baseUrl}/api/app-lock/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1111' }),
    });
    assert.equal(wrongPin.status, 403);

    const rightPin = await fetch(`${baseUrl}/api/app-lock/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2580' }),
    });
    assert.equal(rightPin.status, 200);

    const clearPin = await fetch(`${baseUrl}/api/app-lock/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: '2580' }),
    });
    assert.equal(clearPin.status, 200);
    assert.equal(getAppPreferences(db).hasAppPin, false);
  } finally {
    fs.rmSync(tmpBackupDir, { recursive: true, force: true });
    server.close();
    db.close();
  }
});

function buildMinimalTextPdfBase64(lines: string[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 760;
  const ops = ['BT', '/F1 11 Tf'];
  for (const l of lines) {
    ops.push(`1 0 0 1 48 ${y} Tm (${esc(l)}) Tj`);
    y -= 18;
  }
  ops.push('ET');
  const streamContent = ops.join('\n');

  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8').toString('base64');
}

test('Option 1: WhatsApp Payment Screenshot/Receipt Bot & Bank PDF Statement Import', async () => {
  // 1. UPI Payment Screenshot & Credit Extraction (ignores 12-digit UTR & app boilerplate)
  const gpayExpense = extractReceiptFieldsFromText(
    'Google Pay\nTransaction Successful\nPaid to Swiggy Instamart\n₹642.00\nCompleted\n12 Nov 2026\nUPI transaction ID: 432198765432',
    '2026-11-12',
  );
  assert.equal(gpayExpense.kind, 'expense');
  assert.equal(gpayExpense.vendor, 'Swiggy Instamart');
  assert.equal(gpayExpense.amountMinor, 64_200);
  assert.equal(gpayExpense.category, 'Food & Dining');

  const gpayIncome = extractReceiptFieldsFromText(
    'PhonePe\nReceived from Acme Studio\nRs. 25,000.00\nCompleted\n11 Nov 2026',
    '2026-11-12',
  );
  assert.equal(gpayIncome.kind, 'income');
  assert.equal(gpayIncome.vendor, 'Acme Studio');
  assert.equal(gpayIncome.amountMinor, 2_500_000);

  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const s = getAlertSettings(db);
  s.recipientPhone = '9876543210';
  s.twoWayCommandsEnabled = true;
  saveAlertSettings(db, s);

  const personalBank = createAccount(db, {
    name: 'HDFC Personal',
    type: 'bank',
    scope: 'personal',
    institution: 'HDFC',
    last4: '4321',
    openingBalanceMinor: 5_000_000,
    minBalanceMinor: 0,
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });
  const bizBank = createAccount(db, {
    name: 'ICICI Biz',
    type: 'bank',
    scope: 'business',
    institution: 'ICICI',
    last4: '7777',
    openingBalanceMinor: 10_000_000,
    minBalanceMinor: 0,
    creditLimitMinor: 0,
    statementDay: 15,
    dueDay: 5,
  });

  // 2. Bank Statement Rows with Trailing Running Balance & Wrapped Line Stitching
  const parsedRows = parseStatementInput({
    rawText: [
      'Date Narration Amount Balance',
      'Opening Balance 50,000.00',
      '12/11/2026 UPI-ZOMATO-998811 450.00 49,550.00',
      '13/11/2026 NEFT-ACME CORP',
      'CR 12,000.00 61,550.00',
    ].join('\n'),
    accounts: [personalBank, bizBank],
    existingTransactions: [],
    defaultAccountId: personalBank.id,
  });
  assert.equal(parsedRows.length, 2);
  assert.equal(parsedRows[0].amountMinor, 45_000);
  assert.equal(parsedRows[0].kind, 'expense');
  assert.equal(parsedRows[0].party.toLowerCase().includes('zomato'), true);
  assert.equal(parsedRows[1].amountMinor, 1_200_000);
  assert.equal(parsedRows[1].kind, 'income');

  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 3. Real PDF Upload -> POST /api/import/preview-pdf -> Commit
    const pdfB64 = buildMinimalTextPdfBase64([
      'HDFC BANK STATEMENT ACCOUNT **4321',
      '12/11/2026 UPI-SWIGGY-ORDER 520.00 49,480.00',
      '11/11/2026 NEFT-CLIENT PAYOUT CR 15,000.00 50,000.00',
    ]);
    const pdfRes = await fetch(`${baseUrl}/api/import/preview-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: pdfB64, defaultAccountId: personalBank.id }),
    });
    assert.equal(pdfRes.status, 200);
    const pdfPayload = (await pdfRes.json()) as {
      data: Array<{ amountMinor: number; kind: string; party: string; accountId: string; scope: string; category: string; occurredAt: string; note: string }>;
      pageCount: number;
    };
    assert.equal(pdfPayload.pageCount, 1);
    assert.equal(pdfPayload.data.length, 2);
    assert.equal(pdfPayload.data[0].amountMinor, 52_000);
    assert.equal(pdfPayload.data[0].kind, 'expense');
    assert.equal(pdfPayload.data[1].amountMinor, 1_500_000);
    assert.equal(pdfPayload.data[1].kind, 'income');

    const badPdfRes = await fetch(`${baseUrl}/api/import/preview-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: Buffer.from('NOT_A_PDF_AT_ALL_0000000').toString('base64') }),
    });
    assert.equal(badPdfRes.status, 400);

    // 4. WhatsApp Incoming Image Bot: Trust Boundary + Unreadable Guidance + Pending Confirm + Auto-Log & Attachment
    const dummyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Unauthorized sender ignored silently
    const unauthImg = await handleIncomingWhatsAppImage(db, transport, '910000000000', {
      imageBase64: dummyPngBase64,
      mimeType: 'image/png',
      caption: '₹500 Swiggy',
    });
    assert.equal(unauthImg.accepted, false);
    assert.equal(transport.sent.length, 0);

    // Authorized sender with unreadable image & no caption gets polite prompt
    const unreadable = await handleIncomingWhatsAppImage(db, transport, '919876543210', {
      imageBase64: dummyPngBase64,
      mimeType: 'image/png',
    });
    assert.equal(unreadable.accepted, true);
    assert.equal(unreadable.logged, false);
    assert.equal(transport.sent[transport.sent.length - 1].text.includes('Could not read'), true);

    // Confirmation mode when agentAutoExecute = false -> hold draft until "confirm"
    updateAppPreferences(db, { agentAutoExecute: false });
    const pendingRes = await handleIncomingWhatsAppImage(db, transport, '919876543210', {
      imageBase64: dummyPngBase64,
      mimeType: 'image/png',
      caption: 'Paid ₹480 Swiggy biz',
    });
    assert.equal(pendingRes.accepted, true);
    assert.equal(pendingRes.logged, false);
    assert.equal(transport.sent[transport.sent.length - 1].text.includes('confirm'), true);
    assert.equal(listTransactions(db).length, 0);

    const confirmRes = await handleIncomingWhatsAppCommand(db, transport, '919876543210', 'confirm');
    assert.equal(confirmRes.accepted, true);
    const txsAfterConfirm = listTransactions(db);
    assert.equal(txsAfterConfirm.length, 1);
    assert.equal(txsAfterConfirm[0].amountMinor, 48_000);
    assert.equal(txsAfterConfirm[0].scope, 'business');
    assert.equal(txsAfterConfirm[0].accountId, bizBank.id);
    assert.equal(txsAfterConfirm[0].hasAttachment, true);
    assert.equal(getTransactionAttachment(db, txsAfterConfirm[0].id)?.dataBase64, dummyPngBase64);

    // Auto-execute mode -> immediate log + proof attachment
    updateAppPreferences(db, { agentAutoExecute: true });
    const autoRes = await handleIncomingWhatsAppImage(db, transport, '919876543210', {
      imageBase64: dummyPngBase64,
      mimeType: 'image/png',
      caption: 'Paid ₹1,200 Airtel Fiber 4321',
    });
    assert.equal(autoRes.accepted, true);
    assert.equal(autoRes.logged, true);
    assert.ok(autoRes.transactionId);
    const attached = getTransactionAttachment(db, autoRes.transactionId!);
    assert.equal(attached?.mimeType, 'image/png');
    assert.equal(attached?.dataBase64, dummyPngBase64);
  } finally {
    server.close();
    db.close();
  }
});

test('Per-category monthly budgets & alerts, global cross-module search, and WhatsApp voice notes', async () => {
  const db = openDatabase(':memory:');
  const transport = new MockWhatsAppTransport();
  const server = createAppServer({ db, transport });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const bank = createAccount(db, {
      name: 'HDFC Savings',
      type: 'bank',
      scope: 'personal',
      institution: 'HDFC',
      last4: '1111',
      openingBalanceMinor: 10_000_000,
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });
    const bizBank = createAccount(db, {
      name: 'ICICI Current',
      type: 'bank',
      scope: 'business',
      institution: 'ICICI',
      last4: '2222',
      openingBalanceMinor: 20_000_000,
      minBalanceMinor: 0,
      creditLimitMinor: 0,
      statementDay: 15,
      dueDay: 5,
    });

    // 1. Per-Category Monthly Budgets & Overspend Alerts (Option 1)
    const catBudget1 = upsertCategoryBudget(db, 'personal', 'Food & Dining', 1_000_000); // ₹10,000
    const catBudget2 = upsertCategoryBudget(db, 'business', 'Software & SaaS', 2_000_000); // ₹20,000
    assert.equal(listCategoryBudgets(db).length, 2);
    assert.equal(catBudget1.category, 'Food & Dining');

    // Enable alerts
    saveAlertSettings(db, {
      recipientPhone: '919876543210',
      quietStartHour: 23,
      quietEndHour: 6,
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
    });

    const now = new Date('2026-11-15T12:00:00Z');
    // Spend ₹8,500 (85% of ₹10,000 cap)
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: bank.id,
      category: 'Food & Dining',
      amountMinor: 850_000,
      occurredAt: '2026-11-10',
      party: 'Fine Dine',
    });

    // Run alert cycle -> triggers 80% category budget warning alert
    const cycle80 = await runAlertCycle(db, transport, now);
    assert.ok(cycle80.evaluated > 0);
    const sent80 = transport.sent.find((s) => s.text.includes('Food & Dining') && s.text.includes('85%'));
    assert.ok(sent80, 'Expected 80% category budget alert sent via WhatsApp');

    // Spend another ₹2,000 (total ₹10,500, 105% of ₹10,000 cap)
    createTransaction(db, {
      kind: 'expense',
      scope: 'personal',
      accountId: bank.id,
      category: 'Food & Dining',
      amountMinor: 200_000,
      occurredAt: '2026-11-12',
      party: 'Cafe Bar',
    });

    // Run alert cycle -> triggers 100% urgent alert
    const cycle100 = await runAlertCycle(db, transport, now);
    assert.ok(cycle100.evaluated > 0);
    const sent100 = transport.sent.find((s) => s.text.includes('Food & Dining') && s.text.includes('105%'));
    assert.ok(sent100, 'Expected 100% category budget alert sent via WhatsApp');

    // Advisor detects category budget overrun in whatsWrong
    const briefing = buildAdvisorBriefing(db, 'en', undefined, now);
    const catWrong = briefing.whatsWrong.find((w) => w.id.includes('wrong-cat-budget-over'));
    assert.ok(catWrong, 'Expected advisor to flag category budget overrun in whatsWrong');
    assert.ok(catWrong.title.includes('Food & Dining'));

    // Dashboard includes category budgets with live spent & pct
    const dash = getDashboardSummary(db, undefined, '2026-11-15');
    assert.ok(dash.categoryBudgets);
    const dashCb = dash.categoryBudgets.find((cb) => cb.category === 'Food & Dining');
    assert.ok(dashCb);
    assert.equal(dashCb.spentMinor, 1_050_000);
    assert.equal(dashCb.pct, 105);

    // Delete category budget API endpoint test
    const delRes = await fetch(`${baseUrl}/api/budgets/categories/${catBudget2.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(listCategoryBudgets(db).length, 1);
    assert.ok(deleteCategoryBudget(db, catBudget1.id));
    assert.equal(listCategoryBudgets(db).length, 0);

    // 2. Global Cross-Module Search & Bulk Actions (Option 2)
    upsertNote(db, crypto.randomUUID(), {
      title: 'Groceries Checklist',
      body: 'Organic vegetables and milk',
      scope: 'personal',
      pinned: true,
      checklist: [{ text: 'Almond Milk', done: false }],
    });
    createPersonDue(db, {
      personName: 'Rohan Sharma',
      direction: 'need',
      scope: 'personal',
      amountMinor: 150_000,
      note: 'Dinner split',
    });
    createLoan(db, {
      name: 'Car Loan',
      counterparty: 'HDFC Bank',
      scope: 'personal',
      direction: 'borrowed',
      principalMinor: 5_000_000,
      remainingMinor: 4_000_000,
      annualRateBps: 850,
      tenureMonths: 36,
      emiMinor: 150_000,
      startDate: '2026-01-01',
      nextDueDate: '2026-12-05',
    });
    upsertVaultEntry(db, {
      label: 'GitHub Work',
      category: 'Cloud & Hosting',
      iv: 'dummy_iv',
      ciphertext: 'dummy_ct',
      lastRotatedAt: '2026-11-12',
    });

    // Search by category
    const searchCat = globalSearch(db, 'Food & Dining');
    assert.ok(searchCat.transactions.length >= 2);
    assert.equal(searchCat.transactions[0].category, 'Food & Dining');

    // Search by note content
    const searchNote = globalSearch(db, 'Almond Milk');
    assert.ok(searchNote.notes.length >= 1);
    assert.equal(searchNote.notes[0].title, 'Groceries Checklist');

    // Search by person due
    const searchDue = globalSearch(db, 'Rohan');
    assert.ok(searchDue.dues.length >= 1);
    assert.equal(searchDue.dues[0].personName, 'Rohan Sharma');

    // Search by loan
    const searchLoan = globalSearch(db, 'Car Loan');
    assert.ok(searchLoan.loans.length >= 1);
    assert.equal(searchLoan.loans[0].name, 'Car Loan');

    // Search by vault label
    const searchVault = globalSearch(db, 'GitHub');
    assert.ok(searchVault.vault.length >= 1);
    assert.equal(searchVault.vault[0].label, 'GitHub Work');

    // Global Search HTTP endpoint
    const searchHttpRes = await fetch(`${baseUrl}/api/search?q=rohan`);
    assert.equal(searchHttpRes.status, 200);
    const searchHttpBody = (await searchHttpRes.json()) as { data: any };
    assert.ok(searchHttpBody.data.dues.length >= 1);

    // Bulk Transaction Actions: Update & Delete
    const tx1 = searchCat.transactions[0].id;
    const tx2 = searchCat.transactions[1].id;

    // Test repo direct bulkUpdateTransactions & bulkDeleteTransactions
    assert.equal(bulkUpdateTransactions(db, [tx1], { category: 'Fine Dining' }), 1);
    assert.equal(bulkDeleteTransactions(db, [tx1]), 1);

    // Bulk update via HTTP
    const bulkUpRes = await fetch(`${baseUrl}/api/transactions/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        ids: [tx2],
        patch: { scope: 'business', category: 'Client Dinners' },
      }),
    });
    assert.equal(bulkUpRes.status, 200);
    const bulkUpJson = (await bulkUpRes.json()) as { ok: boolean; count: number };
    assert.equal(bulkUpJson.count, 1);

    const checkTxs = listTransactions(db);
    const updated2 = checkTxs.find((t) => t.id === tx2);
    assert.equal(updated2?.scope, 'business');
    assert.equal(updated2?.category, 'Client Dinners');

    // Bulk delete via HTTP
    const bulkDelRes = await fetch(`${baseUrl}/api/transactions/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        ids: [tx2],
      }),
    });
    assert.equal(bulkDelRes.status, 200);
    const bulkDelJson = (await bulkDelRes.json()) as { ok: boolean; count: number };
    assert.equal(bulkDelJson.count, 1);
    assert.equal(listTransactions(db).find((t) => t.id === tx2), undefined);

    // 3. WhatsApp Voice-Note Expense & Task Logging (Option 4)
    // When local mode with no API key -> returns informative setup guidance
    updateAppPreferences(db, { llmProvider: 'local', agentAutoExecute: true });
    const voiceNoticeRes = await handleIncomingWhatsAppAudio(db, transport, '919876543210', {
      audioBase64: 'AAAA////dummyVoiceNoteBase64',
      mimeType: 'audio/ogg; codecs=opus',
    });
    assert.equal(voiceNoticeRes.accepted, true);
    assert.equal(voiceNoticeRes.transcribed, false);
    assert.ok(transport.sent[transport.sent.length - 1].text.includes('configure a Gemini or OpenAI API key'));

    // Command execution from voice note works smoothly when transcribing
    const voiceCmdRes = await handleIncomingWhatsAppCommand(
      db,
      transport,
      '919876543210',
      'Paid ₹650 for Stationery from ICICI Current',
    );
    assert.equal(voiceCmdRes.accepted, true);
    const loggedTx = listTransactions(db).find(
      (t) => t.party === 'Stationery' || t.category.includes('Stationery') || t.note.includes('Stationery'),
    );
    assert.ok(loggedTx, 'Expected voice-command transaction to be logged');
    assert.equal(loggedTx.amountMinor, 65_000);
    assert.equal(loggedTx.accountId, bizBank.id);

    // 4. Notes Module Upgrade (Pillars 3 & 5): Bulk Actions & HTTP Endpoints
    const n1 = upsertNote(db, null, {
      title: 'Sprint Planning',
      body: 'Review backlog and set milestones',
      scope: 'personal',
      color: 'default',
      pinned: false,
      checklist: [{ text: 'Item 1', done: false }, { text: 'Item 2', done: true }],
    });
    const n2 = upsertNote(db, null, {
      title: 'Tax Receipts FY',
      body: 'Collect Form 16 and 80C',
      scope: 'personal',
      color: 'default',
      pinned: false,
      checklist: [{ text: 'PPF Receipt', done: false }],
    });

    // Test bulk scope change via HTTP
    const bulkScopeRes = await fetch(`http://127.0.0.1:${port}/api/notes/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scope',
        scope: 'business',
        ids: [n1.id, n2.id],
      }),
    });
    assert.equal(bulkScopeRes.status, 200);
    const scopeData = (await bulkScopeRes.json()) as { ok: boolean; count: number };
    assert.equal(scopeData.count, 2);
    const refreshedN1 = listNotes(db).find((n) => n.id === n1.id)!;
    assert.equal(refreshedN1.scope, 'business');

    // Test bulk color & pin via HTTP
    const bulkColorRes = await fetch(`http://127.0.0.1:${port}/api/notes/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'color',
        color: 'honey',
        ids: [n1.id],
      }),
    });
    assert.equal(bulkColorRes.status, 200);
    assert.equal(listNotes(db).find((n) => n.id === n1.id)!.color, 'honey');

    // Test bulk delete via HTTP
    const bulkNoteDelRes = await fetch(`http://127.0.0.1:${port}/api/notes/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        ids: [n1.id, n2.id],
      }),
    });
    assert.equal(bulkNoteDelRes.status, 200);
    assert.equal(listNotes(db).find((n) => n.id === n1.id), undefined);
    assert.equal(listNotes(db).find((n) => n.id === n2.id), undefined);

    // 5. Notes Complete Pillars: Tags, Attachments, Financial Entity Linking, and Reminders
    const n3 = upsertNote(db, null, {
      title: 'HDFC Laptop Purchase Bill',
      body: 'MacBook Air M2 purchase bill and AppleCare',
      scope: 'personal',
      color: 'sky',
      tags: ['gadgets', 'tax', 'apple'],
      pinned: true,
      remindAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      linkedTxId: loggedTx.id,
      linkedAccountId: bizBank.id,
      checklist: [{ text: 'Register AppleCare', done: false }],
    });
    assert.deepEqual(n3.tags, ['gadgets', 'tax', 'apple']);
    assert.equal(n3.linkedTxId, loggedTx.id);
    assert.equal(n3.linkedAccountId, bizBank.id);

    // Test Note Attachment upload via HTTP
    const attRes = await fetch(`http://127.0.0.1:${port}/api/notes/${n3.id}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'laptop_receipt.jpg',
        mimeType: 'image/jpeg',
        dataBase64: 'data:image/jpeg;base64,dGVzdA==',
      }),
    });
    assert.equal(attRes.status, 201);
    const attData = (await attRes.json()) as { data: { id: string; filename: string } };
    assert.equal(attData.data.filename, 'laptop_receipt.jpg');

    const listAttRes = await fetch(`http://127.0.0.1:${port}/api/notes/${n3.id}/attachments`);
    assert.equal(listAttRes.status, 200);
    const listAttData = (await listAttRes.json()) as { data: Array<{ id: string }> };
    assert.equal(listAttData.data.length, 1);

    // Test Alert Cycle dispatches WhatsApp and in-app reminder for note n3
    const reminderCycle = await runAlertCycle(db, transport, new Date());
    assert.ok(reminderCycle.evaluated >= 1);
    const inAppRem = listAlertDeliveries(db, 20).find((a) => a.module === 'notes' && a.channel === 'in_app');
    assert.ok(inAppRem, 'Expected in-app reminder alert for note');
    assert.ok(inAppRem.title.includes('HDFC Laptop Purchase Bill'));

    // 6. Password Vault: Emergency Recovery Escrow & WhatsApp OTP Code Recovery
    const vaultSetupRes = await fetch(`http://127.0.0.1:${port}/api/vault/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saltB64: 'c2FsdDEyMw==',
        canaryIv: 'aXYxMjM=',
        canaryCt: 'Y3QxMjM=',
        recoverySaltB64: 'cmVjU2FsdA==',
        recoveryIv: 'cmVjSXY=',
        recoveryCt: 'cmVjQ3Q=',
        waRecoveryKey: 'PLVK-TEST-RECOVERY-KEY',
      }),
    });
    assert.equal(vaultSetupRes.status, 200);
    const vMeta = (await vaultSetupRes.json()) as { data: { hasWaRecoveryKey: boolean; waRecoveryKey?: string } };
    assert.equal(vMeta.data.hasWaRecoveryKey, true);
    assert.equal(vMeta.data.waRecoveryKey, undefined, 'Vault meta must never leak plaintext waRecoveryKey before OTP');

    // Request WhatsApp OTP code
    const waOtpReq = await fetch(`http://127.0.0.1:${port}/api/vault/recovery/whatsapp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(waOtpReq.status, 200);
    const waOtpReqData = (await waOtpReq.json()) as { ok: boolean; phoneMasked: string };
    assert.equal(waOtpReqData.ok, true);

    // Verify WhatsApp message was sent containing the 6-digit OTP code
    const waSentMsg = transport.sent.find((s) => s.text.includes('Vault Recovery'));
    assert.ok(waSentMsg, 'Expected WhatsApp recovery OTP message sent');
    const otpMatch = waSentMsg.text.match(/\*(\d{6})\*/);
    assert.ok(otpMatch, 'Expected 6-digit OTP in WhatsApp message');
    const otpCode = otpMatch[1];

    // Verify WhatsApp OTP code to release escrowed recovery key
    const waVerifyRes = await fetch(`http://127.0.0.1:${port}/api/vault/recovery/whatsapp-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: otpCode }),
    });
    assert.equal(waVerifyRes.status, 200);
    const waVerifyData = (await waVerifyRes.json()) as { ok: boolean; recoveryKey: string };
    assert.equal(waVerifyData.ok, true);
    assert.equal(waVerifyData.recoveryKey, 'PLVK-TEST-RECOVERY-KEY');
  } finally {
    server.close();
    db.close();
  }
});
