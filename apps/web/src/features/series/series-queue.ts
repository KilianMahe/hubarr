// SPDX-License-Identifier: AGPL-3.0-or-later
// File d'attente Sonarr (`renderQueue` de `series.html.twig`) : état affiché,
// éléments en avertissement à nettoyer (« déjà importés ») ou à importer,
// résumé des motifs d'un import, séries sorties de la file.

import type { SeriesQueueItem } from '@hubarr/shared';

/** Relecture de la file (l'original : 2 s) ; relecture des clients un tour sur trois (6 s). */
export const SERIES_QUEUE_POLL_MS = 2_000;
export const SERIES_QUEUE_REFRESH_EVERY = 3;

export type SeriesQueueTone = 'importing' | 'warning' | 'error' | 'ok';

/** Couleur du statut (`statusClass` d'origine) : import, avertissement, erreur, sinon normal. */
export function seriesQueueTone(
  item: Pick<SeriesQueueItem, 'trackedState' | 'trackedStatus'>,
): SeriesQueueTone {
  if (item.trackedState === 'importing') return 'importing';
  if (item.trackedStatus === 'warning') return 'warning';
  if (item.trackedStatus === 'error') return 'error';
  return 'ok';
}

export const SERIES_QUEUE_TONE_COLORS: Record<SeriesQueueTone, string> = {
  importing: 'secondary',
  warning: 'warning',
  error: 'error',
  ok: 'success',
};

/** Tous les messages d'un élément, un par ligne (infobulle). */
export function statusMessagesText(item: Pick<SeriesQueueItem, 'statusMessages'>): string {
  return item.statusMessages
    .map(
      (message) =>
        message.title + (message.messages.length > 0 ? `: ${message.messages.join(', ')}` : ''),
    )
    .join('\n');
}

/**
 * Éléments en avertissement ou en erreur : « déjà importés » quand chaque
 * message le dit (doublons sans risque à retirer), sinon des fichiers à importer.
 */
export function classifyQueueWarnings(items: readonly SeriesQueueItem[]): {
  stale: SeriesQueueItem[];
  blocked: SeriesQueueItem[];
} {
  const stale: SeriesQueueItem[] = [];
  const blocked: SeriesQueueItem[] = [];
  for (const item of items) {
    if (item.trackedStatus !== 'warning' && item.trackedStatus !== 'error') continue;
    const allImported =
      item.statusMessages.length > 0 &&
      item.statusMessages.every(
        (message) =>
          message.messages.length === 0 ||
          message.messages.every((text) => text.toLowerCase().includes('already imported')),
      );
    (allImported ? stale : blocked).push(item);
  }
  return { stale, blocked };
}

/**
 * Motifs d'un import résumés (`formatImportReasons`) : préfixe « fichier : »
 * retiré, motifs identiques regroupés (« 5× … »), trois au plus puis « +n more ».
 */
export function formatImportReasons(reasons: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    const index = reason.indexOf(': ');
    const clean = index >= 0 && index < reason.length - 2 ? reason.slice(index + 2) : reason;
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ordered.slice(0, 3).map(([text, count]) => (count > 1 ? `${count}× ${text}` : text));
  if (ordered.length > 3) top.push(`+${ordered.length - 3} more`);
  return top.join(', ');
}

export function seriesIdsOf(items: readonly SeriesQueueItem[]): Set<number> {
  return new Set(items.flatMap((item) => (item.seriesId === null ? [] : [item.seriesId])));
}

/** Séries présentes au relevé précédent et absentes du nouveau (téléchargement terminé). */
export function seriesLeftQueue(
  previous: ReadonlySet<number>,
  items: readonly SeriesQueueItem[],
): number[] {
  const current = seriesIdsOf(items);
  return [...previous].filter((id) => !current.has(id));
}
