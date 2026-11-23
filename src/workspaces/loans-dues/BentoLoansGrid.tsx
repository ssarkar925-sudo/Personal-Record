import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  LayoutGrid,
  List,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Split,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { buildWhatsAppLink, formatINR } from '../../lib/format.ts';
import type {
  LoanRecord,
  PersonDueRecord,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type {
  LoansDuesSortOption,
  LoansTab,
  LoansTriageFilter,
  SelectedLoansItem,
} from './types.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import { resolveLoanCardTheme } from './loansDuesAnalytics.ts';

export interface BentoLoansGridProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  goals: SavingsGoalRecord[];
  selectedItem?: SelectedLoansItem;
  searchQuery?: string;
  activeTab?: LoansTab;
  triageFilter?: LoansTriageFilter;
  sortOption?: LoansDuesSortOption;
  scopeFilter?: Scope | 'all';
  urgentDueCount?: number;
  totalYouOweCount?: number;
  totalOwedToYouCount?: number;
  onSearchChange?: (q: string) => void;
  onTabChange?: (tab: LoansTab) => void;
  onTriageChange?: (triage: LoansTriageFilter) => void;
  onSortChange?: (sort: LoansDuesSortOption) => void;
  onScopeChange?: (scope: Scope | 'all') => void;
  onSelectItem?: (item: SelectedLoansItem) => void;
  onSelectAndSwitchToSplit: (item: SelectedLoansItem) => void;
  onOpenAddLoan: () => void;
  onOpenAddDue: () => void;
  onOpenAddGoal?: () => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenEditLoan: (loan: LoanRecord) => void;
  onOpenEditDue: (due: PersonDueRecord) => void;
  onOpenContributeGoal: (goal: SavingsGoalRecord) => void;
  onOpenDeleteConfirm: (kind: 'loan' | 'due' | 'goal', id: string, label: string) => void;
  onSwitchToSplit: () => void;
}

