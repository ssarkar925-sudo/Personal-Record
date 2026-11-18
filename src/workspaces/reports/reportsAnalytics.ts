import { rupeesToPaise, type Scope } from '../../../shared/ledger-core.ts';
import type { CategoryBudgetRecord, DetailedReports } from '../../lib/api.ts';
import type { ReportsIntelligence } from './types.ts';

export type ReportFoilFinish = 'auto' | 'obsidian' | 'gold' | 'emerald' | 'platinum';

export interface ScopePnlSlice {
  scope: Scope;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  expenseSharePct: number;
  expenseRatioPct: number;
  color: string;
}

export interface ScopePnlSummary {
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  totalNetMinor: number;
  overallExpenseRatioPct: number;
  slices: ScopePnlSlice[];
}

export interface BudgetVarianceRow {
  id: string;
  scope: Scope;
  category: string;
  monthlyLimitMinor: number;
  spentMinor: number;
  varianceMinor: number;
  utilizationPct: number;
  projectedEomMinor: number;
  status: 'on_track' | 'caution' | 'over_cap';
}

export function safeRupeesToPaise(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  try {
    return Math.max(0, rupeesToPaise(trimmed));
  } catch {
    return 0;
  }
}

export function computeReportsIntelligence(data: DetailedReports | null): ReportsIntelligence | null {
  if (!data) return null;

  const bankBalances = data.accountActivity
    .filter((a) => a.type === 'bank')
    .reduce((sum, a) => sum + Math.max(0, a.currentBalanceMinor), 0);

  const monthsCount = Math.max(1, data.monthlyCashflow.length);
  const totalOutflowMinor = data.monthlyCashflow.reduce((s, m) => s + m.expenseMinor, 0);
  const totalInflowMinor = data.monthlyCashflow.reduce((s, m) => s + m.incomeMinor, 0);
  const averageMonthlyBurnMinor = Math.round(totalOutflowMinor / monthsCount);

  const runwayMonths =
    averageMonthlyBurnMinor > 0 ? Number((bankBalances / averageMonthlyBurnMinor).toFixed(1)) : 99;
  const savingsRatePct =
    totalInflowMinor > 0
      ? Math.round(((totalInflowMinor - totalOutflowMinor) / totalInflowMinor) * 100)
      : 0;

  const anomalies: Array<{ category: string; amountMinor: number; spikePct: number }> = [];
  const expenseCats = data.categories.filter((c) => c.kind === 'expense');
  const avgCatSpend =
    expenseCats.length > 0
      ? expenseCats.reduce((s, c) => s + c.totalMinor, 0) / expenseCats.length
      : 1;

  for (const c of expenseCats) {
    if (c.totalMinor > avgCatSpend * 1.5 && c.totalMinor > 500_000) {
      const spikePct = Math.round(((c.totalMinor - avgCatSpend) / avgCatSpend) * 100);
      anomalies.push({ category: c.category, amountMinor: c.totalMinor, spikePct });
    }
  }

  return {
    bankBalances,
    averageMonthlyBurnMinor,
    runwayMonths,
    savingsRatePct,
    anomalies: anomalies.slice(0, 3),
  };
}

export function computeScopePnlSummary(
  scopePnl: DetailedReports['scopePnl'],
): ScopePnlSummary {
  const totalIncomeMinor =
    scopePnl.business.incomeMinor +
    scopePnl.personal.incomeMinor +
    scopePnl.family.incomeMinor;
  const totalExpenseMinor =
    scopePnl.business.expenseMinor +
    scopePnl.personal.expenseMinor +
    scopePnl.family.expenseMinor;
  const totalNetMinor = totalIncomeMinor - totalExpenseMinor;
  const overallExpenseRatioPct =
    totalIncomeMinor > 0 ? Math.round((totalExpenseMinor / totalIncomeMinor) * 100) : 0;

  const expDenom = Math.max(1, totalExpenseMinor);

  const defs: Array<{ scope: Scope; label: string; color: string }> = [
    { scope: 'business', label: 'Business', color: '#C59B27' },
    { scope: 'personal', label: 'Personal', color: '#111318' },
    { scope: 'family', label: 'Family', color: '#059669' },
  ];

  const slices: ScopePnlSlice[] = defs.map((d) => {
    const row = scopePnl[d.scope];
    return {
      scope: d.scope,
      label: d.label,
      incomeMinor: row.incomeMinor,
      expenseMinor: row.expenseMinor,
      netMinor: row.netMinor,
      expenseSharePct: Math.round((row.expenseMinor / expDenom) * 100),
      expenseRatioPct: row.incomeMinor > 0 ? Math.round((row.expenseMinor / row.incomeMinor) * 100) : 0,
      color: d.color,
    };
  });

  return {
    totalIncomeMinor,
    totalExpenseMinor,
    totalNetMinor,
    overallExpenseRatioPct,
    slices,
  };
}

export function computeBudgetVarianceRows(
  categories: DetailedReports['categories'],
  budgets: CategoryBudgetRecord[],
  todayISO: string,
): BudgetVarianceRow[] {
  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const dayOfMonth = Math.max(1, Number(todayISO.slice(8, 10)) || 15);
  const yearNum = Number(todayISO.slice(0, 4)) || 2026;
  const monthNum = Number(todayISO.slice(5, 7)) || 4;
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate() || 30;

  return budgets.map((b) => {
    const spentMinor =
      expenseCategories.find(
        (c) => c.scope === b.scope && c.category.toLowerCase() === b.category.toLowerCase(),
      )?.totalMinor ?? 0;
    const varianceMinor = b.monthlyLimitMinor - spentMinor;
    const utilizationPct =
      b.monthlyLimitMinor > 0 ? Math.round((spentMinor / b.monthlyLimitMinor) * 100) : 0;
    const projectedEomMinor = Math.round((spentMinor / dayOfMonth) * daysInMonth);
    const status: BudgetVarianceRow['status'] =
      utilizationPct >= 100 ? 'over_cap' : utilizationPct >= 80 ? 'caution' : 'on_track';

    return {
      id: b.id,
      scope: b.scope,
      category: b.category,
      monthlyLimitMinor: b.monthlyLimitMinor,
      spentMinor,
      varianceMinor,
      utilizationPct,
      projectedEomMinor,
      status,
    };
  });
}
