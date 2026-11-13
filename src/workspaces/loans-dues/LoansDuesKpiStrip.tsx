import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Landmark,
  Plus,
  Users,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { LoanRecord } from '../../lib/api.ts';

export interface LoansDuesKpiStripProps {
  totalBorrowingsMinor: number;
  totalReceivablesMinor: number;
  monthlyEmiCommitmentMinor: number;
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Total Borrowings & Liabilities (Money You Owe) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
        <div className="flex-1 mr-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Total Liabilities & Debt
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
            {formatINR(totalBorrowingsMinor)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span>EMI: <strong>{formatINR(monthlyEmiCommitmentMinor)}/mo</strong></span>
            <span>•</span>
            <span>{activeLoansCount} active loans</span>
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5" />
        </div>
      </div>

      {/* 2. Total Receivables & Assets (Money Owed to You) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
        <div className="flex-1 mr-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Money Owed to You
            </span>
            <span
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                netDebtMinor <= 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Net: {netDebtMinor <= 0 ? 'Surplus' : 'Deficit'} {formatINR(Math.abs(netDebtMinor), { compact: true })}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-700 mt-1">
            {formatINR(totalReceivablesMinor)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {openDuesCount} pending people dues & lent assists
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Command & EMI Radar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">EMI & Settlement Radar</span>
          {urgentDueCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              {urgentDueCount} Due in 7 Days
            </span>
          ) : nextEmiLoan ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3 text-slate-500" />
              Next EMI: {nextEmiLoan.nextDueDate}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              All Payments Current
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <button
            onClick={onOpenAddLoan}
            className="flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] py-1.5 px-2 rounded-xl transition-colors shadow-2xs cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">New Loan</span>
          </button>
          <button
            onClick={onOpenAddDue}
            className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] py-1.5 px-2 rounded-xl transition-colors shadow-2xs cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Add Due</span>
          </button>
          <button
            onClick={onOpenAddGoal}
            className="flex items-center justify-center gap-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] py-1.5 px-2 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer truncate"
          >
            <Plus className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span className="truncate">Add Goal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
