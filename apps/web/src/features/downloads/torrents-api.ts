// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API des clients torrent (`/api/<client>/…`, P3d) et clés
// TanStack Query. Un seul module pour qBittorrent, Transmission et Deluge.

import {
  arrOkSchema,
  torrentAddFileResponseSchema,
  torrentDetailSchema,
  torrentListResponseSchema,
  torrentResolveSchema,
  torrentVpnSchema,
  type TorrentClientId,
  type TorrentListParams,
} from '@hubarr/shared';
import { api } from '../../app/api/client';

export const torrentKeys = {
  all: (client: TorrentClientId) => ['torrents', client] as const,
  list: (client: TorrentClientId, params: TorrentListParams) =>
    ['torrents', client, 'list', params] as const,
  detail: (client: TorrentClientId, hash: string) => ['torrents', client, 'detail', hash] as const,
  vpn: (client: TorrentClientId) => ['torrents', client, 'vpn'] as const,
};

export interface AddOptions {
  category?: string | null;
  savepath?: string | null;
  paused?: boolean;
}

export function torrentsApi(client: TorrentClientId) {
  const base = `/api/${client}`;
  const action = (path: string, body: unknown = {}) =>
    api.post(`${base}/${path}`, body, arrOkSchema);
  return {
    list: (params: TorrentListParams, signal?: AbortSignal) => {
      const query = new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
      );
      return api.get(`${base}/torrents?${query.toString()}`, torrentListResponseSchema, signal);
    },
    detail: (hash: string, signal?: AbortSignal) =>
      api.get(`${base}/torrent/${hash}`, torrentDetailSchema, signal),
    vpn: (signal?: AbortSignal) => api.get(`${base}/vpn`, torrentVpnSchema, signal),
    resolve: (pipeline: 'radarr' | 'sonarr', hash: string) =>
      api.get(`${base}/resolve/${pipeline}/${hash}`, torrentResolveSchema),
    torrent: (hash: string, verb: string, body: unknown = {}) =>
      action(`torrent/${hash}/${verb}`, body),
    bulk: (verb: string, hashes: string[], extra: Record<string, unknown> = {}) =>
      action(`bulk/${verb}`, { hashes, ...extra }),
    pauseAll: () => action('pause-all'),
    resumeAll: () => action('resume-all'),
    addUrls: (urls: string, options: AddOptions) => action('add', { urls, ...options }),
    addFiles: (files: { name: string; content: string }[], options: AddOptions) =>
      api.post(`${base}/add-file`, { files, ...options }, torrentAddFileResponseSchema),
    globalLimit: (limits: { dl?: number; up?: number }) => action('global-limit', limits),
    speedMode: () => action('speed-mode'),
  };
}

/** Contenu d'un fichier en base64 (envoi des `.torrent` et `.nzb`). */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
