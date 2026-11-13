import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDatabase } from './db/schema.ts';
import { SimpleRateLimiter, applySecurityHeaders } from './middleware/security.ts';
import { handleSystemRoute } from './routes/system-routes.ts';
import { createAppServer, resolveSafeChildPath } from './index.ts';
import type { WhatsAppTransport, WhatsAppBridgeState } from './whatsapp/bridge.ts';

class DummyWhatsAppTransport implements WhatsAppTransport {
  getState(): WhatsAppBridgeState {
    return { status: 'disconnected', qrDataUrl: null, connectedPhone: null, lastError: null, updatedAt: '' };
  }
  async connect() {}
  async disconnect() {}
  async logout() {}
  async sendText() { return { ok: true }; }
}

describe('Backend Architecture & Security Routes', () => {
  it('enforces rate limiting on sensitive brute-force operations', () => {
    const limiter = new SimpleRateLimiter({ windowMs: 1000, maxRequests: 3 });
    const ip = '127.0.0.1';
    assert.equal(limiter.check(ip).allowed, true);
    assert.equal(limiter.check(ip).allowed, true);
    assert.equal(limiter.check(ip).allowed, true);
    // 4th request must be rejected
    const blocked = limiter.check(ip);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  it('handles /healthz and /api/system/diagnostics cleanly', async () => {
    const db = openDatabase(':memory:');
    let statusCode = 0;
    let responseBody = '';

    const mockRes = {
      writeHead: (code: number, _h: Record<string, string>) => {
        statusCode = code;
        return mockRes;
      },
      end: (data: string) => {
        responseBody = data;
        return mockRes;
      },
    } as unknown as http.ServerResponse;

    // Test /healthz
    const handledHealth = await handleSystemRoute(
      { method: 'GET', url: '/healthz' } as http.IncomingMessage,
      mockRes,
      db,
    );
    assert.equal(handledHealth, true);
    assert.equal(statusCode, 200);
    const parsedHealth = JSON.parse(responseBody);
    assert.equal(parsedHealth.ok, true);
    assert.equal(parsedHealth.status, 'healthy');
    assert.equal(parsedHealth.database, 'ok');

    // Test /api/system/diagnostics
    const handledDiag = await handleSystemRoute(
      { method: 'GET', url: '/api/system/diagnostics' } as http.IncomingMessage,
      mockRes,
      db,
    );
    assert.equal(handledDiag, true);
    assert.equal(statusCode, 200);
    const parsedDiag = JSON.parse(responseBody);
    assert.equal(parsedDiag.ok, true);
    assert.equal(parsedDiag.data.integrity, 'ok');
    assert.ok(parsedDiag.data.tablesCount > 0);
  });

  it('injects standard security headers', () => {
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader: (name: string, val: string) => {
        headers[name.toLowerCase()] = val;
      },
    } as unknown as http.ServerResponse;

    applySecurityHeaders(mockRes);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  it('verifies path traversal sanitizer strictly restricts files inside allowedBaseDir', () => {
    const baseDir = 'C:\\ledger\\data\\backups';

    // Disallowed traversals
    assert.equal(resolveSafeChildPath(baseDir, '../../etc/passwd'), null);
    assert.equal(resolveSafeChildPath(baseDir, '..\\..\\windows\\system32'), null);
    assert.equal(resolveSafeChildPath(baseDir, '..%2f..%2fpackage.json'), null);
    assert.equal(resolveSafeChildPath(baseDir, 'C:\\windows\\system32\\cmd.exe'), null);
    assert.equal(resolveSafeChildPath(baseDir, '\\\\server\\share\\malware.exe'), null);
    assert.equal(resolveSafeChildPath(baseDir, 'backup.json\0../../passwd'), null);

    // Allowed relative safe paths
    const safeResolved = resolveSafeChildPath(baseDir, 'personal-ledger-backup-2026-11-13.json');
    assert.ok(safeResolved !== null);
    assert.ok(safeResolved.startsWith(baseDir));
  });

  it('blocks directory traversal attempts across HTTP endpoints with 403 Forbidden', async () => {
    const db = openDatabase(':memory:');
    const transport = new DummyWhatsAppTransport();
    const server = createAppServer({ db, transport });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. /api/tax/export-pack traversal
      const taxExportRes = await fetch(`${baseUrl}/api/tax/export-pack?file=../../package.json`);
      assert.equal(taxExportRes.status, 403);
      const taxExportJson = (await taxExportRes.json()) as { error: { code: string; message: string } };
      assert.equal(taxExportJson.error.code, 'FORBIDDEN');

      // 2. /api/tax/pdf-download traversal
      const pdfRes = await fetch(`${baseUrl}/api/tax/pdf-download?file=../../package.json`);
      assert.equal(pdfRes.status, 403);
      const pdfJson = (await pdfRes.json()) as { error: { code: string; message: string } };
      assert.equal(pdfJson.error.code, 'FORBIDDEN');

      // 3. /api/backups/:filename traversal
      const backupRes = await fetch(`${baseUrl}/api/backups/..%2f..%2fpackage.json`);
      assert.equal(backupRes.status, 403);
      const backupJson = (await backupRes.json()) as { error: { code: string; message: string } };
      assert.equal(backupJson.error.code, 'FORBIDDEN');

      // 4. /api/attachments traversal
      const attachRes = await fetch(`${baseUrl}/api/attachments/..%2f..%2fpackage.json`);
      assert.equal(attachRes.status, 403);
      const attachJson = (await attachRes.json()) as { error: { code: string; message: string } };
      assert.equal(attachJson.error.code, 'FORBIDDEN');

      // 5. Valid export and backup listing work cleanly
      const validBackupsRes = await fetch(`${baseUrl}/api/backups`);
      assert.equal(validBackupsRes.status, 200);

      const validTaxRes = await fetch(`${baseUrl}/api/tax/export-pack`);
      assert.equal(validTaxRes.status, 200);
      assert.ok(validTaxRes.headers.get('content-type')?.includes('text/csv'));

      const validPdfRes = await fetch(`${baseUrl}/api/tax/pdf-download`);
      assert.equal(validPdfRes.status, 200);
      assert.ok(validPdfRes.headers.get('content-type')?.includes('application/pdf'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
