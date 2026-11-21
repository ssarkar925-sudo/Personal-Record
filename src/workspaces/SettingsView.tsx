import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileKey,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldCheck,
  Smartphone,
  Unplug,
  Upload,
  UploadCloud,
  UserCheck,
  Zap,
} from 'lucide-react';
import { Button, Card, FieldLabel, Input } from '../components/ui/Primitives.tsx';
import { AppLogo } from '../components/ui/AppLogo.tsx';
import {
  signOut,
  updateAccountPassword,
  resetPasswordForEmail,
  testSupabaseConnection,
  type User,
} from '../lib/supabase.ts';
import { clientDb } from '../lib/client-db.ts';
import { pushLocalDataToSupabase } from '../lib/supabase-sync.ts';
import {
  triggerApkDownload,
  CURRENT_APP_VERSION,
  CURRENT_BUILD_NUMBER,
  APK_DOWNLOAD_URL,
} from '../lib/auto-updater.ts';
import {
  deriveVaultKey,
  generateSaltB64,
  createCanary,
  generateRecoveryKey,
  encryptMasterKeyWithRecovery,
  exportEncryptedVaultFile,
  importEncryptedVaultFile,
} from '../lib/crypto.ts';
import {
  api,
  getWhatsAppServerUrl,
  setWhatsAppServerUrl,
  type AlertDeliveryRecord,
  type AlertSettings,
  type AppPreferences,
  type RenderKeepAliveStatus,
  type WhatsAppBridgeState,
  DEFAULT_ALERT_SETTINGS,
} from '../lib/api.ts';
import type { AlertModule } from '../../shared/ledger-core.ts';
import { APP_LANGUAGES, LANGUAGE_META, type AppLanguage } from '../../shared/i18n.ts';
import { todayISO } from '../lib/format.ts';

const ALERT_MODULE_LABELS: Record<AlertModule, { title: string; desc: string }> = {
  credit_cards: { title: 'Credit Cards', desc: 'Statement bill countdown & 75% limit warning' },
  banks: { title: 'Banks & Recurring Bills', desc: 'Low balance prompts across P/B/F + bill due alerts' },
  loans: { title: 'Loans & EMIs', desc: 'Borrowed & lent EMI due date reminders' },
  people_dues: { title: 'People Dues (Udhar)', desc: 'Overdue or upcoming receivables & payables' },
  budgets: { title: 'Monthly Scope Budgets', desc: '80% warning & 100% exceeded alerts per scope' },
  notes: { title: 'Notes & Checklists', desc: 'Scheduled reminders when checklist tasks remain open' },
  vault: { title: 'Password Vault Hygiene', desc: 'Failed unlocks & password rotation age (zero secret leak)' },
  advisor: { title: 'AI Personal Advisor Risks', desc: 'Financial health score & 30-day cash shortfall warnings' },
};

const RENDER_BLUEPRINT_YAML = `services:
  - type: web
    name: personal-ledger-whatsapp
    env: node
    plan: free
    region: singapore
    buildCommand: npm install
    startCommand: npm run start
    autoDeploy: true
    envVars:
      - key: NODE_VERSION
        value: 22.12.0
      - key: NODE_OPTIONS
        value: "--experimental-sqlite"
      - key: PORT
        value: 10000
      - key: HOST
        value: 0.0.0.0
      - key: RENDER
        value: "true"
      - key: AUTO_WAKEUP
        value: "true"
      - key: ALLOWED_ORIGINS
        value: "https://scbook.vercel.app,http://localhost:3000,http://localhost:5173,capacitor://localhost"
      - key: WAKEUP_INTERVAL_MINUTES
        value: "5"`;

interface SettingsViewProps {
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  preferences: AppPreferences;
  onPreferencesChange: (updater: (prev: AppPreferences) => AppPreferences) => void;
  systemLanguage?: AppLanguage;
  onLanguageChange?: (lang: AppLanguage) => void;
  onDataRefreshed?: () => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
  bridgeState?: WhatsAppBridgeState;
  onBridgeStateChange?: (next: WhatsAppBridgeState) => void;
  initialTab?: SettingsTab;
}

export type SettingsTab = 'account' | 'whatsapp' | 'updates' | 'vault_security' | 'cloud' | 'system';

