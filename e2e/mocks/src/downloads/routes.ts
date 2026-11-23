// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux clients de téléchargement (P3d.6) : qBittorrent (`/qbittorrent`),
// Transmission (`/transmission-mock`), Deluge (`/deluge`), SABnzbd (`/sabnzbd`),
// NZBGet (`/nzbget`) et Gluetun (`/gluetun`). Chaque faux parle le protocole
// du vrai (formulaires et cookie `SID`, RPC à jeton de session, JSON-RPC à
// cookie, API à clé, JSON-RPC en Basic) avec des torrents et des NZB
// inventés ; deux noms correspondent aux faux Radarr et Sonarr (« Orbite
// Basse » 2019, « Les Veilleurs ») pour la résolution vers la fiche. État en
// mémoire, réinitialisé par `POST /<service>/__reset`.

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

export const QBIT_CREDENTIALS = { user: 'e2e', password: 'e2e-qbit-pass' };
export const TRANSMISSION_CREDENTIALS = { user: 'e2e', password: 'e2e-tr-pass' };
export const DELUGE_PASSWORD = 'e2e-deluge-pass';
export const SABNZBD_API_KEY = 'e2e-sab-key';
export const NZBGET_CREDENTIALS = { user: 'e2e', password: 'e2e-nzb-pass' };
export const GLUETUN_API_KEY = 'e2e-gluetun-key';

const HASHES = ['a1', 'b2', 'c3', 'd4'].map((p) => p.repeat(20));

interface FakeTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  state: 'downloading' | 'seeding' | 'paused';
  category: string;
  dlspeed: number;
  upspeed: number;
  added: number;
  savePath: string;
}

function torrents(): FakeTorrent[] {
  const base = { savePath: '/downloads', upspeed: 0 };
  return [
    {
      ...base,
      hash: HASHES[0] ?? '',
      name: 'Orbite.Basse.2019.1080p.BluRay.x264-E2E',
      size: 8_000_000_000,
      progress: 0.42,
      state: 'downloading',
      category: 'movies',
      dlspeed: 4_200_000,
      added: 1_763_700_400,
    },
    {
      ...base,
      hash: HASHES[1] ?? '',
      name: 'Les.Veilleurs.S01E02.720p.WEB-E2E',
      size: 1_200_000_000,
      progress: 1,
      state: 'seeding',
      category: 'tv',
      dlspeed: 0,
      upspeed: 120_000,
      added: 1_763_700_300,
    },
    {
      ...base,
      hash: HASHES[2] ?? '',
      name: 'Distribution.Libre.ISO',
      size: 4_700_000_000,
      progress: 1,
      state: 'seeding',
      category: '',
      dlspeed: 0,
      added: 1_763_700_200,
    },
    {
      ...base,
      hash: HASHES[3] ?? '',
      name: 'Archive.Brume.Collection',
      size: 20_000_000_000,
      progress: 0.1,
      state: 'paused',
      category: 'movies',
      dlspeed: 0,
      added: 1_763_700_100,
    },
  ];
}

function formParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_r, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );
  app.addContentTypeParser('multipart/form-data', { parseAs: 'string' }, (_r, body, done) => {
    done(null, { raw: String(body) });
  });
}

function addFromName(list: FakeTorrent[], name: string, hash: string): void {
  list.unshift({
    hash,
    name,
    size: 700_000_000,
    progress: 0,
    state: 'downloading',
    category: '',
    dlspeed: 1_000_000,
    upspeed: 0,
    added: 1_763_700_500,
    savePath: '/downloads',
  });
}

/** Nom affiché d'un magnet (`dn=`), sinon un nom générique. */
function magnetName(link: string): string {
  const match = /[?&]dn=([^&]+)/.exec(link);
  return match?.[1] ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : 'Nouveau.Torrent';
}

const newHash = (n: number) => n.toString(16).padStart(2, '0').repeat(20);

// ── qBittorrent ──────────────────────────────────────────────────────────────

