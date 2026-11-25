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
  slug: string;
  instance: string;
  title: string;
  /** Épisode (Sonarr) ou année (Radarr). */
  detail: string | null;
  progress: number;
  state: QueueState;
  /** Fiche du film ou de la série ; page « File d'attente » pendant le téléchargement ou l'attente de l'import. */
  to: RouteLocationRaw | null;
  /** Élément de la file, pour la gestion de l'import. */
  item: MovieQueueItem | SeriesQueueItem;
  /** Problème à traiter (import bloqué, avertissement, erreur) : la ligne ouvre la gestion. */
  manageable: boolean;
}

/** États dont la ligne ouvre la gestion de l'import plutôt que la fiche. */
export const MANAGEABLE_STATES: ReadonlySet<QueueState> = new Set(['blocked', 'warning', 'error']);

/**
 * États dont la ligne mène à la page « File d'attente » du service plutôt qu'à
 * la fiche : téléchargement en cours, ou import en attente (par exemple un
 * épisode au titre encore inconnu, « TBA », que Sonarr n'importe pas tout de suite).
 */
export const QUEUE_PAGE_STATES: ReadonlySet<QueueState> = new Set(['downloading', 'pending']);

function queuePageLocation(service: 'radarr' | 'sonarr', slug: string): RouteLocationRaw {
  return { name: service === 'radarr' ? 'radarr-queue' : 'sonarr-queue', params: { slug } };
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

/** Ligne d'un élément de la file (tableau de bord, gestion depuis les pages de file). */
export function queueRow(
  service: 'radarr' | 'sonarr',
  slug: string,
  instance: string,
  item: MovieQueueItem | SeriesQueueItem,
  index = 0,
): DashboardQueueRow {
  const series = isSeriesItem(item);
  const mediaId = series ? item.seriesId : item.movieId;
  const state = queueState(item, false);
  return {
    key: `${service}-${slug}-${item.id ?? `i${index}`}`,
    service,
    slug,
    instance,
    title: series ? item.seriesTitle : item.title,
    detail: series ? item.episode : item.year === null ? null : String(item.year),
    progress: queueProgress(item),
    state,
    to: QUEUE_PAGE_STATES.has(state)
      ? queuePageLocation(service, slug)
      : mediaId === null
        ? null
        : mediaDetailLocation(service, slug, mediaId),
    item,
    manageable: isManageable(item),
  };
}

/** Problème à traiter (import bloqué, avertissement, erreur) sur un élément identifié. */
export function isManageable(item: MovieQueueItem | SeriesQueueItem): boolean {
  return item.id !== null && MANAGEABLE_STATES.has(queueState(item, false));
}

export function dashboardQueueRows(sources: readonly QueueSource[]): DashboardQueueRow[] {
  const rows = sources.flatMap((source) =>
    source.items.map((item, index) =>
      queueRow(source.service, source.slug, source.instance, item, index),
    ),
  );
  return rows.sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] || b.progress - a.progress || a.title.localeCompare(b.title),
  );
}
