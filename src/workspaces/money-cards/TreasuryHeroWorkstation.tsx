import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Landmark,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';
import { formatINR, SCOPE_META, todayISO } from '../../lib/format.ts';
import {
  buildSmoothAreaPath,
  computeCardTiltTransform,
  getMetallicFinishById,
  resolveMetallicFinish,
  type MetallicFinishId,
  type Point2D,
  type TiltGlareState,
} from '../dashboard/dashboardVisuals.ts';
import {
  buildTreasuryFlowSeries,
  computeAccountAllocationMix,
  type TreasuryMetrics,
} from './treasuryAnalytics.ts';

export interface TreasuryHeroWorkstationProps {
  liquidAccounts: AccountRecord[];
  creditCards: AccountRecord[];
  transactions: TransactionRecord[];
  metrics: TreasuryMetrics;
  selectedAccountId: string | null;
  onSelectAccountId: (accountId: string | null) => void;
  onOpenRecordTx: (defaultKind?: 'expense' | 'income' | 'transfer', accountId?: string) => void;
  onOpenReconcileBank: (account: AccountRecord) => void;
  onOpenEditAccount: (account: AccountRecord) => void;
  onOpenNewAccount: () => void;
  onOpenPayCard: (card: AccountRecord) => void;
  bankFinishOverrides: Record<string, MetallicFinishId>;
  onChangeBankFinish: (accountId: string, finish: 'auto' | MetallicFinishId) => void;
}

const FINISH_SWATCHES: Array<{
  id: 'auto' | MetallicFinishId;
  label: string;
  swatchClass: string;
}> = [
  { id: 'auto', label: 'Auto', swatchClass: 'bg-gradient-to-br from-[#064E3B] via-[#C59B27] to-[#111318]' },
  { id: 'emerald', label: 'Emerald', swatchClass: 'bg-gradient-to-br from-[#064E3B] to-[#059669]' },
  { id: 'platinum', label: 'Platinum', swatchClass: 'bg-gradient-to-br from-[#E6E2DA] to-[#BDB6A8]' },
  { id: 'gold', label: 'Gold', swatchClass: 'bg-gradient-to-br from-[#9A7B2C] to-[#E5C158]' },
  { id: 'obsidian', label: 'Obsidian', swatchClass: 'bg-[#111318]' },
];

