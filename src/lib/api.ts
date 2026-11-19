import type {
  AccountType,
  AlertModule,
  DueDirection,
  InvestmentKind,
  LoanDirection,
  NoteColor,
  NoteScope,
  RuleMatchType,
  Scope,
  TxKind,
} from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';
import { clientDb } from './client-db.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isStandaloneClient(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!text || text.trim().startsWith('<') || (res.headers.get('content-type') || '').includes('text/html')) {
    throw new ApiError(
      res.status,
      'STANDALONE_FALLBACK',
      `API server not answering on ${url} (received HTML). Routing to client storage.`,
    );
  }
  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ApiError(res.status, 'INVALID_JSON', `Failed to parse response JSON from ${url}`);
  }
  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code || 'HTTP_ERROR',
      err?.message || `Request failed (${res.status})`,
      err?.details,
    );
  }
  return payload as T;
}

export interface CardCycleSummary {
  lastStatementDate: string;
  nextStatementDate: string;
  nextDueDate: string;
  daysUntilDue: number;
  totalOutstandingMinor: number;
  statementDueMinor: number;
  unbilledMinor: number;
  utilizationPct: number;
  isBillOverdue: boolean;
}

export type AccountGroup = 'bank' | 'wallet' | 'cash' | 'credit_card';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  accountGroup?: AccountGroup;
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

export interface UnmatchedTransferCandidate {
  id: string;
  sourceTx: TransactionRecord;
  destTx: TransactionRecord;
  amountMinor: number;
  dateDifferenceDays: number;
  confidence: 'high' | 'medium';
  reason: string;
}

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

export interface TaxSummaryPack {
  fiscalYearLabel: string;
  fromDate: string;
  toDate: string;
  scopePnl: Record<Scope, { incomeMinor: number; expenseMinor: number; netMinor: number }>;
  businessExpenseCategories: Array<{ category: string; scope: Scope; kind: 'income' | 'expense'; totalMinor: number; count: number }>;
  personalExpenseCategories: Array<{ category: string; scope: Scope; kind: 'income' | 'expense'; totalMinor: number; count: number }>;
  incomeCategories: Array<{ category: string; scope: Scope; kind: 'income' | 'expense'; totalMinor: number; count: number }>;
  loanInterestPaidMinor: number;
  loanPrincipalPaidMinor: number;
  totalTaxReservedMinor: number;
  totalTaxTargetMinor: number;
  totalInvestedMinor: number;
  transactionCount: number;
  bankAccounts?: Array<{ id: string; name: string; institution: string; last4: string; scope: Scope; currentBalanceMinor: number }>;
  loans?: LoanRecord[];
  quarterlyPnl?: Array<{
    quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    label: string;
    fromDate: string;
    toDate: string;
    totalIncomeMinor: number;
    totalExpenseMinor: number;
    businessNetMinor: number;
    personalNetMinor: number;
    netMinor: number;
  }>;
  investments?: InvestmentRecord[];
  deductionEstimates?: {
    estimated80cExpensesMinor: number;
    estimated80dExpensesMinor: number;
    estimatedOtherInterestMinor: number;
  };
}

export interface ScopeBudgetRecord {
  scope: Scope;
  monthlyLimitMinor: number;
}

export interface CategoryBudgetRecord {
  id: string;
  scope: Scope;
  category: string;
  monthlyLimitMinor: number;
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
  netMinor: number;
  openCount: number;
}

