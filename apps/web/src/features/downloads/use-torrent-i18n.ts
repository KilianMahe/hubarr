// SPDX-License-Identifier: AGPL-3.0-or-later
// Textes de la vue des clients torrent : clé du client si elle existe, sinon
// celle de qBittorrent ; messages à marqueurs `__NOM__` complétés en texte ;
// durées et âges relatifs avec les gabarits de l'original.

import type { TorrentClientId } from '@hubarr/shared';
import { useI18n } from 'vue-i18n';
import { fillLegacy } from '../../app/legacy-template';
import { useNotifyStore } from '../../app/stores/notify';
import { relativeAge, splitDuration, torrentKey } from './torrents';

export function useTorrentI18n(client: () => TorrentClientId) {
  const i18n = useI18n();
  const { t } = i18n;
  const key = (name: string) => torrentKey(client(), name, (k) => i18n.te(k));
  /** Message du client (ICU : `count`…). */
  const tk = (name: string, values: Record<string, unknown> = {}) => t(key(name), values);
  /** Message à marqueurs `__NOM__` de l'original. */
  const tl = (name: string, values: Record<string, string | number>) =>
    fillLegacy(t(key(name)), values);

  function duration(seconds: number | null): string {
    if (seconds === null || seconds <= 0) return '—';
    const { d, h, m } = splitDuration(seconds);
    if (d > 0) return tl('units.duration_days_tpl', { D: d, H: h });
    if (h > 0) return tl('units.duration_hours_tpl', { H: h, M: m });
    return tl('units.duration_minutes_tpl', { M: Math.max(1, m) });
  }

  function age(unix: number | null): string {
    const value = relativeAge(unix);
    if (value === null) return '—';
    switch (value.unit) {
      case 'now':
        return tk('date.just_now');
      case 'minutes':
        return tl('date.minutes_ago_tpl', { N: value.n });
      case 'hours':
        return tl('date.hours_ago_tpl', { N: value.n });
      case 'days':
        return tl('date.days_ago_tpl', { N: value.n });
      case 'months':
        return tl('date.months_ago_tpl', { N: value.n });
      case 'years':
        return tk('date.years_ago_tpl', { count: value.n });
    }
  }

  function uptime(ms: number): string {
    const { d, h, m, s } = splitDuration(ms / 1000);
    const hours = d * 24 + h;
    if (hours > 0) return tl('units.uptime_hours_tpl', { H: hours, M: m });
    if (m > 0) return tl('units.uptime_minutes_tpl', { M: m });
    return tl('units.uptime_seconds_tpl', { S: s });
  }

  // Messages déjà traduits (gabarits `__NOM__`, texte d'un client) : clé de passage.
  const notify = useNotifyStore();
  const say = {
    success: (text: string) => {
      notify.success('common.labels.text', { text });
    },
    error: (text: string) => {
      notify.error('common.labels.text', { text });
    },
    info: (text: string) => {
      notify.info('common.labels.text', { text });
    },
  };

  return { t, key, tk, tl, say, duration, age, uptime };
}
