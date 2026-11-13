import type { Scope } from '../../../shared/ledger-core.ts';

export type ReportTab = 'pnl' | 'categories' | 'cards' | 'banks' | 'loans' | 'dues' | 'tax_pack';

export type DatePreset = 'this_month' | '3m' | '6m' | 'fy' | 'year';

export type CatSortOption = 'total_desc' | 'count_desc' | 'name_asc';
export type CardSortOption = 'due_desc' | 'util_desc' | 'spend_desc' | 'name_asc';
export type BankSortOption = 'balance_desc' | 'inflow_desc' | 'name_asc';
export type LoanSortOption = 'remaining_desc' | 'interest_desc' | 'name_asc';
export type DueSortOption = 'remaining_desc' | 'due_date' | 'person_asc';

export interface ReportsIntelligence {
  bankBalances: number;
  averageMonthlyBurnMinor: number;
  runwayMonths: number;
  savingsRatePct: number;
  anomalies: Array<{ category: string; amountMinor: number; spikePct: number }>;
}

export interface BudgetModalCategoryState {
  id?: string;
  scope: Scope;
  category: string;
  currentLimitMinor?: number;
}
