// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajout d'un film (Radarr) ou d'une série (Sonarr) : partie pure du dialogue
// commun `AddMediaDialog`. Les résultats de recherche des deux services sont
// ramenés à une forme commune (`LookupItem`) ; les textes propres à chaque
// service sont réunis ici, en clés littérales (vérifiées par l'audit i18n).

import type { Movie, Series } from '@hubarr/shared';
import type { RouteLocationRaw } from 'vue-router';
import { mediaDetailLocation } from '../../app/media-links';
import type { DetailTarget } from '../discover/discover-api';

export type AddKind = 'movie' | 'series';

interface ItemBase {
  /** Clé stable de la liste (identifiant TMDB du film, TVDB de la série). */
  key: string;
  /** Identifiant dans Radarr/Sonarr ; `null` : pas encore ajouté. */
  libraryId: number | null;
  tmdbId: number | null;
}
export type LookupItem =
  (ItemBase & { kind: 'movie'; media: Movie }) | (ItemBase & { kind: 'series'; media: Series });

export function movieItem(media: Movie): LookupItem {
  return {
    kind: 'movie',
    key: `tmdb-${media.tmdbId ?? media.title}`,
    libraryId: media.id,
    tmdbId: media.tmdbId,
    media,
  };
}

export function seriesItem(media: Series): LookupItem {
  return {
    kind: 'series',
    key: `tvdb-${media.tvdbId ?? media.title}`,
    libraryId: media.id,
    tmdbId: media.tmdbId,
    media,
  };
}

/** « Titre (année) ». */
export function itemLabel(item: LookupItem): string {
  return item.media.year ? `${item.media.title} (${item.media.year})` : item.media.title;
}

/** Fiche Hubarr d'un titre déjà présent dans l'instance, sinon `null`. */
export function libraryLocation(item: LookupItem, slug: string): RouteLocationRaw | null {
  if (item.libraryId === null || item.libraryId <= 0) return null;
  return mediaDetailLocation(item.kind, slug, item.libraryId);
}

/** Fiche TMDB d'un titre (bouton « Voir »), si son identifiant TMDB est connu. */
export function detailTarget(item: LookupItem): DetailTarget | null {
  if (item.tmdbId === null) return null;
  return { type: item.kind === 'movie' ? 'movie' : 'tv', id: item.tmdbId };
}

/** Résultat encore ajoutable correspondant à un identifiant TMDB. */
export function findAddable(items: readonly LookupItem[], tmdbId: number): LookupItem | null {
  return items.find((item) => item.tmdbId === tmdbId && item.libraryId === null) ?? null;
}

/** Après l'ajout, le titre apparaît comme « déjà dans la bibliothèque ». */
export function markAdded(
  items: readonly LookupItem[],
  key: string,
  libraryId: number | null,
): LookupItem[] {
  return items.map((item) => (item.key === key ? { ...item, libraryId: libraryId ?? 0 } : item));
}

/** Textes propres à chaque service. */
export const ADD_TEXT = {
  movie: {
    titleKey: 'media.films.modal.add_title',
    placeholderKey: 'media.films.modal.search_placeholder',
    profileKey: 'media.films.modal.quality_profile',
    folderKey: 'media.films.modal.root_folder',
    confirmKey: 'media.films.modal.add_button',
    addingKey: 'media.films.modal.adding',
    noResultsKey: 'media.films.modal.no_results',
    searchErrorKey: 'media.films.modal.search_error',
    alreadyKey: 'media.films.modal.already_radarr',
    networkErrorKey: 'media.films.modal.network_error',
  },
  series: {
    titleKey: 'media.series.modal.add_title',
    placeholderKey: 'media.series.modal.search_placeholder',
    profileKey: 'media.series.modal.quality_profile',
    folderKey: 'media.series.modal.root_folder',
    confirmKey: 'media.series.modal.add_button',
    addingKey: 'media.series.modal.adding',
    noResultsKey: 'media.series.modal.no_results',
    searchErrorKey: 'media.series.modal.network_error',
    alreadyKey: 'media.series.modal.already_added',
    networkErrorKey: 'media.series.modal.network_error',
  },
} as const satisfies Record<AddKind, Record<string, string>>;
