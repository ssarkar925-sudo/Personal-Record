import {
  AlertTriangle,
  Building2,
  Clock,
  CreditCard as CreditCardIcon,
  Edit2,
  Layers,
  LayoutGrid,
  PiggyBank,
  RefreshCw,
  Repeat,
  Search,
  Split,
  Wallet,
  X,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { AccountRecord, RecurringBillRecord } from '../../lib/api.ts';
import type {
  AccountGroupTab,
  AccountSortOption,
  TriageFilter,
  WorkstationLayout,
} from './types.ts';

export interface AccountsHubProps {
  accounts: AccountRecord[];
  filteredAccounts: AccountRecord[];
  creditCards: AccountRecord[];
  bankAccounts: AccountRecord[];
  walletAccounts: AccountRecord[];
  recurringBills: RecurringBillRecord[];
  totalLiquidMinor: number;
  selectedAccountId: string | null;
  accountSearch: string;
  accountTab: AccountGroupTab;
  accountSort: AccountSortOption;
  triageFilter: TriageFilter;
  workstationLayout: WorkstationLayout;
  urgentDueCards: AccountRecord[];
  highUtilCards: AccountRecord[];
  onSelectAccount: (id: string | null) => void;
  onSearchChange: (val: string) => void;
  onTabChange: (tab: AccountGroupTab) => void;
  onSortChange: (sort: AccountSortOption) => void;
  onTriageChange: (triage: TriageFilter) => void;
  onLayoutChange: (layout: WorkstationLayout) => void;
  onOpenPayCard: (card: AccountRecord) => void;
  onOpenReconcileBank: (bank: AccountRecord) => void;
  onOpenEditAccount: (acc: AccountRecord) => void;
  onOpenRecurringModal: () => void;
  onOpenInvestmentsModal: () => void;
}

export function AccountsHub({
  accounts,
  filteredAccounts,
  creditCards,
  bankAccounts,
  walletAccounts,
  recurringBills,
  totalLiquidMinor,
  selectedAccountId,
  accountSearch,
  accountTab,
  accountSort,
  triageFilter,
  workstationLayout,
  urgentDueCards,
  highUtilCards,
  onSelectAccount,
  onSearchChange,
  onTabChange,
  onSortChange,
  onTriageChange,
  onLayoutChange,
  onOpenPayCard,
  onOpenReconcileBank,
  onOpenEditAccount,
  onOpenRecurringModal,
  onOpenInvestmentsModal,
}: AccountsHubProps) {
  const currentDayOfMonth = new Date().getDate();

  return (
    <div className="w-full lg:w-[410px] xl:w-[450px] shrink-0 space-y-3.5">
      {/* 1. Accounts Header & Workstation Layout Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Accounts Hub
          </h3>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {accounts.length} Total
          </span>
        </div>

        {/* Workstation Layout Switcher: Split Master-Detail vs Bento Grid */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => onLayoutChange('split')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all cursor-pointer ${
              workstationLayout === 'split'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            title="Split Master-Detail View"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('bento')}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-all cursor-pointer ${
              workstationLayout === 'bento'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            title="Full Bento Portfolio Grid"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bento</span>
          </button>
        </div>
      </div>

      {/* 2. Search, Triage Radar Chips & Group Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
        {/* Instant Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={accountSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={`Search ${accounts.length} accounts by name, bank, last4...`}
            className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
          />
          {accountSearch && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 1-Click Triage Radar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
          <button
            type="button"
            onClick={() => onTriageChange('all')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium transition-all cursor-pointer ${
              triageFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({accounts.length})
          </button>

          {urgentDueCards.length > 0 && (
            <button
              type="button"
              onClick={() => onTriageChange('due_soon')}
              className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
                triageFilter === 'due_soon'
                  ? 'bg-amber-600 text-white shadow-2xs font-bold'
                  : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3 h-3" />
              Due in 7d ({urgentDueCards.length})
            </button>
          )}

          {highUtilCards.length > 0 && (
            <button
              type="button"
              onClick={() => onTriageChange('high_utilization')}
              className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
                triageFilter === 'high_utilization'
                  ? 'bg-rose-600 text-white shadow-2xs font-bold'
                  : 'bg-rose-50 text-rose-800 border border-rose-200/80 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              Util &gt;30% ({highUtilCards.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => onTriageChange('unreconciled')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'unreconciled'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'bg-blue-50 text-blue-800 border border-blue-200/80 hover:bg-blue-100'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            Banks ({bankAccounts.length})
          </button>
        </div>

        {/* Group Tabs & Sort Row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          {/* Segmented Group Tabs */}
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            {(['all', 'credit_card', 'bank', 'wallet'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`px-2 py-0.5 rounded capitalize transition-all cursor-pointer ${
                  accountTab === tab
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                {tab === 'all'
                  ? 'All'
                  : tab === 'credit_card'
                    ? `Cards (${creditCards.length})`
                    : tab === 'bank'
                      ? `Banks (${bankAccounts.length})`
                      : `Cash (${walletAccounts.length})`}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <select
              value={accountSort}
              onChange={(e) => onSortChange(e.target.value as AccountSortOption)}
              className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer border-b border-dashed border-slate-300 pb-0.5"
            >
              <option value="due_date">Due Soonest</option>
              <option value="balance_desc">Highest Balance</option>
              <option value="balance_asc">Lowest Balance</option>
              <option value="utilization">Highest Util %</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Entire Portfolio Item */}
      <div
        onClick={() => onSelectAccount(null)}
        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
          selectedAccountId === null
            ? 'bg-emerald-50/80 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
            : 'bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              selectedAccountId === null ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold leading-tight text-slate-900">Entire Portfolio (All Accounts)</h4>
            <p className="text-[10px] text-slate-500">
              {accounts.length} Accounts Active
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold font-mono text-emerald-700">
          {formatINR(totalLiquidMinor)}
        </span>
      </div>

      {/* 4. Scrollable Bounded High-Density Account Rows */}
      <div className="max-h-[540px] overflow-y-auto space-y-1.5 pr-0.5">
        {filteredAccounts.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-500">
            No accounts matching your triage or search filters.
          </div>
        ) : (
          filteredAccounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            const isCard = acc.accountGroup === 'credit_card';
            const balance = acc.currentBalanceMinor || 0;
            const outstanding = Math.abs(balance);
            const limit = acc.creditLimitMinor || 1;
            const utilPct = isCard ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;
            const isDueSoon = isCard && outstanding > 0 && Math.abs((acc.dueDay || 5) - currentDayOfMonth) <= 5;

            return (
              <div
                key={acc.id}
                onClick={() => onSelectAccount(isSelected ? null : acc.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-600 shadow-xs ring-1 ring-indigo-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                {/* Left: Icon & Identity */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      isCard
                        ? 'bg-indigo-100 text-indigo-700'
                        : acc.accountGroup === 'bank'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {isCard ? (
                      <CreditCardIcon className="w-4 h-4" />
                    ) : acc.accountGroup === 'bank' ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 leading-tight">
                      <span className="font-semibold text-slate-900 truncate max-w-[140px] sm:max-w-[170px]">
                        {acc.name}
                      </span>
                      {acc.last4 && (
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          ••{acc.last4}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        {acc.institution || acc.accountGroup}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {acc.scope}
                      </span>
                      {isCard && (
                        <span
                          className={`text-[9px] font-mono px-1 rounded ${
                            utilPct > 50
                              ? 'bg-rose-100 text-rose-700'
                              : utilPct > 30
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {utilPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Balance & Actions */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div
                      className={`font-mono font-bold leading-tight ${
                        isCard ? 'text-slate-900' : 'text-emerald-700'
                      }`}
                    >
                      {formatINR(balance)}
                    </div>

                    {isCard ? (
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {isDueSoon && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        )}
                        <span
                          className={`text-[10px] font-medium ${
                            isDueSoon ? 'text-amber-700 font-bold' : 'text-slate-400'
                          }`}
                        >
                          Due {acc.dueDay || 5}th
                        </span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400">Deposit</div>
                    )}
                  </div>

                  {/* Inline Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isCard ? (
                      <button
                        onClick={() => onOpenPayCard(acc)}
                        className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] transition-colors cursor-pointer"
                        title="Reconcile & Pay Bill"
                      >
                        Pay
                      </button>
                    ) : acc.accountGroup === 'bank' ? (
                      <button
                        onClick={() => onOpenReconcileBank(acc)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] border border-slate-300 transition-colors cursor-pointer"
                        title="Reconcile balance against passbook"
                      >
                        Recon
                      </button>
                    ) : null}

                    <button
                      onClick={() => onOpenEditAccount(acc)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit Account Details"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Quick Drawer Shortcuts */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
        <button
          onClick={onOpenRecurringModal}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-between shadow-2xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-indigo-600" />
            Recurring
          </span>
          <span className="font-mono text-[11px] text-slate-400">({recurringBills.length})</span>
        </button>

        <button
          onClick={onOpenInvestmentsModal}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-between shadow-2xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5 text-emerald-600" />
            Investments
          </span>
          <span className="font-mono text-[11px] text-slate-400">Assets</span>
        </button>
      </div>
    </div>
  );
}
