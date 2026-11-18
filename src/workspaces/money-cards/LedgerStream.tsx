import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Calendar,
  Download,
  Edit2,
  FileSpreadsheet,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { formatINR, SCOPE_META, todayISO } from '../../lib/format.ts';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';
import type { Scope, TxKind } from '../../../shared/ledger-core.ts';
import { AccountContextHud } from './AccountContextHud.tsx';

export interface LedgerStreamProps {
  selectedAccount: AccountRecord | null;
  transactions: TransactionRecord[];
  filteredTransactions: TransactionRecord[];
  groupedTransactions: [string, TransactionRecord[]][];
  searchQuery: string;
  kindFilter: TxKind | 'all';
  scopeFilter: Scope | 'all';
  streamTotalInflowMinor: number;
  streamTotalOutflowMinor: number;
  onSearchChange: (q: string) => void;
  onKindChange: (k: TxKind | 'all') => void;
  onScopeChange: (s: Scope | 'all') => void;
  onClearSelection: () => void;
  onOpenAddTx: (defaultKind?: TxKind) => void;
  onOpenEditTx: (tx: TransactionRecord) => void;
  onOpenDeleteTx: (id: string) => void;
  onViewAttachment: (tx: TransactionRecord) => void;
  onExportCSV: () => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
}

