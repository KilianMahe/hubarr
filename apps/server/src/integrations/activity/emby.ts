// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Emby (P3e.3) : port de `EmbyClient.php` (jeton `X-Emby-Token`,
// préfixe `/emby` ajouté s'il manque).
//
// Seules les sessions qui lisent quelque chose comptent ; décision de
// lecture tirée de `PlayMethod`, bande passante répartie entre réseau local
// et Internet d'après l'adresse distante. Aucune méthode ne lève.

import type { Activity, ActivitySession, QuickLook } from '@hubarr/shared';
import { isIP } from 'node:net';
import { UpstreamError, type HttpClient } from '../http';
import {
  clampPercent,
  emptyActivity,
  int,
  isNumeric,
  rasterContentType,
  record,
  rows,
  text,
  type ProxiedImage,
} from './common';

/** Identifiant Emby : numérique (20 chiffres au plus) ou 32 caractères hexadécimaux. */
export function isEmbyItemId(id: string): boolean {
  return /^(?:[0-9]{1,20}|[0-9a-fA-F]{32})$/.test(id);
}

/** URL de base avec le préfixe `/emby`. */
export function embyBaseUrl(url: string): string {
  const base = url.replace(/\/+$/, '');
  return base.toLowerCase().endsWith('/emby') ? base : `${base}/emby`;
}

export function embyPoster(id: string | null): string | null {
  return id !== null && isEmbyItemId(id) ? `api/emby/image?item=${encodeURIComponent(id)}` : null;
}

