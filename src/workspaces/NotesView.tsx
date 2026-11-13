import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Building2,
  Check,
  CheckSquare,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  GripVertical,
  Landmark,
  Link2,
  ListChecks,
  Palette,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Share2,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  api,
  type AccountRecord,
  type LoanRecord,
  type NoteRecord,
  type PersonDueRecord,
  type TransactionRecord,
} from '../lib/api.ts';
import { formatINR, SCOPE_META } from '../lib/format.ts';
import {
  AnimatedTabs,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  FieldLabel,
  Input,
  Select,
  SortSelect,
  Textarea,
  ViewModeToggle,
  cn,
} from '../components/ui/Primitives.tsx';
import { NOTE_COLORS, type NoteColor, type NoteScope } from '../../shared/ledger-core.ts';
import { UI_STRINGS, type AppLanguage } from '../../shared/i18n.ts';

type KeepSection = 'active' | 'reminders' | 'checklists' | 'archive';
type NoteSort = 'custom' | 'updated_desc' | 'remind_asc' | 'title_asc' | 'scope_asc';

const KEEP_COLOR_STYLE: Record<
  NoteColor,
  { label: string; cardClass: string; swatchClass: string; modalBgClass: string; dotClass: string }
> = {
  default: {
    label: 'Paper',
    cardClass: 'bg-white/95 border-[#d8e1ee]',
    swatchClass: 'bg-white border-slate-300',
    modalBgClass: 'bg-white border-slate-200',
    dotClass: 'bg-white border-slate-300',
  },
  honey: {
    label: 'Honey',
    cardClass: 'bg-amber-50/90 border-amber-200/90',
    swatchClass: 'bg-amber-200 border-amber-400',
    modalBgClass: 'bg-[#fffef7] border-amber-200/90',
    dotClass: 'bg-amber-300 border-amber-400',
  },
  mint: {
    label: 'Mint',
    cardClass: 'bg-emerald-50/90 border-emerald-200/90',
    swatchClass: 'bg-emerald-200 border-emerald-400',
    modalBgClass: 'bg-[#f4fbf7] border-emerald-200/90',
    dotClass: 'bg-emerald-300 border-emerald-400',
  },
  sky: {
    label: 'Sky',
    cardClass: 'bg-sky-50/90 border-sky-200/90',
    swatchClass: 'bg-sky-200 border-sky-400',
    modalBgClass: 'bg-[#f4f9fd] border-sky-200/90',
    dotClass: 'bg-sky-300 border-sky-400',
  },
  lavender: {
    label: 'Periwinkle',
    cardClass: 'bg-indigo-50/90 border-indigo-200/90',
    swatchClass: 'bg-indigo-200 border-indigo-400',
    modalBgClass: 'bg-[#f6f8fe] border-indigo-200/90',
    dotClass: 'bg-indigo-300 border-indigo-400',
  },
  blush: {
    label: 'Blush',
    cardClass: 'bg-rose-50/90 border-rose-200/90',
    swatchClass: 'bg-rose-200 border-rose-400',
    modalBgClass: 'bg-[#fdf6f7] border-rose-200/90',
    dotClass: 'bg-rose-300 border-rose-400',
  },
};

interface NoteTemplate {
  id: string;
  name: string;
  icon: string;
  scope: NoteScope;
  title: string;
  body: string;
  tags: string[];
  checklist?: string[];
}

const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'grocery',
    name: 'Grocery & Home Essentials',
    icon: '🛒',
    scope: 'family',
    title: 'Grocery & Home Essentials',
    tags: ['groceries', 'household'],
    body: 'Check pantry stock and produce freshness before shopping.',
    checklist: [
      'Milk, curd & dairy',
      'Fresh veggies & greens',
      'Seasonal fruits',
      'Pulses, rice & atta',
      'Cleaning supplies & trash bags',
    ],
  },
  {
    id: 'meeting',
    name: 'Client / Team Meeting Minutes',
    icon: '💼',
    scope: 'business',
    title: 'Meeting Minutes: [Client/Project Name]',
    tags: ['meeting', 'work'],
    body: `### 🎯 Objective & Agenda\n- Discussion on project milestones, budget & timelines\n\n### 📝 Discussion Highlights\n- Point 1\n- Point 2\n\n### 📌 Next Action Items & Owners\n- Task 1 (Lead, Target Date)\n- Task 2 (Lead, Target Date)\n\n### 📅 Follow-up Meeting\n- Scheduled for: `,
  },
  {
    id: 'tax',
    name: 'Tax Deductions & FY Invoices',
    icon: '🧾',
    scope: 'personal',
    title: 'FY Tax Proofs & Receipts',
    tags: ['tax', 'finance'],
    body: `### 📂 Key Document Archive\n- **PAN & Aadhaar**: Linked & verified\n- **Form 16 / 16A**: Downloaded from portal\n- **Donations (80G)**: Receipts collected with 80G registration numbers`,
    checklist: [
      'Section 80C investments (PPF, ELSS, NPS, Term Life)',
      'Health insurance premium receipts (Section 80D)',
      'Rent receipts & rental agreement (HRA)',
      'Home loan interest certificate',
      'Bank savings interest & AIS/26AS statement',
    ],
  },
  {
    id: 'travel',
    name: 'Travel Itinerary & Packing List',
    icon: '✈️',
    scope: 'personal',
    title: 'Trip Itinerary & Packing: [Destination]',
    tags: ['travel', 'vacation'],
    body: `### 🗺️ Itinerary Highlights\n- **Day 1**: Arrival, check-in, city walking tour\n- **Day 2**: Sightseeing & local culinary tour\n- **Day 3**: Souvenirs & departure transit\n\n### 🏨 Stay & Transport Confirmation\n- Hotel booking ref: \n- Cab / flight ref: `,
    checklist: [
      'Tickets, boarding passes & Government ID',
      'Phone chargers, power bank & adapters',
      'Prescription medicines & first-aid kit',
      'Forex / debit cards & emergency cash reserve',
      'Weather-appropriate clothing & comfortable shoes',
    ],
  },
  {
    id: 'weekly_review',
    name: 'Weekly Financial & Budget Review',
    icon: '🎯',
    scope: 'personal',
    title: 'Weekly Financial Review',
    tags: ['budget', 'audit'],
    body: `### 📊 Weekly Budget Check\n- **Total Spent This Week**: ₹\n- **Discretionary Spending**: \n- **Category Budget Warnings**: \n\n### 🔍 Upcoming Commitments\n- Upcoming credit card dues & SIP debits\n- Follow-ups on lent dues (udhar)`,
    checklist: [
      'Reconciled bank and credit card statement transactions',
      'Recorded cash / UPI expenses from the week',
      'Reviewed savings goal contribution progress',
    ],
  },
];

function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|~~.*?~~|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 border border-slate-200 px-1 py-0.5 font-mono text-[11px] text-slate-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <del key={index} className="line-through text-slate-400">
          {part.slice(2, -2)}
        </del>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <pre
            key={`code-${i}`}
            className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800"
          >
            <code>{codeBuffer.join('\n')}</code>
          </pre>,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push(<div key={`spacer-${i}`} className="h-1.5" />);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold text-slate-900 mt-2.5 mb-1 flex items-center gap-1.5">
          {parseInlineMarkdown(trimmed.slice(4))}
        </h3>,
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-base font-bold text-slate-900 mt-3 mb-1.5 border-b border-black/5 pb-1">
          {parseInlineMarkdown(trimmed.slice(3))}
        </h2>,
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-lg font-bold text-slate-900 mt-3.5 mb-2 border-b border-black/10 pb-1.5">
          {parseInlineMarkdown(trimmed.slice(2))}
        </h1>,
      );
      continue;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={`quote-${i}`}
          className="my-1.5 rounded-xl border border-slate-200/80 bg-slate-100/70 px-3.5 py-2 text-xs italic text-slate-700"
        >
          {parseInlineMarkdown(trimmed.slice(2))}
        </blockquote>,
      );
      continue;
    }

    if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ')) {
      const isChecked = trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ');
      const text = trimmed.slice(6);
      blocks.push(
        <div key={`check-${i}`} className="flex items-start gap-2 text-xs py-0.5 text-slate-700">
          <span className={cn('mt-0.5 text-[11px]', isChecked ? 'text-teal-700' : 'text-slate-400')}>
            {isChecked ? '☑' : '☐'}
          </span>
          <span className={cn('leading-relaxed', isChecked && 'line-through text-slate-400')}>
            {parseInlineMarkdown(text)}
          </span>
        </div>,
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 text-xs py-0.5 text-slate-700 pl-1">
          <span className="text-slate-400 text-xs mt-0.5">•</span>
          <span className="leading-relaxed">{parseInlineMarkdown(trimmed.slice(2))}</span>
        </div>,
      );
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      blocks.push(
        <div key={`num-${i}`} className="flex items-start gap-2 text-xs py-0.5 text-slate-700 pl-1">
          <span className="text-slate-500 font-mono text-[11px] font-medium">{numMatch[1]}.</span>
          <span className="leading-relaxed">{parseInlineMarkdown(numMatch[2])}</span>
        </div>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="text-xs sm:text-[13px] text-slate-700 leading-relaxed">
        {parseInlineMarkdown(line)}
      </p>,
    );
  }

  return <div className={cn('space-y-1', className)}>{blocks}</div>;
}