export function LedgerStream({
  selectedAccount,
  transactions,
  filteredTransactions,
  groupedTransactions,
  searchQuery,
  kindFilter,
  scopeFilter,
  streamTotalInflowMinor,
  streamTotalOutflowMinor,
  onSearchChange,
  onKindChange,
  onScopeChange,
  onClearSelection,
  onOpenAddTx,
  onOpenEditTx,
  onOpenDeleteTx,
  onViewAttachment,
  onExportCSV,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
}: LedgerStreamProps) {
  return (
    <div className="flex-1 w-full space-y-4">
      {/* 1. Account Context HUD (when an account is selected) OR Unified Passbook Banner */}
      {selectedAccount ? (
        <AccountContextHud
          account={selectedAccount}
          transactions={transactions}
          onClearSelection={onClearSelection}
          onOpenAddTx={onOpenAddTx}
          onOpenPayCard={onOpenPayCard}
          onOpenReconcileBank={onOpenReconcileBank}
          onOpenEditAccount={onOpenEditAccount}
        />
      ) : (
        <div className="bento-card rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE5DC]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-[#111318]">
                  Double-Entry Treasury Passbook Stream
                </h3>
                <span className="text-xs font-mono-data font-semibold px-2 py-0.5 rounded-lg bg-[#F3EFEA] text-[#52504C] border border-[#EAE5DC]">
                  {filteredTransactions.length} entries
                </span>
              </div>
              <div className="text-xs text-[#52504C] mt-0.5">
                Real-time inflows, outflows, and inter-account settlements across your liquid accounts
              </div>
            </div>

            {/* Inflow vs Outflow Subtotals */}
            <div className="flex items-center gap-4 text-xs font-mono-data">
              <div className="text-right">
                <span className="text-[10px] text-[#858078] block uppercase font-bold">Inflow</span>
                <span className="text-[#059669] font-bold tabular-nums">
                  +{formatINR(streamTotalInflowMinor)}
                </span>
              </div>
              <div className="h-6 w-px bg-[#EAE5DC]" />
              <div className="text-right">
                <span className="text-[10px] text-[#858078] block uppercase font-bold">Outflow</span>
                <span className="text-[#111318] font-bold tabular-nums">
                  -{formatINR(streamTotalOutflowMinor)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Search, Filter Pills & Transaction Action Toolbar */}
      <div className="bento-card rounded-2xl p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input & Kind Pills */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#858078]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search party, category, or memo..."
                className="w-full h-8 pl-8 pr-7 text-xs bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl text-[#111318] placeholder:text-[#858078] focus:outline-none focus:border-[#111318] focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#858078] hover:text-[#111318] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Scope selector (Business ordered first) */}
            <select
              value={scopeFilter}
              onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
              className="h-8 px-2.5 text-xs bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl text-[#111318] font-medium cursor-pointer focus:outline-none focus:border-[#111318]"
            >
              <option value="all">All Scopes</option>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="family">Family</option>
            </select>

            {/* Kind Pills */}
            <div className="flex items-center gap-1 bg-[#F3EFEA] p-0.5 rounded-xl border border-[#EAE5DC] text-xs font-semibold">
              {(['all', 'expense', 'income', 'transfer'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKindChange(k)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                    kindFilter === k
                      ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs font-bold'
                      : 'text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenAddTx('expense')}
              className="h-8 px-3 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>Expense</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAddTx('income')}
              className="h-8 px-3 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Income</span>
            </button>
            <button
              type="button"
              onClick={onExportCSV}
              className="h-8 px-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Export filtered transactions to CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#C59B27]" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Date Grouped Transactions Feed */}
      <div className="space-y-4">
        {groupedTransactions.length === 0 ? (
          <div className="p-10 text-center rounded-2xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F3EFEA] text-[#858078] mx-auto flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-[#111318]">No passbook transactions found</div>
            <p className="text-xs text-[#52504C] max-w-sm mx-auto">
              No records match your selected account or filters. Click &quot;Expense&quot; or &quot;Income&quot; to record a new transaction.
            </p>
            <button
              type="button"
              onClick={() => onOpenAddTx('expense')}
              className="px-3.5 py-1.5 bg-[#111318] text-[#FAF8F5] text-xs font-semibold rounded-xl hover:bg-[#222630] transition-colors cursor-pointer"
            >
              + Record First Entry
            </button>
          </div>
        ) : (
          groupedTransactions.map(([dateGroup, txList]) => (
            <div key={dateGroup} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#111318] uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5 font-mono-data">
                  <Calendar className="w-3.5 h-3.5 text-[#C59B27]" />
                  {dateGroup === todayISO() ? `Today (${dateGroup})` : dateGroup}
                </span>
                <span className="font-mono-data text-[11px] font-normal text-[#858078] lowercase">
                  {txList.length} {txList.length > 1 ? 'entries' : 'entry'}
                </span>
              </div>

              <div className="bento-card rounded-2xl divide-y divide-[#EAE5DC] overflow-hidden">
                {txList.map((tx) => {
                  const isIncome = tx.kind === 'income';
                  const isTransfer = tx.kind === 'transfer';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 hover:bg-[#FAF8F5] transition-colors flex items-center justify-between gap-3 group"
                    >
                      {/* Left: Direction Icon & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isIncome
                              ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                              : isTransfer
                                ? 'bg-amber-50 text-[#9A7B2C] border-amber-200'
                                : 'bg-[#111318] text-[#E5C158] border-[#C59B27]/35'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : isTransfer ? (
                            <ArrowRightLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-[#111318] truncate">
                              {tx.party || tx.category}
                            </span>
                            <span className="text-[10px] font-mono-data font-medium px-1.5 py-0.5 rounded bg-[#F3EFEA] text-[#111318] uppercase border border-[#EAE5DC]">
                              {SCOPE_META[tx.scope].label}
                            </span>
                            {tx.hasAttachment && (
                              <button
                                type="button"
                                onClick={() => onViewAttachment(tx)}
                                className="text-[#C59B27] hover:text-[#111318] cursor-pointer"
                                title="View receipt attachment"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#52504C] mt-0.5">
                            <span className="font-medium text-[#111318]">{tx.category}</span>
                            <span>•</span>
                            <span className="truncate font-mono-data text-[11px]">
                              {tx.accountName}
                              {isTransfer && tx.toAccountName ? ` → ${tx.toAccountName}` : ''}
                            </span>
                            {tx.note && (
                              <>
                                <span>•</span>
                                <span className="italic text-[#858078] truncate max-w-xs">
                                  {tx.note}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Actions */}
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div
                          className={`font-mono-data text-sm font-bold tabular-nums ${
                            isIncome
                              ? 'text-[#059669]'
                              : isTransfer
                                ? 'text-[#9A7B2C]'
                                : 'text-[#111318]'
                          }`}
                        >
                          {isIncome ? '+' : isTransfer ? '' : '-'}
                          {formatINR(tx.amountMinor)}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenEditTx(tx)}
                            className="p-1 text-[#858078] hover:text-[#111318] hover:bg-[#F3EFEA] rounded transition-colors cursor-pointer"
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenDeleteTx(tx.id)}
                            className="p-1 text-[#858078] hover:text-[#E11D48] hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="Delete Transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
