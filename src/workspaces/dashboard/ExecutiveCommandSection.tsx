import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  Plus,
  Zap,
} from 'lucide-react';
import { formatINR } from '../../lib/format.ts';
import type { DashboardSummary } from '../../lib/api.ts';
import type { WorkspaceId } from './types.ts';

export interface ExecutiveCommandSectionProps {
  data: DashboardSummary;
  onNavigate: (tab: WorkspaceId) => void;
  onOpenQuickAdd: () => void;
  onOpenAgent: (commandText?: string) => void;
}

export function ExecutiveCommandSection({
  data,
  onNavigate,
  onOpenQuickAdd,
  onOpenAgent,
}: ExecutiveCommandSectionProps) {
  const queue = data.attentionQueue;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* 1. Action Needed Radar Queue (col-span-7) */}
      <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Financial Command Radar & Action Queue
                </h3>
                <p className="text-xs text-slate-500">
                  Prioritized triage items requiring immediate settlement, review, or payment.
                </p>
              </div>
            </div>

            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80">
              {queue.length} Pending
            </span>
          </div>

          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
            {queue.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
                All bills, credit card statements, and loan EMIs are settled and current. No actions required.
              </div>
            ) : (
              queue.map((item) => {
                const targetTab: WorkspaceId =
                  item.module === 'credit_cards'
                    ? 'cards'
                    : item.module === 'banks' || item.module === 'recurring'
                      ? 'money'
                      : item.module === 'loans' || item.module === 'people_dues'
                        ? 'loans_dues'
                        : 'notes';

                const isUrgent = item.severity === 'urgent';
                const isWarning = item.severity === 'warning';

                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(targetTab)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isUrgent
                        ? 'border-rose-200 bg-rose-50/60 hover:bg-rose-50'
                        : isWarning
                          ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isUrgent
                            ? 'bg-rose-100 text-rose-700'
                            : isWarning
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                          <span>{item.title}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              isUrgent
                                ? 'bg-rose-100 text-rose-800'
                                : isWarning
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.severity}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {item.amountMinor !== undefined && (
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {formatINR(item.amountMinor, { decimals: false })}
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Click any item to resolve directly in its workspace</span>
          <button
            onClick={() => onNavigate('money')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Open Banking Hub →
          </button>
        </div>
      </div>

      {/* 2. Quick Action Launchpad (col-span-5) */}
      <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Quick Actions Launchpad</h3>
                <p className="text-xs text-slate-500">Fast shortcuts for daily financial routines.</p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              onClick={onOpenQuickAdd}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">Record Transaction</span>
                <span className="text-[10px] text-slate-500">Expense, income, or transfer</span>
              </div>
            </button>

            <button
              onClick={() => onNavigate('cards')}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">Pay Card Bill</span>
                <span className="text-[10px] text-slate-500">Reconcile statement cycle</span>
              </div>
            </button>

            <button
              onClick={() => onNavigate('loans_dues')}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">Record EMI / Due</span>
                <span className="text-[10px] text-slate-500">Settle Khatabook borrowing</span>
              </div>
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">CA Tax Pack</span>
                <span className="text-[10px] text-slate-500">Export audit spreadsheet</span>
              </div>
            </button>

            <button
              onClick={() => onOpenAgent('Give me a full financial audit summary')}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">AI Advisor Audit</span>
                <span className="text-[10px] text-slate-500">Diagnose cash flow & leaks</span>
              </div>
            </button>

            <button
              onClick={() => onNavigate('vault')}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left flex items-start gap-2.5 cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-slate-900 block">Password Vault</span>
                <span className="text-[10px] text-slate-500">Zero-knowledge secrets</span>
              </div>
            </button>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
          Keyboard shortcut: press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono font-bold">Q</kbd> anywhere for Quick Add
        </div>
      </div>
    </div>
  );
}
