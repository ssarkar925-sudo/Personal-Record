import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookmarkPlus,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  FileText,
  Filter,
  Layers,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Split,
  Trash2,
  UploadCloud,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  api,
  type AccountRecord,
  type CardCycleReconciliation,
  type RecurringBillRecord,
  type ScopeBudgetRecord,
  type TransactionRecord,
} from '../lib/api.ts';
import {
  formatDisplayDateShort,
  formatINR,
  formatOrdinalDay,
  rupeesToPaise,
  SCOPE_META,
  todayISO,
} from '../lib/format.ts';
import {
  Button,
  CategorySelect,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  Select,
  SortSelect,
  ViewModeToggle,
} from '../components/ui/Primitives.tsx';
import {
  getCategoryOptions,
  type Scope,
} from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';
import {
  getMetallicFinishById,
  resolveMetallicFinish,
  type MetallicFinishId,
} from './dashboard/dashboardVisuals.ts';
import { computeCardsPortfolioMetrics } from './cards/cardsAnalytics.ts';
import { CardsHeroWorkstation } from './cards/CardsHeroWorkstation.tsx';

export interface CardsViewProps {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  recurringBills: RecurringBillRecord[];
  budgets?: ScopeBudgetRecord[];
  monthSpentByScope?: Record<Scope, number>;
  systemLanguage?: AppLanguage;
  globalScopeFilter?: Scope | 'all';
  onGlobalScopeChange?: (scope: Scope | 'all') => void;
  onNotify: (text: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
  onNavigateToMoney?: () => void;
}

interface RapidSpendRow {
  id: string;
  occurredAt: string;
  cardId: string;
  amountStr: string;
  party: string;
  category: string;
  scope: Scope;
  note: string;
}

export interface QuickFillMerchant {
  id: string;
  name: string;
  category: string;
  scope: Scope;
}

const DEFAULT_QUICK_MERCHANTS: QuickFillMerchant[] = [
  { id: 'm-1', name: 'Amazon Business', category: 'Inventory / Supplies', scope: 'business' },
  { id: 'm-2', name: 'Google Cloud / AWS', category: 'Software & SaaS', scope: 'business' },
  { id: 'm-3', name: 'Meta / Google Ads', category: 'Marketing / Ads', scope: 'business' },
  { id: 'm-4', name: 'Swiggy Corporate', category: 'Travel & Client', scope: 'business' },
  { id: 'm-5', name: 'MakeMyTrip Biz', category: 'Travel & Client', scope: 'business' },
  { id: 'm-6', name: 'Uber Business', category: 'Travel & Client', scope: 'business' },
  { id: 'm-7', name: 'Shell Petrol', category: 'Logistics & Courier', scope: 'business' },
  { id: 'm-8', name: 'BlueDart / Delhivery', category: 'Logistics & Courier', scope: 'business' },
  { id: 'm-9', name: 'Flipkart Wholesale', category: 'Inventory / Supplies', scope: 'business' },
  { id: 'm-10', name: 'Airtel / Jio Fiber', category: 'Rent & Utilities', scope: 'business' },
  { id: 'm-11', name: 'Blinkit', category: 'Groceries', scope: 'family' },
  { id: 'm-12', name: 'Apollo Pharmacy', category: 'Medical & Health', scope: 'personal' },
];

export function CardsView({
  accounts,
  transactions,
  recurringBills: _recurringBills,
  globalScopeFilter,
  onGlobalScopeChange,
  onNotify,
  onRefresh,
  onNavigateToMoney,
}: CardsViewProps) {
  // 1. Isolate Credit Cards & Bank Accounts
  const creditCards = useMemo(
    () => accounts.filter((a) => a.accountGroup === 'credit_card'),
    [accounts],
  );
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.accountGroup === 'bank'),
    [accounts],
  );
  const liquidAccounts = useMemo(
    () => accounts.filter((a) => a.accountGroup !== 'credit_card'),
    [accounts],
  );
  const totalBankLiquidity = useMemo(
    () => liquidAccounts.reduce((sum, a) => sum + (a.currentBalanceMinor || 0), 0),
    [liquidAccounts],
  );

  // Per-Card Metallic Finish Overrides (persisted in localStorage)
  const [cardFinishOverrides, setCardFinishOverrides] = useState<Record<string, MetallicFinishId>>(
    () => {
      try {
        const raw = localStorage.getItem('pl_card_finish_overrides_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch {}
      return {};
    },
  );

  const handleChangeCardFinish = (cardId: string, finish: 'auto' | MetallicFinishId) => {
    setCardFinishOverrides((prev) => {
      const next = { ...prev };
      if (finish === 'auto') {
        delete next[cardId];
      } else {
        next[cardId] = finish;
      }
      try {
        localStorage.setItem('pl_card_finish_overrides_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Active Card Filter (null = all cards)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardViewMode, setCardViewMode] = useState<'grid' | 'list'>('grid');
  const [cardSort, setCardSort] = useState<
    'debt_desc' | 'debt_asc' | 'util_desc' | 'due_date' | 'limit_desc' | 'name_asc'
  >('debt_desc');

  // Sorted Credit Cards according to selected sort option
  const sortedCreditCards = useMemo(() => {
    return [...creditCards].sort((a, b) => {
      const debtA = Math.abs(a.currentBalanceMinor || 0);
      const debtB = Math.abs(b.currentBalanceMinor || 0);
      const limitA = a.creditLimitMinor || 0;
      const limitB = b.creditLimitMinor || 0;
      const utilA = limitA > 0 ? (debtA / limitA) * 100 : 0;
      const utilB = limitB > 0 ? (debtB / limitB) * 100 : 0;

      if (cardSort === 'debt_desc') return debtB - debtA;
      if (cardSort === 'debt_asc') return debtA - debtB;
      if (cardSort === 'util_desc') return utilB - utilA;
      if (cardSort === 'limit_desc') return limitB - limitA;
      if (cardSort === 'name_asc') return a.name.localeCompare(b.name);
      if (cardSort === 'due_date') {
        const dueA = a.cardCycle?.daysUntilDue ?? 999;
        const dueB = b.cardCycle?.daysUntilDue ?? 999;
        return dueA - dueB;
      }
      return 0;
    });
  }, [creditCards, cardSort]);

  // Filters for Spend Feed
  const [searchQuery, setSearchQuery] = useState('');
  const [localScopeFilter, setLocalScopeFilter] = useState<Scope | 'all'>(
    globalScopeFilter ?? 'all',
  );
  useEffect(() => {
    if (globalScopeFilter !== undefined) {
      setLocalScopeFilter(globalScopeFilter);
    }
  }, [globalScopeFilter]);
  const scopeFilter = localScopeFilter;
  const setScopeFilter = (next: Scope | 'all') => {
    setLocalScopeFilter(next);
    onGlobalScopeChange?.(next);
  };
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | 'month'>('all');

  // Input Mode: 'rapid' | 'sms'
  const [entryTab, setEntryTab] = useState<'rapid' | 'sms'>('rapid');

  // 2. Rapid Multi-Row Spend Logger State
  const [rapidRows, setRapidRows] = useState<RapidSpendRow[]>(() => [
    {
      id: 'row-1',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Inventory / Supplies',
      scope: 'business',
      note: '',
    },
    {
      id: 'row-2',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Software & SaaS',
      scope: 'business',
      note: '',
    },
    {
      id: 'row-3',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Travel & Client',
      scope: 'business',
      note: '',
    },
  ]);
  const [isSavingRapid, setIsSavingRapid] = useState(false);

  useEffect(() => {
    if (creditCards.length > 0) {
      setRapidRows((prev) =>
        prev.map((row) => (!row.cardId ? { ...row, cardId: creditCards[0].id } : row)),
      );
    }
  }, [creditCards]);

  // 3. SMS Alert Parser State
  const [smsText, setSmsText] = useState('');
  const [isParsingSms, setIsParsingSms] = useState(false);

  // 3b. Custom Quick-Fill Merchants State & Persistence
  const [quickMerchants, setQuickMerchants] = useState<QuickFillMerchant[]>(() => {
    try {
      const raw = localStorage.getItem('pl_custom_quick_merchants_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_QUICK_MERCHANTS;
  });

  const [manageMerchantsOpen, setManageMerchantsOpen] = useState(false);
  const [newMName, setNewMName] = useState('');
  const [newMCat, setNewMCat] = useState('Inventory / Supplies');
  const [newMScope, setNewMScope] = useState<Scope>('business');

  // 4. Detailed Spend Modal State
  const [detailedModalOpen, setDetailedModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [txCardId, setTxCardId] = useState('');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txDate, setTxDate] = useState(todayISO());
  const [txParty, setTxParty] = useState('');
  const [txCategory, setTxCategory] = useState('Inventory / Supplies');
  const [txScope, setTxScope] = useState<Scope>('business');
  const [txNote, setTxNote] = useState('');
  const [txAttachmentBase64, setTxAttachmentBase64] = useState<string | null>(null);
  const [txAttachmentName, setTxAttachmentName] = useState<string | null>(null);
  const [txAttachmentMime, setTxAttachmentMime] = useState<string | null>(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitFriendsStr, setSplitFriendsStr] = useState('');
  const [splitIncludeSelf, setSplitIncludeSelf] = useState(true);
  const [isSavingTx, setIsSavingTx] = useState(false);

  // 5. Card Creation / Edit Modal
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<AccountRecord | null>(null);
  const [cardName, setCardName] = useState('');
  const [cardInstitution, setCardInstitution] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardLimitStr, setCardLimitStr] = useState('100000');
  const [cardStatementDay, setCardStatementDay] = useState(15);
  const [cardDueDay, setCardDueDay] = useState(5);
  const [cardScope, setCardScope] = useState<Scope>('business');
  const [isSavingCard, setIsSavingCard] = useState(false);

  // 6. Card Reconcile & Bill Pay Modal
  const [payCardModalOpen, setPayCardModalOpen] = useState(false);
  const [payCardAccount, setPayCardAccount] = useState<AccountRecord | null>(null);
  const [cardReconData, setCardReconData] = useState<CardCycleReconciliation | null>(null);
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payFromBankId, setPayFromBankId] = useState('');
  const [isPayingCard, setIsPayingCard] = useState(false);

  // 7. Attachment Viewer Modal & Delete Confirmation
  const [attachmentViewerTx, setAttachmentViewerTx] = useState<TransactionRecord | null>(null);
  const [attachmentData, setAttachmentData] = useState<{
    filename: string;
    mimeType: string;
    dataBase64: string;
  } | null>(null);
  const [deleteTxConfirmId, setDeleteTxConfirmId] = useState<string | null>(null);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter transactions belonging to credit cards
  const creditCardIds = useMemo(() => new Set(creditCards.map((c) => c.id)), [creditCards]);

  const cardTransactions = useMemo(() => {
    return transactions.filter(
      (tx) =>
        creditCardIds.has(tx.accountId) ||
        (tx.toAccountId && creditCardIds.has(tx.toAccountId)),
    );
  }, [transactions, creditCardIds]);

  // Aggregate Metrics & Daily Velocity
  const todayStr = todayISO();
  const currentMonthPrefix = todayStr.slice(0, 7);

  const todayCardTxs = useMemo(() => {
    return cardTransactions.filter((tx) => tx.occurredAt === todayStr && tx.kind === 'expense');
  }, [cardTransactions, todayStr]);

  const todayCardSpendMinor = useMemo(() => {
    return todayCardTxs.reduce((sum, tx) => sum + tx.amountMinor, 0);
  }, [todayCardTxs]);

  const monthCardTxs = useMemo(() => {
    return cardTransactions.filter(
      (tx) => tx.occurredAt.startsWith(currentMonthPrefix) && tx.kind === 'expense',
    );
  }, [cardTransactions, currentMonthPrefix]);

  const monthCardSpendMinor = useMemo(() => {
    return monthCardTxs.reduce((sum, tx) => sum + tx.amountMinor, 0);
  }, [monthCardTxs]);

  const portfolioMetrics = useMemo(
    () => computeCardsPortfolioMetrics(creditCards, totalBankLiquidity, monthCardSpendMinor),
    [creditCards, totalBankLiquidity, monthCardSpendMinor],
  );

  // Filtered Card Transactions Stream
  const filteredTxs = useMemo(() => {
    return cardTransactions.filter((tx) => {
      if (selectedCardId && tx.accountId !== selectedCardId && tx.toAccountId !== selectedCardId) {
        return false;
      }
      if (scopeFilter !== 'all' && tx.scope !== scopeFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (dateFilter === 'today' && tx.occurredAt !== todayStr) return false;
      if (dateFilter === 'month' && !tx.occurredAt.startsWith(currentMonthPrefix)) return false;
      if (dateFilter === '7days') {
        const d = new Date(tx.occurredAt).getTime();
        const now = new Date(todayStr).getTime();
        if (now - d > 7 * 86400000 || d > now) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mParty = tx.party.toLowerCase().includes(q);
        const mCat = tx.category.toLowerCase().includes(q);
        const mNote = tx.note.toLowerCase().includes(q);
        const mAcc = tx.accountName.toLowerCase().includes(q);
        const mAmount = (tx.amountMinor / 100).toString().includes(q);
        if (!mParty && !mCat && !mNote && !mAcc && !mAmount) return false;
      }
      return true;
    });
  }, [
    cardTransactions,
    selectedCardId,
    scopeFilter,
    categoryFilter,
    dateFilter,
    searchQuery,
    todayStr,
    currentMonthPrefix,
  ]);

  // Group Filtered Transactions by Date
  const groupedTxs = useMemo(() => {
    const map: Record<string, TransactionRecord[]> = {};
    for (const tx of filteredTxs) {
      const d = tx.occurredAt || 'Other';
      if (!map[d]) map[d] = [];
      map[d].push(tx);
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTxs]);

  // Rapid Row Helpers
  const handleAddRapidRow = () => {
    setRapidRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        occurredAt: todayISO(),
        cardId: selectedCardId || creditCards[0]?.id || '',
        amountStr: '',
        party: '',
        category: 'Inventory / Supplies',
        scope: 'business',
        note: '',
      },
    ]);
  };

  const handleUpdateRapidRow = (id: string, patch: Partial<RapidSpendRow>) => {
    setRapidRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleRemoveRapidRow = (id: string) => {
    setRapidRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const saveQuickMerchants = (next: QuickFillMerchant[]) => {
    setQuickMerchants(next);
    try {
      localStorage.setItem('pl_custom_quick_merchants_v1', JSON.stringify(next));
    } catch {}
  };

  const handleApplyMerchantChip = (merchant: QuickFillMerchant) => {
    setRapidRows((prev) => {
      const lastRow = prev[prev.length - 1];
      if (lastRow && !lastRow.party && !lastRow.amountStr) {
        return prev.map((r, i) =>
          i === prev.length - 1
            ? {
                ...r,
                party: merchant.name,
                category: merchant.category,
                scope: merchant.scope,
              }
            : r,
        );
      }
      return [
        ...prev,
        {
          id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          occurredAt: todayISO(),
          cardId: selectedCardId || creditCards[0]?.id || '',
          amountStr: '',
          party: merchant.name,
          category: merchant.category,
          scope: merchant.scope,
          note: '',
        },
      ];
    });
    onNotify(`Applied ${merchant.name} (${merchant.category})!`);
  };

  const handleAddCustomMerchant = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMName.trim()) {
      onNotify('Please enter a merchant name', 'err');
      return;
    }
    const nameTrimmed = newMName.trim();
    if (quickMerchants.some((m) => m.name.toLowerCase() === nameTrimmed.toLowerCase())) {
      onNotify('A preset with this merchant name already exists', 'err');
      return;
    }
    const newItem: QuickFillMerchant = {
      id: `qm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: nameTrimmed,
      category: newMCat,
      scope: newMScope,
    };
    saveQuickMerchants([newItem, ...quickMerchants]);
    setNewMName('');
    onNotify(`Added custom merchant "${nameTrimmed}" to quick-fill!`);
  };

  const handleDeleteQuickMerchant = (id: string) => {
    const next = quickMerchants.filter((m) => m.id !== id);
    saveQuickMerchants(next);
    onNotify('Preset removed');
  };

  const handleResetMerchantsToDefault = () => {
    saveQuickMerchants(DEFAULT_QUICK_MERCHANTS);
    onNotify('Reset quick-fill merchants to defaults');
  };

  const handleSaveRowAsMerchantPreset = (row: RapidSpendRow) => {
    if (!row.party.trim()) {
      onNotify('Row has no merchant name to save', 'err');
      return;
    }
    const nameTrimmed = row.party.trim();
    if (quickMerchants.some((m) => m.name.toLowerCase() === nameTrimmed.toLowerCase())) {
      onNotify(`Preset for "${nameTrimmed}" already exists`, 'ok');
      return;
    }
    const newItem: QuickFillMerchant = {
      id: `qm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: nameTrimmed,
      category: row.category || 'Shopping',
      scope: row.scope || 'personal',
    };
    saveQuickMerchants([newItem, ...quickMerchants]);
    onNotify(`Saved "${nameTrimmed}" as a quick-fill preset!`);
  };

  // Commit All Rapid Rows
  const handleCommitRapidRows = async () => {
    const validRows = rapidRows.filter((r) => {
      const amt = parseFloat(r.amountStr);
      return !isNaN(amt) && amt > 0 && r.cardId;
    });

    if (validRows.length === 0) {
      onNotify('Enter at least one card spend with a valid amount', 'err');
      return;
    }

    try {
      setIsSavingRapid(true);
      const items = validRows.map((r) => ({
        kind: 'expense' as const,
        scope: r.scope,
        accountId: r.cardId,
        category: r.category || 'Shopping',
        amountMinor: rupeesToPaise(r.amountStr),
        occurredAt: r.occurredAt || todayISO(),
        party: r.party.trim() || 'Credit Card Spend',
        note: r.note.trim(),
      }));

      await api.commitImport(items);
      onNotify(`Successfully recorded ${items.length} credit card spends!`);
      setRapidRows([
        {
          id: `row-${Date.now()}-1`,
          occurredAt: todayISO(),
          cardId: selectedCardId || creditCards[0]?.id || '',
          amountStr: '',
          party: '',
          category: 'Food & Dining',
          scope: 'personal',
          note: '',
        },
        {
          id: `row-${Date.now()}-2`,
          occurredAt: todayISO(),
          cardId: selectedCardId || creditCards[0]?.id || '',
          amountStr: '',
          party: '',
          category: 'Shopping',
          scope: 'personal',
          note: '',
        },
      ]);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to record card spends', 'err');
    } finally {
      setIsSavingRapid(false);
    }
  };

  // Parse SMS Text
  const handleParseSms = async () => {
    if (!smsText.trim()) {
      onNotify('Paste one or more bank SMS texts to parse', 'err');
      return;
    }
    try {
      setIsParsingSms(true);
      const res = await api.previewImport({
        text: smsText,
        defaultAccountId: selectedCardId || creditCards[0]?.id,
        defaultScope: 'business',
      });

      if (!res || res.length === 0) {
        onNotify('Could not detect card spends in the pasted text', 'err');
        return;
      }

      const convertedRows: RapidSpendRow[] = res.map((item) => ({
        id: `parsed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        occurredAt: item.occurredAt || todayISO(),
        cardId: item.accountId || creditCards[0]?.id || '',
        amountStr: (item.amountMinor / 100).toFixed(2),
        party: item.party || 'Merchant',
        category: item.category || 'Inventory / Supplies',
        scope: item.scope || 'business',
        note: item.note || 'Parsed from SMS',
      }));

      setRapidRows(convertedRows);
      setEntryTab('rapid');
      setSmsText('');
      onNotify(`Parsed ${convertedRows.length} transactions from SMS! Review and click Save.`);
    } catch (err) {
      onNotify((err as Error).message || 'Failed to parse SMS', 'err');
    } finally {
      setIsParsingSms(false);
    }
  };

  // Open Detailed Modal
  const handleOpenDetailedAdd = (defaultCardId?: string) => {
    setEditingTx(null);
    setTxCardId(defaultCardId || selectedCardId || creditCards[0]?.id || '');
    setTxAmountStr('');
    setTxDate(todayISO());
    setTxParty('');
    setTxCategory('Inventory / Supplies');
    setTxScope('business');
    setTxNote('');
    setTxAttachmentBase64(null);
    setTxAttachmentName(null);
    setTxAttachmentMime(null);
    setSplitEnabled(false);
    setSplitFriendsStr('');
    setSplitIncludeSelf(true);
    setDetailedModalOpen(true);
  };

  const handleOpenDetailedEdit = (tx: TransactionRecord) => {
    setEditingTx(tx);
    setTxCardId(tx.accountId);
    setTxAmountStr((tx.amountMinor / 100).toFixed(2));
    setTxDate(tx.occurredAt);
    setTxParty(tx.party);
    setTxCategory(tx.category);
    setTxScope(tx.scope);
    setTxNote(tx.note);
    setTxAttachmentBase64(null);
    setTxAttachmentName(null);
    setTxAttachmentMime(null);
    setSplitEnabled(false);
    setSplitFriendsStr('');
    setDetailedModalOpen(true);
  };

  const handleDuplicateSwipe = (tx: TransactionRecord) => {
    setEditingTx(null);
    setTxCardId(tx.accountId);
    setTxAmountStr((tx.amountMinor / 100).toFixed(2));
    setTxDate(todayISO());
    setTxParty(tx.party);
    setTxCategory(tx.category);
    setTxScope(tx.scope);
    setTxNote(tx.note ? `${tx.note} (Repeat)` : '');
    setTxAttachmentBase64(null);
    setDetailedModalOpen(true);
  };

  // Save Detailed Spend
  const handleSaveDetailedSpend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txCardId) {
      onNotify('Please select a credit card', 'err');
      return;
    }
    const amtMinor = rupeesToPaise(txAmountStr);
    if (amtMinor <= 0) {
      onNotify('Enter an amount greater than ₹0', 'err');
      return;
    }

    try {
      setIsSavingTx(true);
      if (editingTx) {
        await api.updateTransaction(editingTx.id, {
          kind: 'expense',
          scope: txScope,
          accountId: txCardId,
          category: txCategory,
          amountMinor: amtMinor,
          occurredAt: txDate,
          party: txParty.trim(),
          note: txNote.trim(),
        });
        onNotify('Credit card spend updated!');
      } else {
        const splitPayload =
          splitEnabled && splitFriendsStr.trim()
            ? {
                participants: splitFriendsStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                includeSelf: splitIncludeSelf,
              }
            : undefined;

        await api.createTransaction({
          kind: 'expense',
          scope: txScope,
          accountId: txCardId,
          category: txCategory,
          amountMinor: amtMinor,
          occurredAt: txDate,
          party: txParty.trim() || 'Credit Card Spend',
          note: txNote.trim(),
          split: splitPayload,
          attachment:
            txAttachmentBase64 && txAttachmentName && txAttachmentMime
              ? {
                  filename: txAttachmentName,
                  mimeType: txAttachmentMime,
                  dataBase64: txAttachmentBase64,
                }
              : undefined,
        });
        onNotify('Credit card spend recorded!');
      }
      setDetailedModalOpen(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to save spend', 'err');
    } finally {
      setIsSavingTx(false);
    }
  };

  // Open Card Modal
  const handleOpenAddCard = () => {
    setEditingCard(null);
    setCardName('');
    setCardInstitution('');
    setCardLast4('');
    setCardLimitStr('100000');
    setCardStatementDay(15);
    setCardDueDay(5);
    setCardScope('business');
    setCardModalOpen(true);
  };

  const handleOpenEditCard = (card: AccountRecord) => {
    setEditingCard(card);
    setCardName(card.name);
    setCardInstitution(card.institution || '');
    setCardLast4(card.last4 || '');
    setCardLimitStr(((card.creditLimitMinor || 10000000) / 100).toString());
    setCardStatementDay(card.statementDay || 15);
    setCardDueDay(card.dueDay || 5);
    setCardScope(card.scope);
    setCardModalOpen(true);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim()) {
      onNotify('Card name is required (e.g. HDFC Regalia, ICICI Amazon Pay)', 'err');
      return;
    }
    const limitMinor = rupeesToPaise(cardLimitStr);
    try {
      setIsSavingCard(true);
      if (editingCard) {
        await api.updateAccount(editingCard.id, {
          name: cardName.trim(),
          type: 'credit_card',
          accountGroup: 'credit_card',
          scope: cardScope,
          institution: cardInstitution.trim(),
          last4: cardLast4.trim(),
          creditLimitMinor: limitMinor,
          statementDay: cardStatementDay,
          dueDay: cardDueDay,
        });
        onNotify('Credit card updated!');
      } else {
        await api.createAccount({
          name: cardName.trim(),
          type: 'credit_card',
          accountGroup: 'credit_card',
          scope: cardScope,
          institution: cardInstitution.trim(),
          last4: cardLast4.trim(),
          openingBalanceMinor: 0,
          creditLimitMinor: limitMinor,
          statementDay: cardStatementDay,
          dueDay: cardDueDay,
        });
        onNotify('New credit card added!');
      }
      setCardModalOpen(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to save card', 'err');
    } finally {
      setIsSavingCard(false);
    }
  };

  // Open Reconcile & Pay Bill Modal
  const handleOpenPayBill = async (card: AccountRecord) => {
    setPayCardAccount(card);
    setPayAmountStr((Math.abs(card.currentBalanceMinor || 0) / 100).toFixed(2));
    setPayFromBankId(bankAccounts[0]?.id || '');
    setPayCardModalOpen(true);
    try {
      const recon = await api.getCardReconciliation(card.id);
      setCardReconData(recon);
      const latest = recon.cycles?.[0];
      if (latest && latest.netDueMinor > 0) {
        setPayAmountStr((latest.netDueMinor / 100).toFixed(2));
      }
    } catch {
      // ignore
    }
  };

  const handlePayCardBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCardAccount || !payFromBankId) {
      onNotify('Select a paying bank account', 'err');
      return;
    }
    const amtMinor = rupeesToPaise(payAmountStr);
    if (amtMinor <= 0) {
      onNotify('Payment amount must be greater than ₹0', 'err');
      return;
    }

    try {
      setIsPayingCard(true);
      await api.reconcileAndPayCard(payCardAccount.id, {
        fromAccountId: payFromBankId,
        amountMinor: amtMinor,
        occurredAt: todayISO(),
        note: `Bill Payment for ${payCardAccount.name}`,
      });
      onNotify(`Paid ₹${payAmountStr} towards ${payCardAccount.name} statement!`);
      setPayCardModalOpen(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to record card payment', 'err');
    } finally {
      setIsPayingCard(false);
    }
  };

  // View Attachment
  const handleViewAttachment = async (tx: TransactionRecord) => {
    try {
      const res = await api.getTransactionAttachment(tx.id);
      setAttachmentData(res);
      setAttachmentViewerTx(tx);
    } catch {
      onNotify('Could not load receipt attachment', 'err');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredTxs.length === 0) {
      onNotify('No transactions to export', 'err');
      return;
    }
    const headers = ['Date', 'Card', 'Merchant/Party', 'Amount (INR)', 'Category', 'Scope', 'Note'];
    const rows = filteredTxs.map((t) => [
      t.occurredAt,
      `"${t.accountName.replace(/"/g, '""')}"`,
      `"${t.party.replace(/"/g, '""')}"`,
      (t.amountMinor / 100).toFixed(2),
      `"${t.category.replace(/"/g, '""')}"`,
      t.scope,
      `"${(t.note || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `credit-card-spends-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotify('Exported card spends to CSV!');
  };

  // Delete Transaction
  const handleDeleteTx = async () => {
    if (!deleteTxConfirmId) return;
    try {
      await api.deleteTransaction(deleteTxConfirmId);
      onNotify('Transaction removed');
      setDeleteTxConfirmId(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to delete transaction', 'err');
    }
  };

  // Delete Card
  const handleDeleteCard = async () => {
    if (!deleteCardConfirmId) return;
    try {
      await api.deleteAccount(deleteCardConfirmId);
      onNotify('Credit card removed');
      setDeleteCardConfirmId(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Cannot delete card with transactions', 'err');
    }
  };

  return (
    <div className="space-y-5 animate-panel-in">
      {/* ==================== 1. EXECUTIVE HEADER TOOLBAR ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DC] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111318] border border-[#C59B27]/45 text-[#E5C158] shadow-xs shrink-0">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
                Sovereign Credit &amp; Liability Desk
              </span>
              {selectedCardId && (
                <button
                  type="button"
                  onClick={() => setSelectedCardId(null)}
                  className="inline-flex items-center gap-1 rounded-md bg-[#111318] text-[#E5C158] px-2 py-0.5 text-[10px] font-mono-data font-semibold cursor-pointer"
                >
                  <Filter className="w-2.5 h-2.5" />
                  <span>Filtered Card · Clear ×</span>
                </button>
              )}
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-[#111318]">
              Credit Cards Command Center
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToMoney && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onNavigateToMoney}
              className="text-xs"
            >
              <Wallet className="h-3.5 w-3.5 text-[#858078] mr-1.5" />
              <span>Bank &amp; Cash Hub</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs"
            title="Download CSV spreadsheet"
          >
            <Download className="h-3.5 w-3.5 text-[#858078] mr-1.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenAddCard}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 text-[#059669] mr-1" />
            <span>New Card</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenDetailedAdd()}
            className="text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#E5C158] mr-1" />
            <span>Record Detailed Spend</span>
          </Button>
        </div>
      </div>

      {/* ==================== 2. BENTO ROW 1: 3D METALLIC CARD INSPECTOR + 14D VELOCITY WORKSTATION ==================== */}
      <CardsHeroWorkstation
        creditCards={sortedCreditCards}
        cardTransactions={cardTransactions}
        portfolioMetrics={portfolioMetrics}
        bankLiquidityMinor={totalBankLiquidity}
        selectedCardId={selectedCardId}
        onSelectCardId={setSelectedCardId}
        onSelectCategoryFilter={(cat) => setCategoryFilter(cat)}
        onOpenSwipeModal={(cardId) => handleOpenDetailedAdd(cardId)}
        onOpenPayBillModal={handleOpenPayBill}
        onOpenEditCardModal={handleOpenEditCard}
        onOpenAddCardModal={handleOpenAddCard}
        cardFinishOverrides={cardFinishOverrides}
        onChangeCardFinish={handleChangeCardFinish}
      />

      {/* ==================== 3. BENTO ROW 2: 4-COLUMN PRECISION TELEMETRY STRIP ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today's & Monthly Spend Velocity */}
        <div className="bento-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52504C]">
            <span className="font-mono-data uppercase tracking-wider text-[11px] text-[#858078]">
              Today&apos;s Card Spend
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono-data font-bold text-[#111318] bg-[#F3EFEA] px-2 py-0.5 rounded-md border border-[#EAE5DC]">
              <Zap className="h-3 w-3 text-[#C59B27]" />
              {todayCardTxs.length} swipes
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
            {formatINR(todayCardSpendMinor)}
          </div>
          <div className="mt-2 pt-2 border-t border-[#EAE5DC] flex items-center justify-between text-xs text-[#52504C]">
            <span>Current Month Spend:</span>
            <strong className="font-mono-data text-[#111318] tabular-nums">
              {formatINR(monthCardSpendMinor)}
            </strong>
          </div>
        </div>

        {/* KPI 2: Total Card Liability & Split */}
        <div className="bento-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52504C]">
            <span className="font-mono-data uppercase tracking-wider text-[11px] text-[#858078]">
              Total Card Liability
            </span>
            <span
              className={`text-[10px] font-mono-data font-bold px-2 py-0.5 rounded-md border ${
                portfolioMetrics.overallUtilizationPct > 50
                  ? 'bg-rose-50 text-[#E11D48] border-rose-200'
                  : portfolioMetrics.overallUtilizationPct > 30
                    ? 'bg-amber-50 text-[#9A7B2C] border-amber-200'
                    : 'bg-emerald-50 text-[#059669] border-emerald-200'
              }`}
            >
              {portfolioMetrics.overallUtilizationPct}% Used
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
            {formatINR(portfolioMetrics.totalDebtMinor)}
          </div>
          <div className="mt-2 pt-2 border-t border-[#EAE5DC] flex items-center justify-between text-xs text-[#52504C]">
            <span>Billed Due:</span>
            <strong className="font-mono-data text-[#E11D48] tabular-nums">
              {formatINR(portfolioMetrics.totalStatementDueMinor)}
            </strong>
          </div>
        </div>

        {/* KPI 3: Available Credit Reserve */}
        <div className="bento-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52504C]">
            <span className="font-mono-data uppercase tracking-wider text-[11px] text-[#858078]">
              Available Credit Reserve
            </span>
            <span className="text-[10px] font-mono-data font-semibold text-[#059669] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Limit: {formatINR(portfolioMetrics.totalLimitMinor, { compact: true })}
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[#059669] font-mono-data tabular-nums">
            {formatINR(portfolioMetrics.availableCreditMinor)}
          </div>
          <div className="mt-2.5 w-full bg-[#F3EFEA] rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                portfolioMetrics.overallUtilizationPct > 50
                  ? 'bg-[#E11D48]'
                  : portfolioMetrics.overallUtilizationPct > 30
                    ? 'bg-[#C59B27]'
                    : 'bg-[#059669]'
              }`}
              style={{ width: `${Math.min(100, Math.max(4, portfolioMetrics.overallUtilizationPct))}%` }}
            />
          </div>
        </div>

        {/* KPI 4: Liquid Bank Debt Coverage */}
        <div className="bento-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52504C]">
            <span className="font-mono-data uppercase tracking-wider text-[11px] text-[#858078]">
              Bank Treasury Coverage
            </span>
            <span
              className={`text-[10px] font-mono-data font-bold px-2 py-0.5 rounded-md border ${
                totalBankLiquidity >= portfolioMetrics.totalDebtMinor
                  ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                  : 'bg-amber-50 text-[#9A7B2C] border-amber-200'
              }`}
            >
              {totalBankLiquidity >= portfolioMetrics.totalDebtMinor
                ? '100% Covered'
                : 'Shortfall'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
            {formatINR(totalBankLiquidity)}
          </div>
          <div className="mt-2 pt-2 border-t border-[#EAE5DC] flex items-center justify-between text-xs text-[#52504C]">
            <span>Urgent Due (≤5d):</span>
            <strong className="font-mono-data text-[#C59B27]">
              {portfolioMetrics.urgentDueCardsCount} {portfolioMetrics.urgentDueCardsCount === 1 ? 'Card' : 'Cards'}
            </strong>
          </div>
        </div>
      </div>

      {/* ==================== 4. BENTO ROW 3: METALLIC CREDIT CARD FLEET GRID / LIST ==================== */}
      <section className="bento-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EAE5DC]">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#C59B27]" />
            <div>
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold block">
                Active Instrument Portfolio
              </span>
              <h2 className="font-display text-base font-bold text-[#111318]">
                Your Credit Card Fleet ({creditCards.length})
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCardId && (
              <button
                type="button"
                onClick={() => setSelectedCardId(null)}
                className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer mr-1"
              >
                Show All {creditCards.length} Cards
              </button>
            )}

            <SortSelect
              label="Sort"
              value={cardSort}
              onChange={(v) =>
                setCardSort(
                  v as
                    | 'debt_desc'
                    | 'debt_asc'
                    | 'util_desc'
                    | 'due_date'
                    | 'limit_desc'
                    | 'name_asc',
                )
              }
              options={[
                { value: 'debt_desc', label: 'Highest Debt' },
                { value: 'debt_asc', label: 'Lowest Debt' },
                { value: 'util_desc', label: 'Utilization' },
                { value: 'due_date', label: 'Next Due Date' },
                { value: 'limit_desc', label: 'Highest Limit' },
                { value: 'name_asc', label: 'Name (A-Z)' },
              ]}
            />

            <ViewModeToggle
              value={cardViewMode}
              onChange={setCardViewMode}
              gridLabel="Card Grid"
              listLabel="Card List"
            />
          </div>
        </div>

        {creditCards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D6CFC2] p-8 text-center bg-[#FAF8F5]">
            <CreditCard className="mx-auto h-8 w-8 text-[#858078] mb-2" />
            <h3 className="font-display text-sm font-bold text-[#111318]">
              No Credit Cards Linked Yet
            </h3>
            <p className="text-xs text-[#52504C] max-w-sm mx-auto mt-1 mb-4">
              Add your primary cards (e.g. HDFC Regalia Gold, Amex Platinum Travel, ICICI Amazon Pay) to track billing cycles and daily spend velocity.
            </p>
            <Button variant="primary" size="sm" onClick={handleOpenAddCard}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Add Your First Credit Card</span>
            </Button>
          </div>
        ) : cardViewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCreditCards.map((card, idx) => {
              const outstanding = Math.abs(card.currentBalanceMinor || 0);
              const limit = card.creditLimitMinor || 0;
              const utilPct = limit > 0 ? (outstanding / limit) * 100 : 0;
              const isSelected = selectedCardId === card.id;
              const override = cardFinishOverrides[card.id];
              const finish = override
                ? getMetallicFinishById(override, 'credit')
                : resolveMetallicFinish(card.name, idx, 'credit');
              const cycle = card.cardCycle;
              const statementDateStr = cycle?.nextStatementDate
                ? formatDisplayDateShort(cycle.nextStatementDate)
                : formatOrdinalDay(card.statementDay || 15);
              const dueDateStr = cycle?.nextDueDate
                ? formatDisplayDateShort(cycle.nextDueDate)
                : formatOrdinalDay(card.dueDay || 5);
              const statementDue = cycle?.statementDueMinor || 0;
              const unbilled =
                cycle?.unbilledMinor ??
                (outstanding > statementDue ? outstanding - statementDue : outstanding);
              const availableLimit = Math.max(0, limit - outstanding);

              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCardId(isSelected ? null : card.id)}
                  className={`rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden group ${
                    isSelected
                      ? 'border-[#111318] ring-2 ring-[#C59B27]/50 shadow-lg bg-white'
                      : 'border-[#EAE5DC] bg-[#FAF8F5] hover:bg-white hover:border-[#D6CFC2] shadow-2xs'
                  }`}
                >
                  {/* Top Metallic Instrument Header Band */}
                  <div
                    className={`${finish.cssClass} p-4 relative overflow-hidden ${
                      finish.isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 relative z-10">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono-data uppercase tracking-[0.16em] px-1.5 py-0.5 rounded border ${
                              finish.isLightSurface
                                ? 'bg-[#111318]/10 border-[#111318]/20 text-[#111318]'
                                : 'bg-white/10 border-white/15 text-[#FBE698]'
                            }`}
                          >
                            {card.institution || finish.tierBadge}
                          </span>
                          <span className="text-[10px] font-mono-data opacity-75">
                            {SCOPE_META[card.scope].label}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-bold tracking-tight mt-1.5 truncate">
                          {card.name}
                        </h3>
                      </div>

                      <span
                        className={`text-[10px] font-mono-data font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                          finish.isLightSurface
                            ? 'bg-white/80 text-[#111318] border-[#111318]/20'
                            : 'bg-black/35 text-[#E5C158] border-white/15'
                        }`}
                      >
                        {utilPct.toFixed(0)}% Util
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between relative z-10">
                      {/* Mini Metallic EMV Chip */}
                      <div className="w-8 h-6 rounded bg-gradient-to-br from-[#FBE698] via-[#D4AF37] to-[#9A7B2C] border border-white/30 flex items-center justify-center">
                        <div className="w-4 h-3 border border-black/25 rounded-2xs" />
                      </div>
                      <span className="font-mono-data text-xs tracking-[0.2em] font-semibold opacity-90">
                        •••• •••• •••• {card.last4 || '0000'}
                      </span>
                    </div>
                  </div>

                  {/* Card Telemetry Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      {/* Total Outstanding Readout */}
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-mono-data uppercase tracking-wider text-[#858078]">
                          Total Outstanding
                        </span>
                        <span className="text-lg font-extrabold font-mono-data text-[#111318] tabular-nums">
                          {formatINR(outstanding)}
                        </span>
                      </div>

                      {/* Statement Billed vs Unbilled Sub-Grid */}
                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-white border border-[#EAE5DC] p-2.5">
                          <span className="text-[10px] font-mono-data uppercase text-[#858078] block">
                            Statement Due
                          </span>
                          <span
                            className={`font-mono-data font-bold tabular-nums ${
                              statementDue > 0 ? 'text-[#E11D48]' : 'text-[#111318]'
                            }`}
                          >
                            {formatINR(statementDue)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-white border border-[#EAE5DC] p-2.5">
                          <span className="text-[10px] font-mono-data uppercase text-[#858078] block">
                            Unbilled Spend
                          </span>
                          <span className="font-mono-data font-bold text-[#111318] tabular-nums">
                            {formatINR(unbilled)}
                          </span>
                        </div>
                      </div>

                      {/* Bill Date & Due Date Strip */}
                      <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-xl bg-[#F3EFEA]/75 border border-[#EAE5DC] p-2.5 text-xs">
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-mono-data uppercase text-[#858078]">
                            <Calendar className="w-3 h-3 text-[#858078]" />
                            <span>Bill Date</span>
                          </div>
                          <div className="font-mono-data font-bold text-[#111318] mt-0.5">
                            {statementDateStr}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-mono-data uppercase text-[#858078]">
                            <Clock className="w-3 h-3 text-[#C59B27]" />
                            <span>Due Date</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono-data font-bold text-[#111318]">
                              {dueDateStr}
                            </span>
                            {cycle && (
                              <span
                                className={`text-[9px] font-mono-data font-bold px-1.5 py-0.2 rounded border ${
                                  cycle.daysUntilDue < 0 || cycle.isBillOverdue
                                    ? 'bg-rose-50 text-[#E11D48] border-rose-200'
                                    : cycle.daysUntilDue <= 5
                                      ? 'bg-amber-50 text-[#9A7B2C] border-amber-200'
                                      : 'bg-emerald-50 text-[#059669] border-emerald-200'
                                }`}
                              >
                                {cycle.daysUntilDue < 0 ? 'Overdue' : `${cycle.daysUntilDue}d`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Available vs Limit */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#52504C]">
                        <span>
                          Avail:{' '}
                          <strong className="text-[#059669] font-mono-data font-semibold">
                            {formatINR(availableLimit, { compact: true })}
                          </strong>
                        </span>
                        <span>
                          Limit:{' '}
                          <strong className="text-[#111318] font-mono-data font-semibold">
                            {formatINR(limit, { compact: true })}
                          </strong>
                        </span>
                      </div>

                      <div className="mt-1.5 w-full bg-[#EAE5DC] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            utilPct > 50
                              ? 'bg-[#E11D48]'
                              : utilPct > 30
                                ? 'bg-[#C59B27]'
                                : 'bg-[#059669]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(4, utilPct))}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="pt-3 border-t border-[#EAE5DC] flex items-center justify-between gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetailedAdd(card.id);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold cursor-pointer inline-flex items-center justify-center gap-1"
                      >
                        <Plus className="h-3 w-3 text-[#E5C158]" />
                        <span>Swipe</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPayBill(card);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#059669] border border-emerald-200 font-semibold cursor-pointer text-center"
                      >
                        Pay Bill
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditCard(card);
                        }}
                        className="p-1.5 rounded-lg border border-[#EAE5DC] bg-white hover:bg-[#F3EFEA] text-[#52504C] hover:text-[#111318] cursor-pointer"
                        title="Edit Card Details"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List Mode */
          <div className="space-y-2.5">
            {sortedCreditCards.map((card, idx) => {
              const outstanding = Math.abs(card.currentBalanceMinor || 0);
              const limit = card.creditLimitMinor || 0;
              const utilPct = limit > 0 ? (outstanding / limit) * 100 : 0;
              const isSelected = selectedCardId === card.id;
              const override = cardFinishOverrides[card.id];
              const finish = override
                ? getMetallicFinishById(override, 'credit')
                : resolveMetallicFinish(card.name, idx, 'credit');
              const cycle = card.cardCycle;
              const statementDateStr = cycle?.nextStatementDate
                ? formatDisplayDateShort(cycle.nextStatementDate)
                : formatOrdinalDay(card.statementDay || 15);
              const dueDateStr = cycle?.nextDueDate
                ? formatDisplayDateShort(cycle.nextDueDate)
                : formatOrdinalDay(card.dueDay || 5);
              const statementDue = cycle?.statementDueMinor || 0;
              const unbilled =
                cycle?.unbilledMinor ??
                (outstanding > statementDue ? outstanding - statementDue : outstanding);
              const availableLimit = Math.max(0, limit - outstanding);

              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCardId(isSelected ? null : card.id)}
                  className={`rounded-xl border transition-all p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'border-[#111318] bg-white ring-2 ring-[#C59B27]/45'
                      : 'border-[#EAE5DC] bg-[#FAF8F5] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-[210px]">
                    <div
                      className={`w-10 h-7 rounded-lg ${finish.cssClass} flex items-center justify-center shrink-0`}
                    >
                      <div className="w-4 h-3 rounded-2xs bg-[#E5C158]/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-sm text-[#111318]">
                          {card.name}
                        </span>
                        <span className="font-mono-data text-xs text-[#858078]">
                          ••{card.last4 || '0000'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#52504C]">
                        {card.institution || finish.label} · {SCOPE_META[card.scope].label}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 px-1">
                    <div className="text-xs">
                      <span className="text-[10px] uppercase font-mono-data text-[#858078] block">
                        Bill / Due
                      </span>
                      <span className="font-mono-data font-bold text-[#111318]">
                        {statementDateStr} → {dueDateStr}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-mono-data text-[#858078] block">
                        Outstanding
                      </span>
                      <span className="text-sm font-bold font-mono-data text-[#111318] tabular-nums">
                        {formatINR(outstanding)}
                      </span>
                      <span className="text-[10px] text-[#858078] font-mono-data block">
                        Stmt: {formatINR(statementDue, { compact: true })} · Unbilled:{' '}
                        {formatINR(unbilled, { compact: true })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-mono-data text-[#858078] block">
                        Credit Limit
                      </span>
                      <span className="text-sm font-medium font-mono-data text-[#111318] tabular-nums">
                        {formatINR(limit, { compact: true })}
                      </span>
                      <span className="text-[10px] text-[#059669] font-mono-data block">
                        Avail: {formatINR(availableLimit, { compact: true })} ({utilPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end lg:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetailedAdd(card.id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#111318] text-[#FAF8F5] text-xs font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3 text-[#E5C158]" />
                      <span>Swipe</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPayBill(card);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-[#059669] border border-emerald-200 text-xs font-semibold cursor-pointer"
                    >
                      Pay Bill
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditCard(card);
                      }}
                      className="p-1.5 rounded-lg border border-[#EAE5DC] bg-white text-[#52504C] hover:text-[#111318] cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ==================== 5. BENTO ROW 4: HIGH-SPEED SPEND ENTRY WORKSTATION ==================== */}
      <section className="bento-card rounded-2xl overflow-hidden">
        <div className="border-b border-[#EAE5DC] bg-[#F3EFEA]/70 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#059669]" />
            <div>
              <h2 className="font-display text-sm font-bold text-[#111318]">
                High-Speed Daily Swipe Desk
              </h2>
              <p className="text-[11px] text-[#52504C]">
                Batch multi-row card spend logger &amp; automated bank SMS alert parser
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 bg-white border border-[#EAE5DC] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setEntryTab('rapid')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                entryTab === 'rapid'
                  ? 'bg-[#111318] text-[#FAF8F5]'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[#E5C158]" />
              <span>Rapid Multi-Row Logger</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('sms')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                entryTab === 'sms'
                  ? 'bg-[#111318] text-[#FAF8F5]'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 text-[#059669]" />
              <span>Paste Bank SMS Alerts</span>
            </button>
          </div>
        </div>

        {entryTab === 'rapid' ? (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#52504C]">
              <p>
                Log 1 to 20 card swipes in one batch. Click any quick-fill merchant chip below or enter custom rows.
              </p>
              <span className="font-mono-data text-[#111318] font-semibold">
                {rapidRows.filter((r) => parseFloat(r.amountStr) > 0).length} valid entries ready
              </span>
            </div>

            <div className="overflow-x-auto border border-[#EAE5DC] rounded-xl bg-[#FAF8F5]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F3EFEA] border-b border-[#EAE5DC] text-[#52504C] font-mono-data uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 w-32">Date</th>
                    <th className="py-2.5 px-3 w-48">Card Used</th>
                    <th className="py-2.5 px-3 w-32">Amount (₹)</th>
                    <th className="py-2.5 px-3 w-56">Merchant / Store</th>
                    <th className="py-2.5 px-3 w-40">Category</th>
                    <th className="py-2.5 px-3 w-28">Scope</th>
                    <th className="py-2.5 px-3">Note / Tag</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE5DC] bg-white">
                  {rapidRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#FAF8F5] transition-colors">
                      <td className="p-2">
                        <input
                          type="date"
                          value={row.occurredAt}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { occurredAt: e.target.value })
                          }
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] font-mono-data focus:border-[#111318] focus:outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <select
                          value={row.cardId}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { cardId: e.target.value })
                          }
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] font-medium focus:border-[#111318] focus:outline-none"
                        >
                          {creditCards.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (••{c.last4 || '00'})
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1 text-[#858078] font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.amountStr}
                            onChange={(e) =>
                              handleUpdateRapidRow(row.id, { amountStr: e.target.value })
                            }
                            className="w-full rounded-lg border border-[#EAE5DC] bg-white pl-5 pr-2 py-1 text-xs font-bold font-mono-data text-[#111318] focus:border-[#111318] focus:outline-none"
                          />
                        </div>
                      </td>

                      <td className="p-2">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder="e.g. Swiggy, Amazon, Shell"
                            value={row.party}
                            onChange={(e) =>
                              handleUpdateRapidRow(row.id, { party: e.target.value })
                            }
                            className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 pr-7 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                          />
                          {row.party.trim().length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleSaveRowAsMerchantPreset(row)}
                              title={`Save "${row.party.trim()}" as a Quick-Fill Preset`}
                              className="absolute right-1 text-[#858078] hover:text-[#111318] p-0.5 rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                            >
                              <BookmarkPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="p-2">
                        <select
                          value={row.category}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { category: e.target.value })
                          }
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        >
                          {getCategoryOptions(row.scope, 'expense').map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2">
                        <select
                          value={row.scope}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { scope: e.target.value as Scope })
                          }
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] capitalize focus:border-[#111318] focus:outline-none"
                        >
                          <option value="business">Business</option>
                          <option value="personal">Personal</option>
                          <option value="family">Family</option>
                        </select>
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="Optional note / tag"
                          value={row.note}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { note: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddRapidRow();
                            }
                          }}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        />
                      </td>

                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRapidRow(row.id)}
                          className="text-[#858078] hover:text-[#E11D48] p-1 rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Merchant Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-[#52504C]">Quick fill merchant:</span>
              {quickMerchants.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleApplyMerchantChip(m)}
                  title={`Click to fill or append row: ${m.name} (${m.category})`}
                  className="px-2 py-0.5 text-[11px] font-medium rounded-lg bg-[#F3EFEA] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] transition-colors cursor-pointer border border-[#EAE5DC] inline-flex items-center gap-1"
                >
                  +{m.name}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setManageMerchantsOpen(true)}
                className="px-2.5 py-0.5 text-[11px] font-semibold rounded-lg bg-white hover:bg-[#F3EFEA] text-[#111318] transition-colors cursor-pointer border border-[#D6CFC2] inline-flex items-center gap-1"
              >
                <SlidersHorizontal className="h-3 w-3 text-[#C59B27]" />
                <span>Customize ({quickMerchants.length})</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#EAE5DC]">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddRapidRow}
                className="text-xs border-dashed"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span>Add Another Row (or Press Enter)</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setRapidRows([
                      {
                        id: `row-${Date.now()}`,
                        occurredAt: todayISO(),
                        cardId: selectedCardId || creditCards[0]?.id || '',
                        amountStr: '',
                        party: '',
                        category: 'Shopping',
                        scope: 'personal',
                        note: '',
                      },
                    ])
                  }
                  className="text-xs"
                >
                  Clear All
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCommitRapidRows}
                  disabled={isSavingRapid}
                  className="text-xs"
                >
                  <Zap className="h-3.5 w-3.5 text-[#E5C158] mr-1" />
                  <span>
                    {isSavingRapid
                      ? 'Recording Spends...'
                      : `Save All Spends (${rapidRows.filter((r) => parseFloat(r.amountStr) > 0).length})`}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#111318] mb-1.5">
                Paste Bank SMS Messages (HDFC, ICICI, SBI, Axis, Amex, Kotak, etc.)
              </label>
              <textarea
                rows={5}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder={`Example:\nAlert: You've spent INR 1,450.00 on your ICICI Bank Credit Card XX1234 at SWIGGY on 14-Nov-2026.\nDear SBI Cardholder, payment of Rs 3,200.00 made on card ending 5678 at SHELL PETROL on 14/11/2026.`}
                className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3 text-xs text-[#111318] font-mono-data focus:border-[#111318] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[#858078]">
                Automatically extracts card last 4 digits, merchant name, transaction amount, and date into editable rows.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleParseSms}
                disabled={isParsingSms || !smsText.trim()}
                className="text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#E5C158] mr-1" />
                <span>{isParsingSms ? 'Analyzing SMS...' : 'Parse & Convert to Spends'}</span>
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ==================== 6. BENTO ROW 5: CREDIT CARD EXPENSE & SETTLEMENT LEDGER ==================== */}
      <section className="bento-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#EAE5DC]">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#C59B27]" />
            <h3 className="font-display text-sm font-bold text-[#111318]">
              Credit Card Expense &amp; Settlement Ledger
            </h3>
            <span className="text-xs font-mono-data text-[#858078]">
              ({filteredTxs.length} entries)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#858078]" />
              <input
                type="text"
                placeholder="Search merchant, card, note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] pl-8 pr-2.5 py-1 text-xs text-[#111318] placeholder-[#858078] focus:border-[#111318] focus:bg-white focus:outline-none"
              />
            </div>

            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as Scope | 'all')}
              className="rounded-xl border border-[#EAE5DC] bg-white px-2.5 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
            >
              <option value="all">All Scopes</option>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="family">Family</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-[#EAE5DC] bg-white px-2.5 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
            >
              <option value="all">All Categories</option>
              {Array.from(new Set(cardTransactions.map((t) => t.category)))
                .sort()
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) =>
                setDateFilter(e.target.value as 'all' | 'today' | '7days' | 'month')
              }
              className="rounded-xl border border-[#EAE5DC] bg-white px-2.5 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
            >
              <option value="all">All Dates</option>
              <option value="today">Today Only</option>
              <option value="7days">Past 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {groupedTxs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D6CFC2] p-8 text-center text-xs text-[#858078] bg-[#FAF8F5]">
            No credit card transactions match your filter criteria. Record a swipe using the Rapid Multi-Row Logger above.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedTxs.map(([dateKey, txs]) => {
              const daySpendTotalMinor = txs
                .filter((t) => t.kind === 'expense')
                .reduce((s, t) => s + t.amountMinor, 0);

              return (
                <div key={dateKey} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#111318]">
                      <Calendar className="h-3.5 w-3.5 text-[#C59B27]" />
                      <span className="font-mono-data">
                        {dateKey === todayStr ? `Today (${dateKey})` : dateKey}
                      </span>
                      <span className="text-[11px] font-normal text-[#858078]">
                        · {txs.length} {txs.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <span className="text-xs font-bold font-mono-data text-[#111318]">
                      {formatINR(daySpendTotalMinor)}
                    </span>
                  </div>

                  <div className="divide-y divide-[#EAE5DC] rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] overflow-hidden">
                    {txs.map((tx) => {
                      const isExpense = tx.kind === 'expense';
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 hover:bg-white transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                                isExpense
                                  ? 'bg-[#111318] text-[#E5C158] border-[#C59B27]/35'
                                  : 'bg-emerald-50 text-[#059669] border-emerald-200'
                              }`}
                            >
                              {isExpense ? (
                                <ArrowUpRight className="h-4 w-4" />
                              ) : (
                                <ArrowDownLeft className="h-4 w-4" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-[#111318] truncate">
                                  {tx.party || tx.category}
                                </span>
                                <span className="text-[10px] font-mono-data font-semibold text-[#111318] bg-[#F3EFEA] px-1.5 py-0.5 rounded border border-[#EAE5DC] truncate">
                                  {tx.accountName}
                                </span>
                                <span className="text-[10px] font-mono-data text-[#858078] hidden sm:inline">
                                  · {tx.category}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-[#52504C] mt-0.5">
                                <span className="capitalize">{SCOPE_META[tx.scope].label}</span>
                                {tx.note && <span className="truncate">· {tx.note}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {tx.hasAttachment && (
                              <button
                                type="button"
                                onClick={() => handleViewAttachment(tx)}
                                className="text-[#858078] hover:text-[#111318] p-1 rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                                title="View Receipt"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <div className="text-right">
                              <div
                                className={`text-xs font-bold font-mono-data tabular-nums ${
                                  isExpense ? 'text-[#111318]' : 'text-[#059669]'
                                }`}
                              >
                                {isExpense ? '-' : '+'}
                                {formatINR(tx.amountMinor)}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateSwipe(tx)}
                                className="text-[#858078] hover:text-[#111318] p-1 rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                                title="Repeat / Duplicate Swipe"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDetailedEdit(tx)}
                                className="text-[#858078] hover:text-[#111318] p-1 rounded hover:bg-[#F3EFEA] transition-colors cursor-pointer"
                                title="Edit Spend"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTxConfirmId(tx.id)}
                                className="text-[#858078] hover:text-[#E11D48] p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Spend"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ==================== 7. MODALS ==================== */}

      {/* A. Detailed Single Spend Modal */}
      <Dialog
        open={detailedModalOpen}
        onClose={() => setDetailedModalOpen(false)}
        title={editingTx ? 'Edit Credit Card Spend' : 'Record Detailed Credit Card Spend'}
      >
        <form onSubmit={handleSaveDetailedSpend} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="cardSelect">Select Credit Card *</FieldLabel>
              <Select
                id="cardSelect"
                value={txCardId}
                onChange={(e) => setTxCardId(e.target.value)}
                required
              >
                <option value="">Select Card</option>
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (•••• {c.last4 || '0000'})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="amountInput">Amount (₹) *</FieldLabel>
              <Input
                id="amountInput"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={txAmountStr}
                onChange={(e) => setTxAmountStr(e.target.value)}
                required
                className="font-mono-data font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="merchantInput">Merchant / Store / Payee *</FieldLabel>
                <button
                  type="button"
                  onClick={() => setManageMerchantsOpen(true)}
                  className="text-[11px] text-[#059669] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="h-2.5 w-2.5" />
                  <span>Presets</span>
                </button>
              </div>
              <Input
                id="merchantInput"
                type="text"
                placeholder="e.g. Amazon, Swiggy, Shell Petrol, Uber"
                value={txParty}
                onChange={(e) => setTxParty(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {quickMerchants.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setTxParty(m.name);
                      setTxCategory(m.category);
                      setTxScope(m.scope);
                    }}
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#F3EFEA] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] border border-[#EAE5DC] cursor-pointer"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="dateInput">Date of Swipe *</FieldLabel>
              <Input
                id="dateInput"
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="categorySelect">Category</FieldLabel>
              <CategorySelect
                id="categorySelect"
                options={getCategoryOptions(txScope, 'expense')}
                value={txCategory}
                onChange={setTxCategory}
              />
            </div>

            <div>
              <FieldLabel htmlFor="scopeSelect">Scope</FieldLabel>
              <Select
                id="scopeSelect"
                value={txScope}
                onChange={(e) => setTxScope(e.target.value as Scope)}
              >
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="noteInput">Description / Tags / Notes</FieldLabel>
            <Input
              id="noteInput"
              type="text"
              placeholder="e.g. Team dinner, flight ticket, 5% cashback offer"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
            />
          </div>

          {!editingTx && (
            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Split className="h-4 w-4 text-[#C59B27]" />
                  <span className="text-xs font-bold text-[#111318]">
                    Split Bill with Friends (Auto-create Khatabook Dues)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={splitEnabled}
                  onChange={(e) => setSplitEnabled(e.target.checked)}
                  className="rounded text-[#111318] cursor-pointer"
                />
              </div>

              {splitEnabled && (
                <div className="space-y-2 pt-2 border-t border-[#EAE5DC]">
                  <FieldLabel htmlFor="friendsInput">Friends&apos; Names (comma separated)</FieldLabel>
                  <Input
                    id="friendsInput"
                    type="text"
                    placeholder="e.g. Rahul, Pooja, Amit"
                    value={splitFriendsStr}
                    onChange={(e) => setSplitFriendsStr(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeSelf"
                      checked={splitIncludeSelf}
                      onChange={(e) => setSplitIncludeSelf(e.target.checked)}
                      className="rounded text-[#111318] cursor-pointer"
                    />
                    <label htmlFor="includeSelf" className="text-xs text-[#52504C]">
                      Include my own share in split calculation
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <FieldLabel htmlFor="receiptUpload">Attach Bill / Receipt Photo (Optional)</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    onNotify('File size must be under 5 MB', 'err');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setTxAttachmentBase64(reader.result as string);
                    setTxAttachmentName(file.name);
                    setTxAttachmentMime(file.type || 'image/png');
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <UploadCloud className="h-3.5 w-3.5 mr-1" />
                <span>{txAttachmentName ? 'Change File' : 'Upload File / Receipt'}</span>
              </Button>
              {txAttachmentName && (
                <span className="text-xs text-[#52504C] truncate max-w-xs">{txAttachmentName}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#EAE5DC]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDetailedModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSavingTx}>
              {isSavingTx ? 'Saving...' : editingTx ? 'Update Spend' : 'Record Spend'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* B. Add / Edit Credit Card Modal */}
      <Dialog
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        title={editingCard ? 'Edit Credit Card' : 'Add New Credit Card'}
      >
        <form onSubmit={handleSaveCard} className="space-y-4">
          <div>
            <FieldLabel htmlFor="cName">Card Name *</FieldLabel>
            <Input
              id="cName"
              type="text"
              placeholder="e.g. HDFC Regalia Gold, ICICI Amazon Pay, SBI Cashback"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="cInst">Issuing Bank / Institution</FieldLabel>
              <Input
                id="cInst"
                type="text"
                placeholder="e.g. HDFC Bank, ICICI Bank, SBI, Axis, Amex"
                value={cardInstitution}
                onChange={(e) => setCardInstitution(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel htmlFor="cLast4">Last 4 Digits</FieldLabel>
              <Input
                id="cLast4"
                type="text"
                maxLength={4}
                placeholder="e.g. 4321"
                value={cardLast4}
                onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="cLimit">Credit Limit (₹)</FieldLabel>
              <Input
                id="cLimit"
                type="number"
                min="0"
                value={cardLimitStr}
                onChange={(e) => setCardLimitStr(e.target.value)}
                required
              />
            </div>

            <div>
              <FieldLabel htmlFor="cStatDay">Statement Day (1-28)</FieldLabel>
              <Input
                id="cStatDay"
                type="number"
                min="1"
                max="28"
                value={cardStatementDay}
                onChange={(e) => setCardStatementDay(parseInt(e.target.value) || 15)}
                required
              />
            </div>

            <div>
              <FieldLabel htmlFor="cDueDay">Payment Due Day (1-28)</FieldLabel>
              <Input
                id="cDueDay"
                type="number"
                min="1"
                max="28"
                value={cardDueDay}
                onChange={(e) => setCardDueDay(parseInt(e.target.value) || 5)}
                required
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="cScope">Scope</FieldLabel>
            <Select
              id="cScope"
              value={cardScope}
              onChange={(e) => setCardScope(e.target.value as Scope)}
            >
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="family">Family</option>
            </Select>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-[#EAE5DC]">
            {editingCard ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  setCardModalOpen(false);
                  setDeleteCardConfirmId(editingCard.id);
                }}
              >
                Delete Card
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCardModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isSavingCard}>
                {isSavingCard ? 'Saving...' : editingCard ? 'Update Card' : 'Add Card'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* C. Credit Card Reconcile & Bill Pay Modal */}
      <Dialog
        open={payCardModalOpen}
        onClose={() => setPayCardModalOpen(false)}
        title={`Settle Statement · ${payCardAccount?.name || 'Credit Card'}`}
      >
        <form onSubmit={handlePayCardBill} className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs space-y-1">
            <div className="font-bold text-[#059669] flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" />
              <span>Double-Entry Bank Settlement</span>
            </div>
            <p className="text-[#52504C] text-[11px]">
              Deducts from your selected Bank Account and credits this Credit Card, clearing the liability and restoring available limit.
            </p>
          </div>

          <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#52504C]">Total Outstanding Balance:</span>
              <span className="font-bold text-[#111318] font-mono-data">
                {formatINR(Math.abs(payCardAccount?.currentBalanceMinor || 0))}
              </span>
            </div>
            {cardReconData?.cycles?.[0] && (
              <div className="flex justify-between text-[#059669]">
                <span>Latest Statement Billed Due:</span>
                <span className="font-bold font-mono-data">
                  {formatINR(cardReconData.cycles[0].netDueMinor)}
                </span>
              </div>
            )}
          </div>

          <div>
            <FieldLabel htmlFor="payBankSelect">Pay from Bank Account *</FieldLabel>
            <Select
              id="payBankSelect"
              value={payFromBankId}
              onChange={(e) => setPayFromBankId(e.target.value)}
              required
            >
              <option value="">Select Paying Account</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (Balance: {formatINR(b.currentBalanceMinor || 0)})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel htmlFor="payAmt">Payment Amount (₹) *</FieldLabel>
            <Input
              id="payAmt"
              type="number"
              step="0.01"
              min="0.01"
              value={payAmountStr}
              onChange={(e) => setPayAmountStr(e.target.value)}
              required
              className="font-mono-data font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#EAE5DC]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPayCardModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isPayingCard}>
              {isPayingCard ? 'Recording Payment...' : 'Confirm Bill Payment'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* D. Attachment Viewer Modal */}
      <Dialog
        open={!!attachmentViewerTx}
        onClose={() => setAttachmentViewerTx(null)}
        title={`Receipt · ${attachmentViewerTx?.party || 'Card Spend'}`}
      >
        <div className="space-y-4">
          {attachmentData ? (
            attachmentData.mimeType.startsWith('image/') ? (
              <img
                src={attachmentData.dataBase64}
                alt="Receipt"
                className="max-h-96 w-full object-contain rounded-xl border border-[#EAE5DC]"
              />
            ) : (
              <div className="p-8 text-center border border-[#EAE5DC] rounded-xl bg-[#FAF8F5]">
                <FileText className="mx-auto h-12 w-12 text-[#858078] mb-2" />
                <p className="text-xs font-semibold text-[#111318]">{attachmentData.filename}</p>
                <a
                  href={attachmentData.dataBase64}
                  download={attachmentData.filename}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#059669] font-semibold underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Document</span>
                </a>
              </div>
            )
          ) : (
            <p className="text-xs text-[#858078]">Loading attachment...</p>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAttachmentViewerTx(null)}
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* E. Delete Transaction Confirm */}
      <ConfirmDialog
        open={!!deleteTxConfirmId}
        onClose={() => setDeleteTxConfirmId(null)}
        onConfirm={handleDeleteTx}
        title="Delete Card Transaction"
        message="Are you sure you want to delete this credit card transaction? This will restore the card limit and adjust all totals."
        confirmLabel="Delete"
      />

      {/* F. Delete Card Confirm */}
      <ConfirmDialog
        open={!!deleteCardConfirmId}
        onClose={() => setDeleteCardConfirmId(null)}
        onConfirm={handleDeleteCard}
        title="Delete Credit Card"
        message="Are you sure you want to delete this credit card? Note: you can only delete cards that have 0 transactions."
        confirmLabel="Delete Card"
      />

      {/* G. Customize Quick-Fill Merchants Modal */}
      <Dialog
        open={manageMerchantsOpen}
        onClose={() => setManageMerchantsOpen(false)}
        title="Customize Quick-Fill Merchants"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#52504C]">
            Define your personalized frequent merchants for high-volume daily swipes. Clicking a preset in the rapid logger auto-fills the merchant, category, and scope instantly.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddCustomMerchant();
            }}
            className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3 space-y-3"
          >
            <div className="text-xs font-bold text-[#111318] flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-[#059669]" />
              <span>Add Custom Merchant Preset</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <FieldLabel htmlFor="newMName">Merchant Name *</FieldLabel>
                <Input
                  id="newMName"
                  type="text"
                  placeholder="e.g. D-Mart, Zepto, Cult.fit"
                  value={newMName}
                  onChange={(e) => setNewMName(e.target.value)}
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="newMCat">Default Category</FieldLabel>
                <CategorySelect
                  id="newMCat"
                  options={getCategoryOptions(newMScope, 'expense')}
                  value={newMCat}
                  onChange={setNewMCat}
                />
              </div>

              <div>
                <FieldLabel htmlFor="newMScope">Default Scope</FieldLabel>
                <Select
                  id="newMScope"
                  value={newMScope}
                  onChange={(e) => setNewMScope(e.target.value as Scope)}
                >
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="family">Family</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" size="sm" className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span>Add Preset</span>
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111318]">
                Active Presets ({quickMerchants.length})
              </span>
              <button
                type="button"
                onClick={handleResetMerchantsToDefault}
                className="text-[11px] text-[#858078] hover:text-[#E11D48] hover:underline cursor-pointer"
              >
                Reset to Standard Defaults
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[#EAE5DC] border border-[#EAE5DC] rounded-xl bg-white p-2">
              {quickMerchants.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-1.5 px-2 hover:bg-[#FAF8F5] rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#111318]">{m.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#F3EFEA] text-[#52504C] border border-[#EAE5DC]">
                      {m.category}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-[#059669] capitalize border border-emerald-200">
                      {m.scope}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteQuickMerchant(m.id)}
                    className="text-[#858078] hover:text-[#E11D48] p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                    title={`Delete ${m.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[#EAE5DC]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setManageMerchantsOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
