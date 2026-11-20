import { z } from 'zod';

export const SCOPES = ['personal', 'business', 'family'] as const;
export type Scope = (typeof SCOPES)[number];

export const NOTE_SCOPES = ['general', 'personal', 'business', 'family'] as const;
export type NoteScope = (typeof NOTE_SCOPES)[number];

export const NOTE_COLORS = ['default', 'honey', 'mint', 'sky', 'lavender', 'blush'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const ACCOUNT_TYPES = ['bank', 'credit_card'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_GROUPS = ['bank', 'wallet', 'cash', 'credit_card'] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export const TX_KINDS = ['income', 'expense', 'transfer'] as const;
export type TxKind = (typeof TX_KINDS)[number];

export const LOAN_DIRECTIONS = ['borrowed', 'lent'] as const;
export type LoanDirection = (typeof LOAN_DIRECTIONS)[number];

export const DUE_DIRECTIONS = ['give', 'need'] as const;
export type DueDirection = (typeof DUE_DIRECTIONS)[number];

export const INVESTMENT_KINDS = ['mutual_fund', 'stock', 'fd', 'ppf', 'gold', 'property', 'other'] as const;
export type InvestmentKind = (typeof INVESTMENT_KINDS)[number];

export const RULE_MATCH_TYPES = ['contains', 'exact'] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export const ALERT_MODULES = [
  'credit_cards',
  'banks',
  'loans',
  'people_dues',
  'budgets',
  'notes',
  'vault',
  'advisor',
] as const;
export type AlertModule = (typeof ALERT_MODULES)[number];

export const GOAL_KINDS = ['goal', 'emergency', 'tax_reserve'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const CATEGORY_PRESETS_BY_SCOPE: Record<Scope, Record<'expense' | 'income', readonly string[]>> = {
  personal: {
    expense: [
      'Food & Dining',
      'Groceries',
      'Travel & Fuel',
      'Shopping',
      'Utilities & Telecom',
      'Rent & Housing',
      'Medical & Health',
      'Subscriptions',
      'Education & Learning',
      'Personal Care',
      'EMI & Loan',
      'Gifts & Charity',
      'Investments / SIP',
      'Taxes',
      'General',
    ],
    income: [
      'Salary',
      'Freelance / Side Income',
      'Investment Income',
      'Refund / Cashback',
      'Rental Income',
      'Gift Received',
      'Income',
    ],
  },
  business: {
    expense: [
      'Office Rent & Utilities',
      'Software & SaaS',
      'Cloud & Hosting',
      'Marketing & Ads',
      'Payroll & Contractors',
      'Travel & Conveyance',
      'Hardware & Supplies',
      'Professional / CA Fees',
      'GST & Taxes',
      'Shipping & Logistics',
      'Bank Charges',
      'General',
    ],
    income: [
      'Business Revenue',
      'Client Invoice / Retainer',
      'Consulting Fees',
      'Commission / Affiliate',
      'Refund / Cashback',
      'Investment Income',
      'Income',
    ],
  },
  family: {
    expense: [
      'Shopping & Groceries',
      'Food & Dining',
      'Utilities & Telecom',
      'Rent & Housing',
      'Medical & Health',
      'School & Tuition',
      'Domestic Help',
      'Insurance Premium',
      'Festivals & Gifts',
      'Travel & Vacation',
      'EMI & Loan',
      'General',
    ],
    income: [
      'Family Contribution',
      'Salary',
      'Rental Income',
      'Investment Income',
      'Refund / Cashback',
      'Income',
    ],
  },
};

export const VAULT_CATEGORY_PRESETS = [
  'Banking',
  'Credit Card',
  'Business',
  'Personal',
  'Family',
  'Government',
  'Tax & Compliance',
  'Cloud & Hosting',
  'Utilities & Telecom',
  'Investment & Demat',
  'General',
] as const;

export function getCategoryOptions(
  scope: Scope | 'all' | '',
  kind: 'expense' | 'income' | 'transfer' | 'all' = 'expense',
  extra: readonly string[] = [],
): string[] {
  const scopes: readonly Scope[] = scope && scope !== 'all' ? [scope] : SCOPES;
  const kinds: readonly ('expense' | 'income')[] =
    kind === 'income' ? ['income'] : kind === 'all' ? ['expense', 'income'] : ['expense'];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const sc of scopes) {
    for (const k of kinds) {
      for (const preset of CATEGORY_PRESETS_BY_SCOPE[sc][k]) push(preset);
    }
  }
  for (const item of extra) push(item);
  return out;
}

// Exact decimal-to-paise conversion without IEEE-754 float drift
export function rupeesToPaise(input: number | string): number {
  const raw = typeof input === 'number' ? String(input) : input.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid INR amount: "${input}"`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ''] = unsigned.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const thirdDigit = fracPart.length > 2 ? Number(fracPart[2]) : 0;
  let paise = Number(wholePart) * 100 + Number(paddedFrac) + (thirdDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Amount out of safe integer range: "${input}"`);
  }
  if (negative && paise !== 0) paise = -paise;
  return paise;
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inrStandard = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatINR(
  paise: number,
  opts: { compact?: boolean; signed?: boolean; decimals?: boolean } = {},
): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) {
    return '₹0.00';
  }
  const { compact = false, signed = false, decimals = true } = opts;
  const absPaise = Math.abs(paise);
  const sign = paise < 0 ? '-' : signed && paise > 0 ? '+' : '';

  if (compact) {
    const rupees = absPaise / 100;
    if (rupees >= 1_00_00_000) return `${sign}₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
    if (rupees >= 1_00_000) return `${sign}₹${(rupees / 1_00_000).toFixed(2)}L`;
    if (rupees >= 1_000) return `${sign}₹${(rupees / 1_000).toFixed(1)}k`;
  }

  const formatter = decimals ? inrStandard : inrWhole;
  return `${sign}${formatter.format(absPaise / 100)}`;
}

// Local calendar YYYY-MM-DD without UTC shift bugs
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthPrefix(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}

export function parseISODate(iso: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid YYYY-MM-DD date: "${iso}"`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Non-existent calendar date: "${iso}"`);
  }
  return { year: y, month: m, day: d };
}

export function toISOFromUTC(year: number, monthIndex0: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, day), lastDay);
  const d = new Date(Date.UTC(year, monthIndex0, clampedDay));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addMonthsISO(iso: string, months: number): string {
  try {
    const { year, month, day } = parseISODate(iso);
    const totalMonths = year * 12 + (month - 1) + months;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth0 = ((totalMonths % 12) + 12) % 12;
    return toISOFromUTC(newYear, newMonth0, day);
  } catch {
    const now = new Date();
    return toISOFromUTC(now.getFullYear(), now.getMonth() + months, now.getDate());
  }
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
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

export function computeCardCycle(params: {
  statementDay: number;
  dueDay: number;
  creditLimitMinor: number;
  referenceDate: string;
  transactions: Array<{ kind: TxKind; amountMinor: number; occurredAt: string; direction: 'out' | 'in' }>;
}): CardCycleSummary {
  const { statementDay, dueDay, creditLimitMinor, referenceDate, transactions } = params;
  const ref = parseISODate(referenceDate);

  // Last statement closed on or before referenceDate
  let lastStmtYear = ref.year;
  let lastStmtMonth0 = ref.month - 1;
  if (ref.day < statementDay) {
    lastStmtMonth0 -= 1;
    if (lastStmtMonth0 < 0) {
      lastStmtMonth0 = 11;
      lastStmtYear -= 1;
    }
  }
  const lastStatementDate = toISOFromUTC(lastStmtYear, lastStmtMonth0, statementDay);
  const nextStatementDate = addMonthsISO(lastStatementDate, 1);

  // If dueDay <= statementDay, due date belongs to the month AFTER statement closed
  const dueOffsetMonths = dueDay <= statementDay ? 1 : 0;
  let nextDueDate = toISOFromUTC(lastStmtYear, lastStmtMonth0 + dueOffsetMonths, dueDay);
  // If that due date has already passed AND statement due was already paid, look ahead to next cycle due date only if due is 0
  let totalCharges = 0;
  let totalPayments = 0;
  let rawUnbilledExpenses = 0;

  for (const tx of transactions) {
    if (tx.direction === 'out') {
      totalCharges += tx.amountMinor;
      if (tx.occurredAt > lastStatementDate) {
        rawUnbilledExpenses += tx.amountMinor;
      }
    } else {
      totalPayments += tx.amountMinor;
    }
  }

  const totalOutstandingMinor = Math.max(0, totalCharges - totalPayments);
  const statementDueMinor = Math.max(0, totalOutstandingMinor - rawUnbilledExpenses);
  const unbilledMinor = Math.min(rawUnbilledExpenses, totalOutstandingMinor);

  if (statementDueMinor === 0 && nextDueDate < referenceDate) {
    nextDueDate = addMonthsISO(nextDueDate, 1);
  }

  const daysUntilDue = daysBetweenISO(referenceDate, nextDueDate);
  const utilizationPct =
    creditLimitMinor > 0 ? Math.round((totalOutstandingMinor / creditLimitMinor) * 1000) / 10 : 0;

  return {
    lastStatementDate,
    nextStatementDate,
    nextDueDate,
    daysUntilDue,
    totalOutstandingMinor,
    statementDueMinor,
    unbilledMinor,
    utilizationPct,
    isBillOverdue: statementDueMinor > 0 && daysUntilDue < 0,
  };
}

export function estimateMonthlyEmiMinor(
  principalMinor: number,
  annualRateBps: number,
  tenureMonths: number,
): number {
  if (tenureMonths <= 0 || principalMinor <= 0) return 0;
  if (annualRateBps <= 0) return Math.round(principalMinor / tenureMonths);
  const r = annualRateBps / 10000 / 12;
  const factor = Math.pow(1 + r, tenureMonths);
  return Math.round((principalMinor * r * factor) / (factor - 1));
}

export function splitLoanPayment(params: {
  remainingPrincipalMinor: number;
  annualRateBps: number;
  paymentMinor: number;
}): { interestMinor: number; principalMinor: number; newRemainingMinor: number } {
  const { remainingPrincipalMinor, annualRateBps, paymentMinor } = params;
  const monthlyInterest = Math.round((remainingPrincipalMinor * (annualRateBps / 10000)) / 12);
  const interestMinor = Math.min(paymentMinor, monthlyInterest);
  const principalMinor = Math.min(remainingPrincipalMinor, Math.max(0, paymentMinor - interestMinor));
  const newRemainingMinor = Math.max(0, remainingPrincipalMinor - principalMinor);
  return { interestMinor, principalMinor, newRemainingMinor };
}

// Validation schemas at API boundaries
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format');

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  accountGroup: z.enum(ACCOUNT_GROUPS).optional(),
  scope: z.enum(SCOPES),
  institution: z.string().trim().max(80).default(''),
  last4: z.string().trim().regex(/^(\d{4})?$/, 'Last 4 digits must be 4 numbers').default(''),
  openingBalanceMinor: z.number().int().default(0),
  minBalanceMinor: z.number().int().min(0).default(0),
  creditLimitMinor: z.number().int().min(0).default(0),
  statementDay: z.number().int().min(1).max(28).default(15),
  dueDay: z.number().int().min(1).max(28).default(5),
});

export const updateAccountSchema = createAccountSchema.partial();

export const matchTransferSchema = z.object({
  sourceTxId: z.string().uuid(),
  destTxId: z.string().uuid(),
});

export const reconcilePayCardSchema = z.object({
  fromAccountId: z.string().uuid(),
  amountMinor: z.number().int().positive('Amount must be positive'),
  occurredAt: isoDateSchema,
  note: z.string().trim().max(240).optional(),
});

export const createTransactionSchema = z
  .object({
    kind: z.enum(TX_KINDS),
    scope: z.enum(SCOPES),
    accountId: z.string().uuid(),
    toAccountId: z.string().uuid().nullable().optional(),
    category: z.string().trim().min(1).max(50),
    amountMinor: z.number().int().positive('Amount must be greater than ₹0'),
    occurredAt: isoDateSchema,
    party: z.string().trim().max(80).default(''),
    note: z.string().trim().max(240).default(''),
  })
  .refine((d) => d.kind !== 'transfer' || (!!d.toAccountId && d.toAccountId !== d.accountId), {
    message: 'Transfer requires a different destination account',
    path: ['toAccountId'],
  });

export const updateTransactionSchema = createTransactionSchema;

export const createRecurringBillSchema = z.object({
  title: z.string().trim().min(1).max(80),
  scope: z.enum(SCOPES),
  kind: z.enum(['expense', 'income']).default('expense'),
  accountId: z.string().uuid(),
  category: z.string().trim().min(1).max(50),
  amountMinor: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(28),
  active: z.boolean().default(true),
  autoPost: z.boolean().default(false),
});

export const updateRecurringBillSchema = createRecurringBillSchema.partial();

export const createLoanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  counterparty: z.string().trim().min(1).max(80),
  scope: z.enum(SCOPES),
  direction: z.enum(LOAN_DIRECTIONS),
  principalMinor: z.number().int().positive(),
  remainingMinor: z.number().int().min(0).optional(),
  annualRateBps: z.number().int().min(0).max(10000).default(0),
  tenureMonths: z.number().int().min(1).max(480).default(12),
  emiMinor: z.number().int().min(0).default(0),
  startDate: isoDateSchema,
  nextDueDate: isoDateSchema,
  linkedAccountId: z.string().uuid().nullable().optional(),
});

export const updateLoanSchema = createLoanSchema.partial().extend({
  status: z.enum(['active', 'closed']).optional(),
});

export const payLoanSchema = z.object({
  amountMinor: z.number().int().positive(),
  accountId: z.string().uuid(),
  paidAt: isoDateSchema,
  note: z.string().trim().max(200).default(''),
});

export const createDueSchema = z.object({
  personName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).default(''),
  direction: z.enum(DUE_DIRECTIONS),
  scope: z.enum(SCOPES),
  amountMinor: z.number().int().positive(),
  dueDate: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(240).default(''),
});

export const updateDueSchema = createDueSchema.partial();

export const settleDueSchema = z.object({
  amountMinor: z.number().int().positive(),
  accountId: z.string().uuid().nullable().optional(),
  settledAt: isoDateSchema,
  note: z.string().trim().max(200).default(''),
});

export const SAFE_NOTE_ATTACHMENT_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const noteAttachmentInputSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(SAFE_NOTE_ATTACHMENT_MIMES),
  dataBase64: z.string().min(1).max(10_000_000),
  byteSize: z.number().int().min(0).max(8_000_000).optional(),
});

export const upsertNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(20000).default(''),
  scope: z.enum(NOTE_SCOPES).default('general'),
  color: z.enum(NOTE_COLORS).default('default'),
  tags: z.array(z.string().trim().min(1).max(30)).default([]),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  remindAt: z.string().nullable().optional(),
  linkedTxId: z.string().uuid().nullable().optional(),
  linkedDueId: z.string().uuid().nullable().optional(),
  linkedLoanId: z.string().uuid().nullable().optional(),
  linkedAccountId: z.string().uuid().nullable().optional(),
  checklist: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().trim().min(1).max(240),
        done: z.boolean().default(false),
      }),
    )
    .default([]),
});

export const bulkNoteActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['scope', 'color', 'tag', 'archive', 'unarchive', 'pin', 'unpin', 'delete']),
  scope: z.enum(NOTE_SCOPES).optional(),
  color: z.enum(NOTE_COLORS).optional(),
  tag: z.string().trim().min(1).max(30).optional(),
});

export const reorderNotesSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1),
});

export const upsertBudgetSchema = z.object({
  scope: z.enum(SCOPES),
  monthlyLimitMinor: z.number().int().positive(),
});

export const upsertCategoryBudgetSchema = z.object({
  scope: z.enum(SCOPES),
  category: z.string().trim().min(1).max(50),
  monthlyLimitMinor: z.number().int().positive(),
});

export const bulkTransactionActionSchema = z.object({
  action: z.enum(['delete', 'update']),
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: z
    .object({
      scope: z.enum(SCOPES).optional(),
      category: z.string().trim().min(1).max(50).optional(),
    })
    .optional(),
});

export const upsertVaultEntrySchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(40).default('General'),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  lastRotatedAt: isoDateSchema,
});

export const updateAlertSettingsSchema = z.object({
  recipientPhone: z.string().trim().max(24).default(''),
  quietStartHour: z.number().int().min(0).max(23).default(22),
  quietEndHour: z.number().int().min(0).max(23).default(8),
  morningDigestEnabled: z.boolean().default(false),
  morningDigestHour: z.number().int().min(0).max(23).default(9),
  twoWayCommandsEnabled: z.boolean().default(true),
  leadDaysCreditCard: z.number().int().min(0).max(15).default(3),
  leadDaysLoan: z.number().int().min(0).max(15).default(3),
  leadDaysDue: z.number().int().min(0).max(15).default(2),
  cardUtilizationThresholdPct: z.number().int().min(10).max(100).default(75),
  vaultRotationDays: z.number().int().min(30).max(730).default(180),
  enabledModules: z.object({
    credit_cards: z.boolean(),
    banks: z.boolean(),
    loans: z.boolean(),
    people_dues: z.boolean(),
    budgets: z.boolean(),
    notes: z.boolean(),
    vault: z.boolean(),
    advisor: z.boolean().default(true),
  }),
});

export const createSavingsGoalSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(GOAL_KINDS).default('goal'),
  scope: z.enum(SCOPES).default('personal'),
  targetMinor: z.number().int().positive('Target must be greater than ₹0'),
  currentMinor: z.number().int().min(0).default(0),
  targetDate: isoDateSchema.nullable().optional(),
  linkedAccountId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(200).default(''),
});

export const updateSavingsGoalSchema = createSavingsGoalSchema.partial();

export const contributeSavingsGoalSchema = z.object({
  amountMinor: z.number().int().positive('Contribution must be greater than ₹0'),
  accountId: z.string().uuid().nullable().optional(),
  occurredAt: isoDateSchema.optional(),
  recordAsExpense: z.boolean().default(false),
  note: z.string().trim().max(200).default(''),
});

export const createInvestmentSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(INVESTMENT_KINDS).default('mutual_fund'),
  scope: z.enum(SCOPES).default('personal'),
  investedMinor: z.number().int().min(0),
  currentValueMinor: z.number().int().min(0),
  unitsQty: z.number().min(0).default(0),
  maturityDate: isoDateSchema.nullable().optional(),
  sipDay: z.number().int().min(1).max(28).nullable().optional(),
  sipAmountMinor: z.number().int().min(0).default(0),
  note: z.string().trim().max(200).default(''),
});

export const updateInvestmentSchema = createInvestmentSchema.partial();

export const createCategoryRuleSchema = z.object({
  pattern: z.string().trim().min(1).max(80),
  matchType: z.enum(RULE_MATCH_TYPES).default('contains'),
  category: z.string().trim().min(1).max(50),
  scope: z.enum(SCOPES).nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  kind: z.enum(['expense', 'income']).nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(100),
});

export const updateCategoryRuleSchema = createCategoryRuleSchema.partial();

export const receiptAttachmentInputSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  mimeType: z.string().trim().regex(/^image\/(png|jpeg|jpg|webp|gif)$|^application\/pdf$/i),
  dataBase64: z.string().min(16).max(3_200_000),
});

export const splitExpenseSchema = z.object({
  participants: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  includeSelf: z.boolean().default(true),
  dueDate: isoDateSchema.nullable().optional(),
});
