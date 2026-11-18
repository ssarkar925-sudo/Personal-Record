import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Landmark,
  MessageCircle,
  Pencil,
  PieChart,
  Plus,
  RotateCw,
  Sparkles,
  TrendingDown,
  Users,
} from 'lucide-react';
import { buildWhatsAppLink, formatINR, rupeesToPaise } from '../../lib/format.ts';
import type {
  AccountRecord,
  DebtPayoffResult,
  LoanRecord,
  PersonDueRecord,
  PersonNetSummary,
  SavingsGoalRecord,
} from '../../lib/api.ts';
import type { SelectedLoansItem } from './types.ts';
import {
  buildAmortizationProjectionSeries,
  computeLiabilityReceivableMix,
  resolveLoanCardTheme,
  type LoanFoilFinish,
} from './loansDuesAnalytics.ts';

export interface LoansHeroWorkstationProps {
  loans: LoanRecord[];
  dues: PersonDueRecord[];
  goals: SavingsGoalRecord[];
  dueSummaries: PersonNetSummary[];
  accounts: AccountRecord[];
  selectedItem: SelectedLoansItem;
  payoffPlan: DebtPayoffResult | null;
  payoffExtraRupees: string;
  payoffStrategy: 'avalanche' | 'snowball';
  onPayoffExtraChange: (val: string) => void;
  onPayoffStrategyChange: (strat: 'avalanche' | 'snowball') => void;
  onSelectItem: (item: SelectedLoansItem) => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenContributeGoal: (goal: SavingsGoalRecord) => void;
  onOpenEditLoan: (loan: LoanRecord) => void;
  onOpenEditDue: (due: PersonDueRecord) => void;
  onOpenEditGoal: (goal: SavingsGoalRecord) => void;
  onOpenAddLoan: () => void;
  onOpenAddDue: () => void;
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
}

function safeRupeesToPaise(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  try {
    return Math.max(0, rupeesToPaise(trimmed));
  } catch {
    return 0;
  }
}

