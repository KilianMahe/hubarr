// SPDX-License-Identifier: AGPL-3.0-or-later
// Calendrier (P4.2) et flux iCal (P4.3) : port de `CalendrierControllerTest`
// (drapeaux « injoignable » par type, jamais sans instance), dédoublonnage
// entre instances, format RFC 5545 (CRLF, UID stables, échappement, repli).

import type { CalendarResponse } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { escapeIcal, foldLine } from '../../../src/modules/calendar/ical';
import { deleteInstance } from '../../../src/modules/instances/instances';
import { calendarEpisode, mediaEnv, movie, type MediaEnv } from '../media-env';

let env: MediaEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

describe('calendrier', () => {
  it('fusionne les instances sans doublon ; une sortie par type de date', async () => {
    env = await mediaEnv({ role: 'user' });
    const shared = movie(1, {
      tmdbId: 603,
      title: 'Matrix',
      inCinemas: '2026-11-25T00:00:00Z',
      digitalRelease: '2026-12-10T00:00:00Z',
    });
    env.up.radarr.on('GET /api/v3/calendar', (call) => {
      expect(call.query.get('start')).toBe('2026-08-24');
      expect(call.query.get('end')).toBe('2027-02-20');
      return { body: [shared] };
    });
    env.up.radarr4k.on('GET /api/v3/calendar', {
      body: [{ ...shared, id: 99 }, movie(2, { title: 'Undated' })],
    });
    env.up.sonarr.on('GET /api/v3/calendar', {
      body: [
        calendarEpisode(1),
        calendarEpisode(2, { airDate: '2026-11-20', airDateUtc: '2026-11-20T20:00:00Z' }),
      ],
    });
    const data = (await env.browser.get('/api/calendrier')).json<CalendarResponse>();
    expect(data.totalFilms).toBe(3);
    expect(data.totalEpisodes).toBe(2);
    expect(data.events.map((e) => [e.type, e.releaseType, e.date])).toEqual([
      ['episode', 'episode', '2026-11-20'],
      ['episode', 'episode', '2026-11-23'],
      ['film', 'cinema', '2026-11-25'],
      ['film', 'digital', '2026-12-10'],
      ['film', 'unknown', null],
    ]);
    const cinema = data.events.find((e) => e.releaseType === 'cinema');
    expect(cinema).toMatchObject({ id: 1, instanceSlug: env.radarr.slug, instanceName: 'Films' });
    expect(data.events[1]).toMatchObject({
      seriesTitle: 'Series 1',
      season: 1,
      episode: 1,
      network: 'HBO',
    });
    expect(data).toMatchObject({
      radarrFailed: false,
      sonarrFailed: false,
      radarrConfigured: true,
    });
  });

  it('une instance en panne lève le drapeau de son type sans masquer les autres', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/calendar', { status: 500, text: 'boom' });
    env.up.radarr4k.on('GET /api/v3/calendar', {
      body: [movie(2, { inCinemas: '2026-11-25T00:00:00Z' })],
    });
    env.up.sonarr.on('GET /api/v3/calendar', { status: 401, text: 'no' });
    const data = (await env.browser.get('/api/calendrier')).json<CalendarResponse>();
    expect(data).toMatchObject({ radarrFailed: true, sonarrFailed: true, totalFilms: 1 });
  });

  it('aucune bannière pour un type sans instance active', async () => {
    env = await mediaEnv();
    deleteInstance(env.database.db, env.sonarr);
    env.up.radarr.on('GET /api/v3/calendar', { status: 500, text: 'boom' });
    const data = (await env.browser.get('/api/calendrier')).json<CalendarResponse>();
    expect(data).toMatchObject({
      radarrFailed: true,
      sonarrFailed: false,
      sonarrConfigured: false,
    });
  });
});

