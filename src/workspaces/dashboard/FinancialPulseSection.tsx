import {
  ArrowRight,
  PieChart,
  TrendingUp,
} from 'lucide-react';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import { CashflowTrendChart, MeterBar, ScopeDonutChart } from '../../components/charts/AnimatedCharts.tsx';
import type { Scope } from '../../../shared/ledger-core.ts';
import type { WorkspaceId } from './types.ts';

export interface FinancialPulseSectionProps {
  data: DashboardSummary;
  scopeFilter: Scope | 'all';
  onNavigate: (tab: WorkspaceId) => void;
}

export function FinancialPulseSection({
  data,
  scopeFilter,
  onNavigate,
}: FinancialPulseSectionProps) {
  const palette = ['#2563eb', '#d97706', '#059669', '#4f46e5', '#0891b2'];
  const scopeExpenseSlices: Array<{ scope: Scope; label: string; amountMinor: number; colorHex: string }> =
    scopeFilter !== 'all' && data.monthTopCategories?.length > 0
      ? data.monthTopCategories.map((c, idx) => ({
          scope: `${scopeFilter}-${idx}` as Scope,
          label: c.category,
          amountMinor: c.amountMinor,
          colorHex: palette[idx % palette.length],
        }))
      : [
          { scope: 'personal', label: 'Personal', amountMinor: data.monthByScope.personal.expenseMinor, colorHex: '#2563eb' },
          { scope: 'business', label: 'Business', amountMinor: data.monthByScope.business.expenseMinor, colorHex: '#d97706' },
          { scope: 'family', label: 'Family', amountMinor: data.monthByScope.family.expenseMinor, colorHex: '#059669' },
        ];

  const totalMonthlySpend =
    data.monthByScope.personal.expenseMinor +
    data.monthByScope.business.expenseMinor +
    data.monthByScope.family.expenseMinor;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* 1. Cashflow Trend Chart (7 cols) */}
      <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  6-Month Cash Flow & Income Dynamics
                </h3>
                <p className="text-xs text-slate-500">
                  Historical monthly income vs expenses across active scopes.
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Full Analytics</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="pt-4">
            <CashflowTrendChart
              data={data.sixMonthTrend}
              stackedByScope={scopeFilter === 'all'}
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Tracked across 6 reporting periods</span>
          <span className="font-medium text-slate-700">Reference: {data.referenceDate}</span>
        </div>
      </div>

      {/* 2. Monthly Spend Mix & Budget Gauges (5 cols) */}
      <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Monthly Spend Mix & Budgets
                </h3>
                <p className="text-xs text-slate-500">
                  Scope distribution and real-time budget utilization.
                </p>
              </div>
            </div>

            {data.budgets.length > 0 && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {data.budgets.length} Budgets
              </span>
            )}
          </div>

          <div className="pt-2">
            <ScopeDonutChart
              slices={scopeExpenseSlices}
              centerLabel="Total Outflow"
              centerValue={formatINR(totalMonthlySpend, { compact: true })}
            />
          </div>

          {/* Scope Budget Progress Bars */}
          {data.budgets.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
              {data.budgets.map((b) => {
                const pct = Math.round((b.spentMinor / b.monthlyLimitMinor) * 100);
                const isOver = pct >= 100;
                const isWarn = pct >= 80;

                return (
                  <div key={b.scope} className="space-y-1">
                    <div className="flex justify-between text-xs tabular-nums">
                      <span className="font-semibold text-slate-700">
                        {SCOPE_META[b.scope].label} Budget
                      </span>
                      <span className={`font-mono font-bold ${isOver ? 'text-rose-600' : isWarn ? 'text-amber-600' : 'text-slate-700'}`}>
                        {formatINR(b.spentMinor, { compact: true })} / {formatINR(b.monthlyLimitMinor, { compact: true })} ({pct}%)
                      </span>
                    </div>
                    <MeterBar
                      pct={pct}
                      colorHex={isOver ? '#dc2626' : isWarn ? '#d97706' : SCOPE_META[b.scope].hex}
                      heightClass="h-1.5"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Category Budgets */}
          {(data.categoryBudgets?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Category Thresholds ({data.categoryBudgets!.length})
              </div>
              {data.categoryBudgets!.slice(0, 3).map((cb) => {
                const pct = cb.pct ?? Math.round((cb.spentMinor / cb.monthlyLimitMinor) * 100);
                return (
                  <div key={cb.id} className="space-y-1">
                    <div className="flex justify-between text-[11px] tabular-nums">
                      <span className="font-medium text-slate-700 truncate pr-2">
                        {cb.category} <span className="text-slate-400">({cb.scope})</span>
                      </span>
                      <span className={`font-mono ${pct >= 100 ? 'text-rose-600 font-bold' : pct >= 80 ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>
                        {formatINR(cb.spentMinor, { compact: true })} / {formatINR(cb.monthlyLimitMinor, { compact: true })} ({pct}%)
                      </span>
                    </div>
                    <MeterBar
                      pct={pct}
                      colorHex={pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : SCOPE_META[cb.scope].hex}
                      heightClass="h-1"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
