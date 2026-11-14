import {
  Building2,
  Calendar,
  Plus,
} from 'lucide-react';
import { api, type AdvisorBriefing, type DashboardSummary } from '../lib/api.ts';
import { SCOPE_META } from '../lib/format.ts';
import { Button, Card } from '../components/ui/Primitives.tsx';
import { AdvisorBillboard } from '../components/AdvisorBillboard.tsx';
import { CardSkeleton, MetricsSkeleton, RowSkeleton, Skeleton } from '../components/ui/Skeleton.tsx';
import type { Scope } from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';
import { DashboardExecutiveKpiStrip } from './dashboard/DashboardExecutiveKpiStrip.tsx';
import { AllModulesHub } from './dashboard/AllModulesHub.tsx';
import { FinancialPulseSection } from './dashboard/FinancialPulseSection.tsx';
import { ExecutiveCommandSection } from './dashboard/ExecutiveCommandSection.tsx';
import type { WorkspaceId } from './dashboard/types.ts';

export type { WorkspaceId };

export function DashboardView({
  data,
  briefing = null,
  loading = false,
  systemLanguage = 'en',
  scopeFilter,
  onScopeChange,
  onNavigate,
  onOpenQuickAdd,
  onOpenAgent,
  onRefresh,
}: {
  data: DashboardSummary | null;
  briefing?: AdvisorBriefing | null;
  loading?: boolean;
  systemLanguage?: AppLanguage;
  scopeFilter: Scope | 'all';
  onScopeChange: (next: Scope | 'all') => void;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
  onOpenAgent: (commandText?: string) => void;
  onRefresh: () => void;
}) {
  const dict = UI_STRINGS[systemLanguage];

  // Loading skeleton state
  if (loading || !data) {
    return (
      <div className="space-y-5 animate-panel-in">
        {/* Scope Filter Strip Skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg bg-slate-200/80" />
            ))}
          </div>
          <Skeleton className="h-4 w-40 rounded bg-slate-200/80" />
        </div>

        {/* Primary KPI Strip Skeleton */}
        <MetricsSkeleton />

        {/* Advisor Billboard Skeleton */}
        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl bg-slate-200/80" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-48 rounded bg-slate-200/80" />
                <Skeleton className="h-3 w-72 rounded bg-slate-200/80" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-lg bg-slate-200/80" />
              <Skeleton className="h-8 w-24 rounded-lg bg-slate-200/80" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <Skeleton className="h-3.5 w-28 rounded bg-slate-200/80" />
                <Skeleton className="h-6 w-36 rounded bg-slate-200/80" />
                <Skeleton className="h-3 w-full rounded bg-slate-200/80" />
              </div>
            ))}
          </div>
        </section>

        {/* Main Row Skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7">
            <CardSkeleton hasHeader rows={4} className="h-full" />
          </div>
          <div className="xl:col-span-5">
            <CardSkeleton hasHeader rows={4} className="h-full" />
          </div>
        </div>

        {/* Bottom Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <section key={i} className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-36 rounded bg-slate-200/80" />
                <Skeleton className="h-6 w-16 rounded-lg bg-slate-200/80" />
              </div>
              <RowSkeleton count={3} />
            </section>
          ))}
        </div>
      </div>
    );
  }

  const handleToggleChecklist = async (noteId: string, itemId: string, done: boolean) => {
    await api.toggleChecklistItem(noteId, itemId, done);
    onRefresh();
  };

  const isFreshEmpty =
    data.banks.length === 0 &&
    data.cards.length === 0 &&
    data.loans.length === 0 &&
    data.pinnedNotes.length === 0;

  return (
    <div className="space-y-6 animate-panel-in">
      {/* 1. Scope Filter & Reference Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', dict.scopes.all],
              ['personal', dict.scopes.personal],
              ['business', dict.scopes.business],
              ['family', dict.scopes.family],
            ] as const
          ).map(([id, label]) => {
            const active = scopeFilter === id;
            const dotClass = id === 'all' ? 'bg-slate-700' : SCOPE_META[id].dotClass;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onScopeChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${active ? 'bg-white' : dotClass}`} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{dict.dashboard.referenceDate}:</span>
          <strong className="font-semibold text-slate-800">{data.referenceDate}</strong>
        </div>
      </div>

      {isFreshEmpty && (
        <Card className="p-6 border-blue-200 bg-blue-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{dict.dashboard.readyTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">{dict.dashboard.readySubtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" onClick={() => onNavigate('money')}>
                <Building2 className="h-4 w-4" />
                {dict.dashboard.addBankCard}
              </Button>
              <Button variant="primary" onClick={onOpenQuickAdd}>
                <Plus className="h-4 w-4" />
                {dict.dashboard.quickCapture}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 2. Top Executive KPI Strip (Daylight Studio Cards - Emerald/Indigo/Blue/Amber top lines) */}
      <DashboardExecutiveKpiStrip
        data={data}
        onNavigate={onNavigate}
      />

      {/* 3. Live AI Financial Advisor Billboard */}
      <div id="advisor-billboard">
        <AdvisorBillboard
          data={data}
          briefing={briefing}
          systemLanguage={systemLanguage}
          scopeFilter={scopeFilter}
          onNavigate={onNavigate}
          onOpenQuickAdd={onOpenQuickAdd}
          onRefresh={onRefresh}
        />
      </div>

      {/* 4. Executive All-Modules Command Center (Animated 6-Module Hub with Staggered Entrance & Details) */}
      <AllModulesHub
        data={data}
        onNavigate={onNavigate}
        onToggleChecklist={handleToggleChecklist}
      />

      {/* 5. Financial Pulse: 6-Month Trend & Spend Mix / Budgets */}
      <FinancialPulseSection
        data={data}
        scopeFilter={scopeFilter}
        onNavigate={onNavigate}
      />

      {/* 6. Executive Command & Quick Action Launchpad */}
      <ExecutiveCommandSection
        data={data}
        onNavigate={onNavigate}
        onOpenQuickAdd={onOpenQuickAdd}
        onOpenAgent={onOpenAgent}
      />
    </div>
  );
}
