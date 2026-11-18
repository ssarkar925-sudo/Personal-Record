import http from 'node:http';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface ClientRecord {
  timestamps: number[];
}

export class SimpleRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private clients = new Map<string, ClientRecord>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  check(ip: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Periodically evict stale IP records to bound memory usage
    if (this.clients.size > 100) {
      for (const [k, rec] of this.clients.entries()) {
        const active = rec.timestamps.filter((ts) => ts > windowStart);
        if (active.length === 0) this.clients.delete(k);
        else rec.timestamps = active;
      }
    }

    let record = this.clients.get(ip);
    if (!record) {
      record = { timestamps: [] };
      this.clients.set(ip, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterMs = oldest + this.windowMs - now;
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return {
        allowed: false,
        retryAfterSec,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      retryAfterSec: 0,
    };
  }

  reset(ip?: string): void {
    if (ip) {
      this.clients.delete(ip);
    } else {
      this.clients.clear();
    }
  }
}

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:* http://localhost:* http://192.168.*:* http://10.*:*",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export function applySecurityHeaders(res: http.ServerResponse): void {
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', CSP_POLICY);
  }
}

export function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  applySecurityHeaders(res);
  const payload = JSON.stringify(data);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload).toString(),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  if (typeof res.writeHead === 'function') {
    res.writeHead(statusCode, headers);
  }
  if (typeof res.end === 'function') {
    res.end(payload);
  }
}

export function sendError(res: http.ServerResponse, statusCode: number, message: string, code?: string): void {
  sendJson(res, statusCode, {
    ok: false,
    error: message,
    code: code || 'ERROR',
  });
}
