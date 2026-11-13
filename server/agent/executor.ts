import { DatabaseSync } from 'node:sqlite';
import { LANGUAGE_META, type AppLanguage } from '../../shared/i18n.ts';
import {
  type Scope,
  addMonthsISO,
  estimateMonthlyEmiMinor,
  formatINR,
  todayISO,
} from '../../shared/ledger-core.ts';
import { createAccount, listAccounts } from '../db/accounts-repo.ts';
import {
  confirmRecurringBill,
  contributeToSavingsGoal,
  createLoan,
  createPersonDue,
  createSavingsGoal,
  createTransaction,
  deleteTransaction,
  listLoans,
  listPeopleDues,
  listRecurringBills,
  listSavingsGoals,
  listTransactions,
  reconcileBankBalance,
  recordLoanPayment,
  settlePersonDue,
  upsertScopeBudget,
} from '../db/ledger-repo.ts';
import {
  computeDebtPayoffPlan,
  detectRecurringLeaks,
  summarizeGoalsAndRunway,
} from './intelligence.ts';
import { listNotes, toggleChecklistItem, upsertNote } from '../db/notes-repo.ts';
import { getDashboardSummary } from '../db/reports-repo.ts';
import {
  appendAgentHistory,
  getAgentApiKeySecret,
  getAppPreferences,
  updateAppPreferences,
} from '../db/settings-repo.ts';
import type { WhatsAppTransport } from '../whatsapp/bridge.ts';
import { runAlertCycle } from '../whatsapp/scheduler.ts';
import {
  type AgentPlannerContext,
  type AgentToolCall,
  detectCommandLanguage,
  planLocalCommand,
} from './nlu.ts';
import {
  type AdvisorBriefing,
  type AdvisorSuggestion,
  buildAdvisorBriefing,
  formatBriefingAsHumanReply,
} from './advisor.ts';
import { planWithOptionalLLM, transcribeAndDetectAudioWithLLM } from './llm.ts';

export interface AgentUiEffects {
  navigateTab?: 'dashboard' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault';
  scopeFilter?: Scope | 'all';
  setLanguage?: AppLanguage;
  mutatedData?: boolean;
}

export interface AgentExecutionResult {
  detectedLanguage: AppLanguage;
  systemLanguage: AppLanguage;
  requiresConfirmation: boolean;
  previewText: string;
  replyText: string;
  toolCalls: AgentToolCall[];
  actions: Array<{ tool: string; summary: string; ok: boolean }>;
  uiEffects: AgentUiEffects;
  briefing?: AdvisorBriefing;
  suggestions?: AdvisorSuggestion[];
}

function localizedScope(lang: AppLanguage, scope: Scope | 'general'): string {
  const map: Record<AppLanguage, Record<Scope | 'general', string>> = {
    en: { personal: 'Personal', business: 'Business', family: 'Family', general: 'General' },
    hi: { personal: 'पर्सनल', business: 'बिज़नेस', family: 'फ़ैमिली', general: 'सामान्य' },
    bn: { personal: 'পার্সোনাল', business: 'বিজনেস', family: 'ফ্যামিলি', general: 'সাধারণ' },
  };
  return map[lang][scope];
}

function localizedTabName(
  lang: AppLanguage,
  tab: 'dashboard' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault',
): string {
  const map: Record<AppLanguage, Record<string, string>> = {
    en: {
      dashboard: 'Dashboard',
      money: 'Money & Cards',
      loans_dues: 'Loans & Dues',
      reports: 'Reports',
      notes: 'Notes & Checklists',
      vault: 'Vault',
    },
    hi: {
      dashboard: 'डैशबोर्ड',
      money: 'पैसे और कार्ड',
      loans_dues: 'लोन और उधार',
      reports: 'रिपोर्ट्स',
      notes: 'नोट्स और चेकलिस्ट',
      vault: 'वॉल्ट',
    },
    bn: {
      dashboard: 'ড্যাশবোর্ড',
      money: 'টাকা ও কার্ড',
      loans_dues: 'ঋণ ও বকেয়া',
      reports: 'রিপোর্ট',
      notes: 'নোটস ও চেকলিস্ট',
      vault: 'ভল্ট',
    },
  };
  return map[lang][tab];
}

