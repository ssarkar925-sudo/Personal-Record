import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSpreadsheet,
  Layers,
  Plus,
  RotateCw,
  Sparkles,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type {
  SheetSummaryMetrics,
  WorkbookPortfolioTelemetry,
} from './jobSheetsAnalytics.ts';

type FoilFinish = 'auto' | 'obsidian' | 'gold' | 'emerald' | 'platinum';

export interface SheetsHeroWorkstationProps {
  telemetry: WorkbookPortfolioTelemetry;
  activeSummary: SheetSummaryMetrics | null;
  activeSheetId: string;
  saving: boolean;
  lastSavedLabel: string;
  onSelectSheet: (sheetId: string) => void;
  onCreateNewTab: (template: 'job_tracker' | 'freelance' | 'salary' | 'project' | 'blank') => void;
  onOpenImportExcel: () => void;
}

const FOIL_THEMES: Record<
  Exclude<FoilFinish, 'auto'>,
  {
    background: string;
    border: string;
    accentText: string;
    badgeBg: string;
    badgeText: string;
    barColor: string;
  }
> = {
  obsidian: {
    background: 'linear-gradient(135deg, #FAF8F5 0%, #FFFFFF 100%)',
    border: '#E6E1D6',
    accentText: '#8C6D1F',
    badgeBg: '#F3EFEA',
    badgeText: '#8C6D1F',
    barColor: '#C59B27',
  },
  gold: {
    background: 'linear-gradient(135deg, #FFFDF8 0%, #F9F5EC 100%)',
    border: '#E8DDBE',
    accentText: '#8C6D1F',
    badgeBg: '#F5ECD4',
    badgeText: '#7B5E14',
    barColor: '#C59B27',
  },
  emerald: {
    background: 'linear-gradient(135deg, #F6FBF8 0%, #ECF6F0 100%)',
    border: '#C3E7D3',
    accentText: '#047857',
    badgeBg: '#E0F2E9',
    badgeText: '#065F46',
    barColor: '#059669',
  },
  platinum: {
    background: 'linear-gradient(135deg, #FCFCFD 0%, #F3F4F6 100%)',
    border: '#DDE1E5',
    accentText: '#475569',
    badgeBg: '#E2E8F0',
    badgeText: '#334155',
    barColor: '#64748B',
  },
};

const TAB_DOT_COLORS: Record<string, string> = {
  gold: '#C59B27',
  emerald: '#059669',
  obsidian: '#111318',
  rose: '#E11D48',
  slate: '#686E78',
};

