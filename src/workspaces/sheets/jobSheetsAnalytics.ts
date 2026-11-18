import type { Scope } from '../../../shared/ledger-core.ts';

export type SheetColumnType = 'text' | 'currency' | 'number' | 'date' | 'status' | 'scope';

export type SheetTabColor = 'gold' | 'emerald' | 'obsidian' | 'rose' | 'slate';

export interface CustomStatusOption {
  label: string;
  color: SheetTabColor;
}

export interface SheetSettings {
  showTotals?: boolean;
  customStatuses?: CustomStatusOption[];
}

export interface SheetColumn {
  id: string;
  key: string; // e.g. 'A', 'B', 'C'...
  label: string;
  type: SheetColumnType;
  width?: number;
}

export interface SheetRow {
  id: string;
  cells: Record<string, string>;
}

export interface JobSheetRecord {
  id: string;
  name: string;
  scope: Scope;
  color: SheetTabColor;
  columns: SheetColumn[];
  rows: SheetRow[];
  settings?: SheetSettings;
  orderIndex: number;
  updatedAt: string;
  createdAt: string;
}

export type SheetDataProfile = 'financial' | 'numeric' | 'status_tracker' | 'general_records';

export interface NumericColumnSummary {
  colId: string;
  key: string;
  label: string;
  type: 'currency' | 'number';
  totalMinor: number; // for currency: paise (val * 100); for number: val * 100
  rawSum: number;
}

export interface SheetSummaryMetrics {
  sheetId: string;
  sheetName: string;
  scope: Scope;
  color: SheetTabColor;
  profile: SheetDataProfile;
  rowCount: number;
  columnCount: number;
  filledCellsCount: number;
  totalCellsCount: number;
  filledRatePct: number;
  hasCurrencyColumns: boolean;
  hasNumericColumns: boolean;
  hasStatusColumn: boolean;
  statusBreakdown: Array<{ label: string; count: number; color: SheetTabColor }>;
  numericColumnSummaries: NumericColumnSummary[];
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  totalBilledMinor: number;
  totalReceivedMinor: number;
  totalPendingMinor: number;
  columnTotalsMinor: Record<string, number>;
}

export interface WorkbookPortfolioTelemetry {
  totalSheets: number;
  totalRows: number;
  grandBilledMinor: number;
  grandReceivedMinor: number;
  grandPendingMinor: number;
  collectionRatePct: number;
  completedTasks: number;
  activeTasks: number;
  sheetSummaries: SheetSummaryMetrics[];
  scopeTotalsMinor: Record<Scope, number>;
}

export const DEFAULT_STATUS_OPTIONS: CustomStatusOption[] = [
  { label: 'Completed', color: 'emerald' },
  { label: 'In Progress', color: 'gold' },
  { label: 'Pending', color: 'rose' },
  { label: 'Invoiced', color: 'obsidian' },
  { label: 'On Hold', color: 'slate' },
];

export function getSheetStatusOptions(sheet: JobSheetRecord | null | undefined): CustomStatusOption[] {
  const custom = sheet?.settings?.customStatuses;
  if (Array.isArray(custom) && custom.length > 0) {
    return custom;
  }
  return DEFAULT_STATUS_OPTIONS;
}

export function inferStatusColor(label: string, customList?: CustomStatusOption[]): SheetTabColor {
  const normalized = label.trim().toLowerCase();
  const found = (customList ?? DEFAULT_STATUS_OPTIONS).find(
    (s) => s.label.trim().toLowerCase() === normalized,
  );
  if (found) return found.color;
  if (/complete|done|paid|credit|settled|approved|selected|hired|offer|active/.test(normalized)) {
    return 'emerald';
  }
  if (/progress|ongoing|interview|applied|invoiced|review|working/.test(normalized)) {
    return 'gold';
  }
  if (/pending|due|urgent|rejected|failed|blocked|overdue|cancel/.test(normalized)) {
    return 'rose';
  }
  if (/hold|archive|draft|later/.test(normalized)) {
    return 'slate';
  }
  return 'obsidian';
}

