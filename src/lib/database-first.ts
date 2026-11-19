import { getSupabaseClient, ensureSupabaseSession } from './supabase.ts';
import { clientDb, generateUUID } from './client-db.ts';
import type {
  AccountRecord,
  TransactionRecord,
  LoanRecord,
  PersonDueRecord,
  NoteRecord,
  RecurringBillRecord,
} from './api.ts';
import type { AccountType, Scope, TxKind } from '../../shared/ledger-core.ts';
import { todayISO } from '../../shared/ledger-core.ts';

// ============================================================================
// ACCOUNTS (DATABASE-FIRST)
// ============================================================================

export async function dbFirstCreateAccount(body: {
  name: string;
  type: AccountType;
  accountGroup?: 'bank' | 'wallet' | 'cash' | 'credit_card';
  scope: Scope;
  institution?: string;
  last4?: string;
  openingBalanceMinor?: number;
  minBalanceMinor?: number;
  creditLimitMinor?: number;
  statementDay?: number;
  dueDay?: number;
}): Promise<AccountRecord> {
  const id = generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        name: body.name,
        type: body.type,
        account_group: body.accountGroup || (body.type === 'credit_card' ? 'credit_card' : 'bank'),
        scope: body.scope,
        institution: body.institution || '',
        last4: body.last4 || '',
        opening_balance_minor: body.openingBalanceMinor || 0,
        min_balance_minor: body.minBalanceMinor || 0,
        credit_limit_minor: body.creditLimitMinor || 0,
        statement_day: body.statementDay || 15,
        due_day: body.dueDay || 5,
      };

      const { data, error } = await client
        .from('accounts')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        // Mirror confirmed database row into clientDb cache
        const created: AccountRecord = {
          id: data.id,
          name: data.name,
          type: data.type,
          accountGroup: data.account_group || 'bank',
          scope: data.scope,
          institution: data.institution || '',
          last4: data.last4 || '',
          openingBalanceMinor: Number(data.opening_balance_minor || 0),
          minBalanceMinor: Number(data.min_balance_minor || 0),
          creditLimitMinor: Number(data.credit_limit_minor || 0),
          statementDay: data.statement_day || 15,
          dueDay: data.due_day || 5,
          currentBalanceMinor: Number(data.opening_balance_minor || 0),
          cardCycle: null,
          createdAt: data.created_at || todayISO(),
        };
        const db = clientDb.load();
        db.accounts.push(created);
        (clientDb as any).recomputeBalances();
        (clientDb as any).save(true);
        return created;
      }
    }
  } catch (err) {
    console.warn('[Database-First] Account insert failed on cloud, using local fallback:', err);
  }

  return clientDb.createAccount(body);
}

export async function dbFirstUpdateAccount(
  id: string,
  body: Partial<AccountRecord>,
): Promise<AccountRecord> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const patch: any = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) patch.name = body.name;
      if (body.type !== undefined) patch.type = body.type;
      if (body.accountGroup !== undefined) patch.account_group = body.accountGroup;
      if (body.scope !== undefined) patch.scope = body.scope;
      if (body.institution !== undefined) patch.institution = body.institution;
      if (body.last4 !== undefined) patch.last4 = body.last4;
      if (body.openingBalanceMinor !== undefined) patch.opening_balance_minor = body.openingBalanceMinor;
      if (body.minBalanceMinor !== undefined) patch.min_balance_minor = body.minBalanceMinor;
      if (body.creditLimitMinor !== undefined) patch.credit_limit_minor = body.creditLimitMinor;
      if (body.statementDay !== undefined) patch.statement_day = body.statementDay;
      if (body.dueDay !== undefined) patch.due_day = body.dueDay;

      const { data, error } = await client
        .from('accounts')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      if (data) {
        return clientDb.updateAccount(id, body);
      }
    }
  } catch (err) {
    console.warn('[Database-First] Account update failed on cloud, updating local cache:', err);
  }

  return clientDb.updateAccount(id, body);
}

