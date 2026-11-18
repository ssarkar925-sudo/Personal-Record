import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';
import type { Scope, TxKind } from '../../../shared/ledger-core.ts';

export interface TreasuryMetrics {
  totalLiquidMinor: number;
  bankDepositMinor: number;
  walletCashMinor: number;
  bankCount: number;
  walletCount: number;
  totalCreditDebtMinor: number;
  debtCoverageRatioPct: number;
  netLiquidAfterCardDebtMinor: number;
  lowSafetyFloorCount: number;
  monthInflowMinor: number;
  monthOutflowMinor: number;
  monthNetFlowMinor: number;
}

export interface TreasuryDailyFlowPoint {
  date: string;
  shortLabel: string;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  txCount: number;
}

export interface TreasuryFlowSeriesResult {
  series: TreasuryDailyFlowPoint[];
  totalWindowInflowMinor: number;
  totalWindowOutflowMinor: number;
  netWindowFlowMinor: number;
  peakInflowDay: TreasuryDailyFlowPoint | null;
  peakOutflowDay: TreasuryDailyFlowPoint | null;
}

export interface AccountAllocationSlice {
  accountId: string;
  name: string;
  institution: string;
  accountGroup: string;
  balanceMinor: number;
  sharePct: number;
  colorHex: string;
}

export interface ParsedBankSmsResult {
  kind: Extract<TxKind, 'income' | 'expense'>;
  amountRupees: string;
  party: string;
  category: string;
  scope: Scope;
  accountId: string;
  occurredAt: string;
  note: string;
}

const ALLOCATION_PALETTE = [
  '#059669', // Forest Emerald
  '#111318', // Obsidian Ink
  '#C59B27', // Champagne Gold
  '#0D9488', // Deep Teal
  '#4F46E5', // Royal Indigo
  '#D97706', // Warm Amber
];

export function computeTreasuryMetrics(
  liquidAccounts: AccountRecord[],
  creditCards: AccountRecord[],
  transactions: TransactionRecord[],
  todayStr: string,
): TreasuryMetrics {
  let totalLiquidMinor = 0;
  let bankDepositMinor = 0;
  let walletCashMinor = 0;
  let bankCount = 0;
  let walletCount = 0;
  let lowSafetyFloorCount = 0;

  const liquidIds = new Set<string>();

  for (const acc of liquidAccounts) {
    if (acc.accountGroup === 'credit_card') continue;
    liquidIds.add(acc.id);
    const bal = acc.currentBalanceMinor || 0;
    totalLiquidMinor += bal;

    if (acc.accountGroup === 'bank') {
      bankDepositMinor += bal;
      bankCount += 1;
    } else {
      walletCashMinor += bal;
      walletCount += 1;
    }

    const floor = acc.minBalanceMinor && acc.minBalanceMinor > 0 ? acc.minBalanceMinor : 2500000; // ₹25,000 default floor for banks, ₹5,000 for cash
    const effectiveFloor = acc.accountGroup === 'bank' ? floor : Math.min(floor, 500000);
    if (bal < effectiveFloor) {
      lowSafetyFloorCount += 1;
    }
  }

  const totalCreditDebtMinor = creditCards.reduce(
    (sum, c) => sum + Math.abs(c.currentBalanceMinor || 0),
    0,
  );

  const debtCoverageRatioPct =
    totalCreditDebtMinor === 0
      ? 100
      : Math.min(999, Math.round((Math.max(0, totalLiquidMinor) / totalCreditDebtMinor) * 100));

  const netLiquidAfterCardDebtMinor = totalLiquidMinor - totalCreditDebtMinor;

  const monthPrefix = (todayStr || '').slice(0, 7);
  let monthInflowMinor = 0;
  let monthOutflowMinor = 0;

  for (const tx of transactions) {
    if (!tx.occurredAt || !tx.occurredAt.startsWith(monthPrefix)) continue;
    const touchesSource = liquidIds.has(tx.accountId);
    const touchesDest = Boolean(tx.toAccountId && liquidIds.has(tx.toAccountId));

    if (tx.kind === 'income' && touchesSource) {
      monthInflowMinor += tx.amountMinor;
    } else if (tx.kind === 'expense' && touchesSource) {
      monthOutflowMinor += tx.amountMinor;
    } else if (tx.kind === 'transfer') {
      if (touchesSource && !touchesDest) {
        monthOutflowMinor += tx.amountMinor;
      } else if (!touchesSource && touchesDest) {
        monthInflowMinor += tx.amountMinor;
      }
    }
  }

  return {
    totalLiquidMinor,
    bankDepositMinor,
    walletCashMinor,
    bankCount,
    walletCount,
    totalCreditDebtMinor,
    debtCoverageRatioPct,
    netLiquidAfterCardDebtMinor,
    lowSafetyFloorCount,
    monthInflowMinor,
    monthOutflowMinor,
    monthNetFlowMinor: monthInflowMinor - monthOutflowMinor,
  };
}

function formatShortDateLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
  const day = parseInt(parts[2], 10);
  return `${day} ${months[mIdx]}`;
}

export function buildTreasuryFlowSeries(
  transactions: TransactionRecord[],
  liquidAccountIds: Set<string>,
  referenceDateStr: string,
  days = 14,
): TreasuryFlowSeriesResult {
  const safeDays = Math.max(2, Math.min(60, days));
  const refDate = new Date(`${referenceDateStr}T00:00:00Z`);
  const validRef = isNaN(refDate.getTime()) ? new Date() : refDate;

  const dayMap = new Map<string, TreasuryDailyFlowPoint>();
  const series: TreasuryDailyFlowPoint[] = [];

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(validRef.getTime() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const pt: TreasuryDailyFlowPoint = {
      date: iso,
      shortLabel: formatShortDateLabel(iso),
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
      txCount: 0,
    };
    dayMap.set(iso, pt);
    series.push(pt);
  }

  for (const tx of transactions) {
    const pt = dayMap.get(tx.occurredAt);
    if (!pt) continue;

    const isSource = liquidAccountIds.has(tx.accountId);
    const isDest = Boolean(tx.toAccountId && liquidAccountIds.has(tx.toAccountId));
    if (!isSource && !isDest) continue;

    if (tx.kind === 'income' && isSource) {
      pt.inflowMinor += tx.amountMinor;
      pt.txCount += 1;
    } else if (tx.kind === 'expense' && isSource) {
      pt.outflowMinor += tx.amountMinor;
      pt.txCount += 1;
    } else if (tx.kind === 'transfer') {
      if (isSource && !isDest) {
        pt.outflowMinor += tx.amountMinor;
        pt.txCount += 1;
      } else if (!isSource && isDest) {
        pt.inflowMinor += tx.amountMinor;
        pt.txCount += 1;
      } else if (isSource && isDest && liquidAccountIds.size === 1) {
        pt.txCount += 1;
      }
    }
    pt.netMinor = pt.inflowMinor - pt.outflowMinor;
  }

  let totalWindowInflowMinor = 0;
  let totalWindowOutflowMinor = 0;
  let peakInflowDay: TreasuryDailyFlowPoint | null = null;
  let peakOutflowDay: TreasuryDailyFlowPoint | null = null;

  for (const pt of series) {
    totalWindowInflowMinor += pt.inflowMinor;
    totalWindowOutflowMinor += pt.outflowMinor;
    if (!peakInflowDay || pt.inflowMinor > peakInflowDay.inflowMinor) {
      peakInflowDay = pt;
    }
    if (!peakOutflowDay || pt.outflowMinor > peakOutflowDay.outflowMinor) {
      peakOutflowDay = pt;
    }
  }

  return {
    series,
    totalWindowInflowMinor,
    totalWindowOutflowMinor,
    netWindowFlowMinor: totalWindowInflowMinor - totalWindowOutflowMinor,
    peakInflowDay,
    peakOutflowDay,
  };
}

export function computeAccountAllocationMix(
  liquidAccounts: AccountRecord[],
): AccountAllocationSlice[] {
  const positiveAccounts = liquidAccounts
    .filter((a) => a.accountGroup !== 'credit_card')
    .map((a) => ({
      ...a,
      safeBal: Math.max(0, a.currentBalanceMinor || 0),
    }))
    .sort((a, b) => b.safeBal - a.safeBal);

  const totalPositive = positiveAccounts.reduce((s, a) => s + a.safeBal, 0) || 1;

  return positiveAccounts.map((acc, idx) => ({
    accountId: acc.id,
    name: acc.name,
    institution: acc.institution || (acc.accountGroup === 'bank' ? 'Bank Deposit' : 'Cash / UPI'),
    accountGroup: acc.accountGroup || 'bank',
    balanceMinor: acc.currentBalanceMinor || 0,
    sharePct: Math.max(1, Math.round((acc.safeBal / totalPositive) * 100)),
    colorHex: ALLOCATION_PALETTE[idx % ALLOCATION_PALETTE.length],
  }));
}

/**
 * Parses an Indian Bank / UPI / NEFT / RTGS SMS alert into a structured passbook entry.
 */
