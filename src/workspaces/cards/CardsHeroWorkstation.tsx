import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Plus,
  RotateCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wifi,
  Zap,
} from 'lucide-react';
import type { AccountRecord, TransactionRecord } from '../../lib/api.ts';
import {
  formatINR,
  formatOrdinalDay,
  SCOPE_META,
  todayISO,
} from '../../lib/format.ts';
import {
  buildSmoothAreaPath,
  computeCardTiltTransform,
  computeCycleArcGeometry,
  getMetallicFinishById,
  resolveMetallicFinish,
  type MetallicFinishId,
  type Point2D,
  type TiltGlareState,
} from '../dashboard/dashboardVisuals.ts';
import {
  buildCardDailyVelocitySeries,
  computeCardCategoryMix,
  type CardsPortfolioMetrics,
} from './cardsAnalytics.ts';

export interface CardsHeroWorkstationProps {
  creditCards: AccountRecord[];
  cardTransactions: TransactionRecord[];
  portfolioMetrics: CardsPortfolioMetrics;
  bankLiquidityMinor: number;
  selectedCardId: string | null;
  onSelectCardId: (cardId: string | null) => void;
  onSelectCategoryFilter: (cat: string) => void;
  onOpenSwipeModal: (cardId: string) => void;
  onOpenPayBillModal: (card: AccountRecord) => void;
  onOpenEditCardModal: (card: AccountRecord) => void;
  onOpenAddCardModal: () => void;
  cardFinishOverrides: Record<string, MetallicFinishId>;
  onChangeCardFinish: (cardId: string, finish: 'auto' | MetallicFinishId) => void;
}

const FINISH_SWATCHES: Array<{
  id: 'auto' | MetallicFinishId;
  label: string;
  swatchClass: string;
}> = [
  { id: 'auto', label: 'Auto', swatchClass: 'bg-gradient-to-br from-[#111318] via-[#C59B27] to-[#059669]' },
  { id: 'obsidian', label: 'Obsidian', swatchClass: 'bg-[#111318]' },
  { id: 'gold', label: 'Gold', swatchClass: 'bg-gradient-to-br from-[#9A7B2C] to-[#E5C158]' },
  { id: 'emerald', label: 'Emerald', swatchClass: 'bg-gradient-to-br from-[#064E3B] to-[#059669]' },
  { id: 'platinum', label: 'Platinum', swatchClass: 'bg-gradient-to-br from-[#E6E2DA] to-[#BDB6A8]' },
];

function CardNetworkEmblem({
  name,
  isLightSurface,
}: {
  name: string;
  isLightSurface: boolean;
}) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('amex') || lower.includes('american express')) {
    return (
      <div
        className={`px-2 py-0.5 rounded border text-[9px] font-mono-data font-bold tracking-[0.16em] uppercase ${
          isLightSurface
            ? 'border-[#111318]/25 bg-[#111318]/8 text-[#111318]'
            : 'border-[#E5C158]/40 bg-[#E5C158]/12 text-[#FBE698]'
        }`}
      >
        AMEX CENTURION
      </div>
    );
  }
  if (lower.includes('regalia') || lower.includes('infinia') || lower.includes('icici')) {
    return (
      <div className="flex items-center gap-1.5" aria-label="Mastercard World Elite">
        <svg width="30" height="18" viewBox="0 0 30 18" fill="none">
          <circle cx="10" cy="9" r="8" fill="#D4AF37" fillOpacity="0.85" />
          <circle cx="20" cy="9" r="8" fill="#9A7B2C" fillOpacity="0.85" />
        </svg>
        <span
          className={`text-[8px] font-mono-data uppercase tracking-widest ${
            isLightSurface ? 'text-[#52504C]' : 'text-white/70'
          }`}
        >
          WORLD ELITE
        </span>
      </div>
    );
  }
  return (
    <div
      className={`text-[11px] font-display italic font-extrabold tracking-wider ${
        isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
      }`}
    >
      VISA <span className="text-[8px] font-mono-data not-italic font-normal opacity-75">INFINITE</span>
    </div>
  );
}

