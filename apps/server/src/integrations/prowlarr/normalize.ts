// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation des réponses de Prowlarr pour l'API Hubarr (P3c.1) : port de
// `ProwlarrClient::normalizeIndexer`, `getIndexerStatus` et `getStats`.
//
// Écarts : le statut d'un indexeur garde les champs que
// Prowlarr renvoie (`disabledTill`, `mostRecentFailure`) ; l'original lisait
// `isDisabled` et `lastRssSyncReason`, absents de l'API, et rangeait la date
// de réactivation sous `message`. Les compteurs de la liste sont calculés ici
// au lieu du gabarit.

import type {
  ProwlarrApplicationSummary,
  ProwlarrCategory,
  ProwlarrHealth,
  ProwlarrIndexer,
  ProwlarrIndexerHistory,
  ProwlarrIndexerStatistics,
  ProwlarrIndexerStats,
  ProwlarrIndexerTotals,
  ProwlarrRelease,
  ProwlarrTestResult,
} from '@hubarr/shared';
import type {
  ProwlarrApplicationResource,
  ProwlarrHealthResource,
  ProwlarrHistoryResource,
  ProwlarrIndexerCategory,
  ProwlarrIndexerResource,
  ProwlarrIndexerStatistics as RawStatistics,
  ProwlarrIndexerStatsResource,
  ProwlarrIndexerStatusResource,
  ProwlarrReleaseResource,
} from './types';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Statuts d'échec par indexeur (`getIndexerStatus` de l'original). */
export function statusByIndexer(
  statuses: readonly ProwlarrIndexerStatusResource[],
): Map<number, ProwlarrIndexer['status']> {
  const byId = new Map<number, ProwlarrIndexer['status']>();
  for (const status of statuses) {
    if (typeof status.indexerId !== 'number') continue;
    byId.set(status.indexerId, {
      disabledTill: text(status.disabledTill),
      mostRecentFailure: text(status.mostRecentFailure),
    });
  }
  return byId;
}

export function normalizeStatistics(raw: RawStatistics): ProwlarrIndexerStatistics | null {
  if (typeof raw.indexerId !== 'number') return null;
  return {
    indexerId: raw.indexerId,
    indexerName: text(raw.indexerName),
    averageResponseTime: count(raw.averageResponseTime),
    averageGrabResponseTime: count(raw.averageGrabResponseTime),
    numberOfQueries: count(raw.numberOfQueries),
    numberOfGrabs: count(raw.numberOfGrabs),
    numberOfRssQueries: count(raw.numberOfRssQueries),
    numberOfAuthQueries: count(raw.numberOfAuthQueries),
    numberOfFailedQueries: count(raw.numberOfFailedQueries),
    numberOfFailedGrabs: count(raw.numberOfFailedGrabs),
    numberOfFailedRssQueries: count(raw.numberOfFailedRssQueries),
    numberOfFailedAuthQueries: count(raw.numberOfFailedAuthQueries),
  };
}

export function normalizeStats(raw: ProwlarrIndexerStatsResource | null): ProwlarrIndexerStats {
  const counts = (
    items: readonly { numberOfQueries?: number; numberOfGrabs?: number }[] | null | undefined,
    name: (item: Record<string, unknown>) => unknown,
  ) =>
    (items ?? []).map((item) => ({
      name: text(name(item as Record<string, unknown>)) ?? '—',
      queries: count(item.numberOfQueries),
      grabs: count(item.numberOfGrabs),
    }));
  return {
    indexers: (raw?.indexers ?? []).flatMap((item) => normalizeStatistics(item) ?? []),
    userAgents: counts(raw?.userAgents, (item) => item.userAgent),
    hosts: counts(raw?.hosts, (item) => item.host),
  };
}

/** Indexeur de la liste, avec son statut d'échec et ses compteurs. */
export function normalizeIndexer(
  raw: ProwlarrIndexerResource,
  status: ProwlarrIndexer['status'] = null,
  stats: ProwlarrIndexerStatistics | null = null,
): ProwlarrIndexer | null {
  if (typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    name: text(raw.name) ?? '—',
    definitionName: text(raw.definitionName),
    description: text(raw.description),
    language: text(raw.language),
    protocol: text(raw.protocol) ?? 'unknown',
    privacy: text(raw.privacy),
    enabled: raw.enable === true,
    supportsRss: raw.supportsRss === true,
    supportsSearch: raw.supportsSearch === true,
    appProfileId: typeof raw.appProfileId === 'number' ? raw.appProfileId : null,
    priority: typeof raw.priority === 'number' ? raw.priority : 25,
    tags: (raw.tags ?? []).filter((tag): tag is number => typeof tag === 'number'),
    added: text(raw.added),
    categoryCount: raw.capabilities?.categories?.length ?? 0,
    status,
    counters:
      stats === null
        ? null
        : {
            queries: stats.numberOfQueries,
            grabs: stats.numberOfGrabs,
            failures: stats.numberOfFailedQueries + stats.numberOfFailedGrabs,
          },
  };
}

