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
    badgeClass: 'bg-emerald-50/90 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-600',
    hex: '#059669',
  },
  business: {
    label: 'Business',
    badgeClass: 'bg-amber-50/90 text-amber-900 border-amber-300/80',
    dotClass: 'bg-[#C59B27]',
    hex: '#C59B27',
  },
  family: {
    label: 'Family',
    badgeClass: 'bg-indigo-50/90 text-indigo-900 border-indigo-200',
    dotClass: 'bg-[#4F46E5]',
    hex: '#4F46E5',
  },
  general: {
    label: 'General',
    badgeClass: 'bg-[#F3EFEA] text-[#52504C] border-[#EAE5DC]',
    dotClass: 'bg-[#858078]',
    hex: '#52504C',
  },
} as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso || !iso.includes('-')) return '';
  const parts = iso.split('-');
  const y = parts[0];
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatDisplayDateShort(iso: string | null | undefined): string {
  if (!iso || !iso.includes('-')) return '';
  const parts = iso.split('-');
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

export function formatOrdinalDay(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}