/**
 * Converts a 0-based column index to Excel/Google Sheets column letters (0 -> A, 25 -> Z, 26 -> AA).
 */
export function indexToColumnLetter(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let letters = '';
  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/**
 * Parses a numeric or currency string into a floating number.
 */
export function parseNumericCell(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = String(raw)
    .replace(/[₹$,\s]/g, '')
    .trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Evaluates Google Sheets-style formulas such as:
 * - `=SUM(F1:F5)`
 * - `=AVG(E1:E4)`
 * - `=F2-G2`
 * - `=E2*F2`
 * - `=12500+3500`
 */
export function evaluateCellFormula(
  rawValue: string | undefined,
  columns: SheetColumn[],
  rows: SheetRow[],
  depth = 0,
): string {
  if (!rawValue) return '';
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('=')) return rawValue;
  if (depth > 3) return '#REF!';

  const expr = trimmed.slice(1).trim().toUpperCase();

  const colKeyToId = new Map<string, string>();
  columns.forEach((col, idx) => {
    colKeyToId.set(col.key.toUpperCase(), col.id);
    colKeyToId.set(indexToColumnLetter(idx), col.id);
  });

  const getCellNumeric = (colLetter: string, rowOneBased: number): number => {
    const colId = colKeyToId.get(colLetter.toUpperCase());
    const row = rows[rowOneBased - 1];
    if (!colId || !row) return 0;
    const raw = row.cells[colId] ?? '';
    const resolved = raw.trim().startsWith('=')
      ? evaluateCellFormula(raw, columns, rows, depth + 1)
      : raw;
    return parseNumericCell(resolved);
  };

  // Handle SUM(A1:A10), AVG(A1:A10), MIN, MAX, COUNT
  const rangeMatch = expr.match(/^(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
  if (rangeMatch) {
    const [, fn, startCol, startRowStr, endCol, endRowStr] = rangeMatch;
    if (startCol !== endCol) return '#ERR!';
    const r1 = Math.max(1, Number(startRowStr));
    const r2 = Math.min(rows.length, Number(endRowStr));
    const vals: number[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      vals.push(getCellNumeric(startCol, r));
    }
    if (vals.length === 0) return '0';
    if (fn === 'COUNT') return String(vals.length);
    const sum = vals.reduce((a, b) => a + b, 0);
    if (fn === 'SUM') return String(Number(sum.toFixed(2)));
    if (fn === 'AVG' || fn === 'AVERAGE') return String(Number((sum / vals.length).toFixed(2)));
    if (fn === 'MIN') return String(Math.min(...vals));
    if (fn === 'MAX') return String(Math.max(...vals));
  }

  // Replace single cell references like F1, G2 with their numeric values
  const substituted = expr.replace(/\b([A-Z]+)(\d+)\b/g, (_m, colLetter: string, rowStr: string) => {
    const val = getCellNumeric(colLetter, Number(rowStr));
    return String(val);
  });

  if (!/^[0-9+\-*/().\s]+$/.test(substituted)) {
    return '#VALUE!';
  }

  try {
    const tokens = substituted.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
    if (!tokens) return '0';
    const result = evaluateSimpleArithmetic(tokens);
    return Number.isFinite(result) ? String(Number(result.toFixed(2))) : '0';
  } catch {
    return '#ERR!';
  }
}

function evaluateSimpleArithmetic(tokens: string[]): number {
  let pos = 0;

  const parseExpression = (): number => {
    let val = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parseFactor();
      val = op === '*' ? val * right : right !== 0 ? val / right : 0;
    }
    return val;
  };

  const parseFactor = (): number => {
    const tok = tokens[pos];
    if (tok === '(') {
      pos++;
      const val = parseExpression();
      if (tokens[pos] === ')') pos++;
      return val;
    }
    if (tok === '-') {
      pos++;
      return -parseFactor();
    }
    if (tok === '+') {
      pos++;
      return parseFactor();
    }
    pos++;
    return Number(tok) || 0;
  };

  return parseExpression();
}

/**
 * Computes adaptive summary metrics for a single Job Sheet tab.
 * Adapts to whether the sheet tracks finances, numbers, statuses, or general text records.
 */
export function computeSheetSummary(sheet: JobSheetRecord): SheetSummaryMetrics {
  const columnTotalsMinor: Record<string, number> = {};
  for (const col of sheet.columns) {
    if (col.type === 'currency' || col.type === 'number') {
      columnTotalsMinor[col.id] = 0;
    }
  }

  const currencyCols = sheet.columns.filter((c) => c.type === 'currency');
  const numberCols = sheet.columns.filter((c) => c.type === 'number');
  const statusCol = sheet.columns.find((c) => c.type === 'status' || /status|stage|state/i.test(c.label));
  const statusOptions = getSheetStatusOptions(sheet);

  const billedCol =
    currencyCols.find((c) => /billed|earned|amount|gross|contract|salary|total|price|fee/i.test(c.label)) ??
    currencyCols[0];
  const receivedCol =
    currencyCols.find((c) => c.id !== billedCol?.id && /received|paid|credited|collected|net/i.test(c.label)) ??
    currencyCols[1];
  const pendingCol =
    currencyCols.find(
      (c) =>
        c.id !== billedCol?.id &&
        c.id !== receivedCol?.id &&
        /pending|due|balance|receivable/i.test(c.label),
    ) ?? currencyCols[2];

  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  let filledCellsCount = 0;
  const totalCellsCount = Math.max(0, sheet.rows.length * sheet.columns.length);

  const statusMap = new Map<string, number>();

  for (const row of sheet.rows) {
    for (const col of sheet.columns) {
      const rawCell = (row.cells[col.id] ?? '').trim();
      if (rawCell !== '') {
        filledCellsCount += 1;
      }
      if (col.type === 'currency' || col.type === 'number') {
        const evaluated = rawCell.startsWith('=')
          ? evaluateCellFormula(rawCell, sheet.columns, sheet.rows)
          : rawCell;
        const val = parseNumericCell(evaluated);
        const minor = Math.round(val * 100);
        columnTotalsMinor[col.id] = (columnTotalsMinor[col.id] ?? 0) + minor;
      }
    }

    if (statusCol) {
      const rawStatus = (row.cells[statusCol.id] ?? '').trim();
      if (rawStatus) {
        statusMap.set(rawStatus, (statusMap.get(rawStatus) ?? 0) + 1);
      }
      const lower = rawStatus.toLowerCase();
      if (/completed|paid|done|credited|settled|approved|hired|offer/.test(lower)) {
        completedCount += 1;
      } else if (/progress|active|ongoing|invoiced|interview|applied|working/.test(lower)) {
        inProgressCount += 1;
      } else if (lower) {
        pendingCount += 1;
      }
    }
  }

  const statusBreakdown = Array.from(statusMap.entries())
    .map(([label, count]) => ({
      label,
      count,
      color: inferStatusColor(label, statusOptions),
    }))
    .sort((a, b) => b.count - a.count);

  const numericColumnSummaries: NumericColumnSummary[] = sheet.columns
    .filter((c): c is SheetColumn & { type: 'currency' | 'number' } => c.type === 'currency' || c.type === 'number')
    .map((c, idx) => {
      const totalMinor = columnTotalsMinor[c.id] ?? 0;
      return {
        colId: c.id,
        key: c.key || indexToColumnLetter(idx),
        label: c.label,
        type: c.type,
        totalMinor,
        rawSum: Number((totalMinor / 100).toFixed(2)),
      };
    });

  const totalBilledMinor = billedCol ? columnTotalsMinor[billedCol.id] ?? 0 : 0;
  const totalReceivedMinor = receivedCol ? columnTotalsMinor[receivedCol.id] ?? 0 : 0;
  const explicitPendingMinor = pendingCol ? columnTotalsMinor[pendingCol.id] ?? 0 : 0;
  const totalPendingMinor =
    pendingCol && explicitPendingMinor > 0
      ? explicitPendingMinor
      : Math.max(0, totalBilledMinor - totalReceivedMinor);

  const hasCurrencyColumns = currencyCols.length > 0;
  const hasNumericColumns = numberCols.length > 0;
  const hasStatusColumn = !!statusCol;

  const profile: SheetDataProfile = hasCurrencyColumns
    ? 'financial'
    : hasStatusColumn
      ? 'status_tracker'
      : hasNumericColumns
        ? 'numeric'
        : 'general_records';

  const filledRatePct =
    totalCellsCount > 0 ? Math.min(100, Math.round((filledCellsCount / totalCellsCount) * 100)) : 0;

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    scope: sheet.scope,
    color: sheet.color,
    profile,
    rowCount: sheet.rows.length,
    columnCount: sheet.columns.length,
    filledCellsCount,
    totalCellsCount,
    filledRatePct,
    hasCurrencyColumns,
    hasNumericColumns,
    hasStatusColumn,
    statusBreakdown,
    numericColumnSummaries,
    completedCount,
    inProgressCount,
    pendingCount,
    totalBilledMinor,
    totalReceivedMinor,
    totalPendingMinor,
    columnTotalsMinor,
  };
}

/**
 * Computes workbook-wide telemetry across all job tabs.
 */
export function computeWorkbookTelemetry(sheets: JobSheetRecord[]): WorkbookPortfolioTelemetry {
  const sheetSummaries = sheets.map(computeSheetSummary);

  let totalRows = 0;
  let grandBilledMinor = 0;
  let grandReceivedMinor = 0;
  let grandPendingMinor = 0;
  let completedTasks = 0;
  let activeTasks = 0;

  const scopeTotalsMinor: Record<Scope, number> = {
    business: 0,
    personal: 0,
    family: 0,
  };

  for (const s of sheetSummaries) {
    totalRows += s.rowCount;
    grandBilledMinor += s.totalBilledMinor;
    grandReceivedMinor += s.totalReceivedMinor;
    grandPendingMinor += s.totalPendingMinor;
    completedTasks += s.completedCount;
    activeTasks += s.inProgressCount + s.pendingCount;
    scopeTotalsMinor[s.scope] = (scopeTotalsMinor[s.scope] ?? 0) + s.totalBilledMinor;
  }

  const collectionRatePct =
    grandBilledMinor > 0
      ? Math.min(100, Math.round((grandReceivedMinor / grandBilledMinor) * 100))
      : 100;

  return {
    totalSheets: sheets.length,
    totalRows,
    grandBilledMinor,
    grandReceivedMinor,
    grandPendingMinor,
    collectionRatePct,
    completedTasks,
    activeTasks,
    sheetSummaries,
    scopeTotalsMinor,
  };
}

/**
 * Automatically infers column types from imported Excel/CSV rows.
 */
export function normalizeImportedDateCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const yearStr = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    if (p1 > 12 && p2 >= 1 && p2 <= 12) {
      return `${yearStr}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      return `${yearStr}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    if (p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
      return `${yearStr}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
  }
  return str;
}

export function buildSheetFromImportedMatrix(
  sheetName: string,
  matrix: unknown[][],
  scope: Scope = 'business',
  color: SheetTabColor = 'gold',
): Omit<JobSheetRecord, 'id' | 'orderIndex' | 'createdAt' | 'updatedAt'> {
  const nonEmptyRows = matrix.filter(
    (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''),
  );

  if (nonEmptyRows.length === 0) {
    return buildJobSheetTemplate('blank', sheetName, scope);
  }

  // Detect if row 0 is a single-cell title banner above a multi-column header row
  let headerRowIdx = 0;
  if (nonEmptyRows.length >= 2) {
    const row0Filled = nonEmptyRows[0].filter((c) => String(c ?? '').trim() !== '').length;
    const row1Filled = nonEmptyRows[1].filter((c) => String(c ?? '').trim() !== '').length;
    if (row0Filled === 1 && row1Filled >= 2) {
      headerRowIdx = 1;
    }
  }

  const rawHeaderRow = nonEmptyRows[headerRowIdx];
  const remainingRows = nonEmptyRows.slice(headerRowIdx + 1);

  // If the file only had 1 row total, keep that row as data if any cell looks like a value, or seed 1 blank row
  const hasDataRows = remainingRows.length > 0;
  const headerRow = rawHeaderRow.map((h, i) => String(h ?? '').trim() || `Column ${indexToColumnLetter(i)}`);
  const dataRowsRaw = hasDataRows ? remainingRows : [rawHeaderRow.map(() => '')];

  const colCount = Math.max(
    2,
    headerRow.length,
    ...dataRowsRaw.map((r) => (Array.isArray(r) ? r.length : 0)),
  );

  const columns: SheetColumn[] = [];
  const detectedStatuses = new Map<string, SheetTabColor>();

  for (let c = 0; c < colCount; c++) {
    const label = headerRow[c] || `Column ${indexToColumnLetter(c)}`;
    const sampleValues = dataRowsRaw
      .map((r) => String((r as unknown[])[c] ?? '').trim())
      .filter(Boolean)
      .slice(0, 25);

    let colType: SheetColumnType = 'text';
    const lowerLabel = label.toLowerCase();

    if (/status|stage|state|phase|outcome/i.test(lowerLabel)) {
      colType = 'status';
      for (const sv of sampleValues) {
        if (!detectedStatuses.has(sv)) {
          detectedStatuses.set(sv, inferStatusColor(sv));
        }
      }
    } else if (/date|deadline|joined|day|dob/i.test(lowerLabel)) {
      colType = 'date';
    } else if (/₹|inr|amount|salary|price|cost|fee|billed|received|paid|balance|due|revenue|ctc/i.test(lowerLabel)) {
      const numericMatches = sampleValues.filter((v) => !Number.isNaN(Number(v.replace(/[₹$,\s]/g, '')))).length;
      if (sampleValues.length === 0 || numericMatches >= Math.ceil(sampleValues.length * 0.6)) {
        colType = 'currency';
      }
    } else if (/qty|hours|count|units|days|score|age|rating/i.test(lowerLabel)) {
      const numericMatches = sampleValues.filter((v) => !Number.isNaN(Number(v.replace(/,/g, '')))).length;
      if (sampleValues.length > 0 && numericMatches >= Math.ceil(sampleValues.length * 0.7)) {
        colType = 'number';
      }
    }

    columns.push({
      id: `col_${c}_${Date.now().toString(36)}`,
      key: indexToColumnLetter(c),
      label,
      type: colType,
    });
  }

  // If the uploaded Excel had only 1 row and it was actual data (e.g. numbers/dates), keep its values in row 1
  const effectiveDataRows =
    !hasDataRows && rawHeaderRow.some((cell) => /\d/.test(String(cell ?? '')))
      ? [rawHeaderRow]
      : dataRowsRaw;

  const rows: SheetRow[] = effectiveDataRows.map((rawRow, rIdx) => {
    const cells: Record<string, string> = {};
    columns.forEach((col, cIdx) => {
      const rawVal = (rawRow as unknown[])[cIdx];
      if (rawVal === null || rawVal === undefined) {
        cells[col.id] = '';
      } else if (col.type === 'date') {
        cells[col.id] = normalizeImportedDateCell(rawVal);
      } else {
        cells[col.id] = String(rawVal).trim();
      }
    });
    return {
      id: `row_imp_${Date.now()}_${rIdx}`,
      cells,
    };
  });

  const customStatuses: CustomStatusOption[] =
    detectedStatuses.size > 0
      ? Array.from(detectedStatuses.entries()).map(([label, clr]) => ({ label, color: clr }))
      : DEFAULT_STATUS_OPTIONS;

  return {
    name: sheetName.trim() || 'Imported Sheet',
    scope,
    color,
    columns,
    rows,
    settings: {
      showTotals: false, // Totals only shown when user enables them
      customStatuses,
    },
  };
}

/**
 * Starter templates for creating new Job Sheet tabs.
 */
export function buildJobSheetTemplate(
  templateKind: 'job_tracker' | 'freelance' | 'salary' | 'project' | 'blank',
  name?: string,
  scope: Scope = 'business',
): Omit<JobSheetRecord, 'id' | 'orderIndex' | 'createdAt' | 'updatedAt'> {
  if (templateKind === 'job_tracker') {
    const columns: SheetColumn[] = [
      { id: 'col_date', key: 'A', label: 'Date', type: 'date' },
      { id: 'col_role', key: 'B', label: 'Job Role / Task / Assignment', type: 'text' },
      { id: 'col_company', key: 'C', label: 'Company / Department', type: 'text' },
      { id: 'col_status', key: 'D', label: 'Status', type: 'status' },
      { id: 'col_location', key: 'E', label: 'Work Mode / Location', type: 'text' },
      { id: 'col_contact', key: 'F', label: 'Contact / Reference', type: 'text' },
      { id: 'col_notes', key: 'G', label: 'Next Step / Notes', type: 'text' },
    ];
    return {
      name: name?.trim() || 'Job Tracker & Applications',
      scope,
      color: 'emerald',
      columns,
      settings: {
        showTotals: false,
        customStatuses: [
          { label: 'Active / Ongoing', color: 'emerald' },
          { label: 'Applied', color: 'gold' },
          { label: 'Interviewing', color: 'obsidian' },
          { label: 'Offer Received', color: 'emerald' },
          { label: 'Pending Review', color: 'rose' },
          { label: 'On Hold', color: 'slate' },
        ],
      },
      rows: [
        {
          id: `row_${Date.now()}_1`,
          cells: {
            col_date: '2026-11-14',
            col_role: 'Senior Financial Systems Lead',
            col_company: 'Apex Global Operations',
            col_status: 'Active / Ongoing',
            col_location: 'Hybrid · Bengaluru',
            col_contact: 'R. Sharma (VP Ops)',
            col_notes: 'Weekly sprint review every Thursday',
          },
        },
        {
          id: `row_${Date.now()}_2`,
          cells: {
            col_date: '2026-11-16',
            col_role: 'Advisory Board Consultant',
            col_company: 'Nova FinTech Labs',
            col_status: 'Interviewing',
            col_location: 'Remote',
            col_contact: 'talent@novafintech.in',
            col_notes: 'Final round scheduled for 22 Nov',
          },
        },
      ],
    };
  }

  if (templateKind === 'salary') {
    const columns: SheetColumn[] = [
      { id: 'col_date', key: 'A', label: 'Pay Date', type: 'date' },
      { id: 'col_job', key: 'B', label: 'Employer / Role / Month', type: 'text' },
      { id: 'col_status', key: 'C', label: 'Status', type: 'status' },
      { id: 'col_gross', key: 'D', label: 'Gross Pay (₹)', type: 'currency' },
      { id: 'col_net', key: 'E', label: 'Net Credited (₹)', type: 'currency' },
      { id: 'col_tds', key: 'F', label: 'TDS / Deductions (₹)', type: 'currency' },
      { id: 'col_notes', key: 'G', label: 'Bank Ref / Notes', type: 'text' },
    ];
    return {
      name: name?.trim() || 'Job · Executive Payroll & Bonus',
      scope: 'personal',
      color: 'emerald',
      columns,
      settings: {
        showTotals: false,
        customStatuses: [
          { label: 'Credited', color: 'emerald' },
          { label: 'Processing', color: 'gold' },
          { label: 'Pending', color: 'rose' },
          { label: 'Bonus Paid', color: 'obsidian' },
        ],
      },
      rows: [
        {
          id: `row_${Date.now()}_1`,
          cells: {
            col_date: '2026-11-01',
            col_job: 'November Base Salary + Retainer',
            col_status: 'Credited',
            col_gross: '185000',
            col_net: '162500',
            col_tds: '=D1-E1',
            col_notes: 'HDFC Salary NEFT',
          },
        },
      ],
    };
  }

  if (templateKind === 'project') {
    const columns: SheetColumn[] = [
      { id: 'col_date', key: 'A', label: 'Date', type: 'date' },
      { id: 'col_job', key: 'B', label: 'Project / Milestone', type: 'text' },
      { id: 'col_client', key: 'C', label: 'Client / Partner', type: 'text' },
      { id: 'col_status', key: 'D', label: 'Status', type: 'status' },
      { id: 'col_billed', key: 'E', label: 'Contract Value (₹)', type: 'currency' },
      { id: 'col_received', key: 'F', label: 'Received (₹)', type: 'currency' },
      { id: 'col_pending', key: 'G', label: 'Balance Due (₹)', type: 'currency' },
      { id: 'col_notes', key: 'H', label: 'Deliverables / Notes', type: 'text' },
    ];
    return {
      name: name?.trim() || 'Job · Side Venture & Contracts',
      scope,
      color: 'obsidian',
      columns,
      settings: {
        showTotals: false,
        customStatuses: DEFAULT_STATUS_OPTIONS,
      },
      rows: [
        {
          id: `row_${Date.now()}_1`,
          cells: {
            col_date: '2026-11-10',
            col_job: 'ERP Cloud Migration Phase 1',
            col_client: 'Apex Logistics Pvt Ltd',
            col_status: 'In Progress',
            col_billed: '120000',
            col_received: '60000',
            col_pending: '=E1-F1',
            col_notes: '50% advance received via IMPS',
          },
        },
      ],
    };
  }

  if (templateKind === 'blank') {
    const columns: SheetColumn[] = [
      { id: 'col_a', key: 'A', label: 'Date', type: 'date' },
      { id: 'col_b', key: 'B', label: 'Title / Item', type: 'text' },
      { id: 'col_c', key: 'C', label: 'Category / Details', type: 'text' },
      { id: 'col_d', key: 'D', label: 'Status', type: 'status' },
      { id: 'col_e', key: 'E', label: 'Notes / Remarks', type: 'text' },
    ];
    return {
      name: name?.trim() || 'Custom Sheet',
      scope,
      color: 'gold',
      columns,
      settings: {
        showTotals: false,
        customStatuses: DEFAULT_STATUS_OPTIONS,
      },
      rows: [
        {
          id: `row_${Date.now()}_1`,
          cells: {
            col_a: new Date().toISOString().slice(0, 10),
            col_b: '',
            col_c: '',
            col_d: 'In Progress',
            col_e: '',
          },
        },
      ],
    };
  }

  // Default: 'freelance'
  const columns: SheetColumn[] = [
    { id: 'col_date', key: 'A', label: 'Date', type: 'date' },
    { id: 'col_job', key: 'B', label: 'Job / Task / Assignment', type: 'text' },
    { id: 'col_client', key: 'C', label: 'Client / Company', type: 'text' },
    { id: 'col_status', key: 'D', label: 'Status', type: 'status' },
    { id: 'col_hours', key: 'E', label: 'Hours / Units', type: 'number' },
    { id: 'col_billed', key: 'F', label: 'Billed Amount (₹)', type: 'currency' },
    { id: 'col_received', key: 'G', label: 'Received (₹)', type: 'currency' },
    { id: 'col_pending', key: 'H', label: 'Pending Due (₹)', type: 'currency' },
    { id: 'col_notes', key: 'I', label: 'Payment Mode / Notes', type: 'text' },
  ];

  return {
    name: name?.trim() || 'Job · Consulting & Client Tracker',
    scope,
    color: 'gold',
    columns,
    settings: {
      showTotals: false,
      customStatuses: DEFAULT_STATUS_OPTIONS,
    },
    rows: [
      {
        id: `row_${Date.now()}_1`,
        cells: {
          col_date: '2026-11-12',
          col_job: 'Q3 Financial Audit & Tax Advisory',
          col_client: 'Veritas Capital LLP',
          col_status: 'Completed',
          col_hours: '24',
          col_billed: '85000',
          col_received: '85000',
          col_pending: '=F1-G1',
          col_notes: 'Paid via Axis Current NEFT',
        },
      },
      {
        id: `row_${Date.now()}_2`,
        cells: {
          col_date: '2026-11-16',
          col_job: 'Treasury Dashboard Architecture',
          col_client: 'Meridian FinTech',
          col_status: 'Invoiced',
          col_hours: '18',
          col_billed: '64000',
          col_received: '32000',
          col_pending: '=F2-G2',
          col_notes: '50% milestone paid; balance due 25 Nov',
        },
      },
    ],
  };
}
