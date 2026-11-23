// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche de la page Découverte (`TmdbController::smartSearch`,
// `searchPayload`, `suggestionCandidates`). Avec une requête : recherche
// multiple TMDB (deux pages, plus l'orthographe sans accents), personnes
// extraites, films et séries filtrés et classés (`ranker.ts`), le premier
// renvoyé comme « meilleur résultat » avec ses genres ; correction des fautes
// quand la requête trouve peu. Sans requête mais avec des filtres :
// exploration (`/discover`). Chaque titre porte son état en bibliothèque.

import {
  smartSearchQuerySchema,
  type SearchPerson,
  type SmartSearch,
  type SmartSearchQuery,
  type TmdbCard,
} from '@hubarr/shared';
import {
  resultsOf,
  tmdbImage,
  type TmdbClient,
  type TmdbRaw,
} from '../../integrations/tmdb/client';
import type { LibraryIndex } from '../media/library';
import {
  labelsOf,
  matches,
  normalize,
  sortItems,
  splitYear,
  stripAccents,
  suggest,
  typeOf,
  type Candidate,
  type SearchFilters,
} from '../search/ranker';
import { enrich, int, num, objects, str } from './enrich';

const truthy = (value: string | undefined) => value === '1' || value === 'true' || value === 'on';

interface Payload {
  terms: string;
  best: SmartSearch['best'];
  bestPerson: SearchPerson | null;
  results: TmdbCard[];
  people: SearchPerson[];
  total: number;
  candidates: Candidate[];
}

async function genreNames(tmdb: TmdbClient, type: 'movie' | 'tv', ids: unknown): Promise<string[]> {
  const data = type === 'movie' ? await tmdb.genresMovies() : await tmdb.genresTv();
  const map = new Map(objects(data.genres).map((g) => [int(g.id), str(g.name) ?? '']));
  return (Array.isArray(ids) ? ids : [])
    .map((id) => map.get(int(id)))
    .filter((name): name is string => name !== undefined && name !== '');
}

async function searchPayload(
  tmdb: TmdbClient,
  terms: string,
  yearHint: number | null,
  filters: SearchFilters,
  sort: string,
  hideOwned: boolean,
  index: LibraryIndex,
): Promise<Payload> {
  const normalized = normalize(terms);
  const first = await tmdb.searchMulti(terms, 1);
  const pages: TmdbRaw[] = [first];
  const extra: Promise<TmdbRaw>[] = [];
  if ((num(first.total_pages) ?? 1) > 1) extra.push(tmdb.searchMulti(terms, 2));
  const plain = stripAccents(terms);
  if (plain !== terms) extra.push(tmdb.searchMulti(plain, 1));
  pages.push(...(await Promise.all(extra)));

  const raw: TmdbRaw[] = [];
  let people: SearchPerson[] = [];
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const data of pages) {
    for (const r of resultsOf(data)) {
      candidates.push(...labelsOf(r));
      if (r.media_type === 'person') {
        const name = str(r.name) ?? '';
        const popularity = num(r.popularity) ?? 0;
        const known = popularity >= 1.5 || normalize(name) === normalized;
        const key = `person_${int(r.id)}`;
        if (name !== '' && known && people.length < 6 && !seen.has(key)) {
          seen.add(key);
          people.push({
            id: int(r.id),
            popularity,
            name,
            profile: tmdbImage(r.profile_path, 'w185'),
            known: str(r.known_for_department) ?? '',
            titles: objects(r.known_for)
              .slice(0, 3)
              .map((k) => str(k.title) ?? str(k.name))
              .filter((t): t is string => t !== null && t !== ''),
          });
        }
        continue;
      }
      const type = typeOf(r);
      const key = `${type}_${int(r.id)}`;
      if (type === null || seen.has(key) || !matches(r, filters)) continue;
      seen.add(key);
      raw.push(r);
    }
  }

  // Les plus connues d'abord ; les homonymes se replient sur la plus connue.
  people.sort((a, b) => b.popularity - a.popularity);
  const byName = new Map<string, SearchPerson>();
  for (const person of people) {
    const key = normalize(person.name);
    if (!byName.has(key)) byName.set(key, person);
  }
  people = Array.from(byName.values());

  const ranked = sortItems(raw, sort, normalized, yearHint);
  let results = enrich(ranked, index);
  if (hideOwned) results = results.filter((it) => !it.inLibrary);

  let best: SmartSearch['best'] = null;
  const head = results.shift();
  let headCard: TmdbCard | null = null;
  if (head !== undefined) {
    headCard = head;
    const rawBest = ranked.find((r) => typeOf(r) === head.type && int(r.id) === head.id) ?? {};
    best = {
      ...head,
      genres: await genreNames(tmdb, head.type, rawBest.genre_ids),
      originalTitle: str(rawBest.original_title) ?? str(rawBest.original_name),
    };
  }

  // Requête = nom exact d'une personne connue, et aucun titre ne s'appelle
  // ainsi : la personne prend la première carte et les titres retournent à la grille.
  let bestPerson: SearchPerson | null = null;
  const topPerson = people[0];
  if (
    topPerson !== undefined &&
    normalize(topPerson.name) === normalized &&
    topPerson.popularity >= 3 &&
    !(best !== null && normalize(best.title) === normalized)
  ) {
    bestPerson = topPerson;
    people.shift();
    if (best !== null && headCard !== null) {
      results.unshift(headCard);
      best = null;
    }
  }

  return {
    terms,
    best,
    bestPerson,
    results,
    people,
    total: results.length + (best ? 1 : 0) + (bestPerson ? 1 : 0),
    candidates,
  };
}

