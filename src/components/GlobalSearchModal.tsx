import { useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  ArrowRight,
  WalletCards,
  NotebookPen,
  Landmark,
  Lock,
  Target,
  TrendingUp,
  LayoutDashboard,
  BarChart3,
  Plus,
} from 'lucide-react';
import { api, type GlobalSearchResult } from '../lib/api.ts';
import { formatINR, SCOPE_META } from '../lib/format.ts';
import { Badge, Modal } from './ui/Primitives.tsx';
import type { WorkspaceId } from '../workspaces/DashboardView.tsx';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
}

export function GlobalSearchModal({ open, onClose, onNavigate, onOpenQuickAdd }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .globalSearch(trimmed)
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => {
          if (!cancelled) setResults(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const hasAnyResults =
    results &&
    (results.transactions.length > 0 ||
      results.notes.length > 0 ||
      results.dues.length > 0 ||
      results.loans.length > 0 ||
      results.vault.length > 0 ||
      results.goals.length > 0 ||
      results.investments.length > 0);

  const handleSelectNav = (tab: WorkspaceId) => {
    onNavigate(tab);
    onClose();
  };

  const handleSelectQuickAdd = () => {
    onClose();
    onOpenQuickAdd();
  };

  return (
    <Modal open={open} onClose={onClose} title="Global Search" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-slate-200 pb-3">
          <Search className="absolute left-1 h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent pl-8 pr-8 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            placeholder="Search transactions, notes, dues, loans, vault, goals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="absolute right-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              ESC
            </span>
          )}
        </div>

        {/* Empty Query Default: Quick Navigation & Actions */}
        {!query.trim() && (
          <div className="space-y-4 py-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Quick Navigation
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectNav('dashboard')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <LayoutDashboard className="h-4 w-4 text-blue-600" />
                  <span>Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNav('money')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <WalletCards className="h-4 w-4 text-emerald-600" />
                  <span>Money &amp; Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNav('loans_dues')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <Landmark className="h-4 w-4 text-amber-600" />
                  <span>Loans &amp; Dues</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNav('reports')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <BarChart3 className="h-4 w-4 text-indigo-600" />
                  <span>Reports</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNav('notes')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <NotebookPen className="h-4 w-4 text-teal-600" />
                  <span>Notes &amp; Lists</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNav('vault')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <Lock className="h-4 w-4 text-indigo-700" />
                  <span>Password Vault</span>
                </button>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Actions
              </div>
              <button
                type="button"
                onClick={handleSelectQuickAdd}
                className="w-full flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-xs font-medium text-blue-900 hover:bg-blue-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-blue-700" />
                  <span>Record Transaction, Bill, or Note (+ Quick Add)</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-blue-600" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="py-8 text-center text-xs text-slate-500">
            Searching across Personal, Business, and Family modules...
          </div>
        )}

        {/* Results Container */}
        {!loading && query.trim() && (
          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1 divide-y divide-slate-100">
            {!hasAnyResults && (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching items found for &ldquo;<span className="font-semibold">{query}</span>&rdquo;.
              </div>
            )}

            {/* Transactions Section */}
            {results && results.transactions.length > 0 && (
              <div className="space-y-2 pt-2 first:pt-0">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <WalletCards className="h-3.5 w-3.5 text-emerald-600" />
                    Transactions ({results.transactions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectNav('money')}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5">
                  {results.transactions.map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => handleSelectNav('money')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge className={SCOPE_META[tx.scope].badgeClass}>{SCOPE_META[tx.scope].label}</Badge>
                        <div className="truncate">
                          <span className="font-medium text-slate-900">{tx.category}</span>
                          {(tx.party || tx.note) && (
                            <span className="text-slate-500 ml-1.5 truncate">
                              · {[tx.party, tx.note].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 ml-1.5">({tx.accountName} · {tx.occurredAt})</span>
                        </div>
                      </div>
                      <div
                        className={`font-semibold tabular-nums ml-2 whitespace-nowrap ${
                          tx.kind === 'income'
                            ? 'text-emerald-700'
                            : tx.kind === 'expense'
                              ? 'text-rose-700'
                              : 'text-blue-700'
                        }`}
                      >
                        {tx.kind === 'income' ? '+' : tx.kind === 'expense' ? '-' : ''}
                        {formatINR(tx.amountMinor)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes & Checklists */}
            {results && results.notes.length > 0 && (
              <div className="space-y-2 pt-3 first:pt-0">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <NotebookPen className="h-3.5 w-3.5 text-teal-600" />
                    Notes &amp; Checklists ({results.notes.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectNav('notes')}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5">
                  {results.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSelectNav('notes')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="truncate pr-2">
                        <span className="font-medium text-slate-900">{n.title}</span>
                        {n.content && <span className="text-slate-500 ml-1.5 truncate">· {n.content}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {n.isChecklist && (
                          <span className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                            {n.checklistDoneCount}/{n.checklistCount} done
                          </span>
                        )}
                        <Badge className={SCOPE_META[n.scope].badgeClass}>{SCOPE_META[n.scope].label}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* People Dues */}
            {results && results.dues.length > 0 && (
              <div className="space-y-2 pt-3 first:pt-0">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-amber-600" />
                    People Dues ({results.dues.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectNav('loans_dues')}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5">
                  {results.dues.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleSelectNav('loans_dues')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          className={
                            d.direction === 'need'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }
                        >
                          {d.direction === 'need' ? 'Owes you' : 'You owe'}
                        </Badge>
                        <span className="font-medium text-slate-900 truncate">{d.personName}</span>
                        {d.note && <span className="text-slate-500 truncate text-[11px]">({d.note})</span>}
                      </div>
                      <div className="font-semibold tabular-nums text-slate-900 ml-2">
                        {formatINR(d.remainingMinor)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loans */}
            {results && results.loans.length > 0 && (
              <div className="space-y-2 pt-3 first:pt-0">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-blue-600" />
                    Loans ({results.loans.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectNav('loans_dues')}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5">
                  {results.loans.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => handleSelectNav('loans_dues')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="truncate pr-2">
                        <span className="font-medium text-slate-900">{l.name}</span>
                        <span className="text-slate-500 ml-1.5 text-[11px]">· {l.counterparty}</span>
                      </div>
                      <div className="font-semibold tabular-nums text-slate-900 shrink-0">
                        {formatINR(l.remainingMinor)} remaining
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Password Vault */}
            {results && results.vault.length > 0 && (
              <div className="space-y-2 pt-3 first:pt-0">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-indigo-700" />
                    Password Vault Logins ({results.vault.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectNav('vault')}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-1.5">
                  {results.vault.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectNav('vault')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-medium text-slate-900">{v.label}</span>
                        <Badge className="bg-slate-100 text-slate-700">{v.category}</Badge>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">Rotated {v.lastRotatedAt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Savings Goals & Investments */}
            {results && (results.goals.length > 0 || results.investments.length > 0) && (
              <div className="space-y-2 pt-3 first:pt-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-emerald-600" />
                  Goals &amp; Investments
                </div>
                <div className="space-y-1.5">
                  {results.goals.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => handleSelectNav('money')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Target className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="font-medium text-slate-900">{g.title}</span>
                      </div>
                      <div className="font-semibold tabular-nums text-slate-700 shrink-0">
                        {formatINR(g.currentMinor)} / {formatINR(g.targetMinor)}
                      </div>
                    </button>
                  ))}
                  {results.investments.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => handleSelectNav('dashboard')}
                      className="w-full flex items-center justify-between rounded-lg border border-slate-200/70 bg-white p-2 text-left text-xs hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-medium text-slate-900">{i.title}</span>
                        <Badge className="bg-blue-50 text-blue-700">{i.kind}</Badge>
                      </div>
                      <div className="font-semibold tabular-nums text-emerald-700 shrink-0">
                        {formatINR(i.currentValueMinor)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
