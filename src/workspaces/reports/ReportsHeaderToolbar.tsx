import React from 'react';
import { Calendar, Download, Printer } from 'lucide-react';
import type { Scope } from '../../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../../shared/i18n.ts';
import type { DatePreset } from './types.ts';

interface ReportsHeaderToolbarProps {
  fromDate: string;
  toDate: string;
  scope: Scope | 'all';
  systemLanguage?: AppLanguage;
  onFromDateChange: (val: string) => void;
  onToDateChange: (val: string) => void;
  onScopeChange: (val: Scope | 'all') => void;
  onApplyPreset: (preset: DatePreset) => void;
  exportUrl: string;
}

export const ReportsHeaderToolbar: React.FC<ReportsHeaderToolbarProps> = ({
  fromDate,
  toDate,
  scope,
  systemLanguage = 'en',
  onFromDateChange,
  onToDateChange,
  onScopeChange,
  onApplyPreset,
  exportUrl,
}) => {
  const dict = UI_STRINGS[systemLanguage];

  return (
    <div className="rounded-3xl border border-[#E6E1D6] bg-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_8px_24px_rgba(17,19,24,0.03)] no-print">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5 text-[#C59B27]" />
          <span className="text-[#52504C] font-semibold">{dict.reports.from}</span>
          <input
            type="date"
            className="h-8 px-2.5 text-xs font-mono rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] focus:outline-none focus:border-[#C59B27]"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[#52504C] font-semibold">{dict.reports.to}</span>
          <input
            type="date"
            className="h-8 px-2.5 text-xs font-mono rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] focus:outline-none focus:border-[#C59B27]"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </div>

        {/* Scope Selector: All Scopes -> Business -> Personal -> Family */}
        <select
          aria-label="Report scope filter"
          className="h-8 px-2.5 text-xs rounded-xl bg-[#FAF8F5] border border-[#E6E1D6] text-[#111318] font-semibold focus:outline-none focus:border-[#C59B27] cursor-pointer"
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
        >
          <option value="all">{dict.scopes.all}</option>
          <option value="business">{dict.scopes.business}</option>
          <option value="personal">{dict.scopes.personal}</option>
          <option value="family">{dict.scopes.family}</option>
        </select>

        <div className="flex items-center gap-1 bg-[#F3EFEA] p-1 rounded-xl border border-[#E6E1D6]">
          {(
            [
              ['this_month', 'Month'],
              ['3m', '3M'],
              ['6m', '6M'],
              ['fy', 'FY'],
              ['year', 'Year'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onApplyPreset(id)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[#52504C] hover:bg-white hover:text-[#111318] transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#E6E1D6] bg-[#FAF8F5] hover:bg-[#F3EFEA] px-3 text-xs font-semibold text-[#111318] transition-colors cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5 text-[#52504C]" />
          <span>{dict.reports.printPdf}</span>
        </button>
        <a
          href={exportUrl}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#111318] hover:bg-[#232730] px-3.5 text-xs font-semibold text-[#FAF8F5] transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-[#E5C158]" />
          <span>{dict.reports.exportCsv}</span>
        </a>
      </div>
    </div>
  );
};
