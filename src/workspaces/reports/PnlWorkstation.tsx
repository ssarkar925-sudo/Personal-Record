import React from 'react';
import { Badge, Card } from '../../components/ui/Primitives.tsx';
import { CashflowTrendChart, ScopeDonutChart } from '../../components/charts/AnimatedCharts.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';

interface PnlWorkstationProps {
  data: DetailedReports;
}

export const PnlWorkstation: React.FC<PnlWorkstationProps> = ({ data }) => {
  const totalExpenseMinor =
    data.scopePnl.personal.expenseMinor +
    data.scopePnl.business.expenseMinor +
    data.scopePnl.family.expenseMinor;

  const totalIncomeMinor =
    data.scopePnl.personal.incomeMinor +
    data.scopePnl.business.incomeMinor +
    data.scopePnl.family.incomeMinor;

  const totalNetMinor = totalIncomeMinor - totalExpenseMinor;

  return (
    <div className="space-y-4">
      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Monthly Income vs Expense Trend */}
        <Card className="p-4 lg:col-span-7 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Monthly Cash Flow Trend</h2>
              <p className="text-xs text-slate-500">Historical inflow vs. expense comparison over selected period</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Income
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Expense
              </span>
            </div>
          </div>
          {data.monthlyCashflow.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500">No cashflow activity in selected range.</p>
          ) : (
            <CashflowTrendChart data={data.monthlyCashflow} stackedByScope={false} />
          )}
        </Card>

        {/* Expense Distribution by Scope */}
        <Card className="p-4 lg:col-span-5 border-slate-200/90 bg-white shadow-2xs">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Expense Distribution by Scope</h2>
            <p className="text-xs text-slate-500">Split between personal, business, and family scopes</p>
          </div>
          <ScopeDonutChart
            centerLabel="Total Spend"
            centerValue={formatINR(totalExpenseMinor, { compact: true })}
            slices={[
              {
                scope: 'personal',
                label: 'Personal',
                amountMinor: data.scopePnl.personal.expenseMinor,
                colorHex: '#2563eb',
              },
              {
                scope: 'business',
                label: 'Business',
                amountMinor: data.scopePnl.business.expenseMinor,
                colorHex: '#d97706',
              },
              {
                scope: 'family',
                label: 'Family',
                amountMinor: data.scopePnl.family.expenseMinor,
                colorHex: '#059669',
              },
            ]}
          />
        </Card>
      </div>

      {/* Scope Profit & Loss Statement Table */}
      <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Scope Profit &amp; Loss Statement</h2>
            <p className="text-xs text-slate-500">Separation of business profits vs. personal net savings</p>
          </div>
          <div className="text-xs font-semibold text-slate-700">
            Total Net Savings: <span className={totalNetMinor >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatINR(totalNetMinor, { signed: true })}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Scope</th>
                <th className="py-2.5 pr-3 font-medium text-right">Income / Revenue</th>
                <th className="py-2.5 pr-3 font-medium text-right">Expenses</th>
                <th className="py-2.5 pr-3 font-medium text-right">Expense Ratio</th>
                <th className="py-2.5 font-medium text-right">Net Savings / Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {(['personal', 'business', 'family'] as Scope[]).map((sc) => {
                const row = data.scopePnl[sc];
                const expRatio = row.incomeMinor > 0 ? Math.round((row.expenseMinor / row.incomeMinor) * 100) : 0;
                return (
                  <tr key={sc} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <Badge className={SCOPE_META[sc].badgeClass}>{SCOPE_META[sc].label}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-emerald-700 font-medium">
                      +{formatINR(row.incomeMinor)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-rose-700 font-medium">
                      -{formatINR(row.expenseMinor)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-slate-500 font-normal">
                      {row.incomeMinor > 0 ? `${expRatio}%` : '—'}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        row.netMinor >= 0 ? 'text-slate-900' : 'text-rose-700'
                      }`}
                    >
                      {formatINR(row.netMinor, { signed: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-slate-950 tabular-nums">
                <td className="py-3 pr-3">Consolidated Portfolio</td>
                <td className="py-3 pr-3 text-right text-emerald-700">+{formatINR(totalIncomeMinor)}</td>
                <td className="py-3 pr-3 text-right text-rose-700">-{formatINR(totalExpenseMinor)}</td>
                <td className="py-3 pr-3 text-right text-slate-600">
                  {totalIncomeMinor > 0 ? `${Math.round((totalExpenseMinor / totalIncomeMinor) * 100)}%` : '—'}
                </td>
                <td className={`py-3 text-right ${totalNetMinor >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>
                  {formatINR(totalNetMinor, { signed: true })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};
