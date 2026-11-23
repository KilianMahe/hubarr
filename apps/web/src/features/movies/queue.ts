// SPDX-License-Identifier: AGPL-3.0-or-later
// File d'attente Radarr (`renderQueue` d'origine) : progression, état affiché,
// actions possibles, films sortis de la file (importés).

import type { MovieQueueItem } from '@hubarr/shared';

/** Relecture de la file (l'original : 2 s). */
export const QUEUE_POLL_MS = 2_000;

/** Film sorti de la file (importé). */
export interface ImportedMovie {
  id: number;
  title: string;
}

export type QueueState =
  'importing' | 'pending' | 'blocked' | 'warning' | 'error' | 'completed' | 'downloading' | 'other';

/** Pourcentage téléchargé (0 sans taille connue). */
export function queueProgress(item: Pick<MovieQueueItem, 'size' | 'sizeleft'>): number {
  return item.size > 0 ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
}

/**
 * État affiché : l'état d'import prime sur le statut du téléchargement ; un
 * import bloqué devient « import en cours » pendant un import manuel lancé.
 */
export function queueState(
  item: Pick<MovieQueueItem, 'trackedState' | 'trackedStatus' | 'status'>,
  manualImportRunning: boolean,
): QueueState {
  const state = item.trackedState;
  if (state === 'importBlocked' && manualImportRunning) return 'importing';
  if (state === 'importPending') return 'pending';
  if (state === 'importBlocked') return 'blocked';
  if (state === 'importing') return 'importing';
  if (item.trackedStatus === 'warning') return 'warning';
  if (item.trackedStatus === 'error') return 'error';
  if (item.status === 'completed') return 'completed';
  if (item.status === 'downloading') return 'downloading';
  return 'other';
}

export interface QueueActions {
  /** Import bloqué : « Forcer l'import ». */
  import: boolean;
  /** En attente (délai, file) : « Forcer le téléchargement ». */
  grab: boolean;
}

export function queueActions(item: Pick<MovieQueueItem, 'trackedState' | 'status'>): QueueActions {
  return {
    import: item.trackedState === 'importBlocked',
    grab: item.status === 'delay' || item.status === 'queued',
  };
}

/** Films présents au relevé précédent et absents du nouveau : importés (ou retirés). */
export function leftQueue(
  previous: ReadonlySet<number>,
  items: readonly MovieQueueItem[],
): number[] {
  const current = new Set(items.flatMap((item) => (item.movieId === null ? [] : [item.movieId])));
  return [...previous].filter((id) => !current.has(id));
}

export function movieIdsOf(items: readonly MovieQueueItem[]): Set<number> {
  return new Set(items.flatMap((item) => (item.movieId === null ? [] : [item.movieId])));
}