export function SettingsView({
  currentUser,
  onUserChange,
  preferences,
  onPreferencesChange,
  systemLanguage = 'en',
  onLanguageChange,
  onDataRefreshed,
  notify,
  bridgeState,
  onBridgeStateChange,
  initialTab,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'account');

  // Account Password Reset State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  // Cloud Sync State
  const [syncing, setSyncing] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Vault Security Rekey State
  const [currentMasterPw, setCurrentMasterPw] = useState('');
  const [newMasterPw, setNewMasterPw] = useState('');
  const [confirmNewMasterPw, setConfirmNewMasterPw] = useState('');
  const [rekeyBusy, setRekeyBusy] = useState(false);
  const [rekeyMsg, setRekeyMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  // Vault Backup & Restore State
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [importFileJson, setImportFileJson] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  // WhatsApp & Render 5-Min Wake-Up State
  const [waState, setWaState] = useState<WhatsAppBridgeState>(
    bridgeState || { status: 'disconnected', qrDataUrl: null, connectedPhone: null, lastError: null, updatedAt: '' }
  );
  const [renderServerUrl, setRenderServerUrl] = useState(getWhatsAppServerUrl());
  const [pingStatus, setPingStatus] = useState<{ ok: boolean; latencyMs?: number; text: string } | null>(null);
  const [pingingServer, setPingingServer] = useState(false);
  const [keepAliveStatus, setKeepAliveStatus] = useState<RenderKeepAliveStatus | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [alertDeliveries, setAlertDeliveries] = useState<AlertDeliveryRecord[]>([]);
  const [waBusy, setWaBusy] = useState(false);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waNotice, setWaNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);

  // Sync waState with parent prop if provided
  useEffect(() => {
    if (bridgeState) {
      setWaState(bridgeState);
    }
  }, [bridgeState]);

  // Auto-clear stale disconnect error banner if WhatsApp is actually connected
  useEffect(() => {
    if (waState.status === 'connected' && waNotice?.kind === 'err' && waNotice.text.includes('not connected')) {
      setWaNotice(null);
    }
  }, [waState.status, waNotice]);

  // Load WhatsApp and Alert data when WhatsApp tab is active
  const loadWhatsAppWorkspace = async () => {
    try {
      const [status, settings, alerts, keepalive] = await Promise.all([
        api.getWhatsAppStatus(),
        api.getAlertSettings(),
        api.getAlerts(),
        api.getWhatsAppKeepAlive(),
      ]);
      setWaState(status);
      onBridgeStateChange?.(status);
      setAlertSettings(settings);
      setAlertDeliveries(alerts);
      setKeepAliveStatus(keepalive);
      if (settings.recipientPhone && !waTestPhone) {
        setWaTestPhone(settings.recipientPhone);
      }
    } catch (err) {
      console.warn('Failed to load WhatsApp settings:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp') {
      void loadWhatsAppWorkspace();
    }
  }, [activeTab]);

  // Auto-poll WhatsApp status when connecting or waiting for QR scan
  useEffect(() => {
    if (activeTab !== 'whatsapp') return;
    if (waState.status !== 'connecting' && waState.status !== 'qr_ready') return;

    const timer = window.setInterval(async () => {
      try {
        const next = await api.getWhatsAppStatus();
        setWaState(next);
        onBridgeStateChange?.(next);
        if (next.status === 'connected') {
          setWaNotice({ text: 'WhatsApp linked successfully! Module alerts are now active.', kind: 'ok' });
          notify?.('WhatsApp linked successfully!', 'ok');
        }
      } catch {}
    }, 2500);

    return () => window.clearInterval(timer);
  }, [activeTab, waState.status]);

  const handleConnectWhatsApp = async () => {
    setWaBusy(true);
    setWaNotice(null);
    try {
      const res = await api.connectWhatsApp();
      setWaState(res);
      onBridgeStateChange?.(res);
      setWaNotice({ text: 'Starting connection... Scan QR code with WhatsApp.', kind: 'ok' });
    } catch (err) {
      const msg = (err as Error).message || 'Failed to start WhatsApp bridge.';
      setWaNotice({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setWaBusy(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    setWaBusy(true);
    setWaNotice(null);
    try {
      const res = await api.disconnectWhatsApp();
      setWaState(res);
      onBridgeStateChange?.(res);
      setWaNotice({ text: 'WhatsApp disconnected.', kind: 'ok' });
      notify?.('WhatsApp disconnected', 'ok');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to disconnect.';
      setWaNotice({ text: msg, kind: 'err' });
    } finally {
      setWaBusy(false);
    }
  };

  const handleLogoutWhatsApp = async () => {
    setWaBusy(true);
    setWaNotice(null);
    try {
      const res = await api.logoutWhatsApp();
      setWaState(res);
      onBridgeStateChange?.(res);
      setWaNotice({ text: 'Logged out. Session cleared. Scan new QR code to reconnect.', kind: 'ok' });
      notify?.('WhatsApp session logged out', 'ok');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to log out session.';
      setWaNotice({ text: msg, kind: 'err' });
    } finally {
      setWaBusy(false);
    }
  };

  const handleTestWhatsAppAlert = async () => {
    const phone = waTestPhone.trim() || alertSettings.recipientPhone.trim();
    if (!phone) {
      setWaNotice({ text: 'Please enter a recipient phone number first.', kind: 'err' });
      return;
    }
    setWaBusy(true);
    setWaNotice(null);
    try {
      await api.testWhatsApp(phone);
      setWaNotice({ text: `Test alert dispatched to ${phone} ✓`, kind: 'ok' });
      notify?.(`Test alert dispatched to ${phone}!`, 'ok');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to dispatch test message.';
      setWaNotice({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setWaBusy(false);
    }
  };

  const handleSaveAlertSettings = async (nextSettings: AlertSettings) => {
    setAlertSettings(nextSettings);
    try {
      await api.saveAlertSettings(nextSettings);
      notify?.('Alert preferences saved ✓', 'ok');
    } catch (err) {
      notify?.((err as Error).message || 'Failed to save settings', 'err');
    }
  };

  const handleSaveRenderUrl = (url: string) => {
    setRenderServerUrl(url);
    setWhatsAppServerUrl(url);
    notify?.('WhatsApp Render server URL saved ✓', 'ok');
  };

  const handleTestPingServer = async () => {
    setPingingServer(true);
    setPingStatus(null);
    try {
      const res = await api.pingWhatsAppServer(renderServerUrl);
      if (res.ok) {
        setPingStatus({
          ok: true,
          latencyMs: res.latencyMs,
          text: `Online • ${res.status || 200} OK (${res.latencyMs}ms)`,
        });
        notify?.(`Server is online (${res.latencyMs}ms)`, 'ok');
      } else {
        setPingStatus({
          ok: false,
          latencyMs: res.latencyMs,
          text: `Unreachable: ${res.error || 'Server error'}`,
        });
        notify?.('Server ping failed', 'err');
      }
    } catch (err) {
      setPingStatus({ ok: false, text: (err as Error).message || 'Network error' });
    } finally {
      setPingingServer(false);
    }
  };

  const handleToggleKeepAlive = async () => {
    const nextEnabled = !keepAliveStatus?.enabled;
    try {
      const res = await api.saveWhatsAppKeepAlive({
        enabled: nextEnabled,
        targetUrl: renderServerUrl || undefined,
        intervalMinutes: 5,
        pingNow: nextEnabled,
      });
      setKeepAliveStatus(res.data);
      notify?.(nextEnabled ? '5-Min Wake-Up Pinger activated' : '5-Min Wake-Up Pinger paused', 'ok');
    } catch (err) {
      notify?.((err as Error).message || 'Failed to update keepalive', 'err');
    }
  };


  // Handle Account Password Update
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setAccountMsg({ text: 'Password must be at least 6 characters.', kind: 'err' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountMsg({ text: 'Passwords do not match.', kind: 'err' });
      return;
    }

    setPasswordLoading(true);
    try {
      await updateAccountPassword(newPassword);
      setAccountMsg({ text: 'Password updated successfully! Use this password on next login.', kind: 'ok' });
      notify?.('Account password updated successfully!', 'ok');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to update password.';
      setAccountMsg({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle Send Password Reset Email
  const handleSendResetEmail = async () => {
    if (!currentUser?.email) return;
    setPasswordLoading(true);
    setAccountMsg(null);
    try {
      await resetPasswordForEmail(currentUser.email);
      setAccountMsg({ text: `Password reset email dispatched to ${currentUser.email}. Check your inbox.`, kind: 'ok' });
      notify?.('Password reset email sent!', 'ok');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to send reset email.';
      setAccountMsg({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await signOut();
      clientDb.resetToCleanSlate();
      onUserChange(null);
      notify?.('Signed out successfully. All records locked.', 'ok');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    }
  };

  // Handle Force Sync
  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const res = await clientDb.pullDataFromSupabase({ force: true });
      onDataRefreshed?.();
      notify?.(`Pulled ${res.count} updated records from cloud!`, 'ok');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  // Handle Push Local
  const handlePushLocal = async () => {
    setSyncing(true);
    try {
      await pushLocalDataToSupabase();
      notify?.('Uploaded local records to cloud server!', 'ok');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  // Handle Test Ping
  const handleTestPing = async () => {
    setPingLoading(true);
    try {
      const res = await testSupabaseConnection();
      setPingResult(res.message);
    } catch (err) {
      setPingResult((err as Error).message);
    } finally {
      setPingLoading(false);
    }
  };

  // Handle Master Password Rekey
  const handleRekeyVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setRekeyMsg(null);

    if (!currentMasterPw || !newMasterPw) {
      setRekeyMsg({ text: 'Please fill in all master password fields.', kind: 'err' });
      return;
    }
    if (newMasterPw.length < 8) {
      setRekeyMsg({ text: 'New Master Password must be at least 8 characters.', kind: 'err' });
      return;
    }
    if (newMasterPw !== confirmNewMasterPw) {
      setRekeyMsg({ text: 'New master passwords do not match.', kind: 'err' });
      return;
    }

    setRekeyBusy(true);
    try {
      const meta = await api.getVaultMeta();
      if (!meta) throw new Error('Vault is not initialized.');

      // Verify current master password
      const oldKey = await deriveVaultKey(currentMasterPw, meta.saltB64);
      const rawEntries = await api.getVaultEntries();

      // Derive new key & fresh salt
      const nextSalt = generateSaltB64();
      const nextKey = await deriveVaultKey(newMasterPw, nextSalt);
      const { canaryIv, canaryCt } = await createCanary(nextKey);

      // Re-encrypt existing entries with new key
      const { decryptVaultPayload, encryptVaultPayload } = await import('../lib/crypto.ts');
      const reEncrypted = await Promise.all(
        rawEntries.map(async (row) => {
          const payload = await decryptVaultPayload(oldKey, row.iv, row.ciphertext);
          const enc = await encryptVaultPayload(nextKey, payload);
          return {
            id: row.id,
            label: row.label,
            category: row.category,
            iv: enc.iv,
            ciphertext: enc.ciphertext,
            lastRotatedAt: row.lastRotatedAt,
          };
        }),
      );

      const freshRecoveryKey = generateRecoveryKey();
      const escrow = await encryptMasterKeyWithRecovery(nextKey, freshRecoveryKey);

      await api.rekeyVault({
        saltB64: nextSalt,
        canaryIv,
        canaryCt,
        recoverySaltB64: escrow.recoverySaltB64,
        recoveryIv: escrow.recoveryIv,
        recoveryCt: escrow.recoveryCt,
        waRecoveryKey: freshRecoveryKey,
        entries: reEncrypted,
      });

      setRekeyMsg({ text: 'Master Password changed successfully with 0 data loss ✓', kind: 'ok' });
      notify?.('Master Password rekeyed successfully!', 'ok');
      setCurrentMasterPw('');
      setNewMasterPw('');
      setConfirmNewMasterPw('');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to rekey master password.';
      setRekeyMsg({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setRekeyBusy(false);
    }
  };

  // Handle Export Vault Backup
  const handleExportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPassphrase.trim()) return;
    setExportBusy(true);
    try {
      const raw = await api.getVaultEntries();
      const exportedJson = await exportEncryptedVaultFile(exportPassphrase, raw as any);
      const blob = new Blob([exportedJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-ledger-vault-${todayISO()}.plvault`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPassphrase('');
      notify?.('Exported encrypted vault backup (.plvault) ✓', 'ok');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    } finally {
      setExportBusy(false);
    }
  };

  // Handle Import Vault Backup
  const handleImportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFileJson.trim() || !importPassphrase.trim()) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const items = await importEncryptedVaultFile(importPassphrase, importFileJson);
      for (const item of items) {
        await api.saveVaultEntry({
          id: item.id,
          label: item.label,
          category: item.category,
          iv: (item as any).iv || '',
          ciphertext: (item as any).ciphertext || '',
          lastRotatedAt: item.lastRotatedAt || todayISO(),
        });
      }
      setImportMsg({ text: `Imported ${items.length} vault items successfully!`, kind: 'ok' });
      notify?.(`Imported ${items.length} vault items successfully!`, 'ok');
      setImportFileJson('');
      setImportPassphrase('');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to import backup.';
      setImportMsg({ text: msg, kind: 'err' });
      notify?.(msg, 'err');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-panel-in max-w-4xl mx-auto pb-32 sm:pb-36">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-[#EAE5DC] bg-white p-5 sm:p-6 shadow-xs text-[#111318]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#D6CFC2] bg-[#FAF8F5] shadow-xs">
              <AppLogo size={44} className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#111318] font-display">
                Settings &amp; System Configuration
              </h1>
              <p className="text-xs text-[#686E78] font-mono-data mt-0.5">
                Centralized management for Account, Android App, Vault Security &amp; Cloud Sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono-data">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Sovereign Guard Active
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex rounded-xl bg-[#F3EFEA] p-1 border border-[#EAE5DC] overflow-x-auto no-scrollbar gap-1 text-xs">
        {[
          { id: 'account', label: 'Account & Password', icon: <UserCheck className="h-3.5 w-3.5" /> },
          {
            id: 'whatsapp',
            label: 'WhatsApp & 5-Min Wake-Up',
            icon: (
              <span className="relative flex items-center">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                {waState.status === 'connected' && (
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                )}
              </span>
            ),
          },
          { id: 'updates', label: 'Android App & APK', icon: <Smartphone className="h-3.5 w-3.5" /> },
          { id: 'vault_security', label: 'Vault Master & Backup', icon: <Lock className="h-3.5 w-3.5" /> },
          { id: 'cloud', label: 'Cloud Sync & Cache', icon: <UploadCloud className="h-3.5 w-3.5" /> },
          { id: 'system', label: 'Preferences & Language', icon: <Shield className="h-3.5 w-3.5" /> },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ACCOUNT & PASSWORD RESET */}
      {activeTab === 'account' && (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">Sovereign Account Identity</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your authenticated cloud partition owner profile</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSignOut()}
                className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Signed In As</span>
                <span className="text-sm font-bold text-slate-900 mt-1 block truncate font-mono-data">
                  {currentUser?.email || 'Not Signed In'}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Partition User ID</span>
                <span className="text-xs font-mono-data text-slate-700 mt-1 block truncate">
                  {currentUser?.id || 'Local Anonymous'}
                </span>
              </div>
            </div>
          </Card>

          {/* Reset / Change Account Password Card */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="h-9 w-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">Reset / Update Account Password</h2>
                <p className="text-xs text-slate-500 mt-0.5">Change your cloud login password for both mobile app and web</p>
              </div>
            </div>

            {accountMsg && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  accountMsg.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {accountMsg.kind === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{accountMsg.text}</div>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="settings-new-password">New Password (min 6 chars)</FieldLabel>
                  <div className="relative mt-1">
                    <Input
                      id="settings-new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new account password"
                      required
                      className="pr-10 h-10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="settings-confirm-password">Confirm New Password</FieldLabel>
                  <div className="relative mt-1">
                    <Input
                      id="settings-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new account password"
                      required
                      className="h-10 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={passwordLoading}
                  className="gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 text-xs font-bold cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {passwordLoading ? 'Updating Password...' : 'Save New Account Password'}
                </Button>

                <button
                  type="button"
                  onClick={() => void handleSendResetEmail()}
                  disabled={passwordLoading}
                  className="text-xs text-[#8C6D1F] hover:text-[#111318] font-semibold underline cursor-pointer"
                >
                  Prefer email link? Send Reset Password Email
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* TAB: WHATSAPP BRIDGE & 5-MIN WAKE-UP */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-5">
          {/* Status Message or Alert */}
          {waNotice && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                waNotice.kind === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {waNotice.kind === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{waNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setWaNotice(null)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* 1. Connection Status & Baileys QR Code Workstation */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  WhatsApp Linked-Device Bridge
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct peer-to-peer Baileys connection for real-time mobile nudges, bill warnings &amp; 2-way bot
                </p>
              </div>

              {/* Status Pill */}
              <div className="flex items-center gap-2">
                {waState.status === 'connected' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected • {waState.connectedPhone || 'Linked'}
                  </span>
                )}
                {waState.status === 'qr_ready' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 border border-blue-300 text-blue-800 text-xs font-semibold">
                    <QrCode className="h-3 w-3 text-blue-600" />
                    Scan QR Code
                  </span>
                )}
                {waState.status === 'connecting' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold">
                    <RefreshCw className="h-3 w-3 text-amber-600 animate-spin" />
                    Connecting...
                  </span>
                )}
                {waState.status === 'disconnected' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold">
                    <Unplug className="h-3 w-3 text-slate-500" />
                    Disconnected
                  </span>
                )}
              </div>
            </div>

            {/* QR Code Presentation when qr_ready */}
            {waState.status === 'qr_ready' && waState.qrDataUrl && (
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="relative p-3 bg-white rounded-xl shadow-xs border border-slate-200 shrink-0">
                  <img
                    src={waState.qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />
                  <div className="absolute inset-x-0 bottom-1 flex justify-center">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-black/75 text-white font-mono-data">
                      Refreshes automatically
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-slate-700">
                  <h3 className="text-sm font-bold text-slate-900">How to Connect WhatsApp:</h3>
                  <ol className="list-decimal pl-4 space-y-1.5 text-slate-600">
                    <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                    <li>Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings</strong> on iPhone</li>
                    <li>Select <strong>Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                  </ol>
                  <p className="text-[11px] text-slate-500 italic">
                    The bridge will automatically link in 2–3 seconds after scanning. No third-party API or phone verification needed.
                  </p>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {waState.status !== 'connected' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnectWhatsApp}
                  disabled={waBusy}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {waState.status === 'qr_ready' ? 'Refresh QR Code' : 'Quick Connect WhatsApp'}
                </Button>
              )}

              {waState.status === 'connected' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDisconnectWhatsApp}
                    disabled={waBusy}
                    className="gap-1.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLogoutWhatsApp}
                    disabled={waBusy}
                    className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
                  >
                    Log Out Session
                  </Button>
                </>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadWhatsAppWorkspace()}
                disabled={waBusy}
                className="gap-1.5 text-slate-600 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${waBusy ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </Card>

          {/* 2. Render Server & 5-Minute Wake-Up Engine */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <Server className="h-4 w-4 text-[#111318]" />
                  Render.com &amp; 5-Minute Wake-Up Engine
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Render free tier spins down after 15 minutes of inactivity. Our 5-minute keepalive self-ping keeps WhatsApp awake 24/7.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                    keepAliveStatus?.enabled
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <Radio className={`h-3 w-3 ${keepAliveStatus?.enabled ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                  {keepAliveStatus?.enabled ? '5-Min Pinger: Active' : 'Pinger: Paused'}
                </span>
              </div>
            </div>

            {/* Server URL Input */}
            <div className="space-y-3">
              <div>
                <FieldLabel>Render WhatsApp Server URL</FieldLabel>
                <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
                  <Input
                    type="url"
                    value={renderServerUrl}
                    onChange={(e) => setRenderServerUrl(e.target.value)}
                    placeholder="https://personal-ledger-wa.onrender.com"
                    className="font-mono-data text-xs flex-1"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveRenderUrl(renderServerUrl)}
                      className="cursor-pointer"
                    >
                      Save URL
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleTestPingServer()}
                      disabled={pingingServer}
                      className="cursor-pointer gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                      {pingingServer ? 'Pinging...' : 'Test Ping'}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Leave blank if running on the same local computer/port (defaults to relative <code>/api</code>).
                </p>
              </div>

              {/* Ping Feedback */}
              {pingStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    pingStatus.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <span className="font-semibold flex items-center gap-1.5">
                    {pingStatus.ok ? '🟢' : '🔴'} {pingStatus.text}
                  </span>
                  {pingStatus.latencyMs !== undefined && (
                    <span className="font-mono-data text-[11px]">Latency: {pingStatus.latencyMs}ms</span>
                  )}
                </div>
              )}

              {/* 5-Min Wake-Up Toggle & Telemetry */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Wake-Up Interval</span>
                  <span className="text-sm font-bold text-slate-900 mt-1 block font-mono-data">5 Minutes (300s)</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Beats Render 15m idle limit</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Keep-Alive Health Endpoint</span>
                  <span className="text-xs font-bold text-slate-900 mt-1 block font-mono-data truncate">
                    /api/health
                  </span>
                  <span className="text-[10px] text-slate-500">Self-ping &amp; browser pinger</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Keep-Alive Status</span>
                    <span className="text-xs font-bold text-slate-900 mt-1 block font-mono-data">
                      {keepAliveStatus?.totalPings ?? 0} Pings Sent
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleKeepAlive}
                    className={`mt-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                      keepAliveStatus?.enabled
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {keepAliveStatus?.enabled ? '✓ 5-Min Ping Active' : 'Enable 5-Min Ping'}
                  </button>
                </div>
              </div>

              {/* Render 1-Click Blueprint Guide */}
              <details className="group rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-700">
                <summary className="font-semibold text-slate-900 cursor-pointer flex items-center justify-between select-none">
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-indigo-600" />
                    How to deploy this WhatsApp server to Render (Free 24/7)
                  </span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2.5">
                  <p>
                    A pre-configured <strong><code>render.yaml</code></strong> and <strong><code>Dockerfile</code></strong> have already been placed in the repository root.
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                    <li>Push this repository to GitHub: <code>https://github.com/ssarkar925-sudo/Personal-Record</code></li>
                    <li>Go to <a href="https://dashboard.render.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">dashboard.render.com</a> and click <strong>New +</strong> → <strong>Blueprint</strong></li>
                    <li>Select your GitHub repository. Render will automatically read <code>render.yaml</code>, select the Singapore region, set Node 22, and deploy the service.</li>
                    <li>Once live, copy your service URL (e.g. <code>https://personal-ledger-wa.onrender.com</code>) and paste it into the field above!</li>
                  </ol>
                  <div className="pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(RENDER_BLUEPRINT_YAML);
                        setCopiedBlueprint(true);
                        setTimeout(() => setCopiedBlueprint(false), 2000);
                        notify?.('Copied render.yaml blueprint to clipboard', 'ok');
                      }}
                      className="cursor-pointer gap-1.5 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedBlueprint ? 'Copied ✓' : 'Copy render.yaml Blueprint'}
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          </Card>

          {/* 3. Recipient Phone & Test Alert Workstation */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-4 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 font-display">Notification Destination &amp; Test Alert</h2>
              <p className="text-xs text-slate-500 mt-0.5">Where automated payment reminders, EMI countdowns &amp; digests are sent</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Primary WhatsApp Number (E.164 / +91)</FieldLabel>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    type="tel"
                    value={alertSettings.recipientPhone}
                    onChange={(e) => setAlertSettings({ ...alertSettings, recipientPhone: e.target.value })}
                    placeholder="+919876543210"
                    className="font-mono-data text-xs"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleSaveAlertSettings(alertSettings)}
                    className="cursor-pointer"
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div>
                <FieldLabel>Send Instant Test Alert</FieldLabel>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    type="tel"
                    value={waTestPhone}
                    onChange={(e) => setWaTestPhone(e.target.value)}
                    placeholder="Test recipient number"
                    className="font-mono-data text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleTestWhatsAppAlert}
                    disabled={waBusy || waState.status !== 'connected'}
                    className="gap-1.5 cursor-pointer text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Test Ping
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* 4. Alert Modules Checklist */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-4 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 font-display">Active Alert Modules</h2>
              <p className="text-xs text-slate-500 mt-0.5">Toggle which ledger workspaces automatically dispatch WhatsApp notifications</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {(Object.keys(ALERT_MODULE_LABELS) as AlertModule[]).map((mod) => {
                const meta = ALERT_MODULE_LABELS[mod];
                const checked = alertSettings.enabledModules?.[mod] ?? true;
                return (
                  <label
                    key={mod}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextModules = {
                          ...alertSettings.enabledModules,
                          [mod]: e.target.checked,
                        };
                        const nextSettings = { ...alertSettings, enabledModules: nextModules };
                        void handleSaveAlertSettings(nextSettings);
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 block">{meta.title}</span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block leading-snug">{meta.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* 5. Quiet Hours & Morning Digest */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-4 shadow-xs">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 font-display">Quiet Hours &amp; Delivery Schedule</h2>
              <p className="text-xs text-slate-500 mt-0.5">Suppress notifications during sleep and bundle overnight alerts into a morning summary</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <FieldLabel>Quiet Hours Start</FieldLabel>
                <select
                  value={alertSettings.quietStartHour}
                  onChange={(e) => {
                    const next = { ...alertSettings, quietStartHour: Number(e.target.value) };
                    void handleSaveAlertSettings(next);
                  }}
                  className="w-full mt-1.5 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-mono-data"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 ({h === 0 ? 'Midnight' : h >= 12 ? `${h === 12 ? 12 : h - 12} PM` : `${h} AM`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Quiet Hours End</FieldLabel>
                <select
                  value={alertSettings.quietEndHour}
                  onChange={(e) => {
                    const next = { ...alertSettings, quietEndHour: Number(e.target.value) };
                    void handleSaveAlertSettings(next);
                  }}
                  className="w-full mt-1.5 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-mono-data"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 ({h === 0 ? 'Midnight' : h >= 12 ? `${h === 12 ? 12 : h - 12} PM` : `${h} AM`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alertSettings.morningDigestEnabled}
                    onChange={(e) => {
                      const next = { ...alertSettings, morningDigestEnabled: e.target.checked };
                      void handleSaveAlertSettings(next);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-slate-900 block text-xs">Morning Digest</span>
                    <span className="text-[10px] text-slate-500">Deliver summary at 9 AM</span>
                  </div>
                </label>
              </div>
            </div>
          </Card>

          {/* 6. Recent Dispatched Alerts History */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">Recent Dispatched Alerts</h2>
                <p className="text-xs text-slate-500 mt-0.5">Live audit log of automated and manual WhatsApp notifications</p>
              </div>
              <span className="text-[11px] font-mono-data text-slate-500">
                {alertDeliveries.length} recorded
              </span>
            </div>

            {alertDeliveries.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No alerts dispatched yet. Send a test ping above or wait for automated ledger triggers.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {alertDeliveries.slice(0, 8).map((record) => (
                  <div
                    key={record.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 text-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{record.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{record.message}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          record.status === 'sent'
                            ? 'bg-emerald-100 text-emerald-800'
                            : record.status === 'failed'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {record.status}
                      </span>
                      <span className="text-[10px] font-mono-data text-slate-400">
                        {record.createdAt ? new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: ANDROID APP & APK UPDATES */}
      {activeTab === 'updates' && (
        <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">Android Application &amp; Updates</h2>
              <p className="text-xs text-slate-500 mt-0.5">Download and install the native Sovereign Android APK</p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">Personal Ledger for Android</span>
                  <span className="rounded-md bg-emerald-200/80 px-2 py-0.5 text-[11px] font-mono-data font-bold text-emerald-900">
                    v{CURRENT_APP_VERSION} (Build {CURRENT_BUILD_NUMBER})
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Full standalone Android app with offline storage, camera receipt capture, and real-time cloud synchronization.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0">
                <Button
                  variant="primary"
                  onClick={() => triggerApkDownload(APK_DOWNLOAD_URL)}
                  className="gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 text-xs font-bold shrink-0 shadow-md cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download &amp; Install APK
                </Button>
                <a
                  href={APK_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  download="PersonalLedger-latest.apk"
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline px-2 py-1"
                >
                  Direct APK Link
                </a>
              </div>
            </div>

            <div className="border-t border-emerald-200/60 pt-3 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Installation Steps:</div>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-600">
                <li>Tap <strong>Download &amp; Install APK</strong> above.</li>
                <li>When prompted by Android, allow <em>Install unknown apps</em> for your browser.</li>
                <li>Tap Open and install. Log in with your Sovereign Account to sync instantly.</li>
              </ol>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: VAULT SECURITY & REKEY */}
      {activeTab === 'vault_security' && (
        <div className="space-y-5">
          {/* Master Password Change (Rekey) */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="h-9 w-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">Change Vault Master Password (Rekey)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Re-encrypts all vault secrets locally with a fresh 256-bit AES-GCM key and fresh salt
                </p>
              </div>
            </div>

            {rekeyMsg && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  rekeyMsg.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {rekeyMsg.kind === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{rekeyMsg.text}</div>
              </div>
            )}

            <form onSubmit={handleRekeyVault} className="space-y-4">
              <div>
                <FieldLabel htmlFor="settings-current-master">Current Master Password</FieldLabel>
                <Input
                  id="settings-current-master"
                  type="password"
                  value={currentMasterPw}
                  onChange={(e) => setCurrentMasterPw(e.target.value)}
                  placeholder="Enter current master password"
                  required
                  className="h-10 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="settings-new-master">New Master Password (min 8 chars)</FieldLabel>
                  <Input
                    id="settings-new-master"
                    type="password"
                    value={newMasterPw}
                    onChange={(e) => setNewMasterPw(e.target.value)}
                    placeholder="Enter new strong master password"
                    required
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="settings-confirm-master">Confirm New Master Password</FieldLabel>
                  <Input
                    id="settings-confirm-master"
                    type="password"
                    value={confirmNewMasterPw}
                    onChange={(e) => setConfirmNewMasterPw(e.target.value)}
                    placeholder="Re-enter new master password"
                    required
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={rekeyBusy}
                className="gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 text-xs font-bold cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {rekeyBusy ? 'Re-encrypting Vault...' : 'Rekey Vault Secrets'}
              </Button>
            </form>
          </Card>

          {/* Encrypted Vault Backup & Restore */}
          <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <FileKey className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-display">Vault Backup &amp; Disaster Recovery</h2>
                <p className="text-xs text-slate-500 mt-0.5">Export or restore encrypted credentials (.plvault format)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Export Form */}
              <form onSubmit={handleExportVault} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                  <span>Export Encrypted Vault</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Generates an encrypted backup file protected with an export passphrase.
                </p>
                <div>
                  <FieldLabel htmlFor="settings-export-pass">Export Passphrase</FieldLabel>
                  <Input
                    id="settings-export-pass"
                    type="password"
                    value={exportPassphrase}
                    onChange={(e) => setExportPassphrase(e.target.value)}
                    placeholder="Enter backup passphrase"
                    required
                    className="h-9 text-xs bg-white"
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={exportBusy}
                  className="w-full text-xs gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy ? 'Exporting...' : 'Download .plvault File'}
                </Button>
              </form>

              {/* Import Form */}
              <form onSubmit={handleImportVault} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Restore Encrypted Vault</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Restore credentials from a previously exported .plvault backup file.
                </p>
                <div>
                  <FieldLabel htmlFor="settings-import-pass">Decryption Passphrase</FieldLabel>
                  <Input
                    id="settings-import-pass"
                    type="password"
                    value={importPassphrase}
                    onChange={(e) => setImportPassphrase(e.target.value)}
                    placeholder="Enter file passphrase"
                    required
                    className="h-9 text-xs bg-white"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="settings-import-file">Select Backup File</FieldLabel>
                  <input
                    id="settings-import-file"
                    type="file"
                    accept=".json,.plvault"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setImportFileJson(ev.target?.result as string || '');
                        reader.readAsText(file);
                      }
                    }}
                    className="text-xs text-slate-600 block w-full mt-1 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:bg-slate-200 file:text-slate-800"
                  />
                </div>
                {importMsg && (
                  <div
                    className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                      importMsg.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {importMsg.kind === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span>{importMsg.text}</span>
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={importBusy || !importFileJson}
                  className="w-full text-xs gap-1.5 cursor-pointer bg-[#111318] text-[#E5C158]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importBusy ? 'Restoring...' : 'Restore from Backup'}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: CLOUD SYNC & CACHE */}
      {activeTab === 'cloud' && (
        <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">Supabase Cloud Database &amp; Smart Cache</h2>
              <p className="text-xs text-slate-500 mt-0.5">Real-time bi-directional PostgreSQL synchronization</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={pingLoading}
              onClick={() => void handleTestPing()}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${pingLoading ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
          </div>

          {pingResult && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 font-mono-data">
              {pingResult}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-2">
              <span className="font-semibold text-slate-900 block">Smart Cache Layer Active</span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Data loads instantly from local storage cache (0ms). Redundant server queries are prevented with intelligent 120s TTL and Realtime CDC invalidation.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Zero redundant queries on route change</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-2">
              <span className="font-semibold text-slate-900 block">Manual Cloud Operations</span>
              <p className="text-[11px] text-slate-500">Force pull or push your encrypted records</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={syncing}
                  onClick={() => void handleForceSync()}
                  className="gap-1.5 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 text-xs cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Force Pull Cloud'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={syncing}
                  onClick={() => void handlePushLocal()}
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  <UploadCloud className="h-3 w-3" />
                  Upload Local
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 5: PREFERENCES & LANGUAGE */}
      {activeTab === 'system' && (
        <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white space-y-5 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-display">System Preferences</h2>
            <p className="text-xs text-slate-500 mt-0.5">Language and security options</p>
          </div>

          <div className="space-y-4">
            {/* Language Selection */}
            <div>
              <FieldLabel>System Interface Language</FieldLabel>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {APP_LANGUAGES.map((lang) => {
                  const active = systemLanguage === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onLanguageChange?.(lang)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                        active
                          ? 'bg-[#111318] text-[#E5C158] border-[#C59B27]/50 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {LANGUAGE_META[lang].nativeLabel} ({LANGUAGE_META[lang].label})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cloud Auto-Backup Toggle */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-xs text-slate-900 block">Automatic Cloud Backup</span>
                <span className="text-[11px] text-slate-500">
                  {preferences.autoBackupEnabled
                    ? 'Automatic cloud synchronization and backups are enabled'
                    : 'Automatic cloud synchronization and backups are paused'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextState = !preferences.autoBackupEnabled;
                  onPreferencesChange((prev) => ({ ...prev, autoBackupEnabled: nextState }));
                  notify?.(nextState ? 'Auto-backup enabled' : 'Auto-backup paused', 'ok');
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  preferences.autoBackupEnabled
                    ? 'border-[#C59B27] bg-[#111318] text-[#E5C158]'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {preferences.autoBackupEnabled ? 'Enabled' : 'Paused'}
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
