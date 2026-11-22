import { DatabaseSync } from 'node:sqlite';
import {
  type AlertModule,
  type Scope,
  daysBetweenISO,
  formatINR,
  todayISO,
} from '../../shared/ledger-core.ts';
import { withTransaction } from '../db/schema.ts';
import { listAccounts } from '../db/accounts-repo.ts';
import {
  autoPostDueRecurringBills,
  createTransaction,
  listCategoryRules,
  listLoans,
  listPeopleDues,
  listRecurringBills,
  listScopeBudgets,
  listCategoryBudgets,
  listTransactions,
  matchCategoryRule,
  saveTransactionAttachment,
} from '../db/ledger-repo.ts';
import { listNotes } from '../db/notes-repo.ts';
import { exportFullSnapshotJSON } from '../db/reports-repo.ts';
import { countRecentFailedUnlocks, listVaultEntries } from '../db/vault-repo.ts';
import {
  type AlertDeliveryRecord,
  getAlertSettings,
  listPendingWhatsAppAlerts,
  markAlertStatus,
  recordAlertIfNew,
} from '../db/alerts-repo.ts';
import { type IncomingWhatsAppAudio, type IncomingWhatsAppImage, type WhatsAppTransport } from './bridge.ts';
import { buildAdvisorBriefing } from '../agent/advisor.ts';
import { processAgentCommand } from '../agent/executor.ts';
import {
  type ExtractedReceiptFields,
  extractReceiptFieldsFromText,
  extractReceiptImageOffline,
} from '../agent/intelligence.ts';
import { extractReceiptWithVisionLLM, transcribeAndDetectAudioWithLLM } from '../agent/llm.ts';
import {
  getAgentApiKeySecret,
  getAppPreferences,
  updateAppPreferences,
  writeAutoBackupFile,
} from '../db/settings-repo.ts';
import { mirrorTransactionToCloud } from '../sync/supabase-bridge.ts';

export interface CandidateAlert {
  dedupeBase: string;
  module: AlertModule;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
}

export function isInQuietHours(hour: number, quietStartHour: number, quietEndHour: number): boolean {
  if (quietStartHour === quietEndHour) return false;
  if (quietStartHour > quietEndHour) {
    return hour >= quietStartHour || hour < quietEndHour;
  }
  return hour >= quietStartHour && hour < quietEndHour;
}

