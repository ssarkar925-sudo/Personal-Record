import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Landmark,
  Plus,
  TrendingDown,
  Users,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { LoanRecord } from '../../lib/api.ts';

export interface LoansDuesKpiStripProps {
  totalBorrowingsMinor: number;
  totalReceivablesMinor: number;
  monthlyEmiCommitmentMinor: number;
  weightedAvgAprBps?: number;
  principalClearedPct?: number;
  activeLoansCount: number;
  openDuesCount: number;
  urgentDueCount: number;
  nextEmiLoan: LoanRecord | null;
  onOpenAddLoan: () => void;
  onOpenAddDue: () => void;
  onOpenAddGoal: () => void;
}

export function LoansDuesKpiStrip({
  totalBorrowingsMinor,
  totalReceivablesMinor,
  monthlyEmiCommitmentMinor,
  weightedAvgAprBps = 0,
  principalClearedPct = 0,
  activeLoansCount,
  openDuesCount,
  urgentDueCount,
  nextEmiLoan,
  onOpenAddLoan,
  onOpenAddDue,
  onOpenAddGoal,
}: LoansDuesKpiStripProps) {
  const netDebtMinor = totalBorrowingsMinor - totalReceivablesMinor;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Total Liabilities & Borrowings */}
      <div className="rounded-2xl bg-white border border-[#E6E1D6] p-4 shadow-[0_8px_24px_rgba(17,19,24,0.03)] relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#E11D48] to-[#C59B27]" />
        <div className="flex-1 mr-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#52504C] font-bold">
            TOTAL LIABILITIES & DEBT
          </div>
          <div className="text-2xl font-bold font-mono-data tabular-nums tracking-tight text-[#111318] mt-1">
            {formatINR(totalBorrowingsMinor)}
          </div>
          <div className="text-[11px] text-[#52504C] mt-1 flex items-center gap-1.5">
            <span>{activeLoansCount} active loans</span>
            <span>·</span>
            <span className="font-mono font-semibold text-[#E11D48]">
              {(weightedAvgAprBps / 100).toFixed(1)}% avg APR
            </span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#E11D48]/10 border border-[#E11D48]/25 text-[#E11D48] flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5" />
        </div>
      </div>

      {/* 2. Receivables & Money Owed to You */}
      <div className="rounded-2xl bg-white border border-[#E6E1D6] p-4 shadow-[0_8px_24px_rgba(17,19,24,0.03)] relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#059669] to-[#10B981]" />
        <div className="flex-1 mr-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#52504C] font-bold">
              MONEY OWED TO YOU
            </span>
            <span
              className={`font-mono-data text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                netDebtMinor <= 0
                  ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/30'
                  : 'bg-[#F3EFEA] text-[#52504C] border-[#E6E1D6]'
              }`}
            >
              Net: {netDebtMinor <= 0 ? 'Surplus' : 'Debt'} {formatINR(Math.abs(netDebtMinor), { compact: true })}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono-data tabular-nums tracking-tight text-[#059669] mt-1">
            {formatINR(totalReceivablesMinor)}
          </div>
          <div className="text-[11px] text-[#52504C] mt-1">
            Across {openDuesCount} open Khatabook dues & assists
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#059669]/10 border border-[#059669]/25 text-[#059669] flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Monthly EMI Commitment & Principal Clearance */}
      <div className="rounded-2xl bg-white border border-[#E6E1D6] p-4 shadow-[0_8px_24px_rgba(17,19,24,0.03)] relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#111318] to-[#C59B27]" />
        <div className="flex-1 mr-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#52504C] font-bold">
              MONTHLY EMI BURDEN
            </span>
            <span className="text-[10px] font-mono font-bold text-[#C59B27]">
              {principalClearedPct}% Cleared
            </span>
          </div>
          <div className="text-2xl font-bold font-mono-data tabular-nums tracking-tight text-[#111318] mt-1">
            {formatINR(monthlyEmiCommitmentMinor)}
            <span className="text-xs font-normal text-[#52504C]">/mo</span>
          </div>
          <div className="w-full h-1.5 bg-[#F3EFEA] rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-[#C59B27] rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, principalClearedPct)}%` }}
            />
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#F3EFEA] border border-[#E6E1D6] text-[#111318] flex items-center justify-center shrink-0">
          <TrendingDown className="w-5 h-5 text-[#C59B27]" />
        </div>
      </div>

      {/* 4. Command & Settlement Radar */}
      <div className="rounded-2xl bg-white border border-[#E6E1D6] p-4 shadow-[0_8px_24px_rgba(17,19,24,0.03)] relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C59B27] to-[#059669]" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#52504C] font-bold">
            SETTLEMENT RADAR
          </span>
          {urgentDueCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#D97706] bg-[#D97706]/10 border border-[#D97706]/30 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {urgentDueCount} Due in 7d
            </span>
          ) : nextEmiLoan ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[#111318] bg-[#F3EFEA] border border-[#E6E1D6] px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3 text-[#C59B27]" />
              EMI: {nextEmiLoan.nextDueDate}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#059669] bg-[#059669]/10 border border-[#059669]/25 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              All Current
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          <button
            type="button"
            onClick={onOpenAddLoan}
            className="flex items-center justify-center gap-1 bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] font-semibold text-[11px] py-1.5 px-2 rounded-xl transition-colors cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
            <span className="truncate">Loan</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddDue}
            className="flex items-center justify-center gap-1 bg-[#059669] hover:bg-[#047857] text-white font-semibold text-[11px] py-1.5 px-2 rounded-xl transition-colors cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Due</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddGoal}
            className="flex items-center justify-center gap-1 bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] font-semibold text-[11px] py-1.5 px-2 rounded-xl border border-[#E6E1D6] transition-colors cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 shrink-0 text-[#C59B27]" />
            <span className="truncate">Goal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
