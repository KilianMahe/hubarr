// SPDX-License-Identifier: AGPL-3.0-or-later
// Classement et filtrage de la recherche (page Découverte), sur les éléments
// TMDB bruts (films et séries de `/search/multi`) : port de `SearchRanker`.
// Fonctions pures, testées par le port de `SearchRankerTest`.
//
// La pertinence favorise, dans l'ordre : un titre identique, un titre qui
// commence par la requête, un titre qui contient tous ses mots ; puis la
// popularité, le nombre de votes, une année tapée dans la requête
// (« dune 2021 ») et enfin l'ordre de TMDB.
//
// Écart : la translittération ICU `Any-Latin; Latin-ASCII` de
// l'original n'existe pas en JavaScript. Les accents sont retirés par
// décomposition Unicode (plus quelques ligatures latines) et les lettres des
// autres écritures sont conservées au lieu d'être romanisées : une requête en
// cyrillique ou en japonais reste comparable à un titre de la même écriture.

import { ANIME_GENRE_ID, ANIME_ORIGINAL_LANGUAGE } from '@hubarr/shared';

export const SEARCH_SORTS = ['relevance', 'popularity', 'vote', 'newest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export type TmdbRaw = Record<string, unknown>;

export interface SearchFilters {
  type?: 'all' | 'movie' | 'tv';
  genre?: number | null;
  year_min?: number | null;
  year_max?: number | null;
  vote_min?: number;
  /** Animés seulement (genre Animation, langue originale japonaise). */
  anime?: boolean;
}

export interface Candidate {
  label: string;
  popularity?: number;
}

/** Lettres latines que la décomposition Unicode ne ramène pas à l'ASCII. */
const LATIN_EXTRA: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'TH',
  ı: 'i',
};

