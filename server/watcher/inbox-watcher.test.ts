import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../db/schema.ts';
import { createAccount } from '../db/accounts-repo.ts';
import { listTransactions } from '../db/ledger-repo.ts';
import { processInboxFile } from './inbox-watcher.ts';

describe('Local Inbox Statement Auto-Sync Watcher', () => {
  it('parses and auto-ingests a CSV statement file dropped into inbox', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-test-'));
    const inboxDir = path.join(tmpDir, 'inbox');
    const processedDir = path.join(tmpDir, 'processed');
    const failedDir = path.join(tmpDir, 'failed');
    fs.mkdirSync(inboxDir, { recursive: true });

    const db = openDatabase(':memory:');
    const acc = createAccount(db, {
      name: 'HDFC Salary Bank',
      type: 'bank',
      scope: 'personal',
      openingBalanceMinor: 5_000_000,
    });

    const csvContent = `Date,Description,Amount,Type
2026-11-10,Reliance Fresh Groceries,1450.00,Debit
2026-11-11,Swiggy Food Delivery,420.00,Debit
2026-11-12,Freelance Consulting,25000.00,Credit`;

    const sampleFile = path.join(inboxDir, 'bank_statement_nov.csv');
    fs.writeFileSync(sampleFile, csvContent, 'utf-8');

    const result = await processInboxFile(sampleFile, {
      db,
      defaultAccountId: acc.id,
      processedDir,
      failedDir,
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 3);

    // Verify file moved to processedDir
    assert.equal(fs.existsSync(sampleFile), false);
    const processedFiles = fs.readdirSync(processedDir);
    assert.equal(processedFiles.length, 1);
    assert.ok(processedFiles[0].includes('bank_statement_nov.csv'));

    // Verify transactions in database
    const txs = listTransactions(db, { scope: 'personal' });
    assert.equal(txs.length, 3);

    const groceriesTx = txs.find((t) => t.category.toLowerCase().includes('groceries') || t.party.toLowerCase().includes('reliance'));
    assert.ok(groceriesTx);

    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  });

  it('handles invalid or corrupted files by safely moving them to failed directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-fail-test-'));
    const inboxDir = path.join(tmpDir, 'inbox');
    const processedDir = path.join(tmpDir, 'processed');
    const failedDir = path.join(tmpDir, 'failed');
    fs.mkdirSync(inboxDir, { recursive: true });

    const db = openDatabase(':memory:');
    const sampleFile = path.join(inboxDir, 'corrupted_file.xyz');
    fs.writeFileSync(sampleFile, 'unsupported binary content', 'utf-8');

    const result = await processInboxFile(sampleFile, {
      db,
      processedDir,
      failedDir,
    });

    assert.equal(result.success, false);
    assert.ok(result.error);

    // Verify file moved to failedDir
    assert.equal(fs.existsSync(sampleFile), false);
    const failedFiles = fs.readdirSync(failedDir);
    assert.ok(failedFiles.some((f) => f.includes('corrupted_file.xyz')));

    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  });
});
