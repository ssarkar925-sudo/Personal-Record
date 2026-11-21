import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  LayoutGrid,
  Pencil,
  Search,
  Split,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type {
  LoanRecord,
  PersonDueRecord,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type {
  LoansDuesSortOption,
  LoansTab,
  LoansTriageFilter,
  LoansWorkstationLayout,
  SelectedLoansItem,
} from './types.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import { SortSelect } from '../../components/ui/Primitives.tsx';

export interface LoansDuesHubProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  goals: SavingsGoalRecord[];
  filteredLoans: LoanRecord[];
  filteredDues: PersonDueRecord[];
  filteredGoals: SavingsGoalRecord[];
  selectedItem: SelectedLoansItem;
  searchQuery: string;
  activeTab: LoansTab;
  triageFilter: LoansTriageFilter;
  workstationLayout: LoansWorkstationLayout;
  sortOption?: LoansDuesSortOption;
  onSortChange?: (sort: LoansDuesSortOption) => void;
  urgentDueCount: number;
  totalYouOweCount: number;
  totalOwedToYouCount: number;
  scopeFilter?: Scope | 'all';
  onScopeChange?: (s: Scope | 'all') => void;
  onSelectItem: (item: SelectedLoansItem) => void;
  onSearchChange: (q: string) => void;
  onTabChange: (tab: LoansTab) => void;
  onTriageChange: (triage: LoansTriageFilter) => void;
  onLayoutChange: (layout: LoansWorkstationLayout) => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenEditLoan: (loan: LoanRecord) => void;
  onOpenEditDue: (due: PersonDueRecord) => void;
  onOpenDeleteConfirm: (kind: 'loan' | 'due' | 'goal', id: string, label: string) => void;
}