/** Tuiles de la page : « en erreur » compte les statuts d'échec, comme l'original. */
export function indexerTotals(
  indexers: readonly ProwlarrIndexer[],
  failing: number,
): ProwlarrIndexerTotals {
  return {
    total: indexers.length,
    enabled: indexers.filter((indexer) => indexer.enabled).length,
    failing,
    torrent: indexers.filter((indexer) => indexer.protocol === 'torrent').length,
    usenet: indexers.filter((indexer) => indexer.protocol === 'usenet').length,
  };
}

export function normalizeHealth(raw: ProwlarrHealthResource): ProwlarrHealth | null {
  const message = text(raw.message);
  if (message === null) return null;
  return { source: text(raw.source), type: text(raw.type) ?? 'warning', message };
}

export function normalizeApplication(
  raw: ProwlarrApplicationResource,
): ProwlarrApplicationSummary | null {
  if (typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    name: text(raw.name) ?? '—',
    implementationName: text(raw.implementationName),
  };
}

export function normalizeCategory(raw: ProwlarrIndexerCategory): ProwlarrCategory | null {
  if (typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    name: text(raw.name) ?? `#${raw.id}`,
    subCategories: (raw.subCategories ?? []).flatMap((sub) =>
      typeof sub.id === 'number' ? [{ id: sub.id, name: text(sub.name) ?? `#${sub.id}` }] : [],
    ),
  };
}

/** Évènement de l'historique : requête et source tirées de `data`. */
export function normalizeHistory(raw: ProwlarrHistoryResource): ProwlarrIndexerHistory | null {
  if (typeof raw.id !== 'number') return null;
  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    id: raw.id,
    date: text(raw.date),
    eventType: text(raw.eventType),
    successful: raw.successful === true,
    query: text(data.query),
    source: text(data.source),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Résultats du test global (`ProviderTestAllResult[]`) : un indexeur est
 * valide sans motif de refus ; les motifs sont réunis comme les erreurs de
 * validation (`propriété : message ; …`).
 */
export function normalizeTestResults(raw: unknown): ProwlarrTestResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).flatMap((item) => {
    if (typeof item.id !== 'number') return [];
    const failures = Array.isArray(item.validationFailures)
      ? item.validationFailures.filter(isRecord)
      : [];
    const messages = failures.flatMap((failure) => {
      const message = text(failure.errorMessage);
      if (message === null) return [];
      const property = text(failure.propertyName);
      return [property === null ? message : `${property}: ${message}`];
    });
    const isValid = typeof item.isValid === 'boolean' ? item.isValid : messages.length === 0;
    return [{ id: item.id, isValid, message: messages.length > 0 ? messages.join('; ') : null }];
  });
}

/** Lien d'un résultat affiché tel quel : http(s) seulement (`safeInfoUrl` de l'original). */
export function safeInfoUrl(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

const nullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Résultat d'une recherche (`ProwlarrClient::search` de l'original), sans
 * lien de téléchargement ni lien magnet (adresses de Prowlarr avec sa clé).
 */
export function normalizeRelease(raw: ProwlarrReleaseResource): ProwlarrRelease | null {
  const guid = text(raw.guid);
  if (guid === null) return null;
  return {
    guid,
    title: text(raw.title) ?? '—',
    size: count(raw.size),
    age: count(raw.age),
    ageHours: count(raw.ageHours),
    indexerId: typeof raw.indexerId === 'number' ? raw.indexerId : null,
    indexer: text(raw.indexer) ?? '—',
    seeders: typeof raw.seeders === 'number' ? raw.seeders : null,
    leechers: typeof raw.leechers === 'number' ? raw.leechers : null,
    protocol: text(raw.protocol) ?? 'unknown',
    imdbId: nullableNumber(raw.imdbId),
    tmdbId: nullableNumber(raw.tmdbId),
    tvdbId: nullableNumber(raw.tvdbId),
    categories: (raw.categories ?? []).flatMap((category) =>
      typeof category.id === 'number'
        ? [{ id: category.id, name: text(category.name) ?? `#${category.id}` }]
        : [],
    ),
    infoUrl: safeInfoUrl(raw.infoUrl),
    publishDate: text(raw.publishDate),
    indexerFlags: (raw.indexerFlags ?? []).filter(
      (flag): flag is string => typeof flag === 'string',
    ),
    fileName: text(raw.fileName),
  };
}
