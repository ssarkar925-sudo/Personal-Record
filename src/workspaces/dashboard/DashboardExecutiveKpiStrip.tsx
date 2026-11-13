import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import { SparklineChart } from '../../components/charts/AnimatedCharts.tsx';
import type { WorkspaceId } from './types.ts';

export interface DashboardExecutiveKpiStripProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
}

export function DashboardExecutiveKpiStrip({
  data,
  onNavigate,
}: DashboardExecutiveKpiStripProps) {
  const netMonthlyMinor = data.monthIncomeMinor - data.monthExpenseMinor;
  const isSurplus = netMonthlyMinor >= 0;

  // Calculate aggregate card utilization
  const totalLimitMinor = data.cards.reduce((sum, c) => sum + (c.creditLimitMinor || 0), 0);
  const totalDebtMinor = data.totalCardDebtMinor;
  const utilPct = totalLimitMinor > 0 ? Math.min(100, Math.round((totalDebtMinor / totalLimitMinor) * 100)) : 0;

  // Sparkline trajectory
  const sparklineValues = (() => {
    const nets = data.sixMonthTrend.map((m) => m.incomeMinor - m.expenseMinor);
    const points: number[] = new Array(nets.length).fill(data.netWorthMinor);
    for (let i = nets.length - 2; i >= 0; i--) {
      points[i] = points[i + 1] - nets[i + 1];
    }
    return points;
  })();

  const netKhatabookMinor = data.totalNeedMinor - data.totalGiveMinor;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Net Worth Card */}
      <div
        onClick={() => onNavigate('reports')}
        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all cursor-pointer"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Net Worth
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
            {formatINR(data.netWorthMinor)}
          </div>
          <div className="mt-2">
            <SparklineChart colorHex="#2563eb" height={28} values={sparklineValues} />
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Liquid: <strong className="text-slate-700 font-mono">{formatINR(data.totalBankMinor, { compact: true })}</strong></span>
          {(data.totalInvestmentsMinor ?? 0) > 0 && (
            <span>Inv: <strong className="text-slate-700 font-mono">{formatINR(data.totalInvestmentsMinor, { compact: true })}</strong></span>
          )}
          <span>Debt: <strong className="text-rose-600 font-mono">{formatINR(data.totalCardDebtMinor + data.totalBorrowedRemainingMinor, { compact: true })}</strong></span>
        </div>
      </div>

      {/* 2. Monthly Cashflow & Savings Rate */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Monthly Cash Flow
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isSurplus
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {isSurplus ? 'Surplus' : 'Deficit'}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 p-2">
              <div className="text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> Income
              </div>
              <div className="text-base font-bold font-mono text-emerald-700 mt-0.5">
                {formatINR(data.monthIncomeMinor, { decimals: false })}
              </div>
            </div>
            <div className="rounded-xl bg-rose-50/70 border border-rose-200/70 p-2 text-right">
              <div className="text-[10px] font-semibold text-rose-800 flex items-center justify-end gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-600" /> Spent
              </div>
              <div className="text-base font-bold font-mono text-rose-700 mt-0.5">
                {formatINR(data.monthExpenseMinor, { decimals: false })}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">Monthly Net Savings:</span>
          <span className={`font-mono font-bold ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatINR(netMonthlyMinor, { signed: true, decimals: false })}
          </span>
        </div>
      </div>

      {/* 3. Credit Cards Outstanding & Utilization */}
      <div
        onClick={() => onNavigate('money')}
        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all cursor-pointer"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Credit Cards Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {formatINR(data.totalCardDebtMinor)}
            </div>
            <span className="font-mono text-xs font-bold text-indigo-700">
              {utilPct}% Utilized
            </span>
          </div>

          {/* Utilization progress bar */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                utilPct > 50 ? 'bg-rose-500' : utilPct > 30 ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.max(2, utilPct)}%` }}
            />
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>{data.cards.length} cards active</span>
          <span>Limit: <strong className="text-slate-700 font-mono">{formatINR(totalLimitMinor, { compact: true })}</strong></span>
        </div>
      </div>

      {/* 4. Khatabook Dues & People Receivables */}
      <div
        onClick={() => onNavigate('loans_dues')}
        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all cursor-pointer"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Khatabook & Loans
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> Owed to You:
              </span>
              <span className="font-mono font-bold text-emerald-700">
                {data.totalNeedMinor > 0 ? `+${formatINR(data.totalNeedMinor)}` : formatINR(0)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-rose-700 font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-600" /> You Owe:
              </span>
              <span className="font-mono font-bold text-rose-700">
                {data.totalGiveMinor > 0 ? `-${formatINR(data.totalGiveMinor)}` : formatINR(0)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Net Khatabook Position:</span>
          <span
            className={`font-mono font-bold ${
              netKhatabookMinor >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {netKhatabookMinor >= 0 ? '+' : ''}{formatINR(netKhatabookMinor)}
          </span>
        </div>
      </div>
    </div>
  );
}
