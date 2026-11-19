import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  type DueDirection,
  type InvestmentKind,
  type LoanDirection,
  type RuleMatchType,
  type Scope,
  type TxKind,
  addMonthsISO,
  daysBetweenISO,
  splitLoanPayment,
  todayISO,
} from '../../shared/ledger-core.ts';
import { getAccountById, listAccounts } from './accounts-repo.ts';
import { withTransaction } from './schema.ts';

export interface TransactionRecord {
  id: string;
  kind: TxKind;
  scope: Scope;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  category: string;
  amountMinor: number;
  occurredAt: string;
  party: string;
  note: string;
  sourceRef: string | null;
  hasAttachment?: boolean;
  createdAt: string;
}

export interface RecurringBillRecord {
  id: string;
  title: string;
  scope: Scope;
  kind: 'expense' | 'income';
  accountId: string;
  accountName: string;
  category: string;
  amountMinor: number;
  dueDay: number;
  lastPaidMonth: string | null;
  active: boolean;
  autoPost: boolean;
  createdAt: string;
}

export interface LoanRecord {
  id: string;
  name: string;
  counterparty: string;
  scope: Scope;
  direction: LoanDirection;
  principalMinor: number;
  remainingMinor: number;
  annualRateBps: number;
  tenureMonths: number;
  emiMinor: number;
  startDate: string;
  nextDueDate: string;
  linkedAccountId: string | null;
  status: 'active' | 'closed';
  totalInterestPaidMinor: number;
  totalPrincipalPaidMinor: number;
  createdAt: string;
}

export interface PersonDueRecord {
  id: string;
  personName: string;
  phone: string;
  direction: DueDirection;
  scope: Scope;
  amountMinor: number;
  settledMinor: number;
  remainingMinor: number;
  dueDate: string | null;
  note: string;
  status: 'open' | 'partial' | 'settled';
  createdAt: string;
}

export interface PersonNetSummary {
  personName: string;
  phone: string;
  totalNeedMinor: number;
  totalGiveMinor: number;
  netMinor: number; // positive = they owe you; negative = you owe them
  openCount: number;
}

export function listTransactions(
  db: DatabaseSync,
  filters: {
    scope?: Scope;
    kind?: TxKind;
    accountId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
  } = {},
): TransactionRecord[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters.scope) {
    clauses.push('t.scope = ?');
    params.push(filters.scope);
  }
  if (filters.kind) {
    clauses.push('t.kind = ?');
    params.push(filters.kind);
  }
  if (filters.accountId) {
    clauses.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.fromDate) {
    clauses.push('t.occurred_at >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    clauses.push('t.occurred_at <= ?');
    params.push(filters.toDate);
  }
  if (filters.search) {
    const q = `%${filters.search.trim()}%`;
    clauses.push('(t.category LIKE ? OR t.party LIKE ? OR t.note LIKE ?)');
    params.push(q, q, q);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters.limit ?? 300;
  params.push(limit);

  const rows = db
    .prepare(`
      SELECT t.*, a1.name AS account_name, a2.name AS to_account_name,
        CASE WHEN ta.id IS NOT NULL THEN 1 ELSE 0 END AS has_attachment
      FROM transactions t
      JOIN accounts a1 ON a1.id = t.account_id
      LEFT JOIN accounts a2 ON a2.id = t.to_account_id
      LEFT JOIN transaction_attachments ta ON ta.transaction_id = t.id
      ${where}
      ORDER BY t.occurred_at DESC, t.created_at DESC
      LIMIT ?
    `)
    .all(...params) as unknown as Array<{
      id: string;
      kind: TxKind;
      scope: Scope;
      account_id: string;
      account_name: string;
      to_account_id: string | null;
      to_account_name: string | null;
      category: string;
      amount_minor: number;
      occurred_at: string;
      party: string;
      note: string;
      source_ref: string | null;
      has_attachment: number;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    scope: r.scope,
    accountId: r.account_id,
    accountName: r.account_name,
    toAccountId: r.to_account_id,
    toAccountName: r.to_account_name,
    category: r.category,
    amountMinor: r.amount_minor,
    occurredAt: r.occurred_at,
    party: r.party,
    note: r.note,
    sourceRef: r.source_ref,
    hasAttachment: r.has_attachment === 1,
    createdAt: r.created_at,
  }));
}

export function getTransactionById(db: DatabaseSync, id: string): TransactionRecord | null {
  const row = db.prepare(`
    SELECT
      t.id, t.kind, t.scope, t.account_id, a.name AS account_name,
      t.to_account_id, a2.name AS to_account_name,
      t.category, t.amount_minor, t.occurred_at, t.party, t.note,
      t.source_ref,
      CASE WHEN att.id IS NOT NULL THEN 1 ELSE 0 END AS has_attachment,
      t.created_at
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts a2 ON a2.id = t.to_account_id
    LEFT JOIN transaction_attachments att ON att.transaction_id = t.id
    WHERE t.id = ?
  `).get(id) as {
    id: string;
    kind: TxKind;
    scope: Scope;
    account_id: string;
    account_name: string;
    to_account_id: string | null;
    to_account_name: string | null;
    category: string;
    amount_minor: number;
    occurred_at: string;
    party: string;
    note: string;
    source_ref: string | null;
    has_attachment: number;
    created_at: string;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    accountId: row.account_id,
    accountName: row.account_name,
    toAccountId: row.to_account_id,
    toAccountName: row.to_account_name,
    category: row.category,
    amountMinor: row.amount_minor,
    occurredAt: row.occurred_at,
    party: row.party,
    note: row.note,
    sourceRef: row.source_ref,
    hasAttachment: row.has_attachment === 1,
    createdAt: row.created_at,
  };
}