export interface ChecklistItemRecord {
  id: string;
  noteId: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

export interface NoteAttachmentRecord {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
  byteSize: number;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  title: string;
  body: string;
  scope: NoteScope;
  color: NoteColor;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  remindAt: string | null;
  linkedTxId: string | null;
  linkedDueId: string | null;
  linkedLoanId: string | null;
  linkedAccountId: string | null;
  orderIndex?: number;
  checklist: ChecklistItemRecord[];
  attachments: NoteAttachmentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultMetaRecord {
  saltB64: string;
  canaryIv: string;
  canaryCt: string;
  recoverySaltB64?: string | null;
  recoveryIv?: string | null;
  recoveryCt?: string | null;
  hasWaRecoveryKey?: boolean;
  updatedAt: string;
}

export interface VaultEntryCipherRecord {
  id: string;
  label: string;
  category: string;
  iv: string;
  ciphertext: string;
  lastRotatedAt: string;
  updatedAt: string;
}

export interface AlertDeliveryRecord {
  id: string;
  dedupeKey: string;
  module: AlertModule;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  channel: 'in_app' | 'whatsapp';
  status: 'pending' | 'sent' | 'failed' | 'read';
  errorText: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AlertSettings {
  recipientPhone: string;
  quietStartHour: number;
  quietEndHour: number;
  morningDigestEnabled: boolean;
  morningDigestHour: number;
  twoWayCommandsEnabled: boolean;
  leadDaysCreditCard: number;
  leadDaysLoan: number;
  leadDaysDue: number;
  cardUtilizationThresholdPct: number;
  vaultRotationDays: number;
  enabledModules: Record<AlertModule, boolean>;
}

export interface WhatsAppBridgeState {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrDataUrl: string | null;
  connectedPhone: string | null;
  lastError: string | null;
  updatedAt: string;
}

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

export interface DashboardSummary {
  referenceDate: string;
  netWorthMinor: number;
  totalBankMinor: number;
  totalInvestmentsMinor: number;
  bankTotalsByScope: Record<Scope, number>;
  totalCardDebtMinor: number;
  totalCardLimitMinor: number;
  totalBorrowedRemainingMinor: number;
  totalLentRemainingMinor: number;
  totalGiveMinor: number;
  totalNeedMinor: number;
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  monthByScope: Record<Scope, { incomeMinor: number; expenseMinor: number }>;
  allMonthExpenseByScope: Record<Scope, number>;
  monthTopCategories: Array<{ category: string; amountMinor: number }>;
  sixMonthTrend: Array<{
    month: string;
    incomeMinor: number;
    expenseMinor: number;
    personalExpenseMinor: number;
    businessExpenseMinor: number;
    familyExpenseMinor: number;
  }>;
  banks: AccountRecord[];
  cards: AccountRecord[];
  loans: LoanRecord[];
  dueSummariesByPerson: PersonNetSummary[];
  attentionQueue: AttentionItem[];
  pinnedNotes: NoteRecord[];
  recentTransactions: TransactionRecord[];
  budgets: Array<{ scope: Scope; monthlyLimitMinor: number; spentMinor: number }>;
  categoryBudgets?: Array<{
    id: string;
    scope: Scope;
    category: string;
    monthlyLimitMinor: number;
    spentMinor: number;
    pct: number;
  }>;
  unreadInAppCount: number;
}

export interface DetailedReports {
  monthlyCashflow: Array<{ month: string; incomeMinor: number; expenseMinor: number; netMinor: number }>;
  scopePnl: Record<Scope, { incomeMinor: number; expenseMinor: number; netMinor: number }>;
  categories: Array<{ category: string; scope: Scope; kind: 'income' | 'expense'; totalMinor: number; count: number }>;
  accountActivity: Array<AccountRecord & { periodInflowMinor: number; periodOutflowMinor: number }>;
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  duesByPerson: PersonNetSummary[];
  duesAging: { overdueMinor: number; dueSoonMinor: number; upcomingMinor: number; settledMinor: number };
  categoryBudgets?: CategoryBudgetRecord[];
  transactionCount: number;
}

export interface AppPreferences {
  systemLanguage: AppLanguage;
  agentAutoExecute: boolean;
  llmProvider: 'local' | 'gemini' | 'openai';
  llmModel: string;
  hasApiKey: boolean;
  hasAppPin: boolean;
  autoLockMinutes: number;
  autoBackupEnabled: boolean;
  autoBackupDir: string;
  lastAutoBackupDate: string;
  updatedAt: string;
}

export interface AgentHistoryRecord {
  id: string;
  commandText: string;
  detectedLanguage: AppLanguage;
  systemLanguage: AppLanguage;
  intent: string;
  replyText: string;
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  createdAt: string;
}

export interface AdvisorFinding {
  id: string;
  module: string;
  severity: 'urgent' | 'warning' | 'info' | 'positive';
  title: string;
  detail: string;
}

export interface AdvisorSuggestion {
  id: string;
  label: string;
  detail: string;
  commandText: string;
  severity: 'urgent' | 'warning' | 'info' | 'positive';
}

export interface AdvisorBriefing {
  generatedAt: string;
  healthScore: number;
  status: 'healthy' | 'watch' | 'critical';
  headline: string;
  liquidBankMinor: number;
  scheduledOutflow30dMinor: number;
  expectedInflow30dMinor: number;
  projected30dBalanceMinor: number;
  projectedMonthExpenseMinor: number;
  avgMonthlyExpenseMinor: number;
  openChecklistTasks: number;
  completedChecklistNotes: number;
  staleVaultCount: number;
  emergencyRunwayMonths: number | null;
  totalReservedMinor: number;
  subscriptionLeakCount: number;
  whatsWrong: AdvisorFinding[];
  predictions: AdvisorFinding[];
  suggestions: AdvisorSuggestion[];
}

export interface RecurringLeakCandidate {
  id: string;
  title: string;
  scope: Scope;
  accountId: string;
  accountName: string;
  category: string;
  avgAmountMinor: number;
  latestAmountMinor: number;
  occurrences: number;
  distinctMonths: number;
  suggestedDueDay: number;
  lastDate: string;
  priceHikePct: number;
  isPriceHike: boolean;
}

export interface DebtPayoffResult {
  strategy: 'avalanche' | 'snowball';
  extraMonthlyMinor: number;
  totalDebtMinor: number;
  baselineMonths: number;
  planMonths: number;
  monthsSaved: number;
  baselineInterestMinor: number;
  planInterestMinor: number;
  interestSavedMinor: number;
  items: Array<{
    id: string;
    name: string;
    kind: 'loan' | 'credit_card';
    scope: Scope;
    balanceMinor: number;
    aprBps: number;
    monthlyMinMinor: number;
    payoffOrder: number;
    baselineMonths: number;
    planMonths: number;
  }>;
}

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

export interface GoalsSummary {
  goals: Array<
    SavingsGoalRecord & {
      progressPct: number;
      remainingMinor: number;
      monthlyRequiredMinor: number | null;
    }
  >;
  totalReservedMinor: number;
  taxReserveMinor: number;
  liquidBankMinor: number;
  freeUnreservedCashMinor: number;
  avgMonthlyExpenseMinor: number;
  emergencyRunwayMonths: number | null;
}

export interface ParsedImportCandidate {
  id: string;
  source: 'csv' | 'sms';
  kind: 'income' | 'expense';
  scope: Scope;
  accountId: string;
  accountName: string;
  category: string;
  amountMinor: number;
  occurredAt: string;
  party: string;
  note: string;
  isDuplicate: boolean;
  confidence: 'high' | 'medium';
}

export interface ExtractedReceiptFields {
  vendor: string;
  amountMinor: number | null;
  occurredAt: string;
  category: string;
  kind: 'expense' | 'income';
  note: string;
  source: 'local_text' | 'offline_ocr' | 'vision_llm';
  ocrText?: string;
}

export interface AgentExecutionResult {
  detectedLanguage: AppLanguage;
  systemLanguage: AppLanguage;
  requiresConfirmation: boolean;
  previewText: string;
  replyText: string;
  toolCalls: unknown[];
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  uiEffects: {
    navigateTab?: 'dashboard' | 'cards' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault';
    scopeFilter?: Scope | 'all';
    setLanguage?: AppLanguage;
    mutatedData?: boolean;
  };
  briefing?: AdvisorBriefing;
  suggestions?: AdvisorSuggestion[];
}

export const api = {
  getDashboard: async (scope?: Scope): Promise<DashboardSummary> => {
    if (isStandaloneClient()) return clientDb.getDashboard(scope);
    try {
      return await request<DashboardSummary>(`/api/dashboard${scope ? `?scope=${scope}` : ''}`);
    } catch {
      return clientDb.getDashboard(scope);
    }
  },

  getReports: async (params: { fromDate: string; toDate: string; scope?: Scope }): Promise<DetailedReports> => {
    if (isStandaloneClient()) return clientDb.getReports(params);
    try {
      const qs = new URLSearchParams({ fromDate: params.fromDate, toDate: params.toDate });
      if (params.scope) qs.set('scope', params.scope);
      return await request<DetailedReports>(`/api/reports?${qs.toString()}`);
    } catch {
      return clientDb.getReports(params);
    }
  },

  globalSearch: async (query: string): Promise<GlobalSearchResult> => {
    if (isStandaloneClient()) return clientDb.globalSearch(query);
    try {
      return await request<{ data: GlobalSearchResult }>(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.data);
    } catch {
      return clientDb.globalSearch(query);
    }
  },

  getAccounts: async (): Promise<AccountRecord[]> => {
    if (isStandaloneClient()) return clientDb.getAccounts();
    try {
      return await request<{ data: AccountRecord[] }>('/api/accounts').then((r) => r.data);
    } catch {
      return clientDb.getAccounts();
    }
  },

  createAccount: async (body: {
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
  }): Promise<AccountRecord> => {
    if (isStandaloneClient()) return clientDb.createAccount(body);
    try {
      return await request<{ data: AccountRecord }>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.createAccount(body);
    }
  },

  updateAccount: async (
    id: string,
    body: Partial<{
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
    }>,
  ): Promise<AccountRecord> => {
    if (isStandaloneClient()) return clientDb.updateAccount(id, body);
    try {
      return await request<{ data: AccountRecord }>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updateAccount(id, body);
    }
  },

  getUnmatchedTransfers: () =>
    request<{ data: UnmatchedTransferCandidate[] }>('/api/transfers/unmatched').then((r) => r.data),

  matchTransferPair: (sourceTxId: string, destTxId: string) =>
    request<{ ok: boolean; mergedTx: TransactionRecord }>('/api/transfers/match', {
      method: 'POST',
      body: JSON.stringify({ sourceTxId, destTxId }),
    }),

  getCardReconciliation: (cardId: string, refDate?: string) =>
    request<{ data: CardCycleReconciliation }>(`/api/cards/${cardId}/reconciliation${refDate ? `?refDate=${refDate}` : ''}`).then((r) => r.data),

  reconcileAndPayCard: (
    cardId: string,
    body: {
      fromAccountId: string;
      amountMinor: number;
      occurredAt: string;
      note?: string;
    },
  ) =>
    request<{ ok: boolean; tx: TransactionRecord }>(`/api/cards/${cardId}/reconcile-pay`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reconcileAccount: (id: string, targetBalanceMinor: number) =>
    request<{ data: TransactionRecord | null }>(`/api/accounts/${id}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ targetBalanceMinor }),
    }).then((r) => r.data),

  deleteAccount: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteAccount(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteAccount(id);
      return { ok: true };
    }
  },

  getTransactions: async (params: {
    scope?: Scope;
    kind?: TxKind;
    accountId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  } = {}): Promise<TransactionRecord[]> => {
    if (isStandaloneClient()) return clientDb.getTransactions(params);
    try {
      const qs = new URLSearchParams();
      if (params.scope) qs.set('scope', params.scope);
      if (params.kind) qs.set('kind', params.kind);
      if (params.accountId) qs.set('accountId', params.accountId);
      if (params.search) qs.set('search', params.search);
      if (params.fromDate) qs.set('fromDate', params.fromDate);
      if (params.toDate) qs.set('toDate', params.toDate);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return await request<{ data: TransactionRecord[] }>(`/api/transactions${suffix}`).then((r) => r.data);
    } catch {
      return clientDb.getTransactions(params);
    }
  },

  createTransaction: async (body: {
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
  }): Promise<TransactionRecord> => {
    if (isStandaloneClient()) return clientDb.createTransaction(body);
    try {
      return await request<{ data: TransactionRecord }>('/api/transactions', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.createTransaction(body);
    }
  },

  getTransactionAttachment: (id: string) =>
    request<{ data: { id: string; transactionId: string; filename: string; mimeType: string; dataBase64: string } }>(
      `/api/transactions/${id}/attachment`,
    ).then((r) => r.data),

  updateTransaction: async (
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
  ): Promise<TransactionRecord> => {
    if (isStandaloneClient()) return clientDb.updateTransaction(id, body);
    try {
      return await request<{ data: TransactionRecord }>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updateTransaction(id, body);
    }
  },

  deleteTransaction: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteTransaction(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteTransaction(id);
      return { ok: true };
    }
  },

  bulkTransactions: async (body: {
    action: 'delete' | 'update';
    ids: string[];
    patch?: { scope?: Scope; category?: string };
  }): Promise<{ ok: boolean; count: number }> => {
    if (isStandaloneClient()) {
      const res = clientDb.bulkTransactions(body);
      return { ok: true, count: res.count };
    }
    try {
      return await request<{ ok: boolean; count: number }>('/api/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch {
      const res = clientDb.bulkTransactions(body);
      return { ok: true, count: res.count };
    }
  },

  getRecurringBills: async (): Promise<RecurringBillRecord[]> => {
    if (isStandaloneClient()) return clientDb.getRecurringBills();
    try {
      return await request<{ data: RecurringBillRecord[] }>('/api/recurring-bills').then((r) => r.data);
    } catch {
      return clientDb.getRecurringBills();
    }
  },

  createRecurringBill: async (body: {
    title: string;
    scope: Scope;
    kind: 'expense' | 'income';
    accountId: string;
    category: string;
    amountMinor: number;
    dueDay: number;
    autoPost?: boolean;
  }): Promise<RecurringBillRecord> => {
    if (isStandaloneClient()) return clientDb.createRecurringBill(body);
    try {
      return await request<{ data: RecurringBillRecord }>('/api/recurring-bills', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.createRecurringBill(body);
    }
  },

  updateRecurringBill: async (
    id: string,
    body: Partial<{
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
  ): Promise<RecurringBillRecord> => {
    if (isStandaloneClient()) return clientDb.updateRecurringBill(id, body);
    try {
      return await request<{ data: RecurringBillRecord }>(`/api/recurring-bills/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updateRecurringBill(id, body);
    }
  },

  runAutoPostRecurring: () =>
    request<{ data: Array<{ bill: RecurringBillRecord; transaction: TransactionRecord }> }>(
      '/api/recurring-bills/auto-post',
      { method: 'POST' },
    ).then((r) => r.data),

  confirmRecurringBill: (id: string, paidAt?: string) =>
    request<{ data: { bill: RecurringBillRecord; transaction: TransactionRecord } }>(`/api/recurring-bills/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ paidAt }),
    }).then((r) => r.data),

  deleteRecurringBill: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteRecurringBill(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/recurring-bills/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteRecurringBill(id);
      return { ok: true };
    }
  },

  getBudgets: async (): Promise<ScopeBudgetRecord[]> => {
    if (isStandaloneClient()) return clientDb.getBudgets();
    try {
      return await request<{ data: ScopeBudgetRecord[] }>('/api/budgets').then((r) => r.data);
    } catch {
      return clientDb.getBudgets();
    }
  },

  upsertBudget: async (scope: Scope, monthlyLimitMinor: number): Promise<ScopeBudgetRecord[]> => {
    if (isStandaloneClient()) {
      clientDb.setBudget(scope, '', monthlyLimitMinor);
      return clientDb.getBudgets();
    }
    try {
      return await request<{ data: ScopeBudgetRecord[] }>('/api/budgets', {
        method: 'PUT',
        body: JSON.stringify({ scope, monthlyLimitMinor }),
      }).then((r) => r.data);
    } catch {
      clientDb.setBudget(scope, '', monthlyLimitMinor);
      return clientDb.getBudgets();
    }
  },

  getCategoryBudgets: async (): Promise<CategoryBudgetRecord[]> => {
    if (isStandaloneClient()) return [];
    try {
      return await request<{ data: CategoryBudgetRecord[] }>('/api/budgets/categories').then((r) => r.data);
    } catch {
      return [];
    }
  },

  upsertCategoryBudget: (body: { scope: Scope; category: string; monthlyLimitMinor: number }) =>
    request<{ data: CategoryBudgetRecord }>('/api/budgets/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  deleteCategoryBudget: (id: string) =>
    request<{ ok: boolean }>(`/api/budgets/categories/${id}`, { method: 'DELETE' }),

  getLoans: async (): Promise<LoanRecord[]> => {
    if (isStandaloneClient()) return clientDb.getLoans();
    try {
      return await request<{ data: LoanRecord[] }>('/api/loans').then((r) => r.data);
    } catch {
      return clientDb.getLoans();
    }
  },

  createLoan: async (body: {
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
  }): Promise<LoanRecord> => {
    if (isStandaloneClient()) return clientDb.createLoan(body);
    try {
      return await request<{ data: LoanRecord }>('/api/loans', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.createLoan(body);
    }
  },

  updateLoan: async (
    id: string,
    body: Partial<{
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
  ): Promise<LoanRecord> => {
    if (isStandaloneClient()) return clientDb.updateLoan(id, body);
    try {
      return await request<{ data: LoanRecord }>(`/api/loans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updateLoan(id, body);
    }
  },

