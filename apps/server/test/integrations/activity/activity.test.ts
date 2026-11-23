// SPDX-License-Identifier: AGPL-3.0-or-later
// Activité des serveurs média (P3e) : `TautulliClientTest`,
// `TautulliQuickLookResolveTest`, `TracearrClientTest`, `EmbyClientTest`,
// `ProxiedImageTest` et `ActivitySourceTest` portés (normalisations pures).

import { resolveActivitySource } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { episodeCode, rasterContentType } from '../../../src/integrations/activity/common';
import {
  embyLocation,
  isEmbyItemId,
  normalizeEmbySessions,
  tmdbIdFromItem,
} from '../../../src/integrations/activity/emby';
import {
  isProxyableTautulliImage,
  normalizeTautulliActivity,
  normalizeTautulliChart,
  normalizeTautulliHistory,
  normalizeTautulliMetadata,
  normalizeTautulliStats,
  tmdbIdFromMetadata,
} from '../../../src/integrations/activity/tautulli';
import {
  isCursor,
  isProxyableTracearrImage,
  isUuid,
  lastSeenByUser,
  normalizeTracearrCharts,
  normalizeTracearrHistory,
  normalizeTracearrStats,
  normalizeTracearrStreams,
  normalizeTracearrUsers,
} from '../../../src/integrations/activity/tracearr';

describe('source de l’activité', () => {
  const usable =
    (...ok: string[]) =>
    (service: string) =>
      ok.includes(service);
  it('auto : Tautulli d’abord ; préférence et repli ; rien d’utilisable', () => {
    expect(resolveActivitySource('auto', usable('tautulli', 'tracearr'))).toBe('tautulli');
    expect(resolveActivitySource('tracearr', usable('tautulli', 'tracearr'))).toBe('tracearr');
    expect(resolveActivitySource('tracearr', usable('tautulli'))).toBe('tautulli');
    expect(resolveActivitySource(null, usable())).toBeNull();
  });
});

describe('outils communs', () => {
  it('images matricielles seulement ; codes d’épisode', () => {
    expect(rasterContentType('image/jpg; charset=binary')).toBe('image/jpeg');
    expect(rasterContentType('image/webp')).toBe('image/webp');
    expect(rasterContentType('image/svg+xml')).toBeNull();
    expect(rasterContentType('text/html')).toBeNull();
    expect(episodeCode('episode', 1, 2)).toBe('S01E02');
    expect(episodeCode('episode', null, 2)).toBe('E02');
    expect(episodeCode('movie', 1, 2)).toBeNull();
  });
});

