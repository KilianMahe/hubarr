// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes des clients torrent (P3d.1 à P3d.4) : gardes, liste, fiche,
// actions, ajout (garde SSRF, fichiers), VPN, résolution, et les échanges
// propres à chaque client (session qBittorrent et repli 4.x, jeton
// Transmission, connexion Deluge et relogin).

import type {
  TorrentDetail,
  TorrentListResponse,
  TorrentResolve,
  TorrentVpn,
} from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createInstance } from '../../../src/modules/instances/instances';
import { noDns } from '../movies/radarr-env';
import { torrentEnv, type FakeUpstream, type TorrentEnv } from './torrent-env';

let env: TorrentEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});
async function open(options: Parameters<typeof torrentEnv>[0] = {}): Promise<TorrentEnv> {
  env = await torrentEnv(options);
  return env;
}

const H = 'a'.repeat(40);
const H2 = 'b'.repeat(40);

function qbitBasics(qbit: FakeUpstream) {
  qbit.on('POST /api/v2/auth/login', {
    text: 'Ok.',
    headers: { 'set-cookie': 'QBT_SID_8080=sess1; HttpOnly' },
  });
  qbit.on('GET /api/v2/torrents/info', {
    body: [
      {
        hash: H,
        name: 'Dune.2021.1080p',
        state: 'downloading',
        progress: 0.5,
        dlspeed: 10,
        added_on: 2,
        category: 'movies',
      },
      { hash: H2, name: 'Other', state: 'pausedUP', progress: 1, added_on: 1, tags: 'x' },
    ],
  });
  qbit.on('GET /api/v2/transfer/info', {
    body: {
      dl_info_speed: 10,
      up_info_speed: 0,
      connection_status: 'connected',
      dl_rate_limit: 0,
      up_rate_limit: 1024,
    },
  });
  qbit.on('GET /api/v2/sync/maindata', {
    body: {
      server_state: {
        alltime_dl: 5,
        alltime_ul: 6,
        global_ratio: '1.20',
        free_space_on_disk: 99,
        use_alt_speed_limits: true,
      },
    },
  });
  qbit.on('GET /api/v2/torrents/categories', { body: { movies: { savePath: '' }, tv: {} } });
  qbit.on('GET /api/v2/torrents/tags', { body: ['x'] });
}

describe('gardes', () => {
  it('non configuré → 409, utilisateur simple → 403, empreinte invalide → 404', async () => {
    let current = await open({ configure: {} });
    expect((await current.browser.get('/api/qbittorrent/torrents')).statusCode).toBe(409);
    await current.close();
    current = await open({ role: 'user' });
    expect((await current.browser.get('/api/deluge/torrents')).statusCode).toBe(403);
    await current.close();
    current = await open();
    expect((await current.browser.get('/api/transmission/torrent/zz')).statusCode).toBe(404);
    // Routes absentes pour un client sans la capacité.
    expect(
      (await current.browser.post(`/api/transmission/torrent/${H}/rename`, { name: 'x' }))
        .statusCode,
    ).toBe(404);
    expect((await current.browser.post('/api/qbittorrent/pause-all')).statusCode).toBe(404);
  });
});