export const qbittorrentMock: FastifyPluginAsync = async (app) => {
  formParser(app);
  let state = torrents();
  let altSpeed = false;
  let counter = 0x10;
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset') || request.url.endsWith('/auth/login')) return;
    if (!(request.headers.cookie ?? '').includes('SID=e2e-sid'))
      await reply.code(403).send('Forbidden');
  });
  app.post('/__reset', async () => {
    state = torrents();
    altSpeed = false;
    return { ok: true };
  });
  app.post<{ Body: Record<string, string> }>('/api/v2/auth/login', async (request, reply) => {
    if (
      request.body.username !== QBIT_CREDENTIALS.user ||
      request.body.password !== QBIT_CREDENTIALS.password
    ) {
      return reply.send('Fails.');
    }
    return reply.header('set-cookie', 'SID=e2e-sid; HttpOnly; path=/').send('Ok.');
  });
  app.get('/api/v2/app/version', async () => 'v5.0.0');
  const raw = (t: FakeTorrent) => ({
    hash: t.hash,
    name: t.name,
    size: t.size,
    total_size: t.size,
    progress: t.progress,
    dlspeed: t.state === 'downloading' ? t.dlspeed : 0,
    upspeed: t.state === 'seeding' ? t.upspeed : 0,
    eta: t.state === 'downloading' ? 1_800 : 8_640_000,
    state:
      t.state === 'downloading' ? 'downloading' : t.state === 'seeding' ? 'uploading' : 'stoppedDL',
    category: t.category,
    tags: t.category === 'movies' ? 'e2e' : '',
    ratio: t.state === 'seeding' ? 1.5 : 0.1,
    num_seeds: 12,
    num_leechs: 3,
    added_on: t.added,
    completion_on: t.progress >= 1 ? t.added + 600 : -1,
    save_path: t.savePath,
    downloaded: Math.round(t.size * t.progress),
    uploaded: 1000,
    dl_limit: -1,
    up_limit: -1,
  });
  app.get('/api/v2/torrents/info', async () => state.map(raw));
  app.get('/api/v2/transfer/info', async () => ({
    dl_info_speed: state
      .filter((t) => t.state === 'downloading')
      .reduce((s, t) => s + t.dlspeed, 0),
    up_info_speed: 120_000,
    dl_info_data: 5_000_000_000,
    up_info_data: 900_000_000,
    connection_status: 'connected',
    dl_rate_limit: 0,
    up_rate_limit: 0,
  }));
  app.get('/api/v2/sync/maindata', async () => ({
    server_state: {
      alltime_dl: 900_000_000_000,
      alltime_ul: 1_200_000_000_000,
      global_ratio: '1.33',
      free_space_on_disk: 2_000_000_000_000,
      use_alt_speed_limits: altSpeed,
    },
  }));
  app.get('/api/v2/torrents/categories', async () => ({
    movies: { savePath: '' },
    tv: { savePath: '' },
  }));
  app.get('/api/v2/torrents/tags', async () => ['e2e']);
  app.get('/api/v2/app/preferences', async () => ({ listen_port: 51413 }));
  app.get<{ Querystring: { hash: string } }>(
    '/api/v2/torrents/properties',
    async (request, reply) => {
      const t = state.find((row) => row.hash === request.query.hash);
      if (!t) return reply.code(404).send('Not Found');
      return {
        name: t.name,
        save_path: t.savePath,
        total_size: t.size,
        piece_size: 4_194_304,
        pieces_num: Math.ceil(t.size / 4_194_304),
        comment: 'E2E',
        total_downloaded: Math.round(t.size * t.progress),
        total_uploaded: 1000,
        share_ratio: 0.5,
        addition_date: t.added,
        completion_date: -1,
        time_elapsed: 600,
        seeding_time: 0,
        eta: 1_800,
        seeds: 12,
        seeds_total: 40,
        peers: 3,
        peers_total: 9,
        dl_speed: t.dlspeed,
        up_speed: 0,
      };
    },
  );
  app.get('/api/v2/torrents/files', async () => [
    { index: 0, name: 'Dossier/film.mkv', size: 7_900_000_000, progress: 0.42, priority: 1 },
    { index: 1, name: 'Dossier/sample.mkv', size: 100_000_000, progress: 1, priority: 0 },
  ]);
  app.get('/api/v2/torrents/trackers', async () => [
    { url: '** [DHT] **', status: 2, num_seeds: 0, num_leeches: 0, msg: '' },
    {
      url: 'udp://tracker.e2e.test:1337/announce',
      status: 2,
      num_seeds: 40,
      num_leeches: 9,
      msg: '',
    },
  ]);
  app.get('/api/v2/sync/torrentPeers', async () => ({
    peers: {
      '10.0.0.2:6881': {
        ip: '10.0.0.2',
        port: 6881,
        client: 'qBittorrent/5.0',
        country_code: 'fr',
        progress: 0.8,
        dl_speed: 100_000,
        up_speed: 0,
      },
    },
  }));
  const hashesOf = (body: Record<string, string>) => {
    const value = body.hashes ?? body.hash ?? '';
    return value === 'all' ? state.map((t) => t.hash) : value.split('|');
  };
  const set = (body: Record<string, string>, change: (t: FakeTorrent) => void) => {
    for (const t of state.filter((row) => hashesOf(body).includes(row.hash))) change(t);
  };
  type Post = FastifyRequest<{ Body: Record<string, string> }>;
  const ok = (reply: FastifyReply) => reply.send('');
  app.post('/api/v2/torrents/stop', async (request: Post, reply) => {
    set(request.body, (t) => (t.state = 'paused'));
    return ok(reply);
  });
  app.post('/api/v2/torrents/start', async (request: Post, reply) => {
    set(request.body, (t) => (t.state = t.progress >= 1 ? 'seeding' : 'downloading'));
    return ok(reply);
  });
  app.post('/api/v2/torrents/delete', async (request: Post, reply) => {
    const hashes = hashesOf(request.body);
    state = state.filter((t) => !hashes.includes(t.hash));
    return ok(reply);
  });
  app.post('/api/v2/torrents/setCategory', async (request: Post, reply) => {
    set(request.body, (t) => (t.category = request.body.category ?? ''));
    return ok(reply);
  });
  app.post('/api/v2/torrents/rename', async (request: Post, reply) => {
    set(request.body, (t) => (t.name = request.body.name ?? t.name));
    return ok(reply);
  });
  for (const path of [
    'recheck',
    'reannounce',
    'setForceStart',
    'toggleSequentialDownload',
    'toggleFirstLastPiecePrio',
    'filePrio',
    'setDownloadLimit',
    'setUploadLimit',
  ]) {
    app.post(`/api/v2/torrents/${path}`, async (_request, reply) => ok(reply));
  }
  for (const path of ['setDownloadLimit', 'setUploadLimit']) {
    app.post(`/api/v2/transfer/${path}`, async (_request, reply) => ok(reply));
  }
  app.post('/api/v2/transfer/toggleSpeedLimitsMode', async (_request, reply) => {
    altSpeed = !altSpeed;
    return ok(reply);
  });
  app.post<{ Body: Record<string, string> }>('/api/v2/torrents/add', async (request, reply) => {
    const body = request.body as Record<string, string> & { raw?: string };
    if (body.raw !== undefined) {
      const file = /filename="([^"]+)"/.exec(body.raw)?.[1] ?? 'upload.torrent';
      addFromName(state, file.replace(/\.torrent$/i, ''), newHash(counter++));
      return reply.send('Ok.');
    }
    for (const link of (body.urls ?? '').split('\n').filter((l) => l.trim() !== '')) {
      addFromName(state, magnetName(link), newHash(counter++));
    }
    return reply.send('Ok.');
  });
};

