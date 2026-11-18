import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  CreditCard as CreditCardIcon,
  Landmark,
  Plus,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';
import type { TreasuryMetrics } from './treasuryAnalytics.ts';

export interface MoneyKpiStripProps {
  accounts: AccountRecord[];
  creditCards: AccountRecord[];
  metrics: TreasuryMetrics;
  unmatchedTransfersCount: number;
  onOpenRecordTx: () => void;
  onOpenNewAccount: () => void;
  onOpenTransferMatch: () => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onNavigateToCards?: () => void;
}

export function MoneyKpiStrip({
  creditCards,
  metrics,
  unmatchedTransfersCount,
  onOpenRecordTx,
  onOpenNewAccount,
  onOpenTransferMatch,
  onOpenPayCard,
  onNavigateToCards,
}: MoneyKpiStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Total Liquid Treasury Reserves */}
      <div className="bento-card rounded-2xl p-4.5 relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#059669] to-[#10B981]" />
        <div>
          <div className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
            Liquid Treasury Reserves
          </div>
          <div className="text-2xl font-bold font-mono-data tabular-nums tracking-tight text-[#111318] mt-1">
            {formatINR(metrics.totalLiquidMinor)}
          </div>
          <div className="text-[11px] text-[#52504C] mt-0.5">
            {metrics.bankCount} Bank Deposits · {metrics.walletCount} Cash/UPI Wallets
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 text-[#059669] flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5" />
        </div>
      </div>

      {/* 2. Monthly Treasury Cashflow Velocity */}
      <div className="bento-card rounded-2xl p-4.5 relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C59B27] to-[#E5C158]" />
        <div>
          <div className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
            Month Net Treasury Flow
          </div>
          <div
            className={`text-2xl font-bold font-mono-data tabular-nums tracking-tight mt-1 ${
              metrics.monthNetFlowMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
            }`}
          >
            {formatINR(metrics.monthNetFlowMinor, { signed: true })}
          </div>
          <div className="text-[11px] font-mono-data text-[#52504C] mt-0.5">
            In: <span className="text-[#059669] font-semibold">+{formatINR(metrics.monthInflowMinor, { compact: true })}</span> · Out:{' '}
            <span className="text-[#111318] font-semibold">-{formatINR(metrics.monthOutflowMinor, { compact: true })}</span>
          </div>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#F3EFEA] border border-[#EAE5DC] text-[#9A7B2C] flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Connected Credit Cards Debt & Liquidity Bridge */}
      <div className="bento-card rounded-2xl p-4.5 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#111318] to-[#52504C]" />
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono-data uppercase tracking-wider text-[#858078] font-semibold">
            <span className="flex items-center gap-1.5">
              <CreditCardIcon className="w-3.5 h-3.5 text-[#C59B27]" />
              Card Liability Bridge
            </span>
            <span
              className={`font-mono-data text-[10px] font-bold px-2 py-0.5 rounded border ${
                metrics.totalCreditDebtMinor === 0
                  ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                  : metrics.totalLiquidMinor >= metrics.totalCreditDebtMinor
                    ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                    : 'bg-amber-50 text-[#9A7B2C] border-amber-200'
              }`}
            >
              {metrics.totalCreditDebtMinor === 0
                ? 'Zero Debt'
                : `${metrics.debtCoverageRatioPct}% Covered`}
            </span>
          </div>

          <div className="text-2xl font-bold font-mono-data tabular-nums tracking-tight text-[#111318] mt-1">
            {formatINR(metrics.totalCreditDebtMinor)}
          </div>
        </div>

        {/* 1-Click Connected Actions */}
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-[#EAE5DC]">
          {creditCards.length > 0 && metrics.totalCreditDebtMinor > 0 ? (
            <button
              type="button"
              onClick={() => onOpenPayCard(creditCards[0])}
              className="flex-1 flex items-center justify-center gap-1 bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold text-xs py-1.5 rounded-xl transition-colors cursor-pointer"
              title="Pay credit card bill using bank balance"
            >
              <Zap className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>Settle Card</span>
            </button>
          ) : null}

          {onNavigateToCards && (
            <button
              type="button"
              onClick={onNavigateToCards}
              className="flex-1 flex items-center justify-center gap-1 bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] font-semibold text-xs py-1.5 rounded-xl transition-colors cursor-pointer"
              title="Open Credit Cards Command Center"
            >
              <span>Cards Hub</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#C59B27]" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Treasury Command Radar & Actions */}
      <div className="bento-card rounded-2xl p-4.5 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C59B27] via-[#059669] to-[#111318]" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
            Treasury Actions
          </span>
          {unmatchedTransfersCount > 0 ? (
            <button
              type="button"
              onClick={onOpenTransferMatch}
              className="inline-flex items-center gap-1 text-[10px] font-mono-data font-bold text-[#9A7B2C] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-3 h-3 text-[#C59B27]" />
              {unmatchedTransfersCount} Transfers
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono-data font-semibold text-[#059669] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3 text-[#059669]" />
              Passbooks Synced
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={onOpenRecordTx}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Tx</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewAccount}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] font-semibold text-xs py-2 rounded-xl border border-[#EAE5DC] transition-colors cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-[#C59B27]" />
            <span>New Bank</span>
          </button>
        </div>
      </div>
    </div>
  );
}
