import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCardDailyVelocitySeries,
  computeCardCategoryMix,
  computeCardsPortfolioMetrics,
  formatDayMonthShort,
} from './cardsAnalytics.ts';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';

test('formatDayMonthShort formats YYYY-MM-DD into compact day and month', () => {
  assert.equal(formatDayMonthShort('2026-11-14'), '14 Nov');
  assert.equal(formatDayMonthShort('2026-01-05'), '5 Jan');
});

test('computeCardsPortfolioMetrics aggregates debt, limit, billed vs unbilled, and coverage', () => {
  const mockCards: AccountRecord[] = [
    {
      id: 'c1',
      name: 'Amex Platinum Travel',
      type: 'credit_card',
      accountGroup: 'credit_card',
      scope: 'business',
      institution: 'American Express',
      last4: '1004',
      openingBalanceMinor: 0,
      minBalanceMinor: 0,
      creditLimitMinor: 60000000,
      statementDay: 25,
      dueDay: 15,
      currentBalanceMinor: -2450000,
      cardCycle: {
        lastStatementDate: '2026-10-25',
        nextStatementDate: '2026-11-25',
        nextDueDate: '2026-11-15',
        daysUntilDue: 1,
        totalOutstandingMinor: 2450000,
        statementDueMinor: 1000000,
        unbilledMinor: 1450000,
        utilizationPct: 4.1,
        isBillOverdue: false,
      },
      createdAt: '2026-01-01',
    },
    {
      id: 'c2',
      name: 'HDFC Regalia Gold',
      type: 'credit_card',
      accountGroup: 'credit_card',
      scope: 'personal',
      institution: 'HDFC Bank',
      last4: '8821',
      openingBalanceMinor: 0,
      minBalanceMinor: 0,
      creditLimitMinor: 40000000,
      statementDay: 18,
      dueDay: 8,
      currentBalanceMinor: -1550000,
      cardCycle: {
        lastStatementDate: '2026-10-18',
        nextStatementDate: '2026-11-18',
        nextDueDate: '2026-12-08',
        daysUntilDue: 24,
        totalOutstandingMinor: 1550000,
        statementDueMinor: 0,
        unbilledMinor: 1550000,
        utilizationPct: 3.9,
        isBillOverdue: false,
      },
      createdAt: '2026-01-01',
    },
  ];

  const metrics = computeCardsPortfolioMetrics(mockCards, 80000000, 4000000);
  assert.equal(metrics.totalDebtMinor, 4000000);
  assert.equal(metrics.totalLimitMinor, 100000000);
  assert.equal(metrics.totalStatementDueMinor, 1000000);
  assert.equal(metrics.totalUnbilledMinor, 3000000);
  assert.equal(metrics.availableCreditMinor, 96000000);
  assert.equal(metrics.overallUtilizationPct, 4);
  assert.equal(metrics.billedSharePct, 25);
  assert.equal(metrics.unbilledSharePct, 75);
  assert.equal(metrics.liquidityCoverageRatio, 20);
  assert.equal(metrics.urgentDueCardsCount, 1);
  assert.equal(metrics.estimatedRewardPoints > 0, true);
});

test('buildCardDailyVelocitySeries constructs N-day window and identifies peak spend day', () => {
  const txs: TransactionRecord[] = [
    {
      id: 't1',
      kind: 'expense',
      scope: 'personal',
      accountId: 'c1',
      accountName: 'Amex',
      toAccountId: null,
      toAccountName: null,
      category: 'Flight Tickets',
      amountMinor: 2450000,
      occurredAt: '2026-11-12',
      party: 'IndiGo Airlines',
      note: '',
      sourceRef: null,
      createdAt: '2026-11-12',
    },
    {
      id: 't2',
      kind: 'expense',
      scope: 'personal',
      accountId: 'c1',
      accountName: 'Amex',
      toAccountId: null,
      toAccountName: null,
      category: 'Food & Dining',
      amountMinor: 185000,
      occurredAt: '2026-11-14',
      party: 'Swiggy',
      note: '',
      sourceRef: null,
      createdAt: '2026-11-14',
    },
  ];

  const res = buildCardDailyVelocitySeries(txs, '2026-11-14', 7);
  assert.equal(res.series.length, 7);
  assert.equal(res.totalWindowSpendMinor, 2635000);
  assert.equal(res.totalWindowSwipes, 2);
  assert.equal(res.peakDay?.date, '2026-11-12');
});

test('computeCardCategoryMix ranks expense categories by volume', () => {
  const txs: TransactionRecord[] = [
    {
      id: 't1',
      kind: 'expense',
      scope: 'business',
      accountId: 'c1',
      accountName: 'Amex',
      toAccountId: null,
      toAccountName: null,
      category: 'Flight Tickets',
      amountMinor: 3000000,
      occurredAt: '2026-11-12',
      party: 'Air India',
      note: '',
      sourceRef: null,
      createdAt: '2026-11-12',
    },
    {
      id: 't2',
      kind: 'expense',
      scope: 'personal',
      accountId: 'c2',
      accountName: 'HDFC',
      toAccountId: null,
      toAccountName: null,
      category: 'Shopping',
      amountMinor: 1000000,
      occurredAt: '2026-11-14',
      party: 'Amazon',
      note: '',
      sourceRef: null,
      createdAt: '2026-11-14',
    },
  ];

  const mix = computeCardCategoryMix(txs);
  assert.equal(mix.length, 2);
  assert.equal(mix[0].category, 'Flight Tickets');
  assert.equal(mix[0].sharePct, 75);
  assert.equal(mix[1].category, 'Shopping');
  assert.equal(mix[1].sharePct, 25);
});
