// SPDX-License-Identifier: AGPL-3.0-or-later
// Surveillance globale des clients torrent (pollers de `base.html.twig`) :
// pour qBittorrent, Deluge et Transmission configurés, relecture de
// `/api/<client>/poll-summary` à l'intervalle choisi dans les préférences
// (`display_*_refresh`, 0 = désactivé), seulement sur les pages média (comme
// l'original, pour ne pas solliciter le client partout). Badge du nombre de
// téléchargements actifs dans le tiroir ; notification (centre de
// notifications, sans toast) quand un torrent se termine ou passe en erreur, une seule fois tous onglets confondus
// (`localStorage` + `BroadcastChannel`, 1 h). Repli exponentiel jusqu'à
// 2 min quand le client ne répond pas ; pause quand l'onglet est caché.
// Quand le flux temps réel sert le sujet `downloads.<client>` (P5.2), les
// résumés poussés remplacent le polling. Réservé aux admins (routes des
// clients).

import {
  torrentPollSummarySchema,
  type TorrentClientId,
  type TorrentPollSummary,
  type TorrentState,
} from '@hubarr/shared';
import { onBeforeUnmount, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from './api/client';
import { live } from './live';
import { isConfigured } from './services';
import { useFormat } from './format';
import { useNotifyStore } from './stores/notify';
import { useSessionStore } from './stores/session';

export const WATCHED_CLIENTS = [
  'qbittorrent',
  'deluge',
  'transmission',
] as const satisfies readonly TorrentClientId[];
const PREF = {
  qbittorrent: 'display_qbit_refresh',
  deluge: 'display_deluge_refresh',
  transmission: 'display_transmission_refresh',
} as const;
/** Pages où la surveillance tourne (`route starts with …` de l'original). */
const MEDIA_SERVICES = new Set([
  'qbittorrent',
  'deluge',
  'transmission',
  'radarr',
  'sonarr',
  'prowlarr',
  'seerr',
  'tmdb',
]);
export const MAX_DELAY_MS = 120_000;
const NOTIFIED_TTL_MS = 3_600_000;

/** Nombre de téléchargements actifs par client (badges du tiroir). */
export const downloadBadges = reactive<Record<string, number>>({});

export interface Transitions {
  next: Record<string, TorrentState>;
  completed: TorrentPollSummary['items'];
  errored: TorrentPollSummary['items'];
}

/** Passages « en téléchargement → terminé/partage » et « → erreur » depuis la relecture précédente. */
export function detectTransitions(
  prev: Record<string, string>,
  items: TorrentPollSummary['items'],
): Transitions {
  const out: Transitions = { next: {}, completed: [], errored: [] };
  for (const item of items) {
    out.next[item.hash] = item.state;
    const was = prev[item.hash];
    if (was === 'downloading' && (item.state === 'completed' || item.state === 'seeding')) {
      out.completed.push(item);
    }
    if (was !== undefined && was !== 'error' && item.state === 'error') out.errored.push(item);
  }
  return out;
}

/** Délai avant la relecture suivante : base, puis doublé à chaque échec, plafonné à 2 min. */
export function nextDelay(baseMs: number, failures: number): number {
  return failures === 0 ? baseMs : Math.min(baseMs * 2 ** (failures - 1), MAX_DELAY_MS);
}

const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};
const truncate = (name: string) => (name.length > 60 ? `${name.slice(0, 60)}…` : name);

