import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Calendar,
  CreditCard,
  Filter,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { api, type TransactionRecord } from '../../lib/api.ts';
import { formatDisplayDate, formatINR, SCOPE_META } from '../../lib/format.ts';
import type { Scope } from '../../../shared/ledger-core.ts';
import {
  computeMonthDateRange,
  formatShortMonthLabel,
  summarizeDrillDownTransactions,
} from './dashboardVisuals.ts';
import type { WorkspaceId } from './types.ts';

export interface DrillDownFilterSpec {
  title: string;
  subtitle: string;
  month?: string; // YYYY-MM
  category?: string;
  accountId?: string;
  accountName?: string;
}

export interface LedgerDrillDownDrawerProps {
  filter: DrillDownFilterSpec | null;
  scopeFilter: Scope | 'all';
  onClose: () => void;
  onOpenQuickAdd: () => void;
  onNavigate: (tab: WorkspaceId) => void;
}

export function LedgerDrillDownDrawer({
  filter,
  scopeFilter,
  onClose,
  onOpenQuickAdd,
  onNavigate,
}: LedgerDrillDownDrawerProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!filter) return;
    let cancelled = false;
    setLoading(true);

    const dateBounds = filter.month ? computeMonthDateRange(filter.month) : undefined;
    api
      .getTransactions({
        scope: scopeFilter === 'all' ? undefined : scopeFilter,
        accountId: filter.accountId,
        fromDate: dateBounds?.fromDate,
        toDate: dateBounds?.toDate,
      })
      .then((rows) => {
        if (cancelled) return;
        const filteredRows = filter.category
          ? rows.filter((r) => r.category.toLowerCase() === filter.category!.toLowerCase())
          : rows;
        setTransactions(filteredRows);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, scopeFilter]);

  useEffect(() => {
    if (!filter) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filter, onClose]);

  const displayedTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (kindFilter !== 'all' && tx.kind !== kindFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchParty = (tx.party || '').toLowerCase().includes(q);
        const matchCat = (tx.category || '').toLowerCase().includes(q);
        const matchNote = (tx.note || '').toLowerCase().includes(q);
        const matchAcc = (tx.accountName || '').toLowerCase().includes(q);
        if (!matchParty && !matchCat && !matchNote && !matchAcc) return false;
      }
      return true;
    });
  }, [transactions, kindFilter, searchQuery]);

  const summary = useMemo(
    () => summarizeDrillDownTransactions(displayedTransactions),
    [displayedTransactions],
  );

  if (!filter) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111318]/45 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={filter.title}
    >
      <div
        className="relative w-full max-w-xl bg-[#FAF8F5] border-l border-[#EAE5DC] h-full flex flex-col justify-between shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Obsidian & Champagne Gold Executive Header */}
        <div className="bg-[#111318] text-[#FAF8F5] p-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#E5C158]/15 border border-[#E5C158]/35 px-2 py-0.5 text-[10px] font-mono-data uppercase tracking-widest text-[#E5C158] font-semibold">
                  <Sparkles className="w-3 h-3" />
                  Executive Ledger Inspector
                </span>
                {filter.month && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono-data text-white/80">
                    <Calendar className="w-3 h-3 text-[#E5C158]" />
                    {formatShortMonthLabel(filter.month)}
                  </span>
                )}
                {filter.category && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-mono-data text-emerald-300">
                    <Layers className="w-3 h-3" />
                    {filter.category}
                  </span>
                )}
                {filter.accountName && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono-data text-white/85">
                    <CreditCard className="w-3 h-3 text-[#E5C158]" />
                    {filter.accountName}
                  </span>
                )}
              </div>
              <h2 className="font-display text-xl font-bold tracking-tight text-white mt-2">
                {filter.title}
              </h2>
              <p className="text-xs text-white/65 mt-0.5">{filter.subtitle}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ledger Inspector"
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3-Column Telemetry Strip inside Drawer Header */}
          <div className="grid grid-cols-3 gap-2.5 mt-4 pt-3.5 border-t border-white/10">
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <div className="text-[10px] font-mono-data uppercase tracking-wider text-white/60 flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-400" /> Inflow
              </div>
              <div className="text-sm font-bold font-mono-data text-emerald-400 tabular-nums mt-0.5">
                {formatINR(summary.inflowMinor, { compact: true })}
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <div className="text-[10px] font-mono-data uppercase tracking-wider text-white/60 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-[#E5C158]" /> Outflow
              </div>
              <div className="text-sm font-bold font-mono-data text-[#E5C158] tabular-nums mt-0.5">
                {formatINR(summary.outflowMinor, { compact: true })}
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <div className="text-[10px] font-mono-data uppercase tracking-wider text-white/60">
                Net Position
              </div>
              <div
                className={`text-sm font-bold font-mono-data tabular-nums mt-0.5 ${
                  summary.netMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatINR(summary.netMinor, { compact: true, signed: true })}
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 bg-white border-b border-[#EAE5DC] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs">
              {(
                [
                  ['all', 'All'],
                  ['income', 'Inflow'],
                  ['expense', 'Outflow'],
                  ['transfer', 'Transfers'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKindFilter(id)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                    kindFilter === id
                      ? 'bg-[#111318] text-[#FAF8F5]'
                      : 'text-[#52504C] hover:text-[#111318]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-mono-data text-[#858078]">
              {displayedTransactions.length} {displayedTransactions.length === 1 ? 'Entry' : 'Entries'}
              {summary.topCategory ? ` · Top: ${summary.topCategory}` : ''}
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#858078] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by merchant, category, account, or memo..."
              className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] pl-8 pr-3 py-1.5 text-xs text-[#111318] placeholder:text-[#858078] focus:outline-none focus:border-[#111318]"
            />
          </div>
        </div>

        {/* Scrollable Double-Entry Ledger List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="space-y-2.5 py-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 rounded-xl bg-[#EAE5DC]/60 animate-pulse border border-[#EAE5DC]"
                />
              ))}
            </div>
          ) : displayedTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D6CFC2] bg-white p-8 text-center space-y-2 my-6">
              <Filter className="w-6 h-6 text-[#858078] mx-auto" />
              <div className="text-sm font-semibold text-[#111318]">
                No Matching Ledger Entries
              </div>
              <p className="text-xs text-[#52504C] max-w-xs mx-auto">
                No double-entry transactions matched this filter window. You can record a new transaction or switch periods.
              </p>
            </div>
          ) : (
            displayedTransactions.map((tx) => {
              const isIncome = tx.kind === 'income';
              const isTransfer = tx.kind === 'transfer';
              return (
                <div
                  key={tx.id}
                  className="bento-card rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-[#C59B27]/50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isIncome
                          ? 'bg-emerald-50 text-[#059669] border border-emerald-200'
                          : isTransfer
                            ? 'bg-[#F3EFEA] text-[#52504C] border border-[#D6CFC2]'
                            : 'bg-amber-50/80 text-[#9A7B2C] border border-amber-200'
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : isTransfer ? (
                        <ArrowRightLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[#111318] truncate">
                          {tx.party || tx.category}
                        </span>
                        <span className="text-[10px] font-mono-data px-1.5 py-0.5 rounded bg-[#F3EFEA] text-[#52504C] border border-[#EAE5DC]">
                          {tx.category}
                        </span>
                        <span className="text-[10px] font-mono-data text-[#858078]">
                          · {SCOPE_META[tx.scope].label}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#52504C] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-[#111318]">{tx.accountName}</span>
                        {tx.toAccountName && (
                          <span>→ {tx.toAccountName}</span>
                        )}
                        <span>·</span>
                        <span className="font-mono-data text-[10px] text-[#858078]">
                          {formatDisplayDate(tx.occurredAt) || tx.occurredAt}
                        </span>
                      </div>

                      {tx.note && (
                        <div className="text-[11px] text-[#858078] truncate mt-0.5 italic">
                          &ldquo;{tx.note}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-bold font-mono-data tabular-nums ${
                        isIncome
                          ? 'text-[#059669]'
                          : isTransfer
                            ? 'text-[#52504C]'
                            : 'text-[#111318]'
                      }`}
                    >
                      {isIncome ? '+' : isTransfer ? '' : '-'}
                      {formatINR(tx.amountMinor)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-[#EAE5DC] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenQuickAdd();
            }}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#E5C158]" />
            <span>Record New Entry</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigate('reports');
            }}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-[#F3EFEA] hover:bg-[#EAE5DC] text-[#111318] text-xs font-semibold transition-colors cursor-pointer border border-[#EAE5DC]"
          >
            <span>Open Full P&amp;L Reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
