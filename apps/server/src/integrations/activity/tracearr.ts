// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Tracearr (P3e.3) : port de `TracearrClient.php` (API publique,
// jeton Bearer).
//
// - API v2 (`/api/v2/public`) essayée d'abord pour les flux et l'historique
//   (pagination par curseur, fiche TMDB d'une série) ; un 404 la marque
//   absente et l'API v1 (`/api/v1/public`, pagination par page, curseurs
//   synthétiques `p<n>`) prend le relais.
// - Aucune méthode ne lève : une panne donne une forme vide.
// - Affiches servies par le proxy de Hubarr (`api/tracearr/image?server=…&img=…`).

import type {
  Activity,
  ActivitySession,
  Chart,
  QuickLook,
  TracearrCharts,
  TracearrHistory,
  TracearrStats,
  TracearrUserDetail,
} from '@hubarr/shared';
import { createHmac, randomBytes } from 'node:crypto';
import { UpstreamError, type HttpClient } from '../http';
import {
  clampPercent,
  emptyActivity,
  float,
  int,
  isNumeric,
  rasterContentType,
  record,
  rows,
  text,
  type ProxiedImage,
} from './common';

export const TRACEARR_API_V1 = '/api/v1/public';
export const TRACEARR_API_V2 = '/api/v2/public';
const SHOW_TMDB_TTL_MS = 86_400_000;
const SHOW_TMDB_MISS_TTL_MS = 300_000;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isProxyableTracearrImage(img: string): boolean {
  if (
    img === '' ||
    img.length > 512 ||
    img.includes('..') ||
    img.includes('\\') ||
    img.startsWith('//')
  ) {
    return false;
  }
  return /^\/[A-Za-z0-9/_.-]+(\?tag=[A-Za-z0-9]+)?$/.test(img);
}

export function isCursor(cursor: string): boolean {
  return /^(p\d{1,6}|[A-Za-z0-9_-]{1,512})$/.test(cursor);
}

export function tracearrPoster(server: string | null, path: string | null): string | null {
  if (server === null || path === null || !isUuid(server) || !isProxyableTracearrImage(path))
    return null;
  return `api/tracearr/image?server=${encodeURIComponent(server)}&img=${encodeURIComponent(path)}`;
}

/** Clés `snake_case` → `camelCase` (`camelize`). */
export function camelize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}

/** Titre complet : « Série — S01E02 · Épisode », « Artiste — Piste », sinon le titre. */
export function fullTitle(r: Record<string, unknown>): string | null {
  const title = text(r.mediaTitle);
  const type = text(r.mediaType);
  const show = text(r.showTitle);
  if (type === 'episode' && show !== null) {
    let code = '';
    if (isNumeric(r.seasonNumber) && isNumeric(r.episodeNumber)) {
      code = `S${String(int(r.seasonNumber)).padStart(2, '0')}E${String(int(r.episodeNumber)).padStart(2, '0')}`;
    }
    const tail = `${code}${title !== null ? ` · ${title}` : ''}`.replace(/^ · /, '').trim();
    return tail === '' ? show : `${show} — ${tail}`;
  }
  const artist = text(r.artistName);
  if (type === 'track' && artist !== null) return `${artist}${title !== null ? ` — ${title}` : ''}`;
  return title;
}

type ShowTmdb = (mediaId: string) => number | null;

function quickLook(r: Record<string, unknown>, showTmdb: ShowTmdb | null): QuickLook | null {
  const type = text(r.mediaType);
  if (type === 'movie') {
    const id = int(r.tmdbId);
    return id > 0 ? { type: 'movie', id } : null;
  }
  if (type === 'episode' && showTmdb !== null) {
    const show = text(r.showMediaId);
    const id = show !== null && isUuid(show) ? showTmdb(show) : null;
    return id !== null ? { type: 'tv', id } : null;
  }
  return null;
}

