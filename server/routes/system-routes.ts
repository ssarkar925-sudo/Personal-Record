import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { checkDatabaseHealth, checkpointAndOptimize } from '../db/maintenance.ts';
import { sendJson } from '../middleware/security.ts';

export async function handleSystemRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: DatabaseSync
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method?.toUpperCase() || 'GET';
  const pathname = url.split('?')[0];

  if (pathname === '/healthz' && method === 'GET') {
    const health = checkDatabaseHealth(db);
    sendJson(res, 200, {
      ok: health.ok,
      status: health.ok ? 'healthy' : 'degraded',
      database: health.integrity,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    });
    return true;
  }

  if (pathname === '/api/system/diagnostics' && method === 'GET') {
    const health = checkDatabaseHealth(db);
    sendJson(res, 200, {
      ok: true,
      data: {
        integrity: health.integrity,
        foreignKeys: health.foreignKeysOk ? 'ok' : 'violations_found',
        tablesCount: health.tablesCount,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
    });
    return true;
  }

  if (pathname === '/api/system/maintenance' && (method === 'POST' || method === 'GET')) {
    const optResult = checkpointAndOptimize(db);
    const health = checkDatabaseHealth(db);
    sendJson(res, 200, {
      ok: optResult.ok && health.ok,
      data: {
        walCheckpoint: 'truncated',
        optimized: optResult.ok,
        durationMs: optResult.durationMs,
        integrity: health.integrity,
        tablesCount: health.tablesCount,
      },
    });
    return true;
  }

  return false;
}
