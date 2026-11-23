// SPDX-License-Identifier: AGPL-3.0-or-later
// Calculs des cartes du tableau de bord (`DashboardController`), en fonctions
// pures testées : prochaines sorties sur 7 jours dédoublonnées entre
// instances, derniers ajouts, mise en avant du bandeau, dates de sortie de
// l'aperçu rapide.

import type {
  CalendarEpisode,
  DashboardHero,
  DashboardRecent,
  Movie,
  QuickLookDetail,
  Series,
  UpcomingItem,
} from '@hubarr/shared';
import { regionPriority, tmdbImage, tmdbSized, type TmdbRaw } from '../../integrations/tmdb/client';
import { dayOf, type FromInstance } from '../calendar/events';
import { int, num, objects, obj, str, text } from '../discover/enrich';
import type { Owned } from '../media/library';

export const UPCOMING_DAYS = 7;
export const MAX_REQUESTS = 5;
export const MAX_RECOMMENDATIONS = 16;
export const MAX_RECENT = 16;
export const MAX_WATCHLIST = 16;
export const MAX_TRANSMISSION = 5;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Sortie la plus proche d'aujourd'hui ou plus tard (au jour près) d'un film :
 * Radarr renvoie un film dont **une** des dates tombe dans la fenêtre, donc un
 * film sorti en salle il y a deux mois mais attendu en Blu-ray la semaine
 * prochaine y figure ; on garde l'événement vraiment à venir.
 */
export function nextRelease(
  movie: Movie,
  today: string,
): { day: string; kind: 'digital' | 'cinema' | 'bluray' } | null {
  const candidates = [
    { day: dayOf(movie.digitalAt), kind: 'digital' as const },
    { day: dayOf(movie.inCinemasAt), kind: 'cinema' as const },
    { day: dayOf(movie.physicalAt), kind: 'bluray' as const },
  ].filter(
    (c): c is { day: string; kind: 'digital' | 'cinema' | 'bluray' } =>
      c.day !== null && c.day >= today,
  );
  candidates.sort((a, b) => a.day.localeCompare(b.day));
  return candidates[0] ?? null;
}

