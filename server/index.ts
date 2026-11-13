import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  type Scope,
  SCOPES,
  bulkTransactionActionSchema,
  createAccountSchema,
  createCategoryRuleSchema,
  createDueSchema,
  createInvestmentSchema,
  createLoanSchema,
  createRecurringBillSchema,
  createSavingsGoalSchema,
  createTransactionSchema,
  contributeSavingsGoalSchema,
  payLoanSchema,
  receiptAttachmentInputSchema,
  settleDueSchema,
  splitExpenseSchema,
  todayISO,
  updateAlertSettingsSchema,
  updateDueSchema,
  updateInvestmentSchema,
  updateLoanSchema,
  updateRecurringBillSchema,
  updateSavingsGoalSchema,
  updateTransactionSchema,
  upsertBudgetSchema,
  upsertCategoryBudgetSchema,
  upsertNoteSchema,
  bulkNoteActionSchema,
  reorderNotesSchema,
  noteAttachmentInputSchema,
  upsertVaultEntrySchema,
  matchTransferSchema,
  reconcilePayCardSchema,
  addMonthsISO,
} from '../shared/ledger-core.ts';
import { openDatabase, withTransaction } from './db/schema.ts';
import {
  createAccount,
  deleteAccount,
  getCardCycleReconciliation,
  listAccounts,
  updateAccount,
} from './db/accounts-repo.ts';
import {
  autoPostDueRecurringBills,
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  confirmRecurringBill,
  contributeToSavingsGoal,
  createCategoryRule,
  createInvestment,
  createLoan,
  createPersonDue,
  createRecurringBill,
  createSavingsGoal,
  createSplitExpenseDues,
  createTransaction,
  deleteCategoryBudget,
  deleteCategoryRule,
  deleteInvestment,
  deleteLoan,
  deletePersonDue,
  deleteRecurringBill,
  deleteSavingsGoal,
  deleteTransaction,
  findUnmatchedTransfers,
  getTransactionAttachment,
  listCategoryBudgets,
  listCategoryRules,
  listInvestments,
  listLoans,
  listPeopleDues,
  listRecurringBills,
  listScopeBudgets,
  listTransactions,
  matchTransferPair,
  reconcileAndPayCard,
  reconcileBankBalance,
  recordLoanPayment,
  saveTransactionAttachment,
  settlePersonDue,
  summarizeDuesByPerson,
  updateInvestment,
  updateLoan,
  updatePersonDue,
  updateRecurringBill,
  updateSavingsGoal,
  updateTransaction,
  upsertCategoryBudget,
  upsertScopeBudget,
} from './db/ledger-repo.ts';
import {
  addNoteAttachment,
  bulkNoteAction,
  deleteNote,
  deleteNoteAttachment,
  listNoteAttachments,
  listNotes,
  reorderNotes,
  toggleChecklistItem,
  upsertNote,
} from './db/notes-repo.ts';
import {
  deleteVaultEntry,
  getVaultMeta,
  listVaultEntries,
  recordVaultSecurityEvent,
  rekeyVaultEntries,
  saveVaultRecoveryMeta,
  setVaultMeta,
  upsertVaultEntry,
} from './db/vault-repo.ts';
import {
  getAlertSettings,
  listAlertDeliveries,
  markAllAlertsRead,
  saveAlertSettings,
} from './db/alerts-repo.ts';
import {
  exportFullSnapshotJSON,
  exportTransactionsCSV,
  exportTaxPackCSV,
  getDashboardSummary,
  getDetailedReports,
  getTaxSummaryPack,
  globalSearch,
  restoreFullSnapshotJSON,
} from './db/reports-repo.ts';
import { BaileysWhatsAppBridge, type WhatsAppTransport } from './whatsapp/bridge.ts';
import {
  handleIncomingWhatsAppAudio,
  handleIncomingWhatsAppCommand,
  handleIncomingWhatsAppImage,
  runAlertCycle,
} from './whatsapp/scheduler.ts';
import {
  clearAgentHistory,
  clearAppPin,
  decryptBackupSnapshot,
  encryptBackupSnapshot,
  getAgentApiKeySecret,
  getAppPreferences,
  listAgentHistory,
  setAppPin,
  updateAppPreferences,
  verifyAppPin,
  writeAutoBackupFile,
} from './db/settings-repo.ts';
import { processAgentCommand, processAgentVoice } from './agent/executor.ts';
import { buildAdvisorBriefing } from './agent/advisor.ts';
import {
  computeDebtPayoffPlan,
  detectRecurringLeaks,
  extractBankPdfText,
  extractReceiptFieldsFromText,
  extractReceiptImageOffline,
  parseStatementInput,
  summarizeGoalsAndRunway,
} from './agent/intelligence.ts';
import { extractReceiptWithVisionLLM } from './agent/llm.ts';
import { APP_LANGUAGES } from '../shared/i18n.ts';
import { handleSystemRoute } from './routes/system-routes.ts';
import { SimpleRateLimiter, applySecurityHeaders } from './middleware/security.ts';
import { startInboxWatcher } from './watcher/inbox-watcher.ts';
import {
  generatePairingToken,
  getLocalNetworkIps,
  exportDifferentialSync,
  ingestDifferentialSync,
} from './sync/lan-sync.ts';
import { seedFinancialData } from './db/seed.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function setSecurityHeaders(res: http.ServerResponse): void {
  applySecurityHeaders(res);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, status: number, code: string, message: string, details?: unknown): void {
  sendJson(res, status, { error: { code, message, details } });
}

