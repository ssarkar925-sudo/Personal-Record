import React, { useEffect, useState } from 'react';
import { Camera, FileText, Paperclip, Sparkles, Users } from 'lucide-react';
import { Dialog, Button, CategorySelect, FieldLabel, Input, Select } from './ui/Primitives.tsx';
import { api, type AccountRecord } from '../lib/api.ts';
import { rupeesToPaise, todayISO } from '../lib/format.ts';
import {
  CATEGORY_PRESETS_BY_SCOPE,
  getCategoryOptions,
  type DueDirection,
  type NoteScope,
  type Scope,
  type TxKind,
} from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';

type QuickTab = 'expense' | 'income' | 'transfer' | 'due' | 'checklist';

export function QuickAddModal({
  open,
  onClose,
  accounts,
  existingCategories = [],
  defaultScope,
  systemLanguage = 'en',
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accounts: AccountRecord[];
  existingCategories?: string[];
  defaultScope?: Scope;
  systemLanguage?: AppLanguage;
  onSaved: () => void;
}) {
  const dict = UI_STRINGS[systemLanguage];
  const [tab, setTab] = useState<QuickTab>('expense');
  const [scope, setScope] = useState<Scope>(defaultScope ?? 'business');
  const [amountRupees, setAmountRupees] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState('Inventory / Supplies');
  const [party, setParty] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [note, setNote] = useState('');

  // Due fields
  const [dueDirection, setDueDirection] = useState<DueDirection>('need');
  const [personName, setPersonName] = useState('');
  const [phone, setPhone] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Checklist fields
  const [noteTitle, setNoteTitle] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [noteScope, setNoteScope] = useState<NoteScope>('business');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptText, setReceiptText] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [extractingReceipt, setExtractingReceipt] = useState(false);
  const [receiptHint, setReceiptHint] = useState('');
  const [attachedFile, setAttachedFile] = useState<{
    filename: string;
    mimeType: string;
    dataBase64: string;
  } | null>(null);
  const [attachProof, setAttachProof] = useState(true);

  // Split Expense state
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitParticipants, setSplitParticipants] = useState('');
  const [splitIncludeSelf, setSplitIncludeSelf] = useState(true);
  const [splitDueDate, setSplitDueDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setReceiptHint('');
    setReceiptPreview(null);
    setReceiptText('');
    setAttachedFile(null);
    setAttachProof(true);
    setSplitEnabled(false);
    setSplitParticipants('');
    setSplitIncludeSelf(true);
    setSplitDueDate('');
    setOccurredAt(todayISO());
    if (defaultScope) setScope(defaultScope);
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
    if (accounts.length > 1 && (!toAccountId || toAccountId === accountId)) {
      const alt = accounts.find((a) => a.id !== (accountId || accounts[0].id));
      if (alt) setToAccountId(alt.id);
    }
  }, [open, accounts, defaultScope]);

  const handleTabChange = (next: QuickTab) => {
    setTab(next);
    setError('');
    if (next === 'expense') setCategory(CATEGORY_PRESETS_BY_SCOPE[scope].expense[0]);
    if (next === 'income') setCategory(CATEGORY_PRESETS_BY_SCOPE[scope].income[0]);
    if (next === 'transfer') setCategory('Card Bill / Transfer');
  };

  const handleScopeChange = (nextScope: Scope) => {
    setScope(nextScope);
    if (tab === 'expense' || tab === 'income') {
      const nextList = CATEGORY_PRESETS_BY_SCOPE[nextScope][tab];
      if (!nextList.includes(category)) {
        setCategory(nextList[0]);
      }
    }
  };

  const applyExtractedReceipt = (parsed: {
    vendor: string;
    amountMinor: number | null;
    occurredAt: string;
    category: string;
    kind: 'expense' | 'income';
    note: string;
    source: string;
  }) => {
    if (parsed.amountMinor) setAmountRupees((parsed.amountMinor / 100).toFixed(2));
    if (parsed.vendor) setParty(parsed.vendor);
    if (parsed.occurredAt) setOccurredAt(parsed.occurredAt);
    if (parsed.category) setCategory(parsed.category);
    if (parsed.note) setNote(parsed.note);
    setReceiptHint(
      parsed.source === 'vision_llm'
        ? 'Extracted via Vision AI — verify & save.'
        : parsed.source === 'offline_ocr'
          ? 'Extracted offline via Tesseract OCR — verify & save.'
          : 'Extracted from receipt/SMS text — verify & save.',
    );
  };

  const handleReceiptPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setReceiptHint('');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      setReceiptPreview(file.type.startsWith('image/') ? dataUrl : null);
      const base64 = dataUrl.split(',')[1] ?? '';
      if (!base64) return;
      if (base64.length <= 3_100_000) {
        setAttachedFile({
          filename: file.name || 'receipt.jpg',
          mimeType: file.type || 'image/jpeg',
          dataBase64: base64,
        });
        setAttachProof(true);
      } else {
        setAttachedFile(null);
      }
      if (!file.type.startsWith('image/')) {
        setReceiptHint(`Attached "${file.name}" as proof (PDF/file not OCR-scanned).`);
        return;
      }
      setExtractingReceipt(true);
      try {
        const res = await api.parseReceipt({
          imageBase64: base64,
          mimeType: file.type || 'image/jpeg',
          receiptText: receiptText.trim() || undefined,
        });
        applyExtractedReceipt(res);
      } catch (err) {
        setReceiptHint((err as Error).message);
      } finally {
        setExtractingReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExtractReceiptText = async () => {
    if (!receiptText.trim()) return;
    setExtractingReceipt(true);
    setError('');
    setReceiptHint('');
    try {
      const res = await api.parseReceipt({ receiptText: receiptText.trim() });
      applyExtractedReceipt(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtractingReceipt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (tab === 'expense' || tab === 'income' || tab === 'transfer') {
        if (!accountId) throw new Error('Create a Bank or Credit Card account first.');
        const amountMinor = rupeesToPaise(amountRupees);
        if (amountMinor <= 0) throw new Error('Amount must be greater than ₹0.');
        const splitNames = splitParticipants
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        await api.createTransaction({
          kind: tab as TxKind,
          scope,
          accountId,
          toAccountId: tab === 'transfer' ? toAccountId : null,
          category: category.trim() || 'General',
          amountMinor,
          occurredAt,
          party,
          note,
          attachment:
            tab !== 'transfer' && attachProof && attachedFile
              ? {
                  filename: attachedFile.filename,
                  mimeType: attachedFile.mimeType,
                  dataBase64: attachedFile.dataBase64,
                }
              : undefined,
          split:
            tab === 'expense' && splitEnabled && splitNames.length > 0
              ? {
                  participants: splitNames,
                  includeSelf: splitIncludeSelf,
                  dueDate: splitDueDate || null,
                }
              : undefined,
        });
      } else if (tab === 'due') {
        const amountMinor = rupeesToPaise(amountRupees);
        if (amountMinor <= 0) throw new Error('Amount must be greater than ₹0.');
        if (!personName.trim()) throw new Error('Enter the person name.');
        await api.createDue({
          personName: personName.trim(),
          phone: phone.trim(),
          direction: dueDirection,
          scope,
          amountMinor,
          dueDate: dueDate || null,
          note,
        });
      } else {
        if (!noteTitle.trim()) throw new Error('Enter a title for the note or checklist.');
        const lines = checklistText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        await api.createNote({
          title: noteTitle.trim(),
          body: note,
          scope: noteScope,
          pinned: true,
          remindAt: null,
          checklist: lines.map((text) => ({ text, done: false })),
        });
      }

      setAmountRupees('');
      setParty('');
      setNote('');
      setPersonName('');
      setPhone('');
      setNoteTitle('');
      setChecklistText('');
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dict.quickAddModal.title}
      description="Ctrl+K"
    >
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
        {(
          [
            ['expense', 'Expense'],
            ['income', 'Income'],
            ['transfer', 'Transfer / Pay Card'],
            ['due', 'People Due'],
            ['checklist', 'Checklist Note'],
          ] as Array<[QuickTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabChange(id)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              tab === id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {(tab === 'expense' || tab === 'income') && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setReceiptOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" />
              {receiptOpen ? 'Hide Receipt / Bill Capture' : 'Scan Receipt Photo or Paste Bill Text'}
            </button>
            <label className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Camera className="h-3 w-3" />
              {extractingReceipt ? 'Scanning...' : 'Upload Photo / PDF'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptPhoto} />
            </label>
          </div>
          {attachedFile && (
            <label className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={attachProof}
                onChange={(e) => setAttachProof(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              <Paperclip className="h-3 w-3 text-slate-500" />
              Attach receipt proof ({attachedFile.filename})
            </label>
          )}
          {receiptOpen && (
            <div className="mt-2.5 space-y-2">
              {receiptPreview && (
                <img
                  src={receiptPreview}
                  alt="Uploaded bill preview"
                  className="max-h-28 rounded-lg border border-slate-200 object-contain bg-white p-1"
                />
              )}
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                placeholder={'Paste receipt text or bank SMS...\ne.g. Swiggy Instamart\n12/11/2026\nGrand Total: Rs 642.00'}
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Auto-fills amount, vendor, date &amp; category
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!receiptText.trim() || extractingReceipt}
                  onClick={() => void handleExtractReceiptText()}
                >
                  <Sparkles className="h-3 w-3" /> Extract Fields
                </Button>
              </div>
            </div>
          )}
          {receiptHint && <div className="mt-1.5 text-[11px] font-medium text-blue-700">{receiptHint}</div>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {tab !== 'checklist' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="qa-scope">Scope</FieldLabel>
                <Select id="qa-scope" value={scope} onChange={(e) => handleScopeChange(e.target.value as Scope)}>
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="family">Family</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="qa-amount">Amount (₹)</FieldLabel>
                <Input
                  id="qa-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="1500.00"
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            {tab === 'due' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="qa-due-dir">Direction</FieldLabel>
                    <Select
                      id="qa-due-dir"
                      value={dueDirection}
                      onChange={(e) => setDueDirection(e.target.value as DueDirection)}
                    >
                      <option value="need">Need from person</option>
                      <option value="give">Give to person</option>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="qa-due-person">Person Name</FieldLabel>
                    <Input
                      id="qa-due-person"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      placeholder="e.g. Rahul"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="qa-due-phone">WhatsApp Phone (optional)</FieldLabel>
                    <Input
                      id="qa-due-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="qa-due-date">Due Date (optional)</FieldLabel>
                    <Input id="qa-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="qa-account">{tab === 'transfer' ? 'From Account' : 'Account'}</FieldLabel>
                    <Select
                      id="qa-account"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      required
                    >
                      {accounts.length === 0 && <option value="">No accounts yet</option>}
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.scope})
                        </option>
                      ))}
                    </Select>
                  </div>

                  {tab === 'transfer' ? (
                    <div>
                      <FieldLabel htmlFor="qa-to-account">To Account / Card</FieldLabel>
                      <Select
                        id="qa-to-account"
                        value={toAccountId}
                        onChange={(e) => setToAccountId(e.target.value)}
                        required
                      >
                        {accounts
                          .filter((a) => a.id !== accountId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.type === 'credit_card' ? 'Card Bill' : a.scope})
                            </option>
                          ))}
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <FieldLabel htmlFor="qa-category">Category</FieldLabel>
                      <CategorySelect
                        id="qa-category"
                        value={category}
                        onChange={setCategory}
                        options={getCategoryOptions(
                          scope,
                          tab === 'income' ? 'income' : 'expense',
                          existingCategories,
                        )}
                        placeholder="Type custom category..."
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="qa-date">Date</FieldLabel>
                    <Input
                      id="qa-date"
                      type="date"
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="qa-party">Merchant / Party</FieldLabel>
                    <Input
                      id="qa-party"
                      value={party}
                      onChange={(e) => setParty(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <FieldLabel htmlFor="qa-note">Note</FieldLabel>
              <Input id="qa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional memo" />
            </div>

            {tab === 'expense' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2 text-xs">
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitEnabled}
                    onChange={(e) => setSplitEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  Split equally into People Dues (1-click receivable)
                </label>
                {splitEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <FieldLabel htmlFor="qa-split-names">People (comma-separated)</FieldLabel>
                        <Input
                          id="qa-split-names"
                          placeholder="Amit, Neha"
                          value={splitParticipants}
                          onChange={(e) => setSplitParticipants(e.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="qa-split-due">Due Date (optional)</FieldLabel>
                        <Input
                          id="qa-split-due"
                          type="date"
                          value={splitDueDate}
                          onChange={(e) => setSplitDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={splitIncludeSelf}
                          onChange={(e) => setSplitIncludeSelf(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        Include my own share in split
                      </label>
                      {(() => {
                        const names = splitParticipants
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const divisor = names.length + (splitIncludeSelf ? 1 : 0);
                        const totalMinor = rupeesToPaise(amountRupees || '0');
                        if (names.length === 0 || divisor === 0 || totalMinor <= 0) return null;
                        const share = (Math.floor(totalMinor / divisor) / 100).toFixed(2);
                        return (
                          <span className="font-semibold text-blue-700 tabular-nums">
                            ~₹{share} receivable from each of {names.length}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="qa-note-title">Checklist Title</FieldLabel>
                <Input
                  id="qa-note-title"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Monthly GST / Home Errands"
                  autoFocus
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="qa-note-scope">Scope</FieldLabel>
                <Select value={noteScope} onChange={(e) => setNoteScope(e.target.value as NoteScope)}>
                  <option value="general">General</option>
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="family">Family</option>
                </Select>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="qa-checklist-lines">Checklist Items (one per line)</FieldLabel>
              <textarea
                id="qa-checklist-lines"
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                value={checklistText}
                onChange={(e) => setChecklistText(e.target.value)}
                placeholder={'Download bank statement\nPay office rent\nSend client invoice'}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {dict.common.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? dict.common.saving : dict.quickAddModal.saveEntry}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
