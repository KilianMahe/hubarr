// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux Seerr (P3f.4) monté sous `/seerr` (`/api/v1/…`, en-tête `X-Api-Key`) :
// demandes (approuver, refuser, relancer, supprimer, modifier), fiches TMDB,
// utilisateurs (création, permissions, suppression), réglages (clés en clair
// pour vérifier le masquage de Hubarr), serveurs Radarr/Sonarr, règles,
// tâches, cache, journaux. État en mémoire, réinitialisé par `POST /__reset`.

import type { FastifyPluginAsync } from 'fastify';

export const SEERR_API_KEY = 'e2e-seerr-key';

type Row = Record<string, unknown>;

function initialState() {
  return {
    requests: [
      {
        id: 1,
        status: 1,
        type: 'movie',
        media: { tmdbId: 501, status: 2, mediaType: 'movie' },
        requestedBy: { id: 2, displayName: 'bob' },
        createdAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 2,
        status: 2,
        type: 'tv',
        media: { tmdbId: 601, status: 5, mediaType: 'tv' },
        requestedBy: { id: 3, displayName: 'carol' },
        seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }],
        createdAt: '2026-11-19T10:00:00.000Z',
      },
      {
        id: 3,
        status: 1,
        type: 'movie',
        media: { tmdbId: 502, status: 2, mediaType: 'movie' },
        requestedBy: { id: 2, displayName: 'bob' },
        createdAt: '2026-11-18T10:00:00.000Z',
      },
    ] as Row[],
    users: [
      {
        id: 1,
        displayName: 'owner',
        email: 'owner@seerr.test',
        permissions: 2,
        requestCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        displayName: 'bob',
        email: 'bob@seerr.test',
        permissions: 32,
        requestCount: 2,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 3,
        displayName: 'carol',
        email: 'carol@seerr.test',
        permissions: 32,
        requestCount: 1,
        createdAt: '2026-03-01T00:00:00.000Z',
        jellyfinUserId: 'jf-carol',
      },
    ] as Row[],
    main: {
      applicationTitle: 'Seerr E2E',
      applicationUrl: 'https://seerr.e2e.test',
      apiKey: 'seerr-secret-api-key',
      localLogin: true,
      mediaServerLogin: true,
      defaultPermissions: 32,
      defaultQuotas: {
        movie: { quotaLimit: 0, quotaDays: 7 },
        tv: { quotaLimit: 0, quotaDays: 7 },
      },
    } as Row,
    radarr: [
      {
        id: 0,
        name: 'Radarr E2E',
        hostname: 'radarr',
        port: 7878,
        apiKey: 'radarr-secret-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeDirectory: '/films',
        is4k: false,
        isDefault: true,
      },
    ] as Row[],
    jobs: [
      {
        id: 'jellyfin-recently-added-scan',
        name: 'Analyse des ajouts récents',
        type: 'process',
        cronSchedule: '0 */5 * * * *',
        nextExecutionTime: '2026-11-22T12:05:00.000Z',
        running: false,
      },
      {
        id: 'jellyfin-full-scan',
        name: 'Analyse complète',
        type: 'process',
        cronSchedule: '0 0 3 * * *',
        nextExecutionTime: '2026-11-23T03:00:00.000Z',
        running: false,
      },
    ] as Row[],
    nextUser: 10,
  };
}

const TMDB: Record<string, Row> = {
  'movie/501': {
    title: 'Orbite Basse',
    overview: 'Un signal en orbite.',
    posterPath: null,
    releaseDate: '2019-05-01',
    genres: [{ id: 878, name: 'Science-fiction' }],
  },
  'movie/502': {
    title: 'Le Phare des Brumes',
    overview: 'Un phare isolé.',
    posterPath: null,
    releaseDate: '2018-10-01',
    genres: [],
  },
  'tv/601': {
    name: 'Les Veilleurs',
    overview: 'Une garde de nuit.',
    posterPath: null,
    firstAirDate: '2021-01-01',
    genres: [],
  },
};