async function readJsonBody(req: http.IncomingMessage, maxBytes = 2_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error('Payload too large');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function parseScopeParam(val: string | null): Scope | undefined {
  if (!val) return undefined;
  return (SCOPES as readonly string[]).includes(val) ? (val as Scope) : undefined;
}

/**
 * Resolves a file path relative to an allowed base directory and verifies that the resolved path
 * strictly resides inside the intended parent directory (resolvedPath.startsWith(allowedBaseDir)),
 * preventing any directory traversal attacks (../).
 */
export function resolveSafeChildPath(allowedBaseDir: string, userPath: string): string | null {
  const resolvedBase = path.resolve(allowedBaseDir);
  let decoded = userPath;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  if (/^[a-zA-Z]:/.test(decoded) || decoded.startsWith('\\\\') || decoded.startsWith('//')) {
    return null;
  }
  // Strip leading slashes and backslashes
  const sanitized = decoded.replace(/^[/\\]+/, '');
  if (/^[a-zA-Z]:/.test(sanitized)) {
    return null;
  }
  const resolvedPath = path.resolve(resolvedBase, sanitized);
  const allowedPrefix = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

  if (!resolvedPath.startsWith(resolvedBase) || (resolvedPath !== resolvedBase && !resolvedPath.startsWith(allowedPrefix))) {
    return null;
  }
  return resolvedPath;
}

export function createAppServer(opts: {
  db: DatabaseSync;
  transport: WhatsAppTransport;
  staticDir?: string;
}): http.Server {
  const { db, transport, staticDir } = opts;

  transport.onIncomingText?.(async (fromPhone, text) => {
    await handleIncomingWhatsAppCommand(db, transport, fromPhone, text);
  });
  transport.onIncomingImage?.(async (fromPhone, payload) => {
    await handleIncomingWhatsAppImage(db, transport, fromPhone, payload);
  });
  transport.onIncomingAudio?.(async (fromPhone, payload) => {
    await handleIncomingWhatsAppAudio(db, transport, fromPhone, payload);
  });

  const vaultRecoveryOtps = new Map<string, { code: string; expiresAt: number; attempts: number }>();
  const pinLimiter = new SimpleRateLimiter({ windowMs: 60_000, maxRequests: 5 });

  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    try {
      if (await handleSystemRoute(req, res, db)) {
        return;
      }

      // Multi-Device Local LAN Encrypted Sync
      if (method === 'GET' && pathname === '/api/sync/pairing-qr') {
        return sendJson(res, 200, {
          data: {
            ips: getLocalNetworkIps(),
            ...generatePairingToken(),
          },
        });
      }
      if (method === 'GET' && pathname === '/api/sync/export') {
        const since = reqUrl.searchParams.get('since') || undefined;
        return sendJson(res, 200, exportDifferentialSync(db, since));
      }
      if (method === 'POST' && pathname === '/api/sync/import') {
        const body = (await readJsonBody(req, 10_000_000)) as any;
        return sendJson(res, 200, ingestDifferentialSync(db, body));
      }
      if (method === 'POST' && pathname === '/api/system/seed') {
        const summary = seedFinancialData(db);
        return sendJson(res, 200, { ok: true, data: summary });
      }

      // Health
      if (method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, whatsapp: transport.getState().status });
      }

      // Global Cross-Module Search
      if (method === 'GET' && pathname === '/api/search') {
        const q = reqUrl.searchParams.get('q') || '';
        return sendJson(res, 200, { data: globalSearch(db, q) });
      }

      // Dashboard & Reports
      if (method === 'GET' && pathname === '/api/dashboard') {
        const scope = parseScopeParam(reqUrl.searchParams.get('scope'));
        return sendJson(res, 200, getDashboardSummary(db, scope));
      }

      if (method === 'GET' && pathname === '/api/reports') {
        const today = todayISO();
        const fromDate = reqUrl.searchParams.get('fromDate') || addMonthsISO(today, -5).slice(0, 7) + '-01';
        const toDate = reqUrl.searchParams.get('toDate') || today;
        const scope = parseScopeParam(reqUrl.searchParams.get('scope'));
        return sendJson(res, 200, getDetailedReports(db, { fromDate, toDate, scope }));
      }

      if (method === 'GET' && pathname === '/api/reports/tax-pack') {
        const fyParam = reqUrl.searchParams.get('fyStartYear');
        const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : undefined;
        return sendJson(res, 200, { data: getTaxSummaryPack(db, fy) });
      }

      if (
        method === 'GET' &&
        (pathname === '/api/tax/export-pack' ||
          pathname === '/api/reports/tax-pack/export.csv' ||
          pathname === '/api/reports/tax-pack/export')
      ) {
        const fileParam = reqUrl.searchParams.get('file') || reqUrl.searchParams.get('filename');
        if (fileParam) {
          const allowedBaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exports');
          fs.mkdirSync(allowedBaseDir, { recursive: true });
          const resolvedPath = resolveSafeChildPath(allowedBaseDir, fileParam);
          if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
            return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
          }
          if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            return sendError(res, 404, 'NOT_FOUND', 'Export file not found');
          }
          setSecurityHeaders(res);
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${path.basename(resolvedPath)}"`,
          });
          return fs.createReadStream(resolvedPath).pipe(res);
        }

        const fyParam = reqUrl.searchParams.get('fyStartYear');
        const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : undefined;
        const csv = exportTaxPackCSV(db, fy);
        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ca-tax-pack-${fy ?? todayISO().slice(0, 4)}.csv"`,
        });
        return res.end(csv);
      }

      if (
        method === 'GET' &&
        (pathname === '/api/tax/pdf-download' || pathname === '/api/reports/tax-pack/pdf-download')
      ) {
        const fileParam = reqUrl.searchParams.get('file') || reqUrl.searchParams.get('filename');
        const allowedBaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exports');
        fs.mkdirSync(allowedBaseDir, { recursive: true });

        if (fileParam) {
          const resolvedPath = resolveSafeChildPath(allowedBaseDir, fileParam);
          if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
            return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
          }
          if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            return sendError(res, 404, 'NOT_FOUND', 'PDF file not found');
          }
          setSecurityHeaders(res);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${path.basename(resolvedPath)}"`,
          });
          return fs.createReadStream(resolvedPath).pipe(res);
        }

        const fyParam = reqUrl.searchParams.get('fyStartYear');
        const fy = fyParam && /^\d{4}$/.test(fyParam) ? Number(fyParam) : undefined;
        const taxData = getTaxSummaryPack(db, fy);
        const totalIncome = Object.values(taxData.scopePnl).reduce((s, p) => s + p.incomeMinor, 0);
        const totalExpense = Object.values(taxData.scopePnl).reduce((s, p) => s + p.expenseMinor, 0);
        const fallbackPdf = `%PDF-1.4\n% CA Tax Summary ${taxData.fiscalYearLabel}\nTotal Income: ${totalIncome}\nTotal Expenses: ${totalExpense}\n`;
        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="tax-summary-${fy ?? todayISO().slice(0, 4)}.pdf"`,
        });
        return res.end(Buffer.from(fallbackPdf, 'utf-8'));
      }

      const backupsMatch = pathname.match(/^\/api\/backups(?:\/(.*))?$/);
      if (backupsMatch && method === 'GET') {
        const prefs = getAppPreferences(db);
        const defaultBackupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'backups');
        const allowedBaseDir = prefs.autoBackupDir ? path.resolve(prefs.autoBackupDir) : defaultBackupDir;
        fs.mkdirSync(allowedBaseDir, { recursive: true });

        const filename = backupsMatch[1] || reqUrl.searchParams.get('file') || reqUrl.searchParams.get('filename');
        if (!filename) {
          const files = fs.readdirSync(allowedBaseDir).filter((f) => f.endsWith('.json'));
          return sendJson(res, 200, { data: files });
        }

        const resolvedPath = resolveSafeChildPath(allowedBaseDir, filename);
        if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
          return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
        }

        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
          return sendError(res, 404, 'NOT_FOUND', 'Backup file not found');
        }

        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${path.basename(resolvedPath)}"`,
        });
        return fs.createReadStream(resolvedPath).pipe(res);
      }

      if (method === 'GET' && pathname === '/api/reports/export.csv') {
        const fileParam = reqUrl.searchParams.get('file') || reqUrl.searchParams.get('filename');
        if (fileParam) {
          const allowedBaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exports');
          const resolvedPath = resolveSafeChildPath(allowedBaseDir, fileParam);
          if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
            return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
          }
        }
        const fromDate = reqUrl.searchParams.get('fromDate') || undefined;
        const toDate = reqUrl.searchParams.get('toDate') || undefined;
        const scope = parseScopeParam(reqUrl.searchParams.get('scope'));
        const csv = exportTransactionsCSV(db, { fromDate, toDate, scope });
        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ledger-${todayISO()}.csv"`,
        });
        return res.end(csv);
      }

      if (method === 'GET' && pathname === '/api/backup.json') {
        const snapshot = exportFullSnapshotJSON(db);
        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="personal-ledger-backup-${todayISO()}.json"`,
        });
        return res.end(JSON.stringify(snapshot, null, 2));
      }

      if (method === 'POST' && pathname === '/api/backup/restore') {
        try {
          const body = await readJsonBody(req, 15_000_000);
          const result = restoreFullSnapshotJSON(db, body);
          return sendJson(res, 200, { data: result });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid backup snapshot format', err.flatten());
          }
          throw err;
        }
      }

      if (method === 'POST' && pathname === '/api/backup/export-encrypted') {
        const parsed = z.object({ passphrase: z.string().min(6).max(200) }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Passphrase must be at least 6 characters');
        const envelope = encryptBackupSnapshot(exportFullSnapshotJSON(db), parsed.data.passphrase);
        return sendJson(res, 200, { data: envelope });
      }

      if (method === 'POST' && pathname === '/api/backup/restore-encrypted') {
        const parsed = z
          .object({ passphrase: z.string().min(1), envelope: z.any() })
          .safeParse(await readJsonBody(req, 20_000_000));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Encrypted backup file and passphrase required');
        try {
          const decrypted = decryptBackupSnapshot(parsed.data.envelope, parsed.data.passphrase);
          const result = restoreFullSnapshotJSON(db, decrypted);
          return sendJson(res, 200, { data: result });
        } catch {
          return sendError(res, 400, 'BACKUP_DECRYPT_FAILED', 'Wrong passphrase or corrupted encrypted backup file.');
        }
      }

      if (method === 'POST' && pathname === '/api/backup/run-now') {
        const prefs = getAppPreferences(db);
        const defaultBackupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'backups');
        const allowedBaseDir = prefs.autoBackupDir ? path.resolve(prefs.autoBackupDir) : defaultBackupDir;
        const today = todayISO();
        const outPath = writeAutoBackupFile(allowedBaseDir, today, exportFullSnapshotJSON(db));
        updateAppPreferences(db, { lastAutoBackupDate: today });
        return sendJson(res, 200, { data: { path: outPath, backedUpAt: today } });
      }

      // Accounts (Banks & Credit Cards)
      if (method === 'GET' && pathname === '/api/accounts') {
        return sendJson(res, 200, { data: listAccounts(db) });
      }

      if (method === 'POST' && pathname === '/api/accounts') {
        const parsed = createAccountSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid account input', parsed.error.flatten());
        return sendJson(res, 201, { data: createAccount(db, parsed.data) });
      }

      const accReconcileMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/reconcile$/);
      if (method === 'POST' && accReconcileMatch) {
        const schema = z.object({ targetBalanceMinor: z.number().int(), occurredAt: z.string().optional() });
        const parsed = schema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid target balance', parsed.error.flatten());
        const tx = reconcileBankBalance(db, accReconcileMatch[1], parsed.data.targetBalanceMinor, parsed.data.occurredAt);
        return sendJson(res, 200, { data: tx });
      }

      const accIdMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (accIdMatch) {
        const id = accIdMatch[1];
        if (method === 'PATCH') {
          const parsed = createAccountSchema.partial().safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid account update', parsed.error.flatten());
          const updated = updateAccount(db, id, parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Account not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          const result = deleteAccount(db, id);
          if (!result.ok) return sendError(res, 409, 'ACCOUNT_IN_USE', result.reason ?? 'Cannot delete account');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Credit Card Billing Cycle Auto-Reconciliation
      const cardReconMatch = pathname.match(/^\/api\/cards\/([^/]+)\/reconciliation$/);
      if (method === 'GET' && cardReconMatch) {
        const refDate = reqUrl.searchParams.get('refDate') || todayISO();
        const recon = getCardCycleReconciliation(db, cardReconMatch[1], refDate);
        if (!recon) return sendError(res, 404, 'NOT_FOUND', 'Card not found or not credit card');
        return sendJson(res, 200, { data: recon });
      }

      const cardReconPayMatch = pathname.match(/^\/api\/cards\/([^/]+)\/reconcile-pay$/);
      if (method === 'POST' && cardReconPayMatch) {
        const parsed = reconcilePayCardSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid card payment input', parsed.error.flatten());
        const result = reconcileAndPayCard(db, cardReconPayMatch[1], parsed.data);
        return sendJson(res, 200, result);
      }

      // Inter-Account Transfer Matching
      if (method === 'GET' && pathname === '/api/transfers/unmatched') {
        return sendJson(res, 200, { data: findUnmatchedTransfers(db) });
      }

      if (method === 'POST' && pathname === '/api/transfers/match') {
        const parsed = matchTransferSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid transfer match input', parsed.error.flatten());
        const result = matchTransferPair(db, parsed.data.sourceTxId, parsed.data.destTxId);
        return sendJson(res, 200, result);
      }

      // Transactions
      if (method === 'GET' && pathname === '/api/transactions') {
        const scope = parseScopeParam(reqUrl.searchParams.get('scope'));
        const kindParam = reqUrl.searchParams.get('kind');
        const kind = kindParam === 'income' || kindParam === 'expense' || kindParam === 'transfer' ? kindParam : undefined;
        const accountId = reqUrl.searchParams.get('accountId') || undefined;
        const search = reqUrl.searchParams.get('search') || undefined;
        const fromDate = reqUrl.searchParams.get('fromDate') || undefined;
        const toDate = reqUrl.searchParams.get('toDate') || undefined;
        return sendJson(res, 200, {
          data: listTransactions(db, { scope, kind, accountId, search, fromDate, toDate }),
        });
      }

      if (method === 'POST' && pathname === '/api/transactions') {
        const raw = (await readJsonBody(req, 4_500_000)) as Record<string, unknown>;
        const parsed = createTransactionSchema.safeParse(raw);
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid transaction input', parsed.error.flatten());

        const splitParsed = raw.split ? splitExpenseSchema.safeParse(raw.split) : null;
        if (splitParsed && !splitParsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid split participants', splitParsed.error.flatten());
        }
        const attachParsed = raw.attachment ? receiptAttachmentInputSchema.safeParse(raw.attachment) : null;
        if (attachParsed && !attachParsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid receipt attachment', attachParsed.error.flatten());
        }

        const out = withTransaction(db, () => {
          const tx = createTransaction(db, parsed.data);
          let hasAttachment = false;
          if (attachParsed?.success) {
            saveTransactionAttachment(db, tx.id, attachParsed.data);
            hasAttachment = true;
          }
          const createdDues =
            splitParsed?.success && parsed.data.kind === 'expense'
              ? createSplitExpenseDues(db, tx, splitParsed.data)
              : [];
          return { data: { ...tx, hasAttachment }, createdDues };
        });
        return sendJson(res, 201, out);
      }

      if (method === 'POST' && pathname === '/api/transactions/bulk') {
        const parsed = bulkTransactionActionSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid bulk transaction request', parsed.error.flatten());
        }
        if (parsed.data.action === 'delete') {
          const deletedCount = bulkDeleteTransactions(db, parsed.data.ids);
          return sendJson(res, 200, { ok: true, count: deletedCount });
        }
        if (parsed.data.action === 'update' && parsed.data.patch) {
          const updatedCount = bulkUpdateTransactions(db, parsed.data.ids, parsed.data.patch);
          return sendJson(res, 200, { ok: true, count: updatedCount });
        }
        return sendError(res, 400, 'BAD_REQUEST', 'Missing patch for update action');
      }

      const txAttachMatch = pathname.match(/^\/api\/transactions\/([^/]+)\/attachment$/);
      if (method === 'GET' && txAttachMatch) {
        const txId = txAttachMatch[1];
        let decodedId = txId;
        try { decodedId = decodeURIComponent(txId); } catch {}
        if (decodedId.includes('..') || decodedId.includes('/') || decodedId.includes('\\')) {
          return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
        }
        const att = getTransactionAttachment(db, decodedId);
        if (!att) return sendError(res, 404, 'NOT_FOUND', 'Receipt attachment not found');
        return sendJson(res, 200, { data: att });
      }

      const generalAttachMatch = pathname.match(/^\/api\/attachments(?:\/(.*))?$/);
      if (method === 'GET' && generalAttachMatch) {
        const param = generalAttachMatch[1] || reqUrl.searchParams.get('file') || reqUrl.searchParams.get('id');
        if (!param) {
          return sendError(res, 400, 'BAD_REQUEST', 'Missing attachment identifier');
        }
        const allowedBaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'attachments');
        fs.mkdirSync(allowedBaseDir, { recursive: true });
        const resolvedPath = resolveSafeChildPath(allowedBaseDir, param);
        if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
          return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
        }
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          setSecurityHeaders(res);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          return fs.createReadStream(resolvedPath).pipe(res);
        }
        const att = getTransactionAttachment(db, param);
        if (att) return sendJson(res, 200, { data: att });
        return sendError(res, 404, 'NOT_FOUND', 'Attachment not found');
      }

      const txIdMatch = pathname.match(/^\/api\/transactions\/([^/]+)$/);
      if (txIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateTransactionSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid transaction update', parsed.error.flatten());
          const updated = updateTransaction(db, txIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteTransaction(db, txIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Transaction not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Recurring Bills
      if (method === 'GET' && pathname === '/api/recurring-bills') {
        return sendJson(res, 200, { data: listRecurringBills(db) });
      }
      if (method === 'POST' && pathname === '/api/recurring-bills') {
        const parsed = createRecurringBillSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid recurring bill', parsed.error.flatten());
        return sendJson(res, 201, { data: createRecurringBill(db, parsed.data) });
      }
      const recConfirmMatch = pathname.match(/^\/api\/recurring-bills\/([^/]+)\/confirm$/);
      if (method === 'POST' && recConfirmMatch) {
        const body = (await readJsonBody(req)) as { paidAt?: string };
        return sendJson(res, 200, { data: confirmRecurringBill(db, recConfirmMatch[1], body.paidAt || todayISO()) });
      }
      if (method === 'POST' && pathname === '/api/recurring-bills/auto-post') {
        return sendJson(res, 200, { data: autoPostDueRecurringBills(db) });
      }
      const recIdMatch = pathname.match(/^\/api\/recurring-bills\/([^/]+)$/);
      if (recIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateRecurringBillSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid recurring bill update', parsed.error.flatten());
          const updated = updateRecurringBill(db, recIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Recurring bill not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteRecurringBill(db, recIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Recurring bill not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Budgets
      if (method === 'GET' && pathname === '/api/budgets') {
        return sendJson(res, 200, { data: listScopeBudgets(db) });
      }
      if (method === 'PUT' && pathname === '/api/budgets') {
        const parsed = upsertBudgetSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid budget', parsed.error.flatten());
        upsertScopeBudget(db, parsed.data.scope, parsed.data.monthlyLimitMinor);
        return sendJson(res, 200, { data: listScopeBudgets(db) });
      }

      // Category Budgets
      if (method === 'GET' && pathname === '/api/budgets/categories') {
        return sendJson(res, 200, { data: listCategoryBudgets(db) });
      }
      if (method === 'POST' && pathname === '/api/budgets/categories') {
        const parsed = upsertCategoryBudgetSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid category budget', parsed.error.flatten());
        }
        const saved = upsertCategoryBudget(db, parsed.data.scope, parsed.data.category, parsed.data.monthlyLimitMinor);
        return sendJson(res, 200, { data: saved });
      }
      const catBudgetDelMatch = pathname.match(/^\/api\/budgets\/categories\/([^/]+)$/);
      if (method === 'DELETE' && catBudgetDelMatch) {
        if (!deleteCategoryBudget(db, catBudgetDelMatch[1])) {
          return sendError(res, 404, 'NOT_FOUND', 'Category budget not found');
        }
        return sendJson(res, 200, { ok: true });
      }

      // Loans
      if (method === 'GET' && pathname === '/api/loans') {
        return sendJson(res, 200, { data: listLoans(db) });
      }
      if (method === 'POST' && pathname === '/api/loans') {
        const parsed = createLoanSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid loan input', parsed.error.flatten());
        return sendJson(res, 201, { data: createLoan(db, parsed.data) });
      }
      const loanPayMatch = pathname.match(/^\/api\/loans\/([^/]+)\/payments$/);
      if (method === 'POST' && loanPayMatch) {
        const parsed = payLoanSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid loan payment', parsed.error.flatten());
        return sendJson(res, 201, { data: recordLoanPayment(db, loanPayMatch[1], parsed.data) });
      }
      const loanIdMatch = pathname.match(/^\/api\/loans\/([^/]+)$/);
      if (loanIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateLoanSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid loan update', parsed.error.flatten());
          const updated = updateLoan(db, loanIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Loan not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteLoan(db, loanIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Loan not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // People Dues (Give / Need)
      if (method === 'GET' && pathname === '/api/dues') {
        const dues = listPeopleDues(db);
        return sendJson(res, 200, { data: dues, summaries: summarizeDuesByPerson(dues) });
      }
      if (method === 'POST' && pathname === '/api/dues') {
        const parsed = createDueSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid due input', parsed.error.flatten());
        return sendJson(res, 201, { data: createPersonDue(db, parsed.data) });
      }
      const dueSettleMatch = pathname.match(/^\/api\/dues\/([^/]+)\/settle$/);
      if (method === 'POST' && dueSettleMatch) {
        const parsed = settleDueSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid settlement', parsed.error.flatten());
        return sendJson(res, 200, { data: settlePersonDue(db, dueSettleMatch[1], parsed.data) });
      }
      const dueIdMatch = pathname.match(/^\/api\/dues\/([^/]+)$/);
      if (dueIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateDueSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid due update', parsed.error.flatten());
          const updated = updatePersonDue(db, dueIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Due not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deletePersonDue(db, dueIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Due not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Notes & Checklists
      if (method === 'GET' && pathname === '/api/notes') {
        const search = reqUrl.searchParams.get('search') || undefined;
        return sendJson(res, 200, { data: listNotes(db, { search }) });
      }
      if (method === 'POST' && pathname === '/api/notes') {
        const parsed = upsertNoteSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid note input', parsed.error.flatten());
        return sendJson(res, 201, { data: upsertNote(db, null, parsed.data) });
      }
      if (method === 'POST' && pathname === '/api/notes/bulk') {
        const parsed = bulkNoteActionSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid bulk note input', parsed.error.flatten());
        const result = bulkNoteAction(db, parsed.data);
        return sendJson(res, 200, { ok: true, count: result.count });
      }
      if (method === 'POST' && pathname === '/api/notes/reorder') {
        const parsed = reorderNotesSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid reorder input', parsed.error.flatten());
        const result = reorderNotes(db, parsed.data.noteIds);
        return sendJson(res, 200, result);
      }
      const noteToggleMatch = pathname.match(/^\/api\/notes\/([^/]+)\/checklist\/([^/]+)$/);
      if (method === 'PATCH' && noteToggleMatch) {
        const parsed = z.object({ done: z.boolean() }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid checklist toggle');
        const updated = toggleChecklistItem(db, noteToggleMatch[1], noteToggleMatch[2], parsed.data.done);
        if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Checklist item not found');
        return sendJson(res, 200, { data: updated });
      }
      const noteAttMatch = pathname.match(/^\/api\/notes\/([^/]+)\/attachments(?:\/([^/]+))?$/);
      if (noteAttMatch) {
        const noteId = noteAttMatch[1];
        const attId = noteAttMatch[2];
        if (method === 'GET' && !attId) {
          return sendJson(res, 200, { data: listNoteAttachments(db, noteId) });
        }
        if (method === 'POST' && !attId) {
          const parsed = noteAttachmentInputSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid attachment', parsed.error.flatten());
          const att = addNoteAttachment(db, noteId, parsed.data);
          return sendJson(res, 201, { data: att });
        }
        if (method === 'DELETE' && attId) {
          if (!deleteNoteAttachment(db, noteId, attId)) return sendError(res, 404, 'NOT_FOUND', 'Attachment not found');
          return sendJson(res, 200, { ok: true });
        }
      }
      const noteIdMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
      if (noteIdMatch) {
        if (method === 'PUT') {
          const parsed = upsertNoteSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid note update', parsed.error.flatten());
          return sendJson(res, 200, { data: upsertNote(db, noteIdMatch[1], parsed.data) });
        }
        if (method === 'DELETE') {
          if (!deleteNote(db, noteIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Note not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Vault (Ciphertext + Security Metadata ONLY)
      if (method === 'GET' && pathname === '/api/vault/meta') {
        return sendJson(res, 200, { data: getVaultMeta(db) });
      }
      if (method === 'POST' && pathname === '/api/vault/meta') {
        if (getVaultMeta(db)) {
          return sendError(res, 409, 'CONFLICT', 'Vault master key is already initialized');
        }
        const parsed = z
          .object({
            saltB64: z.string().min(1),
            canaryIv: z.string().min(1),
            canaryCt: z.string().min(1),
            recoverySaltB64: z.string().min(1).optional(),
            recoveryIv: z.string().min(1).optional(),
            recoveryCt: z.string().min(1).optional(),
            waRecoveryKey: z.string().min(1).optional(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid vault metadata');
        const meta = setVaultMeta(db, parsed.data);
        recordVaultSecurityEvent(db, 'vault_initialized', 'Vault master key initialized');
        return sendJson(res, 200, { data: meta });
      }
      if (method === 'POST' && pathname === '/api/vault/recovery') {
        const parsed = z
          .object({
            recoverySaltB64: z.string().min(1),
            recoveryIv: z.string().min(1),
            recoveryCt: z.string().min(1),
            waRecoveryKey: z.string().min(1).optional().nullable(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid recovery metadata', parsed.error.flatten());
        const meta = saveVaultRecoveryMeta(db, parsed.data);
        recordVaultSecurityEvent(db, 'vault_unlocked', 'Recovery escrow updated');
        return sendJson(res, 200, { data: meta });
      }
      if (method === 'POST' && pathname === '/api/vault/recovery/whatsapp-request') {
        const meta = getVaultMeta(db);
        if (!meta) return sendError(res, 404, 'NOT_FOUND', 'Vault is not configured yet');
        if (!meta.waRecoveryKey) {
          return sendError(
            res,
            400,
            'WA_RECOVERY_NOT_CONFIGURED',
            'WhatsApp recovery key is not stored for this vault. Please use your Emergency Recovery Key (PLVK-...).',
          );
        }
        if (transport.getState().status !== 'connected') {
          return sendError(
            res,
            503,
            'WHATSAPP_DISCONNECTED',
            'WhatsApp is currently disconnected. Please use your offline Emergency Recovery Key (PLVK-...).',
          );
        }
        const settings = getAlertSettings(db);
        if (!settings.recipientPhone?.trim()) {
          return sendError(
            res,
            400,
            'NO_RECIPIENT_PHONE',
            'No phone number configured in Alert Settings. Please use your Emergency Recovery Key.',
          );
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        vaultRecoveryOtps.set('active', { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

        const phone = settings.recipientPhone.trim();
        const msg =
          `🔐 *Personal Ledger Vault Recovery*\n\n` +
          `Your single-use emergency recovery code is: *${code}*\n\n` +
          `This code expires in 10 minutes. Enter it on the login page to recover your vault with zero data loss. Do not share this code.`;
        const sendRes = await transport.sendText(phone, msg);
        if (!sendRes.ok) {
          return sendError(res, 500, 'WHATSAPP_SEND_FAILED', sendRes.error || 'Failed to dispatch WhatsApp message');
        }
        const masked = phone.length > 5 ? `${phone.slice(0, 2)}••••••${phone.slice(-3)}` : phone;
        return sendJson(res, 200, { ok: true, phoneMasked: masked, expiresMinutes: 10 });
      }
      if (method === 'POST' && pathname === '/api/vault/recovery/whatsapp-verify') {
        const parsed = z
          .object({ code: z.string().trim().min(4).max(10) })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid OTP format');
        const active = vaultRecoveryOtps.get('active');
        if (!active || Date.now() > active.expiresAt) {
          return sendError(res, 400, 'OTP_EXPIRED', 'Recovery code has expired or was not requested. Please request a new code.');
        }
        if (active.attempts >= 3) {
          vaultRecoveryOtps.delete('active');
          return sendError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Please request a new recovery code.');
        }
        if (parsed.data.code !== active.code) {
          active.attempts += 1;
          return sendError(res, 400, 'INVALID_OTP', `Incorrect recovery code. ${3 - active.attempts} attempt(s) remaining.`);
        }
        vaultRecoveryOtps.delete('active');
        const meta = getVaultMeta(db);
        if (!meta || !meta.waRecoveryKey) {
          return sendError(res, 404, 'NOT_FOUND', 'Vault recovery metadata missing');
        }
        recordVaultSecurityEvent(db, 'vault_unlocked', 'Unlocked via WhatsApp OTP code');
        return sendJson(res, 200, {
          ok: true,
          recoveryKey: meta.waRecoveryKey,
          recoverySaltB64: meta.recoverySaltB64,
          recoveryIv: meta.recoveryIv,
          recoveryCt: meta.recoveryCt,
        });
      }
      if (method === 'GET' && pathname === '/api/vault/entries') {
        return sendJson(res, 200, { data: listVaultEntries(db) });
      }
      if (method === 'POST' && pathname === '/api/vault/entries') {
        const parsed = upsertVaultEntrySchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid encrypted vault entry', parsed.error.flatten());
        return sendJson(res, 201, { data: upsertVaultEntry(db, parsed.data) });
      }
      const vaultEntryMatch = pathname.match(/^\/api\/vault\/entries\/([^/]+)$/);
      if (method === 'DELETE' && vaultEntryMatch) {
        if (!deleteVaultEntry(db, vaultEntryMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Vault entry not found');
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/vault/rekey') {
        const parsed = z
          .object({
            saltB64: z.string().min(1),
            canaryIv: z.string().min(1),
            canaryCt: z.string().min(1),
            recoverySaltB64: z.string().min(1).optional().nullable(),
            recoveryIv: z.string().min(1).optional().nullable(),
            recoveryCt: z.string().min(1).optional().nullable(),
            waRecoveryKey: z.string().min(1).optional().nullable(),
            entries: z.array(upsertVaultEntrySchema.extend({ id: z.string().uuid() })),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid vault rekey payload', parsed.error.flatten());
        const meta = rekeyVaultEntries(db, parsed.data);
        return sendJson(res, 200, { data: meta });
      }
      if (method === 'POST' && pathname === '/api/vault/events') {
        const parsed = z
          .object({
            eventType: z.enum(['failed_unlock', 'vault_unlocked']),
            detail: z.string().max(120).default(''),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid security event');
        recordVaultSecurityEvent(db, parsed.data.eventType, parsed.data.detail);
        if (parsed.data.eventType === 'failed_unlock') {
          await runAlertCycle(db, transport);
        }
        return sendJson(res, 200, { ok: true });
      }

      // Alerts & WhatsApp Bridge
      if (method === 'GET' && pathname === '/api/alerts') {
        return sendJson(res, 200, { data: listAlertDeliveries(db) });
      }
      if (method === 'POST' && pathname === '/api/alerts/read-all') {
        markAllAlertsRead(db);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/alerts/check-now') {
        const result = await runAlertCycle(db, transport);
        return sendJson(res, 200, { data: result });
      }
      if (method === 'GET' && pathname === '/api/alerts/settings') {
        return sendJson(res, 200, { data: getAlertSettings(db) });
      }
      if (method === 'PUT' && pathname === '/api/alerts/settings') {
        const parsed = updateAlertSettingsSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid alert settings', parsed.error.flatten());
        return sendJson(res, 200, { data: saveAlertSettings(db, parsed.data) });
      }

      if (method === 'GET' && pathname === '/api/whatsapp/status') {
        return sendJson(res, 200, { data: transport.getState() });
      }
      if (method === 'POST' && pathname === '/api/whatsapp/connect') {
        void transport.connect();
        return sendJson(res, 200, { data: transport.getState() });
      }
      if (method === 'POST' && pathname === '/api/whatsapp/disconnect') {
        await transport.disconnect();
        return sendJson(res, 200, { data: transport.getState() });
      }
      if (method === 'POST' && pathname === '/api/whatsapp/logout') {
        await transport.logout();
        return sendJson(res, 200, { data: transport.getState() });
      }
      if (method === 'POST' && pathname === '/api/whatsapp/test') {
        const settings = getAlertSettings(db);
        const body = (await readJsonBody(req)) as { phone?: string };
        const result = await transport.sendText(
          body.phone || settings.recipientPhone,
          '✅ Personal Ledger WhatsApp Bridge is connected and ready for module alerts.',
        );
        if (!result.ok) return sendError(res, 400, 'WHATSAPP_SEND_FAILED', result.error ?? 'Failed to send test alert');
        return sendJson(res, 200, { ok: true });
      }

      // App Preferences (System Language & AI Agent Settings)
      if (method === 'GET' && pathname === '/api/preferences') {
        return sendJson(res, 200, { data: getAppPreferences(db) });
      }
      if (method === 'PUT' && pathname === '/api/preferences') {
        const parsed = z
          .object({
            systemLanguage: z.enum(APP_LANGUAGES).optional(),
            agentAutoExecute: z.boolean().optional(),
            llmProvider: z.enum(['local', 'gemini', 'openai']).optional(),
            llmApiKey: z.string().max(400).optional(),
            clearApiKey: z.boolean().optional(),
            llmModel: z.string().max(80).optional(),
            autoLockMinutes: z.number().int().min(0).max(240).optional(),
            autoBackupEnabled: z.boolean().optional(),
            autoBackupDir: z.string().max(260).optional(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid preferences', parsed.error.flatten());
        return sendJson(res, 200, { data: updateAppPreferences(db, parsed.data) });
      }

      // App Lock PIN
      if (method === 'POST' && pathname === '/api/app-lock/set') {
        const parsed = z
          .object({
            pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits'),
            currentPin: z.string().optional(),
            autoLockMinutes: z.number().int().min(0).max(240).optional(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'PIN must be 4 to 8 digits', parsed.error.flatten());
        const prefs = getAppPreferences(db);
        if (prefs.hasAppPin && !verifyAppPin(db, parsed.data.currentPin ?? '')) {
          return sendError(res, 403, 'INVALID_PIN', 'Current PIN is incorrect');
        }
        setAppPin(db, parsed.data.pin);
        const updated =
          parsed.data.autoLockMinutes !== undefined
            ? updateAppPreferences(db, { autoLockMinutes: parsed.data.autoLockMinutes })
            : getAppPreferences(db);
        return sendJson(res, 200, { data: updated });
      }
      if (method === 'POST' && pathname === '/api/app-lock/verify') {
        const ip = req.socket.remoteAddress || '127.0.0.1';
        const rateCheck = pinLimiter.check(ip);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
        const parsed = z.object({ pin: z.string().min(1).max(20) }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'PIN is required');
        const ok = verifyAppPin(db, parsed.data.pin);
        if (!ok) return sendError(res, 403, 'INVALID_PIN', 'Incorrect PIN');
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/app-lock/clear') {
        const parsed = z.object({ currentPin: z.string().min(1).max(20) }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Current PIN required');
        if (!verifyAppPin(db, parsed.data.currentPin)) {
          return sendError(res, 403, 'INVALID_PIN', 'Current PIN is incorrect');
        }
        return sendJson(res, 200, { data: clearAppPin(db) });
      }

      // Investments & Assets
      if (method === 'GET' && pathname === '/api/investments') {
        return sendJson(res, 200, { data: listInvestments(db) });
      }
      if (method === 'POST' && pathname === '/api/investments') {
        const parsed = createInvestmentSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid investment input', parsed.error.flatten());
        return sendJson(res, 201, { data: createInvestment(db, parsed.data) });
      }
      const invIdMatch = pathname.match(/^\/api\/investments\/([^/]+)$/);
      if (invIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateInvestmentSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid investment update', parsed.error.flatten());
          const updated = updateInvestment(db, invIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Investment not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteInvestment(db, invIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Investment not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Custom Merchant Auto-Categorization Rules
      if (method === 'GET' && pathname === '/api/rules') {
        return sendJson(res, 200, { data: listCategoryRules(db) });
      }
      if (method === 'POST' && pathname === '/api/rules') {
        const parsed = createCategoryRuleSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid category rule', parsed.error.flatten());
        return sendJson(res, 201, { data: createCategoryRule(db, parsed.data) });
      }
      const ruleIdMatch = pathname.match(/^\/api\/rules\/([^/]+)$/);
      if (method === 'DELETE' && ruleIdMatch) {
        if (!deleteCategoryRule(db, ruleIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Rule not found');
        return sendJson(res, 200, { ok: true });
      }

      // Personal AI Agent (Multilingual EN / HI / BN + Proactive Advisor)
      if (method === 'GET' && pathname === '/api/agent/briefing') {
        const scope = parseScopeParam(reqUrl.searchParams.get('scope'));
        const prefs = getAppPreferences(db);
        return sendJson(res, 200, {
          data: buildAdvisorBriefing(db, prefs.systemLanguage, scope),
        });
      }
      if (method === 'GET' && pathname === '/api/agent/subscriptions') {
        return sendJson(res, 200, { data: detectRecurringLeaks(db) });
      }
      if (method === 'GET' && pathname === '/api/planner/debt-payoff') {
        const extraMinor = Math.max(0, Math.round(Number(reqUrl.searchParams.get('extraMinor') || 0) || 0));
        const stratParam = reqUrl.searchParams.get('strategy');
        const strategy = stratParam === 'snowball' ? 'snowball' : 'avalanche';
        const cardAprBps = Math.max(0, Math.min(6000, Math.round(Number(reqUrl.searchParams.get('cardAprBps') || 3600) || 3600)));
        return sendJson(res, 200, {
          data: computeDebtPayoffPlan(db, { extraMonthlyMinor: extraMinor, strategy, assumedCardAprBps: cardAprBps }),
        });
      }

      // Savings Goals, Tax Reserves & Emergency Runway
      if (method === 'GET' && pathname === '/api/goals') {
        return sendJson(res, 200, { data: summarizeGoalsAndRunway(db) });
      }
      if (method === 'POST' && pathname === '/api/goals') {
        const parsed = createSavingsGoalSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid savings goal input', parsed.error.flatten());
        return sendJson(res, 201, { data: createSavingsGoal(db, parsed.data) });
      }
      const goalContribMatch = pathname.match(/^\/api\/goals\/([^/]+)\/contribute$/);
      if (method === 'POST' && goalContribMatch) {
        const parsed = contributeSavingsGoalSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid goal contribution', parsed.error.flatten());
        return sendJson(res, 200, { data: contributeToSavingsGoal(db, goalContribMatch[1], parsed.data) });
      }
      const goalIdMatch = pathname.match(/^\/api\/goals\/([^/]+)$/);
      if (goalIdMatch) {
        if (method === 'PATCH') {
          const parsed = updateSavingsGoalSchema.safeParse(await readJsonBody(req));
          if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid goal update', parsed.error.flatten());
          const updated = updateSavingsGoal(db, goalIdMatch[1], parsed.data);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteSavingsGoal(db, goalIdMatch[1])) return sendError(res, 404, 'NOT_FOUND', 'Goal not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Bank SMS / CSV / PDF / UPI Statement Auto-Importer
      if (method === 'POST' && pathname === '/api/import/preview') {
        const parsed = z
          .object({
            text: z.string().trim().min(1).max(500_000),
            defaultAccountId: z.string().uuid().optional(),
            defaultScope: z.enum(SCOPES).optional(),
          })
          .safeParse(await readJsonBody(req, 1_500_000));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Statement or SMS text is required', parsed.error.flatten());
        const items = parseStatementInput({
          rawText: parsed.data.text,
          accounts: listAccounts(db),
          existingTransactions: listTransactions(db, { limit: 3000 }),
          categoryRules: listCategoryRules(db),
          defaultAccountId: parsed.data.defaultAccountId,
          defaultScope: parsed.data.defaultScope,
        });
        return sendJson(res, 200, { data: items });
      }
      if (method === 'POST' && pathname === '/api/import/preview-pdf') {
        const parsed = z
          .object({
            pdfBase64: z.string().min(20).max(14_000_000),
            password: z.string().max(120).optional(),
            defaultAccountId: z.string().uuid().optional(),
            defaultScope: z.enum(SCOPES).optional(),
          })
          .safeParse(await readJsonBody(req, 16_000_000));
        if (!parsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Valid PDF file payload is required', parsed.error.flatten());
        }
        try {
          const { text, pageCount } = await extractBankPdfText(parsed.data.pdfBase64, parsed.data.password);
          if (!text.trim()) {
            return sendError(
              res,
              400,
              'PDF_NO_TEXT',
              'No selectable text found in this PDF (scanned image PDFs need Receipt OCR or CSV export).',
            );
          }
          const items = parseStatementInput({
            rawText: text,
            accounts: listAccounts(db),
            existingTransactions: listTransactions(db, { limit: 3000 }),
            categoryRules: listCategoryRules(db),
            defaultAccountId: parsed.data.defaultAccountId,
            defaultScope: parsed.data.defaultScope,
          });
          return sendJson(res, 200, {
            data: items,
            pageCount,
            extractedText: text.slice(0, 6000),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'PDF extraction failed';
          if (msg === 'PDF_PASSWORD_REQUIRED') {
            return sendError(
              res,
              400,
              'PDF_PASSWORD_REQUIRED',
              'This PDF statement is password-protected. Enter the PDF password and click Retry PDF.',
            );
          }
          if (msg === 'INVALID_PDF_PASSWORD') {
            return sendError(
              res,
              400,
              'INVALID_PDF_PASSWORD',
              'Incorrect PDF password. Please check and try again.',
            );
          }
          return sendError(res, 400, 'PDF_PARSE_ERROR', msg);
        }
      }
      if (method === 'POST' && pathname === '/api/import/commit') {
        const parsed = z
          .object({
            items: z.array(createTransactionSchema).min(1).max(500),
          })
          .safeParse(await readJsonBody(req, 1_500_000));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Valid transaction items are required', parsed.error.flatten());
        const inserted = withTransaction(db, () =>
          parsed.data.items.map((item) =>
            createTransaction(db, {
              ...item,
              sourceRef: 'statement_import',
            }),
          ),
        );
        return sendJson(res, 201, { data: { count: inserted.length, transactions: inserted } });
      }

      // Smart Receipt / Bill Photo & Text Capture
      if (method === 'POST' && pathname === '/api/receipt/parse') {
        const parsed = z
          .object({
            imageBase64: z.string().max(6_000_000).optional(),
            mimeType: z.string().max(100).optional(),
            receiptText: z.string().max(50_000).optional(),
          })
          .safeParse(await readJsonBody(req, 7_000_000));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid receipt payload', parsed.error.flatten());

        const today = todayISO();
        const rules = listCategoryRules(db);
        if (parsed.data.imageBase64 && parsed.data.imageBase64.length > 16) {
          const secretCfg = getAgentApiKeySecret(db);
          if (secretCfg.provider !== 'local' && secretCfg.apiKey) {
            const visionRes = await extractReceiptWithVisionLLM({
              provider: secretCfg.provider,
              apiKey: secretCfg.apiKey,
              model: secretCfg.model,
              imageBase64: parsed.data.imageBase64,
              mimeType: parsed.data.mimeType || 'image/jpeg',
              fallbackDate: today,
            });
            if (visionRes) {
              return sendJson(res, 200, { data: { ...visionRes, source: 'vision_llm' as const } });
            }
          }
          // 100% offline local OCR fallback (Tesseract + bundled @tesseract.js-data/eng)
          const offlineRes = await extractReceiptImageOffline(parsed.data.imageBase64, today, rules);
          if (offlineRes) {
            return sendJson(res, 200, { data: offlineRes });
          }
          if (!parsed.data.receiptText?.trim()) {
            return sendError(
              res,
              400,
              'RECEIPT_UNREADABLE_OFFLINE',
              'Could not read text from that image offline. Try a clearer crop, configure Gemini/OpenAI in AI Settings, or paste receipt text.',
            );
          }
        }

        if (parsed.data.receiptText?.trim()) {
          return sendJson(res, 200, { data: extractReceiptFieldsFromText(parsed.data.receiptText, today, rules) });
        }
        return sendError(res, 422, 'VALIDATION_ERROR', 'Provide a receipt image or paste receipt text.');
      }
      if (method === 'GET' && pathname === '/api/agent/history') {
        return sendJson(res, 200, { data: listAgentHistory(db) });
      }
      if (method === 'DELETE' && pathname === '/api/agent/history') {
        clearAgentHistory(db);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/agent/command') {
        const parsed = z
          .object({
            commandText: z.string().trim().min(1).max(2000),
            confirmExecution: z.boolean().optional(),
            pendingCalls: z.array(z.any()).optional(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Command text is required', parsed.error.flatten());
        const result = await processAgentCommand(db, transport, {
          commandText: parsed.data.commandText,
          confirmExecution: parsed.data.confirmExecution,
          pendingCalls: parsed.data.pendingCalls as any,
        });
        return sendJson(res, 200, { data: result });
      }
      if (method === 'POST' && pathname === '/api/agent/voice') {
        const parsed = z
          .object({
            audioBase64: z.string().trim().min(10).max(5_000_000),
            mimeType: z.string().trim().min(3).max(100),
          })
          .safeParse(await readJsonBody(req, 6_000_000));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Valid voice audio payload is required', parsed.error.flatten());
        const voiceResult = await processAgentVoice(db, transport, {
          audioBase64: parsed.data.audioBase64,
          mimeType: parsed.data.mimeType,
        });
        return sendJson(res, 200, { data: voiceResult });
      }

      // Serve built Vite SPA when staticDir exists
      if (staticDir && fs.existsSync(staticDir) && method === 'GET' && !pathname.startsWith('/api/')) {
        const allowedBaseDir = path.resolve(staticDir);
        const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const resolvedPath = resolveSafeChildPath(allowedBaseDir, rel);
        if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
          return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
        }
        const safePath = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()
          ? resolvedPath
          : path.join(allowedBaseDir, 'index.html');
        if (fs.existsSync(safePath)) {
          const ext = path.extname(safePath);
          setSecurityHeaders(res);
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
          return fs.createReadStream(safePath).pipe(res);
        }
      }

      return sendError(res, 404, 'NOT_FOUND', `Route not found: ${method} ${pathname}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal server error';
      if (
        msg.includes('not found') ||
        msg.includes('exceeds') ||
        msg.includes('already') ||
        msg.includes('Rekey must include') ||
        msg.includes('Configure a Gemini') ||
        msg.includes('Could not transcribe') ||
        msg.includes('Payload too large')
      ) {
        return sendError(res, 400, 'BAD_REQUEST', msg);
      }
      console.error('[API Error]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
    }
  });
}

