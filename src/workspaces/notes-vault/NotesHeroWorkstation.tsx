import React, { useRef, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  FileText,
  Link2,
  ListChecks,
  Pin,
  Plus,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import type { NoteScope } from '../../../shared/ledger-core.ts';
import { ScopeBadge } from '../../components/ui/Primitives.tsx';
import type { DossierFoilFinish, NotesIntelligence } from './notesVaultAnalytics.ts';

export interface NotesHeroWorkstationProps {
  intelligence: NotesIntelligence;
  activeScopeFilter: NoteScope | 'all';
  onScopeFilterChange: (scope: NoteScope | 'all') => void;
  onStartQuickNote: () => void;
  onStartQuickChecklist: () => void;
  onOpenFullEditor: () => void;
}

const FOIL_THEMES: Record<
  Exclude<DossierFoilFinish, 'auto'>,
  {
    background: string;
    border: string;
    accentText: string;
    badgeBg: string;
    badgeText: string;
    barColor: string;
    textColor: string;
    subtextColor: string;
  }
> = {
  obsidian: {
    background: 'linear-gradient(135deg, #FAF8F5 0%, #FFFFFF 100%)',
    border: '#E6E1D6',
    accentText: '#8C6D1F',
    badgeBg: '#F3EFEA',
    badgeText: '#8C6D1F',
    barColor: '#C59B27',
    textColor: '#111318',
    subtextColor: '#686E78',
  },
  gold: {
    background: 'linear-gradient(135deg, #FFFDF8 0%, #F9F5EC 100%)',
    border: '#E8DDBE',
    accentText: '#8C6D1F',
    badgeBg: '#F5ECD4',
    badgeText: '#7B5E14',
    barColor: '#C59B27',
    textColor: '#111318',
    subtextColor: '#686E78',
  },
  emerald: {
    background: 'linear-gradient(135deg, #F6FBF8 0%, #ECF6F0 100%)',
    border: '#C3E7D3',
    accentText: '#047857',
    badgeBg: '#E0F2E9',
    badgeText: '#065F46',
    barColor: '#059669',
    textColor: '#111318',
    subtextColor: '#4B5563',
  },
  platinum: {
    background: 'linear-gradient(135deg, #FCFCFD 0%, #F3F4F6 100%)',
    border: '#DDE1E5',
    accentText: '#475569',
    badgeBg: '#E2E8F0',
    badgeText: '#334155',
    barColor: '#64748B',
    textColor: '#111318',
    subtextColor: '#64748B',
  },
};

export const NotesHeroWorkstation: React.FC<NotesHeroWorkstationProps> = ({
  intelligence,
  activeScopeFilter,
  onScopeFilterChange,
  onStartQuickNote,
  onStartQuickChecklist,
  onOpenFullEditor,
}) => {
  const [foil, setFoil] = useState<DossierFoilFinish>('auto');
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const resolvedFoil: Exclude<DossierFoilFinish, 'auto'> =
    foil !== 'auto'
      ? foil
      : activeScopeFilter === 'business'
        ? 'gold'
        : activeScopeFilter === 'personal'
          ? 'emerald'
          : 'obsidian';

  const theme = FOIL_THEMES[resolvedFoil];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);
    setTilt({
      rotateX: Number(((0.5 - y) * 11).toFixed(2)),
      rotateY: Number(((x - 0.5) * 14).toFixed(2)),
      glareX: Math.round(x * 100),
      glareY: Math.round(y * 100),
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  };

  // SVG Ring for Checklist Completion
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, intelligence.checklistCompletionPct));
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left 5 Columns: 3D-Tilt Metallic Executive Memo & Dossier Card */}
      <div className="lg:col-span-5 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A7418]">
                EXECUTIVE MEMO DOSSIER
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <h3 className="text-xs font-bold text-[#111318]">
                  {activeScopeFilter === 'all'
                    ? 'All Scopes Portfolio'
                    : `${activeScopeFilter.charAt(0).toUpperCase() + activeScopeFilter.slice(1)} Dossier`}
                </h3>
                {activeScopeFilter !== 'all' && (
                  <ScopeBadge scope={activeScopeFilter} size="xs" />
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D6] bg-[#FAF8F5] px-2.5 py-1 text-[11px] font-semibold text-[#111318] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
          >
            <RotateCw className="h-3 w-3 text-[#9A7418]" />
            <span>Flip 3D</span>
          </button>
        </div>

        {/* 3D Metallic Card Stage */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => setFlipped((f) => !f)}
          style={{ perspective: '1100px' }}
          className="cursor-pointer select-none"
        >
          <div
            style={{
              background: theme.background,
              borderColor: theme.border,
              transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: 'transform 160ms ease-out',
            }}
            className="relative rounded-2xl border p-4 sm:p-5 text-[#111318] shadow-xs overflow-hidden min-h-[188px] flex flex-col justify-between"
          >
            {/* Specular Foil Glare */}
            <div
              style={{
                background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(197,155,39,0.1), transparent 60%)`,
              }}
              className="pointer-events-none absolute inset-0"
            />

            {!flipped ? (
              <>
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-9 rounded-md bg-white border border-[#D6CFC2] shadow-2xs flex items-center justify-center">
                      <div className="h-3.5 w-5 rounded-xs border border-[#C59B27]/40 bg-[#FAF8F5]" />
                    </div>
                    <div>
                      <div
                        style={{ color: theme.accentText }}
                        className="text-[9px] font-bold uppercase tracking-[0.16em]"
                      >
                        SOVEREIGN MEMO &amp; TASK LEDGER
                      </div>
                      <h4 className="text-sm font-bold text-[#111318] tracking-tight">
                        Actionable Dossier Hub
                      </h4>
                    </div>
                  </div>
                  <span
                    style={{ background: theme.badgeBg, color: theme.badgeText }}
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-[#E6E1D6]"
                  >
                    {intelligence.pinnedCount} PINNED
                  </span>
                </div>

                <div className="relative z-10 flex items-end justify-between gap-3 my-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#686E78]">
                      Action Checklist Velocity
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-[#111318]">
                      {intelligence.checklistCompletionPct}%{' '}
                      <span className="text-xs font-semibold text-[#686E78]">
                        ({intelligence.completedChecklistItems}/{intelligence.totalChecklistItems} done)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#686E78]">
                      Active Memos
                    </div>
                    <div
                      style={{ color: theme.accentText }}
                      className="text-base font-bold tabular-nums"
                    >
                      {intelligence.activeCount} Records
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-[#EAE5DC] overflow-hidden">
                    <div
                      style={{
                        width: `${Math.max(6, intelligence.checklistCompletionPct)}%`,
                        backgroundColor: theme.barColor,
                      }}
                      className="h-full rounded-full transition-all duration-300"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#686E78]">
                    <span>Open Tasks: {intelligence.openChecklistItems}</span>
                    <span style={{ color: theme.accentText }} className="font-semibold">
                      Linked Entities: {intelligence.linkedEntityNotesCount}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between border-b border-[#EAE5DC] pb-2">
                  <span
                    style={{ color: theme.accentText }}
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                  >
                    SCOPE MEMO BREAKDOWN (BUSINESS → FAMILY)
                  </span>
                  <span className="text-[10px] text-[#686E78]">Click to flip front</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {intelligence.scopeSlices.map((s) => (
                    <div
                      key={s.scope}
                      className="rounded-xl bg-white border border-[#E6E1D6] px-2.5 py-2 flex items-center justify-between shadow-2xs"
                    >
                      <span className="text-[#686E78] font-medium">{s.label}</span>
                      <span className="font-bold tabular-nums text-[#111318]">
                        {s.count} ({s.sharePct}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#686E78] pt-1 border-t border-[#EAE5DC]">
                  <span>Scheduled Reminders: {intelligence.remindersCount}</span>
                  <span>Overdue Alerts: {intelligence.overdueRemindersCount}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Foil Selector + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[#C59B27] mr-0.5" />
            {(['auto', 'obsidian', 'gold', 'emerald', 'platinum'] as DossierFoilFinish[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFoil(f)}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors cursor-pointer ${
                  foil === f
                    ? 'bg-[#111318] text-[#E5C158]'
                    : 'bg-[#FAF8F5] text-[#6B7280] hover:text-[#111318] border border-[#E6E1D6]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onStartQuickChecklist}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1 text-[11px] font-bold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
            >
              <ListChecks className="h-3 w-3 text-[#059669]" />
              <span>Checklist</span>
            </button>
            <button
              type="button"
              onClick={onOpenFullEditor}
              className="inline-flex items-center gap-1 rounded-xl bg-[#111318] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1E232D] cursor-pointer transition-colors"
            >
              <Plus className="h-3 w-3 text-[#E5C158]" />
              <span>New Memo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right 7 Columns: Interactive SVG Checklist Ring & Scope Distribution Telemetry */}
      <div className="lg:col-span-7 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9A7418]">
              ACTION VELOCITY &amp; ENTITY SCOPE TELEMETRY
            </div>
            <h3 className="text-sm font-bold text-[#111318]">
              Checklist Execution Ring &amp; Scope Allocation (Business → Personal → Family)
            </h3>
          </div>
          <button
            type="button"
            onClick={onStartQuickNote}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-[#C59B27]" />
            <span>Quick Capture</span>
          </button>
        </div>

        {/* Center Split: SVG Completion Ring + Interactive Scope Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] p-3.5 sm:p-4">
          {/* Left 5 Cols: SVG Ring */}
          <div className="sm:col-span-5 flex items-center gap-3.5">
            <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 108 108">
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  stroke="#E6E1D6"
                  strokeWidth="9"
                />
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  stroke="#059669"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-base font-extrabold text-[#111318] tabular-nums">
                  {intelligence.checklistCompletionPct}%
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Done
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="font-bold text-[#111318]">Task Execution</div>
              <div className="text-[11px] text-[#059669] font-semibold tabular-nums">
                ✓ {intelligence.completedChecklistItems} Completed
              </div>
              <div className="text-[11px] text-[#9A7418] font-semibold tabular-nums">
                ○ {intelligence.openChecklistItems} Open Tasks
              </div>
              <div className="text-[10px] text-[#6B7280]">
                Across {intelligence.checklistsCount} checklist(s)
              </div>
            </div>
          </div>

          {/* Right 7 Cols: Interactive Scope Allocation Bars */}
          <div className="sm:col-span-7 space-y-2 border-t sm:border-t-0 sm:border-l border-[#E6E1D6] pt-3 sm:pt-0 sm:pl-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">
              <span>Click Scope to Filter</span>
              <span>{intelligence.activeCount} Total Active</span>
            </div>
            {intelligence.scopeSlices.map((slice) => {
              const isSelected = activeScopeFilter === slice.scope;
              return (
                <button
                  key={slice.scope}
                  type="button"
                  onClick={() =>
                    onScopeFilterChange(isSelected ? 'all' : slice.scope)
                  }
                  className={`w-full text-left rounded-xl px-2.5 py-1.5 transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-white border-[#111318] shadow-2xs'
                      : 'bg-white/60 border-transparent hover:bg-white hover:border-[#E6E1D6]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[#111318] flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: slice.color }}
                      />
                      {slice.label}
                    </span>
                    <span className="font-bold text-[#111318] tabular-nums">
                      {slice.count} memo(s) · {slice.sharePct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#E6E1D6]/70 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(slice.count > 0 ? 6 : 0, slice.sharePct)}%`,
                        backgroundColor: slice.color,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom 4 KPI Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
          <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] flex items-center gap-1">
              <Pin className="h-3 w-3 text-[#C59B27]" /> Pinned Memos
            </div>
            <div className="text-sm font-extrabold text-[#111318] mt-0.5">
              {intelligence.pinnedCount} Priority
            </div>
          </div>

          <div className="rounded-xl border border-[#E6E1D6] bg-[#059669]/8 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#059669] flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Open Action Items
            </div>
            <div className="text-sm font-extrabold text-[#059669] mt-0.5">
              {intelligence.openChecklistItems} Pending
            </div>
          </div>

          <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] flex items-center gap-1">
              <BellRing className="h-3 w-3 text-[#C59B27]" /> Reminders
            </div>
            <div className="text-sm font-extrabold text-[#111318] mt-0.5">
              {intelligence.remindersCount} Active
            </div>
          </div>

          <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] flex items-center gap-1">
              <Link2 className="h-3 w-3 text-[#111318]" /> Ledger Linked
            </div>
            <div className="text-sm font-extrabold text-[#111318] mt-0.5">
              {intelligence.linkedEntityNotesCount} Records
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
