// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux serveurs d'activité (P3e.4) : Tautulli (`/tautulli`, `/api/v2?apikey=…
// &cmd=…`), Tracearr (`/tracearr`, API publique v2 et v1, jeton Bearer) et
// Emby (`/emby-mock/emby/…`, jeton `X-Emby-Token`). Données inventées (une
// lecture en cours par service, statistiques, graphiques, historique sur deux
// pages) ; les images renvoient un PNG d'un pixel. Sans état : rien à remettre
// à zéro (`POST /__reset` répond quand même).

import type { FastifyPluginAsync } from 'fastify';

export const TAUTULLI_API_KEY = 'e2e-tautulli-key';
export const TRACEARR_API_KEY = 'trr_pub_e2e';
export const EMBY_API_KEY = 'e2e-emby-key';
export const TRACEARR_SERVER = '11111111-2222-3333-4444-555555555555';
/** Série « Les Veilleurs » côté Tracearr (fiche v2 `/media/:id`). */
export const TRACEARR_SHOW = '22222222-3333-4444-5555-666666666666';
/** Lecture en cours côté Tracearr (identifiant de session, arrêt en v1). */
export const TRACEARR_SESSION = '33333333-4444-5555-6666-777777777777';

/** PNG transparent d'un pixel. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const CATEGORIES = [
  '2026-11-15',
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
];

function chart(names: string[]) {
  return {
    categories: CATEGORIES,
    series: [
      ...names.map((name, i) => ({
        name,
        data: CATEGORIES.map((_, d) => ((d + 1) * (i + 2)) % 7),
      })),
      { name: 'Total', data: CATEGORIES.map(() => 9) },
    ],
  };
}

function history(start: number, length: number) {
  return Array.from({ length: 40 }, (_, i) => ({
    rating_key: String(100 + i),
    media_type: i % 2 === 0 ? 'movie' : 'episode',
    title: i % 2 === 0 ? `Film Historique ${i + 1}` : `Épisode ${i + 1}`,
    grandparent_title: i % 2 === 0 ? '' : 'Les Veilleurs',
    parent_media_index: 1,
    media_index: i + 1,
    year: 2020,
    thumb: `/library/metadata/${100 + i}/thumb/1`,
    grandparent_thumb: '/library/metadata/90/thumb/1',
    friendly_name: i % 3 === 0 ? 'alice' : 'bob',
    date: 1_763_700_000 - i * 3_600,
    percent_complete: 100,
  })).slice(start, start + length);
}

export const tautulliMock: FastifyPluginAsync = async (app) => {
  app.post('/__reset', async () => ({ ok: true }));
  app.get<{ Querystring: Record<string, string> }>('/api/v2', async (request, reply) => {
    const q = request.query;
    if (q.apikey !== TAUTULLI_API_KEY)
      return { response: { result: 'error', message: 'Invalid apikey' } };
    if (q.cmd === 'pms_image_proxy') return reply.type('image/png').send(PIXEL);
    const ok = (data: unknown) => ({ response: { result: 'success', data } });
    switch (q.cmd) {
      case 'get_activity':
        return ok({
          stream_count: '1',
          stream_count_direct_play: 1,
          stream_count_direct_stream: 0,
          stream_count_transcode: 0,
          total_bandwidth: 12000,
          lan_bandwidth: 12000,
          wan_bandwidth: 0,
          sessions: [
            {
              session_key: '1',
              rating_key: '42',
              state: 'playing',
              media_type: 'movie',
              full_title: 'Orbite Basse',
              title: 'Orbite Basse',
              year: 2019,
              thumb: '/library/metadata/42/thumb/1',
              friendly_name: 'alice',
              player: 'Salon',
              product: 'Plex for TV',
              quality_profile: '1080p',
              transcode_decision: 'direct play',
              video_codec: 'h264',
              audio_codec: 'eac3',
              location: 'lan',
              bandwidth: 12000,
              progress_percent: 37,
            },
          ],
        });
      case 'get_user_names':
        return ok([
          { friendly_name: 'alice', user_id: 1 },
          { friendly_name: 'bob', user_id: 2 },
        ]);
      case 'get_home_stats':
        return ok([
          {
            stat_id: 'top_movies',
            rows: [
              {
                rating_key: '42',
                title: 'Orbite Basse',
                year: 2019,
                thumb: '/library/metadata/42/thumb/1',
                total_plays: 12,
                total_duration: 86_400,
              },
            ],
          },
          {
            stat_id: 'top_tv',
            rows: [
              {
                rating_key: '90',
                title: 'Les Veilleurs',
                grandparent_thumb: '/library/metadata/90/thumb/1',
                total_plays: 30,
                total_duration: 72_000,
              },
            ],
          },
          {
            stat_id: 'top_users',
            rows: [{ friendly_name: 'alice', total_plays: 25, total_duration: 90_000 }],
          },
          { stat_id: 'most_concurrent', rows: [{ title: 'Flux simultanés', count: 3 }] },
        ]);
      case 'get_plays_by_date':
        return ok(chart(['Movies', 'TV']));
      case 'get_plays_by_stream_type':
      case 'get_concurrent_streams_by_stream_type':
        return ok(chart(['Direct Play', 'Transcode']));
      case 'get_plays_by_hourofday':
      case 'get_plays_by_dayofweek':
      case 'get_stream_type_by_top_10_platforms':
      case 'get_plays_by_source_resolution':
      case 'get_plays_by_stream_resolution':
      case 'get_stream_type_by_top_10_users':
        return ok(chart(['Movies']));
      case 'get_history':
        return ok({ data: history(Number(q.start ?? 0), Number(q.length ?? 25)) });
      case 'get_libraries':
        return ok([
          { section_name: 'Films', section_type: 'movie', count: 16 },
          { section_name: 'Séries', section_type: 'show', count: 2, child_count: 24 },
        ]);
      case 'get_users_table':
        return ok({
          data: [{ friendly_name: 'alice', last_seen: 1_763_700_000, plays: 25, duration: 90_000 }],
        });
      case 'get_metadata':
        return ok(
          q.rating_key === '42' || Number(q.rating_key) >= 100
            ? {
                media_type: 'movie',
                title: q.rating_key === '42' ? 'Orbite Basse' : `Film Historique`,
                year: 2019,
                summary: 'Un équipage en orbite basse découvre un signal.',
                duration: 6_120_000,
                genres: ['Science-fiction'],
                guids: ['tmdb://424242'],
                media_info: [
                  {
                    video_full_resolution: '1080p',
                    video_codec: 'h264',
                    audio_codec: 'eac3',
                    container: 'mkv',
                  },
                ],
              }
            : {},
        );
      default:
        return { response: { result: 'error', message: 'unknown cmd' } };
    }
  });
};

function watchedHistory(user: string) {
  if (user !== 'u1') return [];
  return [
    {
      id: 'w1',
      media_type: 'movie',
      media_title: 'Orbite Basse',
      tmdb_id: 9001,
      started_at: '2026-11-20T20:00:00Z',
      percent_complete: 97,
      watched: true,
    },
    ...[1, 2].map((episode) => ({
      id: `w-e${episode}`,
      media_type: 'episode',
      show_media_id: TRACEARR_SHOW,
      season_number: 1,
      episode_number: episode,
      started_at: `2026-11-1${episode}T20:00:00Z`,
      percent_complete: 100,
      watched: true,
    })),
  ];
}

export const tracearrMock: FastifyPluginAsync = async (app) => {
  app.post('/__reset', async () => ({ ok: true }));
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers.authorization !== `Bearer ${TRACEARR_API_KEY}`)
      await reply.code(401).send({ error: 'unauthorized' });
  });
  const stream = {
    id: TRACEARR_SESSION,
    mediaType: 'episode',
    showTitle: 'Les Veilleurs',
    seasonNumber: 1,
    episodeNumber: 3,
    mediaTitle: 'Le Guet',
    serverId: TRACEARR_SERVER,
    serverName: 'Plex Salon',
    thumbPath: '/library/metadata/90/thumb/1',
    username: 'bob',
    product: 'Plex Web',
    player: 'Firefox',
    resolution: '720p',
    isTranscode: true,
    bitrate: 4000,
    durationMs: 2_400_000,
    progressMs: 600_000,
    state: 'playing',
  };
  app.get('/api/v2/public/streams', async () => ({
    data: [stream],
    summary: {
      total: 1,
      directPlays: 0,
      directStreams: 0,
      transcodes: 1,
      totalBitrate: '4.0 Mbps',
    },
  }));
  // Sonde de santé de Hubarr (`diagnose.ts`) : sans elle, Tracearr passait pour
  // injoignable et ses onglets renvoyaient au résumé (P5c.7).
  app.get('/api/v1/public/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/public/streams', async () => ({
    data: [stream],
    summary: { total: 1, transcodes: 1 },
  }));
  // Arrêt d'une lecture (v1 seulement) : sans état, la lecture reste listée.
  app.post<{ Params: { id: string } }>(
    '/api/v1/public/streams/:id/terminate',
    async (request, reply) =>
      request.params.id === TRACEARR_SESSION
        ? {
            success: true,
            sessionId: request.params.id,
            message: 'Session terminated successfully',
          }
        : reply.code(404).send({ error: 'Session not found' }),
  );
  app.get('/api/v1/public/stats', async () => ({
    activeStreams: 1,
    totalUsers: 4,
    totalSessions: 87,
    recentViolations: 2,
  }));
  app.get('/api/v1/public/stats/today', async () => ({
    todayPlays: 5,
    watchTimeHours: 3.25,
    activeUsersToday: 2,
    alertsLast24h: 0,
  }));
  app.get('/api/v1/public/activity', async () => ({
    plays: CATEGORIES.map((date, i) => ({ date: `${date}T00:00:00`, count: (i * 3) % 7 })),
    concurrent: CATEGORIES.map((date, i) => ({
      date: `${date}T20:00:00`,
      direct: i % 3,
      directStream: 1,
      transcode: i % 2,
    })),
    byHourOfDay: Array.from({ length: 24 }, (_, hour) => ({ hour, count: (hour * 5) % 9 })),
    byDayOfWeek: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((name, day) => ({
      day,
      name,
      count: day + 1,
    })),
    platforms: [
      { platform: 'Plex Web', count: 12 },
      { platform: 'Android TV', count: 7 },
    ],
    quality: {
      directPlay: 30,
      directStream: 10,
      transcode: 20,
      total: 60,
      directPlayPercent: 50,
      directStreamPercent: 17,
      transcodePercent: 33,
    },
  }));
  // « Vu » (lot 7) : identités v2, fiche d'une série et historique filtré par
  // identité (`watchedHistory`). alice a vu « Orbite Basse » (Radarr, TMDB 9001) et deux
  // épisodes des « Veilleurs » (Sonarr, TVDB 70001) ; bob n'a rien vu.
  app.get('/api/v2/public/users', async () => ({
    data: [
      { id: 'u1', username: 'alice', identity_name: 'alice' },
      { id: 'u2', username: 'bob' },
    ],
    meta: { nextCursor: null },
  }));
  app.get<{ Params: { id: string } }>('/api/v2/public/media/:id', async (request, reply) =>
    request.params.id === TRACEARR_SHOW
      ? {
          id: TRACEARR_SHOW,
          media_type: 'show',
          title: 'Les Veilleurs',
          tmdb_id: 7001,
          tvdb_id: 70_001,
        }
      : reply.code(404).send({ error: 'not found' }),
  );
  app.get<{ Querystring: { cursor?: string; user_id?: string } }>(
    '/api/v2/public/history',
    async (request) => {
      // Synchronisation « Vu » : historique filtré par identité.
      if (request.query.user_id !== undefined)
        return { data: watchedHistory(request.query.user_id), meta: { nextCursor: null } };
      const second = request.query.cursor === 'page2';
      return {
        // Une ligne sur trois est un épisode vu par bob (fiche utilisateur, P5d.2).
        data: Array.from({ length: second ? 4 : 24 }, (_, i) => ({
          ...(i % 3 === 2
            ? {
                mediaType: 'episode',
                mediaTitle: `Épisode ${i + 1}`,
                showTitle: 'Les Veilleurs',
                seasonNumber: 1,
                episodeNumber: i + 1,
                user: { id: 'u2', username: 'bob' },
                platform: 'Android TV',
              }
            : {
                mediaType: 'movie',
                mediaTitle: `${second ? 'Suite' : 'Lecture'} ${i + 1}`,
                tmdbId: 1000 + i,
                user: { id: 'u1', username: 'alice' },
                platform: 'Plex Web',
              }),
          startedAt: new Date(Date.UTC(2026, 10, 20, 20) - i * 3_600_000).toISOString(),
          durationMs: 3_600_000,
          totalDurationMs: 3_600_000,
          progressMs: 3_600_000,
          watched: true,
        })),
        meta: { nextCursor: second ? null : 'page2' },
      };
    },
  );
  app.get('/api/v1/public/users', async () => ({
    data: [
      {
        id: 'u1',
        username: 'alice',
        serverName: 'Plex Salon',
        lastActivityAt: '2026-11-20T21:00:00Z',
        sessionCount: 50,
        trustScore: 98,
      },
      {
        id: 'u2',
        username: 'bob',
        serverName: 'Plex Salon',
        lastActivityAt: '2026-11-19T21:00:00Z',
        sessionCount: 37,
        trustScore: 72,
      },
    ],
  }));
  app.get('/api/v1/images/proxy', async (_request, reply) => reply.type('image/png').send(PIXEL));
};

export const embyMock: FastifyPluginAsync = async (app) => {
  app.post('/__reset', async () => ({ ok: true }));
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.endsWith('/__reset')) return;
    if (request.headers['x-emby-token'] !== EMBY_API_KEY)
      await reply.code(401).send('Unauthorized');
  });
  app.get('/emby/System/Info', async () => ({ ServerName: 'Emby E2E', Version: '4.8' }));
  app.get('/emby/Sessions', async () => [
    { Id: 'idle', UserName: 'bob', Client: 'Emby Web' },
    {
      Id: 'e1',
      UserName: 'alice',
      Client: 'Emby Theater',
      DeviceName: 'Salon',
      RemoteEndPoint: '192.168.1.20',
      PlayState: { PlayMethod: 'DirectPlay', PositionTicks: 12_000_000_000, IsPaused: false },
      NowPlayingItem: {
        Id: '3001',
        Type: 'Movie',
        Name: 'Le Phare des Brumes',
        ProductionYear: 2018,
        RunTimeTicks: 60_000_000_000,
      },
    },
  ]);
  app.get('/emby/Items', async () => ({
    Items: [{ Id: '3001', Type: 'Movie', ProviderIds: { Tmdb: '303' } }],
  }));
  app.get('/emby/Items/:id/Images/Primary', async (_request, reply) =>
    reply.type('image/png').send(PIXEL),
  );
};
