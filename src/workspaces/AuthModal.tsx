import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  User as UserIcon,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { Button, Dialog, FieldLabel, Input } from '../components/ui/Primitives.tsx';
import { AppLogo } from '../components/ui/AppLogo.tsx';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  updateUserProfile,
  getUserProfile,
  compressImageToDataUrl,
  type User,
} from '../lib/supabase.ts';
import { clientDb } from '../lib/client-db.ts';
import { pushLocalDataToSupabase } from '../lib/supabase-sync.ts';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  onDataRefreshed?: () => void;
  notify?: (msg: string, kind?: 'ok' | 'err') => void;
}

export function AuthModal({
  open,
  onClose,
  currentUser,
  onUserChange,
  onDataRefreshed,
  notify,
}: AuthModalProps) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Profile Edit State (Logged-In)
  const currentProfile = getUserProfile(currentUser);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      const p = getUserProfile(currentUser);
      setEditName(p.fullName);
      setEditAvatar(p.avatarUrl);
    }
  }, [currentUser]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 160, 0.85);
      if (isEdit) {
        setEditAvatar(dataUrl);
      } else {
        setAvatarUrl(dataUrl);
      }
      notify?.('Photo attached to profile!', 'ok');
    } catch {
      setErrorMsg('Failed to process image. Please try another file.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await updateUserProfile({
        fullName: editName.trim(),
        avatarUrl: editAvatar.trim(),
      });
      if (updated) {
        onUserChange(updated);
      }
      setEditingProfile(false);
      setSuccessMsg('Profile updated successfully!');
      notify?.('Profile details updated ✓', 'ok');
    } catch (err) {
      const msg = (err as Error).message || 'Failed to update profile.';
      setErrorMsg(msg);
      notify?.(msg, 'err');
    } finally {
      setProfileSaving(false);
    }
  };

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
        const res = await signUpWithEmail(cleanEmail, password, { fullName, avatarUrl });
        if (res.user) {
          onUserChange(res.user);
          setSuccessMsg(`Account created! Welcome, ${fullName || cleanEmail}. Syncing your ledger...`);
          notify?.(`Account created! Welcome, ${fullName || cleanEmail}.`, 'ok');
          await handlePostAuthSync();
          onClose();
        }
      } else {
        const res = await signInWithEmail(cleanEmail, password);
        if (res.user) {
          onUserChange(res.user);
          setSuccessMsg(`Welcome back, ${res.user.email}! Syncing your cloud records...`);
          notify?.(`Signed in as ${res.user.email}!`, 'ok');
          await handlePostAuthSync();
          onClose();
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
    setSyncing(true);
    try {
      // 1. Pull server data down into this device
      const pullRes = await clientDb.pullDataFromSupabase({ force: true });
      // 2. If server was empty but local has records, push local records up
      const currentLocal = clientDb.load();
      if (pullRes.count === 0 && currentLocal.accounts.length > 0) {
        await pushLocalDataToSupabase().catch(() => {});
      }
      onDataRefreshed?.();
      setSuccessMsg('Synchronized with cloud database! All devices are now in sync.');
    } catch (err) {
      console.warn('Post-auth sync notice:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      clientDb.resetToCleanSlate();
      onUserChange(null);
      onClose();
      notify?.('Signed out successfully. All records locked.', 'ok');
      setSuccessMsg('');
      setErrorMsg('');
    } catch (err) {
      notify?.((err as Error).message, 'err');
    }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await clientDb.pullDataFromSupabase({ force: true });
      onDataRefreshed?.();
      setSuccessMsg(`Pulled ${res.count} updated records from cloud in real time!`);
      notify?.('Ledger refreshed from cloud server!', 'ok');
    } catch (err) {
      setErrorMsg((err as Error).message);
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  const handlePushLocal = async () => {
    setSyncing(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await pushLocalDataToSupabase();
      onDataRefreshed?.();
      setSuccessMsg(`Uploaded ${res.accountsCount} accounts and ${res.transactionsCount} transactions to cloud.`);
      notify?.('Local data uploaded to cloud successfully!', 'ok');
    } catch (err) {
      setErrorMsg((err as Error).message);
      notify?.((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sovereign Account & Multi-Device Sync"
      description="Sign into the same account on your mobile app and web browser for automatic real-time cloud sync."
      maxWidth="max-w-xl"
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* Brand Crest Header */}
        <div className="rounded-xl border border-[#C59B27]/40 bg-gradient-to-br from-[#1B1E26] via-[#111318] to-[#0A0B0E] p-4 text-white shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="shrink-0 overflow-hidden rounded-xl border border-[#C59B27]/50 shadow-[0_2px_12px_rgba(197,155,39,0.25)]">
              <AppLogo size={48} className="h-12 w-12 object-contain" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-[#FFFBEB] tracking-tight">
                  Personal Ledger Sovereign Cloud
                </h3>
                {currentUser && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE SYNC
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                End-to-End Real-Time Multi-Device PostgreSQL Architecture
              </p>
            </div>
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

        {/* LOGGED IN VIEW */}
        {currentUser ? (
          <div className="space-y-4">
            {/* User Profile Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {currentProfile.avatarUrl ? (
                    <img
                      src={currentProfile.avatarUrl}
                      alt={currentProfile.fullName || 'User Avatar'}
                      className="h-12 w-12 rounded-xl object-cover border border-[#C59B27]/40 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#111318] border border-[#C59B27]/40 text-[#E5C158] font-bold text-base font-mono-data">
                      {currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate">
                      {currentProfile.fullName || currentUser.email}
                    </div>
                    {currentProfile.fullName && (
                      <div className="text-[11px] text-slate-500 font-mono-data truncate">
                        {currentUser.email}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <UserCheck className="h-3 w-3 text-emerald-600" />
                      <span>Authenticated Sovereign Owner</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingProfile(!editingProfile)}
                    className="gap-1.5 text-slate-700 hover:text-slate-900 border-slate-200 cursor-pointer"
                  >
                    <UserIcon className="h-3.5 w-3.5 text-[#C59B27]" />
                    {editingProfile ? 'Cancel Edit' : 'Edit Profile'}
                  </Button>
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
              </div>

              {/* Inline Profile Editor */}
              {editingProfile && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#EAE5DC]">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-[#C59B27]" />
                    <span>Update Profile Name &amp; Photo</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {editAvatar ? (
                      <div className="relative">
                        <img
                          src={editAvatar}
                          alt="Preview"
                          className="h-12 w-12 rounded-xl object-cover border border-[#C59B27] shadow-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setEditAvatar('')}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 cursor-pointer"
                          title="Remove photo"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-white border border-dashed border-[#D6CFC2] flex items-center justify-center text-slate-400">
                        <Camera className="h-5 w-5 text-slate-400" />
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#D6CFC2] bg-white text-xs font-semibold text-slate-800 hover:bg-[#F3EFEA] cursor-pointer shadow-2xs">
                        <Camera className="h-3 w-3 text-[#C59B27]" />
                        <span>{photoLoading ? 'Processing...' : editAvatar ? 'Change Photo' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoSelect(e, true)}
                          disabled={photoLoading}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-500">Square photo recommended.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Sarkar Communication"
                      className="text-xs h-9 bg-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={profileSaving}
                      onClick={() => void handleSaveProfile()}
                      className="bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] text-xs px-3"
                    >
                      {profileSaving ? 'Saving...' : 'Save Profile Changes'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">User ID</span>
                  <span className="font-mono-data text-slate-700 truncate block mt-0.5">{currentUser.id}</span>
                </div>
                <div className="rounded-lg bg-emerald-50/70 p-2.5 border border-emerald-100">
                  <span className="text-emerald-700 block text-[10px] uppercase tracking-wider font-semibold">Multi-Device Sync</span>
                  <span className="text-emerald-900 font-medium flex items-center gap-1 mt-0.5">
                    <Zap className="h-3 w-3 text-emerald-600" />
                    Real-time updates enabled
                  </span>
                </div>
              </div>
            </div>

            {/* Sync Controls */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-xs">Cloud Synchronization Controls</span>
                <span className="text-[10px] text-slate-500 font-mono-data">PostgreSQL + Realtime</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Log into the Android app with <strong>{currentUser.email}</strong> to seamlessly synchronize transactions, bank balances, credit cards, and encrypted vault entries across all your devices in real-time.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={syncing}
                  onClick={() => void handleForceSync()}
                  className="gap-1.5 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Pull Latest from Server'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={syncing}
                  onClick={() => void handlePushLocal()}
                  className="gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload Local Records to Server
                </Button>
              </div>
            </div>

            {/* Multi-Device Sync Explanation */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="h-4 w-4 text-blue-600" />
                <span>How Multi-Device Real-Time Sync Operates:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800">
                <li>Every transaction added on mobile or web immediately updates your PostgreSQL cloud database.</li>
                <li>Supabase Realtime sends instantaneous push notifications to all connected devices.</li>
                <li>When you open or switch to this ledger on any phone, tablet, or PC, it automatically refreshes.</li>
              </ul>
            </div>
          </div>
        ) : (
          /* NOT LOGGED IN - DEDICATED SIGN IN FORM */
          <div className="space-y-4">
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
                Sign In to Existing Account
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
                Create New Sovereign Account
              </button>
            </div>

            {/* Instruction Callout */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <strong>Important:</strong> Sign in with the <em>exact same email and password</em> on both your Android app and web browser so both devices connect to your private database partition and mirror all entries in real time.
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              {authMode === 'signup' && (
                <div className="rounded-xl border border-[#D6CFC2] bg-[#FAF8F5] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Profile Identity</span>
                    <span className="text-[10px] text-slate-500 font-mono-data">Optional</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative group shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Avatar Preview"
                          className="h-12 w-12 rounded-full object-cover border-2 border-[#C59B27] shadow-xs"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-white border-2 border-dashed border-[#D6CFC2] flex items-center justify-center text-slate-400">
                          <UserIcon className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs hover:bg-rose-700 cursor-pointer"
                          title="Remove photo"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#D6CFC2] bg-white text-xs font-semibold text-slate-800 hover:bg-[#F3EFEA] cursor-pointer shadow-2xs">
                        <Camera className="h-3 w-3 text-[#C59B27]" />
                        <span>{photoLoading ? 'Processing...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoSelect(e, false)}
                          disabled={photoLoading}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-500">Square photo recommended.</p>
                    </div>
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="e.g. Sarkar Communication"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              )}

              <div>
                <FieldLabel htmlFor="auth-email">Account Email</FieldLabel>
                <div className="relative">
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="e.g. ssarkar925@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="pl-9 text-xs"
                  />
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-9 pr-9 text-xs"
                  />
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={loading}
                  className="w-full gap-2 bg-[#111318] text-[#E5C158] hover:bg-[#1B1E26] border border-[#C59B27]/40 font-bold cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-[#E5C158]" />
                  ) : (
                    <LogIn className="h-4 w-4 text-[#E5C158]" />
                  )}
                  {loading
                    ? 'Authenticating & Syncing...'
                    : authMode === 'signin'
                      ? 'Sign In & Connect Devices'
                      : 'Create Sovereign Account'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Dialog>
  );
}
