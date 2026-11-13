import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  type Scope,
  type TxKind,
  daysBetweenISO,
  parseISODate,
  rupeesToPaise,
  todayISO,
} from '../../shared/ledger-core.ts';
import { type AccountRecord, listAccounts } from '../db/accounts-repo.ts';
import {
  type CategoryRuleRecord,
  type SavingsGoalRecord,
  type TransactionRecord,
  listLoans,
  listRecurringBills,
  listSavingsGoals,
  listTransactions,
  matchCategoryRule,
} from '../db/ledger-repo.ts';
import { getDashboardSummary } from '../db/reports-repo.ts';

export function inferCategoryFromMerchant(text: string, kind: 'income' | 'expense'): string {
  const low = text.toLowerCase();
  if (kind === 'income') {
    if (/(salary|payroll|stipend|wages|bonus)/.test(low)) return 'Salary';
    if (/(refund|cashback|reversal)/.test(low)) return 'Refund / Cashback';
    if (/(dividend|interest|fd|mutual)/.test(low)) return 'Investment Income';
    if (/(invoice|client|consulting|freelance|settlement|payout|razorpay|stripe)/.test(low)) {
      return 'Business Revenue';
    }
    return 'Income';
  }
  if (/(swiggy|zomato|eatsure|blinkit|zepto|instamart|restaurant|cafe|coffee|pizza|biryani|bakery|dining|hotel)/.test(low)) {
    return 'Food & Dining';
  }
  if (/(netflix|spotify|prime|hotstar|youtube|apple|icloud|google one|adobe|chatgpt|openai|notion|figma|saas|subscription)/.test(low)) {
    return 'Subscriptions';
  }
  if (/(uber|ola|rapido|irctc|indigo|air india|vistara|petrol|diesel|fuel|hpcl|bpcl|iocl|fastag|metro|toll)/.test(low)) {
    return 'Travel & Fuel';
  }
  if (/(amazon|flipkart|myntra|ajio|nykaa|meesho|croma|reliance digital|dmart|bigbasket|grocery|supermarket)/.test(low)) {
    return 'Shopping & Groceries';
  }
  if (/(airtel|jio|vi\b|bsnl|electricity|bescom|cesc|tata power|water|gas|broadband|fiber|recharge|billdesk)/.test(low)) {
    return 'Utilities & Telecom';
  }
  if (/(apollo|pharmeasy|1mg|medplus|hospital|clinic|pharmacy|health|diagnostic)/.test(low)) {
    return 'Medical & Health';
  }
  if (/(rent|landlord|nobroker|society|maintenance|hoa)/.test(low)) {
    return 'Rent & Housing';
  }
  if (/(tax|gst|tds|challan|income tax)/.test(low)) {
    return 'Taxes';
  }
  return 'General';
}

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function tryParseFlexibleDateISO(raw: string, fallbackISO: string): string {
  const isoMatch = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    try {
      parseISODate(candidate);
      return candidate;
    } catch {
      // ignore invalid
    }
  }

  const dmyMatch = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/]((?:20)?\d{2})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    const candidate = `${year}-${month}-${day}`;
    try {
      parseISODate(candidate);
      return candidate;
    } catch {
      // ignore invalid
    }
  }

  const dMonYMatch = raw.match(/\b(\d{1,2})[-\s/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s/,]*(20\d{2}|\d{2})\b/i);
  if (dMonYMatch) {
    const day = dMonYMatch[1].padStart(2, '0');
    const month = MONTH_MAP[dMonYMatch[2].slice(0, 3).toLowerCase()];
    const year = dMonYMatch[3].length === 2 ? `20${dMonYMatch[3]}` : dMonYMatch[3];
    if (month) {
      const candidate = `${year}-${month}-${day}`;
      try {
        parseISODate(candidate);
        return candidate;
      } catch {
        // ignore invalid
      }
    }
  }

  return fallbackISO;
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

function splitCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function detectDuplicate(
  existing: TransactionRecord[],
  cand: { kind: TxKind; amountMinor: number; occurredAt: string; party: string },
): boolean {
  const normParty = cand.party.trim().toLowerCase();
  return existing.some((tx) => {
    if (tx.kind !== cand.kind || tx.amountMinor !== cand.amountMinor) return false;
    const dayDiff = Math.abs(daysBetweenISO(tx.occurredAt, cand.occurredAt));
    if (dayDiff === 0) return true;
    if (dayDiff <= 1 && normParty && tx.party.toLowerCase().includes(normParty.slice(0, 6))) return true;
    return false;
  });
}