// Boot server when executed directly
const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  const rootDir = path.resolve(path.dirname(thisFile), '..');
  const dataDir = path.join(rootDir, 'data');
  const dbPath = process.env.LEDGER_DB_PATH || path.join(dataDir, 'personal-ledger.sqlite');
  const waAuthDir = path.join(dataDir, 'whatsapp-auth');
  const distDir = path.join(rootDir, 'dist');

  const db = openDatabase(dbPath);
  const bridge = new BaileysWhatsAppBridge(waAuthDir);

  if (bridge.hasSavedSession()) {
    void bridge.connect();
  }

  const port = Number(process.env.PORT || 4173);
  const server = createAppServer({ db, transport: bridge, staticDir: distDir });

  // Evaluate alerts immediately on boot/wakeup, then every 60s
  void runAlertCycle(db, bridge);
  const schedulerTimer = setInterval(() => {
    void runAlertCycle(db, bridge);
  }, 60_000);

  // Initialize Local Inbox Statement Auto-Sync Watcher
  const inboxDir = path.join(dataDir, 'inbox');
  const inboxWatcher = startInboxWatcher({
    db,
    inboxDir,
    processedDir: path.join(inboxDir, 'processed'),
    failedDir: path.join(inboxDir, 'failed'),
    onAlert: async (msg) => {
      const settings = getAlertSettings(db);
      if (settings.recipientPhone && bridge.getState().status === 'connected') {
        await bridge.sendText(settings.recipientPhone, msg);
      }
    },
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Personal Ledger running at http://127.0.0.1:${port}`);
  });

  const shutdown = async () => {
    inboxWatcher.stop();
    clearInterval(schedulerTimer);
    await bridge.disconnect();
    db.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
