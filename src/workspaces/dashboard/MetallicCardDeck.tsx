import React, { useRef, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  ListFilter,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { formatDisplayDateShort, formatINR, formatOrdinalDay, SCOPE_META } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import {
  computeCardTiltTransform,
  computeCycleArcGeometry,
  getMetallicFinishById,
  resolveMetallicFinish,
  type MetallicFinishId,
  type TiltGlareState,
} from './dashboardVisuals.ts';
import { ScopeBadge } from '../../components/ui/Primitives.tsx';
import type { DrillDownFilterSpec } from './LedgerDrillDownDrawer.tsx';
import type { WorkspaceId } from './types.ts';

export interface MetallicCardDeckProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
  onInspectDrillDown?: (spec: DrillDownFilterSpec) => void;
}

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
    // Interlocking World Elite metallic circles
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

export function MetallicCardDeck({
  data,
  onNavigate,
  onOpenQuickAdd,
  onInspectDrillDown,
}: MetallicCardDeckProps) {
  const [deckMode, setDeckMode] = useState<'credit' | 'bank'>(
    data.cards.length > 0 ? 'credit' : 'bank',
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishOverride, setFinishOverride] = useState<'auto' | MetallicFinishId>('auto');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState<TiltGlareState>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 30,
  });

  const cardRef = useRef<HTMLDivElement | null>(null);

  const items = deckMode === 'credit' ? data.cards : data.banks;
  const safeIndex = items.length > 0 ? activeIndex % items.length : 0;
  const activeAccount = items[safeIndex] ?? null;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = computeCardTiltTransform(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      9,
    );
    setTilt(next);
  };

  const handlePointerLeave = () => {
    setIsHovering(false);
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 30 });
  };

  const handleDeckKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (items.length <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      setIsFlipped(false);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % items.length);
      setIsFlipped(false);
    }
  };

  const finish =
    finishOverride === 'auto'
      ? resolveMetallicFinish(activeAccount?.name || 'Sovereign Reserve', safeIndex, deckMode)
      : getMetallicFinishById(finishOverride, deckMode);

  // Extract cycle or bank telemetry
  const cardCycle =
    deckMode === 'credit' && activeAccount && 'cardCycle' in activeAccount
      ? activeAccount.cardCycle
      : undefined;
  const daysUntilDue = cardCycle?.daysUntilDue ?? 18;
  const utilPct =
    cardCycle?.utilizationPct ??
    (activeAccount?.creditLimitMinor
      ? Math.min(
          100,
          Math.round((Math.abs(activeAccount.currentBalanceMinor) / activeAccount.creditLimitMinor) * 100),
        )
      : 0);
  const cycleArc = computeCycleArcGeometry(daysUntilDue, 18);

  const primaryBalanceMinor =
    deckMode === 'credit'
      ? cardCycle?.totalOutstandingMinor ?? Math.abs(activeAccount?.currentBalanceMinor ?? 0)
      : activeAccount?.currentBalanceMinor ?? 0;

  const secondaryMetricLabel = deckMode === 'credit' ? 'Statement Due' : 'Safety Floor';
  const secondaryMetricMinor =
    deckMode === 'credit'
      ? cardCycle?.statementDueMinor ?? 0
      : activeAccount?.minBalanceMinor ?? 0;

  const thirdMetricLabel = deckMode === 'credit' ? 'Credit Limit' : 'Account Scope';
  const thirdMetricValue =
    deckMode === 'credit'
      ? formatINR(activeAccount?.creditLimitMinor ?? 0, { compact: true })
      : SCOPE_META[activeAccount?.scope ?? 'business'].label;

  const deterministicCvv = activeAccount
    ? String(((Number(activeAccount.last4 || 1004) * 7 + 319) % 899) + 100)
    : '842';

  return (
    <section
      tabIndex={0}
      onKeyDown={handleDeckKeyDown}
      aria-label="Interactive 3D Metallic Instrument Deck (Use Left/Right arrows to switch cards)"
      className="bento-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between h-full relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
    >
      {/* Top Deck Switcher Header */}
      <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#EAE5DC]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              Tactile Instrument Deck
            </span>
          </div>
          <h2 className="font-display text-sm sm:text-base font-bold text-[#111318] mt-0.5 truncate">
            {deckMode === 'credit' ? '3D Metallic Credit Cards' : 'Institutional Passbooks'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 3D Flip Card Button */}
          {activeAccount && (
            <button
              type="button"
              onClick={() => setIsFlipped((v) => !v)}
              title="Flip physical card (Front / Back)"
              aria-label={isFlipped ? 'Show card front' : 'Flip card to inspect back'}
              className={`inline-flex items-center gap-1 rounded-xl border px-2 sm:px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                isFlipped
                  ? 'border-[#C59B27] bg-[#111318] text-[#E5C158]'
                  : 'border-[#EAE5DC] bg-[#FAF8F5] text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <RotateCw className={`h-3.5 w-3.5 transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
              <span className="hidden sm:inline">{isFlipped ? 'Front' : 'Flip 3D'}</span>
            </button>
          )}

          {/* Mode Segmented Toggle */}
          <div
            role="group"
            aria-label="Instrument Deck Type"
            className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs"
          >
            <button
              type="button"
              onClick={() => {
                setDeckMode('credit');
                setActiveIndex(0);
                setIsFlipped(false);
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                deckMode === 'credit'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Cards ({data.cards.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeckMode('bank');
                setActiveIndex(0);
                setIsFlipped(false);
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                deckMode === 'bank'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Banks ({data.banks.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive 3D Metallic Card Stage with Fanned Physical Stack */}
      <div className="my-3.5 pt-2 pb-1 relative metallic-card-stage select-none">
        {/* Fanned Background Metallic Cards for Realistic Multi-Card Depth */}
        {items.length > 1 && (
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

        {activeAccount ? (
          <div
            ref={cardRef}
            onPointerEnter={() => setIsHovering(true)}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`metallic-card-body ${finish.cssClass} relative rounded-2xl p-4 sm:p-5 min-h-[214px] sm:min-h-[220px] flex flex-col justify-between overflow-hidden ${
              finish.isLightSurface ? 'text-[#111318]' : 'text-[#FAF8F5]'
            }`}
            style={{
              transform: isHovering
                ? `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(1.015, 1.015, 1.015)`
                : 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
            }}
          >
            {/* Dynamic Mouse-Tracking Specular Foil Glare */}
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
              /* ==================== FRONT OF METALLIC CARD ==================== */
              <>
                {/* Subtle Micro-Engraved Geometric Guilloche Lines */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 h-full w-3/4 opacity-15"
                  viewBox="0 0 300 200"
                  fill="none"
                >
                  <circle cx="260" cy="30" r="90" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" />
                  <circle cx="260" cy="30" r="130" stroke="currentColor" strokeWidth="0.75" />
                  <circle cx="260" cy="30" r="170" stroke="currentColor" strokeWidth="0.5" />
                </svg>

                {/* Card Top Row: Issuer Name, Tier Badge & Radial Cycle Gauge */}
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
                      <ScopeBadge scope={activeAccount.scope} size="xs" />
                    </div>
                    <h3 className="font-display text-base sm:text-lg font-bold tracking-tight mt-1.5 truncate">
                      {activeAccount.name}
                    </h3>
                  </div>

                  {/* Radial SVG Cycle Gauge (for Credit Cards) or Shield Badge (for Banks) */}
                  {deckMode === 'credit' ? (
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
                  ) : (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-mono-data border shrink-0 ${
                        finish.isLightSurface
                          ? 'bg-white/70 border-[#111318]/15 text-[#111318]'
                          : 'bg-black/25 border-white/12 text-[#6EE7B7]'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>VERIFIED</span>
                    </div>
                  )}
                </div>

                {/* Card Middle Row: Realistic Gold EMV Chip + Contactless NFC + Laser-Etched Number */}
                <div className="relative z-10 my-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Realistic Metallic EMV Chip SVG */}
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
                        fill={`url(#chipGrad-${activeAccount.id})`}
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
                          id={`chipGrad-${activeAccount.id}`}
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
                    •••• •••• •••• {activeAccount.last4 || '1004'}
                  </div>
                </div>

                {/* Card Bottom Row: Balance Readout, Utilization Bar & Network Emblem */}
                <div className="relative z-10 pt-2 border-t border-current/12 flex items-end justify-between gap-3">
                  <div>
                    <div
                      className={`text-[10px] uppercase tracking-widest font-mono-data ${
                        finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                      }`}
                    >
                      {deckMode === 'credit' ? 'Current Outstanding' : 'Available Liquid Balance'}
                    </div>
                    <div className="text-xl sm:text-2xl font-bold font-mono-data tabular-nums tracking-tight mt-0.5">
                      {formatINR(primaryBalanceMinor)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <CardNetworkEmblem name={activeAccount.name} isLightSurface={finish.isLightSurface} />
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-mono-data ${
                          finish.isLightSurface ? 'text-[#52504C]' : 'text-white/65'
                        }`}
                      >
                        {deckMode === 'credit' ? `${utilPct}% Used` : 'Reconciled'}
                      </span>
                      {deckMode === 'credit' && (
                        <div className="w-16 h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              utilPct > 50 ? 'bg-rose-400' : utilPct > 30 ? 'bg-[#E5C158]' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.max(6, utilPct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* ==================== BACK OF METALLIC CARD (3D INSPECTOR) ==================== */
              <div className="relative z-10 flex flex-col justify-between h-[182px] animate-panel-in">
                {/* Magnetic Stripe */}
                <div className="-mx-5 -mt-1 h-9 bg-gradient-to-r from-[#090A0D] via-[#1E222B] to-[#090A0D] border-y border-white/10" />

                {/* Signature & Dynamic CVV Security Strip */}
                <div className="flex items-center justify-between gap-3 my-2">
                  <div className="flex-1 h-8 rounded-lg bg-white/12 border border-white/15 px-3 flex items-center justify-between">
                    <span className="text-[10px] font-mono-data uppercase tracking-widest opacity-70">
                      AUTHORIZED SIGNATURE · {activeAccount.institution || 'SOVEREIGN BANK'}
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

                {/* Billing Cycle & Statement Telemetry Grid */}
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-black/28 border border-white/12 p-2.5 text-xs font-mono-data">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider opacity-65 block">Statement Day</span>
                    <span className="font-bold text-white">
                      {formatOrdinalDay(activeAccount.statementDay || 15)} of mo
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider opacity-65 block">Payment Due</span>
                    <span className="font-bold text-[#E5C158]">
                      {formatOrdinalDay(activeAccount.dueDay || 5)} of mo
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase tracking-wider opacity-65 block">Unbilled Spend</span>
                    <span className="font-bold text-emerald-300">
                      {formatINR(cardCycle?.unbilledMinor ?? primaryBalanceMinor, { compact: true })}
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
              No {deckMode === 'credit' ? 'Credit Cards' : 'Bank Accounts'} Configured
            </div>
            <p className="text-xs text-[#52504C]">
              Add an instrument in the {deckMode === 'credit' ? 'Cards' : 'Bank & Cash'} hub to inspect live 3D telemetry.
            </p>
          </div>
        )}
      </div>

      {/* Card Switcher Dots, Luxury Finish Swatches & Telemetry Strip */}
      <div className="space-y-2.5 pt-1">
        {items.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
                setIsFlipped(false);
              }}
              aria-label="Previous card"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {items.map((item, idx) => {
                const isSelected = idx === safeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveIndex(idx);
                      setIsFlipped(false);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#111318] text-[#FAF8F5] font-semibold'
                        : 'bg-[#F3EFEA] text-[#52504C] hover:text-[#111318]'
                    }`}
                  >
                    <span className="truncate max-w-[90px]">{item.name}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveIndex((prev) => (prev + 1) % items.length);
                setIsFlipped(false);
              }}
              aria-label="Next card"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#EAE5DC] bg-[#FAF8F5] text-[#111318] hover:bg-[#F3EFEA] cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Tactile Metallic Finish Customizer Swatches */}
        <div className="flex items-center justify-between gap-2 px-1 py-1 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
          <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] pl-1.5">
            Foil Finish: <strong className="text-[#111318]">{finish.label}</strong>
          </span>
          <div className="flex items-center gap-1 pr-1" role="group" aria-label="Select Card Metallic Finish">
            {FINISH_SWATCHES.map((sw) => {
              const active = finishOverride === sw.id;
              return (
                <button
                  key={sw.id}
                  type="button"
                  title={`Finish: ${sw.label}`}
                  aria-label={`Finish ${sw.label}`}
                  onClick={() => setFinishOverride(sw.id)}
                  className={`h-5 px-1.5 rounded-md text-[10px] font-mono-data inline-flex items-center gap-1 border transition-all cursor-pointer ${
                    active
                      ? 'border-[#111318] bg-[#111318] text-[#FAF8F5] font-semibold'
                      : 'border-[#EAE5DC] bg-white text-[#52504C] hover:border-[#858078]'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${sw.swatchClass} border border-white/40`} />
                  <span className="hidden sm:inline">{sw.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Precision Telemetry Readout */}
        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#EAE5DC] text-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#858078] block font-mono-data">
              {secondaryMetricLabel}
            </span>
            <span className="font-mono-data font-bold text-[#111318] tabular-nums">
              {formatINR(secondaryMetricMinor, { compact: true })}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#858078] block font-mono-data">
              {deckMode === 'credit' ? 'Next Due Date' : 'Min Floor'}
            </span>
            <span className="font-mono-data font-bold text-[#111318] tabular-nums">
              {deckMode === 'credit'
                ? formatDisplayDateShort(cardCycle?.nextDueDate) ||
                  formatOrdinalDay(activeAccount?.dueDay || 5)
                : activeAccount?.minBalanceMinor
                  ? formatINR(activeAccount.minBalanceMinor, { compact: true })
                  : 'None'}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-[#858078] block font-mono-data">
              {thirdMetricLabel}
            </span>
            <span className="font-mono-data font-bold text-[#059669] tabular-nums">
              {thirdMetricValue}
            </span>
          </div>
        </div>

        {/* Direct Action Bar with Account Ledger Inspector */}
        <div className="flex items-center justify-between gap-1.5 pt-1">
          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="flex-1 py-2 px-2.5 rounded-xl bg-[#F3EFEA] hover:bg-[#EAE5DC] text-[#111318] text-xs font-semibold transition-colors cursor-pointer text-center truncate"
          >
            {deckMode === 'credit' ? 'Record Spend / Pay' : 'Record Bank Entry'}
          </button>

          {activeAccount && onInspectDrillDown && (
            <button
              type="button"
              onClick={() =>
                onInspectDrillDown({
                  title: `${activeAccount.name} · Passbook Audit`,
                  subtitle: `All double-entry transactions recorded on ${activeAccount.name}`,
                  accountId: activeAccount.id,
                  accountName: activeAccount.name,
                })
              }
              title={`Inspect transactions for ${activeAccount.name}`}
              className="inline-flex items-center gap-1 py-2 px-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              <ListFilter className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Ledger</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate(deckMode === 'credit' ? 'cards' : 'money')}
            className="inline-flex items-center gap-1 py-2 px-2.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            <span>{deckMode === 'credit' ? 'Cards Hub' : 'Banks Hub'}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#E5C158]" />
          </button>
        </div>
      </div>
    </section>
  );
}
