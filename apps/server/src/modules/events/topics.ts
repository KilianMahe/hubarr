// SPDX-License-Identifier: AGPL-3.0-or-later
// Sujets du flux temps réel (P5.1) et lectures partagées associées.
//
//   health                         santé des services (60 s), tout utilisateur
//                                  (filtrée par compte à l'envoi : `scopeHealth`)
//   activity.<tautulli|tracearr|emby>  lectures en cours (10 s)
//   downloads.<qbittorrent|deluge|transmission>  résumé des torrents (3 s)
//   downloads.usenet.<sabnzbd|nzbget>  file Usenet (3 s)
//   queue.<radarr|sonarr>.<slug>   file d'attente d'une instance (5 s)
//   seerr.pending                  demandes en attente (60 s)
//
// Un sujet n'existe que si son service est configuré (instance active pour
// Radarr/Sonarr) et que le compte peut le lire ; sinon il est ignoré. Les
// lectures upstream passent par `app.live.shared` : la route HTTP du même
// jeu de données relit la réponse du poller au lieu de rappeler le service.

import type { AuthUser, TorrentClientId } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { SeerrClient } from '../../integrations/seerr/client';
import type { TopicSpec } from '../../live/hub';
import { sharedActivity } from '../activity/routes';
import { servicesHealth } from '../health/routes';
import { getInstanceBySlug } from '../instances/instances';
import { sharedMovieQueue, sharedSeriesQueue } from '../media/queue';
import { apiKeyServiceClient } from '../services/clients';
import { isServiceConfigured } from '../services/config';
import { accessScope } from '../users/access-scope';
import { torrentSummary } from '../torrents/live';
import { sharedUsenetQueue } from '../usenet/routes';

/** Intervalles des pollers (ceux des pages d'origine). */
export const TOPIC_INTERVALS = {
  health: 60_000,
  activity: 10_000,
  downloads: 3_000,
  usenet: 3_000,
  queue: 5_000,
  seerr: 60_000,
} as const;

export const TOPIC_PATTERN = /^[a-z]+(?:\.[a-z0-9_-]+){0,2}$/;

const TORRENTS: readonly TorrentClientId[] = ['qbittorrent', 'deluge', 'transmission'];
const USENET = ['sabnzbd', 'nzbget'] as const;
const ACTIVITY = ['tautulli', 'tracearr', 'emby'] as const;

/** Clés partagées invalidées par une mutation (`POST`) sur un chemin d'API. */
export function sharedKeysFor(url: string): string[] | 'all' {
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/api/admin/settings') || path.startsWith('/api/admin/instances'))
    return 'all';
  for (const id of TORRENTS) if (path.startsWith(`/api/${id}/`)) return [`torrents.${id}`];
  const usenet = /^\/api\/usenet\/(sabnzbd|nzbget)\//.exec(path);
  if (usenet?.[1]) return [`usenet.${usenet[1]}.queue`];
  const queue = /^\/api\/medias\/([^/]+)\/(films|series)\//.exec(path);
  if (queue?.[1] && queue[2])
    return [`queue.${queue[2] === 'films' ? 'radarr' : 'sonarr'}.${queue[1]}`];
  return [];
}

// ── Résolution d'un sujet ───────────────────────────────────────────────────

/** Spécification d'un sujet, ou `null` s'il est inconnu, interdit ou sans service. */
export function resolveTopic(app: FastifyInstance, name: string, user: AuthUser): TopicSpec | null {
  if (!TOPIC_PATTERN.test(name)) return null;
  const scope = accessScope(app.db, user);
  const readable = (service: Parameters<typeof scope.can>[0]) =>
    isServiceConfigured(app.db, service) && scope.can(service, null);
  const [kind, a, b] = name.split('.');
  if (name === 'health') {
    return { name, intervalMs: TOPIC_INTERVALS.health, load: () => servicesHealth(app) };
  }
  if (kind === 'activity' && b === undefined) {
    const service = ACTIVITY.find((s) => s === a);
    if (service === undefined || !readable(service)) return null;
    return { name, intervalMs: TOPIC_INTERVALS.activity, load: () => sharedActivity(app, service) };
  }
  if (kind === 'downloads' && a === 'usenet') {
    const id = USENET.find((s) => s === b);
    if (id === undefined || !readable(id)) return null;
    return {
      name,
      intervalMs: TOPIC_INTERVALS.usenet,
      load: async () => ({ active: (await sharedUsenetQueue(app, id)).active }),
    };
  }
  if (kind === 'downloads' && b === undefined) {
    const id = TORRENTS.find((s) => s === a);
    if (id === undefined || !readable(id)) return null;
    return { name, intervalMs: TOPIC_INTERVALS.downloads, load: () => torrentSummary(app, id) };
  }
  if (kind === 'queue' && (a === 'radarr' || a === 'sonarr') && b !== undefined) {
    const row = getInstanceBySlug(app.db, a, b);
    if (!row?.enabled || !scope.can(a, row.slug)) return null;
    return {
      name,
      intervalMs: TOPIC_INTERVALS.queue,
      load: () => (a === 'radarr' ? sharedMovieQueue(app, row) : sharedSeriesQueue(app, row)),
    };
  }
  if (name === 'seerr.pending') {
    if (!readable('seerr')) return null;
    return {
      name,
      intervalMs: TOPIC_INTERVALS.seerr,
      load: async () => {
        const counts = await new SeerrClient(apiKeyServiceClient(app, 'seerr')).get<
          Record<string, unknown>
        >('/request/count');
        return { pending: typeof counts.pending === 'number' ? counts.pending : 0 };
      },
    };
  }
  return null;
}
