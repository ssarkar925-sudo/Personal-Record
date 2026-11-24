import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpZA,
  Check,
  CheckCircle2,
  ChevronDown,
  Columns,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  FunctionSquare,
  GripVertical,
  KeyRound,
  LayoutGrid,
  Lock,
  MoreVertical,
  Pin,
  Plus,
  Redo2,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatINR, todayISO } from '../lib/format.ts';
import type { Scope } from '../../shared/ledger-core.ts';
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  ScopeBadge,
  Select,
  cn,
} from '../components/ui/Primitives.tsx';
import {
  autoFitAllColumns,
  buildJobSheetTemplate,
  buildSheetFromImportedMatrix,
  computeAutoFitColumnWidth,
  computeSheetSummary,
  computeWorkbookTelemetry,
  evaluateCellFormula,
  getSheetStatusOptions,
  indexToColumnLetter,
  inferStatusColor,
  parseNumericCell,
  type CustomStatusOption,
  type JobSheetRecord,
  type SheetColumn,
  type SheetColumnType,
  type SheetRow,
  type SheetSettings,
  type SheetTabColor,
} from './sheets/jobSheetsAnalytics.ts';
import { SheetsHeroWorkstation } from './sheets/SheetsHeroWorkstation.tsx';

const TAB_COLOR_META: Record<
  SheetTabColor,
  { label: string; dot: string; activeBorder: string; badgeBg: string; badgeText: string; badgeBorder: string }
> = {
  gold: {
    label: 'Champagne Gold',
    dot: 'bg-[#C59B27]',
    activeBorder: 'border-b-2 border-b-[#C59B27]',
    badgeBg: 'bg-[#FDFBF4]',
    badgeText: 'text-[#8C6D1F]',
    badgeBorder: 'border-[#E6D5A7]',
  },
  emerald: {
    label: 'Forest Emerald',
    dot: 'bg-[#059669]',
    activeBorder: 'border-b-2 border-b-[#059669]',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
  },
  obsidian: {
    label: 'Obsidian Ink',
    dot: 'bg-[#111318]',
    activeBorder: 'border-b-2 border-b-[#111318]',
    badgeBg: 'bg-[#F3EFEA]',
    badgeText: 'text-[#111318]',
    badgeBorder: 'border-[#D5CFC2]',
  },
  rose: {
    label: 'Crimson Rose',
    dot: 'bg-[#E11D48]',
    activeBorder: 'border-b-2 border-b-[#E11D48]',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200',
  },
  slate: {
    label: 'Slate Titanium',
    dot: 'bg-[#686E78]',
    activeBorder: 'border-b-2 border-b-[#686E78]',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-200',
  },
};

interface ParsedExcelSheetPreview {
  sheetName: string;
  matrix: unknown[][];
  rowCount: number;
  colCount: number;
  selected: boolean;
}

const STORAGE_KEY_SHEETS = 'pl_job_sheets_backup_v1';
const STORAGE_KEY_ACTIVE_SHEET = 'pl_job_sheets_active_id_v1';
const STORAGE_KEY_DELETED_IDS = 'pl_job_sheets_deleted_ids_v1';

function readCachedSheets(): JobSheetRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEETS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedSheets(list: JobSheetRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

function readDeletedSheetIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_IDS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function addDeletedSheetId(id: string): void {
  try {
    const set = readDeletedSheetIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/**
 * Robust date parser supporting ISO (YYYY-MM-DD), Indian/UK (DD-MM-YYYY, DD/MM/YYYY),
 * and standard timestamp strings for accurate chronological sorting.
 */
function parseDateForSort(val: string): number | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const time = new Date(y, m, d).getTime();
    if (!isNaN(time)) return time;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const time = new Date(y, m, d).getTime();
    if (!isNaN(time)) return time;
  }

  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) return parsed;
  return null;
}

/**
 * Smart type-aware cell comparison function:
 * - Empty/blank cells always sink to the bottom in both directions.
 * - Dates sort chronologically by timestamp.
 * - Numbers & Currency sort numerically.
 * - Text uses natural alphanumeric collation (1 before 10).
 */