  payLoan: async (id: string, body: { amountMinor: number; accountId: string; paidAt: string; note?: string }): Promise<{ loan: LoanRecord; transaction: TransactionRecord }> => {
    if (isStandaloneClient()) return clientDb.recordLoanPayment(id, body);
    try {
      return await request<{ data: { loan: LoanRecord; transaction: TransactionRecord } }>(`/api/loans/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    } catch {
      return clientDb.recordLoanPayment(id, body);
    }
  },

  deleteLoan: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteLoan(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/loans/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteLoan(id);
      return { ok: true };
    }
  },

  getDues: async (): Promise<{ data: PersonDueRecord[]; summaries: PersonNetSummary[] }> => {
    if (isStandaloneClient()) return clientDb.getDues();
    try {
      return await request<{ data: PersonDueRecord[]; summaries: PersonNetSummary[] }>('/api/dues');
    } catch {
      return clientDb.getDues();
    }
  },

  createDue: async (body: {
    personName: string;
    phone?: string;
    direction: DueDirection;
    scope: Scope;
    amountMinor: number;
    dueDate?: string | null;
    note?: string;
  }): Promise<PersonDueRecord> => {
    if (isStandaloneClient()) return clientDb.createDue(body);
    try {
      return await request<{ data: PersonDueRecord }>('/api/dues', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.createDue(body);
    }
  },

  updateDue: (
    id: string,
    body: Partial<{
      personName: string;
      phone: string;
      direction: DueDirection;
      scope: Scope;
      amountMinor: number;
      dueDate: string | null;
      note: string;
    }>,
  ) => request<{ data: PersonDueRecord }>(`/api/dues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),

  settleDue: async (id: string, body: { amountMinor: number; accountId?: string | null; settledAt: string; note?: string }): Promise<{ due: PersonDueRecord; transaction: TransactionRecord | null }> => {
    if (isStandaloneClient()) return clientDb.settleDue(id, body);
    try {
      return await request<{ data: { due: PersonDueRecord; transaction: TransactionRecord | null } }>(`/api/dues/${id}/settle`, {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    } catch {
      return clientDb.settleDue(id, body);
    }
  },

  deleteDue: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteDue(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/dues/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteDue(id);
      return { ok: true };
    }
  },

  getNotes: async (search?: string): Promise<NoteRecord[]> => {
    if (isStandaloneClient()) return clientDb.getNotes();
    try {
      return await request<{ data: NoteRecord[] }>(`/api/notes${search ? `?search=${encodeURIComponent(search)}` : ''}`).then((r) => r.data);
    } catch {
      return clientDb.getNotes();
    }
  },

  reorderNotes: (noteIds: string[]) =>
    request<{ ok: boolean; count: number }>('/api/notes/reorder', {
      method: 'POST',
      body: JSON.stringify({ noteIds }),
    }),

  createNote: async (body: {
    title: string;
    body: string;
    scope: NoteScope;
    color?: NoteColor;
    tags?: string[];
    pinned: boolean;
    archived?: boolean;
    remindAt?: string | null;
    linkedTxId?: string | null;
    linkedDueId?: string | null;
    linkedLoanId?: string | null;
    linkedAccountId?: string | null;
    checklist: Array<{ id?: string; text: string; done: boolean }>;
  }): Promise<NoteRecord> => {
    if (isStandaloneClient()) return clientDb.upsertNote(body);
    try {
      return await request<{ data: NoteRecord }>('/api/notes', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.upsertNote(body);
    }
  },

  updateNote: async (
    id: string,
    body: {
      title: string;
      body: string;
      scope: NoteScope;
      color?: NoteColor;
      tags?: string[];
      pinned: boolean;
      archived?: boolean;
      remindAt?: string | null;
      linkedTxId?: string | null;
      linkedDueId?: string | null;
      linkedLoanId?: string | null;
      linkedAccountId?: string | null;
      checklist: Array<{ id?: string; text: string; done: boolean }>;
    },
  ): Promise<NoteRecord> => {
    if (isStandaloneClient()) return clientDb.upsertNote({ id, ...body });
    try {
      return await request<{ data: NoteRecord }>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.upsertNote({ id, ...body });
    }
  },

  addNoteAttachment: (
    noteId: string,
    body: { filename: string; mimeType: string; dataBase64: string; byteSize?: number },
  ) =>
    request<{ data: NoteAttachmentRecord }>(`/api/notes/${noteId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  deleteNoteAttachment: (noteId: string, attId: string) =>
    request<{ ok: boolean }>(`/api/notes/${noteId}/attachments/${attId}`, { method: 'DELETE' }),

  toggleChecklistItem: (noteId: string, itemId: string, done: boolean) =>
    request<{ data: NoteRecord }>(`/api/notes/${noteId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }).then((r) => r.data),

  deleteNote: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteNote(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteNote(id);
      return { ok: true };
    }
  },

  bulkNotes: (body: {
    ids: string[];
    action: 'scope' | 'color' | 'tag' | 'archive' | 'unarchive' | 'pin' | 'unpin' | 'delete';
    scope?: NoteScope;
    color?: NoteColor;
    tag?: string;
  }) => request<{ ok: boolean; count: number }>('/api/notes/bulk', { method: 'POST', body: JSON.stringify(body) }),

  getVaultMeta: () => request<{ data: VaultMetaRecord | null }>('/api/vault/meta').then((r) => r.data),

  saveVaultMeta: (body: {
    saltB64: string;
    canaryIv: string;
    canaryCt: string;
    recoverySaltB64?: string | null;
    recoveryIv?: string | null;
    recoveryCt?: string | null;
    waRecoveryKey?: string | null;
  }) => request<{ data: VaultMetaRecord }>('/api/vault/meta', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  saveVaultRecovery: (body: {
    recoverySaltB64: string;
    recoveryIv: string;
    recoveryCt: string;
    waRecoveryKey?: string | null;
  }) => request<{ data: VaultMetaRecord }>('/api/vault/recovery', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  requestWhatsAppVaultRecovery: () =>
    request<{ ok: boolean; phoneMasked: string; expiresMinutes: number }>('/api/vault/recovery/whatsapp-request', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  verifyWhatsAppVaultRecovery: (code: string) =>
    request<{
      ok: boolean;
      recoveryKey: string;
      recoverySaltB64: string;
      recoveryIv: string;
      recoveryCt: string;
    }>('/api/vault/recovery/whatsapp-verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getVaultEntries: () => request<{ data: VaultEntryCipherRecord[] }>('/api/vault/entries').then((r) => r.data),

  saveVaultEntry: (body: {
    id?: string;
    label: string;
    category: string;
    iv: string;
    ciphertext: string;
    lastRotatedAt: string;
  }) => request<{ data: VaultEntryCipherRecord }>('/api/vault/entries', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  deleteVaultEntry: (id: string) => request<{ ok: boolean }>(`/api/vault/entries/${id}`, { method: 'DELETE' }),

  rekeyVault: (body: {
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
  }) => request<{ data: VaultMetaRecord }>('/api/vault/rekey', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  recordVaultEvent: (eventType: 'failed_unlock' | 'vault_unlocked', detail = '') =>
    request<{ ok: boolean }>('/api/vault/events', { method: 'POST', body: JSON.stringify({ eventType, detail }) }),

  getAlerts: () => request<{ data: AlertDeliveryRecord[] }>('/api/alerts').then((r) => r.data),

  markAllAlertsRead: () => request<{ ok: boolean }>('/api/alerts/read-all', { method: 'POST' }),

  checkAlertsNow: () =>
    request<{ data: { evaluated: number; queuedWhatsApp: number; sentWhatsApp: number; suppressedQuietHours: boolean } }>(
      '/api/alerts/check-now',
      { method: 'POST' },
    ).then((r) => r.data),

  getAlertSettings: () => request<{ data: AlertSettings }>('/api/alerts/settings').then((r) => r.data),

  saveAlertSettings: (body: AlertSettings) =>
    request<{ data: AlertSettings }>('/api/alerts/settings', { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),

  getWhatsAppStatus: async (): Promise<WhatsAppBridgeState> => {
    if (isStandaloneClient()) return clientDb.getWhatsAppStatus();
    try {
      return await request<{ data: WhatsAppBridgeState }>('/api/whatsapp/status').then((r) => r.data);
    } catch {
      return clientDb.getWhatsAppStatus();
    }
  },
  connectWhatsApp: () => request<{ data: WhatsAppBridgeState }>('/api/whatsapp/connect', { method: 'POST' }).then((r) => r.data),
  disconnectWhatsApp: () => request<{ data: WhatsAppBridgeState }>('/api/whatsapp/disconnect', { method: 'POST' }).then((r) => r.data),
  logoutWhatsApp: () => request<{ data: WhatsAppBridgeState }>('/api/whatsapp/logout', { method: 'POST' }).then((r) => r.data),
  testWhatsApp: (phone?: string) =>
    request<{ ok: boolean }>('/api/whatsapp/test', { method: 'POST', body: JSON.stringify({ phone }) }),

  getPreferences: async (): Promise<AppPreferences> => {
    if (isStandaloneClient()) return clientDb.getPreferences();
    try {
      return await request<{ data: AppPreferences }>('/api/preferences').then((r) => r.data);
    } catch {
      return clientDb.getPreferences();
    }
  },
  updatePreferences: async (body: {
    systemLanguage?: AppLanguage;
    agentAutoExecute?: boolean;
    llmProvider?: 'local' | 'gemini' | 'openai';
    llmApiKey?: string;
    clearApiKey?: boolean;
    llmModel?: string;
    autoLockMinutes?: number;
    autoBackupEnabled?: boolean;
    autoBackupDir?: string;
  }): Promise<AppPreferences> => {
    if (isStandaloneClient()) return clientDb.updatePreferences(body);
    try {
      return await request<{ data: AppPreferences }>('/api/preferences', { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updatePreferences(body);
    }
  },

  getAppLockStatus: async (): Promise<{ hasAppPin: boolean; unlocked: boolean; autoLockMinutes: number }> => {
    if (isStandaloneClient()) {
      try {
        const prefs = await clientDb.getPreferences();
        return { hasAppPin: !!prefs.hasAppPin, unlocked: true, autoLockMinutes: prefs.autoLockMinutes ?? 0 };
      } catch {
        return { hasAppPin: false, unlocked: true, autoLockMinutes: 0 };
      }
    }
    try {
      return await request<{ data: { hasAppPin: boolean; unlocked: boolean; autoLockMinutes: number } }>('/api/app-lock/status').then(
        (r) => r.data,
      );
    } catch {
      const prefs = await clientDb.getPreferences();
      return { hasAppPin: !!prefs.hasAppPin, unlocked: true, autoLockMinutes: prefs.autoLockMinutes ?? 0 };
    }
  },
  lockApp: async () => {
    if (isStandaloneClient()) return { ok: true };
    try {
      return await request<{ ok: boolean }>('/api/app-lock/lock', { method: 'POST' });
    } catch {
      return { ok: true };
    }
  },
  setAppPin: async (body: { pin: string; currentPin?: string }) => {
    if (isStandaloneClient()) return clientDb.updatePreferences({ hasAppPin: true });
    try {
      return await request<{ data: AppPreferences }>('/api/app-lock/set', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    } catch {
      return clientDb.updatePreferences({ hasAppPin: true });
    }
  },
  verifyAppPin: async (pin: string) => {
    if (isStandaloneClient()) return { ok: true };
    try {
      return await request<{ ok: boolean }>('/api/app-lock/verify', { method: 'POST', body: JSON.stringify({ pin }) });
    } catch {
      return { ok: true };
    }
  },
  clearAppPin: async (currentPin: string) => {
    if (isStandaloneClient()) return clientDb.updatePreferences({ hasAppPin: false });
    try {
      return await request<{ data: AppPreferences }>('/api/app-lock/clear', { method: 'POST', body: JSON.stringify({ currentPin }) }).then((r) => r.data);
    } catch {
      return clientDb.updatePreferences({ hasAppPin: false });
    }
  },

  getTaxSummaryPack: async (fyStartYear?: number) => {
    if (isStandaloneClient()) {
      return {
        fyLabel: `FY ${fyStartYear ?? 2026}-${((fyStartYear ?? 2026) + 1).toString().slice(-2)}`,
        businessTurnoverMinor: 0,
        businessExpensesMinor: 0,
        netProfitMinor: 0,
        section80cEligibleMinor: 0,
        section80dEligibleMinor: 0,
        homeLoanInterestMinor: 0,
        accountsAudited: [],
      } as unknown as TaxSummaryPack;
    }
    try {
      return await request<{ data: TaxSummaryPack }>(`/api/reports/tax-pack${fyStartYear ? `?fyStartYear=${fyStartYear}` : ''}`).then((r) => r.data);
    } catch {
      return {
        fyLabel: `FY ${fyStartYear ?? 2026}-${((fyStartYear ?? 2026) + 1).toString().slice(-2)}`,
        businessTurnoverMinor: 0,
        businessExpensesMinor: 0,
        netProfitMinor: 0,
        section80cEligibleMinor: 0,
        section80dEligibleMinor: 0,
        homeLoanInterestMinor: 0,
        accountsAudited: [],
      } as unknown as TaxSummaryPack;
    }
  },

  exportEncryptedBackup: (passphrase: string) =>
    request<{ data: unknown }>('/api/backup/export-encrypted', { method: 'POST', body: JSON.stringify({ passphrase }) }).then((r) => r.data),
  restoreEncryptedBackup: (envelope: unknown, passphrase: string) =>
    request<{ data: { restoredAt: string; counts: Record<string, number> } }>('/api/backup/restore-encrypted', {
      method: 'POST',
      body: JSON.stringify({ envelope, passphrase }),
    }).then((r) => r.data),
  runAutoBackupNow: () =>
    request<{ data: { path: string; backedUpAt: string } }>('/api/backup/run-now', { method: 'POST' }).then((r) => r.data),

  getInvestments: async () => {
    if (isStandaloneClient()) return [];
    try {
      return await request<{ data: InvestmentRecord[] }>('/api/investments').then((r) => r.data);
    } catch {
      return [];
    }
  },
  createInvestment: (body: {
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
  }) => request<{ data: InvestmentRecord }>('/api/investments', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  updateInvestment: (id: string, body: Partial<{
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
  }>) => request<{ data: InvestmentRecord }>(`/api/investments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),
  deleteInvestment: (id: string) => request<{ ok: boolean }>(`/api/investments/${id}`, { method: 'DELETE' }),

  getCategoryRules: async () => {
    if (isStandaloneClient()) return [];
    try {
      return await request<{ data: CategoryRuleRecord[] }>('/api/rules').then((r) => r.data);
    } catch {
      return [];
    }
  },
  createCategoryRule: (body: {
    pattern: string;
    matchType?: RuleMatchType;
    category: string;
    scope?: Scope | null;
    accountId?: string | null;
    kind?: 'expense' | 'income' | null;
    priority?: number;
  }) => request<{ data: CategoryRuleRecord }>('/api/rules', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  deleteCategoryRule: (id: string) => request<{ ok: boolean }>(`/api/rules/${id}`, { method: 'DELETE' }),

  getAgentBriefing: async (scope?: Scope): Promise<AdvisorBriefing> => {
    if (isStandaloneClient()) return clientDb.getAgentBriefing(scope);
    try {
      return await request<{ data: AdvisorBriefing }>(`/api/agent/briefing${scope ? `?scope=${scope}` : ''}`).then((r) => r.data);
    } catch {
      return clientDb.getAgentBriefing(scope);
    }
  },
  getSubscriptions: async () => {
    if (isStandaloneClient()) return [];
    try {
      return await request<{ data: RecurringLeakCandidate[] }>('/api/agent/subscriptions').then((r) => r.data);
    } catch {
      return [];
    }
  },
  getDebtPayoffPlan: async (params?: { extraMinor?: number; strategy?: 'avalanche' | 'snowball'; cardAprBps?: number }) => {
    if (isStandaloneClient()) {
      return { totalDebtMinor: 0, monthsToDebtFree: 0, totalInterestMinor: 0, accounts: [] } as any;
    }
    try {
      const qs = new URLSearchParams();
      if (params?.extraMinor !== undefined) qs.set('extraMinor', String(params.extraMinor));
      if (params?.strategy) qs.set('strategy', params.strategy);
      if (params?.cardAprBps !== undefined) qs.set('cardAprBps', String(params.cardAprBps));
      const q = qs.toString();
      return await request<{ data: DebtPayoffResult }>(`/api/planner/debt-payoff${q ? `?${q}` : ''}`).then((r) => r.data);
    } catch {
      return { totalDebtMinor: 0, monthsToDebtFree: 0, totalInterestMinor: 0, accounts: [] } as any;
    }
  },
  getGoals: async (): Promise<GoalsSummary> => {
    const emptyGoals: GoalsSummary = {
      goals: [],
      totalReservedMinor: 0,
      taxReserveMinor: 0,
      liquidBankMinor: 0,
      freeUnreservedCashMinor: 0,
      avgMonthlyExpenseMinor: 0,
      emergencyRunwayMonths: null,
    };
    if (isStandaloneClient()) {
      return emptyGoals;
    }
    try {
      return await request<{ data: GoalsSummary }>('/api/goals').then((r) => r.data);
    } catch {
      return emptyGoals;
    }
  },
  createGoal: (body: {
    title: string;
    kind: 'goal' | 'emergency' | 'tax_reserve';
    scope: Scope;
    targetMinor: number;
    currentMinor?: number;
    targetDate?: string | null;
    linkedAccountId?: string | null;
    note?: string;
  }) => request<{ data: SavingsGoalRecord }>('/api/goals', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  updateGoal: (
    id: string,
    body: Partial<{
      title: string;
      kind: 'goal' | 'emergency' | 'tax_reserve';
      scope: Scope;
      targetMinor: number;
      currentMinor: number;
      targetDate: string | null;
      linkedAccountId: string | null;
      note: string;
    }>,
  ) => request<{ data: SavingsGoalRecord }>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),
  contributeGoal: (
    id: string,
    body: {
      amountMinor: number;
      accountId?: string | null;
      occurredAt?: string;
      recordAsExpense?: boolean;
      note?: string;
    },
  ) => request<{ data: { goal: SavingsGoalRecord } }>(`/api/goals/${id}/contribute`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  deleteGoal: (id: string) => request<{ ok: boolean }>(`/api/goals/${id}`, { method: 'DELETE' }),
  previewImport: (body: { text: string; defaultAccountId?: string; defaultScope?: Scope }) =>
    request<{ data: ParsedImportCandidate[] }>('/api/import/preview', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  previewImportPdf: (body: { pdfBase64: string; password?: string; defaultAccountId?: string; defaultScope?: Scope }) =>
    request<{ data: ParsedImportCandidate[]; pageCount: number; extractedText: string }>('/api/import/preview-pdf', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  commitImport: (
    items: Array<{
      kind: 'income' | 'expense';
      scope: Scope;
      accountId: string;
      category: string;
      amountMinor: number;
      occurredAt: string;
      party: string;
      note: string;
    }>,
  ) => request<{ data: { count: number } }>('/api/import/commit', { method: 'POST', body: JSON.stringify({ items }) }).then((r) => r.data),
  parseReceipt: (body: { imageBase64?: string; mimeType?: string; receiptText?: string }) =>
    request<{ data: ExtractedReceiptFields }>('/api/receipt/parse', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  getAgentHistory: () => request<{ data: AgentHistoryRecord[] }>('/api/agent/history').then((r) => r.data),
  clearAgentHistory: () => request<{ ok: boolean }>('/api/agent/history', { method: 'DELETE' }),
  sendAgentCommand: (body: { commandText: string; confirmExecution?: boolean; pendingCalls?: unknown[] }) =>
    request<{ data: AgentExecutionResult }>('/api/agent/command', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  sendAgentVoice: (body: { audioBase64: string; mimeType: string }) =>
    request<{ data: { transcript: string; result: AgentExecutionResult } }>('/api/agent/voice', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => r.data),

  restoreBackup: (snapshot: unknown) =>
    request<{
      data: {
        restoredAt: string;
        counts: {
          accounts: number;
          transactions: number;
          recurringBills: number;
          loans: number;
          peopleDues: number;
          notes: number;
          vaultEntries: number;
        };
      };
    }>('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    }).then((r) => r.data),

  getJobSheets: async (): Promise<any[]> => {
    if (isStandaloneClient()) return clientDb.getJobSheets();
    try {
      return await request<{ data: any[] }>('/api/job-sheets').then((r) => r.data);
    } catch {
      return clientDb.getJobSheets();
    }
  },
  createJobSheet: async (body: any): Promise<any> => {
    if (isStandaloneClient()) return clientDb.saveJobSheet({ id: `sheet-${Date.now()}`, ...body });
    try {
      return await request<{ data: any }>('/api/job-sheets', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    } catch {
      return clientDb.saveJobSheet({ id: `sheet-${Date.now()}`, ...body });
    }
  },
  updateJobSheet: async (id: string, body: any): Promise<any> => {
    if (isStandaloneClient()) return clientDb.saveJobSheet({ id, ...body });
    try {
      return await request<{ data: any }>(`/api/job-sheets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    } catch {
      return clientDb.saveJobSheet({ id, ...body });
    }
  },
  deleteJobSheet: async (id: string): Promise<{ ok: boolean }> => {
    if (isStandaloneClient()) {
      clientDb.deleteJobSheet(id);
      return { ok: true };
    }
    try {
      return await request<{ ok: boolean }>(`/api/job-sheets/${id}`, { method: 'DELETE' });
    } catch {
      clientDb.deleteJobSheet(id);
      return { ok: true };
    }
  },

  resetToCleanSlate: async (): Promise<boolean> => {
    clientDb.resetToCleanSlate();
    return true;
  },
};
