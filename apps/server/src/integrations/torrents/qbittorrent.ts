// SPDX-License-Identifier: AGPL-3.0-or-later
// Adaptateur qBittorrent (P3d.2) : port de `QBittorrentClient.php` sur le
// socle `integrations/http`.
//
// - Session par cookie (`SID`, ou `QBT_SID_<port>` depuis qBittorrent 5.2),
//   ouverte au premier appel et rouverte une fois sur 401/403 ; sans
//   utilisateur **ou** sans mot de passe, aucune connexion (proxy qui
//   authentifie).
// - qBittorrent 5.x : `torrents/stop` et `torrents/start` ; repli sur
//   `pause`/`resume` (4.x) quand le 5.x répond 404 (risques P3).
// - `sync/maindata` (totaux, espace libre) gardé 10 s ; catégories et
//   étiquettes 15 s (la liste est relue toutes les 3 s).

import {
  TORRENT_CAPABILITIES,
  type Torrent,
  type TorrentDetail,
  type TorrentState,
  type TorrentStats,
} from '@hubarr/shared';
import type { HttpClient } from '../http';
import { UpstreamError, readSetCookie } from '../http';
import {
  ETA_NONE,
  isRecord,
  multipartBody,
  num,
  round,
  rpcError,
  str,
  unixOrNull,
  type TorrentFile,
} from './common';
import type { AddOptions, TorrentClient } from './types';

const SERVER_STATE_TTL_MS = 10_000;
const META_TTL_MS = 15_000;

/** États bruts de qBittorrent → état normalisé (`normalizeState`). */
export function normalizeQbitState(state: string): TorrentState {
  if (
    ['downloading', 'metaDL', 'checkingDL', 'forcedDL', 'forcedMetaDL', 'allocating'].includes(
      state,
    )
  )
    return 'downloading';
  if (['uploading', 'forcedUP', 'stalledUP'].includes(state)) return 'seeding';
  if (['pausedDL', 'pausedUP', 'stoppedDL', 'stoppedUP'].includes(state)) return 'paused';
  if (['queuedDL', 'queuedUP'].includes(state)) return 'queued';
  if (['checkingUP', 'checkingResumeData'].includes(state)) return 'checking';
  if (state === 'stalledDL') return 'stalled';
  if (state === 'error' || state === 'missingFiles') return 'error';
  if (state === 'moving') return 'moving';
  if (state === '') return 'completed';
  return 'unknown';
}

/** Cookie de session d'une réponse de connexion (`SID` ou `QBT_SID_<port>`). */
export function extractQbitSessionCookie(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers['set-cookie'];
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  for (const value of values) {
    const match = /^\s*(QBT_SID_\d+|SID)=([^;\s]+)/i.exec(value);
    if (match) return `${match[1] ?? 'SID'}=${match[2] ?? ''}`;
  }
  return readSetCookie(headers, 'SID');
}

const limitOrNull = (value: unknown): number | null => {
  const n = num(value, -1);
  return n > 0 ? n : null;
};

export function normalizeQbitTorrent(t: Record<string, unknown>): Torrent {
  const eta = num(t.eta, ETA_NONE);
  return {
    hash: str(t.hash),
    name: str(t.name, '—'),
    size: num(t.size),
    totalSize: num(t.total_size, num(t.size)),
    downloaded: num(t.downloaded),
    uploaded: num(t.uploaded),
    progress: round(num(t.progress) * 100, 1),
    dlSpeed: num(t.dlspeed),
    upSpeed: num(t.upspeed),
    eta: eta > 0 && eta < ETA_NONE ? eta : null,
    state: normalizeQbitState(str(t.state)),
    rawState: str(t.state),
    category: str(t.category),
    tags: str(t.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ''),
    ratio: round(num(t.ratio), 2),
    seeds: num(t.num_seeds),
    leechs: num(t.num_leechs),
    addedOn: unixOrNull(t.added_on),
    completedOn: unixOrNull(t.completion_on),
    savePath: str(t.save_path),
    tracker: str(t.tracker),
    dlLimit: limitOrNull(t.dl_limit),
    upLimit: limitOrNull(t.up_limit),
    forceStart: t.force_start === true,
    sequential: t.seq_dl === true,
    firstLast: t.f_l_piece_prio === true,
  };
}

