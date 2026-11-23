// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Tautulli (P3e.2) : port de `TautulliClient.php` sur le socle
// `integrations/http` (`/api/v2?apikey=…&cmd=…`).
//
// Comme l'original, aucune méthode ne lève : une panne donne une forme vide
// (`error` = `unreachable` ou `auth` pour l'activité, listes vides ailleurs),
// que la page et le widget affichent. Les affiches sont des chemins du proxy
// de Hubarr (`api/tautulli/image?img=/library/…`).

import type {
  Activity,
  ActivitySession,
  Chart,
  QuickLook,
  TautulliHistoryItem,
  TautulliMetadata,
  TautulliStats,
} from '@hubarr/shared';
import { UpstreamError, type HttpClient } from '../http';
import {
  clampPercent,
  emptyActivity,
  episodeCode,
  float,
  int,
  isNumeric,
  rasterContentType,
  record,
  rows,
  text,
  textList,
  type ProxiedImage,
} from './common';

/** Chemin d'image Plex proxifiable (`/library/…`, sans `..` ni `\`). */
export function isProxyableTautulliImage(img: string): boolean {
  if (img === '' || img.length > 512 || img.includes('..') || img.includes('\\')) return false;
  return /^\/library\/[A-Za-z0-9/_.-]+$/.test(img);
}

export function tautulliPoster(path: string | null): string | null {
  return path !== null && isProxyableTautulliImage(path)
    ? `api/tautulli/image?img=${encodeURIComponent(path)}`
    : null;
}

function pickPoster(s: Record<string, unknown>, mediaType: string | null): string | null {
  if (mediaType === 'episode' || mediaType === 'track') {
    return text(s.grandparent_thumb) ?? text(s.parent_thumb) ?? text(s.thumb);
  }
  return text(s.thumb) ?? text(s.grandparent_thumb);
}

export function normalizeTautulliSession(s: Record<string, unknown>): ActivitySession {
  const mediaType = text(s.media_type);
  return {
    sessionKey: text(s.session_key),
    ratingKey: text(s.rating_key),
    quickLook: null,
    state: text(s.state),
    title: text(s.full_title) ?? text(s.title),
    grandparentTitle: text(s.grandparent_title),
    episodeCode: episodeCode(mediaType, s.parent_media_index, s.media_index),
    year: text(s.year),
    mediaType,
    poster: tautulliPoster(pickPoster(s, mediaType)),
    serverName: null,
    userDisplayName: text(s.friendly_name) ?? text(s.user),
    product: text(s.product),
    player: text(s.player),
    device: text(s.device),
    platform: text(s.platform),
    quality: text(s.quality_profile),
    videoDecision: text(s.video_decision),
    audioDecision: text(s.audio_decision),
    subtitleDecision: text(s.subtitle_decision),
    dynamicRange: text(s.stream_video_dynamic_range) ?? text(s.video_dynamic_range),
    videoCodec: text(s.video_codec),
    streamVideoCodec: text(s.stream_video_codec),
    audioCodec: text(s.audio_codec),
    streamAudioCodec: text(s.stream_audio_codec),
    transcodeDecision: text(s.transcode_decision),
    location: text(s.location),
    bandwidthKbps: int(s.bandwidth),
    progressPercent: isNumeric(s.progress_percent) ? clampPercent(float(s.progress_percent)) : 0,
  };
}

export function normalizeTautulliActivity(
  data: Record<string, unknown>,
): Omit<Activity, 'enabled' | 'configured' | 'connected' | 'error'> {
  return {
    streamCount: int(data.stream_count),
    directPlayCount: int(data.stream_count_direct_play),
    directStreamCount: int(data.stream_count_direct_stream),
    transcodeCount: int(data.stream_count_transcode),
    bandwidth: {
      totalKbps: int(data.total_bandwidth),
      lanKbps: int(data.lan_bandwidth),
      wanKbps: int(data.wan_bandwidth),
    },
    totalBitrate: null,
    sessions: rows(data.sessions).map(normalizeTautulliSession),
  };
}