describe('statut de téléchargement', () => {
  // NOW : 2026-11-22 12:00 UTC.
  const statusOf = (data: CalendarResponse, title: string) =>
    data.events.filter((e) => e.title === title).map((e) => e.downloadStatus);

  it('fichier, file, suivi, puis disponibilité au sens de Radarr ou diffusion', async () => {
    env = await mediaEnv({ role: 'user' });
    const past = '2026-11-01T00:00:00Z';
    env.up.radarr.on('GET /api/v3/calendar', {
      body: [
        movie(1, { title: 'Fichier', hasFile: true, digitalRelease: past }),
        movie(2, { title: 'En file', digitalRelease: '2026-11-25T00:00:00Z' }),
        movie(3, { title: 'Non suivi', monitored: false, digitalRelease: past }),
        movie(4, { title: 'Sorti', minimumAvailability: 'released', digitalRelease: past }),
        // En salle seulement : « sorti » 90 jours plus tard.
        movie(5, { title: 'En salle', minimumAvailability: 'released', inCinemas: past }),
        movie(6, { title: 'Dès la salle', minimumAvailability: 'inCinemas', inCinemas: past }),
        movie(7, {
          title: 'À venir',
          minimumAvailability: 'released',
          digitalRelease: '2026-12-01T00:00:00Z',
        }),
      ],
    });
    env.up.radarr.on('GET /api/v3/queue', { body: { records: [{ id: 50, movieId: 2 }] } });
    env.up.radarr4k.on('GET /api/v3/calendar', { body: [] });
    env.up.sonarr.on('GET /api/v3/calendar', {
      body: [
        calendarEpisode(1, { title: 'Diffusé', airDateUtc: '2026-11-20T20:00:00Z' }),
        calendarEpisode(2, { title: 'Demain', airDateUtc: '2026-11-23T20:00:00Z' }),
        calendarEpisode(3, { title: 'Téléchargé', airDateUtc: '2026-11-20T20:00:00Z' }),
      ],
    });
    env.up.sonarr.on('GET /api/v3/queue', {
      body: { records: [{ id: 60, seriesId: 1, episodeId: 3 }] },
    });
    const data = (await env.browser.get('/api/calendrier')).json<CalendarResponse>();
    expect(statusOf(data, 'Fichier')).toEqual(['downloaded']);
    expect(statusOf(data, 'En file')).toEqual(['downloading']);
    expect(statusOf(data, 'Non suivi')).toEqual(['unmonitored']);
    expect(statusOf(data, 'Sorti')).toEqual(['missing']);
    expect(statusOf(data, 'En salle')).toEqual(['upcoming']);
    expect(statusOf(data, 'Dès la salle')).toEqual(['missing']);
    expect(statusOf(data, 'À venir')).toEqual(['upcoming']);
    expect(statusOf(data, 'Diffusé')).toEqual(['missing']);
    expect(statusOf(data, 'Demain')).toEqual(['upcoming']);
    expect(statusOf(data, 'Téléchargé')).toEqual(['downloading']);
  });

  it('une file illisible ne retire que le statut « en cours »', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.radarr.on('GET /api/v3/calendar', {
      body: [movie(2, { title: 'En file', digitalRelease: '2026-11-01T00:00:00Z' })],
    });
    env.up.radarr.on('GET /api/v3/queue', { status: 500, text: 'boom' });
    env.up.radarr4k.on('GET /api/v3/calendar', { body: [] });
    env.up.sonarr.on('GET /api/v3/calendar', { body: [] });
    const data = (await env.browser.get('/api/calendrier')).json<CalendarResponse>();
    expect(data.radarrFailed).toBe(false);
    expect(statusOf(data, 'En file')).toEqual(['missing']);
  });
});

describe('flux iCal', () => {
  it('CRLF, UID stables entre instances, dédoublonnage, aux deux chemins', async () => {
    env = await mediaEnv();
    const shared = movie(1, {
      tmdbId: 603,
      title: 'Matrix; Reloaded',
      overview: 'a,b\nc',
      inCinemas: '2026-11-25T00:00:00Z',
    });
    env.up.radarr.on('GET /api/v3/calendar', (call) => {
      expect(call.query.get('start')).toBe('2026-10-23');
      expect(call.query.get('end')).toBe('2027-05-21');
      return { body: [shared] };
    });
    env.up.radarr4k.on('GET /api/v3/calendar', { body: [{ ...shared, id: 42 }] });
    env.up.sonarr.on('GET /api/v3/calendar', { body: [calendarEpisode(3)] });
    for (const path of ['/api/calendrier.ics', '/calendrier.ics']) {
      const response = await env.browser.get(path);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/calendar; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename="hubarr.ics"');
      const body = response.body;
      expect(body.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
      expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(body.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
      expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(body).toContain('UID:radarr-tmdb-603-cinema@hubarr.local');
      expect(body).toContain('DTSTART;VALUE=DATE:20261125\r\nDTEND;VALUE=DATE:20261126');
      expect(body).toContain('SUMMARY:🎬 Matrix\\; Reloaded — Cinema');
      expect(body).toContain('DESCRIPTION:a\\,b\\nc');
      expect(body).toContain('UID:sonarr-tvdb-1001-s01e03@hubarr.local');
      expect(body).toContain('DTSTART:20261123T200000Z\r\nDTEND:20261123T204500Z');
      expect(body).toContain('X-WR-TIMEZONE:');
    }
  });

  it('exige la session', async () => {
    env = await mediaEnv();
    env.browser.cookie = undefined;
    expect((await env.browser.get('/calendrier.ics')).statusCode).toBe(401);
  });

  it('échappement et repli des lignes à 75 octets', () => {
    expect(escapeIcal('a\\b;c,d\r\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(
      `SUMMARY:${'é'.repeat(60)}`,
    );
  });
});
