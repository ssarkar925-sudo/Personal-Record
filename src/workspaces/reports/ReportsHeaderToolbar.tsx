import React from 'react';
import { Calendar, Download, Printer } from 'lucide-react';
import { Button, Card, Input, Select } from '../../components/ui/Primitives.tsx';
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
    <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-slate-200/90 bg-white shadow-2xs no-print">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">{dict.reports.from}</span>
          <Input
            type="date"
            className="w-auto h-8 text-xs bg-slate-50/70 border-slate-200 focus:bg-white"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-medium">{dict.reports.to}</span>
          <Input
            type="date"
            className="w-auto h-8 text-xs bg-slate-50/70 border-slate-200 focus:bg-white"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </div>
        <Select
          aria-label="Report scope filter"
          className="w-auto h-8 text-xs bg-slate-50/70 border-slate-200 font-medium"
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as Scope | 'all')}
        >
          <option value="all">{dict.scopes.all}</option>
          <option value="personal">{dict.scopes.personal}</option>
          <option value="business">{dict.scopes.business}</option>
          <option value="family">{dict.scopes.family}</option>
        </Select>

        <div className="hidden sm:flex items-center gap-1">
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
              className="rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="h-8 text-xs">
          <Printer className="h-3.5 w-3.5" /> {dict.reports.printPdf}
        </Button>
        <a
          href={exportUrl}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 shadow-2xs transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-indigo-600" /> {dict.reports.exportCsv}
        </a>
      </div>
    </Card>
  );
};
