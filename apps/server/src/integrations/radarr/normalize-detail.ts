// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation des ressources de la fiche film (P2.4) : fichiers, crédits,
// extras, historique, liste de blocage, définitions de qualité. L'original
// renvoyait les ressources brutes ; Hubarr n'expose que ce que le front
// affiche, sans URL de l'instance.

import type {
  ArrNamedItem,
  ArrRelease,
  MovieBlocklistItem,
  MovieCredit,
  MovieExtraFile,
  MovieFile,
  MovieHistoryItem,
} from '@hubarr/shared';
import type { components } from './openapi';
import { isoDate } from './normalize';
import type { RadarrHistoryResource, RadarrMovieFileResource, RadarrMovieResource } from './types';

type Schemas = components['schemas'];

function named(
  item: { id?: number; name?: string | null } | null | undefined,
): ArrNamedItem | null {
  if (item?.id === undefined) return null;
  return { id: item.id, name: item.name ?? '?' };
}

function namedList(
  items: readonly { id?: number; name?: string | null }[] | null | undefined,
): ArrNamedItem[] {
  return (items ?? []).flatMap((item) => {
    const value = named(item);
    return value === null ? [] : [value];
  });
}

function movieRef(
  movie: RadarrMovieResource | undefined,
): { title: string; year: number | null } | null {
  if (movie === undefined) return null;
  return { title: movie.title ?? '—', year: movie.year ?? null };
}

/** Texte non vide d'un champ libre, sinon `null`. */
function text(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

export function normalizeMovieFile(file: RadarrMovieFileResource): MovieFile {
  return {
    id: file.id ?? 0,
    relativePath: file.relativePath ?? null,
    path: file.path ?? null,
    size: file.size ?? 0,
    dateAdded: isoDate(file.dateAdded),
    quality: named(file.quality?.quality),
    languages: namedList(file.languages),
    releaseGroup: text(file.releaseGroup),
    edition: text(file.edition),
    customFormats: (file.customFormats ?? []).map((format) => format.name ?? '?'),
    customFormatScore: file.customFormatScore ?? 0,
  };
}

export function normalizeCredit(credit: Schemas['CreditResource']): MovieCredit {
  return {
    personName: credit.personName ?? '—',
    personTmdbId: credit.personTmdbId ?? null,
    character: text(credit.character),
    job: text(credit.job),
    department: text(credit.department),
    type: credit.type === 'crew' ? 'crew' : 'cast',
    image: (credit.images ?? []).find((image) => text(image.remoteUrl) !== null)?.remoteUrl ?? null,
  };
}

export function normalizeExtraFile(extra: Schemas['ExtraFileResource']): MovieExtraFile {
  return {
    id: extra.id ?? 0,
    relativePath: text(extra.relativePath),
    extension: text(extra.extension),
    type: extra.type ?? null,
  };
}

export function normalizeHistoryItem(item: RadarrHistoryResource): MovieHistoryItem {
  const data = item.data ?? {};
  return {
    id: item.id ?? 0,
    movieId: item.movieId ?? null,
    eventType: item.eventType ?? 'unknown',
    date: isoDate(item.date),
    quality: item.quality?.quality?.name ?? null,
    sourceTitle: text(item.sourceTitle),
    indexer: text(data.indexer),
    releaseTitle: text(data.releaseTitle),
    importedPath: text(data.importedPath),
    downloadClient: text(data.downloadClientName ?? data.downloadClient),
    protocol: text(data.protocol),
    reason: text(data.reason ?? data.message),
    movie: movieRef(item.movie),
  };
}

export function normalizeBlocklistItem(item: Schemas['BlocklistResource']): MovieBlocklistItem {
  return {
    id: item.id ?? 0,
    movieId: item.movieId ?? null,
    sourceTitle: text(item.sourceTitle),
    quality: item.quality?.quality?.name ?? null,
    date: isoDate(item.date),
    protocol: item.protocol ?? null,
    indexer: text(item.indexer),
    message: text(item.message),
    languages: (item.languages ?? []).map((language) => language.name ?? '?'),
    movie: movieRef(item.movie),
  };
}

/** Définitions de qualité réduites à la qualité (`{ id, name }`), dans l'ordre du poids. */
export function qualityChoices(
  definitions: readonly {
    quality?: { id?: number; name?: string | null };
    title?: string | null;
    weight?: number;
  }[],
): ArrNamedItem[] {
  return [...definitions]
    .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
    .flatMap((definition) => {
      const quality = named(definition.quality);
      if (quality === null) return [];
      return [{ id: quality.id, name: definition.title ?? quality.name }];
    });
}

// ── Releases (recherche interactive, P2.5) ──────────────────────────────────

/** Seules les URL http(s) peuvent servir de lien (`safeInfoUrl` : un indexeur hostile pourrait renvoyer `javascript:`). */
export function safeInfoUrl(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

/** Scores des formats personnalisés d'un profil de qualité (id du format → score). */
export function profileScores(
  profile: Schemas['QualityProfileResource'] | undefined,
): Map<number, number> {
  const scores = new Map<number, number>();
  for (const item of profile?.formatItems ?? []) scores.set(item.format ?? 0, item.score ?? 0);
  return scores;
}

export function normalizeRelease(
  release: Schemas['ReleaseResource'],
  scores: ReadonlyMap<number, number>,
): ArrRelease {
  const formats = release.customFormats ?? [];
  return {
    guid: release.guid ?? '',
    indexerId: release.indexerId ?? 0,
    title: release.title ?? '—',
    indexer: release.indexer ?? '—',
    quality: release.quality?.quality?.name ?? '—',
    sizeMb: release.size === undefined ? 0 : Math.round(release.size / 1_048_576),
    seeders: release.seeders ?? null,
    leechers: release.leechers ?? null,
    protocol: release.protocol ?? '—',
    age: release.age ?? 0,
    approved: release.approved ?? false,
    rejections: release.rejections ?? [],
    customFormatScore: release.customFormatScore ?? 0,
    scoreDetails: formats.map((format) => ({
      name: format.name ?? '?',
      score: scores.get(format.id ?? 0) ?? 0,
    })),
    customFormats: formats.map((format) => format.name ?? '?'),
    languages: (release.languages ?? []).map((language) => language.name ?? '?'),
    infoUrl: safeInfoUrl(release.infoUrl),
  };
}

/** Champs bruts d'une release Radarr ou Sonarr utiles au classement. */
interface RankedRelease {
  approved?: boolean;
  releaseWeight?: number;
  customFormatScore?: number;
  seeders?: number | null;
}

/**
 * Ordre de pertinence : acceptées d'abord, puis le classement du moteur de
 * décision de Radarr/Sonarr (`releaseWeight`, croissant : qualité, score des
 * formats, protocole, priorité de l'indexeur, seeders…). À défaut de poids,
 * score décroissant puis seeders décroissants.
 */
export function sortReleases<R extends RankedRelease>(releases: readonly R[]): R[] {
  const weight = (release: R): number => release.releaseWeight ?? Number.MAX_SAFE_INTEGER;
  return [...releases].sort(
    (a, b) =>
      Number(b.approved ?? false) - Number(a.approved ?? false) ||
      weight(a) - weight(b) ||
      (b.customFormatScore ?? 0) - (a.customFormatScore ?? 0) ||
      (b.seeders ?? -1) - (a.seeders ?? -1),
  );
}
