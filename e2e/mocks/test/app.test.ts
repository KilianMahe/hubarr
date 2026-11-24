// SPDX-License-Identifier: AGPL-3.0-or-later
// Serveur de faux upstreams : santé, faux Radarr (clé d'API, état
// réinitialisable, recherche qui remplit la file, pagination) et faux Sonarr.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMBY_API_KEY, TAUTULLI_API_KEY, TRACEARR_API_KEY } from '../src/activity/routes';
import { buildMocks } from '../src/app';
import { SEERR_API_KEY } from '../src/seerr/routes';
import { RADARR_API_KEY } from '../src/radarr/routes';
import { SONARR_API_KEY } from '../src/sonarr/routes';
import { TMDB_KEY } from '../src/tmdb/routes';
import { BAZARR_API_KEY } from '../src/bazarr/routes';
import { PROWLARR_API_KEY } from '../src/prowlarr/routes';
import {
  NZBGET_CREDENTIALS,
  QBIT_CREDENTIALS,
  SABNZBD_API_KEY,
  TRANSMISSION_CREDENTIALS,
} from '../src/downloads/routes';

let app: ReturnType<typeof buildMocks>;
beforeEach(() => {
  app = buildMocks();
});
afterEach(async () => {
  await app.close();
});

const radarr = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/radarr${url}`,
    headers: { 'x-api-key': RADARR_API_KEY },
    ...(payload === undefined ? {} : { payload }),
  });

describe('buildMocks', () => {
  it('expose un point de santé avec les services simulés', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      services: [
        'radarr',
        'sonarr',
        'prowlarr',
        'bazarr',
        'qbittorrent',
        'transmission',
        'deluge',
        'sabnzbd',
        'nzbget',
        'gluetun',
        'tautulli',
        'tracearr',
        'emby',
        'seerr',
        'tmdb',
      ],
    });
  });
});

describe('faux Radarr', () => {
  it('exige la clé d’API', async () => {
    const response = await app.inject({ method: 'GET', url: '/radarr/api/v3/movie' });
    expect(response.statusCode).toBe(401);
  });

  it('bibliothèque, fiche et 404', async () => {
    const movies = (await radarr('GET', '/api/v3/movie')).json<
      { id: number; hasFile: boolean }[]
    >();
    expect(movies.length).toBeGreaterThan(10);
    expect(movies.some((movie) => movie.hasFile)).toBe(true);
    expect((await radarr('GET', '/api/v3/movie/1')).json()).toMatchObject({ id: 1 });
    expect((await radarr('GET', '/api/v3/movie/999')).statusCode).toBe(404);
  });

  it('une recherche place le film manquant dans la file et l’historique ; reset', async () => {
    const before = (await radarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>()
      .totalRecords;
    const command = (
      await radarr('POST', '/api/v3/command', { name: 'MoviesSearch', movieIds: [7] })
    ).json<{
      id: number;
      message: string;
    }>();
    expect(command.message).toBe('Completed. 1 reports downloaded.');
    expect((await radarr('GET', `/api/v3/command/${command.id}`)).json()).toMatchObject({
      status: 'completed',
    });
    expect(
      (await radarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>().totalRecords,
    ).toBe(before + 1);
    const history = (await radarr('GET', '/api/v3/history/movie?movieId=7')).json<
      { eventType: string }[]
    >();
    expect(history[0]?.eventType).toBe('grabbed');
    await app.inject({ method: 'POST', url: '/radarr/__reset' });
    expect(
      (await radarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>().totalRecords,
    ).toBe(before);
  });

  it('ajout puis refus du doublon ; pagination des manquants', async () => {
    expect(
      (await radarr('POST', '/api/v3/movie', { tmdbId: 9501, title: 'Le Grand Détour' }))
        .statusCode,
    ).toBe(200);
    expect((await radarr('POST', '/api/v3/movie', { tmdbId: 9501 })).statusCode).toBe(400);
    const missing = (await radarr('GET', '/api/v3/wanted/missing?page=1&pageSize=2')).json<{
      records: unknown[];
      totalRecords: number;
    }>();
    expect(missing.records).toHaveLength(2);
    expect(missing.totalRecords).toBeGreaterThan(2);
  });
});

const sonarr = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/sonarr${url}`,
    headers: { 'x-api-key': SONARR_API_KEY },
    ...(payload === undefined ? {} : { payload }),
  });

