import { DatabaseSync } from 'node:sqlite';
import type { AppLanguage } from '../../shared/i18n.ts';
import {
  SCOPES,
  type Scope,
  daysBetweenISO,
  formatINR,
  todayISO,
} from '../../shared/ledger-core.ts';
import { getAlertSettings } from '../db/alerts-repo.ts';
import {
  listInvestments,
  listLoans,
  listPeopleDues,
  listRecurringBills,
} from '../db/ledger-repo.ts';
import { listNotes } from '../db/notes-repo.ts';
import { getDashboardSummary } from '../db/reports-repo.ts';
import { listVaultEntries } from '../db/vault-repo.ts';
import {
  computeDebtPayoffPlan,
  detectRecurringLeaks,
  summarizeGoalsAndRunway,
} from './intelligence.ts';

export type AdvisorSeverity = 'urgent' | 'warning' | 'info' | 'positive';
export type AdvisorFocus = 'full' | 'wrong' | 'predict' | 'suggest' | 'tasks';

export interface AdvisorFinding {
  id: string;
  module: string;
  severity: AdvisorSeverity;
  title: string;
  detail: string;
}

export interface AdvisorSuggestion {
  id: string;
  label: string;
  detail: string;
  commandText: string;
  severity: AdvisorSeverity;
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
  totalInvestmentsMinor: number;
  whatsWrong: AdvisorFinding[];
  predictions: AdvisorFinding[];
  suggestions: AdvisorSuggestion[];
}

function localizedScopeName(lang: AppLanguage, scope: Scope): string {
  if (lang === 'bn') return scope === 'personal' ? 'পার্সোনাল' : scope === 'business' ? 'বিজনেস' : 'ফ্যামিলি';
  if (lang === 'hi') return scope === 'personal' ? 'पर्सनल' : scope === 'business' ? 'बिज़नेस' : 'फ़ैमिली';
  return scope === 'personal' ? 'Personal' : scope === 'business' ? 'Business' : 'Family';
}

function t(lang: AppLanguage, en: string, hi: string, bn: string): string {
  return lang === 'bn' ? bn : lang === 'hi' ? hi : en;
}

