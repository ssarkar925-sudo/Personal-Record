import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  Cloud,
  Command,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  NotebookPen,
  Plus,
  Search,
  WalletCards,
} from 'lucide-react';
import {
  api,
  type AccountRecord,
  type AdvisorBriefing,
  type AppPreferences,
  type DashboardSummary,
  type LoanRecord,
  type NoteRecord,
  type PersonDueRecord,
  type PersonNetSummary,
  type RecurringBillRecord,
  type ScopeBudgetRecord,
  type TransactionRecord,
  type WhatsAppBridgeState,
} from './lib/api.ts';
import { AnimatedTabs, Button, Card, Input, type AnimatedTabItem } from './components/ui/Primitives.tsx';
import { QuickAddModal } from './components/QuickAddModal.tsx';
import { GlobalSearchModal } from './components/GlobalSearchModal.tsx';
import { CommandPalette } from './components/ui/CommandPalette.tsx';
import { InstallPwaPrompt } from './components/ui/InstallPwaPrompt.tsx';
import { LanSyncModal } from './components/ui/LanSyncModal.tsx';
import { CloudSyncModal } from './components/ui/CloudSyncModal.tsx';
import { subscribeToSupabaseRealtime } from './lib/supabase-sync.ts';
import { AgentDrawer } from './components/AgentDrawer.tsx';
import { DashboardView, type WorkspaceId } from './workspaces/DashboardView.tsx';
import { MoneyCardsView } from './workspaces/MoneyCardsView.tsx';
import { LoansDuesView } from './workspaces/LoansDuesView.tsx';
import { ReportsView } from './workspaces/ReportsView.tsx';
import { NotesView } from './workspaces/NotesView.tsx';
import { VaultView } from './workspaces/VaultView.tsx';
import { AlertsSettingsModal } from './workspaces/AlertsSettingsModal.tsx';
import type { Scope } from '../shared/ledger-core.ts';
import { UI_STRINGS } from '../shared/i18n.ts';

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceId>('dashboard');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [lanSyncOpen, setLanSyncOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [queuedAgentCommand, setQueuedAgentCommand] = useState<{ id: number; commandText: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const notify = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const [preferences, setPreferences] = useState<AppPreferences>({
    systemLanguage: 'en',
    agentAutoExecute: true,
    llmProvider: 'local',
    llmModel: '',
    hasApiKey: false,
    hasAppPin: false,
    autoLockMinutes: 0,
    autoBackupEnabled: false,
    autoBackupDir: '',
    lastAutoBackupDate: '',
    updatedAt: '',
  });
  const [privacyMasked, setPrivacyMasked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pl_privacy_masked') === '1';
    } catch {
      return false;
    }
  });
  const [appLocked, setAppLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const bootLockCheckedRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.privacy = privacyMasked ? 'masked' : 'visible';
    try {
      localStorage.setItem('pl_privacy_masked', privacyMasked ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }, [privacyMasked]);

  // Shared state loaded from local SQLite server
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [briefing, setBriefing] = useState<AdvisorBriefing | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBillRecord[]>([]);
  const [budgets, setBudgets] = useState<ScopeBudgetRecord[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [dues, setDues] = useState<PersonDueRecord[]>([]);
  const [dueSummaries, setDueSummaries] = useState<PersonNetSummary[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [bridgeState, setBridgeState] = useState<WhatsAppBridgeState>({
    status: 'disconnected',
    qrDataUrl: null,
    connectedPhone: null,
    lastError: null,
    updatedAt: '',
  });

  const loadAll = useCallback(async () => {
    try {
      setLoadError('');
      const scopeParam = scopeFilter === 'all' ? undefined : scopeFilter;
      const [dash, brf, accs, txs, recs, bgs, lns, duesRes, nts, wa, prefs] = await Promise.all([
        api.getDashboard(scopeParam),
        api.getAgentBriefing(scopeParam),
        api.getAccounts(),
        api.getTransactions({}),
        api.getRecurringBills(),
        api.getBudgets(),
        api.getLoans(),
        api.getDues(),
        api.getNotes(),
        api.getWhatsAppStatus(),
        api.getPreferences(),
      ]);
      setDashboard(dash);
      setBriefing(brf);
      setAccounts(accs);
      setTransactions(txs);
      setRecurringBills(recs);
      setBudgets(bgs);
      setLoans(lns);
      setDues(duesRes.data);
      setDueSummaries(duesRes.summaries);
      setNotes(nts);
      setBridgeState(wa);
      setPreferences(prefs);
      if (!bootLockCheckedRef.current) {
        bootLockCheckedRef.current = true;
        if (prefs.hasAppPin) setAppLocked(true);
      }
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [scopeFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Real-time multi-device cloud synchronization listener
  useEffect(() => {
    const sub = subscribeToSupabaseRealtime(() => {
      void loadAll();
    });
    return () => sub.unsubscribe();
  }, [loadAll]);

  useEffect(() => {
    if (!preferences.hasAppPin || preferences.autoLockMinutes <= 0 || appLocked) return;
    let timer = window.setTimeout(() => setAppLocked(true), preferences.autoLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAppLocked(true), preferences.autoLockMinutes * 60_000);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [preferences.hasAppPin, preferences.autoLockMinutes, appLocked]);

  const handleUnlockApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    try {
      await api.verifyAppPin(pinInput.trim());
      setPinInput('');
      setAppLocked(false);
    } catch (err) {
      setPinError((err as Error).message);
    }
  };

  const handleOpenAgent = useCallback((commandText?: string) => {
    if (commandText) {
      setQueuedAgentCommand({ id: Date.now(), commandText });
    }
    setAgentOpen(true);
  }, []);

  // Global Ctrl+K / Cmd+K (Command Palette), Ctrl+Q (Quick Add), and Ctrl+J (Personal AI Agent) shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQuickAddOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAgentOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSeedDemoData = async () => {
    try {
      notify('Seeding realistic demo financial data...');
      const res = await fetch('/api/system/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to seed data');
      const json = await res.json();
      notify(`Seeded ${json.data.accountsCount} accounts & ${json.data.txCount} transactions!`);
      await loadAll();
    } catch {
      notify('Failed to seed demo data', 'err');
    }
  };

  const handleCleanData = async () => {
    try {
      notify('Resetting database to clean slate...');
      const res = await fetch('/api/system/clean', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to clean data');
      notify('Database cleared to pristine clean slate!');
      await loadAll();
    } catch {
      notify('Failed to clean data', 'err');
    }
  };

  const dict = UI_STRINGS[preferences.systemLanguage];

  const workspaceTabs: AnimatedTabItem<WorkspaceId>[] = [
    {
      id: 'dashboard',
      label: dict.tabs.dashboard,
      accentHex: '#2563eb',
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    },
    {
      id: 'money',
      label: dict.tabs.money,
      accentHex: '#059669',
      icon: <WalletCards className="h-3.5 w-3.5" />,
    },
    {
      id: 'loans_dues',
      label: dict.tabs.loans_dues,
      accentHex: '#d97706',
      icon: <Landmark className="h-3.5 w-3.5" />,
    },
    {
      id: 'reports',
      label: dict.tabs.reports,
      accentHex: '#4f46e5',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
    },
    {
      id: 'notes',
      label: dict.tabs.notes,
      accentHex: '#0f766e',
      icon: <NotebookPen className="h-3.5 w-3.5" />,
    },
    {
      id: 'vault',
      label: dict.tabs.vault,
      accentHex: '#4f46e5',
      icon: <Lock className="h-3.5 w-3.5" />,
    },
  ];

  const monthSpentByScope: Record<Scope, number> = {
    personal: dashboard?.allMonthExpenseByScope?.personal ?? dashboard?.monthByScope.personal.expenseMinor ?? 0,
    business: dashboard?.allMonthExpenseByScope?.business ?? dashboard?.monthByScope.business.expenseMinor ?? 0,
    family: dashboard?.allMonthExpenseByScope?.family ?? dashboard?.monthByScope.family.expenseMinor ?? 0,
  };

  return (
    <div className="min-h-screen flex flex-col canvas-studio text-slate-900">
      {/* Top Studio Command Bar */}
      <header className="sticky top-0 z-30 border-b border-[#d8e1ee] bg-white/88 backdrop-blur-md shadow-[0_6px_20px_-14px_rgba(37,99,235,0.2)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 text-white text-sm font-bold tracking-tight shadow-sm">
                ₹
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-slate-950 leading-none">{dict.appName}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">{dict.scopesSubtitle}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setPrivacyMasked((v) => !v)}
                aria-label={privacyMasked ? 'Show INR amounts' : 'Mask INR amounts'}
                title={privacyMasked ? 'Show amounts' : 'Mask amounts (₹••••)'}
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors cursor-pointer ${
                  privacyMasked
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {privacyMasked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span className="hidden xl:inline">{privacyMasked ? 'Masked' : 'Privacy'}</span>
              </button>

              {preferences.hasAppPin && (
                <button
                  type="button"
                  onClick={() => {
                    setPinError('');
                    setPinInput('');
                    setAppLocked(true);
                  }}
                  aria-label="Lock app now"
                  title="Lock app with PIN"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Command Palette Button (⌘K / Ctrl+K) */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                title="Command Palette (⌘K / Ctrl+K)"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
              >
                <Command className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden md:inline font-medium">Commands</span>
                <kbd className="inline-flex items-center gap-0.5 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-300/60 shadow-2xs">
                  <span className="hidden sm:inline">⌘K / Ctrl+K</span>
                  <span className="sm:hidden">⌘K</span>
                </kbd>
              </button>

              {/* Supabase Cloud & Multi-Device Sync */}
              <button
                type="button"
                onClick={() => setCloudSyncOpen(true)}
                title="Supabase Cloud & Multi-Device Sync"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
              >
                <Cloud className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden lg:inline text-xs font-medium">Cloud Sync</span>
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title="Search records"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                title="Alerts & Notifications"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                <Bell className="h-3.5 w-3.5 text-slate-500" />
                {(dashboard?.unreadInAppCount ?? 0) > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white tabular-nums">
                    {dashboard?.unreadInAppCount}
                  </span>
                )}
              </button>

              <Button
                variant="secondary"
                size="sm"
                className="border-indigo-200 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/70"
                onClick={() => handleOpenAgent()}
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{dict.aiAgent}</span>
                {((briefing?.whatsWrong.length ?? 0) > 0 || (dashboard?.attentionQueue.length ?? 0) > 0) && (
                  <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Advisor attention items" />
                )}
              </Button>

              <Button variant="primary" size="sm" onClick={() => setQuickAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{dict.quickAdd}</span>
                <kbd className="hidden lg:inline-block rounded bg-white/20 px-1 text-[10px] font-normal text-white">
                  Ctrl+Q
                </kbd>
              </Button>
            </div>
          </div>

          {/* Multi-Color Gliding Workspace Tabs */}
          <AnimatedTabs
            variant="primary"
            items={workspaceTabs}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </header>

      {/* Main Content */}
      {!(appLocked && preferences.hasAppPin) && (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-5">
        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            Could not load local data: {loadError}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            data={dashboard}
            briefing={briefing}
            loading={!dashboard}
            systemLanguage={preferences.systemLanguage}
            scopeFilter={scopeFilter}
            onScopeChange={setScopeFilter}
            onNavigate={setActiveTab}
            onOpenQuickAdd={() => setQuickAddOpen(true)}
            onOpenAgent={handleOpenAgent}
            onRefresh={() => void loadAll()}
          />
        )}

        {activeTab === 'money' && (
          <MoneyCardsView
            accounts={accounts}
            transactions={transactions}
            recurringBills={recurringBills}
            budgets={budgets}
            monthSpentByScope={monthSpentByScope}
            systemLanguage={preferences.systemLanguage}
            onNotify={notify}
            onRefresh={() => void loadAll()}
          />
        )}

        {activeTab === 'loans_dues' && (
          <LoansDuesView
            loans={loans}
            dues={dues}
            dueSummaries={dueSummaries}
            accounts={accounts}
            systemLanguage={preferences.systemLanguage}
            onNotify={notify}
            onRefresh={() => void loadAll()}
          />
        )}

        {activeTab === 'reports' && <ReportsView systemLanguage={preferences.systemLanguage} />}

        {activeTab === 'notes' && (
          <NotesView
            notes={notes}
            accounts={accounts}
            transactions={transactions}
            loans={loans}
            dues={dues}
            systemLanguage={preferences.systemLanguage}
            onNotify={notify}
            onNavigate={setActiveTab}
            onRefresh={() => void loadAll()}
          />
        )}

        {activeTab === 'vault' && (
          <VaultView
            accounts={accounts}
            systemLanguage={preferences.systemLanguage}
            onNotify={notify}
            onNavigate={setActiveTab}
          />
        )}
        </main>
      )}

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        accounts={accounts}
        existingCategories={transactions.map((tx) => tx.category)}
        defaultScope={scopeFilter === 'all' ? 'personal' : scopeFilter}
        systemLanguage={preferences.systemLanguage}
        onSaved={() => {
          notify(dict.quickAddModal.saveEntry + ' ✓');
          void loadAll();
        }}
      />

      <AlertsSettingsModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        bridgeState={bridgeState}
        onBridgeStateChange={setBridgeState}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        systemLanguage={preferences.systemLanguage}
        onRefresh={() => void loadAll()}
      />

      {appLocked && preferences.hasAppPin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="App Lock PIN Required"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4"
        >
          <Card className="w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">{dict.appName} Locked</h2>
                <p className="text-xs text-slate-500">Enter your 4–8 digit App PIN to continue.</p>
              </div>
            </div>
            {pinError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {pinError}
              </div>
            )}
            <form onSubmit={handleUnlockApp} className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                required
              />
              <Button variant="primary" type="submit" className="w-full">
                Unlock Ledger
              </Button>
            </form>
          </Card>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-lg no-print animate-panel-in ${
            toast.kind === 'err'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.text}
        </div>
      )}

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        systemLanguage={preferences.systemLanguage}
        onNavigate={(tab) => setActiveTab(tab)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
        onOpenAddBank={() => setActiveTab('money')}
        onOpenAddNote={() => setActiveTab('notes')}
        onLockApp={() => {
          if (preferences.hasAppPin) {
            setPinError('');
            setPinInput('');
            setAppLocked(true);
          } else {
            notify('Set an App PIN in settings to lock ledger', 'err');
          }
        }}
        onLockVault={() => {
          setActiveTab('vault');
          notify('Switched to Password Vault');
        }}
        onExportCaPack={() => {
          window.open('/api/reports/tax-pack/export.csv', '_blank');
          notify('Exporting CA Tax Pack CSV...');
        }}
        onNavigateBillboard={() => {
          setActiveTab('dashboard');
          setTimeout(() => {
            document.getElementById('advisor-billboard')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }}
        onOpenLanSync={() => setLanSyncOpen(true)}
        onOpenCloudSync={() => setCloudSyncOpen(true)}
        onSeedData={handleSeedDemoData}
        onCleanData={handleCleanData}
      />

      <AgentDrawer
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        queuedCommand={queuedAgentCommand}
        onConsumedQueuedCommand={() => setQueuedAgentCommand(null)}
        onApplyUiEffects={(effects) => {
          if (effects.setLanguage) {
            setPreferences((p) => ({ ...p, systemLanguage: effects.setLanguage! }));
          }
          if (effects.navigateTab) setActiveTab(effects.navigateTab);
          if (effects.scopeFilter) setScopeFilter(effects.scopeFilter);
          if (effects.mutatedData || effects.setLanguage) void loadAll();
        }}
      />

      <InstallPwaPrompt />
      <LanSyncModal
        open={lanSyncOpen}
        onClose={() => setLanSyncOpen(false)}
        onSyncComplete={loadAll}
      />
      <CloudSyncModal
        open={cloudSyncOpen}
        onClose={() => setCloudSyncOpen(false)}
        onDataRefreshed={loadAll}
        notify={notify}
      />
    </div>
  );
}

export default App;
