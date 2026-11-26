// SPDX-License-Identifier: AGPL-3.0-or-later
// Bazarr, routes (P3c.4) : `BazarrControllerTest`, `BazarrSubtitlesApiTest`,
// `BazarrDownloadEpisodeRefreshTest`, `BazarrFrameRenderTest` (données des
// pages), badges des bibliothèques.

import type {
  BazarrGrid,
  BazarrOverview,
  BazarrRefresh,
  BazarrSeriesDetail,
  BazarrStatusMap,
} from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { BAZARR_KEYS } from '../../../src/integrations/bazarr/subtitle-index';
import { applyServicePatch } from '../../../src/modules/services/config';
import { demoteUser } from '../../helpers';
import { EMAIL } from '../movies/radarr-env';
import { bazarrEnv, bazarrMovie, bazarrSeries, type BazarrEnv } from './bazarr-env';

let env: BazarrEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});
async function open(options: Parameters<typeof bazarrEnv>[0] = {}): Promise<BazarrEnv> {
  env = await bazarrEnv(options);
  env.bazarr.on('GET', '/api/system/status', { data: { bazarr_version: '1.5' } });
  return env;
}
async function warm(env: BazarrEnv): Promise<void> {
  env.bazarr.on('GET', '/api/movies', {
    data: [bazarrMovie(1), bazarrMovie(2, { missing_subtitles: [] })],
  });
  env.bazarr.on('GET', '/api/series', { data: [bazarrSeries(5)] });
  env.bazarr.on('GET', '/api/badges', { movies: 1, episodes: 3, providers: 2 });
  for (const key of [BAZARR_KEYS.movies, BAZARR_KEYS.series, BAZARR_KEYS.badges]) {
    await env.app.cache.queue.run(key);
  }
}

describe('gardes', () => {
  it('non configuré → 409, utilisateur simple → 403', async () => {
    let current = await open({ configured: false });
    expect((await current.browser.get(current.url())).statusCode).toBe(409);
    expect(
      (
        await current.browser.post(current.url('/download/movie'), {
          radarrId: 1,
          provider: 'p',
          subtitle: 's',
        })
      ).statusCode,
    ).toBe(409);
    await current.close();
    current = await open({ role: 'user' });
    expect((await current.browser.get(current.url('/status/movies'))).statusCode).toBe(403);
  });

  it('injoignable → 503 sur les pages', async () => {
    const current = await open();
    current.agent
      .get('http://down.test')
      .intercept({ path: () => true, method: () => true })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .persist();
    applyServicePatch(current.database.db, 'bazarr', { url: 'http://down.test' });
    expect((await current.browser.get(current.url('/movies'))).statusCode).toBe(503);
  });
});

describe('pages', () => {
  it('accueil : préchauffage puis compteurs et « les plus manquants »', async () => {
    const current = await open();
    const cold = (await current.browser.get(current.url())).json<BazarrOverview>();
    expect(cold.state).toBe('warming');
    expect(current.bazarr.callsTo('GET', '/api/movies')).toHaveLength(0);
    await warm(current);
    const page = (await current.browser.get(current.url())).json<BazarrOverview>();
    expect(page).toMatchObject({
      state: 'ready',
      counts: { movies: 1, episodes: 3, providers: 2 },
    });
    expect(page.mostMissing.map((item) => [item.kind, item.id, item.missingCount])).toEqual([
      ['series', 5, 3],
      ['movie', 1, 1],
    ]);
  });

  it('grilles des films et des séries', async () => {
    const current = await open();
    await warm(current);
    const movies = (await current.browser.get(current.url('/movies'))).json<BazarrGrid>();
    expect(movies.state).toBe('ready');
    expect(movies.languages).toEqual(['fr']);
    expect(movies.cards.map((card) => [card.movieId, card.substate])).toEqual([
      [1, 'missing'],
      [2, 'complete'],
    ]);
    const series = (await current.browser.get(current.url('/series'))).json<BazarrGrid>();
    expect(series.cards[0]).toMatchObject({
      seriesId: 5,
      substate: 'missing',
      count: 3,
      year: 2019,
    });
  });

  it('historique : une liste en échec vaut null, l’autre reste', async () => {
    const current = await open();
    current.bazarr.on('GET', '/api/movies/history', {
      data: [
        {
          title: 'Dune',
          action: 1,
          provider: 'opensubtitles',
          language: { name: 'French' },
          raw_timestamp: 1_700_000_000,
        },
      ],
    });
    current.bazarr.on('GET', '/api/episodes/history', { message: 'boom' }, 500);
    const history = (await current.browser.get(current.url('/history'))).json<unknown>();
    expect(history).toEqual({
      movies: [
        {
          title: 'Dune',
          action: '1',
          provider: 'opensubtitles',
          language: 'French',
          date: '2023-11-14T22:13:20.000Z',
        },
      ],
      episodes: null,
    });
  });

  it('épisodes d’une série : titre et suivi de cette série seule', async () => {
    const current = await open();
    current.bazarr.on('GET', '/api/episodes', {
      data: [
        {
          sonarrEpisodeId: 11,
          season: 1,
          episode: 2,
          title: 'Pilot',
          audio_language: [{ name: 'English' }],
          missing_subtitles: [{ code2: 'fr' }],
          subtitles: [],
        },
      ],
    });
    current.bazarr.on('GET', '/api/series', { data: [bazarrSeries(5, { profileId: null })] });
    const detail = (await current.browser.get(current.url('/series/5'))).json<BazarrSeriesDetail>();
    expect(detail).toEqual({
      seriesId: 5,
      title: 'Series 5',
      tracked: false,
      episodes: [
        {
          episodeId: 11,
          season: 1,
          episode: 2,
          title: 'Pilot',
          audioLanguages: ['English'],
          missing: 1,
          present: 0,
        },
      ],
    });
    expect(current.bazarr.callsTo('GET', '/api/episodes')[0]?.query.get('seriesid[]')).toBe('5');
    expect(current.bazarr.callsTo('GET', '/api/series')[0]?.query.getAll('seriesid[]')).toEqual([
      '5',
    ]);
  });
});

