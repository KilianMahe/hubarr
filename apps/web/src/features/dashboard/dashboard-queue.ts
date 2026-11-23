// SPDX-License-Identifier: AGPL-3.0-or-later
// Carte « Files d'attente » du tableau de bord (P5d.1, V21) : téléchargements
// Radarr et Sonarr de toutes les instances, en une liste. Problèmes d'abord
// (erreur, avertissement, import bloqué), puis imports, puis téléchargements
// du plus avancé au moins avancé.

import type { MovieQueueItem, SeriesQueueItem } from '@hubarr/shared';
import type { RouteLocationRaw } from 'vue-router';
import { mediaDetailLocation } from '../../app/media-links';
import { queueProgress, queueState, type QueueState } from '../movies/queue';

export interface QueueSource {
  service: 'radarr' | 'sonarr';
  slug: string;
  instance: string;
  items: readonly (MovieQueueItem | SeriesQueueItem)[];
}

export interface DashboardQueueRow {
  key: string;
  service: 'radarr' | 'sonarr';
  instance: string;
  title: string;
  /** Épisode (Sonarr) ou année (Radarr). */
  detail: string | null;
  progress: number;
  state: QueueState;
  /** Fiche du film ou de la série. */
  to: RouteLocationRaw | null;
}

const RANK: Record<QueueState, number> = {
  error: 0,
  warning: 1,
  blocked: 2,
  importing: 3,
  pending: 4,
  downloading: 5,
  completed: 6,
  other: 7,
};

export const QUEUE_STATE_COLORS: Record<QueueState, string> = {
  importing: 'primary',
  pending: 'info',
  blocked: 'warning',
  warning: 'warning',
  error: 'error',
  completed: 'success',
  downloading: 'service-text',
  other: 'muted',
};

function isSeriesItem(item: MovieQueueItem | SeriesQueueItem): item is SeriesQueueItem {
  return 'seriesTitle' in item;
}

export function dashboardQueueRows(sources: readonly QueueSource[]): DashboardQueueRow[] {
  const rows = sources.flatMap((source) =>
    source.items.map((item, index): DashboardQueueRow => {
      const series = isSeriesItem(item);
      const mediaId = series ? item.seriesId : item.movieId;
      return {
        key: `${source.service}-${source.slug}-${item.id ?? `i${index}`}`,
        service: source.service,
        instance: source.instance,
        title: series ? item.seriesTitle : item.title,
        detail: series ? item.episode : item.year === null ? null : String(item.year),
        progress: queueProgress(item),
        state: queueState(item, false),
        to: mediaId === null ? null : mediaDetailLocation(source.service, source.slug, mediaId),
      };
    }),
  );
  return rows.sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] || b.progress - a.progress || a.title.localeCompare(b.title),
  );
}
