// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration simulée, commune au faux Radarr et au faux Sonarr (P3b.6) :
// indexeurs, clients, listes d'import (Sonarr), notifications, métadonnées
// (ressources à schéma), profils de délai, formats, auto-tags, étiquettes
// (détail, renommage, suppression), configurations, chemins distants,
// filtres, exclusions, sauvegardes, mises à jour, tâches, journaux, parseur,
// suggestions (Radarr). État en mémoire, remis à zéro avec le service.
//
// Les champs `password`/`apiKey` sont renvoyés en clair, comme un ancien
// Radarr : Hubarr doit les masquer lui-même.

import type { FastifyInstance } from 'fastify';

type Kind = 'radarr' | 'sonarr';
type Item = Record<string, unknown> & { id: number };

interface Options {
  /** Étiquettes du service (tableau partagé avec le faux service). */
  tags: () => { id: number; label: string }[];
  /** Le faux service sert déjà les listes d'import (Radarr : suivi de personnes). */
  hasImportLists: boolean;
}

const field = (
  name: string,
  label: string,
  type: string,
  value: unknown,
  extra: Record<string, unknown> = {},
) => ({
  name,
  label,
  type,
  value,
  ...extra,
});

function templates(kind: Kind) {
  const newznab = {
    implementation: 'Newznab',
    implementationName: 'Newznab',
    configContract: 'NewznabSettings',
    protocol: 'usenet',
    enableRss: true,
    enableAutomaticSearch: true,
    enableInteractiveSearch: true,
    priority: 25,
    tags: [],
    fields: [
      field('baseUrl', 'URL', 'textbox', ''),
      field('apiKey', 'API Key', 'textbox', '', { privacy: 'apiKey' }),
      field('categories', 'Categories', 'select', kind === 'radarr' ? [2000, 2040] : [5000, 5040]),
    ],
  };
  const qbit = {
    implementation: 'QBittorrent',
    implementationName: 'qBittorrent',
    configContract: 'QBittorrentSettings',
    protocol: 'torrent',
    enable: true,
    priority: 1,
    tags: [],
    fields: [
      field('host', 'Host', 'textbox', 'localhost'),
      field('port', 'Port', 'number', 8080),
      field('username', 'Username', 'textbox', ''),
      field('password', 'Password', 'password', '', { privacy: 'password' }),
    ],
  };
  const discord = {
    implementation: 'Discord',
    implementationName: 'Discord',
    configContract: 'DiscordSettings',
    supportsOnGrab: true,
    supportsOnDownload: true,
    supportsOnHealthIssue: true,
    ...(kind === 'radarr' ? { supportsOnMovieAdded: true } : { supportsOnSeriesAdd: true }),
    onGrab: false,
    onDownload: false,
    onHealthIssue: false,
    includeHealthWarnings: false,
    tags: [],
    fields: [field('webHookUrl', 'Webhook URL', 'url', '')],
  };
  const list = {
    implementation: 'TraktListImport',
    implementationName: 'Trakt List',
    configContract: 'TraktListSettings',
    enableAutomaticAdd: true,
    qualityProfileId: 1,
    rootFolderPath: '',
    tags: [],
    fields: [field('listName', 'List name', 'textbox', '')],
  };
  return {
    indexer: [newznab],
    downloadclient: [qbit],
    notification: [discord],
    importlist: [list],
  };
}