export function normalizeTracearrStream(
  raw: Record<string, unknown>,
  showTmdb: ShowTmdb | null,
): ActivitySession {
  const s = camelize(raw);
  const video = text(s.videoDecision);
  const audio = text(s.audioDecision);
  const decision =
    s.isTranscode === true
      ? 'transcode'
      : video === 'copy' || audio === 'copy'
        ? 'copy'
        : 'direct play';
  const bitrate = int(s.bitrate);
  const duration = int(s.durationMs);
  const progress = int(s.progressMs);
  const product = text(s.product);
  let device = text(s.device);
  if (device !== null && device === product) device = null;
  return {
    sessionKey: text(s.id),
    ratingKey: null,
    quickLook: quickLook(s, showTmdb),
    state: text(s.state),
    title: fullTitle(s),
    grandparentTitle: null,
    episodeCode: null,
    year: text(s.year),
    mediaType: text(s.mediaType),
    poster: tracearrPoster(text(s.serverId), text(s.thumbPath)),
    serverName: text(s.serverName),
    userDisplayName: text(s.username),
    product,
    player: text(s.player),
    device,
    platform: text(s.platform),
    quality: text(s.resolution),
    videoDecision: video,
    audioDecision: audio,
    subtitleDecision: null,
    dynamicRange: text(record(s.sourceVideoDetails).dynamicRange),
    videoCodec: text(s.sourceVideoCodecDisplay) ?? text(s.sourceVideoCodec),
    streamVideoCodec: text(s.streamVideoCodecDisplay) ?? text(s.streamVideoCodec),
    audioCodec: text(s.sourceAudioCodecDisplay) ?? text(s.sourceAudioCodec),
    streamAudioCodec: text(s.streamAudioCodecDisplay) ?? text(s.streamAudioCodec),
    transcodeDecision: decision,
    location: null,
    bandwidthKbps: bitrate,
    progressPercent: duration > 0 ? clampPercent((progress / duration) * 100) : 0,
  };
}

export function normalizeTracearrStreams(
  data: Record<string, unknown>,
  showTmdb: ShowTmdb | null,
): Omit<Activity, 'enabled' | 'configured' | 'connected' | 'error'> {
  const sessions = rows(data.data).map((s) => normalizeTracearrStream(s, showTmdb));
  const summary = camelize(record(data.summary));
  return {
    streamCount: summary.total === undefined ? sessions.length : int(summary.total),
    directPlayCount: int(summary.directPlays),
    directStreamCount: int(summary.directStreams),
    transcodeCount: int(summary.transcodes),
    bandwidth: null,
    totalBitrate: text(summary.totalBitrate),
    sessions,
  };
}

export function normalizeTracearrStats(
  overview: Record<string, unknown>,
  today: Record<string, unknown>,
): TracearrStats {
  return {
    activeStreams: int(overview.activeStreams ?? today.activeStreams),
    totalUsers: int(overview.totalUsers),
    plays30d: int(overview.totalSessions),
    violations7d: int(overview.recentViolations),
    todayPlays: int(today.todayPlays),
    watchTimeHours: Math.round(float(today.watchTimeHours) * 10) / 10,
    activeUsersToday: int(today.activeUsersToday),
    alertsLast24h: int(today.alertsLast24h),
  };
}

const EMPTY_CHART: Chart = { categories: [], series: [] };

const pad = (n: number) => String(n).padStart(2, '0');

