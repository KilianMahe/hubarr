// SPDX-License-Identifier: AGPL-3.0-or-later
// Événements du calendrier (`CalendrierController`) : fusion des calendriers
// Radarr et Sonarr de toutes les instances actives, **dédoublonnés** (le même
// film suivi en 1080p et en 4K, ou la même série sur deux Sonarr, n'apparaît
// qu'une fois ; la première instance l'emporte). Clés stables entre
// instances : id TMDB (repli titre + année) pour les films, id TheTVDB + saison
// + épisode (repli titre de la série) pour les épisodes. Fonctions pures.

import type { CalendarEpisode, CalendarEvent, Movie } from '@hubarr/shared';

export interface FromInstance<T> {
  items: T[];
  slug: string;
  name: string;
}

/** Jour (« AAAA-MM-JJ ») d'une date ISO 8601 de Radarr. */
export function dayOf(iso: string | null): string | null {
  return iso !== null && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
}

export const movieKey = (m: Movie) => `r:${m.tmdbId ?? `${m.title}|${m.year ?? '?'}`}`;
export const episodeKey = (e: CalendarEpisode) =>
  `s:${e.tvdbId ?? e.seriesTitle}|S${e.season}E${e.episode}`;

const RELEASES = [
  ['inCinemasAt', 'cinema'],
  ['digitalAt', 'digital'],
  ['physicalAt', 'physical'],
] as const;

export function movieEvents(sources: FromInstance<Movie>[]): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const { items, slug, name } of sources) {
    for (const m of items) {
      const base = {
        type: 'film' as const,
        airDateUtc: null,
        title: m.title,
        seriesTitle: null,
        season: null,
        episode: null,
        year: m.year,
        poster: m.poster,
        fanart: m.fanart,
        overview: m.overview,
        status: m.status,
        hasFile: m.hasFile,
        monitored: m.monitored,
        id: m.id,
        runtime: m.runtime,
        studio: m.studio,
        network: null,
        genres: m.genres,
        certification: m.certification,
        instanceSlug: slug,
        instanceName: name,
      };
      const candidates: { date: string | null; releaseType: CalendarEvent['releaseType'] }[] = [];
      for (const [field, releaseType] of RELEASES) {
        const date = dayOf(m[field]);
        if (date !== null) candidates.push({ date, releaseType });
      }
      if (candidates.length === 0) candidates.push({ date: null, releaseType: 'unknown' });
      for (const c of candidates) {
        const key = `${movieKey(m)}|${c.releaseType}|${c.date ?? 'none'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...base, ...c });
      }
    }
  }
  return out;
}

export function episodeEvents(sources: FromInstance<CalendarEpisode>[]): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const { items, slug, name } of sources) {
    for (const e of items) {
      const key = episodeKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: 'episode',
        releaseType: 'episode',
        date: e.airDate,
        airDateUtc: e.airDateUtc,
        title: e.title,
        seriesTitle: e.seriesTitle,
        season: e.season,
        episode: e.episode,
        year: null,
        poster: e.poster,
        fanart: e.fanart,
        overview: e.overview,
        status: null,
        hasFile: e.hasFile,
        monitored: e.monitored,
        id: e.seriesId,
        runtime: e.runtime,
        studio: null,
        network: e.network,
        genres: e.genres,
        certification: null,
        instanceSlug: slug,
        instanceName: name,
      });
    }
  }
  return out;
}

/** Tri par jour (sans date en dernier), stable. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events
    .map((event, i) => ({ event, i }))
    .sort(
      (a, b) =>
        (a.event.date ?? '9999-12-31').localeCompare(b.event.date ?? '9999-12-31') || a.i - b.i,
    )
    .map(({ event }) => event);
}
