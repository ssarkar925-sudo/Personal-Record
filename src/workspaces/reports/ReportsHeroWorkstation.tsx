import { useMemo, useRef, useState } from 'react';
import {
  Copy,
  FileSpreadsheet,
  Landmark,
  PieChart,
  RotateCw,
  Scale,
  Share2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { DetailedReports } from '../../lib/api.ts';
import type { TaxComparisonResult } from '../../../shared/tax-engine.ts';
import type { ReportTab, ReportsIntelligence } from './types.ts';
import {
  computeScopePnlSummary,
  type ReportFoilFinish,
} from './reportsAnalytics.ts';

export interface ReportsHeroWorkstationProps {
  data: DetailedReports | null;
  intelligence: ReportsIntelligence | null;
  taxComparison: TaxComparisonResult | null;
  fromDate: string;
  toDate: string;
  exportUrl: string;
  exportTaxPackUrl: string;
  onSelectTab: (tab: ReportTab) => void;
  onOpenWhatsAppModal: () => void;
}

const FOIL_THEMES: Record<
  Exclude<ReportFoilFinish, 'auto'>,
  {
    background: string;
    border: string;
    accentText: string;
    badgeBg: string;
    badgeText: string;
    progressColor: string;
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
    progressColor: '#C59B27',
    textColor: '#111318',
    subtextColor: '#686E78',
  },
  gold: {
    background: 'linear-gradient(135deg, #FFFDF8 0%, #F9F5EC 100%)',
    border: '#E8DDBE',
    accentText: '#8C6D1F',
    badgeBg: '#F5ECD4',
    badgeText: '#7B5E14',
    progressColor: '#C59B27',
    textColor: '#111318',
    subtextColor: '#686E78',
  },
  emerald: {
    background: 'linear-gradient(135deg, #F6FBF8 0%, #ECF6F0 100%)',
    border: '#C3E7D3',
    accentText: '#047857',
    badgeBg: '#E0F2E9',
    badgeText: '#065F46',
    progressColor: '#059669',
    textColor: '#111318',
    subtextColor: '#4B5563',
  },
  platinum: {
    background: 'linear-gradient(135deg, #FCFCFD 0%, #F3F4F6 100%)',
    border: '#DDE1E5',
    accentText: '#475569',
    badgeBg: '#E2E8F0',
    badgeText: '#334155',
    progressColor: '#64748B',
    textColor: '#111318',
    subtextColor: '#64748B',
  },
};

