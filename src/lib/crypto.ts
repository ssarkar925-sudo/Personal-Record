// Browser-side Web Crypto for Password Vault (PBKDF2-SHA256 600k + AES-256-GCM)
// Keys remain strictly in memory and never touch localStorage, sessionStorage, or the server.

const PBKDF2_ITERATIONS = 600_000;
const CANARY_PLAINTEXT = 'PERSONAL_LEDGER_VAULT_OK_V1';

export type VaultItemType = 'login' | 'card' | 'upi' | 'identity' | 'note';

export interface VaultExtraSecret {
  id: string;
  label: string;
  value: string;
  kind?: 'password' | 'pin' | 'secret';
}

export interface VaultLegacySecret {
  id: string;
  label: string;
  value: string;
  archivedAt: string;
  note?: string;
}

export interface VaultSecretPayload {
  // Common / Login fields
  username: string;
  password: string;
  url: string;
  notes: string;
  starred?: boolean;
  secrets?: VaultExtraSecret[];
  legacyHistory?: VaultLegacySecret[];

  // Specialized item type & fields
  itemType?: VaultItemType;
  linkedAccountId?: string | null;

  // Credit / Debit Card fields
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardPin?: string;

  // UPI fields
  upiVpa?: string;
  upiMpin?: string;
  upiDailyLimit?: number;

  // Identity / Tax fields
  idType?: string; // 'PAN' | 'Aadhaar' | 'Passport' | 'Driving License' | 'Voter ID'
  idNumber?: string;

  // Customization & Archive & Order
  color?: string; // 'gold' | 'emerald' | 'blue' | 'purple' | 'rose' | 'amber' | 'obsidian'
  archived?: boolean;
  archivedAt?: string;
  orderIndex?: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function generateSaltB64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

export async function deriveVaultKey(masterPassword: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = base64ToBytes(saltB64);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, // Extractable so master key can be safely escrowed with recovery key
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importRawKey(rawB64: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(rawB64);
  return crypto.subtle.importKey(
    'raw',
    bytes as BufferSource,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(buf)),
  };
}

export async function decryptString(key: CryptoKey, ivB64: string, ciphertextB64: string): Promise<string> {
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ciphertextB64);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(buf);
}

export async function createCanary(key: CryptoKey): Promise<{ canaryIv: string; canaryCt: string }> {
  const { iv, ciphertext } = await encryptString(key, CANARY_PLAINTEXT);
  return { canaryIv: iv, canaryCt: ciphertext };
}

export async function verifyCanary(key: CryptoKey, canaryIv: string, canaryCt: string): Promise<boolean> {
  try {
    const plain = await decryptString(key, canaryIv, canaryCt);
    return plain === CANARY_PLAINTEXT;
  } catch {
    return false;
  }
}

export async function encryptVaultPayload(
  key: CryptoKey,
  payload: VaultSecretPayload,
): Promise<{ iv: string; ciphertext: string }> {
  return encryptString(key, JSON.stringify(payload));
}

export async function decryptVaultPayload(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
): Promise<VaultSecretPayload> {
  const raw = await decryptString(key, iv, ciphertext);
  return JSON.parse(raw) as VaultSecretPayload;
}

export function generateStrongPassword(length: number = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_';
  const rand = crypto.getRandomValues(new Uint32Array(length));
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[rand[i] % alphabet.length];
  }
  return out;
}

// Emergency Recovery Key Generation (Format: PLVK-XXXX-XXXX-XXXX-XXXX)
export function generateRecoveryKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Crockford base32 alphabet (no 0, 1, I, O)
  const rand = crypto.getRandomValues(new Uint8Array(16));
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars[rand[i * 4 + j] % chars.length];
    }
    parts.push(segment);
  }
  return `PLVK-${parts.join('-')}`;
}

