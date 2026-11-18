import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckSquare,
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
import {
  buildWhatsAppLink,
  formatDisplayDateShort,
  formatINR,
  formatOrdinalDay,
} from '../../lib/format.ts';
import { api, type DashboardSummary } from '../../lib/api.ts';
import { SortSelect, ViewModeToggle } from '../../components/ui/Primitives.tsx';
import { buildSmoothAreaPath, formatShortMonthLabel } from './dashboardVisuals.ts';
import type { WorkspaceId } from './types.ts';

export type ModulesSortOption = 'default' | 'attention' | 'value' | 'name';

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<ModulesSortOption>('default');
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

  // 1. Bank & Cash calculations + Mini Sparkline geometry
  const totalCashMinor = data.banks
    .filter((b) => b.accountGroup === 'cash' || b.accountGroup === 'wallet')
    .reduce((sum, b) => sum + b.currentBalanceMinor, 0);
  const totalBankCheckingMinor = data.totalBankMinor - totalCashMinor;
  const topBanks = [...data.banks]
    .sort((a, b) => b.currentBalanceMinor - a.currentBalanceMinor)
    .slice(0, 3);

  const bankSparkline = useMemo(() => {
    const trend = data.sixMonthTrend ?? [];
    if (trend.length < 2) return { strokePath: '', areaPath: '' };
    const values = trend.map((t, idx) =>
      Math.max(100000, data.totalBankMinor - (trend.length - 1 - idx) * 1800000 + (t.incomeMinor - t.expenseMinor)),
    );
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = Math.max(1, maxV - minV);
    const pts = values.map((v, i) => ({
      x: 4 + (i / (values.length - 1)) * 92,
      y: 26 - ((v - minV) / span) * 20,
    }));
    return buildSmoothAreaPath(pts, 28);
  }, [data.sixMonthTrend, data.totalBankMinor]);

  // 2. Credit Cards calculations
  const totalLimit = Math.max(1, data.totalCardLimitMinor);
  const totalDebt = data.totalCardDebtMinor;
  const utilizationPct = Math.round((totalDebt / totalLimit) * 100);
  const availableCredit = Math.max(0, data.totalCardLimitMinor - totalDebt);
  const totalStatementDue = data.cards.reduce(
    (sum, c) => sum + (c.cardCycle?.statementDueMinor || 0),
    0,
  );
  const totalUnbilled = data.cards.reduce(
    (sum, c) => sum + (c.cardCycle?.unbilledMinor || 0),
    0,
  );
  const billedRatioPct =
    totalDebt > 0 ? Math.min(100, Math.round((totalStatementDue / totalDebt) * 100)) : 0;

  const cardsWithCycle = data.cards
    .filter((c) => c.cardCycle)
    .sort((a, b) => (a.cardCycle?.daysUntilDue ?? 999) - (b.cardCycle?.daysUntilDue ?? 999));
  const nextDueCard = cardsWithCycle[0];

  // 3. Loans & Khatabook calculations
  const netPeopleMinor = data.totalNeedMinor - data.totalGiveMinor;
  const youAreOwed = netPeopleMinor >= 0;
  const topPersonDue = data.dueSummariesByPerson?.[0];
  const activeLoans = data.loans.filter((l) => l.remainingMinor > 0);
  const nextLoan = activeLoans[0];
  const peopleTotalVolume = Math.max(1, data.totalNeedMinor + data.totalGiveMinor);
  const needSharePct = Math.round((data.totalNeedMinor / peopleTotalVolume) * 100);

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
  const completedTasksCount = allChecklistItems.length - pendingTasks.length;
  const taskCompletionPct =
    allChecklistItems.length > 0
      ? Math.round((completedTasksCount / allChecklistItems.length) * 100)
      : 100;
  const displayedTasks = allChecklistItems.slice(0, 3);

  const bankAttentionScore = data.totalBankMinor < 1000000 ? 50 : 5;
  const cardAttentionScore =
    nextDueCard && nextDueCard.cardCycle && nextDueCard.cardCycle.daysUntilDue <= 3
      ? 100
      : utilizationPct > 50
        ? 80
        : totalDebt > 0
          ? 40
          : 0;
  const loanAttentionScore =
    Math.abs(netPeopleMinor) > 0 || data.totalBorrowedRemainingMinor > 0 ? 60 : 10;
  const vaultAttentionScore = vaultEntryCount === null || vaultEntryCount === 0 ? 15 : 5;
  const reportsAttentionScore = !isSurplus ? 55 : 15;
  const notesAttentionScore = pendingTasks.length > 0 ? 30 : 0;

  const modulesList = [
    {
      id: 'money' as WorkspaceId,
      name: 'Bank & Cash',
      subtitle: 'Liquid Capital & Passbooks',
      order: 2,
      attentionScore: bankAttentionScore,
      valueMinor: data.totalBankMinor,
      renderCard: (delayClass: string) => (
        <div
          key="card-money"
          className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
        >
          <div>
            <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#059669] border border-[#EAE5DC] flex items-center justify-center shrink-0">
                  <Building2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#111318]">
                    Bank &amp; Cash
                  </h3>
                  <p className="text-[11px] text-[#858078]">Liquid Capital &amp; Passbooks</p>
                </div>
              </div>

              <span className="text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC]">
                {data.banks.length} Accounts
              </span>
            </div>

            {/* Hero Value + Live SVG Liquidity Sparkline */}
            <div className="mt-3.5 flex items-end justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                  Total Liquid Capital
                </span>
                <div className="text-2xl font-extrabold text-[#111318] font-mono-data tabular-nums tracking-tight">
                  {formatINR(data.totalBankMinor)}
                </div>
              </div>

              {bankSparkline.strokePath && (
                <svg
                  width="96"
                  height="30"
                  viewBox="0 0 100 30"
                  className="shrink-0 overflow-visible"
                  aria-label="Liquidity 6-month trend sparkline"
                >
                  <path d={bankSparkline.areaPath} fill="#059669" fillOpacity="0.14" />
                  <path
                    d={bankSparkline.strokePath}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-[#52504C] pt-1">
              <span>
                Bank:{' '}
                <strong className="text-[#111318] font-semibold font-mono-data tabular-nums">
                  {formatINR(totalBankCheckingMinor, { compact: true })}
                </strong>
              </span>
              <span className="text-[#D6CFC2]">·</span>
              <span>
                Cash:{' '}
                <strong className="text-[#111318] font-semibold font-mono-data tabular-nums">
                  {formatINR(totalCashMinor, { compact: true })}
                </strong>
              </span>
            </div>

            <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] divide-y divide-[#EAE5DC]">
              {topBanks.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-[#858078]">
                  No bank accounts configured yet.
                </div>
              ) : (
                topBanks.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#059669] shrink-0" />
                      <span className="font-semibold text-[#111318] truncate">
                        {b.name}
                      </span>
                      {b.last4 && (
                        <span className="font-mono-data text-[10px] text-[#858078]">
                          ••{b.last4}
                        </span>
                      )}
                    </div>
                    <span className="font-mono-data font-bold text-[#111318] tabular-nums shrink-0">
                      {formatINR(b.currentBalanceMinor, { compact: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
            <button
              type="button"
              onClick={() => onNavigate('money')}
              className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
            >
              <span>Open Bank &amp; Cash Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
      renderRow: (delayClass: string) => (
        <div
          key="row-money"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#059669] border border-[#EAE5DC] flex items-center justify-center shrink-0">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Bank &amp; Cash</h3>
              <p className="text-[11px] text-[#858078]">{data.banks.length} Active Accounts</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] uppercase font-mono-data text-[#858078] block">Total Liquid</span>
              <span className="text-base font-bold font-mono-data text-[#111318] tabular-nums">
                {formatINR(data.totalBankMinor)}
              </span>
            </div>
            {topBanks[0] && (
              <div className="text-xs text-[#52504C] hidden lg:block border-l border-[#EAE5DC] pl-4">
                <span className="text-[10px] text-[#858078] block">Primary Institution</span>
                <span className="font-semibold text-[#111318]">{topBanks[0].name}</span>{' '}
                <span className="font-mono-data text-[11px]">({formatINR(topBanks[0].currentBalanceMinor, { compact: true })})</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('money')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },

    {
      id: 'cards' as WorkspaceId,
      name: 'Credit Cards',
      subtitle: 'Liabilities & Billing Cycles',
      order: 1,
      attentionScore: cardAttentionScore,
      valueMinor: totalDebt,
      renderCard: (delayClass: string) => (
        <div
          key="card-cards"
          className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
        >
          <div>
            <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
                  <CreditCard className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#111318]">
                    Credit Cards
                  </h3>
                  <p className="text-[11px] text-[#858078]">Liabilities &amp; Billing Cycles</p>
                </div>
              </div>

              <span className="text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC]">
                {data.cards.length} Cards
              </span>
            </div>

            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                Total Card Outstanding
              </span>
              <div className="text-2xl font-extrabold text-[#111318] font-mono-data tabular-nums tracking-tight">
                {formatINR(totalDebt)}
              </div>
              <div className="flex items-center justify-between text-xs text-[#52504C] pt-0.5">
                <span>
                  Available:{' '}
                  <strong className="text-[#059669] font-semibold font-mono-data">
                    {formatINR(availableCredit, { compact: true })}
                  </strong>
                </span>
                <span className="font-mono-data font-bold text-[#111318]">{utilizationPct}% Used</span>
              </div>
            </div>

            {/* Dual-Segment Statement Billed vs Unbilled Progress Bar */}
            <div className="mt-3 space-y-1">
              <div className="w-full h-2 rounded-full bg-[#F3EFEA] overflow-hidden flex gap-0.5">
                {billedRatioPct > 0 && (
                  <div
                    className="h-full bg-[#E11D48] rounded-l-full"
                    style={{ width: `${billedRatioPct}%` }}
                  />
                )}
                <div
                  className="h-full bg-[#C59B27] rounded-r-full"
                  style={{ width: `${Math.max(8, 100 - billedRatioPct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono-data text-[#858078]">
                <span>Billed: {formatINR(totalStatementDue, { compact: true })}</span>
                <span>Unbilled: {formatINR(totalUnbilled > 0 ? totalUnbilled : totalDebt, { compact: true })}</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#EAE5DC] divide-y divide-[#EAE5DC] text-xs">
              {nextDueCard && nextDueCard.cardCycle && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#52504C] truncate max-w-[140px]">
                    Next Due: <strong className="text-[#111318]">{nextDueCard.name}</strong>
                  </span>
                  <span className="font-mono-data font-semibold text-[#C59B27]">
                    {formatDisplayDateShort(nextDueCard.cardCycle.nextDueDate) ||
                      formatOrdinalDay(nextDueCard.dueDay || 5)}{' '}
                    ({nextDueCard.cardCycle.daysUntilDue}d)
                  </span>
                </div>
              )}
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#52504C]">Aggregate Credit Limit</span>
                <span className="font-mono-data font-bold text-[#059669] tabular-nums">
                  {formatINR(data.totalCardLimitMinor, { compact: true })}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
            <button
              type="button"
              onClick={() => onNavigate('cards')}
              className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
            >
              <span>Open Credit Cards Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
      renderRow: (delayClass: string) => (
        <div
          key="row-cards"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Credit Cards</h3>
              <p className="text-[11px] text-[#858078]">{data.cards.length} Active Instruments</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] uppercase font-mono-data text-[#858078] block">Total Debt</span>
              <span className="text-base font-bold font-mono-data text-[#111318] tabular-nums">
                {formatINR(totalDebt)}
              </span>
            </div>
            <div className="text-xs text-[#52504C]">
              Utilization: <strong className="font-mono-data text-[#111318]">{utilizationPct}%</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('cards')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },

    {
      id: 'loans_dues' as WorkspaceId,
      name: 'Loans & Dues',
      subtitle: 'Khatabook & Bank EMIs',
      order: 4,
      attentionScore: loanAttentionScore,
      valueMinor: data.totalBorrowedRemainingMinor + Math.abs(netPeopleMinor),
      renderCard: (delayClass: string) => (
        <div
          key="card-loans"
          className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
        >
          <div>
            <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#C59B27] border border-[#EAE5DC] flex items-center justify-center shrink-0">
                  <Landmark className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#111318]">
                    Loans &amp; Dues
                  </h3>
                  <p className="text-[11px] text-[#858078]">Khatabook &amp; Bank EMIs</p>
                </div>
              </div>

              <span
                className={`text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md border ${
                  youAreOwed
                    ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                    : 'bg-amber-50 text-[#9A7B2C] border-amber-200'
                }`}
              >
                {youAreOwed ? 'Net Receivable' : 'Net Payable'}
              </span>
            </div>

            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                {youAreOwed ? 'Owed To You (People Net)' : 'You Owe (People Net)'}
              </span>
              <div
                className={`text-2xl font-extrabold font-mono-data tabular-nums tracking-tight ${
                  youAreOwed ? 'text-[#059669]' : 'text-[#C59B27]'
                }`}
              >
                {formatINR(Math.abs(netPeopleMinor))}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#52504C] pt-0.5">
                <span>Bank Principal:</span>
                <strong className="text-[#111318] font-semibold font-mono-data">
                  {formatINR(data.totalBorrowedRemainingMinor, { compact: true })}
                </strong>
              </div>
            </div>

            {/* Receivable vs Payable Split Ratio Bar */}
            <div className="mt-3 space-y-1">
              <div className="h-2 w-full rounded-full bg-[#F3EFEA] overflow-hidden flex gap-0.5">
                <div
                  className="h-full bg-[#059669] rounded-l-full"
                  style={{ width: `${Math.max(10, needSharePct)}%` }}
                />
                <div
                  className="h-full bg-[#E11D48] rounded-r-full"
                  style={{ width: `${Math.max(8, 100 - needSharePct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono-data text-[#858078]">
                <span className="text-[#059669]">Receivable: {needSharePct}%</span>
                <span className="text-[#E11D48]">Payable: {100 - needSharePct}%</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#EAE5DC] divide-y divide-[#EAE5DC] text-xs">
              {topPersonDue ? (
                <div className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#111318] block truncate">
                      {topPersonDue.personName}
                    </span>
                    <span className="text-[11px] font-mono-data text-[#52504C]">
                      {formatINR(Math.abs(topPersonDue.totalNeedMinor - topPersonDue.totalGiveMinor))}
                    </span>
                  </div>
                  {topPersonDue.phone && topPersonDue.totalNeedMinor > topPersonDue.totalGiveMinor && (
                    <a
                      href={buildWhatsAppLink(
                        topPersonDue.phone,
                        `Hi ${topPersonDue.personName}, friendly reminder regarding the pending balance of ${formatINR(
                          topPersonDue.totalNeedMinor - topPersonDue.totalGiveMinor,
                        )} on our ledger. Thanks!`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-semibold transition-colors shrink-0"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>Remind</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="py-2 text-[#858078]">No active people dues.</div>
              )}

              {nextLoan && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#52504C] truncate max-w-[140px]">
                    Next EMI: <strong className="text-[#111318]">{nextLoan.name}</strong>
                  </span>
                  <span className="font-mono-data font-bold text-[#111318]">
                    {formatINR(nextLoan.emiMinor, { compact: true })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
            <button
              type="button"
              onClick={() => onNavigate('loans_dues')}
              className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
            >
              <span>Open Loans &amp; Khatabook</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
      renderRow: (delayClass: string) => (
        <div
          key="row-loans"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#C59B27] border border-[#EAE5DC] flex items-center justify-center shrink-0">
              <Landmark className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Loans &amp; Dues</h3>
              <p className="text-[11px] text-[#858078]">Khatabook &amp; Bank Debt</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] uppercase font-mono-data text-[#858078] block">
                {youAreOwed ? 'Net Receivable' : 'Net Payable'}
              </span>
              <span className="text-base font-bold font-mono-data text-[#059669] tabular-nums">
                {formatINR(Math.abs(netPeopleMinor))}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('loans_dues')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },

    {
      id: 'reports' as WorkspaceId,
      name: 'Reports & CA Tax Pack',
      subtitle: 'ITR & Financial Analytics',
      order: 5,
      attentionScore: reportsAttentionScore,
      valueMinor: Math.abs(monthlySurplusMinor),
      renderCard: (delayClass: string) => {
        const trendBars = (data.sixMonthTrend ?? []).slice(-6);
        const maxSurplus = Math.max(
          100000,
          ...trendBars.map((t) => Math.abs(t.incomeMinor - t.expenseMinor)),
        );

        return (
          <div
            key="card-reports"
            className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
          >
            <div>
              <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] flex items-center justify-center shrink-0">
                    <BarChart3 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#111318]">
                      Reports &amp; CA Tax Pack
                    </h3>
                    <p className="text-[11px] text-[#858078]">ITR &amp; Financial Analytics</p>
                  </div>
                </div>

                <span className="text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC]">
                  FY 26-27
                </span>
              </div>

              {/* Hero Surplus + 6-Bar SVG Monthly Cashflow Micro-Chart */}
              <div className="mt-3.5 flex items-end justify-between gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                    {isSurplus ? 'Monthly Cash Surplus' : 'Monthly Deficit'}
                  </span>
                  <div
                    className={`text-2xl font-extrabold font-mono-data tabular-nums tracking-tight flex items-center gap-1.5 ${
                      isSurplus ? 'text-[#059669]' : 'text-[#E11D48]'
                    }`}
                  >
                    {isSurplus ? (
                      <TrendingUp className="w-5 h-5 shrink-0" />
                    ) : (
                      <TrendingDown className="w-5 h-5 shrink-0" />
                    )}
                    {formatINR(Math.abs(monthlySurplusMinor))}
                  </div>
                </div>

                {/* 6-Month Surplus Bar Micro-Graphic */}
                {trendBars.length > 0 && (
                  <div className="flex items-end gap-1 h-9 px-1.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#EAE5DC]">
                    {trendBars.map((tb, idx) => {
                      const net = tb.incomeMinor - tb.expenseMinor;
                      const hPct = Math.max(20, Math.round((Math.abs(net) / maxSurplus) * 100));
                      const isLast = idx === trendBars.length - 1;
                      return (
                        <div
                          key={tb.month}
                          title={`${formatShortMonthLabel(tb.month)}: ${formatINR(net, { compact: true, signed: true })}`}
                          className={`w-2 rounded-xs ${
                            net < 0
                              ? 'bg-[#E11D48]'
                              : isLast
                                ? 'bg-[#059669]'
                                : 'bg-[#C59B27]/75'
                          }`}
                          style={{ height: `${hPct}%` }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#52504C] pt-1">
                <span>Savings Rate:</span>
                <strong className="text-[#059669] font-semibold font-mono-data">
                  {savingsRate}%
                </strong>
                <span className="text-[#D6CFC2]">·</span>
                <span>Top Spend:</span>
                <strong className="text-[#111318] font-semibold truncate max-w-[90px]">
                  {topCategory?.category || 'N/A'}
                </strong>
              </div>

              <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] divide-y divide-[#EAE5DC] text-xs">
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#52504C]">Section 80C / 80D Shield</span>
                  <span className="font-mono-data font-bold text-[#111318]">₹1.5L / ₹50K</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#52504C]">CA Export Status</span>
                  <span className="font-mono-data font-semibold text-[#059669]">Audit-Ready</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
              >
                <span>Open Reports &amp; Tax Pack</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      },
      renderRow: (delayClass: string) => (
        <div
          key="row-reports"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] flex items-center justify-center shrink-0">
              <BarChart3 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Reports &amp; CA Tax Pack</h3>
              <p className="text-[11px] text-[#858078]">ITR &amp; Financial Analytics</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[10px] uppercase font-mono-data text-[#858078] block">Monthly Net</span>
              <span className="text-base font-bold font-mono-data text-[#059669] tabular-nums">
                {formatINR(monthlySurplusMinor, { signed: true })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },

    {
      id: 'notes' as WorkspaceId,
      name: 'Notes & Checklists',
      subtitle: 'Pinned Memos & Tasks',
      order: 3,
      attentionScore: notesAttentionScore,
      valueMinor: pendingTasks.length * 100000,
      renderCard: (delayClass: string) => (
        <div
          key="card-notes"
          className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
        >
          <div>
            <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] flex items-center justify-center shrink-0">
                  <NotebookPen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#111318]">
                    Notes &amp; Checklists
                  </h3>
                  <p className="text-[11px] text-[#858078]">Pinned Memos &amp; Tasks</p>
                </div>
              </div>

              <span className="text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC]">
                {data.pinnedNotes.length} Pinned
              </span>
            </div>

            <div className="mt-3.5 flex items-end justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                  Actionable Checklist Items
                </span>
                <div className="text-2xl font-extrabold text-[#111318] font-mono-data tabular-nums tracking-tight">
                  {pendingTasks.length} Open
                </div>
              </div>

              <span className="text-xs font-mono-data font-bold text-[#059669]">
                {taskCompletionPct}% Done
              </span>
            </div>

            {/* Task Completion Progress Bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#F3EFEA] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#059669] transition-all duration-300"
                style={{ width: `${Math.max(8, taskCompletionPct)}%` }}
              />
            </div>

            <div className="mt-3.5 pt-3 border-t border-[#EAE5DC] space-y-2">
              {displayedTasks.length === 0 ? (
                <div className="py-2 text-xs text-[#858078]">
                  No checklist tasks in pinned notes.
                </div>
              ) : (
                displayedTasks.map((entry) => (
                  <button
                    key={`${entry.noteId}-${entry.item.id}`}
                    type="button"
                    onClick={() =>
                      onToggleChecklist?.(entry.noteId, entry.item.id, !entry.item.done)
                    }
                    className="w-full flex items-center gap-2 text-left text-xs py-1 hover:text-[#111318] cursor-pointer"
                  >
                    {entry.item.done ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-[#858078] shrink-0" />
                    )}
                    <span
                      className={`truncate ${
                        entry.item.done
                          ? 'line-through text-[#858078]'
                          : 'text-[#111318] font-medium'
                      }`}
                    >
                      {entry.item.text}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
            <button
              type="button"
              onClick={() => onNavigate('notes')}
              className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
            >
              <span>Open Notes Workstation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
      renderRow: (delayClass: string) => (
        <div
          key="row-notes"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC] flex items-center justify-center shrink-0">
              <NotebookPen className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Notes &amp; Checklists</h3>
              <p className="text-[11px] text-[#858078]">{pendingTasks.length} Open Tasks</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('notes')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },

    {
      id: 'vault' as WorkspaceId,
      name: 'Security Vault',
      subtitle: 'Zero-Knowledge Client Crypto',
      order: 6,
      attentionScore: vaultAttentionScore,
      valueMinor: 0,
      renderCard: (delayClass: string) => (
        <div
          key="card-vault"
          className={`bento-card rounded-2xl p-5 flex flex-col justify-between module-card-interactive animate-module-card ${delayClass} relative overflow-hidden group`}
        >
          <div>
            <div className="flex items-start justify-between pb-3.5 border-b border-[#EAE5DC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#111318]">
                    Security Vault
                  </h3>
                  <p className="text-[11px] text-[#858078]">Zero-Knowledge Client Crypto</p>
                </div>
              </div>

              <span className="text-[10px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-[#F3EFEA] text-[#111318] border border-[#EAE5DC]">
                AES-256 GCM
              </span>
            </div>

            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                Protected Credentials
              </span>
              <div className="text-2xl font-extrabold text-[#111318] font-mono-data tabular-nums tracking-tight">
                {vaultEntryCount !== null ? `${vaultEntryCount} Records` : 'Hardware Ready'}
              </div>
              <div className="text-xs text-[#52504C] pt-0.5">
                Status: <strong className="text-[#059669] font-semibold">Zero Plaintext Stored</strong>
              </div>
            </div>

            {/* 256-Bit Entropy Visual Matrix */}
            <div className="mt-3 flex items-center gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((b) => (
                <div
                  key={b}
                  className={`h-1.5 flex-1 rounded-full ${
                    b % 3 === 0
                      ? 'bg-[#C59B27]'
                      : b % 2 === 0
                        ? 'bg-[#059669]'
                        : 'bg-[#111318]'
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#EAE5DC] divide-y divide-[#EAE5DC] text-xs text-[#52504C]">
              <div className="py-2 flex items-center justify-between">
                <span>Key Derivation</span>
                <span className="font-mono-data font-semibold text-[#111318]">PBKDF2 · 600K</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span>PINs, CVVs &amp; Recovery Keys</span>
                <span className="font-mono-data font-semibold text-[#059669]">Client-Only</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE5DC]">
            <button
              type="button"
              onClick={() => onNavigate('vault')}
              className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer border border-[#EAE5DC]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Unlock Security Vault</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ),
      renderRow: (delayClass: string) => (
        <div
          key="row-vault"
          className={`bento-card rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 module-card-interactive animate-module-card ${delayClass}`}
        >
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-9 h-9 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#111318]">Security Vault</h3>
              <p className="text-[11px] text-[#858078]">AES-256 GCM Client Crypto</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('vault')}
            className="self-end md:self-auto py-1.5 px-3 rounded-lg bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Unlock</span>
          </button>
        </div>
      ),
    },
  ];

  const sortedModules = [...modulesList].sort((a, b) => {
    if (sortBy === 'attention') return b.attentionScore - a.attentionScore;
    if (sortBy === 'value') return b.valueMinor - a.valueMinor;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return a.order - b.order;
  });

  const delayClasses = [
    'animate-delay-1',
    'animate-delay-2',
    'animate-delay-3',
    'animate-delay-4',
    'animate-delay-5',
    'animate-delay-6',
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
            Sovereign Architecture
          </span>
          <h2 className="font-display text-lg font-bold text-[#111318]">
            Specialized Workstations
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <SortSelect
            value={sortBy}
            onChange={(val) => setSortBy(val as ModulesSortOption)}
            options={[
              { value: 'default', label: 'Default Order' },
              { value: 'attention', label: 'Urgency & Attention' },
              { value: 'value', label: 'Capital Volume' },
              { value: 'name', label: 'Alphabetical' },
            ]}
          />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedModules.map((mod, idx) => mod.renderCard(delayClasses[idx % delayClasses.length]))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {sortedModules.map((mod, idx) => mod.renderRow(delayClasses[idx % delayClasses.length]))}
        </div>
      )}
    </section>
  );
}
