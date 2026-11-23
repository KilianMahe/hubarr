// SPDX-License-Identifier: AGPL-3.0-or-later
// Mise en forme des réponses TMDB pour le navigateur (`TmdbController`) :
// cartes enrichies de l'état en bibliothèque (`enrich`), et extraction des
// éléments de la fiche détaillée (bande-annonce, équipe, plateformes,
// classification). Fonctions pures, testées.

import type { TmdbCard, TmdbDetail, TmdbProviders } from '@hubarr/shared';
import { regionPriority, tmdbImage, type TmdbRaw } from '../../integrations/tmdb/client';
import { libraryEntry, type LibraryIndex } from '../media/library';

export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** Texte non vide, sinon `null`. */
export const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
export const num = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};
export const int = (value: unknown): number => Math.trunc(num(value) ?? 0);
export const objects = (value: unknown): TmdbRaw[] =>
  Array.isArray(value)
    ? value.filter((v): v is TmdbRaw => v !== null && typeof v === 'object')
    : [];
export const obj = (value: unknown): TmdbRaw =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as TmdbRaw) : {};
const round1 = (value: number) => Math.round(value * 10) / 10;

export function yearFromDate(date: string | null): number | null {
  return date !== null && date.length >= 4 && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
}

/** Carte d'un élément TMDB brut, `null` si ce n'est ni un film ni une série. */
export function toCard(
  item: TmdbRaw,
  index: LibraryIndex,
  forceType: 'movie' | 'tv' | null = null,
): TmdbCard | null {
  const type = forceType ?? item.media_type;
  if (type !== 'movie' && type !== 'tv') return null;
  const id = int(item.id);
  const title = str(type === 'movie' ? item.title : item.name) ?? '';
  const date = text(type === 'movie' ? item.release_date : item.first_air_date);
  const lib = libraryEntry(index, type, id);
  const vote = num(item.vote_average);
  return {
    id,
    type,
    title,
    year: yearFromDate(date),
    release: date,
    overview: str(item.overview),
    poster: tmdbImage(item.poster_path, 'w342'),
    posterHi: tmdbImage(item.poster_path, 'w500'),
    backdrop: tmdbImage(item.backdrop_path, 'w780'),
    vote: vote === null ? null : round1(vote),
    voteCount: int(item.vote_count),
    popularity: num(item.popularity),
    inLibrary: lib !== null,
    libStatus: lib?.status ?? null,
    libId: lib?.id ?? null,
    libSlug: lib?.slug ?? null,
  };
}

export function enrich(
  items: readonly TmdbRaw[],
  index: LibraryIndex,
  forceType: 'movie' | 'tv' | null = null,
): TmdbCard[] {
  return items.map((item) => toCard(item, index, forceType)).filter((c) => c !== null);
}

