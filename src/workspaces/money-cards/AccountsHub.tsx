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
import { ScopeBadge } from '../../components/ui/Primitives.tsx';
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
    <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 space-y-3.5">
      {/* 1. Accounts Header & Workstation Layout Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="font-display text-sm font-bold text-[#111318] uppercase tracking-wider">
            Treasury Accounts
          </h3>
          <span className="text-xs font-mono-data font-semibold px-2 py-0.5 rounded-lg bg-[#F3EFEA] text-[#52504C] border border-[#EAE5DC]">
            {accounts.length} Liquid
          </span>
        </div>

        {/* Workstation Layout Switcher: Split Master-Detail vs Bento Grid */}
        <div className="flex items-center gap-1 bg-[#F3EFEA] p-0.5 rounded-xl border border-[#EAE5DC] text-xs">
          <button
            type="button"
            onClick={() => onLayoutChange('split')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
              workstationLayout === 'split'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs font-semibold'
                : 'text-[#52504C] hover:text-[#111318]'
            }`}
            title="Split Master-Detail View"
          >
            <Split className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('bento')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
              workstationLayout === 'bento'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs font-semibold'
                : 'text-[#52504C] hover:text-[#111318]'
            }`}
            title="Full Bento Portfolio Grid"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bento</span>
          </button>
        </div>
      </div>

      {/* 2. Search, Triage Radar Chips & Group Controls */}
      <div className="bento-card rounded-2xl p-3 space-y-2.5">
        {/* Instant Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#858078]" />
          <input
            type="text"
            value={accountSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={`Search ${accounts.length} bank & cash accounts...`}
            className="w-full h-8 pl-8 pr-7 text-xs bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl text-[#111318] placeholder:text-[#858078] focus:outline-none focus:border-[#111318] focus:bg-white"
          />
          {accountSearch && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#858078] hover:text-[#111318] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 1-Click Triage Radar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] no-scrollbar">
          <button
            type="button"
            onClick={() => onTriageChange('all')}
            className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition-all cursor-pointer ${
              triageFilter === 'all'
                ? 'bg-[#111318] text-[#FAF8F5] font-semibold'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            All Liquid ({accounts.length})
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('unreconciled')}
            className={`px-2.5 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'unreconciled'
                ? 'bg-[#059669] text-white font-semibold'
                : 'bg-emerald-50 text-[#059669] border border-emerald-200/80 hover:bg-emerald-100'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            Banks to Recon ({bankAccounts.length})
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('low_balance')}
            className={`px-2.5 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'low_balance'
                ? 'bg-[#C59B27] text-[#111318] font-semibold'
                : 'bg-amber-50 text-[#9A7B2C] border border-amber-200/80 hover:bg-amber-100'
            }`}
          >
            Safety Floor Check
          </button>
        </div>

        {/* Group Tabs & Sort Row */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#EAE5DC]">
          {/* Segmented Group Tabs (Liquid Only) */}
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#52504C]">
            {(['all', 'bank', 'wallet'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`px-2 py-0.5 rounded-lg capitalize transition-all cursor-pointer ${
                  accountTab === tab
                    ? 'bg-[#F3EFEA] text-[#111318] font-bold border border-[#EAE5DC]'
                    : 'hover:text-[#111318]'
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
          <div className="flex items-center gap-1 text-[11px] text-[#52504C]">
            <select
              value={accountSort}
              onChange={(e) => onSortChange(e.target.value as AccountSortOption)}
              className="bg-transparent font-medium text-[#111318] focus:outline-none cursor-pointer border-b border-dashed border-[#D6CFC2] pb-0.5"
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
        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
          selectedAccountId === null
            ? 'bg-[#111318] border-[#C59B27] text-[#FAF8F5] shadow-sm'
            : 'bg-white border-[#EAE5DC] text-[#111318] hover:bg-[#FAF8F5]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              selectedAccountId === null
                ? 'bg-[#C59B27]/20 text-[#E5C158] border border-[#C59B27]/40'
                : 'bg-[#F3EFEA] text-[#52504C]'
            }`}
          >
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4
              className={`text-xs font-bold leading-tight ${
                selectedAccountId === null ? 'text-[#FAF8F5]' : 'text-[#111318]'
              }`}
            >
              Consolidated Liquid Treasury
            </h4>
            <p
              className={`text-[10px] ${
                selectedAccountId === null ? 'text-white/65' : 'text-[#858078]'
              }`}
            >
              {accounts.length} Active Passbooks &amp; Wallets
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-bold font-mono-data tabular-nums ${
            selectedAccountId === null ? 'text-[#6EE7B7]' : 'text-[#059669]'
          }`}
        >
          {formatINR(totalLiquidMinor)}
        </span>
      </div>

      {/* 4. Scrollable Bounded High-Density Account Rows (Liquid Accounts Only) */}
      <div className="max-h-[500px] overflow-y-auto space-y-2 pr-0.5">
        {filteredAccounts.length === 0 ? (
          <div className="p-6 text-center rounded-2xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] text-xs text-[#858078]">
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
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                  isSelected
                    ? 'bg-[#FAF8F5] border-[#111318] shadow-xs ring-1 ring-[#C59B27]/40'
                    : 'bg-white border-[#EAE5DC] hover:border-[#D6CFC2] hover:bg-[#FAF8F5]/70'
                }`}
              >
                {/* Left: Icon & Identity */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border ${
                      isBank
                        ? 'bg-emerald-50 text-[#059669] border-emerald-200/80'
                        : 'bg-[#F3EFEA] text-[#9A7B2C] border-[#EAE5DC]'
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
                      <span className="font-bold text-[#111318] truncate max-w-[140px] sm:max-w-[170px]">
                        {acc.name}
                      </span>
                      {acc.last4 && (
                        <span className="font-mono-data text-[10px] text-[#858078] shrink-0">
                          ••{acc.last4}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-mono-data uppercase font-semibold text-[#52504C] tracking-wider">
                        {acc.institution || (isBank ? 'Bank' : 'Cash')}
                      </span>
                      <ScopeBadge scope={acc.scope} size="xs" />
                    </div>
                  </div>
                </div>

                {/* Right: Balance & Actions */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="font-mono-data font-bold leading-tight text-[#059669] tabular-nums">
                      {formatINR(balance)}
                    </div>
                    <div className="text-[10px] font-mono-data text-[#858078] uppercase">
                      {isBank ? 'Deposit' : 'Float'}
                    </div>
                  </div>

                  {/* Inline Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isBank && (
                      <button
                        type="button"
                        onClick={() => onOpenReconcileBank(acc)}
                        className="px-2 py-1 rounded-lg bg-[#F3EFEA] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] font-semibold text-[10px] border border-[#EAE5DC] transition-colors cursor-pointer"
                        title="Reconcile balance against bank passbook / statement"
                      >
                        Recon
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenEditAccount(acc)}
                      className="p-1.5 rounded-lg text-[#858078] hover:text-[#111318] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                      title="Edit Account Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
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
        <div className="bento-card rounded-2xl p-3.5 space-y-2.5 border-[#EAE5DC]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#111318]">
              <CreditCardIcon className="w-4 h-4 text-[#C59B27]" />
              <span>Connected Credit Cards</span>
            </div>
            <span className="text-xs font-mono-data font-bold text-[#111318] tabular-nums">
              {formatINR(totalCreditDebtMinor)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#52504C]">
            <span>{creditCards.length} Card{creditCards.length > 1 ? 's' : ''} Active</span>
            <span className="font-semibold text-[#059669]">
              {totalCreditDebtMinor === 0 ? 'Zero Outstanding' : 'Payable from Bank Reserve'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#EAE5DC]">
            {totalCreditDebtMinor > 0 && (
              <button
                type="button"
                onClick={() => onOpenPayCard(creditCards[0])}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Zap className="w-3 h-3 text-[#E5C158]" />
                <span>Settle Card Bill</span>
              </button>
            )}
            {onNavigateToCards && (
              <button
                type="button"
                onClick={onNavigateToCards}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span>Cards Hub</span>
                <ArrowRight className="w-3 h-3 text-[#C59B27]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. Quick Drawer Shortcuts */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EAE5DC]">
        <button
          type="button"
          onClick={onOpenRecurringModal}
          className="p-2.5 rounded-xl border border-[#EAE5DC] bg-white hover:bg-[#FAF8F5] text-[#111318] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-[#C59B27]" />
            Recurring
          </span>
          <span className="font-mono-data text-[11px] text-[#858078]">({recurringBills.length})</span>
        </button>

        <button
          type="button"
          onClick={onOpenInvestmentsModal}
          className="p-2.5 rounded-xl border border-[#EAE5DC] bg-white hover:bg-[#FAF8F5] text-[#111318] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5 text-[#059669]" />
            Investments
          </span>
          <span className="font-mono-data text-[11px] text-[#858078]">Assets</span>
        </button>
      </div>
    </div>
  );
}
