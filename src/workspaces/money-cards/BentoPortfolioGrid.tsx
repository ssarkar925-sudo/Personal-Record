import {
  ArrowRight,
  Building2,
  CreditCard as CreditCardIcon,
  Edit2,
  Plus,
  Split,
  Wallet,
  Zap,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord } from '../../lib/api.ts';

export interface BentoPortfolioGridProps {
  accounts: AccountRecord[]; // Liquid accounts (banks + wallets)
  creditCards: AccountRecord[];
  totalCreditDebtMinor: number;
  onSelectAccountAndSplit: (accountId: string) => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
  onOpenNewAccount: () => void;
  onSwitchToSplit: () => void;
  onNavigateToCards?: () => void;
}

export function BentoPortfolioGrid({
  accounts,
  creditCards,
  totalCreditDebtMinor,
  onSelectAccountAndSplit,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
  onOpenNewAccount,
  onSwitchToSplit,
  onNavigateToCards,
}: BentoPortfolioGridProps) {
  return (
    <div className="space-y-4">
      {/* Bento Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h3 className="text-base font-bold text-slate-900">Liquid Wealth Portfolio Bento Grid</h3>
          <p className="text-xs text-slate-500">
            Overview of your {accounts.length} bank accounts and cash wallets.
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
            <span>Add Bank / Cash</span>
          </button>
        </div>
      </div>

      {/* Grid of Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Connected Credit Cards Tile (Bridge) */}
        {creditCards.length > 0 && (
          <div className="bg-white rounded-2xl border border-blue-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-blue-300 transition-all">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-700 border border-blue-200/80">
                  <CreditCardIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Connected Credit Cards
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    {creditCards.length} Card{creditCards.length > 1 ? 's' : ''} Active · Separate Hub
                  </div>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Liability
              </span>
            </div>

            <div className="my-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Total Outstanding Debt
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {formatINR(totalCreditDebtMinor)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {totalCreditDebtMinor === 0
                  ? 'All credit cards fully paid ✅'
                  : 'Payable directly from liquid bank balance'}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-emerald-700 font-medium">Double-Entry Settlement</span>

              <div className="flex items-center gap-2">
                {totalCreditDebtMinor > 0 && (
                  <button
                    onClick={() => onOpenPayCard(creditCards[0])}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Settle Bill</span>
                  </button>
                )}

                {onNavigateToCards && (
                  <button
                    onClick={onNavigateToCards}
                    className="p-1 text-slate-500 hover:text-blue-600 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-xs font-semibold"
                    title="Open Credit Cards Workspace"
                  >
                    <span>Cards Hub</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Liquid Bank & Cash Accounts */}
        {accounts.map((acc) => {
          const isBank = acc.accountGroup === 'bank';
          const balance = acc.currentBalanceMinor || 0;

          return (
            <div
              key={acc.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-all group"
            >
              {/* Top Accent Stripe */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${
                  isBank ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />

              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isBank
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                        : 'bg-amber-50 text-amber-800 border border-amber-200/80'
                    }`}
                  >
                    {isBank ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {acc.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>{acc.institution || (isBank ? 'Bank' : 'Cash')}</span>
                      {acc.last4 && <span>••{acc.last4}</span>}
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

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] text-emerald-700 font-medium">Reconciled</span>

                <div className="flex items-center gap-2">
                  {isBank && (
                    <button
                      onClick={() => onOpenReconcileBank(acc)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors cursor-pointer"
                    >
                      Recon
                    </button>
                  )}

                  <button
                    onClick={() => onSelectAccountAndSplit(acc.id)}
                    className="p-1 text-slate-400 hover:text-emerald-700 rounded transition-colors cursor-pointer flex items-center gap-0.5 text-xs font-medium"
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