export function buildAdvisorBriefing(
  db: DatabaseSync,
  lang: AppLanguage,
  scopeFilter?: Scope,
  now: Date = new Date(),
): AdvisorBriefing {
  const refDate = todayISO(now);
  const monthPrefix = refDate.slice(0, 7);
  const dash = getDashboardSummary(db, scopeFilter, refDate);
  const settings = getAlertSettings(db);
  const recurring = listRecurringBills(db).filter(
    (r) => r.active && (!scopeFilter || r.scope === scopeFilter),
  );
  const loans = listLoans(db).filter(
    (l) => l.status === 'active' && (!scopeFilter || l.scope === scopeFilter),
  );
  const openDues = listPeopleDues(db).filter(
    (d) => d.status !== 'settled' && (!scopeFilter || d.scope === scopeFilter),
  );
  const activeNotes = listNotes(db, { includeArchived: false });
  const vaultEntries = listVaultEntries(db);

  const whatsWrong: AdvisorFinding[] = [];
  const predictions: AdvisorFinding[] = [];
  const suggestions: AdvisorSuggestion[] = [];
  let penalty = 0;

  // 1. Bank Balance Safety Floor Breaches
  for (const bank of dash.banks) {
    if (bank.minBalanceMinor > 0 && bank.currentBalanceMinor < bank.minBalanceMinor) {
      const shortfall = bank.minBalanceMinor - bank.currentBalanceMinor;
      penalty += 15;
      whatsWrong.push({
        id: `wrong-bank-${bank.id}`,
        module: 'banks',
        severity: 'urgent',
        title: t(
          lang,
          `${bank.name} is ${formatINR(shortfall)} below safety floor`,
          `${bank.name} सुरक्षित सीमा से ${formatINR(shortfall)} कम है`,
          `${bank.name} নিরাপদ সীমার চেয়ে ${formatINR(shortfall)} কম আছে`,
        ),
        detail: t(
          lang,
          `Current: ${formatINR(bank.currentBalanceMinor)} vs minimum target ${formatINR(bank.minBalanceMinor)}.`,
          `मौजूदा: ${formatINR(bank.currentBalanceMinor)} · न्यूनतम लक्ष्य: ${formatINR(bank.minBalanceMinor)}।`,
          `বর্তমান: ${formatINR(bank.currentBalanceMinor)} · ন্যূনতম লক্ষ্য: ${formatINR(bank.minBalanceMinor)}।`,
        ),
      });
    }
  }

  // 2. Credit Card Bills Due Soon / Overdue & Utilization Risk
  let upcomingCardBills30dMinor = 0;
  for (const card of dash.cards) {
    const cycle = card.cardCycle;
    if (!cycle) continue;
    if (cycle.statementDueMinor > 0) {
      upcomingCardBills30dMinor += cycle.statementDueMinor;
      if (cycle.daysUntilDue <= settings.leadDaysCreditCard + 2) {
        const overdue = cycle.daysUntilDue < 0;
        penalty += overdue ? 18 : 10;
        whatsWrong.push({
          id: `wrong-card-due-${card.id}`,
          module: 'credit_cards',
          severity: overdue ? 'urgent' : 'warning',
          title: overdue
            ? t(
                lang,
                `${card.name} bill overdue by ${Math.abs(cycle.daysUntilDue)}d (${formatINR(cycle.statementDueMinor)})`,
                `${card.name} बिल ${Math.abs(cycle.daysUntilDue)} दिन से ओवरड्यू (${formatINR(cycle.statementDueMinor)})`,
                `${card.name} বিল ${Math.abs(cycle.daysUntilDue)} দিন ওভারডিউ (${formatINR(cycle.statementDueMinor)})`,
              )
            : t(
                lang,
                `${card.name} bill ${formatINR(cycle.statementDueMinor)} due in ${cycle.daysUntilDue}d`,
                `${card.name} का ${formatINR(cycle.statementDueMinor)} बिल ${cycle.daysUntilDue} दिन में देय है`,
                `${card.name}-এর ${formatINR(cycle.statementDueMinor)} বিল ${cycle.daysUntilDue} দিনে পরিশোধযোগ্য`,
              ),
          detail: t(
            lang,
            `Due date ${cycle.nextDueDate}. Late payment triggers high interest & fee penalties.`,
            `अंतिम तारीख ${cycle.nextDueDate}। देरी पर ब्याज व लेट फीस लग सकती है।`,
            `শেষ তারিখ ${cycle.nextDueDate}। দেরি হলে সুদ ও লেট ফি লাগতে পারে।`,
          ),
        });
        suggestions.push({
          id: `sug-pay-card-${card.id}`,
          label: t(
            lang,
            `Pay ${card.name} (${formatINR(cycle.statementDueMinor)})`,
            `${card.name} बिल (${formatINR(cycle.statementDueMinor)}) भरें`,
            `${card.name} বিল (${formatINR(cycle.statementDueMinor)}) দিন`,
          ),
          detail: t(
            lang,
            `Clear billed statement from your linked bank to protect credit score.`,
            `क्रेडिट स्कोर बचाने के लिए बैंक से बिल का भुगतान करें।`,
            `ক্রেডিট স্কোর ঠিক রাখতে ব্যাংক থেকে বিল শোধ করুন।`,
          ),
          commandText: `Pay ${card.name} bill ${Math.round(cycle.statementDueMinor / 100)}`,
          severity: overdue ? 'urgent' : 'warning',
        });
      }
    }
    if (card.creditLimitMinor > 0 && cycle.utilizationPct >= settings.cardUtilizationThresholdPct) {
      penalty += 10;
      whatsWrong.push({
        id: `wrong-card-util-${card.id}`,
        module: 'credit_cards',
        severity: 'warning',
        title: t(
          lang,
          `${card.name} utilization is high at ${cycle.utilizationPct}%`,
          `${card.name} कार्ड का उपयोग ${cycle.utilizationPct}% तक पहुँच गया है`,
          `${card.name} কার্ড ব্যবহার ${cycle.utilizationPct}%-এ পৌঁছেছে`,
        ),
        detail: t(
          lang,
          `Outstanding ${formatINR(cycle.totalOutstandingMinor)} of ${formatINR(card.creditLimitMinor)} limit.`,
          `सीमा ${formatINR(card.creditLimitMinor)} में से ${formatINR(cycle.totalOutstandingMinor)} बकाया है।`,
          `${formatINR(card.creditLimitMinor)} সীমার মধ্যে ${formatINR(cycle.totalOutstandingMinor)} বাকি।`,
        ),
      });
    }
  }

  // 3. Monthly Budget Overrun / High Pace Prediction
  const dayOfMonth = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthExpenseMinor = Math.round((dash.monthExpenseMinor / dayOfMonth) * daysInMonth);

  const pastMonths = dash.sixMonthTrend.slice(0, -1).filter((m) => m.expenseMinor > 0);
  const avgMonthlyExpenseMinor =
    pastMonths.length > 0
      ? Math.round(pastMonths.reduce((sum, m) => sum + m.expenseMinor, 0) / pastMonths.length)
      : dash.monthExpenseMinor;

  for (const b of dash.budgets) {
    if (b.monthlyLimitMinor <= 0) continue;
    const spentPct = Math.round((b.spentMinor / b.monthlyLimitMinor) * 100);
    const projectedScopeMinor = Math.round((b.spentMinor / dayOfMonth) * daysInMonth);
    const scopeName = localizedScopeName(lang, b.scope);
    if (spentPct >= 100) {
      penalty += 14;
      whatsWrong.push({
        id: `wrong-budget-over-${b.scope}`,
        module: 'budgets',
        severity: 'urgent',
        title: t(
          lang,
          `${scopeName} budget exceeded (${spentPct}%)`,
          `${scopeName} बजट सीमा से पार (${spentPct}%)`,
          `${scopeName} বাজেট সীমা ছাড়িয়েছে (${spentPct}%)`,
        ),
        detail: t(
          lang,
          `Spent ${formatINR(b.spentMinor)} against ${formatINR(b.monthlyLimitMinor)} limit.`,
          `सीमा ${formatINR(b.monthlyLimitMinor)} के मुकाबले ${formatINR(b.spentMinor)} खर्च हो चुका है।`,
          `${formatINR(b.monthlyLimitMinor)} সীমার বিপরীতে ${formatINR(b.spentMinor)} খরচ হয়েছে।`,
        ),
      });
    } else if (projectedScopeMinor > b.monthlyLimitMinor && dayOfMonth >= 3) {
      penalty += 8;
      predictions.push({
        id: `pred-budget-pace-${b.scope}`,
        module: 'budgets',
        severity: 'warning',
        title: t(
          lang,
          `${scopeName} spend pacing to reach ${formatINR(projectedScopeMinor)}`,
          `${scopeName} खर्च की रफ़्तार महीने के अंत तक ${formatINR(projectedScopeMinor)} तक जा सकती है`,
          `${scopeName} খরচের গতিতে মাস শেষে ${formatINR(projectedScopeMinor)} হতে পারে`,
        ),
        detail: t(
          lang,
          `Currently at ${spentPct}% of your ${formatINR(b.monthlyLimitMinor)} budget on day ${dayOfMonth}/${daysInMonth}. Slow daily spend to stay safe.`,
          `दिन ${dayOfMonth}/${daysInMonth} तक ${formatINR(b.monthlyLimitMinor)} बजट का ${spentPct}% खर्च हो चुका है।`,
          `মাসের ${dayOfMonth}/${daysInMonth} দিনে ${formatINR(b.monthlyLimitMinor)} বাজেটের ${spentPct}% খরচ হয়েছে।`,
        ),
      });
    }
  }

  // Category Budgets overrun & pacing checks
  for (const cb of dash.categoryBudgets ?? []) {
    if (cb.monthlyLimitMinor <= 0) continue;
    const spentPct = Math.round((cb.spentMinor / cb.monthlyLimitMinor) * 100);
    const projectedMinor = Math.round((cb.spentMinor / dayOfMonth) * daysInMonth);
    const scopeName = localizedScopeName(lang, cb.scope);
    if (spentPct >= 100) {
      penalty += 10;
      whatsWrong.push({
        id: `wrong-cat-budget-over-${cb.id}`,
        module: 'budgets',
        severity: 'urgent',
        title: t(
          lang,
          `${cb.category} (${scopeName}) budget exceeded (${spentPct}%)`,
          `${cb.category} (${scopeName}) बजट सीमा से पार (${spentPct}%)`,
          `${cb.category} (${scopeName}) বাজেট সীমা ছাড়িয়েছে (${spentPct}%)`,
        ),
        detail: t(
          lang,
          `Spent ${formatINR(cb.spentMinor)} against ${formatINR(cb.monthlyLimitMinor)} limit.`,
          `सीमा ${formatINR(cb.monthlyLimitMinor)} के मुकाबले ${formatINR(cb.spentMinor)} खर्च हो चुका है।`,
          `${formatINR(cb.monthlyLimitMinor)} সীমার বিপরীতে ${formatINR(cb.spentMinor)} খরচ হয়েছে।`,
        ),
      });
    } else if (projectedMinor > cb.monthlyLimitMinor && dayOfMonth >= 3 && spentPct >= 80) {
      penalty += 6;
      predictions.push({
        id: `pred-cat-budget-pace-${cb.id}`,
        module: 'budgets',
        severity: 'warning',
        title: t(
          lang,
          `${cb.category} spend pacing to reach ${formatINR(projectedMinor)}`,
          `${cb.category} खर्च की रफ़्तार महीने के अंत तक ${formatINR(projectedMinor)} तक जा सकती है`,
          `${cb.category} খরচের গতিতে মাস শেষে ${formatINR(projectedMinor)} হতে পারে`,
        ),
        detail: t(
          lang,
          `Currently at ${spentPct}% of your ${formatINR(cb.monthlyLimitMinor)} budget on day ${dayOfMonth}/${daysInMonth}.`,
          `दिन ${dayOfMonth}/${daysInMonth} तक ${formatINR(cb.monthlyLimitMinor)} बजट का ${spentPct}% खर्च हो चुका है।`,
          `মাসের ${dayOfMonth}/${daysInMonth} দিনে ${formatINR(cb.monthlyLimitMinor)} বাজেটের ${spentPct}% খরচ হয়েছে।`,
        ),
      });
    }
  }

  // Recommend setting a budget if active scopes have spending but no budgets
  for (const s of SCOPES) {
    if (scopeFilter && scopeFilter !== s) continue;
    const hasBudget = dash.budgets.some((b) => b.scope === s);
    const spent = dash.allMonthExpenseByScope[s] ?? 0;
    if (!hasBudget && spent > 0) {
      const suggestedCap = Math.max(500_000, Math.ceil((spent * 1.2) / 500_000) * 500_000);
      const sName = localizedScopeName(lang, s);
      suggestions.push({
        id: `sug-set-budget-${s}`,
        label: t(
          lang,
          `Set ${sName} budget (${formatINR(suggestedCap, { decimals: false })})`,
          `${sName} बजट सेट करें (${formatINR(suggestedCap, { decimals: false })})`,
          `${sName} বাজেট সেট করুন (${formatINR(suggestedCap, { decimals: false })})`,
        ),
        detail: t(
          lang,
          `You already spent ${formatINR(spent)} in ${sName} without a guardrail cap.`,
          `${sName} में बिना बजट सीमा के ${formatINR(spent)} खर्च हो चुका है।`,
          `কোনো বাজেট ছাড়াই ${sName}-এ ${formatINR(spent)} খরচ হয়েছে।`,
        ),
        commandText: `Set ${s} monthly budget ${Math.round(suggestedCap / 100)}`,
        severity: 'info',
      });
    }
  }

  // 4. Loans & People Dues Stress + 30-Day Inflow/Outflow Computation
  let upcomingEmis30dMinor = 0;
  for (const loan of loans) {
    const delta = daysBetweenISO(refDate, loan.nextDueDate);
    const amt = loan.emiMinor > 0 ? loan.emiMinor : loan.remainingMinor;
    if (delta <= 30) {
      if (loan.direction === 'borrowed') upcomingEmis30dMinor += amt;
    }
    if (delta <= 0) {
      penalty += 12;
      whatsWrong.push({
        id: `wrong-loan-${loan.id}`,
        module: 'loans',
        severity: 'urgent',
        title: t(
          lang,
          `${loan.name} EMI due now (${formatINR(amt)})`,
          `${loan.name} की ${formatINR(amt)} EMI देय है`,
          `${loan.name}-এর ${formatINR(amt)} EMI এখন পরিশোধযোগ্য`,
        ),
        detail: t(
          lang,
          `${loan.counterparty} · Due ${loan.nextDueDate}.`,
          `${loan.counterparty} · देय तिथि ${loan.nextDueDate}।`,
          `${loan.counterparty} · তারিখ ${loan.nextDueDate}।`,
        ),
      });
      if (loan.direction === 'borrowed') {
        suggestions.push({
          id: `sug-emi-${loan.id}`,
          label: t(lang, `Pay ${loan.name} EMI`, `${loan.name} EMI भरें`, `${loan.name} EMI দিন`),
          detail: t(
            lang,
            `Record ${formatINR(amt)} payment to stay on schedule.`,
            `समय पर रहने के लिए ${formatINR(amt)} EMI दर्ज करें।`,
            `সময়মতো কিস্তি রাখতে ${formatINR(amt)} পরিশোধ করুন।`,
          ),
          commandText: `Pay loan EMI ${loan.name}`,
          severity: 'urgent',
        });
      }
    }
  }

  let dueGive30dMinor = 0;
  let dueNeed30dMinor = 0;
  for (const d of openDues) {
    const delta = d.dueDate ? daysBetweenISO(refDate, d.dueDate) : 15;
    if (delta <= 30) {
      if (d.direction === 'give') dueGive30dMinor += d.remainingMinor;
      else dueNeed30dMinor += d.remainingMinor;
    }
    if (d.dueDate && delta < 0) {
      penalty += 7;
      whatsWrong.push({
        id: `wrong-due-${d.id}`,
        module: 'people_dues',
        severity: 'warning',
        title: t(
          lang,
          `Overdue: ${d.direction === 'need' ? 'Collect from' : 'Pay'} ${d.personName} (${formatINR(d.remainingMinor)})`,
          `ओवरड्यू: ${d.personName} से ${d.direction === 'need' ? 'लेना' : 'देना'} ${formatINR(d.remainingMinor)}`,
          `সময় পার হয়েছে: ${d.personName} (${formatINR(d.remainingMinor)} ${d.direction === 'need' ? 'পাওনা' : 'দেনা'})`,
        ),
        detail: t(
          lang,
          `Was due on ${d.dueDate}. Follow up or settle to keep your balance accurate.`,
          `देय तारीख ${d.dueDate} थी। हिसाब साफ़ रखने के लिए संपर्क करें।`,
          `শেষ তারিখ ছিল ${d.dueDate}। হিসাব পরিষ্কার রাখতে মিটিয়ে নিন।`,
        ),
      });
    }
  }

  let unpaidRecurringOutMinor = 0;
  let unpaidRecurringInMinor = 0;
  for (const r of recurring) {
    if (r.lastPaidMonth === monthPrefix) continue;
    if (r.kind === 'expense') unpaidRecurringOutMinor += r.amountMinor;
    else unpaidRecurringInMinor += r.amountMinor;
  }

  // 5. Notes Checklists & Vault Hygiene Metadata (ZERO plaintext secrets accessed)
  let openChecklistTasks = 0;
  let completedChecklistNotes = 0;
  let overdueNotesCount = 0;
  for (const n of activeNotes) {
    const total = n.checklist.length;
    const open = n.checklist.filter((i) => !i.done).length;
    openChecklistTasks += open;
    if (total > 0 && open === 0) completedChecklistNotes += 1;
    if (n.remindAt) {
      const ms = Date.parse(n.remindAt);
      if (!Number.isNaN(ms) && ms <= now.getTime() && (total === 0 || open > 0)) {
        overdueNotesCount += 1;
      }
    }
  }
  if (overdueNotesCount > 0) {
    penalty += 5;
    whatsWrong.push({
      id: 'wrong-notes-overdue',
      module: 'notes',
      severity: 'info',
      title: t(
        lang,
        `${overdueNotesCount} note reminder(s) past due`,
        `${overdueNotesCount} नोट रिमाइंडर बाकी हैं`,
        `${overdueNotesCount}টি নোট রিমাইন্ডার বাকি আছে`,
      ),
      detail: t(
        lang,
        `${openChecklistTasks} open checklist task(s) waiting in your Notes workspace.`,
        `आपके नोट्स में ${openChecklistTasks} अधूरे चेकलिस्ट कार्य प्रतीक्षा में हैं।`,
        `আপনার নোটসে ${openChecklistTasks}টি চেকলিস্ট কাজ বাকি রয়েছে।`,
      ),
    });
  }
  if (completedChecklistNotes > 0) {
    suggestions.push({
      id: 'sug-archive-done-notes',
      label: t(
        lang,
        `Archive ${completedChecklistNotes} completed checklist(s)`,
        `${completedChecklistNotes} पूरी चेकलिस्ट आर्काइव करें`,
        `${completedChecklistNotes}টি সম্পন্ন চেকলিস্ট আর্কাইভ করুন`,
      ),
      detail: t(
        lang,
        `All items are ticked. Keep your active workspace clutter-free.`,
        `सारे आइटम पूरे हैं। मुख्य बोर्ड साफ़ रखने के लिए आर्काइव करें।`,
        `সব কাজ টিক করা হয়েছে। নোটস পরিষ্কার রাখতে আর্কাইভ করুন।`,
      ),
      commandText: 'archive completed notes',
      severity: 'info',
    });
  }

  const staleVault = vaultEntries.filter(
    (v) => daysBetweenISO(v.lastRotatedAt, refDate) >= settings.vaultRotationDays,
  );
  if (staleVault.length > 0) {
    penalty += 5;
    whatsWrong.push({
      id: 'wrong-vault-rot',
      module: 'vault',
      severity: 'warning',
      title: t(
        lang,
        `${staleVault.length} Vault login(s) overdue for rotation`,
        `${staleVault.length} वॉल्ट लॉगिन का पासवर्ड रोटेशन बाकी है`,
        `${staleVault.length}টি ভল্ট লগইন রোটেশন দরকার`,
      ),
      detail: t(
        lang,
        `${staleVault.map((v) => v.label).slice(0, 3).join(', ')} older than ${settings.vaultRotationDays} days (rotate manually in Vault).`,
        `${settings.vaultRotationDays} दिनों से पुराने: ${staleVault.map((v) => v.label).slice(0, 3).join(', ')}।`,
        `${settings.vaultRotationDays} দিনের পুরনো: ${staleVault.map((v) => v.label).slice(0, 3).join(', ')}।`,
      ),
    });
    suggestions.push({
      id: 'sug-open-vault',
      label: t(lang, 'Open Vault to rotate password', 'वॉल्ट खोलें (रोटेशन)', 'ভল্ট খুলে পাসওয়ার্ড বদলান'),
      detail: t(
        lang,
        'Use "Archive Old to Legacy" inside Vault so old PINs/passwords stay searchable.',
        'पुराना पासवर्ड लेगेसी इतिहास में सुरक्षित रखकर नया सेट करें।',
        'পুরনোটি লেগেসিতে রেখে নতুন পাসওয়ার্ড সেট করুন।',
      ),
      commandText: 'open vault',
      severity: 'info',
    });
  }

  // 6. Forward 30-Day Cash Cushion Prediction
  const scheduledOutflow30dMinor =
    upcomingCardBills30dMinor + upcomingEmis30dMinor + unpaidRecurringOutMinor + dueGive30dMinor;
  const expectedInflow30dMinor = unpaidRecurringInMinor + dueNeed30dMinor;
  const projected30dBalanceMinor =
    dash.totalBankMinor + expectedInflow30dMinor - scheduledOutflow30dMinor;

  if (projected30dBalanceMinor < 0) {
    penalty += 22;
    predictions.unshift({
      id: 'pred-30d-shortfall',
      module: 'cashflow',
      severity: 'urgent',
      title: t(
        lang,
        `30-day cash shortfall predicted (${formatINR(projected30dBalanceMinor)})`,
        `अगले 30 दिनों में नकदी की कमी का अनुमान (${formatINR(projected30dBalanceMinor)})`,
        `আগামী ৩০ দিনে নগদ ঘাটতির পূর্বাভাস (${formatINR(projected30dBalanceMinor)})`,
      ),
      detail: t(
        lang,
        `Bank cash ${formatINR(dash.totalBankMinor)} + expected inflow ${formatINR(expectedInflow30dMinor)} won't fully cover ${formatINR(scheduledOutflow30dMinor)} in upcoming card bills, EMIs & dues.`,
        `बैंक बैलेंस ${formatINR(dash.totalBankMinor)} + संभावित आय ${formatINR(expectedInflow30dMinor)}, आगामी ${formatINR(scheduledOutflow30dMinor)} बिल/EMI के लिए कम पड़ सकता है।`,
        `ব্যাংক নগদ ${formatINR(dash.totalBankMinor)} ও সম্ভাব্য আয় ${formatINR(expectedInflow30dMinor)}, আগামী ${formatINR(scheduledOutflow30dMinor)} বিল ও EMI মেটাতে কম পড়তে পারে।`,
      ),
    });
    if (dash.totalNeedMinor > 0) {
      suggestions.push({
        id: 'sug-collect-dues',
        label: t(
          lang,
          `Collect ${formatINR(dash.totalNeedMinor)} People Dues`,
          `लोगों से ${formatINR(dash.totalNeedMinor)} वसूलें`,
          `পাওনা ${formatINR(dash.totalNeedMinor)} আদায় করুন`,
        ),
        detail: t(
          lang,
          'Collecting pending receivables improves your 30-day liquidity cushion right away.',
          'बकाया रकम लेने से अगले 30 दिनों का कैश बैलेंस तुरंत मजबूत होगा।',
          'বকেয়া পাওনা তুললে আগামী ৩০ দিনের নগদ চাপ কমবে।',
        ),
        commandText: 'open loans and dues',
        severity: 'warning',
      });
    }
  } else {
    predictions.unshift({
      id: 'pred-30d-cushion',
      module: 'cashflow',
      severity: 'positive',
      title: t(
        lang,
        `Projected 30-day safe cash cushion: ${formatINR(projected30dBalanceMinor)}`,
        `अगले 30 दिनों बाद अनुमानित सुरक्षित शेष: ${formatINR(projected30dBalanceMinor)}`,
        `৩০ দিন পর সম্ভাব্য নিরাপদ নগদ স্থিতি: ${formatINR(projected30dBalanceMinor)}`,
      ),
      detail: t(
        lang,
        `After covering ${formatINR(scheduledOutflow30dMinor)} in scheduled bills/EMIs and adding ${formatINR(expectedInflow30dMinor)} expected inflows.`,
        `${formatINR(scheduledOutflow30dMinor)} आगामी बिल/EMI चुकाने व ${formatINR(expectedInflow30dMinor)} आवक जोड़ने के बाद।`,
        `${formatINR(scheduledOutflow30dMinor)} বিল/EMI ও ${formatINR(expectedInflow30dMinor)} সম্ভাব্য আয় হিসাব করে।`,
      ),
    });
  }

  // Monthly Spend Trend Comparison
  if (avgMonthlyExpenseMinor > 0 && projectedMonthExpenseMinor > Math.round(avgMonthlyExpenseMinor * 1.25)) {
    const spikePct = Math.round(((projectedMonthExpenseMinor - avgMonthlyExpenseMinor) / avgMonthlyExpenseMinor) * 100);
    penalty += 6;
    predictions.push({
      id: 'pred-spend-spike',
      module: 'cashflow',
      severity: 'warning',
      title: t(
        lang,
        `Month-end spend forecast is ${spikePct}% above your usual average`,
        `इस माह का अनुमानित खर्च आपके औसत से ${spikePct}% अधिक है`,
        `এই মাসে খরচ গড়ের চেয়ে ${spikePct}% বেশি হওয়ার পূর্বাভাস`,
      ),
      detail: t(
        lang,
        `Pacing near ${formatINR(projectedMonthExpenseMinor)} vs trailing average ${formatINR(avgMonthlyExpenseMinor)}. Watch ${dash.monthTopCategories[0]?.category ?? 'top categories'}.`,
        `अनुमानित ${formatINR(projectedMonthExpenseMinor)} बनाम औसत ${formatINR(avgMonthlyExpenseMinor)}।`,
        `সম্ভাব্য ${formatINR(projectedMonthExpenseMinor)} বনাম গড় ${formatINR(avgMonthlyExpenseMinor)}।`,
      ),
    });
  }

  // 7. Subscription & Recurring Leak Checks
  const leaks = detectRecurringLeaks(db).filter((l) => !scopeFilter || l.scope === scopeFilter);
  if (leaks.length > 0) {
    const topLeak = leaks[0];
    if (topLeak.isPriceHike) {
      penalty += 4;
      whatsWrong.push({
        id: `wrong-leak-hike-${topLeak.id}`,
        module: 'subscriptions',
        severity: 'warning',
        title: t(
          lang,
          `${topLeak.title} charge jumped +${topLeak.priceHikePct}% (${formatINR(topLeak.latestAmountMinor)})`,
          `${topLeak.title} का खर्च +${topLeak.priceHikePct}% बढ़ा (${formatINR(topLeak.latestAmountMinor)})`,
          `${topLeak.title} খরচ +${topLeak.priceHikePct}% বেড়েছে (${formatINR(topLeak.latestAmountMinor)})`,
        ),
        detail: t(
          lang,
          `Repeated across ${topLeak.distinctMonths} months and not tracked as a recurring bill yet.`,
          `${topLeak.distinctMonths} महीनों से दोहराव हो रहा है पर रिकरिंग बिल में दर्ज नहीं है।`,
          `${topLeak.distinctMonths} মাস ধরে আসছে কিন্তু রিকারিং বিলে যোগ করা হয়নি।`,
        ),
      });
    }
    suggestions.push({
      id: 'sug-track-leaks',
      label: t(
        lang,
        `Review ${leaks.length} untracked recurring debit(s)`,
        `${leaks.length} अघोषित सब्सक्रिप्शन/बिल देखें`,
        `${leaks.length}টি অঘোষিত সাবস্ক্রিপশন দেখুন`,
      ),
      detail: t(
        lang,
        `e.g. ${topLeak.title} (~${formatINR(topLeak.avgAmountMinor)}/mo) repeating across ${topLeak.distinctMonths} months.`,
        `जैसे ${topLeak.title} (~${formatINR(topLeak.avgAmountMinor)}/माह)।`,
        `যেমন ${topLeak.title} (~${formatINR(topLeak.avgAmountMinor)}/মাস)।`,
      ),
      commandText: 'detect subscriptions',
      severity: topLeak.isPriceHike ? 'warning' : 'info',
    });
  }

  // 8. Savings Goals, Tax Reserve & Emergency Runway Guardrails
  const goalsSummary = summarizeGoalsAndRunway(db, refDate);
  if (goalsSummary.totalReservedMinor > 0 && goalsSummary.freeUnreservedCashMinor < 0) {
    penalty += 10;
    whatsWrong.push({
      id: 'wrong-reserve-dip',
      module: 'goals',
      severity: 'warning',
      title: t(
        lang,
        `Bank cash dipped ${formatINR(Math.abs(goalsSummary.freeUnreservedCashMinor))} below your reserved Goals & Taxes`,
        `बैंक बैलेंस आपके आरक्षित लक्ष्य व टैक्स से ${formatINR(Math.abs(goalsSummary.freeUnreservedCashMinor))} कम है`,
        `ব্যাংক নগদ আপনার সংরক্ষিত লক্ষ্য ও ট্যাক্স রিজার্ভের চেয়ে ${formatINR(Math.abs(goalsSummary.freeUnreservedCashMinor))} কম`,
      ),
      detail: t(
        lang,
        `Reserved goals/tax: ${formatINR(goalsSummary.totalReservedMinor)} vs Bank cash ${formatINR(goalsSummary.liquidBankMinor)}.`,
        `आरक्षित राशि ${formatINR(goalsSummary.totalReservedMinor)} बनाम बैंक बैलेंस ${formatINR(goalsSummary.liquidBankMinor)}।`,
        `সংরক্ষিত তহবিল ${formatINR(goalsSummary.totalReservedMinor)} বনাম ব্যাংক নগদ ${formatINR(goalsSummary.liquidBankMinor)}।`,
      ),
    });
  }
  if (goalsSummary.emergencyRunwayMonths !== null && goalsSummary.emergencyRunwayMonths < 3 && goalsSummary.avgMonthlyExpenseMinor > 0) {
    predictions.push({
      id: 'pred-low-runway',
      module: 'goals',
      severity: goalsSummary.emergencyRunwayMonths < 1 ? 'urgent' : 'warning',
      title: t(
        lang,
        `Emergency runway is ${goalsSummary.emergencyRunwayMonths} months (< 3 mo buffer)`,
        `आपातकालीन कैश रनवे केवल ${goalsSummary.emergencyRunwayMonths} महीने है (< 3 माह)`,
        `জরুরি নগদ রানওয়ে মাত্র ${goalsSummary.emergencyRunwayMonths} মাস (< ৩ মাস)`,
      ),
      detail: t(
        lang,
        `Based on average monthly spend of ${formatINR(goalsSummary.avgMonthlyExpenseMinor)}.`,
        `औसत मासिक खर्च ${formatINR(goalsSummary.avgMonthlyExpenseMinor)} के आधार पर।`,
        `গড় মাসিক খরচ ${formatINR(goalsSummary.avgMonthlyExpenseMinor)} অনুযায়ী।`,
      ),
    });
  }

  // 9. Debt Avalanche Priority Insight
  const payoff = computeDebtPayoffPlan(db, { extraMonthlyMinor: 500_000, strategy: 'avalanche' });
  if (payoff.items.length > 0 && payoff.interestSavedMinor > 0) {
    const first = payoff.items[0];
    suggestions.push({
      id: 'sug-debt-avalanche',
      label: t(
        lang,
        `Debt Plan: target ${first.name} (${(first.aprBps / 100).toFixed(0)}% APR)`,
        `कर्ज़ योजना: पहले ${first.name} चुकाएं`,
        `ঋণ পরিকল্পনা: আগে ${first.name} মেটান`,
      ),
      detail: t(
        lang,
        `Adding ₹5,000/mo saves ~${formatINR(payoff.interestSavedMinor)} interest and cuts ${payoff.monthsSaved} month(s).`,
        `₹5,000/माह अतिरिक्त देने से ~${formatINR(payoff.interestSavedMinor)} ब्याज बचेगा।`,
        `মাসে ₹5,000 বাড়তি দিলে ~${formatINR(payoff.interestSavedMinor)} সুদ বাঁচবে।`,
      ),
      commandText: 'debt payoff plan with extra 5000',
      severity: 'info',
    });
  }

  // 10. Investments & Upcoming Maturities
  const investments = listInvestments(db);
  const totalInvestmentsMinor = investments.reduce((sum, i) => sum + i.currentValueMinor, 0);
  for (const inv of investments) {
    if (!inv.maturityDate) continue;
    const days = daysBetweenISO(refDate, inv.maturityDate);
    if (days >= 0 && days <= 30) {
      predictions.push({
        id: `pred-inv-mat-${inv.id}`,
        module: 'investments',
        severity: 'info',
        title: t(
          lang,
          `${inv.title} maturing in ${days}d (${formatINR(inv.currentValueMinor)})`,
          `${inv.title} ${days} दिन में मेच्योर होगा (${formatINR(inv.currentValueMinor)})`,
          `${inv.title} ${days} দিনে মেয়াদপূর্তি (${formatINR(inv.currentValueMinor)})`,
        ),
        detail: t(
          lang,
          `Maturity date ${inv.maturityDate}. Plan reinvestment or move to liquid bank.`,
          `मेच्योरिटी तिथि ${inv.maturityDate}। पुनर्निवेश या बैंक ट्रांसफर प्लान करें।`,
          `মেয়াদপূর্তির তারিখ ${inv.maturityDate}। পুনর্বিনিয়োগ বা ব্যাংকে স্থানান্তর পরিকল্পনা করুন।`,
        ),
      });
    }
  }

  // Constructive advisor suggestions when healthy
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'sug-check-alerts',
      label: t(lang, 'Run WhatsApp & Alert Health Check', 'अलर्ट व WhatsApp जांचें', 'অ্যালার্ট ও WhatsApp চেক করুন'),
      detail: t(
        lang,
        'Keep reminders synced so upcoming bills never catch you off guard.',
        'सारे आगामी बिल समय पर याद दिलाए जाएं इसके लिए जांच चलाएं।',
        'সব আসন্ন বিল ও রিমাইন্ডার ঠিক রাখতে একবার চেক চালান।',
      ),
      commandText: 'check alerts now',
      severity: 'positive',
    });
  }

  const healthScore = Math.max(15, Math.min(100, 100 - penalty));
  const status: AdvisorBriefing['status'] =
    healthScore >= 80 ? 'healthy' : healthScore >= 55 ? 'watch' : 'critical';

  const headline =
    status === 'healthy'
      ? t(
          lang,
          `Looking solid (${healthScore}/100). Your cash runway covers upcoming bills with no immediate stress.`,
          `सब संतुलित है (${healthScore}/100)। आपका नकदी भंडार आगामी बिलों के लिए पर्याप्त है।`,
          `সব কিছু স্থিতিশীল (${healthScore}/100)। আসন্ন বিল মেটানোর মতো পর্যাপ্ত নগদ হাতে আছে।`,
        )
      : status === 'watch'
        ? t(
            lang,
            `Heads up (${healthScore}/100): ${whatsWrong.length} issue(s) need attention to stay worry-free.`,
            `ध्यान दें (${healthScore}/100): निश्चिंत रहने के लिए ${whatsWrong.length} बात(ों) पर ध्यान ज़रूरी है।`,
            `সতর্কতা (${healthScore}/100): নিশ্চিন্ত থাকতে ${whatsWrong.length}টি বিষয়ে এখনই নজর দিন।`,
          )
        : t(
            lang,
            `Action required (${healthScore}/100): urgent cashflow or overdue items detected.`,
            `तुरंत कार्रवाई ज़रूरी (${healthScore}/100): ओवरड्यू बिल या नकदी दबाव पाया गया।`,
            `জরুরি পদক্ষেপ নিন (${healthScore}/100): বকেয়া বিল বা নগদ ঘাটতির ঝুঁকি রয়েছে।`,
          );

  return {
    generatedAt: now.toISOString(),
    healthScore,
    status,
    headline,
    liquidBankMinor: dash.totalBankMinor,
    scheduledOutflow30dMinor,
    expectedInflow30dMinor,
    projected30dBalanceMinor,
    projectedMonthExpenseMinor,
    avgMonthlyExpenseMinor,
    openChecklistTasks,
    completedChecklistNotes,
    staleVaultCount: staleVault.length,
    emergencyRunwayMonths: goalsSummary.emergencyRunwayMonths,
    totalReservedMinor: goalsSummary.totalReservedMinor,
    subscriptionLeakCount: leaks.length,
    totalInvestmentsMinor,
    whatsWrong,
    predictions,
    suggestions: suggestions.slice(0, 5),
  };
}

