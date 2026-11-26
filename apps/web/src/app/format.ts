// SPDX-License-Identifier: AGPL-3.0-or-later
// Formats selon les préférences d'affichage (date, heure, date et heure,
// tailles, débits) ; temps relatif (« il y a 5 min »).

import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatSpeed,
  formatTime,
  gigabytesToBytes,
  sizeParts,
} from '@hubarr/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { i18n } from './plugins/i18n';
import { useSessionStore } from './stores/session';

type DateInput = Date | string | number | null | undefined;

/**
 * Taille donnée en Go par l'API (bibliothèques, disques), affichée comme les
 * autres tailles : en To au-delà de 1 024 Go (P5d.5, V29), « — » sans valeur.
 */
export function formatGb(gb: number | null | undefined, precision = 1): string {
  return formatBytes(
    gb === null || gb === undefined ? null : gigabytesToBytes(gb),
    i18n.global.locale.value,
    precision,
  );
}

/** Valeur et unité d'une taille en Go, pour les tuiles de statistiques. */
export function gbParts(gb: number | null | undefined): { value: string; unit: string } {
  return (
    sizeParts(
      gb === null || gb === undefined ? null : gigabytesToBytes(gb),
      i18n.global.locale.value,
    ) ?? {
      value: '—',
      unit: '',
    }
  );
}

/** Unités au-delà de la minute, avec le nombre d'unités précédentes qu'elles valent. */
const RELATIVE_STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['hour', 60],
  ['day', 24],
  ['week', 7],
];

/**
 * Temps écoulé depuis `at` (ms) dans la langue de l'interface : « maintenant »
 * sous la minute, puis minutes, heures, jours et semaines.
 */
export function relativeTime(at: number, now: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  let value = Math.floor(Math.max(0, now - at) / 60_000);
  if (value === 0) return rtf.format(0, 'second');
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  for (const [next, size] of RELATIVE_STEPS) {
    if (value < size) break;
    value = Math.floor(value / size);
    unit = next;
  }
  return rtf.format(-value, unit);
}

export function useFormat() {
  const session = useSessionStore();
  const { locale } = useI18n();
  const prefs = computed(() => ({
    dateFormat: session.preferences.display_date_format,
    timeFormat: session.preferences.display_time_format,
    timezone: session.preferences.display_timezone,
  }));
  return {
    date: (value: DateInput) => formatDate(value, prefs.value),
    time: (value: DateInput, withSeconds = false) => formatTime(value, prefs.value, withSeconds),
    dateTime: (value: DateInput, withSeconds = false) =>
      formatDateTime(value, prefs.value, withSeconds),
    bytes: (value: unknown, precision = 1) => formatBytes(value, locale.value, precision),
    speed: (value: unknown, precision = 1) => formatSpeed(value, locale.value, precision),
  };
}