export function CardsHeroWorkstation({
  creditCards,
  cardTransactions,
  portfolioMetrics,
  bankLiquidityMinor,
  selectedCardId,
  onSelectCardId,
  onSelectCategoryFilter,
  onOpenSwipeModal,
  onOpenPayBillModal,
  onOpenEditCardModal,
  onOpenAddCardModal,
  cardFinishOverrides,
  onChangeCardFinish,
}: CardsHeroWorkstationProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState<TiltGlareState>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 30,
  });

  const [analyticsTab, setAnalyticsTab] = useState<'velocity' | 'statement' | 'categories'>('velocity');
  const [hoverDayIdx, setHoverDayIdx] = useState<number | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);

  // Sync carouselIdx if user clicks a card in the fleet grid below
  const activeCardIndex = useMemo(() => {
    if (creditCards.length === 0) return 0;
    if (selectedCardId) {
      const found = creditCards.findIndex((c) => c.id === selectedCardId);
      if (found >= 0) return found;
    }
    return carouselIdx % creditCards.length;
  }, [creditCards, selectedCardId, carouselIdx]);

  const activeCard = creditCards[activeCardIndex] ?? null;

  const activeFinishOverride: 'auto' | MetallicFinishId = activeCard
    ? cardFinishOverrides[activeCard.id] ?? 'auto'
    : 'auto';

  const finish = useMemo(() => {
    if (!activeCard) return resolveMetallicFinish('Sovereign Reserve', 0, 'credit');
    if (activeFinishOverride !== 'auto') {
      return getMetallicFinishById(activeFinishOverride, 'credit');
    }
    return resolveMetallicFinish(activeCard.name, activeCardIndex, 'credit');
  }, [activeCard, activeCardIndex, activeFinishOverride]);

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

  // Transactions scoped to selectedCardId (if active) or all cards
  const scopedCardTransactions = useMemo(() => {
    if (!selectedCardId) return cardTransactions;
    return cardTransactions.filter(
      (tx) => tx.accountId === selectedCardId || tx.toAccountId === selectedCardId,
    );
  }, [cardTransactions, selectedCardId]);

  const referenceDateStr = useMemo(() => {
    const latestTxDate = cardTransactions[0]?.occurredAt;
    return latestTxDate && latestTxDate > todayISO() ? latestTxDate : todayISO();
  }, [cardTransactions]);

  const velocityData = useMemo(
    () => buildCardDailyVelocitySeries(scopedCardTransactions, referenceDateStr, 14),
    [scopedCardTransactions, referenceDateStr],
  );

  const categoryMix = useMemo(
    () => computeCardCategoryMix(scopedCardTransactions, 5),
    [scopedCardTransactions],
  );

  // SVG 14-Day Velocity Chart Geometry
  const svgWidth = 620;
  const svgHeight = 208;
  const padLeft = 52;
  const padRight = 22;
  const padTop = 32;
  const padBottom = 28;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;
  const baselineY = padTop + plotH;

  const velocityGeometry = useMemo(() => {
    const pts = velocityData.series;
    if (pts.length === 0) {
      return {
        spendPoints: [] as Point2D[],
        paths: { strokePath: '', areaPath: '' },
        yTicks: [] as Array<{ y: number; label: string }>,
      };
    }

    const maxSpend = Math.max(50000, ...pts.map((p) => p.spendMinor));
    const stepX = pts.length > 1 ? plotW / (pts.length - 1) : 0;

    const spendPoints: Point2D[] = pts.map((p, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - (p.spendMinor / maxSpend) * (plotH * 0.82) - 2,
    }));

    const yTicks = [0.18, 0.52, 0.88].map((ratio) => ({
      y: padTop + plotH * ratio,
      label: formatINR(Math.round(maxSpend * (1 - ratio)), { compact: true }),
    }));

    return {
      spendPoints,
      paths: buildSmoothAreaPath(spendPoints, baselineY),
      yTicks,
    };
  }, [velocityData.series, plotW, plotH, padLeft, padTop, baselineY]);

  const activeVelIdx =
    hoverDayIdx !== null && hoverDayIdx < velocityData.series.length
      ? hoverDayIdx
      : Math.max(0, velocityData.series.length - 1);
  const activeVelDay = velocityData.series[activeVelIdx] ?? {
    date: referenceDateStr,
    shortLabel: 'Today',
    spendMinor: 0,
    paymentsMinor: 0,
    swipeCount: 0,
  };
  const activeVelPt = velocityGeometry.spendPoints[activeVelIdx];

  // Active card telemetry
  const cardOutstanding = Math.abs(activeCard?.currentBalanceMinor || 0);
  const cardLimit = Math.max(1, activeCard?.creditLimitMinor || 10000000);
  const cardUtilPct = Math.min(100, Math.round((cardOutstanding / cardLimit) * 100));
  const daysUntilDue = activeCard?.cardCycle?.daysUntilDue ?? 18;
  const cycleArc = computeCycleArcGeometry(daysUntilDue, 18);
  const deterministicCvv = activeCard
    ? String(((Number(activeCard.last4 || 1004) * 7 + 319) % 899) + 100)
    : '842';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
      {/* ==================== LEFT 5 COLS: 3D METALLIC CARD INSPECTOR ==================== */}
      <section className="xl:col-span-5 bento-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#EAE5DC]">
          <div>
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold block">
              3D Metallic Instrument Stage
            </span>
            <h2 className="font-display text-base font-bold text-[#111318] mt-0.5">
              {activeCard ? activeCard.name : 'Credit Card Portfolio'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {activeCard && (
              <button
                type="button"
                onClick={() => setIsFlipped((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
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
                if (!activeCard) return;
                onSelectCardId(selectedCardId === activeCard.id ? null : activeCard.id);
              }}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                activeCard && selectedCardId === activeCard.id
                  ? 'border-[#059669] bg-emerald-50 text-[#059669]'
                  : 'border-[#EAE5DC] bg-[#FAF8F5] text-[#52504C] hover:text-[#111318]'
              }`}
              title="Filter velocity chart and expense ledger to this card"
            >
              <Filter className="h-3 w-3" />
              <span>{activeCard && selectedCardId === activeCard.id ? 'Filtered' : 'Filter Feed'}</span>
            </button>
          </div>
        </div>

        {/* 3D Card Stage with Fanned Physical Stack */}
        <div className="my-3.5 pt-2 pb-1 relative metallic-card-stage select-none">
          {creditCards.length > 1 && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1.5 inset-x-7 h-[210px] rounded-2xl metallic-finish-emerald opacity-55 transition-transform duration-300"
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

          {activeCard ? (
            <div
              ref={cardRef}
              onPointerEnter={() => setIsHovering(true)}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className={`metallic-card-body ${finish.cssClass} relative rounded-2xl p-5 min-h-[220px] flex flex-col justify-between overflow-hidden ${
                finish.isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
              }`}
              style={{
                transform: isHovering
                  ? `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(1.015, 1.015, 1.015)`
                  : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
              }}
            >
              {/* Specular Glare */}
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
                  {/* Guilloche SVG */}
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

                  {/* Top Row */}
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
                          {finish.tierBadge}
                        </span>
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wider ${
                            finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                          }`}
                        >
                          {SCOPE_META[activeCard.scope].label}
                        </span>
                      </div>
                      <h3 className="font-display text-base sm:text-lg font-bold tracking-tight mt-1.5 truncate">
                        {activeCard.name}
                      </h3>
                    </div>

                    {/* Radial Cycle Ring */}
                    <div className="flex items-center gap-1.5 bg-black/28 backdrop-blur-md rounded-xl px-2 py-1.5 border border-white/12 shrink-0">
                      <svg className="w-9 h-9 sm:w-10 sm:h-10 -rotate-90 shrink-0" viewBox="0 0 44 44">
                        <circle
                          cx="22"
                          cy="22"
                          r="18"
                          fill="none"
                          stroke="rgba(255,255,255,0.16)"
                          strokeWidth="3.5"
                        />
                        <circle
                          cx="22"
                          cy="22"
                          r="18"
                          fill="none"
                          stroke={daysUntilDue <= 5 ? '#FB7185' : '#E5C158'}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray={cycleArc.circumference}
                          strokeDashoffset={cycleArc.dashOffset}
                        />
                      </svg>
                      <div className="text-right">
                        <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/65 font-mono-data">
                          Cycle Due
                        </div>
                        <div className="text-[11px] sm:text-xs font-bold font-mono-data tabular-nums text-white whitespace-nowrap">
                          {daysUntilDue < 0 ? 'OVERDUE' : `${daysUntilDue}d left`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: EMV Chip + Last 4 */}
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
                          fill={`url(#heroChip-${activeCard.id})`}
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
                            id={`heroChip-${activeCard.id}`}
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
                      •••• •••• •••• {activeCard.last4 || '1004'}
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="relative z-10 pt-2 border-t border-current/12 flex items-end justify-between gap-3">
                    <div>
                      <div
                        className={`text-[10px] uppercase tracking-widest font-mono-data ${
                          finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                        }`}
                      >
                        Current Outstanding
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono-data tabular-nums tracking-tight mt-0.5">
                        {formatINR(cardOutstanding)}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <CardNetworkEmblem
                        name={activeCard.name}
                        isLightSurface={finish.isLightSurface}
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-mono-data ${
                            finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                          }`}
                        >
                          {cardUtilPct}% Used
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              cardUtilPct > 50
                                ? 'bg-rose-400'
                                : cardUtilPct > 30
                                  ? 'bg-[#E5C158]'
                                  : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.max(6, cardUtilPct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* 3D Flipped Back of Card */
                <div className="relative z-10 flex flex-col justify-between h-[182px] animate-panel-in">
                  <div className="-mx-5 -mt-1 h-9 bg-gradient-to-r from-[#090A0D] via-[#1E222B] to-[#090A0D] border-y border-white/10" />

                  <div className="flex items-center justify-between gap-3 my-2">
                    <div className="flex-1 h-8 rounded-lg bg-white/12 border border-white/15 px-3 flex items-center justify-between">
                      <span className="text-[10px] font-mono-data uppercase tracking-widest opacity-70">
                        AUTHORIZED SIGNATURE · {activeCard.institution || 'SOVEREIGN BANK'}
                      </span>
                      <span className="font-mono-data text-xs font-bold tracking-widest text-[#E5C158]">
                        {showCvv ? deterministicCvv : '•••'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCvv((v) => !v);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-black/35 border border-white/15 px-2.5 py-1.5 text-[11px] font-mono-data text-white hover:bg-black/50 cursor-pointer"
                    >
                      {showCvv ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>CVV</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-black/28 border border-white/12 p-2.5 text-xs font-mono-data">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Statement Day
                      </span>
                      <span className="font-bold text-white">
                        {formatOrdinalDay(activeCard.statementDay || 15)} of mo
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Payment Due
                      </span>
                      <span className="font-bold text-[#E5C158]">
                        {formatOrdinalDay(activeCard.dueDay || 5)} of mo
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase tracking-wider opacity-65 block">
                        Credit Limit
                      </span>
                      <span className="font-bold text-emerald-300">
                        {formatINR(activeCard.creditLimitMinor, { compact: true })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono-data opacity-70 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#E5C158]" />
                      HOLOGRAPHIC SECURITY PRISM · 256-BIT
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
              <CreditCard className="w-8 h-8 text-[#858078] mx-auto" />
              <div className="text-sm font-semibold text-[#111318]">
                No Credit Cards Added Yet
              </div>
              <button
                type="button"
                onClick={onOpenAddCardModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111318] px-3 py-1.5 text-xs font-semibold text-[#FAF8F5] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>Add First Credit Card</span>
              </button>
            </div>
          )}
        </div>

        {/* Card Switcher Pills, Foil Swatches & Direct Action Bar */}
        <div className="space-y-2.5 pt-1">
          {creditCards.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const prevIdx = (activeCardIndex - 1 + creditCards.length) % creditCards.length;
                  setCarouselIdx(prevIdx);
                  if (selectedCardId) onSelectCardId(creditCards[prevIdx].id);
                  setIsFlipped(false);
                }}
                aria-label="Previous credit card"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {creditCards.map((c, idx) => {
                  const isActive = idx === activeCardIndex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCarouselIdx(idx);
                        if (selectedCardId) onSelectCardId(c.id);
                        setIsFlipped(false);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#111318] text-[#FAF8F5] font-semibold'
                          : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                      }`}
                    >
                      <span className="truncate max-w-[92px]">{c.name}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextIdx = (activeCardIndex + 1) % creditCards.length;
                  setCarouselIdx(nextIdx);
                  if (selectedCardId) onSelectCardId(creditCards[nextIdx].id);
                  setIsFlipped(false);
                }}
                aria-label="Next credit card"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Foil Finish Customizer Swatches */}
          {activeCard && (
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
              <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078]">
                Foil: <strong className="text-[#111318]">{finish.label}</strong>
              </span>
              <div className="flex items-center gap-1" role="group" aria-label="Card Foil Finish">
                {FINISH_SWATCHES.map((sw) => {
                  const isSelected = activeFinishOverride === sw.id;
                  return (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => onChangeCardFinish(activeCard.id, sw.id)}
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

          {/* Direct Action Bar for Active Card */}
          {activeCard && (
            <div className="flex items-center justify-between gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onOpenSwipeModal(activeCard.id)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>Log Swipe</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenPayBillModal(activeCard)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Settle Bill</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenEditCardModal(activeCard)}
                title="Edit Card Settings"
                className="py-2 px-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ==================== RIGHT 7 COLS: INTERACTIVE 14D VELOCITY & STATEMENT ARCS ==================== */}
      <section className="xl:col-span-7 bento-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden">
        {/* Top Header & Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#EAE5DC]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
                {selectedCardId && activeCard
                  ? `${activeCard.name} · Telemetry`
                  : 'Consolidated Card Fleet Telemetry'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono-data font-semibold bg-amber-50 text-[#9A7B2C] border border-amber-200">
                <Award className="w-3 h-3 text-[#C59B27]" />
                ~{portfolioMetrics.estimatedRewardPoints.toLocaleString('en-IN')} Est. Pts
              </span>
            </div>

            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
                {analyticsTab === 'velocity'
                  ? formatINR(velocityData.totalWindowSpendMinor)
                  : formatINR(portfolioMetrics.totalDebtMinor)}
              </h2>
              <span className="text-xs font-medium text-[#52504C]">
                {analyticsTab === 'velocity'
                  ? `14-Day Spend Volume (${velocityData.totalWindowSwipes} swipes)`
                  : `Total Card Liability (${portfolioMetrics.overallUtilizationPct}% Util)`}
              </span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Card Telemetry View"
            className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={analyticsTab === 'velocity'}
              onClick={() => setAnalyticsTab('velocity')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                analyticsTab === 'velocity'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              14D Velocity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={analyticsTab === 'statement'}
              onClick={() => setAnalyticsTab('statement')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                analyticsTab === 'statement'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Statement Split
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={analyticsTab === 'categories'}
              onClick={() => setAnalyticsTab('categories')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                analyticsTab === 'categories'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Category Mix
            </button>
          </div>
        </div>

        {/* Analytics Body */}
        {analyticsTab === 'velocity' ? (
          <div className="my-3 relative">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[#52504C]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#C59B27]" />
                  <span>Selected Day ({activeVelDay.shortLabel}):</span>
                  <strong className="font-mono-data text-[#111318] tabular-nums">
                    {formatINR(activeVelDay.spendMinor)}
                  </strong>
                </span>
                <span className="text-[#858078] font-mono-data text-[11px]">
                  ({activeVelDay.swipeCount} {activeVelDay.swipeCount === 1 ? 'swipe' : 'swipes'})
                </span>
              </div>

              {velocityData.peakDay && velocityData.peakDay.spendMinor > 0 && (
                <div className="font-mono-data text-[11px] text-[#52504C]">
                  Peak Day: <strong className="text-[#111318]">{velocityData.peakDay.shortLabel}</strong> (
                  {formatINR(velocityData.peakDay.spendMinor, { compact: true })})
                </div>
              )}
            </div>

            <div className="relative w-full overflow-hidden rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] pt-2 pb-1 px-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-[202px] overflow-visible select-none"
                role="img"
                aria-label="14-day credit card daily spend velocity chart"
              >
                <defs>
                  <linearGradient id="cardGoldVelGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C59B27" stopOpacity="0.32" />
                    <stop offset="68%" stopColor="#C59B27" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#C59B27" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {velocityGeometry.yTicks.map((tick, idx) => (
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

                <path d={velocityGeometry.paths.areaPath} fill="url(#cardGoldVelGrad)" />
                <path
                  d={velocityGeometry.paths.strokePath}
                  fill="none"
                  stroke="#C59B27"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />

                {velocityData.series.map((item, idx) => {
                  const pt = velocityGeometry.spendPoints[idx];
                  if (!pt) return null;
                  const isSelected = idx === activeVelIdx;
                  const showLabel = idx % 2 === 1 || idx === velocityData.series.length - 1;

                  return (
                    <g key={item.date}>
                      {isSelected && (
                        <>
                          <line
                            x1={pt.x}
                            y1={padTop - 6}
                            x2={pt.x}
                            y2={baselineY}
                            stroke="#111318"
                            strokeWidth="1.2"
                            strokeDasharray="3 3"
                            opacity="0.45"
                          />
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="10"
                            fill="#C59B27"
                            fillOpacity="0.18"
                          />
                        </>
                      )}

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 5 : 3.5}
                        fill={isSelected ? '#111318' : '#FFFFFF'}
                        stroke="#C59B27"
                        strokeWidth={isSelected ? 2.8 : 2}
                      />

                      {showLabel && (
                        <text
                          x={pt.x}
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
                        x={pt.x - plotW / Math.max(2, velocityData.series.length * 2)}
                        y={0}
                        width={plotW / Math.max(1, velocityData.series.length)}
                        height={svgHeight}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoverDayIdx(idx)}
                        onClick={() => setHoverDayIdx(idx)}
                      />
                    </g>
                  );
                })}

                {activeVelPt && (
                  <g
                    transform={`translate(${Math.min(
                      svgWidth - 148,
                      Math.max(padLeft + 6, activeVelPt.x - 68),
                    )}, ${Math.max(4, activeVelPt.y - 32)})`}
                    className="pointer-events-none"
                  >
                    <rect
                      x="0"
                      y="0"
                      width="136"
                      height="23"
                      rx="7"
                      fill="#111318"
                      stroke="#C59B27"
                      strokeWidth="0.9"
                    />
                    <text
                      x="68"
                      y="15"
                      textAnchor="middle"
                      className="text-[10px] font-mono-data font-semibold"
                      fill="#FAF8F5"
                    >
                      {activeVelDay.shortLabel}: {formatINR(activeVelDay.spendMinor, { compact: true })}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          </div>
        ) : analyticsTab === 'statement' ? (
          /* Mode 2: Statement Billed vs Unbilled Split Arc & Settlement Bridge */
          <div className="my-3.5 grid grid-cols-1 sm:grid-cols-12 gap-4 bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl p-4 items-center">
            <div className="sm:col-span-5 flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center">
                <svg width="142" height="142" viewBox="0 0 130 130" className="-rotate-90">
                  <circle
                    cx="65"
                    cy="65"
                    r="48"
                    fill="none"
                    stroke="#EAE5DC"
                    strokeWidth="13"
                  />
                  {(() => {
                    const circ = 2 * Math.PI * 48;
                    const billedLen = (portfolioMetrics.billedSharePct / 100) * circ;
                    const unbilledLen = (portfolioMetrics.unbilledSharePct / 100) * circ;
                    return (
                      <>
                        {unbilledLen > 0 && (
                          <circle
                            cx="65"
                            cy="65"
                            r="48"
                            fill="none"
                            stroke="#C59B27"
                            strokeWidth="13"
                            strokeDasharray={`${unbilledLen} ${circ - unbilledLen}`}
                            strokeDashoffset={0}
                          />
                        )}
                        {billedLen > 0 && (
                          <circle
                            cx="65"
                            cy="65"
                            r="48"
                            fill="none"
                            stroke="#E11D48"
                            strokeWidth="13"
                            strokeDasharray={`${billedLen} ${circ - billedLen}`}
                            strokeDashoffset={-unbilledLen}
                          />
                        )}
                      </>
                    );
                  })()}
                </svg>
                <div className="absolute text-center">
                  <span className="text-[9px] font-mono-data uppercase tracking-wider text-[#858078] block">
                    Utilization
                  </span>
                  <span className="text-sm font-mono-data font-extrabold text-[#111318]">
                    {portfolioMetrics.overallUtilizationPct}%
                  </span>
                  <span className="text-[9px] font-mono-data text-[#059669] block">
                    Prime Tier
                  </span>
                </div>
              </div>
            </div>

            <div className="sm:col-span-7 space-y-3">
              <div className="rounded-xl bg-white border border-[#EAE5DC] p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#E11D48]" />
                    Statement Billed Due ({portfolioMetrics.billedSharePct}%)
                  </span>
                  <div className="text-base font-bold font-mono-data text-[#111318] mt-0.5">
                    {formatINR(portfolioMetrics.totalStatementDueMinor)}
                  </div>
                </div>
                {activeCard && (
                  <button
                    type="button"
                    onClick={() => onOpenPayBillModal(activeCard)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#111318] hover:bg-[#222630] text-[#E5C158] text-xs font-semibold cursor-pointer"
                  >
                    Pay Bill →
                  </button>
                )}
              </div>

              <div className="rounded-xl bg-white border border-[#EAE5DC] p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
                    Unbilled Current Cycle ({portfolioMetrics.unbilledSharePct}%)
                  </span>
                  <div className="text-base font-bold font-mono-data text-[#111318] mt-0.5">
                    {formatINR(portfolioMetrics.totalUnbilledMinor)}
                  </div>
                </div>
                <span className="text-[11px] font-mono-data text-[#059669] font-semibold">
                  Interest-Free Float
                </span>
              </div>

              <div className="flex items-center justify-between text-xs px-1 text-[#52504C]">
                <span>Liquid Bank Coverage:</span>
                <strong className="font-mono-data text-[#059669]">
                  {formatINR(bankLiquidityMinor, { compact: true })} ({portfolioMetrics.liquidityCoverageRatio}x debt)
                </strong>
              </div>
            </div>
          </div>
        ) : (
          /* Mode 3: Category Mix with Interactive Filter Trigger */
          <div className="my-3.5 space-y-2.5 bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[#52504C]">
              <span className="font-semibold text-[#111318] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#C59B27]" />
                Top Credit Card Spend Categories (Click to filter ledger)
              </span>
              <button
                type="button"
                onClick={() => onSelectCategoryFilter('all')}
                className="text-[11px] font-semibold text-[#059669] hover:underline cursor-pointer"
              >
                Show All Categories
              </button>
            </div>

            {categoryMix.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#858078]">
                No credit card expenses recorded yet.
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {categoryMix.map((cat, idx) => {
                  const barColors = [
                    'bg-[#111318]',
                    'bg-[#059669]',
                    'bg-[#C59B27]',
                    'bg-[#0D9488]',
                    'bg-[#858078]',
                  ];
                  return (
                    <button
                      key={cat.category}
                      type="button"
                      onClick={() => onSelectCategoryFilter(cat.category)}
                      className="w-full text-left space-y-1 p-1.5 -mx-1.5 rounded-lg hover:bg-[#F3EFEA] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111318] group-hover:text-[#059669]">
                          {cat.category}{' '}
                          <span className="text-[10px] font-mono-data text-[#858078] font-normal">
                            ({cat.count} swipes)
                          </span>
                        </span>
                        <div className="flex items-center gap-2 font-mono-data tabular-nums">
                          <span className="text-[11px] text-[#858078]">{cat.sharePct}%</span>
                          <span className="font-bold text-[#111318]">
                            {formatINR(cat.amountMinor)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#EAE5DC] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                          style={{ width: `${Math.max(6, cat.sharePct)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom 4-Metric Institutional Strip */}
        <div className="pt-3.5 border-t border-[#EAE5DC] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
            <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#C59B27]" /> Statement Billed
            </div>
            <div className="text-sm font-bold font-mono-data tabular-nums text-[#111318] mt-0.5">
              {formatINR(portfolioMetrics.totalStatementDueMinor, { compact: true })}
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
            <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-[#059669]" /> Unbilled Float
            </div>
            <div className="text-sm font-bold font-mono-data tabular-nums text-[#111318] mt-0.5">
              {formatINR(portfolioMetrics.totalUnbilledMinor, { compact: true })}
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
            <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078]">
              Available Limit
            </div>
            <div className="text-sm font-bold font-mono-data tabular-nums text-[#059669] mt-0.5">
              {formatINR(portfolioMetrics.availableCreditMinor, { compact: true })}
            </div>
          </div>

          <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
            <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#059669]" /> Bank Coverage
            </div>
            <div className="text-sm font-bold font-mono-data tabular-nums text-[#059669] mt-0.5">
              {portfolioMetrics.liquidityCoverageRatio >= 10
                ? '100% Covered'
                : `${portfolioMetrics.liquidityCoverageRatio}x Covered`}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
