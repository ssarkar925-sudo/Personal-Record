import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AppLogo } from '../components/ui/AppLogo.tsx';
import {
  signInWithEmail,
  signUpWithEmail,
  resetPasswordForEmail,
  updateAccountPassword,
  type User,
} from '../lib/supabase.ts';
import { clientDb } from '../lib/client-db.ts';
import { pushLocalDataToSupabase } from '../lib/supabase-sync.ts';
import { APP_LANGUAGES, LANGUAGE_META, type AppLanguage, UI_STRINGS } from '../../shared/i18n.ts';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
  systemLanguage?: AppLanguage;
  onLanguageChange?: (lang: AppLanguage) => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery';

export function AuthScreen({
  onLoginSuccess,
  systemLanguage = 'en',
  onLanguageChange,
  notify,
}: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hashNotice, setHashNotice] = useState<string | null>(null);

  const dict = UI_STRINGS[systemLanguage] || UI_STRINGS.en;

  // Inspect URL hash on mount for expired OTP links or password recovery tokens
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;

    const search = window.location.search.startsWith('?')
      ? window.location.search.substring(1)
      : window.location.search;

    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(search);

    const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
    const typeParam = hashParams.get('type') || searchParams.get('type');

    if (errorCode || errorDesc) {
      const cleanDesc = errorDesc ? decodeURIComponent(errorDesc).replace(/\+/g, ' ') : '';
      if (errorCode === 'otp_expired' || cleanDesc.toLowerCase().includes('expired')) {
        setHashNotice(
          'Email verification link was already used or expired. Your account is active and verified! Sign in directly below with your email and password.'
        );
        setAuthMode('signin');
      } else {
        setHashNotice(cleanDesc || 'Authentication notice from verification link.');
        setAuthMode('signin');
      }
      window.history.replaceState(null, '', window.location.pathname);
    } else if (typeParam === 'recovery') {
      setAuthMode('recovery');
      setSuccessMsg('Email recovery token verified! Enter your new password below.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const cleanEmail = email.trim();

    try {
      if (authMode === 'recovery') {
        if (!recoveryPassword || recoveryPassword.length < 8) {
          setErrorMsg('New password must be at least 8 characters long.');
          setLoading(false);
          return;
        }
        if (recoveryPassword !== recoveryConfirm) {
          setErrorMsg('New passwords do not match. Please re-enter.');
          setLoading(false);
          return;
        }
        await updateAccountPassword(recoveryPassword);
        setSuccessMsg('Account password updated successfully! Signing you in...');
        notify?.('Password updated successfully! Welcome back.', 'ok');
        await handlePostAuthSync();
        const { getCurrentUser } = await import('../lib/supabase.ts');
        const updatedUser = await getCurrentUser();
        if (updatedUser) {
          onLoginSuccess(updatedUser);
        } else {
          setAuthMode('signin');
        }
        return;
      }

      if (authMode === 'forgot') {
        if (!cleanEmail) {
          setErrorMsg('Please enter your account email address.');
          setLoading(false);
          return;
        }
        await resetPasswordForEmail(cleanEmail);
        setSuccessMsg(
          `Password reset link dispatched to ${cleanEmail}. Check your inbox for the secure link.`
        );
        notify?.(`Reset link sent to ${cleanEmail}`, 'ok');
        setLoading(false);
        return;
      }

      if (!cleanEmail || !password) {
        setErrorMsg('Please enter both email and password.');
        setLoading(false);
        return;
      }

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
      const msg = (err as Error).message || 'Authentication failed. Please verify credentials.';
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
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-between text-[#111318] canvas-studio select-none">
      {/* Top Header Navigation */}
      <header className="border-b border-[#EAE5DC] bg-white/80 backdrop-blur-md px-4 sm:px-6 py-3.5">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#D6CFC2] bg-white shadow-2xs">
              <AppLogo size={36} className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-[#111318] leading-none">
                {dict.appName}
              </div>
              <div className="text-[10px] text-[#858078] font-mono-data mt-0.5 tracking-wider uppercase">
                Private Wealth &amp; Sovereign Records
              </div>
            </div>
          </div>

          {/* Right Header Controls: Language + Security Badge */}
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
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
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
              <span>Encrypted Storage</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md space-y-4">
          {/* Form Card (Clean Daylight Aesthetic - Zero Black Shaded Hero Cards) */}
          <div className="rounded-2xl border border-[#EAE5DC] bg-white p-6 sm:p-8 shadow-sm space-y-5">
            {/* Logo Emblem Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D6CFC2] bg-[#FAF8F5] shadow-xs p-1 mx-auto">
                <AppLogo size={40} className="h-full w-full object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 font-display">
                  {authMode === 'signin' && 'Sign In to Your Ledger'}
                  {authMode === 'signup' && 'Create Account'}
                  {authMode === 'forgot' && 'Reset Account Password'}
                  {authMode === 'recovery' && 'Set New Password'}
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  {authMode === 'signin' && 'Enter your credentials to unlock and sync your private ledger.'}
                  {authMode === 'signup' && 'Create a sovereign account to synchronize data across all devices.'}
                  {authMode === 'forgot' && 'Enter your email to receive a password reset link.'}
                  {authMode === 'recovery' && 'Choose a strong new password for your account.'}
                </p>
              </div>
            </div>

            {/* Hash Notice (e.g. from expired email click) */}
            {hashNotice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-950 mb-0.5">Notice on Verification Link</div>
                  <div>{hashNotice}</div>
                </div>
              </div>
            )}

            {/* Mode Switcher */}
            {authMode !== 'recovery' && authMode !== 'forgot' ? (
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
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold'
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
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Create Account
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Sign In</span>
                </button>
                <span className="text-[11px] font-mono-data text-[#8C6D1F] font-semibold">
                  {authMode === 'recovery' ? 'Password Recovery' : 'Account Reset'}
                </span>
              </div>
            )}

            {/* Feedback Alerts */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1 font-medium">{errorMsg}</div>
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
              {authMode === 'recovery' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={recoveryPassword}
                        onChange={(e) => setRecoveryPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        className="w-full rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/15 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirm New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={recoveryConfirm}
                        onChange={(e) => setRecoveryConfirm(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="w-full rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/15 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Account Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. ssarkar925@gmail.com"
                        autoComplete="username"
                        required
                        className="w-full rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/15 transition-all"
                      />
                    </div>
                  </div>

                  {authMode !== 'forgot' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-700">Password</label>
                        {authMode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot');
                              setErrorMsg('');
                              setSuccessMsg('');
                            }}
                            className="text-[11px] text-[#8C6D1F] hover:text-[#5C450C] hover:underline cursor-pointer font-medium"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your account password"
                          autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                          required
                          className="w-full rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/15 transition-all"
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
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-[#111318] hover:bg-[#1E232D] text-white shadow-xs active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Zap className="h-4 w-4 animate-spin text-[#E5C158]" />
                    <span>Signing in &amp; syncing...</span>
                  </>
                ) : (
                  <>
                    {authMode === 'signin' && (
                      <>
                        <LogIn className="h-4 w-4 text-[#E5C158]" />
                        <span>Sign In to Ledger</span>
                      </>
                    )}
                    {authMode === 'signup' && (
                      <>
                        <Sparkles className="h-4 w-4 text-[#E5C158]" />
                        <span>Create Account</span>
                      </>
                    )}
                    {authMode === 'forgot' && (
                      <>
                        <Send className="h-4 w-4 text-[#E5C158]" />
                        <span>Send Password Reset Link</span>
                      </>
                    )}
                    {authMode === 'recovery' && (
                      <>
                        <RefreshCw className="h-4 w-4 text-[#E5C158]" />
                        <span>Save New Password</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </form>

            {/* Architecture Guarantees */}
            <div className="border-t border-slate-100 pt-3.5 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero Data Leaks</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#8C6D1F] shrink-0" />
                <span>Multi-Device Sync</span>
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
