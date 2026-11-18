import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBudgetVarianceRows,
  computeReportsIntelligence,
  computeScopePnlSummary,
  safeRupeesToPaise,
} from './reportsAnalytics.ts';
import type { DetailedReports } from '../../lib/api.ts';

const sampleReportsData: DetailedReports = {
  monthlyCashflow: [
    {
      month: '2026-05',
      incomeMinor: 200_000_00,
      expenseMinor: 100_000_00,
      netMinor: 100_000_00,
    },
    {
      month: '2026-06',
      incomeMinor: 240_000_00,
      expenseMinor: 120_000_00,
      netMinor: 120_000_00,
    },
  ],
  scopePnl: {
    business: {
      incomeMinor: 300_000_00,
      expenseMinor: 110_000_00,
      netMinor: 190_000_00,
    },
    personal: {
      incomeMinor: 140_000_00,
      expenseMinor: 70_000_00,
      netMinor: 70_000_00,
    },
    family: {
      incomeMinor: 0,
      expenseMinor: 40_000_00,
      netMinor: -40_000_00,
    },
  },
  categories: [
    {
      scope: 'business',
      category: 'Cloud Infrastructure',
      kind: 'expense',
      totalMinor: 90_000_00,
      count: 6,
    },
    {
      scope: 'personal',
      category: 'Dining Out',
      kind: 'expense',
      totalMinor: 12_000_00,
      count: 8,
    },
  ],
  categoryBudgets: [
    {
      id: 'b-1',
      scope: 'personal',
      category: 'Dining Out',
      monthlyLimitMinor: 10_000_00,
    },
  ],
  accountActivity: [
    {
      id: 'acc-bank-1',
      name: 'HDFC Corporate Current',
      type: 'bank',
      scope: 'business',
      institution: 'HDFC Bank',
      last4: '4412',
      openingBalanceMinor: 500_000_00,
      minBalanceMinor: 50_000_00,
      creditLimitMinor: 0,
      statementDay: 1,
      dueDay: 15,
      currentBalanceMinor: 660_000_00,
      cardCycle: null,
      createdAt: '2025-01-01',
      periodInflowMinor: 300_000_00,
      periodOutflowMinor: 110_000_00,
    },
  ],
  loans: [],
  dues: [],
  duesByPerson: [],
  duesAging: {
    overdueMinor: 0,
    dueSoonMinor: 0,
    upcomingMinor: 0,
    settledMinor: 0,
  },
  transactionCount: 14,
};

describe('reportsAnalytics', () => {
  it('computes financial runway, savings rate, and spend anomalies accurately', () => {
    const intel = computeReportsIntelligence(sampleReportsData);
    assert.ok(intel);
    assert.equal(intel.bankBalances, 660_000_00);
    // Total outflow = 220,000 across 2 months => 110,000/mo burn => 6.0 months runway
    assert.equal(intel.averageMonthlyBurnMinor, 110_000_00);
    assert.equal(intel.runwayMonths, 6);
    assert.equal(intel.savingsRatePct, 50);
    assert.equal(intel.anomalies.length, 1);
    assert.equal(intel.anomalies[0].category, 'Cloud Infrastructure');
  });

  it('computes consolidated P&L and scope expense shares in Business -> Personal -> Family order', () => {
    const summary = computeScopePnlSummary(sampleReportsData.scopePnl);
    assert.equal(summary.totalIncomeMinor, 440_000_00);
    assert.equal(summary.totalExpenseMinor, 220_000_00);
    assert.equal(summary.totalNetMinor, 220_000_00);
    assert.equal(summary.overallExpenseRatioPct, 50);
    assert.equal(summary.slices[0].scope, 'business');
    assert.equal(summary.slices[0].expenseSharePct, 50);
  });

  it('computes budget variance and EOM burn-rate projection', () => {
    const rows = computeBudgetVarianceRows(
      sampleReportsData.categories,
      sampleReportsData.categoryBudgets ?? [],
      '2026-06-15',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].utilizationPct, 120);
    assert.equal(rows[0].status, 'over_cap');
    assert.equal(rows[0].varianceMinor, -2_000_00);
  });

  it('safely parses rupee strings without throwing on empty or partial inputs', () => {
    assert.equal(safeRupeesToPaise(''), 0);
    assert.equal(safeRupeesToPaise('150000'), 150_000_00);
  });
});
