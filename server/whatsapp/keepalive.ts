/**
 * KeepAlive & 5-Minute Wake-Up Service for Render.com
 *
 * Render free web services spin down after 15 minutes of inactivity.
 * This service executes a self-ping to /api/health every 5 minutes (300,000ms)
 * ensuring the service stays awake 24/7 for real-time WhatsApp Baileys connectivity.
 */

export interface KeepAliveState {
  enabled: boolean;
  targetUrl: string;
  intervalMinutes: number;
  lastPingAt: string | null;
  lastPingStatus: number | null;
  lastError: string | null;
  totalPings: number;
  isRunning: boolean;
}

export class RenderKeepAliveService {
  private timer: NodeJS.Timeout | null = null;
  private state: KeepAliveState = {
    enabled: true,
    targetUrl: '',
    intervalMinutes: 5,
    lastPingAt: null,
    lastPingStatus: null,
    lastError: null,
    totalPings: 0,
    isRunning: false,
  };

  constructor(initialUrl?: string, intervalMinutes = 5) {
    const defaultUrl =
      initialUrl ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.WAKEUP_URL ||
      (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'http://127.0.0.1:3000');

    this.state.targetUrl = defaultUrl;
    this.state.intervalMinutes = Math.max(1, Math.min(60, intervalMinutes));

    // Auto-start if running in Render environment or if explicitly enabled
    if (process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL || process.env.AUTO_WAKEUP === 'true') {
      this.start();
    }
  }

  public getState(): KeepAliveState {
    return { ...this.state };
  }

  public start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.state.enabled = true;
    this.state.isRunning = true;

    const ms = this.state.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      void this.executePing();
    }, ms);

    // Also run an initial warm-up ping after 15 seconds
    setTimeout(() => {
      if (this.state.isRunning) {
        void this.executePing();
      }
    }, 15_000);

    console.log(`[KeepAlive] 5-min Render wake-up timer started. Target: ${this.state.targetUrl} (every ${this.state.intervalMinutes}m)`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.enabled = false;
    this.state.isRunning = false;
    console.log('[KeepAlive] 5-min Render wake-up timer paused.');
  }

  public updateConfig(opts: { enabled?: boolean; targetUrl?: string; intervalMinutes?: number }): KeepAliveState {
    if (opts.targetUrl !== undefined) {
      this.state.targetUrl = opts.targetUrl.trim();
    }
    if (opts.intervalMinutes !== undefined) {
      this.state.intervalMinutes = Math.max(1, Math.min(60, opts.intervalMinutes));
    }
    if (opts.enabled !== undefined) {
      if (opts.enabled && !this.state.isRunning) {
        this.start();
      } else if (!opts.enabled && this.state.isRunning) {
        this.stop();
      }
    } else if (this.state.isRunning) {
      // Restart interval with new timing
      this.start();
    }
    return this.getState();
  }

  public async executePing(): Promise<{ ok: boolean; status?: number; error?: string }> {
    if (!this.state.targetUrl) {
      this.state.lastError = 'Target URL not configured';
      return { ok: false, error: this.state.lastError };
    }

    let pingUrl = this.state.targetUrl.trim();
    if (!pingUrl.startsWith('http://') && !pingUrl.startsWith('https://')) {
      pingUrl = `https://${pingUrl}`;
    }
    // Normalize to health endpoint if user gave root or base URL
    if (!pingUrl.includes('/api/health') && !pingUrl.includes('/healthz')) {
      pingUrl = `${pingUrl.replace(/\/$/, '')}/api/health`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12_000);

      const res = await fetch(pingUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'PersonalLedger-RenderWakeUp/1.0',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      this.state.lastPingAt = new Date().toISOString();
      this.state.lastPingStatus = res.status;
      this.state.totalPings += 1;
      this.state.lastError = null;

      console.log(`[KeepAlive] 5-min Render wake-up ping to ${pingUrl}: ${res.status} OK (total: ${this.state.totalPings})`);
      return { ok: res.ok, status: res.status };
    } catch (err: any) {
      this.state.lastPingAt = new Date().toISOString();
      this.state.lastPingStatus = null;
      this.state.lastError = err?.message || 'Ping failed';
      console.warn(`[KeepAlive] Wake-up ping failed for ${pingUrl}:`, err?.message);
      return { ok: false, error: err?.message };
    }
  }
}