function TiltMetallicTile({
  children,
  background,
  border,
  isSelected,
  onClick,
}: {
  children: React.ReactNode;
  background: string;
  border: string;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setTilt({
      rx: (0.5 - py) * 10,
      ry: (px - 0.5) * 12,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative rounded-2xl p-4.5 text-[#111318] cursor-pointer select-none transition-all duration-200 overflow-hidden flex flex-col justify-between space-y-3.5 shadow-[0_8px_24px_rgba(17,19,24,0.06)] hover:shadow-[0_12px_28px_rgba(17,19,24,0.10)] ${
        isSelected ? 'ring-2 ring-[#C59B27] ring-offset-2 ring-offset-[#FAF8F5]' : ''
      }`}
      style={{
        background,
        border: `1px solid ${border}`,
        transform: `perspective(900px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: tilt.active ? 0.35 : 0.12,
          background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.7), transparent 62%)`,
        }}
      />
      <div className="relative z-10 flex flex-col justify-between h-full space-y-3.5">
        {children}
      </div>
    </div>
  );
}

export function BentoLoansGrid({
  loans = [],
  dues = [],
  goals = [],
  selectedItem,
  searchQuery = '',
  activeTab = 'all',
  triageFilter = 'all',
  sortOption = 'remaining_desc',
  scopeFilter = 'all',
  urgentDueCount = 0,
  totalYouOweCount = 0,
  totalOwedToYouCount = 0,
  onSearchChange,
  onTabChange,
  onTriageChange,
  onSortChange,
  onScopeChange,
  onSelectItem,
  onSelectAndSwitchToSplit,
  onOpenAddLoan,
  onOpenAddDue,
  onOpenAddGoal,
  onOpenPayEmi,
  onOpenSettleDue,
  onOpenEditLoan,
  onOpenEditDue,
  onOpenContributeGoal,
  onOpenDeleteConfirm,
  onSwitchToSplit,
}: BentoLoansGridProps) {
  const totalCount = (loans || []).length + (dues || []).length + (goals || []).length;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('sc_loans_view_mode') as 'grid' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('sc_loans_view_mode', mode);
    } catch {}
  };

  const handleSelect = (item: SelectedLoansItem) => {
    if (onSelectItem) onSelectItem(item);
    else onSelectAndSwitchToSplit(item);
  };

  return (
    <div className="space-y-5">
      {/* 1. Unified Command & Triage Filter Header */}
      <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 shadow-[0_8px_24px_rgba(17,19,24,0.03)] space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#C59B27] font-bold">
                3D METALLIC COVENANT & KHATABOOK DECK
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#111318] border border-[#E6E1D6]">
                {totalCount} Active Cards
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-[#111318] mt-0.5">
              Loans, EMIs, Khatabook Dues & Sovereign Reserves
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            {onSearchChange && (
              <div className="relative min-w-[210px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#52504C]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search loans, people, notes..."
                  className="w-full h-8 pl-8 pr-7 text-xs bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl text-[#111318] placeholder:text-[#52504C]/70 focus:outline-none focus:border-[#C59B27]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52504C] hover:text-[#111318]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Scope Filter (All Scopes -> Business -> Personal -> Family) */}
            {onScopeChange && (
              <select
                value={scopeFilter}
                onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
                className="h-8 px-2.5 text-xs bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl text-[#111318] font-semibold focus:outline-none focus:border-[#C59B27] cursor-pointer"
              >
                <option value="all">All Scopes</option>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </select>
            )}

            {/* Sort Selector */}
            {onSortChange && (
              <select
                value={sortOption}
                onChange={(e) => onSortChange(e.target.value as LoansDuesSortOption)}
                className="h-8 px-2.5 text-xs bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl text-[#111318] font-semibold focus:outline-none focus:border-[#C59B27] cursor-pointer"
              >
                <option value="remaining_desc">Sort: Highest Balance</option>
                <option value="remaining_asc">Sort: Lowest Balance</option>
                <option value="next_due">Sort: Due Date</option>
                <option value="name_asc">Sort: Name (A–Z)</option>
              </select>
            )}

            {/* View Mode Switcher: Grid View vs List View */}
            <div className="inline-flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6]">
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                    : 'text-[#52504C] hover:text-[#111318]'
                }`}
                title="Grid View (Executive Cards)"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>Grid View</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                    : 'text-[#52504C] hover:text-[#111318]'
                }`}
                title="List View (Data Table)"
              >
                <List className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>List View</span>
              </button>
              {onSwitchToSplit && (
                <button
                  type="button"
                  onClick={onSwitchToSplit}
                  className="px-2 py-1 rounded-lg text-[#52504C] hover:text-[#111318] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Split Inspector View"
                >
                  <Split className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Split</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Triage Filter Chips + Category Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E6E1D6]/70">
          {onTriageChange && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs scrollbar-none">
              <button
                type="button"
                onClick={() => onTriageChange('all')}
                className={`px-2.5 py-1 rounded-xl font-semibold transition-all cursor-pointer ${
                  triageFilter === 'all'
                    ? 'bg-[#111318] text-[#FAF8F5]'
                    : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                }`}
              >
                All ({totalCount})
              </button>
              {urgentDueCount > 0 && (
                <button
                  type="button"
                  onClick={() => onTriageChange('due_soon')}
                  className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    triageFilter === 'due_soon'
                      ? 'bg-[#D97706] text-white'
                      : 'bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/25'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Due in 7d ({urgentDueCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onTriageChange('you_owe')}
                className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  triageFilter === 'you_owe'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#E11D48]/10 text-[#E11D48] border border-[#E11D48]/25'
                }`}
              >
                <ArrowUpRight className="w-3 h-3" />
                <span>You Owe ({totalYouOweCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onTriageChange('you_are_owed')}
                className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  triageFilter === 'you_are_owed'
                    ? 'bg-[#059669] text-white'
                    : 'bg-[#059669]/10 text-[#059669] border border-[#059669]/25'
                }`}
              >
                <ArrowDownLeft className="w-3 h-3" />
                <span>Owed to You ({totalOwedToYouCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onTriageChange('bank_loans')}
                className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  triageFilter === 'bank_loans'
                    ? 'bg-[#111318] text-[#E5C158]'
                    : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                }`}
              >
                <Landmark className="w-3 h-3" />
                <span>Bank Loans ({loans.length})</span>
              </button>
              <button
                type="button"
                onClick={() => onTriageChange('settled')}
                className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  triageFilter === 'settled'
                    ? 'bg-[#111318] text-white'
                    : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Settled</span>
              </button>
            </div>
          )}

          {onTabChange && (
            <div className="inline-flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6] text-xs font-semibold">
              {(
                [
                  ['all', `All (${totalCount})`],
                  ['loans', `Loans (${loans.length})`],
                  ['dues', `People (${dues.length})`],
                  ['goals', `Goals (${goals.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTabChange(key)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    activeTab === key
                      ? 'bg-white text-[#111318] font-bold shadow-2xs'
                      : 'text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. 3D Metallic Bank Loans Grid */}
      {(activeTab === 'all' || activeTab === 'loans') && loans.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#C59B27]" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#111318]">
                Bank Loans & Institutional Credit ({loans.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={onOpenAddLoan}
              className="text-xs font-semibold text-[#111318] hover:text-[#C59B27] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Loan</span>
            </button>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {loans.map((loan) => {
                const paidMinor = Math.max(0, loan.principalMinor - loan.remainingMinor);
                const clearedPct =
                  loan.principalMinor > 0
                    ? Math.min(100, Math.round((paidMinor / loan.principalMinor) * 100))
                    : 100;
                const isClosed = loan.status === 'closed';
                const isLent = loan.direction === 'lent';
                const theme = resolveLoanCardTheme({ kind: 'loan', data: loan }, 'auto');
                const isSelected = selectedItem?.kind === 'loan' && selectedItem.data.id === loan.id;

                return (
                  <TiltMetallicTile
                    key={`bento-loan-${loan.id}`}
                    background={theme.background}
                    border={theme.border}
                    isSelected={isSelected}
                    onClick={() => handleSelect({ kind: 'loan', data: loan })}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0"
                            style={{
                              background: 'linear-gradient(135deg, #F5D97E 0%, #C59B27 55%, #8F6B14 100%)',
                              borderColor: 'rgba(17,19,24,0.15)',
                            }}
                          >
                            <Landmark className="w-4 h-4 text-[#111318]" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-display font-bold text-sm text-[#111318] truncate">
                              {loan.name}
                            </h4>
                            <span className="text-[11px] text-[#52504C] font-medium block truncate">
                              {loan.counterparty} · {loan.scope.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <span
                          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border shrink-0"
                          style={{
                            backgroundColor: theme.badgeBg,
                            color: theme.badgeText,
                            borderColor: theme.border,
                          }}
                        >
                          {isClosed ? 'Closed' : isLent ? 'Lent Asset' : 'EMI Loan'}
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-[#52504C] tracking-wide">
                            Remaining Principal
                          </div>
                          <div className="text-xl sm:text-2xl font-black font-mono-data tabular-nums text-[#111318] mt-0.5">
                            {formatINR(loan.remainingMinor)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-[#52504C] tracking-wide">
                            Monthly EMI
                          </div>
                          <div
                            className="text-sm sm:text-base font-bold font-mono-data tabular-nums mt-0.5"
                            style={{ color: theme.accentText }}
                          >
                            {formatINR(loan.emiMinor)}
                          </div>
                        </div>
                      </div>

                      <div className="w-full bg-[#111318]/10 h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, clearedPct)}%`,
                            backgroundColor: theme.progressColor,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono font-medium text-[#52504C] mt-1.5">
                        <span>{clearedPct}% cleared</span>
                        <span>Next: {loan.nextDueDate}</span>
                      </div>
                    </div>

                    <div
                      className="pt-2.5 border-t border-[#111318]/10 flex items-center justify-between text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] font-mono font-medium text-[#52504C]">
                        {(loan.annualRateBps / 100).toFixed(2)}% APR · {loan.tenureMonths}M
                      </span>
                      <div className="flex items-center gap-1.5">
                        {!isClosed && (
                          <button
                            type="button"
                            onClick={() => onOpenPayEmi(loan)}
                            className="px-2.5 py-1 rounded-xl bg-[#111318] hover:bg-[#252830] text-[#E5C158] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                          >
                            Pay EMI
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenEditLoan(loan)}
                          className="px-2 py-1 rounded-lg text-[#52504C] hover:text-[#111318] hover:bg-[#111318]/8 border border-[#111318]/15 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                          title="Edit Loan"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                          className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                          title="Delete Loan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </TiltMetallicTile>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E6E1D6] bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-[#111318]">
                <thead className="bg-[#FAF8F5] border-b border-[#E6E1D6] text-[10px] uppercase font-bold text-[#52504C] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Loan / Counterparty</th>
                    <th className="py-2.5 px-3">Scope & Type</th>
                    <th className="py-2.5 px-3 text-right">Remaining Principal</th>
                    <th className="py-2.5 px-3 text-right">Monthly EMI</th>
                    <th className="py-2.5 px-3">Next Due & APR</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E1D6]/70">
                  {loans.map((loan) => {
                    const isSelected = selectedItem?.kind === 'loan' && selectedItem.data.id === loan.id;
                    const isClosed = loan.status === 'closed';
                    return (
                      <tr
                        key={`list-loan-${loan.id}`}
                        onClick={() => handleSelect({ kind: 'loan', data: loan })}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F9F5EC]' : 'hover:bg-[#FAF8F5]'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#111318]">{loan.name}</div>
                          <div className="text-[11px] text-[#52504C]">{loan.counterparty}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase bg-[#F3EFEA] text-[#111318] border border-[#E6E1D6]">
                            {loan.scope} · {isClosed ? 'Closed' : loan.direction === 'lent' ? 'Lent' : 'Borrow'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-[#111318]">
                          {formatINR(loan.remainingMinor)}
                          <div className="text-[10px] text-[#52504C] font-normal">of {formatINR(loan.principalMinor)}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#8C6D1F]">
                          {formatINR(loan.emiMinor)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-[11px] font-medium">{loan.nextDueDate}</div>
                          <div className="text-[10px] text-[#52504C]">{(loan.annualRateBps / 100).toFixed(2)}% APR · {loan.tenureMonths}M</div>
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {!isClosed && (
                              <button
                                type="button"
                                onClick={() => onOpenPayEmi(loan)}
                                className="px-2.5 py-1 rounded-lg bg-[#111318] hover:bg-[#252830] text-[#E5C158] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              >
                                Pay EMI
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenEditLoan(loan)}
                              className="px-2 py-1 rounded-lg text-[#52504C] hover:text-[#111318] hover:bg-[#111318]/8 border border-[#111318]/15 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                              title="Edit Loan"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                              className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              title="Delete Loan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. 3D Metallic Khatabook People Dues Grid */}
      {(activeTab === 'all' || activeTab === 'dues') && dues.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#059669]" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#111318]">
                People Khatabook & Udhar Ledger ({dues.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={onOpenAddDue}
              className="text-xs font-semibold text-[#059669] hover:text-[#047857] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Person Due</span>
            </button>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dues.map((due) => {
                const isNeed = due.direction === 'need';
                const isSettled = due.status === 'settled';
                const theme = resolveLoanCardTheme({ kind: 'due', data: due }, 'auto');
                const isSelected = selectedItem?.kind === 'due' && selectedItem.data.id === due.id;
                const whatsappLink = buildWhatsAppLink(
                  due.phone,
                  `Hi ${due.personName}, gentle reminder regarding pending balance of ${formatINR(due.remainingMinor)}.`,
                );

                return (
                  <TiltMetallicTile
                    key={`bento-due-${due.id}`}
                    background={theme.background}
                    border={theme.border}
                    isSelected={isSelected}
                    onClick={() => handleSelect({ kind: 'due', data: due })}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: theme.badgeBg,
                              borderColor: theme.border,
                            }}
                          >
                            <Users className="w-4 h-4" style={{ color: theme.accentText }} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-display font-bold text-sm text-[#111318] truncate">
                              {due.personName}
                            </h4>
                            <span className="text-[11px] text-[#52504C] font-medium block truncate">
                              {due.phone ? `${due.phone} · ` : ''}{due.scope.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <span
                          className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border shrink-0"
                          style={{
                            backgroundColor: theme.badgeBg,
                            color: theme.badgeText,
                            borderColor: theme.border,
                          }}
                        >
                          {isSettled ? 'Settled' : isNeed ? 'Owed to You' : 'You Owe'}
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-[#52504C] tracking-wide">
                            {isNeed ? 'Receivable Balance' : 'Payable Balance'}
                          </div>
                          <div className="text-xl sm:text-2xl font-black font-mono-data tabular-nums text-[#111318] mt-0.5">
                            {formatINR(due.remainingMinor)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-[#52504C]">
                            Initial: {formatINR(due.amountMinor)}
                          </div>
                          <div
                            className="text-[11px] font-mono font-bold mt-0.5"
                            style={{ color: theme.accentText }}
                          >
                            {due.dueDate ? `Due ${due.dueDate}` : 'Flexible'}
                          </div>
                        </div>
                      </div>

                      {due.note && (
                        <p className="text-[11px] text-[#52504C] italic mt-2.5 truncate bg-[#111318]/5 px-2 py-1 rounded-md border border-[#111318]/10">
                          "{due.note}"
                        </p>
                      )}
                    </div>

                    <div
                      className="pt-2.5 border-t border-[#111318]/10 flex items-center justify-between text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div>
                        {isNeed && !isSettled && due.phone ? (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#059669]/10 hover:bg-[#059669]/20 text-[#047857] border border-[#059669]/25 text-[11px] font-bold transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp Nudge</span>
                          </a>
                        ) : (
                          <span className="text-[10px] font-mono uppercase font-semibold text-[#52504C]">
                            Scope: {due.scope}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isSettled && (
                          <button
                            type="button"
                            onClick={() => onOpenSettleDue(due)}
                            className="px-2.5 py-1 rounded-xl bg-[#111318] text-[#FAF8F5] hover:bg-[#252830] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                          >
                            Settle
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenEditDue(due)}
                          className="px-2 py-1 rounded-lg text-[#52504C] hover:text-[#111318] hover:bg-[#111318]/8 border border-[#111318]/15 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                          title="Edit Due"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDeleteConfirm('due', due.id, due.personName)}
                          className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                          title="Delete Due"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </TiltMetallicTile>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E6E1D6] bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-[#111318]">
                <thead className="bg-[#FAF8F5] border-b border-[#E6E1D6] text-[10px] uppercase font-bold text-[#52504C] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Person / Party</th>
                    <th className="py-2.5 px-3">Direction</th>
                    <th className="py-2.5 px-3">Scope</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3">Due Date / Note</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E1D6]/70">
                  {dues.map((due) => {
                    const isNeed = due.direction === 'need';
                    const isSettled = due.status === 'settled';
                    const isSelected = selectedItem?.kind === 'due' && selectedItem.data.id === due.id;
                    const whatsappLink = buildWhatsAppLink(
                      due.phone,
                      `Hi ${due.personName}, gentle reminder regarding pending balance of ${formatINR(due.remainingMinor)}.`,
                    );

                    return (
                      <tr
                        key={`list-due-${due.id}`}
                        onClick={() => handleSelect({ kind: 'due', data: due })}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F9F5EC]' : 'hover:bg-[#FAF8F5]'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#111318]">{due.personName}</div>
                          {due.phone && <div className="text-[11px] text-[#52504C] font-mono">{due.phone}</div>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border shrink-0 ${
                              isSettled
                                ? 'bg-[#F3EFEA] text-[#52504C] border-[#E6E1D6]'
                                : isNeed
                                ? 'bg-[#E0F2E9] text-[#065F46] border-[#C3E7D3]'
                                : 'bg-[#FFE4E6] text-[#9F1239] border-[#FBCFE8]'
                            }`}
                          >
                            {isSettled ? 'Settled' : isNeed ? 'Owed to You' : 'You Owe'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] font-mono uppercase text-[#52504C] font-semibold">
                            {due.scope}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-sm">
                          <span
                            className={
                              isSettled
                                ? 'text-[#52504C] line-through'
                                : isNeed
                                ? 'text-[#059669]'
                                : 'text-[#E11D48]'
                            }
                          >
                            {formatINR(due.remainingMinor)}
                          </span>
                          <div className="text-[10px] text-[#52504C] font-normal font-sans">
                            Initial: {formatINR(due.amountMinor)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-[11px] font-medium text-[#111318]">
                            {due.dueDate ? `Due ${due.dueDate}` : 'Flexible'}
                          </div>
                          {due.note && (
                            <div className="text-[11px] text-[#52504C] italic truncate max-w-[200px]">
                              "{due.note}"
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {isNeed && !isSettled && due.phone && (
                              <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#059669]/10 hover:bg-[#059669]/20 text-[#047857] border border-[#059669]/25 text-[11px] font-bold transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </a>
                            )}
                            {!isSettled && (
                              <button
                                type="button"
                                onClick={() => onOpenSettleDue(due)}
                                className="px-2.5 py-1 rounded-xl bg-[#111318] text-[#FAF8F5] hover:bg-[#252830] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                              >
                                Settle
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenEditDue(due)}
                              className="px-2 py-1 rounded-lg text-[#52504C] hover:text-[#111318] hover:bg-[#111318]/8 border border-[#111318]/15 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                              title="Edit Due"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenDeleteConfirm('due', due.id, due.personName)}
                              className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              title="Delete Due"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. 3D Metallic Sovereign Savings Goals Grid */}
      {(activeTab === 'all' || activeTab === 'goals') && goals.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#C59B27]" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#111318]">
                Sovereign Goals & Tax Reserves ({goals.length})
              </h4>
            </div>
            {onOpenAddGoal && (
              <button
                type="button"
                onClick={onOpenAddGoal}
                className="text-xs font-semibold text-[#111318] hover:text-[#C59B27] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Goal</span>
              </button>
            )}
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {goals.map((g) => {
                const pct =
                  g.targetMinor > 0
                    ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100))
                    : 0;
                const theme = resolveLoanCardTheme({ kind: 'goal', data: g }, 'auto');
                const isSelected = selectedItem?.kind === 'goal' && selectedItem.data.id === g.id;

                return (
                  <TiltMetallicTile
                    key={`bento-goal-${g.id}`}
                    background={theme.background}
                    border={theme.border}
                    isSelected={isSelected}
                    onClick={() => handleSelect({ kind: 'goal', data: g })}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: theme.badgeBg,
                              borderColor: theme.border,
                            }}
                          >
                            <Target className="w-4 h-4" style={{ color: theme.accentText }} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-display font-bold text-sm text-[#111318] truncate">
                              {g.title}
                            </h4>
                            <span className="text-[11px] text-[#52504C] font-medium capitalize block truncate">
                              {g.kind.replace('_', ' ')} · {g.scope.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <span
                          className="font-mono text-xs font-bold"
                          style={{ color: theme.accentText }}
                        >
                          {pct}% Funded
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-[#52504C] tracking-wide">
                            Current Corpus
                          </div>
                          <div className="text-xl sm:text-2xl font-black font-mono-data tabular-nums text-[#111318] mt-0.5">
                            {formatINR(g.currentMinor)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-bold text-[#52504C] tracking-wide">
                            Target Corpus
                          </div>
                          <div
                            className="text-sm sm:text-base font-bold font-mono-data tabular-nums mt-0.5"
                            style={{ color: theme.accentText }}
                          >
                            {formatINR(g.targetMinor)}
                          </div>
                        </div>
                      </div>

                      <div className="w-full bg-[#111318]/10 h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, pct)}%`,
                            backgroundColor: theme.progressColor,
                          }}
                        />
                      </div>
                    </div>

                    <div
                      className="pt-2.5 border-t border-[#111318]/10 flex items-center justify-between text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] font-mono font-medium text-[#52504C]">
                        {g.targetDate ? `Target: ${g.targetDate}` : 'Ongoing Reserve'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenContributeGoal(g)}
                          className="px-2.5 py-1 rounded-xl bg-[#111318] hover:bg-[#252830] text-[#E5C158] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                        >
                          Add Funds
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDeleteConfirm('goal', g.id, g.title)}
                          className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                          title="Delete Goal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </TiltMetallicTile>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E6E1D6] bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-[#111318]">
                <thead className="bg-[#FAF8F5] border-b border-[#E6E1D6] text-[10px] uppercase font-bold text-[#52504C] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Goal / Reserve</th>
                    <th className="py-2.5 px-3">Scope & Type</th>
                    <th className="py-2.5 px-3 text-right">Current Corpus</th>
                    <th className="py-2.5 px-3 text-right">Target Corpus</th>
                    <th className="py-2.5 px-3">Progress</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E1D6]/70">
                  {goals.map((g) => {
                    const pct =
                      g.targetMinor > 0
                        ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100))
                        : 0;
                    const isSelected = selectedItem?.kind === 'goal' && selectedItem.data.id === g.id;
                    return (
                      <tr
                        key={`list-goal-${g.id}`}
                        onClick={() => handleSelect({ kind: 'goal', data: g })}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F9F5EC]' : 'hover:bg-[#FAF8F5]'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#111318]">{g.title}</div>
                          <div className="text-[11px] text-[#52504C]">
                            {g.targetDate ? `Target: ${g.targetDate}` : 'Ongoing Reserve'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase bg-[#F3EFEA] text-[#111318] border border-[#E6E1D6]">
                            {g.scope} · {g.kind.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-[#059669]">
                          {formatINR(g.currentMinor)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-[#8C6D1F]">
                          {formatINR(g.targetMinor)}
                        </td>
                        <td className="py-2.5 px-3 w-36">
                          <div className="flex items-center justify-between text-[10px] font-mono font-semibold mb-1 text-[#52504C]">
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-[#111318]/10 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#059669] rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenContributeGoal(g)}
                              className="px-2.5 py-1 rounded-xl bg-[#111318] hover:bg-[#252830] text-[#E5C158] font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                            >
                              Add Funds
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenDeleteConfirm('goal', g.id, g.title)}
                              className="px-2 py-1 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                              title="Delete Goal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loans.length === 0 && dues.length === 0 && goals.length === 0 && (
        <div className="p-10 text-center rounded-3xl border border-dashed border-[#E6E1D6] bg-white space-y-3">
          <Landmark className="w-8 h-8 text-[#C59B27] mx-auto" />
          <div className="text-sm font-bold text-[#111318]">
            No matching loans, Khatabook dues, or savings goals
          </div>
          <p className="text-xs text-[#52504C]">
            Try clearing your search or triage filter, or create a new loan or person due above.
          </p>
        </div>
      )}
    </div>
  );
}
