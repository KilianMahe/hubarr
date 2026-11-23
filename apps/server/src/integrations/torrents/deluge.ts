// SPDX-License-Identifier: AGPL-3.0-or-later
// Adaptateur Deluge (P3d.3) : port de `DelugeClient.php`.
//
// JSON-RPC de deluge-web sur `/json` : connexion `auth.login` (cookie
// `_session_id`), sauf mot de passe vide (proxy qui authentifie). Une erreur
// RPC de code 1 (« Not authenticated ») rouvre la session et rejoue une fois.
// L'interface web doit être reliée au démon : vérifié avant le premier appel
// `core.*` puis au plus une fois par minute (`web.connected`, sinon
// `web.connect` sur le premier hôte connu). Limites de Deluge en Kio/s
// (-1 = illimité).

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
  isRecord,
  num,
  round,
  rpcError,
  splitAddUrls,
  str,
  unixOrNull,
  type TorrentFile,
} from './common';
import type { AddOptions, TorrentClient } from './types';

const RPC_PATH = '/json';
const DAEMON_CHECK_TTL_MS = 60_000;

export const DELUGE_TORRENT_KEYS = [
  'name',
  'state',
  'progress',
  'total_size',
  'total_wanted',
  'total_done',
  'total_uploaded',
  'all_time_download',
  'download_payload_rate',
  'upload_payload_rate',
  'eta',
  'ratio',
  'num_seeds',
  'total_seeds',
  'num_peers',
  'total_peers',
  'time_added',
  'completed_time',
  'save_path',
  'label',
  'tracker_host',
  'seeding_time',
  'is_finished',
  'max_download_speed',
  'max_upload_speed',
  'distributed_copies',
] as const;

export const DELUGE_DETAIL_KEYS = [
  'name',
  'state',
  'progress',
  'save_path',
  'total_size',
  'piece_length',
  'num_pieces',
  'comment',
  'total_uploaded',
  'all_time_download',
  'ratio',
  'time_added',
  'completed_time',
  'active_time',
  'seeding_time',
  'next_announce',
  'label',
  'tracker_status',
  'trackers',
  'files',
  'file_progress',
  'file_priorities',
  'peers',
  'is_finished',
  'eta',
  'num_seeds',
  'total_seeds',
  'num_peers',
  'total_peers',
  'download_payload_rate',
  'upload_payload_rate',
] as const;

/** Enveloppe JSON-RPC : résultat, ou erreur avec son code (relogin sur 1). */
export function parseDelugeRpc(body: unknown): {
  result: unknown;
  error: { code: number | null; message: string } | null;
} {
  if (!isRecord(body)) {
    return { result: null, error: { code: null, message: 'malformed JSON-RPC response' } };
  }
  const error = body.error;
  if (error !== undefined && error !== null) {
    return {
      result: null,
      error: isRecord(error)
        ? {
            code: typeof error.code === 'number' ? error.code : null,
            message: str(error.message, 'RPC error'),
          }
        : { code: null, message: str(error, 'RPC error') },
    };
  }
  return { result: body.result ?? null, error: null };
}

export function normalizeDelugeState(state: string, finished: boolean): TorrentState {
  switch (state) {
    case 'Downloading':
    case 'Allocating':
      return 'downloading';
    case 'Seeding':
      return 'seeding';
    case 'Paused':
      return 'paused';
    case 'Queued':
      return 'queued';
    case 'Checking':
      return 'checking';
    case 'Error':
      return 'error';
    case 'Moving':
      return 'moving';
    default:
      return finished ? 'seeding' : 'unknown';
  }
}

/** Kio/s → octets/s ; négatif = illimité (`null`). */
export function delugeKibToBytes(kib: number): number | null {
  return kib < 0 ? null : Math.round(kib * 1024);
}

/** Octets/s → Kio/s ; 0 = illimité (-1). */
export function delugeBytesToKib(bytes: number): number {
  return bytes <= 0 ? -1 : round(bytes / 1024, 1);
}