function initialState(kind: Kind) {
  const provider = (
    id: number,
    template: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Item => ({
    ...template,
    ...overrides,
    id,
  });
  const base = templates(kind);
  const withFields = (template: Record<string, unknown>, values: Record<string, unknown>) =>
    (template.fields as { name: string }[]).map((entry) => ({
      ...entry,
      value: values[entry.name] ?? (entry as { value?: unknown }).value,
    }));
  return {
    indexer: [
      provider(1, base.indexer[0] ?? {}, {
        name: 'IndexeurTest',
        fields: withFields(base.indexer[0] ?? {}, {
          baseUrl: 'https://indexeur.test',
          apiKey: 'cle-secrete-indexeur',
        }),
      }),
      ...(kind === 'radarr'
        ? [
            provider(2, base.indexer[0] ?? {}, {
              name: 'AutreIndexeur',
              enableRss: false,
              enableAutomaticSearch: false,
              enableInteractiveSearch: false,
              fields: withFields(base.indexer[0] ?? {}, {}),
            }),
          ]
        : []),
    ],
    downloadclient: [
      provider(1, base.downloadclient[0] ?? {}, {
        name: 'qBittorrent',
        fields: withFields(base.downloadclient[0] ?? {}, {
          host: 'qbittorrent',
          password: 'mot-de-passe-client',
        }),
      }),
    ],
    notification: [
      provider(1, base.notification[0] ?? {}, {
        name: 'Discord famille',
        onGrab: true,
        fields: withFields(base.notification[0] ?? {}, {
          webHookUrl: 'https://discord.test/webhook',
        }),
      }),
    ],
    importlist: [] as Item[],
    metadata: [
      {
        id: 1,
        name: 'Kodi (XBMC) / Emby',
        implementation: 'XbmcMetadata',
        implementationName: 'Kodi (XBMC) / Emby',
        configContract: 'XbmcMetadataSettings',
        enable: false,
        tags: [],
        fields: [field('fileMetadata', 'Metadata file', 'checkbox', true)],
      },
    ] as Item[],
    delayprofile: [
      {
        id: 1,
        enableUsenet: true,
        enableTorrent: true,
        preferredProtocol: 'usenet',
        usenetDelay: 0,
        torrentDelay: 0,
        bypassIfHighestQuality: true,
        bypassIfAboveCustomFormatScore: false,
        minimumCustomFormatScore: 0,
        order: 2147483647,
        tags: [],
      },
    ] as Item[],
    customformat: [
      {
        id: 1,
        name: 'x265',
        includeCustomFormatWhenRenaming: false,
        specifications: [
          {
            name: 'x265',
            implementation: 'ReleaseTitleSpecification',
            implementationName: 'Release Title',
            negate: false,
            required: false,
            fields: [field('value', 'Regular Expression', 'textbox', 'x265|HEVC')],
          },
        ],
      },
    ] as Item[],
    autotagging: [] as Item[],
    remotepathmapping: [] as Item[],
    customfilter: [] as Item[],
    exclusions: [
      kind === 'radarr'
        ? { id: 1, tmdbId: 603, movieTitle: 'Film exclu', movieYear: 1999 }
        : { id: 1, tvdbId: 81189, title: 'Série exclue' },
    ] as Item[],
    backups: [
      {
        id: 1,
        name: `${kind}_backup_v1_2026.11.20_03.00.00.zip`,
        path: '/backup/scheduled/a.zip',
        type: 'scheduled',
        size: 1_048_576,
        time: '2026-11-20T03:00:00Z',
      },
    ] as Item[],
    config: {
      host: {
        id: 1,
        bindAddress: '*',
        port: kind === 'radarr' ? 7878 : 8989,
        sslPort: 9898,
        urlBase: '',
        instanceName: kind === 'radarr' ? 'Radarr' : 'Sonarr',
        applicationUrl: '',
        enableSsl: false,
        launchBrowser: true,
        authenticationMethod: 'forms',
        authenticationRequired: 'enabled',
        username: 'admin',
        password: 'mot-de-passe-hote',
        passwordConfirmation: '',
        apiKey: 'cle-api-instance',
        certificateValidation: 'enabled',
        proxyEnabled: false,
        proxyType: 'http',
        proxyHostname: '',
        proxyPort: 8080,
        proxyUsername: '',
        proxyPassword: '',
        proxyBypassFilter: '',
        proxyBypassLocalAddresses: true,
        logLevel: 'info',
        logSizeLimit: 1,
        analyticsEnabled: false,
        branch: 'master',
        updateAutomatically: false,
        updateMechanism: 'docker',
        backupFolder: 'Backups',
        backupInterval: 7,
        backupRetention: 28,
      },
      ui: {
        id: 1,
        firstDayOfWeek: 1,
        calendarWeekColumnHeader: 'ddd D/M',
        shortDateFormat: 'DD/MM/YYYY',
        longDateFormat: 'dddd, D MMMM YYYY',
        timeFormat: 'HH:mm',
        showRelativeDates: true,
        theme: 'dark',
        enableColorImpairedMode: false,
        uiLanguage: 1,
        ...(kind === 'radarr' ? { movieRuntimeFormat: 'hoursMinutes', movieInfoLanguage: 1 } : {}),
      },
      naming:
        kind === 'radarr'
          ? {
              id: 1,
              renameMovies: true,
              replaceIllegalCharacters: true,
              colonReplacementFormat: 'smart',
              standardMovieFormat: '{Movie Title} ({Release Year}) {Quality Full}',
              movieFolderFormat: '{Movie Title} ({Release Year})',
            }
          : {
              id: 1,
              renameEpisodes: true,
              replaceIllegalCharacters: true,
              colonReplacementFormat: 4,
              standardEpisodeFormat: '{Series Title} - S{season:00}E{episode:00} - {Episode Title}',
              dailyEpisodeFormat: '{Series Title} - {Air-Date}',
              animeEpisodeFormat: '{Series Title} - S{season:00}E{episode:00}',
              seriesFolderFormat: '{Series Title}',
              seasonFolderFormat: 'Season {season}',
              multiEpisodeStyle: 5,
            },
      mediamanagement: {
        id: 1,
        deleteEmptyFolders: false,
        copyUsingHardlinks: true,
        importExtraFiles: false,
        extraFileExtensions: 'srt',
        enableMediaInfo: true,
        downloadPropersAndRepacks: 'preferAndUpgrade',
        fileDate: 'none',
        rescanAfterRefresh: 'always',
        recycleBin: '',
        recycleBinCleanupDays: 7,
        minimumFreeSpaceWhenImporting: 100,
        setPermissionsLinux: false,
        chmodFolder: '755',
        chownGroup: '',
      },
      indexer: { id: 1, minimumAge: 0, retention: 0, rssSyncInterval: 15, availabilityDelay: 0 },
      downloadclient: { id: 1, enableCompletedDownloadHandling: true, autoRedownloadFailed: true },
      importlist: { id: 1, listSyncLevel: 'disabled' },
      metadata: { id: 1, certificationCountry: 'fr' },
    } as Record<string, Record<string, unknown>>,
    nextId: 500,
  };
}

const PARSED = {
  radarr: (title: string) => ({
    title,
    parsedMovieInfo: {
      movieTitle: 'Horizon Blanc',
      year: 2019,
      quality: { quality: { name: 'Bluray-1080p' } },
      languages: [{ id: 2, name: 'French' }],
      releaseGroup: 'HUBARR',
    },
    movie: null,
  }),
  sonarr: (title: string) => ({
    title,
    parsedEpisodeInfo: {
      seriesTitle: 'Les Phares',
      seasonNumber: 1,
      episodeNumbers: [2],
      quality: { quality: { name: 'WEBDL-1080p' } },
      languages: [],
      releaseGroup: 'HUBARR',
    },
    series: null,
  }),
};

type CollectionName =
  | 'indexer'
  | 'downloadclient'
  | 'notification'
  | 'importlist'
  | 'metadata'
  | 'delayprofile'
  | 'customformat'
  | 'autotagging'
  | 'remotepathmapping'
  | 'customfilter'
  | 'exclusions'
  | 'backups';

export function createArrAdminMock(kind: Kind, options: Options) {
  let state = initialState(kind);

  function register(app: FastifyInstance): void {
    const nextId = () => (state.nextId += 1);
    const collection = (name: CollectionName): Item[] => state[name];

    /** CRUD d'une collection d'éléments (`/api/v3/<path>`). */
    const crud = (
      path: string,
      name: CollectionName,
      verbs: { get?: boolean; post?: boolean; put?: boolean; delete?: boolean; one?: boolean } = {},
    ) => {
      const all = { get: true, post: true, put: true, delete: true, one: true, ...verbs };
      if (all.get) app.get(`/api/v3/${path}`, async () => collection(name));
      if (all.one)
        app.get(`/api/v3/${path}/:id`, async (request, reply) => {
          const item = collection(name).find(
            (entry) => entry.id === Number((request.params as { id: string }).id),
          );
          return item ?? reply.code(404).send({ message: 'NotFound' });
        });
      if (all.post)
        app.post(`/api/v3/${path}`, async (request, reply) => {
          const item = { ...(request.body as Record<string, unknown>), id: nextId() };
          collection(name).push(item);
          return reply.code(201).send(item);
        });
      if (all.put)
        app.put(`/api/v3/${path}/:id`, async (request, reply) => {
          const id = Number((request.params as { id: string }).id);
          const list = collection(name);
          const index = list.findIndex((entry) => entry.id === id);
          if (index < 0) return reply.code(404).send({ message: 'NotFound' });
          const item = { ...(request.body as Record<string, unknown>), id };
          list[index] = item;
          return reply.code(202).send(item);
        });
      if (all.delete)
        app.delete(`/api/v3/${path}/:id`, async (request) => {
          const id = Number((request.params as { id: string }).id);
          (state as Record<string, unknown>)[name] = collection(name).filter(
            (entry) => entry.id !== id,
          );
          return {};
        });
    };

    /** Test : URL `invalide` refusée comme le ferait l'instance. */
    const test = (path: string) =>
      app.post(`/api/v3/${path}/test`, async (request, reply) => {
        const body = request.body as { fields?: { name: string; value: unknown }[] };
        const bad = (body.fields ?? []).some(
          (entry) => typeof entry.value === 'string' && entry.value.includes('invalide'),
        );
        return bad
          ? reply
              .code(400)
              .send([{ propertyName: 'BaseUrl', errorMessage: 'Unable to connect to indexer' }])
          : reply.code(200).send();
      });

    const schemas = templates(kind);

    // ── Ressources à schéma ──────────────────────────────────────────────────
    crud('indexer', 'indexer');
    app.get('/api/v3/indexer/schema', async () => schemas.indexer);
    test('indexer');
    crud('downloadclient', 'downloadclient');
    app.get('/api/v3/downloadclient/schema', async () => schemas.downloadclient);
    test('downloadclient');
    crud('notification', 'notification');
    app.get('/api/v3/notification/schema', async () => schemas.notification);
    test('notification');
    if (!options.hasImportLists) {
      crud('importlist', 'importlist');
      app.get('/api/v3/importlist/schema', async () => schemas.importlist);
    }
    crud('metadata', 'metadata', { post: false });
    app.get('/api/v3/metadata/schema', async () => []);

    // ── Profils ──────────────────────────────────────────────────────────────
    app.get('/api/v3/qualitydefinition/limits', async () => ({
      min: 0,
      max: kind === 'radarr' ? 2000 : 1000,
    }));
    app.put('/api/v3/qualitydefinition/update', async (request) => request.body);
    app.post('/api/v3/qualityprofile', async (request, reply) =>
      reply.code(201).send({ ...(request.body as object), id: nextId() }),
    );
    app.put('/api/v3/qualityprofile/:id', async (request, reply) =>
      reply.code(202).send(request.body),
    );
    app.delete('/api/v3/qualityprofile/:id', async () => ({}));
    crud('delayprofile', 'delayprofile');
    crud('customformat', 'customformat');
    app.get('/api/v3/customformat/schema', async () => [
      {
        implementation: 'ReleaseTitleSpecification',
        implementationName: 'Release Title',
        negate: false,
        required: false,
        fields: [field('value', 'Regular Expression', 'textbox', '')],
      },
      {
        implementation: 'SizeSpecification',
        implementationName: 'Size',
        negate: false,
        required: false,
        fields: [
          field('min', 'Minimum Size', 'number', 0),
          field('max', 'Maximum Size', 'number', 0),
        ],
      },
    ]);
    crud('autotagging', 'autotagging');
    app.get('/api/v3/autotagging/schema', async () => [
      {
        implementation: 'GenreSpecification',
        implementationName: 'Genre',
        negate: false,
        required: false,
        fields: [field('value', 'Genre(s)', 'tag', [])],
      },
    ]);

    // ── Étiquettes ───────────────────────────────────────────────────────────
    app.get('/api/v3/tag/detail', async () =>
      options.tags().map((tag) => ({
        ...tag,
        delayProfileIds: [],
        indexerIds: [],
        notificationIds: [],
        [kind === 'radarr' ? 'movieIds' : 'seriesIds']: [],
      })),
    );
    app.put('/api/v3/tag/:id', async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const tag = options.tags().find((entry) => entry.id === id);
      if (tag === undefined) return reply.code(404).send({ message: 'NotFound' });
      const label = (request.body as { label?: unknown }).label;
      if (typeof label === 'string') tag.label = label;
      return reply.code(202).send(tag);
    });
    app.delete('/api/v3/tag/:id', async (request) => {
      const id = Number((request.params as { id: string }).id);
      const tags = options.tags();
      const index = tags.findIndex((entry) => entry.id === id);
      if (index >= 0) tags.splice(index, 1);
      return {};
    });

    // ── Configurations ───────────────────────────────────────────────────────
    for (const section of Object.keys(state.config)) {
      app.get(`/api/v3/config/${section}`, async () => state.config[section]);
      app.put(`/api/v3/config/${section}/:id`, async (request, reply) => {
        state.config[section] = { ...(request.body as Record<string, unknown>) };
        return reply.code(202).send(state.config[section]);
      });
    }
    app.get('/api/v3/config/naming/examples', async (request) => {
      const query = request.query as Record<string, string | undefined>;
      return kind === 'radarr'
        ? {
            movieExample: (query.standardMovieFormat ?? '{Movie Title}')
              .replace('{Movie Title}', 'Horizon Blanc')
              .replace('{Release Year}', '2019')
              .replace('{Quality Full}', 'Bluray-1080p'),
            movieFolderExample: (query.movieFolderFormat ?? '{Movie Title}')
              .replace('{Movie Title}', 'Horizon Blanc')
              .replace('{Release Year}', '2019'),
          }
        : {
            singleEpisodeExample: 'Les Phares - S01E02 - La Tempête',
            seriesFolderExample: 'Les Phares',
            seasonFolderExample: 'Season 1',
          };
    });

    // ── Dossiers, chemins distants, filtres, exclusions ──────────────────────
    app.post('/api/v3/rootfolder', async (request, reply) =>
      reply.code(201).send({
        ...(request.body as object),
        id: nextId(),
        accessible: true,
        freeSpace: 0,
        totalSpace: 0,
      }),
    );
    app.delete('/api/v3/rootfolder/:id', async () => ({}));
    crud('remotepathmapping', 'remotepathmapping');
    crud('customfilter', 'customfilter');
    const exclusions = kind === 'radarr' ? 'exclusions' : 'importlistexclusion';
    crud(exclusions, 'exclusions');
    app.get(`/api/v3/${exclusions}/paged`, async () => ({
      page: 1,
      pageSize: 50,
      totalRecords: state.exclusions.length,
      records: state.exclusions,
    }));
    app.delete(`/api/v3/${exclusions}/bulk`, async (request) => {
      const ids = new Set((request.body as { ids?: number[] }).ids ?? []);
      state.exclusions = state.exclusions.filter((entry) => !ids.has(entry.id));
      return {};
    });

    // ── Système ──────────────────────────────────────────────────────────────
    app.get('/api/v3/system/backup', async () => state.backups);
    app.delete('/api/v3/system/backup/:id', async (request) => {
      const id = Number((request.params as { id: string }).id);
      state.backups = state.backups.filter((entry) => entry.id !== id);
      return {};
    });
    app.post('/api/v3/system/backup/restore/:id', async () => ({}));
    app.get('/api/v3/update', async () => [
      {
        version: kind === 'radarr' ? '5.15.0.9412' : '4.0.21.3100',
        branch: 'master',
        releaseDate: '2026-11-18T00:00:00Z',
        installed: false,
        installable: true,
        latest: true,
        changes: { new: ['Nouveauté simulée'], fixed: ['Correction simulée'] },
      },
      {
        version: kind === 'radarr' ? '5.14.0.9383' : '4.0.20.3014',
        branch: 'master',
        releaseDate: '2026-10-01T00:00:00Z',
        installed: true,
        installable: false,
        latest: false,
        changes: { new: [], fixed: [] },
      },
    ]);
    app.get('/api/v3/system/task', async () => [
      {
        id: 1,
        name: 'RSS Sync',
        taskName: 'RssSync',
        interval: 15,
        lastExecution: '2026-11-21T09:45:00Z',
        nextExecution: '2026-11-21T10:00:00Z',
        lastDuration: '00:00:02',
      },
      {
        id: 2,
        name: 'Backup',
        taskName: 'Backup',
        interval: 10080,
        lastExecution: '2026-11-20T03:00:00Z',
        nextExecution: '2026-11-27T03:00:00Z',
        lastDuration: '00:00:05',
      },
    ]);
    app.get('/api/v3/log/file', async () => [
      {
        filename: `${kind}.txt`,
        lastWriteTime: '2026-11-21T10:00:00Z',
        contentsUrl: `/api/v1/log/file/${kind}.txt`,
      },
    ]);
    app.get('/api/v3/parse', async (request) =>
      PARSED[kind]((request.query as { title?: string }).title ?? ''),
    );
    if (kind === 'radarr') {
      app.get('/api/v3/importlist/movie', async () => [
        {
          tmdbId: 9001,
          title: 'Lumière Australe',
          year: 2024,
          overview: 'Un film inventé pour les tests.',
          runtime: 112,
          genres: ['Drame'],
          isRecommendation: true,
          ratings: { tmdb: { value: 7.4 } },
        },
        { tmdbId: 9002, title: 'Les Marées', year: 2023, overview: null, isTrending: true },
      ]);
    }
  }

  return {
    register,
    reset(): void {
      state = initialState(kind);
    },
  };
}