describe('faux Sonarr', () => {
  it('exige la clé d’API', async () => {
    const response = await app.inject({ method: 'GET', url: '/sonarr/api/v3/series' });
    expect(response.statusCode).toBe(401);
  });

  it('bibliothèque avec statistiques, épisodes et fichiers cohérents', async () => {
    const series = (await sonarr('GET', '/api/v3/series')).json<
      { id: number; title: string; statistics: { episodeFileCount: number } }[]
    >();
    expect(series.length).toBeGreaterThanOrEqual(6);
    const veilleurs = series.find((entry) => entry.title === 'Les Veilleurs');
    const episodes = (await sonarr('GET', `/api/v3/episode?seriesId=${veilleurs?.id}`)).json<
      { hasFile: boolean; episodeFileId: number }[]
    >();
    const files = (await sonarr('GET', `/api/v3/episodefile?seriesId=${veilleurs?.id}`)).json<
      { id: number }[]
    >();
    expect(episodes.filter((episode) => episode.hasFile)).toHaveLength(files.length);
    expect(veilleurs?.statistics.episodeFileCount).toBe(files.length);
  });

  it('une recherche d’épisode remplit la file ; l’import vide les bloqués ; remise à zéro', async () => {
    const missing = (await sonarr('GET', '/api/v3/wanted/missing')).json<{
      records: { id: number }[];
    }>();
    const target = missing.records[0];
    const before = (await sonarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>();
    const command = (
      await sonarr('POST', '/api/v3/command', { name: 'EpisodeSearch', episodeIds: [target?.id] })
    ).json<{ message: string }>();
    expect(command.message).toMatch(/reports downloaded/);
    const after = (await sonarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>();
    expect(after.totalRecords).toBeGreaterThanOrEqual(before.totalRecords);
    await sonarr('POST', '/api/v3/command', { name: 'ManualImport', files: [] });
    const imported = (await sonarr('GET', '/api/v3/queue')).json<{
      records: { trackedDownloadState: string }[];
    }>();
    expect(imported.records.some((item) => item.trackedDownloadState === 'importBlocked')).toBe(
      false,
    );
    await app.inject({ method: 'POST', url: '/sonarr/__reset' });
    const reset = (await sonarr('GET', '/api/v3/queue')).json<{ totalRecords: number }>();
    expect(reset.totalRecords).toBe(before.totalRecords);
  });

  it('ajout : doublon refusé comme Sonarr', async () => {
    const response = await sonarr('POST', '/api/v3/series', {
      tvdbId: 70_001,
      title: 'Les Veilleurs',
    });
    expect(response.statusCode).toBe(400);
    const added = await sonarr('POST', '/api/v3/series', {
      tvdbId: 81_001,
      title: 'Archipel Nord',
    });
    expect(added.statusCode).toBe(201);
  });
});

describe('administration simulée (P3b.6)', () => {
  it('indexeurs : secrets en clair (ancien Radarr), ajout, test refusé, remise à zéro', async () => {
    const list = (await radarr('GET', '/api/v3/indexer')).json<
      { id: number; fields: { name: string; value: unknown }[] }[]
    >();
    expect(list.map((indexer) => indexer.id)).toEqual([1, 2]);
    expect(list[0]?.fields.find((entry) => entry.name === 'apiKey')?.value).toBe(
      'cle-secrete-indexeur',
    );
    const created = await radarr('POST', '/api/v3/indexer', { name: 'Nouveau', fields: [] });
    expect(created.statusCode).toBe(201);
    const refused = await radarr('POST', '/api/v3/indexer/test', {
      fields: [{ name: 'baseUrl', value: 'https://invalide' }],
    });
    expect(refused.statusCode).toBe(400);
    expect((await radarr('POST', '/api/v3/indexer/test', { fields: [] })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/radarr/__reset' });
    expect((await radarr('GET', '/api/v3/indexer')).json()).toHaveLength(2);
  });

  it('configuration et étiquettes partagées avec le faux service', async () => {
    const host = (await radarr('GET', '/api/v3/config/host')).json<{ port: number }>();
    expect(host.port).toBe(7878);
    await radarr('PUT', '/api/v3/config/host/1', { ...host, port: 9000 });
    expect((await radarr('GET', '/api/v3/config/host')).json<{ port: number }>().port).toBe(9000);
    const tag = (await radarr('POST', '/api/v3/tag', { label: 'hd' })).json<{ id: number }>();
    await radarr('PUT', `/api/v3/tag/${tag.id}`, { id: tag.id, label: 'uhd' });
    const details = (await radarr('GET', '/api/v3/tag/detail')).json<{ label: string }[]>();
    expect(details.map((detail) => detail.label)).toContain('uhd');
  });
});

describe('faux Prowlarr et faux Bazarr', () => {
  it('Prowlarr : clé exigée, indexeurs, test global en échec partiel, reset', async () => {
    expect((await app.inject({ method: 'GET', url: '/prowlarr/api/v1/indexer' })).statusCode).toBe(
      401,
    );
    const headers = { 'x-api-key': PROWLARR_API_KEY };
    const indexers = (
      await app.inject({ method: 'GET', url: '/prowlarr/api/v1/indexer', headers })
    ).json<unknown[]>();
    expect(indexers).toHaveLength(3);
    const testAll = await app.inject({
      method: 'POST',
      url: '/prowlarr/api/v1/indexer/testall',
      headers,
    });
    expect(testAll.statusCode).toBe(400);
    await app.inject({ method: 'DELETE', url: '/prowlarr/api/v1/indexer/1', headers });
    await app.inject({ method: 'POST', url: '/prowlarr/__reset' });
    expect(
      (await app.inject({ method: 'GET', url: '/prowlarr/api/v1/indexer', headers })).json<
        unknown[]
      >(),
    ).toHaveLength(3);
  });

  it('Bazarr : filtre par ids répétés, téléchargement en formulaire', async () => {
    const headers = { 'x-api-key': BAZARR_API_KEY };
    const one = await app.inject({
      method: 'GET',
      url: '/bazarr/api/movies?radarrid%5B%5D=1',
      headers,
    });
    expect(one.json<{ data: unknown[] }>().data).toHaveLength(1);
    const download = await app.inject({
      method: 'POST',
      url: '/bazarr/api/providers/movies',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'radarrid=1&provider=opensubtitles&subtitle=tok',
    });
    expect(download.statusCode).toBe(204);
    const after = (
      await app.inject({ method: 'GET', url: '/bazarr/api/movies?radarrid%5B%5D=1', headers })
    ).json<{
      data: { missing_subtitles: unknown[] }[];
    }>();
    expect(after.data[0]?.missing_subtitles).toEqual([]);
  });
});

describe('faux clients de téléchargement', () => {
  it('qBittorrent : connexion par cookie, liste, pause, ajout d’un magnet', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/qbittorrent/api/v2/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `username=${QBIT_CREDENTIALS.user}&password=${QBIT_CREDENTIALS.password}`,
    });
    expect(login.headers['set-cookie']).toContain('SID=e2e-sid');
    expect(
      (await app.inject({ method: 'GET', url: '/qbittorrent/api/v2/torrents/info' })).statusCode,
    ).toBe(403);
    const cookie = { cookie: 'SID=e2e-sid' };
    const list = await app.inject({
      method: 'GET',
      url: '/qbittorrent/api/v2/torrents/info',
      headers: cookie,
    });
    expect(list.json<unknown[]>()).toHaveLength(4);
    await app.inject({
      method: 'POST',
      url: '/qbittorrent/api/v2/torrents/add',
      headers: { ...cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'urls=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc%26dn%3DNouveau.Film',
    });
    const after = await app.inject({
      method: 'GET',
      url: '/qbittorrent/api/v2/torrents/info',
      headers: cookie,
    });
    expect(after.json<{ name: string }[]>()[0]?.name).toBe('Nouveau.Film');
  });

  it('Transmission : jeton de session (409) puis liste', async () => {
    const auth = `Basic ${Buffer.from(`${TRANSMISSION_CREDENTIALS.user}:${TRANSMISSION_CREDENTIALS.password}`).toString('base64')}`;
    const first = await app.inject({
      method: 'POST',
      url: '/transmission-mock/transmission/rpc',
      headers: { authorization: auth },
      payload: { method: 'torrent-get' },
    });
    expect(first.statusCode).toBe(409);
    const session = String(first.headers['x-transmission-session-id']);
    const list = await app.inject({
      method: 'POST',
      url: '/transmission-mock/transmission/rpc',
      headers: { authorization: auth, 'x-transmission-session-id': session },
      payload: { method: 'torrent-get', arguments: {} },
    });
    expect(list.json<{ arguments: { torrents: unknown[] } }>().arguments.torrents).toHaveLength(4);
  });

  it('SABnzbd et NZBGet : clé et Basic exigés, file', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/sabnzbd/api?mode=queue&apikey=x' })).statusCode,
    ).toBe(403);
    const queue = await app.inject({
      method: 'GET',
      url: `/sabnzbd/api?mode=queue&output=json&apikey=${SABNZBD_API_KEY}`,
    });
    expect(queue.json<{ queue: { slots: unknown[] } }>().queue.slots).toHaveLength(3);
    const auth = `Basic ${Buffer.from(`${NZBGET_CREDENTIALS.user}:${NZBGET_CREDENTIALS.password}`).toString('base64')}`;
    const groups = await app.inject({
      method: 'POST',
      url: '/nzbget/jsonrpc',
      headers: { authorization: auth },
      payload: { method: 'listgroups', params: [0] },
    });
    expect(groups.json<{ result: unknown[] }>().result).toHaveLength(3);
  });
});