const emptyStats = (): TautulliStats => ({
  topMovies: [],
  topShows: [],
  popularMovies: [],
  popularShows: [],
  topUsers: [],
  topPlatforms: [],
  mostConcurrent: [],
});

/** Groupes de `get_home_stats` (`normalizeHomeStats`). */
export function normalizeTautulliStats(data: unknown): TautulliStats {
  const out = emptyStats();
  for (const group of rows(data)) {
    const list = rows(group.rows);
    const item = (r: Record<string, unknown>, posterFirst: 'thumb' | 'grandparent_thumb') => ({
      ratingKey: text(r.rating_key),
      title: text(r.title),
      year: text(r.year),
      poster: tautulliPoster(
        posterFirst === 'thumb'
          ? (text(r.thumb) ?? text(r.grandparent_thumb))
          : (text(r.grandparent_thumb) ?? text(r.thumb)),
      ),
      plays: int(r.total_plays),
      duration: int(r.total_duration),
      usersWatched: int(r.users_watched),
    });
    switch (text(group.stat_id)) {
      case 'top_movies':
        out.topMovies = list.map((r) => item(r, 'thumb'));
        break;
      case 'top_tv':
        out.topShows = list.map((r) => ({ ...item(r, 'grandparent_thumb'), year: null }));
        break;
      case 'popular_movies':
        out.popularMovies = list.map((r) => item(r, 'thumb'));
        break;
      case 'popular_tv':
        out.popularShows = list.map((r) => ({ ...item(r, 'grandparent_thumb'), year: null }));
        break;
      case 'top_users':
        out.topUsers = list.map((r) => ({
          userDisplayName: text(r.friendly_name),
          plays: int(r.total_plays),
          duration: int(r.total_duration),
        }));
        break;
      case 'top_platforms':
        out.topPlatforms = list.map((r) => ({
          platform: text(r.platform_name) ?? text(r.platform),
          plays: int(r.total_plays),
          duration: int(r.total_duration),
        }));
        break;
      case 'most_concurrent':
        out.mostConcurrent = list.map((r) => ({ title: text(r.title), count: int(r.count) }));
        break;
    }
  }
  return out;
}

/** Graphique de Tautulli sans la série « Total » (`normalizePlaysByDate`). */
export function normalizeTautulliChart(data: unknown): Chart {
  const d = record(data);
  return {
    categories: textList(d.categories),
    series: rows(d.series)
      .filter((s) => (text(s.name) ?? '').toLowerCase() !== 'total')
      .map((s) => ({
        name: text(s.name) ?? '',
        data: (Array.isArray(s.data) ? s.data : []).map((v) => int(v)),
      })),
  };
}

export function normalizeTautulliHistory(data: unknown): TautulliHistoryItem[] {
  return rows(record(data).data).map((r) => {
    const mediaType = text(r.media_type);
    return {
      ratingKey: text(r.rating_key),
      mediaType,
      title: text(r.title) ?? text(r.full_title),
      grandparentTitle: text(r.grandparent_title),
      year: text(r.year),
      episodeCode: episodeCode(mediaType, r.parent_media_index, r.media_index),
      poster: tautulliPoster(pickPoster(r, mediaType)),
      userDisplayName: text(r.friendly_name) ?? text(r.user),
      watchedAt: int(r.date),
      percentComplete: int(r.percent_complete),
    };
  });
}

