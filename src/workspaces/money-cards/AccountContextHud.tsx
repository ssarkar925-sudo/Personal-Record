import { useMemo } from 'react';
import {
  Building2,
  Clock,
  CreditCard as CreditCardIcon,
  Edit2,
  Wallet,
  X,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';

export interface AccountContextHudProps {
  account: AccountRecord;
  transactions: TransactionRecord[];
  onClearSelection: () => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
}

export function AccountContextHud({
  account,
  transactions,
  onClearSelection,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
}: AccountContextHudProps) {
  const isCard = account.accountGroup === 'credit_card';
  const isBank = account.accountGroup === 'bank';
  const balance = account.currentBalanceMinor || 0;
  const outstanding = Math.abs(balance);
  const limit = account.creditLimitMinor || 1;
  const availableCreditMinor = Math.max(0, limit - outstanding);
  const utilPct = isCard ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;

  // Account specific transactions
  const accountTxs = useMemo(() => {
    return transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id);
  }, [transactions, account.id]);

  // Bank Inflow vs Outflow
  const accountInflowMinor = useMemo(() => {
    return accountTxs
      .filter((t) => (t.kind === 'income' && t.accountId === account.id) || (t.kind === 'transfer' && t.toAccountId === account.id))
      .reduce((sum, t) => sum + t.amountMinor, 0);
  }, [accountTxs, account.id]);

  const accountOutflowMinor = useMemo(() => {
    return accountTxs
      .filter((t) => (t.kind === 'expense' && t.accountId === account.id) || (t.kind === 'transfer' && t.accountId === account.id))
      .reduce((sum, t) => sum + t.amountMinor, 0);
  }, [accountTxs, account.id]);

  // Card Category Spend Breakdown
  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of accountTxs) {
      if (t.kind === 'expense') {
        map[t.category] = (map[t.category] || 0) + t.amountMinor;
      }
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const totalExpense = entries.reduce((s, e) => s + e[1], 0) || 1;
    return entries.slice(0, 3).map(([cat, amt]) => ({
      category: cat,
      amountMinor: amt,
      pct: Math.round((amt / totalExpense) * 100),
    }));
  }, [accountTxs]);

  const currentDay = new Date().getDate();
  const daysUntilDue = (account.dueDay || 5) - currentDay;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-4">
      {/* 1. Account Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isCard
                ? 'bg-indigo-100 text-indigo-700'
                : isBank
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isCard ? (
              <CreditCardIcon className="w-5 h-5" />
            ) : isBank ? (
              <Building2 className="w-5 h-5" />
            ) : (
              <Wallet className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{account.name}</h3>
              {account.last4 && (
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                  •••• {account.last4}
                </span>
              )}
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {account.scope}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {account.institution || account.accountGroup} · {accountTxs.length} records in this ledger
            </div>
          </div>
        </div>

        {/* Action Buttons & Clear Filter */}
        <div className="flex items-center gap-2">
          {isCard ? (
            <button
              onClick={() => onOpenPayCard(account)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              Pay Bill
            </button>
          ) : isBank ? (
            <button
              onClick={() => onOpenReconcileBank(account)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors cursor-pointer"
            >
              Reconcile Passbook
            </button>
          ) : null}

          <button
            onClick={() => onOpenEditAccount(account)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Edit Account Details"
          >
            <Edit2 className="w-4 h-4" />
          </button>

          <button
            onClick={onClearSelection}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Show All</span>
          </button>
        </div>
      </div>

      {/* 2. Key Financial Breakdown Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isCard ? (
          <>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Current Outstanding</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{formatINR(outstanding)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Limit: {formatINR(limit)}</div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block">Available Credit</span>
              <div className="text-xl font-bold font-mono text-indigo-900 mt-0.5">
                {formatINR(availableCreditMinor)}
              </div>
              <div className="text-[11px] text-indigo-700 font-medium mt-0.5">{utilPct}% limit utilized</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Statement Due Status</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                Day {account.dueDay || 5}th
              </div>
              <div className="text-[11px] mt-0.5">
                {daysUntilDue >= 0 && daysUntilDue <= 7 ? (
                  <span className="text-amber-700 font-bold">Due in {daysUntilDue} days</span>
                ) : (
                  <span className="text-emerald-700 font-medium">Cycle Active</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Current Balance</span>
              <div className="text-xl font-bold font-mono text-emerald-800 mt-0.5">{formatINR(balance)}</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Reconciled Deposit</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Recorded Inflow</span>
              <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
                +{formatINR(accountInflowMinor)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Credits / Transfers in</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Recorded Outflow</span>
              <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">
                -{formatINR(accountOutflowMinor)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Debits / Spends out</div>
            </div>
          </>
        )}
      </div>

      {/* 3. Deep Domain Intelligence: Statement Cycle Timeline (for Cards) or Category Breakdown */}
      {isCard ? (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              Statement Cycle & Grace Period Timeline
            </span>
            <span className="text-[11px] font-mono text-slate-500">20-Day Grace Window</span>
          </div>

          {/* Timeline Visual Steps */}
          <div className="grid grid-cols-3 gap-2 text-xs pt-1">
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">1. Statement Bill</span>
              <div className="font-bold text-slate-800 text-xs mt-0.5">{account.statementDay || 15}th of Month</div>
              <div className="text-[10px] text-slate-500">Cycle Closes</div>
            </div>

            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200/80">
              <span className="text-[10px] font-bold text-indigo-700 block uppercase">2. Interest-Free</span>
              <div className="font-bold text-indigo-900 text-xs mt-0.5">Grace Period</div>
              <div className="text-[10px] text-indigo-700">Zero interest window</div>
            </div>

            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">3. Payment Due</span>
              <div className="font-bold text-slate-800 text-xs mt-0.5">{account.dueDay || 5}th of Month</div>
              <div className="text-[10px] text-slate-500">Avoid late penalty</div>
            </div>
          </div>

          {/* Top Spends on this card */}
          {topCategories.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                Top Spend Categories on this Card:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {topCategories.map((c) => (
                  <div key={c.category} className="p-2 rounded-lg bg-white border border-slate-200 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate">{c.category}</span>
                      <span className="font-mono font-bold text-slate-900">{formatINR(c.amountMinor)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