export function useDownloadWatchers(): void {
  const session = useSessionStore();
  const notify = useNotifyStore();
  const format = useFormat();
  const route = useRoute();
  const timers = new Map<TorrentClientId, ReturnType<typeof setTimeout>>();
  const failures = new Map<TorrentClientId, number>();
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('hubarr-downloads');

  const notifiedKey = (client: TorrentClientId) => `hubarr.${client}.notified`;
  const stateKey = (client: TorrentClientId) => `hubarr.${client}.last-state`;
  function markNotified(client: TorrentClientId, hash: string, broadcast = true): void {
    const now = Date.now();
    const map = Object.fromEntries(
      Object.entries(read<Record<string, number>>(notifiedKey(client), {})).filter(
        ([, at]) => now - at < NOTIFIED_TTL_MS,
      ),
    );
    map[hash] = now;
    localStorage.setItem(notifiedKey(client), JSON.stringify(map));
    if (broadcast) channel?.postMessage({ client, hash });
  }
  const alreadyNotified = (client: TorrentClientId, hash: string) => {
    const at = read<Record<string, number>>(notifiedKey(client), {})[hash];
    return at !== undefined && Date.now() - at < NOTIFIED_TTL_MS;
  };
  if (channel) {
    channel.onmessage = (event: MessageEvent<{ client: TorrentClientId; hash: string }>) => {
      markNotified(event.data.client, event.data.hash, false);
    };
  }

  const interval = (client: TorrentClientId) => Number(session.preferences[PREF[client]]) * 1000;
  const active = (client: TorrentClientId) =>
    session.can(client, null, 'read') &&
    isConfigured(session.services, client) &&
    interval(client) > 0 &&
    !document.hidden &&
    route.matched.some(
      (record) => record.meta.service !== undefined && MEDIA_SERVICES.has(record.meta.service),
    );

  function stop(client: TorrentClientId): void {
    clearTimeout(timers.get(client));
    timers.delete(client);
  }
  function schedule(client: TorrentClientId): void {
    stop(client);
    if (!active(client)) return;
    timers.set(
      client,
      setTimeout(() => void poll(client), nextDelay(interval(client), failures.get(client) ?? 0)),
    );
  }
  function process(client: TorrentClientId, summary: TorrentPollSummary): void {
    downloadBadges[client] = summary.active;
    const { next, completed, errored } = detectTransitions(
      read(stateKey(client), {}),
      summary.items,
    );
    for (const item of completed) {
      if (alreadyNotified(client, item.hash)) continue;
      notify.success(
        'downloads.toast.completed',
        {
          name: truncate(item.name),
          size: format.bytes(item.size),
        },
        { toast: false },
      );
      markNotified(client, item.hash);
    }
    for (const item of errored) {
      if (alreadyNotified(client, item.hash)) continue;
      notify.error('downloads.toast.errored', { name: truncate(item.name) }, { toast: false });
      markNotified(client, item.hash);
    }
    localStorage.setItem(stateKey(client), JSON.stringify(next));
  }
  async function poll(client: TorrentClientId): Promise<void> {
    if (!active(client)) return;
    // Servi par le flux temps réel : rien à relire, on revérifie au prochain tick.
    if (!live.isLive(`downloads.${client}`)) {
      try {
        process(client, await api.get(`/api/${client}/poll-summary`, torrentPollSummarySchema));
        failures.set(client, 0);
      } catch {
        failures.set(client, (failures.get(client) ?? 0) + 1);
      }
    }
    schedule(client);
  }
  const liveStops = new Map<TorrentClientId, () => void>();
  function syncLive(client: TorrentClientId): void {
    const wanted = active(client);
    if (wanted && !liveStops.has(client)) {
      liveStops.set(
        client,
        live.subscribe(`downloads.${client}`, (data) => {
          const parsed = torrentPollSummarySchema.safeParse(data);
          if (parsed.success) process(client, parsed.data);
        }),
      );
    } else if (!wanted) {
      liveStops.get(client)?.();
      liveStops.delete(client);
    }
  }
  const stopLost = live.onLost(() => {
    for (const client of WATCHED_CLIENTS) if (active(client)) void poll(client);
  });
  function restartAll(): void {
    for (const client of WATCHED_CLIENTS) {
      syncLive(client);
      if (active(client)) void poll(client);
      else stop(client);
    }
  }

  watch(
    () => [route.name, session.user, session.services, ...WATCHED_CLIENTS.map(interval)],
    restartAll,
    { immediate: true },
  );
  const onVisibility = () => {
    restartAll();
  };
  document.addEventListener('visibilitychange', onVisibility);
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    for (const client of WATCHED_CLIENTS) stop(client);
    for (const unsubscribe of liveStops.values()) unsubscribe();
    liveStops.clear();
    stopLost();
    channel?.close();
  });
}
