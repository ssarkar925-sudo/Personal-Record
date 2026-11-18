import React from 'react';
import { Badge, SortSelect } from '../../components/ui/Primitives.tsx';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type {
  CardSortOption,
  BankSortOption,
  LoanSortOption,
  DueSortOption,
  ReportTab,
} from './types.ts';

interface AccountsPortfolioReportsProps {
  reportTab: ReportTab;
  data: DetailedReports;
  cardSort: CardSortOption;
  bankSort: BankSortOption;
  loanSort: LoanSortOption;
  dueSort: DueSortOption;
  onCardSortChange: (val: CardSortOption) => void;
  onBankSortChange: (val: BankSortOption) => void;
  onLoanSortChange: (val: LoanSortOption) => void;
  onDueSortChange: (val: DueSortOption) => void;
}

export const AccountsPortfolioReports: React.FC<AccountsPortfolioReportsProps> = ({
  reportTab,
  data,
  cardSort,
  bankSort,
  loanSort,
  dueSort,
  onCardSortChange,
  onBankSortChange,
  onLoanSortChange,
  onDueSortChange,
}) => {
  const cardAccounts = (data.accountActivity.filter((a) => a.type === 'credit_card') ?? [])
    .slice()
    .sort((a, b) => {
      if (cardSort === 'util_desc')
        return (b.cardCycle?.utilizationPct ?? 0) - (a.cardCycle?.utilizationPct ?? 0);
      if (cardSort === 'spend_desc') return b.periodOutflowMinor - a.periodOutflowMinor;
      if (cardSort === 'name_asc') return a.name.localeCompare(b.name);
      return (b.cardCycle?.statementDueMinor ?? 0) - (a.cardCycle?.statementDueMinor ?? 0);
    });

  const bankAccounts = (data.accountActivity.filter((a) => a.type === 'bank') ?? [])
    .slice()
    .sort((a, b) => {
      if (bankSort === 'inflow_desc') return b.periodInflowMinor - a.periodInflowMinor;
      if (bankSort === 'name_asc') return a.name.localeCompare(b.name);
      return b.currentBalanceMinor - a.currentBalanceMinor;
    });

  const sortedLoans = (data.loans ?? []).slice().sort((a, b) => {
    if (loanSort === 'interest_desc') return b.totalInterestPaidMinor - a.totalInterestPaidMinor;
    if (loanSort === 'name_asc') return a.name.localeCompare(b.name);
    return b.remainingMinor - a.remainingMinor;
  });

  const sortedOpenDues = (data.dues.filter((d) => d.status !== 'settled') ?? [])
    .slice()
    .sort((a, b) => {
      if (dueSort === 'due_date')
        return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
      if (dueSort === 'person_asc') return a.personName.localeCompare(b.personName);
      return b.remainingMinor - a.remainingMinor;
    });

  return (
    <div className="space-y-5">
      {/* 1. CREDIT CARDS REPORT */}
      {reportTab === 'cards' && (
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
                REVOLVING CREDIT SCHEDULE
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Credit Card Statement &amp; Spend Report
              </h2>
            </div>
            <SortSelect
              label="Sort Cards"
              value={cardSort}
              onChange={(v) => onCardSortChange(v as CardSortOption)}
              options={[
                { value: 'due_desc', label: 'Statement Due: High → Low' },
                { value: 'util_desc', label: 'Utilization: High → Low' },
                { value: 'spend_desc', label: 'Period Spend: High → Low' },
                { value: 'name_asc', label: 'Card: A → Z' },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 pr-3 font-bold">Card Name</th>
                  <th className="py-2.5 pr-3 font-bold">Scope</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Statement Due</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Unbilled</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Period Spend</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Period Paid</th>
                  <th className="py-2.5 text-right font-bold">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E1D6]/60 font-mono">
                {cardAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#52504C] text-xs font-sans">
                      No active credit cards registered in this scope.
                    </td>
                  </tr>
                ) : (
                  cardAccounts.map((c) => {
                    const util = c.cardCycle?.utilizationPct ?? 0;
                    return (
                      <tr key={c.id} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-3 pr-3 font-sans font-semibold text-[#111318]">
                          {c.name}
                          {c.last4 && (
                            <span className="ml-1 text-[#52504C] font-mono font-normal">
                              ••{c.last4}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 font-sans">
                          <Badge className={SCOPE_META[c.scope].badgeClass}>
                            {SCOPE_META[c.scope].label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-right font-bold text-[#111318]">
                          {formatINR(c.cardCycle?.statementDueMinor ?? 0)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#52504C]">
                          {formatINR(c.cardCycle?.unbilledMinor ?? 0)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#E11D48] font-semibold">
                          -{formatINR(c.periodOutflowMinor)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#059669] font-semibold">
                          +{formatINR(c.periodInflowMinor)}
                        </td>
                        <td className="py-3 text-right">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              util >= 50
                                ? 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                                : util >= 30
                                  ? 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/25'
                                  : 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                            }`}
                          >
                            {util}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. BANK ACCOUNTS REPORT */}
      {reportTab === 'banks' && (
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#059669] font-bold block">
                TREASURY RECONCILIATION
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Bank Ledger Activity &amp; Current Balances
              </h2>
            </div>
            <SortSelect
              label="Sort Banks"
              value={bankSort}
              onChange={(v) => onBankSortChange(v as BankSortOption)}
              options={[
                { value: 'balance_desc', label: 'Closing Balance: High → Low' },
                { value: 'inflow_desc', label: 'Period Inflow: High → Low' },
                { value: 'name_asc', label: 'Bank: A → Z' },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 pr-3 font-bold">Bank Account</th>
                  <th className="py-2.5 pr-3 font-bold">Scope</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Period Inflow</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Period Outflow</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Net Flow</th>
                  <th className="py-2.5 text-right font-bold">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E1D6]/60 font-mono">
                {bankAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#52504C] text-xs font-sans">
                      No bank accounts registered in this scope.
                    </td>
                  </tr>
                ) : (
                  bankAccounts.map((b) => {
                    const netFlow = b.periodInflowMinor - b.periodOutflowMinor;
                    return (
                      <tr key={b.id} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-3 pr-3 font-sans font-semibold text-[#111318]">
                          {b.name}
                          {b.last4 && (
                            <span className="ml-1 text-[#52504C] font-mono font-normal">
                              ••{b.last4}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 font-sans">
                          <Badge className={SCOPE_META[b.scope].badgeClass}>
                            {SCOPE_META[b.scope].label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-right text-[#059669] font-semibold">
                          +{formatINR(b.periodInflowMinor)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#E11D48] font-semibold">
                          -{formatINR(b.periodOutflowMinor)}
                        </td>
                        <td
                          className={`py-3 pr-3 text-right font-bold ${
                            netFlow >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
                          }`}
                        >
                          {formatINR(netFlow, { signed: true })}
                        </td>
                        <td className="py-3 text-right font-bold text-[#111318]">
                          {formatINR(b.currentBalanceMinor)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. LOAN PORTFOLIO REPORT */}
      {reportTab === 'loans' && (
        <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C59B27] font-bold block">
                AMORTIZATION AUDIT
              </span>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                Loan Portfolio &amp; Amortization Report
              </h2>
            </div>
            <SortSelect
              label="Sort Loans"
              value={loanSort}
              onChange={(v) => onLoanSortChange(v as LoanSortOption)}
              options={[
                { value: 'remaining_desc', label: 'Remaining: High → Low' },
                { value: 'interest_desc', label: 'Interest Paid: High → Low' },
                { value: 'name_asc', label: 'Name: A → Z' },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 pr-3 font-bold">Loan Facility</th>
                  <th className="py-2.5 pr-3 font-bold">Type</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Original Principal</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Remaining Balance</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Principal Cleared</th>
                  <th className="py-2.5 pr-3 font-bold text-right">Interest Paid</th>
                  <th className="py-2.5 text-right font-bold">Cleared %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E1D6]/60 font-mono">
                {sortedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#52504C] text-xs font-sans">
                      No loans registered in this scope.
                    </td>
                  </tr>
                ) : (
                  sortedLoans.map((l) => {
                    const clearedPct =
                      l.principalMinor > 0
                        ? Math.min(
                            100,
                            Math.round(
                              ((l.principalMinor - l.remainingMinor) / l.principalMinor) * 100,
                            ),
                          )
                        : 0;
                    return (
                      <tr key={l.id} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-3 pr-3 font-sans font-semibold text-[#111318]">
                          {l.name}
                        </td>
                        <td className="py-3 pr-3 font-sans">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              l.direction === 'borrowed'
                                ? 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                                : 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                            }`}
                          >
                            {l.direction === 'borrowed' ? 'Liability' : 'Asset (Lent)'}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right text-[#52504C]">
                          {formatINR(l.principalMinor)}
                        </td>
                        <td className="py-3 pr-3 text-right font-bold text-[#111318]">
                          {formatINR(l.remainingMinor)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#059669] font-semibold">
                          {formatINR(l.totalPrincipalPaidMinor)}
                        </td>
                        <td className="py-3 pr-3 text-right text-[#C59B27] font-semibold">
                          {formatINR(l.totalInterestPaidMinor)}
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#111318] border border-[#E6E1D6]">
                            {clearedPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. KHATABOOK DUES REPORT */}
      {reportTab === 'dues' && (
        <div className="space-y-4">
          {/* Aging KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl p-4 border border-[#E11D48]/25 bg-[#E11D48]/6">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#52504C] font-bold">
                Overdue Dues
              </div>
              <div className="text-lg font-bold font-mono-data text-[#E11D48] tabular-nums mt-0.5">
                {formatINR(data.duesAging.overdueMinor)}
              </div>
            </div>
            <div className="rounded-2xl p-4 border border-[#C59B27]/35 bg-[#C59B27]/10">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#52504C] font-bold">
                Due in 7 Days
              </div>
              <div className="text-lg font-bold font-mono-data text-[#111318] tabular-nums mt-0.5">
                {formatINR(data.duesAging.dueSoonMinor)}
              </div>
            </div>
            <div className="rounded-2xl p-4 border border-[#E6E1D6] bg-white">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#52504C] font-bold">
                Upcoming / Rolling
              </div>
              <div className="text-lg font-bold font-mono-data text-[#111318] tabular-nums mt-0.5">
                {formatINR(data.duesAging.upcomingMinor)}
              </div>
            </div>
            <div className="rounded-2xl p-4 border border-[#059669]/25 bg-[#059669]/8">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#52504C] font-bold">
                Settled Volume
              </div>
              <div className="text-lg font-bold font-mono-data text-[#059669] tabular-nums mt-0.5">
                {formatINR(data.duesAging.settledMinor)}
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5 border border-[#E6E1D6] bg-white shadow-[0_8px_24px_rgba(17,19,24,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#059669] font-bold block">
                  KHATABOOK COUNTERPARTY SCHEDULE
                </span>
                <h2 className="font-display text-sm font-bold text-[#111318]">
                  Open &amp; Overdue People Balances
                </h2>
              </div>
              <SortSelect
                label="Sort Dues"
                value={dueSort}
                onChange={(v) => onDueSortChange(v as DueSortOption)}
                options={[
                  { value: 'remaining_desc', label: 'Balance: High → Low' },
                  { value: 'due_date', label: 'Due Date: Soonest' },
                  { value: 'person_asc', label: 'Person: A → Z' },
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-[#E6E1D6] text-[#52504C] font-mono uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 pr-3 font-bold">Person</th>
                    <th className="py-2.5 pr-3 font-bold">Direction</th>
                    <th className="py-2.5 pr-3 font-bold">Scope</th>
                    <th className="py-2.5 pr-3 font-bold">Due Date</th>
                    <th className="py-2.5 text-right font-bold">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E1D6]/60 font-mono">
                  {sortedOpenDues.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#52504C] text-xs font-sans">
                        No unsettled dues in this scope.
                      </td>
                    </tr>
                  ) : (
                    sortedOpenDues.map((d) => (
                      <tr key={d.id} className="hover:bg-[#FAF8F5] transition-colors">
                        <td className="py-3 pr-3 font-sans font-semibold text-[#111318]">
                          {d.personName}
                        </td>
                        <td className="py-3 pr-3 font-sans">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              d.direction === 'need'
                                ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                                : 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                            }`}
                          >
                            {d.direction === 'need' ? 'Owed to You' : 'You Owe'}
                          </span>
                        </td>
                        <td className="py-3 pr-3 font-sans">
                          <Badge className={SCOPE_META[d.scope].badgeClass}>
                            {SCOPE_META[d.scope].label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-[#52504C]">{d.dueDate || '—'}</td>
                        <td className="py-3 text-right font-bold text-[#111318]">
                          {formatINR(d.remainingMinor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
