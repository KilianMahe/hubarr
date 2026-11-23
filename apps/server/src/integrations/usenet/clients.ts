// SPDX-License-Identifier: AGPL-3.0-or-later
// Clients Usenet (P3d.5) : port de `UsenetClientInterface`, `UsenetStatus`,
// `SabnzbdClient` et `NzbgetClient`.
//
// - SABnzbd : API `GET /api?mode=…&output=json&apikey=…` ; une action sans
//   drapeau `status` n'est **pas** un succès (`SabnzbdActionResultTest`) ;
//   envoi d'un NZB en multipart (`mode=addfile`, champ `name`).
// - NZBGet : JSON-RPC sur `/jsonrpc` (Basic si saisi), tailles en paires
//   `…Lo`/`…Hi` recombinées (ou `…MB`), historique paginé par Hubarr.
// Toute méthode lève une `UpstreamError` (refus → 502 avec le message).

import type { UsenetClientId, UsenetDownload, UsenetQueue, UsenetStatus } from '@hubarr/shared';
import type { HttpClient } from '../http';
import { isRecord, multipartBody, num, round, rpcError, str } from '../torrents/common';

export interface UsenetClient {
  readonly id: UsenetClientId;
  version(): Promise<string | null>;
  queue(): Promise<UsenetQueue>;
  categories(): Promise<string[]>;
  historyPage(offset: number, limit: number): Promise<{ items: UsenetDownload[]; total: number }>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
  pauseItem(id: string): Promise<void>;
  resumeItem(id: string): Promise<void>;
  deleteItem(id: string, deleteFiles: boolean): Promise<void>;
  /** Octets/s, 0 = illimité. */
  setSpeedLimit(bytesPerSecond: number): Promise<void>;
  addUrl(url: string, category: string | null): Promise<void>;
  addFiles(files: { name: string; content: Buffer }[], category: string | null): Promise<void>;
}

export const EMPTY_QUEUE: UsenetQueue = {
  paused: false,
  speed: 0,
  speedLimit: 0,
  remaining: 0,
  active: 0,
  queued: 0,
  eta: null,
  freeSpace: 0,
  items: [],
};

