// SPDX-License-Identifier: AGPL-3.0-or-later
// Adaptateur Transmission (P3d.3) : port de `TransmissionClient.php`.
//
// RPC JSON sur `/transmission/rpc`, Basic si un utilisateur est saisi, jeton
// `X-Transmission-Session-Id` échangé par la stratégie d'authentification
// (409 → rejeu unique). Un `result` autre que `success` est un refus. Les
// limites de Transmission sont en Kio/s (0 = illimité via `…Limited`).

import {
  TORRENT_CAPABILITIES,
  type Torrent,
  type TorrentDetail,
  type TorrentState,
  type TorrentStats,
} from '@hubarr/shared';
import type { HttpClient } from '../http';
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

const RPC_PATH = '/transmission/rpc';
/** Délai d'un appel RPC (15 s dans l'original : grosses listes). */
const RPC_TIMEOUT_MS = 15_000;

export const TRANSMISSION_TORRENT_FIELDS = [
  'hashString',
  'name',
  'status',
  'error',
  'totalSize',
  'sizeWhenDone',
  'downloadedEver',
  'uploadedEver',
  'percentDone',
  'rateDownload',
  'rateUpload',
  'eta',
  'uploadRatio',
  'peersSendingToUs',
  'peersGettingFromUs',
  'addedDate',
  'doneDate',
  'downloadDir',
  'labels',
  'trackers',
  'downloadLimit',
  'downloadLimited',
  'uploadLimit',
  'uploadLimited',
  'queuePosition',
  'secondsSeeding',
] as const;

export const TRANSMISSION_DETAIL_FIELDS = [
  'hashString',
  'name',
  'status',
  'error',
  'totalSize',
  'downloadDir',
  'pieceSize',
  'pieceCount',
  'comment',
  'uploadedEver',
  'downloadedEver',
  'uploadRatio',
  'addedDate',
  'doneDate',
  'secondsDownloading',
  'secondsSeeding',
  'eta',
  'peersSendingToUs',
  'peersGettingFromUs',
  'files',
  'fileStats',
  'trackerStats',
  'peers',
  'rateDownload',
  'rateUpload',
] as const;

/** URL saisie avec `/transmission`, `/transmission/rpc` ou `/transmission/web` : base nue. */
export function normalizeTransmissionBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.replace(/\/transmission(?:\/(?:rpc|web))?$/i, '');
}

/** Statut numérique + code d'erreur → état normalisé (l'erreur l'emporte). */
export function normalizeTransmissionState(status: number, error: number): TorrentState {
  if (error !== 0) return 'error';
  switch (status) {
    case 0:
      return 'paused';
    case 1:
    case 2:
      return 'checking';
    case 3:
    case 5:
      return 'queued';
    case 4:
      return 'downloading';
    case 6:
      return 'seeding';
    default:
      return 'unknown';
  }
}

/** Kio/s → octets/s ; 0 ou moins = illimité (`null`). */
export function kibToBytes(kib: number): number | null {
  return kib <= 0 ? null : Math.round(kib * 1024);
}

/** Octets/s → Kio/s (une décimale), 0 = illimité. */
export function bytesToKib(bytes: number): number {
  return bytes <= 0 ? 0 : round(bytes / 1024, 1);
}

const TRACKER_STATE = ['idle', 'announcing', 'queued', 'active'] as const;

export function normalizeTransmissionTorrent(t: Record<string, unknown>): Torrent {
  const eta = num(t.eta, -1);
  const labels = Array.isArray(t.labels) ? t.labels.map((label) => str(label)) : [];
  const first = Array.isArray(t.trackers) && isRecord(t.trackers[0]) ? t.trackers[0] : null;
  let tracker = '';
  if (first !== null) {
    try {
      tracker = new URL(str(first.announce)).hostname;
    } catch {
      tracker = '';
    }
  }
  return {
    hash: str(t.hashString),
    name: str(t.name, '—'),
    size: num(t.sizeWhenDone, num(t.totalSize)),
    totalSize: num(t.totalSize),
    downloaded: num(t.downloadedEver),
    uploaded: num(t.uploadedEver),
    progress: round(num(t.percentDone) * 100, 1),
    dlSpeed: num(t.rateDownload),
    upSpeed: num(t.rateUpload),
    eta: eta > 0 ? eta : null,
    state: normalizeTransmissionState(num(t.status), num(t.error)),
    rawState: String(num(t.status)),
    category: labels[0] ?? '',
    tags: labels,
    ratio: round(Math.max(0, num(t.uploadRatio)), 2),
    seeds: num(t.peersSendingToUs),
    leechs: num(t.peersGettingFromUs),
    addedOn: unixOrNull(t.addedDate),
    completedOn: unixOrNull(t.doneDate),
    savePath: str(t.downloadDir),
    tracker,
    dlLimit: t.downloadLimited === true ? kibToBytes(num(t.downloadLimit)) : null,
    upLimit: t.uploadLimited === true ? kibToBytes(num(t.uploadLimit)) : null,
    forceStart: false,
    sequential: false,
    firstLast: false,
  };
}

