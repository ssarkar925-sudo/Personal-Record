import {
  Clock,
  Landmark,
  MessageCircle,
  Pencil,
  Target,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { formatINR, buildWhatsAppLink } from '../../lib/format.ts';
import type {
  AccountRecord,
  DebtPayoffResult,
  LoanRecord,
  PersonDueRecord,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type { SelectedLoansItem } from './types.ts';

export interface LoanContextHudProps {
  selectedItem: SelectedLoansItem;
  accounts: AccountRecord[];
  payoffPlan: DebtPayoffResult | null;
  payoffExtraRupees: string;
  payoffStrategy: 'avalanche' | 'snowball';
  onPayoffExtraChange: (val: string) => void;
  onPayoffStrategyChange: (strat: 'avalanche' | 'snowball') => void;
  onClearSelection: () => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onOpenEditLoan: (loan: LoanRecord) => void;
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenEditDue: (due: PersonDueRecord) => void;
  onOpenContributeGoal: (goal: SavingsGoalRecord) => void;
  onOpenEditGoal: (goal: SavingsGoalRecord) => void;
}

export function LoanContextHud({
  selectedItem,
  accounts,
  payoffPlan,
  payoffExtraRupees,
  payoffStrategy,
  onPayoffExtraChange,
  onPayoffStrategyChange,
  onClearSelection,
  onOpenPayEmi,
  onOpenEditLoan,
  onOpenSettleDue,
  onOpenEditDue,
  onOpenContributeGoal,
  onOpenEditGoal,
}: LoanContextHudProps) {
  // 1. If a Loan is Selected: Deep Amortization & Repayment HUD
  if (selectedItem?.kind === 'loan') {
    const loan = selectedItem.data;
    const paidMinor = Math.max(0, loan.principalMinor - loan.remainingMinor);
    const clearedPct = loan.principalMinor > 0 ? Math.min(100, Math.round((paidMinor / loan.principalMinor) * 100)) : 100;
    const isClosed = loan.status === 'closed';
    const isLent = loan.direction === 'lent';
    const linkedBank = accounts.find((a) => a.id === loan.linkedAccountId);

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-5 relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isClosed ? 'bg-emerald-500' : isLent ? 'bg-emerald-600' : 'bg-blue-600'}`} />

        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isLent ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{loan.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${isClosed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                  {isClosed ? 'Closed' : isLent ? 'Lent Assist' : 'Active Bank Loan'}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                  {loan.scope}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {loan.counterparty} · {(loan.annualRateBps / 100).toFixed(2)}% APR · Next EMI due: <strong className="text-slate-800">{loan.nextDueDate}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isClosed && (
              <button
                onClick={() => onOpenPayEmi(loan)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Record EMI Payment
              </button>
            )}
            <button
              onClick={() => onOpenEditLoan(loan)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Edit Loan"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onClearSelection}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close HUD"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Remaining Principal</span>
            <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
              {formatINR(loan.remainingMinor)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Original: {formatINR(loan.principalMinor)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Monthly EMI Commitment</span>
            <span className="text-xl font-bold font-mono text-blue-700 mt-0.5 block">
              {formatINR(loan.emiMinor)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Linked: {linkedBank?.name || 'Default Bank'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Interest Paid</span>
            <span className="text-xl font-bold font-mono text-amber-700 mt-0.5 block">
              {formatINR(loan.totalInterestPaidMinor)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {clearedPct}% principal cleared
            </span>
          </div>
        </div>

        {/* Visual Principal Clearance Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Amortization Clearance Progress</span>
            <span className="font-mono font-bold text-blue-700">{clearedPct}% Cleared</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${isClosed ? 'bg-emerald-500' : 'bg-blue-600'}`}
              style={{ width: `${Math.max(2, clearedPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Cleared: {formatINR(paidMinor)}</span>
            <span>Remaining: {formatINR(loan.remainingMinor)}</span>
          </div>
        </div>

        {/* Tenor & Schedule Timeline */}
        <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Tenor & Amortization Timeline
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              Total: {loan.tenureMonths} Months
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block">Start Date</span>
              <span className="font-semibold text-slate-800">{loan.startDate}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-slate-400 block">Next EMI Due</span>
              <span className="font-semibold text-blue-700">{loan.nextDueDate}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Status</span>
              <span className={`font-semibold ${isClosed ? 'text-emerald-700' : 'text-slate-800'}`}>
                {loan.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. If a Person Due (Khatabook) is Selected: Deep Person & WhatsApp Reminder HUD
  if (selectedItem?.kind === 'due') {
    const due = selectedItem.data;
    const isNeed = due.direction === 'need';
    const isSettled = due.status === 'settled';
    const whatsappMsg = `Hi ${due.personName}, gentle reminder regarding the pending balance of ${formatINR(due.remainingMinor)}${due.note ? ` for ${due.note}` : ''}. Please settle at your convenience.`;
    const whatsappLink = buildWhatsAppLink(due.phone, whatsappMsg);

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-5 relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isSettled ? 'bg-slate-400' : isNeed ? 'bg-emerald-500' : 'bg-rose-500'}`} />

        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isNeed ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{due.personName}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${isSettled ? 'bg-slate-100 text-slate-600 border-slate-200' : isNeed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {isSettled ? 'Settled' : isNeed ? 'Need from Person (Asset)' : 'Give to Person (Liability)'}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                  {due.scope}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {due.phone ? `${due.phone} · ` : ''}Due date: <strong className="text-slate-800">{due.dueDate || 'Flexible'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isSettled && (
              <button
                onClick={() => onOpenSettleDue(due)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Record Settlement
              </button>
            )}
            <button
              onClick={() => onOpenEditDue(due)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Edit Due"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onClearSelection}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close HUD"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Due Balance Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              {isNeed ? 'Balance Owed to You' : 'Balance You Owe'}
            </span>
            <span className={`text-2xl font-bold font-mono mt-0.5 block ${isNeed ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatINR(due.remainingMinor)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Initial: {formatINR(due.amountMinor)}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Khatabook Memo & Context</span>
              <p className="text-xs text-slate-700 font-medium mt-1">
                {due.note || 'No special note recorded.'}
              </p>
            </div>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Created: {due.createdAt ? due.createdAt.slice(0, 10) : 'Recent'}
            </span>
          </div>
        </div>

        {/* WhatsApp 1-Click Reminder Nudge */}
        {isNeed && !isSettled && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp 1-Click Payment Nudge</span>
              </div>
              <p className="text-[11px] text-emerald-800/80 max-w-md">
                Send a polite pre-formatted payment reminder with UPI details directly to {due.personName}.
              </p>
            </div>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send WhatsApp Reminder</span>
            </a>
          </div>
        )}
      </div>
    );
  }

  // 3. If a Savings Goal is Selected
  if (selectedItem?.kind === 'goal') {
    const goal = selectedItem.data;
    const pct = goal.targetMinor > 0 ? Math.min(100, Math.round((goal.currentMinor / goal.targetMinor) * 100)) : 0;

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-600" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{goal.title}</h3>
              <p className="text-xs text-slate-500">
                Category: <strong className="text-slate-700 capitalize">{goal.kind}</strong> · Target date: <strong className="text-slate-800">{goal.targetDate || 'Flexible'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenContributeGoal(goal)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              Add Contribution
            </button>
            <button
              onClick={() => onOpenEditGoal(goal)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onClearSelection}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Current Savings</span>
            <span className="text-xl font-bold font-mono text-emerald-700 mt-0.5 block">{formatINR(goal.currentMinor)}</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Target Amount</span>
            <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">{formatINR(goal.targetMinor)}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-slate-700">Target Funding</span>
            <span className="font-mono font-bold text-emerald-700">{pct}% Funded</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // 4. Default: No Specific Item Selected -> Show Executive Debt Payoff Optimizer
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-600" />

      {/* Header with Strategy Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Debt Payoff Optimizer & Amortization Engine
            </h3>
            <p className="text-xs text-slate-500">
              Select an account or loan on the left, or optimize your payoff strategy below.
            </p>
          </div>
        </div>

        {/* Strategy Switcher: Avalanche vs Snowball */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <span>Extra/mo (₹):</span>
            <input
              type="number"
              value={payoffExtraRupees}
              onChange={(e) => onPayoffExtraChange(e.target.value)}
              className="w-20 h-7 text-xs font-mono font-bold px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => onPayoffStrategyChange('avalanche')}
              className={`rounded-md px-2 py-1 cursor-pointer transition-all ${
                payoffStrategy === 'avalanche' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Avalanche (APR)
            </button>
            <button
              type="button"
              onClick={() => onPayoffStrategyChange('snowball')}
              className={`rounded-md px-2 py-1 cursor-pointer transition-all ${
                payoffStrategy === 'snowball' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Snowball (Balance)
            </button>
          </div>
        </div>
      </div>

      {/* Payoff Simulation Summary */}
      {payoffPlan && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Debt-Free Horizon</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
                {payoffPlan.planMonths} Months
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">
                Saves {payoffPlan.monthsSaved} months
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Interest Saved</span>
              <span className="text-xl font-bold font-mono text-emerald-700 mt-0.5 block">
                {formatINR(payoffPlan.interestSavedMinor)}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                By accelerating high-cost debt
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Active Debt</span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
                {formatINR(payoffPlan.totalDebtMinor)}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Across {payoffPlan.items.length} accounts
              </span>
            </div>
          </div>

          {/* Payoff Sequence Items */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-semibold text-slate-700 block">
              Prioritized Payoff Order ({payoffStrategy === 'avalanche' ? 'Highest Interest First' : 'Smallest Balance First'}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {payoffPlan.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between shadow-2xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center justify-center">
                        #{item.payoffOrder}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {(item.aprBps / 100).toFixed(1)}% APR · Cleared in {item.planMonths} mo
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-900">
                    {formatINR(item.balanceMinor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
