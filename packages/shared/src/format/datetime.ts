// SPDX-License-Identifier: AGPL-3.0-or-later
// Formats de date et d'heure selon les préférences (`DisplayPreferencesService::
// formatDate`, `formatTime`, `formatDateTime`) : jour/mois/année (`fr`),
// « Apr 21, 2026 » (`us`) ou ISO, 24 h ou 12 h, dans le fuseau choisi.

export interface DateTimePreferences {
  dateFormat: string;
  timeFormat: string;
  /** Fuseau IANA ; vide ou invalide : fuseau du navigateur. */
  timezone: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (formatter === undefined) {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    };
    try {
      formatter = new Intl.DateTimeFormat(
        'en-US',
        timezone === '' ? options : { ...options, timeZone: timezone },
      );
    } catch {
      // Fuseau enregistré invalide : on n'échoue pas, on garde celui du navigateur.
      formatter = new Intl.DateTimeFormat('en-US', options);
    }
    formatters.set(timezone, formatter);
  }
  return formatter;
}

function partsOf(date: Date, timezone: string): Parts {
  const out: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  prefs: DateTimePreferences,
): string | null {
  const date = toDate(value);
  if (date === null) return null;
  const p = partsOf(date, prefs.timezone);
  if (prefs.dateFormat === 'us') return `${MONTHS[p.month - 1] ?? ''} ${p.day}, ${p.year}`;
  if (prefs.dateFormat === 'iso') return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

export function formatTime(
  value: Date | string | number | null | undefined,
  prefs: DateTimePreferences,
  withSeconds = false,
): string | null {
  const date = toDate(value);
  if (date === null) return null;
  const p = partsOf(date, prefs.timezone);
  const seconds = withSeconds ? `:${pad(p.second)}` : '';
  if (prefs.timeFormat === '12h') {
    const hour = p.hour % 12 === 0 ? 12 : p.hour % 12;
    return `${hour}:${pad(p.minute)}${seconds} ${p.hour < 12 ? 'AM' : 'PM'}`;
  }
  return `${pad(p.hour)}:${pad(p.minute)}${seconds}`;
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  prefs: DateTimePreferences,
  withSeconds = false,
): string | null {
  const date = formatDate(value, prefs);
  return date === null ? null : `${date} · ${formatTime(value, prefs, withSeconds) ?? ''}`;
}

/** Jour calendaire (« AAAA-MM-JJ ») d'un instant dans un fuseau (vide : fuseau local). */
export function dayInZone(value: Date | string | number, timezone: string): string | null {
  const date = toDate(value);
  if (date === null) return null;
  const p = partsOf(date, timezone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Heure (0-23) d'un instant dans un fuseau. */
export function hourInZone(value: Date | string | number, timezone: string): number | null {
  const date = toDate(value);
  return date === null ? null : partsOf(date, timezone).hour;
}

/** Jour décalé de `days` jours (« AAAA-MM-JJ » → « AAAA-MM-JJ »), sans fuseau. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
