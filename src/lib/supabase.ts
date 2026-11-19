import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';

export type { User, Session, SupabaseClient };

export const DEFAULT_SUPABASE_URL = 'https://vcipljpdrgjwkjezbray.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_oHwRwizV0QF8R2sgNffH8Q_37mU6rgA';
export const DEFAULT_LEDGER_EMAIL = 'test.ledger.pilot@gmail.com';
export const DEFAULT_LEDGER_PASS = 'TestPassword123!';

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

// Authentication Helpers
export async function signUpWithEmail(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const redirectTo = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/`
    : 'https://personal-ledger-amber.vercel.app/';
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured. Please provide Project URL and Anon Key.');
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
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
  const { data } = await client.auth.getUser();
  return data.user;
}

/**
 * Ensures an active Supabase user session exists.
 * If the current client has no stored session, automatically authenticates
 * as the primary sovereign ledger owner to enable seamless multi-device sync out of the box.
 */
export async function ensureSupabaseSession(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const existing = await getCurrentUser();
    if (existing) return existing;
    const { data, error } = await client.auth.signInWithPassword({
      email: DEFAULT_LEDGER_EMAIL,
      password: DEFAULT_LEDGER_PASS,
    });
    if (error) {
      console.warn('Auto ledger session notice:', error.message);
      return null;
    }
    return data.user;
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
