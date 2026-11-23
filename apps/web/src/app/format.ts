// SPDX-License-Identifier: AGPL-3.0-or-later
// Formats selon les préférences d'affichage (`prismarr_date`, `prismarr_time`,
// `prismarr_datetime`, `prismarr_bytes`, `prismarr_speed` d'origine).

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
