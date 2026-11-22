import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TransactionRecord } from '../db/ledger-repo.ts';

const DEFAULT_SUPABASE_URL = 'https://vcipljpdrgjwkjezbray.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_oHwRwizV0QF8R2sgNffH8Q_37mU6rgA';

let cloudClient: SupabaseClient | null = null;

export function getCloudSupabaseClient(): SupabaseClient | null {
  if (cloudClient) return cloudClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    cloudClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    return cloudClient;
  } catch (err) {
    console.warn('[CloudBridge] Failed to initialize Supabase client:', err);
    return null;
  }
}

/**
 * Persists Baileys credentials to Supabase so Render container redeploys and restarts
 * do NOT lose the WhatsApp linked-device session.
 */
export async function backupBaileysAuthToCloud(authDir: string): Promise<boolean> {
  const credsPath = path.join(authDir, 'creds.json');
  if (!fs.existsSync(credsPath)) return false;

  const client = getCloudSupabaseClient();
  if (!client) return false;

  try {
    const raw = fs.readFileSync(credsPath, 'utf-8');
    if (!raw || raw.length < 10) return false;

    // Use vault_meta or a dedicated server backup key
    const payload = {
      label: 'baileys_session_backup',
      category: 'server_state',
      iv: 'server-managed',
      ciphertext: Buffer.from(raw, 'utf-8').toString('base64'),
      last_rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert into vault_entries if table exists
    const { error } = await client.from('vault_entries').upsert(payload, { onConflict: 'label' });
    if (!error) {
      return true;
    }
  } catch (err) {
    console.warn('[CloudBridge] Failed to backup Baileys auth to cloud:', err);
  }
  return false;
}

/**
 * Restores Baileys credentials from Supabase on fresh container startup.
 */
export async function restoreBaileysAuthFromCloud(authDir: string): Promise<boolean> {
  const credsPath = path.join(authDir, 'creds.json');
  if (fs.existsSync(credsPath)) return true; // Already exists locally

  const client = getCloudSupabaseClient();
  if (!client) return false;

  try {
    const { data, error } = await client
      .from('vault_entries')
      .select('ciphertext')
      .eq('label', 'baileys_session_backup')
      .maybeSingle();

    if (!error && data?.ciphertext) {
      const decoded = Buffer.from(data.ciphertext, 'base64').toString('utf-8');
      if (decoded.includes('noiseKey') || decoded.includes('registrationId')) {
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(credsPath, decoded, 'utf-8');
        console.log('[CloudBridge] Restored Baileys session from Supabase cloud backup.');
        return true;
      }
    }
  } catch (err) {
    console.warn('[CloudBridge] Could not restore Baileys session from cloud:', err);
  }
  return false;
}

/**
 * Mirrors a transaction logged on the server (e.g. from WhatsApp receipt/text)
 * directly into Supabase PostgreSQL so it immediately reflects on the web app.
 */
export async function mirrorTransactionToCloud(tx: TransactionRecord): Promise<boolean> {
  const client = getCloudSupabaseClient();
  if (!client) return false;

  try {
    // Mirror to public.transactions
    const payload = {
      id: tx.id,
      kind: tx.kind,
      scope: tx.scope,
      account_id: tx.accountId,
      to_account_id: tx.toAccountId || null,
      category: tx.category,
      amount_minor: tx.amountMinor,
      occurred_at: tx.occurredAt,
      party: tx.party || '',
      note: tx.note || '',
      source_ref: tx.sourceRef || 'whatsapp_bridge',
    };

    const { error } = await client.from('transactions').upsert(payload, { onConflict: 'id' });
    if (!error) {
      console.log(`[CloudBridge] Successfully mirrored transaction ${tx.id} to Supabase.`);
      return true;
    }
  } catch (err) {
    console.warn('[CloudBridge] Failed to mirror transaction to cloud:', err);
  }
  return false;
}
