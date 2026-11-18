import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Compass,
  Eye,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { formatINR, SCOPE_META } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import {
  buildSmoothAreaPath,
  computeNetWorthSeries,
  type Point2D,
} from './dashboardVisuals.ts';
import type { DrillDownFilterSpec } from './LedgerDrillDownDrawer.tsx';
import type { WorkspaceId } from './types.ts';

export type WealthChartMode = 'net_worth' | 'cashflow' | 'allocation';

export interface InteractiveWealthChartProps {
  data: DashboardSummary;
  scopeFilter: Scope | 'all';
  onNavigate: (tab: WorkspaceId) => void;
  onInspectDrillDown?: (spec: DrillDownFilterSpec) => void;
}

export function InteractiveWealthChart({
  data,
  scopeFilter,
  onNavigate,
  onInspectDrillDown,
}: InteractiveWealthChartProps) {
  const [chartMode, setChartMode] = useState<WealthChartMode>('net_worth');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showForecast, setShowForecast] = useState<boolean>(true);

  const { series, periodGrowthPct, periodDeltaMinor, avgSavingsRatePct } = useMemo(
    () => computeNetWorthSeries(data.sixMonthTrend, data.netWorthMinor),
    [data.sixMonthTrend, data.netWorthMinor],
  );

  // Projected 90-day Net Worth based on average monthly net surplus
  const monthlyNetAvg = useMemo(() => {
    if (series.length === 0) return data.monthIncomeMinor - data.monthExpenseMinor;
    const sum = series.reduce((acc, s) => acc + s.netFlowMinor, 0);
    return Math.round(sum / series.length);
  }, [series, data.monthIncomeMinor, data.monthExpenseMinor]);

  const projected90dNetWorthMinor = data.netWorthMinor + Math.max(2500000, monthlyNetAvg * 3);

  const activePoint =
    hoverIndex !== null && series[hoverIndex]
      ? series[hoverIndex]
      : series[series.length - 1] ?? {
          month: data.referenceDate.slice(0, 7),
          shortMonth: 'Current',
          incomeMinor: data.monthIncomeMinor,
          expenseMinor: data.monthExpenseMinor,
          netFlowMinor: data.monthIncomeMinor - data.monthExpenseMinor,
          netWorthMinor: data.netWorthMinor,
          savingsRatePct:
            data.monthIncomeMinor > 0
              ? Math.round(
                  ((data.monthIncomeMinor - data.monthExpenseMinor) / data.monthIncomeMinor) * 100,
                )
              : 0,
        };

  // SVG Coordinate System
  const svgWidth = 680;
  const svgHeight = 228;
  const padLeft = 56;
  const padRight = showForecast && chartMode === 'net_worth' ? 88 : 24;
  const padTop = 34;
  const padBottom = 30;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;
  const baselineY = padTop + plotH;

  // Compute SVG paths, Y-axis scale ticks, and 90-day forecast path
  const chartGeometry = useMemo(() => {
    if (series.length === 0) {
      return {
        nwPoints: [] as Point2D[],
        inflowPoints: [] as Point2D[],
        outflowPoints: [] as Point2D[],
        nwPaths: { strokePath: '', areaPath: '' },
        inflowPaths: { strokePath: '', areaPath: '' },
        outflowPaths: { strokePath: '', areaPath: '' },
        forecastPoint: null as Point2D | null,
        forecastPath: '',
        yTicks: [] as Array<{ y: number; label: string }>,
      };
    }

    const nwValues = series.map((s) => s.netWorthMinor);
    if (showForecast && chartMode === 'net_worth') {
      nwValues.push(projected90dNetWorthMinor);
    }
    const minNw = Math.min(...nwValues);
    const maxNw = Math.max(...nwValues);
    const nwSpan = Math.max(100000, maxNw - minNw);

    const maxFlow = Math.max(
      100000,
      ...series.map((s) => Math.max(s.incomeMinor, s.expenseMinor)),
    );

    const stepX = series.length > 1 ? plotW / (series.length - 1) : 0;

    const nwPoints: Point2D[] = series.map((s, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - ((s.netWorthMinor - minNw) / nwSpan) * (plotH * 0.8) - plotH * 0.08,
    }));

    let forecastPoint: Point2D | null = null;
    let forecastPath = '';
    if (showForecast && chartMode === 'net_worth' && nwPoints.length > 0) {
      const lastPt = nwPoints[nwPoints.length - 1];
      const fx = Math.min(svgWidth - 28, lastPt.x + 64);
      const fy =
        padTop +
        plotH -
        ((projected90dNetWorthMinor - minNw) / nwSpan) * (plotH * 0.8) -
        plotH * 0.08;
      forecastPoint = { x: fx, y: fy };
      const cpx1 = lastPt.x + (fx - lastPt.x) * 0.45;
      const cpy1 = lastPt.y;
      const cpx2 = lastPt.x + (fx - lastPt.x) * 0.6;
      const cpy2 = fy;
      forecastPath = `M ${lastPt.x.toFixed(1)} ${lastPt.y.toFixed(1)} C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${fx.toFixed(1)} ${fy.toFixed(1)}`;
    }

    const inflowPoints: Point2D[] = series.map((s, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - (s.incomeMinor / maxFlow) * (plotH * 0.84),
    }));

    const outflowPoints: Point2D[] = series.map((s, idx) => ({
      x: padLeft + idx * stepX,
      y: padTop + plotH - (s.expenseMinor / maxFlow) * (plotH * 0.84),
    }));

    const yTicks = [0.15, 0.5, 0.85].map((ratio) => {
      const y = padTop + plotH * ratio;
      const val =
        chartMode === 'net_worth'
          ? maxNw - ratio * nwSpan
          : maxFlow * (1 - ratio);
      return {
        y,
        label: formatINR(Math.round(val), { compact: true }),
      };
    });

    return {
      nwPoints,
      inflowPoints,
      outflowPoints,
      nwPaths: buildSmoothAreaPath(nwPoints, baselineY),
      inflowPaths: buildSmoothAreaPath(inflowPoints, baselineY),
      outflowPaths: buildSmoothAreaPath(outflowPoints, baselineY),
      forecastPoint,
      forecastPath,
      yTicks,
    };
  }, [
    series,
    plotW,
    plotH,
    padLeft,
    padTop,
    baselineY,
    showForecast,
    chartMode,
    projected90dNetWorthMinor,
  ]);

  const activeIdx =
    hoverIndex !== null && hoverIndex < series.length
      ? hoverIndex
      : Math.max(0, series.length - 1);

  const activeSvgPt =
    chartMode === 'net_worth'
      ? chartGeometry.nwPoints[activeIdx]
      : chartGeometry.inflowPoints[activeIdx];

  const totalAssetsMinor =
    data.totalBankMinor + (data.totalInvestmentsMinor ?? 0) + data.totalNeedMinor;
  const totalLiabilitiesMinor =
    data.totalCardDebtMinor + data.totalBorrowedRemainingMinor + data.totalGiveMinor;

  const topCategories = data.monthTopCategories.slice(0, 5);
  const maxCatMinor = Math.max(1, ...topCategories.map((c) => c.amountMinor));

  const handleInspectActiveMonth = () => {
    if (!onInspectDrillDown) return;
    onInspectDrillDown({
      title: `${activePoint.shortMonth} Double-Entry Ledger`,
      subtitle: `Complete inflow, outflow, and transfer audit for ${activePoint.month}`,
      month: activePoint.month,
    });
  };

  return (
    <section className="bento-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between h-full relative overflow-hidden">
      {/* Top Executive Header & Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#EAE5DC]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold">
              {scopeFilter === 'all'
                ? 'Consolidated Sovereign Ledger'
                : `${SCOPE_META[scopeFilter].label} Scope Ledger`}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono-data font-semibold border ${
                periodDeltaMinor >= 0
                  ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                  : 'bg-rose-50 text-[#E11D48] border-rose-200'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              {periodDeltaMinor >= 0 ? '+' : ''}
              {periodGrowthPct}% (6M)
            </span>
          </div>

          {/* Hero Figure Readout */}
          <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111318] font-mono-data tabular-nums">
              {chartMode === 'net_worth'
                ? formatINR(activePoint.netWorthMinor)
                : chartMode === 'cashflow'
                  ? formatINR(activePoint.netFlowMinor, { signed: true })
                  : formatINR(data.monthExpenseMinor)}
            </h1>
            <span className="text-xs font-medium text-[#52504C]">
              {chartMode === 'net_worth'
                ? `as of ${activePoint.shortMonth}`
                : chartMode === 'cashflow'
                  ? `Net Surplus · ${activePoint.shortMonth}`
                  : 'Current Month Outflow'}
            </span>
          </div>
        </div>

        {/* Interactive Mode Switcher & Drill-Down Trigger */}
        <div className="flex items-center gap-1.5 self-start flex-wrap">
          {onInspectDrillDown && (
            <button
              type="button"
              onClick={handleInspectActiveMonth}
              title={`Inspect ${activePoint.shortMonth} ledger entries`}
              className="inline-flex items-center gap-1 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#111318] text-[#111318] hover:text-[#FAF8F5] px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Inspect {activePoint.shortMonth}</span>
            </button>
          )}

          {chartMode === 'net_worth' && (
            <button
              type="button"
              onClick={() => setShowForecast((v) => !v)}
              title="Toggle 90-day compound wealth projection"
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                showForecast
                  ? 'border-[#C59B27] bg-[#111318] text-[#E5C158]'
                  : 'border-[#EAE5DC] bg-[#FAF8F5] text-[#52504C] hover:text-[#111318]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>+90d Forecast</span>
            </button>
          )}

          <div
            role="tablist"
            aria-label="Wealth Chart Mode"
            className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'net_worth'}
              onClick={() => setChartMode('net_worth')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                chartMode === 'net_worth'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Net Worth
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'cashflow'}
              onClick={() => setChartMode('cashflow')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                chartMode === 'cashflow'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Cashflow Curve
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartMode === 'allocation'}
              onClick={() => setChartMode('allocation')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold transition-all cursor-pointer ${
                chartMode === 'allocation'
                  ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Spend Mix
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Chart Canvas */}
      {chartMode !== 'allocation' ? (
        <div className="my-3 relative">
          {/* Live Hover Readout Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[#52504C]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
                <span>Inflow:</span>
                <strong className="font-mono-data text-[#111318] tabular-nums">
                  {formatINR(activePoint.incomeMinor, { compact: true })}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#52504C]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C59B27]" />
                <span>Outflow:</span>
                <strong className="font-mono-data text-[#111318] tabular-nums">
                  {formatINR(activePoint.expenseMinor, { compact: true })}
                </strong>
              </span>
              {showForecast && chartMode === 'net_worth' && (
                <span className="inline-flex items-center gap-1.5 text-[#9A7B2C]">
                  <span className="h-2 w-2 rounded-full bg-[#C59B27]" />
                  <span>90d Est:</span>
                  <strong className="font-mono-data text-[#111318] tabular-nums">
                    {formatINR(projected90dNetWorthMinor, { compact: true })}
                  </strong>
                </span>
              )}
            </div>

            <div className="font-mono-data text-[11px] text-[#52504C]">
              Savings Velocity:{' '}
              <strong className="text-[#059669]">{activePoint.savingsRatePct}%</strong> (6M Avg:{' '}
              {avgSavingsRatePct}%)
            </div>
          </div>

          {/* Interactive SVG Surface */}
          <div className="relative w-full overflow-hidden rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] pt-2 pb-1 px-1">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-[212px] overflow-visible select-none"
              role="img"
              aria-label={
                chartMode === 'net_worth'
                  ? 'Six-month interactive net worth area chart with 90-day forecast'
                  : 'Six-month interactive inflow and outflow curves'
              }
            >
              <defs>
                <linearGradient id="emeraldAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                  <stop offset="65%" stopColor="#059669" stopOpacity="0.07" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="goldAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C59B27" stopOpacity="0.24" />
                  <stop offset="75%" stopColor="#C59B27" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#C59B27" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Architectural Grid Lines + Y-Axis Rupee Scale Labels */}
              {chartGeometry.yTicks.map((tick, idx) => (
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

              {chartMode === 'net_worth' ? (
                <>
                  {/* Smooth Area Fill */}
                  <path d={chartGeometry.nwPaths.areaPath} fill="url(#emeraldAreaGrad)" />
                  {/* Smooth Cubic-Bezier Stroke */}
                  <path
                    d={chartGeometry.nwPaths.strokePath}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* 90-Day Forecast Dotted Trajectory */}
                  {showForecast && chartGeometry.forecastPath && chartGeometry.forecastPoint && (
                    <g>
                      <path
                        d={chartGeometry.forecastPath}
                        fill="none"
                        stroke="#C59B27"
                        strokeWidth="2.5"
                        strokeDasharray="5 4"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={chartGeometry.forecastPoint.x}
                        cy={chartGeometry.forecastPoint.y}
                        r="5"
                        fill="#111318"
                        stroke="#E5C158"
                        strokeWidth="2.5"
                      />
                      <text
                        x={chartGeometry.forecastPoint.x}
                        y={chartGeometry.forecastPoint.y - 10}
                        textAnchor="middle"
                        className="text-[10px] font-mono-data font-bold"
                        fill="#9A7B2C"
                      >
                        +90d Est
                      </text>
                      <text
                        x={chartGeometry.forecastPoint.x}
                        y={svgHeight - 8}
                        textAnchor="middle"
                        className="text-[10px] font-mono-data font-semibold"
                        fill="#9A7B2C"
                      >
                        Q1 &apos;27
                      </text>
                    </g>
                  )}
                </>
              ) : (
                <>
                  {/* Dual Curve Mode: Inflow (Emerald) vs Outflow (Champagne Gold) */}
                  <path d={chartGeometry.inflowPaths.areaPath} fill="url(#emeraldAreaGrad)" />
                  <path d={chartGeometry.outflowPaths.areaPath} fill="url(#goldAreaGrad)" />
                  <path
                    d={chartGeometry.inflowPaths.strokePath}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                  />
                  <path
                    d={chartGeometry.outflowPaths.strokePath}
                    fill="none"
                    stroke="#C59B27"
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Active Crosshair & Data Nodes */}
              {series.map((item, idx) => {
                const pt =
                  chartMode === 'net_worth'
                    ? chartGeometry.nwPoints[idx]
                    : chartGeometry.inflowPoints[idx];
                const outPt = chartGeometry.outflowPoints[idx];
                if (!pt) return null;
                const isSelected = idx === activeIdx;

                return (
                  <g key={item.month}>
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
                        {/* Outer Halo Ring */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="11"
                          fill="#059669"
                          fillOpacity="0.14"
                        />
                      </>
                    )}

                    {/* Primary Node */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 5.5 : 4}
                      fill={isSelected ? '#111318' : '#FFFFFF'}
                      stroke="#059669"
                      strokeWidth={isSelected ? 3 : 2}
                    />

                    {/* Secondary Node in Cashflow Mode */}
                    {chartMode === 'cashflow' && outPt && (
                      <circle
                        cx={outPt.x}
                        cy={outPt.y}
                        r={isSelected ? 5 : 3.5}
                        fill="#FFFFFF"
                        stroke="#C59B27"
                        strokeWidth={2}
                      />
                    )}

                    {/* Month Axis Label */}
                    <text
                      x={pt.x}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      className="text-[11px] font-mono-data"
                      fill={isSelected ? '#111318' : '#858078'}
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {item.shortMonth}
                    </text>

                    {/* Invisible Wide Hit Column for Smooth Pointer Scrubbing + Click Drill-Down */}
                    <rect
                      x={pt.x - plotW / Math.max(2, series.length * 2)}
                      y={0}
                      width={plotW / Math.max(1, series.length)}
                      height={svgHeight}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverIndex(idx)}
                      onClick={() => {
                        setHoverIndex(idx);
                        if (onInspectDrillDown) {
                          onInspectDrillDown({
                            title: `${item.shortMonth} Double-Entry Ledger`,
                            subtitle: `Complete inflow, outflow, and transfer audit for ${item.month}`,
                            month: item.month,
                          });
                        }
                      }}
                    />
                  </g>
                );
              })}

              {/* Floating Obsidian Glass Tooltip Pill Anchored Above Active Node */}
              {activeSvgPt && (
                <g
                  transform={`translate(${Math.min(
                    svgWidth - 155,
                    Math.max(padLeft + 10, activeSvgPt.x - 68),
                  )}, ${Math.max(6, activeSvgPt.y - 34)})`}
                  className="pointer-events-none"
                >
                  <rect
                    x="0"
                    y="0"
                    width="136"
                    height="24"
                    rx="7"
                    fill="#111318"
                    stroke="#C59B27"
                    strokeWidth="0.9"
                  />
                  <text
                    x="68"
                    y="15.5"
                    textAnchor="middle"
                    className="text-[10px] font-mono-data font-semibold"
                    fill="#FAF8F5"
                  >
                    {activePoint.shortMonth}:{' '}
                    {formatINR(
                      chartMode === 'net_worth'
                        ? activePoint.netWorthMinor
                        : activePoint.netFlowMinor,
                      { compact: true, signed: chartMode === 'cashflow' },
                    )}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      ) : (
        /* Mode 3: Spend Allocation with SVG Radial Donut + Interactive Category Velocity Bars */
        <div className="my-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#52504C]">
            <span className="font-semibold text-[#111318] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#C59B27]" />
              Outflow Architecture &amp; Category Velocity (Click category to drill down)
            </span>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
            >
              Full P&amp;L Breakdown →
            </button>
          </div>

          {topCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] p-8 text-center text-xs text-[#858078]">
              No category spend recorded for this month yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-[#FAF8F5] border border-[#EAE5DC] rounded-xl p-4 items-center">
              {/* SVG Multi-Segment Allocation Ring */}
              <div className="sm:col-span-4 flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <svg width="128" height="128" viewBox="0 0 120 120" className="-rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke="#EAE5DC"
                      strokeWidth="12"
                    />
                    {(() => {
                      const circumference = 2 * Math.PI * 44;
                      const strokeHexes = ['#111318', '#059669', '#C59B27', '#0D9488', '#858078'];
                      let cumulativeOffset = 0;
                      const totalTop = Math.max(
                        1,
                        topCategories.reduce((s, c) => s + c.amountMinor, 0),
                      );
                      return topCategories.map((cat, idx) => {
                        const frac = cat.amountMinor / totalTop;
                        const segLen = Math.max(4, frac * circumference - 3);
                        const dashArray = `${segLen} ${circumference - segLen}`;
                        const dashOffset = -cumulativeOffset;
                        cumulativeOffset += frac * circumference;
                        return (
                          <circle
                            key={cat.category}
                            cx="60"
                            cy="60"
                            r="44"
                            fill="none"
                            stroke={strokeHexes[idx % strokeHexes.length]}
                            strokeWidth="12"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-[9px] font-mono-data uppercase tracking-wider text-[#858078] block">
                      Top 5 Share
                    </span>
                    <span className="text-xs font-mono-data font-bold text-[#111318]">
                      {formatINR(data.monthExpenseMinor, { compact: true })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive Category Bars */}
              <div className="sm:col-span-8 space-y-2">
                {topCategories.map((cat, idx) => {
                  const pctOfMax = Math.max(6, Math.round((cat.amountMinor / maxCatMinor) * 100));
                  const sharePct =
                    data.monthExpenseMinor > 0
                      ? Math.round((cat.amountMinor / data.monthExpenseMinor) * 100)
                      : 0;
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
                      onClick={() =>
                        onInspectDrillDown?.({
                          title: `${cat.category} · Category Audit`,
                          subtitle: `Current month transactions tagged under ${cat.category}`,
                          month: data.referenceDate.slice(0, 7),
                          category: cat.category,
                        })
                      }
                      className="w-full text-left space-y-1 p-1.5 -mx-1.5 rounded-lg hover:bg-[#F3EFEA] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111318] group-hover:text-[#059669] transition-colors">
                          {cat.category}
                        </span>
                        <div className="flex items-center gap-2 font-mono-data tabular-nums">
                          <span className="text-[11px] text-[#858078]">{sharePct}%</span>
                          <span className="font-bold text-[#111318]">
                            {formatINR(cat.amountMinor, { decimals: false })}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#EAE5DC] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                          style={{ width: `${pctOfMax}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Balance Sheet & Scope Strip */}
      <div className="pt-3.5 border-t border-[#EAE5DC] grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
          <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3 text-[#059669]" /> Total Assets
          </div>
          <div className="text-sm font-bold font-mono-data tabular-nums text-[#059669] mt-0.5">
            {formatINR(totalAssetsMinor, { compact: true })}
          </div>
        </div>

        <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
          <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-[#E11D48]" /> Liabilities
          </div>
          <div className="text-sm font-bold font-mono-data tabular-nums text-[#E11D48] mt-0.5">
            {formatINR(totalLiabilitiesMinor, { compact: true })}
          </div>
        </div>

        <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
          <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078]">
            Personal Outflow
          </div>
          <div className="text-sm font-bold font-mono-data tabular-nums text-[#111318] mt-0.5">
            {formatINR(data.monthByScope.personal.expenseMinor, { compact: true })}
          </div>
        </div>

        <div className="rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] px-3 py-2">
          <div className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#C59B27]" /> Business / Family
          </div>
          <div className="text-sm font-bold font-mono-data tabular-nums text-[#111318] mt-0.5">
            {formatINR(
              data.monthByScope.business.expenseMinor + data.monthByScope.family.expenseMinor,
              { compact: true },
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
