import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  LayoutGrid,
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
      className={`relative rounded-2xl p-4.5 text-white cursor-pointer select-none transition-all duration-200 overflow-hidden flex flex-col justify-between space-y-3.5 shadow-[0_14px_30px_rgba(17,19,24,0.16)] ${
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
          opacity: tilt.active ? 0.25 : 0.08,
          background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.45), transparent 62%)`,
        }}
      />
      <div className="relative z-10 flex flex-col justify-between h-full space-y-3.5">
        {children}
      </div>
    </div>
  );
}

export function BentoLoansGrid({
  loans,
  dues,
  goals,
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
  const totalCount = loans.length + dues.length + goals.length;
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

            {/* Layout Mode Switcher: 3D Cards vs Split List */}
            <div className="inline-flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6]">
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg bg-[#111318] text-[#FAF8F5] text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>3D Cards</span>
              </button>
              <button
                type="button"
                onClick={onSwitchToSplit}
                className="px-2.5 py-1 rounded-lg text-[#52504C] hover:text-[#111318] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Split className="w-3.5 h-3.5" />
                <span>Split List</span>
              </button>
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
                          className="w-8 h-6 rounded-md border flex items-center justify-center shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, #F5D97E 0%, #C59B27 55%, #8F6B14 100%)',
                            borderColor: 'rgba(255,255,255,0.45)',
                          }}
                        >
                          <Landmark className="w-3.5 h-3.5 text-[#111318]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-sm text-white truncate">
                            {loan.name}
                          </h4>
                          <span className="text-[11px] text-white/65 block truncate">
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
                        <div className="text-[10px] uppercase font-semibold text-white/60">
                          Remaining Principal
                        </div>
                        <div className="text-xl font-bold font-mono-data tabular-nums text-white mt-0.5">
                          {formatINR(loan.remainingMinor)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-semibold text-white/60">
                          Monthly EMI
                        </div>
                        <div
                          className="text-sm font-bold font-mono-data tabular-nums mt-0.5"
                          style={{ color: theme.accentText }}
                        >
                          {formatINR(loan.emiMinor)}
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-white/15 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(4, clearedPct)}%`,
                          backgroundColor: theme.progressColor,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-white/75 mt-1.5">
                      <span>{clearedPct}% cleared</span>
                      <span>Next: {loan.nextDueDate}</span>
                    </div>
                  </div>

                  <div
                    className="pt-2.5 border-t border-white/15 flex items-center justify-between text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono text-white/70">
                      {(loan.annualRateBps / 100).toFixed(2)}% APR · {loan.tenureMonths}M
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => onOpenPayEmi(loan)}
                          className="px-2.5 py-1 rounded-xl bg-[#E5C158] hover:bg-[#F5D97E] text-[#111318] font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Pay EMI
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenEditLoan(loan)}
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Edit Loan"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                        className="p-1 rounded-lg text-white/70 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title="Delete Loan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </TiltMetallicTile>
              );
            })}
          </div>
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
                        <div className="w-8 h-8 rounded-xl bg-white/12 border border-white/20 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" style={{ color: theme.accentText }} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-sm text-white truncate">
                            {due.personName}
                          </h4>
                          <span className="text-[11px] text-white/65 block truncate">
                            {due.phone || due.scope.toUpperCase()}
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
                        <div className="text-[10px] uppercase font-semibold text-white/60">
                          {isNeed ? 'Receivable Balance' : 'Payable Balance'}
                        </div>
                        <div className="text-xl font-bold font-mono-data tabular-nums text-white mt-0.5">
                          {formatINR(due.remainingMinor)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-white/60">
                          Initial: {formatINR(due.amountMinor)}
                        </div>
                        <div
                          className="text-[11px] font-mono font-semibold mt-0.5"
                          style={{ color: theme.accentText }}
                        >
                          {due.dueDate ? `Due ${due.dueDate}` : 'Flexible'}
                        </div>
                      </div>
                    </div>

                    {due.note && (
                      <p className="text-[11px] text-white/75 italic mt-2.5 truncate">
                        "{due.note}"
                      </p>
                    )}
                  </div>

                  <div
                    className="pt-2.5 border-t border-white/15 flex items-center justify-between text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      {isNeed && !isSettled ? (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6EE7B7] hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp Nudge</span>
                        </a>
                      ) : (
                        <span className="text-[10px] font-mono uppercase text-white/60">
                          Scope: {due.scope}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isSettled && (
                        <button
                          type="button"
                          onClick={() => onOpenSettleDue(due)}
                          className="px-2.5 py-1 rounded-xl bg-white text-[#111318] hover:bg-[#FAF8F5] font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Settle
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenEditDue(due)}
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Edit Due"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDeleteConfirm('due', due.id, due.personName)}
                        className="p-1 rounded-lg text-white/70 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title="Delete Due"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </TiltMetallicTile>
              );
            })}
          </div>
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
                        <div className="w-8 h-8 rounded-xl bg-white/12 border border-white/20 flex items-center justify-center shrink-0">
                          <Target className="w-4 h-4" style={{ color: theme.accentText }} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-sm text-white truncate">
                            {g.title}
                          </h4>
                          <span className="text-[11px] text-white/65 capitalize block">
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
                        <div className="text-[10px] uppercase font-semibold text-white/60">
                          Current Corpus
                        </div>
                        <div className="text-xl font-bold font-mono-data tabular-nums text-white mt-0.5">
                          {formatINR(g.currentMinor)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-semibold text-white/60">
                          Target Corpus
                        </div>
                        <div
                          className="text-sm font-bold font-mono-data tabular-nums mt-0.5"
                          style={{ color: theme.accentText }}
                        >
                          {formatINR(g.targetMinor)}
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-white/15 h-1.5 rounded-full mt-3 overflow-hidden">
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
                    className="pt-2.5 border-t border-white/15 flex items-center justify-between text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono text-white/70">
                      {g.targetDate ? `Target: ${g.targetDate}` : 'Ongoing Reserve'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenContributeGoal(g)}
                        className="px-2.5 py-1 rounded-xl bg-[#E5C158] hover:bg-[#F5D97E] text-[#111318] font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        Add Funds
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDeleteConfirm('goal', g.id, g.title)}
                        className="p-1 rounded-lg text-white/70 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title="Delete Goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </TiltMetallicTile>
              );
            })}
          </div>
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
