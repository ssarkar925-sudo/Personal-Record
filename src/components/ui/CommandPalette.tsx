import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Building2,
  Cloud,
  CornerDownLeft,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lock,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { cn } from './Primitives.tsx';
import type { WorkspaceId } from '../../workspaces/DashboardView.tsx';
import { UI_STRINGS, type AppLanguage } from '../../../shared/i18n.ts';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  systemLanguage?: AppLanguage;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd?: () => void;
  onOpenAddBank?: () => void;
  onOpenAddNote?: () => void;
  onLockApp?: () => void;
  onLockVault?: () => void;
  onExportCaPack?: () => void;
  onNavigateBillboard?: () => void;
  onOpenLanSync?: () => void;
  onOpenCloudSync?: () => void;
  onSeedData?: () => void;
  onCleanData?: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: 'workspaces' | 'quickActions';
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  systemLanguage = 'en',
  onNavigate,
  onOpenQuickAdd,
  onOpenAddBank,
  onOpenAddNote,
  onLockApp,
  onLockVault,
  onExportCaPack,
  onNavigateBillboard,
  onOpenLanSync,
  onOpenCloudSync,
  onSeedData,
  onCleanData,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const dict = UI_STRINGS[systemLanguage] || UI_STRINGS.en;
  const cpDict = dict.commandPalette;

  // Build command items list
  const allItems: CommandItem[] = useMemo(() => {
    return [
      // Quick Actions
      {
        id: 'action-add-transaction',
        label: '+ Add Transaction',
        description: 'Capture expense, income, transfer, or credit swipe',
        category: 'quickActions',
        icon: <Plus className="h-4 w-4 text-emerald-600" />,
        shortcut: 'Ctrl+Q',
        keywords: ['transaction', 'expense', 'income', 'transfer', 'spend', 'new'],
        action: () => {
          if (onOpenQuickAdd) onOpenQuickAdd();
        },
      },
      {
        id: 'action-add-bank',
        label: '+ Add Bank Account',
        description: 'Add savings, current account, wallet, or credit card',
        category: 'quickActions',
        icon: <Building2 className="h-4 w-4 text-blue-600" />,
        keywords: ['bank', 'account', 'credit card', 'wallet', 'new bank'],
        action: () => {
          if (onOpenAddBank) {
            onOpenAddBank();
          } else {
            onNavigate('money');
          }
        },
      },
      {
        id: 'action-add-note',
        label: '+ Add Note',
        description: 'Create a pinned financial note, checklist, or receipt ledger',
        category: 'quickActions',
        icon: <NotebookPen className="h-4 w-4 text-teal-600" />,
        keywords: ['note', 'memo', 'checklist', 'todo', 'receipt'],
        action: () => {
          if (onOpenAddNote) {
            onOpenAddNote();
          } else {
            onNavigate('notes');
          }
        },
      },
      {
        id: 'action-lock',
        label: 'Lock App / Lock Vault',
        description: 'Secure session with PIN and lock client-side encrypted vault',
        category: 'quickActions',
        icon: <KeyRound className="h-4 w-4 text-amber-600" />,
        keywords: ['lock', 'security', 'pin', 'vault', 'privacy', 'logout'],
        action: () => {
          if (onLockApp) onLockApp();
          if (onLockVault) onLockVault();
        },
      },
      {
        id: 'action-export-ca-pack',
        label: 'Export CA Pack',
        description: 'Generate CA Tax Pack CSV with FY breakdown & regime comparison',
        category: 'quickActions',
        icon: <FileSpreadsheet className="h-4 w-4 text-indigo-600" />,
        keywords: ['export', 'ca', 'tax', 'pack', 'csv', 'download', 'chartered accountant'],
        action: () => {
          if (onExportCaPack) {
            onExportCaPack();
          } else {
            window.open('/api/reports/tax-pack/export.csv', '_blank', 'noopener,noreferrer');
          }
        },
      },
      {
        id: 'action-lan-sync',
        label: 'Local Wi-Fi Encrypted Sync',
        description: 'Pair and sync ledger directly across devices on home Wi-Fi',
        category: 'quickActions',
        icon: <Wifi className="h-4 w-4 text-emerald-600" />,
        keywords: ['sync', 'wifi', 'lan', 'phone', 'pair', 'connect', 'device', 'network'],
        action: () => {
          if (onOpenLanSync) onOpenLanSync();
        },
      },
      {
        id: 'action-supabase-sync',
        label: 'Supabase Cloud & Multi-Device Sync',
        description: 'Configure cloud PostgreSQL database, sign in, or sync financial data',
        category: 'quickActions',
        icon: <Cloud className="h-4 w-4 text-blue-600" />,
        keywords: ['supabase', 'cloud', 'sync', 'database', 'multi device', 'backup', 'postgres', 'cloudflare'],
        action: () => {
          if (onOpenCloudSync) onOpenCloudSync();
        },
      },
      {
        id: 'action-seed-data',
        label: 'Seed Demo Financial Data',
        description: 'Populate ledger with realistic sample accounts, loans, and bills',
        category: 'quickActions',
        icon: <Sparkles className="h-4 w-4 text-amber-600" />,
        keywords: ['seed', 'demo', 'sample', 'example', 'populate', 'test data'],
        action: () => {
          if (onSeedData) onSeedData();
        },
      },
      {
        id: 'action-clean-data',
        label: 'Clear All Demo Data (Pristine Clean Slate)',
        description: 'Wipe all sample/demo records and start fresh with empty personal ledger',
        category: 'quickActions',
        icon: <Trash2 className="h-4 w-4 text-red-600" />,
        keywords: ['clear', 'clean', 'wipe', 'delete', 'reset', 'pristine', 'empty', 'junk', 'remove demo'],
        action: () => {
          if (confirm('Are you sure you want to clear all transactions, accounts, and demo records to start fresh?')) {
            if (onCleanData) onCleanData();
          }
        },
      },

      // Workspace Navigation
      {
        id: 'nav-dashboard',
        label: dict.tabs.dashboard || 'Dashboard',
        description: 'Overview of net worth, cashflow, and financial health',
        category: 'workspaces',
        icon: <LayoutDashboard className="h-4 w-4 text-blue-600" />,
        keywords: ['dashboard', 'home', 'overview', 'net worth'],
        action: () => onNavigate('dashboard'),
      },
      {
        id: 'nav-cards',
        label: dict.tabs.cards || 'Credit Cards',
        description: 'High-volume daily spend logging, rapid multi-row entry & credit limits',
        category: 'workspaces',
        icon: <CreditCard className="h-4 w-4 text-blue-600" />,
        keywords: ['cards', 'credit card', 'spends', 'daily spends', 'swipes', 'rewards', 'statement', 'limits'],
        action: () => onNavigate('cards'),
      },
      {
        id: 'nav-money',
        label: dict.tabs.money || 'Bank & Cash',
        description: 'Bank balances, liquidity, bank reconciliation & transfers',
        category: 'workspaces',
        icon: <WalletCards className="h-4 w-4 text-emerald-600" />,
        keywords: ['money', 'accounts', 'banks', 'cash', 'bills', 'transfers', 'reconciliation'],
        action: () => onNavigate('money'),
      },
      {
        id: 'nav-loans-dues',
        label: dict.tabs.loans_dues || 'Loans & Dues',
        description: 'Track loans, EMIs, personal debts & WhatsApp reminders',
        category: 'workspaces',
        icon: <Landmark className="h-4 w-4 text-amber-600" />,
        keywords: ['loans', 'dues', 'debt', 'emi', 'borrowed', 'lent', 'udhar'],
        action: () => onNavigate('loans_dues'),
      },
      {
        id: 'nav-reports',
        label: dict.tabs.reports || 'Reports & Tax',
        description: 'Tax regime comparator, deductions 80C/80D & CSV exports',
        category: 'workspaces',
        icon: <BarChart3 className="h-4 w-4 text-indigo-600" />,
        keywords: ['reports', 'tax', 'regime', 'ca', 'income tax', 'deductions', 'charts'],
        action: () => onNavigate('reports'),
      },
      {
        id: 'nav-notes',
        label: dict.tabs.notes || 'Notes',
        description: 'Checklists, warranties, documentation & ledger memos',
        category: 'workspaces',
        icon: <NotebookPen className="h-4 w-4 text-teal-600" />,
        keywords: ['notes', 'memo', 'checklist', 'docs'],
        action: () => onNavigate('notes'),
      },
      {
        id: 'nav-sheets',
        label: 'Job Sheets Workbook',
        description: 'Google Sheets-style multi-tab job tracker, client billing & auto-sum formulas',
        category: 'workspaces',
        icon: <FileSpreadsheet className="h-4 w-4 text-amber-600" />,
        keywords: ['sheets', 'google sheets', 'jobs', 'multiple jobs', 'spreadsheet', 'tabs', 'workbook'],
        action: () => onNavigate('sheets'),
      },
      {
        id: 'nav-vault',
        label: dict.tabs.vault || 'Password Vault',
        description: 'Client-side PBKDF2/AES-GCM zero-knowledge credential vault',
        category: 'workspaces',
        icon: <Lock className="h-4 w-4 text-indigo-700" />,
        keywords: ['vault', 'passwords', 'secrets', 'credentials', 'aes', 'pin'],
        action: () => onNavigate('vault'),
      },
      {
        id: 'nav-billboard',
        label: 'AI Billboard',
        description: 'Proactive AI advisor alerts, cashflow forecast & debt payoff plans',
        category: 'workspaces',
        icon: <Sparkles className="h-4 w-4 text-sky-600" />,
        keywords: ['ai', 'billboard', 'advisor', 'forecast', 'strategies', 'agent'],
        action: () => {
          if (onNavigateBillboard) {
            onNavigateBillboard();
          } else {
            onNavigate('dashboard');
          }
        },
      },
    ];
  }, [
    dict,
    onNavigate,
    onOpenQuickAdd,
    onOpenAddBank,
    onOpenAddNote,
    onLockApp,
    onLockVault,
    onExportCaPack,
    onNavigateBillboard,
  ]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchLabel || matchDesc || matchKeywords;
    });
  }, [allItems, query]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  // Auto scroll active item into view
  useEffect(() => {
    if (open && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex, open]);

  // Keyboard navigation within the command palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = filteredItems[selectedIndex];
      if (active) {
        onClose();
        active.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={cpDict.title}
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh] sm:pt-[14vh] animate-panel-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden flex flex-col focus:outline-none"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/60 px-4 py-3.5">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            placeholder={cpDict.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear query"
              className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center rounded border border-slate-300/80 bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs font-medium text-slate-500">{cpDict.noResults}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Try searching for dashboard, cards, notes, lock, or export
              </p>
            </div>
          ) : (
            (() => {
              // Group items by category while keeping flat index for keyboard selection
              let currentCategory: string | null = null;
              return filteredItems.map((item, index) => {
                const isFirstInCategory = item.category !== currentCategory;
                currentCategory = item.category;
                const isSelected = index === selectedIndex;
                const categoryLabel =
                  item.category === 'quickActions'
                    ? cpDict.quickActions
                    : cpDict.workspaces;

                return (
                  <React.Fragment key={item.id}>
                    {isFirstInCategory && (
                      <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {categoryLabel}
                      </div>
                    )}
                    <button
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onClose();
                        item.action();
                      }}
                      className={cn(
                        'w-full flex items-center justify-between rounded-xl px-3 py-2 text-left transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-indigo-50/90 text-slate-950 border border-indigo-200/70 shadow-2xs'
                          : 'text-slate-700 hover:bg-slate-100/70 border border-transparent',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg border shrink-0',
                            isSelected
                              ? 'border-indigo-200 bg-white shadow-2xs'
                              : 'border-slate-200/80 bg-slate-50 text-slate-600',
                          )}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {item.label}
                          </div>
                          {item.description && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {item.shortcut ? (
                          <kbd
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold border',
                              isSelected
                                ? 'border-indigo-300/80 bg-white text-indigo-700'
                                : 'border-slate-200 bg-slate-100 text-slate-500',
                            )}
                          >
                            {item.shortcut}
                          </kbd>
                        ) : isSelected ? (
                          <CornerDownLeft className="h-3.5 w-3.5 text-indigo-600" />
                        ) : null}
                      </div>
                    </button>
                  </React.Fragment>
                );
              });
            })()
          )}
        </div>

        {/* Footer Hint Bar */}
        <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-[11px] text-slate-500">
          <span className="truncate">{cpDict.shortcutHint}</span>
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-2 font-medium text-slate-600">
            <kbd className="rounded border border-slate-300/80 bg-slate-200/70 px-1 py-0.5 text-[10px]">
              ↑↓
            </kbd>
            <span>select</span>
            <kbd className="rounded border border-slate-300/80 bg-slate-200/70 px-1 py-0.5 text-[10px]">
              ↵
            </kbd>
            <span>confirm</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
