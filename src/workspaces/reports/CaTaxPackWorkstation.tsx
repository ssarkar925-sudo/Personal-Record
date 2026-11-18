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
import { Badge, Button, Input, Select } from '../../components/ui/Primitives.tsx';
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
      <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)] no-print">
        <div>
          <h2 className="text-sm font-bold text-[#111318] flex items-center gap-1.5">
            <Landmark className="h-4 w-4 text-[#C59B27]" />
            Indian Income Tax Engine &amp; CA Dossier ({taxPack?.fiscalYearLabel ?? `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`})
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Finance Act 2024 updated slabs · Old vs. New Regime (Sec 115BAC) · Deduction Optimizer · Advance Tax Schedule
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Financial Year"
            className="w-auto h-8 text-xs font-semibold bg-[#FAF8F5] border-[#E6E1D6] text-[#111318]"
            value={String(fyStartYear)}
            onChange={(e) => onFyChange(Number(e.target.value))}
          >
            {[defaultFy + 1, defaultFy, defaultFy - 1, defaultFy - 2].map((y) => (
              <option key={y} value={String(y)}>
                FY {y}-{String(y + 1).slice(-2)}
              </option>
            ))}
          </Select>

          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenWhatsAppModal}
            className="h-8 text-xs bg-[#FAF8F5] border-[#E6E1D6] text-[#111318] hover:bg-[#F3EFEA]"
          >
            <Share2 className="h-3.5 w-3.5 text-[#059669]" /> WhatsApp CA Summary
          </Button>

          <a
            href={exportTaxPackUrl}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#C59B27]" /> Download CA CSV Dossier
          </a>

          <Button
            variant="primary"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
          >
            <Printer className="h-3.5 w-3.5 text-[#E5C158]" /> Print / Save CA PDF
          </Button>
        </div>
      </div>

      {taxLoading || !taxPack || !taxComparison ? (
        <div className="rounded-2xl border border-[#E6E1D6] bg-white p-8 text-center text-xs text-[#6B7280]">
          Compiling Indian Income Tax Regime Comparison &amp; CA Pack...
        </div>
      ) : (
        <>
          {/* 1. Regime Recommendation Verdict Banner */}
          <div className="relative rounded-2xl p-4 sm:p-5 border border-[#E6E1D6] bg-white shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#C59B27]" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A7418]">
                    Regime Recommendation
                  </span>
                  <Badge
                    className={
                      taxComparison.recommendedRegime === 'new'
                        ? 'bg-[#C59B27]/15 text-[#9A7418] border-[#C59B27]/30 font-bold'
                        : 'bg-[#059669]/10 text-[#059669] border-[#059669]/25 font-bold'
                    }
                  >
                    {taxComparison.recommendedRegime === 'new'
                      ? 'New Regime (Section 115BAC)'
                      : taxComparison.recommendedRegime === 'old'
                        ? 'Old Tax Regime'
                        : 'Both Equal'}
                  </Badge>
                  <span className="text-[11px] text-[#6B7280]">
                    (Nil tax up to ₹7.75L for Salaried in New Regime)
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-[#111318] mt-1">
                  {taxComparison.summaryText}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs tabular-nums">
                <div className="text-right">
                  <div className="text-[#6B7280] text-[11px]">New Regime Tax</div>
                  <div className="text-base font-bold text-[#111318]">
                    {formatINR(taxComparison.newRegime.totalTaxLiabilityMinor)}
                  </div>
                  <div className="text-[10px] text-[#9A7418] font-semibold">
                    {taxComparison.newRegime.effectiveTaxRatePct}% effective
                  </div>
                </div>
                <div className="h-8 w-px bg-[#E6E1D6]" />
                <div className="text-right">
                  <div className="text-[#6B7280] text-[11px]">Old Regime Tax</div>
                  <div className="text-base font-bold text-[#111318]">
                    {formatINR(taxComparison.oldRegime.totalTaxLiabilityMinor)}
                  </div>
                  <div className="text-[10px] text-[#6B7280] font-semibold">
                    {taxComparison.oldRegime.effectiveTaxRatePct}% effective
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Deduction Optimizer & Profile Controls */}
          <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 space-y-4 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)] no-print">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F3EFEA] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#111318] flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-[#C59B27]" />
                  Interactive Deduction Optimizer &amp; Profile Adjustments
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Tweak deductions to see real-time tax comparison between regimes
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 font-medium text-[#111318] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSalaried}
                    onChange={(e) => onSalariedChange(e.target.checked)}
                    className="rounded border-[#E6E1D6] text-[#111318] focus:ring-[#C59B27]"
                  />
                  Salaried Employee (Standard Deduction ₹75k / ₹50k)
                </label>

                <label className="flex items-center gap-1.5 font-medium text-[#111318] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSeniorCitizen}
                    onChange={(e) => onSeniorCitizenChange(e.target.checked)}
                    className="rounded border-[#E6E1D6] text-[#111318] focus:ring-[#C59B27]"
                  />
                  Senior Citizen (≥60 yrs)
                </label>

                <label className="flex items-center gap-1.5 font-medium text-[#111318] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isParentsSenior}
                    onChange={(e) => onParentsSeniorChange(e.target.checked)}
                    className="rounded border-[#E6E1D6] text-[#111318] focus:ring-[#C59B27]"
                  />
                  Senior Citizen Parents
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-[#111318] mb-1">
                  Salary Income Override (₹)
                </label>
                <Input
                  type="number"
                  placeholder={`From Ledger: ${formatINR(taxPack.scopePnl.personal.incomeMinor)}`}
                  value={salaryOverrideRupees}
                  onChange={(e) => onSalaryOverrideChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#111318]">Sec 80C (Max ₹1.5L)</label>
                  <button
                    type="button"
                    onClick={() => onSec80cChange('150000')}
                    className="text-[10px] font-bold text-[#9A7418] hover:underline"
                  >
                    Max ₹1.5L
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={sec80cRupees}
                  onChange={(e) => onSec80cChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#111318]">Sec 80D Health Self (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80dSelfChange(isSeniorCitizen ? '50000' : '25000')}
                    className="text-[10px] font-bold text-[#9A7418] hover:underline"
                  >
                    Max {isSeniorCitizen ? '₹50k' : '₹25k'}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={sec80dSelfRupees}
                  onChange={(e) => onSec80dSelfChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#111318]">Sec 80D Parents (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80dParentsChange(isParentsSenior ? '50000' : '25000')}
                    className="text-[10px] font-bold text-[#9A7418] hover:underline"
                  >
                    Max {isParentsSenior ? '₹50k' : '₹25k'}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={sec80dParentsRupees}
                  onChange={(e) => onSec80dParentsChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#111318]">Sec 80CCD(1B) NPS (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec80ccd1bChange('50000')}
                    className="text-[10px] font-bold text-[#9A7418] hover:underline"
                  >
                    Max ₹50k
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={sec80ccd1bRupees}
                  onChange={(e) => onSec80ccd1bChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#111318]">Sec 24(b) Home Loan Int (₹)</label>
                  <button
                    type="button"
                    onClick={() => onSec24bChange('200000')}
                    className="text-[10px] font-bold text-[#9A7418] hover:underline"
                  >
                    Max ₹2L
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 200000"
                  value={sec24bRupees}
                  onChange={(e) => onSec24bChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#111318] mb-1">
                  HRA / 80GG Rent Exemption (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 120000"
                  value={hraRupees}
                  onChange={(e) => onHraChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#111318] mb-1">
                  Sec 80TTA / TTB Interest (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 10000"
                  value={sec80ttaRupees}
                  onChange={(e) => onSec80ttaChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#111318] mb-1">
                  Equity STCG u/s 111A (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={stcgEquityRupees}
                  onChange={(e) => onStcgEquityChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#111318] mb-1">
                  Equity LTCG u/s 112A (₹)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={ltcgEquityRupees}
                  onChange={(e) => onLtcgEquityChange(e.target.value)}
                  className="h-8 text-xs w-full bg-[#FAF8F5] border-[#E6E1D6]"
                />
              </div>
            </div>
          </div>

          {/* 3. Side-by-Side Slabs & Computation Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* New Regime Card */}
            <div className="relative rounded-2xl p-4 sm:p-5 border border-[#E6E1D6] bg-white shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)] overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#C59B27]" />
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#111318] flex items-center gap-1.5">
                    New Tax Regime (Section 115BAC)
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">Finance Act 2024 updated slabs &amp; standard deduction</p>
                </div>
                <Badge className="bg-[#C59B27]/15 text-[#9A7418] border-[#C59B27]/30 font-semibold">
                  Default Regime
                </Badge>
              </div>

              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1 border-b border-[#F3EFEA]">
                  <span className="text-[#6B7280]">Gross Total Income</span>
                  <span className="font-semibold text-[#111318]">
                    {formatINR(taxComparison.newRegime.grossTotalIncomeMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F3EFEA] text-[#059669] font-medium">
                  <span>Less: Standard Deduction</span>
                  <span>-{formatINR(taxComparison.newRegime.standardDeductionMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F3EFEA] font-semibold text-[#111318]">
                  <span>Net Taxable Income</span>
                  <span>{formatINR(taxComparison.newRegime.netTaxableIncomeMinor)}</span>
                </div>

                {/* Slabs */}
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Tax Slab Computation:</div>
                  <div className="space-y-1 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D6]">
                    {taxComparison.newRegime.slabs.map((s) => (
                      <div key={s.slabLabel} className="flex justify-between text-[11px]">
                        <span className="text-[#6B7280]">
                          {s.slabLabel} ({s.ratePct}% on {formatINR(s.taxableInSlabMinor, { compact: true })})
                        </span>
                        <span className="font-semibold text-[#111318]">{formatINR(s.taxAmountMinor)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {taxComparison.newRegime.rebate87aMinor > 0 && (
                  <div className="flex justify-between py-1 text-[#059669] font-medium">
                    <span>Less: Section 87A Rebate</span>
                    <span>-{formatINR(taxComparison.newRegime.rebate87aMinor)}</span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-[#6B7280]">
                  <span>Health &amp; Education Cess (4%)</span>
                  <span>+{formatINR(taxComparison.newRegime.cessMinor)}</span>
                </div>

                <div className="flex justify-between py-2 border-t border-[#E6E1D6] font-bold text-sm text-[#111318] pt-2">
                  <span>Total Net Tax Payable</span>
                  <span>{formatINR(taxComparison.newRegime.totalTaxLiabilityMinor)}</span>
                </div>
              </div>
            </div>

            {/* Old Regime Card */}
            <div className="relative rounded-2xl p-4 sm:p-5 border border-[#E6E1D6] bg-white shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)] overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#111318]" />
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#111318] flex items-center gap-1.5">
                    Old Tax Regime
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">With full Chapter VI-A deductions &amp; Sec 24(b)</p>
                </div>
                <Badge className="bg-[#FAF8F5] text-[#111318] border-[#E6E1D6]">
                  Optional
                </Badge>
              </div>

              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1 border-b border-[#F3EFEA]">
                  <span className="text-[#6B7280]">Gross Total Income</span>
                  <span className="font-semibold text-[#111318]">
                    {formatINR(taxComparison.oldRegime.grossTotalIncomeMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F3EFEA] text-[#059669] font-medium">
                  <span>Less: Standard Deduction</span>
                  <span>-{formatINR(taxComparison.oldRegime.standardDeductionMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F3EFEA] text-[#059669] font-medium">
                  <span>Less: Chapter VI-A Deductions Claimed</span>
                  <span>-{formatINR(taxComparison.oldRegime.chapterVIAClaimsMinor)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F3EFEA] font-semibold text-[#111318]">
                  <span>Net Taxable Income</span>
                  <span>{formatINR(taxComparison.oldRegime.netTaxableIncomeMinor)}</span>
                </div>

                {/* Slabs */}
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Tax Slab Computation:</div>
                  <div className="space-y-1 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D6]">
                    {taxComparison.oldRegime.slabs.map((s) => (
                      <div key={s.slabLabel} className="flex justify-between text-[11px]">
                        <span className="text-[#6B7280]">
                          {s.slabLabel} ({s.ratePct}% on {formatINR(s.taxableInSlabMinor, { compact: true })})
                        </span>
                        <span className="font-semibold text-[#111318]">{formatINR(s.taxAmountMinor)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {taxComparison.oldRegime.rebate87aMinor > 0 && (
                  <div className="flex justify-between py-1 text-[#059669] font-medium">
                    <span>Less: Section 87A Rebate</span>
                    <span>-{formatINR(taxComparison.oldRegime.rebate87aMinor)}</span>
                  </div>
                )}

                <div className="flex justify-between py-1 text-[#6B7280]">
                  <span>Health &amp; Education Cess (4%)</span>
                  <span>+{formatINR(taxComparison.oldRegime.cessMinor)}</span>
                </div>

                <div className="flex justify-between py-2 border-t border-[#E6E1D6] font-bold text-sm text-[#111318] pt-2">
                  <span>Total Net Tax Payable</span>
                  <span>{formatINR(taxComparison.oldRegime.totalTaxLiabilityMinor)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Advance Tax Installment Schedule */}
          <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#111318] flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[#C59B27]" />
                  Advance Tax Installment Calendar (Section 208 / 211)
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Applicable if total annual net tax liability exceeds ₹10,000. Avoid 234B/234C interest penalties
                </p>
              </div>
              <Badge className="bg-[#FAF8F5] text-[#111318] border-[#E6E1D6] font-semibold">
                Quarterly Deadlines
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
              {advanceTaxSchedule.map((inst) => (
                <div
                  key={inst.quarter}
                  className="rounded-xl border border-[#E6E1D6] p-3.5 bg-[#FAF8F5]/75 hover:bg-[#FAF8F5] transition-colors"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-[#111318]">{inst.title}</span>
                    <Badge
                      className={
                        inst.status === 'paid'
                          ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25 font-semibold'
                          : inst.status === 'overdue'
                            ? 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25 font-semibold'
                            : 'bg-[#C59B27]/15 text-[#9A7418] border-[#C59B27]/30 font-semibold'
                      }
                    >
                      {inst.status === 'paid' ? 'Paid' : inst.status === 'overdue' ? 'Past Due' : 'Upcoming'}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-[#6B7280]">Due: {inst.dueDate}</div>
                  <div className="text-base font-bold text-[#111318] mt-1">
                    {formatINR(inst.installmentTargetMinor)}
                  </div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">
                    Cumulative: {formatINR(inst.cumulativeTargetMinor)} ({inst.cumulativePct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Capital Gains & Portfolio ITR Balances */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
              <h3 className="text-sm font-bold text-[#111318] mb-1 flex items-center gap-1.5">
                <PieChart className="h-4 w-4 text-[#C59B27]" />
                Capital Gains Taxation Rates (Finance Act 2024)
              </h3>
              <p className="text-xs text-[#6B7280] mb-3">
                Budget updated rates applicable from July 23, 2024 onwards
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                  <div>
                    <div className="font-bold text-[#111318]">Equity STCG (Sec 111A)</div>
                    <div className="text-[11px] text-[#6B7280]">Held &lt;12 months in listed shares / equity funds</div>
                  </div>
                  <Badge className="bg-[#C59B27]/15 text-[#9A7418] border-[#C59B27]/30 font-semibold">
                    20% flat
                  </Badge>
                </div>

                <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                  <div>
                    <div className="font-bold text-[#111318]">Equity LTCG (Sec 112A)</div>
                    <div className="text-[11px] text-[#6B7280]">Exemption up to ₹1.25 Lakhs per FY</div>
                  </div>
                  <Badge className="bg-[#C59B27]/15 text-[#9A7418] border-[#C59B27]/30 font-semibold">
                    12.5% &gt; ₹1.25L
                  </Badge>
                </div>

                <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                  <div>
                    <div className="font-bold text-[#111318]">Unlisted &amp; Debt Mutual Funds</div>
                    <div className="text-[11px] text-[#6B7280]">Specified debt mutual funds purchased after Apr 1, 2023</div>
                  </div>
                  <Badge className="bg-white text-[#111318] border-[#E6E1D6] font-semibold">
                    Slab Rates
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
              <h3 className="text-sm font-bold text-[#111318] mb-1 flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-[#059669]" />
                Portfolio Wealth &amp; ITR Disclosed Balances
              </h3>
              <p className="text-xs text-[#6B7280] mb-3">
                Consolidated liquid cash, loan liability, and asset distribution
              </p>
              <div className="space-y-2 text-xs tabular-nums">
                <div className="flex justify-between py-1.5 border-b border-[#F3EFEA]">
                  <span className="text-[#6B7280]">Disclosed Bank Balances (Liquid)</span>
                  <span className="font-semibold text-[#111318]">
                    {formatINR(
                      (taxPack.bankAccounts ?? []).reduce((s, b) => s + Math.max(0, b.currentBalanceMinor), 0),
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3EFEA]">
                  <span className="text-[#6B7280]">Total Portfolio Investments Recorded</span>
                  <span className="font-semibold text-[#059669]">
                    {formatINR(taxPack.totalInvestedMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3EFEA]">
                  <span className="text-[#6B7280]">Tax Reserve Earmarked in Goals</span>
                  <span className="font-semibold text-[#9A7418]">
                    {formatINR(taxPack.totalTaxReservedMinor)} / {formatINR(taxPack.totalTaxTargetMinor)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 font-medium text-[#111318]">
                  <span className="text-[#6B7280]">Borrowed Liabilities Outstanding</span>
                  <span className="font-semibold text-[#E11D48]">
                    {formatINR(
                      (taxPack.loans ?? [])
                        .filter((l) => l.direction === 'borrowed')
                        .reduce((s, l) => s + l.remainingMinor, 0),
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 6. Business Deductible Expenses Schedule */}
          <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <h3 className="text-sm font-bold text-[#111318] mb-1">
              Business Deductible Expense Categories ({taxPack.fiscalYearLabel})
            </h3>
            <p className="text-xs text-[#6B7280] mb-3">
              Legitimate business expenses deducted against business revenue for net profit determination
            </p>
            {taxPack.businessExpenseCategories.length === 0 ? (
              <p className="text-xs text-[#6B7280] py-6 text-center">
                No Business-scoped expenses recorded between {taxPack.fromDate} and {taxPack.toDate}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E6E1D6] text-[#6B7280] uppercase text-[10px] tracking-[0.12em]">
                      <th className="py-2.5 pr-3 font-bold">Category</th>
                      <th className="py-2.5 pr-3 font-bold text-right">Entries</th>
                      <th className="py-2.5 font-bold text-right">Total Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3EFEA]">
                    {taxPack.businessExpenseCategories.map((c) => (
                      <tr key={c.category} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-[#111318]">{c.category}</td>
                        <td className="py-2.5 pr-3 text-right text-[#6B7280]">{c.count}</td>
                        <td className="py-2.5 text-right font-semibold text-[#111318]">
                          {formatINR(c.totalMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 7. Bank Accounts Schedule (ITR Disclosure) */}
          <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <h3 className="text-sm font-bold text-[#111318] mb-1">
              Schedule of Bank Accounts (Mandatory ITR Disclosure)
            </h3>
            <p className="text-xs text-[#6B7280] mb-3">
              All savings and current accounts maintained during the financial year
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-[#E6E1D6] text-[#6B7280] uppercase text-[10px] tracking-[0.12em]">
                    <th className="py-2.5 pr-3 font-bold">Account Name</th>
                    <th className="py-2.5 pr-3 font-bold">Bank / Institution</th>
                    <th className="py-2.5 pr-3 font-bold">Last 4</th>
                    <th className="py-2.5 pr-3 font-bold">Scope</th>
                    <th className="py-2.5 font-bold text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EFEA]">
                  {(taxPack.bankAccounts ?? []).map((b) => (
                    <tr key={b.id} className="hover:bg-[#FAF8F5] transition-colors">
                      <td className="py-2.5 pr-3 font-semibold text-[#111318]">{b.name}</td>
                      <td className="py-2.5 pr-3 text-[#6B7280]">{b.institution || '—'}</td>
                      <td className="py-2.5 pr-3 text-[#6B7280]">{b.last4 ? `••• ${b.last4}` : '—'}</td>
                      <td className="py-2.5 pr-3">
                        <Badge className={SCOPE_META[b.scope].badgeClass}>{SCOPE_META[b.scope].label}</Badge>
                      </td>
                      <td className="py-2.5 text-right font-bold text-[#111318]">
                        {formatINR(b.currentBalanceMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
