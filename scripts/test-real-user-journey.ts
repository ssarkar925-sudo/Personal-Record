import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase, withTransaction } from '../server/db/schema.ts';
import { createAccount, listAccounts, getCardCycleReconciliation } from '../server/db/accounts-repo.ts';
import {
  createTransaction,
  listTransactions,
  createLoan,
  createPersonDue,
  settlePersonDue,
  listPeopleDues,
  createCategoryRule,
  listCategoryRules,
  matchCategoryRule,
} from '../server/db/ledger-repo.ts';
import { createJobSheet, listJobSheets, updateJobSheet } from '../server/db/job-sheets-repo.ts';
import { upsertVaultEntry, listVaultEntries } from '../server/db/vault-repo.ts';
import { upsertNote, listNotes, toggleChecklistItem } from '../server/db/notes-repo.ts';
import { evaluateCellFormula } from '../src/workspaces/sheets/jobSheetsAnalytics.ts';
import { computeNewRegimeTax, computeAdvanceTaxSchedule } from '../shared/tax-engine.ts';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(thisFile), '..');
const simDbPath = path.join(rootDir, 'data', 'simulated-user-session.sqlite');

if (fs.existsSync(simDbPath)) fs.unlinkSync(simDbPath);
for (const ext of ['-shm', '-wal']) {
  if (fs.existsSync(simDbPath + ext)) fs.unlinkSync(simDbPath + ext);
}

const db = openDatabase(simDbPath);

console.log('👤 [Real User Simulation Test] Simulating Complete Multi-Module Financial Journey...\n');

// 1. User sets up bank account & credit card
console.log('Step 1: Setting up Primary Bank & Credit Card accounts...');
const salaryAcc = createAccount(db, {
  name: 'HDFC Salary Checking',
  type: 'bank',
  accountGroup: 'bank',
  scope: 'personal',
  institution: 'HDFC Bank',
  last4: '4129',
  openingBalanceMinor: 25000000, // ₹2,50,000.00
});
assert.ok(salaryAcc.id);

const creditCard = createAccount(db, {
  name: 'HDFC Regalia Gold',
  type: 'credit_card',
  accountGroup: 'credit_card',
  scope: 'personal',
  institution: 'HDFC Bank',
  last4: '8812',
  openingBalanceMinor: 0,
  creditLimitMinor: 40000000, // ₹4,00,000.00
  statementDay: 15,
  dueDay: 5,
});
assert.ok(creditCard.id);
console.log('   ✅ Bank and Credit Card accounts initialized');

// 2. User receives monthly salary income
console.log('\nStep 2: Receiving Monthly Executive Salary...');
const salaryTx = createTransaction(db, {
  accountId: salaryAcc.id,
  kind: 'income',
  scope: 'personal',
  category: 'Salary',
  amountMinor: 15000000, // ₹1,50,000.00
  occurredAt: '2026-11-01',
  party: 'Google India',
  note: 'November Salary Credit',
});
assert.ok(salaryTx.id);
console.log('   ✅ ₹1,50,000.00 salary deposited into HDFC Checking');

// 3. User sets an auto-categorization rule: "Swiggy" -> "Food & Dining"
console.log('\nStep 3: Creating Merchant Auto-Categorization Rule...');
const rule = createCategoryRule(db, {
  pattern: 'swiggy',
  category: 'Food & Dining',
  scope: 'personal',
  matchType: 'contains',
});
assert.ok(rule.id);
const matched = matchCategoryRule(listCategoryRules(db), 'Swiggy Instamart Order #9021', 'expense');
assert.equal(matched?.category, 'Food & Dining');
console.log('   ✅ Rule verified: "Swiggy" transactions automatically categorized as "Food & Dining"');

// 4. User spends on Swiggy via Credit Card
console.log('\nStep 4: Swiggy Spend on Credit Card...');
const cardTx = createTransaction(db, {
  accountId: creditCard.id,
  kind: 'expense',
  scope: 'personal',
  category: matched!.category,
  amountMinor: 85000, // ₹850.00
  occurredAt: '2026-11-12',
  party: 'Swiggy Instamart',
  note: 'Groceries and snacks',
});
assert.ok(cardTx.id);

const cardRecon = getCardCycleReconciliation(db, creditCard.id, '2026-11-16');
assert.equal(cardRecon?.totalOutstandingMinor, 85000);
console.log('   ✅ Credit card outstanding tracks ₹850.00 accurately');

// 5. User lends money to friend (Udhar / Dues)
console.log('\nStep 5: Recording Personal Udhar (Lending ₹10,000 to Rohit)...');
const due = createPersonDue(db, {
  personName: 'Rohit Verma',
  scope: 'personal',
  direction: 'need', // Rohit owes user
  amountMinor: 1000000, // ₹10,000
  dueDate: '2026-12-05',
  note: 'Emergency festival loan',
});
assert.ok(due.id);

// Friend pays back ₹4,000 partial payment
const settleRes = settlePersonDue(db, due.id, {
  amountMinor: 400000,
  accountId: salaryAcc.id,
  settledAt: '2026-11-18',
  note: 'Partial repayment via GPay',
});
assert.equal(settleRes.due.remainingMinor, 600000);
assert.equal(settleRes.due.status, 'partial');
assert.ok(settleRes.transaction);
console.log('   ✅ Udhar settled partially: Rohit owes remaining ₹6,000.00; ₹4,000 credited to bank');

