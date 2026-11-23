// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux Prowlarr (API v1) monté sous `/prowlarr` : de quoi parcourir les pages
// de P3c (indexeurs et leur catalogue, recherche et grab, applications et
// profils, clients, notifications, étiquettes, réglages, système). État en
// mémoire, réinitialisé par `POST /__reset`. Clé d'API exigée (`X-Api-Key`).
//
// Comportements simulés : l'indexeur « Archives Lentes » échoue au test ; le
// test global le signale (400) ; un indexeur ajouté reprend la définition ;
// la recherche rend deux résultats ; les commandes se terminent aussitôt.

import type { FastifyPluginAsync } from 'fastify';

export const PROWLARR_API_KEY = 'e2e-prowlarr-key';

type Item = Record<string, unknown> & { id: number };

const categories = [
  { id: 2000, name: 'Movies', subCategories: [{ id: 2040, name: 'Movies/HD' }] },
  { id: 5000, name: 'TV', subCategories: [] },
];

function indexer(id: number, name: string, extra: Record<string, unknown> = {}): Item {
  return {
    id,
    name,
    definitionName: name.toLowerCase().replace(/\s+/g, ''),
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'public',
    language: 'fr-FR',
    enable: true,
    redirect: false,
    supportsRss: true,
    supportsSearch: true,
    supportsRedirect: true,
    appProfileId: 1,
    priority: 25,
    tags: [],
    added: '2026-01-10T10:00:00Z',
    indexerUrls: [`https://${name.toLowerCase().replace(/\s+/g, '')}.example/`],
    capabilities: {
      categories,
      searchParams: ['q'],
      movieSearchParams: ['q', 'imdbId'],
      tvSearchParams: [],
    },
    fields: [
      { name: 'definitionFile', value: name.toLowerCase(), hidden: 'hidden' },
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'select',
        value: `https://${name.toLowerCase().replace(/\s+/g, '')}.example/`,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        privacy: 'password',
        value: 'secret-mock',
      },
    ],
    ...extra,
  };
}

const DEFINITIONS: Record<string, unknown>[] = [
  {
    name: 'Cinéma Libre',
    definitionName: 'cinemalibre',
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'public',
    language: 'fr-FR',
    description: 'Films du domaine public',
    supportsRedirect: true,
    appProfileId: 0,
    enable: true,
    priority: 25,
    tags: [],
    indexerUrls: ['https://cinemalibre.example/'],
    capabilities: { categories },
    fields: [
      { name: 'definitionFile', value: 'cinemalibre', hidden: 'hidden' },
      { name: 'baseUrl', label: 'Base URL', type: 'select', value: '' },
    ],
  },
  {
    name: 'Usenet Ouvert',
    definitionName: 'usenetouvert',
    implementation: 'Newznab',
    implementationName: 'Newznab',
    configContract: 'NewznabSettings',
    protocol: 'usenet',
    privacy: 'private',
    language: 'en-US',
    description: 'Indexeur Newznab',
    appProfileId: 0,
    enable: true,
    priority: 25,
    tags: [],
    capabilities: { categories: [{ id: 2000, name: 'Movies', subCategories: [] }] },
    fields: [{ name: 'apiKey', label: 'API Key', type: 'textbox', privacy: 'apiKey', value: '' }],
  },
];

function initialState() {
  return {
    indexers: [
      indexer(1, 'Archives Ouvertes'),
      indexer(2, 'Archives Lentes'),
      indexer(3, 'Usenet Libre', { protocol: 'usenet', privacy: 'private', enable: false }),
    ] as Item[],
    applications: [
      {
        id: 1,
        name: 'Radarr',
        implementation: 'Radarr',
        implementationName: 'Radarr',
        configContract: 'RadarrSettings',
        syncLevel: 'fullSync',
        tags: [],
        fields: [
          { name: 'baseUrl', label: 'URL', value: 'http://radarr:7878' },
          { name: 'apiKey', label: 'API Key', privacy: 'apiKey', value: 'radarr-secret' },
        ],
      },
    ] as Item[],
    downloadClients: [] as Item[],
    notifications: [] as Item[],
    appProfiles: [
      {
        id: 1,
        name: 'Standard',
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        minimumSeeders: 1,
      },
    ] as Item[],
    tags: [{ id: 1, label: 'films' }] as Item[],
    host: {
      id: 1,
      port: 9696,
      urlBase: '',
      instanceName: 'Prowlarr',
      apiKey: 'prowlarr-api-key',
      authenticationMethod: 'forms',
      authenticationRequired: 'enabled',
      username: 'admin',
      password: 'pw',
      certificateValidation: 'enabled',
      proxyEnabled: false,
      logLevel: 'info',
    } as Record<string, unknown>,
    ui: {
      id: 1,
      shortDateFormat: 'DD/MM/YYYY',
      longDateFormat: 'dddd D MMMM YYYY',
      timeFormat: 'HH:mm',
      showRelativeDates: true,
      theme: 'auto',
      enableColorImpairedMode: false,
      uiLanguage: 'fr',
    } as Record<string, unknown>,
    backups: [
      {
        id: 1,
        name: 'prowlarr_backup_v3.zip',
        type: 'scheduled',
        size: 2_000_000,
        time: '2026-11-20T03:00:00Z',
      },
    ] as Item[],
    grabs: [] as string[],
    nextId: 100,
  };
}