export function normalizeTautulliMetadata(
  data: Record<string, unknown>,
): NonNullable<TautulliMetadata['metadata']> {
  const media = rows(data.media_info)[0] ?? {};
  return {
    mediaType: text(data.media_type),
    title: text(data.title),
    grandparentTitle: text(data.grandparent_title),
    year: text(data.year),
    season: isNumeric(data.parent_media_index) ? int(data.parent_media_index) : null,
    episode: isNumeric(data.media_index) ? int(data.media_index) : null,
    summary: text(data.summary),
    tagline: text(data.tagline),
    contentRating: text(data.content_rating),
    durationMs: int(data.duration),
    genres: textList(data.genres),
    ratings: {
      critic: isNumeric(data.rating) ? float(data.rating) : null,
      audience: isNumeric(data.audience_rating) ? float(data.audience_rating) : null,
    },
    directors: textList(data.directors),
    writers: textList(data.writers),
    cast: textList(data.actors).slice(0, 8),
    studio: text(data.studio),
    releaseDate: text(data.originally_available_at),
    media: {
      resolution: text(media.video_full_resolution) ?? text(media.video_resolution),
      videoCodec: text(media.video_codec),
      audioCodec: text(media.audio_codec),
      container: text(media.container),
      bitrateKbps: int(media.bitrate),
    },
  };
}

/** Fiche TMDB d'après les `guids` (`tmdbIdFromMetadata`). */
export function tmdbIdFromMetadata(data: Record<string, unknown>): QuickLook | null {
  const mediaType = text(data.media_type);
  const [type, field] =
    mediaType === 'movie'
      ? (['movie', 'guids'] as const)
      : mediaType === 'show'
        ? (['tv', 'guids'] as const)
        : mediaType === 'season'
          ? (['tv', 'parent_guids'] as const)
          : mediaType === 'episode'
            ? (['tv', 'grandparent_guids'] as const)
            : ([null, null] as const);
  if (type === null || !Array.isArray(data[field])) return null;
  for (const guid of data[field] as unknown[]) {
    const match = typeof guid === 'string' ? /^tmdb:\/\/(\d+)$/.exec(guid) : null;
    if (match?.[1] !== undefined) return { type, id: Number(match[1]) };
  }
  return null;
}

const clampRange = (days: number) => ([7, 30, 90].includes(days) ? days : 30);
const clampMetric = (metric: string) => (metric === 'duration' ? 'duration' : 'plays');
const userIdOf = (user: string) => (/^\d+$/.test(user) ? user : '');

type Response = { ok: true; data: Record<string, unknown> | unknown[] } | { ok: false } | null;

export class TautulliClient {
  constructor(private readonly http: HttpClient | null) {}

