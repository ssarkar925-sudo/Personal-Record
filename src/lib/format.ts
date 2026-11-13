export {
  formatINR,
  rupeesToPaise,
  paiseToRupees,
  todayISO,
  currentMonthPrefix,
  daysBetweenISO,
  addMonthsISO,
  estimateMonthlyEmiMinor,
} from '../../shared/ledger-core.ts';

export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  const base = e164 ? `https://wa.me/${e164}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

export const SCOPE_META = {
  personal: {
    label: 'Personal',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-600',
    hex: '#2563eb',
  },
  business: {
    label: 'Business',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-600',
    hex: '#d97706',
  },
  family: {
    label: 'Family',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-600',
    hex: '#059669',
  },
  general: {
    label: 'General',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-500',
    hex: '#475569',
  },
} as const;
