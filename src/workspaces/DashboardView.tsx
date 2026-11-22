import { useState } from 'react';
import {
  Building2,
  Calendar,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { api, type AdvisorBriefing, type DashboardSummary } from '../lib/api.ts';
import { formatDisplayDate } from '../lib/format.ts';
import { Button, Card, cn } from '../components/ui/Primitives.tsx';
import { AdvisorBillboard } from '../components/AdvisorBillboard.tsx';
import { CardSkeleton, MetricsSkeleton, Skeleton } from '../components/ui/Skeleton.tsx';
import type { Scope } from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';
import { DashboardExecutiveKpiStrip } from './dashboard/DashboardExecutiveKpiStrip.tsx';
import { AllModulesHub } from './dashboard/AllModulesHub.tsx';
import { ExecutiveCommandSection } from './dashboard/ExecutiveCommandSection.tsx';
import { InteractiveWealthChart } from './dashboard/InteractiveWealthChart.tsx';
import {
  LedgerDrillDownDrawer,
  type DrillDownFilterSpec,
} from './dashboard/LedgerDrillDownDrawer.tsx';
import { MetallicCardDeck } from './dashboard/MetallicCardDeck.tsx';
import type { WorkspaceId } from './dashboard/types.ts';

export type { WorkspaceId };

export function DashboardView({
  data,
  briefing = null,
  loading = false,
  systemLanguage = 'en',
  scopeFilter,
  onScopeChange: _onScopeChange,
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
  const [drillDownSpec, setDrillDownSpec] = useState<DrillDownFilterSpec | null>(null);
  const [mobileChartsOpen, setMobileChartsOpen] = useState(false);
  const dict = UI_STRINGS[systemLanguage];

  if (loading || !data) {
    return (
      <div className="space-y-5 animate-panel-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg bg-[#EAE5DC]" />
            ))}
          </div>
          <Skeleton className="h-4 w-40 rounded bg-[#EAE5DC]" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7">
            <CardSkeleton hasHeader rows={5} className="h-full" />
          </div>
          <div className="xl:col-span-5">
            <CardSkeleton hasHeader rows={5} className="h-full" />
          </div>
        </div>

        <MetricsSkeleton />
      </div>
    );
  }

  const handleToggleChecklist = async (noteId: string, itemId: string, done: boolean) => {
    await api.toggleChecklistItem(noteId, itemId, done);
    onRefresh();
  };

  const isFreshEmpty =
    (data?.banks?.length ?? 0) === 0 &&
    (data?.cards?.length ?? 0) === 0 &&
    (data?.loans?.length ?? 0) === 0 &&
    (data?.pinnedNotes?.length ?? 0) === 0;

  return (
    <div className="space-y-5 animate-panel-in">
      {/* Reference Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#52504C]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#059669]" />
          <span className="font-mono-data uppercase tracking-wider text-[11px] font-semibold text-[#111318]">
            Executive Financial Command
          </span>
          <span className="text-[#D6CFC2] hidden sm:inline">·</span>
          <span className="hidden sm:inline">Real-Time Double-Entry Telemetry</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#52504C] font-mono-data tabular-nums ml-auto">
          <Calendar className="w-3.5 h-3.5 text-[#C59B27]" />
          <span>{dict.dashboard.referenceDate}:</span>
          <strong className="font-semibold text-[#111318]">
            {formatDisplayDate(data.referenceDate) || data.referenceDate}
          </strong>
        </div>
      </div>

      {isFreshEmpty && (
        <Card className="p-6 border-[#D6CFC2] bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#111318]">{dict.dashboard.readyTitle}</h2>
              <p className="mt-1 text-sm text-[#52504C]">{dict.dashboard.readySubtitle}</p>
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

      {/* BENTO ROW 1: 4-Column Precision Telemetry Strip (Swipeable Snap Carousel on Mobile) */}
      <DashboardExecutiveKpiStrip
        data={data}
        onNavigate={onNavigate}
      />

      {/* Mobile 3D Deck & Wealth Chart Toggle */}
      <div className="md:hidden flex justify-center pt-1">
        <button
          type="button"
          onClick={() => setMobileChartsOpen(!mobileChartsOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#EAE5DC] px-3.5 py-1.5 text-xs font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer shadow-2xs transition-colors"
        >
          <span>{mobileChartsOpen ? 'Hide 3D Deck & Charts' : '📊 View 3D Card Deck & Wealth Chart'}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', mobileChartsOpen && 'rotate-180')} />
        </button>
      </div>

      {/* BENTO ROW 2: 7-Col Interactive SVG Wealth & Cashflow Chart + 5-Col Realistic 3D-Tilt Metallic Card Deck (Collapsible on Mobile, Full on Desktop) */}
      <div className={cn('gap-5 items-stretch', mobileChartsOpen ? 'grid grid-cols-1' : 'hidden md:grid md:grid-cols-1 xl:grid-cols-12')}>
        <div className="xl:col-span-7">
          <InteractiveWealthChart
            data={data}
            scopeFilter={scopeFilter}
            onNavigate={onNavigate}
            onInspectDrillDown={setDrillDownSpec}
          />
        </div>
        <div className="xl:col-span-5">
          <MetallicCardDeck
            data={data}
            onNavigate={onNavigate}
            onOpenQuickAdd={onOpenQuickAdd}
            onInspectDrillDown={setDrillDownSpec}
          />
        </div>
      </div>

      {/* BENTO ROW 3: 8-Col 30-Day Stress-Test Simulator & Macro Radar + 4-Col Priority Settlement & Live Ledger */}
      <div id="advisor-billboard" className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div className="xl:col-span-8">
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
        <div className="xl:col-span-4">
          <ExecutiveCommandSection
            data={data}
            onNavigate={onNavigate}
            onOpenQuickAdd={onOpenQuickAdd}
            onOpenAgent={onOpenAgent}
            onInspectDrillDown={setDrillDownSpec}
          />
        </div>
      </div>

      {/* BENTO ROW 4: 6 Specialized Workstations Grid */}
      <AllModulesHub
        data={data}
        onNavigate={onNavigate}
        onToggleChecklist={handleToggleChecklist}
      />

      {/* Interactive Slide-Over Ledger Drill-Down Drawer */}
      <LedgerDrillDownDrawer
        filter={drillDownSpec}
        scopeFilter={scopeFilter}
        onClose={() => setDrillDownSpec(null)}
        onOpenQuickAdd={onOpenQuickAdd}
        onNavigate={onNavigate}
      />
    </div>
  );
}
