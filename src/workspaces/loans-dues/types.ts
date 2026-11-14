import type {
  AccountRecord,
  LoanRecord,
  PersonDueRecord,
  PersonNetSummary,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type { AppLanguage } from '../../../shared/i18n.ts';

export type LoansTriageFilter =
  | 'all'
  | 'due_soon'
  | 'you_owe'
  | 'you_are_owed'
  | 'bank_loans'
  | 'settled';

export type LoansWorkstationLayout = 'split' | 'bento';
export type LoansTab = 'all' | 'loans' | 'dues' | 'goals';
export type LoanSortOption = 'next_due' | 'remaining_desc' | 'emi_desc' | 'name_asc';
export type DueSortOption = 'remaining_desc' | 'due_date' | 'open_first' | 'person_asc';
export type LoansDuesSortOption = 'remaining_desc' | 'remaining_asc' | 'next_due' | 'name_asc';

export type SelectedLoansItem =
  | { kind: 'loan'; data: LoanRecord }
  | { kind: 'due'; data: PersonDueRecord }
  | { kind: 'goal'; data: SavingsGoalRecord }
  | null;

export interface LoansDuesViewProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  dueSummaries: PersonNetSummary[];
  accounts: AccountRecord[];
  systemLanguage?: AppLanguage;
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
}

export interface DebtSummaryStats {
  totalLoanDebtMinor: number;
  totalLoanLentMinor: number;
  totalDueOwedToYouMinor: number;
  totalDueYouOweMinor: number;
  monthlyEmiCommitmentMinor: number;
  activeLoansCount: number;
  openDuesCount: number;
  overdueDuesCount: number;
  nextEmiLoan: LoanRecord | null;
}
