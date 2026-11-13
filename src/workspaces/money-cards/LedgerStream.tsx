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
import { formatINR, todayISO } from '../../lib/format.ts';
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
      {/* 1. Account Context HUD (when an account is selected) OR Unified Ledger Banner */}
      {selectedAccount ? (
        <AccountContextHud
          account={selectedAccount}
          transactions={transactions}
          onClearSelection={onClearSelection}
          onOpenPayCard={onOpenPayCard}
          onOpenReconcileBank={onOpenReconcileBank}
          onOpenEditAccount={onOpenEditAccount}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Unified Financial Ledger</h3>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {filteredTransactions.length} records
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Streaming transactions across all active cards, banks, and cash accounts
              </div>
            </div>

            {/* Inflow vs Outflow Subtotals */}
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Inflow</span>
                <span className="text-emerald-700 font-bold">+{formatINR(streamTotalInflowMinor)}</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Outflow</span>
                <span className="text-rose-700 font-bold">-{formatINR(streamTotalOutflowMinor)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Search, Filter Pills & Transaction Action Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input & Kind Pills */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search party, category, or note..."
                className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Scope selector */}
            <select
              value={scopeFilter}
              onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
              className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Scopes</option>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
              <option value="family">Family</option>
            </select>

            {/* Kind Pills */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
              {(['all', 'expense', 'income', 'transfer'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKindChange(k)}
                  className={`px-2 py-1 rounded capitalize transition-all cursor-pointer ${
                    kindFilter === k
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
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
              onClick={() => onOpenAddTx('expense')}
              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Expense</span>
            </button>
            <button
              onClick={() => onOpenAddTx('income')}
              className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Income</span>
            </button>
            <button
              onClick={onExportCSV}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Export filtered transactions to CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Date Grouped Transactions Feed */}
      <div className="space-y-4">
        {groupedTransactions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 bg-white space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-700">No transactions found</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No records match your selected account or filters. Click &quot;Record Tx&quot; to add a new transaction.
            </p>
            <button
              onClick={() => onOpenAddTx('expense')}
              className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-500 transition-colors cursor-pointer"
            >
              + Add First Transaction
            </button>
          </div>
        ) : (
          groupedTransactions.map(([dateGroup, txList]) => (
            <div key={dateGroup} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {dateGroup === todayISO() ? 'Today' : dateGroup}
                </span>
                <span className="font-mono text-[11px] font-normal lowercase">
                  {txList.length} transaction{txList.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                {txList.map((tx) => {
                  const isIncome = tx.kind === 'income';
                  const isTransfer = tx.kind === 'transfer';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 group"
                    >
                      {/* Left: Direction Icon & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isIncome
                              ? 'bg-emerald-100 text-emerald-700'
                              : isTransfer
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-rose-50 text-rose-600'
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
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900 truncate">
                              {tx.party || tx.category}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
                              {tx.scope}
                            </span>
                            {tx.hasAttachment && (
                              <button
                                onClick={() => onViewAttachment(tx)}
                                className="text-indigo-600 hover:text-indigo-700 cursor-pointer"
                                title="View receipt attachment"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-medium text-slate-700">{tx.category}</span>
                            <span>•</span>
                            <span className="truncate">
                              {tx.accountName}
                              {isTransfer && tx.toAccountName ? ` → ${tx.toAccountName}` : ''}
                            </span>
                            {tx.note && (
                              <>
                                <span>•</span>
                                <span className="italic text-slate-400 truncate max-w-xs">{tx.note}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Hover Actions */}
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div
                          className={`font-mono text-sm font-bold ${
                            isIncome
                              ? 'text-emerald-700'
                              : isTransfer
                                ? 'text-blue-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {isIncome ? '+' : isTransfer ? '' : '-'}
                          {formatINR(tx.amountMinor)}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onOpenEditTx(tx)}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenDeleteTx(tx.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
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
