import React from 'react';
import { Clock, Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import { Badge, Card } from '../../components/ui/Primitives.tsx';
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
      {/* 1. Financial Runway */}
      <Card className="relative p-3.5 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-indigo-600" />
            Financial Runway
          </div>
          <Badge
            className={
              intelligence.runwayMonths >= 6
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : intelligence.runwayMonths >= 3
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
            }
          >
            {intelligence.runwayMonths >= 6 ? 'Safe (>6m)' : intelligence.runwayMonths >= 3 ? 'Adequate' : 'Tight (<3m)'}
          </Badge>
        </div>
        <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
          {intelligence.runwayMonths} <span className="text-xs font-normal text-slate-500">months</span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
          <span>Burn: {formatINR(intelligence.averageMonthlyBurnMinor, { compact: true })}/mo</span>
          <span className="font-medium text-slate-700">Cash: {formatINR(intelligence.bankBalances, { compact: true })}</span>
        </div>
      </Card>

      {/* 2. Net Savings Velocity */}
      <Card className="relative p-3.5 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            Period Savings Rate
          </div>
          <Badge
            className={
              intelligence.savingsRatePct >= 30
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : intelligence.savingsRatePct >= 15
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
            }
          >
            {intelligence.savingsRatePct >= 30 ? 'High (>30%)' : intelligence.savingsRatePct >= 15 ? 'Moderate' : 'Low (<15%)'}
          </Badge>
        </div>
        <div className="text-xl font-bold text-slate-900 tabular-nums mt-1 flex items-baseline gap-2">
          <span>{intelligence.savingsRatePct}%</span>
          <span className="text-xs font-semibold text-emerald-700">
            {formatINR(netSavingsMinor, { compact: true, signed: true })}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
          <span>Inflow: {formatINR(totalInflowMinor, { compact: true })}</span>
          <span>Outflow: {formatINR(totalOutflowMinor, { compact: true })}</span>
        </div>
      </Card>

      {/* 3. Tax Radar & Regime */}
      <Card className="relative p-3.5 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5 text-blue-600" />
            Tax Liability Radar
          </div>
          {taxComparison ? (
            <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-semibold">
              {taxComparison.recommendedRegime === 'new' ? 'New 115BAC' : 'Old Regime'}
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">FY 2026-27</Badge>
          )}
        </div>
        <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
          {taxComparison
            ? formatINR(
                taxComparison.recommendedRegime === 'new'
                  ? taxComparison.newRegime.totalTaxLiabilityMinor
                  : taxComparison.oldRegime.totalTaxLiabilityMinor,
              )
            : '₹0.00'}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
          <span>Effective: {taxComparison ? (taxComparison.recommendedRegime === 'new' ? taxComparison.newRegime.effectiveTaxRatePct : taxComparison.oldRegime.effectiveTaxRatePct) : 0}%</span>
          {taxComparison && taxComparison.savingsMinor > 0 ? (
            <span className="text-emerald-700 font-medium">Saves {formatINR(taxComparison.savingsMinor, { compact: true })}</span>
          ) : (
            <span>Advance Tax Active</span>
          )}
        </div>
      </Card>

      {/* 4. Spend Anomaly & Integrity */}
      <Card className="relative p-3.5 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
            Spend Anomaly Check
          </div>
          {intelligence.anomalies.length > 0 ? (
            <Badge className="bg-rose-50 text-rose-700 border-rose-200 font-medium">
              Spike Detected
            </Badge>
          ) : (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
              Nominal
            </Badge>
          )}
        </div>
        {intelligence.anomalies.length > 0 ? (
          <div className="mt-1 truncate">
            <div className="text-sm font-bold text-rose-700 truncate">
              {intelligence.anomalies[0].category}: {formatINR(intelligence.anomalies[0].amountMinor)}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-1">
              +{intelligence.anomalies[0].spikePct}% above category average
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <div className="text-sm font-bold text-emerald-700">No anomalous spikes</div>
            <div className="text-[11px] text-slate-500 mt-1">All categories within expected bounds</div>
          </div>
        )}
      </Card>
    </div>
  );
};
