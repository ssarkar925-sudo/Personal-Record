import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  MessageSquare,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  Unplug,
  Upload,
} from 'lucide-react';
import {
  api,
  type AlertDeliveryRecord,
  type AlertSettings,
  type AppPreferences,
  type WhatsAppBridgeState,
} from '../lib/api.ts';
import { AnimatedTabs, Badge, Button, Dialog, FieldLabel, Input } from '../components/ui/Primitives.tsx';
import type { AlertModule } from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';

type ModalTab = 'whatsapp' | 'inbox' | 'backup';

const MODULE_LABELS: Record<AlertModule, { title: string; desc: string }> = {
  credit_cards: { title: 'Credit Cards', desc: 'Statement bill due countdown & utilization threshold' },
  banks: { title: 'Banks & Recurring Bills', desc: 'Low balance alerts across P/B/F + recurring due prompts' },
  loans: { title: 'Loans & EMIs', desc: 'Borrowed & lent EMI due date alerts' },
  people_dues: { title: 'People Dues (Give / Need)', desc: 'Overdue or upcoming receivables and payables' },
  budgets: { title: 'Monthly Scope Budgets', desc: '80% warning & 100% exceeded alerts per scope' },
  notes: { title: 'Notes & Checklists', desc: 'Scheduled note reminders when checklist items remain open' },
  vault: { title: 'Password Vault Hygiene', desc: 'Failed unlocks & password age only — zero secrets sent' },
  advisor: { title: 'AI Personal Advisor Risks', desc: 'Proactive health score & 30-day cash shortfall warnings' },
};