export async function dbFirstDeleteAccount(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      // 1. Delete transactions linked to account
      await client.from('transactions').delete().eq('account_id', id).eq('user_id', user.id);
      await client.from('transactions').delete().eq('to_account_id', id).eq('user_id', user.id);
      // 2. Delete the account from cloud database
      const { error } = await client.from('accounts').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[Database-First] Account delete failed on cloud, deleting locally:', err);
  }

  clientDb.deleteAccount(id);
  return { ok: true };
}

// ============================================================================
// TRANSACTIONS (DATABASE-FIRST)
// ============================================================================

export async function dbFirstCreateTransaction(body: {
  kind: TxKind;
  scope: Scope;
  accountId: string;
  toAccountId?: string | null;
  category: string;
  amountMinor: number;
  occurredAt: string;
  party?: string;
  note?: string;
  split?: { participants: string[]; includeSelf: boolean; dueDate?: string | null };
  attachment?: { filename: string; mimeType: string; dataBase64: string };
}): Promise<TransactionRecord> {
  const id = generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        kind: body.kind,
        scope: body.scope,
        account_id: body.accountId,
        to_account_id: body.toAccountId || null,
        category: body.category,
        amount_minor: body.amountMinor,
        occurred_at: body.occurredAt,
        party: body.party || '',
        note: body.note || '',
        source_ref: null,
      };

      const { data, error } = await client
        .from('transactions')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        // Also handle attachment if present
        if (body.attachment) {
          try {
            const filePath = `${user.id}/${id}_${body.attachment.filename}`;
            await client.from('receipt_attachments').insert({
              user_id: user.id,
              transaction_id: id,
              file_path: filePath,
              file_name: body.attachment.filename,
              file_size: body.attachment.dataBase64.length,
              mime_type: body.attachment.mimeType,
            });
          } catch {}
        }

        const db = clientDb.load();
        const acc = db.accounts.find((a) => a.id === body.accountId);
        const toAcc = body.toAccountId ? db.accounts.find((a) => a.id === body.toAccountId) : null;
        const newTx: TransactionRecord = {
          id: data.id,
          kind: data.kind,
          scope: data.scope,
          accountId: data.account_id,
          accountName: acc ? acc.name : 'Unknown Account',
          toAccountId: data.to_account_id || null,
          toAccountName: toAcc ? toAcc.name : null,
          category: data.category,
          amountMinor: Number(data.amount_minor),
          occurredAt: data.occurred_at,
          party: data.party || '',
          note: data.note || '',
          sourceRef: null,
          createdAt: data.created_at || todayISO(),
          hasAttachment: Boolean(body.attachment),
        };
        db.transactions.unshift(newTx);
        (clientDb as any).recomputeBalances();
        (clientDb as any).save(true);
        return newTx;
      }
    }
  } catch (err) {
    console.warn('[Database-First] Transaction insert failed on cloud, using local fallback:', err);
  }

  return clientDb.createTransaction(body);
}

export async function dbFirstUpdateTransaction(
  id: string,
  body: {
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
): Promise<TransactionRecord> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const patch = {
        kind: body.kind,
        scope: body.scope,
        account_id: body.accountId,
        to_account_id: body.toAccountId || null,
        category: body.category,
        amount_minor: body.amountMinor,
        occurred_at: body.occurredAt,
        party: body.party || '',
        note: body.note || '',
        updated_at: new Date().toISOString(),
      };

      const { error } = await client
        .from('transactions')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      return clientDb.updateTransaction(id, body);
    }
  } catch (err) {
    console.warn('[Database-First] Transaction update failed on cloud, updating locally:', err);
  }

  return clientDb.updateTransaction(id, body);
}

export async function dbFirstDeleteTransaction(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const { error } = await client.from('transactions').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[Database-First] Transaction delete failed on cloud, deleting locally:', err);
  }

  clientDb.deleteTransaction(id);
  return { ok: true };
}

