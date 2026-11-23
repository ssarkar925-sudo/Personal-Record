import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileKey,
  FileText,
  GripVertical,
  History,
  KeyRound,
  Link2,
  Lock,
  MessageSquare,
  Palette,
  Plus,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  api,
  type AccountRecord,
  type VaultEntryCipherRecord,
  type VaultMetaRecord,
} from '../lib/api.ts';
import {
  calculatePasswordStrength,
  createCanary,
  decryptMasterKeyWithRecovery,
  decryptVaultPayload,
  deriveVaultKey,
  encryptMasterKeyWithRecovery,
  encryptVaultPayload,
  exportEncryptedVaultFile,
  generateRecoveryKey,
  generateSaltB64,
  generateStrongPassword,
  hashSecretForAudit,
  importEncryptedVaultFile,
  verifyCanary,
  type VaultExtraSecret,
  type VaultItemType,
  type VaultLegacySecret,
  type VaultSecretPayload,
} from '../lib/crypto.ts';
import { daysBetweenISO, todayISO } from '../lib/format.ts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  Select,
  SortSelect,
  Textarea,
  ViewModeToggle,
  cn,
} from '../components/ui/Primitives.tsx';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';
import { computeVaultSecurityTelemetry } from './notes-vault/notesVaultAnalytics.ts';
import { VaultHeroWorkstation } from './notes-vault/VaultHeroWorkstation.tsx';

interface DecryptedVaultEntry {
  id: string;
  label: string;
  category: string;
  lastRotatedAt: string;
  updatedAt: string;
  payload: VaultSecretPayload;
}

type VaultSort = 'custom_order' | 'starred_first' | 'name_asc' | 'oldest_rotated' | 'updated_desc';
type VaultAuditFilter = 'all' | 'reused' | 'stale' | 'weak' | 'starred';

export const STANDARD_VAULT_CATEGORIES = [
  'Logins',
  'Banking',
  'Identity',
  'Secure Notes',
  'API Keys',
  'Business',
  'Personal',
] as const;

export const CARD_COLORS = [
  { id: 'gold', label: 'Champagne Gold', borderL: 'border-l-[#C59B27]', bg: 'bg-[#FDFBF4]', border: 'border-[#E6D5A7]', text: 'text-[#8C6D1F]', dot: '#D4AF37' },
  { id: 'emerald', label: 'Emerald Green', borderL: 'border-l-emerald-600', bg: 'bg-[#F0FDF4]', border: 'border-emerald-200', text: 'text-emerald-700', dot: '#10B981' },
  { id: 'blue', label: 'Sapphire Blue', borderL: 'border-l-blue-600', bg: 'bg-[#EFF6FF]', border: 'border-blue-200', text: 'text-blue-700', dot: '#3B82F6' },
  { id: 'purple', label: 'Amethyst Purple', borderL: 'border-l-purple-600', bg: 'bg-[#F5F3FF]', border: 'border-purple-200', text: 'text-purple-700', dot: '#8B5CF6' },
  { id: 'rose', label: 'Ruby Rose', borderL: 'border-l-rose-600', bg: 'bg-[#FFF1F2]', border: 'border-rose-200', text: 'text-rose-700', dot: '#F43F5E' },
  { id: 'amber', label: 'Amber Warm', borderL: 'border-l-amber-600', bg: 'bg-[#FFFBEB]', border: 'border-amber-200', text: 'text-amber-700', dot: '#F59E0B' },
  { id: 'obsidian', label: 'Obsidian Slate', borderL: 'border-l-slate-700', bg: 'bg-[#F8FAFC]', border: 'border-slate-300', text: 'text-slate-700', dot: '#334155' },
] as const;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const PRESET_SECRET_TYPES = ['Transaction Password', 'ATM PIN', 'UPI MPIN', 'TPIN', 'App PIN'] as const;