/** Étiquette d'un créneau : date seule à minuit, sinon « MM-JJ HHh » (heure locale du serveur). */
export function formatBucket(date: Date): string {
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}h`;
}

function parseDate(raw: string | null): Date | null {
  if (raw === null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeTracearrCharts(data: Record<string, unknown>): TracearrCharts {
  const byTs = new Map<number, number>();
  for (const r of rows(data.plays)) {
    const date = parseDate(text(r.date));
    if (date !== null) byTs.set(date.getTime(), (byTs.get(date.getTime()) ?? 0) + int(r.count));
  }
  const plays = [...byTs.entries()].sort((a, b) => a[0] - b[0]);
  const playLabels = new Map<string, number>();
  for (const [ts, count] of plays) playLabels.set(formatBucket(new Date(ts)), count);

  const concurrent = {
    categories: [] as string[],
    direct: [] as number[],
    directStream: [] as number[],
    transcode: [] as number[],
  };
  for (const r of rows(data.concurrent)) {
    const date = parseDate(text(r.date));
    if (date === null) continue;
    concurrent.categories.push(formatBucket(date));
    concurrent.direct.push(int(r.direct));
    concurrent.directStream.push(int(r.directStream));
    concurrent.transcode.push(int(r.transcode));
  }
  const hour = rows(data.byHourOfDay).map((r) => [pad(int(r.hour)), int(r.count)] as const);
  const dow = rows(data.byDayOfWeek).map(
    (r) => [text(r.name) ?? text(r.day) ?? '', int(r.count)] as const,
  );
  const platforms = rows(data.platforms)
    .slice(0, 10)
    .map((r) => [text(r.platform) ?? '—', int(r.count)] as const);
  const single = (pairs: readonly (readonly [string, number])[]): Chart =>
    pairs.length === 0 || pairs.every(([, count]) => count === 0)
      ? EMPTY_CHART
      : {
          categories: pairs.map(([label]) => label),
          series: [{ name: 'Plays', data: pairs.map(([, count]) => count) }],
        };
  const q = record(data.quality);
  return {
    plays:
      playLabels.size === 0
        ? EMPTY_CHART
        : {
            categories: [...playLabels.keys()],
            series: [{ name: 'Plays', data: [...playLabels.values()] }],
          },
    concurrent:
      concurrent.categories.length === 0
        ? EMPTY_CHART
        : {
            categories: concurrent.categories,
            series: [
              { name: 'Direct Play', data: concurrent.direct },
              { name: 'Direct Stream', data: concurrent.directStream },
              { name: 'Transcode', data: concurrent.transcode },
            ],
          },
    hour: single(hour),
    dow: single(dow),
    platforms:
      platforms.length === 0
        ? EMPTY_CHART
        : {
            categories: platforms.map(([l]) => l),
            series: [{ name: 'Plays', data: platforms.map(([, c]) => c) }],
          },
    quality: {
      directPlay: int(q.directPlay),
      directStream: int(q.directStream),
      transcode: int(q.transcode),
      total: int(q.total),
      directPlayPercent: int(q.directPlayPercent),
      directStreamPercent: int(q.directStreamPercent),
      transcodePercent: int(q.transcodePercent),
    },
  };
}

export function normalizeTracearrHistory(
  data: Record<string, unknown>,
  showTmdb: ShowTmdb | null,
): TracearrHistory['rows'] {
  return rows(data.data).map((raw) => {
    const r = camelize(raw);
    const total = int(r.totalDurationMs);
    const progress = int(r.progressMs);
    const started = parseDate(text(r.startedAt));
    return {
      quickLook: quickLook(r, showTmdb),
      title: fullTitle(r),
      year: text(r.year),
      mediaType: text(r.mediaType),
      poster: tracearrPoster(text(r.serverId), text(r.thumbPath)),
      serverName: text(r.serverName),
      userKey: tracearrUserKey(text(record(r.user).id) ?? text(r.userId)),
      userDisplayName: text(record(r.user).username),
      showTitle: text(r.mediaType) === 'episode' ? text(r.showTitle) : null,
      platform: text(r.platform),
      watchedAt: started === null ? 0 : Math.floor(started.getTime() / 1000),
      durationMs: int(r.durationMs),
      watched: r.watched === true,
      percentComplete: total > 0 ? clampPercent((progress / total) * 100) : 0,
    };
  });
}

/** Dernière lecture par utilisateur, tirée de l'historique (`lastSeenByUser`). */
export function lastSeenByUser(data: Record<string, unknown>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows(data.data)) {
    const id = text(record(r.user).id);
    const date = parseDate(text(r.startedAt) ?? text(r.started_at));
    const ts = date === null ? 0 : Math.floor(date.getTime() / 1000);
    if (id !== null && ts > (out.get(id) ?? 0)) out.set(id, ts);
  }
  return out;
}

export function normalizeTracearrUsers(data: Record<string, unknown>, seen: Map<string, number>) {
  return rows(data.data).map((r) => {
    const last = parseDate(text(r.lastActivityAt));
    return {
      key: tracearrUserKey(text(r.id)),
      displayName: text(r.displayName) ?? text(r.username),
      serverName: text(r.serverName),
      lastSeen:
        last !== null ? Math.floor(last.getTime() / 1000) : (seen.get(text(r.id) ?? '') ?? 0),
      plays: int(r.sessionCount),
      trustScore: isNumeric(r.trustScore) ? int(r.trustScore) : null,
    };
  });
}

/** Lignes d'historique parcourues au plus pour une fiche utilisateur. */
export const USER_HISTORY_SCAN = 500;
/** Lectures affichées sur la fiche utilisateur. */
export const USER_HISTORY_ROWS = 50;

// Clé tirée au démarrage : les identifiants Tracearr des utilisateurs ne sont
// jamais envoyés au navigateur (règle de `TracearrClientTest`), seul un jeton
// HMAC l'est. Il change à chaque redémarrage, ce qui suffit à une adresse de page.
const USER_KEY_SECRET = randomBytes(32);

/** Jeton opaque et stable (pour ce processus) d'un utilisateur Tracearr. */
export function tracearrUserKey(id: string | null): string | null {
  if (id === null || id === '') return null;
  return createHmac('sha256', USER_KEY_SECRET).update(id).digest('base64url').slice(0, 22);
}

export function isTracearrUserKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(key);
}

function topCounts(values: (string | null)[], limit: number): { name: string; plays: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v !== null && v !== '') counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([name, plays]) => ({ name, plays }))
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Statistiques d'un utilisateur calculées sur ses lectures (fiche utilisateur). */
export function tracearrUserStats(rows: TracearrHistory['rows']): TracearrUserDetail['stats'] {
  return {
    plays: rows.length,
    watchTimeMs: rows.reduce((sum, r) => sum + r.durationMs, 0),
    movies: rows.filter((r) => r.mediaType === 'movie').length,
    episodes: rows.filter((r) => r.mediaType === 'episode').length,
    lastSeen: rows.reduce((max, r) => Math.max(max, r.watchedAt), 0),
    platforms: topCounts(
      rows.map((r) => r.platform),
      6,
    ),
    topTitles: topCounts(
      rows.map((r) => r.showTitle ?? r.title),
      5,
    ),
  };
}

/** Identité Tracearr (API v2 `/users`), regroupant ses comptes de serveur. */
export interface TracearrIdentity {
  id: string;
  name: string;
}

/** Lecture de l'historique v2 réduite à ce que la synchronisation « Vu » garde. */
export interface TracearrWatchRow {
  recordId: string;
  mediaType: 'movie' | 'episode';
  /** Film : son ID TMDB ; épisode : `null` (la série passe par `showMediaId`). */
  tmdbId: number | null;
  showMediaId: string | null;
  season: number | null;
  episode: number | null;
  startedAt: number;
  percent: number;
  watched: boolean;
}

export interface TracearrShowIds {
  tmdbId: number | null;
  tvdbId: number | null;
}

export function normalizeTracearrIdentities(data: Record<string, unknown>): TracearrIdentity[] {
  return rows(data.data).flatMap((raw) => {
    const r = camelize(raw);
    const id = text(r.id);
    const name = text(r.identityName) ?? text(r.username);
    return id === null || name === null ? [] : [{ id, name }];
  });
}

/** Lignes d'historique v2 utiles au « Vu » : films (avec ID TMDB) et épisodes. */
export function normalizeTracearrWatchRows(data: Record<string, unknown>): TracearrWatchRow[] {
  return rows(data.data).flatMap((raw): TracearrWatchRow[] => {
    const r = camelize(raw);
    const recordId = text(r.id);
    const type = text(r.mediaType);
    const started = parseDate(text(r.startedAt));
    if (recordId === null || started === null || (type !== 'movie' && type !== 'episode'))
      return [];
    const tmdb = int(r.tmdbId);
    if (type === 'movie' && tmdb <= 0) return [];
    const show = text(r.showMediaId);
    const total = int(r.totalDurationMs);
    const percent = isNumeric(r.percentComplete)
      ? clampPercent(float(r.percentComplete))
      : total > 0
        ? clampPercent((int(r.progressMs) / total) * 100)
        : 0;
    return [
      {
        recordId,
        mediaType: type,
        tmdbId: type === 'movie' ? tmdb : null,
        showMediaId: type === 'episode' && show !== null && isUuid(show) ? show : null,
        season: isNumeric(r.seasonNumber) ? int(r.seasonNumber) : null,
        episode: isNumeric(r.episodeNumber) ? int(r.episodeNumber) : null,
        startedAt: started.getTime(),
        percent: Math.round(percent),
        watched: r.watched === true,
      },
    ];
  });
}

type Response = { ok: true; data: Record<string, unknown> } | { ok: false } | null;

export interface TracearrCache {
  get(key: string): unknown;
  set(key: string, value: unknown, ttlMs: number): void;
}

export class TracearrClient {
  #v2: boolean | null = null;

  constructor(
    private readonly http: HttpClient | null,
    private readonly cache: TracearrCache | null = null,
    private readonly timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  ) {}

  /** `null` = injoignable ou erreur, `ok: false` = 401/403 ; `404` remonté pour la détection de la v2. */
  async #request(
    path: string,
    query: Record<string, string> = {},
    base = TRACEARR_API_V1,
  ): Promise<Response | 404> {
    if (this.http === null) return null;
    try {
      const data = await this.http.get(`${base}${path}`, query);
      return { ok: true, data: record(data) };
    } catch (error) {
      if (error instanceof UpstreamError && error.kind === 'http') {
        if (error.info.status === 401 || error.info.status === 403) return { ok: false };
        if (error.info.status === 404) return 404;
      }
      return null;
    }
  }

  async #v1(path: string, query: Record<string, string> = {}): Promise<Response> {
    const response = await this.#request(path, query);
    return response === 404 ? null : response;
  }

  /** API v2 ; `false` = absente (404 une fois, mémorisé). */
  async #v2Request(path: string, query: Record<string, string> = {}): Promise<Response | false> {
    if (this.#v2 === false) return false;
    const response = await this.#request(path, query, TRACEARR_API_V2);
    if (response === 404) {
      this.#v2 = false;
      return false;
    }
    if (response !== null) this.#v2 = true;
    return response;
  }

  /** Fiche TMDB d'une série (v2 `/media/:id`), gardée 24 h (5 min si absente). */
  async #showTmdbIds(mediaIds: string[]): Promise<ShowTmdb> {
    const found = new Map<string, number | null>();
    for (const id of [...new Set(mediaIds.filter(isUuid))]) {
      const key = `tracearr.show_tmdb.${id}`;
      const cached = this.cache?.get(key);
      if (cached !== undefined) {
        found.set(id, cached as number | null);
        continue;
      }
      const response = await this.#request(`/media/${id}`, {}, TRACEARR_API_V2);
      const data = response !== null && response !== 404 && response.ok ? response.data : null;
      const tmdb =
        data !== null && data.media_type === 'show' && int(data.tmdb_id) > 0
          ? int(data.tmdb_id)
          : null;
      this.cache?.set(key, tmdb, tmdb === null ? SHOW_TMDB_MISS_TTL_MS : SHOW_TMDB_TTL_MS);
      found.set(id, tmdb);
    }
    return (id) => found.get(id) ?? null;
  }

  async #lookup(list: unknown): Promise<ShowTmdb> {
    return this.#showTmdbIds(
      rows(list).flatMap((r) => {
        const row = camelize(r);
        return row.mediaType === 'episode' && typeof row.showMediaId === 'string'
          ? [row.showMediaId]
          : [];
      }),
    );
  }

  async activity(enabled: boolean, configured: boolean): Promise<Activity> {
    const base = emptyActivity(enabled, configured, false);
    if (!enabled) return base;
    if (!configured) return { ...base, error: 'unconfigured' };
    let response = await this.#v2Request('/streams');
    if (response === false) response = await this.#v1('/streams');
    if (response === null) return { ...base, error: 'unreachable' };
    if (!response.ok) return { ...base, error: 'auth' };
    const showTmdb = await this.#lookup(response.data.data);
    return {
      enabled: true,
      configured: true,
      connected: true,
      error: null,
      ...normalizeTracearrStreams(response.data, showTmdb),
    };
  }

  /**
   * Arrête une lecture en cours (API v1 seulement : la v2 n'a pas de route
   * d'arrêt). Contrairement aux lectures, lève : `false` si Tracearr ne
   * connaît plus la session (404) ou l'a déjà arrêtée (409), une
   * `UpstreamError` pour toute autre panne.
   */
  async terminate(sessionId: string, reason: string | undefined): Promise<boolean> {
    if (this.http === null) throw new UpstreamError('not_configured', { service: 'tracearr' });
    try {
      await this.http.post(
        `${TRACEARR_API_V1}/streams/${encodeURIComponent(sessionId)}/terminate`,
        reason === undefined || reason === '' ? {} : { reason },
      );
      return true;
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.kind === 'http' &&
        (error.info.status === 404 || error.info.status === 409)
      )
        return false;
      throw error;
    }
  }

  async stats(): Promise<TracearrStats> {
    const [overview, today] = await Promise.all([
      this.#v1('/stats'),
      this.#v1('/stats/today', { timezone: this.timezone }),
    ]);
    return normalizeTracearrStats(
      overview?.ok === true ? overview.data : {},
      today?.ok === true ? today.data : {},
    );
  }

  async charts(period: string): Promise<TracearrCharts> {
    const response = await this.#v1('/activity', {
      period: ['week', 'month', 'year'].includes(period) ? period : 'month',
      timezone: this.timezone,
    });
    return normalizeTracearrCharts(response?.ok === true ? response.data : {});
  }

  async history(
    cursor: string | null,
    pageSize = 24,
    filter: { userId?: string } = {},
  ): Promise<TracearrHistory> {
    const empty = { rows: [], nextCursor: null };
    if (cursor !== null && !isCursor(cursor)) return empty;
    const size = Math.max(1, Math.min(100, pageSize));
    // Filtre transmis à Tracearr ; une version qui l'ignore est filtrée ensuite.
    const extra = filter.userId !== undefined ? { userId: filter.userId } : {};
    const match = cursor === null ? null : /^p(\d{1,6})$/.exec(cursor);
    let page = match?.[1] !== undefined ? Math.max(1, Number(match[1])) : null;
    if (page === null) {
      const response = await this.#v2Request('/history', {
        pageSize: String(size),
        ...extra,
        ...(cursor !== null ? { cursor } : {}),
      });
      if (response !== false) {
        if (!response?.ok) return empty;
        const next = text(record(response.data.meta).nextCursor);
        return {
          rows: normalizeTracearrHistory(response.data, await this.#lookup(response.data.data)),
          nextCursor: next !== null && isCursor(next) ? next : null,
        };
      }
      page = 1;
    }
    const response = await this.#v1('/history', {
      page: String(page),
      pageSize: String(size),
      ...extra,
    });
    if (!response?.ok) return empty;
    const total = int(record(response.data.meta).total);
    return {
      rows: normalizeTracearrHistory(response.data, null),
      nextCursor: page * size < total ? `p${page + 1}` : null,
    };
  }

  async users() {
    const response = await this.#v1('/users', { page: '1', pageSize: '100' });
    if (!response?.ok) return [];
    let seen = new Map<string, number>();
    if (rows(response.data.data).some((u) => text(u.lastActivityAt) === null)) {
      const history = await this.#v1('/history', { page: '1', pageSize: '100' });
      if (history?.ok === true) seen = lastSeenByUser(history.data);
    }
    return normalizeTracearrUsers(response.data, seen);
  }

  /**
   * Fiche d'un utilisateur, désigné par son jeton : l'API publique n'a pas de
   * route dédiée, on parcourt donc l'historique récent (au plus
   * `USER_HISTORY_SCAN` lignes) en ne gardant que ses lectures. `null` si
   * l'utilisateur est inconnu.
   */
  async userDetail(key: string): Promise<TracearrUserDetail | null> {
    if (!isTracearrUserKey(key) || this.http === null) return null;
    const response = await this.#v1('/users', { page: '1', pageSize: '100' });
    if (!response?.ok) return null;
    const raw = rows(response.data.data).find((u) => tracearrUserKey(text(u.id)) === key);
    const id = raw === undefined ? null : text(raw.id);
    if (raw === undefined || id === null) return null;
    const user = normalizeTracearrUsers({ data: [raw] }, new Map())[0];
    if (user === undefined) return null;
    const mine: TracearrHistory['rows'] = [];
    let scanned = 0;
    let cursor: string | null = null;
    do {
      const page: TracearrHistory = await this.history(cursor, 100, { userId: id });
      if (page.rows.length === 0) break;
      scanned += page.rows.length;
      mine.push(...page.rows.filter((r) => r.userKey === key));
      cursor = page.nextCursor;
    } while (cursor !== null && scanned < USER_HISTORY_SCAN);
    mine.sort((a, b) => b.watchedAt - a.watchedAt);
    const stats = tracearrUserStats(mine);
    return {
      user: { ...user, lastSeen: Math.max(user.lastSeen, stats.lastSeen) },
      stats,
      history: mine.slice(0, USER_HISTORY_ROWS),
      scannedRows: scanned,
      truncated: cursor !== null,
    };
  }

  /**
   * Identités Tracearr (API v2 `/users`, au plus 1 000). `unsupported` si la
   * v2 est absente, `null` si Tracearr ne répond pas : le « Vu » exige la v2
   * (seul son historique porte les ID TMDB et le filtre par utilisateur).
   */
  async identities(): Promise<TracearrIdentity[] | 'unsupported' | null> {
    const out: TracearrIdentity[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const response = await this.#v2Request('/users', {
        pageSize: '100',
        ...(cursor !== null ? { cursor } : {}),
      });
      if (response === false) return 'unsupported';
      if (!response?.ok) return null;
      out.push(...normalizeTracearrIdentities(response.data));
      const next = text(record(response.data.meta).nextCursor);
      cursor = next !== null && isCursor(next) ? next : null;
      if (cursor === null) break;
    }
    return out;
  }

  /**
   * Page d'historique v2 d'une identité (synchronisation « Vu »), à partir de
   * `since` le cas échéant. `null` : v2 absente, refus ou panne.
   */
  async watchPage(
    userId: string,
    since: Date | null,
    cursor: string | null,
  ): Promise<{ rows: TracearrWatchRow[]; nextCursor: string | null } | null> {
    if (cursor !== null && !isCursor(cursor)) return null;
    const response = await this.#v2Request('/history', {
      user_id: userId,
      pageSize: '100',
      ...(since !== null ? { since: since.toISOString() } : {}),
      ...(cursor !== null ? { cursor } : {}),
    });
    if (response === false || !response?.ok) return null;
    const next = text(record(response.data.meta).nextCursor);
    return {
      rows: normalizeTracearrWatchRows(response.data),
      nextCursor: next !== null && isCursor(next) ? next : null,
    };
  }

  /** ID TMDB et TVDB de séries Tracearr (v2 `/media/:id`), gardés 24 h (5 min si absents). */
  async showIds(mediaIds: string[]): Promise<Map<string, TracearrShowIds>> {
    const found = new Map<string, TracearrShowIds>();
    for (const id of [...new Set(mediaIds.filter(isUuid))]) {
      const key = `tracearr.show_ids.${id}`;
      const cached = this.cache?.get(key) as TracearrShowIds | undefined;
      if (cached !== undefined) {
        found.set(id, cached);
        continue;
      }
      const response = await this.#request(`/media/${id}`, {}, TRACEARR_API_V2);
      const data = response !== null && response !== 404 && response.ok ? response.data : null;
      const ids: TracearrShowIds = {
        tmdbId: data !== null && int(data.tmdb_id) > 0 ? int(data.tmdb_id) : null,
        tvdbId: data !== null && int(data.tvdb_id) > 0 ? int(data.tvdb_id) : null,
      };
      const miss = ids.tmdbId === null && ids.tvdbId === null;
      this.cache?.set(key, ids, miss ? SHOW_TMDB_MISS_TTL_MS : SHOW_TMDB_TTL_MS);
      found.set(id, ids);
    }
    return found;
  }

  async image(server: string, img: string): Promise<ProxiedImage | null> {
    if (this.http === null || !isUuid(server) || !isProxyableTracearrImage(img)) return null;
    try {
      const response = await this.http.request<Uint8Array>({
        path: '/api/v1/images/proxy',
        query: { server, url: img, width: 300, height: 450, fallback: 'poster' },
        headers: { accept: 'image/*' },
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