/** Meilleure vidéo YouTube : bande-annonce officielle, anglais puis français, la plus récente. */
export function pickTrailer(videos: readonly TmdbRaw[]): { key: string; name: string } | null {
  const epoch2000 = Date.UTC(2000, 0, 1);
  const score = (v: TmdbRaw) => {
    let s = 0;
    if (v.type === 'Trailer') s += 100;
    else if (v.type === 'Teaser') s += 50;
    if (v.official === true) s += 40;
    const lang = (str(v.iso_639_1) ?? '').toLowerCase();
    if (lang === 'en') s += 20;
    else if (lang === 'fr') s += 15;
    const published = Date.parse(str(v.published_at) ?? '');
    if (Number.isFinite(published)) s += Math.trunc((published - epoch2000) / 86_400_000 / 365);
    return s;
  };
  const yt = videos
    .filter((v) => v.site === 'YouTube' && typeof v.key === 'string')
    .map((v, i) => ({ v, i, s: score(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const first = yt[0]?.v;
  if (first === undefined) return null;
  return { key: str(first.key) ?? '', name: str(first.name) ?? 'Trailer' };
}

const GALLERY_TYPES = new Set(['Trailer', 'Teaser', 'Featurette', 'Behind the Scenes']);

export function pickVideoGallery(
  videos: readonly TmdbRaw[],
  excludeKey: string | null,
): TmdbDetail['videoGallery'] {
  const out: TmdbDetail['videoGallery'] = [];
  for (const v of videos) {
    if (v.site !== 'YouTube' || typeof v.key !== 'string') continue;
    if (excludeKey !== null && v.key === excludeKey) continue;
    if (!GALLERY_TYPES.has(str(v.type) ?? '')) continue;
    out.push({ key: v.key, name: str(v.name) ?? '', type: str(v.type) ?? '' });
    if (out.length >= 4) break;
  }
  return out;
}

const unique = (values: string[]) => [...new Set(values)];

export function pickCrew(d: TmdbRaw, isMovie: boolean): TmdbDetail['crew'] {
  const byJob = new Map<string, string[]>();
  for (const c of objects(obj(d.credits).crew)) {
    const job = str(c.job) ?? '';
    byJob.set(job, [...(byJob.get(job) ?? []), str(c.name) ?? '']);
  }
  const jobs = (...names: string[]) => unique(names.flatMap((n) => byJob.get(n) ?? []));
  if (isMovie) {
    return {
      directors: jobs('Director'),
      writers: jobs('Screenplay', 'Writer', 'Story'),
      composers: jobs('Original Music Composer'),
      cinematographers: jobs('Director of Photography'),
    };
  }
  return {
    directors: [],
    writers: jobs('Writer', 'Story'),
    composers: jobs('Original Music Composer'),
    cinematographers: [],
  };
}

function logos(list: unknown, size = 'w92') {
  return objects(list).map((x) => ({
    name: str(x.provider_name) ?? '',
    logo: tmdbImage(x.logo_path, size),
  }));
}

/** Plateformes (JustWatch via TMDB) du premier pays prioritaire qui en a. */
export function pickProviders(byCountry: TmdbRaw, locale: string): TmdbProviders | null {
  for (const cc of regionPriority(locale, Object.keys(byCountry))) {
    const p = obj(byCountry[cc]);
    if (Object.keys(p).length === 0) continue;
    const pack = {
      country: cc,
      link: str(p.link),
      flatrate: logos(p.flatrate),
      rent: logos(p.rent),
      buy: logos(p.buy),
    };
    if (pack.flatrate.length + pack.rent.length + pack.buy.length > 0) return pack;
  }
  return null;
}

export function pickMovieCertification(results: readonly TmdbRaw[], locale: string): string | null {
  for (const cc of regionPriority(locale)) {
    for (const r of results) {
      if (r.iso_3166_1 !== cc) continue;
      for (const rd of objects(r.release_dates)) {
        const cert = str(rd.certification);
        if (cert) return `[${cc}] ${cert}`;
      }
    }
  }
  return null;
}

export function pickTvCertification(results: readonly TmdbRaw[], locale: string): string | null {
  for (const cc of regionPriority(locale)) {
    for (const r of results) {
      if (r.iso_3166_1 !== cc) continue;
      const rating = str(r.rating);
      if (rating) return `[${cc}] ${rating}`;
    }
  }
  return null;
}

function episodeRef(value: unknown): TmdbDetail['nextEpisode'] {
  const e = obj(value);
  if (Object.keys(e).length === 0) return null;
  return {
    season: int(e.season_number),
    episode: int(e.episode_number),
    name: str(e.name) ?? '',
    airDate: str(e.air_date),
  };
}

/** Fiche détaillée d'un film ou d'une série (`TmdbController::detail`), sans les titres similaires. */
export function buildDetail(
  d: TmdbRaw,
  type: 'movie' | 'tv',
  index: LibraryIndex,
  locale: string,
): Omit<TmdbDetail, 'similar'> {
  const isMovie = type === 'movie';
  const id = int(d.id);
  const date = text(isMovie ? d.release_date : d.first_air_date);
  const externalIds = obj(d.external_ids);
  const tvdbId = num(externalIds.tvdb_id);
  let lib = libraryEntry(index, type, id);
  if (lib === null && !isMovie && tvdbId) lib = index.tv.get(`tvdb_${tvdbId}`) ?? null;
  const runTimes = Array.isArray(d.episode_run_time) ? d.episode_run_time : [];
  const runtime = isMovie ? num(d.runtime) : num(runTimes[0]);
  const videos = objects(obj(d.videos).results);
  const trailer = pickTrailer(videos);
  const vote = num(d.vote_average);
  const popularity = num(d.popularity);

  const collectionRaw = obj(d.belongs_to_collection);
  const altRegions = regionPriority(locale);
  const altTitles: TmdbDetail['altTitles'] = [];
  const altSource = isMovie
    ? objects(obj(d.alternative_titles).titles)
    : objects(obj(d.alternative_titles).results);
  for (const at of altSource) {
    const cc = str(at.iso_3166_1) ?? '';
    if (!altRegions.includes(cc)) continue;
    altTitles.push({ country: cc, title: str(at.title) ?? '' });
    if (altTitles.length >= 6) break;
  }
  const keywordSource = isMovie
    ? objects(obj(d.keywords).keywords)
    : objects(obj(d.keywords).results);

  return {
    id,
    type,
    title: str(isMovie ? d.title : d.name) ?? '',
    original: str(isMovie ? d.original_title : d.original_name) ?? '',
    tagline: text(d.tagline),
    year: yearFromDate(date),
    release: date,
    status: str(d.status),
    runtime,
    genres: objects(d.genres).map((g) => str(g.name) ?? ''),
    overview: str(d.overview),
    vote: vote === null ? null : round1(vote),
    voteCount: int(d.vote_count),
    popularity: popularity === null ? null : round1(popularity),
    poster: tmdbImage(d.poster_path, 'w500'),
    posterPath: str(d.poster_path),
    backdrop: tmdbImage(d.backdrop_path, 'w1280'),
    homepage: text(d.homepage),
    imdbId: str(d.imdb_id) ?? str(externalIds.imdb_id),
    tvdbId,
    networks: isMovie
      ? []
      : objects(d.networks).map((n) => ({
          name: str(n.name) ?? '',
          logo: tmdbImage(n.logo_path, 'w154'),
        })),
    seasons: num(d.number_of_seasons),
    episodes: num(d.number_of_episodes),
    episodeRuntime: isMovie ? null : num(runTimes[0]),
    inProduction: isMovie ? null : d.in_production === true,
    lastAirDate: isMovie ? null : str(d.last_air_date),
    nextEpisode: isMovie ? null : episodeRef(d.next_episode_to_air),
    lastEpisode: isMovie ? null : episodeRef(d.last_episode_to_air),
    creators: isMovie ? [] : objects(d.created_by).map((c) => str(c.name) ?? ''),
    originalLanguage: str(d.original_language),
    spokenLanguages: objects(d.spoken_languages).map((l) => str(l.english_name) ?? ''),
    countries: objects(d.production_countries).map((c) => str(c.name) ?? ''),
    companies: objects(d.production_companies)
      .slice(0, 6)
      .map((c) => ({ name: str(c.name) ?? '', logo: tmdbImage(c.logo_path, 'w154') })),
    collection:
      isMovie && Object.keys(collectionRaw).length > 0
        ? {
            id: int(collectionRaw.id),
            name: str(collectionRaw.name) ?? '',
            poster: tmdbImage(collectionRaw.poster_path, 'w342'),
            backdrop: tmdbImage(collectionRaw.backdrop_path, 'w780'),
          }
        : null,
    budget: isMovie ? int(d.budget) : null,
    revenue: isMovie ? int(d.revenue) : null,
    keywords: keywordSource
      .slice(0, 10)
      .map((k) => str(k.name) ?? '')
      .filter((k) => k !== ''),
    certification: isMovie
      ? pickMovieCertification(objects(obj(d.release_dates).results), locale)
      : pickTvCertification(objects(obj(d.content_ratings).results), locale),
    providers: pickProviders(obj(obj(d['watch/providers']).results), locale),
    cast: objects(obj(d.credits).cast)
      .slice(0, 8)
      .map((c) => ({
        name: str(c.name) ?? '',
        character: str(c.character) ?? '',
        profile: tmdbImage(c.profile_path, 'w185'),
      })),
    crew: pickCrew(d, isMovie),
    trailer,
    videoGallery: pickVideoGallery(videos, trailer?.key ?? null),
    seasonsList: isMovie
      ? []
      : objects(d.seasons).map((s) => {
          const sv = num(s.vote_average);
          return {
            number: int(s.season_number),
            name: str(s.name) ?? '',
            episodeCount: int(s.episode_count),
            airDate: str(s.air_date),
            overview: str(s.overview),
            poster: tmdbImage(s.poster_path, 'w185'),
            vote: sv === null ? null : round1(sv),
          };
        }),
    altTitles,
    reviews: objects(obj(d.reviews).results)
      .slice(0, 3)
      .map((r) => ({
        author: str(r.author) ?? 'Anonyme',
        rating: num(obj(r.author_details).rating),
        content: str(r.content) ?? '',
        date: str(r.created_at),
        url: str(r.url),
      })),
    backdrops: objects(obj(d.images).backdrops)
      .slice(0, 8)
      .map((img) => ({
        thumb: tmdbImage(img.file_path, 'w300'),
        full: tmdbImage(img.file_path, 'w1280'),
      })),
    inLibrary: lib !== null,
    libStatus: lib?.status ?? null,
    libId: lib?.id ?? null,
    libSlug: lib?.slug ?? null,
  };
}
