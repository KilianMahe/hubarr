// SPDX-License-Identifier: AGPL-3.0-or-later
// Actions sur une série (`/api/medias/:slug/series/:id…`) : actualiser,
// rechercher les épisodes manquants (plan saisons / épisodes de l'original),
// suivre ; contrat contre un Sonarr simulé.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planSeriesSearch } from '../../../src/modules/series/detail-routes';
import { rawEpisode, rawSeries, sonarrEnv, warmSeries, type SonarrEnv } from './sonarr-env';

const NOW = Date.parse('2026-11-21T12:00:00Z');

describe('plan de recherche d’une série', () => {
  const ep = (id: number, season: number, overrides: Record<string, unknown> = {}) => ({
    id,
    seasonNumber: season,
    monitored: true,
    hasFile: false,
    airDateUtc: '2020-01-01T00:00:00Z',
    ...overrides,
  });

  it('saison entièrement manquante → `SeasonSearch` ; épisodes isolés groupés', () => {
    const plan = planSeriesSearch(
      [ep(1, 1), ep(2, 1), ep(3, 2), ep(4, 2, { hasFile: true }), ep(5, 3)],
      NOW,
    );
    // La saison 3 n'a qu'un épisode : il rejoint la recherche groupée.
    expect(plan).toEqual({ seasons: [1], episodeIds: [3, 5], count: 4 });
  });

  it('ignore les spéciaux, les non suivis et les épisodes pas encore diffusés', () => {
    const plan = planSeriesSearch(
      [
        ep(1, 0),
        ep(2, 1, { monitored: false }),
        ep(3, 1, { airDateUtc: '2027-01-01T00:00:00Z' }),
        ep(4, 1, { airDateUtc: null }),
      ],
      NOW,
    );
    expect(plan).toEqual({ seasons: [], episodeIds: [], count: 0 });
  });
});

describe('routes', () => {
  let env: SonarrEnv;
  beforeEach(async () => {
    env = await sonarrEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  it('actualiser une série (n° 168)', async () => {
    env.sonarr.on('POST', '/api/v3/command', { id: 21 });
    const response = await env.browser.post(env.url('/7/refresh'));
    expect(response.json()).toEqual({ ok: true, cmdId: 21 });
    expect(env.sonarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'RefreshSeries',
      seriesId: 7,
    });
  });

  it('analyser les fichiers d’une série (P5c.6, V18) : RescanSeries', async () => {
    env.sonarr.on('POST', '/api/v3/command', { id: 22 });
    const response = await env.browser.post(env.url('/7/rescan'));
    expect(response.json()).toEqual({ ok: true, cmdId: 22 });
    expect(env.sonarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'RescanSeries',
      seriesId: 7,
    });
  });

  it('rechercher les manquants (n° 228) : saison en pack puis épisodes, première commande suivie', async () => {
    env.sonarr.on('GET', '/api/v3/episode', [
      rawEpisode(1, { seasonNumber: 1 }),
      rawEpisode(2, { seasonNumber: 1 }),
      rawEpisode(3, { seasonNumber: 2 }),
      rawEpisode(4, { seasonNumber: 2, hasFile: true }),
    ]);
    let next = 30;
    env.sonarr.onCall('POST', '/api/v3/command', () => ({ status: 201, body: { id: next++ } }));
    const response = await env.browser.post(env.url('/1/search'));
    expect(response.json()).toEqual({ ok: true, cmdId: 30, count: 3 });
    expect(env.sonarr.callsTo('GET', '/api/v3/episode')[0]?.query.get('seriesId')).toBe('1');
    expect(env.sonarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { name: 'SeasonSearch', seriesId: 1, seasonNumber: 1 },
      { name: 'EpisodeSearch', episodeIds: [3] },
    ]);
  });

  it('rien de manquant : aucune commande, `count: 0`', async () => {
    env.sonarr.on('GET', '/api/v3/episode', [rawEpisode(1, { hasFile: true })]);
    const response = await env.browser.post(env.url('/1/search'));
    expect(response.json()).toEqual({ ok: true, cmdId: null, count: 0 });
    expect(env.sonarr.callsTo('POST', '/api/v3/command')).toHaveLength(0);
  });

  it('suivre (n° 229) : ressource relue puis renvoyée, cache invalidé ; série absente → 404', async () => {
    await warmSeries(env);
    env.sonarr.on('GET', '/api/v3/series/1', rawSeries(1, { monitored: false }));
    env.sonarr.on('PUT', '/api/v3/series/1', rawSeries(1));
    const response = await env.browser.post(env.url('/1/monitor'), { monitored: true });
    expect(response.json()).toEqual({ ok: true, monitored: true });
    expect(env.sonarr.callsTo('PUT', '/api/v3/series/1')[0]?.body).toMatchObject({
      id: 1,
      monitored: true,
    });
    expect(env.libraryCached()).toBe(false);
    const missing = await env.browser.post(env.url('/99/monitor'), { monitored: true });
    expect(missing.statusCode).toBe(404);
  });
});
