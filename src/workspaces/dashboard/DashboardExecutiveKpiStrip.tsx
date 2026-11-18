import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  Users,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
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

  // Aggregate card utilization
  const totalLimitMinor = data.cards.reduce((sum, c) => sum + (c.creditLimitMinor || 0), 0);
  const totalDebtMinor = data.totalCardDebtMinor;
  const utilPct =
    totalLimitMinor > 0 ? Math.min(100, Math.round((totalDebtMinor / totalLimitMinor) * 100)) : 0;

  // Radial gauge math for credit utilization
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const utilOffset = circumference * (1 - utilPct / 100);

  // Cashflow split bar math
  const totalFlowVolume = Math.max(1, data.monthIncomeMinor + data.monthExpenseMinor);
  const inflowSharePct = Math.round((data.monthIncomeMinor / totalFlowVolume) * 100);

  // Khatabook split bar math
  const netKhatabookMinor = data.totalNeedMinor - data.totalGiveMinor;
  const totalPeopleVolume = Math.max(1, data.totalNeedMinor + data.totalGiveMinor);
  const receivableSharePct =
    data.totalNeedMinor + data.totalGiveMinor > 0
      ? Math.round((data.totalNeedMinor / totalPeopleVolume) * 100)
      : 50;

  // Top bank share
  const topBank = [...data.banks].sort((a, b) => b.currentBalanceMinor - a.currentBalanceMinor)[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Liquid Treasury & Passbooks */}
      <div
        onClick={() => onNavigate('money')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate('money');
          }
        }}
        className="bento-card bento-card-hover rounded-2xl p-5 flex flex-col justify-between cursor-pointer"
      >
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              Liquid Treasury
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#F3EFEA] text-[#059669] border border-[#EAE5DC] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </span>
          </div>

          <div className="text-2xl font-extrabold font-mono-data tabular-nums tracking-tight text-[#111318] mt-2">
            {formatINR(data.totalBankMinor)}
          </div>

          {/* Multi-Account Segmented Allocation Bar */}
          <div className="mt-3 flex h-2 w-full rounded-full bg-[#F3EFEA] overflow-hidden gap-0.5">
            {data.banks.length > 0 ? (
              data.banks.slice(0, 4).map((b, idx) => {
                const share = Math.max(
                  10,
                  Math.round((Math.max(0, b.currentBalanceMinor) / Math.max(1, data.totalBankMinor)) * 100),
                );
                const colors = ['bg-[#059669]', 'bg-[#111318]', 'bg-[#C59B27]', 'bg-[#858078]'];
                return (
                  <div
                    key={b.id}
                    className={`h-full ${colors[idx % colors.length]}`}
                    style={{ width: `${share}%` }}
                  />
                );
              })
            ) : (
              <div className="h-full w-full bg-[#EAE5DC]" />
            )}
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] text-xs text-[#52504C] flex items-center justify-between gap-2">
          <span>{data.banks.length} Active Accounts</span>
          {topBank && (
            <span className="truncate max-w-[140px]">
              Lead: <strong className="text-[#111318] font-semibold">{topBank.name}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 2. Monthly Cashflow Velocity */}
      <div
        onClick={() => onNavigate('reports')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate('reports');
          }
        }}
        className="bento-card bento-card-hover rounded-2xl p-5 flex flex-col justify-between cursor-pointer"
      >
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              Monthly Cashflow
            </span>
            <span
              className={`text-[11px] font-mono-data font-semibold px-2 py-0.5 rounded-md border ${
                isSurplus
                  ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                  : 'bg-rose-50 text-[#E11D48] border-rose-200'
              }`}
            >
              {isSurplus ? 'SURPLUS' : 'DEFICIT'}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#52504C] flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-[#059669]" /> Inflow
              </div>
              <div className="text-lg font-bold font-mono-data tabular-nums text-[#059669] mt-0.5">
                {formatINR(data.monthIncomeMinor, { compact: true })}
              </div>
            </div>
            <div className="text-right border-l border-[#EAE5DC] pl-3">
              <div className="text-[11px] font-medium text-[#52504C] flex items-center justify-end gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#C59B27]" /> Outflow
              </div>
              <div className="text-lg font-bold font-mono-data tabular-nums text-[#111318] mt-0.5">
                {formatINR(data.monthExpenseMinor, { compact: true })}
              </div>
            </div>
          </div>

          {/* Inflow vs Outflow Proportional Split Bar */}
          <div className="mt-3 flex h-2 w-full rounded-full bg-[#F3EFEA] overflow-hidden gap-0.5">
            <div
              className="h-full bg-[#059669] transition-all duration-500"
              style={{ width: `${inflowSharePct}%` }}
            />
            <div
              className="h-full bg-[#C59B27] transition-all duration-500"
              style={{ width: `${100 - inflowSharePct}%` }}
            />
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] flex items-center justify-between text-xs">
          <span className="text-[#52504C]">Net Position</span>
          <span
            className={`font-mono-data tabular-nums font-bold ${
              isSurplus ? 'text-[#059669]' : 'text-[#E11D48]'
            }`}
          >
            {formatINR(netMonthlyMinor, { signed: true, decimals: false })}
          </span>
        </div>
      </div>

      {/* 3. Credit Card Utilization & Cycle Ring */}
      <div
        onClick={() => onNavigate('cards')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate('cards');
          }
        }}
        className="bento-card bento-card-hover rounded-2xl p-5 flex flex-col justify-between cursor-pointer"
      >
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              Card Liabilities
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold font-mono-data tabular-nums tracking-tight text-[#111318]">
                {formatINR(data.totalCardDebtMinor)}
              </div>
              <div className="text-xs text-[#52504C] mt-0.5">
                Available:{' '}
                <strong className="font-mono-data text-[#059669]">
                  {formatINR(Math.max(0, totalLimitMinor - totalDebtMinor), { compact: true })}
                </strong>
              </div>
            </div>

            {/* Custom SVG Radial Utilization Arc */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                <circle
                  cx="22"
                  cy="22"
                  r={radius}
                  fill="none"
                  stroke="#F3EFEA"
                  strokeWidth="4"
                />
                <circle
                  cx="22"
                  cy="22"
                  r={radius}
                  fill="none"
                  stroke={utilPct > 50 ? '#E11D48' : utilPct > 30 ? '#C59B27' : '#059669'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={utilOffset}
                />
              </svg>
              <span className="absolute text-[10px] font-mono-data font-bold text-[#111318]">
                {utilPct}%
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] flex items-center justify-between text-xs text-[#52504C]">
          <span>{data.cards.length} Active Cards</span>
          <span>
            Limit:{' '}
            <strong className="text-[#111318] font-mono-data tabular-nums">
              {formatINR(totalLimitMinor, { compact: true })}
            </strong>
          </span>
        </div>
      </div>

      {/* 4. Khatabook & People Receivables */}
      <div
        onClick={() => onNavigate('loans_dues')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate('loans_dues');
          }
        }}
        className="bento-card bento-card-hover rounded-2xl p-5 flex flex-col justify-between cursor-pointer"
      >
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              Khatabook &amp; Dues
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#F3EFEA] text-[#C59B27] border border-[#EAE5DC] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#52504C]">Owed to You</div>
              <div className="text-lg font-bold font-mono-data tabular-nums text-[#059669] mt-0.5">
                +{formatINR(data.totalNeedMinor, { compact: true })}
              </div>
            </div>
            <div className="text-right border-l border-[#EAE5DC] pl-3">
              <div className="text-[11px] font-medium text-[#52504C]">You Owe</div>
              <div className="text-lg font-bold font-mono-data tabular-nums text-[#E11D48] mt-0.5">
                -{formatINR(data.totalGiveMinor, { compact: true })}
              </div>
            </div>
          </div>

          {/* Bidirectional Receivables vs Payables Split Bar */}
          <div className="mt-3 flex h-2 w-full rounded-full bg-[#F3EFEA] overflow-hidden gap-0.5">
            <div
              className="h-full bg-[#059669]"
              style={{ width: `${receivableSharePct}%` }}
            />
            <div
              className="h-full bg-[#E11D48]"
              style={{ width: `${100 - receivableSharePct}%` }}
            />
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] flex items-center justify-between text-xs">
          <span className="text-[#52504C]">Net Khatabook</span>
          <span
            className={`font-mono-data tabular-nums font-bold ${
              netKhatabookMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
            }`}
          >
            {netKhatabookMinor >= 0 ? '+' : ''}
            {formatINR(netKhatabookMinor)}
          </span>
        </div>
      </div>
    </div>
  );
}