// ── Transmission ─────────────────────────────────────────────────────────────

const TR_SESSION = 'e2e-transmission-session';

export const transmissionMock: FastifyPluginAsync = async (app) => {
  let state = torrents();
  let counter = 0x30;
  app.post('/__reset', async () => {
    state = torrents();
    return { ok: true };
  });
  const status = (t: FakeTorrent) => (t.state === 'paused' ? 0 : t.state === 'seeding' ? 6 : 4);
  app.post<{ Body: { method: string; arguments?: Record<string, unknown>; tag?: number } }>(
    '/transmission/rpc',
    async (request, reply) => {
      const auth = `Basic ${Buffer.from(`${TRANSMISSION_CREDENTIALS.user}:${TRANSMISSION_CREDENTIALS.password}`).toString('base64')}`;
      if (request.headers.authorization !== auth) return reply.code(401).send('Unauthorized');
      if (request.headers['x-transmission-session-id'] !== TR_SESSION) {
        return reply.code(409).header('x-transmission-session-id', TR_SESSION).send('');
      }
      const args = request.body.arguments ?? {};
      const ids = Array.isArray(args.ids) ? (args.ids as string[]) : state.map((t) => t.hash);
      const success = (result: Record<string, unknown> = {}) => ({
        result: 'success',
        arguments: result,
      });
      switch (request.body.method) {
        case 'session-get':
          return success({
            version: '4.0.6',
            'download-dir': '/downloads',
            'speed-limit-down-enabled': false,
            'speed-limit-up-enabled': false,
          });
        case 'session-stats':
          return success({
            downloadSpeed: 4_200_000,
            uploadSpeed: 120_000,
            'current-stats': { downloadedBytes: 3_000_000_000, uploadedBytes: 400_000_000 },
            'cumulative-stats': {
              downloadedBytes: 700_000_000_000,
              uploadedBytes: 800_000_000_000,
            },
          });
        case 'free-space':
          return success({ 'size-bytes': 1_500_000_000_000 });
        case 'torrent-get': {
          const rows = state
            .filter((t) => ids.includes(t.hash))
            .map((t) => ({
              hashString: t.hash,
              name: t.name,
              status: status(t),
              error: 0,
              totalSize: t.size,
              sizeWhenDone: t.size,
              downloadedEver: Math.round(t.size * t.progress),
              uploadedEver: 1000,
              percentDone: t.progress,
              rateDownload: t.state === 'downloading' ? t.dlspeed : 0,
              rateUpload: t.state === 'seeding' ? t.upspeed : 0,
              eta: t.state === 'downloading' ? 1_800 : -1,
              uploadRatio: 0.4,
              peersSendingToUs: 5,
              peersGettingFromUs: 1,
              addedDate: t.added,
              doneDate: 0,
              downloadDir: t.savePath,
              labels: t.category === '' ? [] : [t.category],
              trackers: [{ announce: 'udp://tracker.e2e.test:1337/announce' }],
              files: [
                {
                  name: `${t.name}/video.mkv`,
                  length: t.size,
                  bytesCompleted: Math.round(t.size * t.progress),
                },
              ],
              fileStats: [{ priority: 0, wanted: true }],
              trackerStats: [
                {
                  announce: 'udp://tracker.e2e.test:1337/announce',
                  announceState: 3,
                  seederCount: 30,
                  leecherCount: 4,
                  lastAnnounceResult: 'Success',
                },
              ],
              peers: [],
            }));
          return success({ torrents: rows });
        }
        case 'torrent-stop':
          for (const t of state.filter((row) => ids.includes(row.hash))) t.state = 'paused';
          return success();
        case 'torrent-start':
          for (const t of state.filter((row) => ids.includes(row.hash)))
            t.state = t.progress >= 1 ? 'seeding' : 'downloading';
          return success();
        case 'torrent-remove':
          state = state.filter((t) => !ids.includes(t.hash));
          return success();
        case 'torrent-set-location':
          for (const t of state.filter((row) => ids.includes(row.hash)))
            t.savePath = String(args.location);
          return success();
        case 'torrent-add': {
          const filename = typeof args.filename === 'string' ? args.filename : '';
          addFromName(
            state,
            filename.startsWith('magnet:') ? magnetName(filename) : 'Fichier.Torrent',
            newHash(counter++),
          );
          return success({ 'torrent-added': {} });
        }
        default:
          return success();
      }
    },
  );
};