function resolveAccountFromHint(
  text: string,
  accounts: AccountRecord[],
  defaultAccountId?: string,
): AccountRecord | undefined {
  const low = text.toLowerCase();
  const last4Match = text.match(/(?:a\/c|ac|acct|card|xx|\*\*|x+)[\s:-]*[*xX-]*(\d{4})\b/i);
  if (last4Match) {
    const byLast4 = accounts.find((a) => a.last4 === last4Match[1]);
    if (byLast4) return byLast4;
  }
  const byName = accounts.find(
    (a) => low.includes(a.name.toLowerCase()) || (a.institution && low.includes(a.institution.toLowerCase())),
  );
  if (byName) return byName;
  if (defaultAccountId) {
    const chosen = accounts.find((a) => a.id === defaultAccountId);
    if (chosen) return chosen;
  }
  return accounts[0];
}

export function parseStatementInput(params: {
  rawText: string;
  accounts: AccountRecord[];
  existingTransactions: TransactionRecord[];
  categoryRules?: CategoryRuleRecord[];
  defaultAccountId?: string;
  defaultScope?: Scope;
  fallbackDate?: string;
}): ParsedImportCandidate[] {
  const fallbackDate = params.fallbackDate ?? todayISO();
  const lines = params.rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || params.accounts.length === 0) return [];

  const results: ParsedImportCandidate[] = [];
  const defaultScope: Scope = params.defaultScope ?? 'personal';

  // Detect CSV table mode
  const firstCols = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasDateCol = firstCols.some((c) => /date|txn/.test(c));
  const hasAmountOrDrCr = firstCols.some((c) => /amount|debit|withdrawal|credit|deposit|value/.test(c));

  if (lines.length >= 2 && firstCols.length >= 3 && hasDateCol && hasAmountOrDrCr) {
    const dateIdx = firstCols.findIndex((c) => /date/.test(c));
    const descIdx = firstCols.findIndex((c) => /(desc|narration|particular|merchant|remark|details|party)/.test(c));
    const debitIdx = firstCols.findIndex((c) => /(debit|withdrawal|dr\b|spent)/.test(c));
    const creditIdx = firstCols.findIndex((c) => /(credit|deposit|cr\b)/.test(c));
    const amtIdx = firstCols.findIndex((c) => /^amount|amt/.test(c));
    const typeIdx = firstCols.findIndex((c) => /(type|dr\/cr|cr\/dr|drcr)/.test(c));

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      if (cols.length < 2) continue;
      const dateRaw = dateIdx >= 0 ? cols[dateIdx] ?? '' : lines[i];
      const occurredAt = tryParseFlexibleDateISO(dateRaw, fallbackDate);
      const desc = descIdx >= 0 ? cols[descIdx] ?? '' : cols.slice(1, 3).join(' ');

      let kind: 'income' | 'expense' = 'expense';
      let amountMinor = 0;

      const parseNum = (s: string | undefined): number => {
        if (!s) return 0;
        const cleaned = s.replace(/[₹$,\s]|INR|Rs\.?/gi, '').trim();
        if (!cleaned || cleaned === '-' || cleaned === '0') return 0;
        try {
          return Math.abs(rupeesToPaise(cleaned));
        } catch {
          return 0;
        }
      };

      const debitVal = debitIdx >= 0 ? parseNum(cols[debitIdx]) : 0;
      const creditVal = creditIdx >= 0 ? parseNum(cols[creditIdx]) : 0;
      if (debitVal > 0) {
        kind = 'expense';
        amountMinor = debitVal;
      } else if (creditVal > 0) {
        kind = 'income';
        amountMinor = creditVal;
      } else if (amtIdx >= 0) {
        const rawAmtStr = cols[amtIdx] ?? '';
        const parsed = parseNum(rawAmtStr);
        if (parsed > 0) {
          const typeVal = typeIdx >= 0 ? (cols[typeIdx] ?? '').toLowerCase() : rawAmtStr.toLowerCase();
          kind = /(cr\b|credit|income|deposit|\+)/.test(typeVal) ? 'income' : 'expense';
          amountMinor = parsed;
        }
      }

      if (amountMinor <= 0) continue;
      let acc = resolveAccountFromHint(lines[i], params.accounts, params.defaultAccountId) ?? params.accounts[0];
      const party = desc.replace(/UPI\/|IMPS\/|NEFT\//gi, '').trim().slice(0, 60) || 'Imported Entry';
      const ruleHit = params.categoryRules ? matchCategoryRule(params.categoryRules, `${party} ${desc}`, kind) : null;
      if (ruleHit?.accountId) {
        acc = params.accounts.find((a) => a.id === ruleHit.accountId) ?? acc;
      }
      const scope = ruleHit?.scope ?? acc.scope ?? defaultScope;
      const category = ruleHit?.category ?? inferCategoryFromMerchant(desc, kind);
      results.push({
        id: `csv-${i}`,
        source: 'csv',
        kind,
        scope,
        accountId: acc.id,
        accountName: acc.name,
        category,
        amountMinor,
        occurredAt,
        party,
        note: `CSV import (${desc.slice(0, 80)})`,
        isDuplicate: detectDuplicate(params.existingTransactions, { kind, amountMinor, occurredAt, party }),
        confidence: 'high',
      });
    }
    return results;
  }

  // Stitch wrapped bank-statement lines (e.g. PDF row where date+narration is followed by amounts on next line)
  const rawLines: string[] = [];
  const startsWithDateRe = /^(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2}|\d{1,2}[-\s/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s/,]*(?:20)?\d{2})\b/i;
  const hasMoneyTokenRe = /(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d{1,2})?|\b[\d,]+\.\d{2}\b/i;

  for (const l of lines) {
    if (
      rawLines.length > 0 &&
      !startsWithDateRe.test(l) &&
      startsWithDateRe.test(rawLines[rawLines.length - 1]) &&
      !hasMoneyTokenRe.test(rawLines[rawLines.length - 1]) &&
      hasMoneyTokenRe.test(l)
    ) {
      rawLines[rawLines.length - 1] = `${rawLines[rawLines.length - 1]} ${l}`;
    } else {
      rawLines.push(l);
    }
  }

  // Otherwise parse multi-line bank/UPI/card SMS messages or PDF statement rows
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const low = line.toLowerCase();
    if (/^(?:date\s+(?:narration|particulars|description)|opening balance|closing balance|brought forward|statement of|page \d+ of \d+)/i.test(low)) {
      continue;
    }

    const isStatementRow = startsWithDateRe.test(line);
    let amountMinor = 0;

    if (isStatementRow) {
      // Bank PDF rows typically have [narration] [txn amount] [running balance] at the right end.
      const decimalMatches = Array.from(line.matchAll(/(?:(?:INR|Rs\.?|₹)\s*)?([\d,]+\.\d{2})\b/gi));
      let chosenToken: string | null = null;
      if (decimalMatches.length >= 2) {
        // Pick the transaction amount column right before the trailing running balance column
        chosenToken = decimalMatches[decimalMatches.length - 2][1];
      } else if (decimalMatches.length === 1) {
        chosenToken = decimalMatches[0][1];
      } else {
        const currMatch = line.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
        chosenToken = currMatch?.[1] ?? null;
      }
      if (!chosenToken) continue;
      try {
        amountMinor = rupeesToPaise(chosenToken);
      } catch {
        continue;
      }
    } else {
      const amtMatch = line.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? line.match(/\b([\d,]+\.\d{2})\b/);
      if (!amtMatch) continue;
      try {
        amountMinor = rupeesToPaise(amtMatch[1]);
      } catch {
        continue;
      }
    }
    if (amountMinor <= 0) continue;

    const isCredit = /(credited|received|deposited|refunded|reversal|cashback|\bcr\b)/i.test(low) && !/credit\s*card\s*spent/.test(low);
    const isDebit = /(debited|spent|paid|withdrawn|wdl|sent|deducted|\bdr\b|purchase)/i.test(low);
    const kind: 'income' | 'expense' = isCredit && !isDebit ? 'income' : 'expense';

    const occurredAt = tryParseFlexibleDateISO(line, fallbackDate);
    let acc = resolveAccountFromHint(line, params.accounts, params.defaultAccountId) ?? params.accounts[0];

    let party = '';
    const smsPartyMatch =
      line.match(/\b(?:at|to|from|towards|merchant|vpa)\s+([A-Za-z0-9 &._@-]{2,40}?)(?=\s+(?:on|via|ref|upi|avbl|avl|bal|using|for)\b|[.,;]|$)/i) ??
      line.match(/info:\s*([A-Za-z0-9 &._@-]{2,40})/i);
    if (smsPartyMatch?.[1]) {
      party = smsPartyMatch[1];
    } else if (isStatementRow) {
      // Strip leading date(s), trailing money/balance columns & Cr/Dr tokens to isolate narration merchant
      party = line
        .replace(startsWithDateRe, '')
        .replace(/(?:(?:INR|Rs\.?|₹)\s*)?[\d,]+\.\d{2}(?:\s*(?:cr|dr))?/gi, '')
        .replace(/\b(?:cr|dr|upi|imps|neft|rtgs|pos)\b/gi, ' ')
        .replace(/[-/]+/g, ' ')
        .replace(/\b\d{5,}\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    party = (party || 'Bank Statement Entry').trim().slice(0, 60);

    const ruleHit = params.categoryRules ? matchCategoryRule(params.categoryRules, `${party} ${line}`, kind) : null;
    if (ruleHit?.accountId) {
      acc = params.accounts.find((a) => a.id === ruleHit.accountId) ?? acc;
    }
    const category = ruleHit?.category ?? inferCategoryFromMerchant(`${party} ${line}`, kind);

    results.push({
      id: `sms-${i}`,
      source: 'sms',
      kind,
      scope: ruleHit?.scope ?? acc.scope ?? defaultScope,
      accountId: acc.id,
      accountName: acc.name,
      category,
      amountMinor,
      occurredAt,
      party,
      note: `${isStatementRow ? 'Statement import' : 'SMS import'}: ${line.slice(0, 90)}`,
      isDuplicate: detectDuplicate(params.existingTransactions, { kind, amountMinor, occurredAt, party }),
      confidence: isDebit || isCredit || isStatementRow ? 'high' : 'medium',
    });
  }

  return results;
}