export const seerrMock: FastifyPluginAsync = async (app) => {
  let state = initialState();
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== SEERR_API_KEY)
      await reply.code(401).send({ message: 'Unauthorized' });
  });
  app.post('/__reset', async () => {
    state = initialState();
    return { ok: true };
  });

  app.get('/api/v1/settings/about', async () => ({
    version: '2.7.3',
    totalRequests: state.requests.length,
    totalMediaItems: 42,
    tz: 'Europe/Paris',
    appDataPath: '/app/config',
  }));
  app.get('/api/v1/status', async () => ({
    version: '2.7.3',
    commitTag: 'v2.7.3',
    updateAvailable: false,
  }));
  app.get<{ Querystring: { take?: string; skip?: string; filter?: string } }>(
    '/api/v1/request',
    async (request) => {
      const take = Number(request.query.take ?? 20);
      const skip = Number(request.query.skip ?? 0);
      const filter = request.query.filter;
      const list = state.requests.filter(
        (r) =>
          filter === undefined ||
          (filter === 'pending' ? r.status === 1 : filter === 'approved' ? r.status === 2 : true),
      );
      return {
        pageInfo: {
          pages: Math.max(1, Math.ceil(list.length / take)),
          results: list.length,
          page: Math.floor(skip / take) + 1,
        },
        results: list.slice(skip, skip + take),
      };
    },
  );
  app.get('/api/v1/request/count', async () => ({
    total: state.requests.length,
    pending: state.requests.filter((r) => r.status === 1).length,
    approved: state.requests.filter((r) => r.status === 2).length,
    declined: state.requests.filter((r) => r.status === 3).length,
    processing: 0,
    available: 1,
  }));
  app.get<{ Params: { id: string } }>('/api/v1/request/:id', async (request, reply) => {
    const found = state.requests.find((r) => r.id === Number(request.params.id));
    return found ?? reply.code(404).send({ message: 'Request not found' });
  });
  for (const [action, status] of [
    ['approve', 2],
    ['decline', 3],
    ['retry', 2],
  ] as const) {
    app.post<{ Params: { id: string } }>(`/api/v1/request/:id/${action}`, async (request) => {
      const found = state.requests.find((r) => r.id === Number(request.params.id));
      if (found) found.status = status;
      return found ?? {};
    });
  }
  app.put<{ Params: { id: string }; Body: Row }>('/api/v1/request/:id', async (request) => {
    const found = state.requests.find((r) => r.id === Number(request.params.id));
    if (found) Object.assign(found, request.body);
    return found ?? {};
  });
  app.delete<{ Params: { id: string } }>('/api/v1/request/:id', async (request, reply) => {
    state.requests = state.requests.filter((r) => r.id !== Number(request.params.id));
    return reply.code(204).send();
  });
  for (const type of ['movie', 'tv']) {
    app.get<{ Params: { id: string } }>(
      `/api/v1/${type}/:id`,
      async (request, reply) =>
        TMDB[`${type}/${request.params.id}`] ?? reply.code(404).send({ message: 'not found' }),
    );
  }

  app.get('/api/v1/user', async () => ({
    pageInfo: { pages: 1, results: state.users.length, page: 1 },
    results: state.users,
  }));
  app.post<{ Body: { email?: string } }>('/api/v1/user', async (request) => {
    const user = {
      id: state.nextUser++,
      displayName: request.body.email?.split('@')[0] ?? 'new',
      email: request.body.email,
      permissions: 32,
      requestCount: 0,
      createdAt: '2026-11-22T00:00:00.000Z',
    };
    state.users.push(user);
    return user;
  });
  app.get<{ Params: { id: string } }>(
    '/api/v1/user/:id',
    async (request, reply) =>
      state.users.find((u) => u.id === Number(request.params.id)) ??
      reply.code(404).send({ message: 'User not found' }),
  );
  app.delete<{ Params: { id: string } }>('/api/v1/user/:id', async (request, reply) => {
    state.users = state.users.filter((u) => u.id !== Number(request.params.id));
    return reply.code(204).send();
  });
  app.get('/api/v1/user/:id/quota', async () => ({
    movie: { limit: 0, days: 7, used: 0 },
    tv: { limit: 0, days: 7, used: 0 },
  }));
  app.get<{ Params: { id: string } }>('/api/v1/user/:id/requests', async (request) => ({
    results: state.requests.filter((r) => (r.requestedBy as Row).id === Number(request.params.id)),
  }));
  app.get<{ Params: { id: string } }>('/api/v1/user/:id/settings/main', async (request) => {
    const user = state.users.find((u) => u.id === Number(request.params.id));
    return { username: user?.displayName ?? '', email: user?.email ?? '', locale: 'fr' };
  });
  app.get('/api/v1/user/:id/settings/notifications', async () => ({
    discordId: '',
    telegramChatId: '',
    telegramSendSilently: false,
  }));
  app.post<{ Params: { id: string }; Body: { permissions?: number } }>(
    '/api/v1/user/:id/settings/permissions',
    async (request) => {
      const user = state.users.find((u) => u.id === Number(request.params.id));
      if (user && typeof request.body.permissions === 'number')
        user.permissions = request.body.permissions;
      return { permissions: user?.permissions ?? 0 };
    },
  );
  for (const path of ['main', 'notifications', 'password']) {
    app.post(`/api/v1/user/:id/settings/${path}`, async () => ({}));
  }
  app.get('/api/v1/settings/jellyfin/users', async () => [
    { id: 'jf-carol', username: 'carol' },
    { id: 'jf-dave', username: 'dave' },
  ]);
  app.post<{ Body: { jellyfinUserIds?: string[] } }>(
    '/api/v1/user/import-from-jellyfin',
    async (request) => {
      for (const id of request.body.jellyfinUserIds ?? []) {
        state.users.push({
          id: state.nextUser++,
          displayName: id.replace(/^jf-/, ''),
          email: '',
          permissions: 32,
          jellyfinUserId: id,
          requestCount: 0,
        });
      }
      return [];
    },
  );

  app.get('/api/v1/settings/main', async () => state.main);
  app.post<{ Body: Row }>('/api/v1/settings/main', async (request) => {
    Object.assign(state.main, request.body);
    return state.main;
  });
  app.get('/api/v1/settings/jellyfin', async () => ({
    name: 'Jellyfin E2E',
    ip: 'jellyfin',
    port: 8096,
    useSsl: false,
    urlBase: '',
    apiKey: 'jellyfin-secret-key',
    serverId: 'abc123',
    libraries: [{ id: 'l1', name: 'Films', type: 'movie', enabled: true }],
  }));
  app.post('/api/v1/settings/jellyfin/sync', async () => ({}));
  app.get('/api/v1/settings/radarr', async () => state.radarr);
  app.get('/api/v1/settings/sonarr', async () => []);
  app.put<{ Params: { id: string }; Body: Row }>(
    '/api/v1/settings/radarr/:id',
    async (request, reply) => {
      if (request.body.apiKey !== 'radarr-secret-key')
        return reply.code(400).send({ message: 'API key mismatch' });
      const server = state.radarr.find((s) => s.id === Number(request.params.id));
      if (server) Object.assign(server, request.body);
      return server ?? {};
    },
  );
  app.post<{ Body: Row }>('/api/v1/settings/radarr/test', async (request, reply) =>
    request.body.apiKey === 'radarr-secret-key'
      ? {
          profiles: [
            { id: 1, name: 'HD-1080p' },
            { id: 2, name: 'Ultra-HD' },
          ],
          rootFolders: [{ id: 1, path: '/films' }],
        }
      : reply.code(400).send({ message: 'Failed to connect to Radarr' }),
  );
  app.get('/api/v1/service/radarr/:id', async () => ({
    profiles: [{ id: 1, name: 'HD-1080p' }],
    rootFolders: [{ id: 1, path: '/films' }],
  }));
  app.get('/api/v1/overrideRule', async () => []);
  app.get('/api/v1/genres/movie', async () => [{ id: 878, name: 'Science-fiction' }]);
  app.get('/api/v1/genres/tv', async () => [{ id: 18, name: 'Drame' }]);
  app.get('/api/v1/languages', async () => [{ iso_639_1: 'fr', english_name: 'French' }]);
  app.get('/api/v1/regions', async () => [{ iso_3166_1: 'FR', english_name: 'France' }]);
  app.get('/api/v1/issue/count', async () => ({ total: 0, open: 0, closed: 0 }));
  app.get('/api/v1/settings/jobs', async () => state.jobs);
  app.post<{ Params: { id: string } }>('/api/v1/settings/jobs/:id/run', async (request) => {
    const job = state.jobs.find((j) => j.id === request.params.id);
    if (job) job.running = true;
    return job ?? {};
  });
  app.post<{ Params: { id: string } }>('/api/v1/settings/jobs/:id/cancel', async (request) => {
    const job = state.jobs.find((j) => j.id === request.params.id);
    if (job) job.running = false;
    return job ?? {};
  });
  app.post<{ Params: { id: string }; Body: { schedule?: string } }>(
    '/api/v1/settings/jobs/:id/schedule',
    async (request) => {
      const job = state.jobs.find((j) => j.id === request.params.id);
      if (job && request.body.schedule) job.cronSchedule = request.body.schedule;
      return job ?? {};
    },
  );
  app.get('/api/v1/settings/cache', async () => ({
    apiCaches: [{ id: 'tmdb', name: 'TMDb API', stats: { hits: 120, misses: 30, keys: 45 } }],
    imageCache: {},
  }));
  app.post('/api/v1/settings/cache/flush', async () => ({}));
  app.post('/api/v1/settings/cache/:id/flush', async () => ({}));
  app.get('/api/v1/settings/logs', async () => ({
    pageInfo: { pages: 1, results: 2, page: 1 },
    results: [
      {
        timestamp: '2026-11-22T10:00:00.000Z',
        level: 'info',
        label: 'Jobs',
        message: 'Analyse terminée',
      },
      {
        timestamp: '2026-11-22T09:00:00.000Z',
        level: 'error',
        label: 'Radarr',
        message: 'Connexion refusée',
      },
    ],
  }));
};