export function createTransaction(
  db: DatabaseSync,
  input: {
    kind: TxKind;
    scope: Scope;
    accountId: string;
    toAccountId?: string | null;
    category: string;
    amountMinor: number;
    occurredAt: string;
    party?: string;
    note?: string;
    sourceRef?: string | null;
  },
): TransactionRecord {
  const srcAcc = getAccountById(db, input.accountId);
  if (!srcAcc) throw new Error('Source account not found');
  if (input.kind === 'transfer') {
    if (!input.toAccountId) throw new Error('Destination account is required for transfer');
    const dstAcc = getAccountById(db, input.toAccountId);
    if (!dstAcc) throw new Error('Destination account not found');
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO transactions (
      id, kind, scope, account_id, to_account_id, category,
      amount_minor, occurred_at, party, note, source_ref, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.kind,
    input.scope,
    input.accountId,
    input.kind === 'transfer' ? (input.toAccountId ?? null) : null,
    input.category,
    input.amountMinor,
    input.occurredAt,
    input.party ?? '',
    input.note ?? '',
    input.sourceRef ?? null,
    createdAt,
  );

  return getTransactionById(db, id)!;
}

export function updateTransaction(
  db: DatabaseSync,
  id: string,
  input: {
    kind: TxKind;
    scope: Scope;
    accountId: string;
    toAccountId?: string | null;
    category: string;
    amountMinor: number;
    occurredAt: string;
    party?: string;
    note?: string;
  },
): TransactionRecord | null {
  const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) return null;

  const srcAcc = getAccountById(db, input.accountId);
  if (!srcAcc) throw new Error('Source account not found');
  if (input.kind === 'transfer') {
    if (!input.toAccountId || input.toAccountId === input.accountId) {
      throw new Error('Destination account must differ from source account');
    }
    const dstAcc = getAccountById(db, input.toAccountId);
    if (!dstAcc) throw new Error('Destination account not found');
  }

  db.prepare(`
    UPDATE transactions SET
      kind = ?, scope = ?, account_id = ?, to_account_id = ?,
      category = ?, amount_minor = ?, occurred_at = ?, party = ?, note = ?
    WHERE id = ?
  `).run(
    input.kind,
    input.scope,
    input.accountId,
    input.kind === 'transfer' ? (input.toAccountId ?? null) : null,
    input.category,
    input.amountMinor,
    input.occurredAt,
    input.party ?? '',
    input.note ?? '',
    id,
  );

  return listTransactions(db, { limit: 5000 }).find((t) => t.id === id) ?? null;
}

export function deleteTransaction(db: DatabaseSync, id: string): boolean {
  return withTransaction(db, () => {
    // Reverse linked loan EMI payment if this transaction posted one
    const loanPayment = db
      .prepare('SELECT id, loan_id, principal_minor FROM loan_payments WHERE transaction_id = ?')
      .get(id) as { id: string; loan_id: string; principal_minor: number } | undefined;

    if (loanPayment) {
      db.prepare(`
        UPDATE loans
        SET remaining_minor = MIN(principal_minor, remaining_minor + ?),
            status = 'active'
        WHERE id = ?
      `).run(loanPayment.principal_minor, loanPayment.loan_id);
      db.prepare('DELETE FROM loan_payments WHERE id = ?').run(loanPayment.id);
    }

    // Reverse linked due settlement if this transaction posted one
    const dueSettlement = db
      .prepare('SELECT id, due_id, amount_minor FROM due_settlements WHERE transaction_id = ?')
      .get(id) as { id: string; due_id: string; amount_minor: number } | undefined;

    if (dueSettlement) {
      const due = db
        .prepare('SELECT settled_minor, amount_minor FROM people_dues WHERE id = ?')
        .get(dueSettlement.due_id) as { settled_minor: number; amount_minor: number } | undefined;
      if (due) {
        const nextSettled = Math.max(0, due.settled_minor - dueSettlement.amount_minor);
        const nextStatus =
          nextSettled >= due.amount_minor ? 'settled' : nextSettled > 0 ? 'partial' : 'open';
        db.prepare('UPDATE people_dues SET settled_minor = ?, status = ? WHERE id = ?').run(
          nextSettled,
          nextStatus,
          dueSettlement.due_id,
        );
      }
      db.prepare('DELETE FROM due_settlements WHERE id = ?').run(dueSettlement.id);
    }

    const res = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  });
}

export function bulkUpdateTransactions(
  db: DatabaseSync,
  ids: string[],
  patch: { scope?: Scope; category?: string },
): number {
  return withTransaction(db, () => {
    let count = 0;
    for (const id of ids) {
      const existing = db
        .prepare('SELECT scope, category FROM transactions WHERE id = ?')
        .get(id) as { scope: Scope; category: string } | undefined;
      if (!existing) continue;
      const newScope = patch.scope ?? existing.scope;
      const newCategory = patch.category ? patch.category.trim() : existing.category;
      const res = db
        .prepare('UPDATE transactions SET scope = ?, category = ? WHERE id = ?')
        .run(newScope, newCategory, id);
      if (Number(res.changes) > 0) count++;
    }
    return count;
  });
}

export function bulkDeleteTransactions(db: DatabaseSync, ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    const deleted = deleteTransaction(db, id);
    if (deleted) count++;
  }
  return count;
}

// 1-click bank reconciliation adjustment
export function reconcileBankBalance(
  db: DatabaseSync,
  accountId: string,
  targetBalanceMinor: number,
  occurredAt: string = todayISO(),
): TransactionRecord | null {
  const account = getAccountById(db, accountId, occurredAt);
  if (!account) throw new Error('Account not found');
  if (account.type !== 'bank') throw new Error('Reconcile is only supported for bank accounts');
  const diff = targetBalanceMinor - account.currentBalanceMinor;
  if (diff === 0) return null;

  return createTransaction(db, {
    kind: diff > 0 ? 'income' : 'expense',
    scope: account.scope,
    accountId,
    category: 'Balance Adjustment',
    amountMinor: Math.abs(diff),
    occurredAt,
    party: 'Reconciliation',
    note: 'Manual balance reconciliation',
    sourceRef: 'reconcile',
  });
}

