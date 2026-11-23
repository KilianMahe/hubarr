// SPDX-License-Identifier: AGPL-3.0-or-later
// Flux iCalendar (`CalendrierController::ical`) pour les applications de
// calendrier abonnées : chaque sortie Radarr (cinéma, numérique, physique) et
// chaque épisode Sonarr devient un VEVENT à l'UID **stable entre instances**
// (id TMDB ou TheTVDB), pour que le client mette à jour l'événement au lieu de
// le dupliquer. Dédoublonné comme le calendrier.
//
// Ajouts : lignes repliées à 75 octets (RFC 5545 §3.1, que
// l'original ignorait et que certains clients stricts exigent) et fuseau
// `X-WR-TIMEZONE` pris dans la préférence d'affichage (fixé à Europe/Paris
// dans l'original).

import type { CalendarEpisode, Movie } from '@hubarr/shared';
import type { Translate } from '../../i18n/translator';
import { dayOf, episodeKey, movieKey, type FromInstance } from './events';

export const ICAL_DAYS_BEFORE = 30;
export const ICAL_DAYS_AHEAD = 180;

/** RFC 5545 §3.3.11 : barre oblique inverse, retours à la ligne, virgule, point-virgule. */
export function escapeIcal(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Replie une ligne à 75 octets UTF-8 (suite précédée d'une espace), sans couper un caractère. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const stampOf = (date: Date) => compact(date.toISOString().slice(0, 19)) + 'Z';
const ymd = (day: string) => day.replace(/-/g, '');
const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};
const pad = (n: number) => String(n).padStart(2, '0');

export interface IcalOptions {
  now: Date;
  timezone: string;
  t: Translate;
}

export function buildIcal(
  movies: FromInstance<Movie>[],
  episodes: FromInstance<CalendarEpisode>[],
  { now, timezone, t }: IcalOptions,
): string {
  const stamp = stampOf(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hubarr//Calendrier//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Hubarr',
    `X-WR-TIMEZONE:${timezone}`,
  ];
  const filmLabel = t('dashboard.type.film');
  const seriesLabel = t('dashboard.type.series');
  const slots = [
    ['inCinemasAt', t('calendar.event.type_cinema'), 'cinema'],
    ['digitalAt', t('calendar.event.type_digital'), 'digital'],
    ['physicalAt', t('dashboard.release_badge.bluray'), 'physical'],
  ] as const;

  const movieSeen = new Set<string>();
  for (const { items } of movies) {
    for (const m of items) {
      for (const [field, label, suffix] of slots) {
        const day = dayOf(m[field]);
        if (day === null) continue;
        const key = `${movieKey(m)}|${suffix}|${day}`;
        if (movieSeen.has(key)) continue;
        movieSeen.add(key);
        const uid = m.tmdbId
          ? `radarr-tmdb-${m.tmdbId}-${suffix}@hubarr.local`
          : `radarr-${m.id ?? 0}-${suffix}@hubarr.local`;
        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${ymd(day)}`,
          `DTEND;VALUE=DATE:${nextDay(day)}`,
          `SUMMARY:${escapeIcal(`🎬 ${m.title} — ${label}`)}`,
          `DESCRIPTION:${escapeIcal(m.overview ?? '')}`,
          `CATEGORIES:Hubarr,${escapeIcal(filmLabel)},${escapeIcal(label)}`,
          'END:VEVENT',
        );
      }
    }
  }

  const episodeSeen = new Set<string>();
  for (const { items } of episodes) {
    for (const e of items) {
      if (e.airDateUtc === null || Number.isNaN(Date.parse(e.airDateUtc))) continue;
      const key = episodeKey(e);
      if (episodeSeen.has(key)) continue;
      episodeSeen.add(key);
      const start = new Date(e.airDateUtc);
      const end = new Date(
        start.getTime() + (e.runtime !== null && e.runtime > 0 ? e.runtime : 30) * 60_000,
      );
      const sxe = `S${pad(e.season)}E${pad(e.episode)}`;
      const uid = e.tvdbId
        ? `sonarr-tvdb-${e.tvdbId}-s${pad(e.season)}e${pad(e.episode)}@hubarr.local`
        : `sonarr-${e.seriesId ?? 0}-s${pad(e.season)}e${pad(e.episode)}@hubarr.local`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${stampOf(start)}`,
        `DTEND:${stampOf(end)}`,
        `SUMMARY:${escapeIcal(`📺 ${e.seriesTitle} · ${sxe}`)}`,
        `DESCRIPTION:${escapeIcal(`${e.title}\n\n${e.overview ?? ''}`.trim())}`,
        `CATEGORIES:Hubarr,${escapeIcal(seriesLabel)},${escapeIcal(t('calendar.event.type_episode'))}`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  // CRLF exigé par la RFC 5545 : un simple \n casse les analyseurs stricts.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
