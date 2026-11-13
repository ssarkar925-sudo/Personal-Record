import { useState } from 'react';
import { formatINR } from '../../lib/format.ts';
import type { Scope } from '../../../shared/ledger-core.ts';

export interface MonthlyTrendPoint {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  personalExpenseMinor?: number;
  businessExpenseMinor?: number;
  familyExpenseMinor?: number;
}

function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[(m - 1) % 12] ?? ym} '${String(y).slice(2)}`;
}

export function CashflowTrendChart({
  data,
  stackedByScope = true,
}: {
  data: MonthlyTrendPoint[];
  stackedByScope?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    100_00,
    ...data.map((d) => Math.max(d.incomeMinor, d.expenseMinor)),
  );
  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div>
      {/* Legend + Active Month Readout */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
            Income
          </span>
          {stackedByScope ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-blue-600" />
                Personal Exp
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                Business Exp
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" />
                Family Exp
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" />
              Expense
            </span>
          )}
        </div>

        {active && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 tabular-nums text-[11px]">
            <span className="font-semibold text-slate-700">{shortMonthLabel(active.month)}</span>
            <span className="text-emerald-700 font-medium">+{formatINR(active.incomeMinor, { compact: true })}</span>
            <span className="text-rose-700 font-medium">-{formatINR(active.expenseMinor, { compact: true })}</span>
          </div>
        )}
      </div>

      {/* Multi-color Animated SVG/Bar Grid */}
      <div className="grid grid-cols-6 gap-2.5 items-end h-44 pt-4 pb-1 border-b border-slate-200">
        {data.map((pt, idx) => {
          const incPct = Math.max(pt.incomeMinor > 0 ? 4 : 0, Math.round((pt.incomeMinor / maxVal) * 100));
          const expPct = Math.max(pt.expenseMinor > 0 ? 4 : 0, Math.round((pt.expenseMinor / maxVal) * 100));

          const pMinor = pt.personalExpenseMinor ?? 0;
          const bMinor = pt.businessExpenseMinor ?? 0;
          const fMinor = pt.familyExpenseMinor ?? 0;
          const hasSplit = stackedByScope && pMinor + bMinor + fMinor > 0;

          const pShare = hasSplit && pt.expenseMinor > 0 ? (pMinor / pt.expenseMinor) * 100 : 0;
          const bShare = hasSplit && pt.expenseMinor > 0 ? (bMinor / pt.expenseMinor) * 100 : 0;
          const fShare = hasSplit && pt.expenseMinor > 0 ? (fMinor / pt.expenseMinor) * 100 : 0;

          const isSelected = hoverIdx === idx;

          return (
            <button
              key={pt.month}
              type="button"
              onMouseEnter={() => setHoverIdx(idx)}
              onFocus={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="group flex flex-col items-center h-full justify-end focus:outline-none cursor-pointer"
              aria-label={`${shortMonthLabel(pt.month)}: Income ${formatINR(pt.incomeMinor)}, Expense ${formatINR(pt.expenseMinor)}`}
            >
              <div className="flex w-full items-end justify-center gap-1.5 h-36 px-1">
                {/* Income Bar */}
                <div
                  className="w-3.5 sm:w-4 rounded-t-md bg-emerald-600/90 group-hover:bg-emerald-600 transition-all animate-bar-rise"
                  style={{
                    height: `${incPct}%`,
                    animationDelay: `${idx * 45}ms`,
                    opacity: isSelected || hoverIdx === null ? 1 : 0.65,
                  }}
                />
                {/* Expense Bar (Stacked Multi-color by Scope when available) */}
                <div
                  className="w-3.5 sm:w-4 rounded-t-md overflow-hidden flex flex-col-reverse bg-rose-500/90 animate-bar-rise"
                  style={{
                    height: `${expPct}%`,
                    animationDelay: `${idx * 45 + 30}ms`,
                    opacity: isSelected || hoverIdx === null ? 1 : 0.65,
                  }}
                >
                  {hasSplit ? (
                    <>
                      <div style={{ height: `${pShare}%` }} className="w-full bg-blue-600" />
                      <div style={{ height: `${bShare}%` }} className="w-full bg-amber-500" />
                      <div style={{ height: `${fShare}%` }} className="w-full bg-rose-500" />
                    </>
                  ) : null}
                </div>
              </div>
              <span
                className={`mt-1.5 text-[11px] tabular-nums ${
                  isSelected ? 'font-semibold text-slate-900' : 'text-slate-500'
                }`}
              >
                {shortMonthLabel(pt.month)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScopeDonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ scope: Scope; label: string; amountMinor: number; colorHex: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.amountMinor), 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={centerLabel}>
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          {total > 0 &&
            slices.map((slice) => {
              const val = Math.max(0, slice.amountMinor);
              if (val === 0) return null;
              const segLen = (val / total) * circumference;
              const offset = -cumulative;
              cumulative += segLen;
              return (
                <circle
                  key={slice.scope}
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke={slice.colorHex}
                  strokeWidth="14"
                  strokeLinecap="butt"
                  strokeDasharray={`${Math.max(0, segLen - 1.5)} ${circumference}`}
                  strokeDashoffset={offset}
                  className="transition-all duration-500 ease-out"
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{centerLabel}</span>
          <span className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{centerValue}</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((Math.max(0, s.amountMinor) / total) * 100) : 0;
          return (
            <div key={s.scope} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />
                  {s.label}
                </span>
                <span className="tabular-nums text-slate-700 font-medium">
                  {formatINR(s.amountMinor, { decimals: false })}{' '}
                  <span className="text-slate-400">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: s.colorHex }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MeterBar({
  pct,
  colorHex,
  heightClass = 'h-2',
}: {
  pct: number;
  colorHex: string;
  heightClass?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${heightClass}`}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: colorHex }}
      />
    </div>
  );
}

export function SparklineChart({
  values,
  colorHex = '#2563eb',
  height = 34,
}: {
  values: number[];
  colorHex?: string;
  height?: number;
}) {
  const pts = values.length >= 2 ? values : [0, values[0] ?? 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const width = 180;
  const coords = pts.map((v, idx) => {
    const x = (idx / (pts.length - 1)) * width;
    const y = height - 4 - ((v - min) / span) * (height - 10);
    return { x, y };
  });

  const linePath = coords
    .map((p, idx) => {
      if (idx === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      const prev = coords[idx - 1];
      const cx = ((prev.x + p.x) / 2).toFixed(1);
      return `C${cx},${prev.y.toFixed(1)} ${cx},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1];
  const gradId = `spark-${colorHex.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colorHex} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colorHex} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={colorHex}
        strokeWidth="2.2"
        strokeLinecap="round"
        className="animate-line-draw"
      />
      <circle cx={last.x} cy={last.y} r="3.2" fill={colorHex} stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  );
}