// Recurring Bills
export function listRecurringBills(db: DatabaseSync): RecurringBillRecord[] {
  const rows = db
    .prepare(`
      SELECT r.*, a.name AS account_name
      FROM recurring_bills r
      JOIN accounts a ON a.id = r.account_id
      ORDER BY r.due_day ASC, r.title ASC
    `)
    .all() as unknown as Array<{
      id: string;
      title: string;
      scope: Scope;
      kind: 'expense' | 'income';
      account_id: string;
      account_name: string;
      category: string;
      amount_minor: number;
      due_day: number;
      last_paid_month: string | null;
      active: number;
      auto_post: number;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    scope: r.scope,
    kind: r.kind,
    accountId: r.account_id,
    accountName: r.account_name,
    category: r.category,
    amountMinor: r.amount_minor,
    dueDay: r.due_day,
    lastPaidMonth: r.last_paid_month,
    active: r.active === 1,
    autoPost: r.auto_post === 1,
    createdAt: r.created_at,
  }));
}

export function createRecurringBill(
  db: DatabaseSync,
  input: {
    title: string;
    scope: Scope;
    kind: 'expense' | 'income';
    accountId: string;
    category: string;
    amountMinor: number;
    dueDay: number;
    active: boolean;
    autoPost?: boolean;
  },
): RecurringBillRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO recurring_bills (
      id, title, scope, kind, account_id, category, amount_minor, due_day, active, auto_post, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.title,
    input.scope,
    input.kind,
    input.accountId,
    input.category,
    input.amountMinor,
    input.dueDay,
    input.active ? 1 : 0,
    input.autoPost ? 1 : 0,
    createdAt,
  );
  return listRecurringBills(db).find((b) => b.id === id)!;
}

export function confirmRecurringBill(
  db: DatabaseSync,
  billId: string,
  paidAt: string = todayISO(),
): { bill: RecurringBillRecord; transaction: TransactionRecord } {
  return withTransaction(db, () => {
    const bill = listRecurringBills(db).find((b) => b.id === billId);
    if (!bill) throw new Error('Recurring bill not found');

    const tx = createTransaction(db, {
      kind: bill.kind,
      scope: bill.scope,
      accountId: bill.accountId,
      category: bill.category,
      amountMinor: bill.amountMinor,
      occurredAt: paidAt,
      party: bill.title,
      note: 'Recurring confirmation',
      sourceRef: `recurring:${bill.id}`,
    });

    db.prepare('UPDATE recurring_bills SET last_paid_month = ? WHERE id = ?').run(
      paidAt.slice(0, 7),
      bill.id,
    );

    return {
      bill: listRecurringBills(db).find((b) => b.id === billId)!,
      transaction: tx,
    };
  });
}

export function updateRecurringBill(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    title: string;
    scope: Scope;
    kind: 'expense' | 'income';
    accountId: string;
    category: string;
    amountMinor: number;
    dueDay: number;
    active: boolean;
    autoPost: boolean;
  }>,
): RecurringBillRecord | null {
  const existing = listRecurringBills(db).find((b) => b.id === id);
  if (!existing) return null;
  if (patch.accountId && !getAccountById(db, patch.accountId)) {
    throw new Error('Account not found');
  }
  db.prepare(`
    UPDATE recurring_bills SET
      title = ?, scope = ?, kind = ?, account_id = ?, category = ?,
      amount_minor = ?, due_day = ?, active = ?, auto_post = ?
    WHERE id = ?
  `).run(
    patch.title ?? existing.title,
    patch.scope ?? existing.scope,
    patch.kind ?? existing.kind,
    patch.accountId ?? existing.accountId,
    patch.category ?? existing.category,
    patch.amountMinor ?? existing.amountMinor,
    patch.dueDay ?? existing.dueDay,
    (patch.active ?? existing.active) ? 1 : 0,
    (patch.autoPost ?? existing.autoPost) ? 1 : 0,
    id,
  );
  return listRecurringBills(db).find((b) => b.id === id) ?? null;
}

export function autoPostDueRecurringBills(
  db: DatabaseSync,
  refDate: string = todayISO(),
): Array<{ bill: RecurringBillRecord; transaction: TransactionRecord }> {
  const monthPrefix = refDate.slice(0, 7);
  const todayDay = Number(refDate.slice(8, 10));
  const candidates = listRecurringBills(db).filter(
    (b) => b.active && b.autoPost && b.lastPaidMonth !== monthPrefix && b.dueDay <= todayDay,
  );
  const posted: Array<{ bill: RecurringBillRecord; transaction: TransactionRecord }> = [];
  for (const bill of candidates) {
    const sourceTag = `recurring_auto:${bill.id}:${monthPrefix}`;
    const already = db
      .prepare('SELECT id FROM transactions WHERE source_ref = ? LIMIT 1')
      .get(sourceTag) as { id: string } | undefined;
    if (already) continue;

    const occurredAt = `${monthPrefix}-${String(bill.dueDay).padStart(2, '0')}`;
    const res = withTransaction(db, () => {
      const tx = createTransaction(db, {
        kind: bill.kind,
        scope: bill.scope,
        accountId: bill.accountId,
        category: bill.category,
        amountMinor: bill.amountMinor,
        occurredAt,
        party: bill.title,
        note: 'Auto-posted scheduled recurring entry',
        sourceRef: sourceTag,
      });
      db.prepare('UPDATE recurring_bills SET last_paid_month = ? WHERE id = ?').run(monthPrefix, bill.id);
      return { bill: listRecurringBills(db).find((b) => b.id === bill.id)!, transaction: tx };
    });
    posted.push(res);
  }
  return posted;
}

export function deleteRecurringBill(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM recurring_bills WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// Scope Budgets
export function listScopeBudgets(db: DatabaseSync): Array<{ scope: Scope; monthlyLimitMinor: number }> {
  const rows = db
    .prepare('SELECT scope, monthly_limit_minor FROM scope_budgets')
    .all() as unknown as Array<{ scope: Scope; monthly_limit_minor: number }>;
  return rows.map((r) => ({ scope: r.scope, monthlyLimitMinor: r.monthly_limit_minor }));
}

export function upsertScopeBudget(db: DatabaseSync, scope: Scope, monthlyLimitMinor: number): void {
  db.prepare(`
    INSERT INTO scope_budgets (scope, monthly_limit_minor, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET
      monthly_limit_minor = excluded.monthly_limit_minor,
      updated_at = excluded.updated_at
  `).run(scope, monthlyLimitMinor, new Date().toISOString());
}

// Category Budgets
export interface CategoryBudgetRecord {
  id: string;
  scope: Scope;
  category: string;
  monthlyLimitMinor: number;
}

export function listCategoryBudgets(db: DatabaseSync): CategoryBudgetRecord[] {
  const rows = db
    .prepare('SELECT id, scope, category, monthly_limit_minor FROM category_budgets ORDER BY scope, category')
    .all() as unknown as Array<{ id: string; scope: Scope; category: string; monthly_limit_minor: number }>;
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    category: r.category,
    monthlyLimitMinor: r.monthly_limit_minor,
  }));
}