export function evaluateModuleAlerts(db: DatabaseSync, now: Date = new Date()): CandidateAlert[] {
  const settings = getAlertSettings(db);
  const today = todayISO(now);
  const monthPrefix = today.slice(0, 7);
  const candidates: CandidateAlert[] = [];

  const accounts = listAccounts(db, today);

  // 1. Credit Cards
  if (settings.enabledModules.credit_cards) {
    for (const c of accounts.filter((a) => a.type === 'credit_card')) {
      if (!c.cardCycle) continue;
      if (c.cardCycle.statementDueMinor > 0 && c.cardCycle.daysUntilDue <= settings.leadDaysCreditCard) {
        const urgent = c.cardCycle.daysUntilDue <= 0;
        const last4Tag = c.last4 ? ` (••${c.last4})` : '';
        candidates.push({
          dedupeBase: `cc_due:${c.id}:${c.cardCycle.nextDueDate}`,
          module: 'credit_cards',
          severity: urgent ? 'urgent' : 'warning',
          title: `${c.name}${last4Tag} bill ${urgent ? 'due now' : `due in ${c.cardCycle.daysUntilDue}d`}`,
          message: `Credit Card Bill: ${c.name}${last4Tag} — ${formatINR(c.cardCycle.statementDueMinor)} due on ${c.cardCycle.nextDueDate}.`,
        });
      }
      if (c.creditLimitMinor > 0 && c.cardCycle.utilizationPct >= settings.cardUtilizationThresholdPct) {
        candidates.push({
          dedupeBase: `cc_util:${c.id}:${monthPrefix}`,
          module: 'credit_cards',
          severity: 'warning',
          title: `${c.name} utilization ${c.cardCycle.utilizationPct}%`,
          message: `Card Utilization Alert: ${c.name} is at ${c.cardCycle.utilizationPct}% (${formatINR(c.cardCycle.totalOutstandingMinor)} of ${formatINR(c.creditLimitMinor)}).`,
        });
      }
    }
  }

  // 2. Banks (Personal / Business / Family) + Recurring Bills
  if (settings.enabledModules.banks) {
    for (const b of accounts.filter((a) => a.type === 'bank')) {
      if (b.minBalanceMinor > 0 && b.currentBalanceMinor < b.minBalanceMinor) {
        const last4Tag = b.last4 ? ` (••${b.last4})` : '';
        candidates.push({
          dedupeBase: `bank_low:${b.id}:${today}`,
          module: 'banks',
          severity: 'urgent',
          title: `${b.name}${last4Tag} low balance (${b.scope})`,
          message: `Low Bank Balance [${b.scope.toUpperCase()}]: ${b.name}${last4Tag} is ${formatINR(b.currentBalanceMinor)}, below target ${formatINR(b.minBalanceMinor)}.`,
        });
      }
    }

    const todayDay = Number(today.slice(8, 10));
    for (const r of listRecurringBills(db)) {
      if (!r.active || r.lastPaidMonth === monthPrefix) continue;
      if (r.dueDay - todayDay <= 2) {
        candidates.push({
          dedupeBase: `rec_due:${r.id}:${monthPrefix}`,
          module: 'banks',
          severity: r.dueDay <= todayDay ? 'urgent' : 'info',
          title: `Recurring ${r.kind}: ${r.title}`,
          message: `Recurring Reminder [${r.scope.toUpperCase()}]: ${r.title} (${formatINR(r.amountMinor)}) due day ${r.dueDay} via ${r.accountName}.`,
        });
      }
    }
  }

  // 3. Loans
  if (settings.enabledModules.loans) {
    for (const l of listLoans(db)) {
      if (l.status !== 'active') continue;
      const delta = daysBetweenISO(today, l.nextDueDate);
      if (delta <= settings.leadDaysLoan) {
        const urgent = delta <= 0;
        const amt = l.emiMinor > 0 ? l.emiMinor : l.remainingMinor;
        candidates.push({
          dedupeBase: `loan_due:${l.id}:${l.nextDueDate}`,
          module: 'loans',
          severity: urgent ? 'urgent' : 'warning',
          title: `${l.name} EMI ${urgent ? 'due' : `in ${delta}d`}`,
          message: `Loan ${l.direction === 'borrowed' ? 'EMI Due' : 'Collection Due'}: ${l.name} (${l.counterparty}) — ${formatINR(amt)} on ${l.nextDueDate}.`,
        });
      }
    }
  }

  // 4. People Dues (Give / Need)
  if (settings.enabledModules.people_dues) {
    for (const d of listPeopleDues(db)) {
      if (d.status === 'settled' || !d.dueDate) continue;
      const delta = daysBetweenISO(today, d.dueDate);
      if (delta <= settings.leadDaysDue) {
        const urgent = delta <= 0;
        const verb = d.direction === 'give' ? 'Give to' : 'Need from';
        candidates.push({
          dedupeBase: `due_${d.direction}:${d.id}:${d.dueDate}`,
          module: 'people_dues',
          severity: urgent ? 'urgent' : 'warning',
          title: `${verb} ${d.personName}: ${formatINR(d.remainingMinor)}`,
          message: `People Due [${d.scope.toUpperCase()}]: ${verb} ${d.personName} — ${formatINR(d.remainingMinor)} (due ${d.dueDate}).`,
        });
      }
    }
  }

  // 5. Scope Monthly Budgets
  if (settings.enabledModules.budgets) {
    const budgets = listScopeBudgets(db);
    if (budgets.length > 0) {
      const monthTx = listTransactions(db, { fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-31`, limit: 5000 });
      const spentByScope: Record<string, number> = { personal: 0, business: 0, family: 0 };
      for (const t of monthTx) {
        if (t.kind === 'expense') spentByScope[t.scope] += t.amountMinor;
      }
      for (const b of budgets) {
        const spent = spentByScope[b.scope] ?? 0;
        const pct = Math.round((spent / b.monthlyLimitMinor) * 100);
        if (pct >= 80) {
          const tier = pct >= 100 ? '100' : '80';
          candidates.push({
            dedupeBase: `budget_${tier}:${b.scope}:${monthPrefix}`,
            module: 'budgets',
            severity: pct >= 100 ? 'urgent' : 'warning',
            title: `${b.scope} budget at ${pct}%`,
            message: `Monthly Budget Alert [${b.scope.toUpperCase()}]: Spent ${formatINR(spent)} of ${formatINR(b.monthlyLimitMinor)} (${pct}%).`,
          });
        }
      }
    }

    const catBudgets = listCategoryBudgets(db);
    if (catBudgets.length > 0) {
      const monthTx = listTransactions(db, { fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-31`, limit: 5000 });
      for (const cb of catBudgets) {
        let spent = 0;
        for (const t of monthTx) {
          if (
            t.kind === 'expense' &&
            t.scope === cb.scope &&
            t.category.trim().toLowerCase() === cb.category.trim().toLowerCase()
          ) {
            spent += t.amountMinor;
          }
        }
        const pct = Math.round((spent / cb.monthlyLimitMinor) * 100);
        if (pct >= 80) {
          const tier = pct >= 100 ? '100' : '80';
          candidates.push({
            dedupeBase: `cat_budget_${tier}:${cb.scope}:${cb.category.trim().toLowerCase()}:${monthPrefix}`,
            module: 'budgets',
            severity: pct >= 100 ? 'urgent' : 'warning',
            title: `${cb.category} (${cb.scope}) budget at ${pct}%`,
            message: `Category Budget Alert [${cb.scope.toUpperCase()} · ${cb.category}]: Spent ${formatINR(spent)} of ${formatINR(cb.monthlyLimitMinor)} (${pct}%).`,
          });
        }
      }
    }
  }

  // 6. Notes & Checklists
  if (settings.enabledModules.notes) {
    for (const n of listNotes(db, { includeArchived: false })) {
      if (!n.remindAt) continue;
      // Compare local or ISO reminder timestamp cleanly
      const remindMs = Date.parse(n.remindAt);
      if (Number.isNaN(remindMs) || remindMs > now.getTime() + 15 * 60 * 1000) continue;
      const total = n.checklist.length;
      const unchecked = n.checklist.filter((i) => !i.done).length;
      if (total > 0 && unchecked === 0) continue; // completed checklist requires no alert
      const suffix = total > 0 ? ` (${unchecked}/${total} checklist items open)` : '';
      const snippet = n.body ? `\nNote: ${n.body.slice(0, 120)}` : '';
      candidates.push({
        dedupeBase: `note_rem:${n.id}:${n.remindAt.slice(0, 16)}`,
        module: 'notes',
        severity: 'info',
        title: `🔔 Reminder: ${n.title}`,
        message: `🔔 Note Reminder [${n.scope.toUpperCase()}]: ${n.title}${suffix}.${snippet}`,
      });
    }
  }

  // 7. Password Vault (HYGIENE METADATA ONLY — NEVER SECRETS!)
  if (settings.enabledModules.vault) {
    const failed = countRecentFailedUnlocks(db, 15);
    if (failed >= 3) {
      candidates.push({
        dedupeBase: `vault_fail:${today}:${now.getHours()}`,
        module: 'vault',
        severity: 'urgent',
        title: `${failed} failed Vault unlock attempts`,
        message: `Vault Security Alert: ${failed} failed Master Password attempts detected in the last 15 minutes.`,
      });
    }
    for (const entry of listVaultEntries(db)) {
      const ageDays = daysBetweenISO(entry.lastRotatedAt, today);
      if (ageDays >= settings.vaultRotationDays) {
        candidates.push({
          dedupeBase: `vault_rot:${entry.id}:${monthPrefix}`,
          module: 'vault',
          severity: 'info',
          title: `Rotate credential: ${entry.label}`,
          message: `Vault Hygiene: "${entry.label}" (${entry.category}) was last rotated ${ageDays} days ago. Consider updating it.`,
        });
      }
    }
  }

  // 8. Proactive Personal AI Advisor Risk Alerts
  if (settings.enabledModules.advisor !== false) {
    const prefs = getAppPreferences(db);
    const briefing = buildAdvisorBriefing(db, prefs.systemLanguage, undefined, now);
    if (briefing.status === 'critical' || briefing.projected30dBalanceMinor < 0) {
      const topIssue = briefing.whatsWrong[0]?.title ?? briefing.predictions[0]?.title ?? briefing.headline;
      candidates.push({
        dedupeBase: `advisor_risk:${today}`,
        module: 'advisor',
        severity: 'warning',
        title: `Advisor Health ${briefing.healthScore}/100: ${topIssue}`,
        message: `AI Advisor [${briefing.healthScore}/100]: ${briefing.headline} Top issue: ${topIssue}. 30d Safe Cash: ${formatINR(briefing.projected30dBalanceMinor)}.`,
      });
    }
  }

  return candidates;
}

