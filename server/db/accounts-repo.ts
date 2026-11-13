import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  type AccountGroup,
  type AccountType,
  type CardCycleSummary,
  type Scope,
  type TxKind,
  addMonthsISO,
  computeCardCycle,
  daysBetweenISO,
  parseISODate,
  toISOFromUTC,
  todayISO,
} from '../../shared/ledger-core.ts';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  accountGroup: AccountGroup;
  scope: Scope;
  institution: string;
  last4: string;
  openingBalanceMinor: number;
  minBalanceMinor: number;
  creditLimitMinor: number;
  statementDay: number;
  dueDay: number;
  currentBalanceMinor: number;
  cardCycle: CardCycleSummary | null;
  createdAt: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  accountGroup?: AccountGroup;
  scope: Scope;
  institution?: string;
  last4?: string;
  openingBalanceMinor: number;
  minBalanceMinor?: number;
  creditLimitMinor?: number;
  statementDay?: number;
  dueDay?: number;
}

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  account_group?: string;
  scope: Scope;
  institution: string;
  last4: string;
  opening_balance_minor: number;
  min_balance_minor: number;
  credit_limit_minor: number;
  statement_day: number;
  due_day: number;
  created_at: string;
}

interface TxSummaryRow {
  kind: TxKind;
  account_id: string;
  to_account_id: string | null;
  amount_minor: number;
  occurred_at: string;
}

export function listAccounts(db: DatabaseSync, referenceDate: string = todayISO()): AccountRecord[] {
  const rows = db
    .prepare('SELECT * FROM accounts ORDER BY type ASC, scope ASC, name ASC')
    .all() as unknown as AccountRow[];

  const txRows = db
    .prepare('SELECT kind, account_id, to_account_id, amount_minor, occurred_at FROM transactions')
    .all() as unknown as TxSummaryRow[];

  return rows.map((row) => {
    const accountGroup: AccountGroup =
      (row.account_group as AccountGroup) ||
      (row.type === 'credit_card' ? 'credit_card' : 'bank');

    if (row.type === 'bank') {
      let balance = row.opening_balance_minor;
      for (const tx of txRows) {
        if (tx.kind === 'income' && tx.account_id === row.id) balance += tx.amount_minor;
        else if (tx.kind === 'expense' && tx.account_id === row.id) balance -= tx.amount_minor;
        else if (tx.kind === 'transfer') {
          if (tx.account_id === row.id) balance -= tx.amount_minor;
          if (tx.to_account_id === row.id) balance += tx.amount_minor;
        }
      }
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        accountGroup,
        scope: row.scope,
        institution: row.institution,
        last4: row.last4,
        openingBalanceMinor: row.opening_balance_minor,
        minBalanceMinor: row.min_balance_minor,
        creditLimitMinor: row.credit_limit_minor,
        statementDay: row.statement_day,
        dueDay: row.due_day,
        currentBalanceMinor: balance,
        cardCycle: null,
        createdAt: row.created_at,
      };
    }

    // Credit card: openingBalanceMinor represents initial unpaid balance
    const cardTx: Array<{
      kind: TxKind;
      amountMinor: number;
      occurredAt: string;
      direction: 'out' | 'in';
    }> = [];
    if (row.opening_balance_minor > 0) {
      cardTx.push({
        kind: 'expense',
        amountMinor: row.opening_balance_minor,
        occurredAt: '1970-01-01',
        direction: 'out',
      });
    }
    for (const tx of txRows) {
      if (tx.kind === 'expense' && tx.account_id === row.id) {
        cardTx.push({ kind: tx.kind, amountMinor: tx.amount_minor, occurredAt: tx.occurred_at, direction: 'out' });
      } else if (tx.kind === 'transfer' && tx.to_account_id === row.id) {
        cardTx.push({ kind: tx.kind, amountMinor: tx.amount_minor, occurredAt: tx.occurred_at, direction: 'in' });
      } else if (tx.kind === 'income' && tx.account_id === row.id) {
        // Refund / cashback credited to card
        cardTx.push({ kind: tx.kind, amountMinor: tx.amount_minor, occurredAt: tx.occurred_at, direction: 'in' });
      }
    }

    const cycle = computeCardCycle({
      statementDay: row.statement_day,
      dueDay: row.due_day,
      creditLimitMinor: row.credit_limit_minor,
      referenceDate,
      transactions: cardTx,
    });

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      accountGroup: 'credit_card',
      scope: row.scope,
      institution: row.institution,
      last4: row.last4,
      openingBalanceMinor: row.opening_balance_minor,
      minBalanceMinor: row.min_balance_minor,
      creditLimitMinor: row.credit_limit_minor,
      statementDay: row.statement_day,
      dueDay: row.due_day,
      currentBalanceMinor: -cycle.totalOutstandingMinor,
      cardCycle: cycle,
      createdAt: row.created_at,
    };
  });
}