export function normalizeDelugeTorrent(hash: string, t: Record<string, unknown>): Torrent {
  const eta = num(t.eta);
  const dlLimit = delugeKibToBytes(num(t.max_download_speed, -1));
  const upLimit = delugeKibToBytes(num(t.max_upload_speed, -1));
  return {
    hash,
    name: str(t.name, '—'),
    size: num(t.total_wanted, num(t.total_size)),
    totalSize: num(t.total_size),
    downloaded: num(t.all_time_download, num(t.total_done)),
    uploaded: num(t.total_uploaded),
    progress: round(num(t.progress), 1),
    dlSpeed: num(t.download_payload_rate),
    upSpeed: num(t.upload_payload_rate),
    eta: eta > 0 ? eta : null,
    state: normalizeDelugeState(str(t.state), t.is_finished === true),
    rawState: str(t.state),
    category: str(t.label),
    tags: str(t.label) === '' ? [] : [str(t.label)],
    ratio: round(Math.max(0, num(t.ratio)), 2),
    seeds: num(t.num_seeds),
    leechs: num(t.num_peers),
    addedOn: unixOrNull(t.time_added),
    completedOn: unixOrNull(t.completed_time),
    savePath: str(t.save_path),
    tracker: str(t.tracker_host),
    dlLimit: dlLimit === 0 ? null : dlLimit,
    upLimit: upLimit === 0 ? null : upLimit,
    forceStart: false,
    sequential: false,
    firstLast: false,
  };
}

export class DelugeClient implements TorrentClient {
  readonly id = 'deluge' as const;
  readonly capabilities = TORRENT_CAPABILITIES.deluge;
  #daemonCheckedAt = -Infinity;

  constructor(
    readonly http: HttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** Connexion (`auth.login`) : `null` = pas de mot de passe (proxy). */
  static async login(http: HttpClient, password: string): Promise<string | null> {
    if (password === '') return null;
    const response = await http.request({
      method: 'POST',
      path: RPC_PATH,
      json: { method: 'auth.login', params: [password], id: 1 },
      skipAuth: true,
    });
    const parsed = parseDelugeRpc(response.data);
    if (parsed.result !== true) {
      throw new UpstreamError('http', {
        service: 'deluge',
        method: 'POST',
        path: RPC_PATH,
        status: 401,
        message: parsed.error?.message ?? 'wrong password',
      });
    }
    const cookie = readSetCookie(response.headers, '_session_id');
    if (cookie === null) {
      throw new UpstreamError('http', {
        service: 'deluge',
        method: 'POST',
        path: RPC_PATH,
        status: 401,
        message: 'no session cookie in login response',
      });
    }
    return cookie;
  }

  async #raw(method: string, params: unknown[], retried = false): Promise<unknown> {
    const data = await this.http.post(RPC_PATH, { method, params, id: 1 });
    const parsed = parseDelugeRpc(data);
    if (parsed.error !== null) {
      if (parsed.error.code === 1 && !retried) {
        this.http.auth.reset?.();
        return this.#raw(method, params, true);
      }
      throw rpcError('deluge', method, RPC_PATH, parsed.error.message);
    }
    return parsed.result;
  }

