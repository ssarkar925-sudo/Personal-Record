import type {
  LoanRecord,
  PersonDueRecord,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type { SelectedLoansItem } from './types.ts';

export type LoanFoilFinish = 'auto' | 'obsidian' | 'gold' | 'emerald' | 'platinum' | 'crimson';

export interface LoansDuesPortfolioMetrics {
  totalBorrowedPrincipalMinor: number;
  totalBorrowedRemainingMinor: number;
  totalKhatabookGiveMinor: number;
  totalBorrowingsMinor: number;
  totalLentRemainingMinor: number;
  totalKhatabookNeedMinor: number;
  totalReceivablesMinor: number;
  netDebtPositionMinor: number;
  monthlyEmiCommitmentMinor: number;
  weightedAvgAprBps: number;
  principalClearedPct: number;
  activeLoansCount: number;
  openDuesCount: number;
  urgentDueCount: number;
  nextEmiLoan: LoanRecord | null;
}

export interface AmortizationProjectionPoint {
  monthIndex: number;
  monthLabel: string;
  baselineMinor: number;
  acceleratedMinor: number;
  cumulativeInterestSavedMinor: number;
}

export interface LiabilityReceivableSlice {
  id: 'bank_loans' | 'khatabook_give' | 'receivables_need' | 'savings_reserves';
  label: string;
  amountMinor: number;
  sharePct: number;
  color: string;
  count: number;
}

export interface LoanCardMetallicTheme {
  id: Exclude<LoanFoilFinish, 'auto'>;
  label: string;
  background: string;
  border: string;
  accentText: string;
  badgeBg: string;
  badgeText: string;
  progressColor: string;
}

export function isDueWithinWindow(dateStr: string | null | undefined, currentDayOfMonth: number): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  const dueDay = Number(parts[2]);
  if (!Number.isFinite(dueDay) || dueDay <= 0) return false;
  const diff = dueDay - currentDayOfMonth;
  return (diff >= 0 && diff <= 7) || (diff < 0 && diff >= -3);
}

export function computeLoansDuesPortfolioMetrics(
  loans: LoanRecord[],
  dues: PersonDueRecord[],
  currentDayOfMonth = new Date().getDate(),
): LoansDuesPortfolioMetrics {
  const activeBorrowedLoans = loans.filter((l) => l.direction === 'borrowed' && l.status === 'active');
  const activeLentLoans = loans.filter((l) => l.direction === 'lent' && l.status === 'active');
  const openGiveDues = dues.filter((d) => d.direction === 'give' && d.status !== 'settled');
  const openNeedDues = dues.filter((d) => d.direction === 'need' && d.status !== 'settled');

  const totalBorrowedPrincipalMinor = activeBorrowedLoans.reduce((sum, l) => sum + Math.max(0, l.principalMinor), 0);
  const totalBorrowedRemainingMinor = activeBorrowedLoans.reduce((sum, l) => sum + Math.max(0, l.remainingMinor), 0);
  const totalKhatabookGiveMinor = openGiveDues.reduce((sum, d) => sum + Math.max(0, d.remainingMinor), 0);
  const totalBorrowingsMinor = totalBorrowedRemainingMinor + totalKhatabookGiveMinor;

  const totalLentRemainingMinor = activeLentLoans.reduce((sum, l) => sum + Math.max(0, l.remainingMinor), 0);
  const totalKhatabookNeedMinor = openNeedDues.reduce((sum, d) => sum + Math.max(0, d.remainingMinor), 0);
  const totalReceivablesMinor = totalLentRemainingMinor + totalKhatabookNeedMinor;

  const netDebtPositionMinor = totalBorrowingsMinor - totalReceivablesMinor;
  const monthlyEmiCommitmentMinor = activeBorrowedLoans.reduce((sum, l) => sum + Math.max(0, l.emiMinor), 0);

  const weightedNumer = activeBorrowedLoans.reduce(
    (sum, l) => sum + Math.max(0, l.remainingMinor) * Math.max(0, l.annualRateBps),
    0,
  );
  const weightedAvgAprBps =
    totalBorrowedRemainingMinor > 0 ? Math.round(weightedNumer / totalBorrowedRemainingMinor) : 0;

  const clearedMinor = Math.max(0, totalBorrowedPrincipalMinor - totalBorrowedRemainingMinor);
  const principalClearedPct =
    totalBorrowedPrincipalMinor > 0
      ? Math.min(100, Math.round((clearedMinor / totalBorrowedPrincipalMinor) * 100))
      : 100;

  let urgentDueCount = 0;
  for (const l of activeBorrowedLoans) {
    if (isDueWithinWindow(l.nextDueDate, currentDayOfMonth)) urgentDueCount++;
  }
  for (const d of dues) {
    if (d.status !== 'settled' && isDueWithinWindow(d.dueDate, currentDayOfMonth)) {
      urgentDueCount++;
    }
  }

  const nextEmiLoan =
    activeBorrowedLoans
      .slice()
      .sort((a, b) => (a.nextDueDate || '9999').localeCompare(b.nextDueDate || '9999'))[0] || null;

  return {
    totalBorrowedPrincipalMinor,
    totalBorrowedRemainingMinor,
    totalKhatabookGiveMinor,
    totalBorrowingsMinor,
    totalLentRemainingMinor,
    totalKhatabookNeedMinor,
    totalReceivablesMinor,
    netDebtPositionMinor,
    monthlyEmiCommitmentMinor,
    weightedAvgAprBps,
    principalClearedPct,
    activeLoansCount: activeBorrowedLoans.length,
    openDuesCount: openGiveDues.length + openNeedDues.length,
    urgentDueCount,
    nextEmiLoan,
  };
}

