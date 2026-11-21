import http from 'node:http';
import crypto from 'node:crypto';
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
  createJobSheet,
  deleteJobSheet,
  listJobSheets,
  updateJobSheet,
} from './db/job-sheets-repo.ts';
import {
  deleteVaultEntry,
  getVaultMeta,
  listVaultEntries,
  recordVaultSecurityEvent,
  rekeyVaultEntries,
  saveVaultRecoveryMeta,
  setVaultMeta,
  toPublicVaultMeta,
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
import { RenderKeepAliveService } from './whatsapp/keepalive.ts';
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
  validatePairingToken,
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
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
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
  // Guard against symlinks escaping allowedBaseDir
  if (fs.existsSync(resolvedPath) && fs.existsSync(resolvedBase)) {
    try {
      const realBase = fs.realpathSync(resolvedBase);
      const realTarget = fs.realpathSync(resolvedPath);
      const realPrefix = realBase.endsWith(path.sep) ? realBase : realBase + path.sep;
      if (realTarget !== realBase && !realTarget.startsWith(realPrefix)) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return resolvedPath;
}

const DEFAULT_BACKUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'backups');

function resolveSafeBackupDir(configuredDir?: string | null): string {
  const trimmed = (configuredDir ?? '').trim();
  if (!trimmed) return DEFAULT_BACKUP_DIR;
  // Only permit relative subdirectory names strictly inside data/backups
  const safeSub = resolveSafeChildPath(DEFAULT_BACKUP_DIR, trimmed);
  return safeSub ?? DEFAULT_BACKUP_DIR;
}

function buildMinimalPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textOps = lines
    .map((line, i) => `BT /F1 12 Tf 50 ${760 - i * 18} Td (${esc(line)}) Tj ET`)
    .join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(textOps, 'utf-8')} >>\nstream\n${textOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf-8');
}

const sheetColumnSchema = z.object({
  id: z.string().min(1).max(80),
  key: z.string().min(1).max(16),
  label: z.string().max(120),
  type: z.enum(['text', 'number', 'currency', 'date', 'status', 'scope']),
  width: z.number().int().min(40).max(800).optional(),
});

const sheetRowSchema = z.object({
  id: z.string().min(1).max(80),
  cells: z.record(z.string().max(80), z.string().max(4000)),
});

const sheetSettingsSchema = z
  .object({
    showTotals: z.boolean().optional(),
    customStatuses: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          color: z.enum(['gold', 'emerald', 'obsidian', 'rose', 'slate']),
        }),
      )
      .max(40)
      .optional(),
  })
  .optional();

const createJobSheetSchema = z.object({
  name: z.string().trim().min(1).max(120).default('New Job Sheet'),
  scope: z.enum(SCOPES).default('business'),
  color: z.enum(['gold', 'emerald', 'obsidian', 'rose', 'slate']).default('gold'),
  columns: z.array(sheetColumnSchema).max(60).default([]),
  rows: z.array(sheetRowSchema).max(5000).default([]),
  settings: sheetSettingsSchema,
  orderIndex: z.number().int().min(0).max(1000).optional(),
});

const updateJobSheetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: z.enum(SCOPES).optional(),
  color: z.enum(['gold', 'emerald', 'obsidian', 'rose', 'slate']).optional(),
  columns: z.array(sheetColumnSchema).max(60).optional(),
  rows: z.array(sheetRowSchema).max(5000).optional(),
  settings: sheetSettingsSchema,
  orderIndex: z.number().int().min(0).max(1000).optional(),
});

const pendingAgentCallSchema = z.object({
  tool: z.string().trim().min(1).max(60),
  args: z.record(z.string(), z.unknown()).default({}),
});

function isAllowedHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const hostOnly = hostHeader.replace(/:\d+$/, '').toLowerCase();
  if (hostOnly === 'localhost' || hostOnly === '127.0.0.1' || hostOnly === '[::1]' || hostOnly === '0.0.0.0') return true;
  // Allow Render hosting (*.onrender.com)
  if (hostOnly.endsWith('.onrender.com')) return true;
  // Allow hosts from RENDER_EXTERNAL_URL or ALLOWED_HOSTS env
  if (process.env.RENDER_EXTERNAL_URL) {
    try {
      const u = new URL(process.env.RENDER_EXTERNAL_URL);
      if (u.hostname.toLowerCase() === hostOnly) return true;
    } catch {}
  }
  const envHosts = (process.env.ALLOWED_HOSTS || '').toLowerCase().split(',').map((h) => h.trim());
  if (envHosts.includes(hostOnly)) return true;
  // Allow private LAN IPv4 addresses when explicitly listening on LAN
  if (/^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(hostOnly)) {
    return true;
  }
  return false;
}

function isSameOriginAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    const parsedOrigin = new URL(origin);
    const origHost = parsedOrigin.hostname.toLowerCase();
    // Allow production Vercel frontend or custom Vercel deployments
    if (origHost === 'scbook.vercel.app' || origHost.endsWith('.vercel.app')) return true;
    // Allow Capacitor mobile origins
    if (parsedOrigin.protocol === 'capacitor:' || parsedOrigin.protocol === 'file:') return true;
    // Allow configured origins from env
    const envOrigins = (process.env.ALLOWED_ORIGINS || '').toLowerCase().split(',').map((o) => o.trim());
    if (envOrigins.includes(origin.toLowerCase())) return true;
    // Allow matching host or loopback dev proxy (localhost <-> 127.0.0.1)
    if (parsedOrigin.host === host) return true;
    const reqHost = host.replace(/:\d+$/, '').toLowerCase();
    const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    if (isLoopback(origHost) && isLoopback(reqHost)) return true;
    return false;
  } catch {
    return false;
  }
}

