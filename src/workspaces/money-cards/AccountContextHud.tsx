import { useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Clock,
  CreditCard as CreditCardIcon,
  Edit2,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';
import type { TxKind } from '../../../shared/ledger-core.ts';

export interface AccountContextHudProps {
  account: AccountRecord;
  transactions: TransactionRecord[];
  onClearSelection: () => void;
  onOpenAddTx?: (defaultKind?: TxKind) => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
}

export function AccountContextHud({
  account,
  transactions,
  onClearSelection,
  onOpenAddTx,
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

  const safetyFloorMinor =
    account.minBalanceMinor && account.minBalanceMinor > 0
      ? account.minBalanceMinor
      : isBank
        ? 2500000
        : 500000;
  const isBelowFloor = !isCard && balance < safetyFloorMinor;

  // Account specific transactions
  const accountTxs = useMemo(() => {
    return transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id);
  }, [transactions, account.id]);

  // Bank Inflow vs Outflow
  const accountInflowMinor = useMemo(() => {
    return accountTxs
      .filter(
        (t) =>
          (t.kind === 'income' && t.accountId === account.id) ||
          (t.kind === 'transfer' && t.toAccountId === account.id),
      )
      .reduce((sum, t) => sum + t.amountMinor, 0);
  }, [accountTxs, account.id]);

  const accountOutflowMinor = useMemo(() => {
    return accountTxs
      .filter(
        (t) =>
          (t.kind === 'expense' && t.accountId === account.id) ||
          (t.kind === 'transfer' && t.accountId === account.id),
      )
      .reduce((sum, t) => sum + t.amountMinor, 0);
  }, [accountTxs, account.id]);

  // Top Categories Breakdown (works for both Bank/Cash and Card)
  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of accountTxs) {
      if (t.kind === 'expense' && t.accountId === account.id) {
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
  }, [accountTxs, account.id]);

  const totalFlowVolume = Math.max(1, accountInflowMinor + accountOutflowMinor);
  const inflowSharePct = Math.round((accountInflowMinor / totalFlowVolume) * 100);

  const currentDay = new Date().getDate();
  const daysUntilDue = (account.dueDay || 5) - currentDay;

  return (
    <div className="bento-card rounded-2xl p-4 space-y-4">
      {/* 1. Account Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE5DC]">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isCard
                ? 'bg-[#111318] text-[#E5C158] border-[#C59B27]/40'
                : isBank
                  ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                  : 'bg-[#F3EFEA] text-[#9A7B2C] border-[#EAE5DC]'
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
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-base font-bold text-[#111318]">{account.name}</h3>
              {account.last4 && (
                <span className="font-mono-data text-xs px-2 py-0.5 rounded-lg bg-[#F3EFEA] text-[#111318] font-semibold border border-[#EAE5DC]">
                  •••• {account.last4}
                </span>
              )}
              <span className="text-[10px] font-mono-data uppercase font-bold px-2 py-0.5 rounded bg-amber-50 text-[#9A7B2C] border border-amber-200">
                {SCOPE_META[account.scope].label}
              </span>
              {!isCard && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono-data uppercase font-bold px-2 py-0.5 rounded border ${
                    isBelowFloor
                      ? 'bg-rose-50 text-[#E11D48] border-rose-200'
                      : 'bg-emerald-50 text-[#059669] border-emerald-200'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {isBelowFloor ? 'Below Safety Floor' : 'Floor Healthy'}
                </span>
              )}
            </div>
            <div className="text-xs text-[#52504C] mt-0.5">
              {account.institution || account.accountGroup} · {accountTxs.length} double-entry records in passbook
            </div>
          </div>
        </div>

        {/* Action Buttons & Clear Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenAddTx && !isCard && (
            <>
              <button
                type="button"
                onClick={() => onOpenAddTx('income')}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#059669] border border-emerald-200 font-semibold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Inflow</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAddTx('expense')}
                className="px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] font-semibold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Outflow</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAddTx('transfer')}
                className="px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] font-semibold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Transfer</span>
              </button>
            </>
          )}

          {isCard ? (
            <button
              type="button"
              onClick={() => onOpenPayCard(account)}
              className="px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Pay Bill
            </button>
          ) : isBank ? (
            <button
              type="button"
              onClick={() => onOpenReconcileBank(account)}
              className="px-3 py-1.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold text-xs transition-colors cursor-pointer"
            >
              Reconcile
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onOpenEditAccount(account)}
            className="p-1.5 rounded-xl text-[#858078] hover:text-[#111318] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
            title="Edit Account Details"
          >
            <Edit2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            className="px-2.5 py-1.5 rounded-xl bg-[#F3EFEA] hover:bg-[#EAE5DC] text-[#111318] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
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
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#858078] block">
                Current Outstanding
              </span>
              <div className="text-xl font-bold font-mono-data text-[#111318] mt-0.5">
                {formatINR(outstanding)}
              </div>
              <div className="text-[11px] text-[#52504C] mt-0.5">Limit: {formatINR(limit)}</div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#059669] block">
                Available Credit
              </span>
              <div className="text-xl font-bold font-mono-data text-[#059669] mt-0.5">
                {formatINR(availableCreditMinor)}
              </div>
              <div className="text-[11px] text-[#52504C] font-medium mt-0.5">{utilPct}% limit utilized</div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#858078] block">
                Statement Due Status
              </span>
              <div className="text-xl font-bold font-mono-data text-[#111318] mt-0.5">
                Day {account.dueDay || 5}th
              </div>
              <div className="text-[11px] mt-0.5">
                {daysUntilDue >= 0 && daysUntilDue <= 7 ? (
                  <span className="text-[#9A7B2C] font-bold">Due in {daysUntilDue} days</span>
                ) : (
                  <span className="text-[#059669] font-medium">Cycle Active</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#059669] block">
                Current Balance
              </span>
              <div className="text-xl font-bold font-mono-data text-[#059669] tabular-nums mt-0.5">
                {formatINR(balance)}
              </div>
              <div className="text-[11px] text-[#059669] mt-0.5">
                Safety Floor: {formatINR(safetyFloorMinor, { compact: true })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#858078] block">
                Recorded Inflow
              </span>
              <div className="text-xl font-bold font-mono-data text-[#059669] tabular-nums mt-0.5">
                +{formatINR(accountInflowMinor)}
              </div>
              <div className="text-[11px] text-[#52504C] mt-0.5">Credits / Transfers in</div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase font-bold text-[#858078] block">
                Recorded Outflow
              </span>
              <div className="text-xl font-bold font-mono-data text-[#111318] tabular-nums mt-0.5">
                -{formatINR(accountOutflowMinor)}
              </div>
              <div className="text-[11px] text-[#52504C] mt-0.5">Debits / Spends out</div>
            </div>
          </>
        )}
      </div>

      {/* 3. Passbook Flow Velocity Bar & Top Outflow Categories */}
      <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] space-y-3">
        {!isCard ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#111318]">
                Passbook Inflow vs. Outflow Velocity Ratio
              </span>
              <span className="font-mono-data text-[11px] text-[#52504C]">
                {inflowSharePct}% Inflow · {100 - inflowSharePct}% Outflow
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#EAE5DC] overflow-hidden flex">
              <div
                className="h-full bg-[#059669] transition-all duration-500"
                style={{ width: `${inflowSharePct}%` }}
              />
              <div
                className="h-full bg-[#C59B27] transition-all duration-500"
                style={{ width: `${100 - inflowSharePct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs font-semibold text-[#111318]">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C59B27]" />
              Statement Cycle &amp; Grace Period Timeline
            </span>
            <span className="text-[11px] font-mono-data text-[#858078]">20-Day Grace Window</span>
          </div>
        )}

        {topCategories.length > 0 && (
          <div className="pt-2 border-t border-[#EAE5DC]">
            <span className="text-[11px] font-semibold text-[#52504C] block mb-1.5">
              Top Outflow Categories:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {topCategories.map((c) => (
                <div key={c.category} className="p-2 rounded-lg bg-white border border-[#EAE5DC] text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#111318] truncate">{c.category}</span>
                    <span className="font-mono-data font-bold text-[#111318]">
                      {formatINR(c.amountMinor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