export function VaultView({
  accounts = [],
  systemLanguage = 'en',
  onNotify,
  onNavigate,
  onOpenCloudSync: _onOpenCloudSync,
}: {
  accounts?: AccountRecord[];
  systemLanguage?: AppLanguage;
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
  onNavigate?: (tab: 'dashboard' | 'cards' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'sheets' | 'vault' | 'settings') => void;
  onOpenCloudSync?: () => void;
}) {
  const dict = UI_STRINGS[systemLanguage];
  const [meta, setMeta] = useState<VaultMetaRecord | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<DecryptedVaultEntry[]>([]);
  const [lastActivityAt, setLastActivityAt] = useState<number>(Date.now());
  const [deleteTarget, setDeleteTarget] = useState<DecryptedVaultEntry | null>(null);
  const [deletePermanentTarget, setDeletePermanentTarget] = useState<DecryptedVaultEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<DecryptedVaultEntry | null>(null);
  const [vaultTab, setVaultTab] = useState<'active' | 'archived'>('active');
  const [cardColor, setCardColor] = useState<string>('gold');

  // Display state: category tab + audit filter + search + sort + grid/list + single-card reveal
  const [activeCategory, setActiveCategory] = useState<string>('__auto__');
  const [auditFilter, setAuditFilter] = useState<VaultAuditFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<VaultSort>('custom_order');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Rekey (Change Master Password) modal
  const [rekeyOpen, setRekeyOpen] = useState(false);
  const [currentMasterInput, setCurrentMasterInput] = useState('');
  const [newMasterInput, setNewMasterInput] = useState('');
  const [confirmNewMasterInput, setConfirmNewMasterInput] = useState('');
  const [rekeyError, setRekeyError] = useState('');
  const [rekeyBusy, setRekeyBusy] = useState(false);

  // Recovery Key Display / Emergency Kit Modal
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [activeRecoveryKey, setActiveRecoveryKey] = useState<string>('');

  // Unlock / Setup form
  const [masterPass, setMasterPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  // Forgot Master Password Recovery Dialog
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryTab, setRecoveryTab] = useState<'whatsapp' | 'manual'>('whatsapp');
  const [manualRecoveryKeyInput, setManualRecoveryKeyInput] = useState('');
  const [waRecoveryOtpInput, setWaRecoveryOtpInput] = useState('');
  const [waOtpSent, setWaOtpSent] = useState(false);
  const [waPhoneMasked, setWaPhoneMasked] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveredVaultKey, setRecoveredVaultKey] = useState<CryptoKey | null>(null);
  const [newPasswordAfterRecovery, setNewPasswordAfterRecovery] = useState('');
  const [confirmPasswordAfterRecovery, setConfirmPasswordAfterRecovery] = useState('');

  // Add/Edit Modal State (Pillar 3: Multi-Type Templates)
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DecryptedVaultEntry | null>(null);
  const [itemType, setItemType] = useState<VaultItemType>('login');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('Banking');
  const [starred, setStarred] = useState(false);
  const [linkedAccountId, setLinkedAccountId] = useState<string>('');

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [extraSecrets, setExtraSecrets] = useState<VaultExtraSecret[]>([]);
  const [legacyHistory, setLegacyHistory] = useState<VaultLegacySecret[]>([]);

  // Card fields
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardPin, setCardPin] = useState('');

  // UPI fields
  const [upiVpa, setUpiVpa] = useState('');
  const [upiMpin, setUpiMpin] = useState('');
  const [upiDailyLimit, setUpiDailyLimit] = useState<number | undefined>(undefined);

  // Identity fields
  const [idType, setIdType] = useState('PAN');
  const [idNumber, setIdNumber] = useState('');

  // Pillar 5: Backup Export & Import Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileJson, setImportFileJson] = useState<string>('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importPreviewCount, setImportPreviewCount] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  // Pillar 1: Password Audit Maps (Reused, Weak, Stale)
  const [reusedHashes, setReusedHashes] = useState<Set<string>>(new Set());
  const [entryHashById, setEntryHashById] = useState<Record<string, string>>({});

  const lockVault = () => {
    setVaultKey(null);
    setEntries([]);
    setViewingEntry(null);
    setRevealedKeys({});
    setMasterPass('');
    setCopiedKey(null);
    setRecoveredVaultKey(null);
  };

  useEffect(() => {
    let mounted = true;
    const fetchMeta = () => {
      api
        .getVaultMeta()
        .then((m) => {
          if (mounted) setMeta(m);
        })
        .finally(() => {
          if (mounted) setLoadingMeta(false);
        });
    };

    fetchMeta();
    window.addEventListener('focus', fetchMeta);
    return () => {
      mounted = false;
      window.removeEventListener('focus', fetchMeta);
      setVaultKey(null);
      setEntries([]);
    };
  }, []);

  useEffect(() => {
    if (!vaultKey) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
        lockVault();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [vaultKey, lastActivityAt]);

  const touchActivity = () => setLastActivityAt(Date.now());

  // Re-calculate zero-knowledge password hashes for reused password audit
  useEffect(() => {
    if (!vaultKey || entries.length === 0) {
      setReusedHashes(new Set());
      setEntryHashById({});
      return;
    }

    let isMounted = true;
    void (async () => {
      const counts: Record<string, number> = {};
      const byId: Record<string, string> = {};

      for (const e of entries) {
        const pw = e.payload.password || e.payload.upiMpin || e.payload.cardPin || '';
        if (pw.trim()) {
          const h = await hashSecretForAudit(pw);
          counts[h] = (counts[h] ?? 0) + 1;
          byId[e.id] = h;
        }
      }

      const dupes = new Set<string>();
      for (const [h, count] of Object.entries(counts)) {
        if (count > 1) dupes.add(h);
      }

      if (isMounted) {
        setReusedHashes(dupes);
        setEntryHashById(byId);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [entries, vaultKey]);

  const decryptAllEntries = async (key: CryptoKey, rawEntries: VaultEntryCipherRecord[]) => {
    const out: DecryptedVaultEntry[] = [];
    for (const row of rawEntries) {
      try {
        const payload = await decryptVaultPayload(key, row.iv, row.ciphertext);
        out.push({
          id: row.id,
          label: row.label,
          category: row.category,
          lastRotatedAt: row.lastRotatedAt,
          updatedAt: row.updatedAt,
          payload: {
            ...payload,
            itemType: payload.itemType ?? 'login',
            starred: !!payload.starred,
            secrets: Array.isArray(payload.secrets) ? payload.secrets : [],
            legacyHistory: Array.isArray(payload.legacyHistory) ? payload.legacyHistory : [],
            color: payload.color || 'gold',
            archived: !!payload.archived,
            archivedAt: payload.archivedAt,
            orderIndex: typeof payload.orderIndex === 'number' ? payload.orderIndex : 0,
          },
        });
      } catch {
        // Ignore corrupt/mismatched entry safely
      }
    }
    // Sort by orderIndex
    out.sort((a, b) => (a.payload.orderIndex ?? 0) - (b.payload.orderIndex ?? 0));
    setEntries(out);
  };

  const handleSetupMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (masterPass.length < 8) {
      setError('Master Password must be at least 8 characters.');
      return;
    }
    if (masterPass !== confirmPass) {
      setError('Master Passwords do not match.');
      return;
    }
    setUnlocking(true);
    try {
      const saltB64 = generateSaltB64();
      const key = await deriveVaultKey(masterPass, saltB64);
      const { canaryIv, canaryCt } = await createCanary(key);

      // Generate Emergency Recovery Key and escrow master key
      const recoveryKey = generateRecoveryKey();
      const escrow = await encryptMasterKeyWithRecovery(key, recoveryKey);

      const savedMeta = await api.saveVaultMeta({
        saltB64,
        canaryIv,
        canaryCt,
        recoverySaltB64: escrow.recoverySaltB64,
        recoveryIv: escrow.recoveryIv,
        recoveryCt: escrow.recoveryCt,
        waRecoveryKey: recoveryKey,
      });

      setMeta(savedMeta);
      setVaultKey(key);
      setEntries([]);
      setMasterPass('');
      setConfirmPass('');
      setActiveRecoveryKey(recoveryKey);
      setKitModalOpen(true);
      touchActivity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta) return;
    setError('');
    setUnlocking(true);
    try {
      const key = await deriveVaultKey(masterPass, meta.saltB64);
      const ok = await verifyCanary(key, meta.canaryIv, meta.canaryCt);
      if (!ok) {
        await api.recordVaultEvent('failed_unlock', 'Incorrect master password entered');
        setError('Incorrect Master Password. Failed attempt logged.');
        return;
      }
      await api.recordVaultEvent('vault_unlocked', 'Unlocked locally');
      const cipherEntries = await api.getVaultEntries();
      await decryptAllEntries(key, cipherEntries);
      setVaultKey(key);
      setMasterPass('');

      // If existing vault lacked emergency escrow, generate and save it now
      if (!meta.recoveryCt || !meta.hasWaRecoveryKey) {
        const recoveryKey = generateRecoveryKey();
        const escrow = await encryptMasterKeyWithRecovery(key, recoveryKey);
        const updatedMeta = await api.saveVaultRecovery({
          recoverySaltB64: escrow.recoverySaltB64,
          recoveryIv: escrow.recoveryIv,
          recoveryCt: escrow.recoveryCt,
          waRecoveryKey: recoveryKey,
        });
        setMeta(updatedMeta);
        setActiveRecoveryKey(recoveryKey);
      }

      touchActivity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUnlocking(false);
    }
  };

  // WhatsApp Code Recovery Handlers
  const handleRequestWaOtp = async () => {
    setRecoveryError('');
    setRecoveryBusy(true);
    try {
      const res = await api.requestWhatsAppVaultRecovery();
      setWaOtpSent(true);
      setWaPhoneMasked(res.phoneMasked);
      onNotify?.(`Recovery code sent to WhatsApp (${res.phoneMasked}) ✓`);
    } catch (err) {
      setRecoveryError((err as Error).message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleVerifyWaOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waRecoveryOtpInput.trim()) return;
    setRecoveryError('');
    setRecoveryBusy(true);
    try {
      const res = await api.verifyWhatsAppVaultRecovery(waRecoveryOtpInput.trim());
      // Decrypt master vault key using escrowed recovery key
      const key = await decryptMasterKeyWithRecovery(
        res.recoveryKey,
        res.recoverySaltB64,
        res.recoveryIv,
        res.recoveryCt,
      );
      if (meta && !(await verifyCanary(key, meta.canaryIv, meta.canaryCt))) {
        throw new Error('Canary verification failed with recovered key');
      }
      const cipherEntries = await api.getVaultEntries();
      await decryptAllEntries(key, cipherEntries);
      setRecoveredVaultKey(key);
      onNotify?.('Recovery verified! Set your new Master Password to finalize ✓');
    } catch (err) {
      setRecoveryError((err as Error).message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  // Manual Recovery Key Verification
  const handleVerifyManualRecoveryKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta || !meta.recoverySaltB64 || !meta.recoveryIv || !meta.recoveryCt) {
      setRecoveryError('Vault recovery escrow metadata is missing.');
      return;
    }
    const clean = manualRecoveryKeyInput.trim();
    if (!clean) return;
    setRecoveryError('');
    setRecoveryBusy(true);
    try {
      const key = await decryptMasterKeyWithRecovery(
        clean,
        meta.recoverySaltB64,
        meta.recoveryIv,
        meta.recoveryCt,
      );
      if (!(await verifyCanary(key, meta.canaryIv, meta.canaryCt))) {
        throw new Error('Incorrect Recovery Key. Please double check the code.');
      }
      const cipherEntries = await api.getVaultEntries();
      await decryptAllEntries(key, cipherEntries);
      setRecoveredVaultKey(key);
      onNotify?.('Recovery Key verified! Set your new Master Password to finalize ✓');
    } catch (err) {
      setRecoveryError((err as Error).message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  // Finalize Master Password Reset after Recovery
  const handleFinalizeNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveredVaultKey || !meta) return;
    setRecoveryError('');
    if (newPasswordAfterRecovery.length < 8) {
      setRecoveryError('New Master Password must be at least 8 characters.');
      return;
    }
    if (newPasswordAfterRecovery !== confirmPasswordAfterRecovery) {
      setRecoveryError('New Master Passwords do not match.');
      return;
    }
    setRecoveryBusy(true);
    try {
      const nextSalt = generateSaltB64();
      const nextKey = await deriveVaultKey(newPasswordAfterRecovery, nextSalt);
      const { canaryIv, canaryCt } = await createCanary(nextKey);

      // Re-encrypt all entries under nextKey
      const reEncrypted = await Promise.all(
        entries.map(async (item) => {
          const { iv, ciphertext } = await encryptVaultPayload(nextKey, item.payload);
          return {
            id: item.id,
            label: item.label,
            category: item.category,
            iv,
            ciphertext,
            lastRotatedAt: item.lastRotatedAt,
          };
        }),
      );

      // Generate fresh recovery key
      const freshRecoveryKey = generateRecoveryKey();
      const escrow = await encryptMasterKeyWithRecovery(nextKey, freshRecoveryKey);

      const nextMeta = await api.rekeyVault({
        saltB64: nextSalt,
        canaryIv,
        canaryCt,
        recoverySaltB64: escrow.recoverySaltB64,
        recoveryIv: escrow.recoveryIv,
        recoveryCt: escrow.recoveryCt,
        waRecoveryKey: freshRecoveryKey,
        entries: reEncrypted,
      });

      setMeta(nextMeta);
      setVaultKey(nextKey);
      setActiveRecoveryKey(freshRecoveryKey);
      setRecoveredVaultKey(null);
      setRecoveryModalOpen(false);
      setNewPasswordAfterRecovery('');
      setConfirmPasswordAfterRecovery('');
      setKitModalOpen(true);
      onNotify?.('Master Password reset successfully with 0 data loss ✓');
    } catch (err) {
      setRecoveryError((err as Error).message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  // Modal Open for Add/Edit
  const openEntryModal = (entry: DecryptedVaultEntry | null, defaultType: VaultItemType = 'login') => {
    touchActivity();
    setError('');
    setEditingEntry(entry);

    if (!entry) {
      setItemType(defaultType);
      setLabel('');
      setCategory(
        activeCategory !== '__auto__' &&
          activeCategory !== '__all__' &&
          activeCategory !== '__starred__' &&
          activeCategory !== '__reused__' &&
          activeCategory !== '__stale__' &&
          activeCategory !== '__weak__'
          ? activeCategory
          : defaultType === 'card'
            ? 'Credit Card'
            : defaultType === 'upi'
              ? 'Banking'
              : defaultType === 'identity'
                ? 'Identity'
                : 'Banking',
      );
      setStarred(false);
      setLinkedAccountId('');

      // Login defaults
      setUsername('');
      setPassword(defaultType === 'login' ? generateStrongPassword(18) : '');
      setUrl('');
      setNotes('');
      setExtraSecrets([]);
      setLegacyHistory([]);

      // Card defaults
      setCardHolder('');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardPin('');

      // UPI defaults
      setUpiVpa('');
      setUpiMpin('');
      setUpiDailyLimit(undefined);

      // Identity defaults
      setIdType('PAN');
      setIdNumber('');
      setCardColor('gold');
    } else {
      const p = entry.payload;
      setItemType(p.itemType ?? 'login');
      setLabel(entry.label);
      setCategory(entry.category);
      setStarred(!!p.starred);
      setLinkedAccountId(p.linkedAccountId ?? '');
      setCardColor(p.color || 'gold');

      // Login fields
      setUsername(p.username ?? '');
      setPassword(p.password ?? '');
      setUrl(p.url ?? '');
      setNotes(p.notes ?? '');
      setExtraSecrets((p.secrets ?? []).map((s) => ({ ...s })));
      setLegacyHistory((p.legacyHistory ?? []).map((l) => ({ ...l })));

      // Card fields
      setCardHolder(p.cardHolder ?? '');
      setCardNumber(p.cardNumber ?? '');
      setCardExpiry(p.cardExpiry ?? '');
      setCardCvv(p.cardCvv ?? '');
      setCardPin(p.cardPin ?? '');

      // UPI fields
      setUpiVpa(p.upiVpa ?? '');
      setUpiMpin(p.upiMpin ?? '');
      setUpiDailyLimit(p.upiDailyLimit);

      // Identity fields
      setIdType(p.idType ?? 'PAN');
      setIdNumber(p.idNumber ?? '');
    }
    setEntryModalOpen(true);
  };

  const archiveToLegacy = (secretLabel: string, secretValue: string, noteText?: string) => {
    if (!secretValue.trim()) return;
    setLegacyHistory((prev) => [
      {
        id: crypto.randomUUID(),
        label: secretLabel.trim() || 'Old Password',
        value: secretValue,
        archivedAt: todayISO(),
        note: noteText,
      },
      ...prev,
    ]);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultKey) return;
    setError('');
    touchActivity();
    try {
      const cleanExtras = extraSecrets
        .filter((s) => s.label.trim() && s.value.trim())
        .map((s) => ({ ...s, label: s.label.trim() }));
      const cleanLegacy = legacyHistory
        .filter((l) => l.label.trim() && l.value.trim())
        .map((l) => ({ ...l, label: l.label.trim() }));
      const catClean = category.trim() || 'General';

      const payload: VaultSecretPayload = {
        itemType,
        linkedAccountId: linkedAccountId || null,
        username: username.trim(),
        password,
        url: url.trim(),
        notes: notes.trim(),
        starred,
        secrets: cleanExtras,
        legacyHistory: cleanLegacy,

        // Card
        cardHolder: cardHolder.trim(),
        cardNumber: cardNumber.replace(/\s+/g, ''),
        cardExpiry: cardExpiry.trim(),
        cardCvv: cardCvv.trim(),
        cardPin: cardPin.trim(),

        // UPI
        upiVpa: upiVpa.trim(),
        upiMpin: upiMpin.trim(),
        upiDailyLimit,

        // Identity
        idType,
        idNumber: idNumber.trim(),

        // Color & Archive & Order
        color: cardColor,
        archived: editingEntry ? !!editingEntry.payload.archived : false,
        archivedAt: editingEntry ? editingEntry.payload.archivedAt : undefined,
        orderIndex: editingEntry?.payload.orderIndex ?? entries.length,
      };

      const { iv, ciphertext } = await encryptVaultPayload(vaultKey, payload);
      await api.saveVaultEntry({
        id: editingEntry?.id,
        label: label.trim(),
        category: catClean,
        iv,
        ciphertext,
        lastRotatedAt: todayISO(),
      });

      const raw = await api.getVaultEntries();
      await decryptAllEntries(vaultKey, raw);
      setEntryModalOpen(false);
      setActiveCategory(catClean);
      onNotify?.(`${dict.common.save} ✓`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleArchiveEntry = async (entry: DecryptedVaultEntry) => {
    if (!vaultKey) return;
    touchActivity();
    try {
      const updatedPayload: VaultSecretPayload = {
        ...entry.payload,
        archived: true,
        archivedAt: new Date().toISOString(),
      };
      const { iv, ciphertext } = await encryptVaultPayload(vaultKey, updatedPayload);
      await api.saveVaultEntry({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        iv,
        ciphertext,
        lastRotatedAt: entry.lastRotatedAt,
      });
      const raw = await api.getVaultEntries();
      await decryptAllEntries(vaultKey, raw);
      setViewingEntry(null);
      setDeleteTarget(null);
      onNotify?.(`Moved "${entry.label}" to Archive ✓ (Can be restored anytime)`);
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleRestoreEntry = async (entry: DecryptedVaultEntry) => {
    if (!vaultKey) return;
    touchActivity();
    try {
      const updatedPayload: VaultSecretPayload = {
        ...entry.payload,
        archived: false,
        archivedAt: undefined,
      };
      const { iv, ciphertext } = await encryptVaultPayload(vaultKey, updatedPayload);
      await api.saveVaultEntry({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        iv,
        ciphertext,
        lastRotatedAt: entry.lastRotatedAt,
      });
      const raw = await api.getVaultEntries();
      await decryptAllEntries(vaultKey, raw);
      setViewingEntry(null);
      onNotify?.(`Restored "${entry.label}" to Active Vault ✓`);
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handlePermanentDelete = async (entry: DecryptedVaultEntry) => {
    touchActivity();
    try {
      await api.deleteVaultEntry(entry.id);
      const raw = await api.getVaultEntries();
      if (vaultKey) await decryptAllEntries(vaultKey, raw);
      setViewingEntry(null);
      setDeletePermanentTarget(null);
      onNotify?.(`Permanently deleted "${entry.label}" ✓`);
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleReorderEntries = async (fromIdx: number, toIdx: number, currentList: DecryptedVaultEntry[]) => {
    if (!vaultKey || fromIdx === toIdx) return;
    touchActivity();
    if (fromIdx < 0 || fromIdx >= currentList.length || toIdx < 0 || toIdx >= currentList.length) return;

    const listCopy = [...currentList];
    const [moved] = listCopy.splice(fromIdx, 1);
    listCopy.splice(toIdx, 0, moved);

    const updated = listCopy.map((item, idx) => ({
      ...item,
      payload: {
        ...item.payload,
        orderIndex: idx,
      },
    }));

    // Optimistic local update
    setEntries((prev) => {
      const map = new Map(updated.map((u) => [u.id, u]));
      return prev.map((p) => map.get(p.id) || p);
    });

    try {
      const { iv, ciphertext } = await encryptVaultPayload(vaultKey, {
        ...moved.payload,
        orderIndex: toIdx,
      });
      await api.saveVaultEntry({
        id: moved.id,
        label: moved.label,
        category: moved.category,
        iv,
        ciphertext,
        lastRotatedAt: moved.lastRotatedAt,
      });
      onNotify?.(`Reordered "${moved.label}" ✓`);
    } catch (err) {
      console.error('Failed to persist order', err);
    }
  };

  const handleToggleStar = async (entry: DecryptedVaultEntry) => {
    if (!vaultKey) return;
    touchActivity();
    try {
      const updatedPayload: VaultSecretPayload = {
        ...entry.payload,
        starred: !entry.payload.starred,
      };
      const { iv, ciphertext } = await encryptVaultPayload(vaultKey, updatedPayload);
      await api.saveVaultEntry({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        iv,
        ciphertext,
        lastRotatedAt: entry.lastRotatedAt,
      });
      const raw = await api.getVaultEntries();
      await decryptAllEntries(vaultKey, raw);
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleCopySecret = async (copyKeyId: string, secret: string, secretLabel = 'secret') => {
    touchActivity();
    await navigator.clipboard.writeText(secret);
    setCopiedKey(copyKeyId);
    onNotify?.(`Copied ${secretLabel} (auto-clears clipboard in 30s)`);
    window.setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === secret) {
          await navigator.clipboard.writeText('');
        }
      } catch {
        // Ignore browser clipboard permission errors
      }
      setCopiedKey((cur) => (cur === copyKeyId ? null : cur));
    }, 30_000);
  };

  const handleDownloadEmergencyKit = () => {
    const text =
      `====================================================\n` +
      `       PERSONAL LEDGER - EMERGENCY RECOVERY KIT       \n` +
      `====================================================\n\n` +
      `DO NOT SHARE THIS FILE. STORE IN A SECURE PHYSICAL SAFE.\n\n` +
      `EMERGENCY RECOVERY KEY:\n` +
      `----------------------------------------------------\n` +
      `  ${activeRecoveryKey}\n` +
      `----------------------------------------------------\n\n` +
      `INSTRUCTIONS IF YOU FORGOT YOUR MASTER PASSWORD:\n` +
      `1. Open Personal Ledger and navigate to the Vault login page.\n` +
      `2. Click "Forgot Master Password? Recover with Emergency Key".\n` +
      `3. Enter the recovery key above (or use WhatsApp Code Recovery).\n` +
      `4. Your vault will unlock with zero data loss.\n` +
      `5. Set a new Master Password.\n\n` +
      `Generated on: ${new Date().toLocaleString('en-IN')}\n` +
      `Encryption: AES-256-GCM · PBKDF2 (600,000 rounds)\n` +
      `====================================================\n`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-ledger-emergency-kit-${todayISO()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Downloaded Emergency Kit Card ✓');
  };

  // Pillar 5: Backup Export & Import Handlers
  const handleExportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPassphrase.trim() || entries.length === 0) return;
    setExportBusy(true);
    try {
      const exportedJson = await exportEncryptedVaultFile(exportPassphrase, entries);
      const blob = new Blob([exportedJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-ledger-vault-${todayISO()}.plvault`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
      setExportPassphrase('');
      onNotify?.(`Exported ${entries.length} encrypted vault items (.plvault) ✓`);
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setExportBusy(false);
    }
  };

  const handleImportPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFileJson || !importPassphrase.trim()) return;
    setImportError('');
    setImportBusy(true);
    try {
      const imported = await importEncryptedVaultFile(importFileJson, importPassphrase);
      setImportPreviewCount(imported.length);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!vaultKey || !importFileJson || !importPassphrase.trim()) return;
    setImportBusy(true);
    setImportError('');
    try {
      const imported = await importEncryptedVaultFile(importFileJson, importPassphrase);

      if (importMode === 'replace') {
        for (const e of entries) {
          await api.deleteVaultEntry(e.id);
        }
      }

      for (const item of imported) {
        const { iv, ciphertext } = await encryptVaultPayload(vaultKey, item.payload);
        await api.saveVaultEntry({
          label: item.label,
          category: item.category || 'General',
          iv,
          ciphertext,
          lastRotatedAt: item.lastRotatedAt || todayISO(),
        });
      }

      const raw = await api.getVaultEntries();
      await decryptAllEntries(vaultKey, raw);
      setImportModalOpen(false);
      setImportFileJson('');
      setImportPassphrase('');
      setImportPreviewCount(null);
      onNotify?.(`Imported ${imported.length} items successfully into vault ✓`);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  // Rekey Master Password Handler
  const handleRekeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta) return;
    setRekeyError('');
    if (newMasterInput.length < 8) {
      setRekeyError('New Master Password must be at least 8 characters.');
      return;
    }
    if (newMasterInput !== confirmNewMasterInput) {
      setRekeyError('New Master Passwords do not match.');
      return;
    }
    setRekeyBusy(true);
    try {
      const oldKey = await deriveVaultKey(currentMasterInput, meta.saltB64);
      const ok = await verifyCanary(oldKey, meta.canaryIv, meta.canaryCt);
      if (!ok) {
        await api.recordVaultEvent('failed_unlock', 'Wrong current password on rekey');
        setRekeyError('Current Master Password is incorrect.');
        return;
      }

      const nextSalt = generateSaltB64();
      const nextKey = await deriveVaultKey(newMasterInput, nextSalt);
      const { canaryIv, canaryCt } = await createCanary(nextKey);

      const reEncrypted = await Promise.all(
        entries.map(async (item) => {
          const { iv, ciphertext } = await encryptVaultPayload(nextKey, item.payload);
          return {
            id: item.id,
            label: item.label,
            category: item.category,
            iv,
            ciphertext,
            lastRotatedAt: todayISO(),
          };
        }),
      );

      // Re-escrow under fresh recovery key
      const freshRecoveryKey = generateRecoveryKey();
      const escrow = await encryptMasterKeyWithRecovery(nextKey, freshRecoveryKey);

      const nextMeta = await api.rekeyVault({
        saltB64: nextSalt,
        canaryIv,
        canaryCt,
        recoverySaltB64: escrow.recoverySaltB64,
        recoveryIv: escrow.recoveryIv,
        recoveryCt: escrow.recoveryCt,
        waRecoveryKey: freshRecoveryKey,
        entries: reEncrypted,
      });

      setMeta(nextMeta);
      setVaultKey(nextKey);
      setActiveRecoveryKey(freshRecoveryKey);
      const raw = await api.getVaultEntries();
      await decryptAllEntries(nextKey, raw);
      setRekeyOpen(false);
      setCurrentMasterInput('');
      setNewMasterInput('');
      setConfirmNewMasterInput('');
      setKitModalOpen(true);
      onNotify?.('Master Password rotated & all secrets re-encrypted ✓');
    } catch (err) {
      setRekeyError((err as Error).message);
    } finally {
      setRekeyBusy(false);
    }
  };

  // If loading security metadata
  if (loadingMeta) {
    return (
      <Card className="p-8 text-center text-sm text-[#686E78] border-[#E6E1D6] bg-white">
        Checking local vault cryptographic metadata...
      </Card>
    );
  }

  // 1. Vault Login / Unlock Page (12-Column Institutional Cryptographic Terminal)
  if (!vaultKey) {
    return (
      <div className="space-y-4 animate-panel-in">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left 5 Columns: 3D Metallic AES-256-GCM Hardware Key Card */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#111318]">
                    Zero-Knowledge Vault
                  </h2>
                  <p className="text-[11px] text-[#686E78]">
                    Client-Side AES-256-GCM Cryptographic Enclave
                  </p>
                </div>
              </div>
              <span className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#8C6D1F]">
                {meta ? 'SEALED ENCLAVE' : 'UNINITIALIZED'}
              </span>
            </div>

            <div className="relative rounded-2xl p-5 text-[#111318] overflow-hidden select-none border border-[#E6E1D6] bg-[#FDFBF7] shadow-xs">
              <div className="relative z-10 flex flex-col justify-between min-h-[205px] gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] bg-[#F3EFEA] text-[#8C6D1F] border border-[#E6E1D6]">
                      <Lock className="h-3 w-3" />
                      AES-256-GCM · PBKDF2
                    </div>
                    <h3
                      className="mt-2 text-lg font-bold tracking-tight text-[#111318]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {meta ? 'Encrypted Security Enclave' : 'Provision New Vault Keycard'}
                    </h3>
                  </div>
                  <div className="h-9 w-11 rounded-lg border border-[#D6CFC2] bg-white shadow-2xs flex items-center justify-center shrink-0">
                    <div className="h-5 w-7 rounded-xs border border-[#D6CFC2] grid grid-cols-2 gap-0.5 p-0.5 bg-[#FAF8F5]">
                      <span className="bg-[#C59B27]/60 rounded-[1px]" />
                      <span className="bg-[#C59B27]/40 rounded-[1px]" />
                      <span className="bg-[#C59B27]/40 rounded-[1px]" />
                      <span className="bg-[#C59B27]/60 rounded-[1px]" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white border border-[#E6E1D6] px-3 py-2 shadow-2xs">
                    <div className="text-[10px] uppercase tracking-wider text-[#686E78]">KDF Rounds</div>
                    <div className="mt-0.5 text-sm font-mono font-bold text-[#8C6D1F]">600,000</div>
                  </div>
                  <div className="rounded-xl bg-white border border-[#E6E1D6] px-3 py-2 shadow-2xs">
                    <div className="text-[10px] uppercase tracking-wider text-[#686E78]">Cipher</div>
                    <div className="mt-0.5 text-sm font-mono font-bold text-emerald-700">256-Bit</div>
                  </div>
                  <div className="rounded-xl bg-white border border-[#E6E1D6] px-3 py-2 shadow-2xs">
                    <div className="text-[10px] uppercase tracking-wider text-[#686E78]">Auto-Lock</div>
                    <div className="mt-0.5 text-sm font-mono font-bold text-[#111318]">5 Min</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#EAE5DC] text-[11px] text-[#686E78] font-mono">
                  <span>ZERO PLAINTEXT STORAGE</span>
                  <span className="text-[#8C6D1F] font-semibold">PLVK ESCROW READY</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-[#4B5058]">
              <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-3 py-2">
                <span className="font-semibold text-[#111318] block">In-Memory Key</span>
                <span>Master key never leaves browser WebCrypto RAM</span>
              </div>
              <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-3 py-2">
                <span className="font-semibold text-[#111318] block">Zero Data Loss</span>
                <span>Emergency Recovery Key (PLVK) + WhatsApp OTP</span>
              </div>
            </div>
          </div>

          {/* Right 7 Columns: Master Password Unlock / Setup Form */}
          <Card className="lg:col-span-7 p-6 sm:p-7 border border-[#E6E1D6] bg-white flex flex-col justify-between space-y-5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-[#E6E1D6] pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shadow-xs">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2
                      className="text-lg font-bold text-[#111318]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {meta ? dict.vault.unlockTitle : dict.vault.setupTitle}
                    </h2>
                    <p className="text-xs text-[#686E78]">
                      Encrypted locally via AES-256-GCM · PBKDF2-SHA256 (600,000 iterations)
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  WebCrypto Verified
                </span>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {!meta ? (
                <form onSubmit={handleSetupMaster} className="space-y-4">
                  <p className="text-xs text-[#4B5058] leading-relaxed bg-[#FAF8F5] border border-[#E6E1D6] rounded-xl p-3">
                    Your Master Password derives a 256-bit AES-GCM key exclusively inside browser memory. An Emergency
                    Recovery Key (<code className="font-mono text-[#8C6D1F]">PLVK-XXXX</code>) is generated automatically
                    so you can always recover your credentials with zero data loss.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="vault-setup-pw">New Master Password (min 8 chars)</FieldLabel>
                      <Input
                        id="vault-setup-pw"
                        type="password"
                        value={masterPass}
                        onChange={(e) => setMasterPass(e.target.value)}
                        placeholder="Enter strong master password"
                        autoFocus
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="vault-setup-confirm">Confirm Master Password</FieldLabel>
                      <Input
                        id="vault-setup-confirm"
                        type="password"
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        placeholder="Re-enter master password"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    type="submit"
                    className="w-full bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318] py-2.5"
                    disabled={unlocking}
                  >
                    <ShieldCheck className="h-4 w-4 text-[#E5C158]" />
                    {unlocking ? 'Deriving 256-bit Key...' : dict.vault.createBtn}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleUnlock} className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="vault-unlock-pw">Master Password</FieldLabel>
                    <Input
                      id="vault-unlock-pw"
                      type="password"
                      value={masterPass}
                      onChange={(e) => setMasterPass(e.target.value)}
                      placeholder="Enter Master Password to unseal vault..."
                      autoFocus
                      required
                    />
                  </div>
                  <Button
                    variant="primary"
                    type="submit"
                    className="w-full bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318] py-2.5"
                    disabled={unlocking}
                  >
                    <Unlock className="h-4 w-4 text-[#E5C158]" />
                    {unlocking ? 'Verifying Key...' : dict.vault.unlockBtn}
                  </Button>

                  {/* Forgot Password & Recovery Link */}
                  <div className="pt-3 text-center border-t border-[#E6E1D6]">
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryError('');
                        setWaOtpSent(false);
                        setWaRecoveryOtpInput('');
                        setManualRecoveryKeyInput('');
                        setRecoveredVaultKey(null);
                        setRecoveryModalOpen(true);
                      }}
                      className="text-xs text-[#8C6D1F] hover:text-[#111318] font-semibold underline cursor-pointer"
                    >
                      Forgot Master Password? Recover with Emergency Key or WhatsApp OTP
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="pt-3 border-t border-[#E6E1D6] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#686E78]">
              <span>Supports Banking Logins · Credit/Debit Cards · UPI MPINs · PAN/Aadhaar IDs · Secret Notes</span>
              <span className="font-mono text-[#111318] font-semibold">Clipboard Auto-Scrub: 30s</span>
            </div>
          </Card>
        </div>

        {/* Forgot Password Recovery Modal */}
        <Dialog
          open={recoveryModalOpen}
          onClose={() => setRecoveryModalOpen(false)}
          title="Vault Emergency Recovery"
          maxWidth="max-w-md"
        >
          {!recoveredVaultKey ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Zero-Knowledge Recovery decrypts your master vault key and unlocks all your passwords, cards, and bank
                details with <strong>zero data loss</strong>.
              </p>

              {recoveryError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {/* Tab Selector: WhatsApp Code Recovery vs Manual Emergency Key */}
              <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryTab('whatsapp');
                    setRecoveryError('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5',
                    recoveryTab === 'whatsapp' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  <span>WhatsApp Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryTab('manual');
                    setRecoveryError('');
                  }}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5',
                    recoveryTab === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <FileKey className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Recovery Key (PLVK)</span>
                </button>
              </div>

              {recoveryTab === 'whatsapp' ? (
                <div className="space-y-3 pt-1">
                  {!waOtpSent ? (
                    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-center">
                      <div className="mx-auto h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Send Recovery Code to WhatsApp</h4>
                        <p className="text-[11px] text-slate-600 mt-1">
                          A 6-digit verification code will be sent to your connected WhatsApp number.
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={handleRequestWaOtp}
                        disabled={recoveryBusy}
                        className="w-full text-xs"
                      >
                        {recoveryBusy ? 'Sending Code...' : 'Send WhatsApp Recovery Code'}
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleVerifyWaOtp} className="space-y-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900 flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Code sent to {waPhoneMasked}. Enter the 6 digits below:</span>
                      </div>
                      <div>
                        <FieldLabel htmlFor="wa-otp-input">6-Digit WhatsApp Code</FieldLabel>
                        <Input
                          id="wa-otp-input"
                          type="text"
                          maxLength={6}
                          value={waRecoveryOtpInput}
                          onChange={(e) => setWaRecoveryOtpInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 749281"
                          autoFocus
                          required
                          className="font-mono text-center tracking-widest text-base"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={handleRequestWaOtp}
                          disabled={recoveryBusy}
                          className="text-xs"
                        >
                          Resend Code
                        </Button>
                        <Button variant="primary" type="submit" disabled={recoveryBusy} className="flex-1 text-xs">
                          {recoveryBusy ? 'Verifying...' : 'Verify Code & Recover'}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleVerifyManualRecoveryKey} className="space-y-3 pt-1">
                  <div>
                    <FieldLabel htmlFor="manual-rec-input">Emergency Recovery Key</FieldLabel>
                    <Input
                      id="manual-rec-input"
                      type="text"
                      value={manualRecoveryKeyInput}
                      onChange={(e) => setManualRecoveryKeyInput(e.target.value.toUpperCase())}
                      placeholder="PLVK-XXXX-XXXX-XXXX-XXXX"
                      autoFocus
                      required
                      className="font-mono text-xs uppercase"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      From your saved Emergency Kit Card (e.g. <code>PLVK-8F92-K92B-W031-X7P2</code>).
                    </p>
                  </div>
                  <Button variant="primary" type="submit" disabled={recoveryBusy} className="w-full text-xs">
                    {recoveryBusy ? 'Verifying Key...' : 'Verify Key & Unlock Vault'}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            /* Set New Master Password Form once Recovery Key is Verified */
            <form onSubmit={handleFinalizeNewPassword} className="space-y-3.5">
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950 flex items-start gap-2.5">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Recovery Verified Successfully!</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    All {entries.length} items recovered with zero data loss. Set your new Master Password to re-secure
                    your vault.
                  </p>
                </div>
              </div>

              {recoveryError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {recoveryError}
                </div>
              )}

              <div>
                <FieldLabel htmlFor="new-pw-after-rec">New Master Password (min 8 chars)</FieldLabel>
                <Input
                  id="new-pw-after-rec"
                  type="password"
                  value={newPasswordAfterRecovery}
                  onChange={(e) => setNewPasswordAfterRecovery(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="confirm-pw-after-rec">Confirm New Master Password</FieldLabel>
                <Input
                  id="confirm-pw-after-rec"
                  type="password"
                  value={confirmPasswordAfterRecovery}
                  onChange={(e) => setConfirmPasswordAfterRecovery(e.target.value)}
                  required
                />
              </div>

              <Button variant="primary" type="submit" disabled={recoveryBusy} className="w-full text-xs">
                {recoveryBusy ? 'Re-encrypting Vault...' : 'Save New Master Password & Enter Vault'}
              </Button>
            </form>
          )}
        </Dialog>
      </div>
    );
  }

  // 2. Unlocked Vault View: Health Audit, Categories, Items Grid
  const vaultTelemetry = computeVaultSecurityTelemetry(
    entries,
    reusedHashes,
    entryHashById,
    todayISO(),
  );
  const {
    totalItems,
    starredCount,
    weakCount,
    staleCount,
    reusedCount,
    healthScore,
  } = vaultTelemetry;

  const activeEntries = entries.filter((e) => !e.payload.archived);
  const archivedEntries = entries.filter((e) => Boolean(e.payload.archived));
  const currentPool = vaultTab === 'active' ? activeEntries : archivedEntries;

  // Always show all standard categories + any user-created custom categories
  const allKnownCategories = Array.from(
    new Set([
      ...STANDARD_VAULT_CATEGORIES,
      ...entries.map((e) => e.category).filter(Boolean),
    ]),
  );

  const categoryCounts = new Map<string, number>();
  for (const cat of allKnownCategories) {
    const c = activeEntries.filter(
      (e) => e.category.toLowerCase() === cat.toLowerCase(),
    ).length;
    categoryCounts.set(cat, c);
  }

  const resolvedCategory =
    activeCategory !== '__auto__'
      ? activeCategory
      : starredCount > 0
        ? '__starred__'
        : '__all__';

  const filtered = currentPool
    .filter((e) => {
      // Audit filter pills (apply in active tab)
      if (vaultTab === 'active') {
        if (auditFilter === 'reused') {
          const h = entryHashById[e.id];
          if (!h || !reusedHashes.has(h)) return false;
        } else if (auditFilter === 'weak') {
          const pw = e.payload.password || e.payload.upiMpin || e.payload.cardPin || '';
          if (calculatePasswordStrength(pw).label !== 'Weak') return false;
        } else if (auditFilter === 'stale') {
          if (daysBetweenISO(e.lastRotatedAt, todayISO()) <= 90) return false;
        } else if (auditFilter === 'starred') {
          if (!e.payload.starred) return false;
        }
      }

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchExtras = (e.payload.secrets ?? []).some((s) => s.label.toLowerCase().includes(q));
        const matchCard = (e.payload.cardNumber ?? '').includes(q);
        const matchUpi = (e.payload.upiVpa ?? '').toLowerCase().includes(q);
        const matchId = (e.payload.idNumber ?? '').toLowerCase().includes(q);
        return (
          e.label.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.payload.username.toLowerCase().includes(q) ||
          matchExtras ||
          matchCard ||
          matchUpi ||
          matchId
        );
      }

      // Category filter (in active tab)
      if (vaultTab === 'active') {
        if (resolvedCategory === '__starred__') return !!e.payload.starred;
        if (resolvedCategory !== '__all__' && resolvedCategory !== '__auto__') {
          return e.category.toLowerCase() === resolvedCategory.toLowerCase();
        }
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'custom_order') {
        return (a.payload.orderIndex ?? 0) - (b.payload.orderIndex ?? 0);
      }
      if (sortBy === 'starred_first') {
        const as = a.payload.starred ? 1 : 0;
        const bs = b.payload.starred ? 1 : 0;
        return bs - as || (a.payload.orderIndex ?? 0) - (b.payload.orderIndex ?? 0) || a.label.localeCompare(b.label);
      }
      if (sortBy === 'oldest_rotated') return a.lastRotatedAt.localeCompare(b.lastRotatedAt);
      if (sortBy === 'updated_desc') return b.updatedAt.localeCompare(a.updatedAt);
      return (a.payload.orderIndex ?? 0) - (b.payload.orderIndex ?? 0) || a.label.localeCompare(b.label);
    });

  const renderSecretRow = (
    uniqueId: string,
    secretLabel: string,
    secretValue: string,
    subNote?: string,
  ) => {
    const shown = !!revealedKeys[uniqueId];
    const copied = copiedKey === uniqueId;
    return (
      <div
        key={uniqueId}
        className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-3 py-2 flex items-center justify-between gap-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#111318]">{secretLabel}</span>
            {subNote && <span className="text-[10px] text-[#686E78]">· {subNote}</span>}
          </div>
          <div className="font-mono text-xs text-[#111318] truncate mt-0.5 select-all">
            {shown ? secretValue : '••••••••••••'}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setRevealedKeys((prev) => ({ ...prev, [uniqueId]: !prev[uniqueId] }))}
            aria-label={shown ? `Hide ${secretLabel}` : `Reveal ${secretLabel}`}
            className="rounded-md p-1.5 text-[#686E78] hover:bg-white hover:text-[#111318] cursor-pointer"
          >
            {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void handleCopySecret(uniqueId, secretValue, secretLabel)}
            aria-label={`Copy ${secretLabel}`}
            className="rounded-md p-1.5 text-[#686E78] hover:bg-white hover:text-[#8C6D1F] cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-panel-in" onClick={touchActivity}>
      {/* Module 6: 3D-Tilt Metallic AES-256-GCM Security Card + Interactive SVG Health Gauge */}
      <VaultHeroWorkstation
        telemetry={vaultTelemetry}
        auditFilter={auditFilter}
        onAuditFilterChange={setAuditFilter}
        onOpenNewItem={() => openEntryModal(null, 'login')}
        onOpenEmergencyKit={() => setKitModalOpen(true)}
        onLockVault={lockVault}
      />

      {/* Top Security & Health Audit Bar (Pillar 1) */}
      <Card className="p-3.5 border-[#E6E1D6] bg-white shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#111318]">{dict.vault.unlockedBanner}</span>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-mono font-bold border',
                    healthScore >= 80
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : healthScore >= 60
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200',
                  )}
                >
                  Health: {healthScore}/100 · {healthScore >= 80 ? 'Strong' : healthScore >= 60 ? 'Moderate' : 'Needs Review'}
                </span>
              </div>
              <div className="text-[11px] text-[#686E78] mt-0.5">
                1-card reveal mode · Auto-locks in 5 min · Clipboard auto-clears in 30s
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-36 sm:w-44 h-8 text-xs bg-white"
              placeholder={dict.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SortSelect
              label={dict.common.sortBy}
              value={sortBy}
              onChange={(v) => setSortBy(v as VaultSort)}
              options={[
                { value: 'custom_order', label: 'Custom Drag Order' },
                { value: 'starred_first', label: 'Starred First' },
                { value: 'name_asc', label: 'Name: A → Z' },
                { value: 'oldest_rotated', label: 'Rotation Needed First' },
                { value: 'updated_desc', label: 'Recently Updated' },
              ]}
            />
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              gridLabel={dict.common.gridView}
              listLabel={dict.common.listView}
            />

            {/* Add Item with Templates Dropdown (Pillar 3) */}
            <div className="relative group">
              <Button
                variant="primary"
                size="sm"
                className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
                onClick={() => openEntryModal(null, 'login')}
              >
                <Plus className="h-3.5 w-3.5 text-[#E5C158]" /> + New Item
              </Button>
            </div>

            {onNavigate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('settings')}
                title="Manage Master Password Rekey, Emergency Recovery Kit, and Encrypted Backups in Settings"
                className="gap-1.5 text-xs text-slate-700 hover:text-slate-900 border-[#D6CFC2] bg-[#F3EFEA]"
              >
                <Shield className="h-3.5 w-3.5 text-[#C59B27]" />
                <span>Vault Security in Settings</span>
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={lockVault}>
              <Lock className="h-3.5 w-3.5" /> {dict.vault.lockNow}
            </Button>
          </div>
        </div>

        {/* Security Health Audit Filter Pills (Pillar 1) */}
        <div className="mt-3 pt-2.5 border-t border-[#E6E1D6] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-[#686E78] uppercase tracking-wider mr-1">Audit:</span>
            <button
              type="button"
              onClick={() => setAuditFilter('all')}
              className={cn(
                'rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors',
                auditFilter === 'all'
                  ? 'bg-[#111318] text-white'
                  : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] hover:bg-white',
              )}
            >
              All ({totalItems})
            </button>
            <button
              type="button"
              onClick={() => setAuditFilter(auditFilter === 'reused' ? 'all' : 'reused')}
              className={cn(
                'rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1',
                auditFilter === 'reused'
                  ? 'bg-amber-600 text-white'
                  : reusedCount > 0
                    ? 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
                    : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#686E78]',
              )}
            >
              <span>⚠️ Reused</span>
              <span className="font-bold">({reusedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setAuditFilter(auditFilter === 'stale' ? 'all' : 'stale')}
              className={cn(
                'rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1',
                auditFilter === 'stale'
                  ? 'bg-amber-700 text-white'
                  : staleCount > 0
                    ? 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
                    : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#686E78]',
              )}
            >
              <span>⏳ Stale &gt;90d</span>
              <span className="font-bold">({staleCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setAuditFilter(auditFilter === 'weak' ? 'all' : 'weak')}
              className={cn(
                'rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1',
                auditFilter === 'weak'
                  ? 'bg-rose-700 text-white'
                  : weakCount > 0
                    ? 'bg-rose-50 border border-rose-300 text-rose-900 hover:bg-rose-100'
                    : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#686E78]',
              )}
            >
              <span>🔴 Weak</span>
              <span className="font-bold">({weakCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setAuditFilter(auditFilter === 'starred' ? 'all' : 'starred')}
              className={cn(
                'rounded-lg px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1',
                auditFilter === 'starred'
                  ? 'bg-[#C59B27] text-white'
                  : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] hover:bg-white',
              )}
            >
              <span>★ Starred</span>
              <span className="font-bold">({starredCount})</span>
            </button>
          </div>

          {/* Quick Template Launchers (Pillar 3) */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-[#686E78] mr-1 hidden sm:inline">+ Fast Add:</span>
            <button
              type="button"
              onClick={() => openEntryModal(null, 'login')}
              className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-medium text-[#111318] hover:bg-white cursor-pointer inline-flex items-center gap-1"
            >
              <KeyRound className="h-3 w-3 text-[#8C6D1F]" /> Login
            </button>
            <button
              type="button"
              onClick={() => openEntryModal(null, 'card')}
              className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-medium text-[#111318] hover:bg-white cursor-pointer inline-flex items-center gap-1"
            >
              <CreditCard className="h-3 w-3 text-emerald-600" /> Card
            </button>
            <button
              type="button"
              onClick={() => openEntryModal(null, 'upi')}
              className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-medium text-[#111318] hover:bg-white cursor-pointer inline-flex items-center gap-1"
            >
              <Smartphone className="h-3 w-3 text-teal-600" /> UPI
            </button>
            <button
              type="button"
              onClick={() => openEntryModal(null, 'identity')}
              className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-medium text-[#111318] hover:bg-white cursor-pointer inline-flex items-center gap-1"
            >
              <FileKey className="h-3 w-3 text-[#111318]" /> ID
            </button>
            <button
              type="button"
              onClick={() => openEntryModal(null, 'note')}
              className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-medium text-[#111318] hover:bg-white cursor-pointer inline-flex items-center gap-1"
            >
              <FileText className="h-3 w-3 text-[#686E78]" /> Note
            </button>
          </div>
        </div>

        {/* Category Tabs & Archive Toggle - ALWAYS shows all categories */}
        <div className="mt-2.5 pt-2 border-t border-[#E6E1D6] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setVaultTab('active');
                setActiveCategory('__all__');
              }}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors',
                vaultTab === 'active' && resolvedCategory === '__all__'
                  ? 'bg-[#111318] text-[#E5C158] shadow-xs'
                  : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] hover:bg-white',
              )}
            >
              All Categories ({activeEntries.length})
            </button>
            {allKnownCategories.map((cat) => {
              const count = categoryCounts.get(cat) ?? 0;
              const isSel = vaultTab === 'active' && resolvedCategory.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setVaultTab('active');
                    setActiveCategory(cat);
                  }}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5',
                    isSel
                      ? 'bg-[#111318] text-[#E5C158] shadow-xs font-semibold'
                      : 'bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] hover:bg-white',
                  )}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Archive Toggle Button */}
          <button
            type="button"
            onClick={() => setVaultTab(vaultTab === 'active' ? 'archived' : 'active')}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 border',
              vaultTab === 'archived'
                ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                : archivedEntries.length > 0
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-[#FAF8F5] text-[#686E78] border-[#E6E1D6] hover:text-[#111318]',
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Vault Archive</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
              {archivedEntries.length}
            </span>
          </button>
        </div>
      </Card>

      {/* 3. Items Display Grid / List */}
      {vaultTab === 'archived' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              <strong>Vault Archive Mode:</strong> Showing {archivedEntries.length} archived credentials. Click any card to view, restore to active, or permanently delete.
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setVaultTab('active')}
            className="h-7 text-xs bg-white text-[#111318] border-[#E6E1D6]"
          >
            ← Back to Active Vault
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-xs text-[#686E78] border-[#E6E1D6] bg-white space-y-2">
          <p>
            {vaultTab === 'archived'
              ? 'No credentials currently in the archive.'
              : auditFilter !== 'all'
                ? `No vault items matched the audit filter "${auditFilter}".`
                : 'No credentials stored in this category yet. Click "+ New Item" above to add one.'}
          </p>
        </Card>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5'
              : 'space-y-2.5'
          }
        >
          {filtered.map((entry, index) => {
            const daysSinceRotated = daysBetweenISO(entry.lastRotatedAt, todayISO());
            const needsRotation = daysSinceRotated > 90;
            const itemT = entry.payload.itemType ?? 'login';
            const h = entryHashById[entry.id];
            const isReused = h ? reusedHashes.has(h) : false;

            // Password strength calculation
            const primarySecret = entry.payload.password || entry.payload.upiMpin || entry.payload.cardPin || '';
            const strength = primarySecret ? calculatePasswordStrength(primarySecret) : null;

            // Color preset
            const cardTheme = CARD_COLORS.find((c) => c.id === entry.payload.color) || CARD_COLORS[0];

            return (
              <div
                key={entry.id}
                draggable={vaultTab === 'active'}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(index));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                  if (!isNaN(fromIdx) && fromIdx !== index) {
                    void handleReorderEntries(fromIdx, index, filtered);
                  }
                }}
                onClick={() => setViewingEntry(entry)}
                className={cn(
                  'studio-card-hover group relative rounded-2xl border p-3.5 h-[210px] min-h-[210px] max-h-[210px] flex flex-col justify-between cursor-pointer transition-all border-l-4 shadow-[0_4px_16px_-6px_rgba(17,19,24,0.08)] hover:shadow-md select-none',
                  cardTheme.bg,
                  cardTheme.border,
                  cardTheme.borderL,
                  entry.payload.starred && 'ring-1 ring-amber-400',
                )}
              >
                {/* Header (32px) */}
                <div className="flex items-center justify-between gap-1.5 h-8 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {vaultTab === 'active' && (
                      <div
                        className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 -ml-1 rounded shrink-0"
                        title="Drag to reorder card"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="shrink-0">
                      {itemT === 'card' ? (
                        <CreditCard className="h-4 w-4 text-emerald-600" />
                      ) : itemT === 'upi' ? (
                        <Smartphone className="h-4 w-4 text-teal-600" />
                      ) : itemT === 'identity' ? (
                        <FileKey className="h-4 w-4 text-blue-600" />
                      ) : itemT === 'note' ? (
                        <FileText className="h-4 w-4 text-slate-600" />
                      ) : (
                        <KeyRound className="h-4 w-4 text-[#8C6D1F]" />
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-[#111318] truncate flex-1" title={entry.label}>
                      {entry.label}
                    </h3>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {vaultTab === 'active' && (
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => {
                            if (index > 0) void handleReorderEntries(index, index - 1, filtered);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-black/5 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          title="Move Left / Earlier"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === filtered.length - 1}
                          onClick={() => {
                            if (index < filtered.length - 1) void handleReorderEntries(index, index + 1, filtered);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-black/5 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          title="Move Right / Later"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div
                      className="h-2.5 w-2.5 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: cardTheme.dot }}
                      title={`Card Accent: ${cardTheme.label}`}
                    />
                    <button
                      type="button"
                      onClick={() => void handleToggleStar(entry)}
                      className={cn(
                        'p-1 rounded-md cursor-pointer transition-colors shrink-0',
                        entry.payload.starred ? 'text-[#C59B27]' : 'text-slate-300 hover:text-[#C59B27]',
                      )}
                      title={entry.payload.starred ? 'Starred' : 'Star'}
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                    {vaultTab === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleArchiveEntry(entry)}
                        className="p-1 rounded text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer shrink-0"
                        title="Move to Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletePermanentTarget(entry)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        title="Permanently Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Middle Body (~110px) */}
                <div className="my-auto py-1 space-y-1.5 overflow-hidden text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className="bg-white/80 text-[#111318] border-[#E6E1D6] text-[10px] py-0 px-1.5 font-medium truncate max-w-[120px]">
                      {entry.category}
                    </Badge>
                    {itemT !== 'login' && (
                      <span className="rounded bg-white/80 border border-[#E6E1D6] px-1.5 py-0 text-[10px] font-semibold text-[#8C6D1F] uppercase">
                        {itemT}
                      </span>
                    )}
                    {entry.payload.archived && (
                      <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0 text-[10px] font-bold">
                        Archived
                      </span>
                    )}
                  </div>

                  {/* Primary credential preview */}
                  <div className="text-xs text-[#111318] truncate font-medium">
                    {itemT === 'login' && <span>👤 {entry.payload.username || 'No username'}</span>}
                    {itemT === 'card' && (
                      <span className="font-mono">💳 •••• •••• •••• {entry.payload.cardNumber ? entry.payload.cardNumber.slice(-4) : '••••'}</span>
                    )}
                    {itemT === 'upi' && <span className="font-mono">📱 {entry.payload.upiVpa || 'UPI VPA'}</span>}
                    {itemT === 'identity' && (
                      <span className="font-mono">🪪 {entry.payload.idType || 'ID'}: •••• {entry.payload.idNumber ? entry.payload.idNumber.slice(-4) : '••••'}</span>
                    )}
                    {itemT === 'note' && (
                      <span className="line-clamp-2 text-[11px] text-[#52504C]">{entry.payload.notes || 'Secure note entry...'}</span>
                    )}
                  </div>

                  {/* Secondary info preview */}
                  <div className="text-[11px] text-[#686E78] truncate">
                    {itemT === 'login' && (
                      <span>{entry.payload.url ? `🔗 ${entry.payload.url.replace(/^https?:\/\//i, '')}` : '—'}</span>
                    )}
                    {itemT === 'card' && (
                      <span>Exp: {entry.payload.cardExpiry || '—'} {entry.payload.cardHolder ? `• ${entry.payload.cardHolder}` : ''}</span>
                    )}
                    {itemT === 'upi' && (
                      <span>{entry.payload.upiDailyLimit ? `Limit: ₹${entry.payload.upiDailyLimit.toLocaleString('en-IN')}` : 'Instant UPI'}</span>
                    )}
                    {itemT === 'identity' && <span>Gov ID Document</span>}
                  </div>

                  {/* Status audit tags */}
                  <div className="flex items-center gap-1 text-[10px]">
                    {strength && (
                      <span className={cn('rounded px-1.5 py-0.2 border font-medium', strength.badgeClass)}>
                        {strength.label}
                      </span>
                    )}
                    {isReused && (
                      <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 font-bold text-amber-900">
                        Reused
                      </span>
                    )}
                    {needsRotation && (
                      <span className="rounded bg-amber-50 border border-amber-300 px-1.5 py-0.2 font-medium text-amber-800">
                        Rotate &gt;90d
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer (28px) */}
                <div className="pt-2 border-t border-[#E6E1D6]/60 flex items-center justify-between text-[11px] text-[#686E78] h-7 shrink-0">
                  <span className={cn(needsRotation && 'text-amber-700 font-medium')}>
                    {entry.payload.archived
                      ? `Archived ${entry.payload.archivedAt ? new Date(entry.payload.archivedAt).toLocaleDateString() : ''}`
                      : `Rotated ${daysSinceRotated}d ago`}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#8C6D1F] group-hover:underline">
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Viewing Pop-up (View Mode First) */}
      <Dialog
        open={!!viewingEntry}
        onClose={() => setViewingEntry(null)}
        title={viewingEntry?.label || 'Vault Credential'}
        maxWidth="max-w-xl"
      >
        {viewingEntry && (() => {
          const vTheme = CARD_COLORS.find((c) => c.id === viewingEntry.payload.color) || CARD_COLORS[0];
          const vItemT = viewingEntry.payload.itemType ?? 'login';
          const vRotated = daysBetweenISO(viewingEntry.lastRotatedAt, todayISO());
          const vStrength = (viewingEntry.payload.password || viewingEntry.payload.upiMpin || viewingEntry.payload.cardPin)
            ? calculatePasswordStrength(viewingEntry.payload.password || viewingEntry.payload.upiMpin || viewingEntry.payload.cardPin || '')
            : null;
          const vLinked = viewingEntry.payload.linkedAccountId
            ? accounts.find((a) => a.id === viewingEntry.payload.linkedAccountId)
            : null;

          return (
            <div className="space-y-4">
              {/* Top Banner with Accent Color & Category & Status */}
              <div className={cn('p-3 rounded-xl border flex items-center justify-between gap-2 border-l-4', vTheme.bg, vTheme.border, vTheme.borderL)}>
                <div className="flex items-center gap-2 min-w-0">
                  {vItemT === 'card' ? (
                    <CreditCard className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : vItemT === 'upi' ? (
                    <Smartphone className="h-5 w-5 text-teal-600 shrink-0" />
                  ) : vItemT === 'identity' ? (
                    <FileKey className="h-5 w-5 text-blue-600 shrink-0" />
                  ) : vItemT === 'note' ? (
                    <FileText className="h-5 w-5 text-slate-600 shrink-0" />
                  ) : (
                    <KeyRound className="h-5 w-5 text-[#8C6D1F] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-[#111318] truncate">{viewingEntry.label}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge className="bg-white text-[#111318] border-[#E6E1D6] text-[10px] py-0 px-1.5">
                        {viewingEntry.category}
                      </Badge>
                      <span className="rounded bg-white border border-[#E6E1D6] px-1.5 py-0 text-[10px] font-semibold text-[#8C6D1F] uppercase">
                        {vItemT}
                      </span>
                      {vStrength && (
                        <span className={cn('rounded px-1.5 py-0 text-[10px] font-medium border', vStrength.badgeClass)}>
                          {vStrength.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: vTheme.dot }}
                    title={`Color: ${vTheme.label}`}
                  />
                  {viewingEntry.payload.starred && <Star className="h-4 w-4 fill-current text-[#C59B27]" />}
                </div>
              </div>

              {/* Archived Notice Banner */}
              {viewingEntry.payload.archived && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Archived on {viewingEntry.payload.archivedAt ? new Date(viewingEntry.payload.archivedAt).toLocaleString() : 'Yes'}.</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRestoreEntry(viewingEntry)}
                    className="h-7 text-xs bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
              )}

              {/* Secrets Display */}
              <div className="space-y-2.5">
                {/* Login Specific Secrets */}
                {vItemT === 'login' && (
                  <>
                    {viewingEntry.payload.username &&
                      renderSecretRow(`${viewingEntry.id}-view-user`, 'Username / Email', viewingEntry.payload.username)}
                    {viewingEntry.payload.password &&
                      renderSecretRow(`${viewingEntry.id}-view-pw`, 'Password', viewingEntry.payload.password, vStrength?.label)}
                    {viewingEntry.payload.url && (
                      <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-semibold text-[#111318]">Website URL</span>
                          <div className="font-mono text-xs text-blue-700 truncate mt-0.5">
                            {viewingEntry.payload.url}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={viewingEntry.payload.url.startsWith('http') ? viewingEntry.payload.url : `https://${viewingEntry.payload.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-[#686E78] hover:bg-white hover:text-blue-700 cursor-pointer"
                            title="Open in new tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopySecret(`${viewingEntry.id}-view-url`, viewingEntry.payload.url, 'URL')}
                            className="p-1.5 rounded-md text-[#686E78] hover:bg-white hover:text-[#8C6D1F] cursor-pointer"
                            title="Copy URL"
                          >
                            {copiedKey === `${viewingEntry.id}-view-url` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Card Specific Secrets */}
                {vItemT === 'card' && (
                  <>
                    {viewingEntry.payload.cardHolder &&
                      renderSecretRow(`${viewingEntry.id}-view-holder`, 'Cardholder Name', viewingEntry.payload.cardHolder)}
                    {viewingEntry.payload.cardNumber &&
                      renderSecretRow(`${viewingEntry.id}-view-num`, 'Card Number', viewingEntry.payload.cardNumber)}
                    <div className="grid grid-cols-2 gap-2">
                      {viewingEntry.payload.cardExpiry && (
                        <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2 text-xs">
                          <span className="text-[10px] text-[#686E78] block">Expiry</span>
                          <span className="font-mono font-bold text-[#111318]">{viewingEntry.payload.cardExpiry}</span>
                        </div>
                      )}
                      {viewingEntry.payload.cardCvv &&
                        renderSecretRow(`${viewingEntry.id}-view-cvv`, 'CVV', viewingEntry.payload.cardCvv)}
                    </div>
                    {viewingEntry.payload.cardPin &&
                      renderSecretRow(`${viewingEntry.id}-view-cpin`, 'ATM PIN', viewingEntry.payload.cardPin)}
                  </>
                )}

                {/* UPI Specific Secrets */}
                {vItemT === 'upi' && (
                  <>
                    {viewingEntry.payload.upiVpa &&
                      renderSecretRow(`${viewingEntry.id}-view-vpa`, 'UPI ID / VPA', viewingEntry.payload.upiVpa)}
                    {viewingEntry.payload.upiMpin &&
                      renderSecretRow(`${viewingEntry.id}-view-mpin`, 'UPI MPIN', viewingEntry.payload.upiMpin)}
                    {viewingEntry.payload.upiDailyLimit && (
                      <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2 text-xs">
                        <span className="text-[10px] text-[#686E78] block">Daily Transfer Limit</span>
                        <span className="font-bold text-[#111318]">₹{viewingEntry.payload.upiDailyLimit.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Identity Specific Secrets */}
                {vItemT === 'identity' && (
                  <>
                    {viewingEntry.payload.idNumber &&
                      renderSecretRow(
                        `${viewingEntry.id}-view-id`,
                        `${viewingEntry.payload.idType || 'ID'} Number`,
                        viewingEntry.payload.idNumber,
                      )}
                  </>
                )}

                {/* Extra Secrets */}
                {(viewingEntry.payload.secrets ?? []).map((sec) =>
                  renderSecretRow(`${viewingEntry.id}-extra-${sec.id}`, sec.label, sec.value, sec.kind),
                )}

                {/* Notes */}
                {viewingEntry.payload.notes && (
                  <div className="rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3 text-xs text-[#111318] whitespace-pre-wrap">
                    <span className="text-[10px] font-semibold text-[#686E78] uppercase tracking-wider block mb-1">
                      Notes / Confidential Information:
                    </span>
                    {viewingEntry.payload.notes}
                  </div>
                )}

                {/* Legacy Password History */}
                {(viewingEntry.payload.legacyHistory ?? []).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-[#686E78] flex items-center gap-1">
                      <History className="h-3 w-3" /> Legacy Secret History ({viewingEntry.payload.legacyHistory?.length})
                    </span>
                    {viewingEntry.payload.legacyHistory?.map((leg) =>
                      renderSecretRow(`${viewingEntry.id}-view-leg-${leg.id}`, leg.label, leg.value, `Archived ${leg.archivedAt}`),
                    )}
                  </div>
                )}

                {/* Linked Treasury Account */}
                {vLinked && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 flex items-center justify-between text-xs text-emerald-900">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-emerald-700" />
                      <span>Linked Account: <strong>{vLinked.name}</strong> ({vLinked.type} · {vLinked.scope})</span>
                    </div>
                  </div>
                )}

                {/* Metadata Timestamps */}
                <div className="pt-2 border-t border-[#E6E1D6] flex items-center justify-between text-[11px] text-[#686E78]">
                  <span>Last rotated {vRotated} days ago</span>
                  <span>Updated {new Date(viewingEntry.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action Buttons in Viewing Pop-up */}
              <div className="pt-3 border-t border-[#E6E1D6] flex items-center justify-between gap-2">
                <div>
                  {viewingEntry.payload.archived ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleRestoreEntry(viewingEntry)}
                        className="text-emerald-800 border-emerald-300 hover:bg-emerald-50 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore to Active
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          const target = viewingEntry;
                          setViewingEntry(null);
                          setDeletePermanentTarget(target);
                        }}
                        className="text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Permanently Delete
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleArchiveEntry(viewingEntry)}
                      className="text-amber-800 border-amber-300 hover:bg-amber-50 text-xs"
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" /> Move to Archive
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setViewingEntry(null)}>
                    {dict.common.close}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-[#111318] text-[#E5C158] hover:bg-[#2A2E39]"
                    onClick={() => {
                      const toEdit = viewingEntry;
                      setViewingEntry(null);
                      openEntryModal(toEdit);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit Entry
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>

      {/* 4. Add/Edit Vault Entry Modal with Specialized Templates (Pillar 3 & 4) */}
      <Dialog
        open={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
        title={editingEntry ? 'Edit Vault Record' : 'Add Vault Record'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveEntry} className="space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* Template Type Selector Tabs */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setItemType('login')}
              className={cn(
                'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
                itemType === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
              <span>Login</span>
            </button>
            <button
              type="button"
              onClick={() => setItemType('card')}
              className={cn(
                'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
                itemType === 'card' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              <span>Card</span>
            </button>
            <button
              type="button"
              onClick={() => setItemType('upi')}
              className={cn(
                'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
                itemType === 'upi' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <Smartphone className="h-3.5 w-3.5 text-teal-600" />
              <span>UPI</span>
            </button>
            <button
              type="button"
              onClick={() => setItemType('identity')}
              className={cn(
                'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
                itemType === 'identity' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <FileKey className="h-3.5 w-3.5 text-blue-600" />
              <span>Identity</span>
            </button>
            <button
              type="button"
              onClick={() => setItemType('note')}
              className={cn(
                'flex-1 rounded-lg py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
                itemType === 'note' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <FileText className="h-3.5 w-3.5 text-slate-600" />
              <span>Note</span>
            </button>
          </div>

          {/* Primary Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="vault-label">Title / Name *</FieldLabel>
              <Input
                id="vault-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={
                  itemType === 'card'
                    ? 'e.g. HDFC Millennia Credit Card'
                    : itemType === 'upi'
                      ? 'e.g. Google Pay / PhonePe'
                      : itemType === 'identity'
                        ? 'e.g. PAN Card - Business'
                        : 'e.g. Zerodha Demat or SBI Netbanking'
                }
                required
              />
            </div>
            <div>
              <FieldLabel htmlFor="vault-cat">Category *</FieldLabel>
              <Input
                id="vault-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="vault-cat-suggestions"
                placeholder="Logins, Banking, Identity, etc."
                required
              />
              <datalist id="vault-cat-suggestions">
                {allKnownCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Card Accent Color Picker */}
          <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <FieldLabel className="!mb-0 flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-[#8C6D1F]" />
                <span>Card Accent Color:</span>
              </FieldLabel>
              <span className="text-xs font-semibold text-[#111318]">
                {CARD_COLORS.find((c) => c.id === cardColor)?.label ?? 'Gold'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {CARD_COLORS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setCardColor(col.id)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-all flex items-center justify-center cursor-pointer border',
                    cardColor === col.id
                      ? 'ring-2 ring-offset-2 ring-[#111318] scale-110 border-black shadow-xs'
                      : 'hover:scale-105 border-transparent opacity-80 hover:opacity-100',
                  )}
                  style={{ backgroundColor: col.dot }}
                  title={col.label}
                >
                  {cardColor === col.id && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* Financial Account Linking Dropdown (Pillar 4) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-700">
              <Link2 className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-semibold">Link to Ledger Account:</span>
            </div>
            <select
              value={linkedAccountId}
              onChange={(e) => setLinkedAccountId(e.target.value)}
              className="h-7 text-xs rounded border border-slate-300 bg-white px-2 text-slate-800 focus:outline-none"
            >
              <option value="">(None - Standalone)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type} · {acc.scope})
                </option>
              ))}
            </select>
          </div>

          {/* Template Dynamic Fields */}
          {itemType === 'login' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="vault-username">Username / Customer ID</FieldLabel>
                  <Input
                    id="vault-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="user@example.com or 88472910"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="vault-password">Login Password</FieldLabel>
                    <div className="flex items-center gap-2">
                      {password && (
                        <button
                          type="button"
                          onClick={() => {
                            archiveToLegacy('Previous Password', password);
                            onNotify?.('Archived current password to history ✓');
                          }}
                          className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Archive current password to legacy history before changing"
                        >
                          Archive to History
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPassword(generateStrongPassword(18))}
                        className="text-[11px] text-indigo-700 hover:text-indigo-900 cursor-pointer font-medium"
                      >
                        Generate Strong
                      </button>
                    </div>
                  </div>
                  <Input
                    id="vault-password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="vault-url">Website URL</FieldLabel>
                <Input
                  id="vault-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://netbanking.hdfcbank.com"
                />
              </div>
            </div>
          )}

          {itemType === 'card' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="card-holder">Cardholder Name</FieldLabel>
                  <Input
                    id="card-holder"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    placeholder="Name as printed on card"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="card-number">16-Digit Card Number</FieldLabel>
                  <Input
                    id="card-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4111 2222 3333 4444"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel htmlFor="card-expiry">Expiry (MM/YY)</FieldLabel>
                  <Input
                    id="card-expiry"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="08/29"
                    className="font-mono text-center"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="card-cvv">CVV</FieldLabel>
                  <Input
                    id="card-cvv"
                    type="password"
                    maxLength={4}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="•••"
                    className="font-mono text-center"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="card-pin">ATM PIN</FieldLabel>
                  <Input
                    id="card-pin"
                    type="password"
                    maxLength={6}
                    value={cardPin}
                    onChange={(e) => setCardPin(e.target.value)}
                    placeholder="••••"
                    className="font-mono text-center"
                  />
                </div>
              </div>
            </div>
          )}

          {itemType === 'upi' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="upi-vpa">UPI ID / VPA</FieldLabel>
                  <Input
                    id="upi-vpa"
                    value={upiVpa}
                    onChange={(e) => setUpiVpa(e.target.value)}
                    placeholder="user@okhdfcbank"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="upi-mpin">UPI MPIN (4 or 6 digits)</FieldLabel>
                  <Input
                    id="upi-mpin"
                    type="password"
                    maxLength={6}
                    value={upiMpin}
                    onChange={(e) => setUpiMpin(e.target.value)}
                    placeholder="••••"
                    className="font-mono text-center"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="upi-limit">Daily UPI Limit (₹)</FieldLabel>
                <Input
                  id="upi-limit"
                  type="number"
                  value={upiDailyLimit ?? ''}
                  onChange={(e) => setUpiDailyLimit(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 100000"
                />
              </div>
            </div>
          )}

          {itemType === 'identity' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="id-type">Document Type</FieldLabel>
                <Select id="id-type" value={idType} onChange={(e) => setIdType(e.target.value)}>
                  <option value="PAN">PAN Card</option>
                  <option value="Aadhaar">Aadhaar Card</option>
                  <option value="Passport">Passport</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="GSTIN">GSTIN Certificate</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="id-num">Document / Identification Number</FieldLabel>
                <Input
                  id="id-num"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                  placeholder={idType === 'PAN' ? 'ABCDE1234F' : idType === 'Aadhaar' ? '1234 5678 9012' : ''}
                  className="font-mono uppercase"
                />
              </div>
            </div>
          )}

          {/* Notes / Confidential Info */}
          <div>
            <FieldLabel htmlFor="vault-notes">Notes / Confidential Data (Markdown supported)</FieldLabel>
            <Textarea
              id="vault-notes"
              rows={itemType === 'note' ? 8 : 3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Recovery seed phrases, locker keys, policy numbers, or extra secret details..."
              className="text-xs font-mono"
            />
          </div>

          {/* Extra Secrets Drawer (Transaction Passwords, TPIN, OTP) */}
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2 group">
            <summary className="text-xs font-semibold text-slate-700 cursor-pointer list-none flex items-center justify-between select-none">
              <span>+ Additional PINs &amp; Secrets ({extraSecrets.length})</span>
              <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap gap-1">
                {PRESET_SECRET_TYPES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setExtraSecrets((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), label: preset, value: '', kind: 'secret' },
                      ]);
                    }}
                    className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
              {extraSecrets.map((s, idx) => (
                <div key={s.id} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) =>
                      setExtraSecrets((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                      )
                    }
                    placeholder="Secret Name"
                    className="w-1/3 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <input
                    type="text"
                    value={s.value}
                    onChange={(e) =>
                      setExtraSecrets((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)),
                      )
                    }
                    placeholder="Secret Value"
                    className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraSecrets((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </details>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={starred}
                onChange={(e) => setStarred(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500"
              />
              <span>Star / Favorite</span>
            </label>

            <div className="flex items-center gap-2">
              <Button variant="secondary" type="button" onClick={() => setEntryModalOpen(false)}>
                {dict.common.cancel}
              </Button>
              <Button variant="primary" type="submit">
                {dict.common.save}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* 5. Emergency Recovery Kit Modal (Pillar 5 / 0 Data Loss) */}
      <Dialog
        open={kitModalOpen}
        onClose={() => setKitModalOpen(false)}
        title="Emergency Recovery Kit"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-950">
            <p className="font-bold">Save this key in a secure physical location.</p>
            <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
              If you ever forget your Master Password, this key lets you unlock your vault on the login page with{' '}
              <strong>zero data loss</strong>.
            </p>
          </div>

          <div>
            <FieldLabel>Emergency Recovery Key</FieldLabel>
            <div className="rounded-xl border border-slate-300 bg-slate-900 p-3.5 text-center font-mono text-sm tracking-wider text-emerald-400 select-all font-bold">
              {activeRecoveryKey || 'PLVK-NOT-YET-GENERATED'}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(activeRecoveryKey);
                onNotify?.('Copied Emergency Recovery Key ✓');
              }}
              className="flex-1 text-xs"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Key
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleDownloadEmergencyKit}
              className="flex-1 text-xs"
            >
              <Download className="h-3.5 w-3.5" /> Download Card
            </Button>
          </div>

          <div className="pt-2 border-t border-slate-200 text-center">
            <Button variant="primary" type="button" onClick={() => setKitModalOpen(false)} className="w-full text-xs">
              Done &amp; Close Kit
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 6. Encrypted Export Modal (.plvault) */}
      <Dialog
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Encrypted Vault Backup"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleExportVault} className="space-y-3.5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Exports all {entries.length} vault records into a standalone <strong>.plvault</strong> file. The file is
            encrypted using AES-256-GCM.
          </p>
          <div>
            <FieldLabel htmlFor="export-pw">Export Encryption Passphrase *</FieldLabel>
            <Input
              id="export-pw"
              type="password"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              placeholder="Enter passphrase to encrypt the backup file"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button variant="secondary" type="button" onClick={() => setExportModalOpen(false)}>
              {dict.common.cancel}
            </Button>
            <Button variant="primary" type="submit" disabled={exportBusy || !exportPassphrase.trim()}>
              {exportBusy ? 'Encrypting & Downloading...' : 'Export .plvault File'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 7. Encrypted Import / Restore Modal (.plvault) */}
      <Dialog
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Restore Vault from Backup"
        maxWidth="max-w-md"
      >
        <div className="space-y-3.5">
          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {importError}
            </div>
          )}

          {!importPreviewCount ? (
            <form onSubmit={handleImportPreview} className="space-y-3">
              <div>
                <FieldLabel>Select .plvault Backup File</FieldLabel>
                <input
                  type="file"
                  accept=".plvault,.json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const text = await f.text();
                      setImportFileJson(text);
                    }
                  }}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="import-pw">Backup File Decryption Passphrase *</FieldLabel>
                <Input
                  id="import-pw"
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  placeholder="Passphrase used when exporting"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button variant="secondary" type="button" onClick={() => setImportModalOpen(false)}>
                  {dict.common.cancel}
                </Button>
                <Button variant="primary" type="submit" disabled={importBusy || !importFileJson}>
                  {importBusy ? 'Decrypting & Verifying...' : 'Verify Backup File'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                <p className="font-bold">Verified {importPreviewCount} Records in Backup File!</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Choose how to apply these records to your current vault:
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span>
                    <strong>Merge:</strong> Add new records, keeping current items intact
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span className="text-red-700">
                    <strong>Replace:</strong> Delete current items and restore exactly from backup
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setImportPreviewCount(null)}
                  disabled={importBusy}
                >
                  Back
                </Button>
                <Button variant="primary" type="button" onClick={handleConfirmImport} disabled={importBusy}>
                  {importBusy ? 'Importing Records...' : `Confirm & Apply ${importPreviewCount} Records`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* 8. Rekey Master Password Dialog */}
      <Dialog
        open={rekeyOpen}
        onClose={() => setRekeyOpen(false)}
        title={dict.vault.changeMasterTitle}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRekeySubmit} className="space-y-3.5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Changing your Master Password re-derives a new 256-bit AES key and re-encrypts all {entries.length} items in
            place. Your Emergency Recovery Key is updated automatically.
          </p>

          {rekeyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {rekeyError}
            </div>
          )}

          <div>
            <FieldLabel htmlFor="rekey-current">Current Master Password</FieldLabel>
            <Input
              id="rekey-current"
              type="password"
              value={currentMasterInput}
              onChange={(e) => setCurrentMasterInput(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <FieldLabel htmlFor="rekey-new">New Master Password (min 8 chars)</FieldLabel>
            <Input
              id="rekey-new"
              type="password"
              value={newMasterInput}
              onChange={(e) => setNewMasterInput(e.target.value)}
              required
            />
          </div>

          <div>
            <FieldLabel htmlFor="rekey-confirm">Confirm New Master Password</FieldLabel>
            <Input
              id="rekey-confirm"
              type="password"
              value={confirmNewMasterInput}
              onChange={(e) => setConfirmNewMasterInput(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button variant="secondary" type="button" onClick={() => setRekeyOpen(false)} disabled={rekeyBusy}>
              {dict.common.cancel}
            </Button>
            <Button variant="primary" type="submit" disabled={rekeyBusy}>
              {rekeyBusy ? 'Re-encrypting Vault...' : 'Rotate Master Password'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 9. Move to Archive Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Move to Vault Archive"
        message={`Move "${deleteTarget?.label ?? ''}" to Archive? The credential will be safely stored and can be restored anytime.`}
        confirmLabel="Move to Archive"
        cancelLabel={dict.common.cancel}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleArchiveEntry(deleteTarget);
        }}
      />

      {/* 10. Permanent Delete Confirm Dialog (Only from Archive) */}
      <ConfirmDialog
        open={!!deletePermanentTarget}
        onClose={() => setDeletePermanentTarget(null)}
        title="Permanently Delete Vault Record"
        message={`Are you sure you want to PERMANENTLY destroy "${deletePermanentTarget?.label ?? ''}"? This action cannot be undone and the zero-knowledge secret will be permanently removed.`}
        confirmLabel="Permanently Delete"
        cancelLabel={dict.common.cancel}
        onConfirm={async () => {
          if (!deletePermanentTarget) return;
          await handlePermanentDelete(deletePermanentTarget);
        }}
      />
    </div>
  );
}
