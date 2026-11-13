import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rupeesToPaise,
  formatINR,
  addMonthsISO,
  daysBetweenISO,
  computeCardCycle,
  splitLoanPayment,
  estimateMonthlyEmiMinor,
  CATEGORY_PRESETS_BY_SCOPE,
  VAULT_CATEGORY_PRESETS,
  getCategoryOptions,
} from './ledger-core.ts';

test('rupeesToPaise converts decimal strings and numbers without float drift', () => {
  assert.equal(rupeesToPaise('19.99'), 1999);
  assert.equal(rupeesToPaise(19.99), 1999);
  assert.equal(rupeesToPaise('1,25,000.50'), 12500050);
  assert.equal(rupeesToPaise('0.00'), 0);
  assert.equal(rupeesToPaise('-250.25'), -25025);
  assert.throws(() => rupeesToPaise('abc'));
});

test('formatINR formats Indian lakh/crore grouping cleanly', () => {
  assert.equal(formatINR(12500050), '₹1,25,000.50');
  assert.equal(formatINR(-45000), '-₹450.00');
  assert.equal(formatINR(25000000, { compact: true }), '₹2.50L');
});

test('calendar date arithmetic avoids month overflow and UTC drift', () => {
  assert.equal(addMonthsISO('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsISO('2024-01-31', 1), '2024-02-29');
  assert.equal(daysBetweenISO('2026-11-12', '2026-11-15'), 3);
  assert.equal(daysBetweenISO('2026-11-15', '2026-11-12'), -3);
});

test('computeCardCycle separates billed due from unbilled spend and avoids double counting on bill pay', () => {
  const baseParams = {
    statementDay: 15,
    dueDay: 5,
    creditLimitMinor: 10_000_000, // ₹1,00,000
    referenceDate: '2026-11-02',
  };

  // Last statement closed 2026-10-15, due 2026-11-05
  // ₹10,000 spent before close + ₹3,000 spent after close
  const unpaid = computeCardCycle({
    ...baseParams,
    transactions: [
      { kind: 'expense', amountMinor: 1_000_000, occurredAt: '2026-10-10', direction: 'out' },
      { kind: 'expense', amountMinor: 300_000, occurredAt: '2026-10-20', direction: 'out' },
    ],
  });
  assert.equal(unpaid.lastStatementDate, '2026-10-15');
  assert.equal(unpaid.nextDueDate, '2026-11-05');
  assert.equal(unpaid.daysUntilDue, 3);
  assert.equal(unpaid.statementDueMinor, 1_000_000);
  assert.equal(unpaid.unbilledMinor, 300_000);
  assert.equal(unpaid.totalOutstandingMinor, 1_300_000);
  assert.equal(unpaid.utilizationPct, 13);

  // Paying the ₹10,000 statement bill clears statementDueMinor while leaving ₹3,000 unbilled intact
  const paid = computeCardCycle({
    ...baseParams,
    transactions: [
      { kind: 'expense', amountMinor: 1_000_000, occurredAt: '2026-10-10', direction: 'out' },
      { kind: 'expense', amountMinor: 300_000, occurredAt: '2026-10-20', direction: 'out' },
      { kind: 'transfer', amountMinor: 1_000_000, occurredAt: '2026-11-02', direction: 'in' },
    ],
  });
  assert.equal(paid.statementDueMinor, 0);
  assert.equal(paid.unbilledMinor, 300_000);
  assert.equal(paid.totalOutstandingMinor, 300_000);
  assert.equal(paid.isBillOverdue, false);
});

test('loan EMI estimation and payment split compute principal vs interest accurately', () => {
  const emi = estimateMonthlyEmiMinor(10_000_000, 1200, 12); // ₹1,00,000 at 12% for 12m
  assert.ok(emi > 880_000 && emi < 890_000);
  const split = splitLoanPayment({
    remainingPrincipalMinor: 10_000_000,
    annualRateBps: 1200,
    paymentMinor: emi,
  });
  assert.equal(split.interestMinor, 100_000); // ₹1,000 first month interest
  assert.equal(split.principalMinor, emi - 100_000);
  assert.equal(split.newRemainingMinor, 10_000_000 - split.principalMinor);
});

test('getCategoryOptions scopes presets cleanly and deduplicates custom extras', () => {
  const personalExpense = getCategoryOptions('personal', 'expense');
  const businessExpense = getCategoryOptions('business', 'expense');
  const businessIncome = getCategoryOptions('business', 'income');
  assert.ok(personalExpense.includes('Food & Dining'));
  assert.ok(!personalExpense.includes('Software & SaaS'));
  assert.ok(businessExpense.includes('Software & SaaS'));
  assert.ok(businessIncome.includes('Client Invoice / Retainer'));

  const withCustom = getCategoryOptions('personal', 'expense', ['Coffee Lab', 'food & dining', '  ']);
  assert.ok(withCustom.includes('Coffee Lab'));
  assert.equal(
    withCustom.filter((c) => c.toLowerCase() === 'food & dining').length,
    1,
  );

  const allScopes = getCategoryOptions('all', 'all');
  assert.ok(allScopes.includes('Food & Dining'));
  assert.ok(allScopes.includes('Software & SaaS'));
  assert.ok(allScopes.includes('Business Revenue'));
  assert.ok(CATEGORY_PRESETS_BY_SCOPE.family.expense.includes('School & Tuition'));
  assert.ok(VAULT_CATEGORY_PRESETS.includes('Banking'));
});
