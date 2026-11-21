import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Landmark,
  MessageCircle,
  Users,
} from 'lucide-react';
import { buildWhatsAppLink, formatINR } from '../../lib/format.ts';
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
    const personDues = (dues || []).filter(
      (d) => (d.personName || '').toLowerCase() === (personName || '').toLowerCase(),
    );

    return (
      <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#059669]" />
            <h4 className="font-display text-sm font-bold text-[#111318]">
              Khatabook Ledger History for {personName}
            </h4>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] border border-[#E6E1D6]">
              {personDues.length} Records
            </span>
          </div>
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3 py-1.5 text-xs font-semibold text-[#111318] bg-[#FAF8F5] hover:bg-[#F3EFEA] rounded-xl border border-[#E6E1D6] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#C59B27]" />
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
                className="p-3.5 rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isSettled
                        ? 'bg-[#F3EFEA] text-[#52504C]'
                        : isNeed
                          ? 'bg-[#059669]/12 text-[#059669]'
                          : 'bg-[#E11D48]/12 text-[#E11D48]'
                    }`}
                  >
                    {isNeed ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-[#111318] block">
                      {d.note || (isNeed ? 'Lent / Advance' : 'Borrowed / Bill Split')}
                    </span>
                    <span className="text-[11px] text-[#52504C]">
                      {d.dueDate ? `Due date: ${d.dueDate}` : 'No due date'} · Scope: {d.scope}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold block ${
                        isSettled
                          ? 'text-[#52504C] line-through'
                          : isNeed
                            ? 'text-[#059669]'
                            : 'text-[#E11D48]'
                      }`}
                    >
                      {formatINR(d.remainingMinor)}
                    </span>
                    <span className="text-[10px] text-[#52504C] font-mono">
                      {isSettled ? 'Settled' : `of ${formatINR(d.amountMinor)}`}
                    </span>
                  </div>

                  {!isSettled && (
                    <button
                      type="button"
                      onClick={() => onOpenSettleDue(d)}
                      className="px-2.5 py-1 bg-[#059669] hover:bg-[#047857] text-white font-semibold text-[11px] rounded-xl transition-colors cursor-pointer"
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
      <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#C59B27]" />
            <h4 className="font-display text-sm font-bold text-[#111318]">
              Loan Repayment Structure: {loan.name}
            </h4>
          </div>
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3 py-1.5 text-xs font-semibold text-[#111318] bg-[#FAF8F5] hover:bg-[#F3EFEA] rounded-xl border border-[#E6E1D6] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#C59B27]" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Total Principal Borrowed
            </span>
            <span className="text-lg font-bold font-mono-data text-[#111318] mt-0.5 block">
              {formatINR(loan.principalMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-1 block">
              Already paid back: {formatINR(paidMinor)}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E6E1D6]">
            <span className="text-[10px] font-mono uppercase font-bold text-[#52504C] block">
              Remaining Balance
            </span>
            <span className="text-lg font-bold font-mono-data text-[#C59B27] mt-0.5 block">
              {formatINR(loan.remainingMinor)}
            </span>
            <span className="text-[11px] text-[#52504C] mt-1 block">
              Next payment due: {loan.nextDueDate}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl border border-[#C59B27]/35 bg-[#FAF8F5] flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-[#111318] block">Monthly Installment Due</span>
            <span className="text-[11px] text-[#52504C]">
              Scheduled auto-debit or manual repayment
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-[#111318]">
              {formatINR(loan.emiMinor)}
            </span>
            {loan.status !== 'closed' && (
              <button
                type="button"
                onClick={() => onOpenPayEmi(loan)}
                className="px-3 py-1.5 bg-[#111318] hover:bg-[#232730] text-[#FAF8F5] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
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
    <div className="bg-white rounded-3xl border border-[#E6E1D6] shadow-[0_8px_24px_rgba(17,19,24,0.03)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#059669]" />
          <h4 className="font-display text-sm font-bold text-[#111318]">
            Khatabook Net Position by Person
          </h4>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[#F3EFEA] text-[#52504C] border border-[#E6E1D6]">
            {(dueSummaries || []).length} People
          </span>
        </div>

        <button
          type="button"
          onClick={onExportCSV}
          className="px-3 py-1.5 text-xs font-semibold text-[#111318] bg-[#FAF8F5] hover:bg-[#F3EFEA] rounded-xl border border-[#E6E1D6] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-[#C59B27]" />
          <span>Export CSV</span>
        </button>
      </div>

      {(dueSummaries || []).length === 0 ? (
        <div className="p-8 text-center text-xs text-[#52504C] rounded-2xl border border-dashed border-[#E6E1D6] bg-[#FAF8F5]">
          No pending people dues recorded. All borrowing and lending balances are even.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(dueSummaries || []).map((p) => {
            const isNeed = p.netMinor >= 0;
            const whatsappLink = buildWhatsAppLink(
              p.phone,
              `Hi ${p.personName}, gentle reminder regarding our net balance of ${formatINR(Math.abs(p.netMinor))}.`,
            );

            return (
              <div
                key={p.personName}
                className="p-3.5 rounded-2xl border border-[#E6E1D6] bg-[#FAF8F5] flex flex-col justify-between space-y-2.5 hover:border-[#C59B27] transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#111318] flex items-center gap-1.5 truncate">
                      <Users className="w-3.5 h-3.5 text-[#52504C] shrink-0" />
                      <span className="truncate">{p.personName}</span>
                    </span>
                    <span
                      className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                        isNeed
                          ? 'bg-[#059669]/10 text-[#059669] border-[#059669]/25'
                          : 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/25'
                      }`}
                    >
                      {isNeed
                        ? `Owed: ${formatINR(p.netMinor)}`
                        : `You Owe: ${formatINR(Math.abs(p.netMinor))}`}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-[#52504C] font-mono">
                    <span>
                      Receivable: <strong>{formatINR(p.totalNeedMinor, { compact: true })}</strong>
                    </span>
                    <span>
                      Payable: <strong>{formatINR(p.totalGiveMinor, { compact: true })}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E6E1D6]/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#52504C]">
                    {p.openCount} Open Item{p.openCount > 1 ? 's' : ''}
                  </span>

                  {isNeed && p.phone && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#059669] hover:underline cursor-pointer"
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