export function upsertCategoryBudget(
  db: DatabaseSync,
  scope: Scope,
  category: string,
  monthlyLimitMinor: number,
): CategoryBudgetRecord {
  const id = crypto.randomUUID();
  const cleanCat = category.trim();
  db.prepare(`
    INSERT INTO category_budgets (id, scope, category, monthly_limit_minor, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, category) DO UPDATE SET
      monthly_limit_minor = excluded.monthly_limit_minor,
      updated_at = excluded.updated_at
  `).run(id, scope, cleanCat, monthlyLimitMinor, new Date().toISOString());
  return listCategoryBudgets(db).find((b) => b.scope === scope && b.category.toLowerCase() === cleanCat.toLowerCase())!;
}

export function deleteCategoryBudget(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM category_budgets WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// Loans
export function listLoans(db: DatabaseSync): LoanRecord[] {
  const rows = db
    .prepare(`
      SELECT l.*,
        COALESCE((SELECT SUM(p.interest_minor) FROM loan_payments p WHERE p.loan_id = l.id), 0) AS total_interest,
        COALESCE((SELECT SUM(p.principal_minor) FROM loan_payments p WHERE p.loan_id = l.id), 0) AS total_principal
      FROM loans l
      ORDER BY l.status ASC, l.next_due_date ASC
    `)
    .all() as unknown as Array<{
      id: string;
      name: string;
      counterparty: string;
      scope: Scope;
      direction: LoanDirection;
      principal_minor: number;
      remaining_minor: number;
      annual_rate_bps: number;
      tenure_months: number;
      emi_minor: number;
      start_date: string;
      next_due_date: string;
      linked_account_id: string | null;
      status: 'active' | 'closed';
      total_interest: number;
      total_principal: number;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    counterparty: r.counterparty,
    scope: r.scope,
    direction: r.direction,
    principalMinor: r.principal_minor,
    remainingMinor: r.remaining_minor,
    annualRateBps: r.annual_rate_bps,
    tenureMonths: r.tenure_months,
    emiMinor: r.emi_minor,
    startDate: r.start_date,
    nextDueDate: r.next_due_date,
    linkedAccountId: r.linked_account_id,
    status: r.status,
    totalInterestPaidMinor: r.total_interest,
    totalPrincipalPaidMinor: r.total_principal,
    createdAt: r.created_at,
  }));
}

export function createLoan(
  db: DatabaseSync,
  input: {
    name: string;
    counterparty: string;
    scope: Scope;
    direction: LoanDirection;
    principalMinor: number;
    remainingMinor?: number;
    annualRateBps: number;
    tenureMonths: number;
    emiMinor: number;
    startDate: string;
    nextDueDate: string;
    linkedAccountId?: string | null;
  },
): LoanRecord {
  const id = crypto.randomUUID();
  const remaining = input.remainingMinor ?? input.principalMinor;
  const status = remaining <= 0 ? 'closed' : 'active';
  db.prepare(`
    INSERT INTO loans (
      id, name, counterparty, scope, direction, principal_minor, remaining_minor,
      annual_rate_bps, tenure_months, emi_minor, start_date, next_due_date,
      linked_account_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.counterparty,
    input.scope,
    input.direction,
    input.principalMinor,
    remaining,
    input.annualRateBps,
    input.tenureMonths,
    input.emiMinor,
    input.startDate,
    input.nextDueDate,
    input.linkedAccountId ?? null,
    status,
    new Date().toISOString(),
  );
  return listLoans(db).find((l) => l.id === id)!;
}

export function recordLoanPayment(
  db: DatabaseSync,
  loanId: string,
  input: { amountMinor: number; accountId: string; paidAt: string; note?: string },
): { loan: LoanRecord; transaction: TransactionRecord } {
  return withTransaction(db, () => {
    const loan = listLoans(db).find((l) => l.id === loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status === 'closed') throw new Error('Loan is already closed');

    const { interestMinor, principalMinor, newRemainingMinor } = splitLoanPayment({
      remainingPrincipalMinor: loan.remainingMinor,
      annualRateBps: loan.annualRateBps,
      paymentMinor: input.amountMinor,
    });

    const paymentId = crypto.randomUUID();
    const tx = createTransaction(db, {
      kind: loan.direction === 'borrowed' ? 'expense' : 'income',
      scope: loan.scope,
      accountId: input.accountId,
      category: loan.direction === 'borrowed' ? 'Loan EMI' : 'Loan Repayment Received',
      amountMinor: input.amountMinor,
      occurredAt: input.paidAt,
      party: loan.counterparty,
      note: input.note || `${loan.name} payment`,
      sourceRef: `loan_payment:${paymentId}`,
    });

    db.prepare(`
      INSERT INTO loan_payments (
        id, loan_id, account_id, transaction_id, amount_minor,
        principal_minor, interest_minor, paid_at, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      loanId,
      input.accountId,
      tx.id,
      input.amountMinor,
      principalMinor,
      interestMinor,
      input.paidAt,
      input.note ?? '',
      new Date().toISOString(),
    );

    const newStatus = newRemainingMinor <= 0 ? 'closed' : 'active';
    const nextDue = addMonthsISO(loan.nextDueDate, 1);
    db.prepare('UPDATE loans SET remaining_minor = ?, status = ?, next_due_date = ? WHERE id = ?').run(
      newRemainingMinor,
      newStatus,
      nextDue,
      loanId,
    );

    return {
      loan: listLoans(db).find((l) => l.id === loanId)!,
      transaction: tx,
    };
  });
}