/** Accents retirés, casse et espaces conservés : « Pokémo » → « Pokemo ». */
export function stripAccents(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ßæÆœŒøØłŁđĐðÐþÞı]/g, (c) => LATIN_EXTRA[c] ?? c);
}

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normalize(s: string): string {
  return (
    stripAccents(s)
      .toLowerCase()
      // Une apostrophe soude au lieu de séparer : « JoJo's » forme un mot, « jojos ».
      .replace(/['`’]/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Longueur en points de code (le `strlen` de l'original, sur de l'ASCII). */
const len = (s: string) => Array.from(s).length;

/** Distance de Levenshtein, en points de code. */
export function levenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[y.length] ?? 0;
}

/**
 * Sépare une année finale de la requête : « dune 2021 » → `['dune', 2021]`.
 * Seule une année de sortie plausible compte : « blade runner 2049 » garde son 2049.
 */
export function splitYear(query: string, now = new Date()): [string, number | null] {
  const trimmed = query.trim();
  const match = /^(.+?)\s+\(?((?:19|20)\d{2})\)?$/u.exec(trimmed);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    const year = Number(match[2]);
    if (year <= now.getFullYear() + 5) return [match[1].trim(), year];
  }
  return [trimmed, null];
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function dateOf(item: TmdbRaw): string | null {
  return str(item.release_date) ?? str(item.first_air_date);
}

export function yearOf(item: TmdbRaw): number | null {
  const date = dateOf(item);
  return date !== null && date.length >= 4 ? Number(date.slice(0, 4)) : null;
}

export function typeOf(item: TmdbRaw): 'movie' | 'tv' | null {
  const type = item.media_type;
  if (type !== undefined && type !== null) {
    return type === 'movie' || type === 'tv' ? type : null; // person, collection…
  }
  if ('title' in item) return 'movie';
  return 'name' in item ? 'tv' : null;
}

/** Animé d'après un résultat TMDB : genre Animation, langue originale japonaise. */
export function isAnime(item: TmdbRaw): boolean {
  const genres = Array.isArray(item.genre_ids) ? item.genre_ids.map(num) : [];
  return genres.includes(ANIME_GENRE_ID) && item.original_language === ANIME_ORIGINAL_LANGUAGE;
}

/**
 * Paramètres de `/discover` pour les animés : le genre Animation s'ajoute aux
 * genres choisis (TMDB les combine en « et »), langue originale japonaise.
 */
export function animeDiscoverParams(genres: string | number | null | undefined) {
  const ids = new Set(
    String(genres ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id)),
  );
  ids.add(String(ANIME_GENRE_ID));
  return { with_genres: [...ids].join(','), with_original_language: ANIME_ORIGINAL_LANGUAGE };
}

export function matches(item: TmdbRaw, filters: SearchFilters): boolean {
  const type = typeOf(item);
  if (type === null) return false;
  if ((filters.type ?? 'all') !== 'all' && type !== filters.type) return false;
  if (filters.genre) {
    const genres = Array.isArray(item.genre_ids) ? item.genre_ids.map(num) : [];
    if (!genres.includes(filters.genre)) return false;
  }
  const year = yearOf(item);
  if (filters.year_min && (year === null || year < filters.year_min)) return false;
  if (filters.year_max && (year === null || year > filters.year_max)) return false;
  if (filters.vote_min && num(item.vote_average) < filters.vote_min) return false;
  if (filters.anime === true && !isAnime(item)) return false;
  return true;
}

function titlesOf(item: TmdbRaw): string[] {
  return [
    str(item.title) ?? str(item.name),
    str(item.original_title) ?? str(item.original_name),
  ].filter((t): t is string => t !== null);
}

function hasAllWords(haystack: string, words: string[]): boolean {
  const have = haystack.split(' ');
  return words.every((w) => have.includes(w));
}

export function score(
  item: TmdbRaw,
  normalizedQuery: string,
  yearHint: number | null,
  tmdbIndex: number,
): number {
  const words = normalizedQuery === '' ? [] : normalizedQuery.split(' ');
  let best = 0;
  for (const title of titlesOf(item)) {
    const nt = normalize(title);
    let s = 0;
    if (nt === normalizedQuery) s = 1000;
    else if (nt.startsWith(`${normalizedQuery} `)) s = 450;
    else if (nt.startsWith(normalizedQuery)) s = 400;
    else if (words.length > 0 && hasAllWords(nt, words)) s = 200;
    else if (nt.includes(normalizedQuery)) s = 150;
    best = Math.max(best, s);
  }
  const popularity = num(item.popularity);
  const votes = Math.trunc(num(item.vote_count));
  let total = best + Math.log10(1 + popularity) * 60 + Math.log10(1 + votes) * 25 - tmdbIndex * 2;
  // Un titre que presque personne ne connaît (un court métrage « Poke » à
  // 2 votes) ne doit pas passer devant un titre célèbre qui commence pareil.
  if (votes < 10 && popularity < 3) total -= 500;
  if (yearHint !== null) {
    const year = yearOf(item);
    if (year === yearHint) total += 300;
    else if (year !== null && Math.abs(year - yearHint) > 1) total -= 100;
  }
  return total;
}

const spaceship = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/** Tri stable des éléments TMDB bruts (donnés dans l'ordre de TMDB). */
export function sortItems<T extends TmdbRaw>(
  items: readonly T[],
  mode: string,
  normalizedQuery = '',
  yearHint: number | null = null,
): T[] {
  const keyed = items.map((item, i) => ({ i, item }));
  const scores = new Map<number, number>();
  const scoreOf = (k: { i: number; item: T }) => {
    let s = scores.get(k.i);
    if (s === undefined) {
      s = score(k.item, normalizedQuery, yearHint, k.i);
      scores.set(k.i, s);
    }
    return s;
  };
  keyed.sort((a, b) => {
    const x = a.item;
    const y = b.item;
    let cmp: number;
    switch (mode) {
      case 'popularity':
        cmp = spaceship(num(y.popularity), num(x.popularity));
        break;
      case 'vote': {
        // Bien noté avec assez de votes d'abord ; un 10/10 sur 3 votes est du bruit.
        const ey = num(y.vote_count) >= 50 ? 1 : 0;
        const ex = num(x.vote_count) >= 50 ? 1 : 0;
        cmp = spaceship(ey, ex) || spaceship(num(y.vote_average), num(x.vote_average));
        break;
      }
      case 'newest':
        cmp =
          spaceship(yearOf(y) ?? 0, yearOf(x) ?? 0) ||
          (dateOf(y) ?? '').localeCompare(dateOf(x) ?? '');
        break;
      default:
        cmp = spaceship(scoreOf(b), scoreOf(a));
    }
    return cmp !== 0 ? cmp : a.i - b.i;
  });
  return keyed.map((k) => k.item);
}

type Key = [number, number];
const keyLess = (a: Key, b: Key) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Distance mot à mot d'une requête de plusieurs mots : chaque mot face au mot
 * du titre à la même place, avec une tolérance selon sa longueur (aucune
 * jusqu'à 3 lettres, 1 jusqu'à 5, 2 jusqu'à 8, 3 au-delà), le dernier mot
 * pouvant aussi être le début du sien (« adven » → « adventure »). `null` si
 * un mot est trop loin, ou si rien n'a été corrigé.
 */
function wordDistance(nq: string, nl: string, allowCompletion: boolean): number | null {
  const q = nq.split(' ');
  const l = nl === '' ? [] : nl.split(' ');
  const n = q.length;
  if (n < 2 || l.length < n) return null;
  let typos = 0;
  let completed = false;
  for (let i = 0; i < n; i++) {
    const w = q[i] ?? '';
    const t = l[i] ?? '';
    const wl = len(w);
    const tolerance = wl <= 3 ? 0 : wl <= 5 ? 1 : wl <= 8 ? 2 : 3;
    const last = i === n - 1;
    if (w === t) continue;
    if (last && wl >= 2 && t.startsWith(w)) {
      completed = true;
      continue;
    }
    let d = levenshtein(w, t);
    if (d <= tolerance) {
      typos += d;
      continue;
    }
    if (last && wl >= 4 && len(t) > wl) {
      d = levenshtein(w, Array.from(t).slice(0, wl).join(''));
      if (d <= tolerance) {
        typos += d;
        completed = true;
        continue;
      }
    }
    return null;
  }
  if (typos === 0 && (!completed || !allowCompletion)) return null;
  // Dernier mot inachevé et mots du titre en plus relâchent un peu la correspondance.
  return typos + (completed ? 0.5 : 0) + 0.25 * (l.length - n);
}

/**
 * « Vouliez-vous dire » : le meilleur titre pour une requête mal tapée.
 *
 * Comparaison sur le texte normalisé par distance d'édition (une requête de
 * 4 à 7 lettres tolère une faute, 8 à 11 deux, au-delà trois), sur le titre
 * entier et sur ses premiers mots. Avec `allowCompletion`, une requête qui
 * commence un candidat compte aussi (« pokemo » → « Pokémon »). Le plus proche
 * gagne, puis le plus populaire. Si la requête est elle-même un vrai titre, la
 * suggestion n'est faite que pour un candidat bien plus populaire.
 */
export function suggest(
  query: string,
  candidates: readonly (string | Candidate)[],
  allowCompletion = false,
): string | null {
  const nq = normalize(query);
  if (len(nq) < 4) return null;
  const maxDistance = Math.max(1, Math.trunc(len(nq) / 4));
  const queryWords = nq.split(' ').length;

  const found: { label: string | null; key: Key | null; popularity: number } = {
    label: null,
    key: null,
    popularity: 0,
  };
  let exactPopularity: number | null = null;
  const consider = (key: Key, label: string, popularity: number) => {
    if (found.key === null || keyLess(key, found.key)) {
      found.key = key;
      found.label = label;
      found.popularity = popularity;
    }
  };

  for (const candidate of candidates) {
    const label = typeof candidate === 'string' ? candidate : candidate.label;
    const popularity = typeof candidate === 'string' ? 0 : num(candidate.popularity);
    if (typeof label !== 'string' || label.trim() === '') continue;
    const words = label.trim().split(/\s+/u);
    const variants = [label];
    if (words.length > queryWords) {
      variants.push(
        words
          .slice(0, queryWords)
          .join(' ')
          .replace(/[ :,.-]+$/u, ''),
      );
    }
    for (const variant of variants) {
      const nv = normalize(variant);
      if (nv === '') continue;
      if (nv === nq) {
        exactPopularity = Math.max(exactPopularity ?? 0, popularity);
        continue;
      }
      let distance: number;
      if (allowCompletion && nv.startsWith(nq)) {
        distance = 0.5; // la requête est le début de ce titre
      } else if (Math.abs(len(nv) - len(nq)) <= maxDistance) {
        distance = levenshtein(nq, nv);
        if (distance > maxDistance) continue;
      } else {
        continue;
      }
      consider([distance, -popularity], variant, popularity);
    }
    const distance = wordDistance(nq, normalize(label), allowCompletion);
    if (distance !== null) consider([distance, -popularity], label, popularity);
  }

  if (found.label === null) return null;
  if (exactPopularity !== null && found.popularity < 10 * Math.max(exactPopularity, 0.5)) {
    return null; // la requête est un vrai titre et rien de bien meilleur n'est proche
  }
  return found.label;
}

/** Titres affiché et original (ou nom d'une personne) d'un élément, avec sa popularité. */
export function labelsOf(item: TmdbRaw): Candidate[] {
  const popularity = num(item.popularity);
  return [...new Set(titlesOf(item))].map((label) => ({ label, popularity }));
}
