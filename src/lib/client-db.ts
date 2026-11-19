import type {
  AccountType,
  DueDirection,
  LoanDirection,
  NoteColor,
  NoteScope,
  Scope,
  TxKind,
} from '../../shared/ledger-core.ts';
import {
  computeCardCycle,
  todayISO,
  parseISODate,
  addMonthsISO,
  formatINR,
} from '../../shared/ledger-core.ts';
import type {
  AccountGroup,
  AccountRecord,
  AdvisorBriefing,
  AdvisorFinding,
  AdvisorSuggestion,
  AttentionItem,
  DashboardSummary,
  DetailedReports,
  GlobalSearchResult,
  LoanRecord,
  NoteRecord,
  PersonDueRecord,
  PersonNetSummary,
  RecurringBillRecord,
  ScopeBudgetRecord,
  TransactionRecord,
  WhatsAppBridgeState,
  AppPreferences,
  VaultMetaRecord,
  VaultEntryCipherRecord,
} from './api.ts';
import { getSupabaseClient, getCurrentUser } from './supabase.ts';
import { scheduleAutoCloudSync } from './supabase-sync.ts';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DB_STORAGE_KEY = 'pl_browser_db_v4';
const PREFS_STORAGE_KEY = 'pl_app_preferences_v1';

interface ClientDatabaseSchema {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  recurringBills: RecurringBillRecord[];
  budgets: ScopeBudgetRecord[];
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  notes: NoteRecord[];
  jobSheets: any[];
  vaultMeta?: VaultMetaRecord | null;
  vaultEntries?: VaultEntryCipherRecord[];
}

function getInitialDatabase(): ClientDatabaseSchema {
  return {
    accounts: [],
    transactions: [],
    recurringBills: [],
    budgets: [
      { scope: 'personal', monthlyLimitMinor: 5000000 },
      { scope: 'business', monthlyLimitMinor: 15000000 },
      { scope: 'family', monthlyLimitMinor: 8000000 },
    ],
    loans: [],
    dues: [],
    notes: [],
    jobSheets: [],
    vaultMeta: null,
    vaultEntries: [],
  };
}

class ClientDatabaseManager {
  private cache: ClientDatabaseSchema | null = null;

  public load(): ClientDatabaseSchema {
    if (this.cache) return this.cache;
    if (typeof window === 'undefined') return getInitialDatabase();

    try {
      const raw = localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        this.cache = JSON.parse(raw);
        if (this.cache && Array.isArray(this.cache.accounts)) {
          this.recomputeBalances();
          return this.cache;
        }
      }
    } catch (e) {
      console.warn('Failed to parse client database from localStorage', e);
    }

    try {
      localStorage.removeItem('pl_browser_db_v1');
      localStorage.removeItem('pl_browser_db_v2');
      localStorage.removeItem('pl_browser_db_v3');
    } catch {}