export function buildPlannerContext(db: DatabaseSync): AgentPlannerContext {
  return {
    accounts: listAccounts(db).map((a) => ({ id: a.id, name: a.name, type: a.type, scope: a.scope })),
    loans: listLoans(db)
      .filter((l) => l.status === 'active')
      .map((l) => ({
        id: l.id,
        name: l.name,
        counterparty: l.counterparty,
        scope: l.scope,
        emiMinor: l.emiMinor,
        remainingMinor: l.remainingMinor,
      })),
    dues: listPeopleDues(db)
      .filter((d) => d.status !== 'settled')
      .map((d) => ({
        id: d.id,
        personName: d.personName,
        direction: d.direction,
        remainingMinor: d.remainingMinor,
      })),
    recurringBills: listRecurringBills(db).map((r) => ({
      id: r.id,
      title: r.title,
      scope: r.scope,
      amountMinor: r.amountMinor,
    })),
    notes: listNotes(db).map((n) => ({
      id: n.id,
      title: n.title,
      checklist: n.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    })),
    goals: listSavingsGoals(db).map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      scope: g.scope,
      targetMinor: g.targetMinor,
      currentMinor: g.currentMinor,
    })),
  };
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
      if (c.tool === 'create_goal') {
        return `Create ${c.kind.replace('_', ' ')} "${c.title}" (${formatINR(c.targetMinor)})`;
      }
      if (c.tool === 'contribute_goal') {
        return `Add ${formatINR(c.amountMinor)} to goal "${c.goalTitleQuery}"`;
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

export async function processAgentCommand(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  input: {
    commandText: string;
    detectedLanguageOverride?: AppLanguage;
    confirmExecution?: boolean;
    pendingCalls?: AgentToolCall[];
    now?: Date;
  },
): Promise<AgentExecutionResult> {
  const now = input.now ?? new Date();
  const prefs = getAppPreferences(db);
  let systemLang: AppLanguage = prefs.systemLanguage;
  const detectedLang = input.detectedLanguageOverride ?? detectCommandLanguage(input.commandText);
  const ctx = buildPlannerContext(db);

  let toolCalls = input.pendingCalls;
  if (!toolCalls) {
    const secretCfg = getAgentApiKeySecret(db);
    if (secretCfg.provider !== 'local' && secretCfg.apiKey) {
      toolCalls =
        (await planWithOptionalLLM({
          provider: secretCfg.provider,
          apiKey: secretCfg.apiKey,
          model: secretCfg.model,
          commandText: input.commandText,
          systemLanguage: systemLang,
          ctx,
        })) ?? undefined;
    }
    if (!toolCalls) {
      toolCalls = planLocalCommand(input.commandText, ctx, now);
    }
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
          updateAppPreferences(db, { systemLanguage: call.language });
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
          const allAccs = listAccounts(db);
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
          createTransaction(db, {
            kind: call.kind,
            scope: call.scope,
            accountId: srcAcc.id,
            toAccountId: toAcc?.id ?? null,
            category: call.category,
            amountMinor: call.amountMinor,
            occurredAt: call.occurredAt,
            party: call.party,
            note: call.note,
            sourceRef: 'ai_agent',
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
          const allAccs = listAccounts(db, todayISO(now));
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
          createTransaction(db, {
            kind: 'transfer',
            scope: card.scope,
            accountId: bank.id,
            toAccountId: card.id,
            category: 'Credit Card Bill Payment',
            amountMinor,
            occurredAt: call.occurredAt,
            party: card.name,
            note: 'Paid via AI Agent',
            sourceRef: 'ai_agent',
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
          const allBanks = listAccounts(db).filter((a) => a.type === 'bank');
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
          reconcileBankBalance(db, bank.id, call.targetBalanceMinor, call.occurredAt);
          uiEffects.mutatedData = true;
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
          const acc = createAccount(db, {
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
          const due = createPersonDue(db, {
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
          const openDues = listPeopleDues(db).filter((d) => d.status !== 'settled');
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
          settlePersonDue(db, due.id, {
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
          const loan = createLoan(db, {
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
          const loans = listLoans(db).filter((l) => l.status === 'active');
          const loan = loans.find((l) => l.id === call.loanId) ?? loans[0];
          const bank = listAccounts(db).find((a) => a.type === 'bank' && (!call.bankId || a.id === call.bankId));
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
          recordLoanPayment(db, loan.id, { amountMinor: amt, accountId: bank.id, paidAt: call.paidAt });
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
          const bills = listRecurringBills(db);
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
          confirmRecurringBill(db, bill.id, call.paidAt);
          uiEffects.mutatedData = true;
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
          upsertScopeBudget(db, call.scope, call.monthlyLimitMinor);
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
          const note = upsertNote(db, null, {
            title: call.title,
            body: call.body,
            scope: call.scope,
            pinned: call.pinned,
            remindAt: null,
            checklist: call.checklistTexts.map((text) => ({ text, done: false })),
          });
          uiEffects.mutatedData = true;
          const count = note.checklist.length;
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
          const allNotes = listNotes(db);
          let matchedNoteId = call.noteId;
          let matchedItemId = call.itemId;
          let matchedText = call.itemQuery;
          const q = call.itemQuery.toLowerCase();

          if (!matchedItemId) {
            for (const n of allNotes) {
              const found = n.checklist.find((i) => i.text.toLowerCase().includes(q));
              if (found) {
                matchedNoteId = n.id;
                matchedItemId = found.id;
                matchedText = found.text;
                break;
              }
            }
          }

          if (!matchedNoteId || !matchedItemId) {
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

          toggleChecklistItem(db, matchedNoteId, matchedItemId, call.done);
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `চেকলিস্ট আইটেম "${matchedText}" সম্পন্ন হিসেবে চিহ্নিত হয়েছে।`
              : systemLang === 'hi'
                ? `चेकलिस्ट आइटम "${matchedText}" पूरा चिह्नित किया गया।`
                : `Marked checklist item "${matchedText}" as ${call.done ? 'done' : 'open'}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'check_alerts_now': {
          const res = await runAlertCycle(db, transport, now);
          const msg =
            systemLang === 'bn'
              ? `${res.evaluated}টি অ্যালার্ট যাচাই হয়েছে · WhatsApp পাঠানো: ${res.sentWhatsApp} · কিউ: ${res.queuedWhatsApp}।`
              : systemLang === 'hi'
                ? `${res.evaluated} अलर्ट जांचे गए · WhatsApp भेजे: ${res.sentWhatsApp} · कतार में: ${res.queuedWhatsApp}।`
                : `Checked ${res.evaluated} module alerts · ${res.sentWhatsApp} sent to WhatsApp · ${res.queuedWhatsApp} queued.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'advisor_briefing': {
          const briefing = buildAdvisorBriefing(db, systemLang, call.scope, now);
          const msg = formatBriefingAsHumanReply(briefing, systemLang, call.focus);
          attachedBriefing = briefing;
          attachedSuggestions = briefing.suggestions;
          replies.push(msg);
          actions.push({
            tool: 'advisor_briefing',
            summary: `${briefing.healthScore}/100 · ${briefing.whatsWrong.length} alerts`,
            ok: true,
          });
          break;
        }

        case 'archive_completed_notes': {
          const activeNotes = listNotes(db, { includeArchived: false });
          const doneNotes = activeNotes.filter(
            (n) => n.checklist.length > 0 && n.checklist.every((c) => c.done),
          );
          for (const n of doneNotes) {
            upsertNote(db, n.id, {
              title: n.title,
              body: n.body,
              scope: n.scope,
              color: n.color,
              pinned: n.pinned,
              archived: true,
              remindAt: n.remindAt,
              checklist: n.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
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
                ? `${doneNotes.length}টি সম্পূর্ণ হওয়া চেকলিস্ট আর্কাইভ করা হয়েছে যাতে আপনার বোর্ড পরিষ্কার থাকে।`
                : systemLang === 'hi'
                  ? `${doneNotes.length} पूरी हो चुकी चेकलिस्ट आर्काइव कर दी गई हैं ताकि आपका बोर्ड साफ़ रहे।`
                  : `Archived ${doneNotes.length} completed checklist(s) so your workspace stays clutter-free.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'detect_subscriptions': {
          const leaks = detectRecurringLeaks(db).filter((l) => !call.scope || l.scope === call.scope);
          const msg =
            leaks.length === 0
              ? systemLang === 'bn'
                ? 'কোনো অঘোষিত রিকারিং বা সাবস্ক্রিপশন খরচ পাওয়া যায়নি।'
                : systemLang === 'hi'
                  ? 'कोई अनट्रैक्ड सब्सक्रिप्शन या दोहराया जाने वाला खर्च नहीं मिला।'
                  : 'No untracked recurring subscriptions or repeated leaks detected right now.'
              : systemLang === 'bn'
                ? `${leaks.length}টি সম্ভাব্য সাবস্ক্রিপশন পাওয়া গেছে: ${leaks
                    .slice(0, 4)
                    .map((l) => `${l.title} (~${formatINR(l.latestAmountMinor)}/মাস${l.isPriceHike ? `, +${l.priceHikePct}% বৃদ্ধি` : ''})`)
                    .join(', ')}।`
                : systemLang === 'hi'
                  ? `${leaks.length} संभावित सब्सक्रिप्शन मिले: ${leaks
                      .slice(0, 4)
                      .map((l) => `${l.title} (~${formatINR(l.latestAmountMinor)}/माह${l.isPriceHike ? `, +${l.priceHikePct}% बढ़ोतरी` : ''})`)
                      .join(', ')}।`
                  : `Found ${leaks.length} untracked recurring payment(s): ${leaks
                      .slice(0, 4)
                      .map((l) => `${l.title} (~${formatINR(l.latestAmountMinor)}/mo, ${l.distinctMonths} mo${l.isPriceHike ? `, +${l.priceHikePct}% hike` : ''})`)
                      .join('; ')}. Open Money & Cards -> Recurring to track in 1 click.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: `${leaks.length} detected`, ok: true });
          break;
        }

        case 'debt_payoff_plan': {
          const plan = computeDebtPayoffPlan(db, {
            extraMonthlyMinor: call.extraMonthlyMinor,
            strategy: call.strategy,
          });
          if (plan.items.length === 0) {
            const msg =
              systemLang === 'bn'
                ? 'কোনো সক্রিয় ক্রেডিট কার্ড বা ঋণ বকেয়া নেই।'
                : systemLang === 'hi'
                  ? 'कोई सक्रिय लोन या क्रेडिट कार्ड बकाया नहीं है।'
                  : 'You have no active borrowed loans or credit card debt to schedule.';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: true });
            break;
          }
          const top = plan.items[0];
          const orderStr = plan.items.slice(0, 4).map((i) => `${i.payoffOrder}. ${i.name} (${formatINR(i.balanceMinor)} @ ${(i.aprBps / 100).toFixed(1)}%)`).join(' -> ');
          const msg =
            systemLang === 'bn'
              ? `${plan.strategy.toUpperCase()} পরিকল্পনা (${formatINR(plan.extraMonthlyMinor)}/মাস বাড়তি): আগে "${top.name}" মেটান। ${plan.planMonths} মাসে ঋণমুক্ত (${plan.monthsSaved} মাস সাশ্রয়) ও সুদ বাঁচবে ~${formatINR(plan.interestSavedMinor)}। ক্রম: ${orderStr}`
              : systemLang === 'hi'
                ? `${plan.strategy.toUpperCase()} योजना (${formatINR(plan.extraMonthlyMinor)}/माह अतिरिक्त): पहले "${top.name}" चुकाएं। ${plan.planMonths} माह में कर्ज मुक्त (${plan.monthsSaved} माह की बचत) और ~${formatINR(plan.interestSavedMinor)} ब्याज बचेगा। क्रम: ${orderStr}`
                : `${plan.strategy.toUpperCase()} Payoff Plan (+${formatINR(plan.extraMonthlyMinor)}/mo extra): target "${top.name}" first. Debt-free in ${plan.planMonths} mo (saves ${plan.monthsSaved} mo & ~${formatINR(plan.interestSavedMinor)} interest vs minimums). Order: ${orderStr}`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: `${plan.monthsSaved}m saved`, ok: true });
          break;
        }

        case 'create_goal': {
          const created = createSavingsGoal(db, {
            title: call.title,
            kind: call.kind,
            scope: call.scope,
            targetMinor: call.targetMinor,
          });
          uiEffects.mutatedData = true;
          const msg =
            systemLang === 'bn'
              ? `নতুন লক্ষ্য "${created.title}" (${formatINR(created.targetMinor)}) যোগ হয়েছে।`
              : systemLang === 'hi'
                ? `नया लक्ष्य "${created.title}" (${formatINR(created.targetMinor)}) बनाया गया।`
                : `Created ${created.kind.replace('_', ' ')} "${created.title}" with target ${formatINR(created.targetMinor)}.`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'contribute_goal': {
          const allGoals = listSavingsGoals(db);
          const q = call.goalTitleQuery.toLowerCase();
          const goal =
            allGoals.find((g) => g.id === call.goalId) ??
            allGoals.find((g) => q.includes(g.title.toLowerCase()) || g.title.toLowerCase().includes(q)) ??
            allGoals[0];
          if (!goal) {
            const msg =
              systemLang === 'bn'
                ? 'কোনো সেভিংস গোল বা রিজার্ভ পাওয়া যায়নি। আগে একটি গোল তৈরি করুন।'
                : systemLang === 'hi'
                  ? 'कोई सेविंग्स गोल नहीं मिला। कृपया पहले एक लक्ष्य बनाएं।'
                  : 'No savings goal or reserve exists yet. Create one first (e.g., "Create emergency fund goal 300000").';
            replies.push(msg);
            actions.push({ tool: call.tool, summary: msg, ok: false });
            break;
          }
          const updated = contributeToSavingsGoal(db, goal.id, {
            amountMinor: call.amountMinor,
            accountId: call.bankId ?? null,
            occurredAt: todayISO(now),
            recordAsExpense: false,
          });
          uiEffects.mutatedData = true;
          const pct = Math.min(100, Math.round((updated.goal.currentMinor / updated.goal.targetMinor) * 100));
          const msg =
            systemLang === 'bn'
              ? `"${goal.title}" লক্ষ্যে ${formatINR(call.amountMinor)} যোগ হয়েছে (${pct}% সম্পন্ন · ${formatINR(updated.goal.currentMinor)} / ${formatINR(updated.goal.targetMinor)})।`
              : systemLang === 'hi'
                ? `"${goal.title}" में ${formatINR(call.amountMinor)} जोड़े गए (${pct}% पूरा · ${formatINR(updated.goal.currentMinor)} / ${formatINR(updated.goal.targetMinor)})।`
                : `Added ${formatINR(call.amountMinor)} to "${goal.title}" (${pct}% · ${formatINR(updated.goal.currentMinor)} / ${formatINR(updated.goal.targetMinor)}).`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'goals_status': {
          const gs = summarizeGoalsAndRunway(db, todayISO(now));
          const runwayText =
            gs.emergencyRunwayMonths !== null ? `${gs.emergencyRunwayMonths} months` : 'N/A';
          const listStr = gs.goals
            .slice(0, 4)
            .map((g) => `${g.title}: ${formatINR(g.currentMinor)}/${formatINR(g.targetMinor)} (${g.progressPct}%)`)
            .join('; ');
          const msg =
            systemLang === 'bn'
              ? `জরুরি ক্যাশ রানওয়ে: ${runwayText} · মোট সংরক্ষিত: ${formatINR(gs.totalReservedMinor)} · অবশিষ্ট মুক্ত নগদ: ${formatINR(gs.freeUnreservedCashMinor)}।${listStr ? ` (${listStr})` : ''}`
              : systemLang === 'hi'
                ? `इमरजेंसी कैश रनवे: ${runwayText} · कुल आरक्षित: ${formatINR(gs.totalReservedMinor)} · मुक्त नकद: ${formatINR(gs.freeUnreservedCashMinor)}।${listStr ? ` (${listStr})` : ''}`
                : `Emergency Cash Runway: ${runwayText} · Reserved Goals & Taxes: ${formatINR(gs.totalReservedMinor)} · Free Unreserved Cash: ${formatINR(gs.freeUnreservedCashMinor)}.${listStr ? ` Goals: ${listStr}` : ' Create a goal or tax reserve anytime.'}`;
          replies.push(msg);
          actions.push({ tool: call.tool, summary: `Runway ${runwayText}`, ok: true });
          break;
        }

        case 'delete_last_transaction': {
          const latest = listTransactions(db, { limit: 1 })[0];
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
          deleteTransaction(db, latest.id);
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
          const dash = getDashboardSummary(db, call.scope, todayISO(now));
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
                .map((c) => `${c.name}: Due ${formatINR(c.cardCycle?.statementDueMinor ?? 0)} (${c.cardCycle?.nextDueDate})`)
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
            const notes = listNotes(db);
            const openTasks = notes.reduce((s, n) => s + n.checklist.filter((i) => !i.done).length, 0);
            msg =
              systemLang === 'bn'
                ? `মোট নোট ${notes.length}টি, পিন করা ${dash.pinnedNotes.length}টি, অসমাপ্ত চেকলিস্ট কাজ ${openTasks}টি।`
                : systemLang === 'hi'
                  ? `कुल नोट्स: ${notes.length}, पिन किए गए: ${dash.pinnedNotes.length}, अधूरे चेकलिस्ट कार्य: ${openTasks}।`
                  : `Total notes: ${notes.length}, Pinned: ${dash.pinnedNotes.length}, Open checklist items: ${openTasks}.`;
          } else {
            msg =
              systemLang === 'bn'
                ? `নেট ওয়ার্থ: ${formatINR(dash.netWorthMinor)} · ব্যাংকে নগদ: ${formatINR(dash.totalBankMinor)} (পার্সোনাল ${formatINR(dash.bankTotalsByScope.personal)}, বিজনেস ${formatINR(dash.bankTotalsByScope.business)}, ফ্যামিলি ${formatINR(dash.bankTotalsByScope.family)}) · এই মাসে আয় ${formatINR(dash.monthIncomeMinor)} ও খরচ ${formatINR(dash.monthExpenseMinor)}।`
                : systemLang === 'hi'
                  ? `नेट वर्थ: ${formatINR(dash.netWorthMinor)} · बैंक बैलेंस: ${formatINR(dash.totalBankMinor)} (पर्सनल ${formatINR(dash.bankTotalsByScope.personal)}, बिज़नेस ${formatINR(dash.bankTotalsByScope.business)}, फ़ैमिली ${formatINR(dash.bankTotalsByScope.family)}) · इस माह आय ${formatINR(dash.monthIncomeMinor)} व खर्च ${formatINR(dash.monthExpenseMinor)}।`
                  : `Net Worth: ${formatINR(dash.netWorthMinor)} · Bank Cash: ${formatINR(dash.totalBankMinor)} (Personal ${formatINR(dash.bankTotalsByScope.personal)}, Business ${formatINR(dash.bankTotalsByScope.business)}, Family ${formatINR(dash.bankTotalsByScope.family)}) · Month Income ${formatINR(dash.monthIncomeMinor)}, Expense ${formatINR(dash.monthExpenseMinor)}.`;
          }
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }

        case 'help': {
          const msg =
            systemLang === 'bn'
              ? 'আমি আপনার ব্যক্তিগত সহকারী ও অর্থনৈতিক পরামর্শদাতা: খরচ/আয়, কার্ড বিল, লোন-বকেয়া ও নোটস সামলানো ছাড়াও এখন আপনার অবস্থা যাচাই ("অবস্থা কেমন"), ভুল/ঝুঁকি খোঁজা ("কী ভুল"), ৩০ দিনের পূর্বাভাস ("ভবিষ্যৎ"), পরামর্শ ও চেকলিস্ট পরিষ্কার ("সম্পন্ন নোট আর্কাইভ") করতে পারি।'
              : systemLang === 'hi'
                ? 'मैं आपका पर्सनल असिस्टेंट और सलाहकार हूँ: खर्च/आय, कार्ड बिल, लोन-उधार और नोट्स के साथ अब मैं आपके काम की समीक्षा ("समीक्षा"), गड़बड़ी ("क्या गलत है"), 30-दिन का अनुमान ("भविष्य") व सलाह भी दे सकता हूँ।'
                : 'I act as your Personal Assistant & Financial Advisor: ask "assess my finances", "what\'s wrong?", "predict next 30 days", "give advice", "archive completed notes", or chain multiple commands with ";" in EN / HI / BN.';
          replies.push(msg);
          actions.push({ tool: call.tool, summary: msg, ok: true });
          break;
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      replies.push(errMsg);
      actions.push({ tool: call.tool, summary: errMsg, ok: false });
    }
  }

  const replyText = replies.join(' ');
  appendAgentHistory(db, {
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
    previewText: '',
    replyText,
    toolCalls,
    actions,
    uiEffects,
    briefing: attachedBriefing,
    suggestions: attachedSuggestions,
  };
}

export async function processAgentVoice(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  input: { audioBase64: string; mimeType: string; now?: Date },
): Promise<{ transcript: string; result: AgentExecutionResult }> {
  const secretCfg = getAgentApiKeySecret(db);
  if (secretCfg.provider === 'local' || !secretCfg.apiKey) {
    throw new Error('Configure a Gemini or OpenAI API key in Agent Settings to use cloud multi-language audio auto-detection.');
  }

  const transcribed = await transcribeAndDetectAudioWithLLM({
    provider: secretCfg.provider,
    apiKey: secretCfg.apiKey,
    model: secretCfg.model,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
  });

  if (!transcribed) {
    throw new Error('Could not transcribe audio. Check your microphone and API key in Agent Settings.');
  }

  const result = await processAgentCommand(db, transport, {
    commandText: transcribed.transcript,
    detectedLanguageOverride: transcribed.detectedLanguage,
    now: input.now,
  });

  return { transcript: transcribed.transcript, result };
}
