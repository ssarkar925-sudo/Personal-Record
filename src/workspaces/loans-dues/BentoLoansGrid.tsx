import {
  Landmark,
  MessageCircle,
  Pencil,
  Plus,
  Split,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { formatINR, buildWhatsAppLink } from '../../lib/format.ts';
import type {
  LoanRecord,
  PersonDueRecord,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type { SelectedLoansItem } from './types.ts';

export interface BentoLoansGridProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  goals: SavingsGoalRecord[];
  onSelectAndSwitchToSplit: (item: SelectedLoansItem) => void;
  onOpenAddLoan: () => void;
  onOpenAddDue: () => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenEditLoan: (loan: LoanRecord) => void;
  onOpenEditDue: (due: PersonDueRecord) => void;
  onOpenContributeGoal: (goal: SavingsGoalRecord) => void;
  onOpenDeleteConfirm: (kind: 'loan' | 'due' | 'goal', id: string, label: string) => void;
  onSwitchToSplit: () => void;
}

export function BentoLoansGrid({
  loans,
  dues,
  goals,
  onSelectAndSwitchToSplit,
  onOpenAddLoan,
  onOpenAddDue,
  onOpenPayEmi,
  onOpenSettleDue,
  onOpenEditLoan,
  onOpenEditDue,
  onOpenContributeGoal,
  onOpenDeleteConfirm,
  onSwitchToSplit,
}: BentoLoansGridProps) {
  return (
    <div className="space-y-4">
      {/* Bento Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h3 className="text-base font-bold text-slate-900">Loans & Khatabook Bento Grid</h3>
          <p className="text-xs text-slate-500">
            Executive bird's-eye view of all {loans.length} bank loans, {dues.length} people dues, and {goals.length} savings goals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToSplit}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Split className="w-3.5 h-3.5" />
            <span>Switch to Split Workstation</span>
          </button>
          <button
            onClick={onOpenAddDue}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Due</span>
          </button>
          <button
            onClick={onOpenAddLoan}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Loan</span>
          </button>
        </div>
      </div>

      {/* Grid of Bank Loans */}
      {loans.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Bank Loans & Institutional Credit ({loans.length})</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loans.map((loan) => {
              const paidMinor = Math.max(0, loan.principalMinor - loan.remainingMinor);
              const clearedPct = loan.principalMinor > 0 ? Math.min(100, Math.round((paidMinor / loan.principalMinor) * 100)) : 100;
              const isClosed = loan.status === 'closed';
              const isLent = loan.direction === 'lent';

              return (
                <div
                  key={`bento-loan-${loan.id}`}
                  onClick={() => onSelectAndSwitchToSplit({ kind: 'loan', data: loan })}
                  className="bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-slate-300 shadow-2xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${isClosed ? 'bg-emerald-500' : isLent ? 'bg-emerald-600' : 'bg-blue-600'}`} />

                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-xs text-slate-900">{loan.name}</h4>
                          <span className="text-[10px] text-slate-400">{loan.counterparty}</span>
                        </div>
                      </div>

                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${isClosed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {isClosed ? 'Closed' : isLent ? 'Lent' : 'Loan'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Remaining Balance</div>
                        <div className="text-xl font-bold font-mono text-slate-900">{formatINR(loan.remainingMinor)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Monthly EMI</div>
                        <div className="text-sm font-bold font-mono text-blue-700">{formatINR(loan.emiMinor)}</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${isClosed ? 'bg-emerald-500' : 'bg-blue-600'}`}
                        style={{ width: `${Math.max(3, clearedPct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>{clearedPct}% principal cleared</span>
                      <span>Next: {loan.nextDueDate}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[11px] text-slate-400">{(loan.annualRateBps / 100).toFixed(2)}% p.a.</span>
                    <div className="flex items-center gap-1.5">
                      {!isClosed && (
                        <button
                          onClick={() => onOpenPayEmi(loan)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] shadow-2xs transition-colors cursor-pointer"
                        >
                          Pay EMI
                        </button>
                      )}
                      <button
                        onClick={() => onOpenEditLoan(loan)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onOpenDeleteConfirm('loan', loan.id, loan.name)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
      )}

      {/* Grid of People Dues (Khatabook) */}
      {dues.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">People Khatabook & Udhar ({dues.length})</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dues.map((due) => {
              const isNeed = due.direction === 'need';
              const isSettled = due.status === 'settled';
              const whatsappLink = buildWhatsAppLink(
                due.phone,
                `Hi ${due.personName}, gentle reminder regarding pending balance of ${formatINR(due.remainingMinor)}.`
              );

              return (
                <div
                  key={`bento-due-${due.id}`}
                  onClick={() => onSelectAndSwitchToSplit({ kind: 'due', data: due })}
                  className="bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-slate-300 shadow-2xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${isSettled ? 'bg-slate-400' : isNeed ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isNeed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-xs text-slate-900">{due.personName}</h4>
                          <span className="text-[10px] text-slate-400">{due.phone || due.scope}</span>
                        </div>
                      </div>

                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${isSettled ? 'bg-slate-100 text-slate-600 border-slate-200' : isNeed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {isSettled ? 'Settled' : isNeed ? 'Need from' : 'Give to'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">{isNeed ? 'Owed to You' : 'You Owe'}</div>
                        <div className={`text-xl font-bold font-mono ${isNeed ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatINR(due.remainingMinor)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Initial: {formatINR(due.amountMinor)}</div>
                        <div className="text-[11px] text-slate-500">{due.dueDate ? `Due ${due.dueDate}` : 'Flexible'}</div>
                      </div>
                    </div>

                    {due.note && (
                      <p className="text-[11px] text-slate-500 italic mt-2 truncate">
                        "{due.note}"
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                    <div>
                      {isNeed && !isSettled && (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isSettled && (
                        <button
                          onClick={() => onOpenSettleDue(due)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] shadow-2xs transition-colors cursor-pointer"
                        >
                          Settle
                        </button>
                      )}
                      <button
                        onClick={() => onOpenEditDue(due)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onOpenDeleteConfirm('due', due.id, due.personName)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
      )}

      {/* Grid of Savings Goals */}
      {goals.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Savings Goals & Reserves ({goals.length})</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {goals.map((g) => {
              const pct = g.targetMinor > 0 ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100)) : 0;

              return (
                <div
                  key={`bento-goal-${g.id}`}
                  onClick={() => onSelectAndSwitchToSplit({ kind: 'goal', data: g })}
                  className="bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-slate-300 shadow-2xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                          <Target className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-xs text-slate-900">{g.title}</h4>
                          <span className="text-[10px] text-slate-400 capitalize">{g.kind}</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-700">{pct}% Funded</span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Current Saved</div>
                        <div className="text-xl font-bold font-mono text-slate-900">{formatINR(g.currentMinor)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Target</div>
                        <div className="text-sm font-semibold font-mono text-slate-700">{formatINR(g.targetMinor)}</div>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
                      <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[11px] text-slate-400">{g.targetDate ? `Target: ${g.targetDate}` : 'Ongoing'}</span>
                    <button
                      onClick={() => onOpenContributeGoal(g)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] shadow-2xs transition-colors cursor-pointer"
                    >
                      Add Funds
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