/** Statuts des trackers de qBittorrent (0 à 4). */
const TRACKER_STATUS = ['disabled', 'not_contacted', 'working', 'updating', 'error'] as const;

export interface QbitCredentials {
  user: string;
  password: string;
}

export class QBittorrentClient implements TorrentClient {
  readonly id = 'qbittorrent' as const;
  readonly capabilities = TORRENT_CAPABILITIES.qbittorrent;
  #serverState: { at: number; value: Record<string, unknown> } | null = null;
  #meta: { at: number; categories: string[]; tags: string[] } | null = null;

  constructor(
    readonly http: HttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** Connexion (`auth/login`) : `null` = pas d'identifiants (proxy). */
  static async login(http: HttpClient, credentials: QbitCredentials): Promise<string | null> {
    if (credentials.user === '' || credentials.password === '') return null;
    const response = await http.request<string>({
      method: 'POST',
      path: '/api/v2/auth/login',
      form: { username: credentials.user, password: credentials.password },
      responseType: 'text',
      skipAuth: true,
    });
    const cookie = extractQbitSessionCookie(response.headers);
    if (cookie === null) {
      throw new UpstreamError('http', {
        service: 'qbittorrent',
        method: 'POST',
        path: '/api/v2/auth/login',
        status: 401,
        message: response.data.trim() || 'login failed',
      });
    }
    return cookie;
  }

  async version(): Promise<string> {
    return (
      await this.http.get<string>('/api/v2/app/version', undefined, { responseType: 'text' })
    ).trim();
  }

  async torrents(): Promise<Torrent[]> {
    const data = await this.http.get('/api/v2/torrents/info', {
      filter: 'all',
      sort: 'added_on',
      reverse: 'true',
    });
    return Array.isArray(data) ? data.filter(isRecord).map(normalizeQbitTorrent) : [];
  }

  async #state(): Promise<Record<string, unknown>> {
    const cached = this.#serverState;
    if (cached !== null && this.now() - cached.at < SERVER_STATE_TTL_MS) return cached.value;
    try {
      const data = await this.http.get('/api/v2/sync/maindata', { rid: 0 });
      const state = isRecord(data) && isRecord(data.server_state) ? data.server_state : null;
      if (state === null) return cached?.value ?? {};
      this.#serverState = { at: this.now(), value: state };
      return state;
    } catch (error) {
      if (cached !== null) return cached.value;
      throw error;
    }
  }

  async stats(torrents: Torrent[]): Promise<TorrentStats> {
    const [transfer, server] = await Promise.all([
      this.http.get('/api/v2/transfer/info'),
      this.#state(),
    ]);
    const info = isRecord(transfer) ? transfer : {};
    const count = (state: TorrentState) => torrents.filter((t) => t.state === state).length;
    return {
      total: torrents.length,
      downloading: count('downloading'),
      seeding: count('seeding'),
      paused: count('paused'),
      completed: count('completed'),
      errored: count('error'),
      stalled: count('stalled'),
      dlSpeed: num(info.dl_info_speed),
      upSpeed: num(info.up_info_speed),
      connection: str(info.connection_status, 'unknown'),
      dlSession: num(info.dl_info_data),
      upSession: num(info.up_info_data),
      dlAllTime: num(server.alltime_dl),
      upAllTime: num(server.alltime_ul),
      globalRatio: round(num(server.global_ratio), 2),
      freeSpace: num(server.free_space_on_disk),
      dlLimit: limitOrNull(info.dl_rate_limit),
      upLimit: limitOrNull(info.up_rate_limit),
      altSpeed:
        typeof server.use_alt_speed_limits === 'boolean' ? server.use_alt_speed_limits : null,
    };
  }

