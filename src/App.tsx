import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  Command,
  CreditCard,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  LogIn,
  NotebookPen,
  Plus,
  Search,
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
import { Button, Card, Input } from './components/ui/Primitives.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx';
import {
  FloatingCommandDock,
  type DockWorkspaceItem,
} from './components/ui/FloatingCommandDock.tsx';
import { QuickAddModal } from './components/QuickAddModal.tsx';
import { GlobalSearchModal } from './components/GlobalSearchModal.tsx';
import { CommandPalette } from './components/ui/CommandPalette.tsx';
import { InstallPwaPrompt } from './components/ui/InstallPwaPrompt.tsx';
import { LanSyncModal } from './components/ui/LanSyncModal.tsx';
import { CloudSyncModal } from './components/ui/CloudSyncModal.tsx';
import { AuthModal } from './workspaces/AuthModal.tsx';
import { AuthScreen } from './workspaces/AuthScreen.tsx';
import { subscribeToSupabaseRealtime } from './lib/supabase-sync.ts';
import type { User } from './lib/supabase.ts';
import { AgentDrawer } from './components/AgentDrawer.tsx';
import { DashboardView, type WorkspaceId } from './workspaces/DashboardView.tsx';
import { AlertsSettingsModal } from './workspaces/AlertsSettingsModal.tsx';
import { AppLogo } from './components/ui/AppLogo.tsx';
import { checkForAppUpdate, triggerApkDownload, type UpdateCheckResult } from './lib/auto-updater.ts';
import { SCOPE_META } from './lib/format.ts';
import type { Scope } from '../shared/ledger-core.ts';
import { UI_STRINGS } from '../shared/i18n.ts';