export const SheetsHeroWorkstation: React.FC<SheetsHeroWorkstationProps> = ({
  telemetry,
  activeSummary,
  activeSheetId,
  saving,
  lastSavedLabel,
  onSelectSheet,
  onCreateNewTab,
  onOpenImportExcel,
}) => {
  // Collapsible by default ("NOT ALWAYS OPEN")
  const [expanded, setExpanded] = useState(false);
  const [foil, setFoil] = useState<FoilFinish>('auto');
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const summary =
    activeSummary ??
    telemetry.sheetSummaries.find((s) => s.sheetId === activeSheetId) ??
    telemetry.sheetSummaries[0] ??
    null;

  const isFinancialSheet = summary?.hasCurrencyColumns ?? false;

  const resolvedFoil: Exclude<FoilFinish, 'auto'> =
    foil !== 'auto'
      ? foil
      : summary?.color === 'emerald'
        ? 'emerald'
        : summary?.color === 'obsidian'
          ? 'obsidian'
          : 'gold';

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

  // Ring metric adapts to whether this sheet has currency columns or non-monetary records
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const ringPct = isFinancialSheet
    ? summary && summary.totalBilledMinor > 0
      ? Math.min(100, Math.round((summary.totalReceivedMinor / summary.totalBilledMinor) * 100))
      : 100
    : summary?.filledRatePct ?? 0;
  const strokeDashoffset = circumference - (ringPct / 100) * circumference;

  const primaryCurrencyCol = summary?.numericColumnSummaries.find((c) => c.type === 'currency');
  const secondaryCurrencyCol = summary?.numericColumnSummaries
    .filter((c) => c.type === 'currency')[1];

  return (
    <div className="space-y-3">
      {/* Compact Top Bar (Always Visible, Never Intrusive) */}
      <div className="rounded-2xl border border-[#E6E1D6] bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_8px_24px_-18px_rgba(17,19,24,0.1)]">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#111318] truncate">
                {summary ? summary.sheetName : 'Multi-Tab Job Workbook'}
              </h2>
              <span className="rounded-md bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[10px] font-mono font-semibold text-[#686E78] uppercase">
                {summary ? `${summary.rowCount} rows · ${summary.columnCount} cols` : `${telemetry.totalSheets} tabs`}
              </span>
            </div>

            {/* Adaptive Inline Summary Chips Based on Active Sheet's Actual Columns */}
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-[#686E78]">
              {summary?.hasStatusColumn && summary.statusBreakdown.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {summary.statusBreakdown.slice(0, 3).map((st) => (
                    <span
                      key={st.label}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-[#111318] bg-[#FAF8F5] border border-[#E6E1D6] rounded px-1.5 py-0.2"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: TAB_DOT_COLORS[st.color] ?? '#C59B27' }}
                      />
                      <span>
                        {st.label}: <strong>{st.count}</strong>
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span>
                  Data Fill: <strong className="text-[#111318]">{summary?.filledRatePct ?? 0}%</strong>
                </span>
              )}

              {isFinancialSheet && primaryCurrencyCol && primaryCurrencyCol.totalMinor > 0 && (
                <span className="font-mono text-[10px] text-[#8C6D1F] bg-[#FDFBF4] border border-[#E6D5A7] rounded px-1.5 py-0.2">
                  {primaryCurrencyCol.label}: <strong>{formatINR(primaryCurrencyCol.totalMinor)}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls: Auto-Save Badge, Import Excel, New Tab, Toggle Overview Card */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-semibold border ${
              saving
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {saving ? 'Auto-saving...' : lastSavedLabel}
          </span>

          <button
            type="button"
            onClick={onOpenImportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
            title="Import .xlsx, .xls, or .csv file into a new or existing sheet tab"
          >
            <Upload className="h-3.5 w-3.5 text-[#059669]" />
            <span>Import Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => onCreateNewTab('job_tracker')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#111318] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E232D] cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#E5C158]" />
            <span>+ New Tab</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-xl border border-[#E6E1D6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#52504C] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer transition-colors"
            title={expanded ? 'Hide Sheet Summary Card' : 'Show Sheet Summary Card'}
          >
            <span>{expanded ? 'Hide Summary Card' : 'Sheet Summary Card'}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsible 12-Column Adaptive Hero Card (Only Rendered When User Opens It) */}
      {expanded && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-panel-in">
          {/* Left 5 Columns: Adaptive 3D-Tilt Metallic Sheet Card */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8C6D1F] block">
                    {isFinancialSheet ? 'Financial Sheet Card' : 'Active Sheet Dossier'}
                  </span>
                  <h3 className="text-xs font-bold text-[#111318] truncate max-w-[210px]">
                    {summary.sheetName}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] px-2.5 py-1 text-[11px] font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
              >
                <RotateCw className="h-3 w-3 text-[#8C6D1F]" />
                <span>Flip 3D</span>
              </button>
            </div>

            {/* 3D Metallic Card Surface — Adapts to Sheet Type */}
            <div
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={() => setFlipped((f) => !f)}
              className="relative rounded-2xl p-5 text-[#111318] select-none cursor-pointer overflow-hidden transition-transform duration-200 ease-out shadow-xs border"
              style={{
                background: theme.background,
                borderColor: theme.border,
                transform: `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
                minHeight: '186px',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                style={{
                  background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(197, 155, 39, 0.12) 0%, transparent 60%)`,
                }}
              />

              {!flipped ? (
                <div className="relative z-10 flex flex-col justify-between h-full min-h-[146px] gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-10 rounded-md border border-[#D6CFC2] bg-white shadow-2xs flex items-center justify-center shrink-0">
                        <Layers className="h-4 w-4 text-[#8C6D1F]" />
                      </div>
                      <div>
                        <div
                          className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em]"
                          style={{ color: theme.accentText }}
                        >
                          {summary.scope.toUpperCase()} · {isFinancialSheet ? 'FINANCIAL LEDGER' : 'WORKBOOK SHEET'}
                        </div>
                        <h4
                          className="text-sm sm:text-base font-bold text-[#111318] tracking-tight truncate max-w-[220px]"
                          style={{ fontFamily: 'var(--font-display)' }}
                        >
                          {summary.sheetName}
                        </h4>
                      </div>
                    </div>

                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0"
                      style={{
                        background: theme.badgeBg,
                        color: theme.badgeText,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      {summary.rowCount} ROWS · {summary.columnCount} COLS
                    </span>
                  </div>

                  {/* Adaptive Primary Metric Row */}
                  {isFinancialSheet && primaryCurrencyCol ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#686E78] truncate">
                          {primaryCurrencyCol.label}
                        </div>
                        <div className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-[#111318]">
                          {formatINR(primaryCurrencyCol.totalMinor)}
                        </div>
                      </div>
                      {secondaryCurrencyCol ? (
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-[#686E78] truncate">
                            {secondaryCurrencyCol.label}
                          </div>
                          <div
                            className="text-base sm:text-lg font-mono font-bold"
                            style={{ color: theme.accentText }}
                          >
                            {formatINR(secondaryCurrencyCol.totalMinor)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-[#686E78]">
                            Records Logged
                          </div>
                          <div
                            className="text-base sm:text-lg font-mono font-bold"
                            style={{ color: theme.accentText }}
                          >
                            {summary.rowCount} Entries
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#686E78]">
                          Total Sheet Records
                        </div>
                        <div className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-[#111318]">
                          {summary.rowCount} {summary.rowCount === 1 ? 'Entry' : 'Entries'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-[#686E78]">
                          {summary.hasStatusColumn ? 'Top Status' : 'Data Completeness'}
                        </div>
                        <div
                          className="text-sm sm:text-base font-mono font-bold truncate"
                          style={{ color: theme.accentText }}
                        >
                          {summary.hasStatusColumn && summary.statusBreakdown[0]
                            ? `${summary.statusBreakdown[0].label} (${summary.statusBreakdown[0].count})`
                            : `${summary.filledRatePct}% Populated`}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full rounded-full bg-[#EAE5DC] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, ringPct)}%`,
                          background: theme.barColor,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#686E78] font-mono">
                      <span>
                        {summary.hasStatusColumn
                          ? `${summary.completedCount} Done · ${summary.inProgressCount + summary.pendingCount} Open`
                          : `${summary.filledCellsCount}/${summary.totalCellsCount} Cells Populated`}
                      </span>
                      <span style={{ color: theme.accentText }}>{lastSavedLabel}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col justify-between h-full min-h-[146px] gap-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-[#EAE5DC] pb-2">
                    <span
                      className="text-[10px] font-mono uppercase tracking-[0.14em]"
                      style={{ color: theme.accentText }}
                    >
                      SHEET COLUMNS & STRUCTURE ({summary.columnCount} COLUMNS)
                    </span>
                    <span className="text-[10px] font-mono text-[#686E78]">Tap to flip</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white border border-[#E6E1D6] p-2 shadow-2xs">
                      <div className="text-[10px] text-[#686E78]">Data Profile</div>
                      <div className="font-mono font-bold text-xs text-[#8C6D1F] mt-0.5 capitalize">
                        {summary.profile.replace('_', ' ')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white border border-[#E6E1D6] p-2 shadow-2xs">
                      <div className="text-[10px] text-[#686E78]">Workbook Tabs</div>
                      <div className="font-mono font-bold text-xs text-emerald-700 mt-0.5">
                        {telemetry.totalSheets} Total Tabs
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#686E78] pt-1 border-t border-[#EAE5DC] font-mono">
                    <span>Excel (.xlsx/.csv) Ready</span>
                    <span style={{ color: theme.accentText }}>Auto-Save Active</span>
                  </div>
                </div>
              )}
            </div>

            {/* Foil Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#C59B27] mr-0.5" />
                {(['auto', 'obsidian', 'gold', 'emerald', 'platinum'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFoil(f)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors cursor-pointer ${
                      foil === f
                        ? 'bg-[#111318] text-[#E5C158]'
                        : 'bg-[#FAF8F5] text-[#686E78] hover:text-[#111318] border border-[#E6E1D6]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[#686E78] font-mono">
                Adapts to active tab columns
              </span>
            </div>
          </div>

          {/* Right 7 Columns: Adaptive Breakdown for the Active Sheet + All Tabs Switcher */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E6E1D6] bg-white p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-[0_12px_32px_-18px_rgba(17,19,24,0.1)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8C6D1F] block">
                  ADAPTIVE SHEET TELEMETRY
                </span>
                <h3 className="text-sm font-bold text-[#111318]">
                  {isFinancialSheet
                    ? 'Financial Column Breakdown & Tab Switcher'
                    : 'Status Distribution, Data Completeness & Tab Switcher'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs font-semibold text-[#686E78] hover:text-[#111318] cursor-pointer"
              >
                Collapse ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3.5">
              {/* SVG Progress Ring */}
              <div className="sm:col-span-5 flex items-center gap-3.5">
                <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 108 108">
                    <circle cx="54" cy="54" r={radius} fill="none" stroke="#E6E1D6" strokeWidth="9" />
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
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base font-mono font-bold text-[#111318]">{ringPct}%</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#686E78]">
                      {isFinancialSheet ? 'Realized' : 'Filled'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs min-w-0">
                  <div className="font-bold text-[#111318] truncate">{summary.sheetName}</div>
                  <div className="text-[#059669] font-mono font-semibold text-[11px]">
                    ✓ {summary.rowCount} Rows · {summary.columnCount} Columns
                  </div>
                  {summary.hasStatusColumn ? (
                    <div className="text-[#8C6D1F] font-mono font-semibold text-[11px]">
                      ○ {summary.statusBreakdown.length} Status Categories
                    </div>
                  ) : (
                    <div className="text-[#8C6D1F] font-mono font-semibold text-[11px]">
                      ○ {summary.filledCellsCount} Populated Cells
                    </div>
                  )}
                </div>
              </div>

              {/* Right 7 Cols inside box: Switch between Workbook Tabs */}
              <div className="sm:col-span-7 space-y-1.5 max-h-[132px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#686E78]">
                  <span>Workbook Tabs</span>
                  <span>{telemetry.totalSheets} Total</span>
                </div>
                {telemetry.sheetSummaries.map((s) => {
                  const isSelected = s.sheetId === activeSheetId;
                  const dotColor = TAB_DOT_COLORS[s.color] ?? '#C59B27';
                  return (
                    <button
                      key={s.sheetId}
                      type="button"
                      onClick={() => onSelectSheet(s.sheetId)}
                      className={`w-full text-left rounded-lg px-2.5 py-1.5 transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-white border-[#111318] shadow-2xs'
                          : 'bg-white/60 border-transparent hover:bg-white hover:border-[#E6E1D6]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#111318] flex items-center gap-1.5 truncate">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dotColor }} />
                          <span className="truncate">{s.sheetName}</span>
                        </span>
                        <span className="font-mono text-[#686E78] shrink-0 ml-2">
                          {s.rowCount} rows · {s.columnCount} cols
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Adaptive Bottom 4 Mini Cards (Adapts to Status / Numeric / Financial columns) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#686E78]">
                  <Layers className="h-3 w-3 text-[#C59B27]" />
                  <span>Rows & Cols</span>
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-[#111318]">
                  {summary.rowCount}R × {summary.columnCount}C
                </div>
              </div>

              <div className="rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#686E78]">
                  <TrendingUp className="h-3 w-3 text-[#111318]" />
                  <span>
                    {isFinancialSheet && primaryCurrencyCol ? primaryCurrencyCol.label : 'Data Fill Rate'}
                  </span>
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-[#111318] truncate">
                  {isFinancialSheet && primaryCurrencyCol
                    ? formatINR(primaryCurrencyCol.totalMinor)
                    : `${summary.filledRatePct}% Filled`}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  <span>
                    {isFinancialSheet && secondaryCurrencyCol
                      ? secondaryCurrencyCol.label
                      : 'Completed / Done'}
                  </span>
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-emerald-800 truncate">
                  {isFinancialSheet && secondaryCurrencyCol
                    ? formatINR(secondaryCurrencyCol.totalMinor)
                    : `${summary.completedCount} Records`}
                </div>
              </div>

              <div className="rounded-xl border border-[#E6D5A7] bg-[#FDFBF4] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8C6D1F]">
                  <Clock className="h-3 w-3 text-[#C59B27]" />
                  <span>Active / Open</span>
                </div>
                <div className="mt-1 text-sm font-mono font-bold text-[#8C6D1F] truncate">
                  {summary.inProgressCount + summary.pendingCount} Records
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
