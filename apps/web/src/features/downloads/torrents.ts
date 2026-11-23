// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique d'affichage des clients torrent (P3d.1), sortie des composants pour
// être testée : préférences mémorisées, couleurs et icônes des états, durées,
// dates relatives, choix des clés i18n par client.

import {
  TORRENT_SORTS,
  type TorrentClientId,
  type TorrentSort,
  type TorrentState,
} from '@hubarr/shared';
import {
  mdiAlertCircle,
  mdiArrowDownBold,
  mdiArrowUpBold,
  mdiCheckCircle,
  mdiClockOutline,
  mdiFolderMove,
  mdiHelpCircle,
  mdiPauseCircle,
  mdiProgressClock,
  mdiRefresh,
} from '@mdi/js';

export const TORRENT_POLL_MS = 3_000;
export const VPN_POLL_MS = 30_000;
export const PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
export const TORRENT_VIEWS = ['list', 'table', 'compact'] as const;
export type TorrentView = (typeof TORRENT_VIEWS)[number];

/** Préférences de la liste (`qbt_view`, `qbt_per_page`, `qbt_sort_*` de l'original), par client. */
export interface TorrentPrefs {
  view: TorrentView;
  perPage: number;
  sort: TorrentSort;
  desc: boolean;
}

const prefsKey = (client: TorrentClientId) => `hubarr.torrents.${client}`;

export function loadPrefs(
  client: TorrentClientId,
  storage: Storage = localStorage,
  defaultView: TorrentView = 'table',
): TorrentPrefs {
  const fallback: TorrentPrefs = { view: defaultView, perPage: 50, sort: 'added', desc: true };
  try {
    const raw = JSON.parse(storage.getItem(prefsKey(client)) ?? '{}') as Partial<TorrentPrefs>;
    const view = TORRENT_VIEWS.find((value) => value === raw.view);
    const perPage = PER_PAGE_OPTIONS.find((value) => value === raw.perPage);
    const sort = TORRENT_SORTS.find((value) => value === raw.sort);
    return {
      view: view ?? fallback.view,
      perPage: perPage ?? fallback.perPage,
      sort: sort ?? fallback.sort,
      desc: typeof raw.desc === 'boolean' ? raw.desc : fallback.desc,
    };
  } catch {
    return fallback;
  }
}

export function savePrefs(
  client: TorrentClientId,
  prefs: TorrentPrefs,
  storage: Storage = localStorage,
): void {
  storage.setItem(prefsKey(client), JSON.stringify(prefs));
}

/** Couleur Vuetify d'un état (barre de progression, puce). */
export function stateColor(state: TorrentState): string {
  switch (state) {
    case 'downloading':
      return 'info';
    case 'seeding':
      return 'success';
    case 'paused':
      return 'warning';
    case 'error':
      return 'error';
    case 'stalled':
      return 'orange';
    case 'completed':
      return 'teal';
    case 'checking':
    case 'moving':
      return 'secondary';
    default:
      return 'grey';
  }
}

export function stateIcon(state: TorrentState): string {
  switch (state) {
    case 'downloading':
      return mdiArrowDownBold;
    case 'seeding':
      return mdiArrowUpBold;
    case 'paused':
      return mdiPauseCircle;
    case 'queued':
      return mdiClockOutline;
    case 'checking':
      return mdiRefresh;
    case 'stalled':
      return mdiProgressClock;
    case 'error':
      return mdiAlertCircle;
    case 'moving':
      return mdiFolderMove;
    case 'completed':
      return mdiCheckCircle;
    default:
      return mdiHelpCircle;
  }
}

/** Découpage d'une durée en jours, heures, minutes, secondes. */
export function splitDuration(seconds: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(seconds));
  return {
    d: Math.floor(total / 86_400),
    h: Math.floor((total % 86_400) / 3_600),
    m: Math.floor((total % 3_600) / 60),
    s: total % 60,
  };
}

/** Âge relatif d'une date Unix (`fmtRelativeDate`) : unité et valeur. */
export function relativeAge(
  unix: number | null,
  nowMs: number = Date.now(),
): { unit: 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'; n: number } | null {
  if (unix === null || unix <= 0) return null;
  const diff = Math.floor(nowMs / 1000) - unix;
  if (diff < 60) return { unit: 'now', n: 0 };
  if (diff < 3_600) return { unit: 'minutes', n: Math.floor(diff / 60) };
  if (diff < 86_400) return { unit: 'hours', n: Math.floor(diff / 3_600) };
  if (diff < 2_592_000) return { unit: 'days', n: Math.floor(diff / 86_400) };
  if (diff < 31_536_000) return { unit: 'months', n: Math.floor(diff / 2_592_000) };
  return { unit: 'years', n: Math.floor(diff / 31_536_000) };
}

/**
 * Clé i18n d'un client : `<client>.<clé>` si elle existe, sinon celle de
 * qBittorrent (vocabulaire commun des trois pages de l'original).
 */
export function torrentKey(
  client: TorrentClientId,
  key: string,
  exists: (key: string) => boolean,
): string {
  const own = `${client}.${key}`;
  return exists(own) ? own : `qbittorrent.${key}`;
}

/** Libellé d'un statut de tracker (clés de l'original, sinon texte du client). */
export const TRACKER_STATUS_KEYS: Record<string, string> = {
  disabled: 'modal_detail.trackers.status_disabled',
  not_contacted: 'modal_detail.trackers.status_not_contacted',
  working: 'modal_detail.trackers.status_ok',
  updating: 'modal_detail.trackers.status_running',
  error: 'modal_detail.trackers.status_error',
  announcing: 'modal_detail.trackers.status_announcing',
  queued: 'modal_detail.trackers.status_queued',
  active: 'modal_detail.trackers.status_active',
  idle: 'modal_detail.trackers.status_idle',
};

/** Sélection après un rafraîchissement : seules les empreintes encore affichées restent. */
export function keepSelection(
  selected: ReadonlySet<string>,
  shown: readonly string[],
): Set<string> {
  const visible = new Set(shown);
  return new Set([...selected].filter((hash) => visible.has(hash)));
}

/** Mo/s saisis → octets/s (0 ou vide = illimité). */
export function mbpsToBytes(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number((value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024 * 1024) : 0;
}

/** Octets/s → Mo/s affichés (vide si illimité). */
export function bytesToMbps(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  return String(Math.round((bytes / 1024 / 1024) * 100) / 100);
}
