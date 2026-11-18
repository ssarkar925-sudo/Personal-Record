import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSmoothAreaPath,
  computeCardTiltTransform,
  computeCycleArcGeometry,
  computeMonthDateRange,
  computeNetWorthSeries,
  formatShortMonthLabel,
  getMetallicFinishById,
  resolveMetallicFinish,
  summarizeDrillDownTransactions,
} from './dashboardVisuals.ts';

test('formatShortMonthLabel formats YYYY-MM into readable short month and 2-digit year', () => {
  assert.equal(formatShortMonthLabel('2026-11'), "Nov '26");
  assert.equal(formatShortMonthLabel('2026-01'), "Jan '26");
});

test('buildSmoothAreaPath produces cubic bezier stroke and closed area SVG paths', () => {
  const pts = [
    { x: 10, y: 80 },
    { x: 110, y: 40 },
    { x: 210, y: 60 },
  ];
  const { strokePath, areaPath } = buildSmoothAreaPath(pts, 120);
  assert.equal(strokePath.startsWith('M 10.0 80.0 C'), true);
  assert.equal(areaPath.endsWith('L 210.0 120.0 L 10.0 120.0 Z'), true);
});

test('computeNetWorthSeries reconstructs 6-month trajectory ending at currentNetWorthMinor', () => {
  const trend = [
    { month: '2026-09', incomeMinor: 10000000, expenseMinor: 6000000 },
    { month: '2026-10', incomeMinor: 12000000, expenseMinor: 7000000 },
    { month: '2026-11', incomeMinor: 15000000, expenseMinor: 9000000 },
  ];
  const result = computeNetWorthSeries(trend, 50000000);
  assert.equal(result.series.length, 3);
  assert.equal(result.series[2].netWorthMinor, 50000000);
  // Prior month should be 50000000 - (15000000 - 9000000) = 44000000
  assert.equal(result.series[1].netWorthMinor, 44000000);
  // First month should be 44000000 - (12000000 - 7000000) = 39000000
  assert.equal(result.series[0].netWorthMinor, 39000000);
  assert.equal(result.periodDeltaMinor, 11000000);
  assert.equal(result.avgSavingsRatePct > 0, true);
});

test('computeCardTiltTransform bounds 3D rotation angles and glare percentages', () => {
  const center = computeCardTiltTransform(150, 100, 300, 200, 10);
  assert.equal(center.rotateX, 0);
  assert.equal(center.rotateY, 0);
  assert.equal(center.glareX, 50);
  assert.equal(center.glareY, 50);

  const topLeft = computeCardTiltTransform(0, 0, 300, 200, 10);
  assert.equal(topLeft.rotateX, 10);
  assert.equal(topLeft.rotateY, -10);
  assert.equal(topLeft.glareX, 0);
  assert.equal(topLeft.glareY, 0);
});

test('resolveMetallicFinish and getMetallicFinishById assign authentic luxury finishes', () => {
  const infinia = resolveMetallicFinish('HDFC Infinia Metal', 0, 'credit');
  assert.equal(infinia.id, 'obsidian');
  assert.equal(infinia.isLightSurface, false);

  const icici = resolveMetallicFinish('ICICI Sapphiro Gold', 1, 'credit');
  assert.equal(icici.id, 'gold');

  const plat = resolveMetallicFinish('Custom Card', 3, 'credit');
  assert.equal(plat.id, 'platinum');
  assert.equal(plat.isLightSurface, true);

  const manualEmerald = getMetallicFinishById('emerald', 'bank');
  assert.equal(manualEmerald.id, 'emerald');
  assert.equal(manualEmerald.tierBadge, 'PRIME CLEARING');
});

test('computeCycleArcGeometry computes SVG ring circumference and dashOffset', () => {
  const geo = computeCycleArcGeometry(15, 20);
  assert.equal(geo.progressPct, 50);
  assert.equal(Math.abs(geo.dashOffset - geo.circumference * 0.5) < 0.1, true);
});

test('computeMonthDateRange returns exact calendar boundaries including leap years', () => {
  assert.deepEqual(computeMonthDateRange('2026-11'), {
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
  });
  assert.deepEqual(computeMonthDateRange('2024-02'), {
    fromDate: '2024-02-01',
    toDate: '2024-02-29',
  });
});

test('summarizeDrillDownTransactions aggregates inflow, outflow, transfer, and top category', () => {
  const summary = summarizeDrillDownTransactions([
    { kind: 'income', amountMinor: 15000000, category: 'Salary' },
    { kind: 'expense', amountMinor: 2450000, category: 'Flight Tickets' },
    { kind: 'expense', amountMinor: 845000, category: 'Groceries' },
    { kind: 'transfer', amountMinor: 500000, category: 'Transfer' },
  ]);
  assert.equal(summary.inflowMinor, 15000000);
  assert.equal(summary.outflowMinor, 3295000);
  assert.equal(summary.transferMinor, 500000);
  assert.equal(summary.netMinor, 11705000);
  assert.equal(summary.topCategory, 'Flight Tickets');
});