export function AlertsSettingsModal({
  open,
  onClose,
  bridgeState,
  onBridgeStateChange,
  preferences: externalPrefs,
  onPreferencesChange,
  systemLanguage = 'en',
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  bridgeState: WhatsAppBridgeState;
  onBridgeStateChange: (next: WhatsAppBridgeState) => void;
  preferences?: AppPreferences;
  onPreferencesChange?: (next: AppPreferences) => void;
  systemLanguage?: AppLanguage;
  onRefresh: () => void;
}) {
  const dict = UI_STRINGS[systemLanguage];
  const [tab, setTab] = useState<ModalTab>('whatsapp');
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [prefs, setPrefs] = useState<AppPreferences | null>(externalPrefs ?? null);
  const [alerts, setAlerts] = useState<AlertDeliveryRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [copiedPs, setCopiedPs] = useState(false);
  const [backupCandidate, setBackupCandidate] = useState<Record<string, unknown> | null>(null);
  const [encryptedCandidate, setEncryptedCandidate] = useState<Record<string, unknown> | null>(null);
  const [backupFileName, setBackupFileName] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDir, setAutoBackupDir] = useState('');
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinAutoLockMin, setPinAutoLockMin] = useState('0');

  const loadData = async () => {
    const [s, a, wa, pr] = await Promise.all([
      api.getAlertSettings(),
      api.getAlerts(),
      api.getWhatsAppStatus(),
      api.getPreferences(),
    ]);
    setSettings(s);
    setAlerts(a);
    setPrefs(pr);
    setAutoBackupEnabled(pr.autoBackupEnabled);
    setAutoBackupDir(pr.autoBackupDir);
    setPinAutoLockMin(String(pr.autoLockMinutes ?? 0));
    onPreferencesChange?.(pr);
    onBridgeStateChange(wa);
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatusMsg('');
    void loadData();
  }, [open]);

  // Poll QR / connection progress while modal is open and bridge is connecting or showing QR
  useEffect(() => {
    if (!open) return;
    if (bridgeState.status !== 'connecting' && bridgeState.status !== 'qr_ready') return;
    const id = window.setInterval(async () => {
      try {
        const next = await api.getWhatsAppStatus();
        onBridgeStateChange(next);
      } catch {
        // ignore transient poll failure
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [open, bridgeState.status]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError('');
    setStatusMsg('');
    try {
      const saved = await api.saveAlertSettings(settings);
      setSettings(saved);
      setStatusMsg('Alert rules saved.');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckNow = async () => {
    setError('');
    setStatusMsg('');
    try {
      const res = await api.checkAlertsNow();
      await loadData();
      setStatusMsg(
        `Evaluated ${res.evaluated} items · ${res.sentWhatsApp} WhatsApp sent · ${res.queuedWhatsApp} queued.`,
      );
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setStatusMsg('');
    const file = e.target.files?.[0];
    if (!file) {
      setBackupCandidate(null);
      setEncryptedCandidate(null);
      setBackupFileName('');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.format === 'personal-ledger-encrypted-backup-v1' && typeof parsed.ciphertextBase64 === 'string') {
        setEncryptedCandidate(parsed);
        setBackupCandidate(null);
        setBackupFileName(file.name);
        return;
      }
      if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) {
        throw new Error('Selected JSON does not look like a Personal Ledger backup.');
      }
      setEncryptedCandidate(null);
      setBackupCandidate(parsed);
      setBackupFileName(file.name);
    } catch (err) {
      setBackupCandidate(null);
      setEncryptedCandidate(null);
      setBackupFileName('');
      setError((err as Error).message);
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupCandidate && !encryptedCandidate) return;
    setRestoring(true);
    setError('');
    setStatusMsg('');
    try {
      let res: { counts: Record<string, number> };
      if (encryptedCandidate) {
        if (backupPassphrase.trim().length < 6) {
          throw new Error('Enter the backup passphrase (minimum 6 characters) to decrypt.');
        }
        res = await api.restoreEncryptedBackup(encryptedCandidate, backupPassphrase);
      } else {
        res = await api.restoreBackup(backupCandidate!);
      }
      setStatusMsg(
        `Restored ${res.counts.accounts} accounts, ${res.counts.transactions} transactions, ${res.counts.loans} loans, ${res.counts.peopleDues} dues, ${res.counts.notes} notes, and ${res.counts.vaultEntries} vault entries.`,
      );
      setBackupCandidate(null);
      setEncryptedCandidate(null);
      setBackupFileName('');
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  const handleDownloadEncryptedBackup = async () => {
    setError('');
    setStatusMsg('');
    if (backupPassphrase.trim().length < 6) {
      setError('Enter a passphrase of at least 6 characters to encrypt the backup.');
      return;
    }
    try {
      const env = await api.exportEncryptedBackup(backupPassphrase);
      const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-ledger-encrypted-${new Date().toISOString().slice(0, 10)}.plbackup.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('Encrypted AES-256-GCM backup downloaded.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveAutoBackup = async (runNow = false) => {
    setError('');
    setStatusMsg('');
    try {
      const updated = await api.updatePreferences({
        autoBackupEnabled,
        autoBackupDir: autoBackupDir.trim(),
      });
      setPrefs(updated);
      onPreferencesChange?.(updated);
      if (runNow) {
        const res = await api.runAutoBackupNow();
        setStatusMsg(`Auto-backup written to ${res.path}`);
        const fresh = await api.getPreferences();
        setPrefs(fresh);
        onPreferencesChange?.(fresh);
      } else {
        setStatusMsg('Auto-backup schedule saved.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSetAppPin = async () => {
    setError('');
    setStatusMsg('');
    try {
      if (!/^\d{4,8}$/.test(pinNew.trim())) {
        throw new Error('App PIN must be 4 to 8 digits.');
      }
      await api.setAppPin({
        pin: pinNew.trim(),
        currentPin: prefs?.hasAppPin ? pinCurrent.trim() : undefined,
      });
      const next = await api.updatePreferences({
        autoLockMinutes: Math.max(0, Number(pinAutoLockMin) || 0),
      });
      setPrefs(next);
      onPreferencesChange?.(next);
      setPinCurrent('');
      setPinNew('');
      setStatusMsg('App Lock PIN saved.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleClearAppPin = async () => {
    setError('');
    setStatusMsg('');
    try {
      const next = await api.clearAppPin(pinCurrent.trim());
      setPrefs(next);
      onPreferencesChange?.(next);
      setPinCurrent('');
      setPinNew('');
      setStatusMsg('App Lock PIN removed.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSendTest = async () => {
    setError('');
    setStatusMsg('');
    try {
      await api.testWhatsApp(settings?.recipientPhone);
      setStatusMsg('Test WhatsApp message delivered!');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const autostartCmd = 'powershell -ExecutionPolicy Bypass -File scripts\\install-autostart.ps1';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={dict.alerts.title}
      description="Local Linked-Device WhatsApp alerts + 1-click encrypted backup + Windows auto-wakeup."
    >
      <div className="space-y-4">
        <AnimatedTabs
          variant="subtle"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'whatsapp', label: dict.alerts.tabWhatsapp, accentHex: '#059669', icon: <QrCode className="h-3.5 w-3.5" /> },
            {
              id: 'inbox',
              label: dict.alerts.tabInbox,
              accentHex: '#2563eb',
              icon: <Bell className="h-3.5 w-3.5" />,
              badge: alerts.filter((a) => a.channel === 'in_app' && a.status === 'pending').length,
            },
            { id: 'backup', label: dict.alerts.tabBackup, accentHex: '#4f46e5', icon: <Shield className="h-3.5 w-3.5" /> },
          ]}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
        {statusMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {statusMsg}
          </div>
        )}

        {tab === 'whatsapp' && (
          <div className="space-y-4">
            {/* Local Linked-Device QR Bridge Panel */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-slate-900">Local WhatsApp Linked-Device Bridge</h3>
                  <Badge
                    className={
                      bridgeState.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : bridgeState.status === 'qr_ready'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                    }
                  >
                    {bridgeState.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  {bridgeState.status === 'connected'
                    ? `Paired as +${bridgeState.connectedPhone}. Alerts deliver locally while this server runs.`
                    : bridgeState.status === 'qr_ready'
                      ? 'Open WhatsApp on your phone -> Linked Devices -> Link a Device -> Scan QR.'
                      : 'Click Connect & Show QR to pair once. Auth keys stay locally under data/whatsapp-auth/.'}
                </p>
                {bridgeState.lastError && <p className="text-[11px] text-red-600">{bridgeState.lastError}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {bridgeState.status !== 'connected' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        const next = await api.connectWhatsApp();
                        onBridgeStateChange(next);
                      }}
                    >
                      <QrCode className="h-3.5 w-3.5" /> Connect &amp; Show QR
                    </Button>
                  ) : (
                    <>
                      <Button variant="primary" size="sm" onClick={() => void handleSendTest()}>
                        <Send className="h-3.5 w-3.5" /> Send Test Message
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          const next = await api.disconnectWhatsApp();
                          onBridgeStateChange(next);
                        }}
                      >
                        Disconnect
                      </Button>
                    </>
                  )}
                  {(bridgeState.status === 'connected' || bridgeState.status === 'qr_ready') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={async () => {
                        const next = await api.logoutWhatsApp();
                        onBridgeStateChange(next);
                      }}
                    >
                      <Unplug className="h-3.5 w-3.5" /> Unlink Device
                    </Button>
                  )}
                </div>
              </div>

              {bridgeState.qrDataUrl && (
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs">
                  <img
                    src={bridgeState.qrDataUrl}
                    alt="WhatsApp Linked-Device Pairing QR Code"
                    className="h-44 w-44 object-contain"
                  />
                  <div className="mt-1 text-[10px] font-medium text-slate-500">Scan with WhatsApp</div>
                </div>
              )}
            </div>

            {settings && (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <FieldLabel>Recipient Phone (empty = self)</FieldLabel>
                    <Input
                      value={settings.recipientPhone}
                      onChange={(e) => setSettings({ ...settings, recipientPhone: e.target.value })}
                      placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <FieldLabel>Quiet Hours Start (0–23)</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={settings.quietStartHour}
                      onChange={(e) => setSettings({ ...settings, quietStartHour: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Quiet Hours End (0–23)</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={settings.quietEndHour}
                      onChange={(e) => setSettings({ ...settings, quietEndHour: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <FieldLabel>Card Lead Days</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={15}
                      value={settings.leadDaysCreditCard}
                      onChange={(e) => setSettings({ ...settings, leadDaysCreditCard: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Loan Lead Days</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={15}
                      value={settings.leadDaysLoan}
                      onChange={(e) => setSettings({ ...settings, leadDaysLoan: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Dues Lead Days</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={15}
                      value={settings.leadDaysDue}
                      onChange={(e) => setSettings({ ...settings, leadDaysDue: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <FieldLabel>Card Util % Alert</FieldLabel>
                    <Input
                      type="number"
                      min={10}
                      max={100}
                      value={settings.cardUtilizationThresholdPct}
                      onChange={(e) =>
                        setSettings({ ...settings, cardUtilizationThresholdPct: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Vault Rotation (d)</FieldLabel>
                    <Input
                      type="number"
                      min={30}
                      max={730}
                      value={settings.vaultRotationDays}
                      onChange={(e) =>
                        setSettings({ ...settings, vaultRotationDays: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.morningDigestEnabled}
                        onChange={(e) => setSettings({ ...settings, morningDigestEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Bundle non-urgent alerts into one Morning Digest
                    </label>
                    {settings.morningDigestEnabled && (
                      <div className="flex items-center gap-2 text-xs">
                        <span>Send at hour (0–23):</span>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          className="w-20 h-8"
                          value={settings.morningDigestHour}
                          onChange={(e) => setSettings({ ...settings, morningDigestHour: Number(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.twoWayCommandsEnabled}
                        onChange={(e) => setSettings({ ...settings, twoWayCommandsEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Enable 2-Way WhatsApp Assistant (reply to WhatsApp commands from authorized phone)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Try text (&quot;spent 500 lunch&quot;, &quot;what&apos;s wrong?&quot;) or forward payment/bill screenshots
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-800">Per-Module Alert Routing</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(MODULE_LABELS) as AlertModule[]).map((mod) => (
                      <label
                        key={mod}
                        className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-xs cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={settings.enabledModules[mod]}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              enabledModules: { ...settings.enabledModules, [mod]: e.target.checked },
                            })
                          }
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">{MODULE_LABELS[mod].title}</div>
                          <div className="text-[11px] text-slate-500">{MODULE_LABELS[mod].desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => void handleCheckNow()}>
                    <RefreshCw className="h-3.5 w-3.5" /> Evaluate &amp; Send Now
                  </Button>
                  <Button variant="primary" type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Alert Rules'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {tab === 'inbox' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Latest 80 evaluated module alerts across In-App &amp; WhatsApp</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => void handleCheckNow()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Check Now
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await api.markAllAlertsRead();
                    await loadData();
                    onRefresh();
                  }}
                >
                  Mark All Read
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">No alerts recorded yet.</p>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{a.title}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{a.channel}</Badge>
                        <Badge
                          className={
                            a.status === 'sent' || a.status === 'read'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : a.status === 'failed'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                          }
                        >
                          {a.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-slate-600">{a.message}</p>
                    {a.errorText && <p className="mt-0.5 text-[11px] text-red-600">{a.errorText}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'backup' && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">1-Click &amp; Passphrase-Encrypted Backup</h3>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">AES-256-GCM</Badge>
              </div>
              <p className="text-slate-600">
                Includes every bank, credit card, investment, rule, transaction, loan, due, note, and encrypted vault ciphertexts.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href="/api/backup.json"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Plain JSON Backup
                </a>
                <Input
                  type="password"
                  className="w-52 h-8 text-xs"
                  placeholder="Backup passphrase (6+ chars)"
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                />
                <Button variant="primary" size="sm" onClick={() => void handleDownloadEncryptedBackup()}>
                  <Shield className="h-3.5 w-3.5" /> Export Encrypted (.plbackup.json)
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900">{dict.alerts.restoreTitle}</h3>
              <p className="text-slate-600">
                Select a <code className="font-mono-data">.json</code> or encrypted{' '}
                <code className="font-mono-data">.plbackup.json</code> snapshot to restore your ledger &amp; vault.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleSelectBackupFile}
                  className="text-xs file:mr-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-50 cursor-pointer"
                />
              </div>
              {(backupCandidate || encryptedCandidate) && (
                <div className="rounded-lg border border-amber-300 bg-white p-3 space-y-2">
                  <div className="font-medium text-slate-900">
                    Ready to restore <span className="font-mono-data">{backupFileName}</span>{' '}
                    {encryptedCandidate ? '(Encrypted AES-256-GCM — enter passphrase above)' : '(replaces current snapshot)'}:
                  </div>
                  {backupCandidate && (
                    <div className="text-[11px] text-slate-600">
                      {(backupCandidate.accounts as unknown[])?.length ?? 0} accounts ·{' '}
                      {(backupCandidate.transactions as unknown[])?.length ?? 0} transactions ·{' '}
                      {(backupCandidate.loans as unknown[])?.length ?? 0} loans ·{' '}
                      {(backupCandidate.peopleDues as unknown[])?.length ?? 0} dues ·{' '}
                      {(backupCandidate.notes as unknown[])?.length ?? 0} notes
                    </div>
                  )}
                  <Button variant="primary" size="sm" onClick={() => void handleRestoreBackup()} disabled={restoring}>
                    <Upload className="h-3.5 w-3.5" /> {restoring ? dict.common.saving : dict.alerts.restoreBtn}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Daily Local Auto-Backup Folder</h3>
                {prefs?.lastAutoBackupDate && (
                  <span className="text-[11px] text-slate-500">Last run: {prefs.lastAutoBackupDate}</span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Automatically save daily rolling JSON snapshots (keeps last 14 days)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1 min-w-52 h-8 text-xs font-mono-data"
                  placeholder="e.g. ./data/auto-backups or D:\Backups\PersonalLedger"
                  value={autoBackupDir}
                  onChange={(e) => setAutoBackupDir(e.target.value)}
                />
                <Button variant="secondary" size="sm" onClick={() => void handleSaveAutoBackup(false)}>
                  Save Schedule
                </Button>
                <Button variant="primary" size="sm" onClick={() => void handleSaveAutoBackup(true)}>
                  Save &amp; Run Now
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">App Lock PIN &amp; Auto-Lock</h3>
                <Badge
                  className={
                    prefs?.hasAppPin
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }
                >
                  {prefs?.hasAppPin ? 'PIN Active' : 'Unlocked'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {prefs?.hasAppPin && (
                  <div>
                    <FieldLabel>Current PIN</FieldLabel>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Current PIN"
                      value={pinCurrent}
                      onChange={(e) => setPinCurrent(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <FieldLabel>{prefs?.hasAppPin ? 'New PIN (4–8 digits)' : 'Set App PIN (4–8 digits)'}</FieldLabel>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="e.g. 2580"
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Idle Auto-Lock (min, 0=off)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={pinAutoLockMin}
                    onChange={(e) => setPinAutoLockMin(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => void handleSetAppPin()}>
                  {prefs?.hasAppPin ? 'Update PIN' : 'Enable App PIN'}
                </Button>
                {prefs?.hasAppPin && (
                  <Button variant="secondary" size="sm" onClick={() => void handleClearAppPin()}>
                    Remove PIN
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Windows Automatic Wakeup &amp; Background Service</h3>
              <p className="text-slate-600">
                To keep your local server and WhatsApp scheduler starting automatically whenever you log in or wake
                Windows, run this helper command once from your project folder:
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-slate-100 font-mono-data">
                <span className="flex-1 truncate">{autostartCmd}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(autostartCmd);
                    setCopiedPs(true);
                    window.setTimeout(() => setCopiedPs(false), 2000);
                  }}
                  className="text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Copy PowerShell command"
                >
                  {copiedPs ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
