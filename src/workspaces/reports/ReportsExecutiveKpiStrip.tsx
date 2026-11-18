import React from 'react';
import { Clock, Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { ReportsIntelligence } from './types.ts';
import type { TaxComparisonResult } from '../../../shared/tax-engine.ts';

interface ReportsExecutiveKpiStripProps {
  intelligence: ReportsIntelligence | null;
  taxComparison: TaxComparisonResult | null;
  totalInflowMinor: number;
  totalOutflowMinor: number;
}

export const ReportsExecutiveKpiStrip: React.FC<ReportsExecutiveKpiStripProps> = ({
  intelligence,
  taxComparison,
  totalInflowMinor,
  totalOutflowMinor,
}) => {
  if (!intelligence) return null;

  const netSavingsMinor = totalInflowMinor - totalOutflowMinor;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
      {/* 1. Financial Runway */}
      <div className="relative rounded-2xl p-4 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#111318] to-[#C59B27]" />
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] font-bold text-[#52504C] flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#C59B27]" />
            FINANCIAL RUNWAY
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              intelligence.runwayMonths >= 6
                ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                : intelligence.runwayMonths >= 3
                  ? 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/25'
                  : 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
            }`}
          >
            {intelligence.runwayMonths >= 6
              ? 'Safe (>6m)'
              : intelligence.runwayMonths >= 3
                ? 'Adequate'
                : 'Tight (<3m)'}
          </span>
        </div>
        <div className="text-2xl font-bold font-mono-data text-[#111318] tabular-nums mt-1">
          {intelligence.runwayMonths}{' '}
          <span className="text-xs font-normal text-[#52504C]">months</span>
        </div>
        <div className="text-[11px] font-mono text-[#52504C] mt-1 flex items-center justify-between">
          <span>Burn: {formatINR(intelligence.averageMonthlyBurnMinor, { compact: true })}/mo</span>
          <span className="font-semibold text-[#111318]">
            Cash: {formatINR(intelligence.bankBalances, { compact: true })}
          </span>
        </div>
      </div>

      {/* 2. Net Savings Velocity */}
      <div className="relative rounded-2xl p-4 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#059669] to-[#10B981]" />
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] font-bold text-[#52504C] flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[#059669]" />
            PERIOD SAVINGS RATE
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              intelligence.savingsRatePct >= 30
                ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                : intelligence.savingsRatePct >= 15
                  ? 'bg-[#C59B27]/15 text-[#111318] border-[#C59B27]/35'
                  : 'bg-[#F3EFEA] text-[#52504C] border-[#E6E1D6]'
            }`}
          >
            {intelligence.savingsRatePct >= 30
              ? 'High (>30%)'
              : intelligence.savingsRatePct >= 15
                ? 'Moderate'
                : 'Low (<15%)'}
          </span>
        </div>
        <div className="text-2xl font-bold font-mono-data text-[#111318] tabular-nums mt-1 flex items-baseline gap-2">
          <span>{intelligence.savingsRatePct}%</span>
          <span className="text-xs font-semibold text-[#059669]">
            {formatINR(netSavingsMinor, { compact: true, signed: true })}
          </span>
        </div>
        <div className="text-[11px] font-mono text-[#52504C] mt-1 flex items-center justify-between">
          <span>Inflow: {formatINR(totalInflowMinor, { compact: true })}</span>
          <span>Outflow: {formatINR(totalOutflowMinor, { compact: true })}</span>
        </div>
      </div>

      {/* 3. Tax Radar & Regime */}
      <div className="relative rounded-2xl p-4 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C59B27] to-[#111318]" />
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] font-bold text-[#52504C] flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5 text-[#C59B27]" />
            TAX LIABILITY RADAR
          </div>
          {taxComparison ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#111318] text-[#E5C158]">
              {taxComparison.recommendedRegime === 'new' ? 'New 115BAC' : 'Old Regime'}
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] border border-[#E6E1D6]">
              FY 2026-27
            </span>
          )}
        </div>
        <div className="text-2xl font-bold font-mono-data text-[#111318] tabular-nums mt-1">
          {taxComparison
            ? formatINR(
                taxComparison.recommendedRegime === 'new'
                  ? taxComparison.newRegime.totalTaxLiabilityMinor
                  : taxComparison.oldRegime.totalTaxLiabilityMinor,
              )
            : '₹0.00'}
        </div>
        <div className="text-[11px] font-mono text-[#52504C] mt-1 flex items-center justify-between">
          <span>
            Effective:{' '}
            {taxComparison
              ? taxComparison.recommendedRegime === 'new'
                ? taxComparison.newRegime.effectiveTaxRatePct
                : taxComparison.oldRegime.effectiveTaxRatePct
              : 0}
            %
          </span>
          {taxComparison && taxComparison.savingsMinor > 0 ? (
            <span className="text-[#059669] font-semibold">
              Saves {formatINR(taxComparison.savingsMinor, { compact: true })}
            </span>
          ) : (
            <span>Advance Tax Ready</span>
          )}
        </div>
      </div>

      {/* 4. Spend Anomaly & Integrity */}
      <div className="relative rounded-2xl p-4 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#E11D48] to-[#C59B27]" />
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] font-bold text-[#52504C] flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#C59B27]" />
            SPEND ANOMALY CHECK
          </div>
          {intelligence.anomalies.length > 0 ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E11D48]/10 text-[#E11D48] border border-[#E11D48]/25">
              Spike Detected
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#059669]/10 text-[#059669] border border-[#059669]/25">
              Nominal
            </span>
          )}
        </div>
        {intelligence.anomalies.length > 0 ? (
          <div className="mt-1.5 truncate">
            <div className="text-sm font-bold font-mono text-[#E11D48] truncate">
              {intelligence.anomalies[0].category}:{' '}
              {formatINR(intelligence.anomalies[0].amountMinor)}
            </div>
            <div className="text-[11px] text-[#52504C] truncate mt-1">
              +{intelligence.anomalies[0].spikePct}% above category average
            </div>
          </div>
        ) : (
          <div className="mt-1.5">
            <div className="text-sm font-bold text-[#059669]">No anomalous spikes</div>
            <div className="text-[11px] text-[#52504C] mt-1">
              All categories within expected bounds
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