// 2. Recurring & Subscription Leak Detector
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

function normalizeMerchantKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(upi|imps|neft|pos|payment|bill|autopay)\b/g, ' ')
    .replace(/[^a-z\u0980-\u09FF\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectRecurringLeaks(db: DatabaseSync): RecurringLeakCandidate[] {
  const expenses = listTransactions(db, { kind: 'expense', limit: 3000 });
  const activeBills = listRecurringBills(db).filter((b) => b.active);

  const groups = new Map<string, TransactionRecord[]>();
  for (const tx of expenses) {
    if (tx.sourceRef?.startsWith('recurring:')) continue;
    const baseLabel = tx.party.trim() || tx.category;
    const keyPart = normalizeMerchantKey(baseLabel);
    if (!keyPart || keyPart === 'general' || keyPart.length < 3) continue;
    const key = `${tx.scope}::${keyPart}`;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const leaks: RecurringLeakCandidate[] = [];
  for (const [key, list] of groups.entries()) {
    const months = new Set(list.map((t) => t.occurredAt.slice(0, 7)));
    if (months.size < 2 || list.length < 2) continue;

    // Sort chronological ascending
    const sorted = list.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const latest = sorted[sorted.length - 1];
    const prior = sorted.slice(0, -1);
    const avgPrior = Math.round(prior.reduce((s, t) => s + t.amountMinor, 0) / prior.length);
    const avgAll = Math.round(sorted.reduce((s, t) => s + t.amountMinor, 0) / sorted.length);
    const priceHikePct = avgPrior > 0 ? Math.round(((latest.amountMinor - avgPrior) / avgPrior) * 100) : 0;
    const isPriceHike = priceHikePct >= 15 && latest.amountMinor - avgPrior >= 5000;

    // Skip if already tracked by an active recurring bill in the same scope
    const normTitle = key.split('::')[1];
    const alreadyTracked = activeBills.some((b) => {
      if (b.scope !== latest.scope) return false;
      const bNorm = normalizeMerchantKey(b.title);
      return bNorm && (bNorm.includes(normTitle) || normTitle.includes(bNorm));
    });
    if (alreadyTracked) continue;

    // Require somewhat consistent amounts (or explicit subscription category)
    const maxAmt = Math.max(...sorted.map((s) => s.amountMinor));
    const minAmt = Math.min(...sorted.map((s) => s.amountMinor));
    const isSubCategory = /sub|ott|utility|telecom|internet|rent|gym|insurance|emi|sip/i.test(
      `${latest.category} ${latest.party}`,
    );
    if (!isSubCategory && minAmt > 0 && maxAmt / minAmt > 2.2) continue;

    const title = (latest.party.trim() || latest.category).slice(0, 60);
    const dueDay = Math.min(28, Math.max(1, Number(latest.occurredAt.slice(8, 10)) || 1));

    leaks.push({
      id: `leak-${key.replace(/\s+/g, '-')}`,
      title,
      scope: latest.scope,
      accountId: latest.accountId,
      accountName: latest.accountName,
      category: latest.category,
      avgAmountMinor: avgAll,
      latestAmountMinor: latest.amountMinor,
      occurrences: sorted.length,
      distinctMonths: months.size,
      suggestedDueDay: dueDay,
      lastDate: latest.occurredAt,
      priceHikePct,
      isPriceHike,
    });
  }

  return leaks.sort((a, b) => b.latestAmountMinor - a.latestAmountMinor);
}

// 3. Debt Avalanche / Snowball Payoff Planner
export interface DebtItemPlan {
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
  items: DebtItemPlan[];
}

interface SimDebt {
  id: string;
  name: string;
  kind: 'loan' | 'credit_card';
  scope: Scope;
  balance: number;
  aprBps: number;
  minPay: number;
  paidOffMonthBaseline: number;
  paidOffMonthPlan: number;
}

function simulateSchedule(
  debts: SimDebt[],
  extraMonthlyMinor: number,
  sortMode: 'baseline' | 'avalanche' | 'snowball',
): { totalMonths: number; totalInterest: number; payoffMonths: Map<string, number> } {
  const active = debts.map((d) => ({ ...d, bal: d.balance }));
  const payoffMonths = new Map<string, number>();
  let totalInterest = 0;
  let month = 0;
  const MAX_MONTHS = 360;

  while (active.some((d) => d.bal > 0) && month < MAX_MONTHS) {
    month++;
    // Accrue monthly interest
    for (const d of active) {
      if (d.bal <= 0) continue;
      const interest = Math.round((d.bal * (d.aprBps / 10000)) / 12);
      d.bal += interest;
      totalInterest += interest;
    }

    // Pay minimum on all active debts (and roll over freed minimums only in avalanche/snowball)
    let pool = sortMode === 'baseline' ? 0 : Math.max(0, extraMonthlyMinor);
    for (const d of active) {
      if (d.bal <= 0) {
        if (sortMode !== 'baseline') pool += d.minPay;
        continue;
      }
      const interestApprox = Math.round((d.bal * (d.aprBps / 10000)) / 12);
      const safeMin = Math.max(d.minPay, Math.min(d.bal, interestApprox + 100));
      const pay = Math.min(d.bal, safeMin);
      d.bal -= pay;
      if (d.bal === 0 && !payoffMonths.has(d.id)) {
        payoffMonths.set(d.id, month);
        if (sortMode !== 'baseline') pool += Math.max(0, safeMin - pay);
      }
    }

    // Apply extra pool by priority
    if (pool > 0) {
      const remaining = active.filter((d) => d.bal > 0);
      remaining.sort((a, b) => {
        if (sortMode === 'avalanche') {
          if (b.aprBps !== a.aprBps) return b.aprBps - a.aprBps;
          return a.bal - b.bal;
        }
        if (a.bal !== b.bal) return a.bal - b.bal;
        return b.aprBps - a.aprBps;
      });
      for (const target of remaining) {
        if (pool <= 0) break;
        const pay = Math.min(target.bal, pool);
        target.bal -= pay;
        pool -= pay;
        if (target.bal === 0 && !payoffMonths.has(target.id)) {
          payoffMonths.set(target.id, month);
        }
      }
    }
  }

  for (const d of active) {
    if (!payoffMonths.has(d.id)) payoffMonths.set(d.id, month);
  }
  return { totalMonths: month, totalInterest, payoffMonths };
}

export function computeDebtPayoffPlan(
  db: DatabaseSync,
  opts: { extraMonthlyMinor?: number; strategy?: 'avalanche' | 'snowball'; assumedCardAprBps?: number } = {},
): DebtPayoffResult {
  const strategy = opts.strategy ?? 'avalanche';
  const extraMonthlyMinor = Math.max(0, Math.round(opts.extraMonthlyMinor ?? 0));
  const cardAprBps = opts.assumedCardAprBps ?? 3600; // 36% typical Indian revolving card APR

  const accounts = listAccounts(db);
  const loans = listLoans(db).filter((l) => l.status === 'active' && l.direction === 'borrowed' && l.remainingMinor > 0);

  const debts: SimDebt[] = [];
  for (const c of accounts) {
    const out = c.cardCycle?.totalOutstandingMinor ?? 0;
    if (c.type === 'credit_card' && out > 0) {
      const minPay = Math.min(out, Math.max(100_000, Math.round(out * 0.05))); // 5% or ₹1,000 min
      debts.push({
        id: c.id,
        name: c.name,
        kind: 'credit_card',
        scope: c.scope,
        balance: out,
        aprBps: cardAprBps,
        minPay,
        paidOffMonthBaseline: 0,
        paidOffMonthPlan: 0,
      });
    }
  }
  for (const l of loans) {
    const minPay = l.emiMinor > 0 ? l.emiMinor : Math.max(100_000, Math.round(l.remainingMinor / Math.max(1, l.tenureMonths)));
    debts.push({
      id: l.id,
      name: l.name,
      kind: 'loan',
      scope: l.scope,
      balance: l.remainingMinor,
      aprBps: l.annualRateBps,
      minPay,
      paidOffMonthBaseline: 0,
      paidOffMonthPlan: 0,
    });
  }

  const totalDebtMinor = debts.reduce((s, d) => s + d.balance, 0);
  if (debts.length === 0) {
    return {
      strategy,
      extraMonthlyMinor,
      totalDebtMinor: 0,
      baselineMonths: 0,
      planMonths: 0,
      monthsSaved: 0,
      baselineInterestMinor: 0,
      planInterestMinor: 0,
      interestSavedMinor: 0,
      items: [],
    };
  }

  const base = simulateSchedule(debts, 0, 'baseline');
  const plan = simulateSchedule(debts, extraMonthlyMinor, strategy);

  const ordered = debts.slice().sort((a, b) => {
    if (strategy === 'avalanche') {
      if (b.aprBps !== a.aprBps) return b.aprBps - a.aprBps;
      return a.balance - b.balance;
    }
    if (a.balance !== b.balance) return a.balance - b.balance;
    return b.aprBps - a.aprBps;
  });

  const items: DebtItemPlan[] = ordered.map((d, idx) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    scope: d.scope,
    balanceMinor: d.balance,
    aprBps: d.aprBps,
    monthlyMinMinor: d.minPay,
    payoffOrder: idx + 1,
    baselineMonths: base.payoffMonths.get(d.id) ?? base.totalMonths,
    planMonths: plan.payoffMonths.get(d.id) ?? plan.totalMonths,
  }));

  return {
    strategy,
    extraMonthlyMinor,
    totalDebtMinor,
    baselineMonths: base.totalMonths,
    planMonths: plan.totalMonths,
    monthsSaved: Math.max(0, base.totalMonths - plan.totalMonths),
    baselineInterestMinor: base.totalInterest,
    planInterestMinor: plan.totalInterest,
    interestSavedMinor: Math.max(0, base.totalInterest - plan.totalInterest),
    items,
  };
}

// 4. Savings Goals, Tax Reserve & Emergency Runway Summary
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

export function summarizeGoalsAndRunway(db: DatabaseSync, refDate: string = todayISO()): GoalsSummary {
  const dash = getDashboardSummary(db, undefined, refDate);
  const rawGoals = listSavingsGoals(db);
  const pastNonZero = dash.sixMonthTrend.slice(0, -1).filter((m) => m.expenseMinor > 0);
  const avgMonthlyExpenseMinor =
    pastNonZero.length > 0
      ? Math.round(pastNonZero.reduce((s, m) => s + m.expenseMinor, 0) / pastNonZero.length)
      : dash.monthExpenseMinor;

  const goals = rawGoals.map((g) => {
    const remainingMinor = Math.max(0, g.targetMinor - g.currentMinor);
    const progressPct = g.targetMinor > 0 ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100)) : 0;
    let monthlyRequiredMinor: number | null = null;
    if (remainingMinor > 0 && g.targetDate) {
      const daysLeft = Math.max(1, daysBetweenISO(refDate, g.targetDate));
      const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
      monthlyRequiredMinor = Math.round(remainingMinor / monthsLeft);
    }
    return {
      ...g,
      progressPct,
      remainingMinor,
      monthlyRequiredMinor,
    };
  });

  const totalReservedMinor = rawGoals.reduce((s, g) => s + g.currentMinor, 0);
  const taxReserveMinor = rawGoals
    .filter((g) => g.kind === 'tax_reserve')
    .reduce((s, g) => s + g.currentMinor, 0);
  const freeUnreservedCashMinor = dash.totalBankMinor - totalReservedMinor;
  const emergencyRunwayMonths =
    avgMonthlyExpenseMinor > 0
      ? Math.round((dash.totalBankMinor / avgMonthlyExpenseMinor) * 10) / 10
      : null;

  return {
    goals,
    totalReservedMinor,
    taxReserveMinor,
    liquidBankMinor: dash.totalBankMinor,
    freeUnreservedCashMinor,
    avgMonthlyExpenseMinor,
    emergencyRunwayMonths,
  };
}