export function qualityLabel(video: Record<string, unknown>): string | null {
  const w = int(video.Width);
  const h = int(video.Height);
  if (w <= 0 && h <= 0) return null;
  if (w >= 3200 || h >= 2000) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

export function dynamicRange(video: Record<string, unknown>): string | null {
  const ext = (text(video.ExtendedVideoType) ?? '').toLowerCase();
  if (ext.includes('dolby')) return 'Dolby Vision';
  if (ext.includes('plus')) return 'HDR10+';
  const range = text(video.VideoRange);
  if (range === null) return null;
  switch (range.toLowerCase()) {
    case 'dolbyvision':
      return 'Dolby Vision';
    case 'hdr':
    case 'hdr10':
      return 'HDR';
    case 'sdr':
      return 'SDR';
    default:
      return range;
  }
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

/** `lan` ou `wan` d'après l'adresse distante (`RemoteEndPoint`), `null` si illisible. */
export function embyLocation(endpoint: string | null): 'lan' | 'wan' | null {
  if (endpoint === null) return null;
  let host = endpoint.startsWith('::ffff:') ? endpoint.slice(7) : endpoint;
  if ((host.match(/:/g) ?? []).length === 1) host = host.split(':')[0] ?? host;
  host = host.replace(/^\[|\]$/g, '');
  if (isIP(host) === 0) return null;
  return isPrivateIp(host) ? 'lan' : 'wan';
}

function pickStreams(
  item: Record<string, unknown>,
): [Record<string, unknown>, Record<string, unknown>] {
  let video: Record<string, unknown> = {};
  let audio: Record<string, unknown> = {};
  for (const st of rows(item.MediaStreams)) {
    const kind = text(st.Type);
    const isDefault = st.IsDefault === true;
    if (kind === 'Video' && (Object.keys(video).length === 0 || isDefault)) video = st;
    else if (kind === 'Audio' && (Object.keys(audio).length === 0 || isDefault)) audio = st;
  }
  return [video, audio];
}

function fullTitle(item: Record<string, unknown>, mediaType: string | null): string | null {
  const name = text(item.Name);
  if (mediaType !== 'episode') return name;
  const parts: string[] = [];
  const series = text(item.SeriesName);
  if (series !== null) parts.push(series);
  if (isNumeric(item.ParentIndexNumber) && isNumeric(item.IndexNumber)) {
    parts.push(
      `S${String(int(item.ParentIndexNumber)).padStart(2, '0')}E${String(int(item.IndexNumber)).padStart(2, '0')}`,
    );
  }
  if (name !== null) parts.push(name);
  return parts.length === 0 ? null : parts.join(' - ');
}

export function normalizeEmbySession(s: Record<string, unknown>): ActivitySession {
  const item = record(s.NowPlayingItem);
  const play = record(s.PlayState);
  const trans = record(s.TranscodingInfo);
  const type = (text(item.Type) ?? '').toLowerCase();
  const mediaType =
    type === 'movie'
      ? 'movie'
      : type === 'episode'
        ? 'episode'
        : type === 'audio'
          ? 'track'
          : type !== ''
            ? type
            : null;
  const [video, audio] = pickStreams(item);
  let sourceBitrate = int(item.Bitrate);
  if (sourceBitrate <= 0) sourceBitrate = int(rows(item.MediaSources)[0]?.Bitrate);
  const method = text(play.PlayMethod);
  const decision =
    method === 'DirectPlay'
      ? 'direct play'
      : method === 'DirectStream'
        ? 'copy'
        : method === 'Transcode'
          ? 'transcode'
          : null;
  const bitrate =
    decision === 'transcode' && int(trans.Bitrate) > 0 ? int(trans.Bitrate) : sourceBitrate;
  const kbps = Math.round(bitrate / 1000);
  const videoDirect = decision !== 'transcode' || trans.IsVideoDirect === true;
  const audioDirect = decision !== 'transcode' || trans.IsAudioDirect === true;
  const runtime = int(item.RunTimeTicks);
  const position = int(play.PositionTicks);
  const own = text(item.Id);
  const posterId =
    mediaType === 'episode'
      ? (text(item.SeriesId) ?? own)
      : mediaType === 'track'
        ? (text(item.AlbumId) ?? own)
        : own;
  return {
    sessionKey: text(s.Id),
    ratingKey: own,
    quickLook: null,
    state: play.IsPaused === true ? 'paused' : 'playing',
    title: fullTitle(item, mediaType),
    grandparentTitle: text(item.SeriesName),
    episodeCode: null,
    year: text(item.ProductionYear),
    mediaType,
    poster: embyPoster(posterId),
    serverName: null,
    userDisplayName: text(s.UserName),
    product: text(s.Client),
    player: text(s.DeviceName),
    device: null,
    platform: null,
    quality: qualityLabel(video),
    videoDecision: decision === null ? null : videoDirect ? 'copy' : 'transcode',
    audioDecision: decision === null ? null : audioDirect ? 'copy' : 'transcode',
    subtitleDecision: null,
    dynamicRange: dynamicRange(video),
    videoCodec: text(video.Codec),
    streamVideoCodec: videoDirect ? text(video.Codec) : text(trans.VideoCodec),
    audioCodec: text(audio.Codec),
    streamAudioCodec: audioDirect ? text(audio.Codec) : text(trans.AudioCodec),
    transcodeDecision: decision,
    location: embyLocation(text(s.RemoteEndPoint)),
    bandwidthKbps: kbps,
    progressPercent: runtime > 0 ? clampPercent((position * 100) / runtime) : 0,
  };
}

export function normalizeEmbySessions(
  data: unknown,
): Omit<Activity, 'enabled' | 'configured' | 'connected' | 'error'> {
  const sessions = rows(data)
    .filter((s) => typeof s.NowPlayingItem === 'object' && s.NowPlayingItem !== null)
    .map(normalizeEmbySession);
  let lan = 0;
  let wan = 0;
  for (const session of sessions) {
    if (session.location === 'lan') lan += session.bandwidthKbps;
    else wan += session.bandwidthKbps;
  }
  return {
    streamCount: sessions.length,
    directPlayCount: sessions.filter((s) => s.transcodeDecision === 'direct play').length,
    directStreamCount: sessions.filter((s) => s.transcodeDecision === 'copy').length,
    transcodeCount: sessions.filter((s) => s.transcodeDecision === 'transcode').length,
    bandwidth: { totalKbps: lan + wan, lanKbps: lan, wanKbps: wan },
    totalBitrate: null,
    sessions,
  };
}

export function tmdbIdFromItem(item: Record<string, unknown>): QuickLook | null {
  const type = text(item.Type) === 'Movie' ? 'movie' : text(item.Type) === 'Series' ? 'tv' : null;
  if (type === null) return null;
  for (const [name, value] of Object.entries(record(item.ProviderIds))) {
    if (
      name.toLowerCase() === 'tmdb' &&
      (typeof value === 'string' || typeof value === 'number') &&
      /^\d+$/.test(String(value))
    ) {
      return { type, id: Number(value) };
    }
  }
  return null;
}

type Response = { ok: true; data: unknown } | { ok: false } | null;

export class EmbyClient {
  constructor(private readonly http: HttpClient | null) {}

  async #request(path: string, query: Record<string, string> = {}): Promise<Response> {
    if (this.http === null) return null;
    try {
      return { ok: true, data: await this.http.get(path, query) };
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        (error.kind === 'http' || error.kind === 'invalid_response')
      ) {
        return { ok: false };
      }
      return null;
    }
  }

  async activity(enabled: boolean, configured: boolean): Promise<Activity> {
    const base = emptyActivity(enabled, configured, true);
    if (!enabled) return base;
    if (!configured) return { ...base, error: 'unconfigured' };
    const response = await this.#request('/Sessions');
    if (response === null) return { ...base, error: 'unreachable' };
    if (!response.ok) return { ...base, error: 'auth' };
    return {
      enabled: true,
      configured: true,
      connected: true,
      error: null,
      ...normalizeEmbySessions(response.data),
    };
  }

  async #item(id: string): Promise<Record<string, unknown> | null> {
    const response = await this.#request('/Items', { Ids: id, Fields: 'ProviderIds' });
    if (!response?.ok) return null;
    return rows(record(response.data).Items)[0] ?? null;
  }

  /** Fiche TMDB d'un élément ; un épisode remonte à sa série. */
  async resolveTmdbId(id: string): Promise<QuickLook | null> {
    if (!isEmbyItemId(id)) return null;
    const item = await this.#item(id);
    if (item === null) return null;
    const found = tmdbIdFromItem(item);
    if (found !== null) return found;
    const seriesId = text(item.SeriesId);
    if (seriesId === null || !isEmbyItemId(seriesId)) return null;
    const series = await this.#item(seriesId);
    return series === null ? null : tmdbIdFromItem(series);
  }

  async image(id: string): Promise<ProxiedImage | null> {
    if (this.http === null || !isEmbyItemId(id)) return null;
    try {
      const response = await this.http.request<Uint8Array>({
        path: `/Items/${id}/Images/Primary`,
        query: { maxWidth: 300, maxHeight: 450, quality: 90 },
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