export async function dbFirstBulkTransactions(body: {
  action: 'delete' | 'update';
  ids: string[];
  patch?: { scope?: Scope; category?: string };
}): Promise<{ ok: boolean; count: number }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user && body.ids.length > 0) {
      if (body.action === 'delete') {
        const { error } = await client.from('transactions').delete().in('id', body.ids).eq('user_id', user.id);
        if (error) throw error;
      } else if (body.action === 'update' && body.patch) {
        const patch: any = { updated_at: new Date().toISOString() };
        if (body.patch.scope) patch.scope = body.patch.scope;
        if (body.patch.category) patch.category = body.patch.category;
        const { error } = await client.from('transactions').update(patch).in('id', body.ids).eq('user_id', user.id);
        if (error) throw error;
      }
    }
  } catch (err) {
    console.warn('[Database-First] Bulk transaction operation failed on cloud:', err);
  }

  const res = clientDb.bulkTransactions(body);
  return { ok: true, count: res.count };
}

// ============================================================================
// LOANS & EMIs (DATABASE-FIRST)
// ============================================================================

export async function dbFirstCreateLoan(body: any): Promise<LoanRecord> {
  const id = generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        name: body.name,
        scope: body.scope,
        direction: body.direction || 'borrowed',
        principal_minor: body.principalMinor,
        remaining_minor: body.principalMinor,
        interest_rate_apr: (body.annualRateBps || 0) / 100,
        monthly_emi_minor: body.emiMinor || 0,
        start_date: body.startDate || todayISO(),
        due_date: body.nextDueDate || null,
        institution: body.counterparty || '',
      };

      const { data, error } = await client.from('loans').insert(payload).select().single();
      if (error) throw error;
      if (data) {
        return clientDb.createLoan({ ...body, id: data.id });
      }
    }
  } catch (err) {
    console.warn('[Database-First] Loan insert failed on cloud, falling back to local:', err);
  }

  return clientDb.createLoan(body);
}

export async function dbFirstPayLoan(loanId: string, body: any): Promise<any> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const db = clientDb.load();
      const loan = db.loans.find((l) => l.id === loanId);
      const remaining = Math.max(0, (loan?.remainingMinor || 0) - (body.amountMinor || 0));

      await Promise.all([
        client.from('loans').update({
          remaining_minor: remaining,
          updated_at: new Date().toISOString(),
        }).eq('id', loanId).eq('user_id', user.id),
        client.from('loan_payments').insert({
          loan_id: loanId,
          user_id: user.id,
          payment_date: body.occurredAt || todayISO(),
          amount_minor: body.amountMinor,
          note: body.note || '',
        }),
      ]);
    }
  } catch (err) {
    console.warn('[Database-First] Loan payment failed on cloud:', err);
  }

  return clientDb.recordLoanPayment(loanId, body);
}

export async function dbFirstDeleteLoan(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      await client.from('loans').delete().eq('id', id).eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[Database-First] Loan delete failed on cloud:', err);
  }

  clientDb.deleteLoan(id);
  return { ok: true };
}

// ============================================================================
// PEOPLE DUES / KHATABOOK (DATABASE-FIRST)
// ============================================================================

export async function dbFirstCreateDue(body: any): Promise<PersonDueRecord> {
  const id = generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        person_name: body.personName,
        direction: body.direction || 'need',
        scope: body.scope,
        original_minor: body.amountMinor,
        remaining_minor: body.amountMinor,
        due_date: body.dueDate || null,
        status: 'open',
        notes: body.note || '',
      };

      const { data, error } = await client.from('people_dues').insert(payload).select().single();
      if (error) throw error;
      if (data) {
        return clientDb.createDue({ ...body, id: data.id });
      }
    }
  } catch (err) {
    console.warn('[Database-First] Due insert failed on cloud, falling back to local:', err);
  }

  return clientDb.createDue(body);
}

export async function dbFirstSettleDue(dueId: string, body: any): Promise<any> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const db = clientDb.load();
      const due = db.dues.find((d) => d.id === dueId);
      const amt = body.amountMinor || due?.remainingMinor || 0;
      const remaining = Math.max(0, (due?.remainingMinor || 0) - amt);
      const status = remaining === 0 ? 'settled' : 'partially_paid';

      await Promise.all([
        client.from('people_dues').update({
          remaining_minor: remaining,
          status,
          updated_at: new Date().toISOString(),
        }).eq('id', dueId).eq('user_id', user.id),
        client.from('person_due_settlements').insert({
          due_id: dueId,
          user_id: user.id,
          settlement_date: todayISO(),
          amount_minor: amt,
          note: body.note || '',
        }),
      ]);
    }
  } catch (err) {
    console.warn('[Database-First] Due settlement failed on cloud:', err);
  }

  return clientDb.settleDue(dueId, body);
}

