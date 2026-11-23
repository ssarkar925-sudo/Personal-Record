import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';

export type { User, Session, SupabaseClient };

export const DEFAULT_SUPABASE_URL = 'https://vcipljpdrgjwkjezbray.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_oHwRwizV0QF8R2sgNffH8Q_37mU6rgA';

const STORAGE_KEY_URL = 'pl_supabase_url';
const STORAGE_KEY_ANON = 'pl_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

export function getSupabaseConfig(): SupabaseConfig {
  let url = '';
  let anonKey = '';

  try {
    const envUrl = import.meta.env.VITE_SUPABASE_URL;
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
      url = envUrl.trim();
    }
    if (typeof envKey === 'string' && envKey.trim().length > 0) {
      anonKey = envKey.trim();
    }
  } catch {
    // env not available
  }

  // Allow localStorage override if not in env
  if (!url || !anonKey) {
    try {
      const storedUrl = localStorage.getItem(STORAGE_KEY_URL);
      const storedKey = localStorage.getItem(STORAGE_KEY_ANON);
      if (storedUrl && storedKey) {
        url = storedUrl.trim();
        anonKey = storedKey.trim();
      }
    } catch {
      // storage unavailable
    }
  }

  // Built-in default production fallbacks
  if (!url || !anonKey) {
    url = DEFAULT_SUPABASE_URL;
    anonKey = DEFAULT_SUPABASE_ANON_KEY;
  }

  const isPlaceholder =
    url.includes('your-project-id') ||
    url.includes('example.supabase.co') ||
    anonKey.includes('your-anon-key');
  let validOrigin = false;
  try {
    const parsed = new URL(url);
    validOrigin =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'));
  } catch {
    validOrigin = false;
  }
  const isConfigured = Boolean(url && anonKey && validOrigin && !isPlaceholder);
  return { url, anonKey, isConfigured };
}

export function setSupabaseConfig(url: string, anonKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
    localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
    supabaseInstance = null; // force re-instantiation
  } catch (err) {
    console.error('Failed to save Supabase config to localStorage', err);
  }
}

export function clearSupabaseConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_ANON);
    supabaseInstance = null;
  } catch (err) {
    console.error('Failed to clear Supabase config', err);
  }
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().isConfigured;
}

export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    // Localhost or Capacitor cannot be reached from an email client on another device/browser
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('file://')
    ) {
      return 'https://scbook.vercel.app/';
    }
    return `${origin}/`;
  }
  return 'https://scbook.vercel.app/';
}

// Authentication Helpers
export interface UserProfileData {
  fullName: string;
  avatarUrl: string;
}

export function getUserProfile(user?: User | null): UserProfileData {
  if (!user) {
    try {
      const stored = localStorage.getItem('pl_user_profile');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { fullName: '', avatarUrl: '' };
  }
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  let fullName = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : '';
  let avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : typeof meta.picture === 'string' ? meta.picture : '';
  if (!fullName || !avatarUrl) {
    try {
      const stored = localStorage.getItem('pl_user_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!fullName && parsed.fullName) fullName = parsed.fullName;
        if (!avatarUrl && parsed.avatarUrl) avatarUrl = parsed.avatarUrl;
      }
    } catch {}
  }
  return { fullName, avatarUrl };
}

export function compressImageToDataUrl(file: File, maxDim = 160, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function signUpWithEmail(
  email: string,
  password: string,
  profile?: { fullName?: string; avatarUrl?: string }
) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const redirectTo = getAuthRedirectUrl();
  const metadata: Record<string, string> = {};
  if (profile?.fullName) metadata.full_name = profile.fullName.trim();
  if (profile?.avatarUrl) metadata.avatar_url = profile.avatarUrl.trim();

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: metadata,
    },
  });
  if (error) throw error;
  if (profile) {
    try {
      localStorage.setItem('pl_user_profile', JSON.stringify({
        fullName: profile.fullName || '',
        avatarUrl: profile.avatarUrl || '',
      }));
    } catch {}
  }
  return data;
}

export async function updateUserProfile(profile: { fullName?: string; avatarUrl?: string }) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const metadata: Record<string, string> = {};
  if (profile.fullName !== undefined) metadata.full_name = profile.fullName.trim();
  if (profile.avatarUrl !== undefined) metadata.avatar_url = profile.avatarUrl.trim();

  const { data, error } = await client.auth.updateUser({
    data: metadata,
  });
  if (error) throw error;
  try {
    localStorage.setItem('pl_user_profile', JSON.stringify({
      fullName: profile.fullName || '',
      avatarUrl: profile.avatarUrl || '',
    }));
  } catch {}
  return data.user;
}

export async function signInWithEmail(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function updateAccountPassword(newPassword: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const { data, error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export async function resetPasswordForEmail(email: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    // Instant local check first (reads from localStorage in 0.1ms)
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) {
      return session.user;
    }
    return null;
  } catch (err) {
    console.warn('getCurrentUser local session error:', err);
    return null;
  }
}

/**
 * Ensures an active Supabase user session exists.
 * Returns the currently signed-in user or null if unauthenticated.
 */
export async function ensureSupabaseSession(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    return await getCurrentUser();
  } catch (err) {
    console.warn('ensureSupabaseSession error:', err);
    return null;
  }
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  const client = getSupabaseClient();
  if (!client) return { unsubscribe: () => {} };
  const { data } = client.auth.onAuthStateChange(callback);
  return {
    unsubscribe: () => data.subscription.unsubscribe(),
  };
}

// Ping & Connection Verification
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase URL or Anon Key is missing.' };
  }
  const start = performance.now();
  try {
    // Attempt a lightweight query to verify connectivity and auth
    const { error } = await client.from('accounts').select('id').limit(1);
    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      // If table doesn't exist yet, explain
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return {
          ok: false,
          message: 'Connected to Supabase, but schema tables are missing. Please run supabase_schema.sql in the Supabase SQL Editor.',
          latencyMs,
        };
      }
      return { ok: false, message: error.message, latencyMs };
    }
    return { ok: true, message: `Connected to Supabase PostgreSQL (${latencyMs}ms)`, latencyMs };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Network error reaching Supabase' };
  }
}
