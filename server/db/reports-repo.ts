import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  NOTE_COLORS,
  type Scope,
  addMonthsISO,
  daysBetweenISO,
  todayISO,
} from '../../shared/ledger-core.ts';
import { listAccounts } from './accounts-repo.ts';
import {
  listCategoryBudgets,
  listCategoryRules,
  listInvestments,
  listLoans,
  listPeopleDues,
  listRecurringBills,
  listSavingsGoals,
  listScopeBudgets,
  listTransactions,
  summarizeDuesByPerson,
} from './ledger-repo.ts';
import { listNotes } from './notes-repo.ts';
import { getVaultMeta, listVaultEntries } from './vault-repo.ts';
import { listAlertDeliveries } from './alerts-repo.ts';
import { withTransaction } from './schema.ts';

export interface AttentionItem {
  id: string;
  module: 'credit_cards' | 'banks' | 'loans' | 'people_dues' | 'recurring' | 'notes';
  severity: 'urgent' | 'warning' | 'info';
  scope: Scope | 'general';
  title: string;
  subtitle: string;
  amountMinor?: number;
  dueDate?: string;
}

export function getDashboardSummary(
  db: DatabaseSync,
  scopeFilter?: Scope,
  referenceDate: string = todayISO(),
) {
  const allAccounts = listAccounts(db, referenceDate);
  const accounts = scopeFilter ? allAccounts.filter((a) => a.scope === scopeFilter) : allAccounts;
  const banks = accounts.filter((a) => a.type === 'bank');
  const cards = accounts.filter((a) => a.type === 'credit_card');

  const bankTotalsByScope: Record<Scope, number> = { personal: 0, business: 0, family: 0 };
  for (const b of allAccounts.filter((a) => a.type === 'bank')) {
    bankTotalsByScope[b.scope] += b.currentBalanceMinor;
  }

  const totalBankMinor = banks.reduce((sum, b) => sum + b.currentBalanceMinor, 0);
  const totalCardDebtMinor = cards.reduce(
    (sum, c) => sum + (c.cardCycle?.totalOutstandingMinor ?? 0),
    0,
  );
  const totalCardLimitMinor = cards.reduce((sum, c) => sum + c.creditLimitMinor, 0);

  const loans = listLoans(db).filter((l) => l.status === 'active' && (!scopeFilter || l.scope === scopeFilter));
  const totalBorrowedRemainingMinor = loans
    .filter((l) => l.direction === 'borrowed')
    .reduce((sum, l) => sum + l.remainingMinor, 0);
  const totalLentRemainingMinor = loans
    .filter((l) => l.direction === 'lent')
    .reduce((sum, l) => sum + l.remainingMinor, 0);

  const openDues = listPeopleDues(db).filter(
    (d) => d.status !== 'settled' && (!scopeFilter || d.scope === scopeFilter),
  );
  const totalGiveMinor = openDues
    .filter((d) => d.direction === 'give')
    .reduce((sum, d) => sum + d.remainingMinor, 0);
  const totalNeedMinor = openDues
    .filter((d) => d.direction === 'need')
    .reduce((sum, d) => sum + d.remainingMinor, 0);

  const allInvestments = listInvestments(db).filter((i) => !scopeFilter || i.scope === scopeFilter);
  const totalInvestmentsMinor = allInvestments.reduce((sum, i) => sum + i.currentValueMinor, 0);

  const netWorthMinor =
    totalBankMinor +
    totalInvestmentsMinor +
    totalLentRemainingMinor +
    totalNeedMinor -
    totalCardDebtMinor -
    totalBorrowedRemainingMinor -
    totalGiveMinor;

  const monthPrefix = referenceDate.slice(0, 7);
  const allTx = listTransactions(db, { scope: scopeFilter, limit: 2000 });
  const monthTx = allTx.filter((t) => t.occurredAt.startsWith(monthPrefix));

  const monthByScope: Record<Scope, { incomeMinor: number; expenseMinor: number }> = {
    personal: { incomeMinor: 0, expenseMinor: 0 },
    business: { incomeMinor: 0, expenseMinor: 0 },
    family: { incomeMinor: 0, expenseMinor: 0 },
  };
  let monthIncomeMinor = 0;
  let monthExpenseMinor = 0;

  for (const t of monthTx) {
    if (t.kind === 'income') {
      monthIncomeMinor += t.amountMinor;
      monthByScope[t.scope].incomeMinor += t.amountMinor;
    } else if (t.kind === 'expense') {
      monthExpenseMinor += t.amountMinor;
      monthByScope[t.scope].expenseMinor += t.amountMinor;
    }
  }

  // Last 6 months trend for animated charts
  const sixMonthTrend: Array<{
    month: string;
    incomeMinor: number;
    expenseMinor: number;
    personalExpenseMinor: number;
    businessExpenseMinor: number;
    familyExpenseMinor: number;
  }> = [];
  for (let offset = -5; offset <= 0; offset++) {
    const m = addMonthsISO(`${monthPrefix}-01`, offset).slice(0, 7);
    const mTx = allTx.filter((t) => t.occurredAt.startsWith(m));
    let inc = 0;
    let exp = 0;
    let pExp = 0;
    let bExp = 0;
    let fExp = 0;
    for (const t of mTx) {
      if (t.kind === 'income') inc += t.amountMinor;
      else if (t.kind === 'expense') {
        exp += t.amountMinor;
        if (t.scope === 'personal') pExp += t.amountMinor;
        else if (t.scope === 'business') bExp += t.amountMinor;
        else fExp += t.amountMinor;
      }
    }
    sixMonthTrend.push({
      month: m,
      incomeMinor: inc,
      expenseMinor: exp,
      personalExpenseMinor: pExp,
      businessExpenseMinor: bExp,
      familyExpenseMinor: fExp,
    });
  }

  // Attention Queue
  const attentionQueue: AttentionItem[] = [];
  for (const c of cards) {
    if (!c.cardCycle) continue;
    if (c.cardCycle.statementDueMinor > 0 && c.cardCycle.daysUntilDue <= 5) {
      attentionQueue.push({
        id: `cc-${c.id}`,
        module: 'credit_cards',
        severity: c.cardCycle.daysUntilDue <= 0 ? 'urgent' : 'warning',
        scope: c.scope,
        title: `${c.name} bill ${c.cardCycle.daysUntilDue < 0 ? 'overdue' : 'due'}`,
        subtitle: `Due ${c.cardCycle.nextDueDate} (${c.cardCycle.daysUntilDue}d)`,
        amountMinor: c.cardCycle.statementDueMinor,
        dueDate: c.cardCycle.nextDueDate,
      });
    }
    if (c.cardCycle.utilizationPct >= 75) {
      attentionQueue.push({
        id: `cc-util-${c.id}`,
        module: 'credit_cards',
        severity: 'warning',
        scope: c.scope,
        title: `${c.name} utilization at ${c.cardCycle.utilizationPct}%`,
        subtitle: 'High credit usage',
        amountMinor: c.cardCycle.totalOutstandingMinor,
      });
    }
  }

  for (const b of banks) {
    if (b.minBalanceMinor > 0 && b.currentBalanceMinor < b.minBalanceMinor) {
      attentionQueue.push({
        id: `bank-${b.id}`,
        module: 'banks',
        severity: 'urgent',
        scope: b.scope,
        title: `${b.name} below minimum balance`,
        subtitle: `Minimum target set`,
        amountMinor: b.currentBalanceMinor,
      });
    }
  }

  for (const l of loans) {
    const delta = daysBetweenISO(referenceDate, l.nextDueDate);
    if (delta <= 5) {
      attentionQueue.push({
        id: `loan-${l.id}`,
        module: 'loans',
        severity: delta <= 0 ? 'urgent' : 'warning',
        scope: l.scope,
        title: `${l.name} (${l.direction === 'borrowed' ? 'Pay EMI' : 'Collect EMI'})`,
        subtitle: `${l.counterparty} · Due ${l.nextDueDate}`,
        amountMinor: l.emiMinor || l.remainingMinor,
        dueDate: l.nextDueDate,
      });
    }
  }

  for (const d of openDues) {
    if (!d.dueDate) continue;
    const delta = daysBetweenISO(referenceDate, d.dueDate);
    if (delta <= 3) {
      attentionQueue.push({
        id: `due-${d.id}`,
        module: 'people_dues',
        severity: delta < 0 ? 'urgent' : 'warning',
        scope: d.scope,
        title: `${d.direction === 'give' ? 'Give to' : 'Need from'} ${d.personName}`,
        subtitle: `Due ${d.dueDate}`,
        amountMinor: d.remainingMinor,
        dueDate: d.dueDate,
      });
    }
  }

  const recurring = listRecurringBills(db).filter(
    (r) => r.active && r.lastPaidMonth !== monthPrefix && (!scopeFilter || r.scope === scopeFilter),
  );
  const todayDay = Number(referenceDate.slice(8, 10));
  for (const r of recurring) {
    const delta = r.dueDay - todayDay;
    if (delta <= 4) {
      attentionQueue.push({
        id: `rec-${r.id}`,
        module: 'recurring',
        severity: delta < 0 ? 'urgent' : 'info',
        scope: r.scope,
        title: `Recurring: ${r.title}`,
        subtitle: `Due day ${r.dueDay} · ${r.accountName}`,
        amountMinor: r.amountMinor,
      });
    }
  }

  const severityOrder = { urgent: 0, warning: 1, info: 2 };
  attentionQueue.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const notes = listNotes(db, { includeArchived: false }).filter(
    (n) => !scopeFilter || n.scope === scopeFilter || n.scope === 'general',
  );
  const pinnedNotes = notes.filter((n) => n.pinned).slice(0, 4);

  // Unbiased month spending across all scopes (never zeroed out when dashboard scopeFilter !== 'all')
  const allMonthTx = scopeFilter
    ? listTransactions(db, { fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-31`, limit: 5000 })
    : monthTx;
  const allMonthExpenseByScope: Record<Scope, number> = { personal: 0, business: 0, family: 0 };
  for (const t of allMonthTx) {
    if (t.kind === 'expense') allMonthExpenseByScope[t.scope] += t.amountMinor;
  }

  // Category breakdown for current month (respects scopeFilter)
  const catTotals = new Map<string, number>();
  for (const t of monthTx) {
    if (t.kind === 'expense') {
      catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amountMinor);
    }
  }
  const monthTopCategories = Array.from(catTotals.entries())
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, 5);

  const budgets = listScopeBudgets(db).map((b) => ({
    scope: b.scope,
    monthlyLimitMinor: b.monthlyLimitMinor,
    spentMinor: allMonthExpenseByScope[b.scope],
  }));

  const allCategoryBudgets = listCategoryBudgets(db);
  const categoryBudgets = allCategoryBudgets
    .filter((b) => !scopeFilter || b.scope === scopeFilter)
    .map((b) => {
      let spent = 0;
      for (const t of monthTx) {
        if (
          t.kind === 'expense' &&
          t.scope === b.scope &&
          t.category.trim().toLowerCase() === b.category.trim().toLowerCase()
        ) {
          spent += t.amountMinor;
        }
      }
      return {
        id: b.id,
        scope: b.scope,
        category: b.category,
        monthlyLimitMinor: b.monthlyLimitMinor,
        spentMinor: spent,
        pct: Math.round((spent / b.monthlyLimitMinor) * 100),
      };
    });

  const alerts = listAlertDeliveries(db, 20);
  const unreadInAppCount = alerts.filter((a) => a.channel === 'in_app' && a.status === 'pending').length;

  return {
    referenceDate,
    netWorthMinor,
    totalBankMinor,
    totalInvestmentsMinor,
    bankTotalsByScope,
    totalCardDebtMinor,
    totalCardLimitMinor,
    totalBorrowedRemainingMinor,
    totalLentRemainingMinor,
    totalGiveMinor,
    totalNeedMinor,
    monthIncomeMinor,
    monthExpenseMinor,
    monthByScope,
    allMonthExpenseByScope,
    monthTopCategories,
    sixMonthTrend,
    banks,
    cards,
    loans,
    dueSummariesByPerson: summarizeDuesByPerson(openDues).slice(0, 6),
    attentionQueue: attentionQueue.slice(0, 12),
    pinnedNotes,
    recentTransactions: allTx.slice(0, 8),
    budgets,
    categoryBudgets,
    unreadInAppCount,
  };
}

export function getDetailedReports(
  db: DatabaseSync,
  filters: { fromDate: string; toDate: string; scope?: Scope },
  referenceDate: string = todayISO(),
) {
  const txList = listTransactions(db, {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    scope: filters.scope,
    limit: 5000,
  });

  // 1. Cashflow P&L by Scope & Month
  const monthlyMap = new Map<
    string,
    { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }
  >();
  const scopePnl: Record<Scope, { incomeMinor: number; expenseMinor: number; netMinor: number }> = {
    personal: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
    business: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
    family: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  };
  const categoryMap = new Map<string, { category: string; scope: Scope; kind: 'income' | 'expense'; totalMinor: number; count: number }>();

  for (const tx of txList) {
    if (tx.kind === 'transfer') continue;
    const month = tx.occurredAt.slice(0, 7);
    const mEntry = monthlyMap.get(month) ?? { month, incomeMinor: 0, expenseMinor: 0, netMinor: 0 };
    if (tx.kind === 'income') {
      mEntry.incomeMinor += tx.amountMinor;
      scopePnl[tx.scope].incomeMinor += tx.amountMinor;
    } else {
      mEntry.expenseMinor += tx.amountMinor;
      scopePnl[tx.scope].expenseMinor += tx.amountMinor;
    }
    mEntry.netMinor = mEntry.incomeMinor - mEntry.expenseMinor;
    scopePnl[tx.scope].netMinor = scopePnl[tx.scope].incomeMinor - scopePnl[tx.scope].expenseMinor;
    monthlyMap.set(month, mEntry);

    const catKey = `${tx.kind}:${tx.scope}:${tx.category}`;
    const cat = categoryMap.get(catKey) ?? {
      category: tx.category,
      scope: tx.scope,
      kind: tx.kind,
      totalMinor: 0,
      count: 0,
    };
    cat.totalMinor += tx.amountMinor;
    cat.count += 1;
    categoryMap.set(catKey, cat);
  }

  // 2. Account Inflow / Outflow over period
  const allAccounts = listAccounts(db, referenceDate).filter((a) => !filters.scope || a.scope === filters.scope);
  const accountActivity = allAccounts.map((acc) => {
    let inflowMinor = 0;
    let outflowMinor = 0;
    for (const tx of txList) {
      if (tx.kind === 'income' && tx.accountId === acc.id) inflowMinor += tx.amountMinor;
      else if (tx.kind === 'expense' && tx.accountId === acc.id) outflowMinor += tx.amountMinor;
      else if (tx.kind === 'transfer') {
        if (tx.accountId === acc.id) outflowMinor += tx.amountMinor;
        if (tx.toAccountId === acc.id) inflowMinor += tx.amountMinor;
      }
    }
    return {
      ...acc,
      periodInflowMinor: inflowMinor,
      periodOutflowMinor: outflowMinor,
    };
  });

  // 3. Loans & Dues aging
  const loans = listLoans(db).filter((l) => !filters.scope || l.scope === filters.scope);
  const dues = listPeopleDues(db).filter((d) => !filters.scope || d.scope === filters.scope);
  const duesAging = {
    overdueMinor: 0,
    dueSoonMinor: 0,
    upcomingMinor: 0,
    settledMinor: 0,
  };
  for (const d of dues) {
    if (d.status === 'settled') {
      duesAging.settledMinor += d.amountMinor;
    } else if (d.dueDate) {
      const delta = daysBetweenISO(referenceDate, d.dueDate);
      if (delta < 0) duesAging.overdueMinor += d.remainingMinor;
      else if (delta <= 7) duesAging.dueSoonMinor += d.remainingMinor;
      else duesAging.upcomingMinor += d.remainingMinor;
    } else {
      duesAging.upcomingMinor += d.remainingMinor;
    }
  }

  return {
    monthlyCashflow: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    scopePnl,
    categories: Array.from(categoryMap.values()).sort((a, b) => b.totalMinor - a.totalMinor),
    accountActivity,
    loans,
    dues,
    duesByPerson: summarizeDuesByPerson(dues),
    duesAging,
    categoryBudgets: listCategoryBudgets(db),
    transactionCount: txList.length,
  };
}

export function exportTransactionsCSV(
  db: DatabaseSync,
  filters: { fromDate?: string; toDate?: string; scope?: Scope },
): string {
  const rows = listTransactions(db, { ...filters, limit: 10000 });
  const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;
  const header = ['Date', 'Kind', 'Scope', 'Account', 'To Account', 'Category', 'Amount (INR)', 'Party', 'Note'].join(',');
  const lines = rows.map((r) =>
    [
      r.occurredAt,
      r.kind,
      r.scope,
      escape(r.accountName),
      escape(r.toAccountName ?? ''),
      escape(r.category),
      (r.amountMinor / 100).toFixed(2),
      escape(r.party),
      escape(r.note),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export function getTaxSummaryPack(db: DatabaseSync, fyStartYear?: number, refDate: string = todayISO()) {
  const refYear = Number(refDate.slice(0, 4));
  const refMonth = Number(refDate.slice(5, 7));
  const startYear = fyStartYear ?? (refMonth >= 4 ? refYear : refYear - 1);
  const fromDate = `${startYear}-04-01`;
  const toDate = `${startYear + 1}-03-31`;
  const detailed = getDetailedReports(db, { fromDate, toDate }, refDate);

  const loanInterestRow = db
    .prepare(
      `SELECT COALESCE(SUM(lp.interest_minor), 0) AS total_interest,
              COALESCE(SUM(lp.principal_minor), 0) AS total_principal
       FROM loan_payments lp
       JOIN loans l ON l.id = lp.loan_id
       WHERE lp.paid_at >= ? AND lp.paid_at <= ? AND l.direction = 'borrowed'`,
    )
    .get(fromDate, toDate) as { total_interest: number; total_principal: number };

  const goals = listSavingsGoals(db);
  const taxReserveGoals = goals.filter((g) => g.kind === 'tax_reserve');
  const totalTaxReservedMinor = taxReserveGoals.reduce((s, g) => s + g.currentMinor, 0);
  const totalTaxTargetMinor = taxReserveGoals.reduce((s, g) => s + g.targetMinor, 0);
  const investments = listInvestments(db);
  const totalInvestedMinor = investments.reduce((s, i) => s + i.investedMinor, 0);

  const sec80cRegex = /ppf|elss|epf|life insurance|lic|tuition|school fee|provident|tax saver/i;
  const sec80dRegex = /health insurance|mediclaim|medical insurance|health policy|mediclaim/i;
  const sec80ttaRegex = /interest|dividend|savings interest/i;

  let estimated80cExpensesMinor = 0;
  let estimated80dExpensesMinor = 0;
  let estimatedOtherInterestMinor = 0;

  for (const cat of detailed.categories) {
    if (cat.kind === 'expense') {
      if (sec80cRegex.test(cat.category)) {
        estimated80cExpensesMinor += cat.totalMinor;
      }
      if (sec80dRegex.test(cat.category)) {
        estimated80dExpensesMinor += cat.totalMinor;
      }
    } else if (cat.kind === 'income') {
      if (sec80ttaRegex.test(cat.category)) {
        estimatedOtherInterestMinor += cat.totalMinor;
      }
    }
  }

  const allLoans = listLoans(db);
  const bankAccounts = listAccounts(db, refDate)
    .filter((a) => a.type === 'bank')
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      last4: a.last4,
      scope: a.scope,
      currentBalanceMinor: a.currentBalanceMinor,
    }));

  const quarters = [
    { quarter: 'Q1' as const, label: 'Q1 (Apr - Jun)', fromDate: `${startYear}-04-01`, toDate: `${startYear}-06-30` },
    { quarter: 'Q2' as const, label: 'Q2 (Jul - Sep)', fromDate: `${startYear}-07-01`, toDate: `${startYear}-09-30` },
    { quarter: 'Q3' as const, label: 'Q3 (Oct - Dec)', fromDate: `${startYear}-10-01`, toDate: `${startYear}-12-31` },
    { quarter: 'Q4' as const, label: 'Q4 (Jan - Mar)', fromDate: `${startYear + 1}-01-01`, toDate: `${startYear + 1}-03-31` },
  ];

  const quarterlyPnl = quarters.map((q) => {
    const qRep = getDetailedReports(db, { fromDate: q.fromDate, toDate: q.toDate }, refDate);
    const totalIncomeMinor = qRep.scopePnl.personal.incomeMinor + qRep.scopePnl.business.incomeMinor + qRep.scopePnl.family.incomeMinor;
    const totalExpenseMinor = qRep.scopePnl.personal.expenseMinor + qRep.scopePnl.business.expenseMinor + qRep.scopePnl.family.expenseMinor;
    return {
      quarter: q.quarter,
      label: q.label,
      fromDate: q.fromDate,
      toDate: q.toDate,
      totalIncomeMinor,
      totalExpenseMinor,
      businessNetMinor: qRep.scopePnl.business.netMinor,
      personalNetMinor: qRep.scopePnl.personal.netMinor,
      netMinor: totalIncomeMinor - totalExpenseMinor,
    };
  });

  return {
    fiscalYearLabel: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    fromDate,
    toDate,
    scopePnl: detailed.scopePnl,
    businessExpenseCategories: detailed.categories.filter((c) => c.scope === 'business' && c.kind === 'expense'),
    personalExpenseCategories: detailed.categories.filter((c) => c.scope === 'personal' && c.kind === 'expense'),
    incomeCategories: detailed.categories.filter((c) => c.kind === 'income'),
    loanInterestPaidMinor: Number(loanInterestRow.total_interest ?? 0),
    loanPrincipalPaidMinor: Number(loanInterestRow.total_principal ?? 0),
    totalTaxReservedMinor,
    totalTaxTargetMinor,
    totalInvestedMinor,
    transactionCount: detailed.transactionCount,
    bankAccounts,
    loans: allLoans,
    quarterlyPnl,
    investments,
    deductionEstimates: {
      estimated80cExpensesMinor,
      estimated80dExpensesMinor,
      estimatedOtherInterestMinor,
    },
  };
}

export function exportTaxPackCSV(db: DatabaseSync, fyStartYear?: number, refDate: string = todayISO()): string {
  const pack = getTaxSummaryPack(db, fyStartYear, refDate);
  const rows: string[] = [];

  rows.push(`"CHARTERED ACCOUNTANT TAX PACK & FINANCIAL DOSSIER"`);
  rows.push(`"Fiscal Year","${pack.fiscalYearLabel}","Period","${pack.fromDate} to ${pack.toDate}","Generated At","${refDate}"`);
  rows.push('');

  rows.push(`"--- SECTION 1: CONSOLIDATED P&L SUMMARY ---"`);
  rows.push(`"Scope","Income (INR)","Expense (INR)","Net Profit / Savings (INR)"`);
  rows.push(`"Business","${(pack.scopePnl.business.incomeMinor / 100).toFixed(2)}","${(pack.scopePnl.business.expenseMinor / 100).toFixed(2)}","${(pack.scopePnl.business.netMinor / 100).toFixed(2)}"`);
  rows.push(`"Personal","${(pack.scopePnl.personal.incomeMinor / 100).toFixed(2)}","${(pack.scopePnl.personal.expenseMinor / 100).toFixed(2)}","${(pack.scopePnl.personal.netMinor / 100).toFixed(2)}"`);
  rows.push(`"Family","${(pack.scopePnl.family.incomeMinor / 100).toFixed(2)}","${(pack.scopePnl.family.expenseMinor / 100).toFixed(2)}","${(pack.scopePnl.family.netMinor / 100).toFixed(2)}"`);
  rows.push('');

  rows.push(`"--- SECTION 2: QUARTERLY BREAKDOWN & ADVANCE TAX TRACING ---"`);
  rows.push(`"Quarter","Period","Total Income","Total Expense","Business Net","Personal Net","Consolidated Net"`);
  for (const q of pack.quarterlyPnl) {
    rows.push(`"${q.label}","${q.fromDate} to ${q.toDate}","${(q.totalIncomeMinor / 100).toFixed(2)}","${(q.totalExpenseMinor / 100).toFixed(2)}","${(q.businessNetMinor / 100).toFixed(2)}","${(q.personalNetMinor / 100).toFixed(2)}","${(q.netMinor / 100).toFixed(2)}"`);
  }
  rows.push('');

  rows.push(`"--- SECTION 3: BUSINESS DEDUCTIBLE EXPENSE SCHEDULE ---"`);
  rows.push(`"Category","Transaction Count","Total Spend (INR)"`);
  for (const c of pack.businessExpenseCategories) {
    rows.push(`"${c.category}","${c.count}","${(c.totalMinor / 100).toFixed(2)}"`);
  }
  rows.push('');

  rows.push(`"--- SECTION 4: DEDUCTION ESTIMATES & HOME LOAN INTEREST ---"`);
  rows.push(`"Item","Description","Eligible / Paid Amount (INR)"`);
  rows.push(`"Section 24(b) Home Loan Interest","Interest paid on borrowed loan","${(pack.loanInterestPaidMinor / 100).toFixed(2)}"`);
  rows.push(`"Section 80C Principal Repayment","Home loan principal repaid in FY","${(pack.loanPrincipalPaidMinor / 100).toFixed(2)}"`);
  rows.push(`"Section 80C Categorized Spends","PPF, ELSS, Insurance, School Fees","${(pack.deductionEstimates.estimated80cExpensesMinor / 100).toFixed(2)}"`);
  rows.push(`"Section 80D Mediclaim","Health insurance premiums recorded","${(pack.deductionEstimates.estimated80dExpensesMinor / 100).toFixed(2)}"`);
  rows.push(`"Bank Interest / Dividends","Income recorded as interest/dividend","${(pack.deductionEstimates.estimatedOtherInterestMinor / 100).toFixed(2)}"`);
  rows.push('');

  rows.push(`"--- SECTION 5: SCHEDULE OF BANK ACCOUNTS (ITR DISCLOSURE) ---"`);
  rows.push(`"Account Name","Bank / Institution","Last 4 Digits","Scope","Current Balance (INR)"`);
  for (const b of pack.bankAccounts) {
    rows.push(`"${b.name}","${b.institution || '-'}","${b.last4 || '-'}","${b.scope}","${(b.currentBalanceMinor / 100).toFixed(2)}"`);
  }
  rows.push('');

  rows.push(`"--- SECTION 6: SCHEDULE OF LOANS & LIABILITIES ---"`);
  rows.push(`"Loan Name","Direction","Original Principal (INR)","Remaining Balance (INR)","Principal Paid (INR)","Interest Paid (INR)"`);
  for (const l of pack.loans) {
    rows.push(`"${l.name}","${l.direction}","${(l.principalMinor / 100).toFixed(2)}","${(l.remainingMinor / 100).toFixed(2)}","${(l.totalPrincipalPaidMinor / 100).toFixed(2)}","${(l.totalInterestPaidMinor / 100).toFixed(2)}"`);
  }

  return rows.join('\n');
}

export function exportFullSnapshotJSON(db: DatabaseSync) {
  return {
    exportedAt: new Date().toISOString(),
    accounts: listAccounts(db),
    transactions: listTransactions(db, { limit: 50000 }),
    recurringBills: listRecurringBills(db),
    scopeBudgets: listScopeBudgets(db),
    categoryBudgets: listCategoryBudgets(db),
    loans: listLoans(db),
    peopleDues: listPeopleDues(db),
    savingsGoals: listSavingsGoals(db),
    investments: listInvestments(db),
    categoryRules: listCategoryRules(db),
    notes: listNotes(db),
    // Vault entries exported strictly as encrypted ciphertext blobs + PBKDF2 metadata for recovery
    vaultMeta: getVaultMeta(db),
    vaultEntriesCiphertextOnly: listVaultEntries(db),
  };
}

const backupSnapshotSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(['bank', 'credit_card']),
      scope: z.enum(['personal', 'business', 'family']),
      institution: z.string().default(''),
      last4: z.string().default(''),
      openingBalanceMinor: z.number().int().default(0),
      minBalanceMinor: z.number().int().default(0),
      creditLimitMinor: z.number().int().default(0),
      statementDay: z.number().int().min(1).max(28).default(15),
      dueDay: z.number().int().min(1).max(28).default(5),
      createdAt: z.string().optional(),
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(['income', 'expense', 'transfer']),
      scope: z.enum(['personal', 'business', 'family']),
      accountId: z.string().min(1),
      toAccountId: z.string().nullable().optional(),
      category: z.string().min(1),
      amountMinor: z.number().int().positive(),
      occurredAt: z.string().min(10),
      party: z.string().default(''),
      note: z.string().default(''),
      sourceRef: z.string().nullable().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  recurringBills: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        scope: z.enum(['personal', 'business', 'family']),
        kind: z.enum(['expense', 'income']),
        accountId: z.string().min(1),
        category: z.string().min(1),
        amountMinor: z.number().int().positive(),
        dueDay: z.number().int().min(1).max(28),
        lastPaidMonth: z.string().nullable().optional(),
        active: z.boolean().default(true),
        autoPost: z.boolean().default(false),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  scopeBudgets: z
    .array(
      z.object({
        scope: z.enum(['personal', 'business', 'family']),
        monthlyLimitMinor: z.number().int().positive(),
      }),
    )
    .default([]),
  categoryBudgets: z
    .array(
      z.object({
        id: z.string().optional(),
        scope: z.enum(['personal', 'business', 'family']),
        category: z.string().min(1),
        monthlyLimitMinor: z.number().int().positive(),
      }),
    )
    .default([]),
  loans: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        counterparty: z.string().min(1),
        scope: z.enum(['personal', 'business', 'family']),
        direction: z.enum(['borrowed', 'lent']),
        principalMinor: z.number().int().positive(),
        remainingMinor: z.number().int().min(0),
        annualRateBps: z.number().int().min(0).default(0),
        tenureMonths: z.number().int().min(1).default(12),
        emiMinor: z.number().int().min(0).default(0),
        startDate: z.string().min(10),
        nextDueDate: z.string().min(10),
        linkedAccountId: z.string().nullable().optional(),
        status: z.enum(['active', 'closed']).default('active'),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  peopleDues: z
    .array(
      z.object({
        id: z.string().min(1),
        personName: z.string().min(1),
        phone: z.string().default(''),
        direction: z.enum(['give', 'need']),
        scope: z.enum(['personal', 'business', 'family']),
        amountMinor: z.number().int().positive(),
        settledMinor: z.number().int().min(0).default(0),
        dueDate: z.string().nullable().optional(),
        note: z.string().default(''),
        status: z.enum(['open', 'partial', 'settled']).default('open'),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  notes: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        body: z.string().default(''),
        scope: z.enum(['general', 'personal', 'business', 'family']).default('general'),
        color: z.enum(NOTE_COLORS).default('default'),
        pinned: z.boolean().default(false),
        archived: z.boolean().default(false),
        remindAt: z.string().nullable().optional(),
        checklist: z
          .array(
            z.object({
              id: z.string().optional(),
              text: z.string().min(1),
              done: z.boolean().default(false),
              sortOrder: z.number().int().optional(),
            }),
          )
          .default([]),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    )
    .default([]),
  vaultMeta: z
    .object({
      saltB64: z.string().min(1),
      canaryIv: z.string().min(1),
      canaryCt: z.string().min(1),
      updatedAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  vaultEntriesCiphertextOnly: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        category: z.string().default('General'),
        iv: z.string().min(1),
        ciphertext: z.string().min(1),
        lastRotatedAt: z.string().min(10),
        updatedAt: z.string().optional(),
      }),
    )
    .default([]),
  savingsGoals: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        kind: z.enum(['goal', 'emergency', 'tax_reserve']).default('goal'),
        scope: z.enum(['personal', 'business', 'family']).default('personal'),
        targetMinor: z.number().int().positive(),
        currentMinor: z.number().int().min(0).default(0),
        targetDate: z.string().nullable().optional(),
        linkedAccountId: z.string().nullable().optional(),
        note: z.string().default(''),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  investments: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        kind: z.enum(['mutual_fund', 'stock', 'fd', 'ppf', 'gold', 'property', 'other']).default('mutual_fund'),
        scope: z.enum(['personal', 'business', 'family']).default('personal'),
        investedMinor: z.number().int().min(0).default(0),
        currentValueMinor: z.number().int().min(0).default(0),
        unitsQty: z.number().min(0).default(0),
        maturityDate: z.string().nullable().optional(),
        sipDay: z.number().int().min(1).max(28).nullable().optional(),
        sipAmountMinor: z.number().int().min(0).default(0),
        note: z.string().default(''),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  categoryRules: z
    .array(
      z.object({
        id: z.string().min(1),
        pattern: z.string().min(1),
        matchType: z.enum(['contains', 'exact']).default('contains'),
        category: z.string().min(1),
        scope: z.enum(['personal', 'business', 'family']).nullable().optional(),
        accountId: z.string().nullable().optional(),
        kind: z.enum(['expense', 'income']).nullable().optional(),
        priority: z.number().int().default(100),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
});

export function restoreFullSnapshotJSON(db: DatabaseSync, raw: unknown) {
  const data = backupSnapshotSchema.parse(raw);
  const now = new Date().toISOString();

  return withTransaction(db, () => {
    // Clear tables in reverse FK dependency order
    db.prepare('DELETE FROM transaction_attachments').run();
    db.prepare('DELETE FROM due_settlements').run();
    db.prepare('DELETE FROM loan_payments').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM recurring_bills').run();
    db.prepare('DELETE FROM scope_budgets').run();
    db.prepare('DELETE FROM category_budgets').run();
    db.prepare('DELETE FROM loans').run();
    db.prepare('DELETE FROM people_dues').run();
    db.prepare('DELETE FROM note_checklist_items').run();
    db.prepare('DELETE FROM notes').run();
    db.prepare('DELETE FROM vault_entries').run();
    db.prepare('DELETE FROM vault_meta').run();
    db.prepare('DELETE FROM savings_goals').run();
    db.prepare('DELETE FROM investments').run();
    db.prepare('DELETE FROM category_rules').run();

    const insertAcc = db.prepare(`
      INSERT INTO accounts (
        id, name, type, scope, institution, last4,
        opening_balance_minor, min_balance_minor, credit_limit_minor,
        statement_day, due_day, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of data.accounts) {
      insertAcc.run(
        a.id,
        a.name,
        a.type,
        a.scope,
        a.institution,
        a.last4,
        a.openingBalanceMinor,
        a.minBalanceMinor,
        a.creditLimitMinor,
        a.statementDay,
        a.dueDay,
        a.createdAt || now,
      );
    }

    const insertTx = db.prepare(`
      INSERT INTO transactions (
        id, kind, scope, account_id, to_account_id, category,
        amount_minor, occurred_at, party, note, source_ref, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of data.transactions) {
      insertTx.run(
        t.id,
        t.kind,
        t.scope,
        t.accountId,
        t.kind === 'transfer' ? (t.toAccountId ?? null) : null,
        t.category,
        t.amountMinor,
        t.occurredAt,
        t.party,
        t.note,
        t.sourceRef ?? null,
        t.createdAt || now,
      );
    }

    const insertRec = db.prepare(`
      INSERT INTO recurring_bills (
        id, title, scope, kind, account_id, category,
        amount_minor, due_day, last_paid_month, active, auto_post, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of data.recurringBills) {
      insertRec.run(
        r.id,
        r.title,
        r.scope,
        r.kind,
        r.accountId,
        r.category,
        r.amountMinor,
        r.dueDay,
        r.lastPaidMonth ?? null,
        r.active ? 1 : 0,
        r.autoPost ? 1 : 0,
        r.createdAt || now,
      );
    }

    const insertBudget = db.prepare(
      'INSERT INTO scope_budgets (scope, monthly_limit_minor, updated_at) VALUES (?, ?, ?)',
    );
    for (const b of data.scopeBudgets) {
      insertBudget.run(b.scope, b.monthlyLimitMinor, now);
    }

    const insertCatBudget = db.prepare(
      'INSERT INTO category_budgets (id, scope, category, monthly_limit_minor, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const b of data.categoryBudgets) {
      insertCatBudget.run(b.id || crypto.randomUUID(), b.scope, b.category, b.monthlyLimitMinor, now);
    }

    const insertLoan = db.prepare(`
      INSERT INTO loans (
        id, name, counterparty, scope, direction, principal_minor, remaining_minor,
        annual_rate_bps, tenure_months, emi_minor, start_date, next_due_date,
        linked_account_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of data.loans) {
      insertLoan.run(
        l.id,
        l.name,
        l.counterparty,
        l.scope,
        l.direction,
        l.principalMinor,
        l.remainingMinor,
        l.annualRateBps,
        l.tenureMonths,
        l.emiMinor,
        l.startDate,
        l.nextDueDate,
        l.linkedAccountId ?? null,
        l.status,
        l.createdAt || now,
      );
    }

    const insertDue = db.prepare(`
      INSERT INTO people_dues (
        id, person_name, phone, direction, scope, amount_minor,
        settled_minor, due_date, note, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of data.peopleDues) {
      insertDue.run(
        d.id,
        d.personName,
        d.phone,
        d.direction,
        d.scope,
        d.amountMinor,
        d.settledMinor,
        d.dueDate ?? null,
        d.note,
        d.status,
        d.createdAt || now,
      );
    }

    const insertNote = db.prepare(`
      INSERT INTO notes (id, title, body, scope, color, pinned, archived, remind_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCheckItem = db.prepare(`
      INSERT INTO note_checklist_items (id, note_id, text, done, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const n of data.notes) {
      insertNote.run(
        n.id,
        n.title,
        n.body,
        n.scope,
        n.color ?? 'default',
        n.pinned ? 1 : 0,
        n.archived ? 1 : 0,
        n.remindAt ?? null,
        n.createdAt || now,
        n.updatedAt || now,
      );
      n.checklist.forEach((item, idx) => {
        insertCheckItem.run(
          item.id || crypto.randomUUID(),
          n.id,
          item.text,
          item.done ? 1 : 0,
          item.sortOrder ?? idx,
        );
      });
    }

    if (data.vaultMeta) {
      db.prepare(
        'INSERT INTO vault_meta (id, salt_b64, canary_iv, canary_ct, updated_at) VALUES (1, ?, ?, ?, ?)',
      ).run(
        data.vaultMeta.saltB64,
        data.vaultMeta.canaryIv,
        data.vaultMeta.canaryCt,
        data.vaultMeta.updatedAt || now,
      );
    }

    const insertVaultEntry = db.prepare(`
      INSERT INTO vault_entries (id, label, category, iv, ciphertext, last_rotated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const v of data.vaultEntriesCiphertextOnly) {
      insertVaultEntry.run(
        v.id,
        v.label,
        v.category,
        v.iv,
        v.ciphertext,
        v.lastRotatedAt,
        v.updatedAt || now,
      );
    }

    const insertGoal = db.prepare(`
      INSERT INTO savings_goals (
        id, title, kind, scope, target_minor, current_minor,
        target_date, linked_account_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const g of data.savingsGoals) {
      insertGoal.run(
        g.id,
        g.title,
        g.kind,
        g.scope,
        g.targetMinor,
        g.currentMinor,
        g.targetDate ?? null,
        g.linkedAccountId ?? null,
        g.note,
        g.createdAt || now,
      );
    }

    const insertInv = db.prepare(`
      INSERT INTO investments (
        id, title, kind, scope, invested_minor, current_value_minor,
        units_qty, maturity_date, sip_day, sip_amount_minor, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const inv of data.investments) {
      insertInv.run(
        inv.id,
        inv.title,
        inv.kind,
        inv.scope,
        inv.investedMinor,
        inv.currentValueMinor,
        inv.unitsQty,
        inv.maturityDate ?? null,
        inv.sipDay ?? null,
        inv.sipAmountMinor,
        inv.note,
        inv.createdAt || now,
      );
    }

    const insertRule = db.prepare(`
      INSERT INTO category_rules (
        id, pattern, match_type, category, scope, account_id, kind, priority, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const rule of data.categoryRules) {
      insertRule.run(
        rule.id,
        rule.pattern,
        rule.matchType,
        rule.category,
        rule.scope ?? null,
        rule.accountId ?? null,
        rule.kind ?? null,
        rule.priority,
        rule.createdAt || now,
      );
    }

    return {
      restoredAt: now,
      counts: {
        accounts: data.accounts.length,
        transactions: data.transactions.length,
        recurringBills: data.recurringBills.length,
        loans: data.loans.length,
        peopleDues: data.peopleDues.length,
        savingsGoals: data.savingsGoals.length,
        investments: data.investments.length,
        categoryRules: data.categoryRules.length,
        notes: data.notes.length,
        vaultEntries: data.vaultEntriesCiphertextOnly.length,
      },
    };
  });
}

export interface GlobalSearchResult {
  query: string;
  transactions: Array<{
    id: string;
    occurredAt: string;
    kind: 'income' | 'expense' | 'transfer';
    scope: Scope;
    category: string;
    amountMinor: number;
    party: string;
    note: string;
    accountName: string;
  }>;
  notes: Array<{
    id: string;
    title: string;
    content: string;
    scope: Scope | 'general';
    color: string;
    pinned: boolean;
    isChecklist: boolean;
    checklistCount: number;
    checklistDoneCount: number;
  }>;
  dues: Array<{
    id: string;
    personName: string;
    direction: 'need' | 'give';
    scope: Scope;
    remainingMinor: number;
    dueDate: string | null;
    note: string;
    status: string;
  }>;
  loans: Array<{
    id: string;
    name: string;
    counterparty: string;
    direction: 'borrowed' | 'lent';
    scope: Scope;
    remainingMinor: number;
    status: string;
  }>;
  vault: Array<{
    id: string;
    label: string;
    category: string;
    lastRotatedAt: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    kind: string;
    scope: Scope;
    targetMinor: number;
    currentMinor: number;
  }>;
  investments: Array<{
    id: string;
    title: string;
    kind: string;
    scope: Scope;
    currentValueMinor: number;
    investedMinor: number;
  }>;
}

export function globalSearch(db: DatabaseSync, rawQuery: string): GlobalSearchResult {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return {
      query: '',
      transactions: [],
      notes: [],
      dues: [],
      loans: [],
      vault: [],
      goals: [],
      investments: [],
    };
  }

  // 1. Transactions matching category, party, note, accountName, or amount
  const allTx = listTransactions(db, { limit: 1000 });
  const txMatches = allTx
    .filter((t) => {
      if (t.category.toLowerCase().includes(q)) return true;
      if (t.party.toLowerCase().includes(q)) return true;
      if (t.note.toLowerCase().includes(q)) return true;
      if (t.accountName.toLowerCase().includes(q)) return true;
      const rupees = (t.amountMinor / 100).toFixed(0);
      if (rupees === q || t.amountMinor.toString().includes(q)) return true;
      return false;
    })
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt,
      kind: t.kind,
      scope: t.scope,
      category: t.category,
      amountMinor: t.amountMinor,
      party: t.party,
      note: t.note,
      accountName: t.accountName,
    }));

  // 2. Notes & Checklists
  const allNotes = listNotes(db, { includeArchived: true });
  const noteMatches = allNotes
    .filter((n) => {
      if (n.title.toLowerCase().includes(q)) return true;
      if (n.body.toLowerCase().includes(q)) return true;
      if (n.checklist.some((item) => item.text.toLowerCase().includes(q))) return true;
      return false;
    })
    .slice(0, 8)
    .map((n) => ({
      id: n.id,
      title: n.title,
      content: n.body,
      scope: n.scope,
      color: n.color,
      pinned: n.pinned,
      isChecklist: n.checklist.length > 0,
      checklistCount: n.checklist.length,
      checklistDoneCount: n.checklist.filter((i) => i.done).length,
    }));

  // 3. People Dues
  const allDues = listPeopleDues(db);
  const dueMatches = allDues
    .filter((d) => {
      if (d.personName.toLowerCase().includes(q)) return true;
      if (d.note.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, 6)
    .map((d) => ({
      id: d.id,
      personName: d.personName,
      direction: d.direction,
      scope: d.scope,
      remainingMinor: d.remainingMinor,
      dueDate: d.dueDate,
      note: d.note,
      status: d.status,
    }));

  // 4. Loans
  const allLoans = listLoans(db);
  const loanMatches = allLoans
    .filter((l) => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.counterparty.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      name: l.name,
      counterparty: l.counterparty,
      direction: l.direction,
      scope: l.scope,
      remainingMinor: l.remainingMinor,
      status: l.status,
    }));

  // 5. Vault metadata (labels & categories only — zero plaintext secrets)
  const allVault = listVaultEntries(db);
  const vaultMatches = allVault
    .filter((v) => {
      if (v.label.toLowerCase().includes(q)) return true;
      if (v.category.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, 6)
    .map((v) => ({
      id: v.id,
      label: v.label,
      category: v.category,
      lastRotatedAt: v.lastRotatedAt,
    }));

  // 6. Savings Goals
  const allGoals = listSavingsGoals(db);
  const goalMatches = allGoals
    .filter((g) => {
      if (g.title.toLowerCase().includes(q)) return true;
      if (g.note.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      scope: g.scope,
      targetMinor: g.targetMinor,
      currentMinor: g.currentMinor,
    }));

  // 7. Investments
  const allInv = listInvestments(db);
  const invMatches = allInv
    .filter((i) => {
      if (i.title.toLowerCase().includes(q)) return true;
      if (i.note.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      title: i.title,
      kind: i.kind,
      scope: i.scope,
      currentValueMinor: i.currentValueMinor,
      investedMinor: i.investedMinor,
    }));

  return {
    query: rawQuery,
    transactions: txMatches,
    notes: noteMatches,
    dues: dueMatches,
    loans: loanMatches,
    vault: vaultMatches,
    goals: goalMatches,
    investments: invMatches,
  };
}
