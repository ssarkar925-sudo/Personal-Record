import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type AccountRecord,
  type DebtPayoffResult,
  type GoalsSummary,
  type LoanRecord,
  type PersonDueRecord,
  type PersonNetSummary,
  type SavingsGoalRecord,
} from '../lib/api.ts';
import {
  addMonthsISO,
  estimateMonthlyEmiMinor,
  formatINR,
  rupeesToPaise,
  todayISO,
} from '../lib/format.ts';
import {
  Button,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  Select,
} from '../components/ui/Primitives.tsx';
import type { DueDirection, GoalKind, LoanDirection, Scope } from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';
import { LoansDuesKpiStrip } from './loans-dues/LoansDuesKpiStrip.tsx';
import { LoansHeroWorkstation } from './loans-dues/LoansHeroWorkstation.tsx';
import { LoansDuesHub } from './loans-dues/LoansDuesHub.tsx';
import { LoanContextHud } from './loans-dues/LoanContextHud.tsx';
import { BentoLoansGrid } from './loans-dues/BentoLoansGrid.tsx';
import { SettlementStream } from './loans-dues/SettlementStream.tsx';
import { computeLoansDuesPortfolioMetrics } from './loans-dues/loansDuesAnalytics.ts';
import type {
  LoansDuesSortOption,
  LoansTab,
  LoansTriageFilter,
  LoansWorkstationLayout,
  SelectedLoansItem,
} from './loans-dues/types.ts';

export interface LoansDuesViewProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  dueSummaries: PersonNetSummary[];
  accounts: AccountRecord[];
  globalScopeFilter?: Scope | 'all';
  systemLanguage?: AppLanguage;
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
}

function safeRupeesToPaise(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  try {
    return Math.max(0, rupeesToPaise(trimmed));
  } catch {
    return 0;
  }
}