describe('faux serveurs d’activité', () => {
  it('Tautulli : clé exigée, activité, image PNG', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/tautulli/api/v2?apikey=x&cmd=get_activity',
    });
    expect(bad.json<{ response: { result: string } }>().response.result).toBe('error');
    const ok = await app.inject({
      method: 'GET',
      url: `/tautulli/api/v2?apikey=${TAUTULLI_API_KEY}&cmd=get_activity`,
    });
    expect(
      ok.json<{ response: { data: { sessions: unknown[] } } }>().response.data.sessions,
    ).toHaveLength(1);
    const image = await app.inject({
      method: 'GET',
      url: `/tautulli/api/v2?apikey=${TAUTULLI_API_KEY}&cmd=pms_image_proxy&img=/library/x`,
    });
    expect(image.headers['content-type']).toBe('image/png');
  });

  it('Tracearr et Emby : jetons exigés', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/tracearr/api/v2/public/streams' })).statusCode,
    ).toBe(401);
    const streams = await app.inject({
      method: 'GET',
      url: '/tracearr/api/v2/public/streams',
      headers: { authorization: `Bearer ${TRACEARR_API_KEY}` },
    });
    expect(streams.json<{ data: unknown[] }>().data).toHaveLength(1);
    const sessions = await app.inject({
      method: 'GET',
      url: '/emby-mock/emby/Sessions',
      headers: { 'x-emby-token': EMBY_API_KEY },
    });
    expect(sessions.json<unknown[]>()).toHaveLength(2);
  });
});

