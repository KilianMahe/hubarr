// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique commune des trois clients torrent (P3d.1) : port des méthodes
// statiques dupliquées dans `QBittorrentController`, `TransmissionController`
// et `DelugeController` (`sanitizeHashes`, `validateTorrentUrls`, filtres,
// tri et pagination de `apiTorrents`, contrôle des fichiers `.torrent`), et de
// `splitAddUrls` des clients Transmission et Deluge.

import {
  TORRENT_FILE_MAX_BYTES,
  type Torrent,
  type TorrentCapabilities,
  type TorrentListParams,
} from '@hubarr/shared';
import type { ServiceId } from '@hubarr/shared';
import { UpstreamError } from '../http';

/** Temps restant « inconnu » de qBittorrent (100 jours). */
export const ETA_NONE = 8_640_000;

/** Empreintes valides d'une liste (+ `all` si le client l'accepte). */
export function sanitizeHashes(raw: unknown, pattern: string, allowAll: boolean): string[] {
  if (!Array.isArray(raw)) return [];
  const re = new RegExp(pattern);
  return raw.filter(
    (hash): hash is string =>
      typeof hash === 'string' && ((allowAll && hash === 'all') || re.test(hash)),
  );
}

export function isValidHash(hash: string, capabilities: TorrentCapabilities): boolean {
  return new RegExp(capabilities.hashPattern).test(hash);
}

/** Hôtes de métadonnées cloud refusés (garde SSRF des URL transmises au client). */
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'fd00:ec2::254',
  'metadata.google.internal',
  'metadata.goog',
  'metadata.azure.com',
  'metadata.azure.net',
]);

/** Une ligne par lien ; `|` sépare aussi (comme l'original). */
export function splitLines(raw: string): string[] {
  return raw
    .trim()
    .split(/[\r\n|]+/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Contrôle des liens donnés au client (`validateTorrentUrlsStatic`) : http(s)
 * et `magnet:` seulement, hôtes de métadonnées refusés, réseau local permis.
 */
export function validateTorrentUrls(raw: string): 'invalid_url' | 'forbidden_host' | null {
  for (const line of splitLines(raw)) {
    if (line.toLowerCase().startsWith('magnet:')) continue;
    // `new URL('https:///a')` lit `a` comme hôte : l'hôte doit suivre `//`.
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]/i.test(line)) return 'invalid_url';
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return 'invalid_url';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid_url';
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === '') return 'invalid_url';
    if (BLOCKED_HOSTS.has(host)) return 'forbidden_host';
  }
  return null;
}

/** Sépare les magnets des liens http(s), magnets d'abord (`splitAddUrls`). */
export function splitAddUrls(raw: string): { magnets: string[]; urls: string[] } {
  const magnets: string[] = [];
  const urls: string[] = [];
  for (const line of splitLines(raw)) {
    if (line.toLowerCase().startsWith('magnet:')) magnets.push(line);
    else urls.push(line);
  }
  return { magnets, urls };
}

export interface TorrentFile {
  name: string;
  content: Buffer;
}

export type TorrentFileError = 'too_large' | 'invalid_format' | 'unreadable';

/**
 * Fichier `.torrent` reçu en base64 : extension, taille (10 Mo), encodage
 * bencode reconnu (`d` puis `info` ou `announce` dans les 4 premiers Ko), nom
 * réduit à son dernier segment, sans octet nul.
 */
export function readTorrentFile(name: string, base64: string): TorrentFile | TorrentFileError {
  if (!name.toLowerCase().endsWith('.torrent')) return 'invalid_format';
  if (base64.length > Math.ceil(TORRENT_FILE_MAX_BYTES / 3) * 4 + 4) return 'too_large';
  const content = Buffer.from(base64, 'base64');
  if (content.length === 0) return 'unreadable';
  if (content.length > TORRENT_FILE_MAX_BYTES) return 'too_large';
  const head = content.subarray(0, 4096).toString('latin1');
  if (!head.startsWith('d') || (!head.includes('info') && !head.includes('announce'))) {
    return 'invalid_format';
  }
  const clean = name.replaceAll('\0', '').split(/[\\/]/).pop() ?? '';
  return { name: clean === '' ? 'upload.torrent' : clean, content };
}

