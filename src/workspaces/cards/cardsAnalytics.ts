import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';

export interface CardsPortfolioMetrics {
  totalDebtMinor: number;
  totalLimitMinor: number;
  totalStatementDueMinor: number;
  totalUnbilledMinor: number;
  availableCreditMinor: number;
  overallUtilizationPct: number;
  billedSharePct: number;
  unbilledSharePct: number;
  liquidityCoverageRatio: number;
  urgentDueCardsCount: number;
  estimatedRewardPoints: number;
}

export interface CardVelocityDayPoint {
  date: string;
  shortLabel: string;
  spendMinor: number;
  paymentsMinor: number;
  swipeCount: number;
}

export interface CardCategoryShare {
  category: string;
  amountMinor: number;
  sharePct: number;
  count: number;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayMonthShort(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [, mStr, dStr] = isoDate.split('-');
  const mIdx = Number(mStr) - 1;
  const day = Number(dStr);
  if (mIdx >= 0 && mIdx < 12) {
    return `${day} ${SHORT_MONTHS[mIdx]}`;
  }
  return isoDate;
}

/**
 * Computes institutional portfolio telemetry across all credit card instruments.
 */
export function computeCardsPortfolioMetrics(
  creditCards: AccountRecord[],
  bankLiquidityMinor: number,
  monthCardSpendMinor = 0,
): CardsPortfolioMetrics {
  let totalDebtMinor = 0;
  let totalLimitMinor = 0;
  let totalStatementDueMinor = 0;
  let totalUnbilledMinor = 0;
  let urgentDueCardsCount = 0;

  for (const card of creditCards) {
    const debt = Math.abs(card.currentBalanceMinor || 0);
    const limit = Math.max(0, card.creditLimitMinor || 0);
    const stmtDue = card.cardCycle?.statementDueMinor ?? 0;
    const unbilled =
      card.cardCycle?.unbilledMinor ?? (debt > stmtDue ? debt - stmtDue : debt);

    totalDebtMinor += debt;
    totalLimitMinor += limit;
    totalStatementDueMinor += stmtDue;
    totalUnbilledMinor += unbilled;

    if (
      card.cardCycle &&
      (card.cardCycle.isBillOverdue ||
        (card.cardCycle.daysUntilDue <= 5 && debt > 0))
    ) {
      urgentDueCardsCount += 1;
    }
  }

  const availableCreditMinor = Math.max(0, totalLimitMinor - totalDebtMinor);
  const overallUtilizationPct =
    totalLimitMinor > 0
      ? Number(((totalDebtMinor / totalLimitMinor) * 100).toFixed(1))
      : 0;

  const splitDenom = Math.max(1, totalStatementDueMinor + totalUnbilledMinor);
  const billedSharePct =
    totalDebtMinor > 0 ? Math.round((totalStatementDueMinor / splitDenom) * 100) : 0;
  const unbilledSharePct = totalDebtMinor > 0 ? Math.max(0, 100 - billedSharePct) : 0;

  const liquidityCoverageRatio =
    totalDebtMinor > 0
      ? Number((bankLiquidityMinor / totalDebtMinor).toFixed(1))
      : 100;

  // Estimate reward points at ~3.2 pts per ₹100 of active card spend/balance
  const rewardBaseMinor = Math.max(totalDebtMinor, monthCardSpendMinor);
  const estimatedRewardPoints = Math.round((rewardBaseMinor / 10000) * 3.2);

  return {
    totalDebtMinor,
    totalLimitMinor,
    totalStatementDueMinor,
    totalUnbilledMinor,
    availableCreditMinor,
    overallUtilizationPct,
    billedSharePct,
    unbilledSharePct,
    liquidityCoverageRatio,
    urgentDueCardsCount,
    estimatedRewardPoints,
  };
}

/**
 * Builds a continuous N-day daily card spend and payment series ending on `referenceDateStr`.
 */
export function buildCardDailyVelocitySeries(
  cardTransactions: TransactionRecord[],
  referenceDateStr: string,
  days = 14,
): {
  series: CardVelocityDayPoint[];
  totalWindowSpendMinor: number;
  totalWindowSwipes: number;
  peakDay: CardVelocityDayPoint | null;
} {
  const safeDays = Math.max(2, Math.min(60, days));
  const refParts = referenceDateStr.split('-').map(Number);
  const baseUtc =
    refParts.length === 3
      ? Date.UTC(refParts[0], refParts[1] - 1, refParts[2])
      : Date.now();

  const map = new Map<string, { spendMinor: number; paymentsMinor: number; swipeCount: number }>();

  for (let i = safeDays - 1; i >= 0; i--) {
    const dt = new Date(baseUtc - i * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    map.set(iso, { spendMinor: 0, paymentsMinor: 0, swipeCount: 0 });
  }

  for (const tx of cardTransactions) {
    const bucket = map.get(tx.occurredAt);
    if (!bucket) continue;
    if (tx.kind === 'expense') {
      bucket.spendMinor += tx.amountMinor;
      bucket.swipeCount += 1;
    } else if (tx.kind === 'transfer' || tx.kind === 'income') {
      bucket.paymentsMinor += tx.amountMinor;
    }
  }

  const series: CardVelocityDayPoint[] = [];
  let totalWindowSpendMinor = 0;
  let totalWindowSwipes = 0;
  let peakDay: CardVelocityDayPoint | null = null;

  for (const [date, vals] of map.entries()) {
    const pt: CardVelocityDayPoint = {
      date,
      shortLabel: formatDayMonthShort(date),
      spendMinor: vals.spendMinor,
      paymentsMinor: vals.paymentsMinor,
      swipeCount: vals.swipeCount,
    };
    series.push(pt);
    totalWindowSpendMinor += vals.spendMinor;
    totalWindowSwipes += vals.swipeCount;
    if (!peakDay || pt.spendMinor > peakDay.spendMinor) {
      peakDay = pt;
    }
  }

  return {
    series,
    totalWindowSpendMinor,
    totalWindowSwipes,
    peakDay,
  };
}

/**
 * Computes top credit card expense categories sorted by volume.
 */
export function computeCardCategoryMix(
  cardTransactions: TransactionRecord[],
  limit = 5,
): CardCategoryShare[] {
  const totals = new Map<string, { amountMinor: number; count: number }>();
  let grandTotalMinor = 0;

  for (const tx of cardTransactions) {
    if (tx.kind !== 'expense') continue;
    const cat = tx.category || 'Shopping';
    const prev = totals.get(cat) ?? { amountMinor: 0, count: 0 };
    prev.amountMinor += tx.amountMinor;
    prev.count += 1;
    totals.set(cat, prev);
    grandTotalMinor += tx.amountMinor;
  }

  const denom = Math.max(1, grandTotalMinor);
  return Array.from(totals.entries())
    .map(([category, v]) => ({
      category,
      amountMinor: v.amountMinor,
      count: v.count,
      sharePct: Math.round((v.amountMinor / denom) * 100),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, limit);
}
