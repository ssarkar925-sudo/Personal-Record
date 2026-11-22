import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { backupBaileysAuthToCloud, restoreBaileysAuthFromCloud } from '../sync/supabase-bridge.ts';

export type BridgeStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected';

export interface WhatsAppBridgeState {
  status: BridgeStatus;
  qrDataUrl: string | null;
  connectedPhone: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface IncomingWhatsAppImage {
  imageBase64: string;
  mimeType: string;
  caption?: string;
}

export interface IncomingWhatsAppAudio {
  audioBase64: string;
  mimeType: string;
}

export interface WhatsAppTransport {
  getState(): WhatsAppBridgeState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;
  sendText(recipientPhone: string, text: string): Promise<{ ok: boolean; error?: string }>;
  onIncomingText?(handler: (fromPhone: string, text: string) => Promise<void>): void;
  onIncomingImage?(handler: (fromPhone: string, payload: IncomingWhatsAppImage) => Promise<void>): void;
  onIncomingAudio?(handler: (fromPhone: string, payload: IncomingWhatsAppAudio) => Promise<void>): void;
}

// Minimal silent logger compatible with Baileys (avoids pulling pino)
function createSilentLogger(): any {
  const logger: any = {
    level: 'silent',
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => logger,
  };
  return logger;
}

export function normalizeWhatsAppJid(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) throw new Error('Recipient phone number is empty');
  // Default 10-digit Indian mobile numbers to +91
  const e164Digits = digits.length === 10 ? `91${digits}` : digits;
  return `${e164Digits}@s.whatsapp.net`;
}

export class BaileysWhatsAppBridge implements WhatsAppTransport {
  private authDir: string;
  private sock: WASocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualStop = false;
  private incomingHandler: ((fromPhone: string, text: string) => Promise<void>) | null = null;
  private incomingImageHandler: ((fromPhone: string, payload: IncomingWhatsAppImage) => Promise<void>) | null = null;
  private incomingAudioHandler: ((fromPhone: string, payload: IncomingWhatsAppAudio) => Promise<void>) | null = null;
  private recentBotMsgIds = new Set<string>();
  private lastDisconnectCode: number | null = null;
  private state: WhatsAppBridgeState = {
    status: 'disconnected',
    qrDataUrl: null,
    connectedPhone: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };

  constructor(authDir: string) {
    this.authDir = authDir;
  }

  hasSavedSession(): boolean {
    return fs.existsSync(path.join(this.authDir, 'creds.json'));
  }

  onIncomingText(handler: (fromPhone: string, text: string) => Promise<void>): void {
    this.incomingHandler = handler;
  }

  onIncomingImage(handler: (fromPhone: string, payload: IncomingWhatsAppImage) => Promise<void>): void {
    this.incomingImageHandler = handler;
  }

  onIncomingAudio(handler: (fromPhone: string, payload: IncomingWhatsAppAudio) => Promise<void>): void {
    this.incomingAudioHandler = handler;
  }

  getState(): WhatsAppBridgeState {
    return { ...this.state };
  }

  private setState(patch: Partial<WhatsAppBridgeState>): void {
    this.state = {
      ...this.state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  }

  async connect(): Promise<void> {
    if (this.sock && (this.state.status === 'connecting' || this.state.status === 'connected' || this.state.status === 'qr_ready')) {
      return;
    }
    this.manualStop = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    fs.mkdirSync(this.authDir, { recursive: true });
    // Restore session credentials from cloud backup if running on ephemeral container disk
    await restoreBaileysAuthFromCloud(this.authDir).catch(() => {});
    this.setState({ status: 'connecting', lastError: null });

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      let version: [number, number, number] | undefined;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch {
        // Fall back to Baileys bundled WA Web version if offline
      }

      const sock = makeWASocket({
        auth: state,
        version,
        logger: createSilentLogger(),
        printQRInTerminal: false,
        browser: ['Personal Ledger', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 15_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs: 500,
      });

      this.sock = sock;
      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
          void backupBaileysAuthToCloud(this.authDir);
        } catch {}
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || (!this.incomingHandler && !this.incomingImageHandler && !this.incomingAudioHandler)) return;
        for (const msg of messages) {
          const jid = msg.key.remoteJid ?? '';
          if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
          if (msg.key.id && this.recentBotMsgIds.has(msg.key.id)) continue;
          const senderPhone = jid.split('@')[0]?.split(':')[0] ?? '';
          if (!senderPhone) continue;

          const innerMsg =
            msg.message?.ephemeralMessage?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message;

          if (innerMsg?.imageMessage && this.incomingImageHandler) {
            try {
              // Pre-check fileLength before streaming media into RAM
              const reportedLen = Number(innerMsg.imageMessage.fileLength || 0);
              if (reportedLen > 4_500_000) {
                console.warn('[WhatsApp] Rejected image exceeding 4.5MB limit:', reportedLen);
                continue;
              }
              const rawMedia = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger: createSilentLogger(), reuploadRequest: sock.updateMediaMessage },
              );
              const buf = Buffer.isBuffer(rawMedia) ? rawMedia : Buffer.from(rawMedia as Uint8Array);
              if (buf.length > 0 && buf.length <= 4_500_000) {
                await this.incomingImageHandler(senderPhone, {
                  imageBase64: buf.toString('base64'),
                  mimeType: innerMsg.imageMessage.mimetype || 'image/jpeg',
                  caption: (innerMsg.imageMessage.caption || '').trim() || undefined,
                });
              }
            } catch {
              // Never crash WA listener loop
            }
            continue;
          }

