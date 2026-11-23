// SPDX-License-Identifier: AGPL-3.0-or-later
// Vocabulaire de recherche : quelques centaines de titres et de personnes
// connus (listes populaires, mieux notés et personnes populaires de TMDB),
// avec leur popularité, pour corriger les requêtes mal tapées. Port de
// `SearchVocabulary` : la recherche de TMDB ne tolère aucune faute, et une
// faute en début de mot (« pokumon ») met en échec toute recherche par
// préfixe.
//
// Lu sur le chemin de la requête **sans jamais appeler TMDB**
// (stale-while-revalidate) : une entrée absente ou périmée demande une
// reconstruction à la file de rafraîchissement (`SearchVocabularyRefresher`),
// et la recherche continue avec ce qu'elle a.

import type { StaleWhileRevalidateCache } from '../../cache/swr-cache';
import type { CacheLogger } from '../../cache/swr-cache';
import { resultsOf, type TmdbClient, type TmdbRaw } from '../../integrations/tmdb/client';
import { normalize, type Candidate } from './ranker';

export const VOCABULARY_KEY_PREFIX = 'tmdb.search_vocab.';
export const VOCABULARY_SOFT_TTL_MS = 86_400_000;
export const VOCABULARY_HARD_TTL_MS = 14 * 86_400_000;
const MOVIE_PAGES = 10;
const TV_PAGES = 10;
const TOP_PAGES = 5;
const PEOPLE_PAGES = 5;

export interface SearchVocabularyDeps {
  swr: StaleWhileRevalidateCache;
  /** Client TMDB courant (`null` si TMDB n'est pas configuré). */
  tmdb: () => TmdbClient | null;
  logger?: CacheLogger;
}

export class SearchVocabulary {
  readonly #deps: SearchVocabularyDeps;

  constructor(deps: SearchVocabularyDeps) {
    this.#deps = deps;
  }

  keyFor(locale: string): string {
    return VOCABULARY_KEY_PREFIX + (locale || 'default');
  }

  /** Clé de la langue courante (`null` sans TMDB). */
  key(): string | null {
    const tmdb = this.#deps.tmdb();
    return tmdb === null ? null : this.keyFor(tmdb.locale);
  }

  /** Ne lance jamais d'appel : demande une reconstruction si l'entrée manque ou est périmée. */
  read(): Candidate[] {
    const key = this.key();
    if (key === null) return [];
    const hit = this.#deps.swr.read<Candidate[]>(key, VOCABULARY_SOFT_TTL_MS);
    if (hit === null || hit.state === 'stale') this.#deps.swr.requestRefresh(key);
    return Array.isArray(hit?.value) ? hit.value : [];
  }

  /**
   * Interroge TMDB (chaque liste est en cache dans le client). Libellés : titres
   * affiché et original, dédoublonnés sur le texte normalisé en gardant la plus
   * forte popularité. Un résultat vide signifie que la récupération a échoué.
   */
  async build(): Promise<Candidate[]> {
    const tmdb = this.#deps.tmdb();
    if (tmdb === null) return [];
    const calls: Promise<TmdbRaw>[] = [];
    for (let p = 1; p <= MOVIE_PAGES; p++) calls.push(tmdb.popularMovies(p));
    for (let p = 1; p <= TV_PAGES; p++) calls.push(tmdb.popularTv(p));
    for (let p = 1; p <= TOP_PAGES; p++) {
      calls.push(tmdb.topRatedMovies(p), tmdb.topRatedTv(p));
    }
    for (let p = 1; p <= PEOPLE_PAGES; p++) calls.push(tmdb.popularPeople(p));
    calls.push(tmdb.trendingAll('week'));
    let lists: TmdbRaw[];
    try {
      lists = await Promise.all(calls);
    } catch (error) {
      this.#deps.logger?.warn({ err: error }, 'vocabulaire de recherche : échec');
      return [];
    }
    const byNorm = new Map<string, Candidate>();
    for (const data of lists) {
      for (const r of resultsOf(data)) {
        const popularity = typeof r.popularity === 'number' ? r.popularity : 0;
        const labels = new Set(
          [r.title ?? r.name, r.original_title ?? r.original_name].filter(
            (l): l is string => typeof l === 'string',
          ),
        );
        for (const label of labels) {
          const norm = normalize(label);
          if (norm === '') continue;
          const known = byNorm.get(norm);
          if (known === undefined || (known.popularity ?? 0) < popularity) {
            byNorm.set(norm, { label, popularity });
          }
        }
      }
    }
    return [...byNorm.values()];
  }
}
