import React from 'react';
import {
  Calculator,
  Clock,
  FileSpreadsheet,
  Landmark,
  PieChart,
  Printer,
  Share2,
} from 'lucide-react';
import { Badge, Button, Card, Input, Select } from '../../components/ui/Primitives.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { TaxSummaryPack } from '../../lib/api.ts';
import type { AdvanceTaxInstallment, TaxComparisonResult } from '../../../shared/tax-engine.ts';

interface CaTaxPackWorkstationProps {
  fyStartYear: number;
  defaultFy: number;
  taxPack: TaxSummaryPack | null;
  taxComparison: TaxComparisonResult | null;
  taxLoading: boolean;
  exportTaxPackUrl: string;
  isSalaried: boolean;
  isSeniorCitizen: boolean;
  isParentsSenior: boolean;
  salaryOverrideRupees: string;
  sec80cRupees: string;
  sec80dSelfRupees: string;
  sec80dParentsRupees: string;
  sec80ccd1bRupees: string;
  sec24bRupees: string;
  sec80ttaRupees: string;
  hraRupees: string;
  stcgEquityRupees: string;
  ltcgEquityRupees: string;
  advanceTaxSchedule: AdvanceTaxInstallment[];
  onFyChange: (val: number) => void;
  onOpenWhatsAppModal: () => void;
  onSalariedChange: (val: boolean) => void;
  onSeniorCitizenChange: (val: boolean) => void;
  onParentsSeniorChange: (val: boolean) => void;
  onSalaryOverrideChange: (val: string) => void;
  onSec80cChange: (val: string) => void;
  onSec80dSelfChange: (val: string) => void;
  onSec80dParentsChange: (val: string) => void;
  onSec80ccd1bChange: (val: string) => void;
  onSec24bChange: (val: string) => void;
  onSec80ttaChange: (val: string) => void;
  onHraChange: (val: string) => void;
  onStcgEquityChange: (val: string) => void;
  onLtcgEquityChange: (val: string) => void;
}

