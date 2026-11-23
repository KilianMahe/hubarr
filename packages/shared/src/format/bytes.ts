// SPDX-License-Identifier: AGPL-3.0-or-later
// Tailles et débits (`DisplayPreferencesExtension::filterBytes`, `filterSpeed`) :
// base 1024, unités grand public (GB, MB… ; en français Go, Mo…), une décimale
// par défaut, aucune pour les octets, « — » si la valeur n'est pas un nombre.

export const BYTE_UNITS = {
  en: { B: 'B', KB: 'KB', MB: 'MB', GB: 'GB', TB: 'TB' },
  fr: { B: 'o', KB: 'Ko', MB: 'Mo', GB: 'Go', TB: 'To' },
} as const;

export function byteUnits(locale: string) {
  return locale.startsWith('fr') ? BYTE_UNITS.fr : BYTE_UNITS.en;
}

/** Valeur et unité séparées (tuiles de statistiques), `null` si ce n'est pas un nombre. */
export function sizeParts(
  raw: unknown,
  locale: string,
  precision = 1,
): { value: string; unit: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const bytes = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(bytes)) return null;
  const units = byteUnits(locale);
  const abs = Math.abs(bytes);
  let value = bytes;
  let unit: string = units.B;
  if (abs >= 1024 ** 4) [value, unit] = [bytes / 1024 ** 4, units.TB];
  else if (abs >= 1024 ** 3) [value, unit] = [bytes / 1024 ** 3, units.GB];
  else if (abs >= 1024 ** 2) [value, unit] = [bytes / 1024 ** 2, units.MB];
  else if (abs >= 1024) [value, unit] = [bytes / 1024, units.KB];
  const digits = unit === units.B ? 0 : precision;
  return { value: value.toFixed(digits), unit };
}

function format(raw: unknown, locale: string, precision: number, perSecond: boolean): string {
  const parts = sizeParts(raw, locale, precision);
  return parts === null ? '—' : `${parts.value} ${parts.unit}${perSecond ? '/s' : ''}`;
}

/** Octets d'une taille donnée en Go (base 1024) par l'API, pour l'afficher en To au besoin (V29). */
export function gigabytesToBytes(gb: number): number {
  return gb * 1024 ** 3;
}

export function formatBytes(bytes: unknown, locale: string, precision = 1): string {
  return format(bytes, locale, precision, false);
}

export function formatSpeed(bytesPerSecond: unknown, locale: string, precision = 1): string {
  return format(bytesPerSecond, locale, precision, true);
}