export function LoansDuesView({
  loans = [],
  dues = [],
  dueSummaries = [],
  accounts = [],
  globalScopeFilter = 'all',
  onNotify,
  onRefresh,
}: LoansDuesViewProps) {
  // Navigation & Layout State (defaults to 'bento' 3D Cards mode)
  const [activeTab, setActiveTab] = useState<LoansTab>('all');
  const [triageFilter, setTriageFilter] = useState<LoansTriageFilter>('all');
  const [workstationLayout, setWorkstationLayout] = useState<LoansWorkstationLayout>('bento');
  const [sortOption, setSortOption] = useState<LoansDuesSortOption>('remaining_desc');
  const [selectedItem, setSelectedItem] = useState<SelectedLoansItem>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>(globalScopeFilter);

  useEffect(() => {
    setScopeFilter(globalScopeFilter);
  }, [globalScopeFilter]);

  // Modals & Form State
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'loan' | 'due' | 'goal';
    id: string;
    label: string;
  } | null>(null);

  // Debt Payoff Planner state
  const [payoffExtraRupees, setPayoffExtraRupees] = useState('5000');
  const [payoffStrategy, setPayoffStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [payoffPlan, setPayoffPlan] = useState<DebtPayoffResult | null>(null);
  const [goalsSummary, setGoalsSummary] = useState<GoalsSummary | null>(null);

  // Loan Create / Edit Modal
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanRecord | null>(null);
  const [loanName, setLoanName] = useState('');
  const [loanParty, setLoanParty] = useState('');
  const [loanScope, setLoanScope] = useState<Scope>('business');
  const [loanDir, setLoanDir] = useState<LoanDirection>('borrowed');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanRemaining, setLoanRemaining] = useState('');
  const [loanRatePct, setLoanRatePct] = useState('10');
  const [loanTenure, setLoanTenure] = useState('24');
  const [loanStart, setLoanStart] = useState(todayISO());
  const [loanNextDue, setLoanNextDue] = useState(addMonthsISO(todayISO(), 1));
  const [loanAccId, setLoanAccId] = useState('');
  const [isSavingLoan, setIsSavingLoan] = useState(false);

  // Pay EMI Modal
  const [payLoanTarget, setPayLoanTarget] = useState<LoanRecord | null>(null);
  const [payEmiRupees, setPayEmiRupees] = useState('');
  const [payEmiAccId, setPayEmiAccId] = useState('');
  const [payEmiDate, setPayEmiDate] = useState(todayISO());
  const [isPayingEmi, setIsPayingEmi] = useState(false);

  // Due Create / Edit Modal & Settle Modal
  const [dueModalOpen, setDueModalOpen] = useState(false);
  const [editingDue, setEditingDue] = useState<PersonDueRecord | null>(null);
  const [duePerson, setDuePerson] = useState('');
  const [duePhone, setDuePhone] = useState('');
  const [dueDir, setDueDir] = useState<DueDirection>('need');
  const [dueScope, setDueScope] = useState<Scope>('business');
  const [dueAmount, setDueAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueNote, setDueNote] = useState('');
  const [isSavingDue, setIsSavingDue] = useState(false);

  const [settleTarget, setSettleTarget] = useState<PersonDueRecord | null>(null);
  const [settleRupees, setSettleRupees] = useState('');
  const [settleAccId, setSettleAccId] = useState('');
  const [settleDate, setSettleDate] = useState(todayISO());
  const [isSettlingDue, setIsSettlingDue] = useState(false);

  // Savings Goal Modals
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalRecord | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalKind, setGoalKind] = useState<GoalKind>('goal');
  const [goalScope, setGoalScope] = useState<Scope>('business');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('0');
  const [goalDate, setGoalDate] = useState('');
  const [goalNote, setGoalNote] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  const [contribGoal, setContribGoal] = useState<SavingsGoalRecord | null>(null);
  const [contribRupees, setContribRupees] = useState('');
  const [contribAccId, setContribAccId] = useState('');
  const [contribLogTx, setContribLogTx] = useState(false);
  const [isContributingGoal, setIsContributingGoal] = useState(false);

  const banks = useMemo(
    () => (accounts || []).filter((a) => a.accountGroup === 'bank' || a.type === 'bank'),
    [accounts],
  );

  // Load Goals & Payoff Plan
  useEffect(() => {
    void api
      .getGoals()
      .then(setGoalsSummary)
      .catch(() => {});
  }, [loans?.length, accounts?.length]);

  useEffect(() => {
    let cancelled = false;
    const extraMinor = safeRupeesToPaise(payoffExtraRupees);
    void api
      .getDebtPayoffPlan({ extraMinor, strategy: payoffStrategy })
      .then((res) => {
        if (!cancelled) setPayoffPlan(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [payoffExtraRupees, payoffStrategy, loans, accounts]);

  // Estimated EMI Calculator
  const estimatedEmiMinor = useMemo(() => {
    const pMinor = safeRupeesToPaise(loanPrincipal);
    if (pMinor <= 0) return 0;
    const bps = Math.round((Number(loanRatePct) || 0) * 100);
    const tenure = Math.max(1, Number(loanTenure) || 12);
    return estimateMonthlyEmiMinor(pMinor, bps, tenure);
  }, [loanPrincipal, loanRatePct, loanTenure]);

  // 1. Executive Summary Financial Computations
  const currentDayOfMonth = new Date().getDate();
  const portfolioMetrics = useMemo(
    () => computeLoansDuesPortfolioMetrics(loans, dues, currentDayOfMonth),
    [loans, dues, currentDayOfMonth],
  );

  const activeBorrowedLoans = useMemo(
    () => loans.filter((l) => l.direction === 'borrowed' && l.status === 'active'),
    [loans],
  );
  const activeLentLoans = useMemo(
    () => loans.filter((l) => l.direction === 'lent' && l.status === 'active'),
    [loans],
  );
  const openGiveDues = useMemo(
    () => dues.filter((d) => d.direction === 'give' && d.status !== 'settled'),
    [dues],
  );
  const openNeedDues = useMemo(
    () => dues.filter((d) => d.direction === 'need' && d.status !== 'settled'),
    [dues],
  );

  // Scalable Filtered & Sorted Lists
  const filteredLoans = useMemo(() => {
    const list = loans.filter((l) => {
      if (scopeFilter !== 'all' && l.scope !== scopeFilter) return false;
      if (triageFilter === 'settled' && l.status !== 'closed') return false;
      if (triageFilter === 'you_owe' && l.direction !== 'borrowed') return false;
      if (triageFilter === 'you_are_owed' && l.direction !== 'lent') return false;
      if (triageFilter === 'due_soon') {
        if (l.status === 'closed') return false;
        const parts = (l.nextDueDate || '').split('-');
        const dueDay = Number(parts[2]) || 1;
        const diff = dueDay - currentDayOfMonth;
        if (!((diff >= 0 && diff <= 7) || (diff < 0 && diff >= -3))) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mName = (l.name || '').toLowerCase().includes(q);
        const mParty = (l.counterparty || '').toLowerCase().includes(q);
        if (!mName && !mParty) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortOption === 'remaining_desc') return b.remainingMinor - a.remainingMinor;
      if (sortOption === 'remaining_asc') return a.remainingMinor - b.remainingMinor;
      if (sortOption === 'next_due')
        return (a.nextDueDate || '9999').localeCompare(b.nextDueDate || '9999');
      if (sortOption === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });
  }, [loans, scopeFilter, triageFilter, searchQuery, currentDayOfMonth, sortOption]);

  const filteredDues = useMemo(() => {
    const list = dues.filter((d) => {
      if (scopeFilter !== 'all' && d.scope !== scopeFilter) return false;
      if (triageFilter === 'settled' && d.status !== 'settled') return false;
      if (triageFilter === 'bank_loans') return false;
      if (triageFilter === 'you_owe' && (d.direction !== 'give' || d.status === 'settled'))
        return false;
      if (triageFilter === 'you_are_owed' && (d.direction !== 'need' || d.status === 'settled'))
        return false;
      if (triageFilter === 'due_soon') {
        if (d.status === 'settled' || !d.dueDate) return false;
        const parts = (d.dueDate || '').split('-');
        const dueDay = Number(parts[2]) || 1;
        const diff = dueDay - currentDayOfMonth;
        if (!((diff >= 0 && diff <= 7) || (diff < 0 && diff >= -3))) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mPerson = (d.personName || '').toLowerCase().includes(q);
        const mPhone = (d.phone || '').includes(q);
        const mNote = (d.note || '').toLowerCase().includes(q);
        if (!mPerson && !mPhone && !mNote) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortOption === 'remaining_desc') return b.remainingMinor - a.remainingMinor;
      if (sortOption === 'remaining_asc') return a.remainingMinor - b.remainingMinor;
      if (sortOption === 'next_due')
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      if (sortOption === 'name_asc') return (a.personName || '').localeCompare(b.personName || '');
      return 0;
    });
  }, [dues, scopeFilter, triageFilter, searchQuery, currentDayOfMonth, sortOption]);

  const filteredGoals = useMemo(() => {
    const list = goalsSummary?.goals || [];
    return list.filter((g) => {
      if (scopeFilter !== 'all' && g.scope !== scopeFilter) return false;
      if (triageFilter === 'settled' || triageFilter === 'bank_loans') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return g.title.toLowerCase().includes(q) || (g.note || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [goalsSummary, scopeFilter, triageFilter, searchQuery]);

  // Handlers: Loan
  const openCreateLoan = () => {
    setEditingLoan(null);
    setLoanName('');
    setLoanParty('');
    setLoanScope(scopeFilter === 'all' ? 'business' : scopeFilter);
    setLoanDir('borrowed');
    setLoanPrincipal('');
    setLoanRemaining('');
    setLoanRatePct('10');
    setLoanTenure('24');
    setLoanStart(todayISO());
    setLoanNextDue(addMonthsISO(todayISO(), 1));
    setLoanAccId(banks[0]?.id || '');
    setLoanModalOpen(true);
  };

  const openEditLoan = (loan: LoanRecord) => {
    setEditingLoan(loan);
    setLoanName(loan.name);
    setLoanParty(loan.counterparty);
    setLoanScope(loan.scope);
    setLoanDir(loan.direction);
    setLoanPrincipal((loan.principalMinor / 100).toFixed(2));
    setLoanRemaining((loan.remainingMinor / 100).toFixed(2));
    setLoanRatePct((loan.annualRateBps / 100).toFixed(2));
    setLoanTenure(String(loan.tenureMonths));
    setLoanStart(loan.startDate);
    setLoanNextDue(loan.nextDueDate);
    setLoanAccId(loan.linkedAccountId ?? '');
    setLoanModalOpen(true);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLoan(true);
    try {
      const principalMinor = rupeesToPaise(loanPrincipal);
      const rateBps = Math.round((Number(loanRatePct) || 0) * 100);
      const tenureMonths = Math.max(1, Number(loanTenure) || 12);
      if (editingLoan) {
        const remainingMinor = rupeesToPaise(loanRemaining || loanPrincipal);
        await api.updateLoan(editingLoan.id, {
          name: loanName.trim(),
          counterparty: loanParty.trim(),
          scope: loanScope,
          direction: loanDir,
          principalMinor,
          remainingMinor,
          annualRateBps: rateBps,
          tenureMonths,
          emiMinor: estimatedEmiMinor || editingLoan.emiMinor,
          startDate: loanStart,
          nextDueDate: loanNextDue,
          linkedAccountId: loanAccId || null,
        });
        onNotify?.(`Updated loan "${loanName.trim()}"`);
      } else {
        await api.createLoan({
          name: loanName.trim(),
          counterparty: loanParty.trim(),
          scope: loanScope,
          direction: loanDir,
          principalMinor,
          annualRateBps: rateBps,
          tenureMonths,
          emiMinor: estimatedEmiMinor || principalMinor,
          startDate: loanStart,
          nextDueDate: loanNextDue,
          linkedAccountId: loanAccId || banks[0]?.id || null,
        });
        onNotify?.(`Added loan "${loanName.trim()}"`);
      }
      setLoanModalOpen(false);
      setEditingLoan(null);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsSavingLoan(false);
    }
  };

  const handlePayEmi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payLoanTarget) return;
    setIsPayingEmi(true);
    try {
      const useAcc = payEmiAccId || banks[0]?.id;
      if (!useAcc) throw new Error('Select a Bank account to record an EMI payment.');
      await api.payLoan(payLoanTarget.id, {
        amountMinor: rupeesToPaise(payEmiRupees),
        accountId: useAcc,
        paidAt: payEmiDate,
      });
      setPayLoanTarget(null);
      onNotify?.(`Recorded EMI payment for ${payLoanTarget.name}`);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsPayingEmi(false);
    }
  };

  // Handlers: Due
  const openCreateDue = () => {
    setEditingDue(null);
    setDuePerson('');
    setDuePhone('');
    setDueDir('need');
    setDueScope(scopeFilter === 'all' ? 'business' : scopeFilter);
    setDueAmount('');
    setDueDate('');
    setDueNote('');
    setDueModalOpen(true);
  };

  const openEditDue = (d: PersonDueRecord) => {
    setEditingDue(d);
    setDuePerson(d.personName);
    setDuePhone(d.phone);
    setDueDir(d.direction);
    setDueScope(d.scope);
    setDueAmount((d.amountMinor / 100).toFixed(2));
    setDueDate(d.dueDate ?? '');
    setDueNote(d.note);
    setDueModalOpen(true);
  };

  const handleSaveDue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDue(true);
    try {
      const payload = {
        personName: duePerson.trim(),
        phone: duePhone.trim(),
        direction: dueDir,
        scope: dueScope,
        amountMinor: rupeesToPaise(dueAmount),
        dueDate: dueDate || null,
        note: dueNote.trim(),
      };
      if (editingDue) {
        await api.updateDue(editingDue.id, payload);
        onNotify?.(`Updated due for ${payload.personName}`);
      } else {
        await api.createDue(payload);
        onNotify?.(`Recorded due for ${payload.personName}`);
      }
      setDueModalOpen(false);
      setEditingDue(null);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsSavingDue(false);
    }
  };

  const handleSettleDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    setIsSettlingDue(true);
    try {
      await api.settleDue(settleTarget.id, {
        amountMinor: rupeesToPaise(settleRupees),
        accountId: settleAccId || null,
        settledAt: settleDate,
      });
      setSettleTarget(null);
      onNotify?.(
        `Settled ${formatINR(rupeesToPaise(settleRupees))} with ${settleTarget.personName}`,
      );
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsSettlingDue(false);
    }
  };

  // Handlers: Goal
  const openCreateGoal = () => {
    setEditingGoal(null);
    setGoalTitle('');
    setGoalKind('emergency');
    setGoalScope(scopeFilter === 'all' ? 'business' : scopeFilter);
    setGoalTarget('100000');
    setGoalCurrent('0');
    setGoalDate('');
    setGoalNote('');
    setGoalModalOpen(true);
  };

  const openEditGoal = (g: SavingsGoalRecord) => {
    setEditingGoal(g);
    setGoalTitle(g.title);
    setGoalKind(g.kind);
    setGoalScope(g.scope);
    setGoalTarget((g.targetMinor / 100).toFixed(2));
    setGoalCurrent((g.currentMinor / 100).toFixed(2));
    setGoalDate(g.targetDate ?? '');
    setGoalNote(g.note);
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGoal(true);
    try {
      const payload = {
        title: goalTitle.trim(),
        kind: goalKind,
        scope: goalScope,
        targetMinor: rupeesToPaise(goalTarget),
        currentMinor: rupeesToPaise(goalCurrent || '0'),
        targetDate: goalDate || null,
        note: goalNote,
      };
      if (editingGoal) await api.updateGoal(editingGoal.id, payload);
      else await api.createGoal(payload);
      setGoalModalOpen(false);
      setEditingGoal(null);
      await api
        .getGoals()
        .then(setGoalsSummary)
        .catch(() => {});
      onNotify?.(editingGoal ? 'Goal updated' : 'Goal created');
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleContributeGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribGoal) return;
    setIsContributingGoal(true);
    try {
      await api.contributeGoal(contribGoal.id, {
        amountMinor: rupeesToPaise(contribRupees),
        accountId: contribLogTx ? contribAccId || null : null,
        occurredAt: todayISO(),
        recordAsExpense: contribLogTx,
      });
      setContribGoal(null);
      await api
        .getGoals()
        .then(setGoalsSummary)
        .catch(() => {});
      onNotify?.(
        `Contributed ${formatINR(rupeesToPaise(contribRupees))} to ${contribGoal.title}`,
      );
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setIsContributingGoal(false);
    }
  };

  // Delete execution
  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'loan') await api.deleteLoan(confirmDelete.id);
      else if (confirmDelete.kind === 'due') await api.deleteDue(confirmDelete.id);
      else {
        await api.deleteGoal(confirmDelete.id);
        await api
          .getGoals()
          .then(setGoalsSummary)
          .catch(() => {});
      }
      onNotify?.(`Deleted ${confirmDelete.label}`);
      if (selectedItem?.data.id === confirmDelete.id) {
        setSelectedItem(null);
      }
      setConfirmDelete(null);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
      setConfirmDelete(null);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Type',
      'Name/Person',
      'Party/Contact',
      'Scope',
      'Direction',
      'Remaining (INR)',
      'Total (INR)',
      'Due Date',
    ];
    const rows: (string | number)[][] = [];

    for (const l of loans) {
      rows.push([
        'Loan',
        l.name,
        l.counterparty,
        l.scope,
        l.direction,
        (l.remainingMinor / 100).toFixed(2),
        (l.principalMinor / 100).toFixed(2),
        l.nextDueDate,
      ]);
    }
    for (const d of dues) {
      rows.push([
        'Person Due',
        d.personName,
        d.phone || '',
        d.scope,
        d.direction,
        (d.remainingMinor / 100).toFixed(2),
        (d.amountMinor / 100).toFixed(2),
        d.dueDate || '',
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `loans-dues-export-${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify?.('Exported CSV successfully!');
  };

  const openPayEmiForLoan = (loan: LoanRecord) => {
    setPayLoanTarget(loan);
    setPayEmiRupees(((loan.emiMinor || loan.remainingMinor) / 100).toFixed(2));
    setPayEmiAccId(loan.linkedAccountId || banks[0]?.id || '');
    setPayEmiDate(todayISO());
  };

  const openSettleForDue = (due: PersonDueRecord) => {
    setSettleTarget(due);
    setSettleRupees((due.remainingMinor / 100).toFixed(2));
    setSettleAccId(banks[0]?.id ?? '');
    setSettleDate(todayISO());
  };

  const openContribForGoal = (g: SavingsGoalRecord) => {
    setContribGoal(g);
    setContribRupees('');
    setContribAccId(banks[0]?.id || '');
    setContribLogTx(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP EXECUTIVE FINANCIAL KPI STRIP (Warm Alabaster & Obsidian Bento Strip) */}
      <LoansDuesKpiStrip
        totalBorrowingsMinor={portfolioMetrics.totalBorrowingsMinor}
        totalReceivablesMinor={portfolioMetrics.totalReceivablesMinor}
        monthlyEmiCommitmentMinor={portfolioMetrics.monthlyEmiCommitmentMinor}
        weightedAvgAprBps={portfolioMetrics.weightedAvgAprBps}
        principalClearedPct={portfolioMetrics.principalClearedPct}
        activeLoansCount={portfolioMetrics.activeLoansCount}
        openDuesCount={portfolioMetrics.openDuesCount}
        urgentDueCount={portfolioMetrics.urgentDueCount}
        nextEmiLoan={portfolioMetrics.nextEmiLoan}
        onOpenAddLoan={openCreateLoan}
        onOpenAddDue={openCreateDue}
        onOpenAddGoal={openCreateGoal}
      />

      {/* 2. HERO 3D COVENANT STAGE & INTERACTIVE SVG AMORTIZATION / MIX WORKSTATION */}
      <LoansHeroWorkstation
        loans={filteredLoans}
        dues={filteredDues}
        goals={filteredGoals}
        dueSummaries={dueSummaries}
        accounts={accounts}
        selectedItem={selectedItem}
        payoffPlan={payoffPlan}
        payoffExtraRupees={payoffExtraRupees}
        payoffStrategy={payoffStrategy}
        onPayoffExtraChange={setPayoffExtraRupees}
        onPayoffStrategyChange={setPayoffStrategy}
        onSelectItem={setSelectedItem}
        onOpenPayEmi={openPayEmiForLoan}
        onOpenSettleDue={openSettleForDue}
        onOpenContributeGoal={openContribForGoal}
        onOpenEditLoan={openEditLoan}
        onOpenEditDue={openEditDue}
        onOpenEditGoal={openEditGoal}
        onOpenAddLoan={openCreateLoan}
        onOpenAddDue={openCreateDue}
        onNotify={onNotify}
      />

      {/* 3. MAIN WORKSTATION: 3D METALLIC BENTO DECK OR SPLIT DUAL-PANE VIEW */}
      {workstationLayout === 'bento' ? (
        <div className="space-y-6">
          <BentoLoansGrid
            loans={filteredLoans}
            dues={filteredDues}
            goals={filteredGoals}
            selectedItem={selectedItem}
            searchQuery={searchQuery}
            activeTab={activeTab}
            triageFilter={triageFilter}
            sortOption={sortOption}
            scopeFilter={scopeFilter}
            urgentDueCount={portfolioMetrics.urgentDueCount}
            totalYouOweCount={activeBorrowedLoans.length + openGiveDues.length}
            totalOwedToYouCount={activeLentLoans.length + openNeedDues.length}
            onSearchChange={setSearchQuery}
            onTabChange={setActiveTab}
            onTriageChange={setTriageFilter}
            onSortChange={setSortOption}
            onScopeChange={setScopeFilter}
            onSelectItem={setSelectedItem}
            onSelectAndSwitchToSplit={(item) => {
              setSelectedItem(item);
              setWorkstationLayout('split');
            }}
            onOpenAddLoan={openCreateLoan}
            onOpenAddDue={openCreateDue}
            onOpenAddGoal={openCreateGoal}
            onOpenPayEmi={openPayEmiForLoan}
            onOpenSettleDue={openSettleForDue}
            onOpenEditLoan={openEditLoan}
            onOpenEditDue={openEditDue}
            onOpenContributeGoal={openContribForGoal}
            onOpenDeleteConfirm={(kind, id, label) => setConfirmDelete({ kind, id, label })}
            onSwitchToSplit={() => setWorkstationLayout('split')}
          />

          {/* Context HUD & Khatabook Settlement Stream below 3D Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <LoanContextHud
                selectedItem={selectedItem}
                accounts={accounts}
                payoffPlan={payoffPlan}
                payoffExtraRupees={payoffExtraRupees}
                payoffStrategy={payoffStrategy}
                onPayoffExtraChange={setPayoffExtraRupees}
                onPayoffStrategyChange={setPayoffStrategy}
                onClearSelection={() => setSelectedItem(null)}
                onOpenPayEmi={openPayEmiForLoan}
                onOpenEditLoan={openEditLoan}
                onOpenSettleDue={openSettleForDue}
                onOpenEditDue={openEditDue}
                onOpenContributeGoal={openContribForGoal}
                onOpenEditGoal={openEditGoal}
              />
            </div>
            <div className="lg:col-span-5">
              <SettlementStream
                selectedItem={selectedItem}
                dueSummaries={dueSummaries}
                dues={dues}
                loans={loans}
                onOpenSettleDue={openSettleForDue}
                onOpenPayEmi={openPayEmiForLoan}
                onExportCSV={handleExportCSV}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* ================= LEFT COLUMN: SCALABLE LOANS & DUES HUB ================= */}
          <LoansDuesHub
            loans={loans}
            dues={dues}
            goals={goalsSummary?.goals || []}
            filteredLoans={filteredLoans}
            filteredDues={filteredDues}
            filteredGoals={filteredGoals}
            selectedItem={selectedItem}
            searchQuery={searchQuery}
            activeTab={activeTab}
            triageFilter={triageFilter}
            workstationLayout={workstationLayout}
            sortOption={sortOption}
            onSortChange={setSortOption}
            scopeFilter={scopeFilter}
            onScopeChange={(s) => setScopeFilter(s)}
            urgentDueCount={portfolioMetrics.urgentDueCount}
            totalYouOweCount={activeBorrowedLoans.length + openGiveDues.length}
            totalOwedToYouCount={activeLentLoans.length + openNeedDues.length}
            onSelectItem={(item) => setSelectedItem(item)}
            onSearchChange={(q) => setSearchQuery(q)}
            onTabChange={(tab) => setActiveTab(tab)}
            onTriageChange={(triage) => setTriageFilter(triage)}
            onLayoutChange={(layout) => setWorkstationLayout(layout)}
            onOpenPayEmi={openPayEmiForLoan}
            onOpenSettleDue={openSettleForDue}
            onOpenEditLoan={openEditLoan}
            onOpenEditDue={openEditDue}
            onOpenDeleteConfirm={(kind, id, label) => setConfirmDelete({ kind, id, label })}
          />

          {/* ================= RIGHT COLUMN: CONTEXT HUD & SETTLEMENT STREAM ================= */}
          <div className="flex-1 w-full space-y-5">
            <LoanContextHud
              selectedItem={selectedItem}
              accounts={accounts}
              payoffPlan={payoffPlan}
              payoffExtraRupees={payoffExtraRupees}
              payoffStrategy={payoffStrategy}
              onPayoffExtraChange={(val) => setPayoffExtraRupees(val)}
              onPayoffStrategyChange={(strat) => setPayoffStrategy(strat)}
              onClearSelection={() => setSelectedItem(null)}
              onOpenPayEmi={openPayEmiForLoan}
              onOpenEditLoan={openEditLoan}
              onOpenSettleDue={openSettleForDue}
              onOpenEditDue={openEditDue}
              onOpenContributeGoal={openContribForGoal}
              onOpenEditGoal={openEditGoal}
            />

            <SettlementStream
              selectedItem={selectedItem}
              dueSummaries={dueSummaries}
              dues={dues}
              loans={loans}
              onOpenSettleDue={openSettleForDue}
              onOpenPayEmi={openPayEmiForLoan}
              onExportCSV={handleExportCSV}
            />
          </div>
        </div>
      )}

      {/* ================= MODAL 1: LOAN CREATION & EDITING ================= */}
      <Dialog
        open={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        title={editingLoan ? 'Edit Loan Parameters' : 'Add New Loan'}
      >
        <form onSubmit={handleSaveLoan} className="space-y-4">
          <div>
            <FieldLabel>Loan Name / Description</FieldLabel>
            <Input
              required
              autoFocus
              placeholder="e.g. SBI Home Loan, Car Loan, HDFC Personal"
              value={loanName}
              onChange={(e) => setLoanName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Lender / Counterparty</FieldLabel>
              <Input
                required
                placeholder="e.g. State Bank of India, HDFC"
                value={loanParty}
                onChange={(e) => setLoanParty(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Direction</FieldLabel>
              <Select
                value={loanDir}
                onChange={(e) => setLoanDir(e.target.value as LoanDirection)}
              >
                <option value="borrowed">You Borrowed (Liability / EMI)</option>
                <option value="lent">You Lent (Asset / Receivable)</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Principal Amount (₹)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={loanPrincipal}
                onChange={(e) => setLoanPrincipal(e.target.value)}
                className="font-mono text-lg font-bold"
              />
            </div>

            {editingLoan && (
              <div>
                <FieldLabel>Remaining Balance (₹)</FieldLabel>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={loanRemaining}
                  onChange={(e) => setLoanRemaining(e.target.value)}
                  className="font-mono text-lg font-bold"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel>Annual Rate (% p.a.)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={loanRatePct}
                onChange={(e) => setLoanRatePct(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Tenure (Months)</FieldLabel>
              <Input
                type="number"
                value={loanTenure}
                onChange={(e) => setLoanTenure(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Est. Monthly EMI</FieldLabel>
              <div className="h-9 px-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] flex items-center font-mono font-bold text-xs text-[#111318]">
                {formatINR(estimatedEmiMinor)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <Input
                type="date"
                value={loanStart}
                onChange={(e) => setLoanStart(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel>Next EMI Due Date</FieldLabel>
              <Input
                type="date"
                value={loanNextDue}
                onChange={(e) => setLoanNextDue(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Scope</FieldLabel>
              <Select
                value={loanScope}
                onChange={(e) => setLoanScope(e.target.value as Scope)}
              >
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Linked Deduction Bank</FieldLabel>
              <Select value={loanAccId} onChange={(e) => setLoanAccId(e.target.value)}>
                <option value="">Select Bank Account</option>
                {banks.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatINR(acc.currentBalanceMinor || 0)})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setLoanModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingLoan}>
              {isSavingLoan ? 'Saving...' : editingLoan ? 'Save Changes' : 'Create Loan'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 2: RECORD EMI PAYMENT ================= */}
      <Dialog
        open={Boolean(payLoanTarget)}
        onClose={() => setPayLoanTarget(null)}
        title={`Record EMI: ${payLoanTarget?.name || ''}`}
      >
        <form onSubmit={handlePayEmi} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] text-xs">
            <div className="flex justify-between">
              <span className="text-[#52504C]">Remaining Balance:</span>
              <strong className="font-mono text-[#111318]">
                {formatINR(payLoanTarget?.remainingMinor || 0)}
              </strong>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[#52504C]">Scheduled EMI:</span>
              <strong className="font-mono text-[#C59B27]">
                {formatINR(payLoanTarget?.emiMinor || 0)}
              </strong>
            </div>
          </div>

          <div>
            <FieldLabel>Payment Amount (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              autoFocus
              value={payEmiRupees}
              onChange={(e) => setPayEmiRupees(e.target.value)}
              className="font-mono text-lg font-bold"
            />
          </div>

          <div>
            <FieldLabel>Pay From Bank Account</FieldLabel>
            <Select
              value={payEmiAccId}
              onChange={(e) => setPayEmiAccId(e.target.value)}
              required
            >
              <option value="">Select Bank Account</option>
              {banks.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatINR(acc.currentBalanceMinor || 0)})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel>Payment Date</FieldLabel>
            <Input
              type="date"
              value={payEmiDate}
              onChange={(e) => setPayEmiDate(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setPayLoanTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPayingEmi}>
              {isPayingEmi ? 'Recording...' : 'Confirm EMI Payment'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 3: PERSON DUE (KHATABOOK) ================= */}
      <Dialog
        open={dueModalOpen}
        onClose={() => setDueModalOpen(false)}
        title={editingDue ? 'Edit Due Record' : 'Add Person Due (Udhar)'}
      >
        <form onSubmit={handleSaveDue} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Person Name</FieldLabel>
              <Input
                required
                autoFocus
                placeholder="e.g. Ramesh Kumar, Pooja Verma"
                value={duePerson}
                onChange={(e) => setDuePerson(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Phone Number (for WhatsApp Reminders)</FieldLabel>
              <Input
                placeholder="+91 98765 43210"
                value={duePhone}
                onChange={(e) => setDuePhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Direction</FieldLabel>
              <Select value={dueDir} onChange={(e) => setDueDir(e.target.value as DueDirection)}>
                <option value="need">You are Owed (Need to Receive / Asset)</option>
                <option value="give">You Owe (Need to Pay / Liability)</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Amount (₹)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={dueAmount}
                onChange={(e) => setDueAmount(e.target.value)}
                className="font-mono text-lg font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Due Date (Optional)</FieldLabel>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Scope</FieldLabel>
              <Select value={dueScope} onChange={(e) => setDueScope(e.target.value as Scope)}>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel>Note / Context</FieldLabel>
            <Input
              placeholder="e.g. Goa trip Airbnb split, concert tickets, cash borrow"
              value={dueNote}
              onChange={(e) => setDueNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setDueModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingDue}>
              {isSavingDue ? 'Saving...' : editingDue ? 'Save Changes' : 'Record Due'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 4: SETTLE DUE ================= */}
      <Dialog
        open={Boolean(settleTarget)}
        onClose={() => setSettleTarget(null)}
        title={`Settle Due: ${settleTarget?.personName || ''}`}
      >
        <form onSubmit={handleSettleDue} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] text-xs">
            <div className="flex justify-between">
              <span className="text-[#52504C]">Remaining Balance:</span>
              <strong className="font-mono text-[#111318]">
                {formatINR(settleTarget?.remainingMinor || 0)}
              </strong>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[#52504C]">Type:</span>
              <span className="font-semibold text-[#111318] capitalize">
                {settleTarget?.direction === 'need' ? 'Money to Receive' : 'Money to Pay'}
              </span>
            </div>
          </div>

          <div>
            <FieldLabel>Settlement Amount (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              autoFocus
              value={settleRupees}
              onChange={(e) => setSettleRupees(e.target.value)}
              className="font-mono text-lg font-bold"
            />
          </div>

          <div>
            <FieldLabel>Settle Via Bank Account (Optional)</FieldLabel>
            <Select value={settleAccId} onChange={(e) => setSettleAccId(e.target.value)}>
              <option value="">No Ledger Transaction (Direct Cash / External)</option>
              {banks.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatINR(acc.currentBalanceMinor || 0)})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel>Settlement Date</FieldLabel>
            <Input
              type="date"
              value={settleDate}
              onChange={(e) => setSettleDate(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setSettleTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSettlingDue}>
              {isSettlingDue ? 'Settling...' : 'Confirm Settlement'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 5: SAVINGS GOAL ================= */}
      <Dialog
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={editingGoal ? 'Edit Savings Goal' : 'Add Savings Goal / Tax Reserve'}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div>
            <FieldLabel>Goal Title</FieldLabel>
            <Input
              required
              autoFocus
              placeholder="e.g. Emergency Fund (6 Months), Advance Tax Reserve"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Target Amount (₹)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                required
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="font-mono text-lg font-bold"
              />
            </div>
            <div>
              <FieldLabel>Initial Funded Amount (₹)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={goalCurrent}
                onChange={(e) => setGoalCurrent(e.target.value)}
                className="font-mono text-lg font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel>Category</FieldLabel>
              <Select value={goalKind} onChange={(e) => setGoalKind(e.target.value as GoalKind)}>
                <option value="emergency">Emergency</option>
                <option value="tax_reserve">Tax Reserve</option>
                <option value="vacation">Vacation</option>
                <option value="goal">Custom Goal</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Target Date</FieldLabel>
              <Input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Scope</FieldLabel>
              <Select value={goalScope} onChange={(e) => setGoalScope(e.target.value as Scope)}>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setGoalModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingGoal}>
              {isSavingGoal ? 'Saving...' : editingGoal ? 'Save Changes' : 'Create Goal'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ================= MODAL 6: CONTRIBUTE TO GOAL ================= */}
      <Dialog
        open={Boolean(contribGoal)}
        onClose={() => setContribGoal(null)}
        title={`Add Funds to: ${contribGoal?.title || ''}`}
      >
        <form onSubmit={handleContributeGoal} className="space-y-4">
          <div>
            <FieldLabel>Contribution Amount (₹)</FieldLabel>
            <Input
              type="number"
              step="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={contribRupees}
              onChange={(e) => setContribRupees(e.target.value)}
              className="font-mono text-lg font-bold"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#111318] cursor-pointer">
              <input
                type="checkbox"
                checked={contribLogTx}
                onChange={(e) => setContribLogTx(e.target.checked)}
                className="rounded border-[#E6E1D6] text-[#059669] focus:ring-[#C59B27]"
              />
              <span>Deduct funds from a Bank Account (Record ledger expense)</span>
            </label>
          </div>

          {contribLogTx && (
            <div>
              <FieldLabel>Deduct From Bank</FieldLabel>
              <Select
                value={contribAccId}
                onChange={(e) => setContribAccId(e.target.value)}
                required
              >
                <option value="">Select Bank Account</option>
                {banks.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatINR(acc.currentBalanceMinor || 0)})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
            <Button variant="secondary" onClick={() => setContribGoal(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isContributingGoal}>
              {isContributingGoal ? 'Adding...' : 'Confirm Contribution'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Confirmation Dialog for Deletions */}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete ${confirmDelete?.label || 'Item'}?`}
        message="Are you sure you want to permanently delete this record? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={executeDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
