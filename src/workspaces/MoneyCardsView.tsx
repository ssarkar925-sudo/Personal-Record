import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CreditCard,
  PiggyBank,
  Zap,
} from 'lucide-react';
import {
  api,
  type AccountGroup,
  type AccountRecord,
  type CardCycleReconciliation,
  type RecurringBillRecord,
  type ScopeBudgetRecord,
  type TransactionRecord,
  type UnmatchedTransferCandidate,
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
  type TxKind,
} from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';
import { MoneyKpiStrip } from './money-cards/MoneyKpiStrip.tsx';
import { AccountsHub } from './money-cards/AccountsHub.tsx';
import { LedgerStream } from './money-cards/LedgerStream.tsx';
import { BentoPortfolioGrid } from './money-cards/BentoPortfolioGrid.tsx';
import type {
  AccountGroupTab,
  AccountSortOption,
  TriageFilter,
  WorkstationLayout,
} from './money-cards/types.ts';

export interface MoneyCardsViewProps {
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  recurringBills: RecurringBillRecord[];
  budgets?: ScopeBudgetRecord[];
  monthSpentByScope?: Record<Scope, number>;
  systemLanguage?: AppLanguage;
  onNotify: (text: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
  onNavigateToCards?: () => void;
}

export function MoneyCardsView({
  accounts,
  transactions,
  recurringBills,
  onNotify,
  onRefresh,
  onNavigateToCards,
}: MoneyCardsViewProps) {
  // Selected Account Filter (null = show all)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Scalable Account Hub Controls (Engineered for 15+ accounts)
  const [accountTab, setAccountTab] = useState<AccountGroupTab>('all');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountSort, setAccountSort] = useState<AccountSortOption>('balance_desc');
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all');
  const [workstationLayout, setWorkstationLayout] = useState<WorkstationLayout>('split');

  // Search and Scope/Kind Filters for Ledger Stream
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<TxKind | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>('all');

  // Modals state
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [deleteAccConfirmId, setDeleteAccConfirmId] = useState<string | null>(null);
  const [deleteTxConfirmId, setDeleteTxConfirmId] = useState<string | null>(null);

  // Credit Card Reconcile & Pay Modal
  const [cardPayModalAccount, setCardPayModalAccount] = useState<AccountRecord | null>(null);
  const [cardReconData, setCardReconData] = useState<CardCycleReconciliation | null>(null);
  const [cardPayAmountStr, setCardPayAmountStr] = useState('');
  const [cardPayFromAccId, setCardPayFromAccId] = useState('');
  const [isPayingCard, setIsPayingCard] = useState(false);

  // Bank Balance Reconciliation Modal
  const [reconcileBankAcc, setReconcileBankAcc] = useState<AccountRecord | null>(null);
  const [actualBalanceStr, setActualBalanceStr] = useState('');
  const [isReconcilingBank, setIsReconcilingBank] = useState(false);

  // Transfer Matching Drawer
  const [transferMatchModalOpen, setTransferMatchModalOpen] = useState(false);
  const [unmatchedTransfers, setUnmatchedTransfers] = useState<UnmatchedTransferCandidate[]>([]);