describe('Tautulli', () => {
  const session = {
    session_key: '7',
    rating_key: '42',
    state: 'playing',
    full_title: 'Série - Épisode',
    title: 'Épisode',
    grandparent_title: 'Série',
    media_type: 'episode',
    parent_media_index: '1',
    media_index: '3',
    grandparent_thumb: '/library/metadata/40/thumb/1',
    thumb: '/library/metadata/42/thumb/1',
    friendly_name: 'alice',
    user: 'alice@plex',
    ip_address: '10.0.0.1',
    progress_percent: '140',
    bandwidth: '8000',
    transcode_decision: 'transcode',
    stream_video_dynamic_range: 'HDR10',
  };

  it('activité : compteurs, bande passante, session normalisée sans champ privé', () => {
    const activity = normalizeTautulliActivity({
      stream_count: '2',
      stream_count_transcode: 1,
      total_bandwidth: 12000,
      lan_bandwidth: 2000,
      wan_bandwidth: 10000,
      sessions: [session, 'garbage'],
    });
    expect(activity).toMatchObject({
      streamCount: 2,
      transcodeCount: 1,
      bandwidth: { totalKbps: 12000, lanKbps: 2000, wanKbps: 10000 },
    });
    const [s] = activity.sessions;
    expect(s).toMatchObject({
      sessionKey: '7',
      title: 'Série - Épisode',
      episodeCode: 'S01E03',
      poster: 'api/tautulli/image?img=%2Flibrary%2Fmetadata%2F40%2Fthumb%2F1',
      userDisplayName: 'alice',
      progressPercent: 100,
      dynamicRange: 'HDR10',
      bandwidthKbps: 8000,
    });
    expect(JSON.stringify(s)).not.toContain('10.0.0.1');
    expect(JSON.stringify(s)).not.toContain('alice@plex');
  });

  it('film : affiche du film, titre nu en repli', () => {
    const [s] = normalizeTautulliActivity({
      sessions: [{ media_type: 'movie', title: 'Film', thumb: '/library/metadata/9/thumb/2' }],
    }).sessions;
    expect(s).toMatchObject({
      title: 'Film',
      episodeCode: null,
      poster: 'api/tautulli/image?img=%2Flibrary%2Fmetadata%2F9%2Fthumb%2F2',
    });
  });

  it('chemins d’images proxifiables', () => {
    expect(isProxyableTautulliImage('/library/metadata/1/thumb/2')).toBe(true);
    expect(isProxyableTautulliImage('/library/../etc/passwd')).toBe(false);
    expect(isProxyableTautulliImage('http://evil/x')).toBe(false);
    expect(isProxyableTautulliImage('/photo/x')).toBe(false);
  });

  it('métadonnées : champs, distribution limitée à 8, notes absentes ou nulles', () => {
    const meta = normalizeTautulliMetadata({
      media_type: 'movie',
      title: 'Film',
      year: 2020,
      duration: 5_400_000,
      rating: '0',
      actors: Array.from({ length: 12 }, (_, i) => `Acteur ${i}`),
      media_info: [{ video_full_resolution: '1080p', bitrate: '8000' }],
      user_id: 99,
    });
    expect(meta).toMatchObject({
      title: 'Film',
      year: '2020',
      durationMs: 5_400_000,
      ratings: { critic: 0, audience: null },
      media: { resolution: '1080p', bitrateKbps: 8000 },
    });
    expect(meta.cast).toHaveLength(8);
    expect(normalizeTautulliMetadata({}).media.resolution).toBeNull();
  });

  it('historique : affiche de la série pour un épisode, aucun identifiant Plex', () => {
    const [row] = normalizeTautulliHistory({
      data: [
        {
          media_type: 'episode',
          grandparent_thumb: '/library/a',
          thumb: '/library/b',
          parent_media_index: 2,
          media_index: 5,
          friendly_name: 'bob',
          user: 'bob@plex',
          date: 1700,
          percent_complete: 80,
        },
      ],
    });
    expect(row).toMatchObject({
      episodeCode: 'S02E05',
      poster: 'api/tautulli/image?img=%2Flibrary%2Fa',
      userDisplayName: 'bob',
      watchedAt: 1700,
      percentComplete: 80,
    });
    expect(JSON.stringify(row)).not.toContain('bob@plex');
  });

  it('statistiques : groupes, durées, populaires, simultanés ; vide', () => {
    const stats = normalizeTautulliStats([
      {
        stat_id: 'top_movies',
        rows: [
          { title: 'A', total_plays: 3, total_duration: 7200, thumb: '/library/m', user_id: 5 },
        ],
      },
      {
        stat_id: 'top_users',
        rows: [{ friendly_name: 'alice', total_plays: 9, total_duration: 60 }],
      },
      {
        stat_id: 'popular_tv',
        rows: [{ title: 'S', users_watched: 4, grandparent_thumb: '/library/s' }],
      },
      { stat_id: 'most_concurrent', rows: [{ title: 'Simultanés', count: 3 }] },
      'garbage',
    ]);
    expect(stats.topMovies[0]).toMatchObject({
      title: 'A',
      plays: 3,
      duration: 7200,
      poster: 'api/tautulli/image?img=%2Flibrary%2Fm',
    });
    expect(stats.topUsers[0]).toEqual({ userDisplayName: 'alice', plays: 9, duration: 60 });
    expect(stats.popularShows[0]).toMatchObject({ usersWatched: 4 });
    expect(stats.mostConcurrent).toEqual([{ title: 'Simultanés', count: 3 }]);
    expect(normalizeTautulliStats([]).topMovies).toEqual([]);
  });

  it('graphiques : série « Total » retirée, valeurs converties', () => {
    expect(
      normalizeTautulliChart({
        categories: ['a', 'b'],
        series: [{ name: 'Movies', data: ['1', 2] }, { name: 'Total', data: [3, 3] }, 'x'],
      }),
    ).toEqual({ categories: ['a', 'b'], series: [{ name: 'Movies', data: [1, 2] }] });
    expect(normalizeTautulliChart({})).toEqual({ categories: [], series: [] });
  });

  it('fiche TMDB d’après les guids (film, série, saison, épisode)', () => {
    expect(
      tmdbIdFromMetadata({ media_type: 'movie', guids: ['imdb://tt1', 'tmdb://603'] }),
    ).toEqual({ type: 'movie', id: 603 });
    expect(
      tmdbIdFromMetadata({ media_type: 'episode', grandparent_guids: ['tmdb://1399'] }),
    ).toEqual({ type: 'tv', id: 1399 });
    expect(tmdbIdFromMetadata({ media_type: 'season', parent_guids: ['tvdb://1'] })).toBeNull();
    expect(tmdbIdFromMetadata({ media_type: 'track', guids: ['tmdb://1'] })).toBeNull();
  });
});