const CardsView = lazy(() => import('./workspaces/CardsView.tsx').then((m) => ({ default: m.CardsView })));
const MoneyCardsView = lazy(() =>
  import('./workspaces/MoneyCardsView.tsx').then((m) => ({ default: m.MoneyCardsView })),
);
const LoansDuesView = lazy(() =>
  import('./workspaces/LoansDuesView.tsx').then((m) => ({ default: m.LoansDuesView })),
);
const ReportsView = lazy(() => import('./workspaces/ReportsView.tsx').then((m) => ({ default: m.ReportsView })));
const NotesView = lazy(() => import('./workspaces/NotesView.tsx').then((m) => ({ default: m.NotesView })));
const JobSheetsView = lazy(() =>
  import('./workspaces/JobSheetsView.tsx').then((m) => ({ default: m.JobSheetsView })),
);
const VaultView = lazy(() => import('./workspaces/VaultView.tsx').then((m) => ({ default: m.VaultView })));

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceId>('dashboard');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>('all');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [lanSyncOpen, setLanSyncOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
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
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    void checkForAppUpdate().then((res) => {
      if (res.hasUpdate) setUpdateInfo(res);
    });
  }, []);

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

  const resetAllState = useCallback(() => {
    setDashboard(null);
    setBriefing(null);
    setAccounts([]);
    setTransactions([]);
    setRecurringBills([]);
    setBudgets([]);
    setLoans([]);
    setDues([]);
    setDueSummaries([]);
    setNotes([]);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const { getCurrentUser } = await import('./lib/supabase.ts');
      const user = await getCurrentUser();
      if (!user) {
        resetAllState();
        return;
      }

      setLoadError('');
      const [lockStatus, prefs] = await Promise.all([api.getAppLockStatus(), api.getPreferences()]);
      setPreferences(prefs);
      if (lockStatus.hasAppPin && !lockStatus.unlocked) {
        setAppLocked(true);
        return;
      }
      setAppLocked(false);

      const scopeParam = scopeFilter === 'all' ? undefined : scopeFilter;
      const [dash, brf, accs, txs, recs, bgs, lns, duesRes, nts, wa] = await Promise.all([
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
    } catch (err) {
      console.warn('Initial load failed, falling back to local client storage', err);
      try {
        const { getCurrentUser } = await import('./lib/supabase.ts');
        const user = await getCurrentUser();
        if (!user) {
          resetAllState();
          return;
        }

        const { clientDb } = await import('./lib/client-db.ts');
        const scopeParam = scopeFilter === 'all' ? undefined : scopeFilter;
        setDashboard(clientDb.getDashboard(scopeParam));
        setBriefing(clientDb.getAgentBriefing(scopeParam));
        setAccounts(clientDb.getAccounts());
        setTransactions(clientDb.getTransactions({}));
        setRecurringBills(clientDb.getRecurringBills());
        setBudgets(clientDb.getBudgets());
        setLoans(clientDb.getLoans());
        const duesRes = clientDb.getDues();
        setDues(duesRes.data);
        setDueSummaries(duesRes.summaries);
        setNotes(clientDb.getNotes());
        setBridgeState(clientDb.getWhatsAppStatus());
        setLoadError('');
      } catch (innerErr) {
        console.error('Fatal client load error, resetting storage to clean state:', innerErr);
        try {
          const { clientDb } = await import('./lib/client-db.ts');
          clientDb.resetToCleanSlate();
          resetAllState();
          setLoadError('');
        } catch {
          setLoadError('Initializing ledger storage. Please tap to retry.');
        }
      }
    }
  }, [scopeFilter, resetAllState]);

  // Real-time multi-device cloud synchronization listener & initial cloud hydration
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    let authSub: { unsubscribe: () => void } | null = null;
    let isMounted = true;

    void (async () => {
      try {
        const { ensureSupabaseSession, onAuthStateChange } = await import('./lib/supabase.ts');
        const user = await ensureSupabaseSession();
        if (!isMounted) return;
        setCurrentUser(user);
        setAuthChecking(false);

        if (user) {
          const { clientDb } = await import('./lib/client-db.ts');
          await clientDb.pullDataFromSupabase({ force: true }).catch(() => {});
          void loadAll();
        } else {
          const { clientDb } = await import('./lib/client-db.ts');
          clientDb.resetToCleanSlate();
          resetAllState();
        }

        authSub = onAuthStateChange(async (event, session) => {
          if (!isMounted) return;
          const nextUser = session?.user ?? null;
          setCurrentUser(nextUser);
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
            if (nextUser) {
              const { clientDb } = await import('./lib/client-db.ts');
              await clientDb.pullDataFromSupabase({ force: true }).catch(() => {});
              void loadAll();
            }
          } else if (event === 'SIGNED_OUT') {
            setCurrentUser(null);
            const { clientDb } = await import('./lib/client-db.ts');
            clientDb.resetToCleanSlate();
            resetAllState();
          }
        });
      } catch (e) {
        console.warn('Initial session check notice:', e);
        if (isMounted) {
          setCurrentUser(null);
          setAuthChecking(false);
          resetAllState();
        }
      }

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      sub = subscribeToSupabaseRealtime(() => {
        if (!isMounted) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const { clientDb } = await import('./lib/client-db.ts');
            await clientDb.pullDataFromSupabase({ force: true });
          } catch (e) {
            console.warn('Realtime cloud pull failed:', e);
          }
          void loadAll();
        }, 350);
      });
    })();

    return () => {
      isMounted = false;
      sub?.unsubscribe();
      authSub?.unsubscribe();
    };
  }, [loadAll, resetAllState]);

  const triggerServerLock = useCallback(() => {
    void api.lockApp().catch(() => {});
    setAppLocked(true);
  }, []);

  useEffect(() => {
    if (!preferences.hasAppPin || preferences.autoLockMinutes <= 0 || appLocked) return;
    let timer = window.setTimeout(triggerServerLock, preferences.autoLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(triggerServerLock, preferences.autoLockMinutes * 60_000);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [preferences.hasAppPin, preferences.autoLockMinutes, appLocked, triggerServerLock]);

  const handleUnlockApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    try {
      await api.verifyAppPin(pinInput.trim());
      setPinInput('');
      setAppLocked(false);
      void loadAll();
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
      try {
        const res = await fetch('/api/system/seed', { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          notify(`Seeded ${json.data?.accountsCount ?? 0} accounts!`);
          await loadAll();
          return;
        }
      } catch {}
      notify('Demo seeding requires local server mode', 'err');
    } catch {
      notify('Failed to seed demo data', 'err');
    }
  };

  const handleCleanData = async () => {
    try {
      notify('Resetting database to clean slate...');
      const { dbFirstCleanSlate } = await import('./lib/database-first.ts');
      await dbFirstCleanSlate();
      try {
        await fetch('/api/system/clean', { method: 'POST' });
      } catch {}
      notify('Database cleared to pristine clean slate!');
      await loadAll();
    } catch {
      notify('Failed to clean data', 'err');
    }
  };

  const dict = UI_STRINGS[preferences.systemLanguage];

  // Exact bottom bar arrangement: Dashboard, Credit Cards, Bank & Cash, Notes, Loans & Dues, Reports, Vault
  const dockItems: DockWorkspaceItem[] = [
    {
      id: 'dashboard',
      label: dict.tabs.dashboard,
      shortLabel: 'Home',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: 'cards',
      label: dict.tabs.cards,
      shortLabel: 'Cards',
      icon: <CreditCard className="h-4 w-4" />,
      badge: dashboard?.cards.length || undefined,
    },
    {
      id: 'money',
      label: dict.tabs.money,
      shortLabel: 'Banks',
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      id: 'notes',
      label: dict.tabs.notes,
      shortLabel: 'Notes',
      icon: <NotebookPen className="h-4 w-4" />,
    },
    {
      id: 'sheets',
      label: 'Job Sheets',
      shortLabel: 'Sheets',
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      id: 'loans_dues',
      label: dict.tabs.loans_dues,
      shortLabel: 'Loans',
      icon: <Landmark className="h-4 w-4" />,
    },
    {
      id: 'reports',
      label: dict.tabs.reports,
      shortLabel: 'Reports',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'vault',
      label: dict.tabs.vault,
      shortLabel: 'Vault',
      icon: <Lock className="h-4 w-4" />,
    },
  ];

  const scopePillOptions = [
    ['all', dict.scopes.all],
    ['business', dict.scopes.business],
    ['personal', dict.scopes.personal],
    ['family', dict.scopes.family],
  ] as const;

  const monthSpentByScope: Record<Scope, number> = {
    personal: dashboard?.allMonthExpenseByScope?.personal ?? dashboard?.monthByScope.personal.expenseMinor ?? 0,
    business: dashboard?.allMonthExpenseByScope?.business ?? dashboard?.monthByScope.business.expenseMinor ?? 0,
    family: dashboard?.allMonthExpenseByScope?.family ?? dashboard?.monthByScope.family.expenseMinor ?? 0,
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0E1015] flex flex-col items-center justify-center p-4 text-white">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden border border-[#C59B27]/60 shadow-[0_0_25px_rgba(197,155,39,0.35)] animate-pulse mb-4">
          <AppLogo size={56} className="h-full w-full object-contain" />
        </div>
        <div className="font-display text-lg font-bold text-[#E5C158] tracking-wider">
          PERSONAL LEDGER
        </div>
        <div className="text-xs text-slate-400 font-mono-data mt-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#E5C158] animate-ping" />
          Verifying Sovereign Security Session...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          void loadAll();
        }}
        systemLanguage={preferences.systemLanguage}
        onLanguageChange={(lang) => setPreferences((prev) => ({ ...prev, systemLanguage: lang }))}
        notify={notify}
      />
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col canvas-studio text-[#111318]">
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Editorial Sovereign Top Command Bar */}
        <header className="sticky top-0 z-30 border-b border-[#EAE5DC] bg-[#FAF8F5]/92 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex h-15 sm:h-16 items-center justify-between gap-2 sm:gap-3">
              {/* Brand Crest & Editorial Wordmark */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#C59B27]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_8px_rgba(17,19,24,0.25)] cursor-pointer transition-transform duration-150 active:scale-95"
                  title="Personal Ledger Sovereign Crest - Return to Executive Dashboard"
                >
                  <AppLogo size={36} className="h-full w-full object-contain" />
                </button>
                <div className="min-w-0">
                  <div className="font-display text-sm sm:text-base font-bold tracking-tight text-[#111318] leading-none whitespace-nowrap truncate">
                    {dict.appName}
                  </div>
                  <div className="text-[11px] text-[#858078] font-mono-data mt-0.5 hidden sm:block truncate">
                    PRIVATE WEALTH &amp; SOVEREIGN LEDGER
                  </div>
                </div>
              </div>

              {/* Center Recessed Stone Scope Segmented Control (Wide Desktop) */}
              <div
                role="group"
                aria-label="Global Scope Filter"
                className="hidden xl:inline-flex items-center rounded-xl bg-[#F3EFEA] p-1 border border-[#EAE5DC]"
              >
                {scopePillOptions.map(([id, label]) => {
                  const active = scopeFilter === id;
                  const dotColor =
                    id === 'all' ? 'bg-[#C59B27]' : SCOPE_META[id].dotClass;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setScopeFilter(id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                          : 'text-[#52504C] hover:text-[#111318]'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          active ? 'bg-[#E5C158]' : dotColor
                        }`}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right Utility & Action Controls */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPrivacyMasked((v) => !v)}
                  aria-label={privacyMasked ? 'Show INR amounts' : 'Mask INR amounts'}
                  title={privacyMasked ? 'Show amounts' : 'Mask amounts (₹••••)'}
                  className={`inline-flex h-9 min-w-9 sm:h-8 sm:min-w-8 items-center justify-center gap-1.5 rounded-xl border px-2 sm:px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                    privacyMasked
                      ? 'border-[#C59B27] bg-[#111318] text-[#E5C158]'
                      : 'border-[#EAE5DC] bg-white text-[#52504C] hover:bg-[#F3EFEA] hover:text-[#111318]'
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
                      triggerServerLock();
                    }}
                    aria-label="Lock app now"
                    title="Lock app with PIN"
                    className="inline-flex h-9 min-w-9 sm:h-8 sm:min-w-8 items-center justify-center gap-1 rounded-xl border border-[#EAE5DC] bg-white px-2 sm:px-2.5 text-xs font-medium text-[#52504C] hover:bg-[#F3EFEA] hover:text-[#111318] cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Command Palette Button (⌘K / Ctrl+K) */}
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  title="Command Palette (⌘K / Ctrl+K)"
                  aria-label="Command Palette"
                  className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#EAE5DC] bg-white px-2 sm:px-2.5 text-xs font-medium text-[#111318] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                >
                  <Command className="h-3.5 w-3.5 text-[#858078]" />
                  <span className="hidden md:inline font-medium">Commands</span>
                  <kbd className="hidden sm:inline-flex items-center rounded bg-[#F3EFEA] px-1.5 py-0.5 text-[10px] font-mono-data font-semibold text-[#52504C] border border-[#D6CFC2]">
                    ⌘K
                  </kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  title="Search records"
                  aria-label="Search records"
                  className="inline-flex h-9 min-w-9 sm:h-8 sm:min-w-8 items-center justify-center gap-1 rounded-xl border border-[#EAE5DC] bg-white px-2 sm:px-2.5 text-xs font-medium text-[#52504C] hover:bg-[#F3EFEA] hover:text-[#111318] cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setAlertsOpen(true)}
                  title="Alerts & Notifications"
                  aria-label="Alerts & Notifications"
                  className="inline-flex h-9 min-w-9 sm:h-8 sm:min-w-8 items-center justify-center gap-1 rounded-xl border border-[#EAE5DC] bg-white px-2 sm:px-2.5 text-xs font-medium text-[#52504C] hover:bg-[#F3EFEA] hover:text-[#111318] cursor-pointer"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {(dashboard?.unreadInAppCount ?? 0) > 0 && (
                    <span className="rounded-full bg-[#111318] px-1.5 text-[10px] font-mono-data font-semibold text-[#E5C158] tabular-nums">
                      {dashboard?.unreadInAppCount}
                    </span>
                  )}
                </button>

                {/* Dedicated Sovereign Account / Realtime Sync Button */}
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(true)}
                    title={`Sovereign Account: ${currentUser.email} • Realtime Cloud Sync Active`}
                    className="inline-flex h-9 sm:h-8 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/90 px-2 sm:px-2.5 text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-100 transition-all cursor-pointer"
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="max-w-[100px] sm:max-w-[140px] truncate font-mono-data text-[11px]">
                      {currentUser.email}
                    </span>
                  </button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-9 sm:h-8 border-[#C59B27]/40 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] px-2.5 sm:px-3 font-bold text-xs"
                    onClick={() => setAuthModalOpen(true)}
                    title="Sign into Sovereign Account to sync across mobile and web"
                  >
                    <LogIn className="h-3.5 w-3.5 text-[#E5C158]" />
                    <span className="hidden sm:inline">Sign In to Sync</span>
                    <span className="sm:hidden">Sign In</span>
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 sm:h-8 border-[#D6CFC2] bg-[#F3EFEA] text-[#111318] hover:bg-[#EAE5DC] px-2.5 sm:px-3"
                  onClick={() => handleOpenAgent()}
                >
                  <Bot className="h-3.5 w-3.5 text-[#C59B27]" />
                  <span className="hidden sm:inline">{dict.aiAgent}</span>
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  className="hidden sm:inline-flex h-8 px-3.5"
                  onClick={() => setQuickAddOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 text-[#E5C158]" />
                  <span>{dict.quickAdd}</span>
                </Button>
              </div>
            </div>

            {/* Mobile & Tablet Top Bar Scope Strip (Always Visible on < xl) */}
            <div
              role="group"
              aria-label="Mobile Global Scope Filter"
              className="xl:hidden flex items-center justify-between gap-1 pb-2.5 pt-0.5 overflow-x-auto no-scrollbar"
            >
              <div className="inline-flex w-full items-center rounded-xl bg-[#F3EFEA] p-1 border border-[#EAE5DC]">
                {scopePillOptions.map(([id, label]) => {
                  const active = scopeFilter === id;
                  const dotColor =
                    id === 'all' ? 'bg-[#C59B27]' : SCOPE_META[id].dotClass;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setScopeFilter(id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                          : 'text-[#52504C] hover:text-[#111318]'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          active ? 'bg-[#E5C158]' : dotColor
                        }`}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        {/* In-App Auto-Update Notification Banner */}
        {updateInfo?.hasUpdate && (
          <div className="sticky top-15 sm:top-16 z-25 border-b border-[#C59B27]/40 bg-gradient-to-r from-[#1B1E26] via-[#2A2312] to-[#1B1E26] px-4 py-2.5 text-xs text-[#FDE68A] shadow-md">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-0 sm:px-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E5C158] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E5C158]" />
                </span>
                <span className="font-semibold text-white shrink-0">Android Update v{updateInfo.latestVersion}:</span>
                <span className="truncate text-slate-300">{updateInfo.changelog}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => triggerApkDownload(updateInfo.apkUrl)}
                  className="rounded-lg bg-[#C59B27] px-3 py-1 font-mono-data text-[11px] font-bold text-[#111318] shadow hover:bg-[#D97706] active:scale-95 transition-all cursor-pointer"
                >
                  Download &amp; Install APK
                </button>
                <button
                  type="button"
                  onClick={() => setUpdateInfo(null)}
                  className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                  title="Dismiss update notice"
                  aria-label="Dismiss update banner"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Canvas (padded at bottom for Floating Glass Command Dock) */}
        {!(appLocked && preferences.hasAppPin) && (
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-28">
            {loadError && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <span>{loadError}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs bg-white text-slate-800 border-amber-300 hover:bg-amber-100/50"
                  onClick={() => {
                    setLoadError('');
                    void loadAll();
                  }}
                >
                  Retry Loading
                </Button>
              </div>
            )}

            <ErrorBoundary resetKey={activeTab}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20 text-xs font-medium text-[#858078]">
                    Loading workspace...
                  </div>
                }
              >
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

                {activeTab === 'cards' && (
                  <CardsView
                    accounts={accounts}
                    transactions={transactions}
                    recurringBills={recurringBills}
                    budgets={budgets}
                    monthSpentByScope={monthSpentByScope}
                    systemLanguage={preferences.systemLanguage}
                    globalScopeFilter={scopeFilter}
                    onGlobalScopeChange={setScopeFilter}
                    onNotify={notify}
                    onRefresh={() => void loadAll()}
                    onNavigateToMoney={() => setActiveTab('money')}
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
                    globalScopeFilter={scopeFilter}
                    onGlobalScopeChange={setScopeFilter}
                    onNotify={notify}
                    onRefresh={() => void loadAll()}
                    onNavigateToCards={() => setActiveTab('cards')}
                  />
                )}

                {activeTab === 'loans_dues' && (
                  <LoansDuesView
                    loans={loans}
                    dues={dues}
                    dueSummaries={dueSummaries}
                    accounts={accounts}
                    globalScopeFilter={scopeFilter}
                    systemLanguage={preferences.systemLanguage}
                    onNotify={notify}
                    onRefresh={() => void loadAll()}
                  />
                )}

                {activeTab === 'reports' && (
                  <ReportsView
                    systemLanguage={preferences.systemLanguage}
                    globalScopeFilter={scopeFilter}
                  />
                )}

                {activeTab === 'notes' && (
                  <NotesView
                    notes={notes}
                    accounts={accounts}
                    transactions={transactions}
                    loans={loans}
                    dues={dues}
                    globalScopeFilter={scopeFilter}
                    systemLanguage={preferences.systemLanguage}
                    onNotify={notify}
                    onNavigate={setActiveTab}
                    onRefresh={() => void loadAll()}
                  />
                )}

                {activeTab === 'sheets' && (
                  <JobSheetsView
                    globalScopeFilter={scopeFilter}
                    onNotify={notify}
                  />
                )}

                {activeTab === 'vault' && (
                  <VaultView
                    accounts={accounts}
                    systemLanguage={preferences.systemLanguage}
                    onNotify={notify}
                    onNavigate={setActiveTab}
                    onOpenCloudSync={() => setCloudSyncOpen(true)}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
          </main>
        )}

        {/* Bottom Floating Glass Command Dock */}
        {!(appLocked && preferences.hasAppPin) && (
          <FloatingCommandDock
            items={dockItems}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onQuickAdd={() => setQuickAddOpen(true)}
            quickAddLabel={dict.quickAdd}
          />
        )}

        <QuickAddModal
          open={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          accounts={accounts}
          existingCategories={transactions.map((tx) => tx.category)}
          defaultScope={scopeFilter === 'all' ? 'business' : scopeFilter}
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
          onOpenCloudSync={() => setCloudSyncOpen(true)}
          onOpenAuthModal={() => setAuthModalOpen(true)}
        />

        {appLocked && preferences.hasAppPin && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="App Lock PIN Required"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#111318]/75 p-4"
          >
            <Card className="w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 overflow-hidden rounded-xl border border-[#C59B27]/40 shadow-md">
                  <AppLogo size={42} className="h-10.5 w-10.5 object-contain" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-[#111318]">{dict.appName} Locked</h2>
                  <p className="text-xs text-[#52504C]">Enter your 4–8 digit App PIN to continue.</p>
                </div>
              </div>
              {pinError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
            className={`fixed bottom-20 right-4 z-[60] max-w-sm rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-lg no-print animate-panel-in ${
              toast.kind === 'err'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
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
            window.open('/api/reports/tax-pack/export.csv', '_blank', 'noopener,noreferrer');
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
          onOpenAuthModal={() => setAuthModalOpen(true)}
          notify={notify}
        />
        <AuthModal
          open={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          currentUser={currentUser}
          onUserChange={(u) => {
            setCurrentUser(u);
            void loadAll();
          }}
          onDataRefreshed={loadAll}
          notify={notify}
        />
      </div>
    </div>
  );
}

export default App;
