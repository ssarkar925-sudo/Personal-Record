import React from 'react';
import { Calculator } from 'lucide-react';
import { Badge, SortSelect } from '../../components/ui/Primitives.tsx';
import { MeterBar } from '../../components/charts/AnimatedCharts.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import type { CatSortOption } from './types.ts';
import { computeBudgetVarianceRows } from './reportsAnalytics.ts';

interface CategoryBudgetsWorkstationProps {
  data: DetailedReports;
  catSort: CatSortOption;
  onCatSortChange: (val: CatSortOption) => void;
  onOpenBudgetModal: (scope: Scope, category: string) => void;
  today: string;
}

export const CategoryBudgetsWorkstation: React.FC<CategoryBudgetsWorkstationProps> = ({
  data,
  catSort,
  onCatSortChange,
  onOpenBudgetModal,
  today,
}) => {
  const sortCats = <T extends { category: string; totalMinor: number; count: number }>(rows: T[]) =>
    rows.slice().sort((a, b) => {
      if (catSort === 'count_desc') return b.count - a.count || b.totalMinor - a.totalMinor;
      if (catSort === 'name_asc') return a.category.localeCompare(b.category);
      return b.totalMinor - a.totalMinor;
    });

  const expenseCategories = sortCats(data.categories.filter((c) => c.kind === 'expense'));
  const incomeCategories = sortCats(data.categories.filter((c) => c.kind === 'income'));
  const topExpenseCatMinor = Math.max(100, ...expenseCategories.map((c) => c.totalMinor));
  const varianceRows = computeBudgetVarianceRows(
    data.categories,
    data.categoryBudgets ?? [],
    today,
  );

  return (
    <div className="space-y-5">
      {/* Top Sort Controls */}
      <div className="flex justify-end">
        <SortSelect
          label="Sort Categories"
          value={catSort}
          onChange={(v) => onCatSortChange(v as CatSortOption)}
          options={[
            { value: 'total_desc', label: 'Amount: High → Low' },
            { value: 'count_desc', label: 'Transactions: Most' },
            { value: 'name_asc', label: 'Category: A → Z' },
          ]}
        />
      </div>

      {/* Budget vs Actual Variance Table */}
      {varianceRows.length > 0 && (
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
                ENVELOPE BURN-RATE TELEMETRY
              </span>
              <h3 className="font-display text-sm font-bold text-[#111318] flex items-center gap-1.5 mt-0.5">
                <Calculator className="h-4 w-4 text-[#C59B27]" />
                Budget vs Actual Variance &amp; Month-End Run-Rate Forecast
              </h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 pr-3 font-bold">Category</th>
                  <th className="py-2.5 pr-3 font-bold">Scope</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Monthly Cap</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Actual Spend</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Variance</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Projected EOM</th>
                  <th className="py-2.5 font-bold text-right">Status</th>
                  <th className="py-2.5 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E1D6]/60 font-mono">
                {varianceRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3 pr-3 font-sans font-semibold text-[#111318]">
                      {row.category}
                    </td>
                    <td className="py-3 pr-3 font-sans">
                      <Badge className={SCOPE_META[row.scope].badgeClass}>
                        {SCOPE_META[row.scope].label}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 text-right text-[#111318]">
                      {formatINR(row.monthlyLimitMinor)}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold text-[#111318]">
                      {formatINR(row.spentMinor)}
                    </td>
                    <td
                      className={`py-3 pr-3 text-right font-bold ${
                        row.varianceMinor < 0 ? 'text-[#E11D48]' : 'text-[#059669]'
                      }`}
                    >
                      {row.varianceMinor < 0
                        ? `+${formatINR(Math.abs(row.varianceMinor))} Over`
                        : `${formatINR(row.varianceMinor)} Left`}
                    </td>
                    <td className="py-3 pr-3 text-right text-[#52504C]">
                      ~{formatINR(row.projectedEomMinor)}
                    </td>
                    <td className="py-3 text-right font-sans">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          row.status === 'over_cap'
                            ? 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                            : row.status === 'caution'
                              ? 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/25'
                              : 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                        }`}
                      >
                        {row.status === 'over_cap'
                          ? 'Over Cap'
                          : row.status === 'caution'
                            ? 'Caution'
                            : 'On Track'}{' '}
                        ({row.utilizationPct}%)
                      </span>
                    </td>
                    <td className="py-3 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => onOpenBudgetModal(row.scope, row.category)}
                        className="text-[11px] font-semibold text-[#111318] hover:text-[#C59B27] underline cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid: Expense Categories & Income Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Expense Categories */}
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
                OUTFLOW ENVELOPES
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Top Expense Categories
              </h2>
            </div>
            <span className="text-xs font-mono text-[#52504C] font-semibold">
              {expenseCategories.length} categories
            </span>
          </div>
          <div className="space-y-3">
            {expenseCategories.length === 0 ? (
              <p className="text-xs text-[#52504C] py-6 text-center">No expense entries in range.</p>
            ) : (
              expenseCategories.map((c) => {
                const catBudget = (data.categoryBudgets ?? []).find(
                  (b) =>
                    b.scope === c.scope &&
                    b.category.toLowerCase() === c.category.toLowerCase(),
                );
                const budgetLimitMinor = catBudget?.monthlyLimitMinor;
                const budgetPct = budgetLimitMinor
                  ? Math.round((c.totalMinor / budgetLimitMinor) * 100)
                  : null;
                return (
                  <div
                    key={`${c.scope}-${c.category}`}
                    className="space-y-1.5 rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] p-3 hover:border-[#C59B27] transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-2 font-semibold text-[#111318]">
                        {c.category}
                        <Badge className={SCOPE_META[c.scope].badgeClass}>
                          {SCOPE_META[c.scope].label}
                        </Badge>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-bold text-[#111318]">
                          {formatINR(c.totalMinor)}{' '}
                          <span className="text-[#52504C] font-normal">({c.count})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenBudgetModal(c.scope, c.category)}
                          className={`text-[11px] font-semibold hover:underline cursor-pointer ${
                            catBudget ? 'text-[#C59B27]' : 'text-[#52504C] hover:text-[#111318]'
                          }`}
                        >
                          {catBudget ? 'Edit Cap' : '+ Cap'}
                        </button>
                      </div>
                    </div>
                    <MeterBar
                      pct={Math.round((c.totalMinor / topExpenseCatMinor) * 100)}
                      colorHex={SCOPE_META[c.scope].hex}
                      heightClass="h-1.5"
                    />
                    {catBudget && (
                      <div className="flex justify-between text-[11px] text-[#52504C] pt-0.5 font-mono tabular-nums">
                        <span>Cap: {formatINR(catBudget.monthlyLimitMinor)}</span>
                        <span
                          className={
                            (budgetPct ?? 0) >= 100
                              ? 'text-[#E11D48] font-bold'
                              : (budgetPct ?? 0) >= 80
                                ? 'text-[#D97706] font-bold'
                                : 'text-[#059669] font-semibold'
                          }
                        >
                          {budgetPct}% utilized
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Income Sources */}
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#059669] font-bold block">
                INFLOW STREAMS
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Income Inflow Sources
              </h2>
            </div>
            <span className="text-xs font-mono text-[#52504C] font-semibold">
              {incomeCategories.length} sources
            </span>
          </div>
          <div className="space-y-2.5">
            {incomeCategories.length === 0 ? (
              <p className="text-xs text-[#52504C] py-6 text-center">No income entries in range.</p>
            ) : (
              incomeCategories.map((c) => (
                <div
                  key={`${c.scope}-${c.category}`}
                  className="flex items-center justify-between rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] p-3 text-xs hover:border-[#059669] transition-colors"
                >
                  <span className="inline-flex items-center gap-2 font-semibold text-[#111318]">
                    {c.category}
                    <Badge className={SCOPE_META[c.scope].badgeClass}>
                      {SCOPE_META[c.scope].label}
                    </Badge>
                  </span>
                  <span className="font-mono font-bold text-[#059669] tabular-nums">
                    +{formatINR(c.totalMinor)}{' '}
                    <span className="text-[#52504C] font-normal">({c.count})</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
