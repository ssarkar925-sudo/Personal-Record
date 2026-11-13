import { type AppLanguage } from '../../shared/i18n.ts';
import { type Scope, addMonthsISO, rupeesToPaise, todayISO } from '../../shared/ledger-core.ts';

export interface MinimalContextItem {
  id: string;
  name: string;
  type: string;
  scope: Scope;
}

export interface AgentPlannerContext {
  accounts: MinimalContextItem[];
  loans: Array<{ id: string; name: string; counterparty: string; scope: Scope; emiMinor: number; remainingMinor: number }>;
  dues: Array<{ id: string; personName: string; direction: 'give' | 'need'; remainingMinor: number }>;
  recurringBills: Array<{ id: string; title: string; scope: Scope; amountMinor: number }>;
  notes: Array<{ id: string; title: string; checklist: Array<{ id: string; text: string; done: boolean }> }>;
  goals?: Array<{ id: string; title: string; kind: 'goal' | 'emergency' | 'tax_reserve'; scope: Scope; targetMinor: number; currentMinor: number }>;
}

export type AgentToolCall =
  | { tool: 'set_system_language'; language: AppLanguage }
  | { tool: 'navigate'; tab: 'dashboard' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault'; scope?: Scope | 'all' }
  | { tool: 'query_status'; topic: 'overview' | 'banks' | 'credit_cards' | 'loans' | 'dues' | 'notes' | 'reports' | 'alerts'; scope?: Scope }
  | {
      tool: 'create_transaction';
      kind: 'expense' | 'income' | 'transfer';
      scope: Scope;
      amountMinor: number;
      accountId?: string;
      toAccountId?: string;
      category: string;
      occurredAt: string;
      party: string;
      note: string;
    }
  | { tool: 'pay_card_bill'; cardId?: string; bankId?: string; amountMinor?: number; occurredAt: string }
  | { tool: 'reconcile_bank'; accountId?: string; targetBalanceMinor: number; occurredAt: string }
  | {
      tool: 'create_account';
      accountType: 'bank' | 'credit_card';
      name: string;
      scope: Scope;
      openingOrLimitMinor: number;
    }
  | {
      tool: 'create_due';
      direction: 'give' | 'need';
      personName: string;
      amountMinor: number;
      scope: Scope;
      dueDate: string | null;
      note: string;
    }
  | { tool: 'settle_due'; dueId?: string; personName: string; amountMinor?: number; bankId?: string; settledAt: string }
  | {
      tool: 'create_loan';
      name: string;
      counterparty: string;
      direction: 'borrowed' | 'lent';
      scope: Scope;
      principalMinor: number;
      ratePct: number;
      tenureMonths: number;
    }
  | { tool: 'pay_loan_emi'; loanId?: string; amountMinor?: number; bankId?: string; paidAt: string }
  | { tool: 'confirm_recurring_bill'; billId?: string; paidAt: string }
  | { tool: 'set_scope_budget'; scope: Scope; monthlyLimitMinor: number }
  | {
      tool: 'create_note';
      title: string;
      body: string;
      scope: Scope | 'general';
      pinned: boolean;
      checklistTexts: string[];
    }
  | { tool: 'toggle_checklist'; noteId?: string; itemId?: string; itemQuery: string; done: boolean }
  | { tool: 'check_alerts_now' }
  | { tool: 'advisor_briefing'; focus: 'full' | 'wrong' | 'predict' | 'suggest' | 'tasks'; scope?: Scope }
  | { tool: 'archive_completed_notes' }
  | { tool: 'detect_subscriptions'; scope?: Scope }
  | { tool: 'debt_payoff_plan'; extraMonthlyMinor: number; strategy: 'avalanche' | 'snowball' }
  | { tool: 'create_goal'; title: string; kind: 'goal' | 'emergency' | 'tax_reserve'; scope: Scope; targetMinor: number }
  | { tool: 'contribute_goal'; goalId?: string; goalTitleQuery: string; amountMinor: number; bankId?: string }
  | { tool: 'goals_status' }
  | { tool: 'delete_last_transaction' }
  | { tool: 'vault_guard' }
  | { tool: 'help' };

export function normalizeNumerals(input: string): string {
  const bnDigits = '০১২৩৪৫৬৭৮৯';
  const hiDigits = '०१२३४५६७८९';
  let out = '';
  for (const ch of input) {
    const bnIdx = bnDigits.indexOf(ch);
    if (bnIdx >= 0) {
      out += String(bnIdx);
      continue;
    }
    const hiIdx = hiDigits.indexOf(ch);
    if (hiIdx >= 0) {
      out += String(hiIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function detectCommandLanguage(rawText: string): AppLanguage {
  if (/[\u0980-\u09FF]/.test(rawText)) return 'bn';
  if (/[\u0900-\u097F]/.test(rawText)) return 'hi';

  const low = ` ${rawText.toLowerCase()} `;
  const bnWords = [
    'taka', 'khoroch', 'amar', 'koro', 'dekhao', 'pabo', 'debo', 'baki', 'hisab', 'bajar',
    'khabar', 'jog', 'koto', 'ache', 'ekhon', 'ajke', 'lagbe', 'diyechi', 'peyeche', 'byabsha',
  ];
  const hiWords = [
    'rupaye', 'rupaya', 'kharch', 'kharcha', 'dikhao', 'batao', 'dena', 'lena', 'karo', 'likho',
    'jodo', 'kitna', 'paisa', 'paise', 'udhar', 'mera', 'mere', 'aaj', 'kal', 'khata', 'becho',
    'bharo', 'nikalo', 'jama',
  ];

  let bnScore = 0;
  let hiScore = 0;
  for (const w of bnWords) if (low.includes(` ${w} `) || low.includes(`${w} `)) bnScore += 1;
  for (const w of hiWords) if (low.includes(` ${w} `) || low.includes(`${w} `)) hiScore += 1;

  if (bnScore > hiScore && bnScore >= 1) return 'bn';
  if (hiScore > bnScore && hiScore >= 1) return 'hi';
  return 'en';
}

export function extractLanguageTarget(text: string): AppLanguage | null {
  const low = text.toLowerCase();
  if (/\b(bengali|bangla)\b|বাংলা|বাঙালি|बंगाली|बांग्ला/.test(low)) return 'bn';
  if (/\b(hindi)\b|हिन्दी|हिंदी|হিন্দি/.test(low)) return 'hi';
  if (/\b(english|eng)\b|ইংরেজি|অ্যাংরেজি|अंग्रेजी|इंग्लिश/.test(low)) return 'en';
  return null;
}

export function extractScope(text: string, fallback: Scope = 'personal'): Scope {
  const low = text.toLowerCase();
  if (
    /\b(business|biz|office|company|shop|vendor|client|gst|byabsha|dukan|vyapar)\b|বিজনেস|ব্যবসা|অফিস|দোকান|बिज़नेस|बिजनेस|व्यापार|ऑफिस|दुकान/.test(
      low,
    )
  ) {
    return 'business';
  }
  if (
    /\b(family|home|house|parents|wife|mom|dad|parivar|poribar|ghar|bari)\b|ফ্যামিলি|পরিবার|বাড়ি|বাড়ি|ঘর|फ़ैमिली|फैमिली|परिवार|घर/.test(
      low,
    )
  ) {
    return 'family';
  }
  if (/\b(personal|self|private|nijer|khud)\b|পার্সোনাল|নিজের|ব্যক্তিগত|पर्सनल|खुद|निजी/.test(low)) {
    return 'personal';
  }
  return fallback;
}

export function extractAmountMinor(normalizedText: string): number | null {
  // Match amounts with optional scale words (k / hajar / হাজার / हजार / lakh / লাখ / लाख / crore)
  const regex =
    /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|hajar|hazaar|lakh|lac|crore|cr|হাজার|লাখ|কোটি|हजार|हज़ार|लाख|करोड़)?/gi;

  const candidates: number[] = [];
  for (const match of normalizedText.matchAll(regex)) {
    const rawNum = match[1].replace(/,/g, '');
    const unit = (match[2] || '').toLowerCase();
    // Skip probable 10-digit Indian phone numbers unless preceded by ₹/rs
    const prefix = normalizedText.slice(Math.max(0, (match.index ?? 0) - 3), match.index ?? 0);
    if (!/₹|rs/i.test(prefix) && rawNum.length === 10 && /^[6-9]/.test(rawNum)) continue;
    // Skip obvious calendar years like 2025/2026
    if (!unit && !/₹|rs/i.test(prefix) && /^20\d{2}$/.test(rawNum)) continue;

    let multiplier = 1;
    if (unit === 'k' || unit === 'thousand' || unit === 'hajar' || unit === 'hazaar' || unit === 'হাজার' || unit === 'हजार' || unit === 'हज़ार') {
      multiplier = 1000;
    } else if (unit === 'lakh' || unit === 'lac' || unit === 'লাখ' || unit === 'लाख') {
      multiplier = 100000;
    } else if (unit === 'crore' || unit === 'cr' || unit === 'কোটি' || unit === 'करोड़') {
      multiplier = 10000000;
    }

    try {
      const val = Number(rawNum) * multiplier;
      if (val > 0 && Number.isFinite(val)) {
        candidates.push(rupeesToPaise(val.toFixed(2)));
      }
    } catch {
      // ignore invalid
    }
  }
  return candidates.length > 0 ? candidates[0] : null;
}

function extractDateISO(normalizedText: string, now: Date = new Date()): string {
  const isoMatch = normalizedText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const low = normalizedText.toLowerCase();
  if (/\b(yesterday|gotokal)\b|গতকাল|कल\s*(गया|थे|हुआ|खर्च)?/.test(low) && !/tomorrow|আগামীকাল/.test(low)) {
    const yest = new Date(now.getTime() - 86_400_000);
    return todayISO(yest);
  }
  if (/\b(tomorrow)\b|আগামীকাল/.test(low)) {
    const tmrw = new Date(now.getTime() + 86_400_000);
    return todayISO(tmrw);
  }
  return todayISO(now);
}

function inferCategory(text: string, kind: 'expense' | 'income' | 'transfer'): string {
  const low = text.toLowerCase();
  if (kind === 'transfer') return 'Transfer';
  if (kind === 'income') {
    if (/salary|বেতন|सैलरी/.test(low)) return 'Salary';
    if (/client|invoice|project|ক্লায়েন্ট|कंपनी|बिल/.test(low)) return 'Client Revenue';
    if (/refund|cashback|রিফান্ড|रिफंड/.test(low)) return 'Refund';
    return 'Income';
  }
  if (/grocer|sabji|bazar|bajar|market|সবজি|বাজার|মুদি|सब्जी|बाज़ार|राशन/.test(low)) return 'Groceries';
  if (/food|lunch|dinner|breakfast|coffee|tea|snack|khabar|khana|খাবার|লাঞ্চ|ডিনার|চা|खाना|नाश्ता|चाय/.test(low))
    return 'Food & Dining';
  if (/fuel|petrol|diesel|cab|uber|ola|metro|auto|train|travel|পেট্রোল|গাড়ি|ভাড়া|पेट्रोल|किराया|गाड़ी/.test(low))
    return 'Transport & Fuel';
  if (/rent|electricity|wifi|internet|recharge|bill|water|gas|বিদ্যুৎ|ভাড়া|বিল|किराया|बिजली|बिल|रिचार्ज/.test(low))
    return 'Bills & Utilities';
  if (/medicine|doctor|hospital|medical|pharmacy|ওষুধ|ডাক্তার|দवा|दवाई|डॉक्टर|अस्पताल/.test(low))
    return 'Healthcare';
  if (/shop|amazon|flipkart|clothes|কেনাকাটা|জামা|शॉपिंग|कपड़े/.test(low)) return 'Shopping';
  return 'General Expense';
}

function matchAccount(
  text: string,
  accounts: MinimalContextItem[],
  preferredType?: 'bank' | 'credit_card',
  preferredScope?: Scope,
): MinimalContextItem | undefined {
  const low = text.toLowerCase();
  const pool = preferredType ? accounts.filter((a) => a.type === preferredType) : accounts;

  for (const a of pool) {
    if (low.includes(a.name.toLowerCase())) return a;
    const words = a.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    if (words.some((w) => low.includes(w))) return a;
  }

  if (preferredScope) {
    const byScope = pool.find((a) => a.scope === preferredScope);
    if (byScope) return byScope;
  }
  return pool[0] ?? accounts[0];
}

function extractPersonFromDueText(raw: string): string {
  const cleaned = raw
    .replace(/₹\s*[\d,]+(?:\.\d+)?/gi, ' ')
    .replace(/\b\d[\d,]*(?:\.\d+)?\s*(k|hajar|hazaar|lakh|lac|crore|cr|taka|rs|inr|rupees|rupaye|rupaya)?\b/gi, ' ')
    .replace(/[০-৯०-९]+/g, ' ')
    .replace(
      /\b(need|give|from|to|due|add|log|record|owes|owe|take|pay|payable|receivable|personal|business|family|taka|rupees|rupaye|paise|hajar|lakh|pabo|debo|lena|dena|hai|hain|karo|koro|jodo|likho|for|me|money|udhar|baki|settle|er|kache|ke|theke|se|ko|ka|ki)\b/gi,
      ' ',
    )
    .replace(
      /(টাকা|পাবো|পাব|দেবো|দেব|দিতে হবে|নিতে হবে|যোগ করো|লিখো|লেখো|কাছে|কে|থেকে|বকেয়া|ধার|পার্সোনাল|বিজনেস|ফ্যামিলি|रुपये|रुपया|पैसे|लेने|देने|हैं|है|जोड़ो|लिखो|से|को|उधार|पर्सनल|बिज़नेस|फैमिली)/g,
      ' ',
    )
    .trim();

  // Handle Bengali possessive suffix like রাহুলের -> রাহুল, অমিতের -> অমিত, করিমকে -> করিম
  let candidate = cleaned.split(/[\s,.:;!?]+/).filter(Boolean)[0] || 'Friend';
  candidate = candidate.replace(/(ের|কে|র)$/u, (m) => (candidate.length > 3 ? '' : m));
  return candidate.slice(0, 40) || 'Person';
}

function planSingleCommand(
  rawText: string,
  ctx: AgentPlannerContext,
  now: Date = new Date(),
): AgentToolCall[] {
  const normalized = normalizeNumerals(rawText.trim());
  const low = normalized.toLowerCase();

  // -1. Proactive Assessment / Prediction / Advice / Archive Completed Notes
  if (
    /(archive completed|cleanup notes|clean notes|clean finished|tidy notes|পুরনো চেকলিস্ট আর্কাইভ|সম্পন্ন নোট আর্কাইভ|पूरी चेकलिस्ट आर्काइव|साफ़ करो नोट)/i.test(
      low,
    ) ||
    (/(archive|clean|cleanup|clear|आर्काइव|আর্কাইভ)/i.test(low) &&
      /(done|completed|finished|সম্পন্ন|শেষ|पूरा|पूरी)/i.test(low) &&
      /(note|checklist|task|নোট|চেকলিস্ট|नोट|चेकलिस्ट)/i.test(low))
  ) {
    return [{ tool: 'archive_completed_notes' }];
  }

  const advScope = /\b(personal|business|family)\b|পার্সোনাল|বিজনেস|ফ্যামিলি|पर्सनल|बिज़नेस|फैमिली/i.test(low)
    ? extractScope(low, 'personal')
    : undefined;

  // -0.9 Bank SMS Paste Detection (e.g., "Rs 850 debited from A/c xx1234 at Swiggy")
  if (/(debited|credited|withdrawn|deposited)\b.*\b(?:a\/c|ac|acct|card|bank|upi|vpa)\b/i.test(low) || /\b(?:a\/c|card)\s*[*xX]*\d{4}\b.*\b(debited|credited|spent)\b/i.test(low)) {
    const amt = extractAmountMinor(normalized);
    if (amt && amt > 0) {
      const isCredit = /(credited|received|deposited|refund)/i.test(low) && !/credit\s*card\s*spent/i.test(low);
      const last4Match = normalized.match(/(?:a\/c|ac|card|xx|\*\*|x+)[\s:-]*[*xX-]*(\d{4})\b/i);
      const matchedByLast4 = last4Match
        ? ctx.accounts.find((a) => low.includes(a.name.toLowerCase())) ?? ctx.accounts[0]
        : undefined;
      const sourceAcc = matchedByLast4 ?? matchAccount(normalized, ctx.accounts, isCredit ? 'bank' : undefined);
      const partyMatch = normalized.match(/\b(?:at|to|from|towards)\s+([A-Za-z0-9 &._@-]{2,40}?)(?=\s+(?:on|via|ref|upi|avbl|avl|bal)\b|[.,;]|$)/i);
      return [
        {
          tool: 'create_transaction',
          kind: isCredit ? 'income' : 'expense',
          scope: sourceAcc?.scope ?? extractScope(low, 'personal'),
          amountMinor: amt,
          accountId: sourceAcc?.id,
          category: inferCategory(`${partyMatch?.[1] ?? ''} ${normalized}`, isCredit ? 'income' : 'expense'),
          occurredAt: extractDateISO(normalized, now),
          party: (partyMatch?.[1] ?? 'Bank SMS').trim().slice(0, 50),
          note: rawText.slice(0, 140),
        },
      ];
    }
  }

  // -0.8 Recurring & Subscription Leak Detector
  if (/(subscription|subscriptions|leak|leaks|untracked recurring|detect recurring|সাবস্ক্রিপশন|सब्सक्रिप्शन)/i.test(low)) {
    return [{ tool: 'detect_subscriptions', scope: advScope }];
  }

  // -0.7 Debt Payoff Optimizer (Avalanche / Snowball)
  if (/(avalanche|snowball|debt payoff|payoff plan|debt plan|pay off debt|extra emi|कर्ज मुक्ति|ऋण পরিকল্পনা|লোন শেষ)/i.test(low)) {
    const strategy = /snowball/i.test(low) ? 'snowball' : 'avalanche';
    const extraMinor = extractAmountMinor(normalized) ?? 500_000; // default ₹5,000/mo simulation if omitted
    return [{ tool: 'debt_payoff_plan', extraMonthlyMinor: extraMinor, strategy }];
  }

  // -0.6 Savings Goals, Tax Reserve & Emergency Runway
  if (/(tax reserve|emergency fund|savings goal|\bgoal\b|লক্ষ্য|ট্যাক্স রিজার্ভ|लक्ष्य|इमरजेंसी फंड|टैक्स रिज़र्व)/i.test(low)) {
    const amt = extractAmountMinor(normalized);
    if (amt && /(add|save|put|deposit|transfer|contribute|জমা|যোগ|जमा|डालो|बचत)/i.test(low)) {
      const matchedGoal = ctx.goals?.find((g) => low.includes(g.title.toLowerCase()));
      const bank = matchAccount(normalized, ctx.accounts, 'bank', matchedGoal?.scope ?? 'personal');
      return [
        {
          tool: 'contribute_goal',
          goalId: matchedGoal?.id,
          goalTitleQuery: matchedGoal?.title ?? normalized.replace(/₹\s*[\d,]+|\d+/g, '').trim(),
          amountMinor: amt,
          bankId: bank?.id,
        },
      ];
    }
    if (amt && /(create|set|new|start|make|add|বানাও|তৈরি|সেট|बनाओ|नया|सेट)/i.test(low)) {
      const kind = /tax/i.test(low) ? 'tax_reserve' : /emergency/i.test(low) ? 'emergency' : 'goal';
      const cleanedTitle = normalized
        .replace(/₹\s*[\d,]+(?:\.\d+)?/g, '')
        .replace(/\b\d[\d,]*(?:\.\d+)?\s*(k|thousand|lakh|lac|cr|crore)?\b/gi, '')
        .replace(/\b(create|set|new|start|make|add|a|for|of|personal|business|family|savings|goal)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const title =
        cleanedTitle.length >= 2
          ? cleanedTitle.slice(0, 50)
          : kind === 'tax_reserve'
            ? 'Tax Reserve'
            : kind === 'emergency'
              ? 'Emergency Fund'
              : 'Savings Goal';
      return [
        {
          tool: 'create_goal',
          title,
          kind,
          scope: extractScope(low, kind === 'tax_reserve' ? 'business' : 'personal'),
          targetMinor: amt,
        },
      ];
    }
    if (!amt) {
      return [{ tool: 'goals_status' }];
    }
  }
  if (/(emergency runway|cash runway|savings runway)/i.test(low)) {
    return [{ tool: 'goals_status' }];
  }

  if (
    /(what.?s wrong|any problem|what went wrong|mistake|overspend|overspending|risk|audit|danger|ki vul|ki somossa|kya galat|kya dikkat|সমস্যা|ভুল|ঝুঁকি|गलत|दिक्कत|खतरा)/i.test(
      low,
    ) &&
    extractAmountMinor(normalized) === null
  ) {
    return [{ tool: 'advisor_briefing', focus: 'wrong', scope: advScope }];
  }

  if (
    /(predict|prediction|forecast|projection|runway|future|next month|month end|bhobishyot|bhavishya|anumana|পূর্বাভাস|ভবিষ্যৎ|ভবিষ্যত|भविष्य|अनुमान)/i.test(
      low,
    ) &&
    extractAmountMinor(normalized) === null
  ) {
    return [{ tool: 'advisor_briefing', focus: 'predict', scope: advScope }];
  }

  if (
    /(suggest|suggestion|advise|advice|recommend|what should i do|guide me|poramorsho|ki kora uchit|salah|sujhav|কী করা উচিত|পরামর্শ|सलाह|सुझाव)/i.test(
      low,
    ) &&
    extractAmountMinor(normalized) === null
  ) {
    return [{ tool: 'advisor_briefing', focus: 'suggest', scope: advScope }];
  }

  if (
    /(good morning|assess|assessment|briefing|brief me|daily brief|morning brief|health check|health score|financial health|work load|workload|worry|review everything|ki obostha|kemon cholche|অবস্থা কেমন|রিভিউ|কাজের চাপ|समीक्षा|मेरा हिसाब|क्या हाल)/i.test(
      low,
    ) &&
    extractAmountMinor(normalized) === null
  ) {
    return [{ tool: 'advisor_briefing', focus: 'full', scope: advScope }];
  }

  // 0. Guard against revealing Vault secrets
  if (
    /(vault|password|pin|secret|login|credential|পাসওয়ার্ড|ভল্ট|পিন|पासवर्ड|वॉल्ट)/i.test(low) &&
    /(show|tell|reveal|what is|read|decrypt|give me|দেখাও|বলো|খোলো|बताओ|दिखाओ|क्या है)/i.test(low) &&
    !/\b(open|go to|navigate)\b/i.test(low)
  ) {
    return [{ tool: 'vault_guard' }];
  }

  // 1. Change System Language command
  if (
    /(language|lang|system language|ভাষা|সিস্টেম ভাষা|भाषा|सिस्टम भाषा)/i.test(low) ||
    (/(switch|change|set|make|use|করো|পরিবর্তন|বদলাও|সেট|बदलो|करो|रखो|सेट)/i.test(low) &&
      extractLanguageTarget(normalized) !== null &&
      extractAmountMinor(normalized) === null)
  ) {
    const targetLang = extractLanguageTarget(normalized);
    if (targetLang) return [{ tool: 'set_system_language', language: targetLang }];
  }

  // 2. Undo / Delete Last Transaction
  if (
    /(undo|delete last|remove last|শেষ এন্ট্রি|শেষ লেনদেন|আগেরটা মুছ|आखिरी एंट्री|पिछला हटाओ)/i.test(low)
  ) {
    return [{ tool: 'delete_last_transaction' }];
  }

  // 3. Check / Trigger WhatsApp Alerts
  if (
    /(check alert|run alert|send alert|alert check|whatsapp alert|অ্যালার্ট চেক|অ্যালার্ট পাঠাও|अलर्ट चेक|अलर्ट भेजो)/i.test(
      low,
    )
  ) {
    return [{ tool: 'check_alerts_now' }];
  }

  // 4. Toggle Checklist Item
  if (
    /(complete|mark done|tick|check off|done checklist|কমপ্লিট|টিক করো|শেষ করো|पूरा करो|टिक करो)/i.test(low) &&
    !/(add note|create note|new checklist|নোট বানাও|নতুন চেকলিস্ট|नोट बनाओ)/i.test(low)
  ) {
    const stripped = normalized
      .replace(
        /\b(complete|mark|done|tick|check off|checklist|item|task)\b|কমপ্লিট|টিক করো|টাস্ক|चेकलिस्ट|पूरा करो|टिक करो/gi,
        ' ',
      )
      .trim();
    if (stripped.length >= 2) {
      return [{ tool: 'toggle_checklist', itemQuery: stripped, done: true }];
    }
  }

  // 5. Create Note / Checklist
  if (
    /(checklist|note|নোট|চেকলিস্ট|नोट|चेकलिस्ट|টাস্ক লিস্ট)/i.test(low) &&
    (/(add|create|make|new|pin|remind|write|বানাও|যোগ|লেখো|লিখো|লিখে|बनाओ|जोड़ो|लिखो)/i.test(low) ||
      normalized.includes(':') ||
      normalized.includes(','))
  ) {
    const clean = normalized
      .replace(
        /^(please\s+)?(add|create|make|new|write|pin)\s+(a\s+)?(pinned\s+)?(checklist|note)\s*/i,
        '',
      )
      .replace(/(নোট বানাও|নোট যোগ করো|চেকলিস্ট বানাও|চেকলিস্ট যোগ করো|নোট|চেকলিস্ট|नोट बनाओ|चेकलिस्ट बनाओ|चेकलिस्ट|नोट)/gi, '')
      .trim();
    const [head, itemsPart] = clean.includes(':') ? clean.split(':', 2) : [clean, ''];
    const parts = (itemsPart || head)
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const title = itemsPart ? head.trim() || 'Checklist' : parts[0]?.slice(0, 60) || 'Quick Note';
    const checklistTexts = itemsPart ? parts : parts.length > 1 ? parts : [];
    const scope = /\b(personal|business|family)\b|পার্সোনাল|বিজনেস|ফ্যামিলি|पर्सनल|बिज़नेस|फैमिली/i.test(low)
      ? extractScope(low, 'personal')
      : 'general';

    return [
      {
        tool: 'create_note',
        title,
        body: checklistTexts.length === 0 ? clean : '',
        scope,
        pinned: /pin|পিন|पिन/i.test(low) || checklistTexts.length > 0,
        checklistTexts,
      },
    ];
  }

  // 6. Set Monthly Scope Budget
  if (/(budget|বাজেট|बजट)/i.test(low) && /(set|update|make|করে|সেট|बनाओ|सेट|रखो)/i.test(low)) {
    const amt = extractAmountMinor(normalized);
    if (amt && amt > 0) {
      return [{ tool: 'set_scope_budget', scope: extractScope(low, 'personal'), monthlyLimitMinor: amt }];
    }
  }

  // 7. Reconcile Bank Balance
  if (/(reconcile|match balance|ব্যালেন্স ম্যাচ|মিলিয়ে|मिलान|रिकंसाइल)/i.test(low)) {
    const amt = extractAmountMinor(normalized);
    if (amt !== null) {
      const bank = matchAccount(normalized, ctx.accounts, 'bank', extractScope(low));
      return [
        {
          tool: 'reconcile_bank',
          accountId: bank?.id,
          targetBalanceMinor: amt,
          occurredAt: extractDateISO(normalized, now),
        },
      ];
    }
  }

  // 8. Pay Credit Card Bill
  if (
    /(card|কার্ড|कार्ड)/i.test(low) &&
    /(pay|bill|clear|settle|পে|বিল|ভরো|भरो|चुकाओ|पे)/i.test(low)
  ) {
    const card = matchAccount(normalized, ctx.accounts, 'credit_card');
    const bank = matchAccount(normalized, ctx.accounts, 'bank', card?.scope ?? 'personal');
    const amt = extractAmountMinor(normalized) ?? undefined;
    return [
      {
        tool: 'pay_card_bill',
        cardId: card?.id,
        bankId: bank?.id,
        amountMinor: amt,
        occurredAt: extractDateISO(normalized, now),
      },
    ];
  }

  // 9. Pay Loan EMI or Create Loan
  if (/(loan|emi|লোন|ঋণ|লোনের|লোণ|लोन|ईएमआई|क़र्ज़|कर्ज)/i.test(low)) {
    if (/(pay|paid|settle|দাও|পরিশোধ|ভরো|भरो|चुकाओ|दो)/i.test(low)) {
      const matchedLoan =
        ctx.loans.find((l) => low.includes(l.name.toLowerCase()) || low.includes(l.counterparty.toLowerCase())) ??
        ctx.loans[0];
      const bank = matchAccount(normalized, ctx.accounts, 'bank', matchedLoan?.scope ?? 'personal');
      return [
        {
          tool: 'pay_loan_emi',
          loanId: matchedLoan?.id,
          amountMinor: extractAmountMinor(normalized) ?? undefined,
          bankId: bank?.id,
          paidAt: extractDateISO(normalized, now),
        },
      ];
    }
    const amt = extractAmountMinor(normalized);
    if (amt && /(add|new|create|take|took|lent|নিয়েছি|দিয়েছি|বানাও|লোন যোগ|नया|जोड़ो|लिया|दिया)/i.test(low)) {
      const direction = /(lent|gave|দিয়েছি|दिया)/i.test(low) ? 'lent' : 'borrowed';
      return [
        {
          tool: 'create_loan',
          name: direction === 'lent' ? 'Lent Loan' : 'Borrowed Loan',
          counterparty: extractPersonFromDueText(normalized),
          direction,
          scope: extractScope(low, 'personal'),
          principalMinor: amt,
          ratePct: 10,
          tenureMonths: 12,
        },
      ];
    }
  }

  // 10. Confirm Recurring Bill
  if (/(recurring|রিকারিং|बार-बार|रिकरिंग)/i.test(low) && /(confirm|paid|pay|কনফার্ম|ভরো|पक्का)/i.test(low)) {
    const bill =
      ctx.recurringBills.find((b) => low.includes(b.title.toLowerCase())) ?? ctx.recurringBills[0];
    return [{ tool: 'confirm_recurring_bill', billId: bill?.id, paidAt: extractDateISO(normalized, now) }];
  }

  // 11. Settle People Due
  if (
    /(settle|paid back|cleared|শোধ|মিটিয়ে|ফিরিয়ে|चुका|निपटा|मिल गया|दे दिया)/i.test(low) &&
    extractAmountMinor(normalized) !== null
  ) {
    const amt = extractAmountMinor(normalized) ?? undefined;
    const person = extractPersonFromDueText(normalized);
    const matchDue = ctx.dues.find((d) => low.includes(d.personName.toLowerCase()));
    const bank = /(bank|hdfc|icici|sbi|ব্যাংক|बैंक)/i.test(low)
      ? matchAccount(normalized, ctx.accounts, 'bank')
      : undefined;
    return [
      {
        tool: 'settle_due',
        dueId: matchDue?.id,
        personName: matchDue?.personName ?? person,
        amountMinor: amt,
        bankId: bank?.id,
        settledAt: extractDateISO(normalized, now),
      },
    ];
  }

  // 12. Create People Due (Give / Need)
  const isNeedDue =
    /(need from|owes me|receivable|pabo|paona|lena hai|lene hai|পাওনা|পাবো|পাব|নিতে হবে|নেবো|লোন দিয়েছি|लेने हैं|लेना है|पाना है|मिलने हैं|udh[ae]r diya)/i.test(
      low,
    );
  const isGiveDue =
    /(give to|owe\b|payable|debo|dibo|dena hai|dene hai|দেনা|দেবো|দেব|দিতে হবে|পাবে|देने हैं|देना है|देने का|उधार लिया)/i.test(
      low,
    );

  if ((isNeedDue || isGiveDue) && extractAmountMinor(normalized) !== null) {
    const amt = extractAmountMinor(normalized)!;
    return [
      {
        tool: 'create_due',
        direction: isNeedDue ? 'need' : 'give',
        personName: extractPersonFromDueText(normalized),
        amountMinor: amt,
        scope: extractScope(low, 'personal'),
        dueDate: /\b(due|by|on|তারিখ|तक)\b/.test(low) ? addMonthsISO(todayISO(now), 0) : null,
        note: rawText.slice(0, 120),
      },
    ];
  }

  // 13. Create Bank / Credit Card Account
  if (
    /(add bank|new bank|create bank|add card|new card|create credit card|add credit card|ব্যাংক যোগ|নতুন ব্যাংক|নতুন কার্ড|নতুন ক্রেডিট কার্ড|কার্ড যোগ|কার্ড এড|बैंक जोड़ो|नया बैंक|नया कार्ड|कार्ड जोड़ो)/i.test(
      low,
    ) ||
    (/(bank|card|credit card|ব্যাংক|কার্ড|ক্রেডিট কার্ড|बैंक|कार्ड)/i.test(low) &&
      /(add|create|এড|যোগ|বানাও|করুন|जोड़|जोड़ो|जोड़िए|बनाओ)/i.test(low) &&
      !/(pay|bill|spend|kharch|খরচ|বিল|पे|খোলো|খুলুন)/i.test(low))
  ) {
    const isCard = /(card|কার্ড|कार्ड)/i.test(low);
    const scope = extractScope(low, 'personal');
    const amt = extractAmountMinor(normalized) ?? (isCard ? 10_000_000 : 0);
    const nameMatch =
      normalized.match(/(?:named|called)\s+([A-Za-z0-9\u0980-\u09FF\u0900-\u097F ]{2,30})/i) ??
      normalized.match(
        /(?:bank|card)\s+(?!add\b|account\b|bill\b|যোগ|এড|করুন|বানাও|जोड़|जोड़ो|बनाओ)([A-Za-z][A-Za-z0-9 ]{1,25})/i,
      );
    const cleanedName = nameMatch?.[1]?.replace(/\s+\d[\d,]*.*$/, '').trim();
    const rawName =
      cleanedName ||
      (isCard
        ? `${scope[0].toUpperCase()}${scope.slice(1)} Credit Card`
        : `${scope[0].toUpperCase()}${scope.slice(1)} Bank`);
    return [
      {
        tool: 'create_account',
        accountType: isCard ? 'credit_card' : 'bank',
        name: rawName,
        scope,
        openingOrLimitMinor: amt,
      },
    ];
  }

  // 14. Transactions (Expense / Income / Transfer)
  const amount = extractAmountMinor(normalized);
  const isTransfer = /(transfer|ট্রান্সফার|পাঠাও|ट्रांसफर|भेजो)/i.test(low);
  const isIncome =
    /(income|received|earned|salary|profit|revenue|আয়|আয়|পেয়েছি|পেয়েছি|বেতন|লাভ|বেচে|आय|मिला|कमाई|सैलरी|फायदा|बेचा)/i.test(
      low,
    );
  const isExpense =
    /(spend|spent|expense|paid|buy|bought|cost|খরচ|কিনেছি|দিয়েছি|দিয়েছি|ব্যয়|ব্যয়|বাজার|খাবার|ভাড়া|ভাড়া|खर्च|खर्चा|खरीदा|दिया|लगा|खाना|बाज़ार)/i.test(
      low,
    );

  if (amount && (isTransfer || isIncome || isExpense)) {
    const kind: 'expense' | 'income' | 'transfer' = isTransfer
      ? 'transfer'
      : isIncome
        ? 'income'
        : 'expense';
    const scope = extractScope(low, 'personal');
    const sourceAcc =
      kind === 'expense'
        ? matchAccount(normalized, ctx.accounts, undefined, scope)
        : matchAccount(normalized, ctx.accounts, 'bank', scope);

    const destAcc =
      kind === 'transfer'
        ? ctx.accounts.find((a) => a.id !== sourceAcc?.id && low.includes(a.name.toLowerCase())) ??
          ctx.accounts.find((a) => a.id !== sourceAcc?.id)
        : undefined;

    return [
      {
        tool: 'create_transaction',
        kind,
        scope,
        amountMinor: amount,
        accountId: sourceAcc?.id,
        toAccountId: destAcc?.id,
        category: inferCategory(normalized, kind),
        occurredAt: extractDateISO(normalized, now),
        party: '',
        note: rawText.slice(0, 140),
      },
    ];
  }

  // 15. Navigation Commands (includes polite Bengali/Hindi forms & common STT "colon" -> "kholo" slips)
  if (
    /(open|go to|switch to|show tab|navigate|colon|kholo|khulun|khul|খোলো|খুলুন|খোলেন|দেখান|যাও|দেখাও ট্যাব|खोलो|खोलिए|जाओ|चलो)/i.test(
      low,
    ) &&
    !/(balance|net worth|koto|kitna|ব্যালেন্স|নেট ওয়ার্থ|कितना)/i.test(low)
  ) {
    const scope: Scope | 'all' = /\b(personal|business|family)\b|পার্সোনাল|বিজনেস|ফ্যামিলি|पर्सनल|बिज़नेस|फैमिली/i.test(
      low,
    )
      ? extractScope(low, 'personal')
      : 'all';
    if (/(vault|ভল্ট|वॉल्ट)/i.test(low)) return [{ tool: 'navigate', tab: 'vault' }];
    if (/(note|checklist|নোট|চেকলিস্ট|नोट|चेकलिस्ट)/i.test(low)) return [{ tool: 'navigate', tab: 'notes' }];
    if (/(report|pnl|profit|রিপোর্ট|রিপোর্টস|रिपोर्ट|रिपोर्ट्स|मुनाफा)/i.test(low))
      return [{ tool: 'navigate', tab: 'reports', scope }];
    if (/(loan|due|people|debt|লোন|ঋণ|বকেয়া|পাওনা|লোণ|लोन|उधार|कर्ज)/i.test(low))
      return [{ tool: 'navigate', tab: 'loans_dues' }];
    if (/(money|bank|card|transaction|টাকা|ব্যাংক|কার্ড|লেনদেন|पैसे|बैंक|कार्ड|लेनदेन)/i.test(low))
      return [{ tool: 'navigate', tab: 'money' }];
    if (/(dashboard|home|ড্যাশবোর্ড|হোম|डैशबोर्ड|होम)/i.test(low))
      return [{ tool: 'navigate', tab: 'dashboard', scope }];
  }

  // 16. Status / Read Queries across every module
  const queryScope = /\b(personal|business|family)\b|পার্সোনাল|বিজনেস|ফ্যামিলি|पर्सनल|बिज़नेस|फैमिली/i.test(low)
    ? extractScope(low, 'personal')
    : undefined;

  if (/(credit|card|bill|কার্ড|বিল|कार्ड|बिल)/i.test(low))
    return [{ tool: 'query_status', topic: 'credit_cards', scope: queryScope }];
  if (/(loan|emi|লোন|ঋণ|लोन|ईएमआई)/i.test(low))
    return [{ tool: 'query_status', topic: 'loans', scope: queryScope }];
  if (/(due|people|give|need|পাওনা|দেনা|বকেয়া|बकाया|उधार|लेना|देना)/i.test(low))
    return [{ tool: 'query_status', topic: 'dues', scope: queryScope }];
  if (/(note|checklist|reminder|নোট|চেকলিস্ট|রিমাইন্ডার|नोट|चेकलिस्ट)/i.test(low))
    return [{ tool: 'query_status', topic: 'notes', scope: queryScope }];
  if (/(report|expense|income|spend|pnl|খরচ|আয়|আয়|রিপোর্ট|खर्च|आय|रिपोर्ट)/i.test(low))
    return [{ tool: 'query_status', topic: 'reports', scope: queryScope }];
  if (/(alert|whatsapp|অ্যালার্ট|হোয়াটসঅ্যাপ|अलर्ट)/i.test(low))
    return [{ tool: 'query_status', topic: 'alerts', scope: queryScope }];
  if (/(bank|balance|net worth|cash|money|ব্যাংক|ব্যালেন্স|টাকা|নেট ওয়ার্থ|হিসাব|बैंक|बैलेंस|पैसे|नेट वर्थ|हिसाब|koto|kitna)/i.test(low))
    return [{ tool: 'query_status', topic: 'overview', scope: queryScope }];

  return [{ tool: 'help' }];
}

export function planLocalCommand(
  rawText: string,
  ctx: AgentPlannerContext,
  now: Date = new Date(),
): AgentToolCall[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [{ tool: 'help' }];

  // Support compound multi-task commands separated by ';' or newlines
  const explicitParts = trimmed
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (explicitParts.length > 1) {
    const combined = explicitParts.slice(0, 4).flatMap((part) => planSingleCommand(part, ctx, now));
    const actionable = combined.filter((c) => c.tool !== 'help');
    if (actionable.length > 0) return actionable;
  }

  // Also support " and " / " এবং " / " और " when NOT a checklist/navigation phrase and both sides resolve cleanly
  if (
    !/\b(note|checklist|loans and dues|নোট|চেকলিস্ট|नोट|चेकलिस्ट)\b/i.test(trimmed) &&
    /\s+(?:and|এবং|और)\s+/i.test(trimmed)
  ) {
    const parts = trimmed
      .split(/\s+(?:and|এবং|और)\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts.length <= 3) {
      const mapped = parts.map((p) => planSingleCommand(p, ctx, now));
      if (mapped.every((arr) => arr.length > 0 && arr[0].tool !== 'help')) {
        return mapped.flat();
      }
    }
  }

  return planSingleCommand(trimmed, ctx, now);
}
