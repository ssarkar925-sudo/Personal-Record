import {
  type Scope,
  type TxKind,
  daysBetweenISO,
  parseISODate,
  rupeesToPaise,
  todayISO,
} from '../../shared/ledger-core.ts';
import type { AccountRecord, TransactionRecord } from './api.ts';

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
      // ignore
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
      // ignore
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
        // ignore
      }
    }
  }

  return fallbackISO;
}

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
  if (/(hospital|clinic|pharmacy|1mg|apollo|medplus|doctor|dentist|lab|diagnostic|health)/.test(low)) {
    return 'Healthcare & Medical';
  }
  if (/(school|college|fee|udemy|coursera|tuition|exam|books)/.test(low)) {
    return 'Education';
  }
  return 'General Expense';
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
      const acc = resolveAccountFromHint(lines[i], params.accounts, params.defaultAccountId) ?? params.accounts[0];
      const party = desc.replace(/UPI\/|IMPS\/|NEFT\//gi, '').trim().slice(0, 60) || 'Imported Entry';
      const scope = acc.scope ?? defaultScope;
      const category = inferCategoryFromMerchant(desc, kind);
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

  // Stitch wrapped bank-statement lines
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

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const low = line.toLowerCase();
    if (/^(?:date\s+(?:narration|particulars|description)|opening balance|closing balance|brought forward|statement of|page \d+ of \d+)/i.test(low)) {
      continue;
    }

    const isStatementRow = startsWithDateRe.test(line);
    let amountMinor = 0;

    if (isStatementRow) {
      const decimalMatches = Array.from(line.matchAll(/(?:(?:INR|Rs\.?|₹)\s*)?([\d,]+\.\d{2})\b/gi));
      let chosenToken: string | null = null;
      if (decimalMatches.length >= 2) {
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
    const acc = resolveAccountFromHint(line, params.accounts, params.defaultAccountId) ?? params.accounts[0];

    let party = '';
    const smsPartyMatch =
      line.match(/\b(?:at|to|from|towards|merchant|vpa)\s+([A-Za-z0-9 &._@-]{2,40}?)(?=\s+(?:on|via|ref|upi|avbl|avl|bal|using|for)\b|[.,;]|$)/i) ??
      line.match(/info:\s*([A-Za-z0-9 &._@-]{2,40})/i);
    if (smsPartyMatch?.[1]) {
      party = smsPartyMatch[1];
    } else if (isStatementRow) {
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
    const category = inferCategoryFromMerchant(`${party} ${line}`, kind);

    results.push({
      id: `sms-${i}`,
      source: 'sms',
      kind,
      scope: acc.scope ?? defaultScope,
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