// 5. Smart Receipt / Invoice & UPI Screenshot Text Extractor + Bank PDF Extractor
export interface ExtractedReceiptFields {
  vendor: string;
  amountMinor: number | null;
  occurredAt: string;
  category: string;
  kind: 'expense' | 'income';
  scope?: Scope;
  note: string;
  source: 'local_text' | 'offline_ocr' | 'vision_llm';
  ocrText?: string;
}

const RECEIPT_BOILERPLATE_RE =
  /^(tax invoice|receipt|bill|gstin|date|time|invoice|cash memo|google pay|gpay|phonepe|paytm|bhim|amazon pay|upi payment|payment successful|transaction successful|completed|paid via|debited from|credited to|upi transaction id|transaction id|utr|ref no|from:|to:|\d+[:/-])/;

export function extractReceiptFieldsFromText(
  rawText: string,
  fallbackDate: string = todayISO(),
  categoryRules?: CategoryRuleRecord[],
  captionHint?: string,
): ExtractedReceiptFields {
  const combined = captionHint?.trim() ? `${rawText}\n${captionHint.trim()}` : rawText;
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Detect GPay / PhonePe / Paytm direction
  const isUpiIncome =
    /\b(received\s+from|money\s+received|payment\s+received|credited\s+to|cashback\s+received|refund\s+from)\b/i.test(
      combined,
    ) && !/\b(paid\s+to|paying\s+to|sent\s+to)\b/i.test(combined);
  const kind: 'expense' | 'income' = isUpiIncome ? 'income' : 'expense';

  // Try explicit UPI "Paid to <Vendor>" / "Received from <Vendor>" (same line or next line)
  let upiVendor: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const sameLine = l.match(
      /^(?:paid\s+to|paying(?:\s+to)?|sent\s+to|payment\s+to|received\s+from)\s+([A-Za-z0-9\u0900-\u097F\u0980-\u09FF &._-]{2,60})$/i,
    );
    if (sameLine?.[1]) {
      const candidate = sameLine[1].replace(/\b(on|via|successfully)\b.*$/i, '').trim();
      if (candidate.length >= 2 && !RECEIPT_BOILERPLATE_RE.test(candidate.toLowerCase())) {
        upiVendor = candidate.slice(0, 60);
        break;
      }
    }
    if (/^(?:paid\s+to|paying|sent\s+to|received\s+from):?$/i.test(l) && lines[i + 1]) {
      const next = lines[i + 1].trim();
      if (next.length >= 2 && !RECEIPT_BOILERPLATE_RE.test(next.toLowerCase()) && !/^[₹Rs\d.,\s]+$/.test(next)) {
        upiVendor = next.slice(0, 60);
        break;
      }
    }
  }

  // Fallback: first plausible merchant header line (ignoring UPI chrome & pure invoice headers)
  const vendor =
    upiVendor ??
    lines
      .find(
        (l) =>
          l.length >= 3 &&
          !RECEIPT_BOILERPLATE_RE.test(l.toLowerCase()) &&
          !/^(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d{1,2})?$/i.test(l) &&
          /[a-zA-Z\u0980-\u09FF\u0900-\u097F]{2,}/.test(l),
      )
      ?.slice(0, 60) ??
    'Receipt Purchase';

  // Prioritize explicit Total / Net Payable lines, then currency-prefixed lines, skipping UTR/Phone IDs
  let bestAmountMinor: number | null = null;
  const priorityLines = lines.filter(
    (l) =>
      /(grand\s*total|net\s*payable|amount\s*due|total\s*payable|bill\s*amount|\btotal\b|paid\s+₹|received\s+₹)/i.test(l) &&
      !/subtotal|sub-total|gst|cgst|sgst|discount|tax\s*total|upi transaction id|transaction id|utr/i.test(l),
  );
  const currencyLines = lines.filter(
    (l) =>
      /(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d{1,2})?/i.test(l) &&
      !/upi transaction id|transaction id|utr|ref no/i.test(l),
  );
  const scanLines =
    priorityLines.length > 0
      ? priorityLines.reverse()
      : currencyLines.length > 0
        ? currencyLines.reverse()
        : lines.slice().reverse();

  for (const line of scanLines) {
    if (/^(?:upi transaction id|transaction id|utr|ref no|order id|invoice no)\b/i.test(line)) continue;
    const matches = Array.from(line.matchAll(/((?:INR|Rs\.?|₹)\s*)?([\d,]+(?:\.\d{1,2})?)/gi));
    for (let i = matches.length - 1; i >= 0; i--) {
      const hasCurrency = Boolean(matches[i][1]);
      const rawNum = matches[i][2];
      const hasDecimal = rawNum.includes('.');
      const digitsOnly = rawNum.replace(/[^\d]/g, '');
      // Skip 7+ digit unprefixed integers (UTR/order/phone numbers)
      if (!hasCurrency && !hasDecimal && digitsOnly.length >= 7) continue;
      try {
        const p = rupeesToPaise(rawNum);
        if (p > 0) {
          bestAmountMinor = p;
          break;
        }
      } catch {
        // skip
      }
    }
    if (bestAmountMinor) break;
  }

  const occurredAt = tryParseFlexibleDateISO(combined, fallbackDate);
  const ruleHit = categoryRules ? matchCategoryRule(categoryRules, `${vendor} ${combined}`, kind) : null;
  const category = ruleHit?.category ?? inferCategoryFromMerchant(`${vendor} ${combined}`, kind);

  const captionLow = (captionHint ?? '').toLowerCase();
  const explicitScope: Scope | undefined = /\b(biz|business)\b/.test(captionLow)
    ? 'business'
    : /\b(family|home)\b/.test(captionLow)
      ? 'family'
      : /\bpersonal\b/.test(captionLow)
        ? 'personal'
        : ruleHit?.scope ?? undefined;

  return {
    vendor,
    amountMinor: bestAmountMinor,
    occurredAt,
    category,
    kind,
    scope: explicitScope,
    note: `${kind === 'income' ? 'Receipt credit' : 'Receipt'}: ${vendor}`,
    source: 'local_text',
  };
}