// ── Deluge ───────────────────────────────────────────────────────────────────

export const delugeMock: FastifyPluginAsync = async (app) => {
  let state = torrents();
  let counter = 0x50;
  app.post('/__reset', async () => {
    state = torrents();
    return { ok: true };
  });
  const delugeState = (t: FakeTorrent) =>
    t.state === 'paused' ? 'Paused' : t.state === 'seeding' ? 'Seeding' : 'Downloading';
  app.post<{ Body: { method: string; params?: unknown[]; id?: number } }>(
    '/json',
    async (request, reply) => {
      const { method, params = [], id = 1 } = request.body;
      const result = (value: unknown) => ({ result: value, error: null, id });
      if (method === 'auth.login') {
        if (params[0] !== DELUGE_PASSWORD) return result(false);
        return reply.header('set-cookie', '_session_id=e2e-deluge; Path=/json').send(result(true));
      }
      if (!(request.headers.cookie ?? '').includes('_session_id=e2e-deluge')) {
        return { result: null, error: { message: 'Not authenticated', code: 1 }, id };
      }
      const hashes = (value: unknown) =>
        Array.isArray(value) ? (value as string[]) : [String(value)];
      switch (method) {
        case 'web.connected':
          return result(true);
        case 'daemon.get_version':
          return result('2.1.1');
        case 'core.get_torrents_status':
          return result(
            Object.fromEntries(
              state.map((t) => [
                t.hash,
                {
                  name: t.name,
                  state: delugeState(t),
                  progress: t.progress * 100,
                  total_size: t.size,
                  total_wanted: t.size,
                  total_done: Math.round(t.size * t.progress),
                  total_uploaded: 1000,
                  all_time_download: Math.round(t.size * t.progress),
                  download_payload_rate: t.state === 'downloading' ? t.dlspeed : 0,
                  upload_payload_rate: t.state === 'seeding' ? t.upspeed : 0,
                  eta: t.state === 'downloading' ? 1_800 : 0,
                  ratio: 0.3,
                  num_seeds: 7,
                  total_seeds: 20,
                  num_peers: 2,
                  total_peers: 6,
                  time_added: t.added,
                  completed_time: 0,
                  save_path: t.savePath,
                  label: t.category,
                  tracker_host: 'tracker.e2e.test',
                  is_finished: t.progress >= 1,
                  max_download_speed: -1,
                  max_upload_speed: -1,
                },
              ]),
            ),
          );
        case 'core.get_session_status':
          return result({
            payload_download_rate: 4_200_000,
            payload_upload_rate: 120_000,
            total_payload_download: 2_000_000_000,
            total_payload_upload: 300_000_000,
          });
        case 'core.get_free_space':
          return result(1_000_000_000_000);
        case 'label.get_labels':
          return result(['movies', 'tv']);
        case 'core.get_torrent_status': {
          const t = state.find((row) => row.hash === params[0]);
          return result(
            t
              ? {
                  name: t.name,
                  save_path: t.savePath,
                  total_size: t.size,
                  files: [{ index: 0, path: `${t.name}/video.mkv`, size: t.size }],
                  file_progress: [t.progress],
                  file_priorities: [1],
                  trackers: [{ url: 'udp://tracker.e2e.test:1337/announce', tier: 0 }],
                  tracker_status: 'Announce OK',
                  peers: [],
                }
              : {},
          );
        }
        case 'core.pause_torrent':
          for (const t of state.filter((row) => hashes(params[0]).includes(row.hash)))
            t.state = 'paused';
          return result(null);
        case 'core.resume_torrent':
          for (const t of state.filter((row) => hashes(params[0]).includes(row.hash)))
            t.state = t.progress >= 1 ? 'seeding' : 'downloading';
          return result(null);
        case 'core.pause_session':
          for (const t of state) t.state = 'paused';
          return result(null);
        case 'core.resume_session':
          for (const t of state) t.state = t.progress >= 1 ? 'seeding' : 'downloading';
          return result(null);
        case 'core.remove_torrent':
          state = state.filter((t) => t.hash !== params[0]);
          return result(true);
        case 'core.add_torrent_magnet':
          addFromName(state, magnetName(String(params[0])), newHash(counter++));
          return result('ok');
        case 'core.add_torrent_url':
        case 'core.add_torrent_file':
          addFromName(state, 'Fichier.Torrent', newHash(counter++));
          return result('ok');
        default:
          return result(null);
      }
    },
  );
};