  /** Appel de l'API : `null` = injoignable, `ok: false` = refus (clé). */
  async #request(params: Record<string, string>): Promise<Response> {
    if (this.http === null) return null;
    let body: unknown;
    try {
      body = await this.http.get('/api/v2', params);
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.kind === 'http' &&
        error.info.status !== undefined &&
        error.info.status < 500
      ) {
        return { ok: false };
      }
      return null;
    }
    const response = record(record(body).response);
    if (response.result !== 'success') return { ok: false };
    const data = response.data;
    return { ok: true, data: Array.isArray(data) ? data : record(data) };
  }

  async #data(params: Record<string, string>): Promise<Record<string, unknown> | unknown[] | null> {
    const response = await this.#request(params);
    return response?.ok === true ? response.data : null;
  }

  async activity(enabled: boolean, configured: boolean): Promise<Activity> {
    const base = emptyActivity(enabled, configured, true);
    if (!enabled) return base;
    if (!configured) return { ...base, error: 'unconfigured' };
    const response = await this.#request({ cmd: 'get_activity' });
    if (response === null) return { ...base, error: 'unreachable' };
    if (!response.ok) return { ...base, error: 'auth' };
    return {
      enabled: true,
      configured: true,
      connected: true,
      error: null,
      ...normalizeTautulliActivity(record(response.data)),
    };
  }

  async metadata(ratingKey: string): Promise<TautulliMetadata> {
    if (!/^\d+$/.test(ratingKey)) return { error: 'not_found', metadata: null };
    const response = await this.#request({ cmd: 'get_metadata', rating_key: ratingKey });
    if (response === null) return { error: 'unreachable', metadata: null };
    if (!response.ok) return { error: 'auth', metadata: null };
    const data = record(response.data);
    if (Object.keys(data).length === 0) return { error: 'not_found', metadata: null };
    return { error: null, metadata: normalizeTautulliMetadata(data) };
  }

  /** Fiche TMDB d'un élément ; un épisode ou une saison remonte à sa série. */
  async resolveTmdbId(ratingKey: string): Promise<QuickLook | null> {
    if (!/^\d+$/.test(ratingKey)) return null;
    const data = record(await this.#data({ cmd: 'get_metadata', rating_key: ratingKey }));
    if (Object.keys(data).length === 0) return null;
    const found = tmdbIdFromMetadata(data);
    if (found !== null) return found;
    const mediaType = text(data.media_type);
    const showKey =
      mediaType === 'episode'
        ? text(data.grandparent_rating_key)
        : mediaType === 'season'
          ? text(data.parent_rating_key)
          : null;
    if (showKey === null || !/^\d+$/.test(showKey)) return null;
    const show = record(await this.#data({ cmd: 'get_metadata', rating_key: showKey }));
    return Object.keys(show).length === 0 ? null : tmdbIdFromMetadata(show);
  }

  async history(length: number, start: number, user: string): Promise<TautulliHistoryItem[]> {
    const data = await this.#data({
      cmd: 'get_history',
      length: String(Math.max(1, Math.min(50, length))),
      start: String(Math.max(0, start)),
      order_column: 'date',
      order_dir: 'desc',
      ...(userIdOf(user) ? { user_id: userIdOf(user) } : {}),
    });
    return data === null ? [] : normalizeTautulliHistory(data);
  }

  async homeStats(days: number, metric: string, user: string): Promise<TautulliStats> {
    const data = await this.#data({
      cmd: 'get_home_stats',
      time_range: String(clampRange(days)),
      stats_type: clampMetric(metric),
      stats_count: '5',
      ...(userIdOf(user) ? { user_id: userIdOf(user) } : {}),
    });
    return normalizeTautulliStats(data ?? []);
  }

  async chart(cmd: string, days: number, metric: string | null, user: string): Promise<Chart> {
    const data = await this.#data({
      cmd,
      time_range: String(clampRange(days)),
      ...(metric === null ? {} : { y_axis: clampMetric(metric) }),
      ...(userIdOf(user) ? { user_id: userIdOf(user) } : {}),
    });
    return normalizeTautulliChart(data ?? {});
  }

  async libraries() {
    const data = await this.#data({ cmd: 'get_libraries' });
    return rows(data).map((lib) => ({
      name: text(lib.section_name),
      type: text(lib.section_type),
      count: int(lib.count),
      childCount:
        lib.child_count === undefined || lib.child_count === null ? null : int(lib.child_count),
    }));
  }

  async usersTable() {
    const data = await this.#data({
      cmd: 'get_users_table',
      order_column: 'plays',
      order_dir: 'desc',
      length: '25',
    });
    return rows(record(data).data).map((r) => ({
      friendlyName: text(r.friendly_name) ?? text(r.user),
      lastSeen: int(r.last_seen),
      lastPlayed: text(r.last_played),
      plays: int(r.plays),
      durationSeconds: int(r.duration),
    }));
  }

  async userNames() {
    const data = await this.#data({ cmd: 'get_user_names' });
    return rows(data).flatMap((u) => {
      const name = text(u.friendly_name);
      const id = text(u.user_id);
      return name !== null && id !== null ? [{ name, id }] : [];
    });
  }

  /** Image Plex proxifiée (`pms_image_proxy`), matricielle seulement. */
  async image(img: string): Promise<ProxiedImage | null> {
    if (this.http === null || !isProxyableTautulliImage(img)) return null;
    try {
      const response = await this.http.request<Uint8Array>({
        path: '/api/v2',
        query: { cmd: 'pms_image_proxy', img, width: 300, height: 450, fallback: 'poster' },
        responseType: 'bytes',
        timeoutMs: 10_000,
      });
      const contentType = rasterContentType(response.headers['content-type']);
      return contentType === null || response.data.length === 0
        ? null
        : { body: response.data, contentType };
    } catch {
      return null;
    }
  }
}