describe('recherche et téléchargement', () => {
  it('recherche d’un film : résultats normalisés, délai fournisseur', async () => {
    const current = await open();
    current.bazarr.on('GET', '/api/providers/movies', {
      data: [
        {
          provider: 'opensubtitles',
          language: { name: 'French', code2: 'fr' },
          hearing_impaired: 'True',
          forced: 'False',
          original_format: 'False',
          score: 92.5,
          release_info: ['Dune.2021.1080p', 'WEB'],
          uploader: 'bob',
          subtitle: 'opaque-token',
        },
        { provider: 'x' },
      ],
    });
    const results = (await current.browser.get(current.url('/search/movie/1'))).json<unknown>();
    expect(results).toEqual({
      results: [
        {
          provider: 'opensubtitles',
          language: 'French',
          hi: true,
          forced: false,
          originalFormat: false,
          score: 92.5,
          release: 'Dune.2021.1080p, WEB',
          uploader: 'bob',
          subtitle: 'opaque-token',
        },
      ],
    });
    expect(current.bazarr.callsTo('GET', '/api/providers/movies')[0]?.query.get('radarrid')).toBe(
      '1',
    );
    expect(current.bazarr.callsTo('GET', '/api/providers/movies')[0]?.headers['x-api-key']).toBe(
      'bazarr-key',
    );
  });

  it('téléchargement d’un épisode : série exigée, formulaire, série corrigée en place', async () => {
    const current = await open();
    await warm(current);
    current.bazarr.on('POST', '/api/providers/episodes');
    current.bazarr.on('GET', '/api/series', {
      data: [bazarrSeries(5, { episodeMissingCount: 0 })],
    });
    const response = await current.browser.post(current.url('/download/episode'), {
      seriesId: 5,
      episodeId: 11,
      hi: true,
      provider: 'opensubtitles',
      subtitle: 'tok',
    });
    expect(response.json()).toEqual({ ok: true });
    expect(current.bazarr.callsTo('POST', '/api/providers/episodes')[0]?.body).toEqual({
      seriesid: '5',
      episodeid: '11',
      hi: 'True',
      forced: 'False',
      original_format: 'False',
      provider: 'opensubtitles',
      subtitle: 'tok',
    });
    const badges = (
      await current.browser.get(current.url('/status/series'))
    ).json<BazarrStatusMap>();
    expect(badges.items['5']).toEqual({ state: 'complete', count: 0 });
    expect(
      (await current.browser.post(current.url('/download/episode'), { episodeId: 11 })).statusCode,
    ).toBe(400);
  });

  it('téléchargement refusé → 502 ; recherche automatique d’un film', async () => {
    const current = await open();
    current.bazarr.on('POST', '/api/providers/movies', { message: 'Provider throttled' }, 500);
    const refused = await current.browser.post(current.url('/download/movie'), {
      radarrId: 1,
      provider: 'p',
      subtitle: 's',
    });
    expect(refused.statusCode).toBe(502);
    current.bazarr.on('PATCH', '/api/movies');
    current.bazarr.on('GET', '/api/movies', { data: [bazarrMovie(1)] });
    expect((await current.browser.post(current.url('/auto/movie/1'))).json()).toEqual({ ok: true });
    expect(current.bazarr.callsTo('PATCH', '/api/movies')[0]?.body).toEqual({
      radarrid: '1',
      action: 'search-missing',
    });
  });
});