export class TransmissionClient implements TorrentClient {
  readonly id = 'transmission' as const;
  readonly capabilities = TORRENT_CAPABILITIES.transmission;

  constructor(readonly http: HttpClient) {}

  async #call(
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const data = await this.http.post(
      RPC_PATH,
      { method, arguments: args },
      { timeoutMs: RPC_TIMEOUT_MS },
    );
    if (!isRecord(data)) throw rpcError('transmission', method, RPC_PATH, 'malformed RPC response');
    if (data.result !== 'success')
      throw rpcError('transmission', method, RPC_PATH, str(data.result, 'RPC error'));
    return isRecord(data.arguments) ? data.arguments : {};
  }

  async version(): Promise<string> {
    return str((await this.#call('session-get', { fields: ['version'] })).version);
  }

  async torrents(): Promise<Torrent[]> {
    const result = await this.#call('torrent-get', { fields: TRANSMISSION_TORRENT_FIELDS });
    const list = Array.isArray(result.torrents) ? result.torrents : [];
    return list
      .filter((t): t is Record<string, unknown> => isRecord(t) && typeof t.hashString === 'string')
      .map(normalizeTransmissionTorrent)
      .sort((a, b) => (b.addedOn ?? 0) - (a.addedOn ?? 0));
  }

  async stats(torrents: Torrent[]): Promise<TorrentStats> {
    const [session, info] = await Promise.all([
      this.#call('session-stats'),
      this.#call('session-get', {
        fields: [
          'download-dir',
          'speed-limit-down',
          'speed-limit-down-enabled',
          'speed-limit-up',
          'speed-limit-up-enabled',
        ],
      }),
    ]);
    const dir = str(info['download-dir']);
    const free = dir !== '' ? await this.#call('free-space', { path: dir }).catch(() => ({})) : {};
    const cumulative = isRecord(session['cumulative-stats']) ? session['cumulative-stats'] : {};
    const current = isRecord(session['current-stats']) ? session['current-stats'] : {};
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
      dlSpeed: num(session.downloadSpeed),
      upSpeed: num(session.uploadSpeed),
      connection: 'connected',
      dlSession: num(current.downloadedBytes),
      upSession: num(current.uploadedBytes),
      dlAllTime: num(cumulative.downloadedBytes, dlAll),
      upAllTime: num(cumulative.uploadedBytes, upAll),
      globalRatio: dlAll > 0 ? round(upAll / dlAll, 2) : 0,
      freeSpace: num((free as Record<string, unknown>)['size-bytes']),
      dlLimit:
        info['speed-limit-down-enabled'] === true
          ? kibToBytes(num(info['speed-limit-down']))
          : null,
      upLimit:
        info['speed-limit-up-enabled'] === true ? kibToBytes(num(info['speed-limit-up'])) : null,
      altSpeed: null,
    };
  }

  /** Transmission n'a pas de liste de labels : ceux des torrents. */
  categories(torrents: Torrent[]): Promise<string[]> {
    return Promise.resolve(
      [...new Set(torrents.map((t) => t.category).filter((c) => c !== ''))].sort(),
    );
  }

  tags(): Promise<string[]> {
    return Promise.resolve([]);
  }

  async detail(hash: string): Promise<TorrentDetail | null> {
    const result = await this.#call('torrent-get', {
      ids: [hash],
      fields: TRANSMISSION_DETAIL_FIELDS,
    });
    const t =
      Array.isArray(result.torrents) && isRecord(result.torrents[0]) ? result.torrents[0] : null;
    if (t === null) return null;
    const fileStats = Array.isArray(t.fileStats) ? t.fileStats : [];
    let seedsTotal = 0;
    let peersTotal = 0;
    const trackerStats = Array.isArray(t.trackerStats) ? t.trackerStats.filter(isRecord) : [];
    for (const tracker of trackerStats) {
      seedsTotal += Math.max(0, num(tracker.seederCount, -1));
      peersTotal += Math.max(0, num(tracker.leecherCount, -1));
    }
    const eta = num(t.eta, -1);
    return {
      properties: {
        name: str(t.name),
        savePath: str(t.downloadDir),
        totalSize: num(t.totalSize),
        pieceSize: num(t.pieceSize),
        pieces: num(t.pieceCount),
        comment: str(t.comment),
        downloaded: num(t.downloadedEver),
        uploaded: num(t.uploadedEver),
        ratio: round(Math.max(0, num(t.uploadRatio)), 2),
        addedOn: unixOrNull(t.addedDate),
        completedOn: unixOrNull(t.doneDate),
        timeElapsed: num(t.secondsDownloading),
        seedingTime: num(t.secondsSeeding),
        eta: eta > 0 ? eta : null,
        seeds: num(t.peersSendingToUs),
        seedsTotal,
        peers: num(t.peersGettingFromUs),
        peersTotal,
        dlSpeed: num(t.rateDownload),
        upSpeed: num(t.rateUpload),
      },
      files: (Array.isArray(t.files) ? t.files.filter(isRecord) : []).map((file, i) => {
        const stat = isRecord(fileStats[i]) ? fileStats[i] : {};
        const length = num(file.length);
        return {
          index: i,
          name: str(file.name, '—'),
          size: length,
          progress: length > 0 ? round(num(file.bytesCompleted) / length, 3) : 0,
          priority: num(stat.priority),
        };
      }),
      trackers: trackerStats.map((tracker) => ({
        url: str(tracker.announce),
        status: TRACKER_STATE[num(tracker.announceState)] ?? 'idle',
        seeds: num(tracker.seederCount, -1) >= 0 ? num(tracker.seederCount) : null,
        leechs: num(tracker.leecherCount, -1) >= 0 ? num(tracker.leecherCount) : null,
        message: str(tracker.lastAnnounceResult),
      })),
      peers: (Array.isArray(t.peers) ? t.peers.filter(isRecord) : []).map((peer) => ({
        ip: str(peer.address),
        port: num(peer.port, 0) || null,
        client: str(peer.clientName),
        countryCode: '',
        progress: round(num(peer.progress) * 100, 1),
        dlSpeed: num(peer.rateToClient),
        upSpeed: num(peer.rateToPeer),
      })),
    };
  }

  async #ok(method: string, args: Record<string, unknown> = {}): Promise<void> {
    await this.#call(method, args);
  }

  pause(hashes: string[]) {
    return this.#ok('torrent-stop', { ids: hashes });
  }
  resume(hashes: string[]) {
    return this.#ok('torrent-start', { ids: hashes });
  }
  pauseAll() {
    return this.#ok('torrent-stop');
  }
  resumeAll() {
    return this.#ok('torrent-start');
  }
  remove(hashes: string[], deleteFiles: boolean) {
    return this.#ok('torrent-remove', { ids: hashes, 'delete-local-data': deleteFiles });
  }
  recheck(hashes: string[]) {
    return this.#ok('torrent-verify', { ids: hashes });
  }
  reannounce(hashes: string[]) {
    return this.#ok('torrent-reannounce', { ids: hashes });
  }
  setLocation(hash: string, location: string) {
    return this.#ok('torrent-set-location', { ids: [hash], location, move: true });
  }

  async setLimits(hashes: string[], limits: { dl?: number | undefined; up?: number | undefined }) {
    if (limits.dl !== undefined)
      await this.#ok('torrent-set', {
        ids: hashes,
        downloadLimit: Math.trunc(bytesToKib(limits.dl)),
        downloadLimited: limits.dl > 0,
      });
    if (limits.up !== undefined)
      await this.#ok('torrent-set', {
        ids: hashes,
        uploadLimit: Math.trunc(bytesToKib(limits.up)),
        uploadLimited: limits.up > 0,
      });
  }

  async setGlobalLimits(limits: { dl?: number | undefined; up?: number | undefined }) {
    if (limits.dl !== undefined)
      await this.#ok('session-set', {
        'speed-limit-down': Math.trunc(bytesToKib(limits.dl)),
        'speed-limit-down-enabled': limits.dl > 0,
      });
    if (limits.up !== undefined)
      await this.#ok('session-set', {
        'speed-limit-up': Math.trunc(bytesToKib(limits.up)),
        'speed-limit-up-enabled': limits.up > 0,
      });
  }

  async addUrls(urls: string, options: AddOptions): Promise<void> {
    const { magnets, urls: links } = splitAddUrls(urls);
    for (const line of [...magnets, ...links]) {
      await this.#ok('torrent-add', this.#addArgs({ filename: line }, options));
    }
  }

  async addFiles(files: TorrentFile[], options: AddOptions): Promise<void> {
    for (const file of files) {
      await this.#ok(
        'torrent-add',
        this.#addArgs({ metainfo: file.content.toString('base64') }, options),
      );
    }
  }

  #addArgs(args: Record<string, unknown>, options: AddOptions): Record<string, unknown> {
    if (options.savepath != null && options.savepath !== '')
      args['download-dir'] = options.savepath;
    if (options.paused === true) args.paused = true;
    return args;
  }
}
