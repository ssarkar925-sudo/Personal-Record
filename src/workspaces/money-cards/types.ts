import type { AccountRecord, ScopeBudgetRecord, TransactionRecord, RecurringBillRecord } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import type { AppLanguage } from '../../../shared/i18n.ts';

export type TriageFilter = 'all' | 'due_soon' | 'high_utilization' | 'unreconciled';
export type WorkstationLayout = 'split' | 'bento';
export type AccountSortOption = 'due_date' | 'balance_desc' | 'balance_asc' | 'utilization' | 'name';
export type AccountGroupTab = 'all' | 'credit_card' | 'bank' | 'wallet';

export interface MoneyCardsViewProps {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  recurringBills: RecurringBillRecord[];
  budgets: ScopeBudgetRecord[];
  monthSpentByScope: Record<Scope, number>;
  systemLanguage?: AppLanguage;
  onNotify: (text: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
}
