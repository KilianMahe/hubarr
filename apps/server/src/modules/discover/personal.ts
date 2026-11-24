// SPDX-License-Identifier: AGPL-3.0-or-later
// Suggestions personnelles de la découverte (lot 8) : agrégation de
// recommandations TMDB à partir d'un ensemble de titres de départ (titres d'un
// dossier racine, lectures récentes), regroupement de la bibliothèque par
// dossier racine. Fonctions pures, testées.

import type { TmdbCard } from '@hubarr/shared';
import type { TmdbRaw } from '../../integrations/tmdb/client';
import { libraryEntry, type LibraryIndex } from '../media/library';
import { int, num } from './enrich';

export type MediaKind = 'movie' | 'tv';

export interface Seed {
  type: MediaKind;
  id: number;
}

export interface RankedRecommendation {
  item: TmdbRaw;
  type: MediaKind;
  /** Nombre de titres de départ qui recommandent ce titre. */
  hits: number;
  score: number;
}

/** Recommandations lues par titre de départ (les premières de chaque liste). */
export const RECOMMENDATIONS_PER_SEED = 15;

/**
 * Agrège les listes de recommandations (`lists[i]` pour `seeds[i]`) : un titre
 * recommandé par plusieurs titres de départ passe devant (fréquence), puis la
 * note et la popularité départagent. Les titres de départ eux-mêmes et ceux
 * que `exclude` écarte ne sont jamais proposés.
 */
export function rankRecommendations(
  seeds: readonly Seed[],
  lists: readonly (readonly TmdbRaw[])[],
  exclude: (type: MediaKind, id: number) => boolean,
): RankedRecommendation[] {
  const seedKeys = new Set(seeds.map((seed) => `${seed.type}_${seed.id}`));
  const aggregated = new Map<string, RankedRecommendation>();
  seeds.forEach((seed, i) => {
    const seen = new Set<number>();
    for (const item of (lists[i] ?? []).slice(0, RECOMMENDATIONS_PER_SEED)) {
      const id = int(item.id);
      // Un titre répété dans une même liste ne compte qu'une fois.
      if (id <= 0 || seen.has(id)) continue;
      seen.add(id);
      const key = `${seed.type}_${id}`;
      if (seedKeys.has(key) || exclude(seed.type, id)) continue;
      const entry = aggregated.get(key) ?? { item, type: seed.type, hits: 0, score: 0 };
      entry.hits += 1;
      entry.score += (num(item.vote_average) ?? 0) + (num(item.popularity) ?? 0) / 50;
      aggregated.set(key, entry);
    }
  });
  return [...aggregated.values()].sort((a, b) => b.hits - a.hits || b.score - a.score);
}

/** Met à jour l'état en bibliothèque d'une carte d'après l'index courant. */
export function withLibrary(card: TmdbCard, index: LibraryIndex): TmdbCard {
  const lib = libraryEntry(index, card.type, card.id);
  return {
    ...card,
    inLibrary: lib !== null,
    libStatus: lib?.status ?? null,
    libId: lib?.id ?? null,
    libSlug: lib?.slug ?? null,
  };
}

/** Dernier segment d'un chemin (`/data/Films enfants/` → « Films enfants »). */
export function folderLabel(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part !== '');
  return parts.at(-1) ?? path;
}

/** Dossier parent d'un chemin, `null` à la racine. */
function parentOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut > 0 ? trimmed.slice(0, cut) : null;
}

export interface FolderTitle {
  /** Id TMDB du titre (`null` : série sans id TMDB connu de Sonarr). */
  tmdbId: number | null;
  tvdbId?: number | null;
  rootFolderPath: string | null;
  path: string | null;
  addedAt: string | null;
}

export interface FolderGroup<T extends FolderTitle> {
  path: string;
  /** Titres du dossier, les plus récemment ajoutés d'abord. */
  titles: T[];
}

/** Normalise un chemin pour comparer deux dossiers (barre finale ignorée). */
function folderKey(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

/**
 * Regroupe les titres d'une instance par dossier racine. Sans
 * `rootFolderPath`, le dossier parent du titre en tient lieu. Dossiers triés
 * par chemin, titres du plus récent au plus ancien ajout.
 */
export function groupByRootFolder<T extends FolderTitle>(titles: readonly T[]): FolderGroup<T>[] {
  const groups = new Map<string, FolderGroup<T>>();
  for (const title of titles) {
    const root = title.rootFolderPath ?? (title.path === null ? null : parentOf(title.path));
    if (root === null || root === '') continue;
    const key = folderKey(root);
    if (key === '') continue;
    const group = groups.get(key) ?? { path: key, titles: [] };
    group.titles.push(title);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      titles: [...group.titles].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
