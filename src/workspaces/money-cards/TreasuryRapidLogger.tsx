import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  MessageSquareText,
  Plus,
  Sparkles,
  TableProperties,
  Trash2,
  Zap,
} from 'lucide-react';
import { api, type AccountRecord } from '../../lib/api.ts';
import { formatINR, rupeesToPaise, todayISO } from '../../lib/format.ts';
import { getCategoryOptions, type Scope, type TxKind } from '../../../shared/ledger-core.ts';
import { parseBankUpiSms } from './treasuryAnalytics.ts';

export interface TreasuryRapidLoggerProps {
  liquidAccounts: AccountRecord[];
  selectedAccountId: string | null;
  defaultScope: Scope;
  onNotify: (text: string, kind?: 'ok' | 'err') => void;
  onRefresh: () => void;
}

interface RapidTreasuryRow {
  id: string;
  occurredAt: string;
  accountId: string;
  kind: Extract<TxKind, 'income' | 'expense'>;
  amountStr: string;
  party: string;
  category: string;
  scope: Scope;
  note: string;
}

interface TreasuryPreset {
  id: string;
  label: string;
  party: string;
  kind: Extract<TxKind, 'income' | 'expense'>;
  category: string;
  scope: Scope;
}

const TREASURY_PRESETS: TreasuryPreset[] = [
  {
    id: 'p-1',
    label: '+ Client Invoice NEFT',
    party: 'Apex Global Corp',
    kind: 'income',
    category: 'Sales / Revenue',
    scope: 'business',
  },
  {
    id: 'p-2',
    label: '+ Retainer Credit',
    party: 'Horizon Ventures',
    kind: 'income',
    category: 'Consulting / Services',
    scope: 'business',
  },
  {
    id: 'p-3',
    label: '− Vendor RTGS Payout',
    party: 'B2B Raw Materials Supplier',
    kind: 'expense',
    category: 'Inventory / Supplies',
    scope: 'business',
  },
  {
    id: 'p-4',
    label: '− GST / Tax Challan',
    party: 'CBIC GST Portal',
    kind: 'expense',
    category: 'Taxes & Compliance',
    scope: 'business',
  },
  {
    id: 'p-5',
    label: '− Office Payroll',
    party: 'Monthly Staff Payroll',
    kind: 'expense',
    category: 'Payroll & Contractors',
    scope: 'business',
  },
  {
    id: 'p-6',
    label: '− Courier / Logistics',
    party: 'BlueDart / Delhivery',
    kind: 'expense',
    category: 'Logistics & Courier',
    scope: 'business',
  },
  {
    id: 'p-7',
    label: '− UPI Groceries',
    party: 'Blinkit / Zepto UPI',
    kind: 'expense',
    category: 'Groceries',
    scope: 'family',
  },
];

const SAMPLE_BANK_SMS = [
  {
    label: 'NEFT Inflow (+₹85,000)',
    sms: 'Rs. 85,000.00 credited to A/c XX5521 on 16-11-26 by NEFT from Horizon Ventures. Avl Bal Rs. 21,79,500.00',
  },
  {
    label: 'UPI Outflow (−₹4,250)',
    sms: 'INR 4,250.00 debited from A/c XX4192 to BlueDart Logistics via UPI on 16-11-26. Ref 63201948',
  },
  {
    label: 'GST Challan (−₹18,400)',
    sms: 'Rs. 18,400.00 debited from A/c XX5521 towards CBIC GST Challan via NEFT. Ref 991204',
  },
];

