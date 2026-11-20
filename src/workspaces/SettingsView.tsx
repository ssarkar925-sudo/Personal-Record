import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileKey,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Upload,
  UploadCloud,
  UserCheck,
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
import { api, type AppPreferences } from '../lib/api.ts';
import { APP_LANGUAGES, LANGUAGE_META, type AppLanguage } from '../../shared/i18n.ts';
import { todayISO } from '../lib/format.ts';

interface SettingsViewProps {
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  preferences: AppPreferences;
  onPreferencesChange: (updater: (prev: AppPreferences) => AppPreferences) => void;
  systemLanguage?: AppLanguage;
  onLanguageChange?: (lang: AppLanguage) => void;
  onDataRefreshed?: () => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
}

type SettingsTab = 'account' | 'updates' | 'vault_security' | 'cloud' | 'system';

export function SettingsView({
  currentUser,
  onUserChange,
  preferences,
  onPreferencesChange,
  systemLanguage = 'en',
  onLanguageChange,
  onDataRefreshed,
  notify,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

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
    <div className="space-y-6 animate-panel-in max-w-4xl mx-auto pb-12">
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

              <Button
                variant="primary"
                onClick={() => triggerApkDownload(APK_DOWNLOAD_URL)}
                className="gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 text-xs font-bold shrink-0 shadow-md cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Download &amp; Install APK
              </Button>
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