function compareSheetCells(
  valA: string,
  valB: string,
  colType?: SheetColumnType,
  sortDirection: 'asc' | 'desc' = 'asc',
): number {
  const strA = (valA ?? '').trim();
  const strB = (valB ?? '').trim();

  // Blank/empty cells always sink to the bottom in both directions
  if (!strA && !strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;

  // Number or Currency comparison
  if (
    colType === 'number' ||
    colType === 'currency' ||
    (/^[₹$€£]?\s*[-+]?[\d,]+(\.\d+)?$/.test(strA) && /^[₹$€£]?\s*[-+]?[\d,]+(\.\d+)?$/.test(strB))
  ) {
    const numA = parseNumericCell(strA);
    const numB = parseNumericCell(strB);
    return sortDirection === 'asc' ? numA - numB : numB - numA;
  }

  // Date comparison (chronological timestamp comparison)
  if (colType === 'date') {
    const timeA = parseDateForSort(strA);
    const timeB = parseDateForSort(strB);
    if (timeA !== null && timeB !== null) {
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }
    if (timeA !== null) return sortDirection === 'asc' ? -1 : 1;
    if (timeB !== null) return sortDirection === 'asc' ? 1 : -1;
  }

  // Fallback date detection even if column type is text
  const maybeTimeA = parseDateForSort(strA);
  const maybeTimeB = parseDateForSort(strB);
  if (maybeTimeA !== null && maybeTimeB !== null) {
    return sortDirection === 'asc' ? maybeTimeA - maybeTimeB : maybeTimeB - maybeTimeA;
  }

  // Natural alphanumeric comparison ("1", "2", ... "10", "11")
  const result = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
  return sortDirection === 'asc' ? result : -result;
}

/**
 * Standard WebCrypto SHA-256 client-side hashing for optional sheet PIN protection.
 * Plaintext PIN is never stored or transmitted anywhere.
 */
async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await window.crypto.subtle.digest('SHA-256', enc.encode(pin.trim()));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function JobSheetsView({
  globalScopeFilter = 'all',
  onNotify,
}: {
  globalScopeFilter?: Scope | 'all';
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
}) {
  const [sheets, setSheets] = useState<JobSheetRecord[]>(() => readCachedSheets());
  const [activeSheetId, setActiveSheetId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_SHEET) || '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirtySheetIds, setDirtySheetIds] = useState<Set<string>>(new Set());
  const [lastSavedLabel, setLastSavedLabel] = useState<string>('Auto-saved ✓');

  // Active cell selection for Google Sheets formula bar (`fx`)
  const [selectedCell, setSelectedCell] = useState<{ rowIndex: number; colId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Row Pagination (10, 20, 50, 100, or 'all' for large sheets)
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [mobileHeroOpen, setMobileHeroOpen] = useState(false);

  // New Tab Modal / Template Picker
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [newTabTemplate, setNewTabTemplate] = useState<
    'job_tracker' | 'freelance' | 'salary' | 'project' | 'blank'
  >('job_tracker');
  const [newTabScope, setNewTabScope] = useState<Scope>('business');
  const [newTabColor, setNewTabColor] = useState<SheetTabColor>('emerald');

  // Inline Tab Rename State
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameTabDraft, setRenameTabDraft] = useState('');

  // Add Column Modal & Positional Placement
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<SheetColumnType>('text');
  const [newColPlacement, setNewColPlacement] = useState<'end' | 'start' | 'left' | 'right'>('end');
  const [newColTargetColId, setNewColTargetColId] = useState<string>('');

  // Undo & Redo History Stacks
  const [undoStack, setUndoStack] = useState<JobSheetRecord[]>([]);
  const [redoStack, setRedoStack] = useState<JobSheetRecord[]>([]);

  // Pinned Row (Ensures newly added rows remain visible at Row 1 on Page 1 even while sorted)
  const [pinnedRowId, setPinnedRowId] = useState<string | null>(null);

  // Popover States
  const [sortCenterOpen, setSortCenterOpen] = useState(false);
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [activeColMenuId, setActiveColMenuId] = useState<string | null>(null);

  // Custom Status Manager Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusColor, setNewStatusColor] = useState<SheetTabColor>('emerald');
  const [pendingStatusCellTarget, setPendingStatusCellTarget] = useState<{
    rowIndex: number;
    colId: string;
  } | null>(null);

  // Excel / CSV Import Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const [excelPreviews, setExcelPreviews] = useState<ParsedExcelSheetPreview[]>([]);
  const [importMode, setImportMode] = useState<'new_tabs' | 'append_current' | 'replace_current'>('new_tabs');
  const [importScope, setImportScope] = useState<Scope>('business');
  const [importBusy, setImportBusy] = useState(false);
  const [importSavedMessage, setImportSavedMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Confirmation Dialog Targets (NO 1-CLICK DELETE ANYWHERE!)
  const [deleteTabTarget, setDeleteTabTarget] = useState<JobSheetRecord | null>(null);
  const [deleteRowTarget, setDeleteRowTarget] = useState<{
    rowIndex: number;
    previewLabel: string;
  } | null>(null);
  const [deleteColTarget, setDeleteColTarget] = useState<{
    colId: string;
    letter: string;
    label: string;
  } | null>(null);

  // Mobile-first Row Drawer and View Mode (< 768px)
  const [mobileViewMode, setMobileViewMode] = useState<'table' | 'cards'>('table');
  const [mobileDrawerRowIndex, setMobileDrawerRowIndex] = useState<number | null>(null);

  // Sheet Archive Filter ('active' | 'archived' | 'all')
  const [sheetScopeFilter, setSheetScopeFilter] = useState<'active' | 'archived' | 'all'>('active');

  // Fast Entry & Sorting Mode
  const [sortOrder, setSortOrder] = useState<'normal' | 'latest_first' | 'col_asc' | 'col_desc'>(() => {
    try {
      return (localStorage.getItem('sc_sheets_sort_order') as any) || 'normal';
    } catch {
      return 'normal';
    }
  });
  const [sortColId, setSortColId] = useState<string | null>(null);

  // Auto-Default Same (Sticky Defaults across new rows)
  const [autoDefaultSame, setAutoDefaultSame] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sc_sheets_auto_default') === 'true';
    } catch {
      return false;
    }
  });
  const [stickyDefaults, setStickyDefaults] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('sc_sheets_sticky_values');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Top Horizontal Scrollbar Refs
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Drag and Move (Rows and Columns)
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);

  // Column Format & Auto-Detect Dropdown Modal
  const [formatColTarget, setFormatColTarget] = useState<SheetColumn | null>(null);
  const [customDropdownInput, setCustomDropdownInput] = useState('');

  // Sheet Cards Hub View vs Spreadsheet Table View Mode
  const [sheetViewMode, setSheetViewMode] = useState<'hub' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('sc_sheets_view_mode');
      if (saved === 'table' || saved === 'hub') return saved;
    } catch {
      // ignore
    }
    return 'hub'; // Defaults to Cards Hub to act as privacy barrier
  });

  // Consolidated Sheet Options Dropdown Menu
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false);
  const [hubSearchQuery, setHubSearchQuery] = useState('');
  const [hubScopeFilter, setHubScopeFilter] = useState<Scope | 'all'>('all');
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);

  // Optional Sheet PIN Protection & Session Unlocks
  const [unlockedSheetIds, setUnlockedSheetIds] = useState<Set<string>>(() => new Set());
  const [pinUnlockModalOpen, setPinUnlockModalOpen] = useState(false);
  const [pinUnlockTarget, setPinUnlockTarget] = useState<JobSheetRecord | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);

  const [pinSetupModalOpen, setPinSetupModalOpen] = useState(false);
  const [pinSetupTarget, setPinSetupTarget] = useState<JobSheetRecord | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinHintInput, setPinHintInput] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');

  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingSheetRef = useRef<JobSheetRecord | null>(null);

  // Keep localStorage mirror synchronized whenever sheets or activeSheetId change
  useEffect(() => {
    if (sheets.length > 0) {
      writeCachedSheets(sheets);
    }
  }, [sheets]);

  useEffect(() => {
    if (activeSheetId) {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_SHEET, activeSheetId);
      } catch {
        // ignore
      }
    }
  }, [activeSheetId]);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    const cached = readCachedSheets();
    const deletedIds = readDeletedSheetIds();
    try {
      const serverData = await api.getJobSheets();
      const mergedMap = new Map<string, JobSheetRecord>();
      for (const s of serverData) {
        if (!deletedIds.has(s.id)) {
          mergedMap.set(s.id, s);
        }
      }

      // Reconcile any locally cached or imported Excel sheets so nothing is ever lost across restarts
      for (const localSheet of cached) {
        if (deletedIds.has(localSheet.id)) continue;
        const existingOnServer = mergedMap.get(localSheet.id);
        if (!existingOnServer) {
          // Check if it's a starter template duplicate by exact name + row count
          const isStarterDuplicate = serverData.some(
            (srv) => srv.name === localSheet.name && srv.rows.length === localSheet.rows.length,
          );
          if (!isStarterDuplicate) {
            try {
              const recreated = await api.createJobSheet({
                name: localSheet.name,
                scope: localSheet.scope,
                color: localSheet.color,
                columns: localSheet.columns,
                rows: localSheet.rows,
                settings: localSheet.settings,
                orderIndex: mergedMap.size,
              });
              mergedMap.set(recreated.id, recreated);
            } catch {
              mergedMap.set(localSheet.id, localSheet);
            }
          }
        } else if (
          localSheet.updatedAt &&
          existingOnServer.updatedAt &&
          localSheet.updatedAt > existingOnServer.updatedAt
        ) {
          try {
            const synced = await api.updateJobSheet(localSheet.id, {
              name: localSheet.name,
              scope: localSheet.scope,
              color: localSheet.color,
              columns: localSheet.columns,
              rows: localSheet.rows,
              settings: localSheet.settings,
              orderIndex: localSheet.orderIndex,
            });
            mergedMap.set(synced.id, synced);
          } catch {
            mergedMap.set(localSheet.id, localSheet);
          }
        }
      }

      const finalSheets = Array.from(mergedMap.values());
      const resolved = finalSheets.length > 0 ? finalSheets : serverData;
      setSheets(resolved);
      writeCachedSheets(resolved);
      if (resolved.length > 0) {
        setActiveSheetId((prev) =>
          prev && resolved.some((s) => s.id === prev) ? prev : resolved[0].id,
        );
      }
      setLastSavedLabel('Auto-saved ✓');
    } catch {
      if (cached.length > 0) {
        setSheets(cached);
        setActiveSheetId((prev) =>
          prev && cached.some((s) => s.id === prev) ? prev : cached[0].id,
        );
      } else {
        onNotify?.('Failed to load job sheets workbook', 'err');
      }
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadSheets();
  }, [loadSheets]);

  const visibleSheets = useMemo(() => {
    const list = sheets.filter((s) => {
      if (globalScopeFilter !== 'all' && s.scope !== globalScopeFilter && s.id !== activeSheetId) {
        return false;
      }
      if (sheetScopeFilter === 'active' && s.archived) return false;
      if (sheetScopeFilter === 'archived' && !s.archived) return false;
      return true;
    });
    return list.length > 0 ? list : sheets;
  }, [sheets, globalScopeFilter, activeSheetId, sheetScopeFilter]);

  const filteredHubSheets = useMemo(() => {
    return sheets.filter((s) => {
      if (hubScopeFilter !== 'all' && s.scope !== hubScopeFilter) return false;
      if (sheetScopeFilter === 'active' && s.archived) return false;
      if (sheetScopeFilter === 'archived' && !s.archived) return false;
      if (hubSearchQuery.trim()) {
        const q = hubSearchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchCols = s.columns.some((c) => c.label.toLowerCase().includes(q));
        if (!matchName && !matchCols) return false;
      }
      return true;
    });
  }, [sheets, hubScopeFilter, sheetScopeFilter, hubSearchQuery]);

  const activeSheet = useMemo(() => {
    return (
      visibleSheets.find((s) => s.id === activeSheetId) ??
      sheets.find((s) => s.id === activeSheetId) ??
      visibleSheets[0] ??
      sheets[0] ??
      null
    );
  }, [visibleSheets, sheets, activeSheetId]);

  const activeStatusOptions = useMemo(() => getSheetStatusOptions(activeSheet), [activeSheet]);
  const showTotals = Boolean(activeSheet?.settings?.showTotals);

  useEffect(() => {
    if (!activeSheet) return;
    if (activeSheet.id !== activeSheetId) {
      setActiveSheetId(activeSheet.id);
    }
    if (activeSheet.rows.length > 0 && activeSheet.columns.length > 0) {
      setSelectedCell((prev) => {
        if (
          prev &&
          prev.rowIndex < activeSheet.rows.length &&
          activeSheet.columns.some((c) => c.id === prev.colId)
        ) {
          return prev;
        }
        return { rowIndex: 0, colId: activeSheet.columns[0].id };
      });
    } else {
      setSelectedCell(null);
    }
  }, [activeSheet, activeSheetId]);

  const persistSheet = useCallback(
    async (sheetToSave: JobSheetRecord, showToast = false) => {
      setSaving(true);
      const stamped: JobSheetRecord = {
        ...sheetToSave,
        updatedAt: new Date().toISOString(),
      };
      setSheets((prev) => {
        const next = prev.map((s) => (s.id === stamped.id ? stamped : s));
        writeCachedSheets(next);
        return next;
      });
      try {
        const saved = await api.updateJobSheet(stamped.id, {
          name: stamped.name,
          scope: stamped.scope,
          color: stamped.color,
          columns: stamped.columns,
          rows: stamped.rows,
          settings: stamped.settings,
          orderIndex: stamped.orderIndex,
        });
        setSheets((prev) => {
          const next = prev.map((s) => {
            if (s.id !== saved.id) return s;
            // Stale response guard: If local sheet was edited after stamped.updatedAt, KEEP newer local edits!
            if (s.updatedAt > stamped.updatedAt) {
              return s;
            }
            return saved;
          });
          writeCachedSheets(next);
          return next;
        });

        // If newer user keystrokes occurred while the network save was in flight, re-schedule save for the latest version!
        if (pendingSheetRef.current && pendingSheetRef.current.updatedAt > stamped.updatedAt) {
          if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = window.setTimeout(() => {
            if (pendingSheetRef.current) {
              void persistSheet(pendingSheetRef.current, false);
            }
          }, 1000);
        } else {
          pendingSheetRef.current = null;
          setDirtySheetIds((prev) => {
            const next = new Set(prev);
            next.delete(saved.id);
            return next;
          });
        }

        const timeStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        setLastSavedLabel(`Auto-saved ${timeStr} ✓`);
        if (showToast) {
          onNotify?.(`Saved "${saved.name}" ✓`);
        }
      } catch {
        setLastSavedLabel('Saved locally ✓');
      } finally {
        setSaving(false);
      }
    },
    [onNotify],
  );

  // Flush any pending debounced save on page unload / unmount
  useEffect(() => {
    const flushPending = () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (pendingSheetRef.current) {
        const toFlush = pendingSheetRef.current;
        pendingSheetRef.current = null;
        void api.updateJobSheet(toFlush.id, {
          name: toFlush.name,
          scope: toFlush.scope,
          color: toFlush.color,
          columns: toFlush.columns,
          rows: toFlush.rows,
          settings: toFlush.settings,
          orderIndex: toFlush.orderIndex,
        });
      }
    };
    window.addEventListener('beforeunload', flushPending);
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      flushPending();
    };
  }, []);

  // Reset undo/redo, pinned rows, and popovers on sheet tab switch
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setPinnedRowId(null);
    setActiveColMenuId(null);
    setSortCenterOpen(false);
    setRowMenuOpen(false);
  }, [activeSheetId]);

  // Background auto-save on every edit with a 1000ms comfortable typing buffer
  const updateActiveSheetLocal = useCallback(
    (updater: (current: JobSheetRecord) => JobSheetRecord) => {
      if (!activeSheet) return;
      // Record snapshot to Undo stack (up to 40 levels of undo)
      setUndoStack((prev) => [...prev.slice(-39), activeSheet]);
      setRedoStack([]); // reset redo history on fresh user action

      const nextSheet: JobSheetRecord = {
        ...updater(activeSheet),
        updatedAt: new Date().toISOString(),
      };
      pendingSheetRef.current = nextSheet;
      setSheets((prev) => {
        const next = prev.map((s) => (s.id === nextSheet.id ? nextSheet : s));
        writeCachedSheets(next);
        return next;
      });
      setDirtySheetIds((prev) => new Set(prev).add(nextSheet.id));
      setLastSavedLabel('Auto-saving...');

      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = window.setTimeout(() => {
        void persistSheet(nextSheet, false);
      }, 1000);
    },
    [activeSheet, persistSheet],
  );

  // Immediately flush save on input blur or cell completion without waiting for the timer
  const handleCellBlur = useCallback(() => {
    if (pendingSheetRef.current) {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      void persistSheet(pendingSheetRef.current, false);
    }
  }, [persistSheet]);

  // Auto-adjust all columns to content dynamically
  const handleAutoFitAllColumns = useCallback(() => {
    if (!activeSheet) return;
    const autoFitted = autoFitAllColumns(activeSheet);
    updateActiveSheetLocal(() => autoFitted);
    onNotify?.(`Auto-fitted all ${activeSheet.columns.length} columns to content ✓`);
  }, [activeSheet, updateActiveSheetLocal, onNotify]);

  // Auto-adjust a single column to its content dynamically
  const handleAutoFitSingleColumn = useCallback(
    (colId: string) => {
      if (!activeSheet) return;
      const targetCol = activeSheet.columns.find((c) => c.id === colId);
      if (!targetCol) return;
      const optimalWidth = computeAutoFitColumnWidth(targetCol, activeSheet.rows);
      updateActiveSheetLocal((curr) => ({
        ...curr,
        columns: curr.columns.map((c) => (c.id === colId ? { ...c, width: optimalWidth } : c)),
      }));
      onNotify?.(`Auto-fitted Column ${targetCol.key} (${targetCol.label}) to ${optimalWidth}px ✓`);
    },
    [activeSheet, updateActiveSheetLocal, onNotify],
  );

  const updateAnySheet = useCallback(
    (sheetId: string, updater: (current: JobSheetRecord) => JobSheetRecord) => {
      setSheets((prev) => {
        const target = prev.find((s) => s.id === sheetId);
        if (!target) return prev;
        const updated: JobSheetRecord = {
          ...updater(target),
          updatedAt: new Date().toISOString(),
        };
        const nextList = prev.map((s) => (s.id === sheetId ? updated : s));
        writeCachedSheets(nextList);
        void persistSheet(updated, false);
        return nextList;
      });
    },
    [persistSheet],
  );

  const handleOpenSheet = useCallback(
    (sheet: JobSheetRecord) => {
      if (sheet.settings?.pinHash && !unlockedSheetIds.has(sheet.id)) {
        setPinUnlockTarget(sheet);
        setEnteredPin('');
        setPinError('');
        setPinUnlockModalOpen(true);
        return;
      }
      setActiveSheetId(sheet.id);
      setSheetViewMode('table');
      try {
        localStorage.setItem('sc_sheets_view_mode', 'table');
      } catch {
        // ignore
      }
    },
    [unlockedSheetIds],
  );

  const handleLockActiveSheet = useCallback(() => {
    if (!activeSheet) return;
    setUnlockedSheetIds((prev) => {
      const next = new Set(prev);
      next.delete(activeSheet.id);
      return next;
    });
    setSheetViewMode('hub');
    try {
      localStorage.setItem('sc_sheets_view_mode', 'hub');
    } catch {
      // ignore
    }
    onNotify?.(`Sheet "${activeSheet.name}" locked 🔒`);
  }, [activeSheet, onNotify]);

  const handleUnlockSubmit = useCallback(async () => {
    if (!pinUnlockTarget || !pinUnlockTarget.settings?.pinHash) return;
    const hash = await hashPin(enteredPin);
    if (hash === pinUnlockTarget.settings.pinHash) {
      setUnlockedSheetIds((prev) => new Set(prev).add(pinUnlockTarget.id));
      setActiveSheetId(pinUnlockTarget.id);
      setSheetViewMode('table');
      try {
        localStorage.setItem('sc_sheets_view_mode', 'table');
      } catch {
        // ignore
      }
      setPinUnlockModalOpen(false);
      setEnteredPin('');
      setPinError('');
      onNotify?.(`Sheet "${pinUnlockTarget.name}" Unlocked ✓`, 'ok');
    } else {
      setPinError('Incorrect PIN. Please try again.');
    }
  }, [enteredPin, pinUnlockTarget, onNotify]);

  const handleSavePinProtection = useCallback(async () => {
    if (!pinSetupTarget) return;
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinSetupError('PIN must be 4 to 6 numeric digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinSetupError('PINs do not match.');
      return;
    }
    const pinHash = await hashPin(newPin);
    const updatedSettings: SheetSettings = {
      ...pinSetupTarget.settings,
      pinHash,
      pinHint: pinHintInput.trim() || undefined,
    };

    updateAnySheet(pinSetupTarget.id, (curr) => ({
      ...curr,
      settings: updatedSettings,
    }));

    setUnlockedSheetIds((prev) => new Set(prev).add(pinSetupTarget.id));
    setPinSetupModalOpen(false);
    setNewPin('');
    setConfirmPin('');
    setPinHintInput('');
    setPinSetupError('');
    onNotify?.(`PIN protection set for "${pinSetupTarget.name}" 🔒`, 'ok');
  }, [pinSetupTarget, newPin, confirmPin, pinHintInput, updateAnySheet, onNotify]);

  const handleRemovePinProtection = useCallback(() => {
    if (!pinSetupTarget) return;
    const updatedSettings: SheetSettings = {
      ...pinSetupTarget.settings,
      pinHash: undefined,
      pinHint: undefined,
    };
    updateAnySheet(pinSetupTarget.id, (curr) => ({
      ...curr,
      settings: updatedSettings,
    }));
    setUnlockedSheetIds((prev) => {
      const next = new Set(prev);
      next.delete(pinSetupTarget.id);
      return next;
    });
    setPinSetupModalOpen(false);
    setNewPin('');
    setConfirmPin('');
    setPinHintInput('');
    setPinSetupError('');
    onNotify?.(`PIN protection removed from "${pinSetupTarget.name}"`, 'ok');
  }, [pinSetupTarget, updateAnySheet, onNotify]);

  // Undo and Redo Handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !activeSheet) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev.slice(-39), activeSheet]);

    pendingSheetRef.current = prevSnapshot;
    setSheets((prev) => {
      const next = prev.map((s) => (s.id === prevSnapshot.id ? prevSnapshot : s));
      writeCachedSheets(next);
      return next;
    });
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistSheet(prevSnapshot, false);
    }, 450);
    onNotify?.('Undo action ↶');
  }, [undoStack, activeSheet, persistSheet, onNotify]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !activeSheet) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev.slice(-39), activeSheet]);

    pendingSheetRef.current = nextSnapshot;
    setSheets((prev) => {
      const next = prev.map((s) => (s.id === nextSnapshot.id ? nextSnapshot : s));
      writeCachedSheets(next);
      return next;
    });
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistSheet(nextSnapshot, false);
    }, 450);
    onNotify?.('Redo action ↷');
  }, [redoStack, activeSheet, persistSheet, onNotify]);

  // Global Keyboard Shortcuts: Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Toggle Σ Totals Row On / Off ("ADD TOTAL WHEN NEEDED. NOT EVERY TIME.")
  const handleToggleTotals = () => {
    if (!activeSheet) return;
    const nextVal = !Boolean(activeSheet.settings?.showTotals);
    updateActiveSheetLocal((curr) => ({
      ...curr,
      settings: {
        ...(curr.settings ?? {}),
        customStatuses: getSheetStatusOptions(curr),
        showTotals: nextVal,
      },
    }));
    onNotify?.(nextVal ? 'Σ Totals row enabled for this sheet' : 'Σ Totals row hidden');
  };

  // Add a Custom Status Option to the active sheet
  const handleAddCustomStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSheet || !newStatusLabel.trim()) return;
    const trimmed = newStatusLabel.trim();
    const existing = getSheetStatusOptions(activeSheet);
    const updatedStatuses: CustomStatusOption[] = existing.some(
      (s) => s.label.toLowerCase() === trimmed.toLowerCase(),
    )
      ? existing.map((s) =>
          s.label.toLowerCase() === trimmed.toLowerCase() ? { label: trimmed, color: newStatusColor } : s,
        )
      : [...existing, { label: trimmed, color: newStatusColor }];

    updateActiveSheetLocal((curr) => {
      let nextRows = curr.rows;
      if (pendingStatusCellTarget) {
        nextRows = curr.rows.map((r, idx) =>
          idx === pendingStatusCellTarget.rowIndex
            ? { ...r, cells: { ...r.cells, [pendingStatusCellTarget.colId]: trimmed } }
            : r,
        );
      }
      return {
        ...curr,
        rows: nextRows,
        settings: {
          ...(curr.settings ?? {}),
          showTotals: Boolean(curr.settings?.showTotals),
          customStatuses: updatedStatuses,
        },
      };
    });

    setNewStatusLabel('');
    setPendingStatusCellTarget(null);
    onNotify?.(`Added custom status "${trimmed}" ✓`);
  };

  const handleRemoveCustomStatus = (labelToRemove: string) => {
    if (!activeSheet) return;
    const existing = getSheetStatusOptions(activeSheet);
    if (existing.length <= 1) {
      onNotify?.('Keep at least one status option.', 'err');
      return;
    }
    const nextList = existing.filter((s) => s.label !== labelToRemove);
    updateActiveSheetLocal((curr) => ({
      ...curr,
      settings: {
        ...(curr.settings ?? {}),
        showTotals: Boolean(curr.settings?.showTotals),
        customStatuses: nextList,
      },
    }));
  };

  // Create a new Job Sheet tab
  const handleCreateTab = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const built = buildJobSheetTemplate(newTabTemplate, newTabName, newTabScope);
    setSaving(true);
    try {
      const created = await api.createJobSheet({
        name: newTabName.trim() || built.name,
        scope: newTabScope,
        color: newTabColor,
        columns: built.columns,
        rows: built.rows,
        settings: built.settings,
        orderIndex: sheets.length,
      });
      setSheets((prev) => [...prev, created]);
      setActiveSheetId(created.id);
      setNewTabOpen(false);
      setNewTabName('');
      onNotify?.(`Created new tab "${created.name}" ✓`);
    } catch {
      onNotify?.('Could not create new sheet tab', 'err');
    } finally {
      setSaving(false);
    }
  };

  const openNewTabModal = (
    template: 'job_tracker' | 'freelance' | 'salary' | 'project' | 'blank' = 'job_tracker',
  ) => {
    setNewTabTemplate(template);
    setNewTabScope(template === 'salary' ? 'personal' : 'business');
    setNewTabColor(
      template === 'job_tracker' || template === 'salary'
        ? 'emerald'
        : template === 'project'
          ? 'obsidian'
          : 'gold',
    );
    setNewTabName(
      template === 'job_tracker'
        ? `Job ${sheets.length + 1} · Role & Status Tracker`
        : template === 'salary'
          ? `Job ${sheets.length + 1} · Payroll & Bonus`
          : template === 'project'
            ? `Job ${sheets.length + 1} · Project Contract`
            : template === 'blank'
              ? `Sheet ${sheets.length + 1} · Custom Data`
              : `Job ${sheets.length + 1} · Client & Billing`,
    );
    setNewTabOpen(true);
  };

  // Duplicate active tab
  const handleDuplicateTab = async (target: JobSheetRecord) => {
    setSaving(true);
    try {
      const duplicatedRows: SheetRow[] = target.rows.map((r, idx) => ({
        id: `row_${Date.now()}_${idx}`,
        cells: { ...r.cells },
      }));
      const created = await api.createJobSheet({
        name: `${target.name} (Copy)`,
        scope: target.scope,
        color: target.color,
        columns: target.columns,
        rows: duplicatedRows,
        settings: target.settings,
        orderIndex: sheets.length,
      });
      setSheets((prev) => [...prev, created]);
      setActiveSheetId(created.id);
      onNotify?.(`Duplicated tab as "${created.name}" ✓`);
    } catch {
      onNotify?.('Failed to duplicate sheet tab', 'err');
    } finally {
      setSaving(false);
    }
  };

  // Confirmed Delete Tab
  const handleConfirmDeleteTab = async () => {
    if (!deleteTabTarget) return;
    if (sheets.length <= 1) {
      onNotify?.('Workbook must keep at least one active sheet tab.', 'err');
      setDeleteTabTarget(null);
      return;
    }
    const targetId = deleteTabTarget.id;
    const targetName = deleteTabTarget.name;
    addDeletedSheetId(targetId);
    const remaining = sheets.filter((s) => s.id !== targetId);
    setSheets(remaining);
    writeCachedSheets(remaining);
    if (activeSheetId === targetId && remaining.length > 0) {
      setActiveSheetId(remaining[0].id);
    }
    setDeleteTabTarget(null);
    try {
      await api.deleteJobSheet(targetId);
      onNotify?.(`Deleted tab "${targetName}"`);
    } catch {
      onNotify?.(`Deleted tab "${targetName}"`);
    }
  };

  // Confirmed Delete Row (NO 1-CLICK DELETE!)
  const handleConfirmDeleteRow = () => {
    if (!deleteRowTarget || !activeSheet) return;
    const targetIdx = deleteRowTarget.rowIndex;
    updateActiveSheetLocal((curr) => ({
      ...curr,
      rows: curr.rows.filter((_, idx) => idx !== targetIdx),
    }));
    setDeleteRowTarget(null);
    onNotify?.(`Deleted row #${targetIdx + 1}`);
  };

  // Confirmed Delete Column (NO 1-CLICK DELETE!)
  const handleConfirmDeleteColumn = () => {
    if (!deleteColTarget || !activeSheet) return;
    if (activeSheet.columns.length <= 2) {
      onNotify?.('Sheet must keep at least 2 columns.', 'err');
      setDeleteColTarget(null);
      return;
    }
    const colId = deleteColTarget.colId;
    updateActiveSheetLocal((curr) => {
      const filteredCols = curr.columns
        .filter((c) => c.id !== colId)
        .map((c, idx) => ({ ...c, key: indexToColumnLetter(idx) }));
      return {
        ...curr,
        columns: filteredCols,
      };
    });
    setDeleteColTarget(null);
    onNotify?.(`Deleted column "${deleteColTarget.letter} · ${deleteColTarget.label}"`);
  };

  const commitTabRename = (sheetId: string) => {
    const trimmed = renameTabDraft.trim();
    setRenamingTabId(null);
    if (!trimmed) return;
    const target = sheets.find((s) => s.id === sheetId);
    if (!target || target.name === trimmed) return;
    const updated = { ...target, name: trimmed };
    setSheets((prev) => prev.map((s) => (s.id === sheetId ? updated : s)));
    void persistSheet(updated, true);
  };

  const handleCellChange = (rowIndex: number, colId: string, nextVal: string) => {
    if (autoDefaultSame && nextVal.trim()) {
      setStickyDefaults((prev) => {
        const next = { ...prev, [colId]: nextVal };
        try {
          localStorage.setItem('sc_sheets_sticky_values', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
    updateActiveSheetLocal((curr) => {
      const nextRows = curr.rows.map((r, idx) =>
        idx === rowIndex ? { ...r, cells: { ...r.cells, [colId]: nextVal } } : r,
      );
      return { ...curr, rows: nextRows };
    });
  };

  const handleAddRow = (
    positionOrColId: 'top' | 'bottom' | 'above' | 'below' | string = 'bottom',
    referenceIndex?: number,
    targetColId?: string,
  ) => {
    if (!activeSheet) return;
    let position: 'top' | 'bottom' | 'above' | 'below' = 'bottom';
    let resolvedColId = targetColId;

    if (
      positionOrColId === 'top' ||
      positionOrColId === 'bottom' ||
      positionOrColId === 'above' ||
      positionOrColId === 'below'
    ) {
      position = positionOrColId;
    } else if (typeof positionOrColId === 'string' && positionOrColId) {
      position = 'bottom';
      resolvedColId = positionOrColId;
    }

    const newRowIndex = activeSheet.rows.length + 1;
    const cells: Record<string, string> = {};
    const currencyCols = activeSheet.columns.filter((c) => c.type === 'currency');
    const billedCol = currencyCols[0];
    const receivedCol = currencyCols[1];
    const pendingCol = currencyCols[2];
    const statusOpts = getSheetStatusOptions(activeSheet);
    const prevRow = activeSheet.rows[activeSheet.rows.length - 1];

    for (let idx = 0; idx < activeSheet.columns.length; idx++) {
      const col = activeSheet.columns[idx];
      if (autoDefaultSame && stickyDefaults[col.id] !== undefined) {
        cells[col.id] = stickyDefaults[col.id];
      } else if (autoDefaultSame && prevRow && prevRow.cells[col.id] !== undefined) {
        const pVal = prevRow.cells[col.id];
        if (idx === 0 && /^\d+$/.test(pVal.trim())) {
          cells[col.id] = String(Number(pVal.trim()) + 1);
        } else {
          cells[col.id] = pVal;
        }
      } else if (col.type === 'date') {
        cells[col.id] = todayISO();
      } else if (col.type === 'status') {
        cells[col.id] = col.options?.[0] ?? statusOpts[0]?.label ?? 'In Progress';
      } else if (col.id === pendingCol?.id && billedCol && receivedCol) {
        cells[col.id] = `=${billedCol.key}${newRowIndex}-${receivedCol.key}${newRowIndex}`;
      } else if (col.type === 'currency' || col.type === 'number') {
        cells[col.id] = '0';
      } else {
        cells[col.id] = '';
      }
    }

    const newRow: SheetRow = {
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cells,
    };

    let targetIdx = activeSheet.rows.length;
    if (position === 'top') {
      targetIdx = 0;
    } else if (position === 'above') {
      targetIdx = referenceIndex !== undefined ? referenceIndex : (selectedCell?.rowIndex ?? 0);
    } else if (position === 'below') {
      const ref = referenceIndex !== undefined ? referenceIndex : (selectedCell?.rowIndex ?? activeSheet.rows.length - 1);
      targetIdx = Math.min(activeSheet.rows.length, ref + 1);
    }

    updateActiveSheetLocal((curr) => {
      const nextRows = [...curr.rows];
      nextRows.splice(targetIdx, 0, newRow);
      return {
        ...curr,
        rows: nextRows,
      };
    });

    // If the sheet is currently sorted, pin this new row so it stays at Row 1 (Page 1) for editing
    if (sortOrder !== 'normal' || sortColId !== null) {
      setPinnedRowId(newRow.id);
    }

    const targetCol = resolvedColId || activeSheet.columns[0]?.id || '';
    setSelectedCell({ rowIndex: targetIdx, colId: targetCol });

    if (position === 'top' || sortOrder !== 'normal' || sortColId !== null) {
      setCurrentPage(1);
    } else if (pageSize !== 'all') {
      const targetPage = Math.ceil((targetIdx + 1) / pageSize);
      setCurrentPage(targetPage);
    }

    onNotify?.(
      position === 'top'
        ? 'Added row at Top (Row 1 / Fast Entry)'
        : position === 'above'
          ? `Inserted row above Row #${(referenceIndex ?? 0) + 1}`
          : position === 'below'
            ? `Inserted row below Row #${(referenceIndex ?? 0) + 1}`
            : 'Added row at Bottom',
    );
  };

  const handleMoveRow = (fromIndex: number, toIndex: number) => {
    if (!activeSheet || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (toIndex >= activeSheet.rows.length) return;
    updateActiveSheetLocal((curr) => {
      const nextRows = [...curr.rows];
      const [moved] = nextRows.splice(fromIndex, 1);
      if (!moved) return curr;
      nextRows.splice(toIndex, 0, moved);
      return { ...curr, rows: nextRows };
    });
    onNotify?.(`Moved Row #${fromIndex + 1} to Row #${toIndex + 1}`);
  };

  const handleMoveColumn = (fromIndex: number, toIndex: number) => {
    if (!activeSheet || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (toIndex >= activeSheet.columns.length) return;
    updateActiveSheetLocal((curr) => {
      const nextCols = [...curr.columns];
      const [moved] = nextCols.splice(fromIndex, 1);
      if (!moved) return curr;
      nextCols.splice(toIndex, 0, moved);
      const reindexed = nextCols.map((c, idx) => ({
        ...c,
        key: indexToColumnLetter(idx),
      }));
      return { ...curr, columns: reindexed };
    });
    onNotify?.(`Reordered column to position ${indexToColumnLetter(toIndex)}`);
  };

  const handleArchiveSheet = (sheet: JobSheetRecord) => {
    const isArchived = Boolean(sheet.archived);
    const updated: JobSheetRecord = {
      ...sheet,
      archived: !isArchived,
      archivedAt: !isArchived ? new Date().toISOString() : undefined,
    };
    setSheets((prev) => prev.map((s) => (s.id === sheet.id ? updated : s)));
    void persistSheet(updated, true);
    onNotify?.(!isArchived ? `Archived sheet "${sheet.name}" ✓` : `Restored sheet "${sheet.name}" to Active ✓`);
  };

  const handleTopScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleTableScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  const scrollTableHorizontally = (dir: 'left' | 'right') => {
    const delta = dir === 'left' ? -350 : 350;
    tableContainerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleDuplicateRow = (rowIndex: number) => {
    if (!activeSheet) return;
    const source = activeSheet.rows[rowIndex];
    if (!source) return;
    const copy: SheetRow = {
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cells: { ...source.cells },
    };
    updateActiveSheetLocal((curr) => {
      const nextRows = [...curr.rows];
      nextRows.splice(rowIndex + 1, 0, copy);
      return { ...curr, rows: nextRows };
    });
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSheet || !newColLabel.trim()) return;
    const newCol: SheetColumn = {
      id: `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      key: 'A',
      label: newColLabel.trim(),
      type: newColType,
    };

    updateActiveSheetLocal((curr) => {
      let targetIdx = curr.columns.length;
      if (newColPlacement === 'start') {
        targetIdx = 0;
      } else if (newColPlacement === 'left' && newColTargetColId) {
        const found = curr.columns.findIndex((c) => c.id === newColTargetColId);
        if (found !== -1) targetIdx = found;
      } else if (newColPlacement === 'right' && newColTargetColId) {
        const found = curr.columns.findIndex((c) => c.id === newColTargetColId);
        if (found !== -1) targetIdx = found + 1;
      }

      const nextCols = [...curr.columns];
      nextCols.splice(targetIdx, 0, newCol);
      const reindexedCols = nextCols.map((c, idx) => ({
        ...c,
        key: indexToColumnLetter(idx),
      }));

      return {
        ...curr,
        columns: reindexedCols,
        rows: curr.rows.map((r) => ({
          ...r,
          cells: {
            ...r.cells,
            [newCol.id]: newColType === 'currency' || newColType === 'number' ? '0' : '',
          },
        })),
      };
    });

    setNewColLabel('');
    setAddColOpen(false);
    onNotify?.(`Added column "${newCol.label}" ✓`);
  };

  const openAddColModal = (
    placement: 'end' | 'start' | 'left' | 'right' = 'end',
    refColId?: string,
  ) => {
    setNewColLabel('');
    setNewColType('text');
    setNewColPlacement(placement);
    setNewColTargetColId(refColId || activeSheet?.columns[0]?.id || '');
    setAddColOpen(true);
  };

  // Helper to commit & auto-save parsed Excel/CSV previews to SQLite + localStorage
  const commitExcelSheetsToWorkbook = async (
    previewsToCommit: ParsedExcelSheetPreview[],
    fileNameForTab: string,
    mode: 'new_tabs' | 'append_current' | 'replace_current',
    targetScope: Scope,
    closeModalOnSuccess = true,
  ) => {
    const selectedPreviews = previewsToCommit.filter((p) => p.selected);
    if (selectedPreviews.length === 0) {
      onNotify?.('Select at least one worksheet to import.', 'err');
      return;
    }

    setImportBusy(true);
    setSaving(true);
    setLastSavedLabel('Auto-saving Excel import...');
    try {
      const cleanBaseFileName = fileNameForTab.replace(/\.[^.]+$/, '').trim() || 'Imported Excel';

      if (mode === 'new_tabs') {
        const createdList: JobSheetRecord[] = [];
        for (let i = 0; i < selectedPreviews.length; i++) {
          const p = selectedPreviews[i];
          const isGenericSheetName = /^sheet\d*$/i.test(p.sheetName.trim());
          const resolvedTabName =
            selectedPreviews.length === 1 && isGenericSheetName
              ? cleanBaseFileName
              : isGenericSheetName
                ? `${cleanBaseFileName} · ${p.sheetName}`
                : p.sheetName || cleanBaseFileName;

          const built = buildSheetFromImportedMatrix(
            resolvedTabName,
            p.matrix,
            targetScope,
            i % 2 === 0 ? 'emerald' : 'gold',
          );

          try {
            const saved = await api.createJobSheet({
              name: built.name,
              scope: built.scope,
              color: built.color,
              columns: built.columns,
              rows: built.rows,
              settings: built.settings,
              orderIndex: sheets.length + i,
            });
            createdList.push(saved);
          } catch {
            // Fallback local record if offline/server unreachable so upload is NEVER lost
            const fallbackRecord: JobSheetRecord = {
              id: `sheet_imp_${Date.now()}_${i}`,
              name: built.name,
              scope: built.scope,
              color: built.color,
              columns: built.columns,
              rows: built.rows,
              settings: built.settings,
              orderIndex: sheets.length + i,
              createdAt: todayISO(),
              updatedAt: new Date().toISOString(),
            };
            createdList.push(fallbackRecord);
          }
        }

        setSheets((prev) => {
          const next = [...prev, ...createdList];
          writeCachedSheets(next);
          return next;
        });

        if (createdList.length > 0) {
          setActiveSheetId(createdList[0].id);
        }

        const totalImportedRows = createdList.reduce((acc, s) => acc + s.rows.length, 0);
        const msg = `Imported & auto-saved "${createdList[0]?.name}" (${totalImportedRows} rows) ✓`;
        setImportSavedMessage(msg);
        setLastSavedLabel('Auto-saved ✓');
        onNotify?.(msg);
      } else if (mode === 'replace_current' && activeSheet) {
        const first = selectedPreviews[0];
        const built = buildSheetFromImportedMatrix(
          activeSheet.name,
          first.matrix,
          activeSheet.scope,
          activeSheet.color,
        );
        const updatedSheet: JobSheetRecord = {
          ...activeSheet,
          columns: built.columns,
          rows: built.rows,
          settings: built.settings,
          updatedAt: new Date().toISOString(),
        };
        await persistSheet(updatedSheet, false);
        const msg = `Replaced & auto-saved "${activeSheet.name}" (${built.rows.length} rows) ✓`;
        setImportSavedMessage(msg);
        onNotify?.(msg);
      } else if (mode === 'append_current' && activeSheet) {
        const first = selectedPreviews[0];
        const built = buildSheetFromImportedMatrix(
          activeSheet.name,
          first.matrix,
          activeSheet.scope,
          activeSheet.color,
        );
        const nextColumns = [...activeSheet.columns];
        built.columns.forEach((impCol, cIdx) => {
          if (!nextColumns[cIdx]) {
            nextColumns.push({
              ...impCol,
              key: indexToColumnLetter(nextColumns.length),
            });
          }
        });

        const appendedRows: SheetRow[] = built.rows.map((impRow, rIdx) => {
          const mappedCells: Record<string, string> = {};
          built.columns.forEach((impCol, cIdx) => {
            const targetCol = nextColumns[cIdx];
            if (targetCol) {
              mappedCells[targetCol.id] = impRow.cells[impCol.id] ?? '';
            }
          });
          return {
            id: `row_app_${Date.now()}_${rIdx}`,
            cells: mappedCells,
          };
        });

        const updatedSheet: JobSheetRecord = {
          ...activeSheet,
          columns: nextColumns,
          rows: [...activeSheet.rows, ...appendedRows],
          updatedAt: new Date().toISOString(),
        };
        await persistSheet(updatedSheet, false);
        const msg = `Appended & auto-saved ${appendedRows.length} rows to "${activeSheet.name}" ✓`;
        setImportSavedMessage(msg);
        onNotify?.(msg);
      }

      if (closeModalOnSuccess) {
        setImportModalOpen(false);
        setExcelPreviews([]);
        setImportedFileName('');
      }
    } catch {
      onNotify?.('Failed to import Excel file', 'err');
    } finally {
      setImportBusy(false);
      setSaving(false);
    }
  };

  // Bounded RFC-4180 CSV / TSV parser for safe offline spreadsheet imports
  const parseDelimitedMatrix = (text: string, delimiter: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        if (rows.length >= 5000) break;
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };

  // Excel (.xlsx) & CSV/TSV File Upload Parser — bounded & CVE-free, auto-saves upon upload
  const processUploadedExcelFile = async (file: File) => {
    const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_IMPORT_BYTES) {
      onNotify?.('File exceeds 10 MB safety limit. Please split or compress the workbook.', 'err');
      return;
    }
    setImportedFileName(file.name);
    setImportSavedMessage('');
    try {
      const lower = file.name.toLowerCase();
      const previews: ParsedExcelSheetPreview[] = [];

      if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        const text = await file.text();
        const matrix = parseDelimitedMatrix(text, lower.endsWith('.tsv') ? '\t' : ',');
        const nonEmpty = matrix
          .slice(0, 5000)
          .map((r) => r.slice(0, 60))
          .filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
        if (nonEmpty.length > 0) {
          const colCount = Math.max(...nonEmpty.map((r) => r.length));
          previews.push({
            sheetName: file.name.replace(/\.(csv|tsv)$/i, '').slice(0, 31) || 'Sheet 1',
            matrix: nonEmpty,
            rowCount: Math.max(1, nonEmpty.length - 1),
            colCount,
            selected: true,
          });
        }
      } else {
        const parsedSheets = await readXlsxFile(file);
        for (const s of parsedSheets) {
          const matrix = (s.data ?? []).slice(0, 5000).map((r) =>
            r.slice(0, 60).map((cell) => {
              if (cell === null || cell === undefined) return '';
              if (cell instanceof Date) return cell.toISOString().slice(0, 10);
              return String(cell);
            }),
          );
          const nonEmpty = matrix.filter((r) => r.some((c) => c.trim() !== ''));
          if (nonEmpty.length === 0) continue;
          const colCount = Math.max(...nonEmpty.map((r) => r.length));
          previews.push({
            sheetName: s.sheet || 'Sheet',
            matrix: nonEmpty,
            rowCount: Math.max(1, nonEmpty.length - 1),
            colCount,
            selected: true,
          });
        }
      }

      if (previews.length === 0) {
        onNotify?.('No data rows found in the selected Excel/CSV file.', 'err');
        return;
      }
      setExcelPreviews(previews);

      // Immediately auto-save the uploaded Excel file into the app so the user never loses it!
      await commitExcelSheetsToWorkbook(
        previews,
        file.name,
        importMode,
        importScope,
        true,
      );
    } catch {
      onNotify?.('Could not parse file. Please upload a valid .xlsx, .csv, or .tsv file.', 'err');
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await processUploadedExcelFile(file);
  };

  // Manual re-commit if needed
  const handleCommitExcelImport = async () => {
    await commitExcelSheetsToWorkbook(
      excelPreviews,
      importedFileName || 'Imported Excel',
      importMode,
      importScope,
      true,
    );
  };

  // Export Workbook / Active Sheet to Excel (.xlsx)
  const handleExportExcel = async () => {
    if (!activeSheet) return;
    try {
      const sheetConfigs = sheets.map((s, idx) => {
        const headerRow = s.columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const }));
        const dataRows = s.rows.map((row) =>
          s.columns.map((col) => {
            const raw = row.cells[col.id] ?? '';
            const val = raw.trim().startsWith('=') ? evaluateCellFormula(raw, s.columns, s.rows) : raw;
            return { value: String(val ?? '') };
          }),
        );
        const safeTabName =
          s.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet ${idx + 1}`;
        return {
          sheet: safeTabName,
          data: [headerRow, ...dataRows],
        };
      });
      await writeXlsxFile(sheetConfigs).toFile(`job-sheets-workbook-${todayISO()}.xlsx`);
      onNotify?.('Exported multi-tab Excel workbook (.xlsx) ✓');
    } catch {
      onNotify?.('Failed to export Excel workbook', 'err');
    }
  };

  // Export Active Tab as CSV (with CSV formula-injection neutralization)
  const handleExportCsv = () => {
    if (!activeSheet) return;
    const safeCsv = (val: unknown) => {
      const s = String(val ?? '');
      const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${neutralized.replace(/"/g, '""')}"`;
    };
    const headers = activeSheet.columns.map((c) => safeCsv(c.label)).join(',');
    const lines = activeSheet.rows.map((row) =>
      activeSheet.columns
        .map((col) => {
          const raw = row.cells[col.id] ?? '';
          const val = raw.trim().startsWith('=')
            ? evaluateCellFormula(raw, activeSheet.columns, activeSheet.rows)
            : raw;
          return safeCsv(val);
        })
        .join(','),
    );
    const csvContent = [headers, ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSheet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.(`Exported "${activeSheet.name}" to CSV ✓`);
  };

  const telemetry = useMemo(() => computeWorkbookTelemetry(sheets), [sheets]);
  const activeSheetSummary = useMemo(
    () => (activeSheet ? computeSheetSummary(activeSheet) : null),
    [activeSheet],
  );

  const displayedRows = useMemo(() => {
    if (!activeSheet) return [];
    const statusCol = activeSheet.columns.find((c) => c.type === 'status');
    let list = activeSheet.rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (statusFilter !== 'all' && statusCol) {
          const val = (row.cells[statusCol.id] ?? '').toLowerCase();
          if (val !== statusFilter.toLowerCase()) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return Object.values(row.cells).some((v) => String(v).toLowerCase().includes(q));
        }
        return true;
      });

    // If a newly added row is pinned for editing, extract it so it remains pinned at Row 1 on Page 1
    let pinnedEntry: { row: SheetRow; originalIndex: number } | null = null;
    if (pinnedRowId) {
      const pIdx = list.findIndex((item) => item.row.id === pinnedRowId);
      if (pIdx !== -1) {
        pinnedEntry = list[pIdx];
        list = list.filter((_, idx) => idx !== pIdx);
      }
    }

    if (sortOrder === 'latest_first') {
      list = [...list].reverse();
    } else if (sortColId && (sortOrder === 'col_asc' || sortOrder === 'col_desc')) {
      const targetCol = activeSheet.columns.find((c) => c.id === sortColId);
      const colType = targetCol?.type;
      list = [...list].sort((a, b) => {
        const valA = a.row.cells[sortColId] ?? '';
        const valB = b.row.cells[sortColId] ?? '';
        return compareSheetCells(valA, valB, colType, sortOrder === 'col_asc' ? 'asc' : 'desc');
      });
    }

    // Place pinned entry right at the top (Row 1, Page 1) for immediate editing
    if (pinnedEntry) {
      list = [pinnedEntry, ...list];
    }

    return list;
  }, [activeSheet, statusFilter, searchQuery, sortOrder, sortColId, pinnedRowId]);

  // Pagination Telemetry & Slices
  const totalRowsCount = displayedRows.length;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalRowsCount / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    if (pageSize === 'all') return displayedRows;
    const start = (safeCurrentPage - 1) * pageSize;
    return displayedRows.slice(start, start + pageSize);
  }, [displayedRows, safeCurrentPage, pageSize]);

  // Reset pagination page on active sheet, filter, search, or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeSheet?.id, statusFilter, searchQuery, pageSize]);

  // Autofocus DOM cell input when selectedCell or active page changes
  useEffect(() => {
    if (!selectedCell) return;
    const focusCell = () => {
      const el = document.querySelector<HTMLInputElement>(
        `input[data-cell="${selectedCell.rowIndex}-${selectedCell.colId}"]`
      );
      if (el && document.activeElement !== el) {
        el.focus();
        try {
          el.select();
        } catch {}
        return true;
      }
      return Boolean(el && document.activeElement === el);
    };

    if (!focusCell()) {
      const frameId = requestAnimationFrame(() => {
        if (!focusCell()) {
          const timerId = setTimeout(focusCell, 45);
          return () => clearTimeout(timerId);
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [selectedCell, safeCurrentPage]);

  const activeCellMeta = useMemo(() => {
    if (!activeSheet || !selectedCell) return null;
    const colIndex = activeSheet.columns.findIndex((c) => c.id === selectedCell.colId);
    const col = activeSheet.columns[colIndex];
    const row = activeSheet.rows[selectedCell.rowIndex];
    if (!col || !row) return null;
    const coord = `${indexToColumnLetter(colIndex)}${selectedCell.rowIndex + 1}`;
    const rawValue = row.cells[col.id] ?? '';
    const evaluatedValue = rawValue.trim().startsWith('=')
      ? evaluateCellFormula(rawValue, activeSheet.columns, activeSheet.rows)
      : rawValue;
    return {
      coord,
      col,
      rowIndex: selectedCell.rowIndex,
      rawValue,
      evaluatedValue,
    };
  }, [activeSheet, selectedCell]);

  if (loading && sheets.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-[#686E78] border-[#E6E1D6] bg-white">
        Loading Multi-Job Spreadsheet Workbook...
      </Card>
    );
  }

  return (
    <div className="space-y-3.5 animate-panel-in">
      {/* Mobile Content-First Quick Ribbon (< 768px) */}
      <div className="md:hidden flex items-center justify-between gap-2 rounded-xl bg-white border border-[#E6E1D6] p-2.5 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <div className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1 shrink-0">
            <span className="text-[10px] text-[#686E78] block">Active Sheet</span>
            <span className="font-semibold text-[#111318] text-xs truncate max-w-[120px] block">
              {activeSheet?.name || 'Sheet'}
            </span>
          </div>
          <div className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1 shrink-0">
            <span className="text-[10px] text-[#686E78] block">Rows</span>
            <span className="font-mono font-bold text-[#111318] text-xs">
              {activeSheet?.rows.length ?? 0}
            </span>
          </div>
          <div className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1 shrink-0">
            <span className="text-[10px] text-[#686E78] block">Tabs</span>
            <span className="font-mono font-bold text-[#111318] text-xs">
              {sheets.length}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileHeroOpen(!mobileHeroOpen)}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#111318] text-[#E5C158] px-2.5 py-1.5 text-xs font-semibold cursor-pointer shadow-2xs"
        >
          <span>{mobileHeroOpen ? 'Hide' : '📊 Telemetry'}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', mobileHeroOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Collapsible on Mobile, Full on Desktop */}
      <div className={cn(mobileHeroOpen ? 'block' : 'hidden md:block')}>
        {/* Compact, Collapsible & Data-Adaptive Top Bar + Optional 3D Card */}
        <SheetsHeroWorkstation
          telemetry={telemetry}
          activeSummary={activeSheetSummary}
          activeSheetId={activeSheet?.id ?? ''}
          saving={saving}
          lastSavedLabel={lastSavedLabel}
          onSelectSheet={(id) => setActiveSheetId(id)}
          onCreateNewTab={(tpl) => openNewTabModal(tpl)}
          onOpenImportExcel={() => {
            setExcelPreviews([]);
            setImportedFileName('');
            setImportSavedMessage('');
            setImportScope(
              globalScopeFilter !== 'all' ? globalScopeFilter : (activeSheet?.scope ?? 'business'),
            );
            setImportModalOpen(true);
          }}
        />
      </div>

      {/* 1. Sheet Cards Hub View OR Google Sheets Multi-Tab Workbook */}
      {sheetViewMode === 'hub' ? (
        <div className="space-y-4">
          {/* Hub Navigation and Search Header */}
          <div className="rounded-2xl border border-[#E6E1D6] bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-[#111318] flex items-center gap-2">
                  <LayoutGrid className="h-6 w-6 text-[#C59B27]" />
                  <span>Sheet Cards Hub</span>
                </h2>
                <p className="text-xs text-[#686E78] mt-0.5">
                  Select a sheet card to open. PIN-protected sheets remain securely sealed until unlocked.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeSheet && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenSheet(activeSheet)}
                    className="bg-[#FAF8F5] text-[#111318] hover:bg-[#111318] hover:text-[#E5C158] font-bold"
                  >
                    <span>Continue: {activeSheet.name}</span>
                    <FileSpreadsheet className="h-3.5 w-3.5 ml-1 text-[#C59B27]" />
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => openNewTabModal('job_tracker')}
                  className="bg-[#111318] text-[#E5C158] hover:bg-[#1E232D]"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> + New Sheet
                </Button>
              </div>
            </div>

            {/* Scope, Status & Search Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#E6E1D6]">
              <div className="flex flex-wrap items-center gap-2">
                {/* Scope filter pills */}
                <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] p-0.5 text-xs font-semibold">
                  {(['all', 'business', 'personal', 'family'] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setHubScopeFilter(sc)}
                      className={cn(
                        'px-2.5 py-1 rounded capitalize cursor-pointer transition-colors',
                        hubScopeFilter === sc ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                      )}
                    >
                      {sc === 'all' ? 'All Scopes' : sc}
                    </button>
                  ))}
                </div>

                {/* Active vs Archived filter */}
                <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSheetScopeFilter('active')}
                    className={cn(
                      'px-2.5 py-1 rounded cursor-pointer transition-colors',
                      sheetScopeFilter === 'active' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                    )}
                  >
                    Active ({sheets.filter((s) => !s.archived).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetScopeFilter('archived')}
                    className={cn(
                      'px-2.5 py-1 rounded cursor-pointer transition-colors',
                      sheetScopeFilter === 'archived' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                    )}
                  >
                    Archived ({sheets.filter((s) => Boolean(s.archived)).length})
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#686E78] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={hubSearchQuery}
                  onChange={(e) => setHubSearchQuery(e.target.value)}
                  placeholder="Search sheets or columns..."
                  className="h-8 w-48 sm:w-64 rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] pl-8 pr-2.5 text-xs text-[#111318] focus:bg-white focus:border-[#111318] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredHubSheets.map((sheet) => {
              const isLocked = Boolean(sheet.settings?.pinHash && !unlockedSheetIds.has(sheet.id));
              const colorMeta = TAB_COLOR_META[sheet.color] ?? TAB_COLOR_META.gold;

              return (
                <div
                  key={sheet.id}
                  onClick={() => handleOpenSheet(sheet)}
                  className="group relative rounded-2xl border border-[#E6E1D6] bg-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer hover:border-[#111318] min-h-[220px]"
                >
                  {/* Top Color Accent */}
                  <div className={cn('absolute top-0 left-0 right-0 h-1.5', colorMeta.dot)} />

                  <div>
                    {/* Card Header: Scope + Lock + Menu */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <ScopeBadge scope={sheet.scope} size="xs" />

                      <div className="flex items-center gap-1">
                        {sheet.settings?.pinHash ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                              isLocked
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            )}
                            title={isLocked ? 'Protected: PIN Required to open' : 'Unlocked for this session'}
                          >
                            {isLocked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                            <span>{isLocked ? 'Protected' : 'Unlocked'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[10px] text-[#686E78]">
                            <Unlock className="h-2.5 w-2.5 text-slate-400" />
                            <span>Open</span>
                          </span>
                        )}

                        {/* 3-dot menu */}
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setCardMenuOpenId(cardMenuOpenId === sheet.id ? null : sheet.id)}
                            className="p-1 rounded-lg text-[#686E78] hover:text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {cardMenuOpenId === sheet.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setCardMenuOpenId(null)} />
                              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-[#E6E1D6] bg-white p-1 shadow-lg text-xs space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardMenuOpenId(null);
                                    handleOpenSheet(sheet);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                >
                                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#059669]" /> Open Sheet
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardMenuOpenId(null);
                                    setPinSetupTarget(sheet);
                                    setNewPin('');
                                    setConfirmPin('');
                                    setPinHintInput(sheet.settings?.pinHint || '');
                                    setPinSetupError('');
                                    setPinSetupModalOpen(true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                >
                                  <Shield className="h-3.5 w-3.5 text-[#C59B27]" />
                                  <span>{sheet.settings?.pinHash ? 'Change / Remove PIN' : 'Set Protection PIN'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardMenuOpenId(null);
                                    void handleDuplicateTab(sheet);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                >
                                  <Copy className="h-3.5 w-3.5 text-[#686E78]" /> Duplicate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardMenuOpenId(null);
                                    handleArchiveSheet(sheet);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                >
                                  <Archive className="h-3.5 w-3.5 text-amber-600" />
                                  <span>{sheet.archived ? 'Restore Tab' : 'Archive Sheet'}</span>
                                </button>
                                {sheets.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCardMenuOpenId(null);
                                      setDeleteTabTarget(sheet);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete Sheet
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bold Title */}
                    <h3 className="text-lg font-black text-[#111318] group-hover:text-[#C59B27] transition-colors mt-2.5 truncate" title={sheet.name}>
                      {sheet.name}
                    </h3>

                    {/* Metrics */}
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#686E78]">
                      <span className="font-mono font-semibold text-[#111318]">{sheet.rows.length} rows</span>
                      <span>•</span>
                      <span>{sheet.columns.length} columns</span>
                    </div>

                    {/* Column Chips */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {sheet.columns.slice(0, 4).map((col) => (
                        <span
                          key={col.id}
                          className="rounded bg-[#FAF8F5] border border-[#E6E1D6] px-1.5 py-0.5 text-[10px] text-[#52504C] truncate max-w-[100px]"
                        >
                          {col.label}
                        </span>
                      ))}
                      {sheet.columns.length > 4 && (
                        <span className="rounded bg-[#FAF8F5] border border-[#E6E1D6] px-1.5 py-0.5 text-[10px] text-[#686E78]">
                          +{sheet.columns.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-[#E6E1D6] flex items-center justify-between">
                    <span className="text-[10px] text-[#686E78]">
                      {sheet.updatedAt ? new Date(sheet.updatedAt).toLocaleDateString() : 'Active'}
                    </span>

                    <Button
                      variant="secondary"
                      size="sm"
                      className={cn(
                        'font-bold transition-all',
                        isLocked
                          ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                          : 'bg-[#FAF8F5] text-[#111318] hover:bg-[#111318] hover:text-[#E5C158]'
                      )}
                    >
                      {isLocked ? (
                        <>
                          <Lock className="h-3 w-3 mr-1 text-rose-600" /> Unlock & Open
                        </>
                      ) : (
                        <>Open Sheet →</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* + Create New Sheet Card */}
            <div
              onClick={() => openNewTabModal('job_tracker')}
              className="rounded-2xl border-2 border-dashed border-[#D5CFBE] bg-[#FAF8F5]/60 hover:bg-white p-6 flex flex-col items-center justify-center text-center hover:border-[#111318] cursor-pointer transition-all min-h-[220px] group shadow-2xs"
            >
              <div className="h-12 w-12 rounded-full bg-white border border-[#E6E1D6] flex items-center justify-center text-[#111318] group-hover:bg-[#111318] group-hover:text-[#E5C158] transition-all shadow-2xs">
                <Plus className="h-6 w-6" />
              </div>
              <div className="mt-3 font-bold text-sm text-[#111318]">Create New Sheet</div>
              <div className="text-[11px] text-[#686E78] mt-1 max-w-[180px]">
                Job tracker, client billing, or blank custom spreadsheet
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Google Sheets Multi-Tab Workbook Container */
        <div className="rounded-2xl border border-[#E6E1D6] bg-white shadow-[0_14px_36px_-18px_rgba(17,19,24,0.12)] overflow-hidden">
          {/* Bold and Bigger Sheet Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border-b border-[#E6E1D6]">
            {/* Left: Back to Cards Hub + Bold Title + Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSheetViewMode('hub');
                  try { localStorage.setItem('sc_sheets_view_mode', 'hub'); } catch {}
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-[#111318] hover:bg-white hover:border-[#111318] cursor-pointer shadow-2xs transition-all shrink-0"
                title="Back to All Sheets (Cards Hub)"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <LayoutGrid className="h-3.5 w-3.5 text-[#C59B27]" />
                <span className="hidden sm:inline">Cards Hub</span>
              </button>

              <div className="h-5 w-px bg-[#E6E1D6] hidden sm:block" />

              {/* Bold and Bigger Title */}
              {activeSheet && (
                renamingTabId === activeSheet.id ? (
                  <input
                    type="text"
                    value={renameTabDraft}
                    onChange={(e) => setRenameTabDraft(e.target.value)}
                    onBlur={() => commitTabRename(activeSheet.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTabRename(activeSheet.id);
                      if (e.key === 'Escape') setRenamingTabId(null);
                    }}
                    autoFocus
                    className="text-xl sm:text-2xl font-black text-[#111318] border-b-2 border-[#C59B27] bg-transparent focus:outline-none px-1"
                  />
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1
                      className="text-xl sm:text-2xl font-black text-[#111318] tracking-tight cursor-pointer"
                      title="Click to rename sheet"
                      onClick={() => {
                        setRenamingTabId(activeSheet.id);
                        setRenameTabDraft(activeSheet.name);
                      }}
                    >
                      {activeSheet.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingTabId(activeSheet.id);
                        setRenameTabDraft(activeSheet.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#686E78] hover:text-[#111318] rounded cursor-pointer transition-opacity"
                      title="Rename Sheet"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              )}

              {activeSheet && (
                <>
                  {/* Scope Tag */}
                  <ScopeBadge scope={activeSheet.scope} size="xs" />

                  {/* PIN Lock / Set PIN button */}
                  {activeSheet.settings?.pinHash ? (
                    <button
                      type="button"
                      onClick={handleLockActiveSheet}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer transition-colors shadow-2xs"
                      title="Lock sheet with PIN and return to Cards Hub"
                    >
                      <Lock className="h-3 w-3" />
                      <span>Lock Sheet</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPinSetupTarget(activeSheet);
                        setNewPin('');
                        setConfirmPin('');
                        setPinHintInput(activeSheet.settings?.pinHint || '');
                        setPinSetupError('');
                        setPinSetupModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-0.5 text-xs font-semibold text-[#686E78] hover:text-[#111318] hover:bg-[#F3EFEA] cursor-pointer transition-colors"
                      title="Optional: Add PIN protection to seal this sheet"
                    >
                      <Shield className="h-3 w-3 text-slate-500" />
                      <span>Set PIN</span>
                    </button>
                  )}

                  <span className="text-xs text-[#686E78] font-mono hidden md:inline">
                    ({activeSheet.rows.length} rows · {activeSheet.columns.length} cols)
                  </span>
                </>
              )}
            </div>

            {/* Right: View Mode Toggle */}
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setSheetViewMode('hub');
                    try { localStorage.setItem('sc_sheets_view_mode', 'hub'); } catch {}
                  }}
                  className="px-2.5 py-1 rounded text-[#686E78] hover:text-[#111318] cursor-pointer flex items-center gap-1"
                >
                  <LayoutGrid className="h-3 w-3" />
                  <span>Cards Hub</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetViewMode('table');
                    try { localStorage.setItem('sc_sheets_view_mode', 'table'); } catch {}
                  }}
                  className="px-2.5 py-1 rounded bg-[#111318] text-[#E5C158] font-bold cursor-pointer flex items-center gap-1"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  <span>Table</span>
                </button>
              </div>
            </div>
          </div>

          {/* 1. Tab Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF8F5] border-b border-[#E6E1D6] px-3 pt-2 pb-0">
            <div role="tablist" aria-label="Job Workbook Sheet Tabs" className="flex items-center gap-1 overflow-x-auto max-w-full pb-0">
              {visibleSheets.map((sheet) => {
                const isActive = activeSheet?.id === sheet.id;
                const isDirty = dirtySheetIds.has(sheet.id);
                const colorMeta = TAB_COLOR_META[sheet.color] ?? TAB_COLOR_META.gold;
                const isLocked = Boolean(sheet.settings?.pinHash && !unlockedSheetIds.has(sheet.id));

                return (
                  <div
                    key={sheet.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      if (isLocked) {
                        setPinUnlockTarget(sheet);
                        setEnteredPin('');
                        setPinError('');
                        setPinUnlockModalOpen(true);
                        return;
                      }
                      setActiveSheetId(sheet.id);
                    }}
                    onDoubleClick={() => {
                      setRenamingTabId(sheet.id);
                      setRenameTabDraft(sheet.name);
                    }}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-t-xl border border-b-0 px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer select-none shrink-0',
                      isActive
                        ? `bg-white text-[#111318] border-[#E6E1D6] shadow-[0_-2px_8px_rgba(17,19,24,0.04)] ${colorMeta.activeBorder}`
                        : 'bg-[#F3EFEA]/80 text-[#52504C] border-transparent hover:bg-white/70 hover:text-[#111318]',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', colorMeta.dot)} />

                    {sheet.settings?.pinHash && (
                      <span title={isLocked ? 'Protected by PIN (Locked)' : 'PIN Unlocked'}>
                        <Lock
                          className={cn('h-2.5 w-2.5 shrink-0', isLocked ? 'text-rose-500' : 'text-emerald-600')}
                        />
                      </span>
                    )}

                    {renamingTabId === sheet.id ? (
                      <input
                        type="text"
                        value={renameTabDraft}
                        onChange={(e) => setRenameTabDraft(e.target.value)}
                        onBlur={() => commitTabRename(sheet.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitTabRename(sheet.id);
                          if (e.key === 'Escape') setRenamingTabId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-36 rounded border border-[#C59B27] bg-white px-1.5 py-0.5 text-xs font-semibold text-[#111318] focus:outline-none"
                      />
                    ) : (
                      <span className="truncate max-w-[180px]" title="Double-click to rename tab">
                        {sheet.name}
                      </span>
                    )}

                    <span className="rounded bg-[#FAF8F5] border border-[#E6E1D6] px-1.5 py-0.2 text-[10px] font-mono text-[#686E78]">
                      {sheet.rows.length}r
                    </span>

                    {isDirty && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Auto-saving..." />
                    )}

                    {isActive && renamingTabId !== sheet.id && (
                      <div className="flex items-center gap-0.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingTabId(sheet.id);
                            setRenameTabDraft(sheet.name);
                          }}
                          className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer"
                          title="Rename Tab"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateTab(sheet)}
                          className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer"
                          title="Duplicate Tab"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveSheet(sheet)}
                          className="rounded p-0.5 text-[#686E78] hover:bg-amber-50 hover:text-[#C59B27] cursor-pointer"
                          title={sheet.archived ? "Restore Tab from Archive" : "Archive Tab"}
                        >
                          {sheet.archived ? <ArchiveRestore className="h-3 w-3 text-emerald-600" /> : <Archive className="h-3 w-3" />}
                        </button>
                        {sheets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeleteTabTarget(sheet)}
                            className="rounded p-0.5 text-[#686E78] hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                            title="Delete Tab"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => openNewTabModal('job_tracker')}
                className="mb-1 ml-1 inline-flex items-center gap-1 rounded-lg bg-[#111318] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1E232D] cursor-pointer shrink-0 shadow-2xs"
                title="Add a new sheet tab"
              >
                <Plus className="h-3.5 w-3.5 text-[#E5C158]" />
                <span>+ New Tab</span>
              </button>

              <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-white p-0.5 text-[11px] font-semibold shrink-0 mb-1 ml-1">
                <button
                  type="button"
                  onClick={() => setSheetScopeFilter('active')}
                  className={cn(
                    'px-2 py-0.5 rounded cursor-pointer transition-colors',
                    sheetScopeFilter === 'active' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                  )}
                >
                  Active ({sheets.filter((s) => !s.archived).length})
                </button>
                <button
                  type="button"
                  onClick={() => setSheetScopeFilter('archived')}
                  className={cn(
                    'px-2 py-0.5 rounded cursor-pointer transition-colors',
                    sheetScopeFilter === 'archived' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                  )}
                >
                  Archived ({sheets.filter((s) => Boolean(s.archived)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setSheetScopeFilter('all')}
                  className={cn(
                    'px-2 py-0.5 rounded cursor-pointer transition-colors',
                    sheetScopeFilter === 'all' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                  )}
                >
                  All
                </button>
              </div>
            </div>
          </div>

          {/* If Active Sheet is Protected and Locked: Display Barrier Screen! */}
          {activeSheet && activeSheet.settings?.pinHash && !unlockedSheetIds.has(activeSheet.id) ? (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white space-y-4 my-8">
              <div className="h-16 w-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-sm">
                <Lock className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#111318]">Sheet Sealed Behind PIN Barrier</h2>
                <p className="text-sm text-[#686E78] max-w-md">
                  "{activeSheet.name}" contains protected data. Please enter your PIN to unlock and view spreadsheet records.
                </p>
                {activeSheet.settings?.pinHint && (
                  <p className="text-xs text-[#8C6D1F] italic pt-1">
                    Hint: {activeSheet.settings.pinHint}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setSheetViewMode('hub')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1.5" /> Return to Cards Hub
                </Button>
                <Button
                  onClick={() => {
                    setPinUnlockTarget(activeSheet);
                    setEnteredPin('');
                    setPinError('');
                    setPinUnlockModalOpen(true);
                  }}
                  className="bg-[#111318] text-[#E5C158] hover:bg-[#1E232D]"
                >
                  <KeyRound className="h-4 w-4 mr-1.5" /> Enter PIN to Unlock
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Streamlined Single-Row Toolbar */}
              {activeSheet && (
                <div className="border-b border-[#E6E1D6] bg-white p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Left: Undo, Redo, Sort Center, Search, Status Filter */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Undo / Redo */}
                      <div className="flex items-center rounded-lg border border-[#E6E1D6] bg-white p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#FAF8F5] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          title="Undo last change (Ctrl+Z)"
                        >
                          <Undo2 className="h-3.5 w-3.5 text-[#686E78]" />
                          <span className="hidden sm:inline">Undo</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRedo}
                          disabled={redoStack.length === 0}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#FAF8F5] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          title="Redo last change (Ctrl+Y or Ctrl+Shift+Z)"
                        >
                          <Redo2 className="h-3.5 w-3.5 text-[#686E78]" />
                          <span className="hidden sm:inline">Redo</span>
                        </button>
                      </div>

                      {/* Centralized Sort Center Popover */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setSortCenterOpen(!sortCenterOpen)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors',
                            sortOrder !== 'normal' || sortColId !== null
                              ? 'bg-[#111318] text-[#E5C158] border-[#111318] shadow-2xs'
                              : 'bg-[#FAF8F5] text-[#686E78] border-[#E6E1D6] hover:text-[#111318]',
                          )}
                          title="Configure Sorting: Presets, Last Column First, or Column-Specific Sort"
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          <span>
                            {sortColId
                              ? `Sort: Col ${activeSheet.columns.find((c) => c.id === sortColId)?.key || ''} (${sortOrder === 'col_asc' ? '▲ A→Z' : '▼ Z→A'})`
                              : sortOrder === 'latest_first'
                                ? 'Sort: Newest First'
                                : 'Sort Center'}
                          </span>
                          <ChevronDown className="h-3 w-3" />
                        </button>

                        {sortCenterOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setSortCenterOpen(false)} />
                            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-[#E6E1D6] bg-white p-3 shadow-xl text-xs space-y-3">
                              <div className="flex items-center justify-between pb-1 border-b border-[#E6E1D6]">
                                <span className="font-bold text-[#111318]">Sheet Sorting Center</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortColId(null);
                                    setSortOrder('normal');
                                    setPinnedRowId(null);
                                    try { localStorage.setItem('sc_sheets_sort_order', 'normal'); } catch {}
                                    setSortCenterOpen(false);
                                    onNotify?.('Reset to Original Table Order');
                                  }}
                                  className="text-[10px] text-[#8C6D1F] hover:underline cursor-pointer font-semibold"
                                >
                                  Clear Sort
                                </button>
                              </div>

                              {/* Quick Presets */}
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase text-[#686E78]">Quick Presets</div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortColId(null);
                                    setSortOrder('normal');
                                    try { localStorage.setItem('sc_sheets_sort_order', 'normal'); } catch {}
                                    setSortCenterOpen(false);
                                    onNotify?.('Reset to Original Table Order (Row 1..N)');
                                  }}
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-medium cursor-pointer',
                                    sortOrder === 'normal' && !sortColId ? 'bg-[#FAF8F5] text-[#111318] font-bold' : 'hover:bg-[#FAF8F5] text-[#52504C]'
                                  )}
                                >
                                  <span>Original Order (Row 1..N)</span>
                                  {sortOrder === 'normal' && !sortColId && <Check className="h-3 w-3 text-[#059669]" />}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortColId(null);
                                    setSortOrder('latest_first');
                                    try { localStorage.setItem('sc_sheets_sort_order', 'latest_first'); } catch {}
                                    setSortCenterOpen(false);
                                    onNotify?.('Fast Entry: Newest Rows First (Row N..1)');
                                  }}
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-medium cursor-pointer',
                                    sortOrder === 'latest_first' ? 'bg-[#FAF8F5] text-[#111318] font-bold' : 'hover:bg-[#FAF8F5] text-[#52504C]'
                                  )}
                                >
                                  <span>Fast Entry: Newest Rows First</span>
                                  {sortOrder === 'latest_first' && <Check className="h-3 w-3 text-[#059669]" />}
                                </button>

                                {activeSheet.columns.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const lastCol = activeSheet.columns[activeSheet.columns.length - 1];
                                      setSortColId(lastCol.id);
                                      setSortOrder('col_desc');
                                      setSortCenterOpen(false);
                                      onNotify?.(`Sorted by Last Column (${lastCol.key} · ${lastCol.label}) Descending ✓`);
                                    }}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-medium cursor-pointer',
                                      sortColId === activeSheet.columns[activeSheet.columns.length - 1].id && sortOrder === 'col_desc'
                                        ? 'bg-[#FAF8F5] text-[#111318] font-bold'
                                        : 'hover:bg-[#FAF8F5] text-[#52504C]'
                                    )}
                                  >
                                    <span>Last Column First ({activeSheet.columns[activeSheet.columns.length - 1].label} ↓)</span>
                                    {sortColId === activeSheet.columns[activeSheet.columns.length - 1].id && sortOrder === 'col_desc' && (
                                      <Check className="h-3 w-3 text-[#059669]" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {/* Column Specific Sort */}
                              <div className="space-y-1.5 pt-2 border-t border-[#E6E1D6]">
                                <div className="text-[10px] font-bold uppercase text-[#686E78]">Sort by Specific Column</div>
                                <div className="space-y-1.5">
                                  <select
                                    value={sortColId || activeSheet.columns[0]?.id || ''}
                                    onChange={(e) => setSortColId(e.target.value)}
                                    className="w-full h-7 rounded border border-[#E6E1D6] bg-[#FAF8F5] px-2 text-xs text-[#111318]"
                                  >
                                    {activeSheet.columns.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        Column {c.key} · {c.label} ({c.type})
                                      </option>
                                    ))}
                                  </select>

                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const targetId = sortColId || activeSheet.columns[0]?.id;
                                        if (!targetId) return;
                                        setSortColId(targetId);
                                        setSortOrder('col_asc');
                                        setSortCenterOpen(false);
                                        const c = activeSheet.columns.find((col) => col.id === targetId);
                                        onNotify?.(`Sorted ${c?.label || ''} (Ascending A→Z / 1→9) ✓`);
                                      }}
                                      className={cn(
                                        'rounded border py-1 px-1.5 text-center text-xs font-semibold cursor-pointer',
                                        sortOrder === 'col_asc' ? 'bg-[#111318] text-[#E5C158] border-[#111318]' : 'bg-[#FAF8F5] border-[#E6E1D6] text-[#52504C]'
                                      )}
                                    >
                                      ▲ Ascending (A→Z)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const targetId = sortColId || activeSheet.columns[0]?.id;
                                        if (!targetId) return;
                                        setSortColId(targetId);
                                        setSortOrder('col_desc');
                                        setSortCenterOpen(false);
                                        const c = activeSheet.columns.find((col) => col.id === targetId);
                                        onNotify?.(`Sorted ${c?.label || ''} (Descending Z→A / 9→1) ✓`);
                                      }}
                                      className={cn(
                                        'rounded border py-1 px-1.5 text-center text-xs font-semibold cursor-pointer',
                                        sortOrder === 'col_desc' ? 'bg-[#111318] text-[#E5C158] border-[#111318]' : 'bg-[#FAF8F5] border-[#E6E1D6] text-[#52504C]'
                                      )}
                                    >
                                      ▼ Descending (Z→A)
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Filter rows search */}
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-[#686E78] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter rows..."
                          className="h-8 w-28 sm:w-36 rounded-lg border border-[#E6E1D6] bg-[#FAF8F5] pl-8 pr-2.5 text-xs text-[#111318] focus:bg-white focus:border-[#111318] focus:outline-none"
                        />
                      </div>

                      {/* Status select */}
                      <Select
                        aria-label="Filter by status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-28 sm:w-32 h-8 text-xs"
                      >
                        <option value="all">All Statuses</option>
                        {activeStatusOptions.map((st) => (
                          <option key={st.label} value={st.label}>
                            {st.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Right: + Row, + Column, Mobile View Switcher, ⚙ Sheet Options */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Positional + Row Split Button */}
                      <div className="relative inline-flex items-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const defPos = (sortOrder === 'latest_first' || sortColId !== null) ? 'top' : 'bottom';
                            handleAddRow(defPos);
                          }}
                          className="rounded-r-none border-r-0"
                          title={`Add row ${sortOrder === 'latest_first' || sortColId !== null ? 'at top (Fast Entry)' : 'at bottom'}`}
                        >
                          <Plus className="h-3.5 w-3.5 text-[#059669]" /> + Row
                        </Button>
                        <button
                          type="button"
                          onClick={() => setRowMenuOpen(!rowMenuOpen)}
                          className="inline-flex h-8 items-center justify-center rounded-r-lg border border-[#E6E1D6] bg-white px-1.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer"
                          title="Choose where to add row"
                          aria-label="Row placement options"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>

                        {rowMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setRowMenuOpen(false)} />
                            <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-[#E6E1D6] bg-white p-1.5 shadow-lg text-xs space-y-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  handleAddRow('top');
                                  setRowMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                              >
                                <ArrowUp className="h-3.5 w-3.5 text-[#059669]" />
                                <div>
                                  <div>+ Add on Top (Row 1)</div>
                                  <div className="text-[10px] text-[#686E78] font-normal">Fast entry at sheet start</div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  handleAddRow('bottom');
                                  setRowMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                              >
                                <ArrowDown className="h-3.5 w-3.5 text-[#8C6D1F]" />
                                <div>
                                  <div>+ Add at Bottom (End)</div>
                                  <div className="text-[10px] text-[#686E78] font-normal">Append at end of sheet</div>
                                </div>
                              </button>

                              {selectedCell && (
                                <>
                                  <div className="my-1 border-t border-[#E6E1D6]" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleAddRow('above', selectedCell.rowIndex);
                                      setRowMenuOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                                    <div>
                                      <div>+ Insert Above Row #{selectedCell.rowIndex + 1}</div>
                                      <div className="text-[10px] text-[#686E78] font-normal">Before selected row</div>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleAddRow('below', selectedCell.rowIndex);
                                      setRowMenuOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                                    <div>
                                      <div>+ Insert Below Row #{selectedCell.rowIndex + 1}</div>
                                      <div className="text-[10px] text-[#686E78] font-normal">After selected row</div>
                                    </div>
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* + Column */}
                      <Button variant="secondary" size="sm" onClick={() => openAddColModal('end')}>
                        <Columns className="h-3.5 w-3.5 text-[#8C6D1F]" /> + Column
                      </Button>

                      {/* ↔ Auto-Fit All Columns */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAutoFitAllColumns}
                        title="Auto-adjust all column widths dynamically based on content length"
                        className="border-[#E6E1D6] hover:border-[#111318]"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#C59B27]" />
                        <span className="hidden sm:inline">Auto-Fit</span>
                        <span className="sm:hidden">Fit</span>
                      </Button>

                      {/* Mobile View Mode Switcher */}
                      <div className="flex md:hidden items-center rounded-lg border border-[#E6E1D6] bg-white p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMobileViewMode('table')}
                          className={cn(
                            'px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors',
                            mobileViewMode === 'table' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                          )}
                        >
                          Table
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileViewMode('cards')}
                          className={cn(
                            'px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors',
                            mobileViewMode === 'cards' ? 'bg-[#111318] text-[#E5C158]' : 'text-[#686E78] hover:text-[#111318]'
                          )}
                        >
                          Cards
                        </button>
                      </div>

                      {/* ⚙ SHEET OPTIONS DROPDOWN MENU */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setSheetMenuOpen(!sheetMenuOpen)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors shadow-2xs',
                            sheetMenuOpen
                              ? 'bg-[#111318] text-[#E5C158] border-[#111318]'
                              : 'bg-[#FAF8F5] text-[#111318] border-[#E6E1D6] hover:bg-white hover:border-[#111318]',
                          )}
                          title="Configure Scope, Tab Color, Custom Statuses, Totals, Auto-Default, PIN, Import/Export"
                        >
                          <Settings className="h-3.5 w-3.5 text-[#C59B27]" />
                          <span>Sheet Options</span>
                          <ChevronDown className={cn('h-3 w-3 transition-transform', sheetMenuOpen && 'rotate-180')} />
                        </button>

                        {sheetMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setSheetMenuOpen(false)} />
                            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-2xl border border-[#E6E1D6] bg-white p-3.5 shadow-2xl text-xs space-y-3 animate-in fade-in zoom-in-95">
                              {/* Header */}
                              <div className="flex items-center justify-between pb-2 border-b border-[#E6E1D6]">
                                <div className="font-bold text-[#111318] flex items-center gap-1.5">
                                  <Settings className="h-4 w-4 text-[#C59B27]" />
                                  <span>Sheet Configuration</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSheetMenuOpen(false)}
                                  className="p-1 text-[#686E78] hover:text-[#111318] rounded"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* 1. Scope Selector */}
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Sheet Scope</span>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {(['business', 'personal', 'family'] as const).map((sc) => (
                                    <button
                                      key={sc}
                                      type="button"
                                      onClick={() => updateActiveSheetLocal((curr) => ({ ...curr, scope: sc }))}
                                      className={cn(
                                        'rounded-lg py-1 px-2 text-center text-xs font-semibold capitalize cursor-pointer border transition-colors',
                                        activeSheet.scope === sc
                                          ? 'bg-[#111318] text-[#E5C158] border-[#111318]'
                                          : 'bg-[#FAF8F5] text-[#52504C] border-[#E6E1D6] hover:bg-white'
                                      )}
                                    >
                                      {sc}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 2. Tab Accent Color */}
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Tab Accent Color</span>
                                <div className="flex items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2">
                                  {(['gold', 'emerald', 'obsidian', 'rose', 'slate'] as const).map((colKey) => (
                                    <button
                                      key={colKey}
                                      type="button"
                                      onClick={() => updateActiveSheetLocal((curr) => ({ ...curr, color: colKey }))}
                                      title={TAB_COLOR_META[colKey].label}
                                      className={cn(
                                        'h-5 w-5 rounded-full cursor-pointer transition-transform',
                                        TAB_COLOR_META[colKey].dot,
                                        activeSheet.color === colKey && 'ring-2 ring-offset-2 ring-[#111318] scale-125'
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* 3. Automation & Status Tools */}
                              <div className="space-y-2 pt-2 border-t border-[#E6E1D6]">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Sheet Automation</span>

                                {/* Auto-Default Same Toggle */}
                                <div className="flex items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2.5">
                                  <div>
                                    <div className="font-semibold text-[#111318]">Auto-Default Same</div>
                                    <div className="text-[10px] text-[#686E78]">New rows keep previous row's values</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAutoDefaultSame((prev) => {
                                        const next = !prev;
                                        try { localStorage.setItem('sc_sheets_auto_default', String(next)); } catch {}
                                        onNotify?.(next ? 'Auto-Default: ON' : 'Auto-Default: OFF');
                                        return next;
                                      });
                                    }}
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors',
                                      autoDefaultSame ? 'bg-[#059669] text-white' : 'bg-slate-200 text-slate-700'
                                    )}
                                  >
                                    {autoDefaultSame ? 'ON' : 'OFF'}
                                  </button>
                                </div>

                                {/* Column Totals Toggle */}
                                <div className="flex items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2.5">
                                  <div>
                                    <div className="font-semibold text-[#111318]">Σ Column Totals Row</div>
                                    <div className="text-[10px] text-[#686E78]">Show sums at bottom of numbers</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleToggleTotals}
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors',
                                      showTotals ? 'bg-[#059669] text-white' : 'bg-slate-200 text-slate-700'
                                    )}
                                  >
                                    {showTotals ? 'ON' : 'OFF'}
                                  </button>
                                </div>

                                 {/* Auto-Fit All Columns Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSheetMenuOpen(false);
                                    handleAutoFitAllColumns();
                                  }}
                                  className="flex w-full items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2.5 font-semibold text-[#111318] hover:bg-white hover:border-[#111318] cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-[#C59B27]" />
                                    <div className="text-left">
                                      <div className="font-semibold text-[#111318]">Auto-Fit All Columns</div>
                                      <div className="text-[10px] text-[#686E78]">Adjust widths dynamically to fit cell content</div>
                                    </div>
                                  </div>
                                  <span className="rounded bg-white border border-[#E6E1D6] px-1.5 py-0.5 text-[10px] font-mono">
                                    ↔ Fit
                                  </span>
                                </button>

                                {/* Custom Statuses Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSheetMenuOpen(false);
                                    setPendingStatusCellTarget(null);
                                    setStatusModalOpen(true);
                                  }}
                                  className="flex w-full items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2.5 font-semibold text-[#111318] hover:bg-white hover:border-[#111318] cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-[#C59B27]" />
                                    <div className="text-left">
                                      <div className="font-semibold text-[#111318]">Sheet Status Palette</div>
                                      <div className="text-[10px] text-[#686E78]">Isolated to "{activeSheet.name}"</div>
                                    </div>
                                  </div>
                                  <span className="rounded bg-white border border-[#E6E1D6] px-1.5 py-0.5 text-[10px] font-mono">
                                    {activeStatusOptions.length}
                                  </span>
                                </button>
                              </div>

                              {/* 4. PIN Protection Barrier */}
                              <div className="space-y-1.5 pt-2 border-t border-[#E6E1D6]">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Privacy & Security Barrier</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSheetMenuOpen(false);
                                    setPinSetupTarget(activeSheet);
                                    setNewPin('');
                                    setConfirmPin('');
                                    setPinHintInput(activeSheet.settings?.pinHint || '');
                                    setPinSetupError('');
                                    setPinSetupModalOpen(true);
                                  }}
                                  className="flex w-full items-center justify-between rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-2.5 text-left hover:bg-white hover:border-[#111318] cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    {activeSheet.settings?.pinHash ? (
                                      <Lock className="h-4 w-4 text-rose-600" />
                                    ) : (
                                      <Shield className="h-4 w-4 text-[#686E78]" />
                                    )}
                                    <div>
                                      <div className="font-semibold text-[#111318]">
                                        {activeSheet.settings?.pinHash ? 'PIN Protection Active' : 'Set PIN Protection'}
                                      </div>
                                      <div className="text-[10px] text-[#686E78]">
                                        {activeSheet.settings?.pinHash
                                          ? 'Click to change or remove PIN'
                                          : 'Seal sheet behind a secure PIN barrier'}
                                      </div>
                                    </div>
                                  </div>
                                  <span className={cn(
                                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                    activeSheet.settings?.pinHash ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                                  )}>
                                    {activeSheet.settings?.pinHash ? 'Protected' : 'Off'}
                                  </span>
                                </button>
                              </div>

                              {/* 5. Import & Export Data */}
                              <div className="space-y-1.5 pt-2 border-t border-[#E6E1D6]">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Data Import & Export</span>
                                <div className="grid grid-cols-1 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      setExcelPreviews([]);
                                      setImportedFileName('');
                                      setImportSavedMessage('');
                                      setImportScope(globalScopeFilter !== 'all' ? globalScopeFilter : (activeSheet?.scope ?? 'business'));
                                      setImportModalOpen(true);
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Upload className="h-3.5 w-3.5 text-[#059669]" />
                                    <span>Import Excel / CSV (.xlsx, .csv)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      handleExportExcel();
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Download className="h-3.5 w-3.5 text-[#8C6D1F]" />
                                    <span>Export Workbook (.xlsx)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      handleExportCsv();
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-semibold text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Download className="h-3.5 w-3.5 text-[#686E78]" />
                                    <span>Export Active Sheet (.csv)</span>
                                  </button>
                                </div>
                              </div>

                              {/* 6. Templates */}
                              <div className="space-y-1.5 pt-2 border-t border-[#E6E1D6]">
                                <span className="text-[10px] font-bold uppercase text-[#686E78] tracking-wider">Create New Sheet</span>
                                <div className="grid grid-cols-3 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      openNewTabModal('job_tracker');
                                    }}
                                    className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] p-1.5 text-center text-[10px] font-semibold text-[#111318] hover:bg-white cursor-pointer"
                                  >
                                    + Job Tracker
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      openNewTabModal('freelance');
                                    }}
                                    className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] p-1.5 text-center text-[10px] font-semibold text-[#111318] hover:bg-white cursor-pointer"
                                  >
                                    + Billing
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSheetMenuOpen(false);
                                      openNewTabModal('blank');
                                    }}
                                    className="rounded-lg bg-[#FAF8F5] border border-[#E6E1D6] p-1.5 text-center text-[10px] font-semibold text-[#111318] hover:bg-white cursor-pointer"
                                  >
                                    + Blank
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

            {/* Google Sheets `fx` Formula & Cell Inspector Bar */}
            <div className="flex items-center gap-2 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] px-2.5 py-1.5">
              <div className="inline-flex items-center justify-center rounded-md bg-[#111318] text-[#E5C158] px-2 py-0.5 text-xs font-mono font-bold min-w-[42px] text-center">
                {activeCellMeta ? activeCellMeta.coord : 'A1'}
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#8C6D1F] px-1">
                <FunctionSquare className="h-3.5 w-3.5" />
                <span>fx</span>
              </div>
              <input
                type="text"
                aria-label="Formula or cell value"
                value={activeCellMeta ? activeCellMeta.rawValue : ''}
                onBlur={handleCellBlur}
                onChange={(e) => {
                  if (!activeCellMeta) return;
                  handleCellChange(activeCellMeta.rowIndex, activeCellMeta.col.id, e.target.value);
                }}
                placeholder="Click any cell to edit or type formula (e.g. =SUM(E1:E5) or =D1-E1)..."
                className="flex-1 bg-white rounded-lg border border-[#E6E1D6] px-2.5 py-1 text-xs font-mono text-[#111318] focus:border-[#111318] focus:outline-none"
              />
              {activeCellMeta && activeCellMeta.rawValue.trim().startsWith('=') && (
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800 shrink-0">
                  = {activeCellMeta.evaluatedValue}
                </span>
              )}
              <span className="hidden md:inline text-[11px] text-[#059669] font-mono font-semibold shrink-0">
                {saving ? 'Auto-saving...' : lastSavedLabel}
              </span>
            </div>

            {/* Quick Formula Helper Chips */}
            {activeCellMeta && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#52504C]">
                <span className="text-[10px] uppercase font-bold text-[#8C6D1F]">Insert:</span>
                {[
                  { label: '=SUM', formula: (letter: string, r: number) => `=SUM(${letter}1:${letter}${r})` },
                  { label: '=AVG', formula: (letter: string, r: number) => `=AVG(${letter}1:${letter}${r})` },
                  { label: '=MIN', formula: (letter: string, r: number) => `=MIN(${letter}1:${letter}${r})` },
                  { label: '=MAX', formula: (letter: string, r: number) => `=MAX(${letter}1:${letter}${r})` },
                  { label: '=COUNT', formula: (letter: string, r: number) => `=COUNT(${letter}1:${letter}${r})` },
                ].map((fn) => (
                  <button
                    key={fn.label}
                    type="button"
                    onClick={() => {
                      const colLetter = activeCellMeta.coord.replace(/\d+$/, '');
                      const rowNum = Math.max(1, activeCellMeta.rowIndex);
                      handleCellChange(activeCellMeta.rowIndex, activeCellMeta.col.id, fn.formula(colLetter, rowNum));
                    }}
                    className="rounded border border-[#E6E1D6] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#111318] hover:bg-[#F3EFEA] hover:border-[#C59B27] transition-all cursor-pointer"
                    title={`Insert ${fn.label} formula for column`}
                  >
                    {fn.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Sort Banner (Visible whenever sheet is sorted) */}
        {activeSheet && (sortOrder !== 'normal' || sortColId !== null) && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FFFDF5] border-b border-[#E6D5A7] px-3.5 py-1.5 text-xs">
            <div className="flex items-center gap-2 text-[#8C6D1F]">
              <Filter className="h-3.5 w-3.5 text-[#C59B27] shrink-0" />
              <span className="font-semibold text-[#111318]">
                {sortColId
                  ? `Sorted by Column ${activeSheet.columns.find((c) => c.id === sortColId)?.key || ''} (${activeSheet.columns.find((c) => c.id === sortColId)?.label || ''}) · ${sortOrder === 'col_asc' ? 'Ascending (A → Z / 1 → 9)' : 'Descending (Z → A / 9 → 1)'}`
                  : 'Sorted: Fast Entry (Newest Rows First)'}
              </span>
              {pinnedRowId && (
                <span className="inline-flex items-center gap-1 rounded bg-[#111318] text-[#E5C158] px-2 py-0.5 text-[10px] font-bold shadow-2xs">
                  <Pin className="h-2.5 w-2.5" /> 1 New Row Pinned at Top (Row 1)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {pinnedRowId && (
                <button
                  type="button"
                  onClick={() => setPinnedRowId(null)}
                  className="rounded px-2 py-0.5 text-[11px] font-semibold text-[#8C6D1F] hover:bg-[#FAF8F5] cursor-pointer"
                  title="Unpin new row to let it join the sort order"
                >
                  Unpin Row
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSortColId(null);
                  setSortOrder('normal');
                  setPinnedRowId(null);
                  try {
                    localStorage.setItem('sc_sheets_sort_order', 'normal');
                  } catch {}
                  onNotify?.('Reset to Original Table Order');
                }}
                className="rounded border border-[#E6D5A7] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#8C6D1F] hover:bg-[#FAF8F5] cursor-pointer shadow-2xs"
              >
                ✕ Reset to Original Order
              </button>
            </div>
          </div>
        )}

        {/* Pagination Toolbar (10, 20, 50, 100, All) */}
        {activeSheet && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#FAF8F5] border-b border-[#E6E1D6] px-3.5 py-2 text-xs">
            {/* Left: Row Count & Telemetry */}
            <div className="flex items-center gap-2 text-[#52504C]">
              <span className="font-semibold text-[#111318]">
                {totalRowsCount === 0
                  ? '0 rows'
                  : pageSize === 'all'
                    ? `Showing all ${totalRowsCount} rows`
                    : `Showing ${(safeCurrentPage - 1) * (pageSize as number) + 1}–${Math.min(
                        safeCurrentPage * (pageSize as number),
                        totalRowsCount,
                      )} of ${totalRowsCount} rows`}
              </span>
              {totalPages > 1 && (
                <span className="text-[#686E78]">
                  • Page {safeCurrentPage} of {totalPages}
                </span>
              )}
            </div>

            {/* Right: Page Size Selector (10, 20, 50, 100, All) + Prev/Next buttons */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[#686E78] hidden sm:inline">Page split:</span>
                <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-white p-0.5">
                  {([10, 20, 50, 100, 'all'] as const).map((size) => (
                    <button
                      key={String(size)}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                      className={cn(
                        'px-2 py-0.5 text-[11px] font-semibold rounded cursor-pointer transition-colors',
                        pageSize === size
                          ? 'bg-[#111318] text-[#E5C158]'
                          : 'text-[#686E78] hover:text-[#111318] hover:bg-[#F3EFEA]',
                      )}
                    >
                      {size === 'all' ? 'All' : size}
                    </button>
                  ))}
                </div>
              </div>

              {pageSize !== 'all' && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Jump to First Page (Page 1)"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    ‹ Prev
                  </button>
                  <span className="font-mono text-xs font-bold px-1 text-[#111318]">
                    {safeCurrentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title={`Jump to Last Page (Page ${totalPages})`}
                  >
                    » Last
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Horizontal Scrollbar Runner (Easy Access Without Scrolling Down to Bottom) */}
        {activeSheet && (
          <div className="flex items-center bg-[#FAF8F5] border-b border-[#E6E1D6] px-3 py-1 gap-2">
            <span className="text-[10px] font-mono font-bold uppercase text-[#8C6D1F] shrink-0">
              Scroll Cols:
            </span>
            <button
              type="button"
              onClick={() => scrollTableHorizontally('left')}
              className="inline-flex items-center justify-center rounded border border-[#E6E1D6] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer shadow-2xs shrink-0"
              title="Scroll columns left"
            >
              ◀ Left
            </button>
            <div
              ref={topScrollRef}
              onScroll={handleTopScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden h-3.5 rounded bg-[#EFECE6] border border-[#E6E1D6]"
              title="Top Horizontal Scrollbar: Click or drag to scroll table horizontally"
            >
              <div
                style={{
                  width: `${Math.max(1200, activeSheet.columns.reduce((sum, c) => sum + (c.width || 145), 140))}px`,
                  height: '1px',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => scrollTableHorizontally('right')}
              className="inline-flex items-center justify-center rounded border border-[#E6E1D6] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#111318] hover:bg-[#F3EFEA] cursor-pointer shadow-2xs shrink-0"
              title="Scroll columns right"
            >
              Right ▶
            </button>
          </div>
        )}

        {/* Mobile Cards View (< 768px when Cards view mode is active) */}
        {activeSheet && mobileViewMode === 'cards' && (
          <div className="md:hidden space-y-3">
            {paginatedRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#686E78] bg-[#FAF8F5] rounded-xl border border-[#E6E1D6]">
                No rows match the current filter. Click <strong>+ Row</strong> to add an entry.
              </div>
            ) : (
              paginatedRows.map(({ row, originalIndex }) => {
                const firstTextCol =
                  activeSheet.columns.find((c) => c.type === 'text') ?? activeSheet.columns[0];
                const rowPreviewText =
                  (firstTextCol ? row.cells[firstTextCol.id] : '') || `Row #${originalIndex + 1}`;
                const statusCol = activeSheet.columns.find((c) => c.type === 'status');
                const statusVal = statusCol ? row.cells[statusCol.id] ?? '' : '';
                const statusColor = statusCol
                  ? inferStatusColor(statusVal || 'In Progress', activeStatusOptions)
                  : 'gold';
                const statusTheme = TAB_COLOR_META[statusColor] ?? TAB_COLOR_META.gold;

                const currencyCols = activeSheet.columns.filter(
                  (c) => c.type === 'currency' || c.type === 'number',
                );
                const dateCols = activeSheet.columns.filter((c) => c.type === 'date');

                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-[#E6E1D6] bg-white p-3.5 shadow-sm space-y-2.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-5 w-6 items-center justify-center rounded bg-[#FAF8F5] border border-[#E6E1D6] text-[#686E78] font-mono text-xs font-bold shrink-0">
                          #{originalIndex + 1}
                        </span>
                        <h4 className="font-semibold text-xs text-[#111318] truncate">
                          {rowPreviewText}
                        </h4>
                      </div>
                      {statusCol && (
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold border',
                            statusTheme.badgeBg,
                            statusTheme.badgeText,
                            statusTheme.badgeBorder,
                          )}
                        >
                          {statusVal || 'In Progress'}
                        </span>
                      )}
                    </div>

                    {/* Numeric & Date Summary Matrix */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#FAF8F5] rounded-lg p-2 border border-[#E6E1D6]/60">
                      {dateCols.slice(0, 1).map((dCol) => (
                        <div key={dCol.id} className="min-w-0">
                          <span className="text-[10px] text-[#686E78] block truncate">{dCol.label}</span>
                          <span className="font-mono text-xs font-semibold text-[#111318]">
                            {row.cells[dCol.id] || '—'}
                          </span>
                        </div>
                      ))}
                      {currencyCols.slice(0, 2).map((cCol) => {
                        const rawVal = row.cells[cCol.id] ?? '';
                        const isFormula = rawVal.trim().startsWith('=');
                        const evaluated = isFormula
                          ? evaluateCellFormula(rawVal, activeSheet.columns, activeSheet.rows)
                          : rawVal;
                        return (
                          <div key={cCol.id} className="min-w-0 text-right">
                            <span className="text-[10px] text-[#686E78] block truncate">{cCol.label}</span>
                            <span className="font-mono text-xs font-bold text-[#8C6D1F]">
                              {evaluated ? `₹${evaluated}` : '₹0'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Card Tap-to-Edit and Quick Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setMobileDrawerRowIndex(originalIndex)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#111318] text-[#E5C158] px-3 py-1.5 text-xs font-bold min-h-[36px] cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Tap to Edit Row
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(originalIndex)}
                          className="rounded-lg p-2 text-[#686E78] hover:bg-[#FAF8F5] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                          title="Duplicate row"
                          aria-label="Duplicate row"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteRowTarget({
                              rowIndex: originalIndex,
                              previewLabel: rowPreviewText,
                            })
                          }
                          className="rounded-lg p-2 text-[#686E78] hover:bg-rose-50 hover:text-rose-600 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                          title="Delete row"
                          aria-label="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 3. Interactive Google Sheets Grid Table */}
        {activeSheet && (
          <div
            ref={tableContainerRef}
            onScroll={handleTableScroll}
            className={cn('overflow-x-auto', mobileViewMode === 'cards' ? 'hidden md:block' : 'block')}
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#F3EFEA] border-b border-[#E6E1D6] text-[#52504C]">
                  <th className="w-12 border-r border-[#E6E1D6] px-1.5 py-2 text-center font-mono text-[10px] font-bold uppercase select-none">
                    #
                  </th>
                  {activeSheet.columns.map((col, colIdx) => {
                    const letter = indexToColumnLetter(colIdx);
                    const isSorted = sortColId === col.id;
                    const isDropdownCol = col.type === 'status' && col.options && col.options.length > 0;

                    return (
                      <th
                        key={col.id}
                        draggable={true}
                        style={{
                          width: col.width ? `${col.width}px` : undefined,
                          minWidth: col.width ? `${col.width}px` : '120px',
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(colIdx));
                          setDraggedColIndex(colIdx);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedColIndex !== null && draggedColIndex !== colIdx) {
                            handleMoveColumn(draggedColIndex, colIdx);
                          }
                          setDraggedColIndex(null);
                        }}
                        className={cn(
                          'relative border-r border-[#E6E1D6] px-2.5 py-1.5 group select-none transition-colors',
                          draggedColIndex === colIdx && 'opacity-40 bg-[#FAF8F5]',
                        )}
                      >
                        {/* Interactive Column Edge Resizer Handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#C59B27] active:bg-[#111318] z-20 transition-colors"
                          title="Drag to resize column width, or double-click to auto-fit to content"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleAutoFitSingleColumn(col.id);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const startX = e.clientX;
                            const startWidth = col.width || 145;
                            const onMouseMove = (moveEvent: MouseEvent) => {
                              const delta = moveEvent.clientX - startX;
                              const newWidth = Math.max(75, Math.min(600, startWidth + delta));
                              updateActiveSheetLocal((curr) => ({
                                ...curr,
                                columns: curr.columns.map((c) => (c.id === col.id ? { ...c, width: newWidth } : c)),
                              }));
                            };
                            const onMouseUp = () => {
                              window.removeEventListener('mousemove', onMouseMove);
                              window.removeEventListener('mouseup', onMouseUp);
                              handleCellBlur();
                            };
                            window.addEventListener('mousemove', onMouseMove);
                            window.addEventListener('mouseup', onMouseUp);
                          }}
                        />
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className="inline-flex h-4 items-center justify-center rounded bg-[#111318] text-[#E5C158] font-mono text-[10px] font-bold px-1 shrink-0 cursor-grab active:cursor-grabbing"
                              title="Drag column header to reorder columns"
                            >
                              {letter}
                            </span>
                            <input
                              type="text"
                              value={col.label}
                              onChange={(e) => {
                                const nextLabel = e.target.value;
                                updateActiveSheetLocal((curr) => ({
                                  ...curr,
                                  columns: curr.columns.map((c) =>
                                    c.id === col.id ? { ...c, label: nextLabel } : c,
                                  ),
                                }));
                              }}
                              className="bg-transparent font-bold text-[#111318] text-xs truncate focus:bg-white focus:px-1 rounded focus:outline-none w-full"
                              title="Click to rename column header"
                            />
                          </div>

                          <div className="flex items-center gap-1 relative">
                            {/* Active Sort Direction Indicator Pill (Click to toggle Asc / Desc / Clear) */}
                            {isSorted && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortOrder === 'col_asc') {
                                    setSortOrder('col_desc');
                                    onNotify?.(`Column ${letter} (${col.label}) sorted Descending (Z→A)`);
                                  } else {
                                    setSortColId(null);
                                    setSortOrder('normal');
                                    onNotify?.(`Cleared sort on Column ${letter}`);
                                  }
                                }}
                                className="inline-flex items-center gap-0.5 rounded bg-[#FAF8F5] border border-[#C59B27] px-1 py-0.2 text-[10px] font-mono font-bold text-[#8C6D1F] hover:bg-[#FFF9E6] cursor-pointer"
                                title={`Sorted ${sortOrder === 'col_asc' ? 'Ascending (A→Z)' : 'Descending (Z→A)'}. Click to toggle or clear.`}
                              >
                                {sortOrder === 'col_asc' ? '▲' : '▼'}
                              </button>
                            )}

                            {/* Single Clean 3-Dots Action Menu for Column Options */}
                            <button
                              type="button"
                              onClick={() => setActiveColMenuId(activeColMenuId === col.id ? null : col.id)}
                              className={cn(
                                'rounded p-1 cursor-pointer transition-colors',
                                activeColMenuId === col.id
                                  ? 'bg-[#111318] text-[#E5C158]'
                                  : 'text-[#686E78] hover:text-[#111318] hover:bg-[#FAF8F5]',
                              )}
                              title="Column menu: Sort, Format, Insert, Delete"
                              aria-label={`Menu for Column ${col.label}`}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {activeColMenuId === col.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setActiveColMenuId(null)}
                                />
                                <div
                                  className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-[#E6E1D6] bg-white p-1.5 shadow-xl text-xs space-y-0.5 font-normal normal-case"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#686E78] border-b border-[#E6E1D6]/60">
                                    Column {letter} · {col.label}
                                  </div>

                                  {/* Sort Options */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSortColId(col.id);
                                      setSortOrder('col_asc');
                                      setActiveColMenuId(null);
                                      onNotify?.(`Sorted Column ${letter} (${col.label}) Ascending (A→Z / 1→9) ✓`);
                                    }}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs cursor-pointer',
                                      isSorted && sortOrder === 'col_asc' ? 'bg-[#FAF8F5] font-bold text-[#111318]' : 'hover:bg-[#FAF8F5] text-[#52504C]'
                                    )}
                                  >
                                    <ArrowDownAZ className="h-3.5 w-3.5 text-[#059669]" />
                                    <span>Sort A → Z (Ascending)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSortColId(col.id);
                                      setSortOrder('col_desc');
                                      setActiveColMenuId(null);
                                      onNotify?.(`Sorted Column ${letter} (${col.label}) Descending (Z→A / 9→1) ✓`);
                                    }}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs cursor-pointer',
                                      isSorted && sortOrder === 'col_desc' ? 'bg-[#FAF8F5] font-bold text-[#111318]' : 'hover:bg-[#FAF8F5] text-[#52504C]'
                                    )}
                                  >
                                    <ArrowUpZA className="h-3.5 w-3.5 text-[#8C6D1F]" />
                                    <span>Sort Z → A (Descending)</span>
                                  </button>

                                  {isSorted && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSortColId(null);
                                        setSortOrder('normal');
                                        setActiveColMenuId(null);
                                        onNotify?.(`Cleared sort on Column ${letter}`);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      <span>Clear Column Sort</span>
                                    </button>
                                  )}

                                  <div className="my-1 border-t border-[#E6E1D6]" />

                                  {/* Auto-Fit Column Width */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveColMenuId(null);
                                      handleAutoFitSingleColumn(col.id);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Sparkles className="h-3.5 w-3.5 text-[#C59B27]" />
                                    <span>Auto-Fit Width to Content</span>
                                  </button>

                                  {/* Format Column */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveColMenuId(null);
                                      setFormatColTarget(col);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#C59B27]" />
                                    <span>Format Column / Dropdown ({col.type})...</span>
                                  </button>

                                  <div className="my-1 border-t border-[#E6E1D6]" />

                                  {/* Insert Column Left / Right ("Where Required") */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveColMenuId(null);
                                      openAddColModal('left', col.id);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                                    <span>Insert Column Left</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveColMenuId(null);
                                      openAddColModal('right', col.id);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#111318] hover:bg-[#FAF8F5] cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                                    <span>Insert Column Right</span>
                                  </button>

                                  {activeSheet.columns.length > 2 && (
                                    <>
                                      <div className="my-1 border-t border-[#E6E1D6]" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveColMenuId(null);
                                          setDeleteColTarget({
                                            colId: col.id,
                                            letter,
                                            label: col.label,
                                          });
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Delete Column...</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Column Format Indicator Badge */}
                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          {isDropdownCol ? (
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-1 font-semibold text-emerald-800">
                              ▾ Dropdown ({col.options?.length})
                            </span>
                          ) : col.type === 'currency' ? (
                            <span className="rounded bg-amber-50 border border-amber-200 px-1 font-semibold text-amber-800">
                              ₹ Currency
                            </span>
                          ) : col.type === 'date' ? (
                            <span className="rounded bg-blue-50 border border-blue-200 px-1 font-semibold text-blue-800">
                              Date
                            </span>
                          ) : col.type === 'number' ? (
                            <span className="rounded bg-purple-50 border border-purple-200 px-1 font-semibold text-purple-800">
                              123 Number
                            </span>
                          ) : (
                            <span className="text-[#686E78]">{col.type}</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  {/* Quick + Add Column Header */}
                  <th className="w-12 border-r border-[#E6E1D6] px-2 py-2 text-center bg-[#FAF8F5]">
                    <button
                      type="button"
                      onClick={() => openAddColModal('end')}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[#111318] text-[#E5C158] hover:bg-[#1E232D] text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                      title="Add New Column at End"
                      aria-label="Add New Column"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="w-16 px-2 py-2 text-center font-mono text-[10px] uppercase text-[#686E78]">
                    Row
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E6E1D6]">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeSheet.columns.length + 3}
                      className="py-10 text-center text-xs text-[#686E78]"
                    >
                      No rows match the current filter. Click <strong>+ Row</strong> to add an entry.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map(({ row, originalIndex }) => {
                    const firstTextCol = activeSheet.columns.find((c) => c.type === 'text') ?? activeSheet.columns[0];
                    const rowPreviewText =
                      (firstTextCol ? row.cells[firstTextCol.id] : '') || `Row #${originalIndex + 1}`;
                    const isPinned = pinnedRowId === row.id;

                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'hover:bg-[#FAF8F5]/75 transition-colors group',
                          isPinned && 'bg-[#FFFDF5] border-l-4 border-l-[#C59B27] ring-1 ring-[#E6D5A7]',
                        )}
                      >
                        <td
                          className={cn(
                            'border-r border-[#E6E1D6] bg-[#FAF8F5] px-1 py-1.5 text-center font-mono text-[11px] font-semibold text-[#686E78] select-none',
                            dragOverRowIndex === originalIndex && 'border-t-2 border-t-[#C59B27] bg-[#FFF9E6]',
                            isPinned && 'bg-[#FFFDF5]',
                          )}
                        >
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              draggable={true}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', String(originalIndex));
                                setDraggedRowIndex(originalIndex);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverRowIndex(originalIndex);
                              }}
                              onDragLeave={() => {
                                if (dragOverRowIndex === originalIndex) setDragOverRowIndex(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggedRowIndex !== null) {
                                  handleMoveRow(draggedRowIndex, originalIndex);
                                }
                                setDraggedRowIndex(null);
                                setDragOverRowIndex(null);
                              }}
                              className="cursor-grab active:cursor-grabbing text-[#686E78] hover:text-[#111318] p-0.5"
                              title="Drag to reorder row"
                            >
                              <GripVertical className="h-3 w-3" />
                            </span>
                            <span
                              onClick={() => setMobileDrawerRowIndex(originalIndex)}
                              className="cursor-pointer hover:underline"
                              title="Tap to open mobile edit drawer"
                            >
                              {originalIndex + 1}
                            </span>
                            {isPinned && (
                              <span
                                className="inline-flex items-center text-[9px] font-bold text-[#8C6D1F] bg-[#FFF9E6] border border-[#E6D5A7] rounded px-1 shrink-0 ml-0.5"
                                title="Newly added row pinned at top for easy entry"
                              >
                                <Pin className="h-2 w-2 mr-0.5" />
                                New
                              </span>
                            )}
                          </div>
                        </td>

                        {activeSheet.columns.map((col, colIdx) => {
                          const isSelected =
                            selectedCell?.rowIndex === originalIndex && selectedCell?.colId === col.id;
                          const rawVal = row.cells[col.id] ?? '';
                          const isFormula = rawVal.trim().startsWith('=');
                          const evaluatedVal = isFormula
                            ? evaluateCellFormula(rawVal, activeSheet.columns, activeSheet.rows)
                            : rawVal;

                          const statusColor =
                            col.type === 'status'
                              ? inferStatusColor(rawVal || 'In Progress', activeStatusOptions)
                              : 'gold';
                          const statusTheme = TAB_COLOR_META[statusColor] ?? TAB_COLOR_META.gold;

                          // Include current cell value if it was imported and not yet in activeStatusOptions
                          const hasCurrentInOptions = activeStatusOptions.some(
                            (o) => o.label.toLowerCase() === rawVal.trim().toLowerCase(),
                          );

                          return (
                            <td
                              key={col.id}
                              onClick={() => setSelectedCell({ rowIndex: originalIndex, colId: col.id })}
                              style={{
                                width: col.width ? `${col.width}px` : undefined,
                                minWidth: col.width ? `${col.width}px` : '120px',
                              }}
                              className={cn(
                                'border-r border-[#E6E1D6] px-2.5 py-1.5 align-middle transition-colors min-h-[36px]',
                                isSelected && 'bg-[#FDFBF4] ring-2 ring-inset ring-[#C59B27]',
                                col.type === 'currency' || col.type === 'number'
                                  ? 'text-right font-mono'
                                  : 'text-left',
                              )}
                            >
                              {col.type === 'status' ? (
                                <select
                                  value={rawVal || (col.options?.[0] ?? activeStatusOptions[0]?.label ?? 'In Progress')}
                                  onChange={(e) => {
                                    const selected = e.target.value;
                                    if (selected === '__ADD_COL_CUSTOM_OPTION__') {
                                      const customOpt = window.prompt(
                                        `Enter new dropdown option for Column ${col.label}:`,
                                      );
                                      if (customOpt && customOpt.trim()) {
                                        const trimmed = customOpt.trim();
                                        updateActiveSheetLocal((curr) => ({
                                          ...curr,
                                          columns: curr.columns.map((c) =>
                                            c.id === col.id
                                              ? {
                                                  ...c,
                                                  options: Array.from(
                                                    new Set([...(c.options || []), trimmed]),
                                                  ),
                                                }
                                              : c,
                                          ),
                                          rows: curr.rows.map((r, idx) =>
                                            idx === originalIndex
                                              ? { ...r, cells: { ...r.cells, [col.id]: trimmed } }
                                              : r,
                                          ),
                                        }));
                                        onNotify?.(`Added option "${trimmed}" to Column ${col.label} ✓`);
                                      }
                                      return;
                                    }
                                    if (selected === '__FORMAT_COL__') {
                                      setFormatColTarget(col);
                                      return;
                                    }
                                    if (selected === '__ADD_CUSTOM_STATUS__') {
                                      setPendingStatusCellTarget({
                                        rowIndex: originalIndex,
                                        colId: col.id,
                                      });
                                      setStatusModalOpen(true);
                                      return;
                                    }
                                    handleCellChange(originalIndex, col.id, selected);
                                    handleCellBlur();
                                  }}
                                  className={cn(
                                    'w-full rounded-md px-2 py-1 text-[11px] font-semibold border cursor-pointer focus:outline-none transition-colors',
                                    statusTheme.badgeBg,
                                    statusTheme.badgeText,
                                    statusTheme.badgeBorder,
                                  )}
                                >
                                  {col.options && col.options.length > 0 ? (
                                    <>
                                      {!col.options.includes(rawVal) && rawVal.trim() !== '' && (
                                        <option value={rawVal}>{rawVal} (current)</option>
                                      )}
                                      {col.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                      <option value="__ADD_COL_CUSTOM_OPTION__">+ Add New Option...</option>
                                      <option value="__FORMAT_COL__">⚙ Manage Options...</option>
                                    </>
                                  ) : (
                                    <>
                                      {!hasCurrentInOptions && rawVal.trim() !== '' && (
                                        <option value={rawVal}>{rawVal}</option>
                                      )}
                                      {activeStatusOptions.map((st) => (
                                        <option key={st.label} value={st.label}>
                                          {st.label}
                                        </option>
                                      ))}
                                      <option value="__ADD_CUSTOM_STATUS__">+ Add Sheet Status...</option>
                                      <option value="__FORMAT_COL__">⚙ Convert to Column Dropdown...</option>
                                    </>
                                  )}
                                </select>
                              ) : isFormula && !isSelected ? (
                                <div
                                  className="w-full py-1 px-1 font-mono text-xs font-semibold text-[#059669] flex items-center justify-between gap-1"
                                  title={`Formula: ${rawVal}`}
                                >
                                  <span className="text-[9px] text-[#8C6D1F] bg-[#FAF8F5] border border-[#E6E1D6] rounded px-1">
                                    fx
                                  </span>
                                  <span>
                                    {col.type === 'currency'
                                      ? formatINR(Math.round(parseNumericCell(evaluatedVal) * 100))
                                      : evaluatedVal}
                                  </span>
                                </div>
                              ) : (
                                <input
                                  type={
                                    col.type === 'date' &&
                                    (rawVal === '' || /^\d{4}-\d{2}-\d{2}$/.test(rawVal))
                                      ? 'date'
                                      : 'text'
                                  }
                                  data-cell={`${originalIndex}-${col.id}`}
                                  value={rawVal}
                                  onFocus={() => setSelectedCell({ rowIndex: originalIndex, colId: col.id })}
                                  onBlur={handleCellBlur}
                                  onChange={(e) => handleCellChange(originalIndex, col.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (e.shiftKey) {
                                        if (originalIndex > 0) {
                                          const prevRow = originalIndex - 1;
                                          setSelectedCell({ rowIndex: prevRow, colId: col.id });
                                          if (pageSize !== 'all') {
                                            const targetPage = Math.floor(prevRow / pageSize) + 1;
                                            if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                          }
                                        }
                                      } else {
                                        if (originalIndex >= activeSheet.rows.length - 1) {
                                          handleAddRow(col.id);
                                        } else {
                                          const nextRow = originalIndex + 1;
                                          setSelectedCell({ rowIndex: nextRow, colId: col.id });
                                          if (pageSize !== 'all') {
                                            const targetPage = Math.floor(nextRow / pageSize) + 1;
                                            if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                          }
                                        }
                                      }
                                    } else if (e.key === 'ArrowDown') {
                                      if (originalIndex < activeSheet.rows.length - 1) {
                                        e.preventDefault();
                                        const nextRow = originalIndex + 1;
                                        setSelectedCell({ rowIndex: nextRow, colId: col.id });
                                        if (pageSize !== 'all') {
                                          const targetPage = Math.floor(nextRow / pageSize) + 1;
                                          if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                        }
                                      }
                                    } else if (e.key === 'ArrowUp') {
                                      if (originalIndex > 0) {
                                        e.preventDefault();
                                        const prevRow = originalIndex - 1;
                                        setSelectedCell({ rowIndex: prevRow, colId: col.id });
                                        if (pageSize !== 'all') {
                                          const targetPage = Math.floor(prevRow / pageSize) + 1;
                                          if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                        }
                                      }
                                    } else if (e.key === 'Tab') {
                                      e.preventDefault();
                                      if (e.shiftKey) {
                                        if (colIdx > 0) {
                                          setSelectedCell({ rowIndex: originalIndex, colId: activeSheet.columns[colIdx - 1].id });
                                        } else if (originalIndex > 0) {
                                          const prevRow = originalIndex - 1;
                                          const lastCol = activeSheet.columns[activeSheet.columns.length - 1].id;
                                          setSelectedCell({ rowIndex: prevRow, colId: lastCol });
                                          if (pageSize !== 'all') {
                                            const targetPage = Math.floor(prevRow / pageSize) + 1;
                                            if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                          }
                                        }
                                      } else {
                                        if (colIdx < activeSheet.columns.length - 1) {
                                          setSelectedCell({ rowIndex: originalIndex, colId: activeSheet.columns[colIdx + 1].id });
                                        } else if (originalIndex < activeSheet.rows.length - 1) {
                                          const nextRow = originalIndex + 1;
                                          const firstCol = activeSheet.columns[0].id;
                                          setSelectedCell({ rowIndex: nextRow, colId: firstCol });
                                          if (pageSize !== 'all') {
                                            const targetPage = Math.floor(nextRow / pageSize) + 1;
                                            if (targetPage !== safeCurrentPage) setCurrentPage(targetPage);
                                          }
                                        } else {
                                          handleAddRow(activeSheet.columns[0].id);
                                        }
                                      }
                                    }
                                  }}
                                  placeholder={col.type === 'currency' ? '0.00' : '...'}
                                  className={cn(
                                    'w-full bg-transparent py-1 px-1 text-xs text-[#111318] focus:outline-none',
                                    (col.type === 'currency' || col.type === 'number') &&
                                      'text-right font-mono font-semibold',
                                  )}
                                />
                              )}
                            </td>
                          );
                        })}

                        {/* Spacer for + Column */}
                        <td className="border-r border-[#E6E1D6] bg-[#FAF8F5]/30 text-center" />

                        {/* Row Actions (Move Up / Down, Drawer Edit / Duplicate / Confirmed Delete) */}
                        <td className="px-1.5 py-1 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              disabled={originalIndex === 0}
                              onClick={() => handleMoveRow(originalIndex, originalIndex - 1)}
                              className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] disabled:opacity-20 cursor-pointer"
                              title="Move row up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={originalIndex === activeSheet.rows.length - 1}
                              onClick={() => handleMoveRow(originalIndex, originalIndex + 1)}
                              className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] disabled:opacity-20 cursor-pointer"
                              title="Move row down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMobileDrawerRowIndex(originalIndex)}
                              className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer"
                              title="Edit row in mobile drawer"
                              aria-label="Edit row in drawer"
                            >
                              <Edit3 className="h-3 w-3 text-[#C59B27]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(originalIndex)}
                              className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#111318] cursor-pointer"
                              title="Duplicate row"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddRow('below', originalIndex)}
                              className="rounded p-0.5 text-[#686E78] hover:bg-[#FAF8F5] hover:text-[#2563EB] cursor-pointer"
                              title={`Insert row below Row #${originalIndex + 1}`}
                              aria-label="Insert row below"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteRowTarget({
                                  rowIndex: originalIndex,
                                  previewLabel: rowPreviewText,
                                })
                              }
                              className="rounded p-0.5 text-[#686E78] hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                              title="Delete row (asks confirmation)"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Optional `Σ Totals` Row — Rendered ONLY When User Enables `Σ Totals: On` */}
              {showTotals && activeSheetSummary && (
                <tfoot>
                  <tr className="bg-[#FAF8F5] border-t-2 border-[#E6E1D6] font-semibold text-[#111318]">
                    <td className="border-r border-[#E6E1D6] px-2 py-2.5 text-center font-mono text-xs text-[#8C6D1F] font-bold">
                      Σ
                    </td>
                    {activeSheet.columns.map((col, idx) => {
                      const totalMinor = activeSheetSummary.columnTotalsMinor[col.id];
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            'border-r border-[#E6E1D6] px-3 py-2.5 text-xs',
                            col.type === 'currency' || col.type === 'number'
                              ? 'text-right font-mono font-bold'
                              : 'text-left',
                          )}
                        >
                          {idx === 0 && col.type !== 'currency' && col.type !== 'number' ? (
                            <span className="text-[11px] uppercase tracking-wider text-[#8C6D1F] font-bold">
                              Totals ({activeSheet.rows.length} rows)
                            </span>
                          ) : col.type === 'currency' ? (
                            <span className="text-[#111318]">{formatINR(totalMinor ?? 0)}</span>
                          ) : col.type === 'number' ? (
                            <span className="text-[#111318]">
                              {((totalMinor ?? 0) / 100).toLocaleString('en-IN')}
                            </span>
                          ) : col.type === 'status' ? (
                            <span className="text-[11px] text-[#059669] font-mono">
                              {activeSheetSummary.completedCount} Done · {activeSheetSummary.inProgressCount} Active
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    {/* Spacer for + Column in Totals */}
                    <td className="border-r border-[#E6E1D6] bg-[#FAF8F5]" />
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={handleToggleTotals}
                        className="text-[10px] font-mono text-[#686E78] hover:text-[#111318] cursor-pointer"
                        title="Hide Totals Row"
                      >
                        Hide
                      </button>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>

            {/* Quick Action Bottom Strip (+ Add Row, + Add Column, Bottom Pagination) */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#FAF8F5] border-t border-[#E6E1D6]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddRow()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#111318] text-[#E5C158] hover:bg-[#1E232D] px-3 py-1.5 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#E5C158]" /> + Add Row
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewColLabel('');
                    setAddColOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E1D6] bg-white hover:bg-[#F3EFEA] px-3 py-1.5 text-xs font-semibold text-[#111318] cursor-pointer transition-colors"
                >
                  <Columns className="h-3.5 w-3.5 text-[#8C6D1F]" /> + Add Column
                </button>
              </div>

              {totalPages > 1 && pageSize !== 'all' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Jump to First Page (Page 1)"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2.5 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    ‹ Prev Page
                  </button>
                  <span className="font-mono text-xs font-semibold px-1.5 text-[#52504C]">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2.5 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Next Page ›
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="rounded-lg border border-[#E6E1D6] bg-white px-2 py-1 text-xs font-semibold text-[#111318] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title={`Jump to Last Page (Page ${totalPages})`}
                  >
                    » Last
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Bottom Google Sheets-Style Workbook Status & Tab Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F3EFEA] border-t border-[#E6E1D6] px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => openNewTabModal('job_tracker')}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[#111318] text-[#E5C158] hover:bg-[#1E232D] cursor-pointer shrink-0"
              title="Add New Sheet Tab"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {visibleSheets.map((s) => {
              const isAct = activeSheet?.id === s.id;
              const dot = TAB_COLOR_META[s.color]?.dot ?? 'bg-[#C59B27]';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSheetId(s.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors shrink-0',
                    isAct
                      ? 'bg-[#111318] text-white shadow-2xs'
                      : 'bg-white/80 text-[#52504C] hover:bg-white border border-[#E6E1D6]',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>

          {/* Adaptive Footer Summary (Adapts to Sheet Data Type & Optional Totals) */}
          {activeSheetSummary && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#4B5058]">
              <span>
                Rows: <strong className="text-[#111318]">{activeSheetSummary.rowCount}</strong>
              </span>
              <span>
                Cols: <strong className="text-[#111318]">{activeSheetSummary.columnCount}</strong>
              </span>
              {showTotals &&
                activeSheetSummary.numericColumnSummaries.slice(0, 2).map((numCol) => (
                  <span key={numCol.colId}>
                    Σ {numCol.label}:{' '}
                    <strong className="text-[#111318]">
                      {numCol.type === 'currency' ? formatINR(numCol.totalMinor) : numCol.rawSum}
                    </strong>
                  </span>
                ))}
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="h-3 w-3" /> {saving ? 'Auto-saving...' : lastSavedLabel}
              </span>
            </div>
          )}
        </div>
      </>
    )}
  </div>
)}

      {/* Modal 1: Import Excel (.xlsx / .xls / .csv) Workbook */}
      <Dialog
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Excel (.xlsx, .xls) or CSV File"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3">
            <div>
              <FieldLabel htmlFor="excel-import-mode">Where to Import</FieldLabel>
              <Select
                id="excel-import-mode"
                value={importMode}
                onChange={(e) =>
                  setImportMode(e.target.value as 'new_tabs' | 'append_current' | 'replace_current')
                }
              >
                <option value="new_tabs">Create New Tab(s) from Excel Sheet(s)</option>
                <option value="append_current">Append Rows to Current Tab</option>
                <option value="replace_current">Replace Current Tab Data</option>
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="excel-import-scope">Scope</FieldLabel>
              <Select
                id="excel-import-scope"
                value={importScope}
                onChange={(e) => setImportScope(e.target.value as Scope)}
              >
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const droppedFile = e.dataTransfer?.files?.[0];
              if (droppedFile) {
                void processUploadedExcelFile(droppedFile);
              }
            }}
            className="rounded-xl border-2 border-dashed border-[#D5CFC2] bg-[#FAF8F5] p-5 text-center space-y-2.5"
          >
            <FileSpreadsheet className="h-8 w-8 text-[#059669] mx-auto" />
            <div className="text-xs font-semibold text-[#111318]">
              Select or Drop an Excel Workbook (<code>.xlsx</code>, <code>.xls</code>) or <code>.csv</code> file
            </div>
            <p className="text-[11px] text-[#686E78]">
              Choosing a file <strong>automatically imports and saves</strong> your spreadsheet into the workbook immediately.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload Excel or CSV file"
              accept=".xlsx,.xls,.csv,.tsv"
              onChange={(e) => void handleExcelFileSelected(e)}
              className="hidden"
            />
            <Button
              variant="primary"
              type="button"
              disabled={importBusy}
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
            >
              <Upload className="h-3.5 w-3.5 text-[#E5C158]" />
              {importBusy ? 'Importing & Saving...' : 'Choose Excel / CSV File (Auto-Saves)'}
            </Button>
            {importedFileName && (
              <div className="text-xs font-mono text-[#059669] font-semibold pt-1">
                {importSavedMessage || `Saved: ${importedFileName} ✓`}
              </div>
            )}
          </div>

          {excelPreviews.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <FieldLabel>Imported Worksheets ({excelPreviews.length})</FieldLabel>
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] p-2.5">
                  {excelPreviews.map((p, idx) => (
                    <label
                      key={p.sheetName}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white border border-[#E6E1D6] px-3 py-2 text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.selected}
                          onChange={(e) =>
                            setExcelPreviews((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, selected: e.target.checked } : item,
                              ),
                            )
                          }
                        />
                        <span className="font-semibold text-[#111318]">{p.sheetName}</span>
                      </div>
                      <span className="font-mono text-[11px] text-[#686E78]">
                        {p.rowCount} rows · {p.colCount} cols
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" type="button" onClick={() => setImportModalOpen(false)}>
                  Done
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  disabled={importBusy}
                  onClick={() => void handleCommitExcelImport()}
                  className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#E5C158]" />
                  {importBusy ? 'Importing...' : 'Import & Auto-Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Modal 2: Custom Status Options Manager ("ADD CUSTOM SET STSTUS OPTION") */}
      <Dialog
        open={statusModalOpen}
        onClose={() => {
          setStatusModalOpen(false);
          setPendingStatusCellTarget(null);
        }}
        title={`Custom Status Options · ${activeSheet?.name ?? 'Sheet'}`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <form onSubmit={handleAddCustomStatus} className="space-y-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3.5">
            <div>
              <FieldLabel htmlFor="custom-status-label">Add New Custom Status</FieldLabel>
              <Input
                id="custom-status-label"
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                placeholder="e.g. Applied, Interviewing, Offer, Urgent, Hold..."
                autoFocus
                required
              />
            </div>

            <div>
              <FieldLabel>Badge Color</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {(['emerald', 'gold', 'obsidian', 'rose', 'slate'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewStatusColor(c)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer',
                      newStatusColor === c
                        ? 'border-[#111318] bg-white font-bold text-[#111318] shadow-2xs'
                        : 'border-[#E6E1D6] bg-white/60 text-[#686E78]',
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', TAB_COLOR_META[c].dot)} />
                    <span className="capitalize">{c}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="primary"
              type="submit"
              className="w-full bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
            >
              <Plus className="h-3.5 w-3.5 text-[#E5C158]" /> Add Status Option
            </Button>
          </form>

          <div className="space-y-1.5">
            <FieldLabel>Current Status Options for This Sheet ({activeStatusOptions.length})</FieldLabel>
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {activeStatusOptions.map((st) => {
                const theme = TAB_COLOR_META[st.color] ?? TAB_COLOR_META.gold;
                return (
                  <div
                    key={st.label}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#E6E1D6] bg-white px-3 py-2"
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold',
                        theme.badgeBg,
                        theme.badgeText,
                        theme.badgeBorder,
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', theme.dot)} />
                      <span>{st.label}</span>
                    </span>

                    {activeStatusOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomStatus(st.label)}
                        className="rounded p-1 text-[#686E78] hover:bg-rose-50 hover:text-rose-600 cursor-pointer text-xs"
                        title={`Remove status "${st.label}"`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setStatusModalOpen(false);
                setPendingStatusCellTarget(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal 3: Create New Sheet Tab */}
      <Dialog
        open={newTabOpen}
        onClose={() => setNewTabOpen(false)}
        title="Create New Sheet Tab"
        maxWidth="max-w-md"
      >
        <form onSubmit={(e) => void handleCreateTab(e)} className="space-y-4">
          <div>
            <FieldLabel htmlFor="new-sheet-name">Tab Name</FieldLabel>
            <Input
              id="new-sheet-name"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              placeholder="e.g. Job 4 · Role Tracker or Project Log"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="new-sheet-template">Sheet Template</FieldLabel>
              <Select
                id="new-sheet-template"
                value={newTabTemplate}
                onChange={(e) =>
                  setNewTabTemplate(
                    e.target.value as 'job_tracker' | 'freelance' | 'salary' | 'project' | 'blank',
                  )
                }
              >
                <option value="job_tracker">Job & Role Tracker (No ₹ Cols)</option>
                <option value="blank">Blank Custom Sheet (No ₹ Cols)</option>
                <option value="freelance">Client & Billing Tracker</option>
                <option value="salary">Salary & Payroll Sheet</option>
                <option value="project">Project & Milestone Sheet</option>
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="new-sheet-scope">Scope (Business → Personal → Family)</FieldLabel>
              <Select
                id="new-sheet-scope"
                value={newTabScope}
                onChange={(e) => setNewTabScope(e.target.value as Scope)}
              >
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="family">Family</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel>Tab Accent Color</FieldLabel>
            <div className="flex items-center gap-2 pt-1">
              {(['emerald', 'gold', 'obsidian', 'rose', 'slate'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTabColor(c)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer',
                    newTabColor === c
                      ? 'border-[#111318] bg-[#FAF8F5] font-bold text-[#111318]'
                      : 'border-[#E6E1D6] bg-white text-[#686E78]',
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', TAB_COLOR_META[c].dot)} />
                  <span className="capitalize">{c}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setNewTabOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#E5C158]" /> Create Tab
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal 4: Add Custom Column to Active Sheet */}
      <Dialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
        title="Add Custom Spreadsheet Column"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleAddColumn} className="space-y-4">
          <div>
            <FieldLabel htmlFor="new-col-label">Column Header Name</FieldLabel>
            <Input
              id="new-col-label"
              value={newColLabel}
              onChange={(e) => setNewColLabel(e.target.value)}
              placeholder="e.g. Department, Interview Date, Priority, Fee..."
              autoFocus
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-col-type">Column Format Type</FieldLabel>
            <Select
              id="new-col-type"
              value={newColType}
              onChange={(e) => setNewColType(e.target.value as SheetColumnType)}
            >
              <option value="text">Text / General</option>
              <option value="status">Status Dropdown (Customizable)</option>
              <option value="date">Date (YYYY-MM-DD)</option>
              <option value="number">Number / Qty / Hours</option>
              <option value="currency">Currency (₹ Amount)</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="new-col-placement">Where to Place Column</FieldLabel>
            <Select
              id="new-col-placement"
              value={newColPlacement}
              onChange={(e) => setNewColPlacement(e.target.value as any)}
            >
              <option value="end">At the End (Last Column)</option>
              <option value="start">At the Beginning (Column A / First)</option>
              <option value="left">To the Left of Selected Column...</option>
              <option value="right">To the Right of Selected Column...</option>
            </Select>
          </div>
          {(newColPlacement === 'left' || newColPlacement === 'right') && activeSheet && (
            <div>
              <FieldLabel htmlFor="new-col-target">Reference Column</FieldLabel>
              <Select
                id="new-col-target"
                value={newColTargetColId}
                onChange={(e) => setNewColTargetColId(e.target.value)}
              >
                {activeSheet.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    Column {c.key} · {c.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAddColOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              className="bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
            >
              <Plus className="h-3.5 w-3.5 text-[#E5C158]" /> Add Column
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Confirmation Dialog 1: Delete Sheet Tab (Not 1-Click Delete) */}
      <ConfirmDialog
        open={!!deleteTabTarget}
        title="Delete Sheet Tab?"
        message={`Are you sure you want to delete tab "${deleteTabTarget?.name}" and its ${deleteTabTarget?.rows.length ?? 0} rows?`}
        confirmLabel="Delete Tab"
        onConfirm={() => void handleConfirmDeleteTab()}
        onClose={() => setDeleteTabTarget(null)}
      />

      {/* Modal 5: Mobile Card Row Drawer (< 768px Touch Ergonomics) */}
      <Dialog
        open={mobileDrawerRowIndex !== null && Boolean(activeSheet?.rows[mobileDrawerRowIndex])}
        onClose={() => setMobileDrawerRowIndex(null)}
        title={
          mobileDrawerRowIndex !== null
            ? `Edit Row #${mobileDrawerRowIndex + 1} · ${activeSheet?.name ?? 'Sheet'}`
            : 'Edit Row'
        }
        maxWidth="max-w-md"
      >
        {mobileDrawerRowIndex !== null && activeSheet?.rows[mobileDrawerRowIndex] && (
          <div className="space-y-4">
            {/* Row Navigation (Previous / Next) */}
            <div className="flex items-center justify-between gap-2 border-b border-[#E6E1D6] pb-3 text-xs">
              <span className="font-mono font-semibold text-[#686E78]">
                Row {mobileDrawerRowIndex + 1} of {activeSheet.rows.length}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={mobileDrawerRowIndex <= 0}
                  onClick={() => setMobileDrawerRowIndex((idx) => (idx !== null && idx > 0 ? idx - 1 : idx))}
                  className="h-8 px-2.5 text-xs"
                >
                  ← Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={mobileDrawerRowIndex >= activeSheet.rows.length - 1}
                  onClick={() =>
                    setMobileDrawerRowIndex((idx) =>
                      idx !== null && idx < activeSheet.rows.length - 1 ? idx + 1 : idx,
                    )
                  }
                  className="h-8 px-2.5 text-xs"
                >
                  Next →
                </Button>
              </div>
            </div>

            {/* Vertical Stacked Column Fields with 44px Touch Targets */}
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {activeSheet.columns.map((col, colIdx) => {
                const cellVal = activeSheet.rows[mobileDrawerRowIndex!].cells[col.id] ?? '';
                const letter = indexToColumnLetter(colIdx);
                const isFormula = cellVal.trim().startsWith('=');
                const evaluatedVal = isFormula
                  ? evaluateCellFormula(cellVal, activeSheet.columns, activeSheet.rows)
                  : cellVal;

                return (
                  <div key={col.id} className="space-y-1 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={`mob-col-${col.id}`} className="mb-0 flex items-center gap-1.5 font-bold text-[#111318] cursor-pointer">
                        <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-[#111318] text-[#E5C158] font-mono text-[10px] font-bold">
                          {letter}
                        </span>
                        <span>{col.label}</span>
                      </label>
                      <span className="text-[10px] font-mono text-[#686E78] uppercase">{col.type}</span>
                    </div>

                    {col.type === 'status' ? (
                      <div className="pt-1">
                        <select
                          id={`mob-col-${col.id}`}
                          value={cellVal || activeStatusOptions[0]?.label || 'In Progress'}
                          onChange={(e) => {
                            if (e.target.value === '__ADD_CUSTOM_STATUS__') {
                              setPendingStatusCellTarget({
                                rowIndex: mobileDrawerRowIndex!,
                                colId: col.id,
                              });
                              setStatusModalOpen(true);
                              return;
                            }
                            handleCellChange(mobileDrawerRowIndex!, col.id, e.target.value);
                            handleCellBlur();
                          }}
                          className="w-full min-h-[44px] rounded-lg border border-[#E6E1D6] bg-white px-3 text-xs font-semibold text-[#111318] focus:border-[#111318] focus:outline-none"
                        >
                          {col.options && col.options.length > 0 ? (
                            col.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))
                          ) : (
                            activeStatusOptions.map((opt) => (
                              <option key={opt.label} value={opt.label}>
                                {opt.label}
                              </option>
                            ))
                          )}
                          <option value="__ADD_CUSTOM_STATUS__">➕ Add Custom Status Option...</option>
                        </select>
                      </div>
                    ) : col.type === 'date' ? (
                      <input
                        id={`mob-col-${col.id}`}
                        type="date"
                        value={cellVal}
                        onBlur={handleCellBlur}
                        onChange={(e) => handleCellChange(mobileDrawerRowIndex!, col.id, e.target.value)}
                        className="w-full min-h-[44px] rounded-lg border border-[#E6E1D6] bg-white px-3 text-xs text-[#111318] focus:border-[#111318] focus:outline-none font-mono"
                      />
                    ) : (
                      <div className="space-y-1">
                        <div className="relative">
                          {(col.type === 'currency' || col.type === 'number') && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8C6D1F]">
                              ₹
                            </span>
                          )}
                          <input
                            id={`mob-col-${col.id}`}
                            type="text"
                            inputMode={col.type === 'currency' || col.type === 'number' ? 'decimal' : 'text'}
                            value={cellVal}
                            onBlur={handleCellBlur}
                            onChange={(e) => handleCellChange(mobileDrawerRowIndex!, col.id, e.target.value)}
                            className={cn(
                              'w-full min-h-[44px] rounded-lg border border-[#E6E1D6] bg-white text-xs text-[#111318] focus:border-[#111318] focus:outline-none',
                              col.type === 'currency' || col.type === 'number'
                                ? 'pl-7 pr-3 font-mono font-semibold'
                                : 'px-3',
                            )}
                            placeholder={col.type === 'currency' ? '0.00' : '...'}
                          />
                        </div>
                        {isFormula && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                            <span>Computed:</span>
                            <span className="font-bold">= {evaluatedVal}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-2 border-t border-[#E6E1D6] pt-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    handleDuplicateRow(mobileDrawerRowIndex!);
                  }}
                  className="min-h-[40px] px-3 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const firstTextCol =
                      activeSheet.columns.find((c) => c.type === 'text') ?? activeSheet.columns[0];
                    const rowPreviewText =
                      (firstTextCol
                        ? activeSheet.rows[mobileDrawerRowIndex!].cells[firstTextCol.id]
                        : '') || `Row #${mobileDrawerRowIndex! + 1}`;
                    setDeleteRowTarget({
                      rowIndex: mobileDrawerRowIndex!,
                      previewLabel: rowPreviewText,
                    });
                    setMobileDrawerRowIndex(null);
                  }}
                  className="min-h-[40px] px-3 text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setMobileDrawerRowIndex(null)}
                className="min-h-[40px] px-4 text-xs bg-[#111318] hover:bg-[#1E232D] text-white border-[#111318]"
              >
                <Check className="h-3.5 w-3.5 text-[#E5C158]" /> Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal 6: Format Column & Auto-Detect Dropdown Menu */}
      <Dialog
        open={Boolean(formatColTarget)}
        onClose={() => setFormatColTarget(null)}
        title={
          formatColTarget
            ? `Format Column ${formatColTarget.key} · "${formatColTarget.label}"`
            : 'Format Column'
        }
        maxWidth="max-w-md"
      >
        {formatColTarget && activeSheet && (
          <div className="space-y-4">
            {/* 1. Hero: Auto-Detect Dropdown from Column Data (Zero Data Loss) */}
            {(() => {
              const detectedOptions = Array.from(
                new Set(
                  activeSheet.rows
                    .map((r) => (r.cells[formatColTarget.id] ?? '').trim())
                    .filter((v) => v.length > 0),
                ),
              );

              return (
                <div className="rounded-xl border border-[#C59B27]/40 bg-[#FFFDF5] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#111318] flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-[#C59B27]" /> ⚡ Auto-Detect Dropdown
                    </span>
                    <span className="rounded bg-amber-100/80 px-2 py-0.5 text-[11px] font-mono font-bold text-[#8C6D1F]">
                      {detectedOptions.length} detected
                    </span>
                  </div>
                  <p className="text-xs text-[#52504C] leading-relaxed">
                    Convert this entire column to a dropdown menu using <strong>strictly only the detected values</strong> from your data (e.g.{' '}
                    <em>{detectedOptions.slice(0, 3).join(', ') || 'values'}</em>). <strong>Zero data loss</strong>—all{' '}
                    {activeSheet.rows.length} existing rows remain intact!
                  </p>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white rounded border border-[#E6E1D6]">
                    {detectedOptions.length === 0 ? (
                      <span className="text-xs text-[#686E78] italic">No values detected yet in column</span>
                    ) : (
                      detectedOptions.map((opt) => (
                        <span
                          key={opt}
                          className="rounded bg-[#FAF8F5] border border-[#E6E1D6] px-2 py-0.5 text-[11px] font-semibold text-[#111318]"
                        >
                          {opt}
                        </span>
                      ))
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="w-full bg-[#111318] hover:bg-[#1E232D] text-[#E5C158] font-bold"
                    onClick={() => {
                      const finalOpts =
                        detectedOptions.length > 0 ? detectedOptions : ['Option 1', 'Option 2'];
                      updateActiveSheetLocal((curr) => ({
                        ...curr,
                        columns: curr.columns.map((c) =>
                          c.id === formatColTarget.id
                            ? { ...c, type: 'status', options: finalOpts }
                            : c,
                        ),
                      }));
                      setFormatColTarget(null);
                      onNotify?.(
                        `Converted Column ${formatColTarget.key} to Dropdown with ${finalOpts.length} options: ${finalOpts.join(', ')} (${activeSheet.rows.length} rows preserved) ✓`,
                      );
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Convert to Dropdown with Detected Data ({detectedOptions.length} values)
                  </Button>
                </div>
              );
            })()}

            {/* 2. Switch Format Type Without Data Loss */}
            <div className="space-y-2 border-t border-[#E6E1D6] pt-3">
              <FieldLabel>Change Column Format Type (Zero Data Loss)</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'status', label: '▾ Dropdown / Status' },
                  { type: 'text', label: 'Text / General' },
                  { type: 'number', label: 'Number (Qty / Int)' },
                  { type: 'currency', label: 'Currency (₹ Amount)' },
                  { type: 'date', label: 'Date (YYYY-MM-DD)' },
                ].map((fmt) => (
                  <button
                    key={fmt.type}
                    type="button"
                    onClick={() => {
                      updateActiveSheetLocal((curr) => ({
                        ...curr,
                        columns: curr.columns.map((c) => {
                          if (c.id !== formatColTarget.id) return c;
                          if (fmt.type === 'status') {
                            const detected = Array.from(
                              new Set(
                                curr.rows
                                  .map((r) => (r.cells[c.id] ?? '').trim())
                                  .filter((v) => v.length > 0),
                              ),
                            );
                            const finalOpts =
                              c.options && c.options.length > 0
                                ? c.options
                                : detected.length > 0
                                  ? detected
                                  : ['Option 1', 'Option 2'];
                            return { ...c, type: 'status', options: finalOpts };
                          }
                          return { ...c, type: fmt.type as SheetColumnType };
                        }),
                      }));
                      setFormatColTarget((prev) =>
                        prev
                          ? {
                              ...prev,
                              type: fmt.type as SheetColumnType,
                              options:
                                fmt.type === 'status'
                                  ? prev.options || ['Option 1', 'Option 2']
                                  : prev.options,
                            }
                          : null,
                      );
                      onNotify?.(`Changed Column ${formatColTarget.key} format to ${fmt.label} (Data preserved) ✓`);
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-colors cursor-pointer',
                      formatColTarget.type === fmt.type
                        ? 'border-[#111318] bg-[#FAF8F5] text-[#111318] font-bold'
                        : 'border-[#E6E1D6] bg-white text-[#686E78] hover:bg-[#F3EFEA]',
                    )}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. If currently a dropdown column, allow managing custom options */}
            {formatColTarget.type === 'status' && (
              <div className="space-y-2 border-t border-[#E6E1D6] pt-3">
                <div className="flex items-center justify-between">
                  <FieldLabel>
                    Dropdown Options for Column {formatColTarget.key} (
                    {(formatColTarget.options || activeStatusOptions.map((s) => s.label)).length})
                  </FieldLabel>
                  <span className="text-[10px] text-[#686E78] font-mono">Column-specific</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1 bg-white rounded border border-[#E6E1D6]">
                  {(formatColTarget.options || activeStatusOptions.map((s) => s.label)).map((opt) => {
                    const clr = inferStatusColor(opt, activeStatusOptions);
                    const theme = TAB_COLOR_META[clr] ?? TAB_COLOR_META.gold;
                    return (
                      <span
                        key={opt}
                        className={cn(
                          'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold',
                          theme.badgeBg,
                          theme.badgeText,
                          theme.badgeBorder,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', theme.dot)} />
                        <span>{opt}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentList =
                              formatColTarget.options || activeStatusOptions.map((s) => s.label);
                            const nextOpts = currentList.filter((o) => o !== opt);
                            updateActiveSheetLocal((curr) => ({
                              ...curr,
                              columns: curr.columns.map((c) =>
                                c.id === formatColTarget.id ? { ...c, options: nextOpts } : c,
                              ),
                            }));
                            setFormatColTarget((prev) => (prev ? { ...prev, options: nextOpts } : null));
                          }}
                          className="text-[#686E78] hover:text-rose-600 font-bold ml-1 cursor-pointer"
                          title="Remove option"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                {/* Add new option input */}
                <div className="flex items-center gap-1 pt-1">
                  <Input
                    value={customDropdownInput}
                    onChange={(e) => setCustomDropdownInput(e.target.value)}
                    placeholder="Type new option for this column..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customDropdownInput.trim()) {
                          const val = customDropdownInput.trim();
                          const currentList =
                            formatColTarget.options || activeStatusOptions.map((s) => s.label);
                          const nextOpts = Array.from(new Set([...currentList, val]));
                          updateActiveSheetLocal((curr) => ({
                            ...curr,
                            columns: curr.columns.map((c) =>
                              c.id === formatColTarget.id ? { ...c, options: nextOpts } : c,
                            ),
                          }));
                          setFormatColTarget((prev) => (prev ? { ...prev, options: nextOpts } : null));
                          setCustomDropdownInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (customDropdownInput.trim()) {
                        const val = customDropdownInput.trim();
                        const currentList =
                          formatColTarget.options || activeStatusOptions.map((s) => s.label);
                        const nextOpts = Array.from(new Set([...currentList, val]));
                        updateActiveSheetLocal((curr) => ({
                          ...curr,
                          columns: curr.columns.map((c) =>
                            c.id === formatColTarget.id ? { ...c, options: nextOpts } : c,
                          ),
                        }));
                        setFormatColTarget((prev) => (prev ? { ...prev, options: nextOpts } : null));
                        setCustomDropdownInput('');
                      }
                    }}
                  >
                    + Add
                  </Button>
                </div>
              </div>
            )}

            {/* 4. Column Width Controls */}
            <div className="space-y-2 border-t border-[#E6E1D6] pt-3">
              <FieldLabel>Column Width Sizing</FieldLabel>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    handleAutoFitSingleColumn(formatColTarget.id);
                    setFormatColTarget(null);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-[#C59B27]" />
                  Auto-Fit Width to Content
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E6E1D6]">
              <Button variant="secondary" onClick={() => setFormatColTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleteRowTarget}
        title={`Delete Row #${(deleteRowTarget?.rowIndex ?? 0) + 1}?`}
        message={`Are you sure you want to delete "${deleteRowTarget?.previewLabel}" from this sheet?`}
        confirmLabel="Delete Row"
        onConfirm={handleConfirmDeleteRow}
        onClose={() => setDeleteRowTarget(null)}
      />

      {/* Confirmation Dialog 3: Delete Column (Not 1-Click Delete) */}
      <ConfirmDialog
        open={!!deleteColTarget}
        title={`Delete Column ${deleteColTarget?.letter} (${deleteColTarget?.label})?`}
        message={`Are you sure you want to delete column "${deleteColTarget?.letter} · ${deleteColTarget?.label}" and all data in that column?`}
        confirmLabel="Delete Column"
        onConfirm={handleConfirmDeleteColumn}
        onClose={() => setDeleteColTarget(null)}
      />

      {/* PIN Unlock Modal */}
      <Dialog
        open={pinUnlockModalOpen}
        onClose={() => {
          setPinUnlockModalOpen(false);
          setEnteredPin('');
          setPinError('');
        }}
        title={`Unlock Sheet: ${pinUnlockTarget?.name || 'Protected Sheet'}`}
      >
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-900 text-xs">
            <Lock className="h-5 w-5 text-amber-700 shrink-0" />
            <div>
              <div className="font-bold">This sheet is PIN Protected</div>
              <div className="text-[11px] text-amber-800">
                Enter the security PIN to view and edit confidential customer and financial records.
              </div>
            </div>
          </div>

          {pinUnlockTarget?.settings?.pinHint && (
            <div className="text-xs text-[#686E78] italic bg-[#FAF8F5] p-2 rounded-lg border border-[#E6E1D6]">
              💡 <span className="font-semibold">Hint:</span> {pinUnlockTarget.settings.pinHint}
            </div>
          )}

          <div className="space-y-1.5">
            <FieldLabel>Security PIN (4-6 digits)</FieldLabel>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={enteredPin}
                onChange={(e) => {
                  setEnteredPin(e.target.value.replace(/\D/g, ''));
                  setPinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && enteredPin.length >= 4) {
                    void handleUnlockSubmit();
                  }
                }}
                placeholder="Enter 4-6 digit PIN"
                className="text-center font-mono text-lg tracking-widest h-11"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#686E78] hover:text-[#111318] cursor-pointer"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {pinError && <p className="text-xs font-semibold text-rose-600 mt-1">{pinError}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPinUnlockModalOpen(false);
                setEnteredPin('');
                setPinError('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleUnlockSubmit()}
              disabled={enteredPin.length < 4}
              className="bg-[#111318] text-[#E5C158] hover:bg-[#1E232D]"
            >
              <KeyRound className="h-4 w-4 mr-1.5" /> Unlock & Open Sheet
            </Button>
          </div>
        </div>
      </Dialog>

      {/* PIN Setup / Configuration Modal */}
      <Dialog
        open={pinSetupModalOpen}
        onClose={() => {
          setPinSetupModalOpen(false);
          setNewPin('');
          setConfirmPin('');
          setPinHintInput('');
          setPinSetupError('');
        }}
        title={`PIN Protection: ${pinSetupTarget?.name || 'Sheet'}`}
      >
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-3 rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] p-3 text-xs">
            <ShieldCheck className="h-5 w-5 text-[#C59B27] shrink-0" />
            <div>
              <div className="font-bold text-[#111318]">Privacy Barrier Protection</div>
              <div className="text-[11px] text-[#686E78]">
                When PIN protection is enabled, the sheet opens only after entering the correct PIN. Hashed client-side.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <FieldLabel>New PIN (4 to 6 digits)</FieldLabel>
              <Input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value.replace(/\D/g, ''));
                  setPinSetupError('');
                }}
                placeholder="e.g. 1234"
                className="font-mono text-center tracking-widest text-base"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Confirm PIN</FieldLabel>
              <Input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, ''));
                  setPinSetupError('');
                }}
                placeholder="Repeat PIN"
                className="font-mono text-center tracking-widest text-base"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Optional Reminder Hint</FieldLabel>
              <Input
                type="text"
                value={pinHintInput}
                onChange={(e) => setPinHintInput(e.target.value)}
                placeholder="e.g. Last 4 digits of shop phone"
              />
            </div>

            {pinSetupError && <p className="text-xs font-semibold text-rose-600">{pinSetupError}</p>}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#E6E1D6]">
            {pinSetupTarget?.settings?.pinHash ? (
              <Button
                variant="danger"
                size="sm"
                onClick={handleRemovePinProtection}
              >
                Remove Protection
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPinSetupModalOpen(false);
                  setNewPin('');
                  setConfirmPin('');
                  setPinHintInput('');
                  setPinSetupError('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSavePinProtection()}
                disabled={newPin.length < 4}
                className="bg-[#111318] text-[#E5C158] hover:bg-[#1E232D]"
              >
                Save PIN Protection
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