export async function dbFirstDeleteDue(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      await client.from('people_dues').delete().eq('id', id).eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[Database-First] Due delete failed on cloud:', err);
  }

  clientDb.deleteDue(id);
  return { ok: true };
}

// ============================================================================
// NOTES & CHECKLISTS (DATABASE-FIRST)
// ============================================================================

export async function dbFirstUpsertNote(body: any): Promise<NoteRecord> {
  const id = body.id || generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        title: body.title || '',
        body: body.body || '',
        tags: Array.isArray(body.tags) ? body.tags : [],
        scope: body.scope === 'general' ? 'personal' : body.scope || 'personal',
        color: body.color || 'default',
        pinned: Boolean(body.pinned),
        archived: Boolean(body.archived),
        order_index: body.orderIndex ?? 0,
        checklist: body.checklist ?? [],
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client.from('notes').upsert(payload, { onConflict: 'id' }).select().single();
      if (error) throw error;
      if (data) {
        return clientDb.upsertNote({ ...body, id: data.id });
      }
    }
  } catch (err) {
    console.warn('[Database-First] Note upsert failed on cloud, using local fallback:', err);
  }

  return clientDb.upsertNote(body);
}

export async function dbFirstDeleteNote(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      await client.from('notes').delete().eq('id', id).eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[Database-First] Note delete failed on cloud:', err);
  }

  clientDb.deleteNote(id);
  return { ok: true };
}

// ============================================================================
// JOB SHEETS / REGISTERS (DATABASE-FIRST)
// ============================================================================

export async function dbFirstSaveJobSheet(body: any): Promise<any> {
  const id = body.id || generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        name: body.name,
        scope: body.scope,
        color: body.color || 'gold',
        columns_json: body.columns || [],
        rows_json: body.rows || [],
        settings_json: body.settings || {},
        order_index: body.orderIndex ?? 0,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client.from('job_sheets').upsert(payload, { onConflict: 'id' }).select().single();
      if (error) throw error;
      if (data) {
        return clientDb.saveJobSheet({ ...body, id: data.id });
      }
    }
  } catch (err) {
    console.warn('[Database-First] Job sheet save failed on cloud:', err);
  }

  return clientDb.saveJobSheet(body);
}

export async function dbFirstDeleteJobSheet(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      await client.from('job_sheets').delete().eq('id', id).eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[Database-First] Job sheet delete failed on cloud:', err);
  }

  clientDb.deleteJobSheet(id);
  return { ok: true };
}

// ============================================================================
// RECURRING BILLS (DATABASE-FIRST)
// ============================================================================

export async function dbFirstCreateRecurringBill(body: any): Promise<RecurringBillRecord> {
  const id = generateUUID();
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      const payload = {
        id,
        user_id: user.id,
        title: body.title,
        scope: body.scope,
        kind: body.kind || 'expense',
        account_id: body.accountId,
        category: body.category,
        amount_minor: body.amountMinor,
        frequency: body.frequency || 'monthly',
        day_of_month: body.dueDay || body.dayOfMonth || 1,
        auto_post: Boolean(body.autoPost),
        active: true,
      };

      const { data, error } = await client.from('recurring_bills').insert(payload).select().single();
      if (error) throw error;
      if (data) {
        return clientDb.createRecurringBill({ ...body, id: data.id });
      }
    }
  } catch (err) {
    console.warn('[Database-First] Recurring bill create failed on cloud:', err);
  }

  return clientDb.createRecurringBill(body);
}

export async function dbFirstDeleteRecurringBill(id: string): Promise<{ ok: boolean }> {
  try {
    const user = await ensureSupabaseSession();
    const client = getSupabaseClient();
    if (client && user) {
      await client.from('recurring_bills').delete().eq('id', id).eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[Database-First] Recurring bill delete failed on cloud:', err);
  }

  clientDb.deleteRecurringBill(id);
  return { ok: true };
}
