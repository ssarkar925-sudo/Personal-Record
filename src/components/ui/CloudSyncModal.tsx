import { useEffect, useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  LogOut,
  LogIn,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button, Input, Modal } from './Primitives.tsx';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentUser,
  type User,
} from '../../lib/supabase.ts';
import { pushLocalDataToSupabase } from '../../lib/supabase-sync.ts';
import { clientDb } from '../../lib/client-db.ts';

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  onDataRefreshed?: () => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
}

export function CloudSyncModal({ open, onClose, onDataRefreshed, notify }: CloudSyncModalProps) {
  const [config, setConfig] = useState(getSupabaseConfig());
  const [urlInput, setUrlInput] = useState(config.url);
  const [anonKeyInput, setAnonKeyInput] = useState(config.anonKey);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [testing, setTesting] = useState(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const cfg = getSupabaseConfig();
      setConfig(cfg);
      setUrlInput(cfg.url);
      setAnonKeyInput(cfg.anonKey);
      if (cfg.isConfigured) {
        void checkConnection();
        void checkUser();
      }
    }
  }, [open]);

  const checkConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSupabaseConnection();
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const checkUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  };

  const handleSaveConfig = () => {
    setSupabaseConfig(urlInput, anonKeyInput);
    const updated = getSupabaseConfig();
    setConfig(updated);
    notify?.('Supabase configuration saved!', 'ok');
    void checkConnection();
    void checkUser();
  };

  const handleClearConfig = () => {
    clearSupabaseConfig();
    const updated = getSupabaseConfig();
    setConfig(updated);
    setUrlInput('');
    setAnonKeyInput('');
    setTestResult(null);
    setCurrentUser(null);
    notify?.('Supabase configuration reset.', 'ok');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        const res = await signUpWithEmail(authEmail.trim(), authPassword);
        if (res.user && !res.session) {
          notify?.('Confirmation link sent! Please check your email inbox.', 'ok');
        } else {
          notify?.('Signed up successfully!', 'ok');
          setCurrentUser(res.user);
        }
      } else {
        const res = await signInWithEmail(authEmail.trim(), authPassword);
        notify?.(`Welcome back, ${res.user.email}!`, 'ok');
        setCurrentUser(res.user);
      }
      setAuthPassword('');
    } catch (err) {
      setAuthError((err as Error).message);
      notify?.((err as Error).message, 'err');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setCurrentUser(null);
      notify?.('Signed out from Supabase.', 'ok');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    }
  };

  const handlePushData = async () => {
    setSyncing(true);
    setSyncSummary(null);
    try {
      const res = await pushLocalDataToSupabase();
      const summary = `Uploaded: ${res.accountsCount} accounts, ${res.transactionsCount} transactions, ${res.loansCount} loans, ${res.duesCount} dues, ${res.notesCount} notes.`;
      setSyncSummary(summary);
      notify?.('Local financial data synced to Supabase!', 'ok');
      onDataRefreshed?.();
    } catch (err) {
      setSyncSummary(`Error: ${(err as Error).message}`);
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  const handlePullData = async () => {
    setSyncing(true);
    setSyncSummary(null);
    try {
      const res = await clientDb.pullDataFromSupabase();
      const summary = `Downloaded ${res.count} items from Supabase cloud into this device.`;
      setSyncSummary(summary);
      notify?.('Pulled cloud financial records into local device!', 'ok');
      onDataRefreshed?.();
    } catch (err) {
      setSyncSummary(`Error: ${(err as Error).message}`);
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Supabase Cloud & Multi-Device Sync"
      description="Connect your cloud PostgreSQL database for automatic cross-device sync (iPhone, Android, Mac, Windows) and cloud durability."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* Connection Status Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              config.isConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">
                  {config.isConfigured ? 'Supabase Configured' : 'Supabase Not Configured'}
                </span>
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                  testResult?.ok
                    ? 'bg-emerald-100 text-emerald-800'
                    : config.isConfigured
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                }`}>
                  {testResult?.ok ? `${testResult.latencyMs}ms Live` : config.isConfigured ? 'Configured' : 'Local Only'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {testResult?.message || (config.isConfigured ? 'Ready to verify database connection' : 'Provide your Supabase URL & Anon Key below')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {config.isConfigured && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void checkConnection()}
                disabled={testing}
                className="gap-1.5 cursor-pointer text-xs"
              >
                <RefreshCw className={`h-3 w-3 ${testing ? 'animate-spin' : ''}`} />
                Test Ping
              </Button>
            )}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Supabase Console
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Database Configuration Section */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Database className="h-4 w-4 text-blue-600" />
              <span>Project Credentials</span>
            </div>
            {config.isConfigured && (
              <button
                type="button"
                onClick={handleClearConfig}
                className="text-[11px] text-red-600 hover:text-red-700 font-medium cursor-pointer"
              >
                Reset Credentials
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Supabase Project URL
              </label>
              <Input
                placeholder="https://xyzcompany.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Anon Public Key
              </label>
              <Input
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                type="password"
                value={anonKeyInput}
                onChange={(e) => setAnonKeyInput(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveConfig}
              disabled={!urlInput.trim() || !anonKeyInput.trim()}
              className="cursor-pointer"
            >
              Save Credentials
            </Button>
          </div>
        </div>

        {/* Authentication Section */}
        {config.isConfigured && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                <span>Cloud User Account</span>
              </div>
              {currentUser && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Authenticated
                </span>
              )}
            </div>

            {currentUser ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 rounded-lg p-3 border border-slate-200/80">
                <div>
                  <p className="font-semibold text-slate-900">{currentUser.email}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">UID: {currentUser.id}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSignOut()}
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('signin')}
                    className={`font-semibold pb-1 cursor-pointer transition-colors ${
                      authMode === 'signin'
                        ? 'text-blue-600 border-b-2 border-blue-600 -mb-2'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Sign In
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className={`font-semibold pb-1 cursor-pointer transition-colors ${
                      authMode === 'signup'
                        ? 'text-blue-600 border-b-2 border-blue-600 -mb-2'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {authError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-700 border border-red-200">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      required
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Password
                    </label>
                    <Input
                      type="password"
                      placeholder="••••••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      required
                      minLength={6}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={authLoading}
                    className="gap-1.5 cursor-pointer"
                  >
                    {authLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogIn className="h-3.5 w-3.5" />
                    )}
                    {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Data Sync & Push Section */}
        {config.isConfigured && currentUser && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                <span>Cloud Sync & Initial Migration</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                <Zap className="h-3 w-3 text-emerald-600" />
                Real-Time Replication Ready
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Upload your existing local SQLite ledger to Supabase PostgreSQL. Once uploaded, any changes made from your phone, laptop, or tablet sync immediately via Row-Level Security.
            </p>

            {syncSummary && (
              <div className={`p-2.5 rounded-lg text-[11px] border ${
                syncSummary.startsWith('Error')
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {syncSummary}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handlePullData()}
                disabled={syncing}
                className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <DownloadCloud className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Pull Cloud Data to Device'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handlePushData()}
                disabled={syncing}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing to Cloud...' : 'Upload Local Data to Supabase'}
              </Button>
            </div>
          </div>
        )}

        {/* Multi-Device Setup Quick Checklist */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-2">
          <h4 className="font-semibold text-slate-800 text-[11px] flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            Quick 3-Step Setup for Cloudflare Pages & Multi-Device
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 leading-normal pl-0.5">
            <li>
              <span className="font-medium text-slate-900">Run SQL Schema:</span> Open your Supabase Dashboard &gt; SQL Editor, copy and paste the contents of <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-800">supabase_schema.sql</code>, and click <strong>Run</strong>.
            </li>
            <li>
              <span className="font-medium text-slate-900">Deploy to Cloudflare Pages:</span> Push this repo to GitHub, link to Cloudflare Pages with build command <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-800">npm run build</code> and output dir <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-800">dist</code>. Set your <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-800">VITE_SUPABASE_URL</code> and <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-800">VITE_SUPABASE_ANON_KEY</code>.
            </li>
            <li>
              <span className="font-medium text-slate-900">Access Anywhere:</span> Open your Cloudflare Pages URL on your iPhone, iPad, or Android phone, sign in with your email, and add it to your Home Screen (PWA) for native-feel instant financial tracking.
            </li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}
