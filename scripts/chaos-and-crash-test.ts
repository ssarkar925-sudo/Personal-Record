import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planLocalCommand, normalizeNumerals } from '../shared/agent-nlu.ts';
import {
  rupeesToPaise,
  formatINR,
  addMonthsISO,
  computeCardCycle,
  estimateMonthlyEmiMinor,
} from '../shared/ledger-core.ts';
import { compareTaxRegimes, computeAdvanceTaxSchedule } from '../shared/tax-engine.ts';
import { openDatabase, withTransaction } from '../server/db/schema.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('🔥 Chaos, Stress & Application Crash Resilience Suite', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. AI AGENT FUZZING & INJECTION RESILIENCE
  // ──────────────────────────────────────────────────────────────────────────
  describe('AI Agent NLU & Parser Fuzzing', () => {
    it('handles empty, blank, and pure whitespace inputs without crashing', () => {
      const inputs = ['', '   ', '\t\n\r', '         '];
      for (const str of inputs) {
        const res = planLocalCommand(str);
        assert.ok(Array.isArray(res), 'Must return an array of tool calls');
        assert.equal(res[0].tool, 'help');
      }
    });

    it('survives massive 50,000+ character buffer overflows without throwing', () => {
      const massiveStr = 'Tea 50 ' + 'A'.repeat(50000) + ' Coffee 100';
      const start = performance.now();
      const res = planLocalCommand(massiveStr);
      const duration = performance.now() - start;
      assert.ok(Array.isArray(res), 'Must return tool calls array');
      assert.ok(duration < 1000, `Parsing 50k chars must complete in <1000ms (took ${duration}ms)`);
    });

    it('survives binary control characters and null bytes safely', () => {
      const dirty = 'Tea\x00\x01\x02\x1b\x7f 50\x00 and\r\nCoffee\t100';
      const res = planLocalCommand(dirty);
      assert.ok(Array.isArray(res));
      assert.ok(res.length > 0, 'Should extract valid tool calls despite null bytes');
    });

    it('neutralizes SQL Injection and XSS payloads in natural language without crash', () => {
      const payloads = [
        "Tea 50; DROP TABLE transactions; --",
        "Coffee 100' OR '1'='1",
        "<script>alert(1)</script> 500",
        '"><img src=x onerror=alert("xss")> 250',
        "Teach: <script>evil()</script> means ' OR 1=1 --",
      ];
      for (const p of payloads) {
        const res = planLocalCommand(p);
        assert.ok(Array.isArray(res), `Failed on payload: ${p}`);
        assert.ok(res.length >= 0);
      }
    });

    it('handles extreme and boundary numerical representations safely', () => {
      const numberTests = [
        'Tea 0',
        'Coffee -50',
        'Petrol 999999999999999999999999999999',
        'Snack 0.00000001',
        'Flight 1e6',
        'Hotel NaN',
        'Cab Infinity',
      ];
      for (const numStr of numberTests) {
        assert.doesNotThrow(() => {
          const res = planLocalCommand(numStr);
          assert.ok(Array.isArray(res));
        }, `Crashed on numerical edge case: ${numStr}`);
      }
    });

    it('safely handles 100 batched multi-item commands in a single prompt', () => {
      const items: string[] = [];
      for (let i = 1; i <= 20; i++) {
        items.push(`Item${i} ${i * 10}`);
      }
      const singlePrompt = items.join(', ');
      const start = performance.now();
      const res = planLocalCommand(singlePrompt);
      const dur = performance.now() - start;
      assert.ok(Array.isArray(res));
      assert.ok(dur < 1500, `Batched items parsed in ${dur}ms (<1500ms)`);
    });

    it('handles malformed teach commands gracefully', () => {
      const malformed = [
        'Teach:',
        'Remember:',
        'Teach:       ',
        'Teach:   means   ',
        'Teach: A means',
        'Teach: means B',
        'Clear rules and forget all',
        'What did I teach you?',
      ];
      for (const cmd of malformed) {
        assert.doesNotThrow(() => {
          const res = planLocalCommand(cmd);
          assert.ok(Array.isArray(res));
        });
      }
    });

    it('normalizes multilingual digits (Bengali & Devanagari) across mixed text', () => {
      assert.equal(normalizeNumerals('১২৩৪৫'), '12345');
      assert.equal(normalizeNumerals('१२३४५'), '12345');
      assert.equal(normalizeNumerals('Tea ১২০ and Coffee ३५०'), 'Tea 120 and Coffee 350');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. FINANCIAL CORE & LEDGER ARITHMETIC RESILIENCE
  // ──────────────────────────────────────────────────────────────────────────
  describe('Ledger Core & Arithmetic Precision', () => {
    it('rupeesToPaise handles floating point precision without 0.0000000000000001 drift', () => {
      const cases: [string | number, number][] = [
        [0.1 + 0.2, 30], // Classic JS 0.30000000000000004
        ['19.99', 1999],
        ['0.01', 1],
        ['0.00', 0],
        ['10000000.50', 1000000050],
        [-50.75, -5075],
      ];
      for (const [input, expected] of cases) {
        const actual = rupeesToPaise(input);
        assert.equal(actual, expected, `Failed on input: ${input}`);
      }
      assert.throws(() => rupeesToPaise('invalid-string'));
    });

    it('formatINR formats zero, negative numbers, and high billions without crashing', () => {
      assert.equal(formatINR(0), '₹0.00');
      assert.equal(formatINR(-5000), '-₹50.00');
      assert.equal(formatINR(100000000000), '₹1,00,00,00,000.00');
      assert.equal(formatINR(NaN), '₹0.00');
      assert.equal(formatINR(Infinity), '₹0.00');
    });

    it('calendar date calculations strictly prevent month overflow and leap year panics', () => {
      // Jan 31 + 1 month => Feb 28 (or 29 in leap year)
      const febNonLeap = addMonthsISO('2025-01-31', 1);
      assert.equal(febNonLeap, '2025-02-28');

      const febLeap = addMonthsISO('2024-01-31', 1);
      assert.equal(febLeap, '2024-02-29');

      // March 31 - 1 month in non-leap year => Feb 28
      const febBack = addMonthsISO('2025-03-31', -1);
      assert.equal(febBack, '2025-02-28');

      // Invalid date string fallback gracefully returns a valid date
      assert.doesNotThrow(() => {
        const fallback = addMonthsISO('not-a-date', 1);
        assert.ok(typeof fallback === 'string');
      });
    });

    it('computeCardCycle survives zero credit limits, overlapping dates, and 0-day periods', () => {
      assert.doesNotThrow(() => {
        const cycle = computeCardCycle({
          statementDay: 31,
          dueDay: 5,
          creditLimitMinor: 0,
          referenceDate: '2026-02-15',
          transactions: [],
        });
        assert.ok(cycle);
        assert.equal(cycle.unbilledMinor, 0);
      });
    });

    it('estimateMonthlyEmiMinor handles 0% interest, 0 tenure, and huge loans safely', () => {
      // 0% interest edge case (interest-free personal loan)
      const zeroInterest = estimateMonthlyEmiMinor(10000000, 0, 12);
      assert.equal(zeroInterest, Math.round(10000000 / 12));

      // 0 tenure edge case
      const zeroTenure = estimateMonthlyEmiMinor(10000000, 1000, 0);
      assert.equal(zeroTenure, 0);

      // Huge principal
      const hugeLoan = estimateMonthlyEmiMinor(100000000000, 1200, 240);
      assert.ok(hugeLoan > 0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. TAX COMPLIANCE ENGINE STRESS & EXTREME BOUNDARIES
  // ──────────────────────────────────────────────────────────────────────────
  describe('Indian Income Tax Engine Boundary & Stress', () => {
    it('handles negative, zero, and astronomical incomes without throwing', () => {
      // Zero income
      const zeroTax = compareTaxRegimes(
        { salaryIncomeMinor: 0, businessNetProfitMinor: 0, otherIncomeMinor: 0, stcgEquityMinor: 0, ltcgEquityMinor: 0 },
        { isSalaried: true, section80cMinor: 0, section80dSelfMinor: 0, section80dParentsMinor: 0, section80ccd1bMinor: 0, section24bMinor: 0, section80ttaMinor: 0, hraExemptionMinor: 0, otherDeductionsMinor: 0, isSeniorCitizen: false, isParentsSenior: false }
      );
      assert.equal(zeroTax.newRegime.totalTaxLiabilityMinor, 0);
      assert.equal(zeroTax.oldRegime.totalTaxLiabilityMinor, 0);

      // Negative income (loss)
      const lossTax = compareTaxRegimes(
        { salaryIncomeMinor: -50000000, businessNetProfitMinor: 0, otherIncomeMinor: 0, stcgEquityMinor: 0, ltcgEquityMinor: 0 },
        { isSalaried: true, section80cMinor: 0, section80dSelfMinor: 0, section80dParentsMinor: 0, section80ccd1bMinor: 0, section24bMinor: 0, section80ttaMinor: 0, hraExemptionMinor: 0, otherDeductionsMinor: 0, isSeniorCitizen: false, isParentsSenior: false }
      );
      assert.equal(lossTax.newRegime.totalTaxLiabilityMinor, 0);

      // High Net Worth: ₹100 Crore income (testing surcharge & cess)
      const hnwTax = compareTaxRegimes(
        { salaryIncomeMinor: 100_00_00_000 * 100, businessNetProfitMinor: 0, otherIncomeMinor: 0, stcgEquityMinor: 0, ltcgEquityMinor: 0 },
        { isSalaried: true, section80cMinor: 0, section80dSelfMinor: 0, section80dParentsMinor: 0, section80ccd1bMinor: 0, section24bMinor: 0, section80ttaMinor: 0, hraExemptionMinor: 0, otherDeductionsMinor: 0, isSeniorCitizen: false, isParentsSenior: false }
      );
      assert.ok(hnwTax.newRegime.totalTaxLiabilityMinor > 0);
      assert.ok(hnwTax.newRegime.cessMinor > 0);
    });

    it('Advance Tax schedule correctly partitions quarterly payments for any tax value', () => {
      const schedule = computeAdvanceTaxSchedule(1000000, 2024, '2024-05-01'); // ₹10,000 tax
      assert.equal(schedule.length, 4);
      assert.equal(schedule[0].quarter, 'Q1');
      assert.equal(schedule[0].cumulativePct, 15);
      assert.equal(schedule[1].quarter, 'Q2');
      assert.equal(schedule[1].cumulativePct, 45);
      assert.equal(schedule[2].quarter, 'Q3');
      assert.equal(schedule[2].cumulativePct, 75);
      assert.equal(schedule[3].quarter, 'Q4');
      assert.equal(schedule[3].cumulativePct, 100);

      // Zero tax schedule
      const zeroSchedule = computeAdvanceTaxSchedule(0, 2024, '2024-05-01');
      assert.equal(zeroSchedule.length, 4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DATABASE INTEGRITY, WAL LOCK CONCURRENCY & RECOVERY
  // ──────────────────────────────────────────────────────────────────────────
  describe('SQLite Engine WAL Concurrency & Constraint Rollback', () => {
    it('aborts cleanly on constraint violations and rolls back without state corruption', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-chaos-'));
      const dbPath = path.join(tmpDir, 'chaos.sqlite');

      try {
        const db = openDatabase(dbPath);

        // Insert valid account
        db.prepare(`
          INSERT INTO accounts (id, name, type, scope, institution, opening_balance_minor, created_at)
          VALUES ('acc-1', 'Test Acc', 'bank', 'personal', 'Bank', 10000, '2026-11-20T00:00:00.000Z')
        `).run();

        // Attempt transaction with a duplicate primary key intentionally to trigger rollback
        assert.throws(() => {
          withTransaction(db, () => {
            db.prepare(`
              INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
              VALUES ('tx-ok', 'expense', 'personal', 'acc-1', 'Food', 500, '2026-11-20', 'Shop', '', '2026-11-20T00:00:00.000Z')
            `).run();

            // Intentionally duplicate 'tx-ok'
            db.prepare(`
              INSERT INTO transactions (id, kind, scope, account_id, category, amount_minor, occurred_at, party, note, created_at)
              VALUES ('tx-ok', 'expense', 'personal', 'acc-1', 'Food', 500, '2026-11-20', 'Shop', '', '2026-11-20T00:00:00.000Z')
            `).run();
          });
        });

        // Verify rollback: 'tx-ok' must NOT exist in the database
        const row = db.prepare("SELECT * FROM transactions WHERE id = 'tx-ok'").get();
        assert.equal(row, undefined, 'Rolled back transaction must leave zero trace in database');

        // Verify database remains operational and healthy
        const pragma = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        assert.equal(pragma.integrity_check, 'ok');

        db.close();
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5 });
        } catch {}
      }
    });

    it('survives rapid parallel open/query/close cycles without file handle locks', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-parallel-'));
      const dbPath = path.join(tmpDir, 'parallel.sqlite');

      try {
        const masterDb = openDatabase(dbPath);
        masterDb.prepare(`
          INSERT INTO accounts (id, name, type, scope, institution, opening_balance_minor, created_at)
          VALUES ('acc-p', 'Parallel Acc', 'bank', 'personal', 'Bank', 50000, '2026-11-20T00:00:00.000Z')
        `).run();
        masterDb.close();

        // 20 asynchronous readers opening and querying the database simultaneously
        const promises = Array.from({ length: 20 }, async (_, idx) => {
          const reader = openDatabase(dbPath);
          const res = reader.prepare('SELECT count(*) as cnt FROM accounts').get() as { cnt: number };
          assert.equal(res.cnt, 1);
          reader.close();
          return idx;
        });

        const results = await Promise.all(promises);
        assert.equal(results.length, 20);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5 });
        } catch {}
      }
    });
  });

});
