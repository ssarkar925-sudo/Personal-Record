import {
  ArrowRight,
  CheckSquare,
  CreditCard,
  MessageCircle,
  Square,
  Users,
} from 'lucide-react';
import { formatINR, SCOPE_META, buildWhatsAppLink } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import type { WorkspaceId } from './types.ts';

export interface PortfolioHealthGridProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
  onToggleChecklist: (noteId: string, itemId: string, done: boolean) => void;
}

export function PortfolioHealthGrid({
  data,
  onNavigate,
  onToggleChecklist,
}: PortfolioHealthGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 1. Credit Cards Health Hub (Daylight Studio Cards - NO BLACK CARDS) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Credit Cards Health</h3>
                <p className="text-xs text-slate-500">Utilization & billing cycle radar.</p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('cards')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {data.cards.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-200 rounded-xl">
                No credit cards linked yet.
              </p>
            ) : (
              data.cards.slice(0, 3).map((c) => {
                const cy = c.cardCycle!;
                const isOverdue = cy.daysUntilDue < 0;
                const isDueSoon = cy.daysUntilDue >= 0 && cy.daysUntilDue <= 7;

                return (
                  <div
                    key={c.id}
                    onClick={() => onNavigate('cards')}
                    className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs space-y-2.5 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* EMV Chip Visual */}
                        <div className="w-6 h-4 rounded bg-gradient-to-tr from-amber-300 to-amber-100 border border-amber-400/80 shadow-xs flex items-center justify-center shrink-0">
                          <div className="w-3.5 h-2 border border-amber-600/40 rounded-2xs" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-slate-900 truncate block">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            •••• {c.last4 || '0000'}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isOverdue
                            ? 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse'
                            : isDueSoon
                              ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isOverdue
                          ? `${Math.abs(cy.daysUntilDue)}d Overdue`
                          : isDueSoon
                            ? `Due in ${cy.daysUntilDue}d`
                            : `Due ${cy.nextDueDate}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Billed Due</span>
                        <span className="font-mono font-bold text-slate-900">{formatINR(cy.statementDueMinor)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Unbilled Spend</span>
                        <span className="font-mono font-bold text-indigo-700">{formatINR(cy.unbilledMinor)}</span>
                      </div>
                    </div>

                    {/* Utilization Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            cy.utilizationPct > 50
                              ? 'bg-rose-500'
                              : cy.utilizationPct > 30
                                ? 'bg-amber-500'
                                : 'bg-indigo-600'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, cy.utilizationPct))}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{cy.utilizationPct}% utilized</span>
                        <span>Limit: {formatINR(c.creditLimitMinor, { compact: true })}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 text-center">
          <button
            onClick={() => onNavigate('cards')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            Open Credit Cards Command Center ({data.cards.length} cards) →
          </button>
        </div>
      </div>

      {/* 2. Khatabook People Net Balances */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">People Khatabook</h3>
                <p className="text-xs text-slate-500">Outstanding Udhar & personal balances.</p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('loans_dues')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
            >
              <span>All Dues</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            {data.dueSummariesByPerson.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-200 rounded-xl">
                No active people dues recorded.
              </p>
            ) : (
              data.dueSummariesByPerson.slice(0, 4).map((p) => {
                const isNeed = p.netMinor >= 0;
                const whatsappLink = buildWhatsAppLink(
                  p.phone,
                  `Hi ${p.personName}, gentle reminder regarding our net balance of ${formatINR(Math.abs(p.netMinor))}.`
                );

                return (
                  <div
                    key={p.personName}
                    onClick={() => onNavigate('loans_dues')}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-between cursor-pointer shadow-2xs"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.personName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {p.openCount} open item{p.openCount > 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border block ${
                          isNeed
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {isNeed ? `Owed: +${formatINR(p.netMinor)}` : `Owe: -${formatINR(Math.abs(p.netMinor))}`}
                      </span>

                      {isNeed && p.phone && (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:underline mt-1"
                        >
                          <MessageCircle className="w-3 h-3" /> Nudge
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 text-center">
          <button
            onClick={() => onNavigate('loans_dues')}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer"
          >
            Manage all Khatabook balances →
          </button>
        </div>
      </div>

      {/* 3. Pinned Checklists & Financial Routines */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pinned Routines</h3>
                <p className="text-xs text-slate-500">Monthly financial checklists.</p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('notes')}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Notes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {data.pinnedNotes.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-200 rounded-xl">
                Pin a note or checklist in Notes to track it right here.
              </p>
            ) : (
              data.pinnedNotes.slice(0, 2).map((n) => (
                <div key={n.id} className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">{n.title}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded uppercase bg-slate-100 text-slate-600">
                      {SCOPE_META[n.scope].label}
                    </span>
                  </div>

                  {n.checklist.length > 0 ? (
                    <div className="space-y-1.5">
                      {n.checklist.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void onToggleChecklist(n.id, item.id, !item.done)}
                          className="flex w-full items-center gap-2 text-left text-xs text-slate-700 hover:text-slate-950 cursor-pointer"
                        >
                          {item.done ? (
                            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                          ) : (
                            <Square className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          )}
                          <span className={item.done ? 'line-through text-slate-400' : ''}>{item.text}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    n.body && <p className="text-xs text-slate-600 line-clamp-2">{n.body}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 text-center">
          <button
            onClick={() => onNavigate('notes')}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 cursor-pointer"
          >
            Open Notes & Checklists →
          </button>
        </div>
      </div>
    </div>
  );
}