export function LoansHeroWorkstation({
  loans,
  dues,
  goals,
  dueSummaries,
  accounts,
  selectedItem,
  payoffPlan,
  payoffExtraRupees,
  payoffStrategy,
  onPayoffExtraChange,
  onPayoffStrategyChange,
  onSelectItem,
  onOpenPayEmi,
  onOpenSettleDue,
  onOpenContributeGoal,
  onOpenEditLoan,
  onOpenEditDue,
  onOpenEditGoal,
  onOpenAddLoan,
  onOpenAddDue,
  onNotify,
}: LoansHeroWorkstationProps) {
  const [foilOverride, setFoilOverride] = useState<LoanFoilFinish>('auto');
  const [isFlipped, setIsFlipped] = useState(false);
  const [telemetryTab, setTelemetryTab] = useState<'amortization' | 'mix' | 'khatabook'>('amortization');
  const [hoverMonthIdx, setHoverMonthIdx] = useState<number | null>(null);
  const [hoverSliceId, setHoverSliceId] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  // Active item shown in the 3D stage (falls back to first loan, due, or goal)
  const stageItem: SelectedLoansItem = useMemo(() => {
    if (selectedItem) return selectedItem;
    if (loans.length > 0) return { kind: 'loan', data: loans[0] };
    if (dues.length > 0) return { kind: 'due', data: dues[0] };
    if (goals.length > 0) return { kind: 'goal', data: goals[0] };
    return null;
  }, [selectedItem, loans, dues, goals]);

  const theme = useMemo(
    () => resolveLoanCardTheme(stageItem, foilOverride),
    [stageItem, foilOverride],
  );

  const extraMonthlyMinor = useMemo(() => safeRupeesToPaise(payoffExtraRupees), [payoffExtraRupees]);

  const projectionSeries = useMemo(
    () => buildAmortizationProjectionSeries(loans, extraMonthlyMinor, 12),
    [loans, extraMonthlyMinor],
  );

  const mixSlices = useMemo(
    () => computeLiabilityReceivableMix(loans, dues, goals),
    [loans, dues, goals],
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = Math.max(0, Math.min(1, x / rect.width));
    const py = Math.max(0, Math.min(1, y / rect.height));
    const ry = (px - 0.5) * 14;
    const rx = (0.5 - py) * 12;
    setTilt({ rx, ry, gx: Math.round(px * 100), gy: Math.round(py * 100), active: true });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  };

  // Stage Item Computed Properties
  const stageDetails = useMemo(() => {
    if (!stageItem) return null;
    if (stageItem.kind === 'loan') {
      const l = stageItem.data;
      const paidMinor = Math.max(0, l.principalMinor - l.remainingMinor);
      const pct = l.principalMinor > 0 ? Math.min(100, Math.round((paidMinor / l.principalMinor) * 100)) : 100;
      const linkedBank = accounts.find((a) => a.id === l.linkedAccountId);
      return {
        kindLabel: l.direction === 'lent' ? 'LENT COVENANT' : 'INSTITUTIONAL LOAN BOND',
        title: l.name,
        subtitle: l.counterparty,
        scope: l.scope,
        primaryLabel: l.direction === 'lent' ? 'Receivable Principal' : 'Remaining Principal',
        primaryAmount: formatINR(l.remainingMinor),
        secondaryLabel: 'Scheduled EMI',
        secondaryAmount: formatINR(l.emiMinor),
        progressPct: pct,
        progressLabel: `${pct}% Principal Cleared`,
        metaLeft: `${(l.annualRateBps / 100).toFixed(2)}% APR · ${l.tenureMonths}M`,
        metaRight: `Next EMI: ${l.nextDueDate}`,
        backRows: [
          { label: 'Original Principal', value: formatINR(l.principalMinor) },
          { label: 'Principal Repaid', value: formatINR(paidMinor) },
          { label: 'Interest Paid to Date', value: formatINR(l.totalInterestPaidMinor) },
          { label: 'Linked Bank Account', value: linkedBank?.name || 'Manual Settlement' },
        ],
        whatsappUrl: null as string | null,
      };
    }

    if (stageItem.kind === 'due') {
      const d = stageItem.data;
      const paidMinor = Math.max(0, d.amountMinor - d.remainingMinor);
      const pct = d.amountMinor > 0 ? Math.min(100, Math.round((paidMinor / d.amountMinor) * 100)) : 100;
      const isNeed = d.direction === 'need';
      const whatsappUrl = isNeed
        ? buildWhatsAppLink(
            d.phone,
            `Hi ${d.personName}, gentle reminder regarding pending balance of ${formatINR(d.remainingMinor)}${d.note ? ` (${d.note})` : ''}.`,
          )
        : null;
      return {
        kindLabel: isNeed ? 'KHATABOOK RECEIVABLE' : 'KHATABOOK PAYABLE',
        title: d.personName,
        subtitle: d.phone || 'Direct Personal Ledger',
        scope: d.scope,
        primaryLabel: isNeed ? 'Owed to You (Asset)' : 'You Owe (Liability)',
        primaryAmount: formatINR(d.remainingMinor),
        secondaryLabel: 'Original Entry',
        secondaryAmount: formatINR(d.amountMinor),
        progressPct: pct,
        progressLabel: `${pct}% Settled`,
        metaLeft: d.note || 'Khatabook Udhar Record',
        metaRight: d.dueDate ? `Due: ${d.dueDate}` : 'Flexible Settlement',
        backRows: [
          { label: 'Counterparty Name', value: d.personName },
          { label: 'Contact Phone', value: d.phone || 'Not Linked' },
          { label: 'Initial Amount', value: formatINR(d.amountMinor) },
          { label: 'Status', value: d.status.toUpperCase() },
        ],
        whatsappUrl,
      };
    }

    const g = stageItem.data;
    const pct = g.targetMinor > 0 ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100)) : 0;
    return {
      kindLabel: 'SOVEREIGN RESERVE GOAL',
      title: g.title,
      subtitle: g.kind.replace('_', ' ').toUpperCase(),
      scope: g.scope,
      primaryLabel: 'Current Funded Reserve',
      primaryAmount: formatINR(g.currentMinor),
      secondaryLabel: 'Target Corpus',
      secondaryAmount: formatINR(g.targetMinor),
      progressPct: pct,
      progressLabel: `${pct}% Corpus Funded`,
      metaLeft: g.note || 'Dedicated Capital Reserve',
      metaRight: g.targetDate ? `Target: ${g.targetDate}` : 'Ongoing Reserve',
      backRows: [
        { label: 'Reserve Category', value: g.kind.toUpperCase() },
        { label: 'Current Balance', value: formatINR(g.currentMinor) },
        { label: 'Remaining to Target', value: formatINR(Math.max(0, g.targetMinor - g.currentMinor)) },
        { label: 'Target Horizon', value: g.targetDate || 'Flexible' },
      ],
      whatsappUrl: null as string | null,
    };
  }, [stageItem, accounts]);

  // SVG Area Chart Geometry
  const chartGeom = useMemo(() => {
    const width = 560;
    const height = 195;
    const padL = 14;
    const padR = 14;
    const padT = 18;
    const padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const maxVal = Math.max(
      1,
      ...projectionSeries.map((p) => Math.max(p.baselineMinor, p.acceleratedMinor)),
    );

    const pts = projectionSeries.map((pt, idx) => {
      const x = padL + (idx / Math.max(1, projectionSeries.length - 1)) * innerW;
      const yBase = padT + innerH - (pt.baselineMinor / maxVal) * innerH;
      const yAccel = padT + innerH - (pt.acceleratedMinor / maxVal) * innerH;
      return { ...pt, x, yBase, yAccel };
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

    const baseLine = buildSmoothPath(pts.map((p) => ({ x: p.x, y: p.yBase })));
    const accelLine = buildSmoothPath(pts.map((p) => ({ x: p.x, y: p.yAccel })));
    const bottomY = padT + innerH;
    const firstX = pts[0]?.x ?? padL;
    const lastX = pts[pts.length - 1]?.x ?? width - padR;

    const baseArea = `${baseLine} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
    const accelArea = `${accelLine} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    return { width, height, bottomY, pts, baseLine, accelLine, baseArea, accelArea };
  }, [projectionSeries]);

  const activePoint =
    hoverMonthIdx !== null && chartGeom.pts[hoverMonthIdx]
      ? chartGeom.pts[hoverMonthIdx]
      : chartGeom.pts[chartGeom.pts.length - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      {/* ================= LEFT 5 COLS: 3D METALLIC COVENANT & KHATABOOK STAGE ================= */}
      <div className="lg:col-span-5 rounded-3xl bg-white border border-[#E6E1D6] p-5 shadow-[0_12px_32px_rgba(17,19,24,0.04)] flex flex-col justify-between space-y-4">
        {/* Top Stage Bar: Instrument Switcher & Foil Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none max-w-full">
            {loans.slice(0, 3).map((l) => {
              const active = stageItem?.kind === 'loan' && stageItem.data.id === l.id;
              return (
                <button
                  key={`stage-loan-${l.id}`}
                  type="button"
                  onClick={() => {
                    onSelectItem({ kind: 'loan', data: l });
                    setIsFlipped(false);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                    active
                      ? 'bg-[#111318] text-[#FAF8F5] shadow-xs'
                      : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  <Landmark className="w-3 h-3 text-[#C59B27]" />
                  <span className="truncate max-w-[105px]">{l.name}</span>
                </button>
              );
            })}
            {dues.slice(0, 2).map((d) => {
              const active = stageItem?.kind === 'due' && stageItem.data.id === d.id;
              return (
                <button
                  key={`stage-due-${d.id}`}
                  type="button"
                  onClick={() => {
                    onSelectItem({ kind: 'due', data: d });
                    setIsFlipped(false);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                    active
                      ? 'bg-[#111318] text-[#FAF8F5] shadow-xs'
                      : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  <Users className="w-3 h-3 text-[#059669]" />
                  <span className="truncate max-w-[95px]">{d.personName}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsFlipped((f) => !f)}
            className="px-2.5 py-1 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[11px] font-semibold text-[#111318] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            title="Flip 3D Covenant Card"
          >
            <RotateCw className="w-3 h-3 text-[#C59B27]" />
            <span>Flip 3D</span>
          </button>
        </div>

        {/* 3D Interactive Metallic Card Container */}
        {stageDetails && stageItem ? (
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={() => setIsFlipped((f) => !f)}
            className="relative w-full min-h-[236px] rounded-2xl p-5 text-white select-none cursor-pointer transition-transform duration-200 ease-out overflow-hidden shadow-[0_20px_42px_rgba(17,19,24,0.22)]"
            style={{
              background: theme.background,
              border: `1px solid ${theme.border}`,
              transform: `perspective(1000px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
            }}
          >
            {/* Dynamic Specular Glare Overlay */}
            <div
              className="pointer-events-none absolute inset-0 transition-opacity duration-300"
              style={{
                opacity: tilt.active ? 0.28 : 0.12,
                background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.45), transparent 60%)`,
              }}
            />

            {!isFlipped ? (
              <div className="relative z-10 flex flex-col justify-between h-full min-h-[196px] space-y-4">
                {/* Top Row: EMV Chip + Covenant Type Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Realistic Gold Metallic EMV Covenant Chip */}
                    <div
                      className="w-10 h-7 rounded-md border flex items-center justify-center shadow-inner shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, #F5D97E 0%, #C59B27 55%, #8F6B14 100%)',
                        borderColor: 'rgba(255,255,255,0.45)',
                      }}
                    >
                      <div className="w-6 h-4 border border-black/25 rounded-xs grid grid-cols-2 gap-0.5 p-0.5">
                        <span className="border-r border-black/20" />
                        <span />
                      </div>
                    </div>
                    <div>
                      <span
                        className="text-[9px] font-mono uppercase tracking-[0.16em] block font-bold"
                        style={{ color: theme.accentText }}
                      >
                        {stageDetails.kindLabel}
                      </span>
                      <h4 className="font-display text-base font-bold text-white tracking-tight truncate max-w-[210px]">
                        {stageDetails.title}
                      </h4>
                    </div>
                  </div>

                  <span
                    className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: theme.badgeBg,
                      color: theme.badgeText,
                      borderColor: theme.border,
                    }}
                  >
                    {stageDetails.scope}
                  </span>
                </div>

                {/* Middle Row: Primary & Secondary Balances */}
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-white/65 block font-semibold">
                      {stageDetails.primaryLabel}
                    </span>
                    <div className="text-2xl sm:text-3xl font-bold font-mono-data tabular-nums tracking-tight text-white mt-0.5">
                      {stageDetails.primaryAmount}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-white/65 block font-semibold">
                      {stageDetails.secondaryLabel}
                    </span>
                    <div
                      className="text-sm font-bold font-mono-data tabular-nums mt-0.5"
                      style={{ color: theme.accentText }}
                    >
                      {stageDetails.secondaryAmount}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Principal Clearance Bar & Due Metadata */}
                <div className="space-y-1.5 pt-1">
                  <div className="w-full h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(4, stageDetails.progressPct)}%`,
                        backgroundColor: theme.progressColor,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/80 font-mono">
                    <span className="truncate max-w-[180px]">{stageDetails.metaLeft}</span>
                    <span className="font-semibold" style={{ color: theme.accentText }}>
                      {stageDetails.metaRight}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Back of 3D Covenant Card: Deep Amortization / Settlement Telemetry */
              <div className="relative z-10 flex flex-col justify-between h-full min-h-[196px] space-y-3">
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <div>
                    <span
                      className="text-[10px] font-mono uppercase tracking-widest block font-bold"
                      style={{ color: theme.accentText }}
                    >
                      COVENANT TELEMETRY & LEDGER SPEC
                    </span>
                    <h4 className="text-sm font-bold text-white truncate">{stageDetails.title}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const summaryText = `${stageDetails.title} (${stageDetails.subtitle}): ${stageDetails.primaryLabel} ${stageDetails.primaryAmount} | ${stageDetails.metaRight}`;
                      void navigator.clipboard?.writeText(summaryText);
                      onNotify?.('Copied covenant summary to clipboard');
                    }}
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Spec</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {stageDetails.backRows.map((r) => (
                    <div key={r.label} className="p-2 rounded-xl bg-white/8 border border-white/10">
                      <span className="text-[10px] text-white/60 block">{r.label}</span>
                      <span className="font-mono font-bold text-white text-xs truncate block mt-0.5">
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[10px] text-white/70 pt-1">
                  <span>{stageDetails.progressLabel}</span>
                  <span>Click anywhere on card to flip front</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E6E1D6] bg-[#FAF8F5] p-8 text-center space-y-3">
            <Landmark className="w-8 h-8 text-[#C59B27] mx-auto" />
            <div className="text-sm font-bold text-[#111318]">No Active Loans or Khatabook Dues</div>
            <p className="text-xs text-[#52504C]">
              Record a bank loan, EMI schedule, or personal Khatabook due to inspect its 3D covenant card.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenAddLoan}
                className="px-3 py-1.5 rounded-xl bg-[#111318] text-white text-xs font-semibold cursor-pointer"
              >
                + New Loan
              </button>
              <button
                type="button"
                onClick={onOpenAddDue}
                className="px-3 py-1.5 rounded-xl bg-[#059669] text-white text-xs font-semibold cursor-pointer"
              >
                + Add Due
              </button>
            </div>
          </div>
        )}

        {/* Bottom Stage Footer: Foil Finish Customizer + Instant Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#C59B27] mr-0.5" />
            {(['auto', 'obsidian', 'gold', 'emerald', 'crimson', 'platinum'] as const).map((foil) => (
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

          {stageItem && (
            <div className="flex items-center gap-1.5">
              {stageItem.kind === 'loan' && stageItem.data.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => onOpenPayEmi(stageItem.data)}
                  className="px-3 py-1.5 rounded-xl bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Pay EMI
                </button>
              )}
              {stageItem.kind === 'due' && stageItem.data.status !== 'settled' && (
                <>
                  {stageDetails?.whatsappUrl && (
                    <a
                      href={stageDetails.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-xl bg-[#059669]/10 hover:bg-[#059669]/20 text-[#059669] border border-[#059669]/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Nudge</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenSettleDue(stageItem.data)}
                    className="px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Settle Due
                  </button>
                </>
              )}
              {stageItem.kind === 'goal' && (
                <button
                  type="button"
                  onClick={() => onOpenContributeGoal(stageItem.data)}
                  className="px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Add Funds
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (stageItem.kind === 'loan') onOpenEditLoan(stageItem.data);
                  else if (stageItem.kind === 'due') onOpenEditDue(stageItem.data);
                  else onOpenEditGoal(stageItem.data);
                }}
                className="p-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#52504C] hover:text-[#111318] transition-colors cursor-pointer"
                title="Edit Selected Instrument"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT 7 COLS: INTERACTIVE SVG AMORTIZATION & DONUT TELEMETRY ================= */}
      <div className="lg:col-span-7 rounded-3xl bg-white border border-[#E6E1D6] p-5 shadow-[0_12px_32px_rgba(17,19,24,0.04)] flex flex-col justify-between space-y-4">
        {/* Top Telemetry Header & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E1D6]/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#C59B27] font-bold">
                INSTITUTIONAL DEBT & KHATABOOK TELEMETRY
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-[#111318] mt-0.5">
              {telemetryTab === 'amortization'
                ? '12-Month Amortization & Accelerated Payoff Curve'
                : telemetryTab === 'mix'
                  ? 'Liability vs Receivable Portfolio Ring'
                  : 'Khatabook Counterparty Net Settlement Radar'}
            </h3>
          </div>

          <div className="flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTelemetryTab('amortization')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'amortization'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>12M Curve</span>
            </button>
            <button
              type="button"
              onClick={() => setTelemetryTab('mix')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'mix'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <PieChart className="w-3.5 h-3.5 text-[#059669]" />
              <span>Portfolio Mix</span>
            </button>
            <button
              type="button"
              onClick={() => setTelemetryTab('khatabook')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                telemetryTab === 'khatabook'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>Khatabook ({dueSummaries.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: 12-MONTH AMORTIZATION & ACCELERATED PAYOFF AREA CHART */}
        {telemetryTab === 'amortization' && (
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            {/* Interactive Simulator Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF8F5] p-3 rounded-2xl border border-[#E6E1D6]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111318]">
                  <span className="text-[#52504C]">Extra Prepayment / mo (₹):</span>
                  <input
                    type="number"
                    value={payoffExtraRupees}
                    onChange={(e) => onPayoffExtraChange(e.target.value)}
                    className="w-24 h-7 px-2 rounded-lg bg-white border border-[#E6E1D6] font-mono font-bold text-xs text-[#111318] focus:outline-none focus:border-[#C59B27]"
                  />
                </div>

                <div className="inline-flex rounded-lg bg-[#F3EFEA] p-0.5 border border-[#E6E1D6] text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => onPayoffStrategyChange('avalanche')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer transition-all ${
                      payoffStrategy === 'avalanche'
                        ? 'bg-[#111318] text-[#E5C158] font-bold'
                        : 'text-[#52504C] hover:text-[#111318]'
                    }`}
                  >
                    Avalanche (APR)
                  </button>
                  <button
                    type="button"
                    onClick={() => onPayoffStrategyChange('snowball')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer transition-all ${
                      payoffStrategy === 'snowball'
                        ? 'bg-[#111318] text-[#E5C158] font-bold'
                        : 'text-[#52504C] hover:text-[#111318]'
                    }`}
                  >
                    Snowball (Size)
                  </button>
                </div>
              </div>

              {activePoint && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-[#52504C]">
                    <strong className="text-[#111318]">{activePoint.monthLabel}</strong> Baseline:{' '}
                    <strong className="text-[#E11D48]">{formatINR(activePoint.baselineMinor, { compact: true })}</strong>
                  </span>
                  <span className="text-[#52504C]">
                    Accel:{' '}
                    <strong className="text-[#059669]">{formatINR(activePoint.acceleratedMinor, { compact: true })}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Interactive SVG Area Chart */}
            <div className="relative w-full overflow-hidden rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]/80 p-2">
              <svg
                viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
                className="w-full h-[185px] overflow-visible"
              >
                <defs>
                  <linearGradient id="loanBaseAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E11D48" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#E11D48" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="loanAccelAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.03" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Lines */}
                {[0.2, 0.5, 0.8].map((ratio, idx) => {
                  const y = 18 + ratio * (chartGeom.height - 44);
                  return (
                    <line
                      key={idx}
                      x1={14}
                      y1={y}
                      x2={chartGeom.width - 14}
                      y2={y}
                      stroke="#E6E1D6"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Baseline Debt Decay Area & Path */}
                <path d={chartGeom.baseArea} fill="url(#loanBaseAreaGrad)" />
                <path
                  d={chartGeom.baseLine}
                  fill="none"
                  stroke="#E11D48"
                  strokeWidth="2.2"
                  strokeDasharray="4 3"
                />

                {/* Accelerated Debt Payoff Area & Path */}
                <path d={chartGeom.accelArea} fill="url(#loanAccelAreaGrad)" />
                <path d={chartGeom.accelLine} fill="none" stroke="#059669" strokeWidth="2.8" />

                {/* Interactive Month Points */}
                {chartGeom.pts.map((pt, idx) => {
                  const isHovered = hoverMonthIdx === idx;
                  return (
                    <g
                      key={pt.monthLabel}
                      onMouseEnter={() => setHoverMonthIdx(idx)}
                      onMouseLeave={() => setHoverMonthIdx(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={pt.x - 16}
                        y={10}
                        width={32}
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
                        cy={pt.yBase}
                        r={isHovered ? 4.5 : 2.5}
                        fill="#E11D48"
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.yAccel}
                        r={isHovered ? 5 : 3}
                        fill="#059669"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                      {idx % 2 === 0 && (
                        <text
                          x={pt.x}
                          y={chartGeom.height - 6}
                          textAnchor="middle"
                          className="text-[9px] font-mono fill-[#52504C]"
                        >
                          {pt.monthLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Footer Summary Pills */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                <span className="text-[10px] uppercase font-bold text-[#52504C] block">
                  Debt-Free Horizon
                </span>
                <span className="font-mono font-bold text-sm text-[#111318] mt-0.5 block">
                  {payoffPlan ? `${payoffPlan.planMonths} Months` : '12M Projection'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#059669]/8 border border-[#059669]/25">
                <span className="text-[10px] uppercase font-bold text-[#059669] block">
                  Interest Saved
                </span>
                <span className="font-mono font-bold text-sm text-[#059669] mt-0.5 block">
                  {formatINR(
                    payoffPlan?.interestSavedMinor ??
                      (activePoint?.cumulativeInterestSavedMinor || 0),
                    { compact: true },
                  )}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6]">
                <span className="text-[10px] uppercase font-bold text-[#52504C] block">
                  Months Shaved Off
                </span>
                <span className="font-mono font-bold text-sm text-[#C59B27] mt-0.5 block">
                  {payoffPlan ? `${payoffPlan.monthsSaved} Months Early` : 'Accelerated'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE SVG DONUT CHART FOR LIABILITY VS RECEIVABLE MIX */}
        {telemetryTab === 'mix' && (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center flex-1 py-1">
            <div className="sm:col-span-5 flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  {(() => {
                    const radius = 44;
                    const circumference = 2 * Math.PI * radius;
                    let accumulatedPct = 0;

                    return mixSlices.map((slice) => {
                      const pct = Math.max(0, slice.sharePct);
                      const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
                      accumulatedPct += pct;
                      const isHovered = hoverSliceId === slice.id;

                      return (
                        <circle
                          key={slice.id}
                          cx="60"
                          cy="60"
                          r={radius}
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? 16 : 13}
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-300 cursor-pointer"
                          onMouseEnter={() => setHoverSliceId(slice.id)}
                          onMouseLeave={() => setHoverSliceId(null)}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#52504C]">
                    {hoverSliceId
                      ? mixSlices.find((s) => s.id === hoverSliceId)?.label
                      : 'Active Positions'}
                  </span>
                  <span className="text-sm font-bold font-mono-data text-[#111318] mt-0.5">
                    {hoverSliceId
                      ? formatINR(
                          mixSlices.find((s) => s.id === hoverSliceId)?.amountMinor || 0,
                          { compact: true },
                        )
                      : formatINR(
                          mixSlices.reduce((s, x) => s + x.amountMinor, 0),
                          { compact: true },
                        )}
                  </span>
                </div>
              </div>
            </div>

            <div className="sm:col-span-7 space-y-2.5">
              {mixSlices.map((slice) => (
                <div
                  key={slice.id}
                  onMouseEnter={() => setHoverSliceId(slice.id)}
                  onMouseLeave={() => setHoverSliceId(null)}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    hoverSliceId === slice.id
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
                      <div className="text-xs font-bold text-[#111318]">{slice.label}</div>
                      <div className="text-[10px] text-[#52504C]">
                        {slice.count} record{slice.count === 1 ? '' : 's'} · {slice.sharePct}% share
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono font-bold text-xs text-[#111318]">
                    {formatINR(slice.amountMinor)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: KHATABOOK COUNTERPARTY NET RADAR */}
        {telemetryTab === 'khatabook' && (
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            {dueSummaries.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-[#E6E1D6] bg-[#FAF8F5] text-center space-y-2 my-auto">
                <CheckCircle2 className="w-7 h-7 text-[#059669] mx-auto" />
                <div className="text-xs font-bold text-[#111318]">All Personal Khatabook Balances Settled</div>
                <p className="text-[11px] text-[#52504C]">
                  Add a person due to track Udhar receivables, payables, and 1-click WhatsApp reminders.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[240px] overflow-y-auto pr-1">
                {dueSummaries.map((person) => {
                  const isNeed = person.netMinor >= 0;
                  const matchingDue = dues.find(
                    (d) =>
                      d.personName.toLowerCase() === person.personName.toLowerCase() &&
                      d.status !== 'settled',
                  );
                  const whatsappUrl = buildWhatsAppLink(
                    person.phone,
                    `Hi ${person.personName}, gentle reminder regarding our net balance of ${formatINR(Math.abs(person.netMinor))}.`,
                  );

                  return (
                    <div
                      key={person.personName}
                      onClick={() => {
                        if (matchingDue) onSelectItem({ kind: 'due', data: matchingDue });
                      }}
                      className="p-3 rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] hover:border-[#C59B27] transition-all flex flex-col justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                              isNeed
                                ? 'bg-[#059669]/12 text-[#059669]'
                                : 'bg-[#E11D48]/12 text-[#E11D48]'
                            }`}
                          >
                            {isNeed ? (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#111318] truncate">
                              {person.personName}
                            </div>
                            <div className="text-[10px] text-[#52504C]">
                              {person.openCount} open item{person.openCount === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`font-mono text-xs font-bold ${
                            isNeed ? 'text-[#059669]' : 'text-[#E11D48]'
                          }`}
                        >
                          {isNeed ? '+' : '-'}
                          {formatINR(Math.abs(person.netMinor), { compact: true })}
                        </span>
                      </div>

                      <div
                        className="flex items-center justify-between pt-1.5 border-t border-[#E6E1D6]/70 text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] text-[#52504C]">
                          {isNeed ? 'Owed to you' : 'You owe'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isNeed && person.phone && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#059669] hover:underline font-semibold flex items-center gap-0.5 text-[10px]"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          {matchingDue && (
                            <button
                              type="button"
                              onClick={() => onOpenSettleDue(matchingDue)}
                              className="px-2 py-0.5 rounded-lg bg-[#111318] text-white text-[10px] font-semibold cursor-pointer"
                            >
                              Settle
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[#E6E1D6]/80 text-xs">
              <span className="text-[11px] text-[#52504C]">
                Click any counterparty card to inspect their ledger history below.
              </span>
              <button
                type="button"
                onClick={onOpenAddDue}
                className="px-3 py-1 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Person Due</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