interface DraftChecklistItem {
  id?: string;
  text: string;
  done: boolean;
}

export function NotesView({
  notes: initialNotes,
  accounts = [],
  transactions = [],
  loans = [],
  dues = [],
  systemLanguage = 'en',
  onNotify,
  onNavigate,
  onRefresh,
}: {
  notes: NoteRecord[];
  accounts?: AccountRecord[];
  transactions?: TransactionRecord[];
  loans?: LoanRecord[];
  dues?: PersonDueRecord[];
  systemLanguage?: AppLanguage;
  onNotify?: (msg: string, kind?: 'ok' | 'err') => void;
  onNavigate?: (tab: 'dashboard' | 'money' | 'loans_dues' | 'reports' | 'notes' | 'vault') => void;
  onRefresh: () => void;
}) {
  const dict = UI_STRINGS[systemLanguage];

  // Local notes state for instantaneous drag-and-drop feedback
  const [notes, setNotes] = useState<NoteRecord[]>(initialNotes);
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  // Filter, sort & view state
  const [section, setSection] = useState<KeepSection>('active');
  const [scopeFilter, setScopeFilter] = useState<NoteScope | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [colorFilter, setColorFilter] = useState<NoteColor | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<NoteSort>('custom');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAllOthers, setShowAllOthers] = useState(false);

  // Drag and drop rearrange state
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | null>(null);
  const isDraggingRef = useRef(false);

  // Bulk actions state (Pillar 5)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [bulkScope, setBulkScope] = useState<NoteScope>('general');
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Full Message Reader Modal State (Active Popup View)
  const [activeReaderNote, setActiveReaderNote] = useState<NoteRecord | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Quick Keep Inline Capture Bar State ("Take a note...")
  const [captureExpanded, setCaptureExpanded] = useState(false);
  const [captureChecklistMode, setCaptureChecklistMode] = useState(false);
  const [qTitle, setQTitle] = useState('');
  const [qBody, setQBody] = useState('');
  const [qScope, setQScope] = useState<NoteScope>('general');
  const [qColor, setQColor] = useState<NoteColor>('default');
  const [qTags, setQTags] = useState<string[]>([]);
  const [qTagInput, setQTagInput] = useState('');
  const [qPinned, setQPinned] = useState(false);
  const [qRemindAt, setQRemindAt] = useState('');
  const [qItems, setQItems] = useState<DraftChecklistItem[]>([]);
  const [qItemText, setQItemText] = useState('');
  const [qSaving, setQSaving] = useState(false);

  // Editor Modal State (Full Editor Dialog with Generous Space)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eBody, setEBody] = useState('');
  const [eScope, setEScope] = useState<NoteScope>('general');
  const [eColor, setEColor] = useState<NoteColor>('default');
  const [eTags, setETags] = useState<string[]>([]);
  const [eTagInput, setETagInput] = useState('');
  const [ePinned, setEPinned] = useState(false);
  const [eArchived, setEArchived] = useState(false);
  const [eRemindAt, setERemindAt] = useState('');
  const [eLinkedTxId, setELinkedTxId] = useState<string>('');
  const [eLinkedDueId, setELinkedDueId] = useState<string>('');
  const [eLinkedLoanId, setELinkedLoanId] = useState<string>('');
  const [eLinkedAccountId, setELinkedAccountId] = useState<string>('');
  const [eChecklist, setEChecklist] = useState<DraftChecklistItem[]>([]);
  const [eNewItemText, setENewItemText] = useState('');
  const [eSaving, setESaving] = useState(false);
  const [eError, setEError] = useState('');
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<NoteRecord | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Extract all existing unique tags across notes
  const allExistingTags = Array.from(
    new Set(notes.flatMap((n) => n.tags || []).filter((t) => t.trim().length > 0)),
  ).sort();

  // Upcoming / Overdue Reminders
  const nowMs = Date.now();
  const overdueReminders = notes.filter((n) => !n.archived && n.remindAt && Date.parse(n.remindAt) < nowMs);
  const todayReminders = notes.filter((n) => {
    if (n.archived || !n.remindAt) return false;
    const ms = Date.parse(n.remindAt);
    return ms >= nowMs && ms <= nowMs + 24 * 60 * 60 * 1000;
  });

  const resetCapture = () => {
    setCaptureExpanded(false);
    setCaptureChecklistMode(false);
    setQTitle('');
    setQBody('');
    setQScope('general');
    setQColor('default');
    setQTags([]);
    setQTagInput('');
    setQPinned(false);
    setQRemindAt('');
    setQItems([]);
    setQItemText('');
  };

  const applyTemplate = (tpl: NoteTemplate, target: 'capture' | 'editor') => {
    if (target === 'editor') {
      setETitle(tpl.title);
      setEBody(tpl.body);
      setEScope(tpl.scope);
      setETags(tpl.tags);
      if (tpl.checklist) {
        setEChecklist(tpl.checklist.map((text) => ({ text, done: false })));
      }
      setTemplateDropdownOpen(false);
      onNotify?.(`Loaded "${tpl.name}" template ✓`);
    } else {
      setCaptureExpanded(true);
      setQTitle(tpl.title);
      setQBody(tpl.body);
      setQScope(tpl.scope);
      setQTags(tpl.tags);
      if (tpl.checklist && tpl.checklist.length > 0) {
        setCaptureChecklistMode(true);
        setQItems(tpl.checklist.map((text) => ({ text, done: false })));
      }
      onNotify?.(`Loaded "${tpl.name}" template ✓`);
    }
  };

  const openEditor = (n: NoteRecord | null) => {
    setEError('');
    setENewItemText('');
    setETagInput('');
    setEditorTab('write');
    setTemplateDropdownOpen(false);
    if (!n) {
      setEditingId(null);
      setETitle('');
      setEBody('');
      setEScope(scopeFilter === 'all' ? 'general' : scopeFilter);
      setEColor('default');
      setETags([]);
      setEPinned(false);
      setEArchived(false);
      setERemindAt('');
      setELinkedTxId('');
      setELinkedDueId('');
      setELinkedLoanId('');
      setELinkedAccountId('');
      setEChecklist([]);
    } else {
      setEditingId(n.id);
      setETitle(n.title);
      setEBody(n.body);
      setEScope(n.scope);
      setEColor(n.color ?? 'default');
      setETags(n.tags ?? []);
      setEPinned(n.pinned);
      setEArchived(n.archived);
      setERemindAt(isoToLocalInputValue(n.remindAt));
      setELinkedTxId(n.linkedTxId ?? '');
      setELinkedDueId(n.linkedDueId ?? '');
      setELinkedLoanId(n.linkedLoanId ?? '');
      setELinkedAccountId(n.linkedAccountId ?? '');
      setEChecklist(n.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })));
    }
    setEditorOpen(true);
  };

  const copyNoteAsText = (n: NoteRecord) => {
    const checklistPart =
      n.checklist.length > 0
        ? '\n\nChecklist:\n' + n.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.text}`).join('\n')
        : '';
    const tagsPart = n.tags && n.tags.length > 0 ? `\nTags: ${n.tags.map((t) => `#${t}`).join(' ')}` : '';
    const fullText = `${n.title}\n\n${n.body}${checklistPart}${tagsPart}`;
    navigator.clipboard.writeText(fullText.trim()).then(
      () => onNotify?.('Copied note to clipboard ✓'),
      () => onNotify?.('Failed to copy note', 'err'),
    );
  };

  const downloadMarkdown = (n: NoteRecord) => {
    const checklistPart =
      n.checklist.length > 0
        ? '\n\n## Checklist\n' + n.checklist.map((c) => `- [${c.done ? 'x' : ' '}] ${c.text}`).join('\n')
        : '';
    const tagsPart = n.tags && n.tags.length > 0 ? `\n\n*Tags: ${n.tags.map((t) => `#${t}`).join(' ')}*` : '';
    const fullText = `# ${n.title}\n\n${n.body}${checklistPart}${tagsPart}\n`;
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${n.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Downloaded note as .md file ✓');
  };

  const shareToWhatsApp = (n: NoteRecord) => {
    const checklistPart =
      n.checklist.length > 0
        ? '\n\n*Checklist:*\n' + n.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.text}`).join('\n')
        : '';
    const text = `*${n.title}*\n\n${n.body}${checklistPart}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text.trim())}`, '_blank');
  };

  const handleFileUpload = async (noteId: string, file: File) => {
    setUploadingAttachment(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataBase64 = await base64Promise;

      const att = await api.addNoteAttachment(noteId, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
        byteSize: file.size,
      });

      if (activeReaderNote && activeReaderNote.id === noteId) {
        setActiveReaderNote({
          ...activeReaderNote,
          attachments: [att, ...(activeReaderNote.attachments || [])],
        });
      }
      onNotify?.(`Attached "${file.name}" ✓`);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (noteId: string, attId: string) => {
    try {
      await api.deleteNoteAttachment(noteId, attId);
      if (activeReaderNote && activeReaderNote.id === noteId) {
        setActiveReaderNote({
          ...activeReaderNote,
          attachments: activeReaderNote.attachments.filter((a) => a.id !== attId),
        });
      }
      onNotify?.('Removed attachment ✓');
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const triggerAlertCycleCheck = async () => {
    try {
      const res = await api.checkAlertsNow();
      onNotify?.(`Alert Cycle Evaluated (${res.evaluated} checked, ${res.sentWhatsApp} WhatsApp sent) ✓`);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const requestBrowserNotification = async () => {
    if (!('Notification' in window)) {
      onNotify?.('Browser notifications not supported on this device', 'err');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('Personal Ledger Reminders Active', {
        body: 'You will receive desktop alerts for your scheduled note reminders.',
      });
      onNotify?.('Desktop notifications enabled ✓');
    } else {
      onNotify?.('Notification permission was not granted', 'err');
    }
  };

  const handleSaveQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const pendingItem = qItemText.trim();
    const finalChecklist = [
      ...qItems,
      ...(pendingItem ? [{ text: pendingItem, done: false }] : []),
    ].filter((i) => i.text.trim().length > 0);
    const derivedTitle =
      qTitle.trim() ||
      (qBody.trim().split('\n')[0]?.slice(0, 60) ?? '') ||
      (finalChecklist[0]?.text.slice(0, 60) ?? '');
    if (!derivedTitle) {
      resetCapture();
      return;
    }

    setQSaving(true);
    try {
      await api.createNote({
        title: derivedTitle,
        body: qBody,
        scope: qScope,
        color: qColor,
        tags: qTags,
        pinned: qPinned,
        archived: false,
        remindAt: qRemindAt ? new Date(qRemindAt).toISOString() : null,
        checklist: finalChecklist,
      });
      resetCapture();
      onNotify?.(`${dict.common.save} ✓`);
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setQSaving(false);
    }
  };

  const handleSaveEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setEError('');
    setESaving(true);
    try {
      const pending = eNewItemText.trim();
      const checklistPayload = [
        ...eChecklist,
        ...(pending ? [{ text: pending, done: false }] : []),
      ].filter((i) => i.text.trim().length > 0);

      const payload = {
        title: eTitle.trim(),
        body: eBody,
        scope: eScope,
        color: eColor,
        tags: eTags,
        pinned: ePinned,
        archived: eArchived,
        remindAt: eRemindAt ? new Date(eRemindAt).toISOString() : null,
        linkedTxId: eLinkedTxId || null,
        linkedDueId: eLinkedDueId || null,
        linkedLoanId: eLinkedLoanId || null,
        linkedAccountId: eLinkedAccountId || null,
        checklist: checklistPayload,
      };
      if (editingId) await api.updateNote(editingId, payload);
      else await api.createNote(payload);

      setEditorOpen(false);
      onNotify?.(`${dict.common.save} ✓`);
      onRefresh();
    } catch (err) {
      setEError((err as Error).message);
    } finally {
      setESaving(false);
    }
  };

  const patchSingleNote = async (
    n: NoteRecord,
    patch: Partial<Pick<NoteRecord, 'pinned' | 'archived' | 'color'>>,
  ) => {
    try {
      await api.updateNote(n.id, {
        title: n.title,
        body: n.body,
        scope: n.scope,
        color: patch.color ?? n.color ?? 'default',
        tags: n.tags,
        pinned: patch.pinned ?? n.pinned,
        archived: patch.archived ?? n.archived,
        remindAt: n.remindAt,
        linkedTxId: n.linkedTxId,
        linkedDueId: n.linkedDueId,
        linkedLoanId: n.linkedLoanId,
        linkedAccountId: n.linkedAccountId,
        checklist: n.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
      });
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleQuickToggleExisting = async (n: NoteRecord, itemId: string, done: boolean) => {
    try {
      const updated = await api.toggleChecklistItem(n.id, itemId, done);
      if (activeReaderNote && activeReaderNote.id === n.id && updated) {
        setActiveReaderNote(updated);
      }
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleUncheckAll = async (n: NoteRecord) => {
    try {
      const updatedChecklist = n.checklist.map((c) => ({ ...c, done: false }));
      const updated = await api.updateNote(n.id, {
        title: n.title,
        body: n.body,
        scope: n.scope,
        color: n.color,
        tags: n.tags,
        pinned: n.pinned,
        archived: n.archived,
        remindAt: n.remindAt,
        linkedTxId: n.linkedTxId,
        linkedDueId: n.linkedDueId,
        linkedLoanId: n.linkedLoanId,
        linkedAccountId: n.linkedAccountId,
        checklist: updatedChecklist,
      });
      if (activeReaderNote && activeReaderNote.id === n.id) {
        setActiveReaderNote(updated);
      }
      onNotify?.('Unchecked all checklist items ✓');
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  const handleDeleteCompleted = async (n: NoteRecord) => {
    try {
      const remainingChecklist = n.checklist.filter((c) => !c.done);
      const updated = await api.updateNote(n.id, {
        title: n.title,
        body: n.body,
        scope: n.scope,
        color: n.color,
        tags: n.tags,
        pinned: n.pinned,
        archived: n.archived,
        remindAt: n.remindAt,
        linkedTxId: n.linkedTxId,
        linkedDueId: n.linkedDueId,
        linkedLoanId: n.linkedLoanId,
        linkedAccountId: n.linkedAccountId,
        checklist: remainingChecklist,
      });
      if (activeReaderNote && activeReaderNote.id === n.id) {
        setActiveReaderNote(updated);
      }
      onNotify?.('Cleared completed checklist items ✓');
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    }
  };

  // Bulk Actions Handlers
  const handleToggleSelectNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleBulkAction = async (
    action: 'scope' | 'color' | 'tag' | 'archive' | 'unarchive' | 'pin' | 'unpin' | 'delete',
    color?: NoteColor,
  ) => {
    if (selectedNoteIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await api.bulkNotes({
        ids: selectedNoteIds,
        action,
        scope: action === 'scope' ? bulkScope : undefined,
        color,
        tag: action === 'tag' ? bulkTagInput.trim() : undefined,
      });
      onNotify?.(`Updated ${res.count} note(s) ✓`);
      setSelectedNoteIds([]);
      setBulkTagInput('');
      onRefresh();
    } catch (err) {
      onNotify?.((err as Error).message, 'err');
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  };

  // Counts for Keep tabs
  const activeCount = notes.filter((n) => !n.archived).length;
  const remindersCount = notes.filter((n) => !n.archived && !!n.remindAt).length;
  const checklistsCount = notes.filter((n) => !n.archived && n.checklist.length > 0).length;
  const archiveCount = notes.filter((n) => n.archived).length;

  const filteredNotes = notes
    .filter((n) => {
      if (section === 'archive') {
        if (!n.archived) return false;
      } else {
        if (n.archived) return false;
        if (section === 'reminders' && !n.remindAt) return false;
        if (section === 'checklists' && n.checklist.length === 0) return false;
      }
      if (scopeFilter !== 'all' && n.scope !== scopeFilter) return false;
      if (colorFilter !== null && n.color !== colorFilter) return false;
      if (selectedTag !== null && !(n.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const inChecklist = n.checklist.some((c) => c.text.toLowerCase().includes(q));
        const inTags = (n.tags || []).some((t) => t.toLowerCase().includes(q));
        return (
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          inChecklist ||
          inTags
        );
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'custom') {
        const diff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        if (diff !== 0) return diff;
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (sortBy === 'remind_asc') {
        const ar = a.remindAt || '9999-12-31';
        const br = b.remindAt || '9999-12-31';
        return ar.localeCompare(br);
      }
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
      if (sortBy === 'scope_asc') return a.scope.localeCompare(b.scope) || b.updatedAt.localeCompare(a.updatedAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const pinnedNotes = section === 'active' ? filteredNotes.filter((n) => n.pinned) : [];
  const otherNotes = section === 'active' ? filteredNotes.filter((n) => !n.pinned) : filteredNotes;
  const shouldFold = section === 'active' && !search.trim() && !showAllOthers && otherNotes.length > 6;
  const visibleOtherNotes = shouldFold ? otherNotes.slice(0, 6) : otherNotes;

  const handleSelectAllVisible = () => {
    const visibleIds = filteredNotes.map((n) => n.id);
    if (selectedNoteIds.length === visibleIds.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(visibleIds);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    isDraggingRef.current = true;
    setDraggedNoteId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedNoteId || draggedNoteId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const isHorizontal = viewMode === 'grid';
    const ratio = isHorizontal
      ? (e.clientX - rect.left) / rect.width
      : (e.clientY - rect.top) / rect.height;

    const pos = ratio > 0.5 ? 'after' : 'before';
    if (dragOverNoteId !== targetId || dragPosition !== pos) {
      setDragOverNoteId(targetId);
      setDragPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) {
      setDragOverNoteId(null);
      setDragPosition(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedNoteId;
    if (!sourceId || sourceId === targetId) {
      handleDragEnd();
      return;
    }

    const currentNotes = [...notes];
    const sourceIdx = currentNotes.findIndex((n) => n.id === sourceId);
    const targetIdx = currentNotes.findIndex((n) => n.id === targetId);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [movedItem] = currentNotes.splice(sourceIdx, 1);
      let insertIdx = targetIdx;
      if (dragPosition === 'after') {
        insertIdx = sourceIdx < targetIdx ? targetIdx : targetIdx + 1;
      } else {
        insertIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
      }
      insertIdx = Math.max(0, Math.min(insertIdx, currentNotes.length));
      currentNotes.splice(insertIdx, 0, movedItem);

      const updatedNotes = currentNotes.map((n, idx) => ({ ...n, orderIndex: idx }));
      setNotes(updatedNotes);
      setSortBy('custom');

      try {
        await api.reorderNotes(updatedNotes.map((n) => n.id));
      } catch (err) {
        console.error('Failed to persist note order:', err);
      }
    }

    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
    setDragOverNoteId(null);
    setDragPosition(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 120);
  };

  // Helper to render linked financial badge
  const renderLinkedEntityBadge = (n: NoteRecord) => {
    if (n.linkedTxId) {
      const tx = transactions.find((t) => t.id === n.linkedTxId);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.('money');
          }}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-800 hover:bg-blue-100 cursor-pointer"
          title="Linked Transaction (Click to view)"
        >
          <CreditCard className="h-2.5 w-2.5" />
          <span>Tx: {tx ? `${tx.party || tx.category} (${formatINR(tx.amountMinor)})` : 'Linked Tx'}</span>
        </button>
      );
    }
    if (n.linkedDueId) {
      const due = dues.find((d) => d.id === n.linkedDueId);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.('loans_dues');
          }}
          className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100 cursor-pointer"
          title="Linked Person Due (Click to view)"
        >
          <Users className="h-2.5 w-2.5" />
          <span>Due: {due ? `${due.personName} (${formatINR(due.amountMinor)})` : 'Linked Due'}</span>
        </button>
      );
    }
    if (n.linkedLoanId) {
      const loan = loans.find((l) => l.id === n.linkedLoanId);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.('loans_dues');
          }}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 cursor-pointer"
          title="Linked Loan (Click to view)"
        >
          <Landmark className="h-2.5 w-2.5" />
          <span>Loan: {loan ? loan.name : 'Linked Loan'}</span>
        </button>
      );
    }
    if (n.linkedAccountId) {
      const acc = accounts.find((a) => a.id === n.linkedAccountId);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.('money');
          }}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200 cursor-pointer"
          title="Linked Account (Click to view)"
        >
          <Building2 className="h-2.5 w-2.5" />
          <span>{acc ? acc.name : 'Linked Account'}</span>
        </button>
      );
    }
    return null;
  };

  const renderNoteCard = (n: NoteRecord) => {
    const colorCfg = KEEP_COLOR_STYLE[n.color ?? 'default'];
    const openCount = n.checklist.filter((i) => !i.done).length;
    const isList = viewMode === 'list';
    const isSelected = selectedNoteIds.includes(n.id);
    const hasAttachments = (n.attachments || []).length > 0;
    const isBeingDragged = draggedNoteId === n.id;
    const isDragOver = dragOverNoteId === n.id;

    if (isList) {
      return (
        <div
          key={n.id}
          draggable={true}
          onDragStart={(e) => handleDragStart(e, n.id)}
          onDragOver={(e) => handleDragOver(e, n.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, n.id)}
          onDragEnd={handleDragEnd}
          onClick={() => {
            if (!isDraggingRef.current) setActiveReaderNote(n);
          }}
          className={cn(
            'group flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-all cursor-pointer hover:shadow-sm',
            colorCfg.cardClass,
            isSelected && 'ring-2 ring-blue-600 border-blue-400',
            isBeingDragged && 'opacity-40 scale-[0.98] border-dashed border-2 border-slate-400',
            isDragOver && 'ring-2 ring-indigo-500 ring-offset-2 scale-[1.01] shadow-md',
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-grab active:cursor-grabbing shrink-0"
              title="Drag to rearrange note"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>

            <button
              type="button"
              onClick={(e) => handleToggleSelectNote(n.id, e)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              aria-label={isSelected ? 'Deselect note' : 'Select note'}
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-blue-600" />
              ) : (
                <Square className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
              )}
            </button>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {n.pinned && <Pin className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                <span className="text-xs font-semibold text-slate-900 truncate">{n.title}</span>
                <Badge className={SCOPE_META[n.scope].badgeClass}>{SCOPE_META[n.scope].label}</Badge>
                {n.remindAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    <BellRing className="h-2.5 w-2.5" />
                    {new Date(n.remindAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                {hasAttachments && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    <Paperclip className="h-2.5 w-2.5" />
                    {n.attachments.length}
                  </span>
                )}
                {renderLinkedEntityBadge(n)}
              </div>

              {/* Tags */}
              {n.tags && n.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {n.tags.map((tag) => (
                    <span
                      key={tag}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTag(tag);
                      }}
                      className="rounded-md bg-black/5 hover:bg-black/10 px-1.5 py-0.2 text-[10px] font-medium text-slate-600 cursor-pointer"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {n.checklist.length > 0 ? (
                <div className="text-[11px] text-slate-600">
                  {n.checklist.slice(0, 2).map((c) => (
                    <span
                      key={c.id}
                      className={cn('mr-3 inline-flex items-center gap-1', c.done && 'line-through text-slate-400')}
                    >
                      {c.done ? '☑' : '☐'} {c.text}
                    </span>
                  ))}
                  <span className="text-slate-400 tabular-nums">
                    ({openCount}/{n.checklist.length} open)
                  </span>
                </div>
              ) : (
                n.body && <p className="text-[11px] text-slate-600 truncate">{n.body}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openEditor(n)}
              title="Edit Note"
              aria-label="Edit note"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void patchSingleNote(n, { pinned: !n.pinned })}
              title={n.pinned ? 'Unpin' : 'Pin'}
              aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
              className={cn(
                'rounded-lg p-1.5 hover:bg-black/5 cursor-pointer',
                n.pinned ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700',
              )}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void patchSingleNote(n, { archived: !n.archived, pinned: n.archived ? n.pinned : false })}
              title={n.archived ? dict.notes.unarchive : dict.notes.archive}
              aria-label={n.archived ? dict.notes.unarchive : dict.notes.archive}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
            >
              {n.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(n)}
              aria-label="Delete note"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={n.id}
        draggable={true}
        onDragStart={(e) => handleDragStart(e, n.id)}
        onDragOver={(e) => handleDragOver(e, n.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, n.id)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (!isDraggingRef.current) setActiveReaderNote(n);
        }}
        className={cn(
          'studio-card-hover group relative rounded-2xl border p-4 flex flex-col justify-between space-y-3 cursor-pointer shadow-xs transition-all',
          colorCfg.cardClass,
          isSelected && 'ring-2 ring-blue-600 border-blue-400',
          isBeingDragged && 'opacity-40 scale-[0.98] border-dashed border-2 border-slate-400',
          isDragOver && 'ring-2 ring-indigo-500 ring-offset-2 scale-[1.02] shadow-md',
        )}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-grab active:cursor-grabbing shrink-0"
                title="Drag to rearrange note"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </div>

              <button
                type="button"
                onClick={(e) => handleToggleSelectNote(n.id, e)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label={isSelected ? 'Deselect note' : 'Select note'}
              >
                {isSelected ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                )}
              </button>
              <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{n.title}</h3>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => openEditor(n)}
                aria-label="Edit note"
                title="Edit Note"
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-black/5 transition-colors cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void patchSingleNote(n, { pinned: !n.pinned })}
                aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                title={n.pinned ? 'Unpin' : 'Pin'}
                className={cn(
                  'rounded-lg p-1 shrink-0 transition-colors cursor-pointer',
                  n.pinned ? 'text-amber-600 bg-amber-100/70' : 'text-slate-400 hover:text-slate-700 hover:bg-black/5',
                )}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Tags on card */}
          {n.tags && n.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {n.tags.map((tag) => (
                <span
                  key={tag}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTag(tag);
                  }}
                  className="rounded-md bg-black/5 hover:bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 cursor-pointer"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Checklist preview */}
          {n.checklist.length > 0 ? (
            <div className="space-y-1.5">
              {n.checklist.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleQuickToggleExisting(n, item.id, !item.done);
                  }}
                  className="flex w-full items-start gap-2 text-left text-xs text-slate-700 hover:text-slate-950 cursor-pointer"
                >
                  {item.done ? (
                    <CheckSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-teal-700" />
                  ) : (
                    <Square className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                  )}
                  <span className={cn('leading-snug', item.done && 'line-through text-slate-400')}>{item.text}</span>
                </button>
              ))}
              {n.checklist.length > 4 && (
                <div className="text-[11px] font-medium text-slate-500 pl-5">
                  +{n.checklist.length - 4} more item(s)
                </div>
              )}
            </div>
          ) : (
            n.body && (
              <p className="text-xs text-slate-700 whitespace-pre-line line-clamp-4 leading-relaxed">{n.body}</p>
            )
          )}

          {/* Attachments preview snippet */}
          {hasAttachments && (
            <div className="flex items-center gap-2 pt-1">
              {n.attachments.slice(0, 3).map((att) => (
                <div
                  key={att.id}
                  className="h-8 w-8 rounded-lg border border-black/10 overflow-hidden bg-slate-100 flex items-center justify-center shrink-0"
                >
                  {att.mimeType.startsWith('image/') ? (
                    <img src={att.dataBase64} alt={att.filename} className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-500" />
                  )}
                </div>
              ))}
              {n.attachments.length > 3 && (
                <span className="text-[10px] text-slate-500">+{n.attachments.length - 3}</span>
              )}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-black/5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={SCOPE_META[n.scope].badgeClass}>{SCOPE_META[n.scope].label}</Badge>
            {n.remindAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                <BellRing className="h-2.5 w-2.5" />
                {new Date(n.remindAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {renderLinkedEntityBadge(n)}
          </div>

          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => copyNoteAsText(n)}
              title="Copy note text"
              aria-label="Copy note text"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void patchSingleNote(n, { archived: !n.archived, pinned: n.archived ? n.pinned : false })}
              title={n.archived ? dict.notes.unarchive : dict.notes.archive}
              aria-label={n.archived ? dict.notes.unarchive : dict.notes.archive}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
            >
              {n.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(n)}
              aria-label="Delete note"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-panel-in relative pb-16">
      {/* Active Reminders Notice Banner (when reminders due/overdue) */}
      {(overdueReminders.length > 0 || todayReminders.length > 0) && (
        <div className="mx-auto max-w-4xl rounded-2xl border border-amber-300 bg-amber-50/90 p-3 sm:p-4 text-amber-900 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-200/80 p-2 text-amber-800">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold">
                {overdueReminders.length > 0
                  ? `⚠️ ${overdueReminders.length} Overdue Reminder(s) · ${todayReminders.length} Upcoming Today`
                  : `🔔 ${todayReminders.length} Note Reminder(s) Scheduled For Today`}
              </p>
              <p className="text-[11px] text-amber-800/90 mt-0.5">
                WhatsApp alerts dispatch automatically to your connected number, and In-App alerts appear on the top bell.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={requestBrowserNotification}
              className="text-xs bg-white text-amber-900 border-amber-300"
            >
              Enable Desktop Alerts
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={triggerAlertCycleCheck}
              className="text-xs"
            >
              Run Alert Check Now
            </Button>
          </div>
        </div>
      )}

      {/* 1. Google Keep Quick Capture Bar with Templates */}
      <div className="mx-auto max-w-2xl">
        <Card className={cn('p-3 transition-colors', KEEP_COLOR_STYLE[qColor].cardClass)}>
          {!captureExpanded ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCaptureExpanded(true);
                  setCaptureChecklistMode(false);
                }}
                className="flex-1 text-left px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800 cursor-text"
              >
                {dict.notes.takeNote}
              </button>
              <div className="flex items-center gap-1.5">
                {/* Template Quick Loader */}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTemplateDropdownOpen((o) => !o)}
                    title="Starter Templates"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    <span className="hidden sm:inline">Templates</span>
                  </Button>
                  {templateDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-popup-in">
                      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Choose Template
                      </div>
                      {NOTE_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            applyTemplate(tpl, 'capture');
                            setTemplateDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                        >
                          <span>{tpl.icon}</span>
                          <span className="truncate">{tpl.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCaptureExpanded(true);
                    setCaptureChecklistMode(true);
                  }}
                >
                  <ListChecks className="h-4 w-4 text-teal-700" />
                  <span className="hidden sm:inline">Checklist</span>
                </Button>
                <Button variant="primary" size="sm" onClick={() => openEditor(null)}>
                  <Plus className="h-3.5 w-3.5" /> Full Editor
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveQuickCapture} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={qTitle}
                  onChange={(e) => setQTitle(e.target.value)}
                  placeholder="Title"
                  className="flex-1 bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQPinned((p) => !p)}
                  aria-label="Pin quick note"
                  className={cn(
                    'rounded-lg p-1.5 cursor-pointer',
                    qPinned ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-slate-700',
                  )}
                >
                  <Pin className="h-4 w-4" />
                </button>
              </div>

              {!captureChecklistMode ? (
                <textarea
                  rows={3}
                  value={qBody}
                  onChange={(e) => setQBody(e.target.value)}
                  placeholder="Write a note (Markdown supported: **bold**, # header, - list)..."
                  autoFocus
                  className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
                />
              ) : (
                <div className="space-y-1.5 rounded-xl bg-white/70 border border-black/10 p-2.5">
                  {qItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <Square className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="flex-1 text-slate-800">{it.text}</span>
                      <button
                        type="button"
                        onClick={() => setQItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      className="h-7 text-xs bg-white"
                      value={qItemText}
                      onChange={(e) => setQItemText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && qItemText.trim()) {
                          e.preventDefault();
                          setQItems((prev) => [...prev, { text: qItemText.trim(), done: false }]);
                          setQItemText('');
                        }
                      }}
                      placeholder="+ Checklist item (Enter)"
                      autoFocus
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!qItemText.trim()) return;
                        setQItems((prev) => [...prev, { text: qItemText.trim(), done: false }]);
                        setQItemText('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Tags Input Strip in Quick Capture */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {qTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => setQTags((tags) => tags.filter((t) => t !== tag))}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={qTagInput}
                  onChange={(e) => setQTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && qTagInput.trim()) {
                      e.preventDefault();
                      const clean = qTagInput.replace(/^#/, '').trim();
                      if (clean && !qTags.includes(clean)) {
                        setQTags([...qTags, clean]);
                      }
                      setQTagInput('');
                    }
                  }}
                  placeholder="+ #tag (Enter)"
                  className="h-6 w-24 bg-transparent text-[11px] placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/5">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Quick note scope"
                    className="h-7 w-auto text-xs bg-white/80"
                    value={qScope}
                    onChange={(e) => setQScope(e.target.value as NoteScope)}
                  >
                    <option value="general">General</option>
                    <option value="personal">{dict.scopes.personal}</option>
                    <option value="business">{dict.scopes.business}</option>
                    <option value="family">{dict.scopes.family}</option>
                  </Select>

                  <button
                    type="button"
                    onClick={() => setCaptureChecklistMode((m) => !m)}
                    className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white cursor-pointer inline-flex items-center gap-1"
                  >
                    <ListChecks className="h-3 w-3" /> {captureChecklistMode ? 'Text Mode' : 'Checklist'}
                  </button>

                  <div className="inline-flex items-center gap-1" role="group" aria-label="Note color">
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setQColor(c)}
                        aria-label={`Color ${c}`}
                        className={cn(
                          'h-4.5 w-4.5 rounded-full border flex items-center justify-center cursor-pointer transition-transform',
                          KEEP_COLOR_STYLE[c].dotClass,
                          qColor === c && 'ring-2 ring-slate-900 scale-110',
                        )}
                      >
                        {qColor === c && <Check className="h-2.5 w-2.5 text-slate-800" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={resetCapture}>
                    {dict.common.cancel}
                  </Button>
                  <Button variant="primary" size="sm" type="submit" disabled={qSaving}>
                    {qSaving ? dict.common.saving : dict.common.save}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </Card>
      </div>

      {/* 2. Organized Navigation Strip: Keep Tabs + Scope Filter + Tag Pills + Color Dots + Search + Sort + Grid/List */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AnimatedTabs
            variant="subtle"
            value={section}
            onChange={(next) => {
              setSection(next);
              setShowAllOthers(false);
            }}
            items={[
              { id: 'active', label: dict.notes.tabActive, accentHex: '#0f766e', badge: activeCount },
              { id: 'reminders', label: dict.notes.tabReminders, accentHex: '#d97706', badge: remindersCount },
              { id: 'checklists', label: dict.notes.tabChecklists, accentHex: '#2563eb', badge: checklistsCount },
              { id: 'archive', label: dict.notes.tabArchive, accentHex: '#64748b', badge: archiveCount },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            {filteredNotes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAllVisible}
                className="text-xs h-8 text-slate-600"
              >
                {selectedNoteIds.length === filteredNotes.length ? 'Deselect All' : 'Select All'}
              </Button>
            )}

            <Input
              className="w-36 sm:w-44 h-8 text-xs"
              placeholder={dict.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Filter note scope"
              className="w-auto h-8 text-xs"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as NoteScope | 'all')}
            >
              <option value="all">{dict.common.allScopes}</option>
              <option value="general">General</option>
              <option value="personal">{dict.scopes.personal}</option>
              <option value="business">{dict.scopes.business}</option>
              <option value="family">{dict.scopes.family}</option>
            </Select>
            <SortSelect
              label={dict.common.sortBy}
              value={sortBy}
              onChange={(v) => setSortBy(v as NoteSort)}
              options={[
                { value: 'custom', label: 'Custom: Drag & Drop' },
                { value: 'updated_desc', label: 'Updated: Newest' },
                { value: 'remind_asc', label: 'Reminder: Soonest' },
                { value: 'title_asc', label: 'Title: A → Z' },
                { value: 'scope_asc', label: 'Scope' },
              ]}
            />
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              gridLabel={dict.common.gridView}
              listLabel={dict.common.listView}
            />
          </div>
        </div>

        {/* Tag Pills & Color Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-200/80">
          {/* Tag Pills (Pillar 1) */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Tag className="h-3 w-3 text-slate-400" /> Tags:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                selectedTag === null
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              All
            </button>
            {allExistingTags.map((tag) => {
              const count = notes.filter((n) => (n.tags || []).includes(tag)).length;
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1',
                    isSelected
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <span>#{tag}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Color Dots Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">Color:</span>
            <button
              type="button"
              onClick={() => setColorFilter(null)}
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[11px] font-medium cursor-pointer',
                colorFilter === null ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              All
            </button>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorFilter(colorFilter === c ? null : c)}
                title={`Filter by ${KEEP_COLOR_STYLE[c].label}`}
                className={cn(
                  'h-4 w-4 rounded-full border cursor-pointer transition-transform hover:scale-125',
                  KEEP_COLOR_STYLE[c].dotClass,
                  colorFilter === c && 'ring-2 ring-slate-900 scale-125',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3. Organized Display Sections (Pinned vs Others, Foldable) */}
      {filteredNotes.length === 0 ? (
        <Card className="p-10 text-center text-xs text-slate-500 space-y-2">
          <p>
            {section === 'archive'
              ? 'No archived notes yet.'
              : selectedTag
                ? `No notes tagged with #${selectedTag}.`
                : 'No notes match this filter. Use the "Take a note..." bar above to create one.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {pinnedNotes.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1.5">
                <Pin className="h-3 w-3 text-amber-600" />
                {dict.notes.pinnedSection} ({pinnedNotes.length})
              </div>
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5'
                    : 'space-y-2'
                }
              >
                {pinnedNotes.map(renderNoteCard)}
              </div>
            </div>
          )}

          {visibleOtherNotes.length > 0 && (
            <div className="space-y-2.5">
              {pinnedNotes.length > 0 && (
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1">
                  {dict.notes.othersSection} ({otherNotes.length})
                </div>
              )}
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5'
                    : 'space-y-2'
                }
              >
                {visibleOtherNotes.map(renderNoteCard)}
              </div>

              {(shouldFold || (showAllOthers && otherNotes.length > 6)) && (
                <div className="flex justify-center pt-1">
                  <Button variant="secondary" size="sm" onClick={() => setShowAllOthers((v) => !v)}>
                    {showAllOthers ? dict.common.showLess : `${dict.common.showAll} (+${otherNotes.length - 6})`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Full Message Popup View (Reader Modal with Note-Themed Background) */}
      {activeReaderNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setActiveReaderNote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={activeReaderNote.title}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full max-w-2xl max-h-[88dvh] flex flex-col rounded-2xl border shadow-2xl animate-popup-in overflow-hidden transition-all',
              KEEP_COLOR_STYLE[activeReaderNote.color ?? 'default'].modalBgClass,
            )}
          >
            {/* Reader Header */}
            <div className="flex items-start justify-between gap-3 border-b border-black/8 px-6 py-4 shrink-0 bg-white/50">
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 leading-snug break-words">
                    {activeReaderNote.title}
                  </h2>
                  <Badge className={SCOPE_META[activeReaderNote.scope].badgeClass}>
                    {SCOPE_META[activeReaderNote.scope].label}
                  </Badge>
                  {activeReaderNote.remindAt && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
                      <BellRing className="h-3 w-3 text-amber-700" />
                      {new Date(activeReaderNote.remindAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {renderLinkedEntityBadge(activeReaderNote)}
                </div>

                {/* Tags in Reader */}
                {activeReaderNote.tags && activeReaderNote.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {activeReaderNote.tags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setActiveReaderNote(null);
                        }}
                        className="rounded-md bg-black/5 hover:bg-black/10 px-2 py-0.5 text-[10px] font-medium text-slate-700 cursor-pointer"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-slate-500">
                  Updated{' '}
                  {new Date(activeReaderNote.updatedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              {/* Reader Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const target = activeReaderNote;
                    setActiveReaderNote(null);
                    openEditor(target);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyNoteAsText(activeReaderNote)}
                  title="Copy Note Content"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadMarkdown(activeReaderNote)}
                  title="Download as .md file"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => shareToWhatsApp(activeReaderNote)}
                  title="Share to WhatsApp"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    void patchSingleNote(activeReaderNote, { pinned: !activeReaderNote.pinned });
                    setActiveReaderNote((prev) => (prev ? { ...prev, pinned: !prev.pinned } : null));
                  }}
                  title={activeReaderNote.pinned ? 'Unpin' : 'Pin'}
                  aria-label={activeReaderNote.pinned ? 'Unpin note' : 'Pin note'}
                  className={cn(
                    'rounded-lg p-2 cursor-pointer transition-colors',
                    activeReaderNote.pinned
                      ? 'bg-amber-100 text-amber-700'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-black/5',
                  )}
                >
                  <Pin className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void patchSingleNote(activeReaderNote, { archived: !activeReaderNote.archived });
                    setActiveReaderNote(null);
                  }}
                  title={activeReaderNote.archived ? dict.notes.unarchive : dict.notes.archive}
                  aria-label={activeReaderNote.archived ? dict.notes.unarchive : dict.notes.archive}
                  className="rounded-lg p-2 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
                >
                  {activeReaderNote.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target = activeReaderNote;
                    setActiveReaderNote(null);
                    setDeleteTarget(target);
                  }}
                  aria-label="Delete note"
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveReaderNote(null)}
                  aria-label="Close reader"
                  className="rounded-lg p-2 text-slate-400 hover:bg-black/5 hover:text-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Reader Body: Expansive, Generous Space */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {activeReaderNote.body && (
                <div className="rounded-xl bg-white/75 border border-black/5 p-4.5">
                  <MarkdownView content={activeReaderNote.body} />
                </div>
              )}

              {/* Attachments Section in Reader (Pillar 2) */}
              <div className="space-y-2 border-t border-black/5 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                    Attachments ({(activeReaderNote.attachments || []).length})
                  </span>
                  <label className={cn(
                    'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer',
                    uploadingAttachment && 'opacity-60 cursor-not-allowed',
                  )}>
                    <Upload className="h-3 w-3 text-slate-500" />
                    <span>{uploadingAttachment ? 'Uploading...' : 'Upload Attachment'}</span>
                    <input
                      type="file"
                      disabled={uploadingAttachment}
                      accept="image/*,application/pdf,audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFileUpload(activeReaderNote.id, file);
                      }}
                    />
                  </label>
                </div>

                {(activeReaderNote.attachments || []).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {activeReaderNote.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group relative rounded-xl border border-black/10 bg-white/80 p-2 overflow-hidden flex flex-col justify-between"
                      >
                        {att.mimeType.startsWith('image/') ? (
                          <div
                            onClick={() => setLightboxImage({ url: att.dataBase64, title: att.filename })}
                            className="h-24 w-full rounded-lg overflow-hidden bg-slate-100 cursor-pointer flex items-center justify-center mb-1.5"
                          >
                            <img src={att.dataBase64} alt={att.filename} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-24 w-full rounded-lg bg-slate-100 flex flex-col items-center justify-center gap-1 mb-1.5 text-slate-500">
                            <FileText className="h-6 w-6 text-slate-400" />
                            <span className="text-[10px] font-mono">{att.mimeType.split('/')[1]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="truncate text-slate-700 font-medium" title={att.filename}>
                            {att.filename}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(activeReaderNote.id, att.id)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                            title="Delete attachment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Checklists (if any) */}
              {activeReaderNote.checklist.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-black/5 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <ListChecks className="h-4 w-4 text-teal-700" />
                      Checklist (
                      {activeReaderNote.checklist.filter((c) => !c.done).length} open / {activeReaderNote.checklist.length} total)
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleUncheckAll(activeReaderNote)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        Uncheck all
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCompleted(activeReaderNote)}
                        className="text-[11px] text-red-600 hover:text-red-800 underline cursor-pointer"
                      >
                        Clear completed
                      </button>
                    </div>
                  </div>

                  {/* Open Items */}
                  <div className="space-y-1.5">
                    {activeReaderNote.checklist
                      .filter((c) => !c.done)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleQuickToggleExisting(activeReaderNote, item.id, true)}
                          className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left text-xs text-slate-800 hover:bg-black/5 cursor-pointer transition-colors"
                        >
                          <Square className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
                          <span className="leading-relaxed">{item.text}</span>
                        </button>
                      ))}
                  </div>

                  {/* Completed Items Accordion */}
                  {activeReaderNote.checklist.filter((c) => c.done).length > 0 && (
                    <details className="group rounded-xl border border-black/5 bg-black/[0.02] p-2.5">
                      <summary className="text-xs font-medium text-slate-500 cursor-pointer list-none flex items-center justify-between select-none">
                        <span>✓ Completed items ({activeReaderNote.checklist.filter((c) => c.done).length})</span>
                        <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                      </summary>
                      <div className="pt-2 space-y-1.5">
                        {activeReaderNote.checklist
                          .filter((c) => c.done)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleQuickToggleExisting(activeReaderNote, item.id, false)}
                              className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left text-xs text-slate-500 hover:bg-black/5 cursor-pointer transition-colors"
                            >
                              <CheckSquare className="h-4 w-4 mt-0.5 text-teal-600 shrink-0" />
                              <span className="leading-relaxed line-through text-slate-400">{item.text}</span>
                            </button>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Editor Dialog (Optimized for Maximum Visible Space for Notes / Details) */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? dict.notes.editTitle : dict.notes.createTitle}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveEditor} className="space-y-3.5">
          {eError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{eError}</div>
          )}

          {/* Primary Header Strip: Title + Scope + Starter Templates */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <Input
              value={eTitle}
              onChange={(e) => setETitle(e.target.value)}
              placeholder="Note Title (e.g. Tax Invoices, Project Roadmap)..."
              required
              className="flex-1 font-semibold text-sm h-9"
            />
            <Select
              value={eScope}
              onChange={(e) => setEScope(e.target.value as NoteScope)}
              className="w-auto h-9 text-xs"
              aria-label="Note Scope"
            >
              <option value="general">General</option>
              <option value="personal">{dict.scopes.personal}</option>
              <option value="business">{dict.scopes.business}</option>
              <option value="family">{dict.scopes.family}</option>
            </Select>

            {/* Templates Selector */}
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setTemplateDropdownOpen((o) => !o)}
                className="h-9 text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span>Templates ▾</span>
              </Button>
              {templateDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-popup-in">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Insert Starter Template
                  </div>
                  {NOTE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl, 'editor')}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                    >
                      <span>{tpl.icon}</span>
                      <span className="truncate">{tpl.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compact Secondary Toolbar: Optional/Less frequently used items take minimal vertical space */}
          <div className="space-y-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Color Swatch Dots */}
              <div className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-slate-400" />
                <div className="inline-flex items-center gap-1">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEColor(c)}
                      aria-label={`Select color ${c}`}
                      className={cn(
                        'h-4.5 w-4.5 rounded-full border flex items-center justify-center cursor-pointer transition-transform',
                        KEEP_COLOR_STYLE[c].dotClass,
                        eColor === c && 'ring-2 ring-slate-900 scale-110',
                      )}
                    >
                      {eColor === c && <Check className="h-2.5 w-2.5 text-slate-800" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pin, Archive & Reminder */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ePinned}
                    onChange={(e) => setEPinned(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                  {dict.notes.pinLabel}
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eArchived}
                    onChange={(e) => setEArchived(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-600"
                  />
                  {dict.notes.archive}
                </label>

                <div className="flex items-center gap-1">
                  <BellRing className="h-3 w-3 text-slate-400" />
                  <input
                    type="datetime-local"
                    value={eRemindAt}
                    onChange={(e) => setERemindAt(e.target.value)}
                    className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 focus:outline-none"
                    title="Reminder date & time"
                  />
                </div>
              </div>
            </div>

            {/* Quick Reminder Presets Bar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60 text-[11px] text-slate-600">
              <span className="text-slate-400">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
                  setERemindAt(isoToLocalInputValue(d.toISOString()));
                }}
                className="rounded bg-white border border-slate-200 px-1.5 py-0.5 hover:bg-slate-100 cursor-pointer"
              >
                +3 Hours
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  setERemindAt(isoToLocalInputValue(d.toISOString()));
                }}
                className="rounded bg-white border border-slate-200 px-1.5 py-0.5 hover:bg-slate-100 cursor-pointer"
              >
                Tomorrow 9 AM
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(20, 0, 0, 0);
                  setERemindAt(isoToLocalInputValue(d.toISOString()));
                }}
                className="rounded bg-white border border-slate-200 px-1.5 py-0.5 hover:bg-slate-100 cursor-pointer"
              >
                Tomorrow 8 PM
              </button>
              {eRemindAt && (
                <button
                  type="button"
                  onClick={() => setERemindAt('')}
                  className="text-red-600 hover:text-red-800 underline ml-auto cursor-pointer"
                >
                  Clear Reminder
                </button>
              )}
            </div>

            {/* Tags Strip (Pillar 1) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Tags:
              </span>
              {eTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => setETags((tags) => tags.filter((t) => t !== tag))}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={eTagInput}
                onChange={(e) => setETagInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && eTagInput.trim()) {
                    e.preventDefault();
                    const clean = eTagInput.replace(/^#/, '').trim();
                    if (clean && !eTags.includes(clean)) {
                      setETags([...eTags, clean]);
                    }
                    setETagInput('');
                  }
                }}
                placeholder="+ Add tag (Enter)"
                className="h-6 w-28 bg-white rounded border border-slate-200 px-1.5 text-[11px] text-slate-700 focus:outline-none"
              />
            </div>

            {/* Financial Entity Linking Strip (Pillar 4) */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Link Entity:
              </span>
              <select
                value={
                  eLinkedTxId
                    ? `tx:${eLinkedTxId}`
                    : eLinkedDueId
                      ? `due:${eLinkedDueId}`
                      : eLinkedLoanId
                        ? `loan:${eLinkedLoanId}`
                        : eLinkedAccountId
                          ? `acc:${eLinkedAccountId}`
                          : ''
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setELinkedTxId('');
                  setELinkedDueId('');
                  setELinkedLoanId('');
                  setELinkedAccountId('');
                  if (val.startsWith('tx:')) setELinkedTxId(val.slice(3));
                  if (val.startsWith('due:')) setELinkedDueId(val.slice(4));
                  if (val.startsWith('loan:')) setELinkedLoanId(val.slice(5));
                  if (val.startsWith('acc:')) setELinkedAccountId(val.slice(4));
                }}
                className="h-6 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:outline-none"
              >
                <option value="">(None - Standalone Note)</option>
                {accounts.length > 0 && (
                  <optgroup label="Accounts">
                    {accounts.map((a) => (
                      <option key={a.id} value={`acc:${a.id}`}>
                        Account: {a.name} ({a.scope})
                      </option>
                    ))}
                  </optgroup>
                )}
                {transactions.length > 0 && (
                  <optgroup label="Transactions">
                    {transactions.slice(0, 15).map((t) => (
                      <option key={t.id} value={`tx:${t.id}`}>
                        Tx: {t.party || t.category} ({formatINR(t.amountMinor)}) · {t.occurredAt.slice(0, 10)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {dues.length > 0 && (
                  <optgroup label="People Dues">
                    {dues.map((d) => (
                      <option key={d.id} value={`due:${d.id}`}>
                        Due: {d.personName} ({formatINR(d.amountMinor)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {loans.length > 0 && (
                  <optgroup label="Loans">
                    {loans.map((l) => (
                      <option key={l.id} value={`loan:${l.id}`}>
                        Loan: {l.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Notes / Details: Expansive, Generous Space with Markdown Write & Preview Tabs */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <FieldLabel>Notes / Details (Markdown Supported)</FieldLabel>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEditorTab('write')}
                  className={cn(
                    'rounded-md px-2.5 py-0.5 font-medium transition-colors cursor-pointer',
                    editorTab === 'write' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <Pencil className="h-3 w-3 inline mr-1" />
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('preview')}
                  className={cn(
                    'rounded-md px-2.5 py-0.5 font-medium transition-colors cursor-pointer',
                    editorTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  <Eye className="h-3 w-3 inline mr-1" />
                  Preview
                </button>
              </div>
            </div>

            {editorTab === 'write' ? (
              <Textarea
                rows={11}
                value={eBody}
                onChange={(e) => setEBody(e.target.value)}
                placeholder="Write full long message or detailed note here... Supports Markdown (# Header, **bold**, - list, `code`, > quote)"
                className="w-full min-h-[240px] sm:min-h-[280px] font-sans text-xs leading-relaxed resize-y"
              />
            ) : (
              <div className="min-h-[240px] sm:min-h-[280px] max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                {eBody.trim() ? (
                  <MarkdownView content={eBody} />
                ) : (
                  <p className="text-xs italic text-slate-400">Nothing to preview yet. Switch to "Write" to add content.</p>
                )}
              </div>
            )}
          </div>

          {/* Checklist Items Drawer */}
          <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2 group" open={eChecklist.length > 0}>
            <summary className="text-xs font-semibold text-slate-700 cursor-pointer list-none flex items-center justify-between select-none">
              <span className="flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-teal-700" />
                Checklist Items ({eChecklist.length})
              </span>
              <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>

            <div className="pt-2 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={eNewItemText}
                  onChange={(e) => setENewItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && eNewItemText.trim()) {
                      e.preventDefault();
                      setEChecklist((prev) => [...prev, { text: eNewItemText.trim(), done: false }]);
                      setENewItemText('');
                    }
                  }}
                  placeholder="Add item and press Enter..."
                  className="h-8 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (!eNewItemText.trim()) return;
                    setEChecklist((prev) => [...prev, { text: eNewItemText.trim(), done: false }]);
                    setENewItemText('');
                  }}
                >
                  Add
                </Button>
              </div>

              {eChecklist.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {eChecklist.map((item, idx) => (
                    <div
                      key={item.id ?? `edit-${idx}`}
                      className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setEChecklist((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, done: !row.done } : row)),
                          )
                        }
                        className="text-slate-500 hover:text-teal-700 cursor-pointer"
                      >
                        {item.done ? <CheckSquare className="h-4 w-4 text-teal-600" /> : <Square className="h-4 w-4" />}
                      </button>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) =>
                          setEChecklist((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, text: e.target.value } : row)),
                          )
                        }
                        className={cn(
                          'flex-1 bg-transparent text-xs focus:outline-none',
                          item.done ? 'line-through text-slate-400' : 'text-slate-900',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setEChecklist((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove checklist item"
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            {editingId ? (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  const target = notes.find((n) => n.id === editingId) ?? null;
                  setEditorOpen(false);
                  if (target) setDeleteTarget(target);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> {dict.common.delete}
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditorOpen(false)}>
                {dict.common.cancel}
              </Button>
              <Button variant="primary" type="submit" disabled={eSaving}>
                {eSaving ? dict.common.saving : editingId ? dict.notes.saveChanges : dict.notes.createNote}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* 6. Floating Bulk Actions Toolbar (Pillar 5) */}
      {selectedNoteIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-300 bg-slate-900/95 px-5 py-3 text-white shadow-2xl backdrop-blur-md animate-slide-up">
          <div className="text-xs font-semibold">
            {selectedNoteIds.length} note(s) selected
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Scope Changer */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Scope:</span>
            <select
              value={bulkScope}
              onChange={(e) => setBulkScope(e.target.value as NoteScope)}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white focus:outline-none"
            >
              <option value="general">General</option>
              <option value="personal">{dict.scopes.personal}</option>
              <option value="business">{dict.scopes.business}</option>
              <option value="family">{dict.scopes.family}</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('scope')}
              className="text-xs h-7 bg-slate-700 hover:bg-slate-600 text-white border-0"
            >
              Apply
            </Button>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Color Changer */}
          <div className="flex items-center gap-1">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleBulkAction('color', c)}
                title={`Set color to ${c}`}
                className={cn(
                  'h-4 w-4 rounded-full border border-white/40 cursor-pointer transition-transform hover:scale-125',
                  KEEP_COLOR_STYLE[c].dotClass,
                )}
              />
            ))}
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Add Tag to selected */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="Tag..."
              className="w-20 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy || !bulkTagInput.trim()}
              onClick={() => handleBulkAction('tag')}
              className="text-xs h-7 bg-slate-700 hover:bg-slate-600 text-white border-0"
            >
              +Tag
            </Button>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Pin & Archive */}
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkBusy}
            onClick={() => handleBulkAction('pin')}
            className="text-xs h-7 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Pin className="h-3 w-3" /> Pin
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={bulkBusy}
            onClick={() => handleBulkAction('archive')}
            className="text-xs h-7 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Archive className="h-3 w-3" /> Archive
          </Button>

          {/* Bulk Delete */}
          <Button
            variant="danger"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setBulkDeleteOpen(true)}
            className="text-xs h-7"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>

          {/* Clear */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedNoteIds([])}
            className="text-xs h-7 text-slate-400 hover:text-white"
          >
            Clear
          </Button>
        </div>
      )}

      {/* 7. Image Lightbox Viewer Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-popup-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 bg-black/60 px-4 py-2.5 text-white">
              <span className="text-xs font-semibold truncate">{lightboxImage.title}</span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  download={lightboxImage.title}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                  title="Download image"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[80vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Note Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={dict.common.confirmDeleteTitle}
        message={`${dict.common.confirmDeleteMsg} (${deleteTarget?.title ?? ''})`}
        confirmLabel={dict.common.delete}
        cancelLabel={dict.common.cancel}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await api.deleteNote(deleteTarget.id);
          onNotify?.(`${dict.common.delete} ✓`);
          onRefresh();
        }}
      />

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Delete Selected Notes"
        message={`Are you sure you want to delete ${selectedNoteIds.length} selected note(s)? This action cannot be undone.`}
        confirmLabel="Delete Selected"
        cancelLabel={dict.common.cancel}
        onConfirm={async () => {
          await handleBulkAction('delete');
        }}
      />
    </div>
  );
}
