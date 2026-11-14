import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Copy,
  CreditCard,
  Download,
  Edit3,
  FileText,
  Layers,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
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
import { formatINR, rupeesToPaise, todayISO } from '../lib/format.ts';
import {
  Button,
  CategorySelect,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  Select,
} from '../components/ui/Primitives.tsx';
import {
  getCategoryOptions,
  type Scope,
} from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';

export interface CardsViewProps {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  recurringBills: RecurringBillRecord[];
  budgets?: ScopeBudgetRecord[];
  monthSpentByScope?: Record<Scope, number>;
  systemLanguage?: AppLanguage;
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

const FREQUENT_MERCHANTS: Array<{ name: string; category: string; scope: Scope }> = [
  { name: 'Amazon.in', category: 'Shopping', scope: 'personal' },
  { name: 'Swiggy', category: 'Food & Dining', scope: 'personal' },
  { name: 'Zomato', category: 'Food & Dining', scope: 'personal' },
  { name: 'Blinkit', category: 'Groceries', scope: 'family' },
  { name: 'Zepto', category: 'Groceries', scope: 'family' },
  { name: 'Uber', category: 'Travel & Fuel', scope: 'personal' },
  { name: 'Shell Petrol', category: 'Travel & Fuel', scope: 'personal' },
  { name: 'MakeMyTrip', category: 'Travel & Fuel', scope: 'personal' },
  { name: 'Apollo Pharmacy', category: 'Medical & Health', scope: 'family' },
  { name: 'Netflix', category: 'Subscriptions', scope: 'family' },
  { name: 'Google Cloud / AWS', category: 'Software & SaaS', scope: 'business' },
  { name: 'Flipkart', category: 'Shopping', scope: 'personal' },
];

export function CardsView({
  accounts,
  transactions,
  recurringBills: _recurringBills,
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

  // Active Card Filter (null = all cards)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Filters for Spend Feed
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | 'month'>('all');

  // Input Mode: 'rapid' (fast batch multi-row logger) | 'detailed' (modal) | 'sms' (paste parser)
  const [entryTab, setEntryTab] = useState<'rapid' | 'sms'>('rapid');

  // 2. Rapid Multi-Row Spend Logger State (Tailored for high daily volume)
  const [rapidRows, setRapidRows] = useState<RapidSpendRow[]>(() => [
    {
      id: 'row-1',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Food & Dining',
      scope: 'personal',
      note: '',
    },
    {
      id: 'row-2',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Shopping',
      scope: 'personal',
      note: '',
    },
    {
      id: 'row-3',
      occurredAt: todayISO(),
      cardId: creditCards[0]?.id || '',
      amountStr: '',
      party: '',
      category: 'Travel & Fuel',
      scope: 'personal',
      note: '',
    },
  ]);
  const [isSavingRapid, setIsSavingRapid] = useState(false);

  // If creditCards load later, sync initial cardId
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

  // 4. Detailed Spend Modal State
  const [detailedModalOpen, setDetailedModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [txCardId, setTxCardId] = useState('');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txDate, setTxDate] = useState(todayISO());
  const [txParty, setTxParty] = useState('');
  const [txCategory, setTxCategory] = useState('Food & Dining');
  const [txScope, setTxScope] = useState<Scope>('personal');
  const [txNote, setTxNote] = useState('');
  const [txAttachmentBase64, setTxAttachmentBase64] = useState<string | null>(null);
  const [txAttachmentName, setTxAttachmentName] = useState<string | null>(null);
  const [txAttachmentMime, setTxAttachmentMime] = useState<string | null>(null);
  // Split Khatabook state
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
  const [cardScope, setCardScope] = useState<Scope>('personal');
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
  const [attachmentData, setAttachmentData] = useState<{ filename: string; mimeType: string; dataBase64: string } | null>(null);
  const [deleteTxConfirmId, setDeleteTxConfirmId] = useState<string | null>(null);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter transactions belonging to credit cards
  const creditCardIds = useMemo(() => new Set(creditCards.map((c) => c.id)), [creditCards]);

  const cardTransactions = useMemo(() => {
    return transactions.filter(
      (tx) => creditCardIds.has(tx.accountId) || (tx.toAccountId && creditCardIds.has(tx.toAccountId)),
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
    return cardTransactions.filter((tx) => tx.occurredAt.startsWith(currentMonthPrefix) && tx.kind === 'expense');
  }, [cardTransactions, currentMonthPrefix]);

  const monthCardSpendMinor = useMemo(() => {
    return monthCardTxs.reduce((sum, tx) => sum + tx.amountMinor, 0);
  }, [monthCardTxs]);

  const totalCardDebtMinor = useMemo(() => {
    return creditCards.reduce((sum, c) => sum + Math.abs(c.currentBalanceMinor || 0), 0);
  }, [creditCards]);

  const totalCardLimitMinor = useMemo(() => {
    return creditCards.reduce((sum, c) => sum + (c.creditLimitMinor || 0), 0);
  }, [creditCards]);

  const availableCreditMinor = Math.max(0, totalCardLimitMinor - totalCardDebtMinor);
  const totalUtilizationPct = totalCardLimitMinor > 0 ? (totalCardDebtMinor / totalCardLimitMinor) * 100 : 0;

  // Filtered Card Transactions Stream
  const filteredTxs = useMemo(() => {
    return cardTransactions.filter((tx) => {
      // Card Filter
      if (selectedCardId && tx.accountId !== selectedCardId && tx.toAccountId !== selectedCardId) {
        return false;
      }
      // Scope Filter
      if (scopeFilter !== 'all' && tx.scope !== scopeFilter) return false;
      // Category Filter
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      // Date Filter
      if (dateFilter === 'today' && tx.occurredAt !== todayStr) return false;
      if (dateFilter === 'month' && !tx.occurredAt.startsWith(currentMonthPrefix)) return false;
      if (dateFilter === '7days') {
        const d = new Date(tx.occurredAt).getTime();
        const now = new Date(todayStr).getTime();
        if (now - d > 7 * 86400000 || d > now) return false;
      }
      // Search Query
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
  }, [cardTransactions, selectedCardId, scopeFilter, categoryFilter, dateFilter, searchQuery, todayStr, currentMonthPrefix]);

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
        category: 'Food & Dining',
        scope: 'personal',
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

  const handleApplyMerchantChip = (rowIndex: number, merchant: (typeof FREQUENT_MERCHANTS)[number]) => {
    setRapidRows((prev) =>
      prev.map((r, i) =>
        i === rowIndex
          ? {
              ...r,
              party: merchant.name,
              category: merchant.category,
              scope: merchant.scope,
            }
          : r,
      ),
    );
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
      // Reset rows to 2 clean rows
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
        defaultScope: 'personal',
      });

      if (!res || res.length === 0) {
        onNotify('Could not detect card spends in the pasted text', 'err');
        return;
      }

      // Convert parsed candidates into rapidRows for easy review
      const convertedRows: RapidSpendRow[] = res.map((item) => ({
        id: `parsed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        occurredAt: item.occurredAt || todayISO(),
        cardId: item.accountId || creditCards[0]?.id || '',
        amountStr: (item.amountMinor / 100).toFixed(2),
        party: item.party || 'Merchant',
        category: item.category || 'Shopping',
        scope: item.scope || 'personal',
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
    setTxCategory('Food & Dining');
    setTxScope('personal');
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
        const splitPayload = splitEnabled && splitFriendsStr.trim()
          ? {
              participants: splitFriendsStr.split(',').map((s) => s.trim()).filter(Boolean),
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
    setCardScope('personal');
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
    <div className="space-y-6">
      {/* 1. Header Toolbar & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Credit Cards Command Center</h1>
              <p className="text-xs text-slate-500">
                High-volume daily spend recording, per-card limits, and billing cycle radar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToMoney && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onNavigateToMoney}
              className="text-xs border-slate-200 bg-white hover:bg-slate-50"
            >
              <Wallet className="h-3.5 w-3.5 text-slate-500 mr-1.5" />
              <span>Switch to Bank &amp; Cash</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="text-xs border-slate-200 bg-white hover:bg-slate-50"
            title="Download CSV spreadsheet"
          >
            <Download className="h-3.5 w-3.5 text-slate-500 mr-1.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenAddCard}
            className="text-xs border-blue-200 bg-blue-50/60 text-blue-800 hover:bg-blue-100/60"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span>New Card</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenDetailedAdd()}
            className="text-xs shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            <span>Record Detailed Spend</span>
          </Button>
        </div>
      </div>

      {/* 2. Executive KPI Velocity Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today's Spend Velocity */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Today's Card Spend</span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
              <Zap className="h-3 w-3" />
              {todayCardTxs.length} swipes
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950 font-mono">
            {formatINR(todayCardSpendMinor)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>This Month:</span>
            <span className="font-semibold text-slate-800 font-mono">{formatINR(monthCardSpendMinor)}</span>
          </div>
        </div>

        {/* KPI 2: Total Unbilled Debt */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Outstanding Debt</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                totalUtilizationPct > 70
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : totalUtilizationPct > 30
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {totalUtilizationPct.toFixed(1)}% Used
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-rose-700 font-mono">
            {formatINR(totalCardDebtMinor)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Combined Limit:</span>
            <span className="font-semibold text-slate-800 font-mono">{formatINR(totalCardLimitMinor)}</span>
          </div>
        </div>

        {/* KPI 3: Available Credit */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Available Credit Limit</span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
              Safe Buffer
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 font-mono">
            {formatINR(availableCreditMinor)}
          </div>
          <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalUtilizationPct > 70 ? 'bg-rose-500' : totalUtilizationPct > 30 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, totalUtilizationPct))}%` }}
            />
          </div>
        </div>

        {/* KPI 4: Active Cards & Statement Radar */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Linked Cards Portfolio</span>
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
              {creditCards.length} Cards
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>Cycle Reconciliation Active</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 truncate">
            {creditCards.length === 0
              ? 'No cards linked yet'
              : 'Auto-tracking billing cycle & statement grace'}
          </div>
        </div>
      </div>

      {/* 3. Cards Carousel & Deck */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
            <h2 className="text-sm font-bold text-slate-950 uppercase tracking-wider">Your Credit Cards</h2>
            <span className="text-xs text-slate-400 font-normal">({creditCards.length})</span>
          </div>

          {selectedCardId && (
            <button
              onClick={() => setSelectedCardId(null)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
            >
              Clear Card Filter (Show All)
            </button>
          )}
        </div>

        {creditCards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <CreditCard className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <h3 className="text-sm font-bold text-slate-900">No Credit Cards Linked Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Add your primary cards (e.g. HDFC Regalia, ICICI Amazon Pay, SBI Cashback) to start tracking high-volume daily spends.
            </p>
            <Button variant="primary" size="sm" onClick={handleOpenAddCard}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Add Your First Credit Card</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {creditCards.map((card) => {
              const outstanding = Math.abs(card.currentBalanceMinor || 0);
              const limit = card.creditLimitMinor || 0;
              const utilPct = limit > 0 ? (outstanding / limit) * 100 : 0;
              const isSelected = selectedCardId === card.id;

              return (
                <div
                  key={card.id}
                  className={`rounded-xl border transition-all duration-200 p-4 relative flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/30 ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs'
                  }`}
                  onClick={() => setSelectedCardId(isSelected ? null : card.id)}
                >
                  {/* Top Bar: EMV Chip & Details */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {/* EMV Chip Visual */}
                        <div className="w-7 h-5 rounded bg-gradient-to-tr from-amber-300 to-amber-100 border border-amber-400/80 shadow-2xs flex items-center justify-center shrink-0">
                          <div className="w-4 h-2.5 border border-amber-600/40 rounded-2xs" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          {card.institution || 'Credit Card'}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          utilPct > 70
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : utilPct > 30
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {utilPct.toFixed(0)}% util
                      </span>
                    </div>

                    <div className="font-bold text-sm text-slate-950 truncate">{card.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      •••• •••• •••• {card.last4 || '0000'}
                    </div>

                    {/* Balance & Limit */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Current Spend:</span>
                        <span className="font-bold text-rose-700 font-mono">{formatINR(outstanding)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Credit Limit:</span>
                        <span className="font-semibold text-slate-700 font-mono">{formatINR(limit)}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          utilPct > 70 ? 'bg-rose-500' : utilPct > 30 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, utilPct))}%` }}
                      />
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetailedAdd(card.id);
                      }}
                      className="font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Swipe</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPayBill(card);
                      }}
                      className="font-semibold text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 cursor-pointer"
                    >
                      Pay Bill
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditCard(card);
                      }}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 cursor-pointer"
                      title="Edit Card Details"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. High-Speed Spend Entry Workstation (Rapid Multi-Row Logger & SMS Ingestion) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {/* Sub-header with Tabs */}
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-bold text-slate-900">Record Daily Credit Card Spends</h2>
            <span className="text-xs text-slate-500 hidden md:inline">
              — Multi-row fast logger &amp; instant bank SMS parser
            </span>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
            <button
              type="button"
              onClick={() => setEntryTab('rapid')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                entryTab === 'rapid'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>⚡ Rapid Multi-Row Logger</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryTab('sms')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                entryTab === 'sms'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              <span>Paste Bank SMS Alerts</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Rapid Multi-Row Logger */}
        {entryTab === 'rapid' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <p>
                Log 1 to 20 swipes in one go without closing modals. Enter amounts, select merchants, and save all with 1 click.
              </p>
              <span className="font-mono text-slate-600 font-semibold">
                {rapidRows.filter((r) => parseFloat(r.amountStr) > 0).length} valid entries ready
              </span>
            </div>

            {/* Rapid Rows Table */}
            <div className="overflow-x-auto border border-slate-200/90 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
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
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rapidRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Date */}
                      <td className="p-2">
                        <input
                          type="date"
                          value={row.occurredAt}
                          onChange={(e) => handleUpdateRapidRow(row.id, { occurredAt: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                        />
                      </td>

                      {/* Card Selection */}
                      <td className="p-2">
                        <select
                          value={row.cardId}
                          onChange={(e) => handleUpdateRapidRow(row.id, { cardId: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 font-medium focus:border-blue-500 focus:outline-hidden"
                        >
                          {creditCards.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (••{c.last4 || '00'})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Amount */}
                      <td className="p-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1 text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.amountStr}
                            onChange={(e) => handleUpdateRapidRow(row.id, { amountStr: e.target.value })}
                            className="w-full rounded-md border border-slate-200 bg-white pl-5 pr-2 py-1 text-xs font-bold font-mono text-slate-900 focus:border-blue-500 focus:outline-hidden"
                          />
                        </div>
                      </td>

                      {/* Merchant / Party */}
                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="e.g. Swiggy, Amazon, Shell"
                          value={row.party}
                          onChange={(e) => handleUpdateRapidRow(row.id, { party: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                        />
                      </td>

                      {/* Category */}
                      <td className="p-2">
                        <select
                          value={row.category}
                          onChange={(e) => handleUpdateRapidRow(row.id, { category: e.target.value })}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
                        >
                          {getCategoryOptions(row.scope, 'expense').map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Scope */}
                      <td className="p-2">
                        <select
                          value={row.scope}
                          onChange={(e) =>
                            handleUpdateRapidRow(row.id, { scope: e.target.value as Scope })
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 capitalize focus:border-blue-500 focus:outline-hidden"
                        >
                          <option value="personal">Personal</option>
                          <option value="business">Business</option>
                          <option value="family">Family</option>
                        </select>
                      </td>

                      {/* Note */}
                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="Optional note / tag"
                          value={row.note}
                          onChange={(e) => handleUpdateRapidRow(row.id, { note: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddRapidRow();
                            }
                          }}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
                        />
                      </td>

                      {/* Delete */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRapidRow(row.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
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
              <span className="text-[11px] font-semibold text-slate-500">Quick fill merchant:</span>
              {FREQUENT_MERCHANTS.slice(0, 8).map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => handleApplyMerchantChip(rapidRows.length - 1, m)}
                  className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer border border-slate-200/60"
                >
                  +{m.name}
                </button>
              ))}
            </div>

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddRapidRow}
                className="text-xs border-dashed border-slate-300 hover:border-slate-400"
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
                  className="text-xs text-slate-600"
                >
                  Clear All
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCommitRapidRows}
                  disabled={isSavingRapid}
                  className="text-xs shadow-xs"
                >
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  <span>
                    {isSavingRapid ? 'Recording Spends...' : `Save All Spends (${rapidRows.filter((r) => parseFloat(r.amountStr) > 0).length})`}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: SMS Parser */}
        {entryTab === 'sms' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paste Bank SMS Messages (HDFC, ICICI, SBI, Axis, Amex, Kotak, etc.)
              </label>
              <textarea
                rows={5}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder={`Example:\nAlert: You've spent INR 1,450.00 on your ICICI Bank Credit Card XX1234 at SWIGGY on 14-Nov-2026.\nDear SBI Cardholder, payment of Rs 3,200.00 made on card ending 5678 at SHELL PETROL on 14/11/2026.`}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                The smart parser will automatically extract the card last 4 digits, merchant name, transaction amount, and date.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleParseSms}
                disabled={isParsingSms || !smsText.trim()}
                className="text-xs shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                <span>{isParsingSms ? 'Analyzing SMS...' : 'Parse &amp; Convert to Spends'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Card Spends Feed & Daily Grouped Stream */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Credit Card Expense Ledger</h3>
            <span className="text-xs text-slate-500">({filteredTxs.length} transactions)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search merchant, card, note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Scope Filter */}
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as Scope | 'all')}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Scopes</option>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
              <option value="family">Family</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Categories</option>
              {Array.from(new Set(cardTransactions.map((t) => t.category))).sort().map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Date Quick Filter */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Dates</option>
              <option value="today">Today Only</option>
              <option value="7days">Past 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {/* Transactions Grouped by Date */}
        {groupedTxs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 bg-slate-50/50">
            No credit card spends match your filter criteria. Record a spend using the rapid logger above.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedTxs.map(([dateKey, txs]) => {
              const daySpendTotalMinor = txs
                .filter((t) => t.kind === 'expense')
                .reduce((s, t) => s + t.amountMinor, 0);

              return (
                <div key={dateKey} className="space-y-2">
                  {/* Date Heading */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>{dateKey === todayStr ? `Today (${dateKey})` : dateKey}</span>
                      <span className="text-[11px] font-normal text-slate-400">· {txs.length} txs</span>
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-900">
                      {formatINR(daySpendTotalMinor)}
                    </span>
                  </div>

                  {/* Transactions in this Day */}
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                    {txs.map((tx) => {
                      const isExpense = tx.kind === 'expense';
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 hover:bg-slate-50/70 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Icon */}
                            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                              <CreditCard className="h-4 w-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 truncate">
                                  {tx.party || tx.category}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60 truncate">
                                  {tx.accountName}
                                </span>
                                <span className="text-[10px] font-medium text-slate-500 capitalize hidden sm:inline">
                                  • {tx.category}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="capitalize">{tx.scope}</span>
                                {tx.note && <span className="truncate">· {tx.note}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Right side: Amount & Action buttons */}
                          <div className="flex items-center gap-3 shrink-0">
                            {tx.hasAttachment && (
                              <button
                                type="button"
                                onClick={() => handleViewAttachment(tx)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                                title="View Receipt"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <div className="text-right">
                              <div
                                className={`text-xs font-bold font-mono ${
                                  isExpense ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {isExpense ? '-' : '+'}
                                {formatINR(tx.amountMinor)}
                              </div>
                            </div>

                            {/* Action icons */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateSwipe(tx)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Repeat / Duplicate Swipe"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDetailedEdit(tx)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Spend"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTxConfirmId(tx.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
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
      </div>

      {/* 6. MODALS */}

      {/* A. Detailed Single Spend Modal (Complete freedom with split & attachments) */}
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
                className="font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="merchantInput">Merchant / Store / Payee *</FieldLabel>
              <Input
                id="merchantInput"
                type="text"
                placeholder="e.g. Amazon, Swiggy, Shell Petrol, Uber"
                value={txParty}
                onChange={(e) => setTxParty(e.target.value)}
                required
              />
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
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="noteInput">Description / Tags / Notes</FieldLabel>
            <Input
              id="noteInput"
              type="text"
              placeholder="e.g. Team dinner, flight ticket, 5% cashback card offer"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
            />
          </div>

          {/* Split with Friends / Khatabook */}
          {!editingTx && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Split className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Split Bill with Friends (Auto-create Khatabook Dues)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={splitEnabled}
                  onChange={(e) => setSplitEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {splitEnabled && (
                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <FieldLabel htmlFor="friendsInput">Friends' Names (comma separated)</FieldLabel>
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
                      className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="includeSelf" className="text-xs text-slate-600">
                      Include my own share in split calculation
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Receipt Attachment Upload */}
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
                <span className="text-xs text-slate-600 truncate max-w-xs">{txAttachmentName}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
              <option value="personal">Personal</option>
              <option value="business">Business</option>
              <option value="family">Family</option>
            </Select>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100">
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
            ) : <div />}

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
        title={`Pay Bill · ${payCardAccount?.name || 'Credit Card'}`}
      >
        <form onSubmit={handlePayCardBill} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Outstanding Balance:</span>
              <span className="font-bold text-rose-700 font-mono">
                {formatINR(Math.abs(payCardAccount?.currentBalanceMinor || 0))}
              </span>
            </div>
            {cardReconData?.cycles?.[0] && (
              <div className="flex justify-between text-blue-700">
                <span>Latest Statement Billed Due:</span>
                <span className="font-bold font-mono">
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
              className="font-mono font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
                className="max-h-96 w-full object-contain rounded-xl border border-slate-200"
              />
            ) : (
              <div className="p-8 text-center border border-slate-200 rounded-xl bg-slate-50">
                <FileText className="mx-auto h-12 w-12 text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-800">{attachmentData.filename}</p>
                <a
                  href={attachmentData.dataBase64}
                  download={attachmentData.filename}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Document</span>
                </a>
              </div>
            )
          ) : (
            <p className="text-xs text-slate-500">Loading attachment...</p>
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
    </div>
  );
}