export function buildAmortizationProjectionSeries(
  loans: LoanRecord[],
  extraMonthlyMinor = 0,
  horizonMonths = 12,
): AmortizationProjectionPoint[] {
  const activeBorrowed = loans
    .filter((l) => l.direction === 'borrowed' && l.status === 'active' && l.remainingMinor > 0)
    .sort((a, b) => b.annualRateBps - a.annualRateBps);

  const baseBalances = activeBorrowed.map((l) => l.remainingMinor);
  const accelBalances = activeBorrowed.map((l) => l.remainingMinor);

  const initialTotal = baseBalances.reduce((sum, b) => sum + b, 0);
  const points: AmortizationProjectionPoint[] = [
    {
      monthIndex: 0,
      monthLabel: 'Now',
      baselineMinor: initialTotal,
      acceleratedMinor: initialTotal,
      cumulativeInterestSavedMinor: 0,
    },
  ];

  let cumBaseInterest = 0;
  let cumAccelInterest = 0;

  for (let m = 1; m <= horizonMonths; m++) {
    // 1. Step Baseline
    for (let i = 0; i < activeBorrowed.length; i++) {
      const bal = baseBalances[i];
      if (bal <= 0) continue;
      const monthlyRate = activeBorrowed[i].annualRateBps / 10000 / 12;
      const interest = Math.round(bal * monthlyRate);
      cumBaseInterest += interest;
      const emi = Math.max(interest + 100, activeBorrowed[i].emiMinor);
      baseBalances[i] = Math.max(0, bal + interest - emi);
    }

    // 2. Step Accelerated (Avalanche extra allocation)
    let extraPool = Math.max(0, extraMonthlyMinor);
    for (let i = 0; i < activeBorrowed.length; i++) {
      const bal = accelBalances[i];
      if (bal <= 0) continue;
      const monthlyRate = activeBorrowed[i].annualRateBps / 10000 / 12;
      const interest = Math.round(bal * monthlyRate);
      cumAccelInterest += interest;
      const emi = Math.max(interest + 100, activeBorrowed[i].emiMinor);
      const afterRegular = Math.max(0, bal + interest - emi);
      const extraApplied = Math.min(afterRegular, extraPool);
      accelBalances[i] = afterRegular - extraApplied;
      extraPool -= extraApplied;
    }

    const baseSum = baseBalances.reduce((s, b) => s + b, 0);
    const accelSum = accelBalances.reduce((s, b) => s + b, 0);

    points.push({
      monthIndex: m,
      monthLabel: `M${m}`,
      baselineMinor: baseSum,
      acceleratedMinor: accelSum,
      cumulativeInterestSavedMinor: Math.max(0, cumBaseInterest - cumAccelInterest),
    });
  }

  return points;
}