export function createAppServer(opts: {
  db: DatabaseSync;
  transport: WhatsAppTransport;
  staticDir?: string;
  keepAlive?: RenderKeepAliveService;
}): http.Server {
  const { db, transport, staticDir, keepAlive } = opts;

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
  const heavyLimiter = new SimpleRateLimiter({ windowMs: 60_000, maxRequests: 20 });
  const activeSessions = new Map<string, number>();

  const issueSessionCookie = (res: http.ServerResponse, ttlMs = 12 * 60 * 60 * 1000) => {
    const now = Date.now();
    for (const [k, exp] of activeSessions.entries()) {
      if (now > exp) activeSessions.delete(k);
    }
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.set(token, now + ttlMs);
    res.setHeader('Set-Cookie', `pl_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
  };

  const clearSessionCookie = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)pl_session=([a-f0-9]+)/);
    if (match) activeSessions.delete(match[1]);
    res.setHeader('Set-Cookie', 'pl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  };

  const hasValidSession = (req: http.IncomingMessage): boolean => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)pl_session=([a-f0-9]+)/);
    if (!match) return false;
    const exp = activeSessions.get(match[1]);
    if (!exp || Date.now() > exp) {
      if (exp) activeSessions.delete(match[1]);
      return false;
    }
    return true;
  };

  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;
    const clientIp = req.socket.remoteAddress || '127.0.0.1';

    // Handle CORS headers for allowed origins (e.g. Vercel frontend, local dev, Capacitor, Android WebView)
    const reqOrigin = req.headers.origin;
    if (reqOrigin) {
      if (reqOrigin === 'null') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      } else {
        try {
          const parsed = new URL(reqOrigin);
          const hostName = parsed.hostname.toLowerCase();
          const isAllowedOrigin =
            hostName === 'scbook.vercel.app' ||
            hostName.endsWith('.vercel.app') ||
            parsed.protocol === 'capacitor:' ||
            parsed.protocol === 'file:' ||
            hostName === 'localhost' ||
            hostName === '127.0.0.1';
          if (isAllowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', reqOrigin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
          }
        } catch {}
      }
    }

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      // 1. DNS Rebinding & Host Header guard
      if (!isAllowedHostHeader(req.headers.host)) {
        return sendError(res, 403, 'FORBIDDEN_HOST', 'Disallowed Host header');
      }

      // 2. Same-Origin CSRF guard on state-changing API routes
      const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      if (pathname.startsWith('/api/') && isMutating) {
        if (!isSameOriginAllowed(req)) {
          return sendError(res, 403, 'FORBIDDEN_ORIGIN', 'Cross-origin state-changing request blocked');
        }
        const ct = (req.headers['content-type'] || '').toLowerCase();
        // Reject text/plain / form-urlencoded simple CSRF requests when a body is sent
        if (ct && !ct.includes('application/json') && !ct.includes('multipart/form-data')) {
          return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON Content-Type required');
        }
      }

      // 3. Server-side App PIN session enforcement when PIN lock is enabled
      if (pathname.startsWith('/api/')) {
        const isPublicLockRoute =
          pathname === '/api/app-lock/verify' ||
          pathname === '/api/app-lock/clear' ||
          pathname === '/api/app-lock/lock' ||
          pathname === '/api/app-lock/status' ||
          (method === 'GET' && pathname === '/api/preferences') ||
          pathname === '/api/sync/export' ||
          pathname === '/api/sync/import';

        if (!isPublicLockRoute) {
          const prefs = getAppPreferences(db);
          if (prefs.hasAppPin && !hasValidSession(req)) {
            return sendError(res, 401, 'APP_LOCKED', 'App is locked. Verify PIN to unlock session.');
          }
        }
      }

      if (await handleSystemRoute(req, res, db)) {
        return;
      }

      if (method === 'GET' && pathname === '/api/app-lock/status') {
        const prefs = getAppPreferences(db);
        return sendJson(res, 200, {
          data: {
            hasAppPin: prefs.hasAppPin,
            unlocked: !prefs.hasAppPin || hasValidSession(req),
            autoLockMinutes: prefs.autoLockMinutes,
          },
        });
      }
      if (method === 'POST' && pathname === '/api/app-lock/lock') {
        clearSessionCookie(req, res);
        return sendJson(res, 200, { ok: true });
      }

      // Multi-Device Local LAN Sync (Pairing Token Authenticated + Allowlisted Tables/Columns)
      if (method === 'GET' && pathname === '/api/sync/pairing-qr') {
        return sendJson(res, 200, {
          data: {
            ips: getLocalNetworkIps(),
            ...generatePairingToken(),
          },
        });
      }
      if (method === 'GET' && pathname === '/api/sync/export') {
        const token = String(req.headers['x-sync-token'] || reqUrl.searchParams.get('token') || '');
        if (!validatePairingToken(token)) {
          return sendError(res, 401, 'UNAUTHORIZED', 'Valid LAN pairing token required');
        }
        const since = reqUrl.searchParams.get('since') || undefined;
        return sendJson(res, 200, exportDifferentialSync(db, since));
      }
      if (method === 'POST' && pathname === '/api/sync/import') {
        const token = String(req.headers['x-sync-token'] || reqUrl.searchParams.get('token') || '');
        if (!validatePairingToken(token)) {
          return sendError(res, 401, 'UNAUTHORIZED', 'Valid LAN pairing token required');
        }
        const body = (await readJsonBody(req, 10_000_000)) as any;
        return sendJson(res, 200, ingestDifferentialSync(db, body));
      }
      if (method === 'POST' && pathname === '/api/system/seed') {
        const summary = seedFinancialData(db);
        return sendJson(res, 200, { ok: true, data: summary });
      }
      if (method === 'POST' && pathname === '/api/system/clean') {
        withTransaction(db, () => {
          db.exec(`
            DELETE FROM transaction_attachments;
            DELETE FROM note_attachments;
            DELETE FROM note_checklist_items;
            DELETE FROM savings_goals;
            DELETE FROM investments;
            DELETE FROM category_budgets;
            DELETE FROM scope_budgets;
            DELETE FROM due_settlements;
            DELETE FROM people_dues;
            DELETE FROM loan_payments;
            DELETE FROM loans;
            DELETE FROM recurring_bills;
            DELETE FROM alert_deliveries;
            DELETE FROM agent_history;
            DELETE FROM transactions;
            DELETE FROM notes;
            DELETE FROM category_rules;
            DELETE FROM accounts;
          `);
        });
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        return sendJson(res, 200, { ok: true, message: 'Clean slate achieved.' });
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
        const pdfBuf = buildMinimalPdf([
          `Personal Ledger — CA Tax Summary (${taxData.fiscalYearLabel})`,
          `Period: ${taxData.fromDate} to ${taxData.toDate}`,
          `Total Income: INR ${(totalIncome / 100).toFixed(2)}`,
          `Total Expenses: INR ${(totalExpense / 100).toFixed(2)}`,
          `Net Savings: INR ${((totalIncome - totalExpense) / 100).toFixed(2)}`,
        ]);
        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="tax-summary-${fy ?? todayISO().slice(0, 4)}.pdf"`,
        });
        return res.end(pdfBuf);
      }

      const backupsMatch = pathname.match(/^\/api\/backups(?:\/(.*))?$/);
      if (backupsMatch && method === 'GET') {
        const prefs = getAppPreferences(db);
        const allowedBaseDir = resolveSafeBackupDir(prefs.autoBackupDir);
        fs.mkdirSync(allowedBaseDir, { recursive: true });

        const filename = backupsMatch[1] || reqUrl.searchParams.get('file') || reqUrl.searchParams.get('filename');
        if (!filename) {
          const files = fs.readdirSync(allowedBaseDir).filter((f) => /^[a-zA-Z0-9._-]+\.json$/.test(f));
          return sendJson(res, 200, { data: files });
        }

        const resolvedPath = resolveSafeChildPath(allowedBaseDir, filename);
        if (!resolvedPath || !resolvedPath.startsWith(allowedBaseDir)) {
          return sendError(res, 403, 'FORBIDDEN', 'Directory traversal detected');
        }
        if (!/^[a-zA-Z0-9._-]+\.json$/.test(path.basename(resolvedPath))) {
          return sendError(res, 403, 'FORBIDDEN', 'Only JSON backup files may be downloaded');
        }

        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
          return sendError(res, 404, 'NOT_FOUND', 'Backup file not found');
        }

        setSecurityHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
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
        const allowedBaseDir = resolveSafeBackupDir(prefs.autoBackupDir);
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
        const parsed = z
          .object({ paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid paidAt date');
        return sendJson(res, 200, { data: confirmRecurringBill(db, recConfirmMatch[1], parsed.data.paidAt || todayISO()) });
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

      // Multi-Tab Job Sheets Workbook
      if (method === 'GET' && pathname === '/api/job-sheets') {
        return sendJson(res, 200, { data: listJobSheets(db) });
      }
      if (method === 'POST' && pathname === '/api/job-sheets') {
        const parsed = createJobSheetSchema.safeParse(await readJsonBody(req, 5_000_000));
        if (!parsed.success) {
          return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid job sheet payload', parsed.error.flatten());
        }
        const created = createJobSheet(db, {
          name: parsed.data.name,
          scope: parsed.data.scope,
          color: parsed.data.color,
          columns: parsed.data.columns,
          rows: parsed.data.rows,
          settings: parsed.data.settings as any,
          orderIndex: parsed.data.orderIndex,
        });
        return sendJson(res, 201, { data: created });
      }
      const sheetIdMatch = pathname.match(/^\/api\/job-sheets\/([^/]+)$/);
      if (sheetIdMatch) {
        const sheetId = sheetIdMatch[1];
        if (method === 'PUT' || method === 'PATCH') {
          const parsed = updateJobSheetSchema.safeParse(await readJsonBody(req, 5_000_000));
          if (!parsed.success) {
            return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid job sheet update', parsed.error.flatten());
          }
          const updated = updateJobSheet(db, sheetId, parsed.data as any);
          if (!updated) return sendError(res, 404, 'NOT_FOUND', 'Job sheet not found');
          return sendJson(res, 200, { data: updated });
        }
        if (method === 'DELETE') {
          if (!deleteJobSheet(db, sheetId)) return sendError(res, 404, 'NOT_FOUND', 'Job sheet not found');
          return sendJson(res, 200, { ok: true });
        }
      }

      // Vault (Ciphertext + Public Security Metadata ONLY — never exposes waRecoveryKey)
      if (method === 'GET' && pathname === '/api/vault/meta') {
        return sendJson(res, 200, { data: toPublicVaultMeta(getVaultMeta(db)) });
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
        return sendJson(res, 200, { data: toPublicVaultMeta(meta) });
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
        return sendJson(res, 200, { data: toPublicVaultMeta(meta) });
      }
      if (method === 'POST' && pathname === '/api/vault/recovery/whatsapp-request') {
        const rateCheck = pinLimiter.check(`wa-otp-req:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many OTP requests. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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
        const code = String(crypto.randomInt(100000, 1000000));
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
        const rateCheck = pinLimiter.check(`wa-otp-verify:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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
        const givenBuf = Buffer.from(parsed.data.code, 'utf-8');
        const expectedBuf = Buffer.from(active.code, 'utf-8');
        const codeMatches = givenBuf.length === expectedBuf.length && crypto.timingSafeEqual(givenBuf, expectedBuf);
        if (!codeMatches) {
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
        return sendJson(res, 200, { data: toPublicVaultMeta(meta) });
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
        const parsed = z.object({ phone: z.string().trim().max(30).optional() }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid phone format');
        const result = await transport.sendText(
          parsed.data.phone || settings.recipientPhone,
          '✅ Personal Ledger WhatsApp Bridge is connected and ready for module alerts.',
        );
        if (!result.ok) return sendError(res, 400, 'WHATSAPP_SEND_FAILED', result.error ?? 'Failed to send test alert');
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'GET' && pathname === '/api/whatsapp/keepalive') {
        const pingerState = keepAlive?.getState() ?? {
          enabled: false,
          targetUrl: '',
          intervalMinutes: 5,
          lastPingAt: null,
          lastPingStatus: null,
          lastError: 'KeepAlive service not initialized',
          totalPings: 0,
          isRunning: false,
        };
        return sendJson(res, 200, { data: pingerState });
      }
      if (method === 'POST' && pathname === '/api/whatsapp/keepalive') {
        const body = await readJsonBody(req);
        const parsed = z
          .object({
            enabled: z.boolean().optional(),
            targetUrl: z.string().trim().max(300).optional(),
            intervalMinutes: z.number().int().min(1).max(60).optional(),
            pingNow: z.boolean().optional(),
          })
          .safeParse(body);
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid keepalive params');
        if (keepAlive) {
          if (parsed.data.targetUrl !== undefined || parsed.data.intervalMinutes !== undefined || parsed.data.enabled !== undefined) {
            keepAlive.updateConfig(parsed.data);
          }
          if (parsed.data.pingNow) {
            const pingRes = await keepAlive.executePing();
            return sendJson(res, 200, { data: keepAlive.getState(), pingResult: pingRes });
          }
          return sendJson(res, 200, { data: keepAlive.getState() });
        }
        return sendJson(res, 200, { data: { enabled: false, isRunning: false } });
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
            autoBackupDir: z.string().max(120).optional(),
          })
          .safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid preferences', parsed.error.flatten());
        const nextPrefs = { ...parsed.data };
        if (nextPrefs.autoBackupDir !== undefined && nextPrefs.autoBackupDir.trim() !== '') {
          // Only allow clean relative subfolder names strictly inside data/backups
          const safe = resolveSafeChildPath(DEFAULT_BACKUP_DIR, nextPrefs.autoBackupDir.trim());
          if (!safe) {
            return sendError(res, 422, 'VALIDATION_ERROR', 'autoBackupDir must be a relative subfolder inside backups');
          }
          nextPrefs.autoBackupDir = path.relative(DEFAULT_BACKUP_DIR, safe);
        }
        return sendJson(res, 200, { data: updateAppPreferences(db, nextPrefs) });
      }

      // App Lock PIN (rate-limited + server-side HttpOnly session cookie)
      if (method === 'POST' && pathname === '/api/app-lock/set') {
        const rateCheck = pinLimiter.check(`pin-set:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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
        issueSessionCookie(res);
        const updated =
          parsed.data.autoLockMinutes !== undefined
            ? updateAppPreferences(db, { autoLockMinutes: parsed.data.autoLockMinutes })
            : getAppPreferences(db);
        return sendJson(res, 200, { data: updated });
      }
      if (method === 'POST' && pathname === '/api/app-lock/verify') {
        const rateCheck = pinLimiter.check(`pin-verify:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
        const parsed = z.object({ pin: z.string().min(1).max(20) }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'PIN is required');
        const ok = verifyAppPin(db, parsed.data.pin);
        if (!ok) return sendError(res, 403, 'INVALID_PIN', 'Incorrect PIN');
        issueSessionCookie(res);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/app-lock/clear') {
        const rateCheck = pinLimiter.check(`pin-clear:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
        const parsed = z.object({ currentPin: z.string().min(1).max(20) }).safeParse(await readJsonBody(req));
        if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Current PIN required');
        if (!verifyAppPin(db, parsed.data.currentPin)) {
          return sendError(res, 403, 'INVALID_PIN', 'Current PIN is incorrect');
        }
        clearSessionCookie(req, res);
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
        const rateCheck = heavyLimiter.check(`pdf:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many PDF requests. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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
        const rateCheck = heavyLimiter.check(`ocr:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many OCR requests. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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
        const rateCheck = heavyLimiter.check(`agent:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many AI requests. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
        const parsed = z
          .object({
            commandText: z.string().trim().min(1).max(2000),
            confirmExecution: z.boolean().optional(),
            pendingCalls: z.array(pendingAgentCallSchema).max(5).optional(),
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
        const rateCheck = heavyLimiter.check(`voice:${clientIp}`);
        if (!rateCheck.allowed) {
          return sendError(res, 429, 'RATE_LIMITED', `Too many voice requests. Try again in ${rateCheck.retryAfterSec} seconds.`);
        }
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

  const argv = process.argv.slice(2);
  const portArgIdx = argv.indexOf('--port');
  const hostArgIdx = argv.indexOf('--host');
  const port = Number((portArgIdx !== -1 && argv[portArgIdx + 1]) || process.env.PORT || 3000);
  const isCloudOrContainer = Boolean(process.env.RENDER || process.env.PORT || process.env.NODE_ENV === 'production');
  const defaultHost = isCloudOrContainer ? '0.0.0.0' : '127.0.0.1';
  const host = (hostArgIdx !== -1 && argv[hostArgIdx + 1]) || process.env.HOST || defaultHost;
  const keepAlive = new RenderKeepAliveService(undefined, Number(process.env.WAKEUP_INTERVAL_MINUTES || 5));
  const server = createAppServer({ db, transport: bridge, staticDir: distDir, keepAlive });

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

  server.listen(port, host, () => {
    console.log(`Personal Ledger running at http://${host}:${port}`);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceTimer = setTimeout(() => process.exit(1), 10_000);
    forceTimer.unref?.();

    inboxWatcher.stop();
    clearInterval(schedulerTimer);
    keepAlive.stop();

    // Stop accepting new HTTP requests and drain in-flight connections BEFORE closing DB
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections?.();
    });
    await bridge.disconnect();
    db.close();
    clearTimeout(forceTimer);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
  });
}