  async #loadMeta(): Promise<{ categories: string[]; tags: string[] }> {
    const cached = this.#meta;
    if (cached !== null && this.now() - cached.at < META_TTL_MS) return cached;
    const [categories, tags] = await Promise.all([
      this.http.get('/api/v2/torrents/categories'),
      this.http.get('/api/v2/torrents/tags'),
    ]);
    const meta = {
      at: this.now(),
      categories: isRecord(categories) ? Object.keys(categories).sort() : [],
      tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    };
    this.#meta = meta;
    return meta;
  }

  async categories(): Promise<string[]> {
    return (await this.#loadMeta()).categories;
  }

  async tags(): Promise<string[]> {
    return (await this.#loadMeta()).tags;
  }

  async detail(hash: string): Promise<TorrentDetail | null> {
    let props: unknown;
    try {
      props = await this.http.get('/api/v2/torrents/properties', { hash });
    } catch (error) {
      if (error instanceof UpstreamError && error.kind === 'http' && error.info.status === 404)
        return null;
      throw error;
    }
    if (!isRecord(props)) return null;
    const [files, trackers, peers, info] = await Promise.all([
      this.http.get('/api/v2/torrents/files', { hash }),
      this.http.get('/api/v2/torrents/trackers', { hash }),
      this.http.get('/api/v2/sync/torrentPeers', { hash }),
      this.http.get('/api/v2/torrents/info', { hashes: hash }).catch(() => []),
    ]);
    const row = Array.isArray(info) && isRecord(info[0]) ? info[0] : {};
    const eta = num(props.eta, ETA_NONE);
    return {
      properties: {
        name: str(props.name, str(row.name)),
        savePath: str(props.save_path),
        totalSize: num(props.total_size),
        pieceSize: num(props.piece_size),
        pieces: num(props.pieces_num),
        comment: str(props.comment),
        downloaded: num(props.total_downloaded),
        uploaded: num(props.total_uploaded),
        ratio: round(num(props.share_ratio), 2),
        addedOn: unixOrNull(props.addition_date),
        completedOn: unixOrNull(props.completion_date),
        timeElapsed: num(props.time_elapsed),
        seedingTime: num(props.seeding_time),
        eta: eta > 0 && eta < ETA_NONE ? eta : null,
        seeds: num(props.seeds),
        seedsTotal: num(props.seeds_total),
        peers: num(props.peers),
        peersTotal: num(props.peers_total),
        dlSpeed: num(props.dl_speed),
        upSpeed: num(props.up_speed),
      },
      files: (Array.isArray(files) ? files.filter(isRecord) : []).map((file, i) => ({
        index: num(file.index, i),
        name: str(file.name, '—'),
        size: num(file.size),
        progress: round(num(file.progress), 3),
        priority: num(file.priority, 1),
      })),
      trackers: (Array.isArray(trackers) ? trackers.filter(isRecord) : [])
        .filter((tracker) => !/^\*\* \[(DHT|PeX|LSD)\] \*\*$/.test(str(tracker.url)))
        .map((tracker) => ({
          url: str(tracker.url),
          status: TRACKER_STATUS[num(tracker.status, -1)] ?? str(tracker.status),
          seeds: num(tracker.num_seeds, -1) >= 0 ? num(tracker.num_seeds) : null,
          leechs: num(tracker.num_leeches, -1) >= 0 ? num(tracker.num_leeches) : null,
          message: str(tracker.msg),
        })),
      peers: Object.values(isRecord(peers) && isRecord(peers.peers) ? peers.peers : {})
        .filter(isRecord)
        .map((peer) => ({
          ip: str(peer.ip),
          port: num(peer.port, 0) || null,
          client: str(peer.client),
          countryCode: str(peer.country_code),
          progress: round(num(peer.progress) * 100, 1),
          dlSpeed: num(peer.dl_speed),
          upSpeed: num(peer.up_speed),
        })),
    };
  }

  /** Action en formulaire ; un corps « Fails. » vaut refus. */
  async #post(path: string, form: Record<string, string> = {}): Promise<void> {
    const body = await this.http.post<string>(path, undefined, { form, responseType: 'text' });
    if (typeof body === 'string' && body.trim().toLowerCase().startsWith('fails')) {
      throw rpcError('qbittorrent', path, path, body.trim());
    }
  }

  /** Chemin de qBittorrent 5.x, repli 4.x sur 404. */
  async #postCompat(path: string, legacy: string, form: Record<string, string>): Promise<void> {
    try {
      await this.#post(path, form);
    } catch (error) {
      if (error instanceof UpstreamError && error.kind === 'http' && error.info.status === 404) {
        await this.#post(legacy, form);
        return;
      }
      throw error;
    }
  }

  pause(hashes: string[]): Promise<void> {
    return this.#postCompat('/api/v2/torrents/stop', '/api/v2/torrents/pause', {
      hashes: hashes.join('|'),
    });
  }

  resume(hashes: string[]): Promise<void> {
    return this.#postCompat('/api/v2/torrents/start', '/api/v2/torrents/resume', {
      hashes: hashes.join('|'),
    });
  }

  remove(hashes: string[], deleteFiles: boolean): Promise<void> {
    return this.#post('/api/v2/torrents/delete', {
      hashes: hashes.join('|'),
      deleteFiles: deleteFiles ? 'true' : 'false',
    });
  }

  recheck(hashes: string[]): Promise<void> {
    return this.#post('/api/v2/torrents/recheck', { hashes: hashes.join('|') });
  }

  reannounce(hashes: string[]): Promise<void> {
    return this.#post('/api/v2/torrents/reannounce', { hashes: hashes.join('|') });
  }

  setForceStart(hashes: string[], value: boolean): Promise<void> {
    return this.#post('/api/v2/torrents/setForceStart', {
      hashes: hashes.join('|'),
      value: value ? 'true' : 'false',
    });
  }

  setCategory(hashes: string[], category: string): Promise<void> {
    return this.#post('/api/v2/torrents/setCategory', { hashes: hashes.join('|'), category });
  }

  toggleSequential(hashes: string[]): Promise<void> {
    return this.#post('/api/v2/torrents/toggleSequentialDownload', { hashes: hashes.join('|') });
  }

  toggleFirstLast(hashes: string[]): Promise<void> {
    return this.#post('/api/v2/torrents/toggleFirstLastPiecePrio', { hashes: hashes.join('|') });
  }

  setFilePriority(hash: string, fileIds: number[], priority: number): Promise<void> {
    return this.#post('/api/v2/torrents/filePrio', {
      hash,
      id: fileIds.join('|'),
      priority: String(priority),
    });
  }

  rename(hash: string, name: string): Promise<void> {
    return this.#post('/api/v2/torrents/rename', { hash, name });
  }

  async setLimits(hashes: string[], limits: { dl?: number | undefined; up?: number | undefined }) {
    const joined = hashes.join('|');
    if (limits.dl !== undefined)
      await this.#post('/api/v2/torrents/setDownloadLimit', {
        hashes: joined,
        limit: String(limits.dl),
      });
    if (limits.up !== undefined)
      await this.#post('/api/v2/torrents/setUploadLimit', {
        hashes: joined,
        limit: String(limits.up),
      });
  }

  async setGlobalLimits(limits: { dl?: number | undefined; up?: number | undefined }) {
    if (limits.dl !== undefined)
      await this.#post('/api/v2/transfer/setDownloadLimit', { limit: String(limits.dl) });
    if (limits.up !== undefined)
      await this.#post('/api/v2/transfer/setUploadLimit', { limit: String(limits.up) });
    this.#serverState = null;
  }

  async toggleSpeedMode(): Promise<void> {
    await this.#post('/api/v2/transfer/toggleSpeedLimitsMode');
    this.#serverState = null;
  }

  async addUrls(urls: string, options: AddOptions): Promise<void> {
    const form: Record<string, string> = { urls };
    if (options.category != null) form.category = options.category;
    if (options.savepath != null && options.savepath !== '') form.savepath = options.savepath;
    if (options.paused === true) {
      form.paused = 'true';
      form.stopped = 'true';
    }
    await this.#post('/api/v2/torrents/add', form);
  }

  async addFiles(files: TorrentFile[], options: AddOptions): Promise<void> {
    const fields: Record<string, string> = {};
    if (options.category != null) fields.category = options.category;
    if (options.savepath != null && options.savepath !== '') fields.savepath = options.savepath;
    if (options.paused === true) {
      fields.paused = 'true';
      fields.stopped = 'true';
    }
    const { body, contentType } = multipartBody(
      fields,
      files.map((file) => ({
        field: 'torrents',
        name: file.name,
        type: 'application/x-bittorrent',
        content: file.content,
      })),
    );
    const response = await this.http.request<string>({
      method: 'POST',
      path: '/api/v2/torrents/add',
      body,
      headers: { 'content-type': contentType },
      responseType: 'text',
      timeoutMs: 15_000,
    });
    if (response.data.toLowerCase().includes('fail')) {
      throw rpcError('qbittorrent', 'add', '/api/v2/torrents/add', response.data.trim());
    }
  }

  async listenPort(): Promise<number | null> {
    const prefs = await this.http.get('/api/v2/app/preferences');
    return isRecord(prefs) && prefs.listen_port !== undefined ? num(prefs.listen_port) : null;
  }
}