describe('faux Seerr', () => {
  it('clé exigée, approbation d’une demande, fiche TMDB', async () => {
    expect((await app.inject({ method: 'GET', url: '/seerr/api/v1/request' })).statusCode).toBe(
      401,
    );
    const headers = { 'x-api-key': SEERR_API_KEY };
    await app.inject({ method: 'POST', url: '/seerr/api/v1/request/1/approve', headers });
    const counts = await app.inject({ method: 'GET', url: '/seerr/api/v1/request/count', headers });
    expect(counts.json<{ pending: number }>().pending).toBe(1);
    const movie = await app.inject({ method: 'GET', url: '/seerr/api/v1/movie/501', headers });
    expect(movie.json<{ title: string }>().title).toBe('Orbite Basse');
  });
});

describe('faux TMDB', () => {
  it('clé exigée, listes, fiche, recherche', async () => {
    expect((await app.inject({ method: 'GET', url: '/tmdb/3/trending/all/week' })).statusCode).toBe(
      401,
    );
    const key = `api_key=${TMDB_KEY}`;
    const trending = await app.inject({ method: 'GET', url: `/tmdb/3/trending/all/week?${key}` });
    expect(trending.json<{ results: unknown[] }>().results.length).toBeGreaterThan(3);
    const detail = await app.inject({ method: 'GET', url: `/tmdb/3/tv/9601?${key}` });
    expect(detail.json<{ external_ids: { tvdb_id: number } }>().external_ids.tvdb_id).toBe(90601);
    const search = await app.inject({
      method: 'GET',
      url: `/tmdb/3/search/multi?${key}&query=n%C3%A9bu`,
    });
    expect(search.json<{ results: unknown[] }>().results).toHaveLength(2);
    const calendar = await app.inject({
      method: 'GET',
      url: '/radarr/api/v3/calendar',
      headers: { 'x-api-key': RADARR_API_KEY },
    });
    expect(calendar.json<unknown[]>()).toHaveLength(4);
  });
});