export function updateLoan(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    name: string;
    counterparty: string;
    scope: Scope;
    direction: LoanDirection;
    principalMinor: number;
    remainingMinor: number;
    annualRateBps: number;
    tenureMonths: number;
    emiMinor: number;
    startDate: string;
    nextDueDate: string;
    linkedAccountId: string | null;
    status: 'active' | 'closed';
  }>,
): LoanRecord | null {
  const existing = listLoans(db).find((l) => l.id === id);
  if (!existing) return null;
  const remaining = patch.remainingMinor ?? existing.remainingMinor;
  const status = patch.status ?? (remaining <= 0 ? 'closed' : 'active');
  db.prepare(`
    UPDATE loans SET
      name = ?, counterparty = ?, scope = ?, direction = ?,
      principal_minor = ?, remaining_minor = ?, annual_rate_bps = ?,
      tenure_months = ?, emi_minor = ?, start_date = ?, next_due_date = ?,
      linked_account_id = ?, status = ?
    WHERE id = ?
  `).run(
    patch.name ?? existing.name,
    patch.counterparty ?? existing.counterparty,
    patch.scope ?? existing.scope,
    patch.direction ?? existing.direction,
    patch.principalMinor ?? existing.principalMinor,
    remaining,
    patch.annualRateBps ?? existing.annualRateBps,
    patch.tenureMonths ?? existing.tenureMonths,
    patch.emiMinor ?? existing.emiMinor,
    patch.startDate ?? existing.startDate,
    patch.nextDueDate ?? existing.nextDueDate,
    patch.linkedAccountId !== undefined ? patch.linkedAccountId : existing.linkedAccountId,
    status,
    id,
  );
  return listLoans(db).find((l) => l.id === id) ?? null;
}

export function deleteLoan(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM loans WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// People Dues (Give / Need)
export function listPeopleDues(db: DatabaseSync): PersonDueRecord[] {
  const rows = db
    .prepare(`
      SELECT * FROM people_dues
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
        COALESCE(due_date, '9999-12-31') ASC,
        created_at DESC
    `)
    .all() as unknown as Array<{
      id: string;
      person_name: string;
      phone: string;
      direction: DueDirection;
      scope: Scope;
      amount_minor: number;
      settled_minor: number;
      due_date: string | null;
      note: string;
      status: 'open' | 'partial' | 'settled';
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    personName: r.person_name,
    phone: r.phone,
    direction: r.direction,
    scope: r.scope,
    amountMinor: r.amount_minor,
    settledMinor: r.settled_minor,
    remainingMinor: Math.max(0, r.amount_minor - r.settled_minor),
    dueDate: r.due_date,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export function summarizeDuesByPerson(dues: PersonDueRecord[]): PersonNetSummary[] {
  const map = new Map<string, PersonNetSummary>();
  for (const d of dues) {
    if (d.status === 'settled' || d.remainingMinor <= 0) continue;
    const key = d.personName.trim().toLowerCase();
    const cur = map.get(key) ?? {
      personName: d.personName.trim(),
      phone: d.phone,
      totalNeedMinor: 0,
      totalGiveMinor: 0,
      netMinor: 0,
      openCount: 0,
    };
    if (!cur.phone && d.phone) cur.phone = d.phone;
    if (d.direction === 'need') cur.totalNeedMinor += d.remainingMinor;
    else cur.totalGiveMinor += d.remainingMinor;
    cur.netMinor = cur.totalNeedMinor - cur.totalGiveMinor;
    cur.openCount += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));
}

export function createPersonDue(
  db: DatabaseSync,
  input: {
    personName: string;
    phone?: string;
    direction: DueDirection;
    scope: Scope;
    amountMinor: number;
    dueDate?: string | null;
    note?: string;
  },
): PersonDueRecord {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO people_dues (
      id, person_name, phone, direction, scope, amount_minor, settled_minor, due_date, note, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'open', ?)
  `).run(
    id,
    input.personName.trim(),
    input.phone ?? '',
    input.direction,
    input.scope,
    input.amountMinor,
    input.dueDate ?? null,
    input.note ?? '',
    new Date().toISOString(),
  );
  return listPeopleDues(db).find((d) => d.id === id)!;
}

export function settlePersonDue(
  db: DatabaseSync,
  dueId: string,
  input: { amountMinor: number; accountId?: string | null; settledAt: string; note?: string },
): { due: PersonDueRecord; transaction: TransactionRecord | null } {
  return withTransaction(db, () => {
    const due = listPeopleDues(db).find((d) => d.id === dueId);
    if (!due) throw new Error('Due record not found');
    if (due.status === 'settled') throw new Error('Due is already settled');
    if (input.amountMinor > due.remainingMinor) {
      throw new Error('Settlement amount exceeds remaining due balance');
    }

    const settlementId = crypto.randomUUID();
    let tx: TransactionRecord | null = null;
    if (input.accountId) {
      tx = createTransaction(db, {
        kind: due.direction === 'need' ? 'income' : 'expense',
        scope: due.scope,
        accountId: input.accountId,
        category: due.direction === 'need' ? 'Due Received' : 'Due Paid',
        amountMinor: input.amountMinor,
        occurredAt: input.settledAt,
        party: due.personName,
        note: input.note || `Settlement (${due.direction})`,
        sourceRef: `due_settlement:${settlementId}`,
      });
    }

    db.prepare(`
      INSERT INTO due_settlements (
        id, due_id, account_id, transaction_id, amount_minor, settled_at, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      settlementId,
      dueId,
      input.accountId ?? null,
      tx?.id ?? null,
      input.amountMinor,
      input.settledAt,
      input.note ?? '',
      new Date().toISOString(),
    );

    const newSettled = due.settledMinor + input.amountMinor;
    const newStatus = newSettled >= due.amountMinor ? 'settled' : 'partial';
    db.prepare('UPDATE people_dues SET settled_minor = ?, status = ? WHERE id = ?').run(
      newSettled,
      newStatus,
      dueId,
    );

    return {
      due: listPeopleDues(db).find((d) => d.id === dueId)!,
      transaction: tx,
    };
  });
}