const PROVIDER_SCHEMAS: Record<string, Record<string, unknown>[]> = {
  applications: [
    {
      implementation: 'Sonarr',
      implementationName: 'Sonarr',
      configContract: 'SonarrSettings',
      syncLevel: 'addOnly',
      tags: [],
      fields: [
        { name: 'baseUrl', label: 'URL', value: '' },
        { name: 'apiKey', label: 'API Key', privacy: 'apiKey', value: '' },
      ],
    },
  ],
  downloadclient: [
    {
      implementation: 'QBittorrent',
      implementationName: 'qBittorrent',
      configContract: 'QBittorrentSettings',
      protocol: 'torrent',
      enable: true,
      priority: 1,
      tags: [],
      fields: [
        { name: 'host', label: 'Host', value: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', value: 8080 },
      ],
    },
  ],
  notification: [
    {
      implementation: 'Discord',
      implementationName: 'Discord',
      configContract: 'DiscordSettings',
      onGrab: false,
      onHealthIssue: false,
      includeHealthWarnings: false,
      tags: [],
      fields: [{ name: 'webHookUrl', label: 'Webhook URL', value: '' }],
    },
  ],
};

export const prowlarrMock: FastifyPluginAsync = async (app) => {
  let state = initialState();

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-api-key'] !== PROWLARR_API_KEY) {
      await reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  app.post('/__reset', async () => {
    state = initialState();
    return { ok: true };
  });

  // ── Système ──
  app.get('/api/v1/system/status', async () => ({
    appName: 'Prowlarr',
    version: '3.0.2.5780',
    branch: 'master',
    osName: 'debian',
    osVersion: '12',
    runtimeName: '.NET',
    runtimeVersion: '8.0',
    startTime: '2026-11-21T08:00:00Z',
    appData: '/config',
    migrationVersion: 42,
    authentication: 'forms',
    isDocker: true,
  }));
  app.get('/api/v1/health', async () => [
    {
      source: 'IndexerStatusCheck',
      type: 'warning',
      message: 'Indexeurs indisponibles : Archives Lentes',
    },
  ]);

  // ── Indexeurs ──
  app.get('/api/v1/indexer', async () => state.indexers);
  app.get('/api/v1/indexer/schema', async () => DEFINITIONS);
  app.get('/api/v1/indexer/categories', async () => categories);
  app.get('/api/v1/indexerstatus', async () => [
    {
      id: 1,
      indexerId: 2,
      disabledTill: '2026-11-22T00:00:00Z',
      mostRecentFailure: '2026-11-21T09:00:00Z',
    },
  ]);
  app.get('/api/v1/indexerstats', async () => ({
    indexers: state.indexers.map((item) => ({
      indexerId: item.id,
      indexerName: item.name,
      numberOfQueries: 12 * item.id,
      numberOfGrabs: item.id,
      numberOfFailedQueries: item.id === 2 ? 4 : 0,
      numberOfFailedGrabs: 0,
    })),
    userAgents: [],
    hosts: [],
  }));
  app.get<{ Params: { id: string } }>('/api/v1/indexer/:id', async (request, reply) => {
    const found = state.indexers.find((item) => item.id === Number(request.params.id));
    return found ?? reply.code(404).send({ message: 'NotFound' });
  });
  app.post<{ Body: Record<string, unknown> }>('/api/v1/indexer', async (request, reply) => {
    const created = {
      ...request.body,
      id: (state.nextId += 1),
      added: '2026-11-21T10:00:00Z',
      capabilities: { categories },
    } as Item;
    state.indexers.push(created);
    return reply.code(201).send(created);
  });
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/v1/indexer/:id',
    async (request, reply) => {
      const index = state.indexers.findIndex((item) => item.id === Number(request.params.id));
      if (index < 0) return reply.code(404).send({ message: 'NotFound' });
      const updated = {
        ...state.indexers[index],
        ...request.body,
        id: Number(request.params.id),
      } as Item;
      state.indexers[index] = updated;
      return reply.code(202).send(updated);
    },
  );
  app.delete<{ Params: { id: string } }>('/api/v1/indexer/:id', async (request) => {
    state.indexers = state.indexers.filter((item) => item.id !== Number(request.params.id));
    return {};
  });
  app.post<{ Body: Record<string, unknown> }>('/api/v1/indexer/test', async (request, reply) => {
    if (request.body.name === 'Archives Lentes') {
      return reply.code(400).send([{ propertyName: '', errorMessage: 'Délai dépassé' }]);
    }
    return {};
  });
  app.post('/api/v1/indexer/testall', async (_request, reply) =>
    reply.code(400).send(
      state.indexers
        .filter((item) => item.enable === true)
        .map((item) => ({
          id: item.id,
          isValid: item.id !== 2,
          validationFailures:
            item.id === 2 ? [{ propertyName: '', errorMessage: 'Délai dépassé' }] : [],
        })),
    ),
  );
  app.put<{ Body: { ids: number[]; enable?: boolean } }>(
    '/api/v1/indexer/bulk',
    async (request) => {
      for (const item of state.indexers) {
        if (request.body.ids.includes(item.id) && request.body.enable !== undefined)
          item.enable = request.body.enable;
      }
      return state.indexers.filter((item) => request.body.ids.includes(item.id));
    },
  );
  app.delete<{ Body: { ids: number[] } }>('/api/v1/indexer/bulk', async (request) => {
    state.indexers = state.indexers.filter((item) => !request.body.ids.includes(item.id));
    return {};
  });
  app.get('/api/v1/history/indexer', async () => [
    {
      id: 1,
      indexerId: 1,
      date: '2026-11-21T09:30:00Z',
      eventType: 'indexerQuery',
      successful: true,
      data: { query: 'orbite', source: 'Radarr' },
    },
  ]);

  // ── Recherche ──
  app.get('/api/v1/search', async () => [
    {
      guid: 'rel-1',
      title: 'Orbite.Basse.2019.1080p.WEB',
      size: 4_000_000_000,
      age: 3,
      ageHours: 72,
      indexerId: 1,
      indexer: 'Archives Ouvertes',
      seeders: 42,
      leechers: 3,
      protocol: 'torrent',
      infoUrl: 'https://archivesouvertes.example/t/1',
      downloadUrl: 'http://prowlarr/1/download?apikey=x',
      categories: [{ id: 2040, name: 'Movies/HD' }],
    },
    {
      guid: 'rel-2',
      title: 'Orbite.Basse.2019.2160p.WEB',
      size: 12_000_000_000,
      age: 1,
      ageHours: 24,
      indexerId: 1,
      indexer: 'Archives Ouvertes',
      seeders: 7,
      leechers: 1,
      protocol: 'torrent',
      infoUrl: 'javascript:alert(1)',
      categories: [],
    },
  ]);
  app.post<{ Body: { guid: string } }>('/api/v1/search', async (request) => {
    state.grabs.push(request.body.guid);
    return { guid: request.body.guid };
  });

  // ── Applications, clients, notifications ──
  const families = {
    applications: 'applications',
    downloadclient: 'downloadClients',
    notification: 'notifications',
  } as const;
  for (const [path, key] of Object.entries(families)) {
    app.get(`/api/v1/${path}`, async () => state[key]);
    app.get(`/api/v1/${path}/schema`, async () => PROVIDER_SCHEMAS[path] ?? []);
    app.get<{ Params: { id: string } }>(`/api/v1/${path}/:id`, async (request, reply) => {
      const found = state[key].find((item) => item.id === Number(request.params.id));
      return found ?? reply.code(404).send({ message: 'NotFound' });
    });
    app.post<{ Body: Record<string, unknown> }>(`/api/v1/${path}`, async (request, reply) => {
      const created = { ...request.body, id: (state.nextId += 1) } as Item;
      state[key].push(created);
      return reply.code(201).send(created);
    });
    app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
      `/api/v1/${path}/:id`,
      async (request) => {
        const id = Number(request.params.id);
        state[key] = state[key].map((item) => (item.id === id ? { ...request.body, id } : item));
        return { ...request.body, id };
      },
    );
    app.delete<{ Params: { id: string } }>(`/api/v1/${path}/:id`, async (request) => {
      state[key] = state[key].filter((item) => item.id !== Number(request.params.id));
      return {};
    });
    app.post(`/api/v1/${path}/test`, async () => ({}));
  }

  // ── Profils, étiquettes ──
  app.get('/api/v1/appprofile', async () => state.appProfiles);
  app.post<{ Body: Record<string, unknown> }>('/api/v1/appprofile', async (request, reply) => {
    const created = { ...request.body, id: (state.nextId += 1) } as Item;
    state.appProfiles.push(created);
    return reply.code(201).send(created);
  });
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/v1/appprofile/:id',
    async (request) => {
      const id = Number(request.params.id);
      state.appProfiles = state.appProfiles.map((item) =>
        item.id === id ? { ...request.body, id } : item,
      );
      return { ...request.body, id };
    },
  );
  app.delete<{ Params: { id: string } }>('/api/v1/appprofile/:id', async (request, reply) => {
    if (state.indexers.some((item) => item.appProfileId === Number(request.params.id))) {
      return reply.code(400).send({ message: 'Profil utilisé par un indexeur' });
    }
    state.appProfiles = state.appProfiles.filter((item) => item.id !== Number(request.params.id));
    return {};
  });
  app.get('/api/v1/tag', async () => state.tags);
  app.post<{ Body: { label: string } }>('/api/v1/tag', async (request, reply) => {
    const created = { id: (state.nextId += 1), label: request.body.label };
    state.tags.push(created);
    return reply.code(201).send(created);
  });
  app.delete<{ Params: { id: string } }>('/api/v1/tag/:id', async (request) => {
    state.tags = state.tags.filter((item) => item.id !== Number(request.params.id));
    return {};
  });
  app.get('/api/v1/tag/detail', async () =>
    state.tags.map((tag) => ({
      ...tag,
      indexerIds: state.indexers
        .filter((item) => (item.tags as number[]).includes(tag.id))
        .map((item) => item.id),
      applicationIds: [],
      notificationIds: [],
      indexerProxyIds: [],
    })),
  );

  // ── Configurations ──
  app.get('/api/v1/config/host', async () => state.host);
  app.put<{ Body: Record<string, unknown> }>(
    '/api/v1/config/host/:id',
    async (request) => (state.host = { ...state.host, ...request.body }),
  );
  app.get('/api/v1/config/ui', async () => state.ui);
  app.put<{ Body: Record<string, unknown> }>(
    '/api/v1/config/ui/:id',
    async (request) => (state.ui = { ...state.ui, ...request.body }),
  );
  app.get('/api/v1/config/downloadclient', async () => ({ id: 1 }));

  // ── Historique, journaux, tâches, sauvegardes, mises à jour, commandes ──
  app.get('/api/v1/history', async () => ({
    page: 1,
    pageSize: 50,
    totalRecords: 2,
    records: [
      {
        id: 1,
        indexerId: 1,
        date: '2026-11-21T09:30:00Z',
        eventType: 'indexerQuery',
        successful: true,
        data: { query: 'orbite', source: 'Radarr', queryResults: '12', elapsedTime: '340' },
      },
      {
        id: 2,
        indexerId: 2,
        date: '2026-11-21T09:00:00Z',
        eventType: 'indexerRss',
        successful: false,
        data: { source: 'Sonarr' },
      },
    ],
  }));
  app.get('/api/v1/history/since', async () => []);
  app.get('/api/v1/log', async () => ({
    page: 1,
    pageSize: 100,
    totalRecords: 1,
    records: [
      {
        time: '2026-11-21T09:00:00Z',
        level: 'Warn',
        logger: 'IndexerStatusCheck',
        message: 'Archives Lentes indisponible',
      },
    ],
  }));
  app.get('/api/v1/system/task', async () => [
    {
      id: 1,
      name: 'Synchronisation des applications',
      taskName: 'ApplicationIndexerSync',
      interval: 720,
      lastExecution: '2026-11-21T06:00:00Z',
      nextExecution: '2026-11-21T18:00:00Z',
      lastDuration: '00:00:02',
    },
  ]);
  app.get('/api/v1/system/backup', async () => state.backups);
  app.delete<{ Params: { id: string } }>('/api/v1/system/backup/:id', async (request) => {
    state.backups = state.backups.filter((item) => item.id !== Number(request.params.id));
    return {};
  });
  app.get('/api/v1/update', async () => [
    {
      version: '3.0.2.5780',
      branch: 'master',
      releaseDate: '2026-11-16T00:00:00Z',
      installed: true,
      installable: false,
      latest: true,
      changes: { new: ['Nouveaux indexeurs'], fixed: [] },
    },
  ]);
  app.post<{ Body: { name: string } }>('/api/v1/command', async (request, reply) => {
    const id = (state.nextId += 1);
    if (request.body.name === 'Backup') {
      state.backups.unshift({
        id,
        name: `prowlarr_backup_manual_${id}.zip`,
        type: 'manual',
        size: 1_000_000,
        time: '2026-11-21T10:00:00Z',
      });
    }
    return reply.code(201).send({ id, name: request.body.name, status: 'completed' });
  });
  app.get<{ Params: { id: string } }>('/api/v1/command/:id', async (request) => ({
    id: Number(request.params.id),
    name: 'Command',
    status: 'completed',
  }));
};
