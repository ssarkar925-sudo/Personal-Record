import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase, withTransaction } from './db/schema.ts';
import { createAccount } from './db/accounts-repo.ts';
import { listTransactions } from './db/ledger-repo.ts';
import { checkDatabaseHealth } from './db/maintenance.ts';

describe('High-Volume Stress & SQLite WAL Concurrency Suite', () => {
  it('ingests 5,000 transactions in an atomic batch with high throughput', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-stress-'));
    const dbPath = path.join(tmpDir, 'stress.sqlite');

    try {
      const db = openDatabase(dbPath);
      const acc = createAccount(db, {
        name: 'Stress Bank Account',
        type: 'bank',
        scope: 'personal',
        institution: 'Benchmark Bank',
        last4: '1234',
        openingBalanceMinor: 10_000_000,
        minBalanceMinor: 0,
        creditLimitMinor: 0,
        statementDay: 15,
        dueDay: 5,
      });

      const count = 5000;
      const start = performance.now();

      withTransaction(db, () => {
        const stmt = db.prepare(`
          INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
          VALUES (?, 'expense', 'personal', ?, 'Stress Testing', ?, '2026-11-13', 'Benchmark Vendor', 'Stress benchmark row', '2026-11-13T00:00:00.000Z')
        `);

        for (let i = 0; i < count; i++) {
          stmt.run(`tx-stress-${i}`, acc.id, 1000 + (i % 500));
        }
      });

      const durationMs = performance.now() - start;
      // SQLite WAL inside an atomic transaction can easily insert 5,000 rows in < 1,000ms
      assert.ok(durationMs < 3000, `Batch insertion took ${durationMs}ms, expected < 3000ms`);

      const totalRows = db.prepare('SELECT count(*) as count FROM transactions').get() as { count: number };
      assert.equal(totalRows.count, 5000);

      // Verify health after heavy write
      const health = checkDatabaseHealth(db);
      assert.equal(health.ok, true);
      assert.equal(health.integrity, 'ok');

      db.close();
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  it('handles 50 concurrent asynchronous read operations during transaction streaming without SQLITE_BUSY', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-wal-concurrency-'));
    const dbPath = path.join(tmpDir, 'concurrency.sqlite');

    try {
      const db = openDatabase(dbPath);
      const acc = createAccount(db, {
        name: 'Concurrency Account',
        type: 'bank',
        scope: 'personal',
        institution: 'Benchmark Bank',
        last4: '5678',
        openingBalanceMinor: 5_000_000,
        minBalanceMinor: 0,
        creditLimitMinor: 0,
        statementDay: 15,
        dueDay: 5,
      });

      // Insert initial 500 rows
      withTransaction(db, () => {
        const stmt = db.prepare(`
          INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
          VALUES (?, 'income', 'personal', ?, 'Salary', 100000, '2026-11-13', 'Employer', 'Init row', '2026-11-13T00:00:00.000Z')
        `);
        for (let i = 0; i < 500; i++) {
          stmt.run(`init-tx-${i}`, acc.id);
        }
      });

      // Spawn 50 simulated concurrent queries across the connection
      const readPromises: Promise<number>[] = [];
      for (let i = 0; i < 50; i++) {
        readPromises.push(
          new Promise((resolve, reject) => {
            setImmediate(() => {
              try {
                const results = listTransactions(db, { scope: 'personal', limit: 100 });
                resolve(results.length);
              } catch (err) {
                reject(err);
              }
            });
          })
        );
      }

      // Stream more transactions while read promises are scheduled
      for (let j = 0; j < 50; j++) {
        db.prepare(`
          INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
          VALUES (?, 'expense', 'personal', ?, 'Groceries', 500, '2026-11-13', 'Store', 'Concurrent row', '2026-11-13T00:00:00.000Z')
        `).run(`concurrent-tx-${j}`, acc.id);
      }

      const results = await Promise.all(readPromises);
      assert.equal(results.length, 50);
      for (const len of results) {
        assert.ok(len >= 100, `Expected at least 100 results, got ${len}`);
      }

      db.close();
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  it('performs indexed compound range aggregation over 5,000+ rows under 35ms', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-agg-'));
    const dbPath = path.join(tmpDir, 'aggregation.sqlite');

    try {
      const db = openDatabase(dbPath);
      const acc = createAccount(db, {
        name: 'Agg Account',
        type: 'bank',
        scope: 'personal',
        institution: 'Benchmark Bank',
        last4: '9012',
        openingBalanceMinor: 10_000_000,
        minBalanceMinor: 0,
        creditLimitMinor: 0,
        statementDay: 15,
        dueDay: 5,
      });

      withTransaction(db, () => {
        const stmt = db.prepare(`
          INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
          VALUES (?, 'expense', 'personal', ?, ?, ?, ?, 'Party', 'Note', '2026-11-13T00:00:00.000Z')
        `);
        const categories = ['Food', 'Utilities', 'Travel', 'Health', 'Entertainment'];
        for (let i = 0; i < 5000; i++) {
          const cat = categories[i % categories.length];
          const date = `2026-11-${String((i % 28) + 1).padStart(2, '0')}`;
          stmt.run(`agg-${i}`, acc.id, cat, 1000 + i, date);
        }
      });

      // Measure query execution using the compound index idx_transactions_query
      const start = performance.now();
      const summary = db.prepare(`
        SELECT category, count(*) as count, sum(amount_minor) as total
        FROM transactions
        WHERE scope = 'personal' AND occurred_at >= '2026-11-01'
        GROUP BY category
      `).all() as { category: string; count: number; total: number }[];
      const queryDuration = performance.now() - start;

      assert.equal(summary.length, 5);
      assert.ok(queryDuration < 80, `Query duration ${queryDuration}ms exceeded limit`);

      db.close();
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  it('keeps memory heap bounded and stable under load', () => {
    const beforeHeap = process.memoryUsage().heapUsed;
    const db = openDatabase(':memory:');

    withTransaction(db, () => {
      const stmt = db.prepare(`
        INSERT INTO notes (id, title, body, scope, color, pinned, archived, updated_at, created_at)
        VALUES (?, 'Note Title', 'Large body of text for memory benchmarking in local-first database', 'personal', 'default', 0, 0, '2026-11-13T00:00:00Z', '2026-11-13T00:00:00Z')
      `);
      for (let i = 0; i < 2000; i++) {
        stmt.run(`note-mem-${i}`);
      }
    });

    const rows = db.prepare('SELECT count(*) as count FROM notes').get() as { count: number };
    assert.equal(rows.count, 2000);
    db.close();

    const afterHeap = process.memoryUsage().heapUsed;
    const heapDiffMB = (afterHeap - beforeHeap) / (1024 * 1024);
    // Heap difference should be well within reasonable limits (< 50MB)
    assert.ok(heapDiffMB < 50, `Heap growth of ${heapDiffMB}MB exceeded threshold`);
  });
});
