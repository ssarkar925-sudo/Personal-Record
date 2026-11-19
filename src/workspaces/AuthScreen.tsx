import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button, FieldLabel, Input } from '../components/ui/Primitives.tsx';
import { AppLogo } from '../components/ui/AppLogo.tsx';
import { signInWithEmail, signUpWithEmail, type User } from '../lib/supabase.ts';
import { clientDb } from '../lib/client-db.ts';
import { pushLocalDataToSupabase } from '../lib/supabase-sync.ts';
import { APP_LANGUAGES, LANGUAGE_META, type AppLanguage, UI_STRINGS } from '../../shared/i18n.ts';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
  systemLanguage?: AppLanguage;
  onLanguageChange?: (lang: AppLanguage) => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
}

export function AuthScreen({
  onLoginSuccess,
  systemLanguage = 'en',
  onLanguageChange,
  notify,
}: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const dict = UI_STRINGS[systemLanguage] || UI_STRINGS.en;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      if (authMode === 'signup') {
        const res = await signUpWithEmail(cleanEmail, password);
        if (res.user) {
          setSuccessMsg(`Account created! Welcome, ${cleanEmail}. Connecting ledger...`);
          notify?.(`Account created! Welcome, ${cleanEmail}.`, 'ok');
          await handlePostAuthSync();
          onLoginSuccess(res.user);
        }
      } else {
        const res = await signInWithEmail(cleanEmail, password);
        if (res.user) {
          setSuccessMsg(`Welcome back, ${res.user.email}! Syncing your records...`);
          notify?.(`Signed in as ${res.user.email}!`, 'ok');
          await handlePostAuthSync();
          onLoginSuccess(res.user);
        }
      }
      setPassword('');
    } catch (err) {
      const msg = (err as Error).message || 'Authentication failed.';
      setErrorMsg(msg);
      notify?.(msg, 'err');
    } finally {
      setLoading(false);
    }
  };

  const handlePostAuthSync = async () => {
    try {
      const pullRes = await clientDb.pullDataFromSupabase({ force: true });
      const currentLocal = clientDb.load();
      if (pullRes.count === 0 && currentLocal.accounts.length > 0) {
        await pushLocalDataToSupabase().catch(() => {});
      }
    } catch (err) {
      console.warn('Post-auth sync note:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-between canvas-studio text-[#111318]">
      {/* Top Header Navigation */}
      <header className="border-b border-[#EAE5DC] bg-[#FAF8F5]/90 backdrop-blur-md px-4 sm:px-6 py-3.5">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#C59B27]/50 shadow-[0_2px_8px_rgba(17,19,24,0.18)]">
              <AppLogo size={40} className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-[#111318] leading-none">
                {dict.appName}
              </div>
              <div className="text-[10px] text-[#858078] font-mono-data mt-0.5 tracking-wider uppercase">
                Private Wealth &amp; Sovereign Ledger
              </div>
            </div>
          </div>

          {/* Right Header Controls: Language + Security Pill */}
          <div className="flex items-center gap-2">
            {onLanguageChange && (
              <div className="flex items-center rounded-lg bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs">
                {APP_LANGUAGES.map((lang) => {
                  const active = systemLanguage === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onLanguageChange(lang)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {LANGUAGE_META[lang].nativeLabel}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Sovereign Guard</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md space-y-6">
          {/* Sovereign Branding Emblem */}
          <div className="rounded-2xl bg-[#0E1015] border border-[#C59B27]/40 p-4 sm:p-5 text-white shadow-xl shadow-black/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#E5C158]/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-3.5 relative z-10">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#C59B27]/60 shadow-[0_0_20px_rgba(197,155,39,0.3)]">
                <AppLogo size={48} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-sm sm:text-base font-bold text-[#E5C158] tracking-tight">
                  Personal Ledger Sovereign Cloud
                </div>
                <div className="text-[11px] text-slate-400 font-mono-data mt-0.5">
                  End-to-End Real-Time Multi-Device PostgreSQL
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl border border-[#EAE5DC] bg-white p-5 sm:p-7 shadow-lg shadow-black/5 space-y-5">
            {/* Header Description */}
            <div className="text-center space-y-1">
              <h1 className="text-lg font-bold text-slate-900 font-display">
                {authMode === 'signin' ? 'Sign In to Your Sovereign Ledger' : 'Create Sovereign Account'}
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Authentication required. No accounts, balances, or transactions are visible without verified login.
              </p>
            </div>

            {/* Auth Mode Toggle */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
                  authMode === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Sync Notice */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <strong>Multi-Device Notice:</strong> Use the exact same email and password on both your Android phone and web browser to synchronize your records in real time.
              </div>
            </div>

            {/* Feedback Alerts */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1">{errorMsg}</div>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <div className="flex-1 font-medium">{successMsg}</div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <FieldLabel htmlFor="auth-screen-email">Account Email</FieldLabel>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="auth-screen-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ssarkar925@gmail.com"
                    autoComplete="username"
                    required
                    className="pl-9 h-11 text-sm bg-slate-50/50"
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="auth-screen-password">Password</FieldLabel>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="auth-screen-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    className="pl-9 pr-10 h-11 text-sm bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full h-11 gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 font-bold text-sm shadow-md cursor-pointer justify-center"
              >
                {loading ? (
                  <>
                    <Zap className="h-4 w-4 animate-spin text-[#E5C158]" />
                    <span>Authenticating &amp; Syncing...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 text-[#E5C158]" />
                    <span>
                      {authMode === 'signin' ? 'Sign In & Unlock Ledger' : 'Create Sovereign Account & Unlock'}
                    </span>
                  </>
                )}
              </Button>
            </form>

            {/* Architecture Guarantees */}
            <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero Demo Data Leaks</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-blue-600 shrink-0" />
                <span>Web + Mobile Realtime</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EAE5DC] py-4 text-center text-xs text-[#858078] font-mono-data">
        Personal Ledger Sovereign Edition · All Rights Reserved · Zero Untrusted Telemetry
      </footer>
    </div>
  );
}