/** Corps `multipart/form-data` (envoi de fichiers à qBittorrent). */
export function multipartBody(
  fields: Record<string, string>,
  files: { field: string; name: string; type: string; content: Buffer }[],
): { body: Buffer; contentType: string } {
  const boundary = `----hubarr${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  const quote = (value: string) => value.replace(/["\r\n]/g, '_');
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quote(key)}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quote(file.field)}"; filename="${quote(file.name)}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Refus du client lui-même (réponse 200 en échec : RPC, « Fails. »). */
export function rpcError(service: ServiceId, method: string, path: string, message: string) {
  return new UpstreamError('http', {
    service,
    method: 'POST',
    path,
    status: 200,
    message: message === '' ? method : message,
  });
}

export interface ListResult {
  torrents: Torrent[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

const SORT_KEYS = {
  name: 'name',
  size: 'size',
  progress: 'progress',
  dlspeed: 'dlSpeed',
  upspeed: 'upSpeed',
  ratio: 'ratio',
  seeds: 'seeds',
  category: 'category',
  uploaded: 'uploaded',
  completed: 'completedOn',
  added: 'addedOn',
} as const satisfies Record<string, keyof Torrent>;

type SortKey = (typeof SORT_KEYS)[keyof typeof SORT_KEYS];

function sortKeyOf(sort: string): SortKey {
  return Object.hasOwn(SORT_KEYS, sort) ? SORT_KEYS[sort as keyof typeof SORT_KEYS] : 'addedOn';
}

/**
 * Filtres, tri et pagination de `apiTorrents` : état (`active` = vitesse
 * non nulle ; `completed` = progression à 100 %), catégorie, étiquette,
 * recherche dans le nom (casse ignorée), tri par colonne, 1 à 500 par page,
 * page ramenée dans les bornes.
 */
export function listTorrents(all: Torrent[], query: TorrentListParams): ListResult {
  const filter = query.filter;
  const search = query.search.trim().toLowerCase();
  const category = query.category.trim();
  const tag = query.tag.trim();
  let list = all;
  if (filter === 'active') list = list.filter((t) => t.dlSpeed > 0 || t.upSpeed > 0);
  else if (filter === 'completed')
    list = list.filter((t) => t.progress >= 100 || t.state === 'completed');
  else if (filter !== 'all') list = list.filter((t) => t.state === filter);
  if (category !== '') list = list.filter((t) => t.category === category);
  if (tag !== '') list = list.filter((t) => t.tags.includes(tag));
  if (search !== '') list = list.filter((t) => t.name.toLowerCase().includes(search));

  const key = sortKeyOf(query.sort);
  const desc = query.desc === '1';
  const textual = key === 'name' || key === 'category';
  list = [...list].sort((a, b) => {
    let cmp: number;
    if (textual) {
      const va = a[key];
      const vb = b[key];
      cmp = va < vb ? -1 : va > vb ? 1 : 0;
    } else {
      cmp = (a[key] ?? 0) - (b[key] ?? 0);
    }
    return desc ? -cmp : cmp;
  });

  const perPage = Math.max(1, Math.min(500, query.perPage || 50));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, query.page || 1), totalPages);
  return {
    torrents: list.slice((page - 1) * perPage, page * perPage),
    pagination: { page, perPage, total, totalPages },
  };
}

/** Nombre fini (sinon `fallback`). */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Date Unix (secondes) ou `null` si absente ou non positive. */
export function unixOrNull(value: unknown): number | null {
  const n = num(value, 0);
  return n > 0 ? Math.trunc(n) : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
