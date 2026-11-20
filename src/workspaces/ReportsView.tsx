import { useEffect, useMemo, useState } from 'react';
import { api, type DetailedReports, type TaxSummaryPack } from '../lib/api.ts';
import { addMonthsISO, formatINR, todayISO } from '../lib/format.ts';
import { AnimatedTabs } from '../components/ui/Primitives.tsx';
import { type Scope } from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';
import {
  compareTaxRegimes,
  computeAdvanceTaxSchedule,
  type TaxComparisonResult,
} from '../../shared/tax-engine.ts';

// Domain sub-components
import type {
  BankSortOption,
  BudgetModalCategoryState,
  CardSortOption,
  CatSortOption,
  DatePreset,
  DueSortOption,
  LoanSortOption,
  ReportTab,
  ReportsIntelligence,
} from './reports/types.ts';
import { computeReportsIntelligence, safeRupeesToPaise } from './reports/reportsAnalytics.ts';
import { ReportsHeaderToolbar } from './reports/ReportsHeaderToolbar.tsx';
import { ReportsExecutiveKpiStrip } from './reports/ReportsExecutiveKpiStrip.tsx';
import { ReportsHeroWorkstation } from './reports/ReportsHeroWorkstation.tsx';
import { PnlWorkstation } from './reports/PnlWorkstation.tsx';
import { CategoryBudgetsWorkstation } from './reports/CategoryBudgetsWorkstation.tsx';
import { AccountsPortfolioReports } from './reports/AccountsPortfolioReports.tsx';
import { CaTaxPackWorkstation } from './reports/CaTaxPackWorkstation.tsx';
import { CategoryBudgetModal } from './reports/CategoryBudgetModal.tsx';
import { WhatsAppTaxPackModal } from './reports/WhatsAppTaxPackModal.tsx';

