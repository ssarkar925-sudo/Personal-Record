import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckSquare,
  Clock,
  CreditCard,
  Landmark,
  Lock,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Square,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatINR, buildWhatsAppLink } from '../../lib/format.ts';
import { api, type DashboardSummary } from '../../lib/api.ts';
import type { WorkspaceId } from './types.ts';

export interface AllModulesHubProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
  onToggleChecklist?: (noteId: string, itemId: string, done: boolean) => void;
}

export function AllModulesHub({
  data,
  onNavigate,
  onToggleChecklist,
}: AllModulesHubProps) {
  // Vault entry count state (fetched quietly to enrich the Vault card)
  const [vaultEntryCount, setVaultEntryCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getVaultEntries()
      .then((entries) => {
        if (!cancelled && entries) {
          setVaultEntryCount(entries.length);
        }
      })
      .catch(() => {
        // Vault might not be initialized or locked; keep null
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Bank & Cash calculations
  const totalCashMinor = data.banks
    .filter((b) => b.accountGroup === 'cash' || b.accountGroup === 'wallet')
    .reduce((sum, b) => sum + b.currentBalanceMinor, 0);
  const totalBankCheckingMinor = data.totalBankMinor - totalCashMinor;
  const topBanks = [...data.banks]
    .sort((a, b) => b.currentBalanceMinor - a.currentBalanceMinor)
    .slice(0, 3);

  // 2. Credit Cards calculations
  const totalLimit = Math.max(1, data.totalCardLimitMinor);
  const totalDebt = data.totalCardDebtMinor;
  const utilizationPct = Math.round((totalDebt / totalLimit) * 100);
  const availableCredit = Math.max(0, data.totalCardLimitMinor - totalDebt);

  // Find nearest due card
  const cardsWithCycle = data.cards
    .filter((c) => c.cardCycle)
    .sort((a, b) => (a.cardCycle?.daysUntilDue ?? 999) - (b.cardCycle?.daysUntilDue ?? 999));
  const nextDueCard = cardsWithCycle[0];

  // 3. Loans & Khatabook calculations
  const netPeopleMinor = data.totalNeedMinor - data.totalGiveMinor;
  const youAreOwed = netPeopleMinor >= 0;
  const topPersonDue = data.dueSummariesByPerson?.[0];

  // Nearest loan EMI
  const activeLoans = data.loans.filter((l) => l.remainingMinor > 0);
  const nextLoan = activeLoans[0];

  // 4. Reports & Tax calculations
  const monthlySurplusMinor = data.monthIncomeMinor - data.monthExpenseMinor;
  const isSurplus = monthlySurplusMinor >= 0;
  const savingsRate =
    data.monthIncomeMinor > 0
      ? Math.max(0, Math.round((monthlySurplusMinor / data.monthIncomeMinor) * 100))
      : 0;
  const topCategory = data.monthTopCategories?.[0];

  // 5. Notes & Checklists calculations
  const allChecklistItems: Array<{
    noteId: string;
    noteTitle: string;
    item: { id: string; text: string; done: boolean };
  }> = [];

  for (const n of data.pinnedNotes) {
    if (n.checklist && n.checklist.length > 0) {
      for (const it of n.checklist) {
        allChecklistItems.push({
          noteId: n.id,
          noteTitle: n.title,
          item: it,
        });
      }
    }
  }
  const pendingTasks = allChecklistItems.filter((i) => !i.item.done);
  const displayedTasks = allChecklistItems.slice(0, 3);

  return (
    <section className="space-y-4 scroll-mt-20 pt-2">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-0.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse-subtle" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Executive Modules Command Center
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              6 Live Hubs
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status, balances, and single-click execution across all financial workstations.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
            Live Sync Active
          </span>
        </div>
      </div>

      {/* 6-Card Responsive Grid with Staggered Entrance Animations */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
        {/* ========================================================
            CARD 1: BANK & CASH WORKSPACE (EMERALD)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-1 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Bank & Cash
                  </h3>
                  <p className="text-[11px] text-slate-500">Liquid Capital & Passbooks</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                {data.banks.length} Accounts
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Total Liquid Capital
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
                {formatINR(data.totalBankMinor)}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                <span>
                  Bank:{' '}
                  <strong className="text-slate-700 font-semibold font-mono">
                    {formatINR(totalBankCheckingMinor)}
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Cash:{' '}
                  <strong className="text-slate-700 font-semibold font-mono">
                    {formatINR(totalCashMinor)}
                  </strong>
                </span>
              </div>
            </div>

            {/* Top Accounts Preview */}
            <div className="mt-4 pt-3 border-t border-slate-100/90 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                <span>Top Primary Accounts</span>
                <span className="text-[10px] font-normal text-slate-400">Reconciled</span>
              </div>

              {topBanks.length === 0 ? (
                <div className="p-3 text-center rounded-lg bg-slate-50 text-[11px] text-slate-400">
                  No bank accounts configured yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {topBanks.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 uppercase">
                          {b.name.slice(0, 2)}
                        </div>
                        <span className="font-semibold text-slate-800 truncate block">
                          {b.name}
                        </span>
                        {b.last4 && (
                          <span className="font-mono text-[10px] text-slate-400">
                            ••{b.last4}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                        {formatINR(b.currentBalanceMinor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('money')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-emerald-200"
            >
              <span>Manage Banks & Cash</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CARD 2: CREDIT CARDS WORKSPACE (BLUE)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-2 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Credit Cards
                  </h3>
                  <p className="text-[11px] text-slate-500">Liabilities & Utilization</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                {data.cards.length} Cards Active
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Total Card Debt
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
                {formatINR(totalDebt)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                <span>Available Buffer:</span>
                <strong className="text-emerald-700 font-semibold font-mono">
                  {formatINR(availableCredit)}
                </strong>
              </div>
            </div>

            {/* Utilization Bar */}
            <div className="mt-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Portfolio Utilization</span>
                <span
                  className={`font-mono font-bold ${
                    utilizationPct > 50
                      ? 'text-rose-600'
                      : utilizationPct > 30
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }`}
                >
                  {utilizationPct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    utilizationPct > 50
                      ? 'bg-rose-500'
                      : utilizationPct > 30
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }}
                />
              </div>
            </div>

            {/* Next Due Cycle Indicator */}
            <div className="mt-4 pt-3 border-t border-slate-100/90">
              {nextDueCard && nextDueCard.cardCycle ? (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-semibold text-slate-800 truncate max-w-[120px]">
                      {nextDueCard.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ••{nextDueCard.last4}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      nextDueCard.cardCycle.daysUntilDue <= 3
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {nextDueCard.cardCycle.daysUntilDue < 0
                      ? 'Overdue'
                      : `Due in ${nextDueCard.cardCycle.daysUntilDue}d`}
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 text-[11px] text-slate-400 text-center">
                  All credit card cycles current.
                </div>
              )}
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('cards')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-blue-200"
            >
              <span>Open Cards Workstation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CARD 3: LOANS & KHATABOOK DUES (AMBER)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-3 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center shrink-0">
                  <Landmark className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Loans & Dues
                  </h3>
                  <p className="text-[11px] text-slate-500">People Credit & Bank Debt</p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  youAreOwed
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {youAreOwed ? 'Net Positive' : 'Net Payable'}
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                {youAreOwed ? 'Owed To You (People Net)' : 'You Owe (People Net)'}
              </span>
              <div
                className={`text-2xl font-black font-mono tabular-nums tracking-tight ${
                  youAreOwed ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {formatINR(Math.abs(netPeopleMinor))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                <span>Bank Loan Principal:</span>
                <strong className="text-slate-800 font-semibold font-mono">
                  {formatINR(data.totalBorrowedRemainingMinor)}
                </strong>
              </div>
            </div>

            {/* Khatabook Highlight / 1-Click WhatsApp */}
            <div className="mt-4 pt-3 border-t border-slate-100/90 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                <span>Khatabook Leader</span>
                {topPersonDue && (
                  <span className="text-[10px] text-slate-400">
                    {topPersonDue.totalGiveMinor > topPersonDue.totalNeedMinor ? 'You owe' : 'Owes you'}
                  </span>
                )}
              </div>

              {topPersonDue ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">
                      {topPersonDue.personName}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-600">
                      {formatINR(Math.abs(topPersonDue.totalNeedMinor - topPersonDue.totalGiveMinor))}
                    </span>
                  </div>

                  {topPersonDue.phone && topPersonDue.totalNeedMinor > topPersonDue.totalGiveMinor && (
                    <a
                      href={buildWhatsAppLink(
                        topPersonDue.phone,
                        `Hi ${topPersonDue.personName}, friendly reminder regarding the pending balance of ${formatINR(
                          topPersonDue.totalNeedMinor - topPersonDue.totalGiveMinor
                        )} on our ledger. Thanks!`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors shrink-0 shadow-2xs"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>Remind</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 text-[11px] text-slate-400 text-center">
                  Zero pending debts with people.
                </div>
              )}

              {nextLoan && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-0.5">
                  <span className="text-slate-400">Next EMI:</span>
                  <span className="font-semibold text-slate-700 truncate max-w-[110px]">
                    {nextLoan.name}
                  </span>
                  <span className="font-mono text-slate-600">
                    ({formatINR(nextLoan.emiMinor)})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('loans_dues')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-amber-200"
            >
              <span>Open Loans & Khatabook</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CARD 4: ENCRYPTED SECURITY VAULT (SLATE)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-4 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-700 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Security Vault
                  </h3>
                  <p className="text-[11px] text-slate-500">Zero-Knowledge Client Crypto</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" />
                AES-256 GCM
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Protected Credentials
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
                {vaultEntryCount !== null ? `${vaultEntryCount} Items` : 'Enforced'}
              </div>
              <div className="text-xs text-slate-500 pt-0.5">
                <span>Status:</span>{' '}
                <strong className="text-emerald-700 font-semibold">
                  Zero Plaintext Stored
                </strong>
              </div>
            </div>

            {/* Security Guarantee List */}
            <div className="mt-4 pt-3 border-t border-slate-100/90 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>PBKDF2 SHA-256 · 600,000 Key Rounds</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>Bank Netbanking PINs, CVVs & KYC Docs</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>Encrypted in memory only; never sent bare</span>
              </div>
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('vault')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-slate-300"
            >
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-600" />
                <span>Unlock Security Vault</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CARD 5: REPORTS & CA TAX PACK (INDIGO)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-5 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Reports & CA Tax Pack
                  </h3>
                  <p className="text-[11px] text-slate-500">ITR & Financial Analytics</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                FY 26-27
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                {isSurplus ? 'Monthly Cash Surplus' : 'Monthly Deficit'}
              </span>
              <div
                className={`text-2xl font-black font-mono tabular-nums tracking-tight flex items-center gap-1.5 ${
                  isSurplus ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {isSurplus ? (
                  <TrendingUp className="w-5 h-5 shrink-0" />
                ) : (
                  <TrendingDown className="w-5 h-5 shrink-0" />
                )}
                {formatINR(Math.abs(monthlySurplusMinor))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-0.5">
                <span>Savings Rate:</span>
                <strong className="text-indigo-700 font-semibold font-mono">
                  {savingsRate}%
                </strong>
                <span className="text-slate-300">·</span>
                <span>Top:</span>
                <strong className="text-slate-700 font-semibold truncate max-w-[80px]">
                  {topCategory?.category || 'N/A'}
                </strong>
              </div>
            </div>

            {/* CA Tax Trackers */}
            <div className="mt-4 pt-3 border-t border-slate-100/90 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                <span>CA Tax Schedulers</span>
                <span className="text-[10px] text-emerald-700 font-medium">Ready</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 block font-medium">Sec 80C</span>
                  <span className="text-[11px] font-bold font-mono text-slate-700">₹1.5L</span>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 block font-medium">Sec 80D</span>
                  <span className="text-[11px] font-bold font-mono text-slate-700">₹50K</span>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[9px] text-slate-400 block font-medium">Sec 24b</span>
                  <span className="text-[11px] font-bold font-mono text-slate-700">₹2.0L</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-indigo-200"
            >
              <span>Open Tax & Reports Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CARD 6: NOTES & ACTION CHECKLISTS (SKY)
            ======================================================== */}
        <div
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between module-card-interactive animate-module-card animate-delay-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500 group-hover:h-1.5 transition-all" />

          <div>
            {/* Top row */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 flex items-center justify-center shrink-0">
                  <NotebookPen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    Notes & Scratchpad
                  </h3>
                  <p className="text-[11px] text-slate-500">Pinned Memos & Actions</p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                {data.pinnedNotes.length} Pinned
              </span>
            </div>

            {/* Main KPI */}
            <div className="mt-3.5 space-y-1">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Pending Action Items
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tabular-nums tracking-tight">
                {pendingTasks.length} Tasks
              </div>
              <div className="text-xs text-slate-500 pt-0.5">
                <span>Interactive:</span>{' '}
                <strong className="text-sky-700 font-semibold">
                  1-Click Check & Sync
                </strong>
              </div>
            </div>

            {/* Interactive Checklist List */}
            <div className="mt-4 pt-3 border-t border-slate-100/90 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                <span>Live Action Items</span>
                <span className="text-[10px] text-slate-400">Tap to toggle</span>
              </div>

              {displayedTasks.length === 0 ? (
                <div className="p-3 text-center rounded-lg bg-slate-50 text-[11px] text-slate-400">
                  No pending checklist tasks in pinned notes.
                </div>
              ) : (
                displayedTasks.map(({ noteId, item }) => (
                  <div
                    key={`${noteId}-${item.id}`}
                    onClick={() => onToggleChecklist?.(noteId, item.id, !item.done)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/70 hover:bg-sky-50/60 border border-slate-100 hover:border-sky-200 transition-colors cursor-pointer text-xs"
                  >
                    {item.done ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span
                      className={`truncate text-slate-800 ${
                        item.done ? 'line-through text-slate-400' : 'font-medium'
                      }`}
                    >
                      {item.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Link */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('notes')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-800 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-slate-200/80 hover:border-sky-200"
            >
              <span>Open Notes & Scratchpad</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
