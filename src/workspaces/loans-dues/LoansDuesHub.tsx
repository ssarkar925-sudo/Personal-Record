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
  loans,
  dues,
  goals,
  filteredLoans,
  filteredDues,
  filteredGoals,
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
  const totalItemsCount = loans.length + dues.length + goals.length;

  return (
    <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 space-y-4">
      {/* 1. Header with Total Count & Selection Reset */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center">
            <Landmark className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Loans & Khatabook
          </h3>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {totalItemsCount} Total
          </span>
        </div>

        {selectedItem && (
          <button
            onClick={() => onSelectItem(null)}
            className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Clear Selection
          </button>
        )}
      </div>

      {/* 2. Controls Card: Search, Triage Chips, Segmented Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
        {/* Instant Search Bar & Scope Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search loans, people, banks, notes..."
              className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {onScopeChange && (
            <select
              value={scopeFilter}
              onChange={(e) => onScopeChange(e.target.value as any)}
              className="h-8 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 capitalize cursor-pointer font-medium"
            >
              <option value="all">All Scopes</option>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
              <option value="family">Family</option>
            </select>
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
            All ({totalItemsCount})
          </button>

          {urgentDueCount > 0 && (
            <button
              type="button"
              onClick={() => onTriageChange('due_soon')}
              className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
                triageFilter === 'due_soon'
                  ? 'bg-amber-600 text-white shadow-2xs font-bold'
                  : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Due in 7d ({urgentDueCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onTriageChange('you_owe')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'you_owe'
                ? 'bg-rose-600 text-white shadow-2xs font-bold'
                : 'bg-rose-50 text-rose-800 border border-rose-200/80 hover:bg-rose-100'
            }`}
          >
            <ArrowUpRight className="w-3 h-3 text-rose-600" />
            <span>You Owe ({totalYouOweCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('you_are_owed')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'you_are_owed'
                ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
            }`}
          >
            <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
            <span>Owed to You ({totalOwedToYouCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('bank_loans')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'bank_loans'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'bg-blue-50 text-blue-800 border border-blue-200/80 hover:bg-blue-100'
            }`}
          >
            <Landmark className="w-3 h-3" />
            <span>Loans ({loans.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onTriageChange('settled')}
            className={`px-2 py-1 rounded-lg shrink-0 font-medium flex items-center gap-1 transition-all cursor-pointer ${
              triageFilter === 'settled'
                ? 'bg-slate-700 text-white shadow-2xs font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Settled</span>
          </button>
        </div>

        {/* Segmented Module Tabs & Layout Switcher */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl text-[11px] font-semibold">
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
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
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

            {/* View Mode Toggle: Split Workstation vs Bento Grid */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => onLayoutChange('split')}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  workstationLayout === 'split'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Split Dual-Pane Workstation"
              >
                <Split className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onLayoutChange('bento')}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  workstationLayout === 'bento'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Executive Bento Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. High-Density Scalable List (Handles 15-30+ items effortlessly) */}
      <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
        {/* Render Loans */}
        {(activeTab === 'all' || activeTab === 'loans') &&
          filteredLoans.map((loan) => {
            const isSelected = selectedItem?.kind === 'loan' && selectedItem.data.id === loan.id;
            const isLent = loan.direction === 'lent';
            const isClosed = loan.status === 'closed';

            return (
              <div
                key={`loan-${loan.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'loan', data: loan })}
                className={`group relative rounded-xl p-3 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50/50 border-indigo-600 shadow-xs ring-1 ring-indigo-500/20'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isClosed
                          ? 'bg-slate-100 text-slate-500'
                          : isLent
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">{loan.name}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            isClosed
                              ? 'bg-slate-100 text-slate-600'
                              : isLent
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isClosed ? 'Closed' : isLent ? 'Lent Assist' : 'Bank Loan'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {loan.counterparty} · {(loan.annualRateBps / 100).toFixed(2)}% APR · Next EMI: {loan.nextDueDate}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {formatINR(loan.remainingMinor)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      EMI: {formatINR(loan.emiMinor)}
                    </div>
                  </div>
                </div>

                {/* Inline Action Triggers on Hover */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Tenure: {loan.tenureMonths} mo
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isClosed && (
                      <button
                        onClick={() => onOpenPayEmi(loan)}
                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium rounded-md shadow-2xs transition-colors cursor-pointer"
                      >
                        Pay EMI
                      </button>
                    )}
                    <button
                      onClick={() => onOpenEditLoan(loan)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit Loan"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Loan"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {/* Render People Dues (Khatabook) */}
        {(activeTab === 'all' || activeTab === 'dues') &&
          filteredDues.map((due) => {
            const isSelected = selectedItem?.kind === 'due' && selectedItem.data.id === due.id;
            const isNeed = due.direction === 'need';
            const isSettled = due.status === 'settled';

            return (
              <div
                key={`due-${due.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'due', data: due })}
                className={`group relative rounded-xl p-3 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50/50 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSettled
                          ? 'bg-slate-100 text-slate-500'
                          : isNeed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">{due.personName}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            isSettled
                              ? 'bg-slate-100 text-slate-600'
                              : isNeed
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isSettled ? 'Settled' : isNeed ? 'Need (Asset)' : 'Give (Liability)'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {due.phone ? `${due.phone} · ` : ''}
                        {due.note || 'No notes'}
                        {due.dueDate ? ` · Due: ${due.dueDate}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div
                      className={`font-mono text-xs font-bold ${
                        isSettled ? 'text-slate-400 line-through' : isNeed ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatINR(due.remainingMinor)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      of {formatINR(due.amountMinor)}
                    </div>
                  </div>
                </div>

                {/* Inline Action Triggers on Hover */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400 capitalize">
                    Scope: {due.scope}
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!isSettled && (
                      <button
                        onClick={() => onOpenSettleDue(due)}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium rounded-md shadow-2xs transition-colors cursor-pointer"
                      >
                        Settle
                      </button>
                    )}
                    <button
                      onClick={() => onOpenEditDue(due)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit Due"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onOpenDeleteConfirm('due', due.id, `${due.personName} (${formatINR(due.amountMinor)})`)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Due"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {/* Render Savings Goals */}
        {(activeTab === 'all' || activeTab === 'goals') &&
          filteredGoals.map((g) => {
            const isSelected = selectedItem?.kind === 'goal' && selectedItem.data.id === g.id;
            const pct = g.targetMinor > 0 ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100)) : 0;

            return (
              <div
                key={`goal-${g.id}`}
                onClick={() => onSelectItem(isSelected ? null : { kind: 'goal', data: g })}
                className={`group relative rounded-xl p-3 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50/50 border-emerald-600 shadow-xs ring-1 ring-emerald-500/20'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">{g.title}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {g.kind}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        Target: {formatINR(g.targetMinor)} · {pct}% funded
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-xs font-bold text-emerald-700">
                      {formatINR(g.currentMinor)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {g.targetDate ? `Due ${g.targetDate}` : 'Ongoing'}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-1 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

        {filteredLoans.length === 0 && filteredDues.length === 0 && filteredGoals.length === 0 && (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-500">
            No loans, people dues, or goals matching this filter or search query.
          </div>
        )}
      </div>
    </div>
  );
}
