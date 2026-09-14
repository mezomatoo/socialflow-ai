/**
 * Türkçe biçimlendirme yardımcıları.
 * Tarih: GG.AA.YYYY — Saat: 24 saatlik — Para: ₺ (TRY) — Zaman dilimi: Europe/Istanbul
 */

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';
export const DEFAULT_LOCALE = 'tr-TR';

export function formatDate(date: string | number | Date | null | undefined, tz = DEFAULT_TIMEZONE): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: tz
  }).format(d);
}

export function formatTime(date: string | number | Date | null | undefined, tz = DEFAULT_TIMEZONE): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz
  }).format(d);
}

export function formatDateTime(
  date: string | number | Date | null | undefined,
  tz = DEFAULT_TIMEZONE
): string {
  if (!date) return '—';
  return `${formatDate(date, tz)} ${formatTime(date, tz)}`;
}

export function formatDateTimeLong(
  date: string | number | Date | null | undefined,
  tz = DEFAULT_TIMEZONE
): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz
  }).format(d);
}

export function formatRelative(date: string | number | Date | null | undefined, tz = DEFAULT_TIMEZONE): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (abs < min) return diffMs < 0 ? 'az önce' : 'birazdan';
  if (abs < hour) return rtf.format(Math.round(diffMs / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return formatDate(d, tz);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('tr-TR').format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '%0';
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(value)}`;
}

export function formatCurrency(value: number | null | undefined, currency = 'TRY'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '₺0';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} dk ${String(s).padStart(2, '0')} sn` : `${s} sn`;
}

export function formatRatio(ratio: number | null | undefined): string {
  if (!ratio || !Number.isFinite(ratio)) return '—';
  const candidates: [string, number][] = [
    ['1:1', 1],
    ['4:5', 0.8],
    ['9:16', 0.5625],
    ['16:9', 1.7778],
    ['2:3', 0.6667],
    ['3:2', 1.5],
    ['4:3', 1.3333],
    ['3:4', 0.75],
    ['1.91:1', 1.91],
    ['21:9', 2.3333]
  ];
  for (const [label, value] of candidates) {
    if (Math.abs(value - ratio) / value < 0.02) return label;
  }
  return `${ratio.toFixed(2)}:1`;
}

/** "YYYY-MM-DDTHH:mm" → Date (belirtilen zaman diliminde yorumlanır) */
export function zonedTimeToUtc(localIso: string, timeZone = DEFAULT_TIMEZONE): Date {
  const d = new Date(localIso);
  if (Number.isNaN(d.getTime())) return new Date();
  // Tarayıcı/sunucu saatini hedef zaman dilimine göre kaydırır.
  const targetParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t: string) => targetParts.find((p) => p.type === t)?.value ?? '0';
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second'))
  );
  const offset = asUtc - d.getTime();
  return new Date(d.getTime() + offset);
}

/** Date → "YYYY-MM-DDTHH:mm" (datetime-local input için) */
export function toLocalInputValue(date: Date | string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function startOfDayInTz(date: Date, timeZone = DEFAULT_TIMEZONE): Date {
  const iso = toLocalInputValue(date, timeZone).slice(0, 10);
  return zonedTimeToUtc(`${iso}T00:00`, timeZone);
}

export function isSameDay(a: Date, b: Date, timeZone = DEFAULT_TIMEZONE): boolean {
  return toLocalInputValue(a, timeZone).slice(0, 10) === toLocalInputValue(b, timeZone).slice(0, 10);
}

export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık'
];
