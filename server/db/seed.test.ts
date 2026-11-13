import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './schema.ts';
import { seedFinancialData } from './seed.ts';
import { listAccounts } from './accounts-repo.ts';
import { listTransactions, listLoans, listPeopleDues, listRecurringBills } from './ledger-repo.ts';
import { listNotes } from './notes-repo.ts';

describe('Live Financial Data Seeding & Onboarding Suite', () => {
  it('seeds a comprehensive, realistic local-first ledger dataset without invariant errors', () => {
    const db = openDatabase(':memory:');

    const summary = seedFinancialData(db);
    assert.ok(summary.accountsCount >= 3, 'Expected at least 3 accounts');
    assert.ok(summary.txCount >= 8, 'Expected at least 8 transactions');
    assert.ok(summary.loansCount >= 1, 'Expected at least 1 loan');
    assert.ok(summary.duesCount >= 2, 'Expected at least 2 people dues');
    assert.ok(summary.notesCount >= 2, 'Expected at least 2 notes');

    // Verify accounts
    const accounts = listAccounts(db);
    assert.ok(accounts.some((a) => a.name.includes('HDFC')));
    assert.ok(accounts.some((a) => a.accountGroup === 'credit_card'));

    // Verify transactions
    const txs = listTransactions(db, {});
    assert.ok(txs.length >= summary.txCount);

    // Verify loans & dues
    const loans = listLoans(db);
    assert.ok(loans.length >= 1);

    const dues = listPeopleDues(db);
    assert.ok(dues.length >= 2);

    // Verify notes & checklists
    const notes = listNotes(db);
    assert.ok(notes.length >= 2);
    assert.ok(notes.some((n) => n.pinned));

    // Verify recurring bills
    const bills = listRecurringBills(db);
    assert.ok(bills.length >= 2);

    db.close();
  });
});