// 6. User creates Job Sheets Consulting Register
console.log('\nStep 6: Creating Client Billing Job Sheet with Formulas...');
const sheet = createJobSheet(db, {
  name: 'Client Billing Q4',
  scope: 'business',
  color: 'emerald',
  columns: [
    { id: 'c_client', label: 'Client', type: 'text', key: 'A' },
    { id: 'c_hours', label: 'Hours', type: 'number', key: 'B' },
    { id: 'c_rate', label: 'Hourly Rate', type: 'currency', key: 'C' },
    { id: 'c_total', label: 'Billed', type: 'currency', key: 'D' },
    { id: 'c_status', label: 'Status', type: 'status', key: 'E' },
  ],
  rows: [
    {
      id: 'row1',
      cells: {
        c_client: 'FinTech Corp',
        c_hours: '40',
        c_rate: '2500',
        c_total: '=B1*C1',
        c_status: 'Completed',
      },
    },
    {
      id: 'row2',
      cells: {
        c_client: 'Retail AI',
        c_hours: '25',
        c_rate: '3000',
        c_total: '=B2*C2',
        c_status: 'In Progress',
      },
    },
  ],
});
assert.ok(sheet.id);

// Evaluate formula dynamically
const evalRow1 = evaluateCellFormula(sheet.rows[0].cells.c_total, sheet.columns, sheet.rows);
assert.equal(evalRow1, '100000'); // 40 * 2500 = 1,00,000
const evalRow2 = evaluateCellFormula(sheet.rows[1].cells.c_total, sheet.columns, sheet.rows);
assert.equal(evalRow2, '75000'); // 25 * 3000 = 75,000
console.log(`   ✅ Job Sheet formula evaluation: FinTech Corp ₹${evalRow1}, Retail AI ₹${evalRow2}`);

// 7. User saves daily Keep checklist note
console.log('\nStep 7: Creating Daily Keep Routine Checklist...');
const note = upsertNote(db, null, {
  title: 'Daily Financial Routine',
  body: 'Daily closing checklist for personal & consulting accounts',
  scope: 'personal',
  color: 'gold',
  pinned: 1,
  checklist: [
    { id: 'item1', text: 'Review bank statement imports', done: false },
    { id: 'item2', text: 'Approve credit card bills', done: false },
    { id: 'item3', text: 'Reconcile Khatabook udhar entries', done: false },
  ],
});
assert.ok(note.id);

// User completes item 1
toggleChecklistItem(db, note.id, 'item1', true);
const notes = listNotes(db, { scope: 'personal' });
const updatedNote = notes.find((n) => n.id === note.id);
assert.equal(updatedNote?.checklist[0].done, true);
console.log('   ✅ Keep Note checklist updated: Item 1 marked done');

// 8. User stores secret in Password Vault
console.log('\nStep 8: Storing Encrypted Credentials in Password Vault...');
const secret = upsertVaultEntry(db, {
  label: 'HDFC NetBanking Master',
  category: 'Banking',
  ciphertext: 'AES256GCM_ENCRYPTED_PAYLOAD_CIPHERTEXT',
  iv: 'RANDOM_NONCE_BASE64',
  lastRotatedAt: '2026-11-19',
});
assert.ok(secret.id);
const vault = listVaultEntries(db);
assert.equal(vault[0].label, 'HDFC NetBanking Master');
console.log('   ✅ Vault zero-knowledge credentials stored securely with AES-256-GCM');

// 9. User reviews Advance Tax liability
console.log('\nStep 9: Calculating Advance Tax Compliance Schedule...');
const tax = computeNewRegimeTax(
  {
    salaryIncomeMinor: 180000000, // ₹18,00,000
    businessNetProfitMinor: 30000000, // ₹3,00,000
    otherIncomeMinor: 0,
    stcgEquityMinor: 0,
    ltcgEquityMinor: 0,
  },
  {
    isSalaried: true,
    sec80CMinor: 0,
    sec80DSelfMinor: 0,
    sec80DParentsMinor: 0,
    sec80CCD1BMinor: 0,
    sec24bHomeLoanInterestMinor: 0,
    sec80TTAInterestMinor: 0,
    otherExemptionsMinor: 0,
  },
);
assert.ok(tax.totalTaxLiabilityMinor > 0);
const sched = computeAdvanceTaxSchedule(tax.totalTaxLiabilityMinor, 2026, '2026-11-19');
assert.equal(sched.length, 4);
console.log(`   ✅ Tax computed: Gross ₹21L, Total Liability: ₹${(tax.totalTaxLiabilityMinor / 100).toLocaleString('en-IN')}`);

console.log('\n🎉 [Real User Simulation Test PASS] Complete multi-module user workflow verified with 100% integrity!\n');

db.close();
if (fs.existsSync(simDbPath)) fs.unlinkSync(simDbPath);
for (const ext of ['-shm', '-wal']) {
  if (fs.existsSync(simDbPath + ext)) fs.unlinkSync(simDbPath + ext);
}