/** Prochaines sorties (`upcomingReleases`) : films et épisodes, dédoublonnés, triés. */
export function upcomingItems(
  movies: FromInstance<Movie>[],
  episodes: FromInstance<CalendarEpisode>[],
  today: string,
): UpcomingItem[] {
  const seen = new Set<string>();
  const items: (UpcomingItem & { sortKey: string })[] = [];
  for (const { items: list, slug } of movies) {
    for (const m of list) {
      const next = nextRelease(m, today);
      if (next === null) continue;
      const key = `movie:${m.tmdbId ?? `${m.title}:${m.year ?? '?'}`}`;
      if (seen.has(key)) continue; // la première instance qui présente le film l'emporte
      seen.add(key);
      items.push({
        type: 'movie',
        id: m.id,
        title: m.title || '—',
        year: m.year,
        episodeCode: null,
        episodeTitle: null,
        releaseKind: next.kind,
        network: null,
        poster: tmdbSized(m.poster, 'w342'),
        day: next.day,
        at: null,
        slug,
        sortKey: `${next.day}T00:00:00Z`,
      });
    }
  }
  for (const { items: list, slug } of episodes) {
    for (const e of list) {
      if (e.airDate === null || e.airDate < today) continue;
      // L'id TheTVDB est commun aux instances ; l'id de série ne l'est pas.
      const key = `episode:${e.tvdbId ?? e.seriesTitle}:S${e.season}E${e.episode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        type: 'episode',
        id: e.seriesId,
        title: e.seriesTitle || '—',
        year: null,
        episodeCode: `S${pad(e.season)}E${pad(e.episode)}`,
        episodeTitle: e.title && e.title !== '—' ? e.title : null,
        releaseKind: null,
        network: e.network,
        poster: tmdbSized(e.poster, 'w342'),
        day: e.airDate,
        at: e.airDateUtc,
        slug,
        sortKey: e.airDateUtc ?? `${e.airDate}T00:00:00Z`,
      });
    }
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || a.sortKey.localeCompare(b.sortKey));
  return items.map(({ sortKey: _sortKey, ...item }) => item);
}

/** Derniers ajouts des bibliothèques (`recentAdditions`), du plus récent au plus ancien. */
export function recentAdditions(
  movies: Owned<Movie>[],
  series: Owned<Series>[],
): DashboardRecent['items'] {
  const items: DashboardRecent['items'] = [];
  for (const { item, slug } of movies) {
    if (item.id === null) continue;
    items.push({
      type: 'movie',
      id: item.id,
      title: item.title || '—',
      addedAt: item.addedAt,
      poster: tmdbSized(item.poster, 'w342'),
      downloaded: item.hasFile,
      network: null,
      slug,
    });
  }
  for (const { item, slug } of series) {
    if (item.id === null) continue;
    items.push({
      type: 'series',
      id: item.id,
      title: item.title || '—',
      addedAt: item.addedAt,
      poster: tmdbSized(item.poster, 'w342'),
      downloaded: false,
      network: item.network,
      slug,
    });
  }
  const epoch = '1970-01-01';
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.addedAt ?? epoch).localeCompare(a.it.addedAt ?? epoch) || a.i - b.i)
    .slice(0, MAX_RECENT)
    .map(({ it }) => it);
}

export function truncate(s: string | null, max: number): string | null {
  if (s === null || s === '') return null;
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * Mise en avant du bandeau (`pickHeroSpotlight`) : un film de la bibliothèque
 * avec fanart, au hasard (« envie de le revoir ? ») ; sinon le premier titre
 * tendance avec une image de fond ; sinon rien.
 */
export function pickHeroSpotlight(
  movies: Owned<Movie>[],
  trending: readonly TmdbRaw[],
  random: () => number = Math.random,
): DashboardHero['spotlight'] {
  const withFanart = movies.filter(({ item }) => item.fanart && item.title);
  if (withFanart.length > 0) {
    const pick = withFanart[Math.floor(random() * withFanart.length)] ?? withFanart[0];
    if (pick !== undefined) {
      const m = pick.item;
      return {
        source: 'library',
        url: tmdbSized(m.fanart, 'w1280') ?? '',
        title: m.title,
        overview: truncate(m.overview, 220),
        year: m.year,
        runtime: m.runtime,
        quality: m.quality,
        rating: m.ratings,
        genres: m.genres.slice(0, 3),
        badge: m.hasFile ? 'in_library' : 'monitored',
        ref: m.id === null ? null : { kind: 'library', type: 'movie', slug: pick.slug, id: m.id },
      };
    }
  }
  for (const item of trending) {
    const backdrop = tmdbImage(item.backdrop_path, 'w1280');
    if (backdrop === null) continue;
    const type = item.media_type === 'tv' ? 'tv' : 'movie';
    const date = text(item.release_date) ?? text(item.first_air_date);
    const id = int(item.id);
    return {
      source: 'tmdb',
      url: backdrop,
      title: str(item.title) ?? str(item.name) ?? '',
      overview: truncate(str(item.overview), 220),
      year: date !== null && date.length >= 4 ? Number(date.slice(0, 4)) : null,
      runtime: null,
      quality: null,
      rating: num(item.vote_average),
      genres: [],
      badge: 'trending',
      ref: id ? { kind: 'tmdb', type, id } : null,
    };
  }
  return null;
}

type Chip = QuickLookDetail['releaseDates'][number];

/** Puces cinéma → numérique → physique d'un film (dates nulles ignorées). */
export function movieReleaseChips(
  cinema: string | null,
  digital: string | null,
  physical: string | null,
  today: string,
): Chip[] {
  const chips: Chip[] = [];
  for (const [kind, date] of [
    ['cinema', cinema],
    ['digital', digital],
    ['physical', physical],
  ] as const) {
    const day = dayOf(date);
    if (day !== null) chips.push({ kind, date: day, upcoming: day >= today });
  }
  return chips;
}

/** Puces d'une série : première diffusion, puis prochain épisode (en cours) ou fin (terminée). */
export function seriesReleaseChips(
  firstAired: string | null,
  nextEpisode: string | null,
  lastEpisode: string | null,
  ended: boolean,
  today: string,
): Chip[] {
  const chips: Chip[] = [];
  const chip = (kind: Chip['kind'], date: string | null) => {
    const day = dayOf(date);
    if (day !== null) chips.push({ kind, date: day, upcoming: day >= today });
  };
  chip('first_aired', firstAired);
  if (!ended && nextEpisode) chip('next_episode', nextEpisode);
  else if (ended && lastEpisode) chip('ended', lastEpisode);
  return chips;
}

/**
 * Dates de sortie d'un film TMDB (`release_dates`) : pays de la langue d'abord,
 * puis les autres. Types TMDB : 2/3 salles, 4 numérique, 5 physique.
 */
export function tmdbMovieReleaseChips(
  results: readonly TmdbRaw[],
  locale: string,
  today: string,
): Chip[] {
  const byCountry = new Map<string, Map<number, string>>();
  for (const r of results) {
    const cc = str(r.iso_3166_1) ?? '';
    const types = byCountry.get(cc) ?? new Map<number, string>();
    for (const rd of objects(r.release_dates)) {
      const date = str(rd.release_date);
      if (date) types.set(int(rd.type), date);
    }
    byCountry.set(cc, types);
  }
  const order = regionPriority(locale, [...byCountry.keys()]);
  const pick = (types: number[]) => {
    for (const cc of order) {
      for (const t of types) {
        const raw = byCountry.get(cc)?.get(t);
        if (raw) return raw;
      }
    }
    return null;
  };
  return movieReleaseChips(pick([3, 2]), pick([4]), pick([5]), today);
}

/** Distribution, plateformes, bande-annonce et IMDb d'une fiche TMDB (`quickLookExtras`). */
export function quickLookExtras(data: TmdbRaw, locale: string) {
  const cast = objects(obj(data.credits).cast)
    .slice(0, 6)
    .map((c) => ({ name: str(c.name) ?? '', profile: tmdbImage(c.profile_path, 'w185') }));
  let providers: { name: string; logo: string | null }[] = [];
  const byCountry = obj(obj(data['watch/providers']).results);
  for (const cc of regionPriority(locale)) {
    const flat = objects(obj(byCountry[cc]).flatrate);
    if (flat.length === 0) continue;
    providers = flat.map((p) => ({
      name: str(p.provider_name) ?? '',
      logo: tmdbImage(p.logo_path, 'w92'),
    }));
    break;
  }
  const score = (v: TmdbRaw) => {
    let s = 0;
    if (v.type === 'Trailer') s += 100;
    else if (v.type === 'Teaser') s += 50;
    if (v.official === true) s += 40;
    const lang = (str(v.iso_639_1) ?? '').toLowerCase();
    if (lang === 'en') s += 20;
    else if (lang === 'fr') s += 15;
    return s;
  };
  const videos = objects(obj(data.videos).results)
    .filter((v) => v.site === 'YouTube')
    .map((v, i) => ({ v, i, s: score(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  return {
    cast,
    providers,
    trailerKey: str(videos[0]?.v.key),
    imdbId: str(data.imdb_id) ?? str(obj(data.external_ids).imdb_id),
  };
}
