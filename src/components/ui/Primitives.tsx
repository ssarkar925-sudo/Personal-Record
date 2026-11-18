import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ArrowUpDown, LayoutGrid, List, X } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'btn-press inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111318] disabled:pointer-events-none disabled:opacity-50 cursor-pointer whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        variant === 'primary' &&
          'bg-gradient-to-b from-[#1E222B] to-[#111318] text-[#FAF8F5] hover:from-[#282D38] hover:to-[#161920] border border-[#111318] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_rgba(17,19,24,0.2)]',
        variant === 'secondary' &&
          'bg-white text-[#111318] border border-[#EAE5DC] hover:bg-[#FAF8F5] hover:border-[#D6CFC2] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(17,19,24,0.04)]',
        variant === 'ghost' && 'text-[#52504C] hover:bg-[#F3EFEA] hover:text-[#111318]',
        variant === 'danger' &&
          'bg-gradient-to-b from-rose-600 to-rose-700 text-white hover:from-rose-500 hover:to-rose-700 border border-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(225,29,72,0.25)]',
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  interactive = false,
  children,
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'studio-card rounded-2xl',
        interactive && 'studio-card-hover',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-[#52504C] mb-1">
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full h-9 rounded-lg border border-[#D6CFC2] bg-white px-3 text-sm text-[#111318] placeholder:text-[#858078] focus:border-[#111318] focus:outline-none focus:ring-2 focus:ring-[#111318]/10 disabled:bg-[#F3EFEA]',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full h-9 rounded-lg border border-[#D6CFC2] bg-white px-2.5 text-sm text-[#111318] focus:border-[#111318] focus:outline-none focus:ring-2 focus:ring-[#111318]/10',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function CategorySelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Custom category...',
  required = true,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [customMode, setCustomMode] = useState(false);

  const normalizedOptions = React.useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (item: string) => {
      const t = item.trim();
      if (!t || seen.has(t.toLowerCase())) return;
      seen.add(t.toLowerCase());
      out.push(t);
    };
    for (const o of options) add(o);
    if (value.trim()) add(value);
    return out;
  }, [options, value]);

  if (customMode) {
    const isCompact = className?.includes('h-8');
    return (
      <div className="flex items-center gap-1">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={className}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            if (!value.trim() && normalizedOptions.length > 0) {
              onChange(normalizedOptions[0]);
            }
          }}
          title="Back to category dropdown"
          aria-label="Back to category dropdown"
          className={cn(
            'shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer',
            isCompact ? 'h-8' : 'h-9',
          )}
        >
          List
        </button>
      </div>
    );
  }

  return (
    <Select
      id={id}
      value={value}
      required={required}
      className={className}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          onChange('');
          setCustomMode(true);
        } else {
          onChange(e.target.value);
        }
      }}
    >
      {normalizedOptions.length === 0 && <option value="">Select category...</option>}
      {normalizedOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      <option value="__custom__">+ Custom category...</option>
    </Select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15',
        className,
      )}
      {...props}
    />
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  maxWidth = 'max-w-lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/35 p-4 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'my-auto w-full rounded-2xl border border-slate-200 bg-white shadow-[0_24px_56px_-12px_rgba(15,23,42,0.22)] animate-panel-in max-h-[calc(100dvh-2rem)] flex flex-col',
          maxWidth,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 shrink-0">
          <div>
            <h2 className="font-display text-base font-bold text-slate-950">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const Modal = Dialog;

export interface AnimatedTabItem<T extends string = string> {
  id: T;
  label: string;
  accentHex: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export function AnimatedTabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'primary',
}: {
  items: AnimatedTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  variant?: 'primary' | 'subtle';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number; color: string }>({
    left: 0,
    width: 0,
    color: items.find((i) => i.id === value)?.accentHex ?? '#1d4ed8',
  });

  const measure = () => {
    const container = containerRef.current;
    const activeBtn = btnRefs.current[value];
    if (!container || !activeBtn) return;
    const activeItem = items.find((i) => i.id === value);
    setIndicator({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
      color: activeItem?.accentHex ?? '#1d4ed8',
    });
  };

  useLayoutEffect(() => {
    measure();
  }, [value, items.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [value]);

  const activeItem = items.find((i) => i.id === value);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={cn(
        'relative flex items-center gap-1 overflow-x-auto no-scrollbar',
        variant === 'primary'
          ? 'pb-1'
          : 'rounded-xl bg-slate-100/90 p-1 border border-[#d8e1ee]',
      )}
    >
      {/* Gliding multi-color pill / underline */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          variant === 'primary'
            ? 'top-0.5 bottom-1.5 rounded-xl border'
            : 'top-1 bottom-1 rounded-lg bg-white shadow-xs border border-slate-200/80',
        )}
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          backgroundColor: variant === 'primary' ? `${activeItem?.accentHex ?? indicator.color}14` : undefined,
          borderColor: variant === 'primary' ? `${activeItem?.accentHex ?? indicator.color}38` : undefined,
          borderBottom: variant === 'subtle' ? `2px solid ${activeItem?.accentHex ?? indicator.color}` : undefined,
        }}
      />
      {variant === 'primary' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 h-[3px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            transform: `translateX(${indicator.left + 8}px)`,
            width: `${Math.max(12, indicator.width - 16)}px`,
            backgroundColor: activeItem?.accentHex ?? indicator.color,
          }}
        />
      )}

      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              btnRefs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative z-10 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 rounded-lg',
              variant === 'primary' ? 'px-2.5 sm:px-3 py-2 text-xs sm:text-sm' : 'px-2.5 py-1.5 text-xs',
              active ? 'text-slate-950 font-semibold' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.icon && (
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors"
                style={{
                  backgroundColor: active ? `${item.accentHex}18` : 'transparent',
                  color: active ? item.accentHex : '#64748b',
                }}
              >
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
              <span
                className="rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums"
                style={{
                  backgroundColor: active ? `${item.accentHex}18` : '#e2e8f0',
                  color: active ? item.accentHex : '#475569',
                }}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ViewModeToggle({
  value,
  onChange,
  gridLabel = 'Grid',
  listLabel = 'List',
}: {
  value: 'grid' | 'list';
  onChange: (next: 'grid' | 'list') => void;
  gridLabel?: string;
  listLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label="View layout"
      className="inline-flex h-8 items-center rounded-xl border border-[#d8e1ee] bg-slate-100/80 p-0.5 text-xs"
    >
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        title={gridLabel}
        className={cn(
          'btn-press inline-flex h-full items-center gap-1 rounded-lg px-2 font-medium cursor-pointer',
          value === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900',
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{gridLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        title={listLabel}
        className={cn(
          'btn-press inline-flex h-full items-center gap-1 rounded-lg px-2 font-medium cursor-pointer',
          value === 'list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900',
        )}
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{listLabel}</span>
      </button>
    </div>
  );
}

export function SortSelect({
  value,
  onChange,
  options,
  label = 'Sort',
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
}) {
  return (
    <label className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#d8e1ee] bg-white px-2.5 text-xs text-slate-600 shadow-2xs">
      <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <span className="hidden md:inline text-[11px] font-medium text-slate-500">{label}:</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer pr-1"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-600">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
