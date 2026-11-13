import type {
  AdvisorBriefing,
  DashboardSummary,
} from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import type { AppLanguage } from '../../../shared/i18n.ts';

export type WorkspaceId =
  | 'dashboard'
  | 'money'
  | 'loans_dues'
  | 'reports'
  | 'notes'
  | 'vault';

export interface DashboardViewProps {
  data: DashboardSummary | null;
  briefing?: AdvisorBriefing | null;
  loading?: boolean;
  systemLanguage?: AppLanguage;
  scopeFilter: Scope | 'all';
  onScopeChange: (next: Scope | 'all') => void;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
  onOpenAgent: (commandText?: string) => void;
  onRefresh: () => void;
}