export async function extractReceiptImageOffline(
  imageBase64: string,
  fallbackDate: string = todayISO(),
  categoryRules?: CategoryRuleRecord[],
  captionHint?: string,
): Promise<ExtractedReceiptFields | null> {
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('@tesseract.js-data/eng');
    const baseDir = path.dirname(pkgPath);
    const bestDir = path.join(baseDir, '4.0.0_best_int');
    const fastDir = path.join(baseDir, '4.0.0');
    const langPath = fs.existsSync(bestDir) ? bestDir : fastDir;

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      langPath,
      gzip: true,
      cacheMethod: 'none',
    });
    try {
      const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(cleaned, 'base64');
      const { data } = await Promise.race([
        worker.recognize(buf),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), 20_000)),
      ]);
      const text = (data?.text ?? '').trim();
      if (!text) return null;
      const parsed = extractReceiptFieldsFromText(text, fallbackDate, categoryRules, captionHint);
      return { ...parsed, source: 'offline_ocr', ocrText: text.slice(0, 1200) };
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

export async function extractBankPdfText(
  pdfBase64: string,
  password?: string,
): Promise<{ text: string; pageCount: number }> {
  const cleaned = pdfBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!cleaned) {
    throw new Error('PDF file payload is empty');
  }
  const bytes = new Uint8Array(Buffer.from(cleaned, 'base64'));
  const { extractText, extractTextItems, getDocumentProxy } = await import('unpdf');

  let proxy: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    proxy = await getDocumentProxy(bytes, password ? { password } : undefined);
  } catch (err) {
    const e = err as { name?: string; code?: number; message?: string };
    if (e?.name === 'PasswordException' || /password/i.test(e?.message ?? '')) {
      if (e?.code === 2 || Boolean(password)) {
        throw new Error('INVALID_PDF_PASSWORD');
      }
      throw new Error('PDF_PASSWORD_REQUIRED');
    }
    throw new Error(`Could not read PDF file: ${e?.message ?? 'Invalid PDF structure'}`);
  }

  try {
    const { totalPages, items } = await extractTextItems(proxy);
    const reconstructedPages: string[] = [];

    for (const pageItems of items) {
      const nonEmpty = pageItems.filter((it) => it.str && it.str.trim().length > 0);
      if (nonEmpty.length === 0) continue;

      // PDF coordinates have y=0 at bottom-left; sort top-to-bottom then cluster rows by Y (~3pt tolerance)
      const sorted = nonEmpty.slice().sort((a, b) => b.y - a.y || a.x - b.x);
      const rows: Array<{ y: number; cells: typeof nonEmpty }> = [];
      for (const item of sorted) {
        const matchRow = rows.find((r) => Math.abs(r.y - item.y) <= 3);
        if (matchRow) {
          matchRow.cells.push(item);
        } else {
          rows.push({ y: item.y, cells: [item] });
        }
      }
      const pageLines = rows.map((row) =>
        row.cells
          .sort((a, b) => a.x - b.x)
          .map((c) => c.str.trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      reconstructedPages.push(pageLines.filter(Boolean).join('\n'));
    }

    let text = reconstructedPages.filter(Boolean).join('\n').trim();
    if (!text) {
      const fallback = await extractText(proxy, { mergePages: false });
      text = fallback.text.join('\n').trim();
    }
    return { text, pageCount: totalPages };
  } finally {
    try {
      await ((proxy as unknown as { destroy?: () => Promise<void> }).destroy?.() ?? proxy.cleanup());
    } catch {
      // ignore cleanup error
    }
  }
}