/** Statuts de SABnzbd (file et historique). */
export function fromSabnzbd(status: string): UsenetStatus {
  switch (status.toLowerCase()) {
    case 'downloading':
      return 'downloading';
    case 'queued':
      return 'queued';
    case 'grabbing':
    case 'fetching':
      return 'fetching';
    case 'paused':
      return 'paused';
    case 'checking':
    case 'verifying':
    case 'repairing':
      return 'verifying';
    case 'extracting':
    case 'unpacking':
      return 'extracting';
    case 'moving':
    case 'running':
      return 'moving';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

/** Statut de la file de NZBGet. */
export function fromNzbgetQueue(status: string): UsenetStatus {
  switch (status.toUpperCase()) {
    case 'DOWNLOADING':
      return 'downloading';
    case 'FETCHING':
      return 'fetching';
    case 'QUEUED':
    case 'PP_QUEUED':
      return 'queued';
    case 'PAUSED':
      return 'paused';
    case 'LOADING_PARS':
    case 'VERIFYING_SOURCES':
    case 'VERIFYING_REPAIRED':
    case 'VERIFYING':
    case 'REPAIRING':
      return 'verifying';
    case 'UNPACKING':
      return 'extracting';
    case 'RENAMING':
    case 'MOVING':
    case 'POST_PROCESSING':
    case 'EXECUTING_SCRIPT':
    case 'PP_FINISHED':
      return 'moving';
    default:
      return 'unknown';
  }
}

/** Statut de l'historique de NZBGet (`SUCCESS/ALL`, `FAILURE/PAR`…). */
export function fromNzbgetHistory(status: string): UsenetStatus {
  const head = (status.split('/')[0] ?? '').toUpperCase();
  if (head === 'SUCCESS' || head === 'WARNING') return 'completed';
  if (head === 'FAILURE' || head === 'DELETED') return 'failed';
  return 'unknown';
}

/** « h:mm:ss » de SABnzbd en secondes ; vide, `unknown` ou 0 → `null`. */
export function parseClock(clock: string): number | null {
  const value = clock.trim();
  if (value === '' || value.toLowerCase() === 'unknown' || value === '0:00:00') return null;
  const secs = value
    .split(':')
    .reduce((total, part) => total * 60 + (Number.parseInt(part, 10) || 0), 0);
  return secs > 0 ? secs : null;
}

/** Attente d'une récupération (`labels` de SABnzbd : « Patienter 12 sec »). */
export function parseWaitSeconds(labels: unknown): number | null {
  if (!Array.isArray(labels)) return null;
  for (const label of labels) {
    if (typeof label === 'string' && label.toLowerCase().includes('sec')) {
      const match = /(\d+)/.exec(label);
      if (match?.[1] !== undefined) return Number(match[1]);
    }
  }
  return null;
}

const MB = 1024 * 1024;

export function normalizeSabQueueSlot(s: Record<string, unknown>): UsenetDownload {
  const raw = str(s.status);
  return {
    id: str(s.nzo_id),
    name: str(s.filename, '—'),
    status: fromSabnzbd(raw),
    rawStatus: raw,
    size: Math.round(num(s.mb) * MB),
    remaining: Math.round(num(s.mbleft) * MB),
    percentage: round(num(s.percentage), 1),
    category: str(s.cat),
    eta: parseClock(str(s.timeleft)),
    speed: 0,
    fail: null,
    history: false,
    wait: parseWaitSeconds(s.labels),
    completedAt: null,
  };
}

export function normalizeSabHistorySlot(s: Record<string, unknown>): UsenetDownload {
  const raw = str(s.status);
  const status = fromSabnzbd(raw);
  const fail = str(s.fail_message);
  return {
    id: str(s.nzo_id),
    name: str(s.name, str(s.nzb_name, '—')),
    status,
    rawStatus: raw,
    size: num(s.bytes),
    remaining: 0,
    percentage: status === 'completed' ? 100 : 0,
    category: str(s.category),
    eta: null,
    speed: 0,
    fail: fail === '' ? null : fail,
    history: true,
    wait: null,
    completedAt: num(s.completed) > 0 ? num(s.completed) : null,
  };
}

/** Taille NZBGet : paire `…Lo`/`…Hi` (32 bits non signés), sinon `…MB`. */
export function combineBytes(data: Record<string, unknown>, field: string): number {
  if (data[`${field}Lo`] !== undefined || data[`${field}Hi`] !== undefined) {
    const lo = num(data[`${field}Lo`]) >>> 0;
    const hi = num(data[`${field}Hi`]);
    return hi * 4_294_967_296 + lo;
  }
  return num(data[`${field}MB`]) * MB;
}

export function normalizeNzbgetGroup(g: Record<string, unknown>): UsenetDownload {
  const raw = str(g.Status);
  const total = combineBytes(g, 'FileSize');
  const remaining = combineBytes(g, 'RemainingSize');
  return {
    id: str(g.NZBID),
    name: str(g.NZBName, '—'),
    status: fromNzbgetQueue(raw),
    rawStatus: raw,
    size: total,
    remaining,
    percentage:
      total > 0 ? Math.max(0, Math.min(100, round(((total - remaining) / total) * 100, 1))) : 0,
    category: str(g.Category),
    eta: null,
    speed: num(g.DownloadRate),
    fail: null,
    history: false,
    wait: null,
    completedAt: null,
  };
}

export function normalizeNzbgetHistory(h: Record<string, unknown>): UsenetDownload {
  const raw = str(h.Status);
  const status = fromNzbgetHistory(raw);
  return {
    id: str(h.NZBID),
    name: str(h.Name, '—'),
    status,
    rawStatus: raw,
    size: combineBytes(h, 'FileSize'),
    remaining: 0,
    percentage: status === 'completed' ? 100 : 0,
    category: str(h.Category),
    eta: null,
    speed: 0,
    fail: status === 'failed' && raw !== '' ? raw : null,
    history: true,
    wait: null,
    completedAt: num(h.HistoryTime) > 0 ? num(h.HistoryTime) : null,
  };
}

function counts(items: UsenetDownload[]) {
  return {
    active: items.filter((item) => item.status === 'downloading').length,
    queued: items.filter((item) => item.status === 'queued').length,
  };
}

export class SabnzbdClient implements UsenetClient {
  readonly id = 'sabnzbd' as const;
  constructor(private readonly http: HttpClient) {}

  async #call(
    params: Record<string, string>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    const data = await this.http.get(
      '/api',
      { ...params, output: 'json' },
      timeoutMs ? { timeoutMs } : {},
    );
    if (!isRecord(data)) throw rpcError('sabnzbd', params.mode ?? '', '/api', 'invalid response');
    if (data.status === false)
      throw rpcError('sabnzbd', params.mode ?? '', '/api', str(data.error, 'refused'));
    return data;
  }

  /** Action : succès seulement sur `status` présent et non faux. */
  async #action(params: Record<string, string>): Promise<void> {
    const data = await this.#call(params);
    if (!('status' in data)) throw rpcError('sabnzbd', params.mode ?? '', '/api', 'no status flag');
  }

  async version() {
    const value = (await this.#call({ mode: 'version' })).version;
    return typeof value === 'string' && value !== '' ? value : null;
  }

  async queue(): Promise<UsenetQueue> {
    const q = (await this.#call({ mode: 'queue' })).queue;
    if (!isRecord(q)) return EMPTY_QUEUE;
    const items = (Array.isArray(q.slots) ? q.slots.filter(isRecord) : []).map(
      normalizeSabQueueSlot,
    );
    return {
      paused: q.paused === true,
      speed: Math.round(num(q.kbpersec) * 1024),
      speedLimit: num(q.speedlimit_abs),
      remaining: Math.round(num(q.mbleft) * MB),
      ...counts(items),
      eta: parseClock(str(q.timeleft)),
      freeSpace: Math.round(num(q.diskspace1) * 1024 * MB),
      items,
    };
  }

  async categories() {
    const cats = (await this.#call({ mode: 'get_cats' })).categories;
    return Array.isArray(cats)
      ? cats.map((cat) => str(cat)).filter((cat) => cat !== '' && cat !== '*')
      : [];
  }

  async historyPage(offset: number, limit: number) {
    const h = (
      await this.#call({
        mode: 'history',
        start: String(Math.max(0, offset)),
        limit: String(Math.max(1, limit)),
      })
    ).history;
    if (!isRecord(h)) return { items: [], total: 0 };
    const items = (Array.isArray(h.slots) ? h.slots.filter(isRecord) : []).map(
      normalizeSabHistorySlot,
    );
    return { items, total: num(h.noofslots, items.length) };
  }

  pauseAll() {
    return this.#action({ mode: 'pause' });
  }
  resumeAll() {
    return this.#action({ mode: 'resume' });
  }
  pauseItem(id: string) {
    return this.#action({ mode: 'queue', name: 'pause', value: id });
  }
  resumeItem(id: string) {
    return this.#action({ mode: 'queue', name: 'resume', value: id });
  }
  deleteItem(id: string, deleteFiles: boolean) {
    return this.#action({
      mode: 'queue',
      name: 'delete',
      value: id,
      del_files: deleteFiles ? '1' : '0',
    });
  }
  setSpeedLimit(bytesPerSecond: number) {
    const kb = bytesPerSecond > 0 ? Math.round(bytesPerSecond / 1024) : 0;
    return this.#action({ mode: 'config', name: 'speedlimit', value: kb > 0 ? `${kb}K` : '0' });
  }
  addUrl(url: string, category: string | null) {
    return this.#action({ mode: 'addurl', name: url, ...(category ? { cat: category } : {}) });
  }

  async addFiles(files: { name: string; content: Buffer }[], category: string | null) {
    for (const file of files) {
      const { body, contentType } = multipartBody({}, [
        { field: 'name', name: file.name, type: 'application/x-nzb', content: file.content },
      ]);
      const response = await this.http.request({
        method: 'POST',
        path: '/api',
        query: { mode: 'addfile', output: 'json', ...(category ? { cat: category } : {}) },
        body,
        headers: { 'content-type': contentType },
        timeoutMs: 20_000,
      });
      if (!isRecord(response.data) || response.data.status !== true) {
        throw rpcError(
          'sabnzbd',
          'addfile',
          '/api',
          isRecord(response.data) ? str(response.data.error, 'refused') : 'refused',
        );
      }
    }
  }
}