export function ReportsHeroWorkstation({
  data,
  intelligence,
  taxComparison,
  fromDate,
  toDate,
  exportUrl,
  exportTaxPackUrl,
  onSelectTab,
  onOpenWhatsAppModal,
}: ReportsHeroWorkstationProps) {
  const [foilOverride, setFoilOverride] = useState<ReportFoilFinish>('auto');
  const [isFlipped, setIsFlipped] = useState(false);
  const [telemetryTab, setTelemetryTab] = useState<'pnl' | 'scope' | 'tax'>('pnl');
  const [hoverMonthIdx, setHoverMonthIdx] = useState<number | null>(null);
  const [hoverScope, setHoverScope] = useState<string | null>(null);
  const [copiedSpec, setCopiedSpec] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  const pnlSummary = useMemo(
    () =>
      data
        ? computeScopePnlSummary(data.scopePnl)
        : {
            totalIncomeMinor: 0,
            totalExpenseMinor: 0,
            totalNetMinor: 0,
            overallExpenseRatioPct: 0,
            slices: [],
          },
    [data],
  );

  const activeTheme = useMemo(() => {
    if (foilOverride !== 'auto') return FOIL_THEMES[foilOverride];
    if (pnlSummary.totalNetMinor >= 0) return FOIL_THEMES.obsidian;
    return FOIL_THEMES.gold;
  }, [foilOverride, pnlSummary.totalNetMinor]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setTilt({
      rx: (0.5 - py) * 12,
      ry: (px - 0.5) * 14,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  };

  // Monthly Cashflow SVG Geometry
  const chartGeom = useMemo(() => {
    const months = data?.monthlyCashflow ?? [];
    const width = 560;
    const height = 195;
    const padL = 16;
    const padR = 16;
    const padT = 18;
    const padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const maxVal = Math.max(
      1,
      ...months.map((m) => Math.max(m.incomeMinor, m.expenseMinor)),
    );

    const pts = months.map((m, idx) => {
      const x =
        months.length === 1
          ? padL + innerW / 2
          : padL + (idx / Math.max(1, months.length - 1)) * innerW;
      const yInc = padT + innerH - (m.incomeMinor / maxVal) * innerH;
      const yExp = padT + innerH - (m.expenseMinor / maxVal) * innerH;
      return {
        ...m,
        x,
        yInc,
        yExp,
        netMinor: m.incomeMinor - m.expenseMinor,
      };
    });

    const buildSmoothPath = (coords: { x: number; y: number }[]) => {
      if (coords.length === 0) return '';
      if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
      let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const cx = ((p0.x + p1.x) / 2).toFixed(1);
        d += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      }
      return d;
    };

    const incLine = buildSmoothPath(pts.map((p) => ({ x: p.x, y: p.yInc })));
    const expLine = buildSmoothPath(pts.map((p) => ({ x: p.x, y: p.yExp })));
    const bottomY = padT + innerH;
    const firstX = pts[0]?.x ?? padL;
    const lastX = pts[pts.length - 1]?.x ?? width - padR;

    const incArea =
      pts.length > 0
        ? `${incLine} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`
        : '';
    const expArea =
      pts.length > 0
        ? `${expLine} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`
        : '';

    return { width, height, bottomY, pts, incLine, expLine, incArea, expArea };
  }, [data]);

  const activeMonthPoint =
    hoverMonthIdx !== null && chartGeom.pts[hoverMonthIdx]
      ? chartGeom.pts[hoverMonthIdx]
      : chartGeom.pts[chartGeom.pts.length - 1];

  const recommendedTaxMinor = taxComparison
    ? taxComparison.recommendedRegime === 'new'
      ? taxComparison.newRegime.totalTaxLiabilityMinor
      : taxComparison.oldRegime.totalTaxLiabilityMinor
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch no-print">
      {/* ================= LEFT 5 COLS: 3D METALLIC AUDIT & CA DOSSIER STAGE ================= */}
      <div className="lg:col-span-5 rounded-3xl bg-white border border-[#E6E1D6] p-5 shadow-[0_12px_32px_rgba(17,19,24,0.04)] flex flex-col justify-between space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </span>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#C59B27] font-bold block">
                AUDIT & ITR CERTIFICATE
              </span>
              <h3 className="font-display text-xs font-bold text-[#111318]">
                {fromDate} → {toDate}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsFlipped((f) => !f)}
            className="px-2.5 py-1 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[11px] font-semibold text-[#111318] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <RotateCw className="w-3 h-3 text-[#C59B27]" />
            <span>Flip 3D</span>
          </button>
        </div>

        {/* 3D Interactive Metallic Audit Card */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => setIsFlipped((f) => !f)}
          className="relative w-full min-h-[236px] rounded-2xl p-5 text-[#111318] select-none cursor-pointer transition-transform duration-200 ease-out overflow-hidden shadow-xs border"
          style={{
            background: activeTheme.background,
            borderColor: activeTheme.border,
            transform: `perspective(1000px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: tilt.active ? 0.28 : 0.12,
              background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(197,155,39,0.15), transparent 60%)`,
            }}
          />

          {!isFlipped ? (
            <div className="relative z-10 flex flex-col justify-between h-full min-h-[196px] space-y-4">
              {/* Top Row: EMV Seal + Audit Status Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-7 rounded-md border flex items-center justify-center shadow-inner shrink-0 bg-white"
                    style={{
                      borderColor: '#D6CFC2',
                    }}
                  >
                    <div className="w-6 h-4 border border-[#C59B27]/40 rounded-xs grid grid-cols-2 gap-0.5 p-0.5 bg-[#FAF8F5]">
                      <span className="border-r border-[#C59B27]/40" />
                      <span />
                    </div>
                  </div>
                  <div>
                    <span
                      className="text-[9px] font-mono uppercase tracking-[0.16em] block font-bold"
                      style={{ color: activeTheme.accentText }}
                    >
                      SOVEREIGN P&L & TAX DOSSIER
                    </span>
                    <h4 className="font-display text-base font-bold text-[#111318] tracking-tight">
                      Consolidated Audit Pack
                    </h4>
                  </div>
                </div>

                <span
                  className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: activeTheme.badgeBg,
                    color: activeTheme.badgeText,
                    borderColor: activeTheme.border,
                  }}
                >
                  {taxComparison
                    ? taxComparison.recommendedRegime === 'new'
                      ? 'NEW 115BAC'
                      : 'OLD REGIME'
                    : 'AUDIT READY'}
                </span>
              </div>

              {/* Middle Row: Net Surplus & Tax Liability */}
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#686E78] block font-semibold">
                    Consolidated Net Surplus
                  </span>
                  <div className="text-2xl sm:text-3xl font-bold font-mono-data tabular-nums tracking-tight text-[#111318] mt-0.5">
                    {formatINR(pnlSummary.totalNetMinor, { signed: true })}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-[#686E78] block font-semibold">
                    Est. Income Tax
                  </span>
                  <div
                    className="text-sm font-bold font-mono-data tabular-nums mt-0.5"
                    style={{ color: activeTheme.accentText }}
                  >
                    {formatINR(recommendedTaxMinor)}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Savings Rate Bar & Runway */}
              <div className="space-y-1.5 pt-1">
                <div className="w-full h-1.5 rounded-full bg-[#EAE5DC] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(5, Math.min(100, intelligence?.savingsRatePct ?? 50))}%`,
                      backgroundColor: activeTheme.progressColor,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#686E78] font-mono">
                  <span>Savings Velocity: {intelligence?.savingsRatePct ?? 0}%</span>
                  <span className="font-semibold" style={{ color: activeTheme.accentText }}>
                    Runway: {intelligence?.runwayMonths ?? 0} Months
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Back of 3D Card: Scope P&L Breakdown */
            <div className="relative z-10 flex flex-col justify-between h-full min-h-[196px] space-y-3">
              <div className="flex items-center justify-between border-b border-[#EAE5DC] pb-2">
                <div>
                  <span
                    className="text-[10px] font-mono uppercase tracking-widest block font-bold"
                    style={{ color: activeTheme.accentText }}
                  >
                    CA AUDIT SCOPE BREAKDOWN
                  </span>
                  <h4 className="text-sm font-bold text-[#111318]">
                    Business · Personal · Family P&L
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = `Consolidated Net: ${formatINR(pnlSummary.totalNetMinor, { signed: true })} | Income: ${formatINR(pnlSummary.totalIncomeMinor)} | Expense: ${formatINR(pnlSummary.totalExpenseMinor)}`;
                    void navigator.clipboard?.writeText(text);
                    setCopiedSpec(true);
                    setTimeout(() => setCopiedSpec(false), 2000);
                  }}
                  className="px-2 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E6E1D6] text-[10px] font-semibold text-[#111318] flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedSpec ? 'Copied!' : 'Copy Spec'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2 rounded-xl bg-white border border-[#E6E1D6] shadow-2xs">
                  <span className="text-[10px] text-[#686E78] block">Business Net Profit</span>
                  <span className="font-mono font-bold text-[#111318] text-xs block mt-0.5">
                    {formatINR(data?.scopePnl?.business?.netMinor ?? 0, { signed: true })}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-[#E6E1D6] shadow-2xs">
                  <span className="text-[10px] text-[#686E78] block">Personal Net Savings</span>
                  <span className="font-mono font-bold text-[#111318] text-xs block mt-0.5">
                    {formatINR(data?.scopePnl?.personal?.netMinor ?? 0, { signed: true })}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-[#E6E1D6] shadow-2xs">
                  <span className="text-[10px] text-[#686E78] block">Family Net Outflow</span>
                  <span className="font-mono font-bold text-[#111318] text-xs block mt-0.5">
                    {formatINR(data?.scopePnl?.family?.netMinor ?? 0, { signed: true })}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-[#E6E1D6] shadow-2xs">
                  <span className="text-[10px] text-[#686E78] block">Operating Expense Ratio</span>
                  <span className="font-mono font-bold text-[#111318] text-xs block mt-0.5">
                    {pnlSummary.overallExpenseRatioPct}% of Inflow
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#686E78] pt-1 border-t border-[#EAE5DC]">
                <span>ITR Schedule Verified</span>
                <span>Click anywhere on card to flip front</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Stage Footer: Foil Customizer + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#C59B27] mr-0.5" />
            {(['auto', 'obsidian', 'gold', 'emerald', 'platinum'] as const).map((foil) => (
              <button
                key={foil}
                type="button"
                onClick={() => setFoilOverride(foil)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold capitalize transition-all cursor-pointer ${
                  foilOverride === foil
                    ? 'bg-[#111318] text-[#E5C158] font-bold shadow-2xs'
                    : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                }`}
              >
                {foil}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTab('tax_pack')}
              className="px-3 py-1.5 rounded-xl bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer"
            >
              CA Tax Pack
            </button>
            <button
              type="button"
              onClick={onOpenWhatsAppModal}
              className="px-2.5 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp CA</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= RIGHT 7 COLS: INTERACTIVE SVG P&L, SCOPE RING & TAX COMPARATOR ================= */}
      <div className="lg:col-span-7 rounded-3xl bg-white border border-[#E6E1D6] p-5 shadow-[0_12px_32px_rgba(17,19,24,0.04)] flex flex-col justify-between space-y-4">
        {/* Top Telemetry Header & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E1D6]/80 pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#C59B27] font-bold block">
              INSTITUTIONAL P&L & TAX TELEMETRY
            </span>
            <h3 className="font-display text-base font-bold text-[#111318] mt-0.5">
              {telemetryTab === 'pnl'
                ? 'Monthly Inflow vs Outflow Cashflow Trajectory'
                : telemetryTab === 'scope'
                  ? 'Scope Expenditure & Net Savings Ring'
                  : 'Indian Income Tax Regime Comparator (Sec 115BAC vs Old)'}
            </h3>
          </div>

          <div className="flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTelemetryTab('pnl')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'pnl'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-[#059669]" />
              <span>P&L Curve</span>
            </button>
            <button
              type="button"
              onClick={() => setTelemetryTab('scope')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'scope'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <PieChart className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Scope Mix</span>
            </button>
            <button
              type="button"
              onClick={() => setTelemetryTab('tax')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'tax'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>Tax Regime</span>
            </button>
          </div>
        </div>

        {/* TAB 1: MONTHLY P&L CASHFLOW AREA CHART */}
        {telemetryTab === 'pnl' && (
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF8F5] p-3 rounded-2xl border border-[#E6E1D6] text-xs">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-semibold text-[#111318]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
                  Inflow: {formatINR(pnlSummary.totalIncomeMinor, { compact: true })}
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-[#111318]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48]" />
                  Outflow: {formatINR(pnlSummary.totalExpenseMinor, { compact: true })}
                </span>
              </div>

              {activeMonthPoint && (
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="font-bold text-[#111318]">{activeMonthPoint.month}</span>
                  <span className="text-[#059669]">
                    +{formatINR(activeMonthPoint.incomeMinor, { compact: true })}
                  </span>
                  <span className="text-[#E11D48]">
                    -{formatINR(activeMonthPoint.expenseMinor, { compact: true })}
                  </span>
                </div>
              )}
            </div>

            <div className="relative w-full overflow-hidden rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]/80 p-2">
              {chartGeom.pts.length === 0 ? (
                <div className="h-[185px] flex items-center justify-center text-xs text-[#52504C]">
                  No cashflow data recorded in selected date range.
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
                  className="w-full h-[185px] overflow-visible"
                >
                  <defs>
                    <linearGradient id="repIncGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="repExpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E11D48" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#E11D48" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {[0.2, 0.5, 0.8].map((ratio, idx) => {
                    const y = 18 + ratio * (chartGeom.height - 44);
                    return (
                      <line
                        key={idx}
                        x1={16}
                        y1={y}
                        x2={chartGeom.width - 16}
                        y2={y}
                        stroke="#E6E1D6"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                    );
                  })}

                  <path d={chartGeom.incArea} fill="url(#repIncGrad)" />
                  <path d={chartGeom.incLine} fill="none" stroke="#059669" strokeWidth="2.8" />

                  <path d={chartGeom.expArea} fill="url(#repExpGrad)" />
                  <path
                    d={chartGeom.expLine}
                    fill="none"
                    stroke="#E11D48"
                    strokeWidth="2.2"
                    strokeDasharray="4 3"
                  />

                  {chartGeom.pts.map((pt, idx) => {
                    const isHovered = hoverMonthIdx === idx;
                    return (
                      <g
                        key={pt.month}
                        onMouseEnter={() => setHoverMonthIdx(idx)}
                        onMouseLeave={() => setHoverMonthIdx(null)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={pt.x - 22}
                          y={10}
                          width={44}
                          height={chartGeom.height - 25}
                          fill="transparent"
                        />
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={16}
                            x2={pt.x}
                            y2={chartGeom.bottomY}
                            stroke="#C59B27"
                            strokeWidth="1.2"
                            strokeDasharray="2 2"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.yInc}
                          r={isHovered ? 5 : 3.2}
                          fill="#059669"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={pt.x}
                          cy={pt.yExp}
                          r={isHovered ? 4.5 : 2.8}
                          fill="#E11D48"
                          stroke="#FFFFFF"
                          strokeWidth="1.2"
                        />
                        <text
                          x={pt.x}
                          y={chartGeom.height - 6}
                          textAnchor="middle"
                          className="text-[9px] font-mono fill-[#52504C]"
                        >
                          {pt.month.slice(5)}/{pt.month.slice(2, 4)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                <span className="text-[10px] uppercase font-bold text-[#52504C] block">
                  Avg Monthly Burn
                </span>
                <span className="font-mono font-bold text-sm text-[#111318] mt-0.5 block">
                  {formatINR(intelligence?.averageMonthlyBurnMinor ?? 0, { compact: true })}/mo
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#059669]/8 border border-[#059669]/25">
                <span className="text-[10px] uppercase font-bold text-[#059669] block">
                  Net Period Surplus
                </span>
                <span className="font-mono font-bold text-sm text-[#059669] mt-0.5 block">
                  {formatINR(pnlSummary.totalNetMinor, { compact: true, signed: true })}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                <span className="text-[10px] uppercase font-bold text-[#52504C] block">
                  Expense Ratio
                </span>
                <span className="font-mono font-bold text-sm text-[#C59B27] mt-0.5 block">
                  {pnlSummary.overallExpenseRatioPct}% of Revenue
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SCOPE EXPENDITURE & NET SAVINGS RING */}
        {telemetryTab === 'scope' && (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center flex-1 py-1">
            <div className="sm:col-span-5 flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  {(() => {
                    const radius = 44;
                    const circumference = 2 * Math.PI * radius;
                    let accumulatedPct = 0;

                    return pnlSummary.slices.map((slice) => {
                      const pct = Math.max(0, slice.expenseSharePct);
                      const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
                      accumulatedPct += pct;
                      const isHovered = hoverScope === slice.scope;

                      return (
                        <circle
                          key={slice.scope}
                          cx="60"
                          cy="60"
                          r={radius}
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? 16 : 13}
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-300 cursor-pointer"
                          onMouseEnter={() => setHoverScope(slice.scope)}
                          onMouseLeave={() => setHoverScope(null)}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#52504C]">
                    {hoverScope
                      ? pnlSummary.slices.find((s) => s.scope === hoverScope)?.label
                      : 'Total Outflow'}
                  </span>
                  <span className="text-sm font-bold font-mono-data text-[#111318] mt-0.5">
                    {hoverScope
                      ? formatINR(
                          pnlSummary.slices.find((s) => s.scope === hoverScope)?.expenseMinor || 0,
                          { compact: true },
                        )
                      : formatINR(pnlSummary.totalExpenseMinor, { compact: true })}
                  </span>
                </div>
              </div>
            </div>

            <div className="sm:col-span-7 space-y-2.5">
              {pnlSummary.slices.map((slice) => (
                <div
                  key={slice.scope}
                  onMouseEnter={() => setHoverScope(slice.scope)}
                  onMouseLeave={() => setHoverScope(null)}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    hoverScope === slice.scope
                      ? 'bg-[#FAF8F5] border-[#111318] shadow-2xs'
                      : 'bg-[#FAF8F5]/60 border-[#E6E1D6]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <div>
                      <div className="text-xs font-bold text-[#111318]">{slice.label} Scope</div>
                      <div className="text-[10px] text-[#52504C] font-mono">
                        In: {formatINR(slice.incomeMinor, { compact: true })} · Out:{' '}
                        {formatINR(slice.expenseMinor, { compact: true })} ({slice.expenseSharePct}
                        %)
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-right font-mono font-bold text-xs ${
                      slice.netMinor >= 0 ? 'text-[#059669]' : 'text-[#E11D48]'
                    }`}
                  >
                    {formatINR(slice.netMinor, { signed: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: REGIME TAX COMPARATOR */}
        {telemetryTab === 'tax' && (
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            {taxComparison ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#111318] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#C59B27]">
                        NEW REGIME (SEC 115BAC)
                      </span>
                      {taxComparison.recommendedRegime === 'new' && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#059669]/12 text-[#059669] border border-[#059669]/25">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-bold font-mono-data text-[#111318]">
                      {formatINR(taxComparison.newRegime.totalTaxLiabilityMinor)}
                    </div>
                    <div className="text-[11px] text-[#52504C] font-mono">
                      Effective Rate: {taxComparison.newRegime.effectiveTaxRatePct}% · Taxable:{' '}
                      {formatINR(taxComparison.newRegime.netTaxableIncomeMinor, { compact: true })}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-[#52504C]">
                        OLD REGIME (VI-A DEDUCTIONS)
                      </span>
                      {taxComparison.recommendedRegime === 'old' && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#059669]/12 text-[#059669] border border-[#059669]/25">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-bold font-mono-data text-[#111318]">
                      {formatINR(taxComparison.oldRegime.totalTaxLiabilityMinor)}
                    </div>
                    <div className="text-[11px] text-[#52504C] font-mono">
                      Effective Rate: {taxComparison.oldRegime.effectiveTaxRatePct}% · Claims:{' '}
                      {formatINR(taxComparison.oldRegime.chapterVIAClaimsMinor, { compact: true })}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#059669]/8 border border-[#059669]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-[#111318] block">
                      {taxComparison.summaryText}
                    </span>
                    <span className="text-[11px] text-[#52504C]">
                      Includes 4% Health & Education Cess and Finance Act 2024 slabs.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={exportTaxPackUrl}
                      className="px-3 py-1.5 rounded-xl bg-white border border-[#E6E1D6] text-[#111318] font-semibold text-xs flex items-center gap-1 hover:bg-[#F3EFEA]"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[#C59B27]" />
                      <span>CA CSV</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelectTab('tax_pack')}
                      className="px-3 py-1.5 rounded-xl bg-[#111318] text-[#FAF8F5] font-semibold text-xs cursor-pointer"
                    >
                      Optimize 80C/80D →
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6] text-center space-y-2.5 my-auto">
                <Landmark className="w-7 h-7 text-[#C59B27] mx-auto" />
                <div className="text-xs font-bold text-[#111318]">
                  Interactive Indian Income Tax Engine Ready
                </div>
                <p className="text-[11px] text-[#52504C] max-w-md mx-auto">
                  Open the CA & Tax Pack workstation below to compute Old vs New Regime (Sec 115BAC)
                  slabs, Section 80C/80D deductions, and quarterly Advance Tax installments.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectTab('tax_pack')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#111318] text-[#FAF8F5] text-xs font-semibold cursor-pointer"
                  >
                    Launch CA & Tax Pack Engine
                  </button>
                  <a
                    href={exportUrl}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-[#E6E1D6] text-[#111318] text-xs font-semibold"
                  >
                    Export Ledger CSV
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