  async #ensureDaemon(): Promise<void> {
    if (this.now() - this.#daemonCheckedAt < DAEMON_CHECK_TTL_MS) return;
    if ((await this.#raw('web.connected', [])) !== true) {
      const hosts = await this.#raw('web.get_hosts', []);
      const row: unknown = Array.isArray(hosts) ? hosts[0] : undefined;
      const first: unknown = Array.isArray(row) ? row[0] : undefined;
      if (typeof first === 'string' && first !== '') {
        await this.#raw('web.connect', [first]);
      }
      if ((await this.#raw('web.connected', [])) !== true) {
        throw rpcError(
          'deluge',
          'web.connected',
          RPC_PATH,
          'Deluge web UI is not connected to the daemon',
        );
      }
    }
    this.#daemonCheckedAt = this.now();
  }

  async #call(method: string, params: unknown[] = []): Promise<unknown> {
    await this.#ensureDaemon();
    return this.#raw(method, params);
  }

  async version(): Promise<string> {
    return str(await this.#call('daemon.get_version'));
  }

  async torrents(): Promise<Torrent[]> {
    const data = await this.#call('core.get_torrents_status', [{}, DELUGE_TORRENT_KEYS]);
    if (!isRecord(data)) return [];
    return Object.entries(data)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .map(([hash, t]) => normalizeDelugeTorrent(hash, t))
      .sort((a, b) => (b.addedOn ?? 0) - (a.addedOn ?? 0));
  }

  async stats(torrents: Torrent[]): Promise<TorrentStats> {
    const [session, free] = await Promise.all([
      this.#call('core.get_session_status', [
        [
          'payload_download_rate',
          'payload_upload_rate',
          'total_payload_download',
          'total_payload_upload',
        ],
      ]),
      this.#call('core.get_free_space').catch(() => 0),
    ]);
    const sess = isRecord(session) ? session : {};
    const count = (state: TorrentState) => torrents.filter((t) => t.state === state).length;
    const upAll = torrents.reduce((sum, t) => sum + t.uploaded, 0);
    const dlAll = torrents.reduce((sum, t) => sum + t.downloaded, 0);
    return {
      total: torrents.length,
      downloading: count('downloading'),
      seeding: count('seeding'),
      paused: count('paused'),
      completed: torrents.filter((t) => t.progress >= 100).length,
      errored: count('error'),
      stalled: 0,
      dlSpeed: num(sess.payload_download_rate),
      upSpeed: num(sess.payload_upload_rate),
      connection: 'connected',
      dlSession: num(sess.total_payload_download),
      upSession: num(sess.total_payload_upload),
      dlAllTime: dlAll,
      upAllTime: upAll,
      globalRatio: dlAll > 0 ? round(upAll / dlAll, 2) : 0,
      freeSpace: num(free),
      dlLimit: null,
      upLimit: null,
      altSpeed: null,
    };
  }

  async categories(torrents: Torrent[]): Promise<string[]> {
    try {
      const labels = await this.#call('label.get_labels');
      if (Array.isArray(labels)) return labels.map((label) => str(label)).filter((l) => l !== '');
    } catch {
      // Greffon Label absent : labels des torrents.
    }
    return [...new Set(torrents.map((t) => t.category).filter((c) => c !== ''))].sort();
  }

  tags(): Promise<string[]> {
    return Promise.resolve([]);
  }

