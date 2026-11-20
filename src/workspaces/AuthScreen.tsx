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
          'Email verification link was expired or invalid. Email confirmations are disabled on this cloud project, so you can sign in directly below with your email and password.'
        );
      } else {
        setHashNotice(cleanDesc || 'Authentication error from verification link.');
      }
      // Clean hash to avoid re-triggering
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
          `Password reset link dispatched to ${cleanEmail}. Check your inbox (and spam folder) for the secure recovery email.`
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
          setSuccessMsg(`Sovereign Account created! Welcome, ${cleanEmail}. Syncing ledger...`);
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
    <div className="min-h-screen bg-[#07090E] flex flex-col justify-between text-[#F1F5F9] relative overflow-hidden select-none">
      {/* Ambient Radial Lights */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-b from-[#E5C158]/15 via-[#C59B27]/5 to-transparent rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/4 w-[500px] h-[350px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-[350px] h-[350px] bg-[#E5C158]/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header Navigation */}
      <header className="relative z-10 border-b border-[#1E2433]/80 bg-[#0A0D14]/80 backdrop-blur-xl px-4 sm:px-6 py-3.5">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden border border-[#C59B27]/50 shadow-[0_0_15px_rgba(229,193,88,0.25)] bg-[#11141E]">
              <AppLogo size={40} className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>{dict.appName}</span>
                <span className="text-[10px] font-mono-data px-1.5 py-0.5 rounded bg-[#C59B27]/20 text-[#FDE68A] border border-[#C59B27]/30 uppercase tracking-widest">
                  v1.0.1
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono-data mt-0.5 tracking-wider uppercase">
                Private Wealth &amp; Sovereign Ledger
              </div>
            </div>
          </div>

          {/* Right Header Controls: Language + Security Badge */}
          <div className="flex items-center gap-2">
            {onLanguageChange && (
              <div className="flex items-center rounded-lg bg-[#111520] p-0.5 border border-[#1E2638] text-xs">
                {APP_LANGUAGES.map((lang) => {
                  const active = systemLanguage === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onLanguageChange(lang)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                        active
                          ? 'bg-[#E5C158] text-[#0A0D14] font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {LANGUAGE_META[lang].nativeLabel}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 text-[11px] font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Sovereign Guard Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Authentication Stage */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md space-y-5">
          {/* Creative Sovereign Crest Card */}
          <div className="relative rounded-3xl bg-gradient-to-b from-[#161B26] via-[#10131C] to-[#0D1017] border border-[#C59B27]/40 p-5 text-white shadow-[0_15px_40px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-[#E5C158]/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl overflow-hidden border border-[#E5C158]/70 shadow-[0_0_25px_rgba(229,193,88,0.35)] bg-[#0A0D14]">
                <AppLogo size={56} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-base font-bold text-[#FDE68A] tracking-tight flex items-center gap-1.5">
                  <span>Sovereign Cloud Engine</span>
                  <Sparkles className="h-4 w-4 text-[#E5C158]" />
                </div>
                <div className="text-[11px] text-slate-300 font-mono-data mt-0.5 leading-snug">
                  Multi-Device PostgreSQL · Zero Public Exposure
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="relative rounded-3xl border border-[#232B3E] bg-[#0E121B]/95 backdrop-blur-2xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.7)] space-y-5">
            {/* Hash Error Notice (e.g. from expired localhost email click) */}
            {hashNotice && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-3.5 text-xs text-amber-200 leading-relaxed flex items-start gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-[#E5C158] mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-[#FDE68A] mb-0.5">Notice on Verification Link</div>
                  <div>{hashNotice}</div>
                </div>
              </div>
            )}

            {/* Top Navigation Mode Switcher (Sign In vs Create Account vs Recovery) */}
            {authMode !== 'recovery' && authMode !== 'forgot' ? (
              <div className="flex rounded-2xl bg-[#080A10] p-1 border border-[#1E2536]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                    authMode === 'signin'
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#E5C158] text-[#0A0D14] shadow-[0_2px_10px_rgba(229,193,88,0.3)]'
                      : 'text-slate-400 hover:text-white'
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
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                    authMode === 'signup'
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#E5C158] text-[#0A0D14] shadow-[0_2px_10px_rgba(229,193,88,0.3)]'
                      : 'text-slate-400 hover:text-white'
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
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#E5C158] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Sign In</span>
                </button>
                <span className="text-[11px] font-mono-data text-[#C59B27] font-semibold">
                  {authMode === 'recovery' ? 'Password Recovery' : 'Account Reset'}
                </span>
              </div>
            )}

            {/* Header Title */}
            <div className="space-y-1 text-center">
              <h1 className="text-lg font-bold text-white font-display">
                {authMode === 'signin' && 'Sign In to Your Ledger'}
                {authMode === 'signup' && 'Create Sovereign Account'}
                {authMode === 'forgot' && 'Reset Account Password'}
                {authMode === 'recovery' && 'Set New Account Password'}
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                {authMode === 'signin' && 'Instant cache active. Records sync securely in real time across all devices.'}
                {authMode === 'signup' && 'Instant sign-up enabled. Use the same credentials across your phone and web.'}
                {authMode === 'forgot' && 'Enter your email to receive a password reset link pointing to this application.'}
                {authMode === 'recovery' && 'Choose a strong new password for your Personal Ledger account.'}
              </p>
            </div>

            {/* Feedback Alerts */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-3 text-rose-200 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 font-medium">{errorMsg}</div>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-emerald-200 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1 font-medium">{successMsg}</div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === 'recovery' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={recoveryPassword}
                        onChange={(e) => setRecoveryPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        className="w-full rounded-xl bg-[#131722] border border-[#273042] text-white placeholder-slate-500 pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#E5C158] focus:ring-2 focus:ring-[#E5C158]/20 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={recoveryConfirm}
                        onChange={(e) => setRecoveryConfirm(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="w-full rounded-xl bg-[#131722] border border-[#273042] text-white placeholder-slate-500 pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#E5C158] focus:ring-2 focus:ring-[#E5C158]/20 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Account Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. ssarkar925@gmail.com"
                        autoComplete="username"
                        required
                        className="w-full rounded-xl bg-[#131722] border border-[#273042] text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#E5C158] focus:ring-2 focus:ring-[#E5C158]/20 transition-all"
                      />
                    </div>
                  </div>

                  {authMode !== 'forgot' && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-300">Password</label>
                        {authMode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot');
                              setErrorMsg('');
                              setSuccessMsg('');
                            }}
                            className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your account password"
                          autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                          required
                          className="w-full rounded-xl bg-[#131722] border border-[#273042] text-white placeholder-slate-500 pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#E5C158] focus:ring-2 focus:ring-[#E5C158]/20 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-1"
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
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C59B27] text-[#0A0D14] shadow-[0_4px_20px_rgba(229,193,88,0.3)] hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Zap className="h-4 w-4 animate-spin text-[#0A0D14]" />
                    <span>Synchronizing sovereign credentials...</span>
                  </>
                ) : (
                  <>
                    {authMode === 'signin' && (
                      <>
                        <LogIn className="h-4 w-4" />
                        <span>Sign In &amp; Unlock Sovereign Ledger</span>
                      </>
                    )}
                    {authMode === 'signup' && (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Create Account &amp; Unlock</span>
                      </>
                    )}
                    {authMode === 'forgot' && (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Send Password Reset Link</span>
                      </>
                    )}
                    {authMode === 'recovery' && (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        <span>Save New Password &amp; Unlock</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </form>

            {/* Architecture Guarantees */}
            <div className="border-t border-[#1E2536] pt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div className="rounded-xl bg-[#121622] p-2.5 border border-[#1E2536] flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Zero Data Leaks</span>
              </div>
              <div className="rounded-xl bg-[#121622] p-2.5 border border-[#1E2536] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#E5C158] shrink-0" />
                <span>Real-Time Sync</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#1E2433]/80 py-4 text-center text-xs text-slate-500 font-mono-data">
        Personal Ledger Sovereign Edition · All Rights Reserved · Zero Untrusted Telemetry
      </footer>
    </div>
  );
}
