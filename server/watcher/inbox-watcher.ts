import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { listAccounts } from '../db/accounts-repo.ts';
import { createTransaction, listCategoryRules, listTransactions } from '../db/ledger-repo.ts';
import { withTransaction } from '../db/schema.ts';
import { extractBankPdfText, parseStatementInput } from '../agent/intelligence.ts';
import { todayISO } from '../../shared/ledger-core.ts';

export interface ProcessInboxOptions {
  db: DatabaseSync;
  defaultAccountId?: string;
  processedDir: string;
  failedDir: string;
  onAlert?: (message: string) => Promise<void>;
}

export interface ProcessInboxResult {
  success: boolean;
  count: number;
  error?: string;
  filename: string;
}

const MAX_INBOX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function processInboxFile(
  filePath: string,
  options: ProcessInboxOptions
): Promise<ProcessInboxResult> {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  fs.mkdirSync(options.processedDir, { recursive: true });
  fs.mkdirSync(options.failedDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetBase = `${timestamp}_${filename}`;

  try {
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new Error('Rejected non-regular or symlinked file in inbox.');
    }
    if (lstat.size > MAX_INBOX_FILE_BYTES) {
      throw new Error(`Statement file exceeds maximum size limit (${Math.round(MAX_INBOX_FILE_BYTES / (1024 * 1024))} MB).`);
    }

    let rawText = '';

    if (ext === '.csv' || ext === '.txt') {
      rawText = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.pdf') {
      const buffer = fs.readFileSync(filePath);
      const b64 = buffer.toString('base64');
      const pdfRes = await extractBankPdfText(b64);
      rawText = pdfRes.text;
    } else {
      throw new Error(`Unsupported statement file format: ${ext}. Supported formats: .csv, .txt, .pdf`);
    }

    if (!rawText.trim()) {
      throw new Error('Statement file contained no readable text.');
    }

    const accounts = listAccounts(options.db);
    const existing = listTransactions(options.db, {});
    const rules = listCategoryRules(options.db);

    const candidates = parseStatementInput({
      rawText,
      accounts,
      existingTransactions: existing,
      categoryRules: rules,
      defaultAccountId: options.defaultAccountId || (accounts[0]?.id ?? 'default-account'),
      fallbackDate: todayISO(),
    });

    if (candidates.length === 0) {
      throw new Error('No transactions could be detected in this file.');
    }

    // Ingest candidates that are not duplicate
    let ingestedCount = 0;
    withTransaction(options.db, () => {
      for (const cand of candidates) {
        if (cand.isDuplicate) continue;
        createTransaction(options.db, {
          kind: cand.kind,
          scope: cand.scope,
          accountId: cand.accountId,
          category: cand.category,
          amountMinor: cand.amountMinor,
          occurredAt: cand.occurredAt,
          party: cand.party,
          note: cand.note || `Auto-imported from inbox: ${filename}`,
        });
        ingestedCount++;
      }
    });

    // Move file to processedDir
    const destPath = path.join(options.processedDir, targetBase);
    fs.renameSync(filePath, destPath);

    if (options.onAlert) {
      void options.onAlert(`📥 Inbox Watcher: Processed ${filename} (${ingestedCount} transactions imported).`);
    }

    return {
      success: true,
      count: ingestedCount,
      filename,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Safely move file to failedDir
    try {
      if (fs.existsSync(filePath)) {
        const failedPath = path.join(options.failedDir, targetBase);
        fs.renameSync(filePath, failedPath);
        fs.writeFileSync(`${failedPath}.error.txt`, errorMsg, 'utf-8');
      }
    } catch {}

    return {
      success: false,
      count: 0,
      error: errorMsg,
      filename,
    };
  }
}

export function startInboxWatcher(options: {
  db: DatabaseSync;
  inboxDir: string;
  processedDir: string;
  failedDir: string;
  defaultAccountId?: string;
  onAlert?: (msg: string) => Promise<void>;
  pollIntervalMs?: number;
}): { stop: () => void; checkNow: () => Promise<void> } {
  const { inboxDir, processedDir, failedDir, db, defaultAccountId, onAlert } = options;
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(processedDir, { recursive: true });
  fs.mkdirSync(failedDir, { recursive: true });

  let isChecking = false;

  const checkNow = async () => {
    if (isChecking) return;
    isChecking = true;
    try {
      const resolvedInboxDir = fs.realpathSync(inboxDir);
      const files = fs.readdirSync(inboxDir);
      for (const file of files) {
        const fullPath = path.join(inboxDir, file);
        if (!fs.existsSync(fullPath)) continue;
        const stat = fs.lstatSync(fullPath);
        if (stat.isSymbolicLink() || !stat.isFile()) continue;
        const realFullPath = fs.realpathSync(fullPath);
        if (!realFullPath.startsWith(resolvedInboxDir + path.sep)) continue;

        // Skip temp / partial write files
        if (file.startsWith('.') || file.endsWith('.tmp') || file.endsWith('.crdownload')) continue;

        await processInboxFile(fullPath, {
          db,
          processedDir,
          failedDir,
          defaultAccountId,
          onAlert,
        });
      }
    } catch (err) {
      console.error('[Inbox Watcher Error]', err);
    } finally {
      isChecking = false;
    }
  };

  const timer = setInterval(() => {
    void checkNow();
  }, options.pollIntervalMs || 5000);

  // Initial check
  void checkNow();

  return {
    stop: () => clearInterval(timer),
    checkNow,
  };
}
