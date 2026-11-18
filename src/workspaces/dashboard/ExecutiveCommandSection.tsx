import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  Plus,
  Zap,
} from 'lucide-react';
import { formatDisplayDateShort, formatINR } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import type { DrillDownFilterSpec } from './LedgerDrillDownDrawer.tsx';
import type { WorkspaceId } from './types.ts';

export interface ExecutiveCommandSectionProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
  onOpenAgent: (commandText?: string) => void;
  onInspectDrillDown?: (spec: DrillDownFilterSpec) => void;
}

export function ExecutiveCommandSection({
  data,
  onNavigate,
  onOpenQuickAdd,
  onOpenAgent,
  onInspectDrillDown,
}: ExecutiveCommandSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'queue' | 'ledger'>('queue');
  const queue = data.attentionQueue;
  const recentTxs = data.recentTransactions ?? [];

  return (
    <section className="bento-card rounded-2xl p-5 flex flex-col justify-between h-full">
      <div>
        {/* Header with Segmented Switcher: Priority Queue vs Live Ledger */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#EAE5DC]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] block font-semibold">
                Triage &amp; Stream
              </span>
              <h3 className="font-display text-sm font-bold text-[#111318] truncate">
                {activeSubTab === 'queue' ? 'Priority Action Queue' : 'Live Double-Entry Stream'}
              </h3>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Action Queue or Live Ledger"
            className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-[11px] shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'queue'}
              onClick={() => setActiveSubTab('queue')}
              className={`rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer ${
                activeSubTab === 'queue'
                  ? 'bg-[#111318] text-[#FAF8F5]'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Queue ({queue.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'ledger'}
              onClick={() => setActiveSubTab('ledger')}
              className={`rounded-lg px-2 py-1 font-semibold transition-all cursor-pointer ${
                activeSubTab === 'ledger'
                  ? 'bg-[#111318] text-[#FAF8F5]'
                  : 'text-[#52504C] hover:text-[#111318]'
              }`}
            >
              Ledger ({recentTxs.length})
            </button>
          </div>
        </div>

        {/* Stream Content */}
        {activeSubTab === 'queue' ? (
          <div className="mt-3.5 space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {queue.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-[#059669] mx-auto" />
                <div className="text-xs font-semibold text-[#111318]">All Settlements Current</div>
                <p className="text-[11px] text-[#52504C]">
                  Card cycles, recurring bills, and EMIs are reconciled.
                </p>
              </div>
            ) : (
              queue.slice(0, 4).map((item) => {
                const targetTab: WorkspaceId =
                  item.module === 'credit_cards'
                    ? 'cards'
                    : item.module === 'banks' || item.module === 'recurring'
                      ? 'money'
                      : item.module === 'loans' || item.module === 'people_dues'
                        ? 'loans_dues'
                        : 'notes';

                const isUrgent = item.severity === 'urgent';

                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(targetTab)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNavigate(targetTab);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isUrgent
                        ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
                        : 'border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          isUrgent ? 'text-[#E11D48]' : 'text-[#C59B27]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#111318] truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#52504C] truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.amountMinor !== undefined && (
                        <span className="font-mono-data text-xs font-bold text-[#111318] tabular-nums">
                          {formatINR(item.amountMinor, { compact: true })}
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-[#858078]" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Live Double-Entry Ledger Stream */
          <div className="mt-3.5 space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {recentTxs.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] space-y-1.5">
                <div className="text-xs font-semibold text-[#111318]">No Recent Entries</div>
                <p className="text-[11px] text-[#52504C]">
                  Record an income, expense, or transfer to populate the live stream.
                </p>
              </div>
            ) : (
              recentTxs.slice(0, 5).map((tx) => {
                const isIncome = tx.kind === 'income';
                const isTransfer = tx.kind === 'transfer';
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() =>
                      onInspectDrillDown?.({
                        title: `${tx.category} · Ledger Audit`,
                        subtitle: `Inspecting recent entries matching ${tx.category}`,
                        month: tx.occurredAt.slice(0, 7),
                        category: tx.category,
                      })
                    }
                    className="w-full p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] transition-colors cursor-pointer flex items-center justify-between gap-2 text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isIncome
                            ? 'bg-emerald-50 text-[#059669] border border-emerald-200'
                            : isTransfer
                              ? 'bg-[#F3EFEA] text-[#52504C] border border-[#D6CFC2]'
                              : 'bg-amber-50/80 text-[#9A7B2C] border border-amber-200'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : isTransfer ? (
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#111318] truncate">
                          {tx.party || tx.category}
                        </div>
                        <div className="text-[10px] text-[#858078] truncate">
                          {tx.accountName} · {formatDisplayDateShort(tx.occurredAt) || tx.occurredAt}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`font-mono-data text-xs font-bold tabular-nums shrink-0 ${
                        isIncome ? 'text-[#059669]' : 'text-[#111318]'
                      }`}
                    >
                      {isIncome ? '+' : isTransfer ? '' : '-'}
                      {formatINR(tx.amountMinor, { compact: true })}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Rapid Execution Shortcuts */}
        <div className="mt-4 pt-3.5 border-t border-[#EAE5DC]">
          <div className="text-[10px] font-mono-data uppercase tracking-widest text-[#858078] font-semibold mb-2.5">
            Direct Desk Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#059669]/12 text-[#059669] flex items-center justify-center shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">Record Entry</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('cards')}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#111318]/10 text-[#111318] flex items-center justify-center shrink-0">
                <CreditCard className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">Settle Card</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('loans_dues')}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#C59B27]/15 text-[#9A7B2C] flex items-center justify-center shrink-0">
                <Landmark className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">Log Udhar / EMI</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#059669]/12 text-[#059669] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">CA Tax Pack</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAgent('Give me a full financial audit summary')}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">Advisor Audit</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('vault')}
              className="p-2.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-left flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-[#F3EFEA] text-[#52504C] border border-[#D6CFC2] flex items-center justify-center shrink-0">
                <KeyRound className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#111318] truncate">Crypto Vault</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3.5 pt-2.5 border-t border-[#EAE5DC] flex items-center justify-between text-[11px] text-[#858078]">
        <span>Shortcut: Ctrl+Q for Quick Capture</span>
        <button
          type="button"
          onClick={() =>
            onInspectDrillDown
              ? onInspectDrillDown({
                  title: 'Full Current Month Ledger',
                  subtitle: `All transactions recorded in ${data.referenceDate.slice(0, 7)}`,
                  month: data.referenceDate.slice(0, 7),
                })
              : onNavigate('money')
          }
          className="font-semibold text-[#111318] hover:underline cursor-pointer"
        >
          Inspect Month Ledger →
        </button>
      </div>
    </section>
  );
}
