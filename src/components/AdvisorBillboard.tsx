import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Coins,
  Flame,
  Landmark,
  Percent,
  PiggyBank,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  type AdvisorBriefing,
  type DashboardSummary,
  type DebtPayoffResult,
  type GoalsSummary,
  type RecurringLeakCandidate,
} from '../lib/api.ts';
import { formatINR } from '../lib/format.ts';
import { Badge, Button, Card } from './ui/Primitives.tsx';
import { MeterBar } from './charts/AnimatedCharts.tsx';
import {
  compareTaxRegimes,
  computeAdvanceTaxSchedule,
} from '../../shared/tax-engine.ts';
import type { Scope } from '../../shared/ledger-core.ts';
import type { AppLanguage } from '../../shared/i18n.ts';
import type { WorkspaceId } from '../workspaces/DashboardView.tsx';

export type BillboardTab = 'predictions' | 'notices' | 'strategies';
export type ScenarioMode = 'baseline' | 'stress' | 'aggressive';

export interface MacroNotice {
  id: string;
  category: 'urgent' | 'tax' | 'cashflow' | 'milestone';
  severity: 'urgent' | 'warning' | 'info' | 'positive';
  title: string;
  subtitle: string;
  amountMinor?: number;
  dueDate?: string;
  actionLabel?: string;
  actionTab?: WorkspaceId;
}

