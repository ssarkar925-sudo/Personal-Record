export type MetallicFinishId = 'obsidian' | 'gold' | 'emerald' | 'platinum';

export interface MetallicFinishMeta {
  id: MetallicFinishId;
  label: string;
  tierBadge: string;
  cssClass: string;
  isLightSurface: boolean;
  accentHex: string;
  chipPrimaryHex: string;
  chipSecondaryHex: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface SmoothSvgPaths {
  strokePath: string;
  areaPath: string;
}

export interface EnrichedTrendPoint {
  month: string;
  shortMonth: string;
  incomeMinor: number;
  expenseMinor: number;
  netFlowMinor: number;
  netWorthMinor: number;
  savingsRatePct: number;
}

export interface TiltGlareState {
  rotateX: number;
  rotateY: number;
  glareX: number;
  glareY: number;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortMonthLabel(yyyyMm: string): string {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm || '';
  const [year, monthStr] = yyyyMm.split('-');
  const mIdx = Number(monthStr) - 1;
  if (mIdx >= 0 && mIdx < 12) {
    return `${SHORT_MONTHS[mIdx]} '${year.slice(-2)}`;
  }
  return yyyyMm;
}

/**
 * Generates a smooth Catmull-Rom / cubic-bezier SVG stroke path and closed area path
 * for a sequence of 2D coordinates.
 */
export function buildSmoothAreaPath(points: Point2D[], baselineY: number): SmoothSvgPaths {
  if (points.length === 0) {
    return { strokePath: '', areaPath: '' };
  }
  if (points.length === 1) {
    const p = points[0];
    const strokePath = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const areaPath = `${strokePath} L ${p.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
    return { strokePath, areaPath };
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cpx1 = curr.x + (next.x - curr.x) * 0.42;
    const cpy1 = curr.y;
    const cpx2 = curr.x + (next.x - curr.x) * 0.58;
    const cpy2 = next.y;
    d += ` C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${d} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;

  return { strokePath: d, areaPath };
}

/**
 * Reconstructs historical net worth and cashflow velocity across the 6-month trend window.
 */
export function computeNetWorthSeries(
  sixMonthTrend: Array<{ month: string; incomeMinor: number; expenseMinor: number }>,
  currentNetWorthMinor: number,
): {
  series: EnrichedTrendPoint[];
  periodGrowthPct: number;
  periodDeltaMinor: number;
  avgSavingsRatePct: number;
} {
  if (!sixMonthTrend || sixMonthTrend.length === 0) {
    return {
      series: [],
      periodGrowthPct: 0,
      periodDeltaMinor: 0,
      avgSavingsRatePct: 0,
    };
  }

  const netFlows = sixMonthTrend.map((m) => m.incomeMinor - m.expenseMinor);
  const netWorths = new Array<number>(sixMonthTrend.length).fill(currentNetWorthMinor);

  for (let i = sixMonthTrend.length - 2; i >= 0; i--) {
    netWorths[i] = netWorths[i + 1] - netFlows[i + 1];
  }

  const series: EnrichedTrendPoint[] = sixMonthTrend.map((item, idx) => {
    const netFlowMinor = item.incomeMinor - item.expenseMinor;
    const savingsRatePct =
      item.incomeMinor > 0 ? Math.round((netFlowMinor / item.incomeMinor) * 100) : 0;

    return {
      month: item.month,
      shortMonth: formatShortMonthLabel(item.month),
      incomeMinor: item.incomeMinor,
      expenseMinor: item.expenseMinor,
      netFlowMinor,
      netWorthMinor: netWorths[idx],
      savingsRatePct,
    };
  });

  const startNw = series[0].netWorthMinor;
  const endNw = series[series.length - 1].netWorthMinor;
  const periodDeltaMinor = endNw - startNw;
  const denom = Math.max(100000, Math.abs(startNw));
  const periodGrowthPct = Number(((periodDeltaMinor / denom) * 100).toFixed(1));

  const validSavings = series.filter((s) => s.incomeMinor > 0);
  const avgSavingsRatePct =
    validSavings.length > 0
      ? Math.round(validSavings.reduce((acc, s) => acc + s.savingsRatePct, 0) / validSavings.length)
      : 0;

  return {
    series,
    periodGrowthPct,
    periodDeltaMinor,
    avgSavingsRatePct,
  };
}

/**
 * Computes bounded 3D rotation angles and specular glare coordinates for a physical card.
 */
export function computeCardTiltTransform(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  maxTiltDeg = 10,
): TiltGlareState {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const normX = Math.max(0, Math.min(1, offsetX / safeW));
  const normY = Math.max(0, Math.min(1, offsetY / safeH));

  // Tilting towards the pointer: top half tilts backward (+rotateX), right half tilts right (+rotateY)
  const rotateX = Number((((0.5 - normY) * 2) * maxTiltDeg).toFixed(2));
  const rotateY = Number((((normX - 0.5) * 2) * maxTiltDeg).toFixed(2));
  const glareX = Math.round(normX * 100);
  const glareY = Math.round(normY * 100);

  return { rotateX, rotateY, glareX, glareY };
}

/**
 * Maps an account name and index to one of the 4 bespoke luxury metallic finishes.
 */
export function resolveMetallicFinish(
  name: string,
  index: number,
  kind: 'credit' | 'bank' = 'credit',
): MetallicFinishMeta {
  const lower = (name || '').toLowerCase();

  if (lower.includes('infinia') || lower.includes('amex') || lower.includes('black') || lower.includes('obsidian')) {
    return {
      id: 'obsidian',
      label: 'Obsidian Titanium',
      tierBadge: kind === 'credit' ? 'INFINITE RESERVE' : 'PRIVATE TREASURY',
      cssClass: 'metallic-finish-obsidian',
      isLightSurface: false,
      accentHex: '#D4AF37',
      chipPrimaryHex: '#E5C158',
      chipSecondaryHex: '#9A7B2C',
    };
  }

  if (lower.includes('gold') || lower.includes('regalia') || lower.includes('magnus') || lower.includes('icici')) {
    return {
      id: 'gold',
      label: 'Champagne Gold Reserve',
      tierBadge: kind === 'credit' ? 'SOVEREIGN GOLD' : 'WEALTH PASSBOOK',
      cssClass: 'metallic-finish-gold',
      isLightSurface: false,
      accentHex: '#FBE698',
      chipPrimaryHex: '#FFF0B8',
      chipSecondaryHex: '#B89130',
    };
  }

  if (lower.includes('emerald') || lower.includes('sbi') || lower.includes('axis') || lower.includes('hdfc')) {
    const pickObsidian = index % 2 === 0 && kind === 'credit';
    if (pickObsidian) {
      return {
        id: 'obsidian',
        label: 'Obsidian Titanium',
        tierBadge: 'INFINITE RESERVE',
        cssClass: 'metallic-finish-obsidian',
        isLightSurface: false,
        accentHex: '#D4AF37',
        chipPrimaryHex: '#E5C158',
        chipSecondaryHex: '#9A7B2C',
      };
    }
    return {
      id: 'emerald',
      label: 'Deep Emerald Private',
      tierBadge: kind === 'credit' ? 'EMERALD PRIVATE' : 'PRIME CLEARING',
      cssClass: 'metallic-finish-emerald',
      isLightSurface: false,
      accentHex: '#6EE7B7',
      chipPrimaryHex: '#E5C158',
      chipSecondaryHex: '#9A7B2C',
    };
  }

  const order: MetallicFinishId[] = ['obsidian', 'gold', 'emerald', 'platinum'];
  const chosen = order[Math.abs(index) % order.length];

  if (chosen === 'platinum') {
    return {
      id: 'platinum',
      label: 'Architectural Platinum',
      tierBadge: kind === 'credit' ? 'PLATINUM EDITION' : 'CORPORATE VAULT',
      cssClass: 'metallic-finish-platinum',
      isLightSurface: true,
      accentHex: '#111318',
      chipPrimaryHex: '#D4AF37',
      chipSecondaryHex: '#8C6D1F',
    };
  }

  if (chosen === 'gold') {
    return {
      id: 'gold',
      label: 'Champagne Gold Reserve',
      tierBadge: kind === 'credit' ? 'SOVEREIGN GOLD' : 'WEALTH PASSBOOK',
      cssClass: 'metallic-finish-gold',
      isLightSurface: false,
      accentHex: '#FBE698',
      chipPrimaryHex: '#FFF0B8',
      chipSecondaryHex: '#B89130',
    };
  }

  if (chosen === 'emerald') {
    return {
      id: 'emerald',
      label: 'Deep Emerald Private',
      tierBadge: kind === 'credit' ? 'EMERALD PRIVATE' : 'PRIME CLEARING',
      cssClass: 'metallic-finish-emerald',
      isLightSurface: false,
      accentHex: '#6EE7B7',
      chipPrimaryHex: '#E5C158',
      chipSecondaryHex: '#9A7B2C',
    };
  }

  return {
    id: 'obsidian',
    label: 'Obsidian Titanium',
    tierBadge: kind === 'credit' ? 'INFINITE RESERVE' : 'PRIVATE TREASURY',
    cssClass: 'metallic-finish-obsidian',
    isLightSurface: false,
    accentHex: '#D4AF37',
    chipPrimaryHex: '#E5C158',
    chipSecondaryHex: '#9A7B2C',
  };
}

/**
 * Computes SVG stroke-dasharray and stroke-dashoffset for a radial cycle gauge.
 */
export function computeCycleArcGeometry(daysUntilDue: number, radius = 18): {
  circumference: number;
  dashOffset: number;
  progressPct: number;
} {
  const circumference = Number((2 * Math.PI * radius).toFixed(2));
  const clampedDays = Math.max(0, Math.min(30, daysUntilDue));
  const elapsedFraction = (30 - clampedDays) / 30;
  const progressPct = Math.round(elapsedFraction * 100);
  const dashOffset = Number((circumference * (1 - elapsedFraction)).toFixed(2));

  return {
    circumference,
    dashOffset,
    progressPct,
  };
}

/**
 * Returns the explicit MetallicFinishMeta for a user-selected finish override.
 */
export function getMetallicFinishById(
  finishId: MetallicFinishId,
  kind: 'credit' | 'bank' = 'credit',
): MetallicFinishMeta {
  if (finishId === 'gold') {
    return {
      id: 'gold',
      label: 'Champagne Gold Reserve',
      tierBadge: kind === 'credit' ? 'SOVEREIGN GOLD' : 'WEALTH PASSBOOK',
      cssClass: 'metallic-finish-gold',
      isLightSurface: false,
      accentHex: '#FBE698',
      chipPrimaryHex: '#FFF0B8',
      chipSecondaryHex: '#B89130',
    };
  }
  if (finishId === 'emerald') {
    return {
      id: 'emerald',
      label: 'Deep Emerald Private',
      tierBadge: kind === 'credit' ? 'EMERALD PRIVATE' : 'PRIME CLEARING',
      cssClass: 'metallic-finish-emerald',
      isLightSurface: false,
      accentHex: '#6EE7B7',
      chipPrimaryHex: '#E5C158',
      chipSecondaryHex: '#9A7B2C',
    };
  }
  if (finishId === 'platinum') {
    return {
      id: 'platinum',
      label: 'Architectural Platinum',
      tierBadge: kind === 'credit' ? 'PLATINUM EDITION' : 'CORPORATE VAULT',
      cssClass: 'metallic-finish-platinum',
      isLightSurface: true,
      accentHex: '#111318',
      chipPrimaryHex: '#D4AF37',
      chipSecondaryHex: '#8C6D1F',
    };
  }
  return {
    id: 'obsidian',
    label: 'Obsidian Titanium',
    tierBadge: kind === 'credit' ? 'INFINITE RESERVE' : 'PRIVATE TREASURY',
    cssClass: 'metallic-finish-obsidian',
    isLightSurface: false,
    accentHex: '#D4AF37',
    chipPrimaryHex: '#E5C158',
    chipSecondaryHex: '#9A7B2C',
  };
}

/**
 * Computes inclusive YYYY-MM-DD start and end dates for a given YYYY-MM month string.
 */
export function computeMonthDateRange(yyyyMm: string): { fromDate: string; toDate: string } {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) {
    return { fromDate: '2026-01-01', toDate: '2026-12-31' };
  }
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Day 0 of next month gives the last day of `month` (1-indexed)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const paddedLastDay = String(lastDay).padStart(2, '0');
  return {
    fromDate: `${yyyyMm}-01`,
    toDate: `${yyyyMm}-${paddedLastDay}`,
  };
}

/**
 * Summarizes a list of ledger transactions into inflow, outflow, transfer, net, and top expense category.
 */
export function summarizeDrillDownTransactions(
  txs: Array<{ kind: 'income' | 'expense' | 'transfer'; amountMinor: number; category: string }>,
): {
  inflowMinor: number;
  outflowMinor: number;
  transferMinor: number;
  netMinor: number;
  topCategory: string | null;
} {
  let inflowMinor = 0;
  let outflowMinor = 0;
  let transferMinor = 0;
  const categoryTotals = new Map<string, number>();

  for (const tx of txs) {
    if (tx.kind === 'income') {
      inflowMinor += tx.amountMinor;
    } else if (tx.kind === 'expense') {
      outflowMinor += tx.amountMinor;
      const prev = categoryTotals.get(tx.category) || 0;
      categoryTotals.set(tx.category, prev + tx.amountMinor);
    } else {
      transferMinor += tx.amountMinor;
    }
  }

  let topCategory: string | null = null;
  let topVal = -1;
  for (const [cat, total] of categoryTotals.entries()) {
    if (total > topVal) {
      topVal = total;
      topCategory = cat;
    }
  }

  return {
    inflowMinor,
    outflowMinor,
    transferMinor,
    netMinor: inflowMinor - outflowMinor,
    topCategory,
  };
}