export function ReportsView({
  systemLanguage = 'en',
  globalScopeFilter = 'all',
}: {
  systemLanguage?: AppLanguage;
  globalScopeFilter?: Scope | 'all';
}) {
  const dict = UI_STRINGS[systemLanguage];
  const today = todayISO();
  const [fromDate, setFromDate] = useState(`${addMonthsISO(today, -5).slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(today);
  const [scope, setScope] = useState<Scope | 'all'>(globalScopeFilter);
  const [reportTab, setReportTab] = useState<ReportTab>('pnl');
  const [data, setData] = useState<DetailedReports | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setScope(globalScopeFilter);
  }, [globalScopeFilter]);

  // Sorting states
  const [catSort, setCatSort] = useState<CatSortOption>('total_desc');
  const [cardSort, setCardSort] = useState<CardSortOption>('due_desc');
  const [bankSort, setBankSort] = useState<BankSortOption>('balance_desc');
  const [loanSort, setLoanSort] = useState<LoanSortOption>('remaining_desc');
  const [dueSort, setDueSort] = useState<DueSortOption>('remaining_desc');

  // Tax Pack & CA States
  const defaultFy = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const [fyStartYear, setFyStartYear] = useState<number>(defaultFy);
  const [taxPack, setTaxPack] = useState<TaxSummaryPack | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);

  // Interactive Tax Optimizer Inputs (in Rupees for direct editing)
  const [isSalaried, setIsSalaried] = useState(true);
  const [isSeniorCitizen, setIsSeniorCitizen] = useState(false);
  const [isParentsSenior, setIsParentsSenior] = useState(false);
  const [salaryOverrideRupees, setSalaryOverrideRupees] = useState('');
  const [sec80cRupees, setSec80cRupees] = useState('');
  const [sec80dSelfRupees, setSec80dSelfRupees] = useState('');
  const [sec80dParentsRupees, setSec80dParentsRupees] = useState('');
  const [sec80ccd1bRupees, setSec80ccd1bRupees] = useState('');
  const [sec24bRupees, setSec24bRupees] = useState('');
  const [sec80ttaRupees, setSec80ttaRupees] = useState('');
  const [hraRupees, setHraRupees] = useState('');
  const [stcgEquityRupees, setStcgEquityRupees] = useState('');
  const [ltcgEquityRupees, setLtcgEquityRupees] = useState('');

  // WhatsApp CA Export Modal & Feedback
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Category Budget Modal State
  const [budgetModalCategory, setBudgetModalCategory] = useState<BudgetModalCategoryState | null>(null);
  const [budgetDraftRupees, setBudgetDraftRupees] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const applyPreset = (preset: DatePreset) => {
    const now = todayISO();
    const yr = Number(now.slice(0, 4));
    const mo = Number(now.slice(5, 7));
    setToDate(now);
    if (preset === 'this_month') setFromDate(`${now.slice(0, 7)}-01`);
    else if (preset === '3m') setFromDate(`${addMonthsISO(now, -2).slice(0, 7)}-01`);
    else if (preset === '6m') setFromDate(`${addMonthsISO(now, -5).slice(0, 7)}-01`);
    else if (preset === 'fy') setFromDate(`${mo >= 4 ? yr : yr - 1}-04-01`);
    else setFromDate(`${yr}-01-01`);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getReports({ fromDate, toDate, scope: scope === 'all' ? undefined : scope })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, scope]);

  const refreshReports = () => {
    setLoading(true);
    api
      .getReports({ fromDate, toDate, scope: scope === 'all' ? undefined : scope })
      .then(setData)
      .finally(() => setLoading(false));
  };

  const openBudgetModal = (targetScope: Scope, targetCategory: string) => {
    const existing = (data?.categoryBudgets ?? []).find(
      (b) => b.scope === targetScope && b.category.toLowerCase() === targetCategory.toLowerCase(),
    );
    setBudgetModalCategory({
      id: existing?.id,
      scope: targetScope,
      category: targetCategory,
      currentLimitMinor: existing?.monthlyLimitMinor,
    });
    setBudgetDraftRupees(existing ? String(existing.monthlyLimitMinor / 100) : '5000');
  };

  const handleSaveCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetModalCategory) return;
    setSavingBudget(true);
    try {
      await api.upsertCategoryBudget({
        scope: budgetModalCategory.scope,
        category: budgetModalCategory.category,
        monthlyLimitMinor: safeRupeesToPaise(budgetDraftRupees),
      });
      setBudgetModalCategory(null);
      refreshReports();
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDeleteCategoryBudget = async () => {
    if (!budgetModalCategory?.id) return;
    setSavingBudget(true);
    try {
      await api.deleteCategoryBudget(budgetModalCategory.id);
      setBudgetModalCategory(null);
      refreshReports();
    } finally {
      setSavingBudget(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setTaxLoading(true);
    api
      .getTaxSummaryPack(fyStartYear)
      .then((res) => {
        if (!cancelled) {
          setTaxPack(res);
          // Auto-prefill deductions if not manually changed
          setSec80cRupees((prev) => {
            if (prev !== '') return prev;
            const auto80cMinor = (res.deductionEstimates?.estimated80cExpensesMinor ?? 0) + res.loanPrincipalPaidMinor;
            return auto80cMinor > 0 ? String(Math.round(auto80cMinor / 100)) : '150000';
          });
          setSec80dSelfRupees((prev) => {
            if (prev !== '') return prev;
            const auto80dMinor = res.deductionEstimates?.estimated80dExpensesMinor ?? 0;
            return auto80dMinor > 0 ? String(Math.round(auto80dMinor / 100)) : '25000';
          });
          setSec80dParentsRupees((prev) => (prev === '' ? '25000' : prev));
          setSec80ccd1bRupees((prev) => (prev === '' ? '50000' : prev));
          setSec24bRupees((prev) => {
            if (prev !== '') return prev;
            return res.loanInterestPaidMinor > 0 ? String(Math.round(res.loanInterestPaidMinor / 100)) : '0';
          });
          setSec80ttaRupees((prev) => {
            if (prev !== '') return prev;
            const autoIntMinor = res.deductionEstimates?.estimatedOtherInterestMinor ?? 0;
            return autoIntMinor > 0 ? String(Math.round(autoIntMinor / 100)) : '10000';
          });
        }
      })
      .finally(() => {
        if (!cancelled) setTaxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fyStartYear]);

  // Derived Cashflow Intelligence & Financial Runway
  const intelligence: ReportsIntelligence | null = useMemo(
    () => computeReportsIntelligence(data),
    [data],
  );

  // Real-time Tax Comparison Calculation
  const taxComparison: TaxComparisonResult | null = useMemo(() => {
    if (!taxPack) return null;

    const salaryIncomeMinor =
      salaryOverrideRupees.trim() !== ''
        ? safeRupeesToPaise(salaryOverrideRupees)
        : (taxPack.scopePnl?.personal?.incomeMinor ?? 0);

    const businessNetProfitMinor = Math.max(0, taxPack.scopePnl?.business?.netMinor ?? 0);
    const otherIncomeMinor = safeRupeesToPaise(sec80ttaRupees);
    const stcgEquityMinor = safeRupeesToPaise(stcgEquityRupees);
    const ltcgEquityMinor = safeRupeesToPaise(ltcgEquityRupees);

    const incomeInputs = {
      salaryIncomeMinor,
      businessNetProfitMinor,
      otherIncomeMinor,
      stcgEquityMinor,
      ltcgEquityMinor,
    };

    const deductionInputs = {
      isSalaried,
      isSeniorCitizen,
      isParentsSenior,
      section80cMinor: safeRupeesToPaise(sec80cRupees),
      section80dSelfMinor: safeRupeesToPaise(sec80dSelfRupees),
      section80dParentsMinor: safeRupeesToPaise(sec80dParentsRupees),
      section80ccd1bMinor: safeRupeesToPaise(sec80ccd1bRupees),
      section24bMinor: safeRupeesToPaise(sec24bRupees),
      section80ttaMinor: safeRupeesToPaise(sec80ttaRupees),
      hraExemptionMinor: safeRupeesToPaise(hraRupees),
    };

    return compareTaxRegimes(incomeInputs, deductionInputs);
  }, [
    taxPack,
    salaryOverrideRupees,
    isSalaried,
    isSeniorCitizen,
    isParentsSenior,
    sec80cRupees,
    sec80dSelfRupees,
    sec80dParentsRupees,
    sec80ccd1bRupees,
    sec24bRupees,
    sec80ttaRupees,
    hraRupees,
    stcgEquityRupees,
    ltcgEquityRupees,
  ]);

  // Advance Tax Installment Schedule
  const advanceTaxSchedule = useMemo(() => {
    if (!taxComparison) return [];
    const recommended = taxComparison.recommendedRegime === 'old' ? taxComparison.oldRegime : taxComparison.newRegime;
    return computeAdvanceTaxSchedule(recommended.totalTaxLiabilityMinor, fyStartYear, today);
  }, [taxComparison, fyStartYear, today]);

  // Formatted WhatsApp Summary for CA
  const whatsAppSummaryText = useMemo(() => {
    if (!taxPack || !taxComparison) return '';
    const recommended = taxComparison.recommendedRegime === 'old' ? taxComparison.oldRegime : taxComparison.newRegime;
    const lines = [
      `*FINANCIAL YEAR DOSSIER & TAX SUMMARY (${taxPack.fiscalYearLabel})*`,
      `_Period: ${taxPack.fromDate} to ${taxPack.toDate}_`,
      '',
      `💼 *BUSINESS SCOPE P&L:*`,
      `• Gross Revenue: ${formatINR(taxPack.scopePnl?.business?.incomeMinor ?? 0)}`,
      `• Deductible Expenses: ${formatINR(taxPack.scopePnl?.business?.expenseMinor ?? 0)}`,
      `• Net Business Profit: ${formatINR(taxPack.scopePnl?.business?.netMinor ?? 0, { signed: true })}`,
      '',
      `👤 *PERSONAL CASHFLOW:*`,
      `• Inflow: ${formatINR(taxPack.scopePnl?.personal?.incomeMinor ?? 0)}`,
      `• Outflow: ${formatINR(taxPack.scopePnl?.personal?.expenseMinor ?? 0)}`,
      '',
      `⚖️ *INCOME TAX ESTIMATE (FY 2024-25+):*`,
      `• Recommended Choice: ${taxComparison.recommendedRegime === 'new' ? 'New Regime (Sec 115BAC)' : 'Old Regime'}`,
      `• Estimated Net Tax: ${formatINR(recommended.totalTaxLiabilityMinor)} (incl. 4% Cess)`,
      `• Effective Tax Rate: ${recommended.effectiveTaxRatePct}%`,
      taxComparison.savingsMinor > 0 ? `• Tax Saved vs Alternative: ${formatINR(taxComparison.savingsMinor)}` : '',
      '',
      `📑 *KEY DEDUCTIBLES & INTEREST:*`,
      `• Home Loan Interest (Sec 24b): ${formatINR(taxPack.loanInterestPaidMinor)}`,
      `• Home Loan Principal (Sec 80C): ${formatINR(taxPack.loanPrincipalPaidMinor)}`,
      `• Total Portfolio Invested: ${formatINR(taxPack.totalInvestedMinor)}`,
      '',
      `🏦 *BANK ACCOUNTS (ITR SCHEDULE):*`,
      ...(taxPack.bankAccounts ?? []).map(
        (b) => `• ${b.name} (${b.institution || 'Bank'}${b.last4 ? ` · *${b.last4}` : ''}): ${formatINR(b.currentBalanceMinor)}`,
      ),
      '',
      `_Compiled via Personal Ledger_`,
    ].filter(Boolean);
    return lines.join('\n');
  }, [taxPack, taxComparison]);

  const copyWhatsAppSummary = () => {
    navigator.clipboard.writeText(whatsAppSummaryText);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 3000);
  };

  const exportUrl = `/api/reports/export.csv?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(
    toDate,
  )}${scope !== 'all' ? `&scope=${scope}` : ''}`;
  const exportTaxPackUrl = `/api/reports/tax-pack/export.csv?fyStartYear=${fyStartYear}`;

  const totalInflow = data?.monthlyCashflow.reduce((s, m) => s + m.incomeMinor, 0) ?? 0;
  const totalOutflow = data?.monthlyCashflow.reduce((s, m) => s + m.expenseMinor, 0) ?? 0;

  return (
    <div className="space-y-4 animate-panel-in">
      {/* 1. Header Toolbar */}
      <ReportsHeaderToolbar
        fromDate={fromDate}
        toDate={toDate}
        scope={scope}
        systemLanguage={systemLanguage}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onScopeChange={setScope}
        onApplyPreset={applyPreset}
        exportUrl={exportUrl}
      />

      {/* 2. Executive KPI Strip */}
      <ReportsExecutiveKpiStrip
        intelligence={intelligence}
        taxComparison={taxComparison}
        totalInflowMinor={totalInflow}
        totalOutflowMinor={totalOutflow}
      />

      {/* 3. Hero Workstation (3D Audit Dossier Card + Interactive P&L / Scope / Tax Charts) */}
      <ReportsHeroWorkstation
        data={data}
        intelligence={intelligence}
        taxComparison={taxComparison}
        fromDate={fromDate}
        toDate={toDate}
        exportUrl={exportUrl}
        exportTaxPackUrl={exportTaxPackUrl}
        onSelectTab={setReportTab}
        onOpenWhatsAppModal={() => setShowWhatsAppModal(true)}
      />

      {/* 4. Workspace Tabs */}
      <AnimatedTabs
        variant="subtle"
        value={reportTab}
        onChange={setReportTab}
        items={[
          { id: 'pnl', label: dict.reports.tabPnl, accentHex: '#111318' },
          { id: 'categories', label: dict.reports.tabCategories, accentHex: '#C59B27' },
          { id: 'cards', label: dict.reports.tabCards, accentHex: '#111318' },
          { id: 'banks', label: dict.reports.tabBanks, accentHex: '#059669' },
          { id: 'loans', label: dict.reports.tabLoans, accentHex: '#C59B27' },
          { id: 'dues', label: dict.reports.tabDues, accentHex: '#E11D48' },
          { id: 'tax_pack', label: 'CA & Tax Pack', accentHex: '#C59B27' },
        ]}
      />

      {loading || !data ? (
        <div className="rounded-2xl border border-[#E6E1D6] bg-white p-8 text-center text-sm text-[#6B7280] shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
          Calculating ledger reports...
        </div>
      ) : (
        <>
          {/* TAB 1: P&L WORKSTATION */}
          {reportTab === 'pnl' && <PnlWorkstation data={data} />}

          {/* TAB 2: CATEGORIES & BUDGET VARIANCE WORKSTATION */}
          {reportTab === 'categories' && (
            <CategoryBudgetsWorkstation
              data={data}
              catSort={catSort}
              onCatSortChange={setCatSort}
              onOpenBudgetModal={openBudgetModal}
              today={today}
            />
          )}

          {/* TABS 3-6: ACCOUNTS & PORTFOLIO REPORTS */}
          {(reportTab === 'cards' || reportTab === 'banks' || reportTab === 'loans' || reportTab === 'dues') && (
            <AccountsPortfolioReports
              reportTab={reportTab}
              data={data}
              cardSort={cardSort}
              bankSort={bankSort}
              loanSort={loanSort}
              dueSort={dueSort}
              onCardSortChange={setCardSort}
              onBankSortChange={setBankSort}
              onLoanSortChange={setLoanSort}
              onDueSortChange={setDueSort}
            />
          )}

          {/* TAB 7: CA & TAX PACK WORKSTATION */}
          {reportTab === 'tax_pack' && (
            <CaTaxPackWorkstation
              fyStartYear={fyStartYear}
              defaultFy={defaultFy}
              taxPack={taxPack}
              taxComparison={taxComparison}
              taxLoading={taxLoading}
              exportTaxPackUrl={exportTaxPackUrl}
              isSalaried={isSalaried}
              isSeniorCitizen={isSeniorCitizen}
              isParentsSenior={isParentsSenior}
              salaryOverrideRupees={salaryOverrideRupees}
              sec80cRupees={sec80cRupees}
              sec80dSelfRupees={sec80dSelfRupees}
              sec80dParentsRupees={sec80dParentsRupees}
              sec80ccd1bRupees={sec80ccd1bRupees}
              sec24bRupees={sec24bRupees}
              sec80ttaRupees={sec80ttaRupees}
              hraRupees={hraRupees}
              stcgEquityRupees={stcgEquityRupees}
              ltcgEquityRupees={ltcgEquityRupees}
              advanceTaxSchedule={advanceTaxSchedule}
              onFyChange={setFyStartYear}
              onOpenWhatsAppModal={() => setShowWhatsAppModal(true)}
              onSalariedChange={setIsSalaried}
              onSeniorCitizenChange={setIsSeniorCitizen}
              onParentsSeniorChange={setIsParentsSenior}
              onSalaryOverrideChange={setSalaryOverrideRupees}
              onSec80cChange={setSec80cRupees}
              onSec80dSelfChange={setSec80dSelfRupees}
              onSec80dParentsChange={setSec80dParentsRupees}
              onSec80ccd1bChange={setSec80ccd1bRupees}
              onSec24bChange={setSec24bRupees}
              onSec80ttaChange={setSec80ttaRupees}
              onHraChange={setHraRupees}
              onStcgEquityChange={setStcgEquityRupees}
              onLtcgEquityChange={setLtcgEquityRupees}
            />
          )}
        </>
      )}

      {/* MODAL 1: Category Budget Editor */}
      <CategoryBudgetModal
        categoryState={budgetModalCategory}
        budgetDraftRupees={budgetDraftRupees}
        savingBudget={savingBudget}
        onDraftChange={setBudgetDraftRupees}
        onClose={() => setBudgetModalCategory(null)}
        onSave={handleSaveCategoryBudget}
        onDelete={handleDeleteCategoryBudget}
      />

      {/* MODAL 2: WhatsApp CA Summary */}
      <WhatsAppTaxPackModal
        open={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        summaryText={whatsAppSummaryText}
        copied={copiedWhatsApp}
        onCopy={copyWhatsAppSummary}
      />
    </div>
  );
}