describe('qBittorrent', () => {
  it('connexion unique, liste filtrée et statistiques', async () => {
    const current = await open();
    qbitBasics(current.upstream.qbittorrent);
    const list = (
      await current.browser.get('/api/qbittorrent/torrents?filter=downloading')
    ).json<TorrentListResponse>();
    expect(list.torrents.map((t) => t.hash)).toEqual([H]);
    expect(list.stats).toMatchObject({
      total: 2,
      downloading: 1,
      paused: 1,
      globalRatio: 1.2,
      freeSpace: 99,
      dlLimit: null,
      upLimit: 1024,
      altSpeed: true,
    });
    expect(list.categories).toEqual(['movies', 'tv']);
    expect(list.tags).toEqual(['x']);
    await current.browser.get('/api/qbittorrent/torrents');
    const logins = current.upstream.qbittorrent.callsTo('POST /api/v2/auth/login');
    expect(logins).toHaveLength(1);
    expect(logins[0]?.body).toEqual({ username: 'admin', password: 'secret' });
    const info = current.upstream.qbittorrent.callsTo('GET /api/v2/torrents/info');
    expect(info.at(-1)?.headers.cookie).toBe('QBT_SID_8080=sess1');
  });

  it('session expirée (403) : reconnexion et un seul rejeu', async () => {
    const current = await open();
    const qbit = current.upstream.qbittorrent;
    qbitBasics(qbit);
    let first = true;
    qbit.on('POST /api/v2/torrents/stop', () => {
      if (first) {
        first = false;
        return { status: 403, text: 'Forbidden' };
      }
      return { text: '' };
    });
    expect((await current.browser.post(`/api/qbittorrent/torrent/${H}/pause`)).statusCode).toBe(
      200,
    );
    expect(qbit.callsTo('POST /api/v2/auth/login')).toHaveLength(2);
  });

  it('qBittorrent 4.x : repli sur torrents/resume quand start répond 404', async () => {
    const current = await open();
    const qbit = current.upstream.qbittorrent;
    qbitBasics(qbit);
    qbit.on('POST /api/v2/torrents/resume', { text: '' });
    const response = await current.browser.post('/api/qbittorrent/bulk/resume', {
      hashes: ['all'],
    });
    expect(response.statusCode).toBe(200);
    expect(qbit.callsTo('POST /api/v2/torrents/resume')[0]?.body).toEqual({ hashes: 'all' });
  });

  it('sans identifiants (proxy) : aucune connexion', async () => {
    const current = await open({ configure: { qbittorrent: { user: '', password: '' } } });
    qbitBasics(current.upstream.qbittorrent);
    expect((await current.browser.get('/api/qbittorrent/torrents')).statusCode).toBe(200);
    expect(current.upstream.qbittorrent.callsTo('POST /api/v2/auth/login')).toHaveLength(0);
  });

  it('actions avancées, catégorie, limites, priorités, renommage', async () => {
    const current = await open();
    const qbit = current.upstream.qbittorrent;
    qbitBasics(qbit);
    for (const path of [
      'setForceStart',
      'setCategory',
      'filePrio',
      'rename',
      'setDownloadLimit',
      'toggleSequentialDownload',
    ]) {
      qbit.on(`POST /api/v2/torrents/${path}`, { text: '' });
    }
    const b = current.browser;
    expect(
      (await b.post(`/api/qbittorrent/torrent/${H}/force-start`, { value: false })).statusCode,
    ).toBe(200);
    expect(qbit.callsTo('POST /api/v2/torrents/setForceStart')[0]?.body).toEqual({
      hashes: H,
      value: 'false',
    });
    expect(
      (await b.post('/api/qbittorrent/bulk/category', { hashes: [H, 'nope'], category: 'tv' }))
        .statusCode,
    ).toBe(200);
    expect(qbit.callsTo('POST /api/v2/torrents/setCategory')[0]?.body).toEqual({
      hashes: H,
      category: 'tv',
    });
    expect(
      (
        await b.post(`/api/qbittorrent/torrent/${H}/files/priority`, {
          fileIds: [0, 2],
          priority: 6,
        })
      ).statusCode,
    ).toBe(200);
    expect(qbit.callsTo('POST /api/v2/torrents/filePrio')[0]?.body).toEqual({
      hash: H,
      id: '0|2',
      priority: '6',
    });
    expect(
      (await b.post(`/api/qbittorrent/torrent/${H}/files/priority`, { fileIds: [0], priority: 3 }))
        .statusCode,
    ).toBe(400);
    const empty = await b.post(`/api/qbittorrent/torrent/${H}/rename`, { name: '  ' });
    expect(empty.json()).toMatchObject({
      code: 'VALIDATION',
      message: 'qbittorrent.api.empty_name',
    });
    expect((await b.post(`/api/qbittorrent/torrent/${H}/limit`, { dl: 2048 })).statusCode).toBe(
      200,
    );
    expect(qbit.callsTo('POST /api/v2/torrents/setDownloadLimit')[0]?.body).toEqual({
      hashes: H,
      limit: '2048',
    });
    expect((await b.post(`/api/qbittorrent/torrent/${H}/sequential`)).statusCode).toBe(200);
    const none = await b.post('/api/qbittorrent/bulk/pause', { hashes: ['nope'] });
    expect(none.json()).toMatchObject({
      code: 'VALIDATION',
      message: 'qbittorrent.api.no_valid_hash',
    });
  });

  it('refus du client (« Fails. ») → 502 avec son message', async () => {
    const current = await open();
    qbitBasics(current.upstream.qbittorrent);
    current.upstream.qbittorrent.on('POST /api/v2/torrents/add', { text: 'Fails.' });
    const response = await current.browser.post('/api/qbittorrent/add', {
      urls: 'magnet:?xt=urn:btih:x',
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'UPSTREAM_ERROR', message: 'Fails.' });
  });

  it('ajout : garde SSRF, fichiers contrôlés et envoyés en multipart', async () => {
    const current = await open();
    const qbit = current.upstream.qbittorrent;
    qbitBasics(qbit);
    qbit.on('POST /api/v2/torrents/add', { text: 'Ok.' });
    const b = current.browser;
    expect(
      (await b.post('/api/qbittorrent/add', { urls: 'http://169.254.169.254/x' })).json(),
    ).toMatchObject({
      message: 'qbittorrent.upload.forbidden_host',
    });
    expect((await b.post('/api/qbittorrent/add', { urls: 'ftp://x/y' })).json()).toMatchObject({
      message: 'qbittorrent.upload.invalid_url',
    });
    expect(
      (
        await b.post('/api/qbittorrent/add', {
          urls: 'magnet:?a',
          category: 'movies',
          paused: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(qbit.callsTo('POST /api/v2/torrents/add')[0]?.body).toMatchObject({
      urls: 'magnet:?a',
      category: 'movies',
      paused: 'true',
    });
    const bad = await b.post('/api/qbittorrent/add-file', {
      files: [{ name: 'a.torrent', content: Buffer.from('nope').toString('base64') }],
    });
    expect(bad.json()).toMatchObject({ message: 'qbittorrent.upload.invalid_format' });
    const good = await b.post('/api/qbittorrent/add-file', {
      files: [
        { name: 'a.torrent', content: Buffer.from('d4:infod4:name1:aee').toString('base64') },
      ],
    });
    expect(good.json()).toEqual({ ok: true, count: 1 });
    const upload = qbit.callsTo('POST /api/v2/torrents/add').at(-1);
    expect(upload?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(upload?.raw).toContain('filename="a.torrent"');
  });

  it('fiche : propriétés, fichiers, trackers (DHT écarté), pairs ; inconnu → 404', async () => {
    const current = await open();
    const qbit = current.upstream.qbittorrent;
    qbitBasics(qbit);
    qbit.on('GET /api/v2/torrents/properties', (call) =>
      call.query.get('hash') === H
        ? {
            body: {
              save_path: '/dl',
              total_size: 10,
              share_ratio: 0.5,
              eta: 8640000,
              completion_date: -1,
            },
          }
        : { status: 404, text: 'Not found' },
    );
    qbit.on('GET /api/v2/torrents/files', {
      body: [{ index: 0, name: 'a/b.mkv', size: 10, progress: 0.5, priority: 1 }],
    });
    qbit.on('GET /api/v2/torrents/trackers', {
      body: [
        { url: '** [DHT] **', status: 2 },
        { url: 'udp://t', status: 4, num_seeds: 3, num_leeches: -1, msg: 'boom' },
      ],
    });
    qbit.on('GET /api/v2/sync/torrentPeers', {
      body: {
        peers: { '1.2.3.4:5': { ip: '1.2.3.4', port: 5, progress: 0.25, country_code: 'fr' } },
      },
    });
    const detail = (
      await current.browser.get(`/api/qbittorrent/torrent/${H}`)
    ).json<TorrentDetail>();
    expect(detail.properties).toMatchObject({
      savePath: '/dl',
      eta: null,
      completedOn: null,
      name: 'Dune.2021.1080p',
    });
    expect(detail.files[0]).toMatchObject({ index: 0, name: 'a/b.mkv', progress: 0.5 });
    expect(detail.trackers).toEqual([
      { url: 'udp://t', status: 'error', seeds: 3, leechs: null, message: 'boom' },
    ]);
    expect(detail.peers[0]).toMatchObject({
      ip: '1.2.3.4',
      port: 5,
      progress: 25,
      countryCode: 'fr',
    });
    expect((await current.browser.get(`/api/qbittorrent/torrent/${H2}`)).statusCode).toBe(404);
  });

  it('VPN : Gluetun et synchronisation du port ; sans Gluetun, carte vide', async () => {
    let current = await open();
    qbitBasics(current.upstream.qbittorrent);
    current.upstream.qbittorrent.on('GET /api/v2/app/preferences', {
      body: { listen_port: 51413 },
    });
    let vpn = (await current.browser.get('/api/qbittorrent/vpn')).json<TorrentVpn>();
    expect(vpn).toMatchObject({
      ok: false,
      forwardedPort: null,
      clientPort: 51413,
      portSync: null,
    });
    await current.close();
    current = await open({
      configure: { qbittorrent: { user: '', password: '' }, gluetun: { apiKey: 'g' } },
    });
    const g = current.upstream.gluetun;
    current.upstream.qbittorrent.on('GET /api/v2/app/preferences', {
      body: { listen_port: 51413 },
    });
    g.on('GET /v1/publicip/ip', {
      body: { public_ip: '9.9.9.9', country: 'NL', organization: 'VPN Co' },
    });
    g.on('GET /v1/vpn/status', { body: { status: 'running' } });
    g.on('GET /v1/portforward', { body: { port: 51414 } });
    vpn = (await current.browser.get('/api/qbittorrent/vpn')).json<TorrentVpn>();
    expect(vpn).toMatchObject({
      ok: true,
      publicIp: '9.9.9.9',
      status: 'running',
      forwardedPort: 51414,
      portSync: false,
    });
    expect(g.callsTo('GET /v1/publicip/ip')[0]?.headers['x-api-key']).toBe('g');
  });

  it('résolution vers la fiche Radarr', async () => {
    const current = await open();
    qbitBasics(current.upstream.qbittorrent);
    await createInstance(
      current.database.db,
      'radarr',
      { name: 'Films', url: 'http://radarr.test', apiKey: 'k' },
      noDns,
    );
    current.agent
      .get('http://radarr.test')
      .intercept({ path: (p) => p.startsWith('/api/v3/movie'), method: 'GET' })
      .reply(200, [{ id: 7, title: 'Dune', year: 2021, alternateTitles: [] }])
      .persist();
    const r = (
      await current.browser.get(`/api/qbittorrent/resolve/radarr/${H}`)
    ).json<TorrentResolve>();
    expect(r).toMatchObject({ found: true, id: 7, url: '/medias/films/films/7' });
    expect((await current.browser.get(`/api/qbittorrent/resolve/lidarr/${H}`)).statusCode).toBe(
      404,
    );
    expect(
      (await current.browser.get(`/api/qbittorrent/resolve/radarr/${'c'.repeat(40)}`)).statusCode,
    ).toBe(404);
  });

  it('résumé du sondage', async () => {
    const current = await open();
    qbitBasics(current.upstream.qbittorrent);
    expect((await current.browser.get('/api/qbittorrent/poll-summary')).json()).toEqual({
      active: 1,
      items: [{ hash: H, state: 'downloading', name: 'Dune.2021.1080p', size: 0 }],
    });
  });
});

describe('Transmission', () => {
  function setup(tr: FakeUpstream) {
    tr.on('POST /transmission/rpc', (call) => {
      if (call.headers['x-transmission-session-id'] !== 'tok') {
        return { status: 409, text: '', headers: { 'x-transmission-session-id': 'tok' } };
      }
      const method = (call.body as { method: string }).method;
      if (method === 'torrent-get')
        return {
          body: {
            result: 'success',
            arguments: {
              torrents: [
                {
                  hashString: H,
                  name: 'A',
                  status: 4,
                  percentDone: 0.5,
                  addedDate: 1,
                  labels: ['tv'],
                },
                { hashString: H2, name: 'B', status: 6, percentDone: 1, addedDate: 2 },
              ],
            },
          },
        };
      if (method === 'session-stats')
        return {
          body: {
            result: 'success',
            arguments: { downloadSpeed: 7, 'cumulative-stats': { downloadedBytes: 70 } },
          },
        };
      if (method === 'session-get')
        return {
          body: {
            result: 'success',
            arguments: {
              'download-dir': '/dl',
              'speed-limit-down-enabled': true,
              'speed-limit-down': 100,
            },
          },
        };
      if (method === 'free-space')
        return { body: { result: 'success', arguments: { 'size-bytes': 1234 } } };
      if (method === 'torrent-set-location') return { body: { result: 'no such torrent' } };
      return { body: { result: 'success', arguments: {} } };
    });
  }

  it('jeton de session (409 → rejeu), Basic, liste et labels', async () => {
    const current = await open();
    setup(current.upstream.transmission);
    const list = (
      await current.browser.get('/api/transmission/torrents?sort=name&desc=0')
    ).json<TorrentListResponse>();
    expect(list.torrents.map((t) => t.name)).toEqual(['A', 'B']);
    expect(list.stats).toMatchObject({
      dlSpeed: 7,
      dlAllTime: 70,
      freeSpace: 1234,
      completed: 1,
      dlLimit: 102_400,
    });
    expect(list.categories).toEqual(['tv']);
    const calls = current.upstream.transmission.calls;
    expect(calls[0]?.headers.authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(calls[1]?.headers['x-transmission-session-id']).toBe('tok');
  });

  it('tout reprendre, déplacement refusé (502), emplacement vide (400), limites en Kio/s', async () => {
    const current = await open();
    setup(current.upstream.transmission);
    const b = current.browser;
    expect((await b.post('/api/transmission/resume-all')).statusCode).toBe(200);
    const moved = await b.post(`/api/transmission/torrent/${H}/location`, { location: '/new' });
    expect(moved.statusCode).toBe(502);
    expect(moved.json()).toMatchObject({ message: 'no such torrent' });
    expect(
      (await b.post(`/api/transmission/torrent/${H}/location`, { location: ' ' })).json(),
    ).toMatchObject({
      message: 'transmission.api.empty_location',
    });
    expect((await b.post('/api/transmission/global-limit', { up: 2048 })).statusCode).toBe(200);
    const set = current.upstream.transmission.callsTo('POST /transmission/rpc#session-set').at(-1);
    expect(set?.body).toMatchObject({
      arguments: { 'speed-limit-up': 2, 'speed-limit-up-enabled': true },
    });
    expect((await b.post('/api/transmission/bulk/pause', { hashes: ['all'] })).statusCode).toBe(
      400,
    );
  });
});

describe('Deluge', () => {
  function setup(deluge: FakeUpstream, options: { connected?: boolean } = {}) {
    let connected = options.connected ?? true;
    let logins = 0;
    deluge.on('POST /json#auth.login', () => {
      logins += 1;
      return {
        body: { result: true, error: null, id: 1 },
        headers: { 'set-cookie': `_session_id=s${logins}; Path=/json` },
      };
    });
    deluge.on('POST /json#web.connected', { body: { result: connected, error: null } });
    deluge.on('POST /json#web.get_hosts', {
      body: { result: [['host1', '127.0.0.1', 58846, 'Online']], error: null },
    });
    deluge.on('POST /json#web.connect', () => {
      connected = true;
      deluge.on('POST /json#web.connected', { body: { result: true, error: null } });
      return { body: { result: null, error: null } };
    });
    deluge.on('POST /json#core.get_torrents_status', () => ({
      body: {
        result: {
          [H]: { name: 'X', state: 'Downloading', progress: 12.34, time_added: 1, label: 'movies' },
        },
        error: null,
      },
    }));
    deluge.on('POST /json#core.get_session_status', {
      body: { result: { payload_download_rate: 3 }, error: null },
    });
    deluge.on('POST /json#core.get_free_space', { body: { result: 42, error: null } });
    deluge.on('POST /json#label.get_labels', { body: { result: ['movies', 'tv'], error: null } });
    return () => logins;
  }

  it('connexion, démon relié (web.connect), labels', async () => {
    const current = await open();
    setup(current.upstream.deluge, { connected: false });
    const list = (await current.browser.get('/api/deluge/torrents')).json<TorrentListResponse>();
    expect(list.torrents[0]).toMatchObject({ hash: H, progress: 12.3, category: 'movies' });
    expect(list.stats).toMatchObject({ dlSpeed: 3, freeSpace: 42 });
    expect(list.categories).toEqual(['movies', 'tv']);
    expect(current.upstream.deluge.callsTo('POST /json#web.connect')[0]?.body).toMatchObject({
      params: ['host1'],
    });
    expect(
      current.upstream.deluge.callsTo('POST /json#core.get_torrents_status')[0]?.headers.cookie,
    ).toBe('_session_id=s1');
  });

  it('erreur RPC de code 1 : relogin et un seul rejeu', async () => {
    const current = await open();
    const deluge = current.upstream.deluge;
    const logins = setup(deluge);
    let first = true;
    deluge.on('POST /json#core.pause_torrent', () => {
      if (first) {
        first = false;
        return { body: { result: null, error: { code: 1, message: 'Not authenticated' } } };
      }
      return { body: { result: null, error: null } };
    });
    expect((await current.browser.post(`/api/deluge/torrent/${H}/pause`)).statusCode).toBe(200);
    expect(logins()).toBe(2);
  });

  it('ajout : magnets puis liens, options de Deluge', async () => {
    const current = await open();
    const deluge = current.upstream.deluge;
    setup(deluge);
    deluge.on('POST /json#core.add_torrent_magnet', { body: { result: 'h', error: null } });
    deluge.on('POST /json#core.add_torrent_url', { body: { result: 'h', error: null } });
    const response = await current.browser.post('/api/deluge/add', {
      urls: 'http://x/a.torrent\nmagnet:?m',
      savepath: '/dl',
      paused: true,
      category: 'ignored',
    });
    expect(response.statusCode).toBe(200);
    expect(deluge.callsTo('POST /json#core.add_torrent_magnet')[0]?.body).toMatchObject({
      params: ['magnet:?m', { download_location: '/dl', add_paused: true }],
    });
    expect(deluge.callsTo('POST /json#core.add_torrent_url')).toHaveLength(1);
  });
});