export function LoansDuesHub({
  loans = [],
  dues = [],
  goals = [],
  filteredLoans = [],
  filteredDues = [],
  filteredGoals = [],
  selectedItem,
  searchQuery,
  activeTab,
  triageFilter,
  workstationLayout,
  sortOption = 'remaining_desc',
  onSortChange,
  urgentDueCount,
  totalYouOweCount,
  totalOwedToYouCount,
  scopeFilter = 'all',
  onScopeChange,
  onSelectItem,
  onSearchChange,
  onTabChange,
  onTriageChange,
  onLayoutChange,
  onOpenPayEmi,
  onOpenSettleDue,
  onOpenEditLoan,
  onOpenEditDue,
  onOpenDeleteConfirm,
}: LoansDuesHubProps) {
  const totalItemsCount = (loans || []).length + (dues || []).length + (goals || []).length;

  return (
    <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 space-y-4">
      {/* 1. Header with Total Count & Selection Reset */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center">
            <Landmark className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-display font-bold text-[#111318] uppercase tracking-wider">
            Loans & Khatabook
          </h3>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] border border-[#E6E1D6]">
            {totalItemsCount} Total
          </span>
        </div>

        {selectedItem && (
          <button
            type="button"
            onClick={() => onSelectItem(null)}
            className="text-xs font-semibold text-[#111318] hover:text-[#C59B27] bg-[#F3EFEA] border border-[#E6E1D6] px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
          >
            Clear Selection
          </button>
        )}
      </div>

      {/* 2. Controls Card: Search, Triage Chips, Segmented Tabs */}
      <div className="bg-white rounded-2xl border border-[#E6E1D6] p-3.5 shadow-[0_8px_24px_rgba(17,19,24,0.03)] space-y-3">
        {/* Instant Search Bar & Scope Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#52504C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search loans, people, banks, notes..."
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
          {onScopeChange && (
            <select
              value={scopeFilter}
              onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
              className="h-8 px-2 text-[11px] bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl text-[#111318] focus:outline-none focus:border-[#C59B27] cursor-pointer font-semibold"
            >
              <option value="all">All Scopes</option>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="family">Family</option>
            </select>
          )}
        </div>

        {/* 1-Click Triage Radar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
          <button
            type="button"
            onClick={() => onTriageChange('all')}
            className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold transition-all cursor-pointer ${
              triageFilter === 'all'
                ? 'bg-[#111318] text-[#FAF8F5] font-bold'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            All ({totalItemsCount})
          </button>

          {urgentDueCount > 0 && (
            <button
              type="button"
              onClick={() => onTriageChange('due_soon')}
              className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                triageFilter === 'due_soon'
                  ? 'bg-[#D97706] text-white font-bold'
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
            className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'you_owe'
                ? 'bg-[#E11D48] text-white font-bold'
                : 'bg-[#E11D48]/10 text-[#E11D48] border border-[#E11D48]/25'
            }`}
          >
            <ArrowUpRight className="w-3 h-3" />
            <span>You Owe ({totalYouOweCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('you_are_owed')}
            className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'you_are_owed'
                ? 'bg-[#059669] text-white font-bold'
                : 'bg-[#059669]/10 text-[#059669] border border-[#059669]/25'
            }`}
          >
            <ArrowDownLeft className="w-3 h-3" />
            <span>Owed to You ({totalOwedToYouCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('bank_loans')}
            className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'bank_loans'
                ? 'bg-[#111318] text-[#E5C158] font-bold'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <Landmark className="w-3 h-3" />
            <span>Loans ({loans.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('settled')}
            className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'settled'
                ? 'bg-[#111318] text-white font-bold'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Settled</span>
          </button>
        </div>

        {/* Segmented Module Tabs & Layout Switcher */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E6E1D6]/70">
          <div className="flex items-center gap-1 p-0.5 bg-[#F3EFEA] rounded-xl text-[11px] font-semibold">
            {(
              [
                ['all', `All (${totalItemsCount})`],
                ['loans', `Loans (${loans.length})`],
                ['dues', `People (${dues.length})`],
                ['goals', `Goals (${goals.length})`],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => onTabChange(tabKey)}
                className={`py-1 px-2.5 rounded-lg transition-all text-center cursor-pointer ${
                  activeTab === tabKey
                    ? 'bg-white text-[#111318] shadow-2xs font-bold'
                    : 'text-[#52504C] hover:text-[#111318]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {onSortChange && (
              <SortSelect
                label="Sort"
                value={sortOption}
                onChange={(v) => onSortChange(v as LoansDuesSortOption)}
                options={[
                  { value: 'remaining_desc', label: 'Highest Amount' },
                  { value: 'remaining_asc', label: 'Lowest Amount' },
                  { value: 'next_due', label: 'Due Date' },
                  { value: 'name_asc', label: 'Name (A-Z)' },
                ]}
              />
            )}

            <div className="flex items-center gap-1 bg-[#F3EFEA] p-0.5 rounded-lg border border-[#E6E1D6]">
              <button
                type="button"
                onClick={() => onLayoutChange('bento')}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  workstationLayout === 'bento'
                    ? 'bg-[#111318] text-[#E5C158] shadow-2xs'
                    : 'text-[#52504C] hover:text-[#111318]'
                }`}
                title="3D Metallic Bento Cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onLayoutChange('split')}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  workstationLayout === 'split'
                    ? 'bg-[#111318] text-[#E5C158] shadow-2xs'
                    : 'text-[#52504C] hover:text-[#111318]'
                }`}
                title="Split Dual-Pane Workstation"
              >
                <Split className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. High-Density Scalable List */}
      <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
        {(activeTab === 'all' || activeTab === 'loans') &&
          filteredLoans.map((loan) => {
            const isSelected = selectedItem?.kind === 'loan' && selectedItem.data.id === loan.id;
            const isLent = loan.direction === 'lent';
            const isClosed = loan.status === 'closed';

            return (
              <div
                key={`loan-${loan.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'loan', data: loan })}
                className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FAF8F5] border-[#111318] shadow-xs ring-1 ring-[#C59B27]/40'
                    : 'bg-white border-[#E6E1D6] hover:border-[#C59B27]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isClosed
                          ? 'bg-[#F3EFEA] text-[#52504C]'
                          : isLent
                            ? 'bg-[#059669]/12 text-[#059669]'
                            : 'bg-[#111318] text-[#E5C158]'
                      }`}
                    >
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-[#111318] truncate">
                          {loan.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                            isClosed
                              ? 'bg-[#F3EFEA] text-[#52504C]'
                              : isLent
                                ? 'bg-[#059669]/10 text-[#059669] border border-[#059669]/25'
                                : 'bg-[#C59B27]/15 text-[#111318] border border-[#C59B27]/35'
                          }`}
                        >
                          {isClosed ? 'Closed' : isLent ? 'Lent Assist' : 'Bank Loan'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#52504C] truncate mt-0.5">
                        {loan.counterparty} · {(loan.annualRateBps / 100).toFixed(2)}% APR · Next:{' '}
                        {loan.nextDueDate}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-xs font-bold text-[#111318]">
                      {formatINR(loan.remainingMinor)}
                    </div>
                    <div className="text-[10px] text-[#52504C] font-mono">
                      EMI: {formatINR(loan.emiMinor)}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#E6E1D6]/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#52504C]">
                    Tenure: {loan.tenureMonths} mo · {loan.scope}
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => onOpenPayEmi(loan)}
                        className="px-2.5 py-0.5 bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Pay EMI
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenEditLoan(loan)}
                      className="p-1 text-[#52504C] hover:text-[#111318] rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                      title="Edit Loan"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                      className="p-1 text-[#52504C] hover:text-[#E11D48] rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Loan"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {(activeTab === 'all' || activeTab === 'dues') &&
          filteredDues.map((due) => {
            const isSelected = selectedItem?.kind === 'due' && selectedItem.data.id === due.id;
            const isNeed = due.direction === 'need';
            const isSettled = due.status === 'settled';

            return (
              <div
                key={`due-${due.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'due', data: due })}
                className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FAF8F5] border-[#059669] shadow-xs ring-1 ring-[#059669]/30'
                    : 'bg-white border-[#E6E1D6] hover:border-[#C59B27]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSettled
                          ? 'bg-[#F3EFEA] text-[#52504C]'
                          : isNeed
                            ? 'bg-[#059669]/12 text-[#059669]'
                            : 'bg-[#E11D48]/12 text-[#E11D48]'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-[#111318] truncate">
                          {due.personName}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                            isSettled
                              ? 'bg-[#F3EFEA] text-[#52504C]'
                              : isNeed
                                ? 'bg-[#059669]/10 text-[#059669] border border-[#059669]/25'
                                : 'bg-[#E11D48]/10 text-[#E11D48] border border-[#E11D48]/25'
                          }`}
                        >
                          {isSettled ? 'Settled' : isNeed ? 'Owed to You' : 'You Owe'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#52504C] truncate mt-0.5">
                        {due.phone ? `${due.phone} · ` : ''}
                        {due.note || 'No notes'}
                        {due.dueDate ? ` · Due: ${due.dueDate}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div
                      className={`font-mono text-xs font-bold ${
                        isSettled
                          ? 'text-[#52504C] line-through'
                          : isNeed
                            ? 'text-[#059669]'
                            : 'text-[#E11D48]'
                      }`}
                    >
                      {formatINR(due.remainingMinor)}
                    </div>
                    <div className="text-[10px] text-[#52504C] font-mono">
                      of {formatINR(due.amountMinor)}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#E6E1D6]/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#52504C] capitalize">Scope: {due.scope}</span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isSettled && (
                      <button
                        type="button"
                        onClick={() => onOpenSettleDue(due)}
                        className="px-2.5 py-0.5 bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Settle
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenEditDue(due)}
                      className="p-1 text-[#52504C] hover:text-[#111318] rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                      title="Edit Due"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDeleteConfirm(
                          'due',
                          due.id,
                          `${due.personName} (${formatINR(due.amountMinor)})`,
                        )
                      }
                      className="p-1 text-[#52504C] hover:text-[#E11D48] rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Due"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {(activeTab === 'all' || activeTab === 'goals') &&
          filteredGoals.map((g) => {
            const isSelected = selectedItem?.kind === 'goal' && selectedItem.data.id === g.id;
            const pct =
              g.targetMinor > 0
                ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100))
                : 0;

            return (
              <div
                key={`goal-${g.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'goal', data: g })}
                className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FAF8F5] border-[#C59B27] shadow-xs ring-1 ring-[#C59B27]/30'
                    : 'bg-white border-[#E6E1D6] hover:border-[#C59B27]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#C59B27]/15 text-[#111318] flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4 text-[#C59B27]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-[#111318] truncate">
                          {g.title}
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase bg-[#F3EFEA] text-[#52504C] border border-[#E6E1D6]">
                          {g.kind}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#52504C] truncate mt-0.5">
                        Target: {formatINR(g.targetMinor)} · {pct}% funded
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-xs font-bold text-[#059669]">
                      {formatINR(g.currentMinor)}
                    </div>
                    <div className="text-[10px] text-[#52504C]">
                      {g.targetDate ? `Due ${g.targetDate}` : 'Ongoing'}
                    </div>
                  </div>
                </div>

                <div className="w-full bg-[#F3EFEA] h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div
                    className="h-full bg-[#059669] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}

        {filteredLoans.length === 0 && filteredDues.length === 0 && filteredGoals.length === 0 && (
          <div className="p-8 text-center rounded-2xl border border-dashed border-[#E6E1D6] bg-white text-xs text-[#52504C]">
            No loans, people dues, or goals matching this filter or search query.
          </div>
        )}
      </div>
    </div>
  );
}