export function getAccountById(
  db: DatabaseSync,
  id: string,
  referenceDate: string = todayISO(),
): AccountRecord | null {
  return listAccounts(db, referenceDate).find((a) => a.id === id) ?? null;
}

export function createAccount(db: DatabaseSync, input: CreateAccountInput): AccountRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const effectiveGroup: AccountGroup =
    input.accountGroup || (input.type === 'credit_card' ? 'credit_card' : 'bank');
  // For ledger & foreign key consistency, wallet & cash use type='bank'
  const effectiveType: AccountType = effectiveGroup === 'credit_card' ? 'credit_card' : 'bank';

  db.prepare(`
    INSERT INTO accounts (
      id, name, type, account_group, scope, institution, last4,
      opening_balance_minor, min_balance_minor, credit_limit_minor,
      statement_day, due_day, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    effectiveType,
    effectiveGroup,
    input.scope,
    input.institution ?? '',
    input.last4 ?? '',
    input.openingBalanceMinor ?? 0,
    input.minBalanceMinor ?? 0,
    input.creditLimitMinor ?? 0,
    input.statementDay ?? 15,
    input.dueDay ?? 5,
    createdAt,
  );
  return getAccountById(db, id)!;
}

export function updateAccount(
  db: DatabaseSync,
  id: string,
  patch: Partial<CreateAccountInput>,
): AccountRecord | null {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as unknown as AccountRow | undefined;
  if (!existing) return null;

  const effectiveGroup = patch.accountGroup ?? (existing.account_group as AccountGroup) ?? (existing.type === 'credit_card' ? 'credit_card' : 'bank');
  const effectiveType = effectiveGroup === 'credit_card' ? 'credit_card' : 'bank';

  db.prepare(`
    UPDATE accounts SET
      name = ?, type = ?, account_group = ?, scope = ?, institution = ?, last4 = ?,
      opening_balance_minor = ?, min_balance_minor = ?, credit_limit_minor = ?,
      statement_day = ?, due_day = ?
    WHERE id = ?
  `).run(
    patch.name ?? existing.name,
    effectiveType,
    effectiveGroup,
    patch.scope ?? existing.scope,
    patch.institution ?? existing.institution,
    patch.last4 ?? existing.last4,
    patch.openingBalanceMinor ?? existing.opening_balance_minor,
    patch.minBalanceMinor ?? existing.min_balance_minor,
    patch.creditLimitMinor ?? existing.credit_limit_minor,
    patch.statementDay ?? existing.statement_day,
    patch.dueDay ?? existing.due_day,
    id,
  );
  return getAccountById(db, id);
}

export function deleteAccount(db: DatabaseSync, id: string): { ok: boolean; reason?: string } {
  const txCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ? OR to_account_id = ?')
      .get(id, id) as unknown as { c: number }
  ).c;
  if (txCount > 0) {
    return { ok: false, reason: 'Account has linked transactions; delete or reassign them first.' };
  }
  const res = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return { ok: Number(res.changes) > 0 };
}

// -------------------------------------------------------------
// Credit Card Billing Cycle Auto-Reconciliation Engine
// -------------------------------------------------------------

export interface CardReconciliationPayment {
  id: string;
  amountMinor: number;
  occurredAt: string;
  fromAccountName: string;
  note: string;
}

export interface SingleCycleReconciliation {
  cycleIndex: number;
  statementDate: string;
  dueDate: string;
  billedAmountMinor: number;
  paymentsReceivedMinor: number;
  netDueMinor: number;
  status: 'reconciled' | 'partial' | 'unpaid' | 'overdue';
  graceDaysRemaining: number;
  matchedPayments: CardReconciliationPayment[];
}

export interface CardCycleReconciliation {
  cardId: string;
  cardName: string;
  institution: string;
  last4: string;
  statementDay: number;
  dueDay: number;
  creditLimitMinor: number;
  totalOutstandingMinor: number;
  cycles: SingleCycleReconciliation[];
}

export function getCardCycleReconciliation(
  db: DatabaseSync,
  cardId: string,
  referenceDate: string = todayISO(),
): CardCycleReconciliation | null {
  const account = getAccountById(db, cardId, referenceDate);
  if (!account || account.type !== 'credit_card') return null;

  const allAccounts = listAccounts(db, referenceDate);
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  interface TxDetailRow {
    id: string;
    kind: TxKind;
    account_id: string;
    to_account_id: string | null;
    amount_minor: number;
    occurred_at: string;
    note: string;
  }

  const txs = db
    .prepare(`
      SELECT id, kind, account_id, to_account_id, amount_minor, occurred_at, note
      FROM transactions
      WHERE account_id = ? OR to_account_id = ?
      ORDER BY occurred_at ASC
    `)
    .all(cardId, cardId) as unknown as TxDetailRow[];

  const ref = parseISODate(referenceDate);

  // Compute statement date for current cycle
  let curYear = ref.year;
  let curMonth0 = ref.month - 1;
  if (ref.day < account.statementDay) {
    curMonth0 -= 1;
    if (curMonth0 < 0) {
      curMonth0 = 11;
      curYear -= 1;
    }
  }

  const cycles: SingleCycleReconciliation[] = [];

  // Generate 3 cycles: 0 (current active), 1 (previous), 2 (2 cycles ago)
  for (let cycleIdx = 0; cycleIdx < 3; cycleIdx++) {
    let stmtYear = curYear;
    let stmtMonth0 = curMonth0 - cycleIdx;
    while (stmtMonth0 < 0) {
      stmtMonth0 += 12;
      stmtYear -= 1;
    }

    let prevStmtYear = stmtYear;
    let prevStmtMonth0 = stmtMonth0 - 1;
    if (prevStmtMonth0 < 0) {
      prevStmtMonth0 = 11;
      prevStmtYear -= 1;
    }

    const statementDate = toISOFromUTC(stmtYear, stmtMonth0, account.statementDay);
    const prevStatementDate = toISOFromUTC(prevStmtYear, prevStmtMonth0, account.statementDay);

    const dueOffsetMonths = account.dueDay <= account.statementDay ? 1 : 0;
    const dueDate = toISOFromUTC(stmtYear, stmtMonth0 + dueOffsetMonths, account.dueDay);

    // Sum charges in this cycle (occurred between prevStatementDate and statementDate)
    let billedAmountMinor = 0;
    for (const t of txs) {
      if (t.kind === 'expense' && t.account_id === cardId) {
        if (t.occurred_at > prevStatementDate && t.occurred_at <= statementDate) {
          billedAmountMinor += t.amount_minor;
        }
      }
    }

    // Next statement date (end of grace / start of next period)
    const nextStmtDate = addMonthsISO(statementDate, 1);

    // Find payments credited between statementDate and nextStmtDate
    const matchedPayments: CardReconciliationPayment[] = [];
    let paymentsReceivedMinor = 0;

    for (const t of txs) {
      const isPayment = (t.kind === 'transfer' && t.to_account_id === cardId) ||
                        (t.kind === 'income' && t.account_id === cardId);
      if (isPayment) {
        if (t.occurred_at >= statementDate && t.occurred_at <= nextStmtDate) {
          paymentsReceivedMinor += t.amount_minor;
          const fromAcc = t.account_id ? accountMap.get(t.account_id) : null;
          matchedPayments.push({
            id: t.id,
            amountMinor: t.amount_minor,
            occurredAt: t.occurred_at,
            fromAccountName: fromAcc?.name || 'Bank Account',
            note: t.note || '',
          });
        }
      }
    }

    const netDueMinor = Math.max(0, billedAmountMinor - paymentsReceivedMinor);
    const graceDaysRemaining = daysBetweenISO(referenceDate, dueDate);

    let status: 'reconciled' | 'partial' | 'unpaid' | 'overdue' = 'unpaid';
    if (billedAmountMinor === 0 || netDueMinor === 0) {
      status = 'reconciled';
    } else if (dueDate < referenceDate && netDueMinor > 0) {
      status = 'overdue';
    } else if (paymentsReceivedMinor > 0) {
      status = 'partial';
    } else {
      status = 'unpaid';
    }

    cycles.push({
      cycleIndex: cycleIdx,
      statementDate,
      dueDate,
      billedAmountMinor,
      paymentsReceivedMinor,
      netDueMinor,
      status,
      graceDaysRemaining,
      matchedPayments,
    });
  }

  return {
    cardId: account.id,
    cardName: account.name,
    institution: account.institution,
    last4: account.last4,
    statementDay: account.statementDay,
    dueDay: account.dueDay,
    creditLimitMinor: account.creditLimitMinor,
    totalOutstandingMinor: account.cardCycle?.totalOutstandingMinor ?? 0,
    cycles,
  };
}