export async function runAlertCycle(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  now: Date = new Date(),
): Promise<{ evaluated: number; queuedWhatsApp: number; sentWhatsApp: number; suppressedQuietHours: boolean }> {
  const today = now.toISOString().slice(0, 10);
  const postedBills = autoPostDueRecurringBills(db, today);
  const settings = getAlertSettings(db);
  const candidates = evaluateModuleAlerts(db, now);

  for (const item of postedBills) {
    candidates.push({
      dedupeBase: `auto_post:${item.bill.id}:${today.slice(0, 7)}`,
      module: 'banks',
      severity: 'info',
      title: `Auto-posted: ${item.bill.title}`,
      message: `Auto-Posted Recurring Entry [${item.bill.scope.toUpperCase()}]: ${item.bill.title} (${formatINR(item.bill.amountMinor)}) via ${item.bill.accountName}.`,
    });
  }

  // Daily local auto-backup if enabled
  const prefs = getAppPreferences(db);
  if (prefs.autoBackupEnabled && prefs.autoBackupDir && prefs.lastAutoBackupDate !== today) {
    try {
      const snapshot = exportFullSnapshotJSON(db);
      writeAutoBackupFile(prefs.autoBackupDir, today, snapshot);
      updateAppPreferences(db, { lastAutoBackupDate: today });
    } catch {
      // Keep alert cycle resilient even if target backup folder is temporarily unavailable
    }
  }

  for (const c of candidates) {
    recordAlertIfNew(db, {
      dedupeKey: `inapp:${c.dedupeBase}`,
      module: c.module,
      severity: c.severity,
      title: c.title,
      message: c.message,
      channel: 'in_app',
    });

    recordAlertIfNew(db, {
      dedupeKey: `wa:${c.dedupeBase}`,
      module: c.module,
      severity: c.severity,
      title: c.title,
      message: c.message,
      channel: 'whatsapp',
    });
  }

  const pendingWA = listPendingWhatsAppAlerts(db);
  const hour = now.getHours();
  const quiet = isInQuietHours(hour, settings.quietStartHour, settings.quietEndHour);
  const bridgeReady = transport.getState().status === 'connected';

  let sentCount = 0;

  if (!bridgeReady) {
    return {
      evaluated: candidates.length,
      queuedWhatsApp: pendingWA.length,
      sentWhatsApp: 0,
      suppressedQuietHours: quiet,
    };
  }

  // Separate urgent vs digestable alerts
  const urgentAlerts: AlertDeliveryRecord[] = [];
  const regularAlerts: AlertDeliveryRecord[] = [];
  for (const item of pendingWA) {
    if (item.severity === 'urgent') urgentAlerts.push(item);
    else regularAlerts.push(item);
  }

  // Urgent alerts send immediately (even during quiet hours unless bridge disconnected)
  for (const item of urgentAlerts) {
    const res = await transport.sendText(settings.recipientPhone, `🚨 ${item.message}`);
    if (res.ok) {
      markAlertStatus(db, item.id, 'sent', null);
      sentCount += 1;
    } else {
      markAlertStatus(db, item.id, 'failed', res.error ?? 'Send error');
    }
  }

  if (quiet) {
    return {
      evaluated: candidates.length,
      queuedWhatsApp: pendingWA.length - sentCount,
      sentWhatsApp: sentCount,
      suppressedQuietHours: true,
    };
  }

  if (settings.morningDigestEnabled) {
    if (hour >= settings.morningDigestHour && regularAlerts.length > 0) {
      const digestBody = [
        `📋 *Personal Ledger Daily Summary (${todayISO(now)})*`,
        ...regularAlerts.map((a, idx) => `${idx + 1}. ${a.message}`),
      ].join('\n');
      const res = await transport.sendText(settings.recipientPhone, digestBody);
      for (const item of regularAlerts) {
        if (res.ok) {
          markAlertStatus(db, item.id, 'sent', null);
          sentCount += 1;
        } else {
          markAlertStatus(db, item.id, 'failed', res.error ?? 'Digest send failed');
        }
      }
    }
  } else {
    for (const item of regularAlerts) {
      const prefix = item.severity === 'warning' ? '⚠️' : '🔔';
      const res = await transport.sendText(settings.recipientPhone, `${prefix} ${item.message}`);
      if (res.ok) {
        markAlertStatus(db, item.id, 'sent', null);
        sentCount += 1;
      } else {
        markAlertStatus(db, item.id, 'failed', res.error ?? 'Send error');
      }
    }
  }

  return {
    evaluated: candidates.length,
    queuedWhatsApp: Math.max(0, pendingWA.length - sentCount),
    sentWhatsApp: sentCount,
    suppressedQuietHours: false,
  };
}