          if (innerMsg?.audioMessage && this.incomingAudioHandler) {
            try {
              // Pre-check fileLength before streaming media into RAM
              const reportedLen = Number(innerMsg.audioMessage.fileLength || 0);
              if (reportedLen > 10_000_000) {
                console.warn('[WhatsApp] Rejected audio exceeding 10MB limit:', reportedLen);
                continue;
              }
              const rawMedia = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger: createSilentLogger(), reuploadRequest: sock.updateMediaMessage },
              );
              const buf = Buffer.isBuffer(rawMedia) ? rawMedia : Buffer.from(rawMedia as Uint8Array);
              if (buf.length > 0 && buf.length <= 10_000_000) {
                await this.incomingAudioHandler(senderPhone, {
                  audioBase64: buf.toString('base64'),
                  mimeType: innerMsg.audioMessage.mimetype || 'audio/ogg; codecs=opus',
                });
              }
            } catch {
              // Never crash WA listener loop
            }
            continue;
          }

          if (!this.incomingHandler) continue;
          const text = (innerMsg?.conversation || innerMsg?.extendedTextMessage?.text || '').trim();
          if (!text) continue;
          // Ignore echo of our own formatted alerts/replies
          if (/^(?:🤖|📋|🚨|⚠️|🔔|✅)\s/.test(text)) continue;
          try {
            await this.incomingHandler(senderPhone, text);
          } catch {
            // Never crash WA listener loop
          }
        }
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 260, margin: 1 });
            this.setState({ status: 'qr_ready', qrDataUrl, lastError: null });
          } catch (err) {
            this.setState({ lastError: (err as Error).message });
          }
        }

        if (connection === 'open') {
          const jid = sock.user?.id ?? '';
          const phone = jid.split(':')[0]?.split('@')[0] ?? null;
          this.setState({
            status: 'connected',
            qrDataUrl: null,
            connectedPhone: phone,
            lastError: null,
          });
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
            ?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          this.lastDisconnectCode = statusCode ?? null;
          this.sock = null;

          if (loggedOut) {
            fs.rmSync(this.authDir, { recursive: true, force: true });
            this.setState({
              status: 'disconnected',
              qrDataUrl: null,
              connectedPhone: null,
              lastError: 'WhatsApp session logged out. Scan QR again to reconnect.',
            });
            return;
          }

          if (!this.manualStop) {
            this.setState({
              status: 'disconnected',
              qrDataUrl: null,
              lastError: statusCode ? `Connection closed (${statusCode}), reconnecting...` : 'Reconnecting...',
            });
            const delay = statusCode === DisconnectReason.restartRequired ? 500 : 2500;
            this.reconnectTimer = setTimeout(() => {
              void this.connect();
            }, delay);
          } else {
            this.setState({ status: 'disconnected', qrDataUrl: null });
          }
        }
      });
    } catch (err) {
      this.sock = null;
      this.setState({
        status: 'disconnected',
        qrDataUrl: null,
        lastError: (err as Error).message,
      });
    }
  }

  async disconnect(): Promise<void> {
    this.manualStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // ignore close errors
      }
      this.sock = null;
    }
    this.setState({ status: 'disconnected', qrDataUrl: null });
  }

  async logout(): Promise<void> {
    this.manualStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // ignore if already closed
      }
      this.sock = null;
    }
    fs.rmSync(this.authDir, { recursive: true, force: true });
    this.setState({
      status: 'disconnected',
      qrDataUrl: null,
      connectedPhone: null,
      lastError: null,
    });
  }

  async sendText(recipientPhone: string, text: string): Promise<{ ok: boolean; error?: string }> {
    // Auto-heal: If socket is not open/ready but session credentials exist, trigger connect and wait briefly
    if ((!this.sock || this.state.status !== 'connected') && this.hasSavedSession()) {
      void this.connect();
      let waited = 0;
      while ((!this.sock || this.state.status !== 'connected') && waited < 6000) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        waited += 250;
      }
    }

    if (!this.sock || this.state.status !== 'connected') {
      const codeMsg = this.lastDisconnectCode ? ` (code ${this.lastDisconnectCode})` : '';
      return { ok: false, error: `WhatsApp QR bridge is not connected${codeMsg}. Please tap Quick Connect to reconnect.` };
    }
    try {
      const targetPhone = recipientPhone.trim() || this.state.connectedPhone || '';
      if (!targetPhone) {
        return { ok: false, error: 'No WhatsApp recipient phone number configured' };
      }
      const jid = normalizeWhatsAppJid(targetPhone);
      const sent = await this.sock.sendMessage(jid, { text });
      if (sent?.key?.id) {
        this.recentBotMsgIds.add(sent.key.id);
        if (this.recentBotMsgIds.size > 200) {
          const oldest = this.recentBotMsgIds.values().next().value;
          if (oldest) this.recentBotMsgIds.delete(oldest);
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