export function parseBankUpiSms(
  rawSms: string,
  liquidAccounts: AccountRecord[],
  defaultDateStr: string,
): ParsedBankSmsResult | null {
  const text = rawSms.trim();
  if (!text) return null;

  // 1. Extract amount (Rs., INR, ₹)
  const amtMatch = text.match(/(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (!amtMatch) return null;
  const cleanAmt = amtMatch[1].replace(/,/g, '');
  const numericAmt = parseFloat(cleanAmt);
  if (!Number.isFinite(numericAmt) || numericAmt <= 0) return null;

  // 2. Detect Inflow (credited / received / deposited) vs Outflow (debited / sent / paid / spent)
  const isCredit = /\b(?:credited|received|deposited|cr|inward|refund)\b/i.test(text);
  const isDebit = /\b(?:debited|sent|paid|dr|withdrawn|deducted|spent)\b/i.test(text);
  const kind: Extract<TxKind, 'income' | 'expense'> = isCredit && !isDebit ? 'income' : 'expense';

  // 3. Match account by last 4 digits (e.g. XX5521, *4821, A/c 9321) or institution name
  let matchedAccount: AccountRecord | undefined;
  const last4Match = text.match(/(?:a\/c|acct|account|xx+|\*+)\s*(?:no\.?\s*)?(?:xx+|\*+)?([0-9]{4})\b/i);
  if (last4Match) {
    const digits = last4Match[1];
    matchedAccount = liquidAccounts.find((a) => a.last4 === digits);
  }
  if (!matchedAccount) {
    matchedAccount = liquidAccounts.find((a) => {
      const inst = (a.institution || '').toLowerCase();
      const name = a.name.toLowerCase();
      const lower = text.toLowerCase();
      return (inst && lower.includes(inst)) || lower.includes(name);
    });
  }
  const fallbackAccount = matchedAccount || liquidAccounts[0];

  // 4. Extract Counterparty / Merchant (after "to", "from", "at", "by", "VPA")
  let party = '';
  const vpaMatch = text.match(/\b([a-zA-Z0-9._-]+@[a-zA-Z]+)\b/);
  const partyRegex =
    kind === 'income'
      ? /\b(?:from|by)\s+(?:(?:neft|rtgs|imps|upi)\s+(?:from|by)\s+)?([A-Za-z0-9][A-Za-z0-9\s.&_-]{2,28}?)(?:\s+(?:on|via|ref|utr|imps|neft|rtgs|upi|avl|bal)|\.|,|$)/i
      : /\b(?:to|at|towards)\s+(?:(?:neft|rtgs|imps|upi)\s+(?:to|at)\s+)?([A-Za-z0-9][A-Za-z0-9\s.&_-]{2,28}?)(?:\s+(?:on|via|ref|utr|imps|neft|rtgs|upi|avl|bal)|\.|,|$)/i;
  const partyMatch = text.match(partyRegex);
  if (partyMatch && !/^(?:a\/c|acct|your|bank)/i.test(partyMatch[1].trim())) {
    party = partyMatch[1].trim();
  } else if (vpaMatch) {
    party = vpaMatch[1];
  } else {
    party = kind === 'income' ? 'NEFT / RTGS Remittance' : 'UPI / Bank Payout';
  }

  // 5. Infer Category & Scope (defaults to Business)
  const lower = text.toLowerCase();
  let category = kind === 'income' ? 'Sales / Revenue' : 'Inventory / Supplies';
  let scope: Scope = fallbackAccount?.scope ?? 'business';

  if (kind === 'income') {
    if (lower.includes('dividend') || lower.includes('interest')) {
      category = 'Interest / Returns';
    } else if (lower.includes('retainer') || lower.includes('consulting')) {
      category = 'Consulting / Services';
    }
  } else {
    if (lower.includes('gst') || lower.includes('tax') || lower.includes('challan')) {
      category = 'Taxes & Compliance';
    } else if (lower.includes('salary') || lower.includes('payroll')) {
      category = 'Payroll & Contractors';
    } else if (lower.includes('aws') || lower.includes('cloud') || lower.includes('google')) {
      category = 'Software & SaaS';
    } else if (lower.includes('bluedart') || lower.includes('delhivery') || lower.includes('logistics')) {
      category = 'Logistics & Courier';
    } else if (lower.includes('blinkit') || lower.includes('grocery')) {
      category = 'Groceries';
      scope = 'family';
    }
  }

  return {
    kind,
    amountRupees: numericAmt.toFixed(2),
    party,
    category,
    scope,
    accountId: fallbackAccount?.id || '',
    occurredAt: defaultDateStr,
    note: 'Auto-parsed from Bank / UPI SMS',
  };
}