/**
 * Titres à confronter à une requête mal tapée : ce que la recherche a renvoyé,
 * des recherches sur les débuts de la requête (une faute tardive garde ses
 * premières lettres), chaque mot d'une requête de plusieurs mots, et le
 * vocabulaire des titres connus (qui atteint un titre célèbre même avec une
 * faute en début de mot).
 */
async function suggestionCandidates(
  tmdb: TmdbClient,
  terms: string,
  seen: Candidate[],
  vocabulary: Candidate[],
): Promise<Candidate[]> {
  const candidates = Array.from(seen);
  const plain = normalize(terms);
  const chars = Array.from(plain);
  const probes: string[] = [];
  for (let n = chars.length - 1; n >= 5 && probes.length < 4; n--) {
    probes.push(chars.slice(0, n).join('').trimEnd());
  }
  const words = plain.split(' ').filter((w) => Array.from(w).length >= 4);
  if (words.length > 1) probes.push(...words.slice(0, 2));
  const unique = [...new Set(probes.filter((p) => Array.from(p).length >= 4))];
  const lists = await Promise.all(unique.map((probe) => tmdb.searchMulti(probe, 1)));
  for (const data of lists) for (const r of resultsOf(data)) candidates.push(...labelsOf(r));
  return [...candidates, ...vocabulary];
}

function discoverSort(sort: string, type: 'movie' | 'tv'): string {
  if (sort === 'vote') return 'vote_average.desc';
  if (sort === 'newest')
    return type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  return 'popularity.desc';
}

const plausibleYear = (value: number | undefined) =>
  value !== undefined && value >= 1870 && value <= 2100 ? value : null;

export async function smartSearch(
  tmdb: TmdbClient,
  index: LibraryIndex,
  /** Paramètres bruts de la requête (validés ici). */
  input: Partial<Record<keyof SmartSearchQuery, unknown>>,
  deps: { vocabulary: () => Candidate[]; now?: Date },
): Promise<SmartSearch> {
  const q = smartSearchQuerySchema.parse(input);
  const now = deps.now ?? new Date();
  const filters: SearchFilters = {
    type: q.type,
    genre: q.genre > 0 ? q.genre : null,
    year_min: plausibleYear(q.year_min),
    year_max: plausibleYear(q.year_max),
    vote_min: Math.max(0, Math.min(10, q.vote_min)),
  };
  const hideOwned = truthy(q.hide_owned);
  // Plafonnée : une requête peut se démultiplier en appels (en cache) avec la correction.
  const query = Array.from(q.q.trim()).slice(0, 100).join('');

  if (Array.from(query).length >= 2) {
    const [terms, yearHint] = splitYear(query, now);
    let payload = await searchPayload(tmdb, terms, yearHint, filters, q.sort, hideOwned, index);

    // « Vouliez-vous dire » : seulement quand la requête a trouvé peu.
    let suggestion: string | null = null;
    if (payload.total < 3 && !truthy(q.exact)) {
      const candidates = await suggestionCandidates(
        tmdb,
        terms,
        payload.candidates,
        deps.vocabulary(),
      );
      // Complétion seulement sans aucun résultat : avec des résultats, un mot
      // à moitié tapé est juste en cours de saisie.
      suggestion = suggest(terms, candidates, payload.total === 0);
    }
    let correctedFrom: string | null = null;
    const literalIsObscure =
      payload.total === 0 || (payload.bestPerson === null && (payload.best?.popularity ?? 0) < 5);
    if (suggestion !== null && literalIsObscure) {
      const corrected = await searchPayload(
        tmdb,
        suggestion,
        yearHint,
        filters,
        q.sort,
        hideOwned,
        index,
      );
      if (corrected.total > 0) {
        payload = corrected;
        correctedFrom = query;
        suggestion = null;
      }
    }
    return {
      mode: 'search',
      best: payload.best,
      bestPerson: payload.bestPerson,
      results: payload.results,
      people: payload.people,
      total: payload.total,
      suggestion,
      correctedFrom,
      correctedTo: correctedFrom !== null ? payload.terms : null,
    };
  }

  // Sans requête : exploration avec les filtres (les deux types pour « tous »).
  const page = Math.max(1, Math.min(500, q.page));
  const items: TmdbRaw[] = [];
  let totalPages = 1;
  const today = now.toISOString().slice(0, 10);
  for (const t of q.type === 'all' ? (['movie', 'tv'] as const) : [q.type]) {
    const params: Record<string, string | number> = { page, sort_by: discoverSort(q.sort, t) };
    if (filters.genre) params.with_genres = filters.genre;
    const field = t === 'movie' ? 'primary_release_date' : 'first_air_date';
    if (filters.year_min) params[`${field}.gte`] = `${filters.year_min}-01-01`;
    if (filters.year_max) params[`${field}.lte`] = `${filters.year_max}-12-31`;
    else if (q.sort === 'newest') params[`${field}.lte`] = today; // sorti, pas annoncé
    if ((filters.vote_min ?? 0) > 0 || q.sort === 'vote') {
      params['vote_average.gte'] = filters.vote_min ?? 0;
      params['vote_count.gte'] = 100; // un 10/10 sur 3 votes est du bruit
    }
    const data = t === 'movie' ? await tmdb.discoverMovies(params) : await tmdb.discoverTv(params);
    for (const r of resultsOf(data)) items.push({ ...r, media_type: t });
    totalPages = Math.max(totalPages, Math.min(500, int(data.total_pages) || 1));
  }
  const sorted = sortItems(items, q.sort === 'relevance' ? 'popularity' : q.sort);
  let results = enrich(sorted, index);
  if (hideOwned) results = results.filter((it) => !it.inLibrary);
  return { mode: 'discover', best: null, bestPerson: null, results, people: [], page, totalPages };
}