export function TreasuryHeroWorkstation({
  liquidAccounts,
  creditCards,
  transactions,
  metrics,
  selectedAccountId,
  onSelectAccountId,
  onOpenRecordTx,
  onOpenReconcileBank,
  onOpenEditAccount,
  onOpenNewAccount,
  onOpenPayCard,
  bankFinishOverrides,
  onChangeBankFinish,
}: TreasuryHeroWorkstationProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showRouting, setShowRouting] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState<TiltGlareState>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 30,
  });

  const [telemetryTab, setTelemetryTab] = useState<'flow' | 'allocation' | 'safety'>('flow');
  const [hoverDayIdx, setHoverDayIdx] = useState<number | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);

  const activeAccountIndex = useMemo(() => {
    if (liquidAccounts.length === 0) return 0;
    if (selectedAccountId) {
      const found = liquidAccounts.findIndex((a) => a.id === selectedAccountId);
      if (found >= 0) return found;
    }
    return carouselIdx % liquidAccounts.length;
  }, [liquidAccounts, selectedAccountId, carouselIdx]);

  const activeAccount = liquidAccounts[activeAccountIndex] ?? null;

  const activeFinishOverride: 'auto' | MetallicFinishId = activeAccount
    ? bankFinishOverrides[activeAccount.id] ?? 'auto'
    : 'auto';

  const finish = useMemo(() => {
    if (!activeAccount) return resolveMetallicFinish('Sovereign Treasury', 0, 'bank');
    if (activeFinishOverride !== 'auto') {
      return getMetallicFinishById(activeFinishOverride, 'bank');
    }
    return resolveMetallicFinish(activeAccount.name, activeAccountIndex, 'bank');
  }, [activeAccount, activeAccountIndex, activeFinishOverride]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTilt(
      computeCardTiltTransform(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        9,
      ),
    );
  };

  const handlePointerLeave = () => {
    setIsHovering(false);
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  };

  // Liquid IDs for 14D Flow chart (either selectedAccountId or all liquid accounts)
  const scopedLiquidIds = useMemo(() => {
    if (selectedAccountId) return new Set([selectedAccountId]);
    return new Set(liquidAccounts.map((a) => a.id));
  }, [liquidAccounts, selectedAccountId]);

  const referenceDateStr = useMemo(() => {
    const latestTxDate = transactions[0]?.occurredAt;
    return latestTxDate && latestTxDate > todayISO() ? latestTxDate : todayISO();
  }, [transactions]);

  const flowData = useMemo(
    () => buildTreasuryFlowSeries(transactions, scopedLiquidIds, referenceDateStr, 14),
    [transactions, scopedLiquidIds, referenceDateStr],
  );

  const allocationSlices = useMemo(
    () => computeAccountAllocationMix(liquidAccounts),
    [liquidAccounts],
  );

  // SVG 14-Day Inflow vs Outflow Chart Geometry
  const svgWidth = 620;
  const svgHeight = 208;
  const padLeft = 52;
  const padRight = 22;
  const padTop = 30;
  const padBottom = 28;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;
  const baselineY = padTop + plotH;

  const flowGeometry = useMemo(() => {
    const pts = flowData.series;
    if (pts.length === 0) {
      return {
        inflowPoints: [] as Point2D[],
        outflowPoints: [] as Point2D[],
        inflowPaths: { strokePath: '', areaPath: '' },
        outflowPaths: { strokePath: '', areaPath: '' },
        yTicks: [] as Array<{ y: number; label: string }>,
      };
    }

    const maxVal = Math.max(
      50000,
      ...pts.map((p) => Math.max(p.inflowMinor, p.outflowMinor)),
    );
    const stepX = pts.length > 1 ? plotW / (pts.length - 1) : 0;

    const inflowPoints: Point2D[] = pts.map((p, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - (p.inflowMinor / maxVal) * (plotH * 0.84) - 2,
    }));

    const outflowPoints: Point2D[] = pts.map((p, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - (p.outflowMinor / maxVal) * (plotH * 0.84) - 2,
    }));

    const yTicks = [0.18, 0.52, 0.88].map((ratio) => ({
      y: padTop + plotH * ratio,
      label: formatINR(Math.round(maxVal * (1 - ratio)), { compact: true }),
    }));

    return {
      inflowPoints,
      outflowPoints,
      inflowPaths: buildSmoothAreaPath(inflowPoints, baselineY),
      outflowPaths: buildSmoothAreaPath(outflowPoints, baselineY),
      yTicks,
    };
  }, [flowData.series, plotW, plotH, padLeft, padTop, baselineY]);

  const activeFlowIdx =
    hoverDayIdx !== null && hoverDayIdx < flowData.series.length
      ? hoverDayIdx
      : Math.max(0, flowData.series.length - 1);
  const activeFlowDay = flowData.series[activeFlowIdx] ?? {
    date: referenceDateStr,
    shortLabel: 'Today',
    inflowMinor: 0,
    outflowMinor: 0,
    netMinor: 0,
    txCount: 0,
  };
  const activeInflowPt = flowGeometry.inflowPoints[activeFlowIdx];

  // Active Passbook telemetry
  const activeBalanceMinor = activeAccount?.currentBalanceMinor ?? 0;
  const activeSafetyFloorMinor =
    activeAccount?.minBalanceMinor && activeAccount.minBalanceMinor > 0
      ? activeAccount.minBalanceMinor
      : activeAccount?.accountGroup === 'bank'
        ? 2500000
        : 500000;
  const floorHealthPct = Math.min(
    100,
    Math.max(8, Math.round((Math.max(0, activeBalanceMinor) / Math.max(1, activeSafetyFloorMinor * 2)) * 100)),
  );
  const isBelowFloor = activeBalanceMinor < activeSafetyFloorMinor;

  const deterministicIfsc = useMemo(() => {
    if (!activeAccount) return 'SOVB0001004';
    const prefix = (activeAccount.institution || activeAccount.name || 'SOVB')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, 'X');
    const code = (activeAccount.last4 || '4821').padStart(4, '0');
    return `${prefix}000${code}`;
  }, [activeAccount]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
      {/* ==================== LEFT 5 COLS: 3D METALLIC TREASURY PASSBOOK STAGE ==================== */}
      <section className="xl:col-span-5 bento-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#EAE5DC]">
          <div className="min-w-0">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold block">
              3D Metallic Treasury Passbook
            </span>
            <h2 className="font-display text-sm sm:text-base font-bold text-[#111318] mt-0.5 truncate">
              {activeAccount ? activeAccount.name : 'Sovereign Deposit Vault'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeAccount && (
              <button
                type="button"
                onClick={() => setIsFlipped((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  isFlipped
                    ? 'border-[#C59B27] bg-[#111318] text-[#E5C158]'
                    : 'border-[#EAE5DC] bg-[#FAF8F5] text-[#52504C] hover:text-[#111318]'
                }`}
              >
                <RotateCw
                  className={`h-3.5 w-3.5 transition-transform duration-300 ${
                    isFlipped ? 'rotate-180' : ''
                  }`}
                />
                <span>{isFlipped ? 'Front' : 'Flip 3D'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!activeAccount) return;
                onSelectAccountId(selectedAccountId === activeAccount.id ? null : activeAccount.id);
              }}
              className={`inline-flex items-center gap-1 rounded-xl border px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                activeAccount && selectedAccountId === activeAccount.id
                  ? 'border-[#059669] bg-emerald-50 text-[#059669]'
                  : 'border-[#EAE5DC] bg-[#FAF8F5] text-[#52504C] hover:text-[#111318]'
              }`}
              title="Filter cashflow chart and passbook stream to this account"
            >
              <Filter className="h-3 w-3" />
              <span>{activeAccount && selectedAccountId === activeAccount.id ? 'Filtered' : 'Filter Feed'}</span>
            </button>
          </div>
        </div>

        {/* 3D Metallic Passbook Stage with Fanned Stack */}
        <div className="my-3.5 pt-2 pb-1 relative metallic-card-stage select-none">
          {liquidAccounts.length > 1 && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1.5 inset-x-7 h-[210px] rounded-2xl metallic-finish-obsidian opacity-55 transition-transform duration-300"
                style={{
                  transform: isHovering
                    ? 'translateY(-6px) rotate(-2.2deg) scale(0.93)'
                    : 'translateY(-3px) rotate(-1.5deg) scale(0.93)',
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 inset-x-4 h-[214px] rounded-2xl metallic-finish-gold opacity-75 transition-transform duration-300"
                style={{
                  transform: isHovering
                    ? 'translateY(-3px) rotate(1.6deg) scale(0.965)'
                    : 'translateY(-1px) rotate(1deg) scale(0.965)',
                }}
              />
            </>
          )}

          {activeAccount ? (
            <div
              ref={cardRef}
              onPointerEnter={() => setIsHovering(true)}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className={`metallic-card-body ${finish.cssClass} relative rounded-2xl p-4 sm:p-5 min-h-[216px] sm:min-h-[222px] flex flex-col justify-between overflow-hidden ${
                finish.isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
              }`}
              style={{
                transform: isHovering
                  ? `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(1.015, 1.015, 1.015)`
                  : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
              }}
            >
              {/* Dynamic Specular Glare */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                style={{
                  opacity: isHovering ? 0.92 : 0.38,
                  background: `radial-gradient(circle 230px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,${
                    finish.isLightSurface ? '0.68' : '0.24'
                  }), transparent 70%)`,
                }}
              />

              {!isFlipped ? (
                <>
                  {/* Engraved Guilloche Vault Circles */}
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 h-full w-3/4 opacity-15"
                    viewBox="0 0 300 200"
                    fill="none"
                  >
                    <circle
                      cx="260"
                      cy="30"
                      r="90"
                      stroke="currentColor"
                      strokeWidth="0.75"
                      strokeDasharray="3 3"
                    />
                    <circle cx="260" cy="30" r="130" stroke="currentColor" strokeWidth="0.75" />
                    <circle cx="260" cy="30" r="170" stroke="currentColor" strokeWidth="0.5" />
                  </svg>

                  {/* Top Row: Sovereign Badge, Scope & Reconciled Status */}
                  <div className="relative z-10 flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-mono-data uppercase tracking-[0.16em] px-2 py-0.5 rounded border ${
                            finish.isLightSurface
                              ? 'bg-[#111318]/8 border-[#111318]/20 text-[#111318]'
                              : 'bg-white/10 border-white/15 text-[#FBE698]'
                          }`}
                        >
                          {activeAccount.accountGroup === 'bank' ? finish.tierBadge : 'LIQUID FLOAT'}
                        </span>
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wider ${
                            finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                          }`}
                        >
                          {SCOPE_META[activeAccount.scope].label}
                        </span>
                      </div>
                      <h3 className="font-display text-base sm:text-lg font-bold tracking-tight mt-1.5 truncate">
                        {activeAccount.name}
                      </h3>
                    </div>

                    <div
                      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-mono-data border shrink-0 ${
                        isBelowFloor
                          ? 'bg-rose-500/20 border-rose-300/40 text-rose-200'
                          : finish.isLightSurface
                            ? 'bg-white/75 border-[#111318]/15 text-[#059669]'
                            : 'bg-black/28 border-white/12 text-[#6EE7B7]'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isBelowFloor ? 'LOW FLOOR' : 'RECONCILED'}</span>
                    </div>
                  </div>

                  {/* Middle Row: Gold RTGS Vault Chip + Account Digits */}
                  <div className="relative z-10 my-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 shrink-0">
                      <svg
                        width="40"
                        height="30"
                        viewBox="0 0 42 32"
                        fill="none"
                        aria-hidden="true"
                        className="shrink-0 drop-shadow-xs"
                      >
                        <rect
                          x="0.5"
                          y="0.5"
                          width="41"
                          height="31"
                          rx="5.5"
                          fill={`url(#bankChip-${activeAccount.id})`}
                          stroke={finish.chipSecondaryHex}
                        />
                        <path
                          d="M14 1V31M28 1V31M1 11H14M28 11H41M1 21H14M28 21H41"
                          stroke={finish.chipSecondaryHex}
                          strokeWidth="0.9"
                          strokeOpacity="0.65"
                        />
                        <rect
                          x="14"
                          y="8"
                          width="14"
                          height="16"
                          rx="2.5"
                          stroke={finish.chipSecondaryHex}
                          strokeWidth="0.9"
                          strokeOpacity="0.7"
                        />
                        <defs>
                          <linearGradient
                            id={`bankChip-${activeAccount.id}`}
                            x1="0"
                            y1="0"
                            x2="42"
                            y2="32"
                            gradientUnits="userSpaceOnUse"
                          >
                            <stop offset="0%" stopColor={finish.chipPrimaryHex} />
                            <stop offset="50%" stopColor="#D4AF37" />
                            <stop offset="100%" stopColor={finish.chipSecondaryHex} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <Wifi
                        className={`w-4 h-4 rotate-90 ${
                          finish.isLightSurface ? 'text-[#52504C]' : 'text-white/60'
                        }`}
                      />
                    </div>

                    <div
                      className={`font-mono-data text-xs sm:text-base tracking-[0.14em] sm:tracking-[0.22em] font-semibold tabular-nums whitespace-nowrap ${
                        finish.isLightSurface ? 'text-[#111318]' : 'text-white/90'
                      }`}
                    >
                      •••• •••• •••• {activeAccount.last4 || '4821'}
                    </div>
                  </div>

                  {/* Bottom Row: Available Balance & Safety Floor Telemetry */}
                  <div className="relative z-10 pt-2 border-t border-current/12 flex items-end justify-between gap-3">
                    <div>
                      <div
                        className={`text-[10px] uppercase tracking-widest font-mono-data ${
                          finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                        }`}
                      >
                        Available Liquid Deposit
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono-data tabular-nums tracking-tight mt-0.5">
                        {formatINR(activeBalanceMinor)}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`text-[9px] font-mono-data uppercase tracking-[0.16em] px-2 py-0.5 rounded border ${
                          finish.isLightSurface
                            ? 'border-[#111318]/20 bg-[#111318]/8 text-[#111318]'
                            : 'border-white/15 bg-white/10 text-[#FBE698]'
                        }`}
                      >
                        {activeAccount.institution || (activeAccount.accountGroup === 'bank' ? 'RTGS / NEFT' : 'UPI / CASH')}
                      </span>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-mono-data ${
                            finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                          }`}
                        >
                          Floor: {formatINR(activeSafetyFloorMinor, { compact: true })}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isBelowFloor ? 'bg-rose-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${floorHealthPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* 3D Flipped Back of Bank Passbook */
                <div className="relative z-10 flex flex-col justify-between h-[182px] animate-panel-in">
                  <div className="-mx-5 -mt-1 h-9 bg-gradient-to-r from-[#090A0D] via-[#1E222B] to-[#090A0D] border-y border-white/10" />

                  <div className="flex items-center justify-between gap-2.5 my-2">
                    <div className="flex-1 h-8 rounded-lg bg-white/12 border border-white/15 px-3 flex items-center justify-between min-w-0">
                      <span className="text-[10px] font-mono-data uppercase tracking-widest opacity-75 truncate">
                        IFSC / ROUTING · {activeAccount.institution || 'TREASURY'}
                      </span>
                      <span className="font-mono-data text-xs font-bold tracking-widest text-[#E5C158] shrink-0">
                        {showRouting ? deterministicIfsc : `${deterministicIfsc.slice(0, 4)}•••••••`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRouting((v) => !v);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-black/35 border border-white/15 px-2.5 py-1.5 text-[11px] font-mono-data text-white hover:bg-black/50 cursor-pointer shrink-0"
                    >
                      {showRouting ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>IFSC</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-black/28 border border-white/12 p-2.5 text-xs font-mono-data">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Opening Bal
                      </span>
                      <span className="font-bold text-white">
                        {formatINR(activeAccount.openingBalanceMinor || 0, { compact: true })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Safety Floor
                      </span>
                      <span className="font-bold text-[#E5C158]">
                        {formatINR(activeSafetyFloorMinor, { compact: true })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Account Group
                      </span>
                      <span className="font-bold text-emerald-300 uppercase">
                        {activeAccount.accountGroup}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono-data opacity-70 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#E5C158]" />
                      DOUBLE-ENTRY VERIFIED PASSBOOK
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className="underline hover:opacity-100 cursor-pointer"
                    >
                      Return to Front →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] p-8 text-center space-y-2">
              <Building2 className="w-8 h-8 text-[#858078] mx-auto" />
              <div className="text-sm font-semibold text-[#111318]">
                No Liquid Bank or Cash Accounts Added
              </div>
              <button
                type="button"
                onClick={onOpenNewAccount}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111318] px-3 py-1.5 text-xs font-semibold text-[#FAF8F5] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>Add First Bank Account</span>
              </button>
            </div>
          )}
        </div>

        {/* Account Switcher Pills, Foil Swatches & Direct Action Bar */}
        <div className="space-y-2.5 pt-1">
          {liquidAccounts.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const prevIdx =
                    (activeAccountIndex - 1 + liquidAccounts.length) % liquidAccounts.length;
                  setCarouselIdx(prevIdx);
                  if (selectedAccountId) onSelectAccountId(liquidAccounts[prevIdx].id);
                  setIsFlipped(false);
                }}
                aria-label="Previous bank or cash account"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {liquidAccounts.map((acc, idx) => {
                  const isActive = idx === activeAccountIndex;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setCarouselIdx(idx);
                        if (selectedAccountId) onSelectAccountId(acc.id);
                        setIsFlipped(false);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all cursor-pointer shrink-0 ${
                        isActive
                          ? 'bg-[#111318] text-[#FAF8F5] font-semibold'
                          : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                      }`}
                    >
                      <span className="truncate max-w-[96px]">{acc.name}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextIdx = (activeAccountIndex + 1) % liquidAccounts.length;
                  setCarouselIdx(nextIdx);
                  if (selectedAccountId) onSelectAccountId(liquidAccounts[nextIdx].id);
                  setIsFlipped(false);
                }}
                aria-label="Next bank or cash account"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer shrink-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Foil Finish Customizer Swatches */}
          {activeAccount && (
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078]">
                Foil: <strong className="text-[#111318]">{finish.label}</strong>
              </span>
              <div className="flex items-center gap-1" role="group" aria-label="Passbook Foil Finish">
                {FINISH_SWATCHES.map((sw) => {
                  const isSelected = activeFinishOverride === sw.id;
                  return (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => onChangeBankFinish(activeAccount.id, sw.id)}
                      className={`h-5 px-1.5 rounded-md text-[10px] font-mono-data inline-flex items-center gap-1 border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#111318] bg-[#111318] text-[#FAF8F5] font-semibold'
                          : 'border-[#EAE5DC] bg-white text-[#52504C] hover:border-[#858078]'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${sw.swatchClass} border border-white/40`}
                      />
                      <span className="hidden sm:inline">{sw.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Direct Action Bar for Active Account */}
          {activeAccount && (
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onOpenRecordTx('income', activeAccount.id)}
                className="flex-1 py-2 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#059669] border border-emerald-200/80 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Inflow</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenRecordTx('expense', activeAccount.id)}
                className="flex-1 py-2 px-2 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>Outflow</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenRecordTx('transfer', activeAccount.id)}
                className="flex-1 py-2 px-2 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Transfer</span>
              </button>

              {activeAccount.accountGroup === 'bank' && (
                <button
                  type="button"
                  onClick={() => onOpenReconcileBank(activeAccount)}
                  className="py-2 px-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
                  title="Reconcile Passbook Balance"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recon</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenEditAccount(activeAccount)}
                title="Edit Account Settings"
                className="py-2 px-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ==================== RIGHT 7 COLS: 14D CASHFLOW PULSE & ALLOCATION TELEMETRY ==================== */}
      <section className="xl:col-span-7 bento-card rounded-2xl p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden">
        {/* Top Header & Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#EAE5DC]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
                {selectedAccountId && activeAccount
                  ? `${activeAccount.name} · Passbook Telemetry`
                  : 'Consolidated Treasury Telemetry'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono-data font-semibold bg-emerald-50 text-[#059669] border border-emerald-200">
                <Landmark className="w-3 h-3 text-[#059669]" />
                {metrics.bankCount} Banks · {metrics.walletCount} Cash/UPI
              </span>
            </div>

            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
              <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
                {telemetryTab === 'flow'
                  ? formatINR(flowData.netWindowFlowMinor, { signed: true })
                  : formatINR(metrics.totalLiquidMinor)}
              </h2>
              <span className="text-xs font-medium text-[#52504C]">
                {telemetryTab === 'flow'
                  ? '14-Day Net Cashflow Velocity'
                  : `Total Liquid Reserves (${metrics.debtCoverageRatioPct}% Card Debt Coverage)`}
              </span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Treasury Telemetry View"
            className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={telemetryTab === 'flow'}
              onClick={() => setTelemetryTab('flow')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                telemetryTab === 'flow'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              14D Cashflow
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={telemetryTab === 'allocation'}
              onClick={() => setTelemetryTab('allocation')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                telemetryTab === 'allocation'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Allocation Ring
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={telemetryTab === 'safety'}
              onClick={() => setTelemetryTab('safety')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                telemetryTab === 'safety'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Safety Radar
            </button>
          </div>
        </div>

        {/* Telemetry Body */}
        {telemetryTab === 'flow' ? (
          <div className="my-3 relative">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[#52504C]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
                  <span>Inflow ({activeFlowDay.shortLabel}):</span>
                  <strong className="font-mono-data text-[#059669] tabular-nums">
                    +{formatINR(activeFlowDay.inflowMinor)}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#52504C]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#C59B27]" />
                  <span>Outflow:</span>
                  <strong className="font-mono-data text-[#111318] tabular-nums">
                    -{formatINR(activeFlowDay.outflowMinor)}
                  </strong>
                </span>
              </div>

              <div className="font-mono-data text-[11px] text-[#858078]">
                {activeFlowDay.txCount} {activeFlowDay.txCount === 1 ? 'entry' : 'entries'}
              </div>
            </div>

            <div className="relative w-full overflow-hidden rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] pt-2 pb-1 px-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-[202px] overflow-visible select-none"
                role="img"
                aria-label="14-day treasury inflow versus outflow area chart"
              >
                <defs>
                  <linearGradient id="treasuryInflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.30" />
                    <stop offset="70%" stopColor="#059669" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="treasuryOutflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C59B27" stopOpacity="0.26" />
                    <stop offset="70%" stopColor="#C59B27" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#C59B27" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {flowGeometry.yTicks.map((tick, idx) => (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={tick.y}
                      x2={svgWidth - 16}
                      y2={tick.y}
                      stroke="#EAE5DC"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={tick.y + 3.5}
                      textAnchor="end"
                      className="text-[10px] font-mono-data"
                      fill="#858078"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* Outflow Gold Area & Curve */}
                <path d={flowGeometry.outflowPaths.areaPath} fill="url(#treasuryOutflowGrad)" />
                <path
                  d={flowGeometry.outflowPaths.strokePath}
                  fill="none"
                  stroke="#C59B27"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeDasharray="5 3"
                />

                {/* Inflow Emerald Area & Curve */}
                <path d={flowGeometry.inflowPaths.areaPath} fill="url(#treasuryInflowGrad)" />
                <path
                  d={flowGeometry.inflowPaths.strokePath}
                  fill="none"
                  stroke="#059669"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />

                {flowData.series.map((item, idx) => {
                  const inPt = flowGeometry.inflowPoints[idx];
                  const outPt = flowGeometry.outflowPoints[idx];
                  if (!inPt || !outPt) return null;
                  const isSelected = idx === activeFlowIdx;
                  const showLabel = idx % 2 === 1 || idx === flowData.series.length - 1;

                  return (
                    <g key={item.date}>
                      {isSelected && (
                        <>
                          <line
                            x1={inPt.x}
                            y1={padTop - 6}
                            x2={inPt.x}
                            y2={baselineY}
                            stroke="#111318"
                            strokeWidth="1.2"
                            strokeDasharray="3 3"
                            opacity="0.45"
                          />
                          <circle
                            cx={inPt.x}
                            cy={inPt.y}
                            r="9"
                            fill="#059669"
                            fillOpacity="0.18"
                          />
                        </>
                      )}

                      <circle
                        cx={outPt.x}
                        cy={outPt.y}
                        r={isSelected ? 4.2 : 2.8}
                        fill={isSelected ? '#111318' : '#FFFFFF'}
                        stroke="#C59B27"
                        strokeWidth={isSelected ? 2.4 : 1.8}
                      />

                      <circle
                        cx={inPt.x}
                        cy={inPt.y}
                        r={isSelected ? 5 : 3.5}
                        fill={isSelected ? '#059669' : '#FFFFFF'}
                        stroke="#059669"
                        strokeWidth={isSelected ? 2.8 : 2}
                      />

                      {showLabel && (
                        <text
                          x={inPt.x}
                          y={svgHeight - 7}
                          textAnchor="middle"
                          className="text-[10px] font-mono-data"
                          fill={isSelected ? '#111318' : '#858078'}
                          fontWeight={isSelected ? '700' : '500'}
                        >
                          {item.shortLabel}
                        </text>
                      )}

                      <rect
                        x={inPt.x - plotW / Math.max(2, flowData.series.length * 2)}
                        y={0}
                        width={plotW / Math.max(1, flowData.series.length)}
                        height={svgHeight}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoverDayIdx(idx)}
                        onClick={() => setHoverDayIdx(idx)}
                      />
                    </g>
                  );
                })}

                {activeInflowPt && (
                  <g
                    transform={`translate(${Math.min(
                      svgWidth - 166,
                      Math.max(padLeft + 6, activeInflowPt.x - 78),
                    )}, ${Math.max(4, activeInflowPt.y - 32)})`}
                    className="pointer-events-none"
                  >
                    <rect
                      x="0"
                      y="0"
                      width="156"
                      height="23"
                      rx="7"
                      fill="#111318"
                      stroke="#C59B27"
                      strokeWidth="0.9"
                    />
                    <text
                      x="78"
                      y="15"
                      textAnchor="middle"
                      fill="#FAF8F5"
                      className="text-[10px] font-mono-data font-semibold"
                    >
                      {activeFlowDay.shortLabel} · Net {formatINR(activeFlowDay.netMinor, { compact: true, signed: true })}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          </div>
        ) : telemetryTab === 'allocation' ? (
          /* Deposit Allocation Ring & Credit Card Coverage Bridge */
          <div className="my-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Left 5 Cols: Multi-Segment SVG Donut Ring */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#EAE5DC"
                    strokeWidth="12"
                  />
                  {(() => {
                    const circumference = 2 * Math.PI * 46;
                    let cumulativePct = 0;
                    return allocationSlices.map((slice) => {
                      const arcLen = (slice.sharePct / 100) * circumference;
                      const offset = circumference - (cumulativePct / 100) * circumference;
                      cumulativePct += slice.sharePct;
                      return (
                        <circle
                          key={slice.accountId}
                          cx="60"
                          cy="60"
                          r="46"
                          fill="none"
                          stroke={slice.colorHex}
                          strokeWidth="12"
                          strokeDasharray={`${Math.max(2, arcLen - 2)} ${circumference}`}
                          strokeDashoffset={offset - circumference}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                  <span className="text-[9px] font-mono-data uppercase tracking-widest text-[#858078]">
                    Liquid Pool
                  </span>
                  <span className="font-mono-data text-xs font-extrabold text-[#111318] mt-0.5">
                    {formatINR(metrics.totalLiquidMinor, { compact: true })}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-medium text-[#52504C] mt-2 text-center">
                Click any account row on the right to filter the passbook stream
              </div>
            </div>

            {/* Right 7 Cols: Account Share List + Credit Card Coverage */}
            <div className="md:col-span-7 space-y-2">
              <div className="space-y-1.5 max-h-[155px] overflow-y-auto pr-1">
                {allocationSlices.map((slice) => (
                  <button
                    key={slice.accountId}
                    type="button"
                    onClick={() =>
                      onSelectAccountId(
                        selectedAccountId === slice.accountId ? null : slice.accountId,
                      )
                    }
                    className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      selectedAccountId === slice.accountId
                        ? 'border-[#111318] bg-[#F3EFEA]'
                        : 'border-[#EAE5DC] bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: slice.colorHex }}
                      />
                      <span className="text-xs font-bold text-[#111318] truncate">
                        {slice.name}
                      </span>
                      <span className="text-[10px] font-mono-data text-[#858078] uppercase shrink-0">
                        {slice.sharePct}%
                      </span>
                    </div>
                    <span className="text-xs font-mono-data font-bold text-[#059669] tabular-nums shrink-0">
                      {formatINR(slice.balanceMinor)}
                    </span>
                  </button>
                ))}
              </div>

              {creditCards.length > 0 && (
                <div className="rounded-xl bg-[#111318] text-[#FAF8F5] p-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#E5C158] block">
                      Card Liability Coverage ({metrics.debtCoverageRatioPct}%)
                    </span>
                    <span className="text-xs font-mono-data text-white/85">
                      Net Liquid After Card Debt:{' '}
                      <strong className="text-emerald-400">
                        {formatINR(metrics.netLiquidAfterCardDebtMinor)}
                      </strong>
                    </span>
                  </div>
                  {metrics.totalCreditDebtMinor > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenPayCard(creditCards[0])}
                      className="px-2.5 py-1.5 rounded-lg bg-[#C59B27] hover:bg-[#E5C158] text-[#111318] font-bold text-xs transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Settle Bill</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Safety Floor & Reconciliation Radar */
          <div className="my-3 space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {liquidAccounts.map((acc) => {
              const bal = acc.currentBalanceMinor || 0;
              const floor =
                acc.minBalanceMinor && acc.minBalanceMinor > 0
                  ? acc.minBalanceMinor
                  : acc.accountGroup === 'bank'
                    ? 2500000
                    : 500000;
              const below = bal < floor;
              const isBank = acc.accountGroup === 'bank';

              return (
                <div
                  key={acc.id}
                  className="p-3 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        below
                          ? 'bg-rose-50 text-[#E11D48] border-rose-200'
                          : 'bg-emerald-50 text-[#059669] border-emerald-200'
                      }`}
                    >
                      {isBank ? <Building2 className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#111318] truncate">{acc.name}</span>
                        <span
                          className={`text-[10px] font-mono-data px-1.5 py-0.5 rounded border ${
                            below
                              ? 'bg-rose-50 text-[#E11D48] border-rose-200 font-bold'
                              : 'bg-emerald-50 text-[#059669] border-emerald-200'
                          }`}
                        >
                          {below ? 'BELOW FLOOR' : 'HEALTHY BUFFER'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-data text-[#52504C] mt-0.5">
                        Balance: <strong className="text-[#111318]">{formatINR(bal)}</strong> · Safety Floor:{' '}
                        {formatINR(floor)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isBank && (
                      <button
                        type="button"
                        onClick={() => onOpenReconcileBank(acc)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#E5C158]" />
                        <span>Reconcile Passbook</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom 4-Metric Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#EAE5DC]">
          <div className="rounded-xl bg-[#F3EFEA]/75 px-3 py-2 border border-[#EAE5DC]">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] block">
              14D Inflow
            </span>
            <span className="text-sm font-bold font-mono-data text-[#059669] tabular-nums">
              +{formatINR(flowData.totalWindowInflowMinor, { compact: true })}
            </span>
          </div>

          <div className="rounded-xl bg-[#F3EFEA]/75 px-3 py-2 border border-[#EAE5DC]">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] block">
              14D Outflow
            </span>
            <span className="text-sm font-bold font-mono-data text-[#111318] tabular-nums">
              -{formatINR(flowData.totalWindowOutflowMinor, { compact: true })}
            </span>
          </div>

          <div className="rounded-xl bg-[#F3EFEA]/75 px-3 py-2 border border-[#EAE5DC]">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] block">
              Bank Deposits
            </span>
            <span className="text-sm font-bold font-mono-data text-[#059669] tabular-nums">
              {formatINR(metrics.bankDepositMinor, { compact: true })}
            </span>
          </div>

          <div className="rounded-xl bg-[#F3EFEA]/75 px-3 py-2 border border-[#EAE5DC]">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] block">
              Cash &amp; UPI Float
            </span>
            <span className="text-sm font-bold font-mono-data text-[#C59B27] tabular-nums">
              {formatINR(metrics.walletCashMinor, { compact: true })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
