import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJobSheetTemplate,
  buildSheetFromImportedMatrix,
  computeSheetSummary,
  computeWorkbookTelemetry,
  evaluateCellFormula,
  indexToColumnLetter,
  type JobSheetRecord,
} from './jobSheetsAnalytics.ts';

describe('jobSheetsAnalytics', () => {
  it('converts 0-based column indices to Google Sheets letters accurately', () => {
    assert.equal(indexToColumnLetter(0), 'A');
    assert.equal(indexToColumnLetter(7), 'H');
    assert.equal(indexToColumnLetter(25), 'Z');
    assert.equal(indexToColumnLetter(26), 'AA');
  });

  it('evaluates Google Sheets-style SUM, AVG, and cell arithmetic formulas', () => {
    const template = buildJobSheetTemplate('freelance', 'Job 1');
    const cols = template.columns;
    const rows = template.rows;

    // Row 1 has F1=85000, G1=85000, H1='=F1-G1' -> 0
    assert.equal(evaluateCellFormula('=F1-G1', cols, rows), '0');
    // Row 2 has F2=64000, G2=32000, H2='=F2-G2' -> 32000
    assert.equal(evaluateCellFormula('=F2-G2', cols, rows), '32000');
    // SUM(F1:F2) -> 85000 + 64000 = 149000
    assert.equal(evaluateCellFormula('=SUM(F1:F2)', cols, rows), '149000');
    // AVG(E1:E2) -> (24 + 18) / 2 = 21
    assert.equal(evaluateCellFormula('=AVG(E1:E2)', cols, rows), '21');
  });

  it('adapts sheet summary profile between non-monetary status_tracker and financial sheets', () => {
    const trackerTpl = buildJobSheetTemplate('job_tracker', 'Job 1 · Applications', 'business');
    const trackerSheet: JobSheetRecord = {
      ...trackerTpl,
      id: 'sheet_tracker',
      orderIndex: 0,
      createdAt: '2026-11-01',
      updatedAt: '2026-11-16',
    };
    const trackerSummary = computeSheetSummary(trackerSheet);
    assert.equal(trackerSummary.profile, 'status_tracker');
    assert.equal(trackerSummary.hasCurrencyColumns, false);
    assert.equal(trackerSummary.rowCount, 2);
    assert.equal(trackerSummary.statusBreakdown.length, 2);
    assert.equal(trackerSheet.settings?.showTotals, false);

    const t1 = buildJobSheetTemplate('freelance', 'Job 2 · Consulting', 'business');
    const t2 = buildJobSheetTemplate('salary', 'Job 3 · Executive Salary', 'personal');

    const sheets: JobSheetRecord[] = [
      trackerSheet,
      {
        ...t1,
        id: 'sheet_1',
        orderIndex: 1,
        createdAt: '2026-11-01',
        updatedAt: '2026-11-16',
      },
      {
        ...t2,
        id: 'sheet_2',
        orderIndex: 2,
        createdAt: '2026-11-01',
        updatedAt: '2026-11-16',
      },
    ];

    const summary1 = computeSheetSummary(sheets[1]);
    assert.equal(summary1.profile, 'financial');
    assert.equal(summary1.totalBilledMinor, 14900000);
    assert.equal(summary1.totalReceivedMinor, 11700000);
    assert.equal(summary1.totalPendingMinor, 3200000);

    const portfolio = computeWorkbookTelemetry(sheets);
    assert.equal(portfolio.totalSheets, 3);
    assert.equal(portfolio.totalRows, 5);
    assert.equal(portfolio.grandBilledMinor, 33400000);
    assert.equal(portfolio.grandReceivedMinor, 27950000);
  });

  it('imports Excel/CSV matrix and infers column types and custom statuses automatically', () => {
    const matrix = [
      ['Date', 'Company', 'Application Stage', 'Hours', 'Expected Fee (₹)'],
      ['15/11/2026', 'Orion Tech', 'Shortlisted', '12', '45000'],
      ['2026-11-17', 'Vanguard Corp', 'Offer Received', '20', '75000'],
    ];
    const imported = buildSheetFromImportedMatrix('Imported Excel Sheet', matrix, 'business', 'emerald');
    assert.equal(imported.columns.length, 5);
    assert.equal(imported.columns[0].type, 'date');
    assert.equal(imported.rows[0].cells[imported.columns[0].id], '2026-11-15');
    assert.equal(imported.columns[1].type, 'text');
    assert.equal(imported.columns[2].type, 'status');
    assert.equal(imported.columns[3].type, 'number');
    assert.equal(imported.columns[4].type, 'currency');
    assert.equal(imported.rows.length, 2);
    assert.equal(imported.settings?.showTotals, false);
    assert.ok((imported.settings?.customStatuses?.length ?? 0) >= 2);
  });

  it('handles Excel sheets with a single-cell title banner row or single data row without losing rows', () => {
    const matrixWithBanner = [
      ['NOVEMBER 2026 WORKBOOK', '', '', ''],
      ['Date', 'Task Name', 'Status', 'Hours'],
      ['18-11-2026', 'Database Migration', 'Completed', '8'],
    ];
    const importedBanner = buildSheetFromImportedMatrix('Banner Sheet', matrixWithBanner, 'business', 'gold');
    assert.equal(importedBanner.columns[0].label, 'Date');
    assert.equal(importedBanner.columns[1].label, 'Task Name');
    assert.equal(importedBanner.rows.length, 1);
    assert.equal(importedBanner.rows[0].cells[importedBanner.columns[0].id], '2026-11-18');
    assert.equal(importedBanner.rows[0].cells[importedBanner.columns[1].id], 'Database Migration');

    const singleRowMatrix = [['2026-11-18', 'Solo Task Entry', 'In Progress']];
    const importedSingle = buildSheetFromImportedMatrix('Single Row', singleRowMatrix, 'business', 'gold');
    assert.equal(importedSingle.rows.length, 1);
  });
});