function last10Digits(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function authorizeWhatsAppSender(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  senderPhone: string,
): string | null {
  const settings = getAlertSettings(db);
  if (!settings.twoWayCommandsEnabled) return null;
  const senderKey = last10Digits(senderPhone);
  if (!senderKey) return null;
  const allowedTargets = [settings.recipientPhone, transport.getState().connectedPhone]
    .map(last10Digits)
    .filter(Boolean);
  // Fail closed when no owner/connected phone number is configured
  if (allowedTargets.length === 0 || !allowedTargets.includes(senderKey)) {
    return null;
  }
  return senderKey;
}

interface PendingWhatsAppReceipt {
  fields: ExtractedReceiptFields;
  scope: Scope;
  accountId: string;
  accountName: string;
  imageBase64: string;
  mimeType: string;
  expiresAt: number;
}

const pendingWhatsAppReceipts = new Map<string, PendingWhatsAppReceipt>();

function prunePendingWhatsAppReceipts(): void {
  const now = Date.now();
  for (const [k, v] of pendingWhatsAppReceipts.entries()) {
    if (now > v.expiresAt) pendingWhatsAppReceipts.delete(k);
  }
}

function commitReceiptWithProof(db: DatabaseSync, draft: Omit<PendingWhatsAppReceipt, 'expiresAt'>): { txId: string; attached: boolean } {
  return withTransaction(db, () => {
    const tx = createTransaction(db, {
      kind: draft.fields.kind,
      scope: draft.scope,
      accountId: draft.accountId,
      toAccountId: null,
      category: draft.fields.category,
      amountMinor: draft.fields.amountMinor ?? 0,
      occurredAt: draft.fields.occurredAt,
      party: draft.fields.vendor,
      note: `${draft.fields.note} (via WhatsApp)`,
      sourceRef: 'whatsapp_receipt',
    });
    void mirrorTransactionToCloud(tx);
    let attached = false;
    const cleanedB64 = draft.imageBase64.replace(/^data:[^;]+;base64,/, '');
    if (cleanedB64.length > 16 && cleanedB64.length <= 3_150_000) {
      const ext = draft.mimeType.includes('png') ? 'png' : draft.mimeType.includes('webp') ? 'webp' : 'jpg';
      saveTransactionAttachment(db, tx.id, {
        filename: `wa-receipt-${draft.fields.occurredAt}.${ext}`,
        mimeType: draft.mimeType,
        dataBase64: cleanedB64,
      });
      attached = true;
    }
    return { txId: tx.id, attached };
  });
}

export async function handleIncomingWhatsAppCommand(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  senderPhone: string,
  rawText: string,
): Promise<{ accepted: boolean; replyText?: string }> {
  const senderKey = authorizeWhatsAppSender(db, transport, senderPhone);
  if (!senderKey) return { accepted: false };

  const trimmed = rawText.trim();
  if (!trimmed) return { accepted: false };

  // Handle pending receipt confirmation ("confirm" / "confirm receipt")
  if (/^confirm(?:\s+receipt)?$/i.test(trimmed)) {
    const pending = pendingWhatsAppReceipts.get(senderKey);
    if (pending && pending.expiresAt > Date.now()) {
      pendingWhatsAppReceipts.delete(senderKey);
      const { attached } = commitReceiptWithProof(db, pending);
      const replyText = `✅ Receipt logged: ${formatINR(pending.fields.amountMinor ?? 0)} (${pending.fields.vendor} · ${pending.fields.category} · ${pending.accountName})${attached ? ' with proof image' : ''}.`;
      await transport.sendText(senderPhone, replyText);
      return { accepted: true, replyText };
    }
  }

  const explicitConfirm = /^confirm\s+/i.test(trimmed);
  const commandText = explicitConfirm ? trimmed.replace(/^confirm\s+/i, '').trim() : trimmed;
  const result = await processAgentCommand(db, transport, {
    commandText,
    confirmExecution: explicitConfirm,
  });

  const replyText = result.requiresConfirmation
    ? `🤖 ${result.replyText}\nReply with "confirm ${commandText}" to execute.`
    : `🤖 ${result.replyText}`;

  await transport.sendText(senderPhone, replyText);
  return { accepted: true, replyText };
}

export async function handleIncomingWhatsAppImage(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  senderPhone: string,
  payload: IncomingWhatsAppImage,
): Promise<{ accepted: boolean; logged?: boolean; transactionId?: string; replyText?: string }> {
  const senderKey = authorizeWhatsAppSender(db, transport, senderPhone);
  if (!senderKey) return { accepted: false };

  const accounts = listAccounts(db);
  if (accounts.length === 0) {
    const replyText = '🤖 Please add a bank account or card in Personal Ledger first so I know where to log receipts.';
    await transport.sendText(senderPhone, replyText);
    return { accepted: true, logged: false, replyText };
  }

  const today = todayISO();
  const rules = listCategoryRules(db);
  const caption = (payload.caption ?? '').trim();

  let fields: ExtractedReceiptFields | null = null;
  const secretCfg = getAgentApiKeySecret(db);
  if (secretCfg.provider !== 'local' && secretCfg.apiKey) {
    const vis = await extractReceiptWithVisionLLM({
      provider: secretCfg.provider,
      apiKey: secretCfg.apiKey,
      model: secretCfg.model,
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType || 'image/jpeg',
      fallbackDate: today,
    });
    if (vis && vis.amountMinor && vis.amountMinor > 0) {
      const ruleHit = matchCategoryRule(rules, `${vis.vendor} ${caption}`, vis.kind);
      fields = {
        ...vis,
        category: ruleHit?.category ?? vis.category,
        scope: ruleHit?.scope ?? undefined,
        source: 'vision_llm',
      };
    }
  }

  if (!fields || !fields.amountMinor || fields.amountMinor <= 0) {
    fields = await extractReceiptImageOffline(payload.imageBase64, today, rules, caption);
  }

  if ((!fields || !fields.amountMinor || fields.amountMinor <= 0) && caption) {
    const fromCaption = extractReceiptFieldsFromText(caption, today, rules, caption);
    if (fromCaption.amountMinor && fromCaption.amountMinor > 0) {
      fields = fromCaption;
    }
  }

  if (!fields || !fields.amountMinor || fields.amountMinor <= 0) {
    const replyText =
      '🤖 Could not read an amount from that receipt/screenshot. Send a clearer crop or add a caption like "₹450 Swiggy".';
    await transport.sendText(senderPhone, replyText);
    return { accepted: true, logged: false, replyText };
  }

  // Apply caption scope override & account hint match
  const captionLow = caption.toLowerCase();
  const matchedRule = matchCategoryRule(rules, `${fields.vendor} ${caption}`, fields.kind);
  const explicitScope: Scope | undefined = /\b(biz|business)\b/.test(captionLow)
    ? 'business'
    : /\b(family|home)\b/.test(captionLow)
      ? 'family'
      : /\bpersonal\b/.test(captionLow)
        ? 'personal'
        : fields.scope ?? matchedRule?.scope ?? undefined;

  let chosenAccount =
    (matchedRule?.accountId ? accounts.find((a) => a.id === matchedRule.accountId) : undefined) ??
    accounts.find(
      (a) =>
        (a.last4 && captionLow.includes(a.last4.toLowerCase())) ||
        captionLow.includes(a.name.toLowerCase()),
    ) ??
    (explicitScope
      ? accounts.find((a) => a.scope === explicitScope && a.type === 'bank') ??
        accounts.find((a) => a.scope === explicitScope)
      : undefined) ??
    accounts.find((a) => a.type === 'bank') ??
    accounts[0];

  const finalScope: Scope = explicitScope ?? chosenAccount.scope;
  const prefs = getAppPreferences(db);

  if (!prefs.agentAutoExecute) {
    prunePendingWhatsAppReceipts();
    pendingWhatsAppReceipts.set(senderKey, {
      fields,
      scope: finalScope,
      accountId: chosenAccount.id,
      accountName: chosenAccount.name,
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType || 'image/jpeg',
      expiresAt: Date.now() + 10 * 60_000,
    });
    const replyText = `🤖 Receipt scanned (${fields.kind === 'income' ? '+' : '-'}${formatINR(fields.amountMinor)} · ${fields.vendor} · ${fields.category} · ${chosenAccount.name}).\nReply "confirm" to log with proof attached.`;
    await transport.sendText(senderPhone, replyText);
    return { accepted: true, logged: false, replyText };
  }

  const { txId, attached } = commitReceiptWithProof(db, {
    fields,
    scope: finalScope,
    accountId: chosenAccount.id,
    accountName: chosenAccount.name,
    imageBase64: payload.imageBase64,
    mimeType: payload.mimeType || 'image/jpeg',
  });
  const replyText = `✅ Logged from receipt: ${fields.kind === 'income' ? '+' : '-'}${formatINR(fields.amountMinor)} · ${fields.vendor} (${fields.category} · ${finalScope} · ${chosenAccount.name})${attached ? ' [proof attached]' : ''}.`;
  await transport.sendText(senderPhone, replyText);
  return { accepted: true, logged: true, transactionId: txId, replyText };
}

export async function handleIncomingWhatsAppAudio(
  db: DatabaseSync,
  transport: WhatsAppTransport,
  senderPhone: string,
  payload: IncomingWhatsAppAudio,
): Promise<{ accepted: boolean; transcribed?: boolean; transcript?: string; replyText?: string }> {
  const senderKey = authorizeWhatsAppSender(db, transport, senderPhone);
  if (!senderKey) return { accepted: false };

  const prefs = getAppPreferences(db);
  const agentSecret = getAgentApiKeySecret(db);
  const apiKey =
    (agentSecret?.apiKey ?? '').trim() ||
    (process.env.GEMINI_API_KEY ?? '').trim() ||
    (process.env.OPENAI_API_KEY ?? '').trim();

  const provider =
    prefs.llmProvider !== 'local'
      ? prefs.llmProvider
      : agentSecret?.provider ??
        (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'local');

  if (provider === 'local' || !apiKey) {
    const replyText =
      '🎙️ Received your voice note. To transcribe Bengali, Hindi, or English voice notes into ledger entries, please configure a Gemini or OpenAI API key in Personal Ledger Settings (⚙️).';
    await transport.sendText(senderPhone, replyText);
    return { accepted: true, transcribed: false, replyText };
  }

  const transcribed = await transcribeAndDetectAudioWithLLM({
    provider,
    apiKey,
    model: prefs.llmModel.trim(),
    audioBase64: payload.audioBase64,
    mimeType: payload.mimeType || 'audio/ogg; codecs=opus',
  });

  if (!transcribed || !transcribed.transcript.trim()) {
    const replyText =
      '🎙️ I heard your voice note, but could not transcribe it clearly. Please try speaking closer to the microphone or text your command directly.';
    await transport.sendText(senderPhone, replyText);
    return { accepted: true, transcribed: false, replyText };
  }

  const transcript = transcribed.transcript.trim();
  const cmdRes = await processAgentCommand(db, transport, {
    commandText: transcript,
    confirmExecution: prefs.agentAutoExecute,
  });

  const replyText = `🎙️ Voice Note: "${transcript}"\n🤖 ${cmdRes.replyText}${
    cmdRes.requiresConfirmation ? `\nReply with "confirm ${transcript}" to execute.` : ''
  }`;

  await transport.sendText(senderPhone, replyText);
  return { accepted: true, transcribed: true, transcript, replyText };
}
