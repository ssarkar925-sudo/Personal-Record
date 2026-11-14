import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  CreditCard as CreditCardIcon,
  Plus,
  Wallet,
  Zap,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';

export interface MoneyKpiStripProps {
  accounts: AccountRecord[];
  creditCards: AccountRecord[];
  totalLiquidMinor: number;
  totalCreditDebtMinor: number;
  unmatchedTransfersCount: number;
  onOpenRecordTx: () => void;
  onOpenNewAccount: () => void;
  onOpenTransferMatch: () => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onNavigateToCards?: () => void;
}

export function MoneyKpiStrip({
  accounts,
  creditCards,
  totalLiquidMinor,
  totalCreditDebtMinor,
  unmatchedTransfersCount,
  onOpenRecordTx,
  onOpenNewAccount,
  onOpenTransferMatch,
  onOpenPayCard,
  onNavigateToCards,
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

      {/* 2. Connected Credit Cards Debt & Liquidity Bridge */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <CreditCardIcon className="w-3.5 h-3.5 text-blue-600" />
              Connected Card Liabilities
            </span>
            <span
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                totalCreditDebtMinor === 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : totalLiquidMinor >= totalCreditDebtMinor
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {totalCreditDebtMinor === 0
                ? 'Zero Debt ✅'
                : totalLiquidMinor >= totalCreditDebtMinor
                  ? `${Math.round((totalLiquidMinor / (totalCreditDebtMinor || 1)) * 100)}% Covered ✅`
                  : 'Cash Shortfall'}
            </span>
          </div>

          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
            {formatINR(totalCreditDebtMinor)}
          </div>

          <div className="text-[11px] text-slate-500 mt-0.5">
            {creditCards.length > 0
              ? `Across ${creditCards.length} credit card${creditCards.length > 1 ? 's' : ''} · Settle from bank`
              : 'No credit cards added'}
          </div>
        </div>

        {/* 1-Click Connected Actions */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          {creditCards.length > 0 && totalCreditDebtMinor > 0 ? (
            <button
              type="button"
              onClick={() => onOpenPayCard(creditCards[0])}
              className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 font-semibold text-xs py-1.5 rounded-xl transition-colors cursor-pointer"
              title="Pay credit card bill using bank balance"
            >
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              <span>Settle Card Bill</span>
            </button>
          ) : null}

          {onNavigateToCards && (
            <button
              type="button"
              onClick={onNavigateToCards}
              className="flex-1 flex items-center justify-center gap-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs py-1.5 rounded-xl transition-colors cursor-pointer"
              title="Open Credit Cards Command Center"
            >
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Cards Hub</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Financial Command Radar & Actions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Banking Actions & Reconcile</span>
          {unmatchedTransfersCount > 0 ? (
            <button
              onClick={onOpenTransferMatch}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors animate-pulse cursor-pointer"
            >
              <ArrowRightLeft className="w-3 h-3 text-amber-600" />
              {unmatchedTransfersCount} Transfers
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Passbooks Current
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
            <Building2 className="w-4 h-4 text-slate-500" />
            <span>New Bank</span>
          </button>
        </div>
      </div>
    </div>
  );
}
