import React from 'react';
import { Calculator } from 'lucide-react';
import { Badge, Card, SortSelect } from '../../components/ui/Primitives.tsx';
import { MeterBar } from '../../components/charts/AnimatedCharts.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import type { CatSortOption } from './types.ts';

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

  return (
    <div className="space-y-4">
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
      {(data.categoryBudgets ?? []).length > 0 && (
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-indigo-600" />
                Budget vs Actual Variance &amp; Month-End Run-Rate Forecast
              </h3>
              <p className="text-xs text-slate-500">
                Live burn-rate projections based on elapsed days in current month
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Category</th>
                  <th className="py-2.5 pr-3 font-medium">Scope</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Monthly Cap</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Actual Spend</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Variance</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Projected EOM</th>
                  <th className="py-2.5 font-medium text-right">Status</th>
                  <th className="py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.categoryBudgets ?? []).map((b) => {
                  const spentMinor =
                    expenseCategories.find(
                      (c) => c.scope === b.scope && c.category.toLowerCase() === b.category.toLowerCase(),
                    )?.totalMinor ?? 0;
                  const varianceMinor = b.monthlyLimitMinor - spentMinor;
                  const pct = Math.round((spentMinor / b.monthlyLimitMinor) * 100);
                  const dayOfMonth = Math.max(1, Number(today.slice(8, 10)));
                  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
                  const projectedMinor = Math.round((spentMinor / dayOfMonth) * daysInMonth);

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">{b.category}</td>
                      <td className="py-2.5 pr-3">
                        <Badge className={SCOPE_META[b.scope].badgeClass}>{SCOPE_META[b.scope].label}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-right">{formatINR(b.monthlyLimitMinor)}</td>
                      <td className="py-2.5 pr-3 text-right font-medium">{formatINR(spentMinor)}</td>
                      <td
                        className={`py-2.5 pr-3 text-right font-semibold ${
                          varianceMinor < 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {varianceMinor < 0
                          ? `+${formatINR(Math.abs(varianceMinor))} Over`
                          : `${formatINR(varianceMinor)} Left`}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-700 font-medium">
                        ~{formatINR(projectedMinor)}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge
                          className={
                            pct >= 100
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : pct >= 80
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }
                        >
                          {pct >= 100 ? 'Over Cap' : pct >= 80 ? 'Caution' : 'On Track'} ({pct}%)
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenBudgetModal(b.scope, b.category)}
                          className="text-[11px] font-medium text-indigo-600 hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Grid: Expense Categories & Income Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Expense Categories */}
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Top Expense Categories</h2>
              <p className="text-xs text-slate-500">Visual envelope limits and volume breakdown</p>
            </div>
            <span className="text-xs text-slate-400 font-medium">{expenseCategories.length} categories</span>
          </div>
          <div className="space-y-3">
            {expenseCategories.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No expense entries in range.</p>
            ) : (
              expenseCategories.map((c) => {
                const catBudget = (data.categoryBudgets ?? []).find(
                  (b) => b.scope === c.scope && b.category.toLowerCase() === c.category.toLowerCase(),
                );
                const budgetLimitMinor = catBudget?.monthlyLimitMinor;
                const budgetPct = budgetLimitMinor ? Math.round((c.totalMinor / budgetLimitMinor) * 100) : null;
                return (
                  <div
                    key={`${c.scope}-${c.category}`}
                    className="space-y-1.5 rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        {c.category}
                        <Badge className={SCOPE_META[c.scope].badgeClass}>{SCOPE_META[c.scope].label}</Badge>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold text-slate-900">
                          {formatINR(c.totalMinor)} <span className="text-slate-400 font-normal">({c.count})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenBudgetModal(c.scope, c.category)}
                          className={`text-[11px] font-medium hover:underline cursor-pointer ${
                            catBudget ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'
                          }`}
                        >
                          {catBudget ? 'Edit Budget' : '+ Budget'}
                        </button>
                      </div>
                    </div>
                    <MeterBar
                      pct={Math.round((c.totalMinor / topExpenseCatMinor) * 100)}
                      colorHex={SCOPE_META[c.scope].hex}
                      heightClass="h-1.5"
                    />
                    {catBudget && (
                      <div className="flex justify-between text-[11px] text-slate-500 pt-0.5 tabular-nums">
                        <span>Cap: {formatINR(catBudget.monthlyLimitMinor)}</span>
                        <span
                          className={
                            (budgetPct ?? 0) >= 100
                              ? 'text-rose-700 font-semibold'
                              : (budgetPct ?? 0) >= 80
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-600'
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
        </Card>

        {/* Income Sources */}
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Income Inflow Sources</h2>
              <p className="text-xs text-slate-500">Revenue lines, salary deposits, and client settlements</p>
            </div>
            <span className="text-xs text-slate-400 font-medium">{incomeCategories.length} sources</span>
          </div>
          <div className="space-y-2.5">
            {incomeCategories.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No income entries in range.</p>
            ) : (
              incomeCategories.map((c) => (
                <div
                  key={`${c.scope}-${c.category}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-xs hover:bg-slate-50/70 transition-colors"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                    {c.category}
                    <Badge className={SCOPE_META[c.scope].badgeClass}>{SCOPE_META[c.scope].label}</Badge>
                  </span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    +{formatINR(c.totalMinor)} <span className="text-slate-400 font-normal">({c.count})</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