export class NzbgetClient implements UsenetClient {
  readonly id = 'nzbget' as const;
  constructor(private readonly http: HttpClient) {}

  async #rpc(method: string, params: unknown[] = []): Promise<unknown> {
    const data = await this.http.post(
      '/jsonrpc',
      { version: '1.1', id: 1, method, params },
      { timeoutMs: 20_000 },
    );
    if (!isRecord(data)) throw rpcError('nzbget', method, '/jsonrpc', 'invalid response');
    if (data.error !== undefined && data.error !== null) {
      const message = isRecord(data.error)
        ? str(data.error.message, 'RPC error')
        : str(data.error, 'RPC error');
      throw rpcError('nzbget', method, '/jsonrpc', message);
    }
    return data.result ?? null;
  }

  async #true(method: string, params: unknown[] = []): Promise<void> {
    if ((await this.#rpc(method, params)) !== true)
      throw rpcError('nzbget', method, '/jsonrpc', 'refused');
  }

  async version() {
    const value = await this.#rpc('version');
    return typeof value === 'string' && value !== '' ? value : null;
  }

  async queue(): Promise<UsenetQueue> {
    const [groups, status] = await Promise.all([this.#rpc('listgroups', [0]), this.#rpc('status')]);
    if (!Array.isArray(groups) || !isRecord(status)) return EMPTY_QUEUE;
    const items = groups.filter(isRecord).map(normalizeNzbgetGroup);
    const rate = num(status.DownloadRate);
    const remaining = combineBytes(status, 'RemainingSize');
    return {
      paused: status.DownloadPaused === true,
      speed: rate,
      speedLimit: num(status.DownloadLimit),
      remaining,
      ...counts(items),
      eta: rate > 0 && remaining > 0 ? Math.ceil(remaining / rate) : null,
      freeSpace: combineBytes(status, 'FreeDiskSpace'),
      items,
    };
  }

  async categories() {
    const config = await this.#rpc('config');
    if (!Array.isArray(config)) return [];
    return config
      .filter(isRecord)
      .filter((entry) => /^Category\d+\.Name$/.test(str(entry.Name)) && str(entry.Value) !== '')
      .map((entry) => str(entry.Value));
  }

  async historyPage(offset: number, limit: number) {
    const history = await this.#rpc('history', [false]);
    if (!Array.isArray(history)) return { items: [], total: 0 };
    return {
      items: history
        .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit))
        .filter(isRecord)
        .map(normalizeNzbgetHistory),
      total: history.length,
    };
  }

  pauseAll() {
    return this.#true('pausedownload');
  }
  resumeAll() {
    return this.#true('resumedownload');
  }
  #edit(command: string, id: string) {
    return this.#true('editqueue', [command, 0, '', [Number.parseInt(id, 10)]]);
  }
  pauseItem(id: string) {
    return this.#edit('GroupPause', id);
  }
  resumeItem(id: string) {
    return this.#edit('GroupResume', id);
  }
  deleteItem(id: string, deleteFiles: boolean) {
    return this.#edit(deleteFiles ? 'GroupFinalDelete' : 'GroupDelete', id);
  }
  setSpeedLimit(bytesPerSecond: number) {
    return this.#true('rate', [bytesPerSecond > 0 ? Math.round(bytesPerSecond / 1024) : 0]);
  }

  async #append(filename: string, content: string, category: string | null): Promise<void> {
    const result = await this.#rpc('append', [
      filename,
      content,
      category ?? '',
      0,
      false,
      false,
      '',
      0,
      'SCORE',
    ]);
    const ok = typeof result === 'number' ? result > 0 : result === true;
    if (!ok) throw rpcError('nzbget', 'append', '/jsonrpc', 'refused');
  }

  addUrl(url: string, category: string | null) {
    return this.#append('', url, category);
  }

  async addFiles(files: { name: string; content: Buffer }[], category: string | null) {
    for (const file of files)
      await this.#append(file.name, file.content.toString('base64'), category);
  }
}