// ── SABnzbd et NZBGet ────────────────────────────────────────────────────────

interface FakeJob {
  id: string;
  name: string;
  status: 'Downloading' | 'Queued' | 'Paused';
  mb: number;
  mbleft: number;
  cat: string;
}

function jobs(prefix: string): FakeJob[] {
  return [
    {
      id: `${prefix}1`,
      name: 'Orbite.Basse.2019.1080p.WEB-NZB',
      status: 'Downloading',
      mb: 6000,
      mbleft: 2500,
      cat: 'movies',
    },
    {
      id: `${prefix}2`,
      name: 'Les.Veilleurs.S01E03.1080p-NZB',
      status: 'Queued',
      mb: 1500,
      mbleft: 1500,
      cat: 'tv',
    },
    {
      id: `${prefix}3`,
      name: 'Phare.Des.Brumes.2018.2160p-NZB',
      status: 'Paused',
      mb: 18000,
      mbleft: 18000,
      cat: 'movies',
    },
  ];
}

const HISTORY = Array.from({ length: 64 }, (_, i) => ({
  name: `Historique.Element.${String(i + 1).padStart(2, '0')}`,
  ok: i % 9 !== 4,
  bytes: 1_000_000_000 + i * 10_000_000,
  completed: 1_763_600_000 - i * 3_600,
}));