  // Recurring Bills Modal
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);

  // Investments Modal
  const [investmentsModalOpen, setInvestmentsModalOpen] = useState(false);

  // Receipt Attachment Viewer Modal
  const [attachmentViewerTx, setAttachmentViewerTx] = useState<TransactionRecord | null>(null);
  const [attachmentData, setAttachmentData] = useState<{ filename: string; mimeType: string; dataBase64: string } | null>(null);

  // Transaction Form State
  const [txKind, setTxKind] = useState<TxKind>('expense');
  const [txScope, setTxScope] = useState<Scope>('personal');
  const [txAccountId, setTxAccountId] = useState('');
  const [txToAccountId, setTxToAccountId] = useState('');
  const [txCategory, setTxCategory] = useState('Groceries');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txDate, setTxDate] = useState(todayISO());
  const [txParty, setTxParty] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txAttachmentBase64, setTxAttachmentBase64] = useState<string | null>(null);
  const [txAttachmentName, setTxAttachmentName] = useState<string | null>(null);
  const [txAttachmentMime, setTxAttachmentMime] = useState<string | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);

  // Account Form State
  const [accName, setAccName] = useState('');
  const [accGroup, setAccGroup] = useState<AccountGroup>('bank');
  const [accScope, setAccScope] = useState<Scope>('personal');
  const [accInstitution, setAccInstitution] = useState('');
  const [accLast4, setAccLast4] = useState('');
  const [accOpeningBalStr, setAccOpeningBalStr] = useState('0');
  const [accCreditLimitStr, setAccCreditLimitStr] = useState('100000');
  const [accStatementDay, setAccStatementDay] = useState(15);
  const [accDueDay, setAccDueDay] = useState(5);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // 1. Financial Executive Summary Calculations
  const creditCards = useMemo(() => accounts.filter((a) => a.accountGroup === 'credit_card'), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.accountGroup === 'bank'), [accounts]);
  const walletAccounts = useMemo(() => accounts.filter((a) => a.accountGroup === 'cash' || a.accountGroup === 'wallet'), [accounts]);
  const liquidAccounts = useMemo(() => accounts.filter((a) => a.accountGroup !== 'credit_card'), [accounts]);
  const liquidAccountIds = useMemo(() => new Set(liquidAccounts.map((a) => a.id)), [liquidAccounts]);

  const totalLiquidMinor = useMemo(() => {
    return liquidAccounts.reduce((sum, a) => sum + (a.currentBalanceMinor || 0), 0);
  }, [liquidAccounts]);

  const totalCreditDebtMinor = useMemo(() => {
    return creditCards.reduce((sum, c) => sum + Math.abs(c.currentBalanceMinor || 0), 0);
  }, [creditCards]);

  // Scalable Liquid Account List Filtering & Sorting (Only Banks & Cash)
  const filteredAccounts = useMemo(() => {
    let list = liquidAccounts.filter((acc) => {
      // Tab filter
      if (accountTab === 'bank' && acc.accountGroup !== 'bank') return false;
      if (accountTab === 'wallet' && acc.accountGroup !== 'cash' && acc.accountGroup !== 'wallet') return false;

      // Triage Filter
      if (triageFilter === 'unreconciled') {
        if (acc.accountGroup !== 'bank') return false;
      } else if (triageFilter === 'low_balance') {
        if ((acc.currentBalanceMinor || 0) >= 500000) return false;
      }

      // Search filter
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        const matchName = acc.name.toLowerCase().includes(q);
        const matchInst = (acc.institution || '').toLowerCase().includes(q);
        const matchLast4 = (acc.last4 || '').includes(q);
        if (!matchName && !matchInst && !matchLast4) return false;
      }
      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      if (accountSort === 'balance_desc') {
        const balA = Math.abs(a.currentBalanceMinor || 0);
        const balB = Math.abs(b.currentBalanceMinor || 0);
        return balB - balA;
      }
      if (accountSort === 'balance_asc') {
        const balA = Math.abs(a.currentBalanceMinor || 0);
        const balB = Math.abs(b.currentBalanceMinor || 0);
        return balA - balB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [liquidAccounts, accountTab, accountSearch, accountSort, triageFilter]);

  // Load Unmatched Transfers
  const checkUnmatchedTransfers = async () => {
    try {
      const res = await api.getUnmatchedTransfers();
      setUnmatchedTransfers(res);
    } catch {}
  };

  useEffect(() => {
    void checkUnmatchedTransfers();
  }, [transactions]);

  // Load Card Cycle when opening Reconcile & Pay modal
  useEffect(() => {
    if (!cardPayModalAccount) return;
    void (async () => {
      try {
        const res = await api.getCardReconciliation(cardPayModalAccount.id);
        setCardReconData(res);
        const latest = res.cycles?.[0];
        const suggestedAmount = (latest && latest.netDueMinor > 0) ? latest.netDueMinor : res.totalOutstandingMinor;
        setCardPayAmountStr((suggestedAmount / 100).toFixed(2));
        const defaultBank = accounts.find((a) => a.accountGroup === 'bank' && a.id !== cardPayModalAccount.id);
        if (defaultBank) setCardPayFromAccId(defaultBank.id);
      } catch {
        onNotify('Could not load card cycle data', 'err');
      }
    })();
  }, [cardPayModalAccount, accounts, onNotify]);

  // Filtered Transactions (Only transactions touching Liquid Accounts)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedAccountId) {
        if (tx.accountId !== selectedAccountId && tx.toAccountId !== selectedAccountId) {
          return false;
        }
      } else {
        const touchesLiquid = liquidAccountIds.has(tx.accountId) || (tx.toAccountId && liquidAccountIds.has(tx.toAccountId));
        if (!touchesLiquid) return false;
      }
      if (kindFilter !== 'all' && tx.kind !== kindFilter) return false;
      if (scopeFilter !== 'all' && tx.scope !== scopeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchParty = tx.party.toLowerCase().includes(q);
        const matchCategory = tx.category.toLowerCase().includes(q);
        const matchNote = tx.note.toLowerCase().includes(q);
        const matchAmount = (tx.amountMinor / 100).toString().includes(q);
        if (!matchParty && !matchCategory && !matchNote && !matchAmount) return false;
      }
      return true;
    });
  }, [transactions, selectedAccountId, liquidAccountIds, kindFilter, scopeFilter, searchQuery]);

  // Stream Metrics
  const streamTotalInflowMinor = useMemo(() => {
    return filteredTransactions.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amountMinor, 0);
  }, [filteredTransactions]);

  const streamTotalOutflowMinor = useMemo(() => {
    return filteredTransactions.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amountMinor, 0);
  }, [filteredTransactions]);

  // Group Transactions by Date
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, TransactionRecord[]> = {};
    for (const tx of filteredTransactions) {
      const dateKey = tx.occurredAt || 'Unknown Date';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTransactions]);

  // Open New Transaction Modal
  const handleOpenAddTx = (defaultKind: TxKind = 'expense') => {
    setEditingTx(null);
    setTxKind(defaultKind);
    setTxScope('personal');
    setTxAccountId(selectedAccountId || (accounts[0]?.id ?? ''));
    setTxToAccountId(accounts[1]?.id ?? '');
    setTxCategory(defaultKind === 'income' ? 'Salary' : defaultKind === 'transfer' ? 'Transfer' : 'Groceries');
    setTxAmountStr('');
    setTxDate(todayISO());
    setTxParty('');
    setTxNote('');
    setTxAttachmentBase64(null);
    setTxAttachmentName(null);
    setTxAttachmentMime(null);
    setTxModalOpen(true);
  };

  // Open Edit Transaction Modal
  const handleOpenEditTx = (tx: TransactionRecord) => {
    setEditingTx(tx);
    setTxKind(tx.kind);
    setTxScope(tx.scope);
    setTxAccountId(tx.accountId);
    setTxToAccountId(tx.toAccountId || '');
    setTxCategory(tx.category);
    setTxAmountStr((tx.amountMinor / 100).toFixed(2));
    setTxDate(tx.occurredAt);
    setTxParty(tx.party);
    setTxNote(tx.note);
    setTxAttachmentBase64(null);
    setTxAttachmentName(null);
    setTxAttachmentMime(null);
    setTxModalOpen(true);
  };

  // Save Transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = rupeesToPaise(txAmountStr);
    if (amountMinor <= 0) {
      onNotify('Please enter a valid amount', 'err');
      return;
    }
    if (!txAccountId) {
      onNotify('Please select an account', 'err');
      return;
    }
    if (txKind === 'transfer' && (!txToAccountId || txToAccountId === txAccountId)) {
      onNotify('Select a valid destination account for transfer', 'err');
      return;
    }

    setIsSavingTx(true);
    try {
      if (editingTx) {
        await api.updateTransaction(editingTx.id, {
          kind: txKind,
          scope: txScope,
          accountId: txAccountId,
          toAccountId: txKind === 'transfer' ? txToAccountId : null,
          category: txCategory,
          amountMinor,
          occurredAt: txDate,
          party: txParty.trim(),
          note: txNote.trim(),
        });
        onNotify('Transaction updated successfully');
      } else {
        await api.createTransaction({
          kind: txKind,
          scope: txScope,
          accountId: txAccountId,
          toAccountId: txKind === 'transfer' ? txToAccountId : null,
          category: txCategory,
          amountMinor,
          occurredAt: txDate,
          party: txParty.trim(),
          note: txNote.trim(),
          attachment:
            txAttachmentBase64 && txAttachmentName && txAttachmentMime
              ? {
                  filename: txAttachmentName,
                  mimeType: txAttachmentMime,
                  dataBase64: txAttachmentBase64,
                }
              : undefined,
        });
        onNotify('Transaction recorded successfully');
      }
      setTxModalOpen(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to save transaction', 'err');
    } finally {
      setIsSavingTx(false);
    }
  };

  // Delete Transaction
  const handleDeleteTx = async () => {
    if (!deleteTxConfirmId) return;
    try {
      await api.deleteTransaction(deleteTxConfirmId);
      onNotify('Transaction deleted');
      setDeleteTxConfirmId(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to delete transaction', 'err');
    }
  };

  // Open Add Account Modal
  const handleOpenAddAccount = () => {
    setEditingAccount(null);
    setAccName('');
    setAccGroup('bank');
    setAccScope('personal');
    setAccInstitution('');
    setAccLast4('');
    setAccOpeningBalStr('0');
    setAccCreditLimitStr('150000');
    setAccStatementDay(15);
    setAccDueDay(5);
    setAccountModalOpen(true);
  };

  // Open Edit Account Modal
  const handleOpenEditAccount = (acc: AccountRecord) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccGroup(acc.accountGroup || (acc.type === 'credit_card' ? 'credit_card' : 'bank'));
    setAccScope(acc.scope);
    setAccInstitution(acc.institution || '');
    setAccLast4(acc.last4 || '');
    setAccOpeningBalStr((acc.openingBalanceMinor / 100).toFixed(2));
    setAccCreditLimitStr(((acc.creditLimitMinor || 0) / 100).toFixed(2));
    setAccStatementDay(acc.statementDay || 15);
    setAccDueDay(acc.dueDay || 5);
    setAccountModalOpen(true);
  };

  // Save Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      onNotify('Account name is required', 'err');
      return;
    }

    setIsSavingAccount(true);
    try {
      const openingMinor = rupeesToPaise(accOpeningBalStr);
      const creditLimitMinor = accGroup === 'credit_card' ? rupeesToPaise(accCreditLimitStr) : 0;

      if (editingAccount) {
        await api.updateAccount(editingAccount.id, {
          name: accName.trim(),
          type: accGroup === 'credit_card' ? 'credit_card' : 'bank',
          accountGroup: accGroup,
          scope: accScope,
          institution: accInstitution.trim(),
          last4: accLast4.trim(),
          creditLimitMinor,
          statementDay: Number(accStatementDay),
          dueDay: Number(accDueDay),
        });
        onNotify('Account updated successfully');
      } else {
        await api.createAccount({
          name: accName.trim(),
          type: accGroup === 'credit_card' ? 'credit_card' : 'bank',
          accountGroup: accGroup,
          scope: accScope,
          institution: accInstitution.trim(),
          last4: accLast4.trim(),
          openingBalanceMinor: openingMinor,
          creditLimitMinor,
          statementDay: Number(accStatementDay),
          dueDay: Number(accDueDay),
        });
        onNotify('Account created successfully');
      }
      setAccountModalOpen(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to save account', 'err');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Delete Account
  const handleDeleteAccount = async () => {
    if (!deleteAccConfirmId) return;
    try {
      await api.deleteAccount(deleteAccConfirmId);
      onNotify('Account deleted successfully');
      if (selectedAccountId === deleteAccConfirmId) {
        setSelectedAccountId(null);
      }
      setDeleteAccConfirmId(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to delete account', 'err');
    }
  };

  // Pay Credit Card Bill
  const handlePayCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardPayModalAccount) return;
    const amountMinor = rupeesToPaise(cardPayAmountStr);
    if (amountMinor <= 0) {
      onNotify('Enter valid payment amount', 'err');
      return;
    }
    if (!cardPayFromAccId) {
      onNotify('Select source bank account to pay from', 'err');
      return;
    }

    setIsPayingCard(true);
    try {
      await api.reconcileAndPayCard(cardPayModalAccount.id, {
        fromAccountId: cardPayFromAccId,
        amountMinor,
        occurredAt: todayISO(),
        note: `Credit card bill payment for ${cardPayModalAccount.name}`,
      });
      onNotify(`Paid ${formatINR(amountMinor)} towards ${cardPayModalAccount.name}! 💳`);
      setCardPayModalAccount(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to pay card bill', 'err');
    } finally {
      setIsPayingCard(false);
    }
  };

  // Reconcile Bank Balance
  const handleReconcileBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileBankAcc) return;
    const realMinor = rupeesToPaise(actualBalanceStr);

    setIsReconcilingBank(true);
    try {
      const res = await api.reconcileAccount(reconcileBankAcc.id, realMinor);
      if (res && res.amountMinor !== 0) {
        onNotify(`Reconciled with balance adjustment of ${formatINR(Math.abs(res.amountMinor))}`);
      } else {
        onNotify('Passbook balance matches ledger perfectly! 🟢');
      }
      setReconcileBankAcc(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Reconciliation failed', 'err');
    } finally {
      setIsReconcilingBank(false);
    }
  };

  // Match Transfer Pair
  const handleMatchTransfer = async (candidate: UnmatchedTransferCandidate) => {
    try {
      await api.matchTransferPair(candidate.sourceTx.id, candidate.destTx.id);
      onNotify(`Matched transfer of ${formatINR(candidate.amountMinor)}!`);
      await checkUnmatchedTransfers();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to match transfers', 'err');
    }
  };

  // View Receipt Attachment
  const handleViewAttachment = async (tx: TransactionRecord) => {
    try {
      const res = await api.getTransactionAttachment(tx.id);
      if (res && res.dataBase64) {
        setAttachmentData(res);
        setAttachmentViewerTx(tx);
      } else {
        onNotify('No receipt image found for this transaction', 'err');
      }
    } catch {
      onNotify('Could not load attachment', 'err');
    }
  };

  // Export Filtered Transactions to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      onNotify('No transactions to export', 'err');
      return;
    }
    const headers = ['Date', 'Type', 'Scope', 'Account', 'ToAccount', 'Category', 'Party', 'Note', 'Amount (INR)'];
    const rows = filteredTransactions.map((tx) => [
      tx.occurredAt,
      tx.kind,
      tx.scope,
      tx.accountName,
      tx.toAccountName || '',
      tx.category,
      `"${(tx.party || '').replace(/"/g, '""')}"`,
      `"${(tx.note || '').replace(/"/g, '""')}"`,
      (tx.amountMinor / 100).toFixed(2),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ledger-export-${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify('Exported CSV successfully!');
  };

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  return (
    <div className="space-y-6">
      {/* 1. TOP EXECUTIVE FINANCIAL KPI STRIP (Daylight Studio Cards) */}
      <MoneyKpiStrip
        accounts={liquidAccounts}
        creditCards={creditCards}
        totalLiquidMinor={totalLiquidMinor}
        totalCreditDebtMinor={totalCreditDebtMinor}
        unmatchedTransfersCount={unmatchedTransfers.length}
        onOpenRecordTx={() => handleOpenAddTx('expense')}
        onOpenNewAccount={handleOpenAddAccount}
        onOpenTransferMatch={() => setTransferMatchModalOpen(true)}
        onOpenPayCard={(card) => setCardPayModalAccount(card)}
        onNavigateToCards={onNavigateToCards}
      />

      {/* 2. MAIN WORKSTATION: BENTO PORTFOLIO OR SPLIT DUAL-PANE VIEW */}
      {workstationLayout === 'bento' ? (
        <BentoPortfolioGrid
          accounts={filteredAccounts}
          creditCards={creditCards}
          totalCreditDebtMinor={totalCreditDebtMinor}
          onSelectAccountAndSplit={(id) => {
            setSelectedAccountId(id);
            setWorkstationLayout('split');
          }}
          onOpenPayCard={(card) => setCardPayModalAccount(card)}
          onOpenReconcileBank={(bank) => {
            setReconcileBankAcc(bank);
            setActualBalanceStr(((bank.currentBalanceMinor || 0) / 100).toFixed(2));
          }}
          onOpenEditAccount={handleOpenEditAccount}
          onOpenNewAccount={handleOpenAddAccount}
          onSwitchToSplit={() => setWorkstationLayout('split')}
          onNavigateToCards={onNavigateToCards}
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ================= LEFT COLUMN: SCALABLE ACCOUNTS HUB ================= */}
          <AccountsHub
            accounts={liquidAccounts}
            filteredAccounts={filteredAccounts}
            creditCards={creditCards}
            bankAccounts={bankAccounts}
            walletAccounts={walletAccounts}
            recurringBills={recurringBills}
            totalLiquidMinor={totalLiquidMinor}
            totalCreditDebtMinor={totalCreditDebtMinor}
            selectedAccountId={selectedAccountId}
            accountSearch={accountSearch}
            accountTab={accountTab}
            accountSort={accountSort}
            triageFilter={triageFilter}
            workstationLayout={workstationLayout}
            onSelectAccount={(id) => setSelectedAccountId(id)}
            onSearchChange={(val) => setAccountSearch(val)}
            onTabChange={(tab) => setAccountTab(tab)}
            onSortChange={(sort) => setAccountSort(sort)}
            onTriageChange={(triage) => setTriageFilter(triage)}
            onLayoutChange={(layout) => setWorkstationLayout(layout)}
            onOpenPayCard={(card) => setCardPayModalAccount(card)}
            onOpenReconcileBank={(bank) => {
              setReconcileBankAcc(bank);
              setActualBalanceStr(((bank.currentBalanceMinor || 0) / 100).toFixed(2));
            }}
            onOpenEditAccount={handleOpenEditAccount}
            onOpenRecurringModal={() => setRecurringModalOpen(true)}
            onOpenInvestmentsModal={() => setInvestmentsModalOpen(true)}
            onNavigateToCards={onNavigateToCards}
          />

          {/* ================= RIGHT COLUMN: LEDGER STREAM & ACCOUNT HUD ================= */}
          <LedgerStream
            selectedAccount={selectedAccount}
            transactions={transactions}
            filteredTransactions={filteredTransactions}
            groupedTransactions={groupedTransactions}
            searchQuery={searchQuery}
            kindFilter={kindFilter}
            scopeFilter={scopeFilter}
            streamTotalInflowMinor={streamTotalInflowMinor}
            streamTotalOutflowMinor={streamTotalOutflowMinor}
            onSearchChange={(q) => setSearchQuery(q)}
            onKindChange={(k) => setKindFilter(k)}
            onScopeChange={(s) => setScopeFilter(s)}
            onClearSelection={() => setSelectedAccountId(null)}
            onOpenAddTx={handleOpenAddTx}
            onOpenEditTx={handleOpenEditTx}
            onOpenDeleteTx={(id) => setDeleteTxConfirmId(id)}
            onViewAttachment={handleViewAttachment}
            onExportCSV={handleExportCSV}
            onOpenPayCard={(card) => setCardPayModalAccount(card)}
            onOpenReconcileBank={(bank) => {
              setReconcileBankAcc(bank);
              setActualBalanceStr(((bank.currentBalanceMinor || 0) / 100).toFixed(2));
            }}
            onOpenEditAccount={handleOpenEditAccount}
          />
        </div>
      )}

      {/* ================= MODAL 1: TRANSACTION ENTRY (EXPENSE/INCOME/TRANSFER) ================= */}
      <Dialog
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        title={editingTx ? 'Edit Transaction' : 'Record Transaction'}
      >
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          {/* Tabs: Expense | Income | Transfer */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            {(['expense', 'income', 'transfer'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTxKind(k);
                  if (k === 'income' && txCategory === 'Groceries') setTxCategory('Salary');
                  if (k === 'transfer' && txCategory !== 'Transfer') setTxCategory('Transfer');
                }}
                className={`py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  txKind === k
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Amount in INR */}
          <div>
            <FieldLabel>Amount (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={txAmountStr}
              onChange={(e) => setTxAmountStr(e.target.value)}
              className="text-xl font-bold font-mono"
            />
          </div>

          {/* Source Account & Destination Account (for Transfer) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>{txKind === 'transfer' ? 'From Account' : 'Account / Card'}</FieldLabel>
              <Select value={txAccountId} onChange={(e) => setTxAccountId(e.target.value)} required>
                <option value="">Select Account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.accountGroup || acc.type})
                  </option>
                ))}
              </Select>
            </div>

            {txKind === 'transfer' && (
              <div>
                <FieldLabel>To Account</FieldLabel>
                <Select value={txToAccountId} onChange={(e) => setTxToAccountId(e.target.value)} required>
                  <option value="">Select Destination</option>
                  {accounts
                    .filter((a) => a.id !== txAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.accountGroup || acc.type})
                      </option>
                    ))}
                </Select>
              </div>
            )}

            <div>
              <FieldLabel>Scope</FieldLabel>
              <Select value={txScope} onChange={(e) => setTxScope(e.target.value as Scope)}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          {/* Category & Party */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Category</FieldLabel>
              {txKind === 'transfer' ? (
                <Input value="Transfer" disabled className="bg-slate-50 text-slate-500" />
              ) : (
                <CategorySelect
                  value={txCategory}
                  options={getCategoryOptions(txScope, txKind as 'income' | 'expense')}
                  onChange={(val) => setTxCategory(val)}
                />
              )}
            </div>

            <div>
              <FieldLabel>{txKind === 'income' ? 'Received From (Payer)' : 'Paid To (Merchant/Party)'}</FieldLabel>
              <Input
                placeholder="e.g. Swiggy, Amazon, Client Name"
                value={txParty}
                onChange={(e) => setTxParty(e.target.value)}
              />
            </div>
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Date</FieldLabel>
              <Input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Note / Memo</FieldLabel>
              <Input
                placeholder="Optional description"
                value={txNote}
                onChange={(e) => setTxNote(e.target.value)}
              />
            </div>
          </div>

          {/* Receipt Attachment Upload (Only for New Tx) */}
          {!editingTx && (
            <div className="pt-2 border-t border-slate-100">
              <FieldLabel>Receipt Image (Optional)</FieldLabel>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setTxAttachmentName(file.name);
                  setTxAttachmentMime(file.type);
                  const reader = new FileReader();
                  reader.onload = () => {
                    const res = reader.result as string;
                    const base64 = res.split(',')[1] || '';
                    setTxAttachmentBase64(base64);
                  };
                  reader.readAsDataURL(file);
                }}
                className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              {txAttachmentName && (
                <p className="text-[11px] text-emerald-600 mt-1">
                  Attached: {txAttachmentName}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setTxModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingTx}>
              {isSavingTx ? 'Saving...' : editingTx ? 'Update Transaction' : 'Record Transaction'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 2: ACCOUNT CREATION & EDITING ================= */}
      <Dialog
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title={editingAccount ? 'Edit Account' : 'Add New Account'}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div>
            <FieldLabel>Account Name</FieldLabel>
            <Input
              required
              autoFocus
              placeholder="e.g. HDFC Regalia, Salary Account, Paytm Wallet"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Account Type</FieldLabel>
              <Select
                value={accGroup}
                onChange={(e) => setAccGroup(e.target.value as AccountGroup)}
                disabled={Boolean(editingAccount)}
              >
                <option value="bank">Bank Savings / Current</option>
                <option value="wallet">Digital Wallet / UPI</option>
                <option value="cash">Physical Cash</option>
              </Select>
            </div>

            <div>
              <FieldLabel>Ownership Scope</FieldLabel>
              <Select value={accScope} onChange={(e) => setAccScope(e.target.value as Scope)}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Bank / Institution</FieldLabel>
              <Input
                placeholder="e.g. HDFC, ICICI, SBI"
                value={accInstitution}
                onChange={(e) => setAccInstitution(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Last 4 Digits</FieldLabel>
              <Input
                placeholder="e.g. 4192"
                maxLength={4}
                value={accLast4}
                onChange={(e) => setAccLast4(e.target.value)}
              />
            </div>
          </div>

          {!editingAccount && (
            <div>
              <FieldLabel>Opening Balance (₹)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={accOpeningBalStr}
                onChange={(e) => setAccOpeningBalStr(e.target.value)}
              />
            </div>
          )}

          {/* Helpful callout: Credit Cards belong in Credit Cards Command Center */}
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 flex items-start gap-2.5 text-xs">
            <CreditCard className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-slate-700">
              <span className="font-bold text-slate-900 block">Looking to add a Credit Card?</span>
              Credit cards with billing cycles, limits, and swipe loggers are in the dedicated <strong>Credit Cards Command Center</strong>.{' '}
              {onNavigateToCards && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountModalOpen(false);
                    onNavigateToCards();
                  }}
                  className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer ml-1"
                >
                  Go to Credit Cards →
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {editingAccount ? (
              <button
                type="button"
                onClick={() => {
                  setAccountModalOpen(false);
                  setDeleteAccConfirmId(editingAccount.id);
                }}
                className="text-rose-600 hover:text-rose-700 text-xs font-semibold cursor-pointer"
              >
                Delete Account
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setAccountModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSavingAccount}>
                {isSavingAccount ? 'Saving...' : editingAccount ? 'Save Changes' : 'Create Account'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 3: CREDIT CARD RECONCILE & BILL PAY ================= */}
      <Dialog
        open={Boolean(cardPayModalAccount)}
        onClose={() => setCardPayModalAccount(null)}
        title={`Pay Credit Card from Bank · ${cardPayModalAccount?.name || ''}`}
      >
        <form onSubmit={handlePayCard} className="space-y-4">
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 text-xs space-y-1">
            <div className="font-bold text-blue-900 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-600" />
              <span>Double-Entry Settlement Bridge</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Transfers funds from your bank deposit account to clear this credit card debt, updating both account balances simultaneously.
            </p>
          </div>

          {creditCards.length > 1 && (
            <div>
              <FieldLabel>Target Credit Card</FieldLabel>
              <Select
                value={cardPayModalAccount?.id || ''}
                onChange={(e) => {
                  const c = creditCards.find((card) => card.id === e.target.value);
                  if (c) setCardPayModalAccount(c);
                }}
              >
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Outstanding: {formatINR(Math.abs(c.currentBalanceMinor || 0))})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {cardReconData && (() => {
            const latest = cardReconData.cycles?.[0];
            const netDue = latest?.netDueMinor ?? 0;
            return (
              <>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Statement Cycle Status:</span>
                    <span className="font-bold text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {latest?.dueDate ? `Bill Due on ${latest.dueDate}` : 'Cycle Active'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Statement Billed Due</div>
                      <div className="text-xl font-bold font-mono text-amber-700">
                        {formatINR(netDue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Total Outstanding</div>
                      <div className="text-xl font-bold font-mono text-slate-800">
                        {formatINR(cardReconData.totalOutstandingMinor)}
                      </div>
                    </div>
                  </div>
                </div>

                {netDue > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCardPayAmountStr((netDue / 100).toFixed(2))}
                      className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors cursor-pointer"
                    >
                      Pay Full Statement ({formatINR(netDue)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardPayAmountStr((cardReconData.totalOutstandingMinor / 100).toFixed(2))}
                      className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Pay Total Outstanding ({formatINR(cardReconData.totalOutstandingMinor)})
                    </button>
                  </div>
                )}
              </>
            );
          })()}

          <div>
            <FieldLabel>Payment Amount (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              value={cardPayAmountStr}
              onChange={(e) => setCardPayAmountStr(e.target.value)}
              className="font-mono text-lg font-bold"
            />
          </div>

          <div>
            <FieldLabel>Pay From Bank Account</FieldLabel>
            <Select value={cardPayFromAccId} onChange={(e) => setCardPayFromAccId(e.target.value)} required>
              <option value="">Select Paying Bank Account</option>
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (Balance: {formatINR(acc.currentBalanceMinor || 0)})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setCardPayModalAccount(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPayingCard}>
              {isPayingCard ? 'Processing Settlement...' : 'Confirm Bill Payment'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 4: BANK BALANCE RECONCILIATION ================= */}
      <Dialog
        open={Boolean(reconcileBankAcc)}
        onClose={() => setReconcileBankAcc(null)}
        title={`Reconcile Passbook: ${reconcileBankAcc?.name || ''}`}
      >
        <form onSubmit={handleReconcileBank} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Current Ledger Balance:{' '}
            <strong className="font-mono text-slate-900 text-sm">
              {formatINR(reconcileBankAcc?.currentBalanceMinor || 0)}
            </strong>
          </div>

          <div>
            <FieldLabel>Actual Balance as per Bank Statement / Passbook (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              value={actualBalanceStr}
              onChange={(e) => setActualBalanceStr(e.target.value)}
              className="font-mono text-lg font-bold"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              If this differs from your ledger, an automated adjustment transaction will be created to balance your books.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setReconcileBankAcc(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isReconcilingBank}>
              {isReconcilingBank ? 'Reconciling...' : 'Match & Reconcile'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 5: TRANSFER MATCHING HUB ================= */}
      <Dialog
        open={transferMatchModalOpen}
        onClose={() => setTransferMatchModalOpen(false)}
        title="Unmatched Transfer Candidates"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {unmatchedTransfers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No unmatched transfers found. All inter-account movements are balanced.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {unmatchedTransfers.map((cand, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <span>{cand.sourceTx.accountName}</span>
                      <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                      <span>{cand.destTx.accountName}</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Date: {cand.sourceTx.occurredAt} • Amount:{' '}
                      <strong className="text-slate-900 font-mono">{formatINR(cand.amountMinor)}</strong>
                    </div>
                  </div>

                  <Button size="sm" variant="primary" onClick={() => handleMatchTransfer(cand)}>
                    Match & Merge
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setTransferMatchModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ================= MODAL 6: RECURRING BILLS DRAWER ================= */}
      <Dialog
        open={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        title="Recurring Subscriptions & Bills"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          {recurringBills.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No recurring subscriptions or bills active.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {recurringBills.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 block">{b.title}</span>
                    <span className="text-[11px] text-slate-400">
                      Due day {b.dueDay} of month · {b.kind} · {b.scope}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold font-mono text-slate-900 block">{formatINR(b.amountMinor)}</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                      Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setRecurringModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ================= MODAL 7: INVESTMENTS & ASSETS ================= */}
      <Dialog
        open={investmentsModalOpen}
        onClose={() => setInvestmentsModalOpen(false)}
        title="Investments & Net Worth Assets"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/90 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-800 block">Total Portfolio Valuation</span>
              <span className="text-2xl font-bold font-mono text-emerald-700">
                {formatINR(totalLiquidMinor)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <PiggyBank className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
            Track mutual funds, equity SIPs, and fixed deposits linked with your primary ledger accounts.
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setInvestmentsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ================= MODAL 8: RECEIPT ATTACHMENT VIEWER ================= */}
      <Dialog
        open={Boolean(attachmentViewerTx)}
        onClose={() => {
          setAttachmentViewerTx(null);
          setAttachmentData(null);
        }}
        title={`Receipt Attachment: ${attachmentViewerTx?.party || attachmentViewerTx?.category || ''}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {attachmentData ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center p-2 min-h-64">
              {attachmentData.mimeType.startsWith('image/') ? (
                <img
                  src={`data:${attachmentData.mimeType};base64,${attachmentData.dataBase64}`}
                  alt={attachmentData.filename}
                  className="max-h-96 max-w-full object-contain rounded"
                />
              ) : (
                <div className="text-slate-700 text-xs p-6 text-center space-y-2">
                  <div className="font-bold">{attachmentData.filename}</div>
                  <a
                    href={`data:${attachmentData.mimeType};base64,${attachmentData.dataBase64}`}
                    download={attachmentData.filename}
                    className="inline-block px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">Loading attachment preview...</div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => {
                setAttachmentViewerTx(null);
                setAttachmentData(null);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteAccConfirmId)}
        title="Delete Account?"
        message="Are you sure you want to delete this account? Transactions linked to it may be affected."
        confirmLabel="Delete Account"
        onConfirm={handleDeleteAccount}
        onClose={() => setDeleteAccConfirmId(null)}
      />

      {/* Delete Transaction Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTxConfirmId)}
        title="Delete Transaction?"
        message="Are you sure you want to delete this transaction record? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteTx}
        onClose={() => setDeleteTxConfirmId(null)}
      />
    </div>
  );
}
