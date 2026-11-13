import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Landmark,
  MessageCircle,
  Users,
} from 'lucide-react';
import { formatINR, buildWhatsAppLink } from '../../lib/format.ts';
import type {
  LoanRecord,
  PersonDueRecord,
  PersonNetSummary,
} from '../../lib/api.ts';
import type { SelectedLoansItem } from './types.ts';

export interface SettlementStreamProps {
  selectedItem: SelectedLoansItem;
  dueSummaries: PersonNetSummary[];
  dues: PersonDueRecord[];
  loans?: LoanRecord[];
  onOpenSettleDue: (due: PersonDueRecord) => void;
  onOpenPayEmi: (loan: LoanRecord) => void;
  onExportCSV: () => void;
}

export function SettlementStream({
  selectedItem,
  dueSummaries,
  dues,
  onOpenSettleDue,
  onOpenPayEmi,
  onExportCSV,
}: SettlementStreamProps) {
  // 1. If a specific Person Due is selected: show all dues associated with this person
  if (selectedItem?.kind === 'due') {
    const personName = selectedItem.data.personName;
    const personDues = dues.filter((d) => d.personName.toLowerCase() === personName.toLowerCase());

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Khatabook Ledger History for {personName}
            </h4>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {personDues.length} Records
            </span>
          </div>
          <button
            onClick={onExportCSV}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="space-y-2">
          {personDues.map((d) => {
            const isNeed = d.direction === 'need';
            const isSettled = d.status === 'settled';

            return (
              <div
                key={d.id}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isSettled ? 'bg-slate-200 text-slate-500' : isNeed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isNeed ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block">
                      {d.note || (isNeed ? 'Lent / Advance' : 'Borrowed / Bill Split')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {d.dueDate ? `Due date: ${d.dueDate}` : 'No due date'} · Scope: {d.scope}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold block ${
                        isSettled ? 'text-slate-400 line-through' : isNeed ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatINR(d.remainingMinor)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {isSettled ? 'Settled' : `of ${formatINR(d.amountMinor)}`}
                    </span>
                  </div>

                  {!isSettled && (
                    <button
                      onClick={() => onOpenSettleDue(d)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      Settle
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. If a specific Loan is selected: show EMI schedule overview
  if (selectedItem?.kind === 'loan') {
    const loan = selectedItem.data;
    const paidMinor = Math.max(0, loan.principalMinor - loan.remainingMinor);

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Loan Repayment Structure: {loan.name}
            </h4>
          </div>
          <button
            onClick={onExportCSV}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Principal Borrowed</span>
            <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">{formatINR(loan.principalMinor)}</span>
            <span className="text-[11px] text-slate-500 mt-1 block">Already paid back: {formatINR(paidMinor)}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining Balance</span>
            <span className="text-lg font-bold font-mono text-blue-700 mt-0.5 block">{formatINR(loan.remainingMinor)}</span>
            <span className="text-[11px] text-slate-500 mt-1 block">Next payment due: {loan.nextDueDate}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-blue-950 block">Monthly Installment Due</span>
            <span className="text-[11px] text-blue-800/80">Scheduled auto-debit or manual repayment</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-blue-900">{formatINR(loan.emiMinor)}</span>
            {loan.status !== 'closed' && (
              <button
                onClick={() => onOpenPayEmi(loan)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Pay Now
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Default: Overview of Per-Person Net Summaries (Khatabook Balance Cards)
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-600" />
          <h4 className="text-sm font-bold text-slate-900">
            Khatabook Net Position by Person
          </h4>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {dueSummaries.length} People
          </span>
        </div>

        <button
          onClick={onExportCSV}
          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {dueSummaries.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200">
          No pending people dues recorded. All borrowing and lending balances are even.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dueSummaries.map((p) => {
            const isNeed = p.netMinor >= 0;
            const whatsappLink = buildWhatsAppLink(
              p.phone,
              `Hi ${p.personName}, gentle reminder regarding our net balance of ${formatINR(Math.abs(p.netMinor))}.`
            );

            return (
              <div
                key={p.personName}
                className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between space-y-2 hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {p.personName}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border ${
                        isNeed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {isNeed ? `Owed to You: ${formatINR(p.netMinor)}` : `You Owe: ${formatINR(Math.abs(p.netMinor))}`}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Owed to You: <strong>{formatINR(p.totalNeedMinor, { compact: true })}</strong>
                    </span>
                    <span>
                      You Owe: <strong>{formatINR(p.totalGiveMinor, { compact: true })}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    {p.openCount} Open Item{p.openCount > 1 ? 's' : ''}
                  </span>

                  {isNeed && p.phone && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp Nudge</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