export function formatBriefingAsHumanReply(
  b: AdvisorBriefing,
  lang: AppLanguage,
  focus: AdvisorFocus = 'full',
): string {
  const lines: string[] = [b.headline];

  if (focus === 'full' || focus === 'wrong') {
    const hdrWrong = t(lang, 'What Needs Attention:', 'क्या गलत / ध्यान देने योग्य है:', 'যেখানে নজর দেওয়া দরকার:');
    if (b.whatsWrong.length > 0) {
      lines.push(`\n• ${hdrWrong}`);
      for (const item of b.whatsWrong.slice(0, 4)) {
        lines.push(`  - ${item.title} (${item.detail})`);
      }
    } else if (focus === 'wrong') {
      lines.push(
        `\n• ${t(
          lang,
          'Nothing critical looks wrong right now — banks, cards, EMIs, and Vault hygiene are clean.',
          'अभी कुछ भी गंभीर गलत नहीं दिख रहा — बैंक, कार्ड, EMI और वॉल्ट सब ठीक हैं।',
          'এই মুহূর্তে গুরুতর কোনো সমস্যা নেই — ব্যাংক, কার্ড, EMI ও ভল্ট সব ঠিক আছে।',
        )}`,
      );
    }
  }

  if (focus === 'full' || focus === 'predict') {
    const hdrPred = t(lang, '30-Day Prediction & Forecast:', '30-दिन का अनुमान और भविष्यवाणी:', '৩০ দিনের পূর্বাভাস:');
    lines.push(`\n• ${hdrPred}`);
    for (const p of b.predictions.slice(0, 3)) {
      lines.push(`  - ${p.title}`);
    }
  }

  if (focus === 'full' || focus === 'suggest' || focus === 'tasks') {
    const hdrSug = t(lang, 'Advisor Suggestions:', 'व्यक्तिगत सलाह और अगला कदम:', 'পরামর্শ ও পরবর্তী পদক্ষেপ:');
    lines.push(`\n• ${hdrSug}`);
    for (const s of b.suggestions.slice(0, 3)) {
      lines.push(`  - ${s.label}: ${s.detail}`);
    }
    if (b.openChecklistTasks > 0) {
      lines.push(
        `  - ${t(
          lang,
          `Pending Checklist Tasks: ${b.openChecklistTasks} open item(s).`,
          `बाकी चेकलिस्ट कार्य: ${b.openChecklistTasks} अधूरे काम।`,
          `বাকি চেকলিস্ট কাজ: ${b.openChecklistTasks}টি কাজ অসমাপ্ত।`,
        )}`,
      );
    }
  }

  return lines.join('\n');
}
