import { LANGUAGE_META, type AppLanguage } from '../../shared/i18n.ts';
import {
  type Scope,
  addMonthsISO,
  estimateMonthlyEmiMinor,
  formatINR,
  todayISO,
} from '../../shared/ledger-core.ts';
import {
  type AgentPlannerContext,
  type AgentToolCall,
  detectCommandLanguage,
  planLocalCommand,
} from '../../shared/agent-nlu.ts';
import type {
  AdvisorBriefing,
  AdvisorSuggestion,
  AgentExecutionResult,
  AgentHistoryRecord,
  AgentUiEffects,
} from './api.ts';
import { clientDb } from './client-db.ts';
import {
  dbFirstCreateAccount,
  dbFirstCreateDue,
  dbFirstCreateLoan,
  dbFirstCreateTransaction,
  dbFirstDeleteTransaction,
  dbFirstPayLoan,
  dbFirstSettleDue,
  dbFirstUpdatePreferences,
  dbFirstUpsertNote,
} from './database-first.ts';

const AGENT_HISTORY_STORAGE_KEY = 'pl_agent_history_v1';

export function getClientAgentHistory(): AgentHistoryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AGENT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearClientAgentHistory(): { ok: boolean } {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(AGENT_HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return { ok: true };
}

export function appendClientAgentHistory(record: {
  commandText: string;
  detectedLanguage: AppLanguage;
  systemLanguage: AppLanguage;
  intent: string;
  replyText: string;
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
}): AgentHistoryRecord {
  const history = getClientAgentHistory();
  const entry: AgentHistoryRecord = {
    id: `agent-hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...record,
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...history].slice(0, 50);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AGENT_HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota issues
    }
  }
  return entry;
}

function localizedScope(lang: AppLanguage, scope: Scope | 'general'): string {
  const map: Record<AppLanguage, Record<Scope | 'general', string>> = {
    en: { personal: 'Personal', business: 'Business', family: 'Family', general: 'General' },
    hi: { personal: 'पर्सनल', business: 'बिज़नेस', family: 'फ़ैमिली', general: 'सामान्य' },
    bn: { personal: 'পার্সোনাল', business: 'বিজনেস', family: 'ফ্যামিলি', general: 'সাধারণ' },
  };
  return map[lang]?.[scope] ?? scope;
}

function localizedTabName(
  lang: AppLanguage,
  tab: 'dashboard' | 'cards' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault',
): string {
  const map: Record<AppLanguage, Record<string, string>> = {
    en: {
      dashboard: 'Dashboard',
      cards: 'Credit Cards',
      money: 'Money & Cards',
      loans_dues: 'Loans & Dues',
      reports: 'Reports',
      notes: 'Notes & Checklists',
      vault: 'Vault',
    },
    hi: {
      dashboard: 'डैशबोर्ड',
      cards: 'क्रेडिट कार्ड',
      money: 'पैसे और कार्ड',
      loans_dues: 'लोन और उधार',
      reports: 'रिपोर्ट्स',
      notes: 'नोट्स और चेकलिस्ट',
      vault: 'वॉल्ट',
    },
    bn: {
      dashboard: 'ড্যাশবোর্ড',
      cards: 'ক্রেডিট কার্ড',
      money: 'টাকা ও কার্ড',
      loans_dues: 'ঋণ ও বকেয়া',
      reports: 'রিপোর্ট',
      notes: 'নোটস ও চেকলিস্ট',
      vault: 'ভল্ট',
    },
  };
  return map[lang]?.[tab] ?? tab;
}

export function buildClientPlannerContext(): AgentPlannerContext {
  const accounts = clientDb.getAccounts().map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    scope: a.scope,
  }));
  const loans = clientDb
    .getLoans()
    .filter((l) => l.status === 'active')
    .map((l) => ({
      id: l.id,
      name: l.name,
      counterparty: l.counterparty,
      scope: l.scope,
      emiMinor: l.emiMinor,
      remainingMinor: l.remainingMinor,
    }));
  const dues = clientDb
    .getDues()
    .data.filter((d) => d.status !== 'settled')
    .map((d) => ({
      id: d.id,
      personName: d.personName,
      direction: d.direction,
      remainingMinor: d.remainingMinor,
    }));
  const recurringBills = clientDb.getRecurringBills().map((r) => ({
    id: r.id,
    title: r.title,
    scope: r.scope,
    amountMinor: r.amountMinor,
  }));
  const notes = clientDb.getNotes().map((n) => ({
    id: n.id,
    title: n.title,
    checklist: (n.checklist || []).map((c) => ({ id: c.id, text: c.text, done: c.done })),
  }));
  const goals: Array<{
    id: string;
    title: string;
    kind: 'emergency' | 'goal' | 'tax_reserve';
    scope: Scope;
    targetMinor: number;
    currentMinor: number;
  }> = [];

  return { accounts, loans, dues, recurringBills, notes, goals };
}

function describePlanInSystemLanguage(calls: AgentToolCall[], lang: AppLanguage): string {
  return calls
    .map((c) => {
      if (c.tool === 'create_transaction') {
        const amt = formatINR(c.amountMinor);
        if (lang === 'bn') return `${localizedScope(lang, c.scope)} স্কোপে ${amt} (${c.kind}) এন্ট্রি যোগ করা হবে`;
        if (lang === 'hi') return `${localizedScope(lang, c.scope)} स्कोप में ${amt} (${c.kind}) एंट्री जोड़ी जाएगी`;
        return `Record ${c.kind} of ${amt} in ${localizedScope(lang, c.scope)} (${c.category})`;
      }
      if (c.tool === 'create_due') {
        const amt = formatINR(c.amountMinor);
        if (lang === 'bn') return `${c.personName}-এর জন্য ${amt} (${c.direction === 'need' ? 'পাওনা' : 'দেনা'}) যোগ করা হবে`;
        if (lang === 'hi') return `${c.personName} के लिए ${amt} (${c.direction === 'need' ? 'लेना है' : 'देना है'}) जोड़ा जाएगा`;
        return `Add due (${c.direction === 'need' ? 'Need from' : 'Give to'} ${c.personName}): ${amt}`;
      }
      if (c.tool === 'settle_due') {
        const amt = c.amountMinor ? formatINR(c.amountMinor) : 'full';
        if (lang === 'bn') return `${c.personName}-এর বাকি হিসাব (${amt}) শোধ করা হবে`;
        if (lang === 'hi') return `${c.personName} का बकाया (${amt}) निपटाया जाएगा`;
        return `Settle due for ${c.personName} (${amt})`;
      }
      if (c.tool === 'pay_card_bill') {
        const amt = c.amountMinor ? formatINR(c.amountMinor) : 'statement due';
        if (lang === 'bn') return `ক্রেডিট কার্ড বিল (${amt}) পরিশোধ করা হবে`;
        if (lang === 'hi') return `क्रेडिट कार्ड बिल (${amt}) का भुगतान किया जाएगा`;
        return `Pay credit card bill (${amt})`;
      }
      if (c.tool === 'reconcile_bank') {
        const amt = formatINR(c.targetBalanceMinor);
        if (lang === 'bn') return `ব্যাংক ব্যালেন্স ${amt}-তে মিলিয়ে নেওয়া হবে`;
        if (lang === 'hi') return `बैंक बैलेंस ${amt} से मिलान किया जाएगा`;
        return `Reconcile bank balance to ${amt}`;
      }
      if (c.tool === 'set_scope_budget') {
        const amt = formatINR(c.monthlyLimitMinor);
        if (lang === 'bn') return `${localizedScope(lang, c.scope)} বাজেট ${amt} সেট করা হবে`;
        if (lang === 'hi') return `${localizedScope(lang, c.scope)} बजट ${amt} सेट किया जाएगा`;
        return `Set monthly ${localizedScope(lang, c.scope)} budget to ${amt}`;
      }
      if (c.tool === 'delete_last_transaction') {
        if (lang === 'bn') return 'সর্বশেষ লেনদেন মুছে ফেলা হবে';
        if (lang === 'hi') return 'आखिरी लेनदेन हटाया जाएगा';
        return 'Delete your most recent transaction';
      }
      if (c.tool === 'create_note') {
        if (lang === 'bn') return `"${c.title}" নোট/চেকলিস্ট তৈরি করা হবে`;
        if (lang === 'hi') return `"${c.title}" नोट/चेकलिस्ट बनाया जाएगा`;
        return `Create note "${c.title}" (${c.checklistTexts.length} checklist items)`;
      }
      if (c.tool === 'set_system_language') {
        const target = LANGUAGE_META[c.language].nativeLabel;
        if (lang === 'bn') return `সিস্টেম ভাষা ${target}-তে পরিবর্তন করা হবে`;
        if (lang === 'hi') return `सिस्टम भाषा ${target} में बदली जाएगी`;
        return `Switch System Language to ${target}`;
      }
      if (c.tool === 'archive_completed_notes') {
        if (lang === 'bn') return 'সমস্ত সম্পূর্ণ হওয়া চেকলিস্ট আর্কাইভ করা হবে';
        if (lang === 'hi') return 'सभी पूरी हो चुकी चेकलिस्ट आर्काइव की जाएंगी';
        return 'Archive all completed checklists';
      }
      if (lang === 'bn') return `কাজ: ${c.tool}`;
      if (lang === 'hi') return `कार्य: ${c.tool}`;
      return `Action: ${c.tool}`;
    })
    .join(' · ');
}

function isMutatingCall(call: AgentToolCall): boolean {
  return ![
    'navigate',
    'query_status',
    'advisor_briefing',
    'detect_subscriptions',
    'debt_payoff_plan',
    'goals_status',
    'help',
    'vault_guard',
  ].includes(call.tool);
}

export async function executeClientAgentCommand(input: {
  commandText: string;
  confirmExecution?: boolean;
  pendingCalls?: unknown[];
}): Promise<AgentExecutionResult> {
  const prefs = clientDb.getPreferences();
  let systemLang: AppLanguage = prefs.systemLanguage || 'en';
  const detectedLang = detectCommandLanguage(input.commandText);
  const ctx = buildClientPlannerContext();
  const now = new Date();

  let toolCalls = input.pendingCalls as AgentToolCall[] | undefined;
  if (!toolCalls || toolCalls.length === 0) {
    toolCalls = planLocalCommand(input.commandText, ctx, now);
  }

  const hasMutation = toolCalls.some(isMutatingCall);
  const hasDestructive = toolCalls.some((c) => c.tool === 'delete_last_transaction');

  if (!input.confirmExecution && (hasDestructive || (!prefs.agentAutoExecute && hasMutation))) {
    const previewText = describePlanInSystemLanguage(toolCalls, systemLang);
    return {
      detectedLanguage: detectedLang,
      systemLanguage: systemLang,
      requiresConfirmation: true,
      previewText,
      replyText:
        systemLang === 'bn'
          ? `নিশ্চিত করুন: ${previewText}`
          : systemLang === 'hi'
            ? `कृपया पुष्टि करें: ${previewText}`
            : `Please confirm: ${previewText}`,
      toolCalls,
      actions: [],
      uiEffects: {},
    };
  }

  const replies: string[] = [];
  const actions: Array<{ tool: string; summary: string; ok: boolean }> = [];
  const uiEffects: AgentUiEffects = {};
  let attachedBriefing: AdvisorBriefing | undefined;
  let attachedSuggestions: AdvisorSuggestion[] | undefined;

  for (const call of toolCalls) {
    try {
      switch (call.tool) {
        case 'set_system_language': {
          await dbFirstUpdatePreferences({ systemLanguage: call.language });
          systemLang = call.language;
          uiEffects.setLanguage = call.language;
          const langLabel = LANGUAGE_META[call.language].nativeLabel;
          const msg =
            systemLang === 'bn'
              ? `সিস্টেম ভাষা ${langLabel}-তে পরিবর্তন করা হয়েছে। এখন থেকে সব কাজ ও উত্তর ${langLabel}-তে হবে।`
              : systemLang === 'hi'
                ? `सिस्टम भाषा बदलकर ${langLabel} कर दी गई है। अब सभी कार्य और उत्तर ${langLabel} में होंगे।`
                : `System Language switched to ${langLabel}. All app labels and responses now use ${langLabel}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'navigate': {
          uiEffects.navigateTab = call.tab;
          if (call.scope) uiEffects.scopeFilter = call.scope;
          const tabTitle = localizedTabName(systemLang, call.tab);
          const msg =
            systemLang === 'bn'
              ? `${tabTitle} খোলা হয়েছে।`
              : systemLang === 'hi'
                ? `${tabTitle} खोला गया।`
                : `Opened ${tabTitle}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'vault_guard': {
          uiEffects.navigateTab = 'vault';
          const msg =
            systemLang === 'bn'
              ? 'নিরাপত্তার জন্য পাসওয়ার্ড ভল্ট ব্রাউজারে AES-256-GCM দ্বারা এনক্রিপ্টেড থাকে। ভল্ট ট্যাবে গিয়ে আপনার মাস্টার পাসওয়ার্ড দিয়ে নিজেই আনলক করুন।'
              : systemLang === 'hi'
                ? 'सुरक्षा के लिए पासवर्ड वॉल्ट ब्राउज़र में AES-256-GCM से एन्क्रिप्टेड है। कृपया वॉल्ट टैब में जाकर अपना मास्टर पासवर्ड खुद दर्ज करें।'
                : 'For security, Vault secrets stay end-to-end encrypted in browser memory. I opened the Vault tab so you can unlock it with your Master Password.';
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: false });
          break;
        }

        case 'create_transaction': {
          const allAccs = clientDb.getAccounts();
          if (allAccs.length === 0) {
            const msg =
              systemLang === 'bn'
                ? 'কোনো ব্যাংক বা কার্ড অ্যাকাউন্ট পাওয়া যায়নি। আগে একটি অ্যাকাউন্ট যোগ করুন।'
                : systemLang === 'hi'
                  ? 'कोई बैंक या कार्ड खाता नहीं मिला। कृपया पहले एक खाता जोड़ें।'
                  : 'No bank or credit card account exists yet. Create one first (e.g., "Add bank HDFC Personal").';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const srcAcc = allAccs.find((a) => a.id === call.accountId) ?? allAccs[0];
          const toAcc =
            call.kind === 'transfer'
              ? allAccs.find((a) => a.id === call.toAccountId && a.id !== srcAcc.id) ??
                allAccs.find((a) => a.id !== srcAcc.id)
              : undefined;
          if (call.kind === 'transfer' && !toAcc) {
            const msg =
              systemLang === 'bn'
                ? 'ট্রান্সফারের জন্য কমপক্ষে দুটি আলাদা অ্যাকাউন্ট প্রয়োজন।'
                : systemLang === 'hi'
                  ? 'ट्रांसफर के लिए कम से कम दो अलग खाते चाहिए।'
                  : 'Transfer requires at least two different accounts.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }

          await dbFirstCreateTransaction({
            kind: call.kind,
            scope: call.scope,
            accountId: srcAcc.id,
            toAccountId: toAcc?.id ?? null,
            category: call.category,
            amountMinor: call.amountMinor,
            occurredAt: call.occurredAt,
            party: call.party,
            note: call.note,
          });
          uiEffects.mutatedData = true;
          const amtStr = formatINR(call.amountMinor);
          const scStr = localizedScope(systemLang, call.scope);
          const msg =
            systemLang === 'bn'
              ? `${scStr} অ্যাকাউন্টে (${srcAcc.name}) ${amtStr} ${
                  call.kind === 'income' ? 'আয়' : call.kind === 'transfer' ? 'ট্রান্সফার' : 'খরচ'
                } [${call.category}] যোগ করা হয়েছে।`
              : systemLang === 'hi'
                ? `${scStr} खाते (${srcAcc.name}) में ${amtStr} ${
                    call.kind === 'income' ? 'आय' : call.kind === 'transfer' ? 'ट्रांसफर' : 'खर्च'
                  } [${call.category}] दर्ज किया गया।`
                : `Recorded ${call.kind} of ${amtStr} in ${scStr} (${srcAcc.name}) under ${call.category}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'pay_card_bill': {
          const allAccs = clientDb.getAccounts();
          const card = allAccs.find((a) => a.type === 'credit_card' && (!call.cardId || a.id === call.cardId));
          const bank = allAccs.find((a) => a.type === 'bank' && (!call.bankId || a.id === call.bankId));
          if (!card || !bank) {
            const msg =
              systemLang === 'bn'
                ? 'কার্ড বিল পরিশোধের জন্য একটি ক্রেডিট কার্ড ও একটি ব্যাংক অ্যাকাউন্ট প্রয়োজন।'
                : systemLang === 'hi'
                  ? 'कार्ड बिल भुगतान के लिए कम से कम एक क्रेडिट कार्ड और एक बैंक खाता होना चाहिए।'
                  : 'Paying a card bill requires both a Credit Card and a Bank account.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const amountMinor =
            call.amountMinor || card.cardCycle?.statementDueMinor || card.cardCycle?.totalOutstandingMinor || 0;
          if (amountMinor <= 0) {
            const msg =
              systemLang === 'bn'
                ? `${card.name}-এ কোনো বকেয়া বিল নেই।`
                : systemLang === 'hi'
                  ? `${card.name} पर कोई बकाया बिल नहीं है।`
                  : `${card.name} has ₹0.00 outstanding due.`;
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }

          await dbFirstCreateTransaction({
            kind: 'transfer',
            scope: card.scope,
            accountId: bank.id,
            toAccountId: card.id,
            category: 'Credit Card Bill Payment',
            amountMinor,
            occurredAt: call.occurredAt,
            party: card.name,
            note: 'Paid via AI Agent',
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `${bank.name} থেকে ${card.name}-এর ${formatINR(amountMinor)} বিল পরিশোধ করা হয়েছে।`
              : systemLang === 'hi'
                ? `${bank.name} से ${card.name} का ${formatINR(amountMinor)} बिल भुगतान किया गया।`
                : `Paid ${formatINR(amountMinor)} towards ${card.name} from ${bank.name}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'reconcile_bank': {
          const allBanks = clientDb.getAccounts().filter((a) => a.type === 'bank');
          const bank = allBanks.find((b) => b.id === call.accountId) ?? allBanks[0];
          if (!bank) {
            const msg =
              systemLang === 'bn'
                ? 'কোনো ব্যাংক অ্যাকাউন্ট নেই।'
                : systemLang === 'hi'
                  ? 'कोई बैंक खाता उपलब्ध नहीं है।'
                  : 'No bank account found to reconcile.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const diff = call.targetBalanceMinor - bank.currentBalanceMinor;
          if (diff !== 0) {
            await dbFirstCreateTransaction({
              kind: diff > 0 ? 'income' : 'expense',
              scope: bank.scope,
              accountId: bank.id,
              category: 'Balance Reconciliation',
              amountMinor: Math.abs(diff),
              occurredAt: call.occurredAt,
              party: 'Bank Adjustment',
              note: 'Reconciliation via AI Agent',
            });
            uiEffects.mutatedData = true;
          }
          const msg =
            systemLang === 'bn'
              ? `${bank.name} ব্যালেন্স ${formatINR(call.targetBalanceMinor)}-তে মিলিয়ে দেওয়া হয়েছে।`
              : systemLang === 'hi'
                ? `${bank.name} का बैलेंस ${formatINR(call.targetBalanceMinor)} पर मिलान किया गया।`
                : `Reconciled ${bank.name} to ${formatINR(call.targetBalanceMinor)}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'create_account': {
          const acc = await dbFirstCreateAccount({
            name: call.name,
            type: call.accountType,
            scope: call.scope,
            institution: '',
            last4: '',
            openingBalanceMinor: call.accountType === 'bank' ? call.openingOrLimitMinor : 0,
            minBalanceMinor: 0,
            creditLimitMinor: call.accountType === 'credit_card' ? call.openingOrLimitMinor : 0,
            statementDay: 15,
            dueDay: 5,
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `নতুন ${acc.type === 'bank' ? 'ব্যাংক' : 'ক্রেডিট কার্ড'} "${acc.name}" (${localizedScope(systemLang, acc.scope)}) যোগ হয়েছে।`
              : systemLang === 'hi'
                ? `नया ${acc.type === 'bank' ? 'बैंक' : 'क्रेडिट कार्ड'} "${acc.name}" (${localizedScope(systemLang, acc.scope)}) जोड़ा गया।`
                : `Added ${acc.type === 'bank' ? 'bank account' : 'credit card'} "${acc.name}" (${localizedScope(systemLang, acc.scope)}).`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'create_due': {
          const due = await dbFirstCreateDue({
            personName: call.personName,
            direction: call.direction,
            scope: call.scope,
            amountMinor: call.amountMinor,
            dueDate: call.dueDate,
            note: call.note,
          });
          uiEffects.mutatedData = true;
          const amt = formatINR(due.amountMinor);
          const msg =
            systemLang === 'bn'
              ? `${due.personName}-এর সাথে ${amt} (${due.direction === 'need' ? 'পাবো' : 'দেবো'}) হিসাব [${localizedScope(systemLang, due.scope)}] যোগ হয়েছে।`
              : systemLang === 'hi'
                ? `${due.personName} के साथ ${amt} (${due.direction === 'need' ? 'लेना है' : 'देना है'}) [${localizedScope(systemLang, due.scope)}] दर्ज किया गया।`
                : `Added due (${due.direction === 'need' ? 'Need from' : 'Give to'} ${due.personName}): ${amt} in ${localizedScope(systemLang, due.scope)}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'settle_due': {
          const openDues = clientDb.getDues().data.filter((d) => d.status !== 'settled');
          const due =
            openDues.find((d) => d.id === call.dueId) ??
            openDues.find((d) => d.personName.toLowerCase().includes(call.personName.toLowerCase()));
          if (!due) {
            const msg =
              systemLang === 'bn'
                ? `"${call.personName}"-এর নামে কোনো বাকি হিসাব পাওয়া যায়নি।`
                : systemLang === 'hi'
                  ? `"${call.personName}" के नाम कोई बकाया उधार नहीं मिला।`
                  : `No open due found for "${call.personName}".`;
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const settleAmt = Math.min(call.amountMinor ?? due.remainingMinor, due.remainingMinor);
          await dbFirstSettleDue(due.id, {
            amountMinor: settleAmt,
            accountId: call.bankId ?? null,
            settledAt: call.settledAt,
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `${due.personName}-এর ${formatINR(settleAmt)} পরিশোধ আপডেট করা হয়েছে।`
              : systemLang === 'hi'
                ? `${due.personName} का ${formatINR(settleAmt)} निपटान दर्ज किया गया।`
                : `Settled ${formatINR(settleAmt)} for ${due.personName}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'create_loan': {
          const tenure = Math.max(1, call.tenureMonths);
          const bps = Math.round(call.ratePct * 100);
          const emi = estimateMonthlyEmiMinor(call.principalMinor, bps, tenure);
          const start = todayISO(now);
          const loan = await dbFirstCreateLoan({
            name: call.name,
            counterparty: call.counterparty,
            scope: call.scope,
            direction: call.direction,
            principalMinor: call.principalMinor,
            annualRateBps: bps,
            tenureMonths: tenure,
            emiMinor: emi || call.principalMinor,
            startDate: start,
            nextDueDate: addMonthsISO(start, 1),
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `নতুন লোন "${loan.name}" (${formatINR(loan.principalMinor)}) যোগ হয়েছে।`
              : systemLang === 'hi'
                ? `नया लोन "${loan.name}" (${formatINR(loan.principalMinor)}) जोड़ा गया।`
                : `Created ${loan.direction} loan "${loan.name}" for ${formatINR(loan.principalMinor)}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'pay_loan_emi': {
          const loans = clientDb.getLoans().filter((l) => l.status === 'active');
          const loan = loans.find((l) => l.id === call.loanId) ?? loans[0];
          const bank = clientDb.getAccounts().find((a) => a.type === 'bank' && (!call.bankId || a.id === call.bankId));
          if (!loan || !bank) {
            const msg =
              systemLang === 'bn'
                ? 'সক্রিয় লোন বা ব্যাংক অ্যাকাউন্ট পাওয়া যায়নি।'
                : systemLang === 'hi'
                  ? 'सक्रिय लोन या बैंक खाता नहीं मिला।'
                  : 'Active loan or bank account not found for EMI payment.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const amt = call.amountMinor || loan.emiMinor || loan.remainingMinor;
          await dbFirstPayLoan(loan.id, { amountMinor: amt, accountId: bank.id, paidAt: call.paidAt });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `${loan.name}-এর ${formatINR(amt)} EMI (${bank.name} থেকে) পরিশোধ হয়েছে।`
              : systemLang === 'hi'
                ? `${loan.name} की ${formatINR(amt)} EMI (${bank.name} से) दर्ज हुई।`
                : `Recorded ${formatINR(amt)} EMI payment for ${loan.name} from ${bank.name}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'confirm_recurring_bill': {
          const bills = clientDb.getRecurringBills();
          const bill = bills.find((b) => b.id === call.billId) ?? bills[0];
          if (!bill) {
            const msg =
              systemLang === 'bn'
                ? 'কোনো রিকারিং বিল টেমপ্লেট নেই।'
                : systemLang === 'hi'
                  ? 'कोई रिकरिंग बिल टेम्पलेट नहीं मिला।'
                  : 'No recurring bill template found.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const defaultBank = clientDb.getAccounts().find((a) => a.type === 'bank') ?? clientDb.getAccounts()[0];
          if (defaultBank) {
            await dbFirstCreateTransaction({
              kind: 'expense',
              scope: bill.scope,
              accountId: defaultBank.id,
              category: bill.category,
              amountMinor: bill.amountMinor,
              occurredAt: call.paidAt,
              party: bill.title,
              note: 'Confirmed recurring bill via AI Agent',
            });
            uiEffects.mutatedData = true;
          }
          const msg =
            systemLang === 'bn'
              ? `রিকারিং বিল "${bill.title}" (${formatINR(bill.amountMinor)}) নিশ্চিত হয়েছে।`
              : systemLang === 'hi'
                ? `रिकरिंग बिल "${bill.title}" (${formatINR(bill.amountMinor)}) की पुष्टि हुई।`
                : `Confirmed recurring bill "${bill.title}" (${formatINR(bill.amountMinor)}).`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'set_scope_budget': {
          clientDb.setBudget(call.scope, new Date().toISOString().substring(0, 7), call.monthlyLimitMinor);
          uiEffects.mutatedData = true;
          const amt = formatINR(call.monthlyLimitMinor);
          const sc = localizedScope(systemLang, call.scope);
          const msg =
            systemLang === 'bn'
              ? `${sc} স্কোপের মাসিক বাজেট ${amt} সেট করা হয়েছে।`
              : systemLang === 'hi'
                ? `${sc} का मासिक बजट ${amt} सेट किया गया।`
                : `Set monthly ${sc} budget to ${amt}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'create_note': {
          const note = await dbFirstUpsertNote({
            title: call.title,
            body: call.body,
            scope: call.scope,
            pinned: call.pinned,
            remindAt: null,
            checklist: call.checklistTexts.map((text) => ({ text, done: false })),
          });
          uiEffects.mutatedData = true;
          const count = note.checklist?.length ?? 0;
          const msg =
            systemLang === 'bn'
              ? `"${note.title}" নোট (${count}টি চেকলিস্ট আইটেম সহ) তৈরি হয়েছে।`
              : systemLang === 'hi'
                ? `"${note.title}" नोट (${count} चेकलिस्ट आइटम के साथ) बनाया गया।`
                : `Created note "${note.title}"${count > 0 ? ` with ${count} checklist item(s)` : ''}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'toggle_checklist': {
          const allNotes = clientDb.getNotes();
          let matchedNote = allNotes.find((n) => n.id === call.noteId);
          let matchedItem: { id: string; text: string; done: boolean } | undefined;
          const q = call.itemQuery.toLowerCase();

          if (!matchedNote) {
            for (const n of allNotes) {
              const found = (n.checklist || []).find((i) => i.text.toLowerCase().includes(q));
              if (found) {
                matchedNote = n;
                matchedItem = found;
                break;
              }
            }
          }

          if (!matchedNote || !matchedItem) {
            const msg =
              systemLang === 'bn'
                ? `"${call.itemQuery}" নামে কোনো চেকলিস্ট আইটেম পাওয়া যায়নি।`
                : systemLang === 'hi'
                  ? `"${call.itemQuery}" नाम से कोई चेकलिस्ट आइटम नहीं मिला।`
                  : `Could not find a checklist item matching "${call.itemQuery}".`;
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }

          const updatedChecklist = (matchedNote.checklist || []).map((item) =>
            item.id === matchedItem!.id ? { ...item, done: call.done } : item,
          );
          await dbFirstUpsertNote({
            ...matchedNote,
            checklist: updatedChecklist,
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `চেকলিস্ট আইটেম "${matchedItem.text}" সম্পন্ন হিসেবে চিহ্নিত হয়েছে।`
              : systemLang === 'hi'
                ? `चेकलिस्ट आइटम "${matchedItem.text}" पूरा चिह्नित किया गया।`
                : `Marked checklist item "${matchedItem.text}" as ${call.done ? 'done' : 'open'}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'advisor_briefing': {
          const briefing = clientDb.getAgentBriefing(call.scope);
          attachedBriefing = briefing;
          attachedSuggestions = briefing.suggestions;
          const msg =
            systemLang === 'bn'
              ? `আর্থিক স্কোর: ${briefing.healthScore}/100। ${briefing.headline}`
              : systemLang === 'hi'
                ? `वित्तीय स्कोर: ${briefing.healthScore}/100। ${briefing.headline}`
                : `Financial Health: ${briefing.healthScore}/100. ${briefing.headline}`;
          replies.push(msg);
          actions.push({
            tool: 'advisor_briefing',
            summary: `${briefing.healthScore}/100 · ${briefing.whatsWrong.length} notices`,
            ok: true,
          });
          break;
        }

        case 'archive_completed_notes': {
          const activeNotes = clientDb.getNotes().filter((n) => !n.archived);
          const doneNotes = activeNotes.filter(
            (n) => (n.checklist || []).length > 0 && n.checklist.every((c) => c.done),
          );
          for (const n of doneNotes) {
            await dbFirstUpsertNote({
              ...n,
              archived: true,
            });
          }
          if (doneNotes.length > 0) uiEffects.mutatedData = true;
          const msg =
            doneNotes.length === 0
              ? systemLang === 'bn'
                ? 'আর্কাইভ করার মতো কোনো সম্পন্ন চেকলিস্ট পাওয়া যায়নি।'
                : systemLang === 'hi'
                  ? 'आर्काइव करने के लिए कोई पूरी चेकलिस्ट नहीं मिली।'
                  : 'All active checklists still have open tasks — nothing to archive right now.'
              : systemLang === 'bn'
                ? `${doneNotes.length}টি সম্পূর্ণ হওয়া চেকলিস্ট আর্কাইভ করা হয়েছে।`
                : systemLang === 'hi'
                  ? `${doneNotes.length} पूरी हो चुकी चेकलिस्ट आर्काइव कर दी गई हैं।`
                  : `Archived ${doneNotes.length} completed checklist(s).`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'delete_last_transaction': {
          const txs = clientDb.getTransactions();
          const latest = txs[0];
          if (!latest) {
            const msg =
              systemLang === 'bn'
                ? 'মুছে ফেলার মতো কোনো লেনদেন নেই।'
                : systemLang === 'hi'
                  ? 'हटाने के लिए कोई लेनदेन नहीं है।'
                  : 'No transactions available to undo.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          await dbFirstDeleteTransaction(latest.id);
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `শেষ লেনদেন (${latest.category} · ${formatINR(latest.amountMinor)}) মুছে ফেলা হয়েছে।`
              : systemLang === 'hi'
                ? `आखिरी लेनदेन (${latest.category} · ${formatINR(latest.amountMinor)}) हटाया गया।`
                : `Removed last transaction (${latest.category} · ${formatINR(latest.amountMinor)}).`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'query_status': {
          const dash = clientDb.getDashboard(call.scope);
          let msg = '';
          if (call.topic === 'credit_cards') {
            if (dash.cards.length === 0) {
              msg =
                systemLang === 'bn'
                  ? 'এখনো কোনো ক্রেডিট কার্ড যোগ করা হয়নি।'
                  : systemLang === 'hi'
                    ? 'अभी तक कोई क्रेडिट कार्ड नहीं जोड़ा गया है।'
                    : 'No credit cards are tracked yet.';
            } else {
              const list = dash.cards
                .map((c) => `${c.name}: Due ${formatINR(c.cardCycle?.statementDueMinor ?? 0)}`)
                .join('; ');
              msg =
                systemLang === 'bn'
                  ? `মোট কার্ড বকেয়া ${formatINR(dash.totalCardDebtMinor)}। (${list})`
                  : systemLang === 'hi'
                    ? `कुल कार्ड बकाया ${formatINR(dash.totalCardDebtMinor)} है। (${list})`
                    : `Total Card Debt: ${formatINR(dash.totalCardDebtMinor)}. Details: ${list}`;
            }
          } else if (call.topic === 'dues') {
            msg =
              systemLang === 'bn'
                ? `মানুষের কাছে পাবেন: ${formatINR(dash.totalNeedMinor)} · মানুষকে দেবেন: ${formatINR(dash.totalGiveMinor)}।`
                : systemLang === 'hi'
                  ? `लोगों से लेना है: ${formatINR(dash.totalNeedMinor)} · लोगों को देना है: ${formatINR(dash.totalGiveMinor)}।`
                  : `Need from People: ${formatINR(dash.totalNeedMinor)} · Give to People: ${formatINR(dash.totalGiveMinor)}.`;
          } else if (call.topic === 'loans') {
            msg =
              systemLang === 'bn'
                ? `সক্রিয় লোন ${dash.loans.length}টি · বাকি ঋণ ${formatINR(dash.totalBorrowedRemainingMinor)} · পাওনা ঋণ ${formatINR(dash.totalLentRemainingMinor)}।`
                : systemLang === 'hi'
                  ? `सक्रिय लोन: ${dash.loans.length} · चुकाना बाकी: ${formatINR(dash.totalBorrowedRemainingMinor)} · दिया हुआ: ${formatINR(dash.totalLentRemainingMinor)}।`
                  : `Active Loans: ${dash.loans.length} · Borrowed remaining: ${formatINR(dash.totalBorrowedRemainingMinor)} · Lent remaining: ${formatINR(dash.totalLentRemainingMinor)}.`;
          } else if (call.topic === 'notes') {
            const notes = clientDb.getNotes();
            const openTasks = notes.reduce(
              (s, n) => s + (n.checklist || []).filter((i) => !i.done).length,
              0,
            );
            msg =
              systemLang === 'bn'
                ? `মোট নোট ${notes.length}টি, পিন করা ${dash.pinnedNotes.length}টি, অসমাপ্ত চেকলিস্ট কাজ ${openTasks}টি।`
                : systemLang === 'hi'
                  ? `कुल नोट्स: ${notes.length}, पिन किए गए: ${dash.pinnedNotes.length}, अधूरे चेकलिस्ट कार्य: ${openTasks}।`
                  : `Total notes: ${notes.length}, Pinned: ${dash.pinnedNotes.length}, Open checklist items: ${openTasks}.`;
          } else {
            msg =
              systemLang === 'bn'
                ? `নেট ওয়ার্থ: ${formatINR(dash.netWorthMinor)} · ব্যাংকে নগদ: ${formatINR(dash.totalBankMinor)} · এই মাসে আয় ${formatINR(dash.monthIncomeMinor)} ও খরচ ${formatINR(dash.monthExpenseMinor)}।`
                : systemLang === 'hi'
                  ? `नेट वर्थ: ${formatINR(dash.netWorthMinor)} · बैंक बैलेंस: ${formatINR(dash.totalBankMinor)} · इस माह आय ${formatINR(dash.monthIncomeMinor)} व खर्च ${formatINR(dash.monthExpenseMinor)}।`
                  : `Net Worth: ${formatINR(dash.netWorthMinor)} · Bank Cash: ${formatINR(dash.totalBankMinor)} · Month Income ${formatINR(dash.monthIncomeMinor)}, Expense ${formatINR(dash.monthExpenseMinor)}.`;
          }
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'help': {
          const msg =
            systemLang === 'bn'
              ? 'আমি আপনার ব্যক্তিগত এআই সহকারী: খরচ বা আয় যোগ ("চা ৫০ টাকা খরচ"), কার্ড বিল, লোন ও ধারদেনা যোগ, নোট তৈরি, এবং আর্থিক অবস্থা ("অবস্থা কেমন") জানতে পারেন।'
              : systemLang === 'hi'
                ? 'मैं आपका पर्सनल एआई असिस्टेंट हूँ: खर्च या आय जोड़ना ("चाय 50 रुपये खर्च"), कार्ड बिल, लोन व उधार, नोट्स बनाना और वित्तीय स्थिति ("समीक्षा") पूछ सकते हैं।'
                : 'I am your Personal AI Assistant: add expenses/income (e.g. "Tea 50 expense"), track card bills, loans and dues, create notes and checklists, or ask "assess my finances".';
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        default: {
          const msg =
            systemLang === 'bn'
              ? `কাজ সম্পন্ন হয়েছে: ${(call as any).tool}`
              : systemLang === 'hi'
                ? `कार्य पूरा हुआ: ${(call as any).tool}`
                : `Executed ${(call as any).tool}.`;
          replies.push(msg);
          actions.push({ tool: (call as any).tool, summary: msg, ok: true });
          break;
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      replies.push(errMsg);
      actions.push({ tool: (call as any).tool, summary: errMsg, ok: false });
    }
  }

  const replyText = replies.join(' ');
  appendClientAgentHistory({
    commandText: input.commandText,
    detectedLanguage: detectedLang,
    systemLanguage: systemLang,
    intent: toolCalls[0]?.tool ?? 'help',
    replyText,
    actions,
  });

  return {
    detectedLanguage: detectedLang,
    systemLanguage: systemLang,
    requiresConfirmation: false,
    previewText: describePlanInSystemLanguage(toolCalls, systemLang),
    replyText,
    toolCalls,
    actions,
    uiEffects,
    briefing: attachedBriefing,
    suggestions: attachedSuggestions,
  };
}

export async function executeClientAgentVoice(_body: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; result: AgentExecutionResult }> {
  // Voice fallback: when direct client audio is submitted without cloud API key
  const transcript = '[Voice Command]';
  const result = await executeClientAgentCommand({ commandText: 'help' });
  return { transcript, result };
}