export const CaTaxPackWorkstation: React.FC<CaTaxPackWorkstationProps> = ({
  fyStartYear,
  defaultFy,
  taxPack,
  taxComparison,
  taxLoading,
  exportTaxPackUrl,
  isSalaried,
  isSeniorCitizen,
  isParentsSenior,
  salaryOverrideRupees,
  sec80cRupees,
  sec80dSelfRupees,
  sec80dParentsRupees,
  sec80ccd1bRupees,
  sec24bRupees,
  sec80ttaRupees,
  hraRupees,
  stcgEquityRupees,
  ltcgEquityRupees,
  advanceTaxSchedule,
  onFyChange,
  onOpenWhatsAppModal,
  onSalariedChange,
  onSeniorCitizenChange,
  onParentsSeniorChange,
  onSalaryOverrideChange,
  onSec80cChange,
  onSec80dSelfChange,
  onSec80dParentsChange,
  onSec80ccd1bChange,
  onSec24bChange,
  onSec80ttaChange,
  onHraChange,
  onStcgEquityChange,
  onLtcgEquityChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-slate-200/90 bg-white shadow-2xs no-print">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Landmark className="h-4 w-4 text-indigo-600" />
            Indian Income Tax Engine &amp; CA Dossier ({taxPack?.fiscalYearLabel ?? `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`})
          </h2>
          <p className="text-xs text-slate-500">
            Finance Act 2024 updated slabs · Old vs. New Regime (Sec 115BAC) · Deduction Optimizer · Advance Tax Schedule
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Financial Year"
            className="w-auto h-8 text-xs font-medium bg-slate-50 border-slate-200"
            value={String(fyStartYear)}
            onChange={(e) => onFyChange(Number(e.target.value))}
          >
            {[defaultFy + 1, defaultFy, defaultFy - 1, defaultFy - 2].map((y) => (
              <option key={y} value={String(y)}>
                FY {y}-{String(y + 1).slice(-2)}
              </option>
            ))}
          </Select>

          <Button variant="secondary" size="sm" onClick={onOpenWhatsAppModal} className="h-8 text-xs">
            <Share2 className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp CA Summary
          </Button>

          <a
            href={exportTaxPackUrl}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 shadow-2xs cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-600" /> Download CA CSV Dossier
          </a>

          <Button variant="primary" size="sm" onClick={() => window.print()} className="h-8 text-xs">
            <Printer className="h-3.5 w-3.5" /> Print / Save CA PDF
          </Button>
        </div>
      </Card>

      {taxLoading || !taxPack || !taxComparison ? (
        <Card className="p-8 text-center text-xs text-slate-500 border-slate-200 bg-white">
          Compiling Indian Income Tax Regime Comparison &amp; CA Pack...
        </Card>
      ) : (
        <>
          {/* 1. Regime Recommendation Verdict Banner */}
          <Card className="relative p-4 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                    Regime Recommendation
                  </span>
                  <Badge
                    className={
                      taxComparison.recommendedRegime === 'new'
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
                    }
                  >
                    {taxComparison.recommendedRegime === 'new'
                      ? 'New Regime (Section 115BAC)'
                      : taxComparison.recommendedRegime === 'old'
                        ? 'Old Tax Regime'
                        : 'Both Equal'}
                  </Badge>
                  <span className="text-[11px] text-slate-500">
                    (Nil tax up to ₹7.75L for Salaried in New Regime)
                  </span>
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {taxComparison.summaryText}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs tabular-nums">
                <div className="text-right">
                  <div className="text-slate-500 text-[11px]">New Regime Tax</div>
                  <div className="text-base font-bold text-indigo-700">
                    {formatINR(taxComparison.newRegime.totalTaxLiabilityMinor)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {taxComparison.newRegime.effectiveTaxRatePct}% effective
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div className="text-right">
                  <div className="text-slate-500 text-[11px]">Old Regime Tax</div>
                  <div className="text-base font-bold text-slate-800">
                    {formatINR(taxComparison.oldRegime.totalTaxLiabilityMinor)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {taxComparison.oldRegime.effectiveTaxRatePct}% effective
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 2. Deduction Optimizer & Profile Controls */}
          <Card className="p-4 space-y-4 border-slate-200/90 bg-white shadow-2xs no-print">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-indigo-600" />
                  Interactive Deduction Optimizer &amp; Profile Adjustments
                </h3>
                <p className="text-xs text-slate-500">
                  Tweak deductions to see real-time tax comparison between regimes
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSalaried}
                    onChange={(e) => onSalariedChange(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Salaried Employee (Standard Deduction ₹75k / ₹50k)
                </label>

                <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSeniorCitizen}
                    onChange={(e) => onSeniorCitizenChange(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Senior Citizen (≥60 yrs)
                </label>

                <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isParentsSenior}
                    onChange={(e) => onParentsSeniorChange(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Senior Citizen Parents
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Salary Income Override (₹)
                </label>
                <Input
                  type="number"
                  placeholder={`From Ledger: ${formatINR(taxPack.scopePnl.personal.incomeMinor)}`}
                  value={salaryOverrideRupees}
                  onChange={(e) => onSalaryOverrideChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Sec 80C (Max ₹1.5L)</label>
                  <button
                    type="button"
                    onClick={() => onSec80cChange('150000')}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Max ₹1.5L
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={sec80cRupees}
                  onChange={(e) => onSec80cChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Sec 80D Health Self (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80dSelfChange(isSeniorCitizen ? '50000' : '25000')}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Max {isSeniorCitizen ? '₹50k' : '₹25k'}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={sec80dSelfRupees}
                  onChange={(e) => onSec80dSelfChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Sec 80D Parents (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80dParentsChange(isParentsSenior ? '50000' : '25000')}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Max {isParentsSenior ? '₹50k' : '₹25k'}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={sec80dParentsRupees}
                  onChange={(e) => onSec80dParentsChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Sec 80CCD(1B) NPS (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80ccd1bChange('50000')}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Max ₹50k
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={sec80ccd1bRupees}
                  onChange={(e) => onSec80ccd1bChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Sec 24(b) Home Loan Int (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec24bChange('200000')}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Max ₹2L
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 200000"
                  value={sec24bRupees}
                  onChange={(e) => onSec24bChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  HRA / 80GG Rent Exemption (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 120000"
                  value={hraRupees}
                  onChange={(e) => onHraChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Sec 80TTA / TTB Interest (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 10000"
                  value={sec80ttaRupees}
                  onChange={(e) => onSec80ttaChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Equity STCG u/s 111A (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={stcgEquityRupees}
                  onChange={(e) => onStcgEquityChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Equity LTCG u/s 112A (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={ltcgEquityRupees}
                  onChange={(e) => onLtcgEquityChange(e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          </Card>

          {/* 3. Side-by-Side Slabs & Computation Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* New Regime Card */}
            <Card className="relative p-4 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    New Tax Regime (Section 115BAC)
                  </h3>
                  <p className="text-[11px] text-slate-500">Finance Act 2024 updated slabs &amp; standard deduction</p>
                </div>
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
                  Default Regime
                </Badge>
              </div>

              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Gross Total Income</span>
                  <span className="font-semibold text-slate-900">
                    {formatINR(taxComparison.newRegime.grossTotalIncomeMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700 font-medium">
                  <span>Less: Standard Deduction</span>
                  <span>-{formatINR(taxComparison.newRegime.standardDeductionMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 font-semibold text-slate-900">
                  <span>Net Taxable Income</span>
                  <span>{formatINR(taxComparison.newRegime.netTaxableIncomeMinor)}</span>
                </div>

                {/* Slabs */}
                <div className="pt-2">
                  <div className="text-[11px] font-medium text-slate-500 mb-1.5">Tax Slab Computation:</div>
                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    {taxComparison.newRegime.slabs.map((s) => (
                      <div key={s.slabLabel} className="flex justify-between text-[11px]">
                        <span className="text-slate-600">
                          {s.slabLabel} ({s.ratePct}% on {formatINR(s.taxableInSlabMinor, { compact: true })})
                        </span>
                        <span className="font-medium text-slate-800">{formatINR(s.taxAmountMinor)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {taxComparison.newRegime.rebate87aMinor > 0 && (
                  <div className="flex justify-between py-1 text-emerald-700 font-medium">
                    <span>Less: Section 87A Rebate</span>
                    <span>-{formatINR(taxComparison.newRegime.rebate87aMinor)}</span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-slate-600">
                  <span>Health &amp; Education Cess (4%)</span>
                  <span>+{formatINR(taxComparison.newRegime.cessMinor)}</span>
                </div>

                <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-sm text-indigo-900 pt-2">
                  <span>Total Net Tax Payable</span>
                  <span>{formatINR(taxComparison.newRegime.totalTaxLiabilityMinor)}</span>
                </div>
              </div>
            </Card>

            {/* Old Regime Card */}
            <Card className="relative p-4 border-slate-200/90 bg-white shadow-2xs overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-400" />
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Old Tax Regime
                  </h3>
                  <p className="text-[11px] text-slate-500">With full Chapter VI-A deductions &amp; Sec 24(b)</p>
                </div>
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                  Optional
                </Badge>
              </div>

              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Gross Total Income</span>
                  <span className="font-semibold text-slate-900">
                    {formatINR(taxComparison.oldRegime.grossTotalIncomeMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700 font-medium">
                  <span>Less: Standard Deduction</span>
                  <span>-{formatINR(taxComparison.oldRegime.standardDeductionMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700 font-medium">
                  <span>Less: Chapter VI-A Deductions Claimed</span>
                  <span>-{formatINR(taxComparison.oldRegime.chapterVIAClaimsMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 font-semibold text-slate-900">
                  <span>Net Taxable Income</span>
                  <span>{formatINR(taxComparison.oldRegime.netTaxableIncomeMinor)}</span>
                </div>

                {/* Slabs */}
                <div className="pt-2">
                  <div className="text-[11px] font-medium text-slate-500 mb-1.5">Tax Slab Computation:</div>
                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    {taxComparison.oldRegime.slabs.map((s) => (
                      <div key={s.slabLabel} className="flex justify-between text-[11px]">
                        <span className="text-slate-600">
                          {s.slabLabel} ({s.ratePct}% on {formatINR(s.taxableInSlabMinor, { compact: true })})
                        </span>
                        <span className="font-medium text-slate-800">{formatINR(s.taxAmountMinor)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {taxComparison.oldRegime.rebate87aMinor > 0 && (
                  <div className="flex justify-between py-1 text-emerald-700 font-medium">
                    <span>Less: Section 87A Rebate</span>
                    <span>-{formatINR(taxComparison.oldRegime.rebate87aMinor)}</span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-slate-600">
                  <span>Health &amp; Education Cess (4%)</span>
                  <span>+{formatINR(taxComparison.oldRegime.cessMinor)}</span>
                </div>

                <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-sm text-slate-900 pt-2">
                  <span>Total Net Tax Payable</span>
                  <span>{formatINR(taxComparison.oldRegime.totalTaxLiabilityMinor)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* 4. Advance Tax Installment Schedule */}
          <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  Advance Tax Installment Calendar (Section 208 / 211)
                </h3>
                <p className="text-xs text-slate-500">
                  Applicable if total annual net tax liability exceeds ₹10,000. Avoid 234B/234C interest penalties
                </p>
              </div>
              <Badge className="bg-sky-50 text-sky-700 border-sky-200 font-medium">
                Quarterly Deadlines
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
              {advanceTaxSchedule.map((inst) => (
                <div
                  key={inst.quarter}
                  className="rounded-lg border border-slate-200 p-3 bg-white hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-900">{inst.title}</span>
                    <Badge
                      className={
                        inst.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : inst.status === 'overdue'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                      }
                    >
                      {inst.status === 'paid' ? 'Paid' : inst.status === 'overdue' ? 'Past Due' : 'Upcoming'}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-500">Due: {inst.dueDate}</div>
                  <div className="text-base font-bold text-slate-900 mt-1">
                    {formatINR(inst.installmentTargetMinor)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Cumulative: {formatINR(inst.cumulativeTargetMinor)} ({inst.cumulativePct}%)
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 5. Capital Gains & Portfolio ITR Balances */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                <PieChart className="h-4 w-4 text-indigo-600" />
                Capital Gains Taxation Rates (Finance Act 2024)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Budget updated rates applicable from July 23, 2024 onwards
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded-md bg-slate-50 border border-slate-100">
                  <div>
                    <div className="font-semibold text-slate-900">Equity STCG (Sec 111A)</div>
                    <div className="text-[11px] text-slate-500">Held &lt;12 months in listed shares / equity funds</div>
                  </div>
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
                    20% flat
                  </Badge>
                </div>

                <div className="flex justify-between items-center p-2 rounded-md bg-slate-50 border border-slate-100">
                  <div>
                    <div className="font-semibold text-slate-900">Equity LTCG (Sec 112A)</div>
                    <div className="text-[11px] text-slate-500">Exemption up to ₹1.25 Lakhs per FY</div>
                  </div>
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
                    12.5% &gt; ₹1.25L
                  </Badge>
                </div>

                <div className="flex justify-between items-center p-2 rounded-md bg-slate-50 border border-slate-100">
                  <div>
                    <div className="font-semibold text-slate-900">Unlisted &amp; Debt Mutual Funds</div>
                    <div className="text-[11px] text-slate-500">Specified debt mutual funds purchased after Apr 1, 2023</div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-semibold">
                    Slab Rates
                  </Badge>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-emerald-600" />
                Portfolio Wealth &amp; ITR Disclosed Balances
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Consolidated liquid cash, loan liability, and asset distribution
              </p>
              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Disclosed Bank Balances (Liquid)</span>
                  <span className="font-semibold text-slate-900">
                    {formatINR(
                      (taxPack.bankAccounts ?? []).reduce((s, b) => s + Math.max(0, b.currentBalanceMinor), 0),
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Portfolio Investments Recorded</span>
                  <span className="font-semibold text-emerald-700">
                    {formatINR(taxPack.totalInvestedMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Tax Reserve Earmarked in Goals</span>
                  <span className="font-semibold text-sky-700">
                    {formatINR(taxPack.totalTaxReservedMinor)} / {formatINR(taxPack.totalTaxTargetMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 font-medium text-slate-900">
                  <span className="text-slate-600">Borrowed Liabilities Outstanding</span>
                  <span className="font-semibold text-rose-700">
                    {formatINR(
                      (taxPack.loans ?? [])
                        .filter((l) => l.direction === 'borrowed')
                        .reduce((s, l) => s + l.remainingMinor, 0),
                    )}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* 6. Business Deductible Expenses Schedule */}
          <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Business Deductible Expense Categories ({taxPack.fiscalYearLabel})
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Legitimate business expenses deducted against business revenue for net profit determination
            </p>
            {taxPack.businessExpenseCategories.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No Business-scoped expenses recorded between {taxPack.fromDate} and {taxPack.toDate}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-medium">Category</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Entries</th>
                      <th className="py-2.5 font-medium text-right">Total Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taxPack.businessExpenseCategories.map((c) => (
                      <tr key={c.category} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{c.category}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">{c.count}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {formatINR(c.totalMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 7. Bank Accounts Schedule (ITR Disclosure) */}
          <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Schedule of Bank Accounts (Mandatory ITR Disclosure)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              All savings and current accounts maintained during the financial year
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Account Name</th>
                    <th className="py-2.5 pr-3 font-medium">Bank / Institution</th>
                    <th className="py-2.5 pr-3 font-medium">Last 4</th>
                    <th className="py-2.5 pr-3 font-medium">Scope</th>
                    <th className="py-2.5 font-medium text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(taxPack.bankAccounts ?? []).map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">{b.name}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{b.institution || '—'}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{b.last4 ? `••• ${b.last4}` : '—'}</td>
                      <td className="py-2.5 pr-3">
                        <Badge className={SCOPE_META[b.scope].badgeClass}>{SCOPE_META[b.scope].label}</Badge>
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {formatINR(b.currentBalanceMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
