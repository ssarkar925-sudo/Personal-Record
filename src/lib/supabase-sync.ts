import { getSupabaseClient, getCurrentUser } from './supabase.ts';
import { api, type AccountRecord, type TransactionRecord, type LoanRecord, type PersonDueRecord, type NoteRecord } from './api.ts';

export interface CloudSyncStatus {
  lastSyncAt: string | null;
  status: 'idle' | 'syncing' | 'error' | 'success';
  message: string;
  pushedCount?: number;
  pulledCount?: number;
}

/**
 * Pushes all local SQLite data to Supabase PostgreSQL for the current authenticated user.
 */
export async function pushLocalDataToSupabase(): Promise<{
  accountsCount: number;
  transactionsCount: number;
  loansCount: number;
  duesCount: number;
  notesCount: number;
}> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client is not configured.');

  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in to Supabase before syncing.');

  // 1. Gather all local data
  const [accounts, transactions, loans, duesRes, notes] = await Promise.all([
    api.getAccounts(),
    api.getTransactions({}),
    api.getLoans(),
    api.getDues(),
    api.getNotes(),
  ]);

  const userId = user.id;

  // 2. Upsert Accounts
  if (accounts.length > 0) {
    const accountPayload = accounts.map((acc: AccountRecord) => ({
      id: acc.id,
      user_id: userId,
      name: acc.name,
      type: acc.type,
      account_group: acc.accountGroup || 'bank',
      scope: acc.scope,
      institution: acc.institution || '',
      last4: acc.last4 || '',
      opening_balance_minor: acc.openingBalanceMinor || 0,
      min_balance_minor: acc.minBalanceMinor || 0,
      credit_limit_minor: acc.creditLimitMinor || 0,
      statement_day: acc.statementDay || 15,
      due_day: acc.dueDay || 5,
    }));

    const { error: accErr } = await client.from('accounts').upsert(accountPayload, { onConflict: 'id' });
    if (accErr) throw new Error(`Accounts sync failed: ${accErr.message}`);
  }

  // 3. Upsert Transactions
  if (transactions.length > 0) {
    const txPayload = transactions.map((tx: TransactionRecord) => ({
      id: tx.id,
      user_id: userId,
      kind: tx.kind,
      scope: tx.scope,
      account_id: tx.accountId,
      to_account_id: tx.toAccountId || null,
      category: tx.category,
      amount_minor: tx.amountMinor,
      occurred_at: tx.occurredAt,
      party: tx.party || '',
      note: tx.note || '',
      source_ref: tx.sourceRef || null,
    }));

    const { error: txErr } = await client.from('transactions').upsert(txPayload, { onConflict: 'id' });
    if (txErr) throw new Error(`Transactions sync failed: ${txErr.message}`);
  }

  // 4. Upsert Loans
  if (loans.length > 0) {
    const loanPayload = loans.map((l: LoanRecord) => ({
      id: l.id,
      user_id: userId,
      name: l.name,
      scope: l.scope,
      direction: l.direction,
      principal_minor: l.principalMinor,
      remaining_minor: l.remainingMinor,
      interest_rate_apr: (l.annualRateBps || 0) / 100,
      monthly_emi_minor: l.emiMinor || 0,
      start_date: l.startDate,
      due_date: l.nextDueDate || null,
      institution: l.counterparty || '',
    }));

    const { error: loanErr } = await client.from('loans').upsert(loanPayload, { onConflict: 'id' });
    if (loanErr) throw new Error(`Loans sync failed: ${loanErr.message}`);
  }

  // 5. Upsert People Dues (aligned with public.people_dues schema)
  if (duesRes.data.length > 0) {
    const duePayload = duesRes.data.map((d: PersonDueRecord) => ({
      id: d.id,
      user_id: userId,
      person_name: d.personName,
      direction: d.direction,
      scope: d.scope,
      original_minor: d.amountMinor,
      remaining_minor: d.remainingMinor,
      due_date: d.dueDate || null,
      status: d.status === 'partial' ? 'partially_paid' : d.status,
      notes: d.note || '',
    }));

    const { error: dueErr } = await client.from('people_dues').upsert(duePayload, { onConflict: 'id' });
    if (dueErr) throw new Error(`Dues sync failed: ${dueErr.message}`);
  }

  // 6. Upsert Notes (aligned with public.notes schema)
  if (notes.length > 0) {
    const notesPayload = notes.map((n: NoteRecord) => ({
      id: n.id,
      user_id: userId,
      title: n.title,
      body: n.body || '',
      tags: Array.isArray(n.tags) ? n.tags : [],
      scope: n.scope === 'general' ? 'personal' : n.scope,
      color: n.color || 'default',
      pinned: Boolean(n.pinned),
      archived: Boolean(n.archived),
      order_index: n.orderIndex ?? 0,
      checklist: n.checklist ?? [],
    }));

    const { error: noteErr } = await client.from('notes').upsert(notesPayload, { onConflict: 'id' });
    if (noteErr) throw new Error(`Notes sync failed: ${noteErr.message}`);
  }

  return {
    accountsCount: accounts.length,
    transactionsCount: transactions.length,
    loansCount: loans.length,
    duesCount: duesRes.data.length,
    notesCount: notes.length,
  };
}

/**
 * Subscribes to real-time database changes from Supabase PostgreSQL.
 * Wakes up whenever an insert/update/delete happens on accounts or transactions.
 */
export function subscribeToSupabaseRealtime(onChange: (table: string, eventType: string) => void) {
  const client = getSupabaseClient();
  if (!client) return { unsubscribe: () => {} };

  const channel = client
    .channel('ledger-cloud-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts' },
      () => onChange('accounts', 'change')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions' },
      () => onChange('transactions', 'change')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loans' },
      () => onChange('loans', 'change')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'people_dues' },
      () => onChange('people_dues', 'change')
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes' },
      () => onChange('notes', 'change')
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void client.removeChannel(channel);
    },
  };
}
