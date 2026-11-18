import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAmortizationProjectionSeries,
  computeLiabilityReceivableMix,
  computeLoansDuesPortfolioMetrics,
  resolveLoanCardTheme,
} from './loansDuesAnalytics.ts';
import type { LoanRecord, PersonDueRecord, SavingsGoalRecord } from '../../lib/api.ts';

const sampleLoans: LoanRecord[] = [
  {
    id: 'l-1',
    name: 'SBI Corporate Term Loan',
    counterparty: 'State Bank of India',
    scope: 'business',
    direction: 'borrowed',
    principalMinor: 100_000_00,
    remainingMinor: 60_000_00,
    annualRateBps: 1000, // 10%
    tenureMonths: 36,
    emiMinor: 3_227_00,
    startDate: '2025-01-10',
    nextDueDate: '2026-04-18',
    status: 'active',
    totalPrincipalPaidMinor: 40_000_00,
    totalInterestPaidMinor: 8_500_00,
    linkedAccountId: 'acc-1',
    createdAt: '2025-01-10',
  },
  {
    id: 'l-2',
    name: 'Bridge Assist to Partner',
    counterparty: 'Vikram Singh',
    scope: 'business',
    direction: 'lent',
    principalMinor: 25_000_00,
    remainingMinor: 15_000_00,
    annualRateBps: 800,
    tenureMonths: 12,
    emiMinor: 2_100_00,
    startDate: '2025-06-01',
    nextDueDate: '2026-04-25',
    status: 'active',
    totalPrincipalPaidMinor: 10_000_00,
    totalInterestPaidMinor: 1_200_00,
    linkedAccountId: 'acc-1',
    createdAt: '2025-06-01',
  },
];

const sampleDues: PersonDueRecord[] = [
  {
    id: 'd-1',
    personName: 'Ramesh Traders',
    phone: '+919876543210',
    direction: 'need',
    scope: 'business',
    amountMinor: 20_000_00,
    settledMinor: 8_000_00,
    remainingMinor: 12_000_00,
    dueDate: '2026-04-16',
    note: 'Invoice #408 balance',
    status: 'partial',
    createdAt: '2026-03-01',
  },
  {
    id: 'd-2',
    personName: 'Aarav Logistics',
    phone: '+919811122233',
    direction: 'give',
    scope: 'business',
    amountMinor: 10_000_00,
    settledMinor: 0,
    remainingMinor: 10_000_00,
    dueDate: '2026-04-28',
    note: 'Freight settlement',
    status: 'open',
    createdAt: '2026-03-10',
  },
];

const sampleGoals: SavingsGoalRecord[] = [
  {
    id: 'g-1',
    title: 'Advance Tax Reserve FY26',
    kind: 'tax_reserve',
    scope: 'business',
    targetMinor: 50_000_00,
    currentMinor: 30_000_00,
    targetDate: '2026-09-15',
    linkedAccountId: null,
    note: 'Q2 corporate advance tax',
    createdAt: '2026-01-01',
  },
];

describe('loansDuesAnalytics', () => {
  it('computes portfolio borrowings, receivables, net debt, and urgent dues accurately', () => {
    const metrics = computeLoansDuesPortfolioMetrics(sampleLoans, sampleDues, 15);
    assert.equal(metrics.totalBorrowedPrincipalMinor, 100_000_00);
    assert.equal(metrics.totalBorrowedRemainingMinor, 60_000_00);
    assert.equal(metrics.totalKhatabookGiveMinor, 10_000_00);
    assert.equal(metrics.totalBorrowingsMinor, 70_000_00);

    assert.equal(metrics.totalLentRemainingMinor, 15_000_00);
    assert.equal(metrics.totalKhatabookNeedMinor, 12_000_00);
    assert.equal(metrics.totalReceivablesMinor, 27_000_00);

    assert.equal(metrics.netDebtPositionMinor, 43_000_00);
    assert.equal(metrics.monthlyEmiCommitmentMinor, 3_227_00);
    assert.equal(metrics.weightedAvgAprBps, 1000);
    assert.equal(metrics.principalClearedPct, 40);
    // Day 15: l-1 due on 18th (+3d) and d-1 due on 16th (+1d) are both urgent
    assert.equal(metrics.urgentDueCount, 2);
  });

  it('builds 12-month amortization projection curve with accelerated extra payments', () => {
    const curve = buildAmortizationProjectionSeries(sampleLoans, 2_000_00, 12);
    assert.equal(curve.length, 13);
    assert.equal(curve[0].monthLabel, 'Now');
    assert.equal(curve[0].baselineMinor, 60_000_00);
    assert.equal(curve[0].acceleratedMinor, 60_000_00);

    const last = curve[12];
    assert.ok(last.acceleratedMinor < last.baselineMinor, 'Accelerated balance should be lower than baseline');
    assert.ok(last.cumulativeInterestSavedMinor > 0, 'Should save interest with extra monthly payment');
  });

  it('computes liability & receivable mix slices with percentages', () => {
    const slices = computeLiabilityReceivableMix(sampleLoans, sampleDues, sampleGoals);
    assert.equal(slices.length, 4);
    const bankSlice = slices.find((s) => s.id === 'bank_loans');
    const giveSlice = slices.find((s) => s.id === 'khatabook_give');
    const needSlice = slices.find((s) => s.id === 'receivables_need');
    const goalSlice = slices.find((s) => s.id === 'savings_reserves');

    assert.equal(bankSlice?.amountMinor, 60_000_00);
    assert.equal(giveSlice?.amountMinor, 10_000_00);
    assert.equal(needSlice?.amountMinor, 27_000_00);
    assert.equal(goalSlice?.amountMinor, 30_000_00);
  });

  it('resolves appropriate 3D metallic themes for loans, dues, and overrides', () => {
    const loanTheme = resolveLoanCardTheme({ kind: 'loan', data: sampleLoans[0] }, 'auto');
    assert.equal(loanTheme.id, 'obsidian');

    const needTheme = resolveLoanCardTheme({ kind: 'due', data: sampleDues[0] }, 'auto');
    assert.equal(needTheme.id, 'emerald');

    const giveTheme = resolveLoanCardTheme({ kind: 'due', data: sampleDues[1] }, 'auto');
    assert.equal(giveTheme.id, 'crimson');

    const forcedGold = resolveLoanCardTheme({ kind: 'loan', data: sampleLoans[0] }, 'gold');
    assert.equal(forcedGold.id, 'gold');
  });
});
