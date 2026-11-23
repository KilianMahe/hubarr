// SPDX-License-Identifier: AGPL-3.0-or-later
// Interface commune des clients torrent (P3d.1) : la vue unique
// `TorrentsView` et le module `modules/torrents` ne connaissent qu'elle ; les
// écarts entre qBittorrent, Transmission et Deluge passent par les capacités
// (`TORRENT_CAPABILITIES`) et les méthodes facultatives.
//
// Toute méthode lève une `UpstreamError` en cas d'échec (réseau, statut, refus
// RPC), au lieu du `bool` + « dernière erreur » des clients PHP.

import type {
  Torrent,
  TorrentCapabilities,
  TorrentClientId,
  TorrentDetail,
  TorrentStats,
} from '@hubarr/shared';
import type { TorrentFile } from './common';

export interface AddOptions {
  category?: string | null | undefined;
  savepath?: string | null | undefined;
  paused?: boolean | undefined;
}

export interface TorrentClient {
  readonly id: TorrentClientId;
  readonly capabilities: TorrentCapabilities;
  version(): Promise<string>;
  /** Tous les torrents, normalisés, plus récents d'abord. */
  torrents(): Promise<Torrent[]>;
  /** Statistiques de la page ; compteurs tirés de `torrents`. */
  stats(torrents: Torrent[]): Promise<TorrentStats>;
  /** Catégories (ou labels) connues, pour les filtres et l'ajout. */
  categories(torrents: Torrent[]): Promise<string[]>;
  tags(torrents: Torrent[]): Promise<string[]>;
  /** Fiche d'un torrent, `null` s'il est inconnu du client. */
  detail(hash: string): Promise<TorrentDetail | null>;
  /** `['all']` vaut « tous » pour les clients qui l'acceptent (qBittorrent). */
  pause(hashes: string[]): Promise<void>;
  resume(hashes: string[]): Promise<void>;
  remove(hashes: string[], deleteFiles: boolean): Promise<void>;
  recheck(hashes: string[]): Promise<void>;
  reannounce(hashes: string[]): Promise<void>;
  /** Limites en octets/s, 0 = illimité. */
  setLimits(
    hashes: string[],
    limits: { dl?: number | undefined; up?: number | undefined },
  ): Promise<void>;
  setGlobalLimits(limits: { dl?: number | undefined; up?: number | undefined }): Promise<void>;
  addUrls(urls: string, options: AddOptions): Promise<void>;
  addFiles(files: TorrentFile[], options: AddOptions): Promise<void>;
  /** Port d'écoute (synchronisation avec le port transféré du VPN). */
  listenPort?(): Promise<number | null>;
  pauseAll?(): Promise<void>;
  resumeAll?(): Promise<void>;
  setLocation?(hash: string, location: string): Promise<void>;
  setCategory?(hashes: string[], category: string): Promise<void>;
  setForceStart?(hashes: string[], value: boolean): Promise<void>;
  toggleSequential?(hashes: string[]): Promise<void>;
  toggleFirstLast?(hashes: string[]): Promise<void>;
  setFilePriority?(hash: string, fileIds: number[], priority: number): Promise<void>;
  rename?(hash: string, name: string): Promise<void>;
  toggleSpeedMode?(): Promise<void>;
}