describe('Tracearr', () => {
  const SERVER = '11111111-2222-3333-4444-555555555555';
  it('flux : résumé, cartes communes, décisions, appareil égal au produit retiré, sans champ privé', () => {
    const activity = normalizeTracearrStreams(
      {
        summary: {
          total: 3,
          direct_plays: 1,
          direct_streams: 1,
          transcodes: 1,
          total_bitrate: '24 Mbps',
        },
        data: [
          {
            media_type: 'movie',
            media_title: 'Film',
            tmdb_id: 603,
            server_id: SERVER,
            thumb_path: '/library/1/thumb',
            username: 'alice',
            ip_address: '1.2.3.4',
            is_transcode: true,
            bitrate: 20000,
            duration_ms: 1000,
            progress_ms: 250,
            product: 'Plex Web',
            device: 'Plex Web',
          },
          {
            mediaType: 'episode',
            showTitle: 'Série',
            seasonNumber: 1,
            episodeNumber: 2,
            mediaTitle: 'Ep',
            videoDecision: 'copy',
          },
          { mediaType: 'track', artistName: 'Artiste', mediaTitle: 'Piste' },
        ],
      },
      null,
    );
    expect(activity).toMatchObject({
      streamCount: 3,
      directPlayCount: 1,
      transcodeCount: 1,
      totalBitrate: '24 Mbps',
      bandwidth: null,
    });
    const [movie, episode, track] = activity.sessions;
    expect(movie).toMatchObject({
      title: 'Film',
      quickLook: { type: 'movie', id: 603 },
      transcodeDecision: 'transcode',
      device: null,
      progressPercent: 25,
    });
    expect(movie?.poster).toBe(`api/tracearr/image?server=${SERVER}&img=%2Flibrary%2F1%2Fthumb`);
    expect(JSON.stringify(movie)).not.toContain('1.2.3.4');
    expect(episode).toMatchObject({ title: 'Série — S01E02 · Ep', transcodeDecision: 'copy' });
    expect(track).toMatchObject({ title: 'Artiste — Piste', transcodeDecision: 'direct play' });
    expect(normalizeTracearrStreams({ data: 'x' }, null).sessions).toEqual([]);
  });

  it('série en v2 : fiche TMDB de la série', () => {
    const show = '99999999-2222-3333-4444-555555555555';
    const [s] = normalizeTracearrStreams(
      { data: [{ mediaType: 'episode', showMediaId: show }] },
      (id) => (id === show ? 1399 : null),
    ).sessions;
    expect(s?.quickLook).toEqual({ type: 'tv', id: 1399 });
  });

  it('statistiques', () => {
    expect(
      normalizeTracearrStats(
        { activeStreams: 2, totalUsers: 5, totalSessions: 40, recentViolations: 1 },
        { todayPlays: 3, watchTimeHours: 1.26 },
      ),
    ).toEqual({
      activeStreams: 2,
      totalUsers: 5,
      plays30d: 40,
      violations7d: 1,
      todayPlays: 3,
      watchTimeHours: 1.3,
      activeUsersToday: 0,
      alertsLast24h: 0,
    });
  });

  it('graphiques : lectures triées et additionnées, simultanés, heures, forme vide', () => {
    const charts = normalizeTracearrCharts({
      plays: [
        { date: '2026-11-20T00:00:00', count: 2 },
        { date: '2026-11-19T00:00:00', count: 1 },
        { date: '2026-11-20T00:00:00', count: 3 },
      ],
      concurrent: [{ date: '2026-11-19T14:00:00', direct: 1, directStream: 0, transcode: 2 }],
      byHourOfDay: [{ hour: 3, count: 4 }],
      byDayOfWeek: [{ day: 1, name: 'Lun', count: 0 }],
      quality: { directPlay: 5, total: 10, directPlayPercent: 50 },
    });
    expect(charts.plays).toEqual({
      categories: ['2026-11-19', '2026-11-20'],
      series: [{ name: 'Plays', data: [1, 5] }],
    });
    expect(charts.concurrent.categories).toEqual(['11-19 14h']);
    expect(charts.concurrent.series.map((s) => s.name)).toEqual([
      'Direct Play',
      'Direct Stream',
      'Transcode',
    ]);
    expect(charts.hour).toEqual({ categories: ['03'], series: [{ name: 'Plays', data: [4] }] });
    expect(charts.dow).toEqual({ categories: [], series: [] });
    expect(charts.quality).toMatchObject({ directPlay: 5, total: 10, directPlayPercent: 50 });
    expect(normalizeTracearrCharts({}).plays).toEqual({ categories: [], series: [] });
  });

  it('historique sans identifiant d’utilisateur ; dernière lecture tirée de l’historique', () => {
    const [row] = normalizeTracearrHistory(
      {
        data: [
          {
            media_type: 'movie',
            media_title: 'F',
            tmdb_id: 7,
            user: { id: 'u1', username: 'alice' },
            started_at: '2026-11-20T10:00:00Z',
            total_duration_ms: 100,
            progress_ms: 50,
            watched: true,
          },
        ],
      },
      null,
    );
    expect(row).toMatchObject({
      title: 'F',
      userDisplayName: 'alice',
      percentComplete: 50,
      watched: true,
      quickLook: { type: 'movie', id: 7 },
    });
    expect(JSON.stringify(row)).not.toContain('u1');
    const seen = lastSeenByUser({
      data: [
        { user: { id: 'u1' }, startedAt: '2026-11-20T10:00:00Z' },
        { user: { id: 'u1' }, startedAt: '2026-11-19T10:00:00Z' },
      ],
    });
    const users = normalizeTracearrUsers(
      { data: [{ id: 'u1', username: 'alice', sessionCount: 4, trustScore: '90' }] },
      seen,
    );
    expect(users[0]).toMatchObject({
      displayName: 'alice',
      plays: 4,
      trustScore: 90,
      lastSeen: Date.parse('2026-11-20T10:00:00Z') / 1000,
    });
  });

  it('validations : curseur, image, UUID', () => {
    expect(isCursor('p2')).toBe(true);
    expect(isCursor('abc_DEF-1')).toBe(true);
    expect(isCursor('a b')).toBe(false);
    expect(isProxyableTracearrImage('/library/1/thumb?tag=abc')).toBe(true);
    expect(isProxyableTracearrImage('//evil.com/x')).toBe(false);
    expect(isProxyableTracearrImage('/a/../b')).toBe(false);
    expect(isUuid(SERVER)).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });
});