export function AdvisorBillboard({
  data,
  briefing,
  scopeFilter,
  onNavigate,
}: {
  data: DashboardSummary;
  briefing: AdvisorBriefing | null;
  systemLanguage?: AppLanguage;
  scopeFilter: Scope | 'all';
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd?: () => void;
  onRefresh?: () => void;
}) {

  // Active Billboard View Tab
  const [activeTab, setActiveTab] = useState<BillboardTab>('predictions');

  // Prediction Scenario Mode & Custom Shock Slider
  const [scenario, setScenario] = useState<ScenarioMode>('baseline');
  const [customShockPct, setCustomShockPct] = useState<number>(0);

  // Notice category filter & dismissed notices
  const [noticeCategory, setNoticeCategory] = useState<'all' | 'urgent' | 'tax' | 'cashflow'>('all');
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());

  // Deep Strategy State
  const [debtStrategy, setDebtStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [extraDebtMonthlyMinor, setExtraDebtMonthlyMinor] = useState<number>(250000); // Default ₹2,500/mo
  const [debtPlan, setDebtPlan] = useState<DebtPayoffResult | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<RecurringLeakCandidate[]>([]);
  const [goalsSummary, setGoalsSummary] = useState<GoalsSummary | null>(null);

  // Fetch deep strategy intelligence
  useEffect(() => {
    let cancelled = false;
    const fetchStrategyData = async () => {
      try {
        setDebtLoading(true);
        const plan = await api.getDebtPayoffPlan({
          extraMinor: extraDebtMonthlyMinor,
          strategy: debtStrategy,
        });
        if (!cancelled) setDebtPlan(plan);
      } catch (err) {
        console.error('Failed to load debt payoff plan:', err);
      } finally {
        if (!cancelled) setDebtLoading(false);
      }

      try {
        const subs = await api.getSubscriptions();
        if (!cancelled) setSubscriptions(subs);
      } catch (err) {
        console.error('Failed to load subscriptions:', err);
      }

      try {
        const goals = await api.getGoals();
        if (!cancelled) setGoalsSummary(goals);
      } catch (err) {
        console.error('Failed to load goals summary:', err);
      }
    };

    void fetchStrategyData();
    return () => {
      cancelled = true;
    };
  }, [debtStrategy, extraDebtMonthlyMinor]);

  // Base metrics
  const liquidCash = data.totalBankMinor;
  const avgMonthlyExpense = briefing?.avgMonthlyExpenseMinor || data.monthExpenseMinor || 5000000;
  const scheduledOutflow30d = briefing?.scheduledOutflow30dMinor ?? (data.totalCardDebtMinor + data.totalGiveMinor);
  const expectedInflow30d = briefing?.expectedInflow30dMinor ?? data.monthIncomeMinor;

  // Scenario calculations
  const scenarioCalculations = useMemo(() => {
    const shockMult = 1 + customShockPct / 100;
    if (scenario === 'stress') {
      const shockOutflow = Math.round(scheduledOutflow30d * 1.25 * shockMult);
      const reducedInflow = Math.round(expectedInflow30d * 0.85);
      const projected = liquidCash + reducedInflow - shockOutflow;
      const stressMonthlyBurn = Math.round(avgMonthlyExpense * 1.2 * shockMult);
      const runwayMonths = stressMonthlyBurn > 0 ? Number((liquidCash / stressMonthlyBurn).toFixed(1)) : 12;
      return {
        label: 'Stress Test (-15% Inflow, +25% Outflow Shock)',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        projectedBalanceMinor: projected,
        runwayMonths,
        inflowMinor: reducedInflow,
        outflowMinor: shockOutflow,
        statusNote: 'Tests resilience against sudden medical bills, delayed receivables, or emergency repairs.',
      };
    }

    if (scenario === 'aggressive') {
      const optimizedOutflow = Math.round(scheduledOutflow30d * 0.85 * shockMult);
      const projected = liquidCash + expectedInflow30d - optimizedOutflow;
      const leanMonthlyBurn = Math.round(avgMonthlyExpense * 0.85 * shockMult);
      const runwayMonths = leanMonthlyBurn > 0 ? Number((liquidCash / leanMonthlyBurn).toFixed(1)) : 12;
      return {
        label: 'Aggressive Wealth Mode (15% Cut to Discretionary Leaks)',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
        projectedBalanceMinor: projected,
        runwayMonths,
        inflowMinor: expectedInflow30d,
        outflowMinor: optimizedOutflow,
        statusNote: 'Channels eliminated subscription leaks and dining expenses directly into emergency savings.',
      };
    }

    // Baseline
    const adjustedOutflow = Math.round(scheduledOutflow30d * shockMult);
    const projected = liquidCash + expectedInflow30d - adjustedOutflow;
    const adjustedBurn = Math.round(avgMonthlyExpense * shockMult);
    const runwayMonths = adjustedBurn > 0 ? Number((liquidCash / adjustedBurn).toFixed(1)) : 12;
    return {
      label: 'Standard Run-Rate (Current Burn Rate)',
      badgeClass: 'bg-[#F3EFEA] text-[#111318] border-[#D6CFC2]',
      projectedBalanceMinor: projected,
      runwayMonths,
      inflowMinor: expectedInflow30d,
      outflowMinor: adjustedOutflow,
      statusNote: 'Based on regular recurring cashflow, active loans, credit card cycles, and people dues.',
    };
  }, [scenario, customShockPct, liquidCash, scheduledOutflow30d, expectedInflow30d, avgMonthlyExpense]);

  // 90-Day Net Worth Projection
  const netWorth90dForecast = useMemo(() => {
    const monthlyNet = data.monthIncomeMinor - data.monthExpenseMinor;
    const projectedNetIn90d = data.netWorthMinor + monthlyNet * 3;
    const annualizedSavingsRate = data.monthIncomeMinor > 0 ? Math.round((monthlyNet / data.monthIncomeMinor) * 100) : 0;
    return {
      projectedNetIn90d,
      monthlyNet,
      annualizedSavingsRate,
    };
  }, [data]);

  // Tax intelligence & comparison
  const taxIntelligence = useMemo(() => {
    // Annualize current month's income
    const annualSalaryMinor = (data.monthIncomeMinor || 10000000) * 12;
    const annualDeductionsMinor = 15000000; // standard benchmark assumption
    const comparison = compareTaxRegimes(
      { salaryIncomeMinor: annualSalaryMinor, businessNetProfitMinor: 0, otherIncomeMinor: 0, stcgEquityMinor: 0, ltcgEquityMinor: 0 },
      {
        isSalaried: true,
        section80cMinor: annualDeductionsMinor,
        section80dSelfMinor: 2500000,
        section80dParentsMinor: 0,
        section80ccd1bMinor: 5000000,
        section24bMinor: 0,
        section80ttaMinor: 1000000,
        hraExemptionMinor: 0,
        otherDeductionsMinor: 0,
      },
    );

    const refYear = Number(data.referenceDate.slice(0, 4)) || new Date().getFullYear();
    const annualTax = comparison.recommendedRegime === 'new' ? comparison.newRegime.totalTaxLiabilityMinor : comparison.oldRegime.totalTaxLiabilityMinor;
    const schedule = computeAdvanceTaxSchedule(annualTax, refYear, data.referenceDate);
    const nextInstallment = schedule.find((s) => s.status !== 'paid') || schedule[schedule.length - 1];

    return {
      comparison,
      nextInstallment,
      annualTax,
    };
  }, [data.monthIncomeMinor, data.referenceDate]);

  // Macro Notices Builder
  const compiledNotices = useMemo(() => {
    const list: MacroNotice[] = [];

    // 1. Bank Safety Floor Breaches
    for (const bank of data.banks) {
      if (bank.minBalanceMinor > 0 && bank.currentBalanceMinor < bank.minBalanceMinor) {
        const shortfall = bank.minBalanceMinor - bank.currentBalanceMinor;
        list.push({
          id: `notice-bank-${bank.id}`,
          category: 'urgent',
          severity: 'urgent',
          title: `${bank.name} below safety floor`,
          subtitle: `Balance is ${formatINR(bank.currentBalanceMinor)}, which is ${formatINR(shortfall)} below the ₹${Math.round(bank.minBalanceMinor / 100).toLocaleString('en-IN')} minimum threshold.`,
          amountMinor: shortfall,
          actionLabel: 'Transfer Funds',
          actionTab: 'money',
        });
      }
    }

    // 2. High Credit Card Utilization or Overdue Bills
    for (const card of data.cards) {
      const cy = card.cardCycle;
      if (cy) {
        if (cy.isBillOverdue) {
          list.push({
            id: `notice-card-overdue-${card.id}`,
            category: 'urgent',
            severity: 'urgent',
            title: `${card.name} payment is overdue!`,
            subtitle: `Bill of ${formatINR(cy.statementDueMinor)} was due on ${cy.nextDueDate}. Pay immediately to prevent finance charges (up to 42% APR).`,
            amountMinor: cy.statementDueMinor,
            dueDate: cy.nextDueDate,
            actionLabel: 'Pay Card Bill',
            actionTab: 'money',
          });
        } else if (cy.utilizationPct >= 35) {
          list.push({
            id: `notice-card-util-${card.id}`,
            category: 'urgent',
            severity: 'warning',
            title: `High credit utilization on ${card.name} (${cy.utilizationPct}%)`,
            subtitle: `Outstanding is ${formatINR(cy.totalOutstandingMinor)} against credit limit. Utilizing >30% negatively impacts your CIBIL score.`,
            amountMinor: cy.totalOutstandingMinor,
            actionLabel: 'Review Card',
            actionTab: 'money',
          });
        }
      }
    }

    // 3. Indian Advance Tax Deadline Notice
    if (taxIntelligence.nextInstallment) {
      const inst = taxIntelligence.nextInstallment;
      const isUrgent = inst.status === 'overdue' || inst.status === 'upcoming';
      list.push({
        id: `notice-advance-tax-${inst.quarter}`,
        category: 'tax',
        severity: inst.status === 'overdue' ? 'urgent' : isUrgent ? 'warning' : 'info',
        title: `Advance Tax ${inst.quarter} due ${inst.dueDate}`,
        subtitle: `Mandatory ${inst.cumulativePct}% installment (~${formatINR(inst.installmentTargetMinor)}) status is ${inst.status}. Avoid Section 234B/C interest penalties.`,
        amountMinor: inst.installmentTargetMinor,
        dueDate: inst.dueDate,
        actionLabel: 'Open CA Tax Pack',
        actionTab: 'reports',
      });
    }

    // 4. Tax Regime Recommendation Notice
    if (taxIntelligence.comparison.savingsMinor > 0) {
      list.push({
        id: 'notice-tax-regime-rec',
        category: 'tax',
        severity: 'info',
        title: `${taxIntelligence.comparison.recommendedRegime === 'new' ? 'New' : 'Old'} Tax Regime saves ${formatINR(taxIntelligence.comparison.savingsMinor)}`,
        subtitle: taxIntelligence.comparison.summaryText,
        amountMinor: taxIntelligence.comparison.savingsMinor,
        actionLabel: 'Compare Tax Regimes',
        actionTab: 'reports',
      });
    }

    // 5. Overdue Udhar / Personal Dues Notice
    if (data.totalNeedMinor > 0) {
      list.push({
        id: 'notice-overdue-dues',
        category: 'urgent',
        severity: 'warning',
        title: `${formatINR(data.totalNeedMinor)} pending receivables from people`,
        subtitle: 'You have outstanding lendings or Udhar to collect from contacts. Send WhatsApp reminders to expedite recovery.',
        amountMinor: data.totalNeedMinor,
        actionLabel: 'View Udhar Ledger',
        actionTab: 'loans_dues',
      });
    }

    // 6. Subscription Leak / Price Hike Notice
    if (subscriptions.length > 0) {
      const totalSubAnnual = subscriptions.reduce((sum, s) => sum + s.latestAmountMinor * 12, 0);
      list.push({
        id: 'notice-subscription-leaks',
        category: 'cashflow',
        severity: 'info',
        title: `${subscriptions.length} recurring subscriptions detected (~${formatINR(totalSubAnnual)}/yr)`,
        subtitle: `Includes recurring charges like ${subscriptions.slice(0, 3).map((s) => s.title).join(', ')}. Review for silent price hikes or unused accounts.`,
        amountMinor: totalSubAnnual,
        actionLabel: 'Review Recurring Bills',
        actionTab: 'money',
      });
    }

    // 7. Idle Cash Allocation Notice
    const safetyBuffer3Mo = avgMonthlyExpense * 3;
    if (liquidCash > safetyBuffer3Mo * 1.5) {
      const surplus = liquidCash - safetyBuffer3Mo;
      const extraYieldAnnual = Math.round(surplus * 0.0415); // +4.15% extra yield in liquid fund vs 2.75% savings
      list.push({
        id: 'notice-idle-cash',
        category: 'cashflow',
        severity: 'positive',
        title: `Surplus idle cash: ${formatINR(surplus)} above 3-month buffer`,
        subtitle: `Moving excess balance beyond your emergency cushion into an Auto-Sweep FD or Liquid Debt Fund can yield an extra ~${formatINR(extraYieldAnnual)}/year in passive gains.`,
        amountMinor: extraYieldAnnual,
        actionLabel: 'Explore Liquid Yield',
        actionTab: 'money',
      });
    }

    return list.filter((n) => !dismissedNoticeIds.has(n.id));
  }, [data, taxIntelligence, subscriptions, liquidCash, avgMonthlyExpense, dismissedNoticeIds]);

  const filteredNotices = useMemo(() => {
    if (noticeCategory === 'all') return compiledNotices;
    return compiledNotices.filter((n) => n.category === noticeCategory);
  }, [compiledNotices, noticeCategory]);

  const urgentNoticesCount = compiledNotices.filter((n) => n.severity === 'urgent').length;
  const taxNoticesCount = compiledNotices.filter((n) => n.category === 'tax').length;
  const cashflowNoticesCount = compiledNotices.filter((n) => n.category === 'cashflow').length;

  const handleDismissNotice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedNoticeIds((prev) => new Set([...prev, id]));
  };

  // 50/30/20 Budget Analysis
  const budgetBreakdown503020 = useMemo(() => {
    const totalExp = data.monthExpenseMinor || 1;
    // Categorize top spend
    let needsExp = 0;
    let wantsExp = 0;

    for (const cat of data.monthTopCategories || []) {
      const lower = cat.category.toLowerCase();
      if (/rent|utility|utilities|bill|electric|water|gas|grocer|food|grocery|medical|health|hospital|emi|loan|insurance|fuel|travel/i.test(lower)) {
        needsExp += cat.amountMinor;
      } else {
        wantsExp += cat.amountMinor;
      }
    }

    // Default distribution if categories are unassigned
    if (needsExp === 0 && wantsExp === 0) {
      needsExp = Math.round(totalExp * 0.6);
      wantsExp = Math.round(totalExp * 0.4);
    }

    const needsPct = Math.round((needsExp / totalExp) * 100);
    const wantsPct = Math.round((wantsExp / totalExp) * 100);
    const monthlyNet = data.monthIncomeMinor - data.monthExpenseMinor;
    const savingsPct = data.monthIncomeMinor > 0 ? Math.max(0, Math.round((monthlyNet / data.monthIncomeMinor) * 100)) : 0;

    return {
      needsExp,
      wantsExp,
      needsPct,
      wantsPct,
      savingsPct,
      isWantsHigh: wantsPct > 35,
      isSavingsLow: savingsPct < 15,
    };
  }, [data]);

  return (
    <Card className="p-5 sm:p-6 border-[#EAE5DC] bg-white overflow-hidden relative h-full flex flex-col justify-between">
      {/* Billboard Command Deck Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#EAE5DC]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#111318] text-[#E5C158] shadow-2xs">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-[#111318] tracking-tight">
                  30-Day Stress-Test Simulator &amp; Macro Radar
                </h2>
              </div>
              <p className="text-xs text-[#52504C]">
                Predictive cashflow stress-testing, advance tax schedule, liquidity runway, and debt payoff blueprints.
              </p>
            </div>
          </div>
        </div>

        {/* Global HUD Badges */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge
            className={
              (briefing?.healthScore ?? 80) >= 80
                ? 'bg-emerald-50 text-[#059669] border-emerald-200 font-mono-data'
                : (briefing?.healthScore ?? 80) >= 60
                  ? 'bg-amber-50 text-[#9A7B2C] border-amber-200 font-mono-data'
                  : 'bg-rose-50 text-[#E11D48] border-rose-200 font-mono-data'
            }
          >
            Health: {briefing?.healthScore ?? 85}/100
          </Badge>
          <Badge className="bg-[#F3EFEA] text-[#111318] border-[#EAE5DC] font-mono-data">
            Runway: {briefing?.emergencyRunwayMonths ?? 4.8} mo
          </Badge>
        </div>
      </div>

      {/* Billboard Navigation Tabs */}
      <div className="flex items-center justify-between gap-3 pt-3 pb-3 border-b border-[#EAE5DC] flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('predictions')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'predictions'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-[#E5C158]" />
            Runway &amp; Stress Simulator
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notices')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer relative ${
              activeTab === 'notices'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-[#C59B27]" />
            Macro Notices
            {compiledNotices.length > 0 && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono-data font-bold ${
                  urgentNoticesCount > 0 ? 'bg-[#E11D48] text-white' : 'bg-[#111318] text-[#FAF8F5]'
                }`}
              >
                {compiledNotices.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('strategies')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'strategies'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-[#059669]" />
            Strategic Blueprints
          </button>
        </div>

        <div className="text-[11px] text-[#858078] font-mono-data">
          Scope: <strong className="text-[#111318] font-semibold uppercase">{scopeFilter}</strong>
        </div>
      </div>

      {/* TAB 1: BILLBOARD PREDICTIONS & RUNWAY */}
      {activeTab === 'predictions' && (
        <div className="pt-4 space-y-4 animate-panel-in">
          {/* Scenario Stress-Test Selector + Interactive Burn Shock Slider */}
          <div className="bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#C59B27] shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-[#111318]">Scenario Stress-Tester:</span>
                  <span className="ml-1 text-xs text-[#52504C] hidden sm:inline">Simulate liquidity shocks &amp; burn adjustments</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setScenario('baseline');
                    setCustomShockPct(0);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    scenario === 'baseline'
                      ? 'bg-[#111318] text-[#FAF8F5]'
                      : 'bg-white border border-[#EAE5DC] text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  Standard Run-Rate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScenario('stress');
                    setCustomShockPct(0);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    scenario === 'stress'
                      ? 'bg-[#C59B27] text-[#111318]'
                      : 'bg-white border border-[#EAE5DC] text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  Stress Shock (+25% Outflow)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScenario('aggressive');
                    setCustomShockPct(0);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    scenario === 'aggressive'
                      ? 'bg-[#059669] text-white'
                      : 'bg-white border border-[#EAE5DC] text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  Lean Wealth (+15% Save)
                </button>
              </div>
            </div>

            {/* Interactive Outflow Shock Fine-Tuning Slider */}
            <div className="pt-2 border-t border-[#EAE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <label htmlFor="burn-shock-slider" className="text-[#52504C] font-medium flex items-center gap-2">
                <span>Custom Burn / Outflow Shock Modifier:</span>
                <strong className="font-mono-data text-[#111318] bg-white border border-[#EAE5DC] px-2 py-0.5 rounded">
                  {customShockPct >= 0 ? `+${customShockPct}%` : `${customShockPct}%`}
                </strong>
              </label>
              <div className="flex items-center gap-2 sm:w-64">
                <span className="text-[10px] font-mono-data text-[#059669]">-20%</span>
                <input
                  id="burn-shock-slider"
                  type="range"
                  min={-20}
                  max={50}
                  step={5}
                  value={customShockPct}
                  onChange={(e) => setCustomShockPct(Number(e.target.value))}
                  className="w-full accent-[#111318] cursor-pointer h-1.5 bg-[#EAE5DC] rounded-lg"
                />
                <span className="text-[10px] font-mono-data text-[#E11D48]">+50%</span>
              </div>
            </div>
          </div>

          {/* 30-Day Liquidity Trajectory Cockpit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[#52504C] text-xs font-medium">
                <span>Liquid Cash</span>
                <Landmark className="h-3.5 w-3.5 text-[#111318]" />
              </div>
              <div className="text-xl font-bold text-[#111318] font-mono-data tabular-nums">
                {formatINR(liquidCash, { compact: true })}
              </div>
              <div className="text-[11px] text-[#858078]">Active banks &amp; wallets</div>
            </div>

            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[#52504C] text-xs font-medium">
                <span>30d Inflow</span>
                <ArrowDownLeft className="h-3.5 w-3.5 text-[#059669]" />
              </div>
              <div className="text-xl font-bold text-[#059669] font-mono-data tabular-nums">
                +{formatINR(scenarioCalculations.inflowMinor, { compact: true })}
              </div>
              <div className="text-[11px] text-[#858078]">Salary &amp; receivables</div>
            </div>

            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[#52504C] text-xs font-medium">
                <span>30d Outflow</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#E11D48]" />
              </div>
              <div className="text-xl font-bold text-[#E11D48] font-mono-data tabular-nums">
                -{formatINR(scenarioCalculations.outflowMinor, { compact: true })}
              </div>
              <div className="text-[11px] text-[#858078]">Cards, EMIs &amp; bills</div>
            </div>

            <div
              className={`rounded-xl border p-3.5 space-y-1 ${
                scenarioCalculations.projectedBalanceMinor >= 0
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-rose-200 bg-rose-50/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium">
                <span className={scenarioCalculations.projectedBalanceMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'}>
                  Day-30 Balance
                </span>
                <Sparkles className="h-3.5 w-3.5 text-[#C59B27]" />
              </div>
              <div
                className={`text-xl font-bold font-mono-data tabular-nums ${
                  scenarioCalculations.projectedBalanceMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
                }`}
              >
                {formatINR(scenarioCalculations.projectedBalanceMinor, { compact: true })}
              </div>
              <div className="text-[11px] text-[#52504C]">
                Runway: <strong className="font-semibold text-[#111318] font-mono-data">{scenarioCalculations.runwayMonths} mo</strong>
              </div>
            </div>
          </div>

          {/* Scenario Narrative & 90-Day Trajectory */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono-data font-bold uppercase tracking-wider text-[#111318] flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-[#C59B27]" /> Emergency Runway Health Radar
                </span>
                <span
                  className={`text-[11px] font-mono-data font-semibold px-2 py-0.5 rounded-md border ${
                    scenarioCalculations.runwayMonths >= 6
                      ? 'border-emerald-200 bg-emerald-50 text-[#059669]'
                      : scenarioCalculations.runwayMonths >= 3
                        ? 'border-amber-200 bg-amber-50 text-[#9A7B2C]'
                        : 'border-rose-200 bg-rose-50 text-[#E11D48]'
                  }`}
                >
                  {scenarioCalculations.runwayMonths >= 6 ? 'Robust Shield (6+ mo)' : scenarioCalculations.runwayMonths >= 3 ? 'Moderate Buffer' : 'Critical Buffer (<3 mo)'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[#52504C]">
                  <span>Current Liquid Cover:</span>
                  <span className="font-semibold font-mono-data text-[#111318]">{scenarioCalculations.runwayMonths} months of burn</span>
                </div>
                <MeterBar
                  pct={Math.min(100, Math.round((scenarioCalculations.runwayMonths / 6) * 100))}
                  colorHex={scenarioCalculations.runwayMonths >= 6 ? '#059669' : scenarioCalculations.runwayMonths >= 3 ? '#C59B27' : '#E11D48'}
                  heightClass="h-2"
                />
                <div className="flex justify-between text-[10px] font-mono-data text-[#858078]">
                  <span>0 mo (Risk)</span>
                  <span>3 mo (Floor)</span>
                  <span>6+ mo (Sovereign)</span>
                </div>
              </div>
              <p className="text-xs text-[#52504C] pt-1 leading-relaxed">
                {scenarioCalculations.statusNote}
              </p>
            </div>

            <div className="rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono-data font-bold uppercase tracking-wider text-[#111318] flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-[#059669]" /> 90-Day Net Worth Forecast
                </span>
                <span className="text-[11px] font-mono-data font-semibold text-[#111318] bg-[#F3EFEA] border border-[#EAE5DC] px-2 py-0.5 rounded-md">
                  End of Quarter Outlook
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-xs text-[#52504C]">Projected Q-End Net Worth</div>
                  <div className="text-xl font-bold text-[#111318] font-mono-data tabular-nums">
                    {formatINR(netWorth90dForecast.projectedNetIn90d)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#52504C]">Monthly Net Trajectory</div>
                  <div
                    className={`text-sm font-bold font-mono-data tabular-nums ${
                      netWorth90dForecast.monthlyNet >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
                    }`}
                  >
                    {formatINR(netWorth90dForecast.monthlyNet, { signed: true })}/mo
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-[#EAE5DC] flex items-center justify-between text-xs text-[#52504C]">
                <span>Annualized Savings Rate:</span>
                <span className="font-semibold font-mono-data text-[#059669]">{netWorth90dForecast.annualizedSavingsRate}% of gross income</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MACRO NOTICES & ALERTS */}
      {activeTab === 'notices' && (
        <div className="pt-4 space-y-3 animate-panel-in">
          {/* Category Filter Pills */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setNoticeCategory('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  noticeCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Notices ({compiledNotices.length})
              </button>
              <button
                type="button"
                onClick={() => setNoticeCategory('urgent')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  noticeCategory === 'urgent'
                    ? 'bg-red-700 text-white'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                Critical & Urgent ({urgentNoticesCount})
              </button>
              <button
                type="button"
                onClick={() => setNoticeCategory('tax')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  noticeCategory === 'tax'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <Calendar className="h-3 w-3" />
                Tax & Regulatory ({taxNoticesCount})
              </button>
              <button
                type="button"
                onClick={() => setNoticeCategory('cashflow')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  noticeCategory === 'cashflow'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                <Coins className="h-3 w-3" />
                Cashflow & Leaks ({cashflowNoticesCount})
              </button>
            </div>

            {dismissedNoticeIds.size > 0 && (
              <button
                type="button"
                onClick={() => setDismissedNoticeIds(new Set())}
                className="text-xs text-slate-500 hover:text-slate-800 underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Reset {dismissedNoticeIds.size} dismissed
              </button>
            )}
          </div>

          {/* Notices Grid */}
          <div className="space-y-2.5">
            {filteredNotices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <div className="text-sm font-semibold text-slate-900">All clear! No pending notices in this category.</div>
                <p className="text-xs text-slate-500">Your accounts, tax installments, and dues are fully synchronized.</p>
              </div>
            ) : (
              filteredNotices.map((n) => {
                const borderClass =
                  n.severity === 'urgent'
                    ? 'border-red-200 bg-red-50/60'
                    : n.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50/60'
                      : n.severity === 'positive'
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-blue-200 bg-blue-50/50';

                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${borderClass}`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            n.severity === 'urgent'
                              ? 'bg-red-600'
                              : n.severity === 'warning'
                                ? 'bg-amber-500'
                                : n.severity === 'positive'
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-600'
                          }`}
                        />
                        <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                        {n.dueDate && (
                          <span className="text-[10px] font-mono-data bg-white/80 border border-slate-200 px-1.5 py-0.2 rounded text-slate-600">
                            Due {n.dueDate}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{n.subtitle}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {n.amountMinor !== undefined && (
                        <span className="text-xs font-bold text-slate-900 tabular-nums">
                          {formatINR(n.amountMinor)}
                        </span>
                      )}
                      {n.actionLabel && n.actionTab && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNavigate(n.actionTab!)}
                          className="text-xs h-7 gap-1"
                        >
                          {n.actionLabel}
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDismissNotice(n.id, e)}
                        title="Dismiss notice"
                        className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: STRATEGIC ACTION BLUEPRINTS (NOT CHATBOT PROMPTS!) */}
      {activeTab === 'strategies' && (
        <div className="pt-4 space-y-4 animate-panel-in">
          <div className="text-xs text-slate-500">
            Actionable macro blueprints based on debt-reduction mathematical models, tax regime algorithms, and asset allocation benchmarks:
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Strategy Card 1: Debt Optimizer (Avalanche vs Snowball) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                    <Percent className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-950">Debt Acceleration Payoff Engine</h3>
                    <p className="text-[11px] text-slate-500">Avalanche saves maximal interest; Snowball builds fast momentum</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('loans_dues')}
                  className="text-xs h-7"
                >
                  Loans & Cards
                </Button>
              </div>

              {/* Strategy Mode & Extra Monthly Allocator */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                  <button
                    type="button"
                    onClick={() => setDebtStrategy('avalanche')}
                    className={`rounded-md px-2 py-0.8 font-medium cursor-pointer ${
                      debtStrategy === 'avalanche' ? 'bg-white shadow-2xs text-slate-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    Avalanche (High APR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtStrategy('snowball')}
                    className={`rounded-md px-2 py-0.8 font-medium cursor-pointer ${
                      debtStrategy === 'snowball' ? 'bg-white shadow-2xs text-slate-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    Snowball (Small Balance)
                  </button>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500 text-[11px]">Extra Pay:</span>
                  {[100000, 250000, 500000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setExtraDebtMonthlyMinor(amt)}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium cursor-pointer ${
                        extraDebtMonthlyMinor === amt
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      +₹{amt / 100000}k
                    </button>
                  ))}
                  {debtLoading && (
                    <RefreshCw className="h-3 w-3 animate-spin text-slate-400 ml-1" />
                  )}
                </div>
              </div>

              {/* Debt Plan Impact Metrics */}
              {debtPlan && (
                <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total Debt</div>
                    <div className="text-sm font-bold text-slate-900 tabular-nums">
                      {formatINR(debtPlan.totalDebtMinor)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Time Saved</div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">
                      {debtPlan.monthsSaved > 0 ? `${debtPlan.monthsSaved} months sooner` : 'Baseline'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">Interest Saved</div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">
                      {debtPlan.interestSavedMinor > 0 ? formatINR(debtPlan.interestSavedMinor) : '₹0'}
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-600 leading-snug">
                Adding {formatINR(extraDebtMonthlyMinor)}/month reduces your debt payoff to {debtPlan?.planMonths ?? 12} months, saving {formatINR(debtPlan?.interestSavedMinor ?? 0)} in compound bank interest.
              </p>
            </div>

            {/* Strategy Card 2: Idle Cash Yield Optimization */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <PiggyBank className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-950">Idle Cash to High-Yield Liquid Fund</h3>
                    <p className="text-[11px] text-slate-500">Safely generate +4.15% alpha over standard savings rates</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('money')}
                  className="text-xs h-7"
                >
                  Accounts Hub
                </Button>
              </div>

              {(() => {
                const safetyBuffer3Mo = avgMonthlyExpense * 3;
                const surplus = Math.max(0, liquidCash - safetyBuffer3Mo);
                const extraYieldAnnual = Math.round(surplus * 0.0415);
                return (
                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] text-emerald-800 uppercase tracking-wide">Safe 3-Mo Buffer</div>
                        <div className="text-sm font-bold text-slate-900 tabular-nums">{formatINR(safetyBuffer3Mo)}</div>
                        <div className="text-[10px] text-slate-500">Retain in primary bank account</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-emerald-800 uppercase tracking-wide">Surplus Idle Balance</div>
                        <div className="text-sm font-bold text-emerald-700 tabular-nums">{formatINR(surplus)}</div>
                        <div className="text-[10px] text-slate-500">Deployable to Liquid Debt / Auto-Sweep</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed">
                      Deploying {formatINR(surplus)} into a Liquid Fund (~6.90% CAGR) generates an additional{' '}
                      <strong className="text-emerald-700 font-semibold">{formatINR(extraYieldAnnual)}/year</strong> with T+1 redemption liquidity.
                    </div>
                    {goalsSummary && (
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1.5 border-t border-emerald-200/60">
                        <span>Free unreserved cash:</span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {formatINR(goalsSummary.freeUnreservedCashMinor)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Strategy Card 3: 50 / 30 / 20 Budget Discipline Rebalancing */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Scale className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-950">50 / 30 / 20 Cashflow Discipline Meter</h3>
                    <p className="text-[11px] text-slate-500">Benchmark against the golden personal finance ratio</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('reports')}
                  className="text-xs h-7"
                >
                  Spend Mix
                </Button>
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Needs (Target ≤ 50%):</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatINR(budgetBreakdown503020.needsExp)} ({budgetBreakdown503020.needsPct}%)
                    </span>
                  </div>
                  <MeterBar
                    pct={budgetBreakdown503020.needsPct}
                    colorHex={budgetBreakdown503020.needsPct > 60 ? '#dc2626' : '#2563eb'}
                    heightClass="h-1.5"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Wants / Discretionary (Target ≤ 30%):</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatINR(budgetBreakdown503020.wantsExp)} ({budgetBreakdown503020.wantsPct}%)
                    </span>
                  </div>
                  <MeterBar
                    pct={budgetBreakdown503020.wantsPct}
                    colorHex={budgetBreakdown503020.wantsPct > 35 ? '#d97706' : '#059669'}
                    heightClass="h-1.5"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Net Savings & Investments (Target ≥ 20%):</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {budgetBreakdown503020.savingsPct}%
                    </span>
                  </div>
                  <MeterBar
                    pct={budgetBreakdown503020.savingsPct}
                    colorHex={budgetBreakdown503020.savingsPct >= 20 ? '#059669' : '#d97706'}
                    heightClass="h-1.5"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                {budgetBreakdown503020.isWantsHigh
                  ? 'Discretionary spending is exceeding the 30% ceiling. Trimming dining & entertainment by 10% re-establishes a 20% savings velocity.'
                  : 'Your spend distribution adheres cleanly to the 50/30/20 guideline, ensuring continuous capital accumulation.'}
              </p>
            </div>

            {/* Strategy Card 4: Net Worth Asset Shield & Liability Balance */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-950">Net Worth Asset & Liability Shield</h3>
                    <p className="text-[11px] text-slate-500">Asset diversification and debt-to-equity ratio</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('reports')}
                  className="text-xs h-7"
                >
                  Balance Sheet
                </Button>
              </div>

              {(() => {
                const totalAssets = data.totalBankMinor + (data.totalInvestmentsMinor ?? 0);
                const totalDebt = data.totalCardDebtMinor + data.totalBorrowedRemainingMinor;
                const debtToAssetPct = totalAssets > 0 ? Math.round((totalDebt / totalAssets) * 100) : 0;
                return (
                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Liquid Bank</div>
                        <div className="text-xs font-bold text-slate-900 tabular-nums">
                          {formatINR(data.totalBankMinor, { compact: true })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Investments</div>
                        <div className="text-xs font-bold text-teal-700 tabular-nums">
                          {formatINR(data.totalInvestmentsMinor ?? 0, { compact: true })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase">Total Debt</div>
                        <div className="text-xs font-bold text-rose-700 tabular-nums">
                          {formatINR(totalDebt, { compact: true })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Debt-to-Asset Ratio:</span>
                      <span className={`font-semibold tabular-nums ${debtToAssetPct > 35 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {debtToAssetPct}% {debtToAssetPct > 35 ? '(Elevated)' : '(Healthy)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Maintain debt below 30% of total assets to ensure borrowing capacity and prevent cashflow vulnerability during market downturns.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