describe('langues et badges (BazarrSubtitlesApiTest)', () => {
  it('film : carte en cache, sinon une lecture de ce film ; absent ou en échec → non suivi', async () => {
    const current = await open();
    current.bazarr.on('GET', '/api/movies', {
      data: [bazarrMovie(1, { subtitles: [{ code2: 'en', hi: true }] })],
    });
    expect((await current.browser.get(current.url('/subtitles/movie/1'))).json()).toEqual({
      present: [{ lang: 'en', hi: true, forced: false }],
      missing: [{ lang: 'fr', hi: false, forced: false }],
      tracked: true,
    });
    expect(current.bazarr.callsTo('GET', '/api/movies')[0]?.query.getAll('radarrid[]')).toEqual([
      '1',
    ]);
    expect((await current.browser.get(current.url('/subtitles/movie/9'))).json()).toMatchObject({
      tracked: false,
    });
    current.bazarr.on('GET', '/api/movies', { message: 'boom' }, 500);
    expect((await current.browser.get(current.url('/subtitles/movie/1'))).statusCode).toBe(200);
  });

  it('série : langues par épisode ; deux instances Sonarr → non suivi', async () => {
    let current = await open();
    current.bazarr.on('GET', '/api/episodes', {
      data: [{ sonarrEpisodeId: 11, missing_subtitles: ['fr'] }, { title: 'sans id' }],
    });
    expect((await current.browser.get(current.url('/subtitles/series/5'))).json()).toEqual({
      tracked: true,
      episodes: { 11: { present: [], missing: [{ lang: 'fr', hi: false, forced: false }] } },
    });
    await current.close();
    current = await open({ instances: 2 });
    expect((await current.browser.get(current.url('/subtitles/series/5'))).json()).toEqual({
      tracked: false,
      episodes: {},
    });
    expect((await current.browser.get(current.url('/status/movies'))).json()).toEqual({
      state: 'hidden',
      items: {},
    });
  });
});

describe('reconstruction en ligne (n° 28)', () => {
  it('bilan fidèle, déjà en cours, disjoncteur ouvert sans fetch', async () => {
    const current = await open();
    current.bazarr.on('GET', '/api/movies', { data: [bazarrMovie(1)] });
    current.bazarr.on('GET', '/api/series', { data: [] });
    current.bazarr.on('GET', '/api/badges', { movies: 1, episodes: 0, providers: 1 });
    const done = (await current.browser.post(current.url('/refresh'))).json<BazarrRefresh>();
    expect(done).toEqual({
      ok: true,
      movies: 'fresh',
      series: 'fresh',
      badges: 'fresh',
      reason: null,
    });
    const again = (await current.browser.post(current.url('/refresh'))).json<BazarrRefresh>();
    expect(again.reason).toBe('already_running');
    current.app.cache.store.delete('bazarr_subtitle_index.inline_refresh');
    current.app.upstream.health.markDown('bazarr');
    const before = current.bazarr.calls.length;
    const down = (await current.browser.post(current.url('/refresh'))).json<BazarrRefresh>();
    expect(down).toMatchObject({ ok: false, reason: 'breaker_open' });
    expect(current.bazarr.calls.length).toBe(before);
    expect(current.app.cache.store.has('bazarr_subtitle_index.inline_refresh')).toBe(false);
  });
  it('ouverte au droit de lecture (index de Hubarr) ; recherche automatique refusée', async () => {
    const current = await open();
    demoteUser(current.database, EMAIL, { bazarr: 'read' });
    current.bazarr.on('GET', '/api/movies', { data: [] });
    current.bazarr.on('GET', '/api/series', { data: [] });
    current.bazarr.on('GET', '/api/badges', { movies: 0, episodes: 0, providers: 0 });
    expect((await current.browser.post(current.url('/refresh'))).statusCode).toBe(200);
    expect((await current.browser.post(current.url('/auto/movie/1'))).statusCode).toBe(403);
  });
});