describe('Emby', () => {
  const movie = {
    Id: 's1',
    UserName: 'alice',
    Client: 'Emby Web',
    DeviceName: 'Chrome',
    RemoteEndPoint: '192.168.1.10',
    PlayState: { PlayMethod: 'DirectPlay', PositionTicks: 25, IsPaused: false },
    NowPlayingItem: {
      Id: 'abcdef0123456789abcdef0123456789',
      Type: 'Movie',
      Name: 'Film',
      ProductionYear: 2020,
      RunTimeTicks: 100,
      Bitrate: 8_000_000,
      MediaStreams: [
        { Type: 'Video', Codec: 'hevc', Width: 3840, Height: 2160, VideoRange: 'HDR' },
        { Type: 'Audio', Codec: 'eac3' },
      ],
    },
  };
  it('sessions : inactives ignorées, compteurs dérivés, bande passante par réseau', () => {
    const activity = normalizeEmbySessions([
      { Id: 'idle', UserName: 'bob' },
      movie,
      {
        Id: 's2',
        RemoteEndPoint: '8.8.8.8',
        PlayState: { PlayMethod: 'Transcode' },
        TranscodingInfo: { Bitrate: 4_000_000, VideoCodec: 'h264', IsAudioDirect: true },
        NowPlayingItem: {
          Id: '12',
          SeriesId: '10',
          Type: 'Episode',
          SeriesName: 'Série',
          ParentIndexNumber: 1,
          IndexNumber: 2,
          Name: 'Ep',
          MediaStreams: [
            { Type: 'Video', Codec: 'hevc' },
            { Type: 'Audio', Codec: 'aac' },
          ],
        },
      },
    ]);
    expect(activity).toMatchObject({
      streamCount: 2,
      directPlayCount: 1,
      transcodeCount: 1,
      bandwidth: { lanKbps: 8000, wanKbps: 4000, totalKbps: 12000 },
    });
    const [film, episode] = activity.sessions;
    expect(film).toMatchObject({
      title: 'Film',
      quality: '4K',
      dynamicRange: 'HDR',
      progressPercent: 25,
      location: 'lan',
      poster: 'api/emby/image?item=abcdef0123456789abcdef0123456789',
    });
    expect(episode).toMatchObject({
      title: 'Série - S01E02 - Ep',
      poster: 'api/emby/image?item=10',
      streamVideoCodec: 'h264',
      streamAudioCodec: 'aac',
      videoDecision: 'transcode',
      audioDecision: 'copy',
      location: 'wan',
    });
    expect(JSON.stringify(activity)).not.toContain('192.168.1.10');
    expect(normalizeEmbySessions('garbage')).toMatchObject({ streamCount: 0, sessions: [] });
  });

  it('identifiants, adresse, fiche TMDB', () => {
    expect(isEmbyItemId('123')).toBe(true);
    expect(isEmbyItemId('abcdef0123456789abcdef0123456789')).toBe(true);
    expect(isEmbyItemId('../x')).toBe(false);
    expect(embyLocation('::ffff:10.0.0.2')).toBe('lan');
    expect(embyLocation('8.8.8.8:1234')).toBe('wan');
    expect(embyLocation('host')).toBeNull();
    expect(tmdbIdFromItem({ Type: 'Movie', ProviderIds: { Tmdb: '603' } })).toEqual({
      type: 'movie',
      id: 603,
    });
    expect(tmdbIdFromItem({ Type: 'Episode', ProviderIds: { Tmdb: '1' } })).toBeNull();
  });
});