  async detail(hash: string): Promise<TorrentDetail | null> {
    const t = await this.#call('core.get_torrent_status', [hash, DELUGE_DETAIL_KEYS]);
    if (!isRecord(t) || Object.keys(t).length === 0) return null;
    const progressList = Array.isArray(t.file_progress) ? t.file_progress : [];
    const prioList = Array.isArray(t.file_priorities) ? t.file_priorities : [];
    return {
      properties: {
        name: str(t.name),
        savePath: str(t.save_path),
        totalSize: num(t.total_size),
        pieceSize: num(t.piece_length),
        pieces: num(t.num_pieces),
        comment: str(t.comment),
        downloaded: num(t.all_time_download),
        uploaded: num(t.total_uploaded),
        ratio: round(Math.max(0, num(t.ratio)), 2),
        addedOn: unixOrNull(t.time_added),
        completedOn: unixOrNull(t.completed_time),
        timeElapsed: num(t.active_time),
        seedingTime: num(t.seeding_time),
        eta: num(t.eta) > 0 ? num(t.eta) : null,
        seeds: num(t.num_seeds),
        seedsTotal: num(t.total_seeds),
        peers: num(t.num_peers),
        peersTotal: num(t.total_peers),
        dlSpeed: num(t.download_payload_rate),
        upSpeed: num(t.upload_payload_rate),
      },
      files: (Array.isArray(t.files) ? t.files.filter(isRecord) : []).map((file, i) => ({
        index: num(file.index, i),
        name: str(file.path, str(file.name, '—')),
        size: num(file.size),
        progress: round(num(progressList[i]), 3),
        priority: num(prioList[i], 1),
      })),
      trackers: (Array.isArray(t.trackers) ? t.trackers.filter(isRecord) : []).map((tracker) => ({
        url: str(tracker.url),
        status: str(t.tracker_status),
        seeds: null,
        leechs: null,
        message: '',
      })),
      peers: (Array.isArray(t.peers) ? t.peers.filter(isRecord) : []).map((peer) => {
        const address = str(peer.ip);
        const colon = address.lastIndexOf(':');
        const port = colon > 0 ? Number(address.slice(colon + 1)) : NaN;
        return {
          ip: Number.isInteger(port) ? address.slice(0, colon) : address,
          port: Number.isInteger(port) ? port : null,
          client: str(peer.client),
          countryCode: str(peer.country).trim(),
          progress: round(num(peer.progress) * 100, 1),
          dlSpeed: num(peer.down_speed),
          upSpeed: num(peer.up_speed),
        };
      }),
    };
  }

  async #ok(method: string, params: unknown[] = []): Promise<void> {
    await this.#call(method, params);
  }

  pause(hashes: string[]) {
    return this.#ok('core.pause_torrent', [hashes]);
  }
  resume(hashes: string[]) {
    return this.#ok('core.resume_torrent', [hashes]);
  }
  pauseAll() {
    return this.#ok('core.pause_session');
  }
  resumeAll() {
    return this.#ok('core.resume_session');
  }
  async remove(hashes: string[], deleteFiles: boolean) {
    for (const hash of hashes) await this.#ok('core.remove_torrent', [hash, deleteFiles]);
  }
  recheck(hashes: string[]) {
    return this.#ok('core.force_recheck', [hashes]);
  }
  reannounce(hashes: string[]) {
    return this.#ok('core.force_reannounce', [hashes]);
  }
  setLocation(hash: string, location: string) {
    return this.#ok('core.move_storage', [[hash], location]);
  }

  async setLimits(hashes: string[], limits: { dl?: number | undefined; up?: number | undefined }) {
    if (limits.dl !== undefined)
      await this.#ok('core.set_torrent_options', [
        hashes,
        { max_download_speed: delugeBytesToKib(limits.dl) },
      ]);
    if (limits.up !== undefined)
      await this.#ok('core.set_torrent_options', [
        hashes,
        { max_upload_speed: delugeBytesToKib(limits.up) },
      ]);
  }

  async setGlobalLimits(limits: { dl?: number | undefined; up?: number | undefined }) {
    if (limits.dl !== undefined)
      await this.#ok('core.set_config', [{ max_download_speed: delugeBytesToKib(limits.dl) }]);
    if (limits.up !== undefined)
      await this.#ok('core.set_config', [{ max_upload_speed: delugeBytesToKib(limits.up) }]);
  }

  #addOptions(options: AddOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.savepath != null && options.savepath !== '')
      out.download_location = options.savepath;
    if (options.paused === true) out.add_paused = true;
    return out;
  }

  async addUrls(urls: string, options: AddOptions): Promise<void> {
    const { magnets, urls: links } = splitAddUrls(urls);
    const opts = this.#addOptions(options);
    for (const magnet of magnets) await this.#ok('core.add_torrent_magnet', [magnet, opts]);
    for (const link of links) await this.#ok('core.add_torrent_url', [link, opts]);
  }

  async addFiles(files: TorrentFile[], options: AddOptions): Promise<void> {
    const opts = this.#addOptions(options);
    for (const file of files) {
      await this.#ok('core.add_torrent_file', [file.name, file.content.toString('base64'), opts]);
    }
  }
}