    this.cache = getInitialDatabase();
    this.save();
    return this.cache;
  }

  resetToCleanSlate(): void {
    this.cache = null;
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(DB_STORAGE_KEY);
      localStorage.removeItem('pl_browser_db_v1');
      localStorage.removeItem('pl_browser_db_v2');
      localStorage.removeItem('pl_browser_db_v3');
      this.cache = getInitialDatabase();
      this.save();
    } catch {}
  }

  public save(skipAutoSync = false): void {
    if (typeof window === 'undefined' || !this.cache) return;
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(this.cache));
      if (!skipAutoSync) scheduleAutoCloudSync();
    } catch (e) {
      console.error('Failed to save client database to localStorage', e);
    }
  }

  public recomputeBalances(): void {
    if (!this.cache) return;
    const refDate = todayISO();
    for (const acc of this.cache.accounts) {
      let balance = acc.openingBalanceMinor;
      const accTxs = this.cache.transactions.filter(
        (t) => t.accountId === acc.id || t.toAccountId === acc.id,
      );

      for (const t of accTxs) {
        if (acc.type === 'credit_card') {
          if (t.accountId === acc.id && t.kind === 'expense') balance += t.amountMinor;
          if (t.toAccountId === acc.id && t.kind === 'transfer') balance -= t.amountMinor;
        } else {
          if (t.accountId === acc.id) {
            if (t.kind === 'income') balance += t.amountMinor;
            else if (t.kind === 'expense' || t.kind === 'transfer') balance -= t.amountMinor;
          }
          if (t.toAccountId === acc.id && t.kind === 'transfer') {
            balance += t.amountMinor;
          }
        }
      }

      acc.currentBalanceMinor = balance;

      if (acc.type === 'credit_card') {
        const cardTxs = accTxs.map((t) => ({
          kind: t.kind,
          amountMinor: t.amountMinor,
          occurredAt: t.occurredAt,
          direction: (t.kind === 'expense' ? 'out' : 'in') as 'out' | 'in',
        }));

        acc.cardCycle = computeCardCycle({
          statementDay: acc.statementDay || 15,
          dueDay: acc.dueDay || 5,
          creditLimitMinor: acc.creditLimitMinor || 0,
          referenceDate: refDate,
          transactions: cardTxs,
        });
      }
    }
  }

  public getAccounts(): AccountRecord[] {
    const db = this.load();
    this.recomputeBalances();
    return [...db.accounts];
  }

  public createAccount(body: {
    name: string;
    type: AccountType;
    accountGroup?: AccountGroup;
    scope: Scope;
    institution?: string;
    last4?: string;
    openingBalanceMinor?: number;
    minBalanceMinor?: number;
    creditLimitMinor?: number;
    statementDay?: number;
    dueDay?: number;
  }): AccountRecord {
    const db = this.load();
    const id = generateUUID();
    const newAcc: AccountRecord = {
      id,
      name: body.name,
      type: body.type,
      accountGroup: body.accountGroup || (body.type === 'credit_card' ? 'credit_card' : 'bank'),
      scope: body.scope,
      institution: body.institution || '',
      last4: body.last4 || '',
      openingBalanceMinor: body.openingBalanceMinor || 0,
      minBalanceMinor: body.minBalanceMinor || 0,
      creditLimitMinor: body.creditLimitMinor || 0,
      statementDay: body.statementDay || 15,
      dueDay: body.dueDay || 5,
      currentBalanceMinor: body.openingBalanceMinor || 0,
      cardCycle: null,
      createdAt: todayISO(),
    };
    db.accounts.push(newAcc);
    this.recomputeBalances();
    this.save();
    return newAcc;
  }

  public updateAccount(id: string, body: Partial<AccountRecord>): AccountRecord {
    const db = this.load();
    const idx = db.accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account not found: ${id}`);
    db.accounts[idx] = { ...db.accounts[idx], ...body };
    this.recomputeBalances();
    this.save();
    return db.accounts[idx];
  }

  public deleteAccount(id: string): void {
    const db = this.load();
    db.accounts = db.accounts.filter((a) => a.id !== id);
    this.save();
  }

  public getTransactions(params: {
    scope?: Scope;
    kind?: TxKind;
    accountId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  } = {}): TransactionRecord[] {
    const db = this.load();
    return db.transactions
      .filter((t) => {
        if (params.scope && t.scope !== params.scope) return false;
        if (params.kind && t.kind !== params.kind) return false;
        if (params.accountId && t.accountId !== params.accountId && t.toAccountId !== params.accountId) return false;
        if (params.fromDate && t.occurredAt < params.fromDate) return false;
        if (params.toDate && t.occurredAt > params.toDate) return false;
        if (params.search) {
          const q = params.search.toLowerCase();
          const match =
            t.category.toLowerCase().includes(q) ||
            (t.party && t.party.toLowerCase().includes(q)) ||
            (t.note && t.note.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  public createTransaction(body: {
    kind: TxKind;
    scope: Scope;
    accountId: string;
    toAccountId?: string | null;
    category: string;
    amountMinor: number;
    occurredAt: string;
    party?: string;
    note?: string;
  }): TransactionRecord {
    const db = this.load();
    const acc = db.accounts.find((a) => a.id === body.accountId);
    const toAcc = body.toAccountId ? db.accounts.find((a) => a.id === body.toAccountId) : null;

    const id = generateUUID();
    const newTx: TransactionRecord = {
      id,
      kind: body.kind,
      scope: body.scope,
      accountId: body.accountId,
      accountName: acc ? acc.name : 'Unknown Account',
      toAccountId: body.toAccountId || null,
      toAccountName: toAcc ? toAcc.name : null,
      category: body.category,
      amountMinor: body.amountMinor,
      occurredAt: body.occurredAt,
      party: body.party || '',
      note: body.note || '',
      sourceRef: null,
      createdAt: todayISO(),
      hasAttachment: false,
    };

    db.transactions.unshift(newTx);
    this.recomputeBalances();
    this.save();
    return newTx;
  }

  public updateTransaction(id: string, body: Partial<TransactionRecord>): TransactionRecord {
    const db = this.load();
    const idx = db.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Transaction not found: ${id}`);
    db.transactions[idx] = { ...db.transactions[idx], ...body };
    this.recomputeBalances();
    this.save();
    return db.transactions[idx];
  }

  public deleteTransaction(id: string): void {
    const db = this.load();
    db.transactions = db.transactions.filter((t) => t.id !== id);
    this.recomputeBalances();
    this.save();
  }

  public bulkTransactions(body: { action: 'delete' | 'update'; ids: string[]; patch?: any }): { count: number } {
    const db = this.load();
    if (body.action === 'delete') {
      const set = new Set(body.ids);
      db.transactions = db.transactions.filter((t) => !set.has(t.id));
    } else if (body.action === 'update' && body.patch) {
      for (const t of db.transactions) {
        if (body.ids.includes(t.id)) {
          Object.assign(t, body.patch);
        }
      }
    }
    this.recomputeBalances();
    this.save();
    return { count: body.ids.length };
  }

  public getDashboard(scopeFilter?: Scope): DashboardSummary {
    const db = this.load();
    this.recomputeBalances();

    const refDate = todayISO();
    const monthPrefix = refDate.slice(0, 7);

    const allAccounts = db.accounts;
    const accounts = scopeFilter ? allAccounts.filter((a) => a.scope === scopeFilter) : allAccounts;
    const banks = accounts.filter((a) => a.type === 'bank');
    const cards = accounts.filter((a) => a.type === 'credit_card');

    const bankTotalsByScope: Record<Scope, number> = { personal: 0, business: 0, family: 0 };
    for (const b of allAccounts.filter((a) => a.type === 'bank')) {
      bankTotalsByScope[b.scope] = (bankTotalsByScope[b.scope] || 0) + b.currentBalanceMinor;
    }

    const totalBankMinor = banks.reduce((sum, b) => sum + b.currentBalanceMinor, 0);
    const totalCardDebtMinor = cards.reduce((sum, c) => sum + (c.cardCycle?.totalOutstandingMinor ?? c.currentBalanceMinor ?? 0), 0);
    const totalCardLimitMinor = cards.reduce((sum, c) => sum + c.creditLimitMinor, 0);

    const loans = db.loans.filter((l) => l.status === 'active' && (!scopeFilter || l.scope === scopeFilter));
    const totalBorrowedRemainingMinor = loans
      .filter((l) => l.direction === 'borrowed')
      .reduce((sum, l) => sum + l.remainingMinor, 0);
    const totalLentRemainingMinor = loans
      .filter((l) => l.direction === 'lent')
      .reduce((sum, l) => sum + l.remainingMinor, 0);

    const dues = db.dues.filter((d) => d.status !== 'settled' && (!scopeFilter || d.scope === scopeFilter));
    const totalGiveMinor = dues
      .filter((d) => d.direction === 'give')
      .reduce((sum, d) => sum + d.remainingMinor, 0);
    const totalNeedMinor = dues
      .filter((d) => d.direction === 'need')
      .reduce((sum, d) => sum + d.remainingMinor, 0);

    const netWorthMinor =
      totalBankMinor +
      totalLentRemainingMinor +
      totalNeedMinor -
      totalCardDebtMinor -
      totalBorrowedRemainingMinor -
      totalGiveMinor;

    const allTx = db.transactions.filter((t) => !scopeFilter || t.scope === scopeFilter);
    const monthTx = allTx.filter((t) => t.occurredAt.startsWith(monthPrefix));

    const monthByScope: Record<Scope, { incomeMinor: number; expenseMinor: number }> = {
      personal: { incomeMinor: 0, expenseMinor: 0 },
      business: { incomeMinor: 0, expenseMinor: 0 },
      family: { incomeMinor: 0, expenseMinor: 0 },
    };
    const allMonthExpenseByScope: Record<Scope, number> = { personal: 0, business: 0, family: 0 };

    let monthIncomeMinor = 0;
    let monthExpenseMinor = 0;

    const catTotals: Record<string, number> = {};

    for (const t of monthTx) {
      if (t.kind === 'income') {
        monthIncomeMinor += t.amountMinor;
        monthByScope[t.scope].incomeMinor += t.amountMinor;
      } else if (t.kind === 'expense') {
        monthExpenseMinor += t.amountMinor;
        monthByScope[t.scope].expenseMinor += t.amountMinor;
        allMonthExpenseByScope[t.scope] += t.amountMinor;
        catTotals[t.category] = (catTotals[t.category] || 0) + t.amountMinor;
      }
    }

    const monthTopCategories = Object.entries(catTotals)
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, 5);

    // 6-Month Trend
    const sixMonthTrend: DashboardSummary['sixMonthTrend'] = [];
    for (let i = 5; i >= 0; i--) {
      const d = parseISODate(refDate);
      let m = d.month - i;
      let y = d.year;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const mStr = `${y}-${String(m).padStart(2, '0')}`;
      const mTxs = allTx.filter((t) => t.occurredAt.startsWith(mStr));
      let inc = 0;
      let exp = 0;
      let pExp = 0;
      let bExp = 0;
      let fExp = 0;
      for (const t of mTxs) {
        if (t.kind === 'income') inc += t.amountMinor;
        if (t.kind === 'expense') {
          exp += t.amountMinor;
          if (t.scope === 'personal') pExp += t.amountMinor;
          if (t.scope === 'business') bExp += t.amountMinor;
          if (t.scope === 'family') fExp += t.amountMinor;
        }
      }
      sixMonthTrend.push({
        month: mStr,
        incomeMinor: inc,
        expenseMinor: exp,
        personalExpenseMinor: pExp,
        businessExpenseMinor: bExp,
        familyExpenseMinor: fExp,
      });
    }

    // Due Summaries by person
    const personMap = new Map<string, { needMinor: number; giveMinor: number; phone?: string; count: number }>();
    for (const d of dues) {
      const cur = personMap.get(d.personName) || { needMinor: 0, giveMinor: 0, phone: d.phone, count: 0 };
      if (d.direction === 'need') cur.needMinor += d.remainingMinor;
      else cur.giveMinor += d.remainingMinor;
      cur.count += 1;
      personMap.set(d.personName, cur);
    }

    const dueSummariesByPerson: PersonNetSummary[] = Array.from(personMap.entries()).map(
      ([personName, vals]) => {
        const netMinor = vals.needMinor - vals.giveMinor;
        return {
          personName,
          phone: vals.phone || '',
          totalNeedMinor: vals.needMinor,
          totalGiveMinor: vals.giveMinor,
          netMinor,
          openCount: vals.count,
        };
      },
    );

    // Attention Queue
    const attentionQueue: AttentionItem[] = [];
    for (const c of cards) {
      if (c.cardCycle && c.cardCycle.statementDueMinor > 0) {
        attentionQueue.push({
          id: `card-due-${c.id}`,
          module: 'credit_cards',
          severity: c.cardCycle.daysUntilDue <= 3 ? 'urgent' : 'warning',
          scope: c.scope,
          title: `${c.name} Statement Due`,
          subtitle: `Bill of ${formatINR(c.cardCycle.statementDueMinor)} due on ${c.cardCycle.nextDueDate} (${c.cardCycle.daysUntilDue} days left).`,
          dueDate: c.cardCycle.nextDueDate,
          amountMinor: c.cardCycle.statementDueMinor,
        });
      }
    }

    for (const l of loans) {
      if (l.nextDueDate && l.emiMinor > 0) {
        attentionQueue.push({
          id: `loan-emi-${l.id}`,
          module: 'loans',
          severity: 'warning',
          scope: l.scope,
          title: `${l.name} Monthly EMI`,
          subtitle: `EMI of ${formatINR(l.emiMinor)} due on ${l.nextDueDate}.`,
          dueDate: l.nextDueDate,
          amountMinor: l.emiMinor,
        });
      }
    }

    const budgets = (['personal', 'business', 'family'] as Scope[]).map((sc) => {
      const bRec = db.budgets.find((b) => b.scope === sc);
      return {
        scope: sc,
        monthlyLimitMinor: bRec ? bRec.monthlyLimitMinor : 10000000,
        spentMinor: allMonthExpenseByScope[sc] || 0,
      };
    });

    return {
      referenceDate: refDate,
      netWorthMinor,
      totalBankMinor,
      totalInvestmentsMinor: 0,
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
      dueSummariesByPerson,
      attentionQueue,
      pinnedNotes: db.notes.filter((n) => n.pinned && !n.archived),
      recentTransactions: allTx.slice(0, 10),
      budgets,
      categoryBudgets: [],
      unreadInAppCount: attentionQueue.length,
    };
  }

  public getAgentBriefing(scopeFilter?: Scope): AdvisorBriefing {
    const dash = this.getDashboard(scopeFilter);
    const findings: AdvisorFinding[] = [];
    const suggestions: AdvisorSuggestion[] = [];

    if (dash.attentionQueue.length > 0) {
      for (const item of dash.attentionQueue) {
        findings.push({
          id: item.id,
          module: item.module,
          severity: item.severity === 'urgent' ? 'urgent' : 'warning',
          title: item.title,
          detail: item.subtitle,
        });
      }
    }

    suggestions.push({
      id: 'sug-1',
      label: 'Review Monthly Budgets',
      detail: 'Verify cash runway and allocation across Personal and Business accounts.',
      commandText: 'review budgets',
      severity: 'info',
    });

    const healthScore = Math.max(30, Math.min(100, 100 - findings.length * 10));

    return {
      generatedAt: todayISO(),
      healthScore,
      status: healthScore >= 80 ? 'healthy' : healthScore >= 55 ? 'watch' : 'critical',
      headline:
        healthScore >= 80
          ? 'Finances are well-balanced with strong runway and active records.'
          : 'A few upcoming payments require attention to keep liquidity optimal.',
      liquidBankMinor: dash.totalBankMinor,
      scheduledOutflow30dMinor: dash.totalCardDebtMinor,
      expectedInflow30dMinor: dash.totalNeedMinor,
      projected30dBalanceMinor: dash.totalBankMinor - dash.totalCardDebtMinor + dash.totalNeedMinor,
      projectedMonthExpenseMinor: dash.monthExpenseMinor,
      avgMonthlyExpenseMinor: Math.max(dash.monthExpenseMinor, 5000000),
      openChecklistTasks: 1,
      completedChecklistNotes: 1,
      staleVaultCount: 0,
      emergencyRunwayMonths: 8.5,
      totalReservedMinor: 10000000,
      subscriptionLeakCount: 0,
      whatsWrong: findings,
      predictions: [],
      suggestions,
    };
  }

  public getRecurringBills(): RecurringBillRecord[] {
    return [...this.load().recurringBills];
  }

  public createRecurringBill(body: any): RecurringBillRecord {
    const db = this.load();
    const id = generateUUID();
    const acc = db.accounts.find((a) => a.id === body.accountId);
    const newBill: RecurringBillRecord = {
      id,
      title: body.title,
      scope: body.scope,
      kind: body.kind,
      accountId: body.accountId,
      accountName: acc ? acc.name : 'Unknown Account',
      category: body.category,
      amountMinor: body.amountMinor,
      dueDay: body.dueDay,
      active: true,
      autoPost: Boolean(body.autoPost),
      lastPaidMonth: null,
      createdAt: todayISO(),
    };
    db.recurringBills.push(newBill);
    this.save();
    return newBill;
  }

  public updateRecurringBill(id: string, body: any): RecurringBillRecord {
    const db = this.load();
    const idx = db.recurringBills.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error(`Bill not found: ${id}`);
    db.recurringBills[idx] = { ...db.recurringBills[idx], ...body };
    this.save();
    return db.recurringBills[idx];
  }

  public deleteRecurringBill(id: string): void {
    const db = this.load();
    db.recurringBills = db.recurringBills.filter((b) => b.id !== id);
    this.save();
  }

  public getBudgets(): ScopeBudgetRecord[] {
    return [...this.load().budgets];
  }

  public setBudget(scope: Scope, _month: string, monthlyLimitMinor: number): void {
    const db = this.load();
    const idx = db.budgets.findIndex((b) => b.scope === scope);
    if (idx >= 0) db.budgets[idx].monthlyLimitMinor = monthlyLimitMinor;
    else db.budgets.push({ scope, monthlyLimitMinor });
    this.save();
  }

  public getLoans(): LoanRecord[] {
    return [...this.load().loans];
  }

  public createLoan(body: any): LoanRecord {
    const db = this.load();
    const id = generateUUID();
    const newLoan: LoanRecord = {
      id,
      name: body.name,
      scope: body.scope,
      direction: (body.direction || 'borrowed') as LoanDirection,
      counterparty: body.counterparty || '',
      principalMinor: body.principalMinor,
      remainingMinor: body.principalMinor,
      annualRateBps: body.annualRateBps || 0,
      tenureMonths: body.tenureMonths || 60,
      emiMinor: body.emiMinor || 0,
      startDate: body.startDate || todayISO(),
      nextDueDate: body.nextDueDate || addMonthsISO(todayISO(), 1),
      linkedAccountId: body.linkedAccountId || null,
      status: 'active',
      totalInterestPaidMinor: 0,
      totalPrincipalPaidMinor: 0,
      createdAt: todayISO(),
    };
    db.loans.push(newLoan);
    this.save();
    return newLoan;
  }

  public recordLoanPayment(id: string, body: any): any {
    const db = this.load();
    const loan = db.loans.find((l) => l.id === id);
    if (!loan) throw new Error(`Loan not found: ${id}`);

    const amt = body.amountMinor || 0;
    loan.remainingMinor = Math.max(0, loan.remainingMinor - amt);
    loan.totalPrincipalPaidMinor = (loan.totalPrincipalPaidMinor || 0) + amt;
    if (loan.remainingMinor === 0) loan.status = 'closed';
    if (loan.nextDueDate) loan.nextDueDate = addMonthsISO(loan.nextDueDate, 1);

    this.save();
    return { ok: true, loan };
  }

  public updateLoan(id: string, body: any): LoanRecord {
    const db = this.load();
    const idx = db.loans.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error(`Loan not found: ${id}`);
    db.loans[idx] = { ...db.loans[idx], ...body };
    this.save();
    return db.loans[idx];
  }

  public deleteLoan(id: string): void {
    const db = this.load();
    db.loans = db.loans.filter((l) => l.id !== id);
    this.save();
  }

  public getDues(): { data: PersonDueRecord[]; summaries: PersonNetSummary[] } {
    const db = this.load();
    const dash = this.getDashboard();
    return { data: [...db.dues], summaries: dash.dueSummariesByPerson };
  }

  public createDue(body: any): PersonDueRecord {
    const db = this.load();
    const id = generateUUID();
    const newDue: PersonDueRecord = {
      id,
      personName: body.personName,
      phone: body.phone || '',
      direction: (body.direction || 'need') as DueDirection,
      scope: body.scope,
      amountMinor: body.amountMinor,
      settledMinor: 0,
      remainingMinor: body.amountMinor,
      dueDate: body.dueDate || null,
      status: 'open',
      note: body.note || '',
      createdAt: todayISO(),
    };
    db.dues.push(newDue);
    this.save();
    return newDue;
  }

  public settleDue(id: string, body: any): any {
    const db = this.load();
    const due = db.dues.find((d) => d.id === id);
    if (!due) throw new Error(`Due not found: ${id}`);
    const amt = body.amountMinor || due.remainingMinor;
    due.settledMinor = (due.settledMinor || 0) + amt;
    due.remainingMinor = Math.max(0, due.remainingMinor - amt);
    due.status = due.remainingMinor === 0 ? 'settled' : 'partial';
    this.save();
    return { ok: true, due };
  }

  public deleteDue(id: string): void {
    const db = this.load();
    db.dues = db.dues.filter((d) => d.id !== id);
    this.save();
  }

  public getNotes(): NoteRecord[] {
    return [...this.load().notes];
  }

  public upsertNote(body: any): NoteRecord {
    const db = this.load();
    const existingIdx = body.id ? db.notes.findIndex((n) => n.id === body.id) : -1;
    const today = todayISO();

    if (existingIdx >= 0) {
      db.notes[existingIdx] = {
        ...db.notes[existingIdx],
        ...body,
        updatedAt: today,
      };
      this.save();
      return db.notes[existingIdx];
    }

    const id = body.id || generateUUID();
    const newNote: NoteRecord = {
      id,
      scope: (body.scope || 'personal') as NoteScope,
      title: body.title || 'Untitled Note',
      body: body.body || '',
      tags: body.tags || [],
      color: (body.color || 'honey') as NoteColor,
      pinned: Boolean(body.pinned),
      archived: Boolean(body.archived),
      orderIndex: body.orderIndex ?? db.notes.length,
      checklist: body.checklist || [],
      attachments: [],
      linkedTxId: null,
      linkedDueId: null,
      linkedLoanId: null,
      linkedAccountId: null,
      createdAt: today,
      updatedAt: today,
      remindAt: body.remindAt || null,
    };
    db.notes.unshift(newNote);
    this.save();
    return newNote;
  }

  public deleteNote(id: string): void {
    const db = this.load();
    db.notes = db.notes.filter((n) => n.id !== id);
    this.save();
  }

  public getJobSheets(): any[] {
    return [...this.load().jobSheets];
  }

  public saveJobSheet(sheet: any): any {
    const db = this.load();
    const idx = db.jobSheets.findIndex((s) => s.id === sheet.id);
    if (idx >= 0) {
      db.jobSheets[idx] = sheet;
    } else {
      db.jobSheets.push(sheet);
    }
    this.save();
    return sheet;
  }

  public deleteJobSheet(id: string): void {
    const db = this.load();
    db.jobSheets = db.jobSheets.filter((s) => s.id !== id);
    this.save();
  }

  public getVaultMeta(): VaultMetaRecord | null {
    const db = this.load();
    return db.vaultMeta ?? null;
  }

  public saveVaultMeta(body: {
    saltB64: string;
    canaryIv: string;
    canaryCt: string;
    recoverySaltB64?: string | null;
    recoveryIv?: string | null;
    recoveryCt?: string | null;
    waRecoveryKey?: string | null;
  }): VaultMetaRecord {
    const db = this.load();
    const meta: VaultMetaRecord = {
      saltB64: body.saltB64,
      canaryIv: body.canaryIv,
      canaryCt: body.canaryCt,
      recoverySaltB64: body.recoverySaltB64 || null,
      recoveryIv: body.recoveryIv || null,
      recoveryCt: body.recoveryCt || null,
      hasWaRecoveryKey: Boolean(body.waRecoveryKey),
      updatedAt: todayISO(),
    };
    db.vaultMeta = meta;
    this.save();
    return meta;
  }

  public saveVaultRecovery(body: {
    recoverySaltB64: string;
    recoveryIv: string;
    recoveryCt: string;
    waRecoveryKey?: string | null;
  }): VaultMetaRecord {
    const db = this.load();
    if (!db.vaultMeta) throw new Error('Vault is not initialized');
    db.vaultMeta = {
      ...db.vaultMeta,
      recoverySaltB64: body.recoverySaltB64,
      recoveryIv: body.recoveryIv,
      recoveryCt: body.recoveryCt,
      hasWaRecoveryKey: Boolean(body.waRecoveryKey),
      updatedAt: todayISO(),
    };
    this.save();
    return db.vaultMeta;
  }

  public getVaultEntries(): VaultEntryCipherRecord[] {
    const db = this.load();
    return db.vaultEntries ?? [];
  }

  public saveVaultEntry(body: {
    id?: string;
    label: string;
    category: string;
    iv: string;
    ciphertext: string;
    lastRotatedAt: string;
  }): VaultEntryCipherRecord {
    const db = this.load();
    if (!db.vaultEntries) db.vaultEntries = [];
    const id = body.id || generateUUID();
    const existingIdx = db.vaultEntries.findIndex((e) => e.id === id);
    const entry: VaultEntryCipherRecord = {
      id,
      label: body.label,
      category: body.category,
      iv: body.iv,
      ciphertext: body.ciphertext,
      lastRotatedAt: body.lastRotatedAt,
      updatedAt: todayISO(),
    };
    if (existingIdx >= 0) {
      db.vaultEntries[existingIdx] = entry;
    } else {
      db.vaultEntries.push(entry);
    }
    this.save();
    return entry;
  }

  public deleteVaultEntry(id: string): void {
    const db = this.load();
    if (db.vaultEntries) {
      db.vaultEntries = db.vaultEntries.filter((e) => e.id !== id);
      this.save();
    }
  }

  public rekeyVault(body: {
    saltB64: string;
    canaryIv: string;
    canaryCt: string;
    recoverySaltB64?: string | null;
    recoveryIv?: string | null;
    recoveryCt?: string | null;
    waRecoveryKey?: string | null;
    entries: Array<{
      id: string;
      label: string;
      category: string;
      iv: string;
      ciphertext: string;
      lastRotatedAt: string;
    }>;
  }): VaultMetaRecord {
    const db = this.load();
    const meta: VaultMetaRecord = {
      saltB64: body.saltB64,
      canaryIv: body.canaryIv,
      canaryCt: body.canaryCt,
      recoverySaltB64: body.recoverySaltB64 || null,
      recoveryIv: body.recoveryIv || null,
      recoveryCt: body.recoveryCt || null,
      hasWaRecoveryKey: Boolean(body.waRecoveryKey),
      updatedAt: todayISO(),
    };
    db.vaultMeta = meta;
    db.vaultEntries = body.entries.map((e) => ({
      ...e,
      updatedAt: todayISO(),
    }));
    this.save();
    return meta;
  }

  public getPreferences(): AppPreferences {
    if (typeof window === 'undefined') {
      return {
        systemLanguage: 'en',
        agentAutoExecute: true,
        llmProvider: 'gemini',
        llmModel: 'gemini-1.5-flash',
        hasApiKey: true,
        hasAppPin: false,
        autoLockMinutes: 0,
        autoBackupEnabled: true,
        autoBackupDir: 'backups',
        lastAutoBackupDate: todayISO(),
        updatedAt: todayISO(),
      };
    }
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      systemLanguage: 'en',
      agentAutoExecute: true,
      llmProvider: 'gemini',
      llmModel: 'gemini-1.5-flash',
      hasApiKey: true,
      hasAppPin: false,
      autoLockMinutes: 0,
      autoBackupEnabled: true,
      autoBackupDir: 'backups',
      lastAutoBackupDate: todayISO(),
      updatedAt: todayISO(),
    };
  }

  public updatePreferences(body: Partial<AppPreferences>): AppPreferences {
    const cur = this.getPreferences();
    const updated = { ...cur, ...body, updatedAt: todayISO() };
    if (typeof window !== 'undefined') {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  }

  public getWhatsAppStatus(): WhatsAppBridgeState {
    return {
      status: 'disconnected',
      qrDataUrl: null,
      connectedPhone: null,
      lastError: null,
      updatedAt: todayISO(),
    };
  }

  public globalSearch(query: string): GlobalSearchResult {
    const db = this.load();
    const q = query.toLowerCase().trim();
    if (!q) {
      return { query, transactions: [], notes: [], dues: [], loans: [], vault: [], goals: [], investments: [] };
    }

    const txs = db.transactions
      .filter((t) => t.category.toLowerCase().includes(q) || (t.party && t.party.toLowerCase().includes(q)) || (t.note && t.note.toLowerCase().includes(q)))
      .slice(0, 15)
      .map((t) => ({
        id: t.id,
        occurredAt: t.occurredAt,
        kind: t.kind,
        scope: t.scope,
        category: t.category,
        amountMinor: t.amountMinor,
        party: t.party || '',
        note: t.note || '',
        accountName: t.accountName,
      }));

    const notes = db.notes
      .filter((n) => n.title.toLowerCase().includes(q) || (n.body && n.body.toLowerCase().includes(q)))
      .slice(0, 10)
      .map((n) => ({
        id: n.id,
        title: n.title,
        content: n.body,
        scope: n.scope,
        color: n.color,
        pinned: n.pinned,
        isChecklist: Boolean(n.checklist && n.checklist.length > 0),
        checklistCount: n.checklist ? n.checklist.length : 0,
        checklistDoneCount: n.checklist ? n.checklist.filter((i) => i.done).length : 0,
      }));

    const dues = db.dues
      .filter((d) => d.personName.toLowerCase().includes(q) || (d.note && d.note.toLowerCase().includes(q)))
      .slice(0, 10)
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

    const loans = db.loans
      .filter((l) => l.name.toLowerCase().includes(q) || l.counterparty.toLowerCase().includes(q))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        name: l.name,
        counterparty: l.counterparty,
        direction: l.direction,
        scope: l.scope,
        remainingMinor: l.remainingMinor,
        status: l.status,
      }));

    return { query, transactions: txs, notes, dues, loans, vault: [], goals: [], investments: [] };
  }

  public getReports(params: { fromDate: string; toDate: string; scope?: Scope }): DetailedReports {
    const db = this.load();
    const txs = db.transactions.filter((t) => {
      if (params.scope && t.scope !== params.scope) return false;
      if (t.occurredAt < params.fromDate || t.occurredAt > params.toDate) return false;
      return true;
    });

    const catMap = new Map<string, { totalMinor: number; count: number; kind: 'income' | 'expense'; scope: Scope }>();
    const scopePnl: Record<Scope, { incomeMinor: number; expenseMinor: number; netMinor: number }> = {
      personal: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      business: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      family: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
    };

    for (const t of txs) {
      if (t.kind === 'income') {
        scopePnl[t.scope].incomeMinor += t.amountMinor;
        scopePnl[t.scope].netMinor += t.amountMinor;
      } else if (t.kind === 'expense') {
        scopePnl[t.scope].expenseMinor += t.amountMinor;
        scopePnl[t.scope].netMinor -= t.amountMinor;
        const cur = catMap.get(t.category) || { totalMinor: 0, count: 0, kind: 'expense', scope: t.scope };
        cur.totalMinor += t.amountMinor;
        cur.count += 1;
        catMap.set(t.category, cur);
      }
    }

    const categories = Array.from(catMap.entries()).map(([category, val]) => ({
      category,
      scope: val.scope,
      kind: val.kind,
      totalMinor: val.totalMinor,
      count: val.count,
    }));

    const dash = this.getDashboard(params.scope);

    return {
      monthlyCashflow: dash.sixMonthTrend.map((m) => ({
        month: m.month,
        incomeMinor: m.incomeMinor,
        expenseMinor: m.expenseMinor,
        netMinor: m.incomeMinor - m.expenseMinor,
      })),
      scopePnl,
      categories,
      accountActivity: db.accounts.map((a) => ({
        ...a,
        periodInflowMinor: 0,
        periodOutflowMinor: 0,
      })),
      loans: db.loans,
      dues: db.dues,
      duesByPerson: dash.dueSummariesByPerson,
      duesAging: {
        overdueMinor: 0,
        dueSoonMinor: dash.totalNeedMinor,
        upcomingMinor: 0,
        settledMinor: 0,
      },
      categoryBudgets: [],
      transactionCount: txs.length,
    };
  }

  public async pullDataFromSupabase(): Promise<{ count: number }> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured.');
    const user = await getCurrentUser();
    if (!user) throw new Error('Please sign in to Supabase first.');

    const userId = user.id;
    const [accRes, txRes, loanRes, dueRes, noteRes, sheetRes, billRes] = await Promise.all([
      client.from('accounts').select('*').eq('user_id', userId),
      client.from('transactions').select('*').eq('user_id', userId),
      client.from('loans').select('*').eq('user_id', userId),
      client.from('people_dues').select('*').eq('user_id', userId),
      client.from('notes').select('*').eq('user_id', userId),
      client.from('job_sheets').select('*').eq('user_id', userId),
      client.from('recurring_bills').select('*').eq('user_id', userId),
    ]);

    const db = this.load();
    let totalItems = 0;

    if (Array.isArray(accRes.data)) {
      db.accounts = accRes.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        accountGroup: r.account_group || 'bank',
        scope: r.scope,
        institution: r.institution || '',
        last4: r.last4 || '',
        openingBalanceMinor: r.opening_balance_minor || 0,
        minBalanceMinor: r.min_balance_minor || 0,
        creditLimitMinor: r.credit_limit_minor || 0,
        statementDay: r.statement_day || 15,
        dueDay: r.due_day || 5,
        currentBalanceMinor: r.opening_balance_minor || 0,
        cardCycle: null,
        createdAt: r.created_at || todayISO(),
      }));
      totalItems += db.accounts.length;
    }

    if (Array.isArray(txRes.data)) {
      db.transactions = txRes.data.map((r: any) => {
        const acc = db.accounts.find((a) => a.id === r.account_id);
        const toAcc = r.to_account_id ? db.accounts.find((a) => a.id === r.to_account_id) : null;
        return {
          id: r.id,
          kind: r.kind,
          scope: r.scope,
          accountId: r.account_id,
          accountName: acc ? acc.name : 'Unknown Account',
          toAccountId: r.to_account_id || null,
          toAccountName: toAcc ? toAcc.name : null,
          category: r.category,
          amountMinor: r.amount_minor,
          occurredAt: r.occurred_at,
          party: r.party || '',
          note: r.note || '',
          sourceRef: r.source_ref || null,
          createdAt: r.created_at || todayISO(),
          hasAttachment: false,
        };
      });
      totalItems += db.transactions.length;
    }

    if (Array.isArray(loanRes.data)) {
      db.loans = loanRes.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        scope: r.scope,
        direction: r.direction as LoanDirection,
        counterparty: r.institution || '',
        principalMinor: r.principal_minor,
        remainingMinor: r.remaining_minor,
        annualRateBps: Math.round((r.interest_rate_apr || 0) * 100),
        tenureMonths: 60,
        emiMinor: r.monthly_emi_minor || 0,
        startDate: r.start_date,
        nextDueDate: r.due_date,
        linkedAccountId: null,
        status: 'active' as const,
        totalInterestPaidMinor: 0,
        totalPrincipalPaidMinor: 0,
        createdAt: r.created_at || todayISO(),
      }));
      totalItems += db.loans.length;
    }

    if (Array.isArray(dueRes.data)) {
      db.dues = dueRes.data.map((r: any) => ({
        id: r.id,
        personName: r.person_name,
        phone: '',
        direction: r.direction as DueDirection,
        scope: r.scope,
        amountMinor: r.original_minor,
        settledMinor: Math.max(0, (r.original_minor || 0) - (r.remaining_minor || 0)),
        remainingMinor: r.remaining_minor,
        dueDate: r.due_date,
        status: (r.status === 'partially_paid' ? 'partial' : r.status) as any,
        note: r.notes || '',
        createdAt: r.created_at || todayISO(),
      }));
      totalItems += db.dues.length;
    }

    if (Array.isArray(noteRes.data)) {
      db.notes = noteRes.data.map((r: any) => ({
        id: r.id,
        title: r.title,
        body: r.body || '',
        tags: r.tags || [],
        scope: r.scope,
        color: (r.color || 'honey') as NoteColor,
        pinned: Boolean(r.pinned),
        archived: Boolean(r.archived),
        orderIndex: r.order_index ?? 0,
        checklist: r.checklist || [],
        attachments: [],
        linkedTxId: null,
        linkedDueId: null,
        linkedLoanId: null,
        linkedAccountId: null,
        createdAt: r.created_at || todayISO(),
        updatedAt: r.updated_at || todayISO(),
        remindAt: null,
      }));
      totalItems += db.notes.length;
    }

    if (Array.isArray(sheetRes.data)) {
      db.jobSheets = sheetRes.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        scope: r.scope,
        color: r.color || 'gold',
        columns: r.columns_json || [],
        rows: r.rows_json || [],
        settings: r.settings_json || {},
        orderIndex: r.order_index ?? 0,
      }));
      totalItems += db.jobSheets.length;
    }

    if (Array.isArray(billRes.data)) {
      db.recurringBills = billRes.data.map((r: any) => {
        const acc = db.accounts.find((a) => a.id === r.account_id);
        return {
          id: r.id,
          title: r.title,
          scope: r.scope,
          kind: r.kind,
          accountId: r.account_id,
          accountName: acc ? acc.name : 'Unknown Account',
          category: r.category,
          amountMinor: r.amount_minor,
          dueDay: r.day_of_month || 1,
          autoPost: Boolean(r.auto_post),
          active: Boolean(r.active),
          lastPaidMonth: null,
          createdAt: r.created_at || todayISO(),
        };
      });
      totalItems += db.recurringBills.length;
    }

    this.recomputeBalances();
    this.save(true);
    return { count: totalItems };
  }
}

export const clientDb = new ClientDatabaseManager();