export function TreasuryRapidLogger({
  liquidAccounts,
  selectedAccountId,
  defaultScope,
  onNotify,
  onRefresh,
}: TreasuryRapidLoggerProps) {
  const [entryTab, setEntryTab] = useState<'batch' | 'sms'>('batch');
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const defaultAccId = selectedAccountId || liquidAccounts[0]?.id || '';

  const [rows, setRows] = useState<RapidTreasuryRow[]>(() => [
    {
      id: 'tr-1',
      occurredAt: todayISO(),
      accountId: defaultAccId,
      kind: 'income',
      amountStr: '',
      party: '',
      category: 'Sales / Revenue',
      scope: defaultScope,
      note: '',
    },
    {
      id: 'tr-2',
      occurredAt: todayISO(),
      accountId: defaultAccId,
      kind: 'expense',
      amountStr: '',
      party: '',
      category: 'Inventory / Supplies',
      scope: defaultScope,
      note: '',
    },
  ]);

  // SMS Parser State
  const [smsText, setSmsText] = useState('');
  const [isSavingSms, setIsSavingSms] = useState(false);

  const parsedSms = parseBankUpiSms(smsText, liquidAccounts, todayISO());

  const handleUpdateRow = (idx: number, patch: Partial<RapidTreasuryRow>) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (patch.kind && patch.kind !== row.kind) {
          next.category = patch.kind === 'income' ? 'Sales / Revenue' : 'Inventory / Supplies';
        }
        return next;
      }),
    );
  };

  const handleApplyPreset = (preset: TreasuryPreset) => {
    const targetIdx = Math.min(activeRowIndex, Math.max(0, rows.length - 1));
    handleUpdateRow(targetIdx, {
      kind: preset.kind,
      party: preset.party,
      category: preset.category,
      scope: preset.scope,
      accountId: selectedAccountId || rows[targetIdx]?.accountId || defaultAccId,
    });
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `tr-${Date.now()}-${prev.length}`,
        occurredAt: todayISO(),
        accountId: selectedAccountId || liquidAccounts[0]?.id || '',
        kind: 'expense',
        amountStr: '',
        party: '',
        category: 'Inventory / Supplies',
        scope: defaultScope,
        note: '',
      },
    ]);
  };

  const handleRemoveRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setActiveRowIndex((prev) => Math.max(0, Math.min(prev, rows.length - 2)));
  };

  const safeRupeesToPaise = (raw: string): number => {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return 0;
    try {
      return rupeesToPaise(trimmed);
    } catch {
      return 0;
    }
  };

  const validRows = rows.filter(
    (r) => safeRupeesToPaise(r.amountStr) > 0 && (r.accountId || defaultAccId),
  );
  const validTotalMinor = validRows.reduce((s, r) => s + safeRupeesToPaise(r.amountStr), 0);

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0) {
      onNotify('Enter an amount in at least one row to post to passbook', 'err');
      return;
    }

    setIsSubmittingBatch(true);
    try {
      for (const r of validRows) {
        const amountMinor = safeRupeesToPaise(r.amountStr);
        await api.createTransaction({
          kind: r.kind,
          scope: r.scope,
          accountId: r.accountId || defaultAccId,
          toAccountId: null,
          category: r.category,
          amountMinor,
          occurredAt: r.occurredAt || todayISO(),
          party: r.party.trim() || r.category,
          note: r.note.trim(),
        });
      }
      onNotify(
        `Posted ${validRows.length} passbook ${validRows.length === 1 ? 'entry' : 'entries'} (${formatINR(validTotalMinor)})`,
      );
      setRows([
        {
          id: `tr-${Date.now()}-1`,
          occurredAt: todayISO(),
          accountId: selectedAccountId || defaultAccId,
          kind: 'income',
          amountStr: '',
          party: '',
          category: 'Sales / Revenue',
          scope: defaultScope,
          note: '',
        },
        {
          id: `tr-${Date.now()}-2`,
          occurredAt: todayISO(),
          accountId: selectedAccountId || defaultAccId,
          kind: 'expense',
          amountStr: '',
          party: '',
          category: 'Inventory / Supplies',
          scope: defaultScope,
          note: '',
        },
      ]);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to record batch transactions', 'err');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleCommitParsedSms = async () => {
    if (!parsedSms) return;
    const amountMinor = safeRupeesToPaise(parsedSms.amountRupees);
    if (amountMinor <= 0 || !parsedSms.accountId) {
      onNotify('Could not determine valid amount or bank account from SMS', 'err');
      return;
    }
    setIsSavingSms(true);
    try {
      await api.createTransaction({
        kind: parsedSms.kind,
        scope: parsedSms.scope,
        accountId: parsedSms.accountId,
        toAccountId: null,
        category: parsedSms.category,
        amountMinor,
        occurredAt: parsedSms.occurredAt,
        party: parsedSms.party,
        note: parsedSms.note,
      });
      onNotify(
        `Recorded ${parsedSms.kind === 'income' ? 'Inflow' : 'Outflow'} of ${formatINR(amountMinor)} (${parsedSms.party})`,
      );
      setSmsText('');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message || 'Failed to save parsed SMS', 'err');
    } finally {
      setIsSavingSms(false);
    }
  };

  if (liquidAccounts.length === 0) return null;

  return (
    <section className="bento-card rounded-2xl overflow-hidden">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-[#EAE5DC] bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#111318] text-[#E5C158] flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-[#111318]">
                Rapid Treasury &amp; UPI Passbook Desk
              </h3>
              <span className="text-[10px] font-mono-data uppercase px-2 py-0.5 rounded bg-emerald-50 text-[#059669] border border-emerald-200 font-semibold">
                Double-Entry Instant Post
              </span>
            </div>
            <p className="text-[11px] text-[#52504C]">
              Batch-log NEFT/RTGS inflows, supplier payouts, and UPI debits or auto-parse bank SMS alerts.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex items-center rounded-xl bg-[#F3EFEA] p-0.5 border border-[#EAE5DC] text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setEntryTab('batch')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all cursor-pointer ${
              entryTab === 'batch'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                : 'text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5 text-[#E5C158]" />
            <span>Multi-Row Batch</span>
          </button>
          <button
            type="button"
            onClick={() => setEntryTab('sms')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all cursor-pointer ${
              entryTab === 'sms'
                ? 'bg-[#111318] text-[#FAF8F5] shadow-2xs'
                : 'text-[#52504C] hover:text-[#111318]'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5 text-[#059669]" />
            <span>Bank / UPI SMS Parser</span>
          </button>
        </div>
      </div>

      {entryTab === 'batch' ? (
        <form onSubmit={handleBatchSubmit} className="p-4 space-y-3">
          {/* 1-Click Counterparty Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] font-semibold shrink-0 mr-1">
              1-Click Fill (Row #{activeRowIndex + 1}):
            </span>
            {TREASURY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer shrink-0 ${
                  preset.kind === 'income'
                    ? 'bg-emerald-50/70 hover:bg-emerald-100 text-[#059669] border-emerald-200/80'
                    : 'bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#111318] border-[#EAE5DC]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Multi-Row Table */}
          <div className="overflow-x-auto rounded-xl border border-[#EAE5DC]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-[#EAE5DC] text-[10px] font-mono-data uppercase text-[#858078]">
                  <th className="py-2 px-2.5">Flow</th>
                  <th className="py-2 px-2.5">Passbook Account</th>
                  <th className="py-2 px-2.5">Amount (₹)</th>
                  <th className="py-2 px-2.5">Counterparty / Merchant</th>
                  <th className="py-2 px-2.5">Category</th>
                  <th className="py-2 px-2.5">Scope</th>
                  <th className="py-2 px-2.5">Date</th>
                  <th className="py-2 px-2 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE5DC] bg-white">
                {rows.map((row, idx) => {
                  const isIncome = row.kind === 'income';
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setActiveRowIndex(idx)}
                      className={`transition-colors ${
                        activeRowIndex === idx ? 'bg-[#FAF8F5]/90' : 'hover:bg-[#FAF8F5]/40'
                      }`}
                    >
                      {/* Flow Toggle: Inflow vs Outflow */}
                      <td className="py-2 px-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRow(idx, {
                              kind: isIncome ? 'expense' : 'income',
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold border cursor-pointer transition-colors ${
                            isIncome
                              ? 'bg-emerald-50 text-[#059669] border-emerald-200'
                              : 'bg-[#111318] text-[#FAF8F5] border-[#111318]'
                          }`}
                        >
                          {isIncome ? (
                            <>
                              <ArrowDownRight className="w-3 h-3" />
                              <span>Inflow</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-[#E5C158]" />
                              <span>Outflow</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Account */}
                      <td className="py-2 px-2.5 min-w-[155px]">
                        <select
                          aria-label="Passbook Account"
                          value={row.accountId || defaultAccId}
                          onChange={(e) => handleUpdateRow(idx, { accountId: e.target.value })}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        >
                          {liquidAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} {acc.last4 ? `(••${acc.last4})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Amount */}
                      <td className="py-2 px-2.5 min-w-[115px]">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={row.amountStr}
                          onChange={(e) => handleUpdateRow(idx, { amountStr: e.target.value })}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1 font-mono-data font-bold text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        />
                      </td>

                      {/* Counterparty */}
                      <td className="py-2 px-2.5 min-w-[160px]">
                        <input
                          type="text"
                          placeholder={isIncome ? 'Client / Payer name' : 'Vendor / Merchant'}
                          value={row.party}
                          onChange={(e) => handleUpdateRow(idx, { party: e.target.value })}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2.5 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        />
                      </td>

                      {/* Category */}
                      <td className="py-2 px-2.5 min-w-[150px]">
                        <select
                          aria-label="Category"
                          value={row.category}
                          onChange={(e) => handleUpdateRow(idx, { category: e.target.value })}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        >
                          {getCategoryOptions(row.scope, row.kind).map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Scope (Business -> Personal -> Family) */}
                      <td className="py-2 px-2.5 min-w-[105px]">
                        <select
                          aria-label="Scope"
                          value={row.scope}
                          onChange={(e) =>
                            handleUpdateRow(idx, { scope: e.target.value as Scope })
                          }
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        >
                          <option value="business">Business</option>
                          <option value="personal">Personal</option>
                          <option value="family">Family</option>
                        </select>
                      </td>

                      {/* Date */}
                      <td className="py-2 px-2.5 min-w-[125px]">
                        <input
                          type="date"
                          value={row.occurredAt}
                          onChange={(e) => handleUpdateRow(idx, { occurredAt: e.target.value })}
                          className="w-full rounded-lg border border-[#EAE5DC] bg-white px-2 py-1 font-mono-data text-xs text-[#111318] focus:border-[#111318] focus:outline-none"
                        />
                      </td>

                      {/* Remove Row */}
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          disabled={rows.length <= 1}
                          className="p-1 text-[#858078] hover:text-[#E11D48] disabled:opacity-30 cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] hover:bg-[#F3EFEA] px-3 py-1.5 text-xs font-semibold text-[#111318] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Add Passbook Row</span>
            </button>

            <div className="flex items-center gap-3">
              {validRows.length > 0 && (
                <span className="text-xs font-mono-data text-[#52504C]">
                  Ready: <strong className="text-[#111318]">{validRows.length}</strong> · Total{' '}
                  <strong className="text-[#059669]">{formatINR(validTotalMinor)}</strong>
                </span>
              )}
              <button
                type="submit"
                disabled={isSubmittingBatch || validRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {isSubmittingBatch
                    ? 'Posting to Passbook...'
                    : `Post ${validRows.length || ''} to Passbook`}
                </span>
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Bank / UPI SMS Auto-Parser Tab */
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono-data uppercase tracking-wider text-[#858078] font-semibold">
              Try Sample Bank / UPI SMS:
            </span>
            {SAMPLE_BANK_SMS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSmsText(item.sms)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#EAE5DC] text-[11px] font-semibold text-[#111318] cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7">
              <textarea
                rows={3}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Paste HDFC, ICICI, Axis, SBI, or UPI SMS alert here (e.g. 'Rs. 85,000.00 credited to A/c XX5521 by NEFT from Horizon Ventures...')"
                className="w-full rounded-xl border border-[#EAE5DC] bg-[#FAF8F5] p-3 text-xs text-[#111318] placeholder:text-[#858078] focus:border-[#111318] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="lg:col-span-5">
              {parsedSms ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-mono-data text-[10px] uppercase font-bold text-[#059669]">
                      <Sparkles className="w-3.5 h-3.5" />
                      SMS Auto-Extracted
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono-data text-[10px] font-bold uppercase ${
                        parsedSms.kind === 'income'
                          ? 'bg-[#059669] text-white'
                          : 'bg-[#111318] text-[#E5C158]'
                      }`}
                    >
                      {parsedSms.kind === 'income' ? '+ Inflow (Credit)' : '− Outflow (Debit)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                    <div>
                      <span className="text-[10px] text-[#52504C] block">Amount</span>
                      <strong className="font-mono-data text-base text-[#111318]">
                        ₹{parsedSms.amountRupees}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#52504C] block">Counterparty</span>
                      <strong className="text-[#111318] truncate block">{parsedSms.party}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#52504C] block">Category &amp; Scope</span>
                      <strong className="text-[#111318]">
                        {parsedSms.category} ({parsedSms.scope})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#52504C] block">Target Account</span>
                      <strong className="text-[#059669] truncate block">
                        {liquidAccounts.find((a) => a.id === parsedSms.accountId)?.name || 'Primary'}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSavingSms}
                    onClick={handleCommitParsedSms}
                    className="w-full py-2 rounded-xl bg-[#111318] hover:bg-[#222630] text-[#FAF8F5] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#E5C158]" />
                    <span>{isSavingSms ? 'Recording...' : 'Confirm & Post to Passbook'}</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#D6CFC2] bg-[#FAF8F5] p-4 text-center text-xs text-[#858078]">
                  Paste a bank or UPI SMS message on the left (or click one of the sample chips above) to preview automatic extraction.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
