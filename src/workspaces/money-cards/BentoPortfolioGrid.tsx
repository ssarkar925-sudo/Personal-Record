import {
  ArrowRight,
  Building2,
  Clock,
  CreditCard as CreditCardIcon,
  Edit2,
  Plus,
  Split,
  Wallet,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';

export interface BentoPortfolioGridProps {
  accounts: AccountRecord[];
  onSelectAccountAndSplit: (accountId: string) => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
  onOpenNewAccount: () => void;
  onSwitchToSplit: () => void;
}

export function BentoPortfolioGrid({
  accounts,
  onSelectAccountAndSplit,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
  onOpenNewAccount,
  onSwitchToSplit,
}: BentoPortfolioGridProps) {
  const currentDay = new Date().getDate();

  return (
    <div className="space-y-4">
      {/* Bento Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h3 className="text-base font-bold text-slate-900">Portfolio Executive Bento Grid</h3>
          <p className="text-xs text-slate-500">
            Overview of all {accounts.length} credit cards, bank accounts, and wallets with real-time utilization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToSplit}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Split className="w-3.5 h-3.5" />
            <span>Switch to Split Ledger View</span>
          </button>
          <button
            onClick={onOpenNewAccount}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Grid of Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((acc) => {
          const isCard = acc.accountGroup === 'credit_card';
          const isBank = acc.accountGroup === 'bank';
          const balance = acc.currentBalanceMinor || 0;
          const outstanding = Math.abs(balance);
          const limit = acc.creditLimitMinor || 1;
          const availableCredit = Math.max(0, limit - outstanding);
          const utilPct = isCard ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;
          const isDueSoon = isCard && outstanding > 0 && Math.abs((acc.dueDay || 5) - currentDay) <= 5;

          return (
            <div
              key={acc.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all group"
            >
              {/* Top Accent Stripe */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${
                  isCard
                    ? utilPct > 50
                      ? 'bg-rose-500'
                      : utilPct > 30
                        ? 'bg-amber-500'
                        : 'bg-indigo-600'
                    : isBank
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                }`}
              />

              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isCard
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                        : isBank
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                          : 'bg-amber-50 text-amber-800 border border-amber-200/80'
                    }`}
                  >
                    {isCard ? (
                      <CreditCardIcon className="w-4 h-4" />
                    ) : isBank ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {acc.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                      <span>{acc.institution || acc.accountGroup}</span>
                      {acc.last4 && (
                        <span className="font-mono text-[11px] text-slate-500">
                          •••• {acc.last4}
                        </span>
                      )}
                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {acc.scope}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onOpenEditAccount(acc)}
                  className="p-1 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Edit Account"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card Body Metrics */}
              <div className="my-4">
                {isCard ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Current Outstanding
                        </span>
                        <div className="text-xl font-bold font-mono text-slate-900">
                          {formatINR(outstanding)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Available Credit</span>
                        <span className="text-xs font-mono font-bold text-emerald-700">
                          {formatINR(availableCredit)}
                        </span>
                      </div>
                    </div>

                    {/* Progress track */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          utilPct > 50 ? 'bg-rose-500' : utilPct > 30 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.max(2, utilPct)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Limit: {formatINR(limit)}</span>
                      <span className="font-mono font-bold text-indigo-700">{utilPct}% used</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Current Deposit Balance
                    </span>
                    <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                      {formatINR(balance)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Active {acc.accountGroup === 'bank' ? 'Bank Account' : 'Cash Wallet'}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                {isCard ? (
                  <div className="flex items-center gap-1.5">
                    {isDueSoon && <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />}
                    <span className={`text-[11px] ${isDueSoon ? 'text-amber-800 font-bold' : 'text-slate-500'}`}>
                      Due on <strong>{acc.dueDay || 5}th</strong>
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-emerald-700 font-medium">Reconciled</span>
                )}

                <div className="flex items-center gap-2">
                  {isCard ? (
                    <button
                      onClick={() => onOpenPayCard(acc)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                    >
                      Pay Bill
                    </button>
                  ) : isBank ? (
                    <button
                      onClick={() => onOpenReconcileBank(acc)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors cursor-pointer"
                    >
                      Recon
                    </button>
                  ) : null}

                  <button
                    onClick={() => onSelectAccountAndSplit(acc.id)}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-xs font-medium"
                    title="View transaction stream for this account"
                  >
                    <span>Stream</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
