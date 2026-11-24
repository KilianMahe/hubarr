// SPDX-License-Identifier: AGPL-3.0-or-later
// Suggestions par dossier racine (lot 8) : pour chaque dossier racine d'une
// instance Radarr ou Sonarr, les recommandations TMDB des titres les plus
// récemment ajoutés au dossier, agrégées et pondérées par fréquence, sans les
// titres déjà en bibliothèque.
//
// Le calcul coûte un appel TMDB par titre de départ : il est mis en cache
// (stale-while-revalidate, clé `discover.folders.<langue>`). Une entrée
// périmée est servie telle quelle et reconstruite en arrière-plan par
// `FolderSuggestionsRefresher` ; seul le tout premier calcul se fait pendant
// la requête. L'état en bibliothèque est réappliqué à chaque lecture : un
// titre ajouté depuis le calcul disparaît aussitôt de la rangée.

import type { Movie, Series, TmdbCard } from '@hubarr/shared';
import type { CacheLogger, StaleWhileRevalidateCache } from '../../cache/swr-cache';
import { resultsOf, type TmdbClient } from '../../integrations/tmdb/client';
import type { LibraryIndex, Owned } from '../media/library';
import { toCard } from './enrich';
import {
  folderLabel,
  groupByRootFolder,
  rankRecommendations,
  withLibrary,
  type Seed,
} from './personal';

export const FOLDERS_KEY_PREFIX = 'discover.folders.';
export const FOLDERS_SOFT_TTL_MS = 6 * 3_600_000;
export const FOLDERS_HARD_TTL_MS = 7 * 86_400_000;
/** Titres de départ par dossier (les derniers ajoutés). */
export const SEEDS_PER_FOLDER = 20;
/** Cartes gardées en cache par dossier, puis affichées après filtrage. */
const STORED_PER_FOLDER = 40;
export const SHOWN_PER_FOLDER = 20;

export interface StoredFolder {
  key: string;
  service: 'radarr' | 'sonarr';
  instance: string;
  label: string;
  path: string;
  results: TmdbCard[];
}

export interface FolderSuggestionsDeps {
  swr: StaleWhileRevalidateCache;
  /** Client TMDB courant (`null` si TMDB n'est pas configuré). */
  tmdb: () => TmdbClient | null;
  library: () => Promise<{ movies: Owned<Movie>[]; series: Owned<Series>[] }>;
  index: (tmdb: TmdbClient) => Promise<LibraryIndex>;
  logger?: CacheLogger;
}

/** Regroupe des titres possédés par instance (ordre d'apparition conservé). */
function byInstance<T>(owned: readonly Owned<T>[]): { slug: string; name: string; items: T[] }[] {
  const out = new Map<string, { slug: string; name: string; items: T[] }>();
  for (const { item, slug, instanceName } of owned) {
    const entry = out.get(slug) ?? { slug, name: instanceName, items: [] };
    entry.items.push(item);
    out.set(slug, entry);
  }
  return [...out.values()];
}

export class FolderSuggestions {
  readonly #deps: FolderSuggestionsDeps;

  constructor(deps: FolderSuggestionsDeps) {
    this.#deps = deps;
  }

  keyFor(locale: string): string {
    return FOLDERS_KEY_PREFIX + (locale || 'default');
  }

  /** Clé de la langue courante (`null` sans TMDB). */
  key(): string | null {
    const tmdb = this.#deps.tmdb();
    return tmdb === null ? null : this.keyFor(tmdb.locale);
  }

  /** Rangées en cache (périmées : reconstruction demandée), calcul en ligne au premier appel. */
  async read(): Promise<StoredFolder[]> {
    const key = this.key();
    if (key === null) return [];
    const { swr } = this.#deps;
    const hit = swr.read<StoredFolder[]>(key, FOLDERS_SOFT_TTL_MS);
    if (hit !== null) {
      if (hit.state === 'stale') swr.requestRefresh(key);
      return hit.value;
    }
    const computed = await swr.getOrCompute(key, FOLDERS_SOFT_TTL_MS, FOLDERS_HARD_TTL_MS, () =>
      this.build(),
    );
    return computed.value;
  }

  /** Rangées de la page : état en bibliothèque à jour, titres possédés retirés. */
  static present(folders: readonly StoredFolder[], index: LibraryIndex) {
    return folders
      .map(({ key, service, instance, label, path, results }) => ({
        key,
        service,
        instance,
        label,
        path,
        results: results
          .map((card) => withLibrary(card, index))
          .filter((card) => !card.inLibrary)
          .slice(0, SHOWN_PER_FOLDER),
      }))
      .filter((folder) => folder.results.length > 0);
  }

  /**
   * Interroge TMDB (chaque liste est en cache dans le client). Un résultat
   * vide signifie « rien à proposer » ou « TMDB injoignable » : il n'est pas
   * mis en cache.
   */
  async build(): Promise<StoredFolder[]> {
    const tmdb = this.#deps.tmdb();
    if (tmdb === null) return [];
    try {
      const [{ movies, series }, index] = await Promise.all([
        this.#deps.library(),
        this.#deps.index(tmdb),
      ]);
      const exclude = (type: 'movie' | 'tv', id: number) =>
        type === 'movie' ? index.movie.has(id) : index.tv.has(`tmdb_${id}`);
      const out: StoredFolder[] = [];

      const add = async (
        service: 'radarr' | 'sonarr',
        instance: { slug: string; name: string },
        path: string,
        seeds: Seed[],
      ) => {
        if (seeds.length === 0) return;
        const lists = await Promise.all(
          seeds.map((seed) =>
            seed.type === 'movie'
              ? tmdb.movieRecommendations(seed.id)
              : tmdb.tvRecommendations(seed.id),
          ),
        );
        const ranked = rankRecommendations(seeds, lists.map(resultsOf), exclude);
        const results = ranked
          .slice(0, STORED_PER_FOLDER)
          .map((rec) => toCard(rec.item, index, rec.type))
          .filter((card): card is TmdbCard => card !== null);
        if (results.length === 0) return;
        out.push({
          key: `${service}:${instance.slug}:${path}`,
          service,
          instance: instance.name,
          label: folderLabel(path),
          path,
          results,
        });
      };

      for (const instance of byInstance(movies)) {
        for (const group of groupByRootFolder(instance.items)) {
          const seeds = group.titles
            .flatMap((m) => (m.tmdbId ? [{ type: 'movie' as const, id: m.tmdbId }] : []))
            .slice(0, SEEDS_PER_FOLDER);
          await add('radarr', instance, group.path, seeds);
        }
      }
      for (const instance of byInstance(series)) {
        for (const group of groupByRootFolder(instance.items)) {
          const seeds: Seed[] = [];
          for (const s of group.titles) {
            if (seeds.length >= SEEDS_PER_FOLDER) break;
            let id = s.tmdbId ?? 0;
            if (!id && s.tvdbId) id = (await tmdb.findTmdbIdByTvdbId(s.tvdbId)) ?? 0;
            if (id > 0) seeds.push({ type: 'tv', id });
          }
          await add('sonarr', instance, group.path, seeds);
        }
      }
      return out;
    } catch (error) {
      this.#deps.logger?.warn({ err: error }, 'suggestions par dossier : échec');
      return [];
    }
  }
}
