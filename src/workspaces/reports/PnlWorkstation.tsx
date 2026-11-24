import React from 'react';
import { Badge } from '../../components/ui/Primitives.tsx';
import { CashflowTrendChart, ScopeDonutChart } from '../../components/charts/AnimatedCharts.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import { computeScopePnlSummary } from './reportsAnalytics.ts';

interface PnlWorkstationProps {
  data: DetailedReports;
}

export const PnlWorkstation: React.FC<PnlWorkstationProps> = ({ data }) => {
  const summary = computeScopePnlSummary(data.scopePnl);

  return (
    <div className="space-y-5">
      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Monthly Income vs Expense Trend */}
        <div className="rounded-3xl p-5 lg:col-span-7 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
                HISTORICAL CASHFLOW STATEMENT
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Monthly Cash Flow Trend
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-[#111318]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" /> Income
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-[#111318]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E11D48]" /> Expense
              </span>
            </div>
          </div>
          {data.monthlyCashflow.length === 0 ? (
            <p className="py-12 text-center text-xs text-[#52504C]">
              No cashflow activity in selected range.
            </p>
          ) : (
            <CashflowTrendChart data={data.monthlyCashflow} stackedByScope={false} />
          )}
        </div>

        {/* Expense Distribution by Scope */}
        <div className="rounded-3xl p-5 lg:col-span-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="mb-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
              ENTITY ALLOCATION
            </span>
            <h2 className="font-display text-sm font-bold text-[#111318]">
              Expense Distribution by Scope
            </h2>
          </div>
          <ScopeDonutChart
            centerLabel="Total Spend"
            centerValue={formatINR(summary.totalExpenseMinor, { compact: true })}
            slices={[
              {
                scope: 'business',
                label: 'Business',
                amountMinor: data?.scopePnl?.business?.expenseMinor ?? 0,
                colorHex: '#C59B27',
              },
              {
                scope: 'personal',
                label: 'Personal',
                amountMinor: data?.scopePnl?.personal?.expenseMinor ?? 0,
                colorHex: '#111318',
              },
              {
                scope: 'family',
                label: 'Family',
                amountMinor: data?.scopePnl?.family?.expenseMinor ?? 0,
                colorHex: '#059669',
              },
            ]}
          />
        </div>
      </div>

      {/* Scope Profit & Loss Statement Table */}
      <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
              CONSOLIDATED AUDIT SCHEDULE
            </span>
            <h2 className="font-display text-sm font-bold text-[#111318]">
              Scope Profit &amp; Loss Statement (Business → Personal → Family)
            </h2>
          </div>
          <div className="text-xs font-mono font-bold text-[#111318] bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-[#E6E1D6]">
            Total Net Savings:{' '}
            <span className={summary.totalNetMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'}>
              {formatINR(summary.totalNetMinor, { signed: true })}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                <th className="py-2.5 pr-3 font-bold">Scope</th>
                <th className="py-2.5 pr-3 font-bold text-right">Income / Revenue</th>
                <th className="py-2.5 pr-3 font-bold text-right">Expenses</th>
                <th className="py-2.5 pr-3 font-bold text-right">Expense Ratio</th>
                <th className="py-2.5 font-bold text-right">Net Savings / Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E1D6]/60 font-mono tabular-nums">
              {(['business', 'personal', 'family'] as Scope[]).map((sc) => {
                const row = data.scopePnl[sc];
                const expRatio =
                  row.incomeMinor > 0 ? Math.round((row.expenseMinor / row.incomeMinor) * 100) : 0;
                return (
                  <tr key={sc} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3 pr-3 font-sans">
                      <Badge className={SCOPE_META[sc].badgeClass}>{SCOPE_META[sc].label}</Badge>
                    </td>
                    <td className="py-3 pr-3 text-right text-[#059669] font-semibold">
                      +{formatINR(row.incomeMinor)}
                    </td>
                    <td className="py-3 pr-3 text-right text-[#E11D48] font-semibold">
                      -{formatINR(row.expenseMinor)}
                    </td>
                    <td className="py-3 pr-3 text-right text-[#52504C]">
                      {row.incomeMinor > 0 ? `${expRatio}%` : '—'}
                    </td>
                    <td
                      className={`py-3 text-right font-bold ${
                        row.netMinor >= 0 ? 'text-[#111318]' : 'text-[#E11D48]'
                      }`}
                    >
                      {formatINR(row.netMinor, { signed: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#111318] font-bold text-[#111318] font-mono tabular-nums bg-[#FAF8F5]/70">
                <td className="py-3.5 pl-2 pr-3 font-sans">Consolidated Portfolio</td>
                <td className="py-3.5 pr-3 text-right text-[#059669]">
                  +{formatINR(summary.totalIncomeMinor)}
                </td>
                <td className="py-3.5 pr-3 text-right text-[#E11D48]">
                  -{formatINR(summary.totalExpenseMinor)}
                </td>
                <td className="py-3.5 pr-3 text-right text-[#52504C]">
                  {summary.totalIncomeMinor > 0 ? `${summary.overallExpenseRatioPct}%` : '—'}
                </td>
                <td
                  className={`py-3.5 pr-2 text-right ${
                    summary.totalNetMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
                  }`}
                >
                  {formatINR(summary.totalNetMinor, { signed: true })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
