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
import { buildWhatsAppLink, formatINR } from '../../lib/format.ts';
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
    const clearedPct =
      loan.principalMinor > 0
        ? Math.min(100, Math.round((paidMinor / loan.principalMinor) * 100))
        : 100;
    const isClosed = loan.status === 'closed';
    const isLent = loan.direction === 'lent';
    const linkedBank = accounts.find((a) => a.id === loan.linkedAccountId);

    return (
      <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-5 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isClosed ? 'bg-[#059669]' : isLent ? 'bg-[#059669]' : 'bg-[#C59B27]'
          }`}
        />

        {/* Top Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                isLent
                  ? 'bg-[#059669]/12 border border-[#059669]/25 text-[#059669]'
                  : 'bg-[#111318] text-[#E5C158]'
              }`}
            >
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold text-[#111318]">{loan.name}</h3>
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                    isClosed
                      ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                      : 'bg-[#C59B27]/15 text-[#111318] border-[#C59B27]/35'
                  }`}
                >
                  {isClosed ? 'Closed' : isLent ? 'Lent Assist' : 'Active Bank Loan'}
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] uppercase border border-[#E6E1D6]">
                  {loan.scope}
                </span>
              </div>
              <p className="text-xs text-[#52504C] mt-0.5">
                {loan.counterparty} · {(loan.annualRateBps / 100).toFixed(2)}% APR · Next EMI due:{' '}
                <strong className="text-[#111318] font-mono">{loan.nextDueDate}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isClosed && (
              <button
                type="button"
                onClick={() => onOpenPayEmi(loan)}
                className="px-3 py-1.5 bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Record EMI Payment
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenEditLoan(loan)}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              title="Edit Loan"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              title="Close HUD"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Remaining Principal
            </span>
            <span className="text-xl font-bold font-mono-data text-[#111318] mt-0.5 block">
              {formatINR(loan.remainingMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-0.5 block">
              Original: {formatINR(loan.principalMinor)}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Monthly EMI Commitment
            </span>
            <span className="text-xl font-bold font-mono-data text-[#C59B27] mt-0.5 block">
              {formatINR(loan.emiMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-0.5 block">
              Linked: {linkedBank?.name || 'Default Bank'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Total Interest Paid
            </span>
            <span className="text-xl font-bold font-mono-data text-[#E11D48] mt-0.5 block">
              {formatINR(loan.totalInterestPaidMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-0.5 block">
              {clearedPct}% principal cleared
            </span>
          </div>
        </div>

        {/* Visual Principal Clearance Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#111318]">Amortization Clearance Progress</span>
            <span className="font-mono font-bold text-[#059669]">{clearedPct}% Cleared</span>
          </div>
          <div className="w-full bg-[#F3EFEA] h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isClosed ? 'bg-[#059669]' : 'bg-[#C59B27]'
              }`}
              style={{ width: `${Math.max(2, clearedPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[#52504C]">
            <span>Cleared: {formatINR(paidMinor)}</span>
            <span>Remaining: {formatINR(loan.remainingMinor)}</span>
          </div>
        </div>

        {/* Tenor & Schedule Timeline */}
        <div className="p-3.5 rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#111318] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C59B27]" />
              Tenor & Amortization Timeline
            </span>
            <span className="text-[#52504C] font-mono text-[11px]">
              Total: {loan.tenureMonths} Months
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E6E1D6] text-xs">
            <div>
              <span className="text-[10px] text-[#52504C] block">Start Date</span>
              <span className="font-mono font-semibold text-[#111318]">{loan.startDate}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-[#52504C] block">Next EMI Due</span>
              <span className="font-mono font-semibold text-[#C59B27]">{loan.nextDueDate}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#52504C] block">Status</span>
              <span
                className={`font-mono font-bold ${
                  isClosed ? 'text-[#059669]' : 'text-[#111318]'
                }`}
              >
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
      <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-5 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isSettled ? 'bg-[#52504C]' : isNeed ? 'bg-[#059669]' : 'bg-[#E11D48]'
          }`}
        />

        {/* Top Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                isNeed
                  ? 'bg-[#059669]/12 border border-[#059669]/25 text-[#059669]'
                  : 'bg-[#E11D48]/12 border border-[#E11D48]/25 text-[#E11D48]'
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold text-[#111318]">
                  {due.personName}
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                    isSettled
                      ? 'bg-[#F3EFEA] text-[#52504C] border-[#E6E1D6]'
                      : isNeed
                        ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                        : 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                  }`}
                >
                  {isSettled
                    ? 'Settled'
                    : isNeed
                      ? 'Owed to You (Asset)'
                      : 'You Owe (Liability)'}
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] uppercase border border-[#E6E1D6]">
                  {due.scope}
                </span>
              </div>
              <p className="text-xs text-[#52504C] mt-0.5">
                {due.phone ? `${due.phone} · ` : ''}Due date:{' '}
                <strong className="text-[#111318] font-mono">{due.dueDate || 'Flexible'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isSettled && (
              <button
                type="button"
                onClick={() => onOpenSettleDue(due)}
                className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Record Settlement
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenEditDue(due)}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              title="Edit Due"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              title="Close HUD"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Due Balance Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              {isNeed ? 'Balance Owed to You' : 'Balance You Owe'}
            </span>
            <span
              className={`text-2xl font-bold font-mono-data mt-0.5 block ${
                isNeed ? 'text-[#059669]' : 'text-[#E11D48]'
              }`}
            >
              {formatINR(due.remainingMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-0.5 block">
              Initial: {formatINR(due.amountMinor)}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
                Khatabook Memo & Context
              </span>
              <p className="text-xs text-[#111318] font-medium mt-1">
                {due.note || 'No special note recorded.'}
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#52504C] mt-2 block">
              Created: {due.createdAt ? due.createdAt.slice(0, 10) : 'Recent'}
            </span>
          </div>
        </div>

        {/* WhatsApp 1-Click Reminder Nudge */}
        {isNeed && !isSettled && (
          <div className="p-4 rounded-2xl border border-[#059669]/30 bg-[#059669]/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#111318]">
                <MessageCircle className="w-4 h-4 text-[#059669]" />
                <span>WhatsApp 1-Click Payment Nudge</span>
              </div>
              <p className="text-[11px] text-[#52504C] max-w-md">
                Send a polite pre-formatted payment reminder directly to {due.personName}.
              </p>
            </div>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl transition-colors shrink-0 cursor-pointer"
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
    const pct =
      goal.targetMinor > 0
        ? Math.min(100, Math.round((goal.currentMinor / goal.targetMinor) * 100))
        : 0;

    return (
      <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#C59B27]" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/15 border border-[#C59B27]/30 text-[#111318] flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-[#C59B27]" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[#111318]">{goal.title}</h3>
              <p className="text-xs text-[#52504C]">
                Category: <strong className="text-[#111318] capitalize">{goal.kind}</strong> ·
                Target date:{' '}
                <strong className="text-[#111318] font-mono">{goal.targetDate || 'Flexible'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenContributeGoal(goal)}
              className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Add Contribution
            </button>
            <button
              type="button"
              onClick={() => onOpenEditGoal(goal)}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1.5 text-[#52504C] hover:text-[#111318] rounded-xl hover:bg-[#F3EFEA] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Current Savings
            </span>
            <span className="text-xl font-bold font-mono-data text-[#059669] mt-0.5 block">
              {formatINR(goal.currentMinor)}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Target Amount
            </span>
            <span className="text-xl font-bold font-mono-data text-[#111318] mt-0.5 block">
              {formatINR(goal.targetMinor)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-[#111318]">Target Funding</span>
            <span className="font-mono font-bold text-[#059669]">{pct}% Funded</span>
          </div>
          <div className="w-full bg-[#F3EFEA] h-2 rounded-full overflow-hidden">
            <div className="h-full bg-[#059669]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // 4. Default: No Specific Item Selected -> Show Executive Debt Payoff Optimizer
  return (
    <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#111318] via-[#C59B27] to-[#059669]" />

      {/* Header with Strategy Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-[#111318]">
              Debt Payoff Optimizer & Amortization Engine
            </h3>
            <p className="text-xs text-[#52504C]">
              Select any loan or due card above to inspect its covenant, or optimize your payoff order below.
            </p>
          </div>
        </div>

        {/* Strategy Switcher: Avalanche vs Snowball */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#52504C] font-semibold">
            <span>Extra/mo (₹):</span>
            <input
              type="number"
              value={payoffExtraRupees}
              onChange={(e) => onPayoffExtraChange(e.target.value)}
              className="w-20 h-7 text-xs font-mono font-bold px-2 bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl text-[#111318] focus:outline-none focus:border-[#C59B27]"
            />
          </div>

          <div className="inline-flex rounded-xl border border-[#E6E1D6] bg-[#F3EFEA] p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => onPayoffStrategyChange('avalanche')}
              className={`rounded-lg px-2.5 py-1 cursor-pointer transition-all ${
                payoffStrategy === 'avalanche'
                  ? 'bg-[#111318] text-[#E5C158] font-bold'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Avalanche (APR)
            </button>
            <button
              type="button"
              onClick={() => onPayoffStrategyChange('snowball')}
              className={`rounded-lg px-2.5 py-1 cursor-pointer transition-all ${
                payoffStrategy === 'snowball'
                  ? 'bg-[#111318] text-[#E5C158] font-bold'
                  : 'text-[#52504C] hover:text-[#111318]'
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
            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
              <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
                Debt-Free Horizon
              </span>
              <span className="text-xl font-bold font-mono-data text-[#111318] mt-0.5 block">
                {payoffPlan.planMonths} Months
              </span>
              <span className="text-[11px] text-[#059669] font-semibold mt-0.5 block">
                Saves {payoffPlan.monthsSaved} months
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#059669]/8 border border-[#059669]/25">
              <span className="text-[10px] font-mono uppercase font-bold text-[#059669] block">
                Interest Saved
              </span>
              <span className="text-xl font-bold font-mono-data text-[#059669] mt-0.5 block">
                {formatINR(payoffPlan.interestSavedMinor)}
              </span>
              <span className="text-[11px] text-[#52504C] mt-0.5 block">
                By accelerating high-cost debt
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
              <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
                Total Active Debt
              </span>
              <span className="text-xl font-bold font-mono-data text-[#111318] mt-0.5 block">
                {formatINR(payoffPlan.totalDebtMinor)}
              </span>
              <span className="text-[11px] text-[#52504C] mt-0.5 block">
                Across {payoffPlan.items.length} accounts
              </span>
            </div>
          </div>

          {payoffPlan.items.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-[#111318] block">
                Prioritized Payoff Order (
                {payoffStrategy === 'avalanche' ? 'Highest APR First' : 'Smallest Balance First'}):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {payoffPlan.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-[#111318] flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-[#111318] text-[#E5C158] text-[10px] font-mono font-bold flex items-center justify-center">
                          #{item.payoffOrder}
                        </span>
                        <span>{item.name}</span>
                      </div>
                      <div className="text-[11px] text-[#52504C] mt-0.5 font-mono">
                        {(item.aprBps / 100).toFixed(1)}% APR · Cleared in {item.planMonths} mo
                      </div>
                    </div>
                    <span className="font-mono font-bold text-[#111318]">
                      {formatINR(item.balanceMinor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