export const sabnzbdMock: FastifyPluginAsync = async (app) => {
  formParser(app);
  let state = jobs('SABnzbd_nzo_e2e');
  let paused = false;
  let limit = 0;
  let counter = 10;
  app.post('/__reset', async () => {
    state = jobs('SABnzbd_nzo_e2e');
    paused = false;
    limit = 0;
    return { ok: true };
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    const key = new URL(request.url, 'http://x').searchParams.get('apikey');
    if (key !== SABNZBD_API_KEY) await reply.code(403).send('API Key Incorrect');
  });
  app.get<{ Querystring: Record<string, string> }>('/api', async (request) => {
    const q = request.query;
    switch (q.mode) {
      case 'version':
        return { version: '4.4.0' };
      case 'queue':
        if (q.name === 'pause' || q.name === 'resume') {
          const job = state.find((j) => j.id === q.value);
          if (job) job.status = q.name === 'pause' ? 'Paused' : 'Downloading';
          return { status: Boolean(job) };
        }
        if (q.name === 'delete') {
          state = state.filter((j) => j.id !== q.value);
          return { status: true };
        }
        return {
          queue: {
            paused,
            kbpersec: paused ? '0' : '5120',
            speedlimit_abs: String(limit),
            mbleft: String(state.reduce((s, j) => s + j.mbleft, 0)),
            timeleft: '0:12:30',
            diskspace1: '1800',
            slots: state.map((j) => ({
              nzo_id: j.id,
              filename: j.name,
              status: paused && j.status === 'Downloading' ? 'Paused' : j.status,
              mb: String(j.mb),
              mbleft: String(j.mbleft),
              percentage: String(Math.round(((j.mb - j.mbleft) / j.mb) * 100)),
              cat: j.cat,
              timeleft: j.status === 'Downloading' ? '0:08:00' : '0:00:00',
            })),
          },
        };
      case 'get_cats':
        return { categories: ['*', 'movies', 'tv'] };
      case 'history': {
        const start = Number(q.start ?? 0);
        const count = Number(q.limit ?? 20);
        return {
          history: {
            noofslots: HISTORY.length,
            slots: HISTORY.slice(start, start + count).map((h, i) => ({
              nzo_id: `SABnzbd_nzo_hist${start + i}`,
              name: h.name,
              status: h.ok ? 'Completed' : 'Failed',
              bytes: h.bytes,
              category: 'movies',
              fail_message: h.ok ? '' : 'Repair failed, not enough repair blocks',
              completed: h.completed,
            })),
          },
        };
      }
      case 'pause':
        paused = true;
        return { status: true };
      case 'resume':
        paused = false;
        return { status: true };
      case 'config':
        limit = q.value?.endsWith('K') ? Number(q.value.slice(0, -1)) * 1024 : 0;
        return { status: true };
      case 'addurl':
        state.push({
          id: `SABnzbd_nzo_e2e${counter++}`,
          name: (q.name ?? '').split('/').pop() ?? 'nzb',
          status: 'Queued',
          mb: 900,
          mbleft: 900,
          cat: q.cat ?? '',
        });
        return { status: true, nzo_ids: [] };
      default:
        return { status: false, error: 'unknown mode' };
    }
  });
  app.post<{ Querystring: Record<string, string> }>('/api', async (request) => {
    const raw = (request.body as { raw?: string } | undefined)?.raw ?? '';
    const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? 'upload.nzb';
    state.push({
      id: `SABnzbd_nzo_e2e${counter++}`,
      name: name.replace(/\.nzb$/i, ''),
      status: 'Queued',
      mb: 900,
      mbleft: 900,
      cat: request.query.cat ?? '',
    });
    return { status: true, nzo_ids: [] };
  });
};

