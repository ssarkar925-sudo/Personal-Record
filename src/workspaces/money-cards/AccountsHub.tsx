import {
  ArrowRight,
  Building2,
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
  Zap,
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
  accounts: AccountRecord[]; // Liquid accounts only (banks + wallets)
  filteredAccounts: AccountRecord[];
  creditCards: AccountRecord[];
  bankAccounts: AccountRecord[];
  walletAccounts: AccountRecord[];
  recurringBills: RecurringBillRecord[];
  totalLiquidMinor: number;
  totalCreditDebtMinor: number;
  selectedAccountId: string | null;
  accountSearch: string;
  accountTab: AccountGroupTab;
  accountSort: AccountSortOption;
  triageFilter: TriageFilter;
  workstationLayout: WorkstationLayout;
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
  onNavigateToCards?: () => void;
}

export function AccountsHub({
  accounts,
  filteredAccounts,
  creditCards,
  bankAccounts,
  walletAccounts,
  recurringBills,
  totalLiquidMinor,
  totalCreditDebtMinor,
  selectedAccountId,
  accountSearch,
  accountTab,
  accountSort,
  triageFilter,
  workstationLayout,
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
  onNavigateToCards,
}: AccountsHubProps) {
  return (
    <div className="w-full lg:w-[410px] xl:w-[450px] shrink-0 space-y-3.5">
      {/* 1. Accounts Header & Workstation Layout Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Bank & Cash Hub
          </h3>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {accounts.length} Liquid
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
            placeholder={`Search ${accounts.length} bank & cash accounts...`}
            className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
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
            All Liquid ({accounts.length})
          </button>

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
            Banks to Recon ({bankAccounts.length})
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('low_balance')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'low_balance'
                ? 'bg-amber-600 text-white shadow-2xs font-bold'
                : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
            }`}
          >
            Low Bal (&lt;₹5k)
          </button>
        </div>

        {/* Group Tabs & Sort Row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          {/* Segmented Group Tabs (Liquid Only) */}
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            {(['all', 'bank', 'wallet'] as const).map((tab) => (
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
                  ? 'All Liquid'
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
              <option value="balance_desc">Highest Balance</option>
              <option value="balance_asc">Lowest Balance</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Entire Liquid Portfolio Header */}
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
            <h4 className="text-xs font-bold leading-tight text-slate-900">Total Liquid Funds (Banks & Cash)</h4>
            <p className="text-[10px] text-slate-500">
              {accounts.length} Liquid Accounts Active
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold font-mono text-emerald-700">
          {formatINR(totalLiquidMinor)}
        </span>
      </div>

      {/* 4. Scrollable Bounded High-Density Account Rows (Liquid Accounts Only) */}
      <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-0.5">
        {filteredAccounts.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-500">
            No bank or cash accounts matching your search or filters.
          </div>
        ) : (
          filteredAccounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            const isBank = acc.accountGroup === 'bank';
            const balance = acc.currentBalanceMinor || 0;

            return (
              <div
                key={acc.id}
                onClick={() => onSelectAccount(isSelected ? null : acc.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                  isSelected
                    ? 'bg-emerald-50/80 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                {/* Left: Icon & Identity */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      isBank
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {isBank ? (
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
                        {acc.institution || (isBank ? 'Bank' : 'Cash')}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {acc.scope}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Balance & Actions */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="font-mono font-bold leading-tight text-emerald-700">
                      {formatINR(balance)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {isBank ? 'Deposit' : 'Cash'}
                    </div>
                  </div>

                  {/* Inline Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isBank && (
                      <button
                        onClick={() => onOpenReconcileBank(acc)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] border border-slate-300 transition-colors cursor-pointer"
                        title="Reconcile balance against bank passbook / statement"
                      >
                        Recon
                      </button>
                    )}

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

      {/* 5. Connected Credit Cards Liability Bridge */}
      {creditCards.length > 0 && (
        <div className="rounded-2xl border border-blue-200/90 bg-blue-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <CreditCardIcon className="w-4 h-4 text-blue-600" />
              <span>Connected Credit Cards</span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-900">
              {formatINR(totalCreditDebtMinor)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>{creditCards.length} Card{creditCards.length > 1 ? 's' : ''} Active</span>
            <span className="font-semibold text-emerald-700">
              {totalCreditDebtMinor === 0 ? 'Zero Outstanding' : 'Payable from Bank Balance'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1.5 border-t border-blue-200/60">
            {totalCreditDebtMinor > 0 && (
              <button
                type="button"
                onClick={() => onOpenPayCard(creditCards[0])}
                className="flex-1 py-1 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
              >
                <Zap className="w-3 h-3" />
                <span>Settle Card Bill</span>
              </button>
            )}
            {onNavigateToCards && (
              <button
                type="button"
                onClick={onNavigateToCards}
                className="flex-1 py-1 px-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span>Cards Hub</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. Quick Drawer Shortcuts */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
        <button
          onClick={onOpenRecurringModal}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-between shadow-2xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-blue-600" />
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