// Zero-Knowledge Master Key Recovery Escrow
export async function encryptMasterKeyWithRecovery(
  vaultKey: CryptoKey,
  recoveryKeyStr: string,
): Promise<{ recoverySaltB64: string; recoveryIv: string; recoveryCt: string }> {
  const recoverySaltB64 = generateSaltB64();
  const cleanKey = recoveryKeyStr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const recDerivedKey = await deriveVaultKey(cleanKey, recoverySaltB64);
  const rawKeyB64 = await exportRawKey(vaultKey);
  const { iv, ciphertext } = await encryptString(recDerivedKey, rawKeyB64);
  return { recoverySaltB64, recoveryIv: iv, recoveryCt: ciphertext };
}

export async function decryptMasterKeyWithRecovery(
  recoveryKeyStr: string,
  recoverySaltB64: string,
  recoveryIv: string,
  recoveryCt: string,
): Promise<CryptoKey> {
  const cleanKey = recoveryKeyStr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const recDerivedKey = await deriveVaultKey(cleanKey, recoverySaltB64);
  const rawKeyB64 = await decryptString(recDerivedKey, recoveryIv, recoveryCt);
  return importRawKey(rawKeyB64);
}

// Password Strength & Security Audit
export interface PasswordStrengthResult {
  score: number; // 0 to 100
  label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Excellent';
  color: string;
  badgeClass: string;
  suggestions: string[];
}

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Weak',
      color: '#ef4444',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      suggestions: ['Password is empty'],
    };
  }

  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^a-zA-Z0-9]/.test(password)) score += 10;

  if (password.length < 12) suggestions.push('Use at least 12 characters');
  if (!/[A-Z]/.test(password)) suggestions.push('Add uppercase letters (A-Z)');
  if (!/[0-9]/.test(password)) suggestions.push('Add numeric digits (0-9)');
  if (!/[^a-zA-Z0-9]/.test(password)) suggestions.push('Add symbols (!@#$%^&*)');

  let label: PasswordStrengthResult['label'] = 'Weak';
  let color = '#ef4444';
  let badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';

  if (score >= 80) {
    label = score >= 90 ? 'Excellent' : 'Strong';
    color = '#10b981';
    badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else if (score >= 60) {
    label = 'Good';
    color = '#3b82f6';
    badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
  } else if (score >= 40) {
    label = 'Fair';
    color = '#f59e0b';
    badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return { score, label, color, badgeClass, suggestions };
}

// Client-Side Zero-Knowledge Hash for Reused Password Detection
export async function hashSecretForAudit(secret: string): Promise<string> {
  if (!secret) return '';
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64(new Uint8Array(hash));
}

// Encrypted Backup File (.plvault) Export & Import
export interface EncryptedVaultBackupFile {
  version: 1;
  app: 'personal-ledger';
  exportedAt: string;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  entryCount: number;
}

export async function exportEncryptedVaultFile(
  exportPassphrase: string,
  entries: Array<{ id: string; label: string; category: string; lastRotatedAt: string; payload: VaultSecretPayload }>,
): Promise<string> {
  const saltB64 = generateSaltB64();
  const key = await deriveVaultKey(exportPassphrase, saltB64);
  const jsonStr = JSON.stringify(entries);
  const { iv, ciphertext } = await encryptString(key, jsonStr);
  const backup: EncryptedVaultBackupFile = {
    version: 1,
    app: 'personal-ledger',
    exportedAt: new Date().toISOString(),
    saltB64,
    ivB64: iv,
    ciphertextB64: ciphertext,
    entryCount: entries.length,
  };
  return JSON.stringify(backup, null, 2);
}

export async function importEncryptedVaultFile(
  fileJson: string,
  exportPassphrase: string,
): Promise<Array<{ id: string; label: string; category: string; lastRotatedAt: string; payload: VaultSecretPayload }>> {
  const backup = JSON.parse(fileJson) as EncryptedVaultBackupFile;
  if (backup.app !== 'personal-ledger' || backup.version !== 1) {
    throw new Error('Invalid or unsupported vault backup file format');
  }
  const key = await deriveVaultKey(exportPassphrase, backup.saltB64);
  const jsonStr = await decryptString(key, backup.ivB64, backup.ciphertextB64);
  return JSON.parse(jsonStr);
}