export function computeLiabilityReceivableMix(
  loans: LoanRecord[],
  dues: PersonDueRecord[],
  goals: SavingsGoalRecord[],
): LiabilityReceivableSlice[] {
  const borrowedLoans = loans.filter((l) => l.direction === 'borrowed' && l.status === 'active');
  const lentLoans = loans.filter((l) => l.direction === 'lent' && l.status === 'active');
  const giveDues = dues.filter((d) => d.direction === 'give' && d.status !== 'settled');
  const needDues = dues.filter((d) => d.direction === 'need' && d.status !== 'settled');

  const bankLoansMinor = borrowedLoans.reduce((s, l) => s + Math.max(0, l.remainingMinor), 0);
  const khatabookGiveMinor = giveDues.reduce((s, d) => s + Math.max(0, d.remainingMinor), 0);
  const receivablesNeedMinor =
    lentLoans.reduce((s, l) => s + Math.max(0, l.remainingMinor), 0) +
    needDues.reduce((s, d) => s + Math.max(0, d.remainingMinor), 0);
  const savingsReservesMinor = goals.reduce((s, g) => s + Math.max(0, g.currentMinor), 0);

  const totalMinor = Math.max(
    1,
    bankLoansMinor + khatabookGiveMinor + receivablesNeedMinor + savingsReservesMinor,
  );

  const raw: Omit<LiabilityReceivableSlice, 'sharePct'>[] = [
    {
      id: 'bank_loans',
      label: 'Bank Loans (EMI)',
      amountMinor: bankLoansMinor,
      color: '#E11D48',
      count: borrowedLoans.length,
    },
    {
      id: 'khatabook_give',
      label: 'You Owe (Khatabook)',
      amountMinor: khatabookGiveMinor,
      color: '#C59B27',
      count: giveDues.length,
    },
    {
      id: 'receivables_need',
      label: 'Owed to You (Asset)',
      amountMinor: receivablesNeedMinor,
      color: '#059669',
      count: needDues.length + lentLoans.length,
    },
    {
      id: 'savings_reserves',
      label: 'Funded Reserves',
      amountMinor: savingsReservesMinor,
      color: '#111318',
      count: goals.length,
    },
  ];

  return raw.map((slice) => ({
    ...slice,
    sharePct: Math.round((slice.amountMinor / totalMinor) * 100),
  }));
}

export function resolveLoanCardTheme(
  item: SelectedLoansItem,
  overrideFoil: LoanFoilFinish = 'auto',
): LoanCardMetallicTheme {
  let target: Exclude<LoanFoilFinish, 'auto'> = 'obsidian';

  if (overrideFoil !== 'auto') {
    target = overrideFoil;
  } else if (item?.kind === 'loan') {
    if (item.data.status === 'closed') target = 'platinum';
    else if (item.data.direction === 'lent') target = 'emerald';
    else if (item.data.scope === 'business') target = 'obsidian';
    else target = 'gold';
  } else if (item?.kind === 'due') {
    if (item.data.status === 'settled') target = 'platinum';
    else if (item.data.direction === 'need') target = 'emerald';
    else target = 'crimson';
  } else if (item?.kind === 'goal') {
    target = 'gold';
  }

  const themes: Record<Exclude<LoanFoilFinish, 'auto'>, LoanCardMetallicTheme> = {
    obsidian: {
      id: 'obsidian',
      label: 'Obsidian Covenant',
      background: 'linear-gradient(135deg, #FAF8F5 0%, #FFFFFF 100%)',
      border: '#E6E1D6',
      accentText: '#8C6D1F',
      badgeBg: '#F3EFEA',
      badgeText: '#8C6D1F',
      progressColor: '#C59B27',
    },
    gold: {
      id: 'gold',
      label: 'Champagne Sovereign',
      background: 'linear-gradient(135deg, #FFFDF8 0%, #F9F5EC 100%)',
      border: '#E8DDBE',
      accentText: '#8C6D1F',
      badgeBg: '#F5ECD4',
      badgeText: '#7B5E14',
      progressColor: '#C59B27',
    },
    emerald: {
      id: 'emerald',
      label: 'Emerald Receivable',
      background: 'linear-gradient(135deg, #F6FBF8 0%, #ECF6F0 100%)',
      border: '#C3E7D3',
      accentText: '#047857',
      badgeBg: '#E0F2E9',
      badgeText: '#065F46',
      progressColor: '#059669',
    },
    crimson: {
      id: 'crimson',
      label: 'Crimson Liability',
      background: 'linear-gradient(135deg, #FFF8F8 0%, #FDF2F2 100%)',
      border: '#FBCFE8',
      accentText: '#BE123C',
      badgeBg: '#FFE4E6',
      badgeText: '#9F1239',
      progressColor: '#E11D48',
    },
    platinum: {
      id: 'platinum',
      label: 'Brushed Platinum',
      background: 'linear-gradient(135deg, #FCFCFD 0%, #F3F4F6 100%)',
      border: '#DDE1E5',
      accentText: '#475569',
      badgeBg: '#E2E8F0',
      badgeText: '#334155',
      progressColor: '#64748B',
    },
  };

  return themes[target];
}
