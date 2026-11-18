import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTreasuryFlowSeries,
  computeAccountAllocationMix,
  computeTreasuryMetrics,
  parseBankUpiSms,
} from './treasuryAnalytics.ts';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';

const mockBanks: AccountRecord[] = [
  {
    id: 'bank-1',
    name: 'HDFC Corporate & Salary',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'business',
    institution: 'HDFC Bank',
    last4: '4821',
    openingBalanceMinor: 10000000,
    currentBalanceMinor: 24500000, // ₹2,45,000
    creditLimitMinor: 0,
    statementDay: 1,
    dueDay: 1,
    minBalanceMinor: 2500000,
    cardCycle: null,
    createdAt: '2026-11-14',
  },
  {
    id: 'cash-1',
    name: 'Cash & UPI Float',
    type: 'bank',
    accountGroup: 'cash',
    scope: 'business',
    institution: 'Physical Cash',
    last4: '0001',
    openingBalanceMinor: 500000,
    currentBalanceMinor: 350000, // ₹3,500 (below ₹5,000 safety floor)
    creditLimitMinor: 0,
    statementDay: 1,
    dueDay: 1,
    minBalanceMinor: 500000,
    cardCycle: null,
    createdAt: '2026-11-14',
  },
];

const mockCards: AccountRecord[] = [
  {
    id: 'card-1',
    name: 'HDFC Regalia Gold',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'HDFC Bank',
    last4: '8832',
    openingBalanceMinor: 0,
    currentBalanceMinor: -4850000, // ₹48,500 debt
    creditLimitMinor: 50000000,
    statementDay: 15,
    dueDay: 5,
    minBalanceMinor: 0,
    cardCycle: null,
    createdAt: '2026-11-14',
  },
];

const mockTxs: TransactionRecord[] = [
  {
    id: 'tx-1',
    kind: 'income',
    scope: 'business',
    accountId: 'bank-1',
    accountName: 'HDFC Corporate & Salary',
    toAccountId: null,
    toAccountName: null,
    category: 'Client Retainer',
    amountMinor: 15000000, // +₹1,50,000
    occurredAt: '2026-11-13',
    party: 'Apex Global Corp',
    note: 'Retainer',
    sourceRef: null,
    hasAttachment: false,
    createdAt: '2026-11-13',
  },
  {
    id: 'tx-2',
    kind: 'expense',
    scope: 'business',
    accountId: 'bank-1',
    accountName: 'HDFC Corporate & Salary',
    toAccountId: null,
    toAccountName: null,
    category: 'Inventory / Supplies',
    amountMinor: 4200000, // -₹42,000
    occurredAt: '2026-11-14',
    party: 'B2B Supplier',
    note: 'Raw materials',
    sourceRef: null,
    hasAttachment: false,
    createdAt: '2026-11-14',
  },
];

describe('Module 3 Treasury Analytics', () => {
  it('computes liquid treasury metrics, debt coverage ratio, and safety floor alerts', () => {
    const metrics = computeTreasuryMetrics(mockBanks, mockCards, mockTxs, '2026-11-14');
    assert.equal(metrics.totalLiquidMinor, 24850000);
    assert.equal(metrics.bankDepositMinor, 24500000);
    assert.equal(metrics.walletCashMinor, 350000);
    assert.equal(metrics.bankCount, 1);
    assert.equal(metrics.walletCount, 1);
    assert.equal(metrics.totalCreditDebtMinor, 4850000);
    assert.equal(metrics.lowSafetyFloorCount, 1);
    assert.equal(metrics.monthInflowMinor, 15000000);
    assert.equal(metrics.monthOutflowMinor, 4200000);
    assert.equal(metrics.monthNetFlowMinor, 10800000);
  });

  it('builds a 14-day inflow vs outflow cashflow series', () => {
    const liquidSet = new Set(['bank-1', 'cash-1']);
    const flow = buildTreasuryFlowSeries(mockTxs, liquidSet, '2026-11-14', 14);
    assert.equal(flow.series.length, 14);
    assert.equal(flow.totalWindowInflowMinor, 15000000);
    assert.equal(flow.totalWindowOutflowMinor, 4200000);
    assert.equal(flow.netWindowFlowMinor, 10800000);
    assert.equal(flow.peakInflowDay?.date, '2026-11-13');
    assert.equal(flow.peakOutflowDay?.date, '2026-11-14');
  });

  it('computes deposit allocation mix sorted by balance descending', () => {
    const mix = computeAccountAllocationMix(mockBanks);
    assert.equal(mix.length, 2);
    assert.equal(mix[0].accountId, 'bank-1');
    assert.ok(mix[0].sharePct >= 95);
    assert.equal(mix[1].accountId, 'cash-1');
  });

  it('parses Indian Bank NEFT credit and UPI debit SMS notifications accurately', () => {
    const creditSms =
      'Rs. 85,000.00 credited to A/c XX4821 on 16-11-26 by NEFT from Horizon Ventures. Avl Bal Rs. 3,30,000';
    const parsedCredit = parseBankUpiSms(creditSms, mockBanks, '2026-11-16');
    assert.ok(parsedCredit);
    assert.equal(parsedCredit.kind, 'income');
    assert.equal(parsedCredit.amountRupees, '85000.00');
    assert.equal(parsedCredit.accountId, 'bank-1');
    assert.equal(parsedCredit.party, 'Horizon Ventures');
    assert.equal(parsedCredit.scope, 'business');

    const debitSms =
      'INR 4,250.00 debited from A/c XX4821 to BlueDart Logistics via UPI. Ref 632019';
    const parsedDebit = parseBankUpiSms(debitSms, mockBanks, '2026-11-16');
    assert.ok(parsedDebit);
    assert.equal(parsedDebit.kind, 'expense');
    assert.equal(parsedDebit.amountRupees, '4250.00');
    assert.equal(parsedDebit.accountId, 'bank-1');
    assert.equal(parsedDebit.category, 'Logistics & Courier');
  });
});