export const nzbgetMock: FastifyPluginAsync = async (app) => {
  let state = jobs('');
  let paused = false;
  let counter = 10;
  app.post('/__reset', async () => {
    state = jobs('');
    paused = false;
    return { ok: true };
  });
  app.post<{ Body: { method: string; params?: unknown[] } }>('/jsonrpc', async (request, reply) => {
    const auth = `Basic ${Buffer.from(`${NZBGET_CREDENTIALS.user}:${NZBGET_CREDENTIALS.password}`).toString('base64')}`;
    if (request.headers.authorization !== auth) return reply.code(401).send('Unauthorized');
    const { method, params = [] } = request.body;
    const result = (value: unknown) => ({ version: '1.1', result: value });
    const mb = (value: number) => ({
      Lo: (value * 1024 * 1024) % 4_294_967_296,
      Hi: Math.floor((value * 1024 * 1024) / 4_294_967_296),
    });
    switch (method) {
      case 'version':
        return result('24.3');
      case 'listgroups':
        return result(
          state.map((j) => ({
            NZBID: Number(j.id),
            NZBName: j.name,
            Status: paused && j.status === 'Downloading' ? 'PAUSED' : j.status.toUpperCase(),
            FileSizeLo: mb(j.mb).Lo,
            FileSizeHi: mb(j.mb).Hi,
            RemainingSizeLo: mb(j.mbleft).Lo,
            RemainingSizeHi: mb(j.mbleft).Hi,
            Category: j.cat,
            DownloadRate: j.status === 'Downloading' && !paused ? 5_000_000 : 0,
          })),
        );
      case 'status':
        return result({
          DownloadRate: paused ? 0 : 5_000_000,
          RemainingSizeLo: 1_000_000_000,
          RemainingSizeHi: 0,
          DownloadLimit: 0,
          DownloadPaused: paused,
          FreeDiskSpaceLo: 0,
          FreeDiskSpaceHi: 400,
        });
      case 'config':
        return result([
          { Name: 'Category1.Name', Value: 'movies' },
          { Name: 'Category2.Name', Value: 'tv' },
        ]);
      case 'history':
        return result(
          HISTORY.map((h, i) => ({
            NZBID: 1000 + i,
            Name: h.name,
            Status: h.ok ? 'SUCCESS/ALL' : 'FAILURE/PAR',
            FileSizeLo: h.bytes % 4_294_967_296,
            FileSizeHi: Math.floor(h.bytes / 4_294_967_296),
            Category: 'tv',
            HistoryTime: h.completed,
          })),
        );
      case 'pausedownload':
        paused = true;
        return result(true);
      case 'resumedownload':
        paused = false;
        return result(true);
      case 'rate':
        return result(true);
      case 'editqueue': {
        const [command, , , ids] = params as [string, number, string, number[]];
        const targets = state.filter((j) => ids.includes(Number(j.id)));
        if (command === 'GroupPause') for (const j of targets) j.status = 'Paused';
        else if (command === 'GroupResume') for (const j of targets) j.status = 'Downloading';
        else state = state.filter((j) => !ids.includes(Number(j.id)));
        return result(targets.length > 0);
      }
      case 'append': {
        const [filename, content, category] = params as [string, string, string];
        const name = filename !== '' ? filename : (content.split('/').pop() ?? 'nzb');
        state.push({
          id: String(counter++),
          name: name.replace(/\.nzb$/i, ''),
          status: 'Queued',
          mb: 900,
          mbleft: 900,
          cat: category,
        });
        return result(counter);
      }
      default:
        return {
          version: '1.1',
          error: { name: 'JsonRpcError', code: 1, message: 'Invalid method' },
        };
    }
  });
};

// ── Gluetun ──────────────────────────────────────────────────────────────────

export const gluetunMock: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== GLUETUN_API_KEY)
      await reply.code(401).send('Unauthorized');
  });
  app.post('/__reset', async () => ({ ok: true }));
  app.get('/v1/publicip/ip', async () => ({
    public_ip: '203.0.113.7',
    region: 'Noord-Holland',
    country: 'Netherlands',
    city: 'Amsterdam',
    organization: 'VPN E2E',
    timezone: 'Europe/Amsterdam',
  }));
  app.get('/v1/vpn/status', async () => ({ status: 'running' }));
  app.get('/v1/portforward', async () => ({ port: 51413 }));
};