export function updatePersonDue(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    personName: string;
    phone: string;
    direction: DueDirection;
    scope: Scope;
    amountMinor: number;
    dueDate: string | null;
    note: string;
  }>,
): PersonDueRecord | null {
  const existing = listPeopleDues(db).find((d) => d.id === id);
  if (!existing) return null;
  const nextAmount = patch.amountMinor ?? existing.amountMinor;
  const nextSettled = Math.min(existing.settledMinor, nextAmount);
  const nextStatus =
    nextSettled >= nextAmount ? 'settled' : nextSettled > 0 ? 'partial' : 'open';
  db.prepare(`
    UPDATE people_dues SET
      person_name = ?, phone = ?, direction = ?, scope = ?,
      amount_minor = ?, settled_minor = ?, due_date = ?, note = ?, status = ?
    WHERE id = ?
  `).run(
    (patch.personName ?? existing.personName).trim(),
    patch.phone ?? existing.phone,
    patch.direction ?? existing.direction,
    patch.scope ?? existing.scope,
    nextAmount,
    nextSettled,
    patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
    patch.note ?? existing.note,
    nextStatus,
    id,
  );
  return listPeopleDues(db).find((d) => d.id === id) ?? null;
}

export function deletePersonDue(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM people_dues WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// Savings Goals, Tax Reserves & Emergency Runway
export interface SavingsGoalRecord {
  id: string;
  title: string;
  kind: 'goal' | 'emergency' | 'tax_reserve';
  scope: Scope;
  targetMinor: number;
  currentMinor: number;
  targetDate: string | null;
  linkedAccountId: string | null;
  note: string;
  createdAt: string;
}

export function listSavingsGoals(db: DatabaseSync): SavingsGoalRecord[] {
  const rows = db
    .prepare('SELECT * FROM savings_goals ORDER BY created_at DESC')
    .all() as unknown as Array<{
      id: string;
      title: string;
      kind: 'goal' | 'emergency' | 'tax_reserve';
      scope: Scope;
      target_minor: number;
      current_minor: number;
      target_date: string | null;
      linked_account_id: string | null;
      note: string;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    scope: r.scope,
    targetMinor: r.target_minor,
    currentMinor: r.current_minor,
    targetDate: r.target_date,
    linkedAccountId: r.linked_account_id,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export function createSavingsGoal(
  db: DatabaseSync,
  input: {
    title: string;
    kind: 'goal' | 'emergency' | 'tax_reserve';
    scope: Scope;
    targetMinor: number;
    currentMinor?: number;
    targetDate?: string | null;
    linkedAccountId?: string | null;
    note?: string;
  },
): SavingsGoalRecord {
  if (input.linkedAccountId && !getAccountById(db, input.linkedAccountId)) {
    throw new Error('Linked account not found');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO savings_goals (
      id, title, kind, scope, target_minor, current_minor,
      target_date, linked_account_id, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.title.trim(),
    input.kind,
    input.scope,
    input.targetMinor,
    input.currentMinor ?? 0,
    input.targetDate ?? null,
    input.linkedAccountId ?? null,
    input.note ?? '',
    now,
  );
  return listSavingsGoals(db).find((g) => g.id === id)!;
}

export function updateSavingsGoal(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    title: string;
    kind: 'goal' | 'emergency' | 'tax_reserve';
    scope: Scope;
    targetMinor: number;
    currentMinor: number;
    targetDate: string | null;
    linkedAccountId: string | null;
    note: string;
  }>,
): SavingsGoalRecord | null {
  const existing = listSavingsGoals(db).find((g) => g.id === id);
  if (!existing) return null;
  if (patch.linkedAccountId && !getAccountById(db, patch.linkedAccountId)) {
    throw new Error('Linked account not found');
  }
  db.prepare(`
    UPDATE savings_goals SET
      title = ?, kind = ?, scope = ?, target_minor = ?, current_minor = ?,
      target_date = ?, linked_account_id = ?, note = ?
    WHERE id = ?
  `).run(
    (patch.title ?? existing.title).trim(),
    patch.kind ?? existing.kind,
    patch.scope ?? existing.scope,
    patch.targetMinor ?? existing.targetMinor,
    patch.currentMinor ?? existing.currentMinor,
    patch.targetDate !== undefined ? patch.targetDate : existing.targetDate,
    patch.linkedAccountId !== undefined ? patch.linkedAccountId : existing.linkedAccountId,
    patch.note ?? existing.note,
    id,
  );
  return listSavingsGoals(db).find((g) => g.id === id) ?? null;
}

export function contributeToSavingsGoal(
  db: DatabaseSync,
  id: string,
  input: {
    amountMinor: number;
    accountId?: string | null;
    occurredAt?: string;
    recordAsExpense?: boolean;
    note?: string;
  },
): { goal: SavingsGoalRecord; transaction: TransactionRecord | null } {
  return withTransaction(db, () => {
    const goal = listSavingsGoals(db).find((g) => g.id === id);
    if (!goal) throw new Error('Savings goal not found');

    let tx: TransactionRecord | null = null;
    if (input.recordAsExpense && input.accountId) {
      tx = createTransaction(db, {
        kind: 'expense',
        scope: goal.scope,
        accountId: input.accountId,
        category: goal.kind === 'tax_reserve' ? 'Tax Reserve' : 'Savings Set-Aside',
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt || todayISO(),
        party: goal.title,
        note: input.note || `Set aside for ${goal.title}`,
        sourceRef: `goal:${goal.id}`,
      });
    }

    const nextCurrent = goal.currentMinor + input.amountMinor;
    db.prepare('UPDATE savings_goals SET current_minor = ? WHERE id = ?').run(nextCurrent, goal.id);
    return {
      goal: listSavingsGoals(db).find((g) => g.id === id)!,
      transaction: tx,
    };
  });
}

export function deleteSavingsGoal(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM savings_goals WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// Investments, FDs & Assets
export interface InvestmentRecord {
  id: string;
  title: string;
  kind: InvestmentKind;
  scope: Scope;
  investedMinor: number;
  currentValueMinor: number;
  unitsQty: number;
  maturityDate: string | null;
  sipDay: number | null;
  sipAmountMinor: number;
  note: string;
  createdAt: string;
}

export function listInvestments(db: DatabaseSync): InvestmentRecord[] {
  const rows = db
    .prepare('SELECT * FROM investments ORDER BY current_value_minor DESC, title ASC')
    .all() as unknown as Array<{
      id: string;
      title: string;
      kind: InvestmentKind;
      scope: Scope;
      invested_minor: number;
      current_value_minor: number;
      units_qty: number;
      maturity_date: string | null;
      sip_day: number | null;
      sip_amount_minor: number;
      note: string;
      created_at: string;
    }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    scope: r.scope,
    investedMinor: r.invested_minor,
    currentValueMinor: r.current_value_minor,
    unitsQty: r.units_qty,
    maturityDate: r.maturity_date,
    sipDay: r.sip_day,
    sipAmountMinor: r.sip_amount_minor,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export function createInvestment(
  db: DatabaseSync,
  input: {
    title: string;
    kind: InvestmentKind;
    scope: Scope;
    investedMinor: number;
    currentValueMinor: number;
    unitsQty?: number;
    maturityDate?: string | null;
    sipDay?: number | null;
    sipAmountMinor?: number;
    note?: string;
  },
): InvestmentRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO investments (
      id, title, kind, scope, invested_minor, current_value_minor,
      units_qty, maturity_date, sip_day, sip_amount_minor, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.title.trim(),
    input.kind,
    input.scope,
    input.investedMinor,
    input.currentValueMinor,
    input.unitsQty ?? 0,
    input.maturityDate ?? null,
    input.sipDay ?? null,
    input.sipAmountMinor ?? 0,
    input.note ?? '',
    createdAt,
  );
  return listInvestments(db).find((i) => i.id === id)!;
}

export function updateInvestment(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    title: string;
    kind: InvestmentKind;
    scope: Scope;
    investedMinor: number;
    currentValueMinor: number;
    unitsQty: number;
    maturityDate: string | null;
    sipDay: number | null;
    sipAmountMinor: number;
    note: string;
  }>,
): InvestmentRecord | null {
  const existing = listInvestments(db).find((i) => i.id === id);
  if (!existing) return null;
  db.prepare(`
    UPDATE investments SET
      title = ?, kind = ?, scope = ?, invested_minor = ?, current_value_minor = ?,
      units_qty = ?, maturity_date = ?, sip_day = ?, sip_amount_minor = ?, note = ?
    WHERE id = ?
  `).run(
    (patch.title ?? existing.title).trim(),
    patch.kind ?? existing.kind,
    patch.scope ?? existing.scope,
    patch.investedMinor ?? existing.investedMinor,
    patch.currentValueMinor ?? existing.currentValueMinor,
    patch.unitsQty ?? existing.unitsQty,
    patch.maturityDate !== undefined ? patch.maturityDate : existing.maturityDate,
    patch.sipDay !== undefined ? patch.sipDay : existing.sipDay,
    patch.sipAmountMinor ?? existing.sipAmountMinor,
    patch.note ?? existing.note,
    id,
  );
  return listInvestments(db).find((i) => i.id === id) ?? null;
}

export function deleteInvestment(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM investments WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// Custom Merchant Auto-Categorization Rules
export interface CategoryRuleRecord {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  category: string;
  scope: Scope | null;
  accountId: string | null;
  kind: 'expense' | 'income' | null;
  priority: number;
  createdAt: string;
}

export function listCategoryRules(db: DatabaseSync): CategoryRuleRecord[] {
  const rows = db
    .prepare('SELECT * FROM category_rules ORDER BY priority DESC, pattern ASC')
    .all() as unknown as Array<{
      id: string;
      pattern: string;
      match_type: RuleMatchType;
      category: string;
      scope: Scope | null;
      account_id: string | null;
      kind: 'expense' | 'income' | null;
      priority: number;
      created_at: string;
    }>;
  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    matchType: r.match_type,
    category: r.category,
    scope: r.scope,
    accountId: r.account_id,
    kind: r.kind,
    priority: r.priority,
    createdAt: r.created_at,
  }));
}

export function createCategoryRule(
  db: DatabaseSync,
  input: {
    pattern: string;
    matchType?: RuleMatchType;
    category: string;
    scope?: Scope | null;
    accountId?: string | null;
    kind?: 'expense' | 'income' | null;
    priority?: number;
  },
): CategoryRuleRecord {
  if (input.accountId && !getAccountById(db, input.accountId)) {
    throw new Error('Linked account not found');
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO category_rules (
      id, pattern, match_type, category, scope, account_id, kind, priority, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.pattern.trim(),
    input.matchType ?? 'contains',
    input.category.trim(),
    input.scope ?? null,
    input.accountId ?? null,
    input.kind ?? null,
    input.priority ?? 100,
    createdAt,
  );
  return listCategoryRules(db).find((r) => r.id === id)!;
}

export function deleteCategoryRule(db: DatabaseSync, id: string): boolean {
  const res = db.prepare('DELETE FROM category_rules WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function matchCategoryRule(
  rules: CategoryRuleRecord[],
  text: string,
  kind?: 'income' | 'expense',
): CategoryRuleRecord | null {
  const low = text.trim().toLowerCase();
  if (!low) return null;
  for (const rule of rules) {
    if (rule.kind && kind && rule.kind !== kind) continue;
    const pat = rule.pattern.trim().toLowerCase();
    if (!pat) continue;
    if (rule.matchType === 'exact') {
      if (low === pat) return rule;
    } else if (low.includes(pat)) {
      return rule;
    }
  }
  return null;
}

// Transaction Receipt Proof Attachments
export interface TransactionAttachmentRecord {
  id: string;
  transactionId: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
  createdAt: string;
}

export function saveTransactionAttachment(
  db: DatabaseSync,
  transactionId: string,
  input: { filename: string; mimeType: string; dataBase64: string },
): TransactionAttachmentRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO transaction_attachments (id, transaction_id, filename, mime_type, data_base64, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(transaction_id) DO UPDATE SET
      filename = excluded.filename,
      mime_type = excluded.mime_type,
      data_base64 = excluded.data_base64,
      created_at = excluded.created_at
  `).run(id, transactionId, input.filename, input.mimeType, input.dataBase64, createdAt);
  return getTransactionAttachment(db, transactionId)!;
}

export function getTransactionAttachment(
  db: DatabaseSync,
  transactionId: string,
): TransactionAttachmentRecord | null {
  const row = db
    .prepare('SELECT * FROM transaction_attachments WHERE transaction_id = ?')
    .get(transactionId) as
    | {
        id: string;
        transaction_id: string;
        filename: string;
        mime_type: string;
        data_base64: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    transactionId: row.transaction_id,
    filename: row.filename,
    mimeType: row.mime_type,
    dataBase64: row.data_base64,
    createdAt: row.created_at,
  };
}

export function createSplitExpenseDues(
  db: DatabaseSync,
  tx: TransactionRecord,
  split: { participants: string[]; includeSelf: boolean; dueDate?: string | null },
): PersonDueRecord[] {
  const names = split.participants.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return [];
  const headcount = names.length + (split.includeSelf ? 1 : 0);
  const perHeadMinor = Math.max(1, Math.round(tx.amountMinor / headcount));
  const created: PersonDueRecord[] = [];
  for (const personName of names) {
    created.push(
      createPersonDue(db, {
        personName,
        direction: 'need',
        scope: tx.scope,
        amountMinor: perHeadMinor,
        dueDate: split.dueDate ?? null,
        note: `Split: ${tx.party || tx.category} (${tx.occurredAt})`,
      }),
    );
  }
  return created;
}

// -------------------------------------------------------------
// Bank Transfer Matching & CC Bill Reconciliation
// -------------------------------------------------------------

export interface UnmatchedTransferCandidate {
  id: string;
  sourceTx: TransactionRecord;
  destTx: TransactionRecord;
  amountMinor: number;
  dateDifferenceDays: number;
  confidence: 'high' | 'medium';
  reason: string;
}

export function findUnmatchedTransfers(db: DatabaseSync): UnmatchedTransferCandidate[] {
  const expenses = listTransactions(db, { kind: 'expense', limit: 800 });
  const incomes = listTransactions(db, { kind: 'income', limit: 800 });
  const accounts = listAccounts(db);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const candidates: UnmatchedTransferCandidate[] = [];
  const matchedDestIds = new Set<string>();

  for (const exp of expenses) {
    for (const inc of incomes) {
      if (matchedDestIds.has(inc.id)) continue;
      if (exp.accountId === inc.accountId) continue;
      if (exp.amountMinor !== inc.amountMinor) continue;

      const diffDays = Math.abs(daysBetweenISO(exp.occurredAt, inc.occurredAt));
      if (diffDays <= 3) {
        const srcAcc = accountMap.get(exp.accountId);
        const dstAcc = accountMap.get(inc.accountId);
        const textToSearch = `${exp.party} ${exp.note} ${inc.party} ${inc.note}`.toLowerCase();
        const hasTransferKeyword =
          /transfer|neft|imps|upi|self|atm|contra|funds|trf|acc|card pay|bill pay|cred/i.test(textToSearch);
        const mentionsTarget =
          (dstAcc && textToSearch.includes(dstAcc.name.toLowerCase())) ||
          (srcAcc && textToSearch.includes(srcAcc.name.toLowerCase()));

        let confidence: 'high' | 'medium' = 'medium';
        let reason = `Matching ₹${(exp.amountMinor / 100).toLocaleString('en-IN')} within ${diffDays} day(s)`;

        if (diffDays === 0 || hasTransferKeyword || mentionsTarget) {
          confidence = 'high';
          if (mentionsTarget) reason += ` (Mentions ${dstAcc?.name || 'account'})`;
          else if (hasTransferKeyword) reason += ' (Transfer keywords detected)';
        }

        candidates.push({
          id: `${exp.id}:${inc.id}`,
          sourceTx: exp,
          destTx: inc,
          amountMinor: exp.amountMinor,
          dateDifferenceDays: diffDays,
          confidence,
          reason,
        });

        matchedDestIds.add(inc.id);
        break;
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      (b.confidence === 'high' ? 1 : 0) - (a.confidence === 'high' ? 1 : 0) ||
      a.dateDifferenceDays - b.dateDifferenceDays,
  );
}

export function matchTransferPair(
  db: DatabaseSync,
  sourceTxId: string,
  destTxId: string,
): { ok: boolean; mergedTx: TransactionRecord } {
  return withTransaction(db, () => {
    const sourceTx = getTransactionById(db, sourceTxId);
    const destTx = getTransactionById(db, destTxId);
    if (!sourceTx) throw new Error('Source transaction not found');
    if (!destTx) throw new Error('Destination transaction not found');
    if (sourceTx.accountId === destTx.accountId) {
      throw new Error('Source and destination accounts must be different');
    }

    const updatedNote = sourceTx.note
      ? `${sourceTx.note} (Matched transfer with ${destTx.accountName})`
      : `Matched transfer: ${sourceTx.accountName} → ${destTx.accountName}`;

    db.prepare(`
      UPDATE transactions SET
        kind = 'transfer',
        to_account_id = ?,
        category = 'Transfer',
        note = ?
      WHERE id = ?
    `).run(destTx.accountId, updatedNote, sourceTxId);

    db.prepare('DELETE FROM transactions WHERE id = ?').run(destTxId);

    const merged = getTransactionById(db, sourceTxId)!;
    return { ok: true, mergedTx: merged };
  });
}

export function reconcileAndPayCard(
  db: DatabaseSync,
  cardId: string,
  input: {
    fromAccountId: string;
    amountMinor: number;
    occurredAt: string;
    note?: string;
  },
): { ok: boolean; tx: TransactionRecord } {
  const card = getAccountById(db, cardId);
  if (!card || card.type !== 'credit_card') {
    throw new Error('Target account is not a valid credit card');
  }
  const fromAcc = getAccountById(db, input.fromAccountId);
  if (!fromAcc) throw new Error('Source payment account not found');

  const note = input.note || `Auto-reconciled bill payment for ${card.name}`;

  const tx = createTransaction(db, {
    kind: 'transfer',
    scope: card.scope,
    accountId: input.fromAccountId,
    toAccountId: cardId,
    category: 'Credit Card Bill',
    amountMinor: input.amountMinor,
    occurredAt: input.occurredAt,
    party: card.name,
    note,
  });

  return { ok: true, tx };
}
