import { ArrowRightLeft, CheckCircle2, Clock, CreditCard as CreditCardIcon, Plus, Wallet } from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';

export interface MoneyKpiStripProps {
  accounts: AccountRecord[];
  totalLiquidMinor: number;
  totalCreditDebtMinor: number;
  totalCreditLimitMinor: number;
  creditUtilizationPct: number;
  urgentDueCards: AccountRecord[];
  unmatchedTransfersCount: number;
  onOpenRecordTx: () => void;
  onOpenNewAccount: () => void;
  onOpenTransferMatch: () => void;
}

export function MoneyKpiStrip({
  accounts,
  totalLiquidMinor,
  totalCreditDebtMinor,
  totalCreditLimitMinor,
  creditUtilizationPct,
  urgentDueCards,
  unmatchedTransfersCount,
  onOpenRecordTx,
  onOpenNewAccount,
  onOpenTransferMatch,
}: MoneyKpiStripProps) {
  const bankAndWalletCount = accounts.filter((a) => a.accountGroup !== 'credit_card').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Total Liquid Cash & Banks */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Total Liquid Cash & Banks
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
            {formatINR(totalLiquidMinor)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {bankAndWalletCount} deposit & wallet accounts
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5" />
        </div>
      </div>

      {/* 2. Credit Card Utilization & Debt */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
        <div className="flex-1 mr-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <CreditCardIcon className="w-3.5 h-3.5 text-indigo-600" />
              Credit Cards Balance
            </span>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              {creditUtilizationPct.toFixed(1)}% Used
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
            {formatINR(totalCreditDebtMinor)}
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                creditUtilizationPct > 50
                  ? 'bg-rose-500'
                  : creditUtilizationPct > 30
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, creditUtilizationPct))}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Combined limit: {formatINR(totalCreditLimitMinor)}
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-700 flex items-center justify-center shrink-0">
          <CreditCardIcon className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Financial Command Radar & Actions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Financial Command Radar</span>
          {urgentDueCards.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
              <Clock className="w-3 h-3 text-amber-600" />
              {urgentDueCards.length} Card{urgentDueCards.length > 1 ? 's' : ''} Due Soon
            </span>
          ) : unmatchedTransfersCount > 0 ? (
            <button
              onClick={onOpenTransferMatch}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors animate-pulse cursor-pointer"
            >
              <ArrowRightLeft className="w-3 h-3 text-amber-600" />
              {unmatchedTransfersCount} Transfers to Match
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              All Bills Current
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onOpenRecordTx}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Tx</span>
          </button>
          <button
            onClick={onOpenNewAccount}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs py-2 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            <span>New Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
