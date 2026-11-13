import React from 'react';
import { Badge, Card, SortSelect } from '../../components/ui/Primitives.tsx';
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
  // Sorted Card Accounts
  const cardAccounts = (data.accountActivity.filter((a) => a.type === 'credit_card') ?? []).slice().sort((a, b) => {
    if (cardSort === 'util_desc') return (b.cardCycle?.utilizationPct ?? 0) - (a.cardCycle?.utilizationPct ?? 0);
    if (cardSort === 'spend_desc') return b.periodOutflowMinor - a.periodOutflowMinor;
    if (cardSort === 'name_asc') return a.name.localeCompare(b.name);
    return (b.cardCycle?.statementDueMinor ?? 0) - (a.cardCycle?.statementDueMinor ?? 0);
  });

  // Sorted Bank Accounts
  const bankAccounts = (data.accountActivity.filter((a) => a.type === 'bank') ?? []).slice().sort((a, b) => {
    if (bankSort === 'inflow_desc') return b.periodInflowMinor - a.periodInflowMinor;
    if (bankSort === 'name_asc') return a.name.localeCompare(b.name);
    return b.currentBalanceMinor - a.currentBalanceMinor;
  });

  // Sorted Loans
  const sortedLoans = (data.loans ?? []).slice().sort((a, b) => {
    if (loanSort === 'interest_desc') return b.totalInterestPaidMinor - a.totalInterestPaidMinor;
    if (loanSort === 'name_asc') return a.name.localeCompare(b.name);
    return b.remainingMinor - a.remainingMinor;
  });

  // Sorted Open Dues
  const sortedOpenDues = (data.dues.filter((d) => d.status !== 'settled') ?? []).slice().sort((a, b) => {
    if (dueSort === 'due_date') return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
    if (dueSort === 'person_asc') return a.personName.localeCompare(b.personName);
    return b.remainingMinor - a.remainingMinor;
  });

  return (
    <div className="space-y-4">
      {/* 1. CREDIT CARDS REPORT */}
      {reportTab === 'cards' && (
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Credit Card Statement &amp; Spend Report</h2>
              <p className="text-xs text-slate-500">Billed statement dues, unbilled rolling balance, and utilization</p>
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
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Card Name</th>
                  <th className="py-2.5 pr-3 font-medium">Scope</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Statement Due</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Unbilled</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Period Spend</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Period Paid</th>
                  <th className="py-2.5 text-right font-medium">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cardAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      No active credit cards registered in this scope.
                    </td>
                  </tr>
                ) : (
                  cardAccounts.map((c) => {
                    const util = c.cardCycle?.utilizationPct ?? 0;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">
                          {c.name}
                          {c.last4 && <span className="ml-1 text-slate-400 font-normal">••• {c.last4}</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge className={SCOPE_META[c.scope].badgeClass}>{SCOPE_META[c.scope].label}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">
                          {formatINR(c.cardCycle?.statementDueMinor ?? 0)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">
                          {formatINR(c.cardCycle?.unbilledMinor ?? 0)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-rose-700 font-medium">
                          -{formatINR(c.periodOutflowMinor)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-emerald-700 font-medium">
                          +{formatINR(c.periodInflowMinor)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            className={
                              util >= 50
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : util >= 30
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }
                          >
                            {util}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 2. BANK ACCOUNTS REPORT */}
      {reportTab === 'banks' && (
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Bank Ledger Activity &amp; Current Balances</h2>
              <p className="text-xs text-slate-500">Savings &amp; current account reconciliation, net cashflow delta</p>
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
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Bank Account</th>
                  <th className="py-2.5 pr-3 font-medium">Scope</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Period Inflow</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Period Outflow</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Net Flow</th>
                  <th className="py-2.5 text-right font-medium">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bankAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No bank accounts registered in this scope.
                    </td>
                  </tr>
                ) : (
                  bankAccounts.map((b) => {
                    const netFlow = b.periodInflowMinor - b.periodOutflowMinor;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">
                          {b.name}
                          {b.last4 && <span className="ml-1 text-slate-400 font-normal">••• {b.last4}</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge className={SCOPE_META[b.scope].badgeClass}>{SCOPE_META[b.scope].label}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-emerald-700 font-medium">
                          +{formatINR(b.periodInflowMinor)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-rose-700 font-medium">
                          -{formatINR(b.periodOutflowMinor)}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-semibold ${
                            netFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {formatINR(netFlow, { signed: true })}
                        </td>
                        <td className="py-2.5 text-right font-bold text-slate-950">
                          {formatINR(b.currentBalanceMinor)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 3. LOAN PORTFOLIO REPORT */}
      {reportTab === 'loans' && (
        <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Loan Portfolio &amp; Amortization Report</h2>
              <p className="text-xs text-slate-500">Principal clearance velocity vs. interest expenses paid</p>
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
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Loan Facility</th>
                  <th className="py-2.5 pr-3 font-medium">Type</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Original Principal</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Remaining Balance</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Principal Cleared</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Interest Paid</th>
                  <th className="py-2.5 text-right font-medium">Cleared %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      No loans registered in this scope.
                    </td>
                  </tr>
                ) : (
                  sortedLoans.map((l) => {
                    const clearedPct =
                      l.principalMinor > 0
                        ? Math.min(100, Math.round(((l.principalMinor - l.remainingMinor) / l.principalMinor) * 100))
                        : 0;
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{l.name}</td>
                        <td className="py-2.5 pr-3">
                          <Badge
                            className={
                              l.direction === 'borrowed'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }
                          >
                            {l.direction === 'borrowed' ? 'Liability' : 'Asset (Lent)'}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right">{formatINR(l.principalMinor)}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">
                          {formatINR(l.remainingMinor)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-emerald-700 font-medium">
                          {formatINR(l.totalPrincipalPaidMinor)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-amber-700 font-medium">
                          {formatINR(l.totalInterestPaidMinor)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            className={
                              clearedPct >= 75
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : clearedPct >= 40
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                            }
                          >
                            {clearedPct}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. KHATABOOK DUES REPORT */}
      {reportTab === 'dues' && (
        <div className="space-y-4">
          {/* Aging KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-3.5 border-rose-200 bg-rose-50/30">
              <div className="text-[11px] text-slate-500 font-medium">Overdue Dues</div>
              <div className="text-lg font-bold text-rose-700 tabular-nums mt-0.5">
                {formatINR(data.duesAging.overdueMinor)}
              </div>
            </Card>
            <Card className="p-3.5 border-amber-200 bg-amber-50/30">
              <div className="text-[11px] text-slate-500 font-medium">Due in 7 Days</div>
              <div className="text-lg font-bold text-amber-700 tabular-nums mt-0.5">
                {formatINR(data.duesAging.dueSoonMinor)}
              </div>
            </Card>
            <Card className="p-3.5 border-slate-200 bg-white">
              <div className="text-[11px] text-slate-500 font-medium">Upcoming / Rolling</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                {formatINR(data.duesAging.upcomingMinor)}
              </div>
            </Card>
            <Card className="p-3.5 border-emerald-200 bg-emerald-50/30">
              <div className="text-[11px] text-slate-500 font-medium">Settled Volume</div>
              <div className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                {formatINR(data.duesAging.settledMinor)}
              </div>
            </Card>
          </div>

          <Card className="p-4 border-slate-200/90 bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Open &amp; Overdue People Balances</h2>
                <p className="text-xs text-slate-500">Unsettled Udhar &amp; informal personal loans ledger</p>
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
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Person</th>
                    <th className="py-2.5 pr-3 font-medium">Direction</th>
                    <th className="py-2.5 pr-3 font-medium">Scope</th>
                    <th className="py-2.5 pr-3 font-medium">Due Date</th>
                    <th className="py-2.5 text-right font-medium">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedOpenDues.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                        No unsettled dues in this scope.
                      </td>
                    </tr>
                  ) : (
                    sortedOpenDues.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{d.personName}</td>
                        <td className="py-2.5 pr-3">
                          <Badge
                            className={
                              d.direction === 'need'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }
                          >
                            {d.direction === 'need' ? 'Need From' : 'Give To'}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge className={SCOPE_META[d.scope].badgeClass}>{SCOPE_META[d.scope].label}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{d.dueDate || '—'}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {formatINR(d.remainingMinor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
