// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'API des clients torrent (P3d) : qBittorrent, Transmission et
// Deluge partagent **une** forme de torrent, de statistiques et de fiche,
// pilotée par des capacités. Les trois contrôleurs de
// l'original renvoyaient la forme de qBittorrent (clés `snake_case`) ; Hubarr
// la reprend en `camelCase`, avec des dates en secondes Unix et un temps
// restant `null` quand il est inconnu (au lieu de 8 640 000).

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const TORRENT_CLIENTS = ['qbittorrent', 'transmission', 'deluge'] as const;
export const torrentClientIdSchema = z.enum(TORRENT_CLIENTS);
export type TorrentClientId = z.infer<typeof torrentClientIdSchema>;

export function isTorrentClientId(value: unknown): value is TorrentClientId {
  return typeof value === 'string' && (TORRENT_CLIENTS as readonly string[]).includes(value);
}

/**
 * Capacités d'un client : ce que la vue unique affiche, et les routes que le
 * serveur enregistre (une route sans capacité n'existe pas pour ce client).
 */
export interface TorrentCapabilities {
  /** Étiquettes multiples (qBittorrent) ; sinon la catégorie est le premier label. */
  tags: boolean;
  /** Filtre « en attente » (`stalledDL`, qBittorrent seulement). */
  stalled: boolean;
  /** Catégorie choisie à l'ajout, modifiable par torrent et en masse. */
  setCategory: boolean;
  /** Déplacement des données (`location`). */
  location: boolean;
  /** Routes `pause-all` / `resume-all` ; sinon `bulk/*` avec `['all']`. */
  pauseAllRoute: boolean;
  /** Démarrage forcé, séquentiel, premières et dernières pièces, renommage. */
  advanced: boolean;
  /** Priorités des fichiers modifiables ; valeurs proposées. */
  filePriorities: readonly number[] | null;
  /** Mode de vitesse alternatif (tortue). */
  speedMode: boolean;
  /** Carte VPN (Gluetun) et synchronisation du port. */
  vpn: boolean;
  /** Longueur des empreintes acceptées (`{32,64}` pour qBittorrent, 40 sinon). */
  hashPattern: string;
}

export const TORRENT_CAPABILITIES: Record<TorrentClientId, TorrentCapabilities> = {
  qbittorrent: {
    tags: true,
    stalled: true,
    setCategory: true,
    location: false,
    pauseAllRoute: false,
    advanced: true,
    filePriorities: [0, 1, 6, 7],
    speedMode: true,
    vpn: true,
    hashPattern: '^[a-fA-F0-9]{32,64}$',
  },
  transmission: {
    tags: false,
    stalled: false,
    setCategory: false,
    location: true,
    pauseAllRoute: true,
    advanced: false,
    filePriorities: null,
    speedMode: false,
    vpn: false,
    hashPattern: '^[a-fA-F0-9]{40}$',
  },
  deluge: {
    tags: false,
    stalled: false,
    setCategory: false,
    location: true,
    pauseAllRoute: true,
    advanced: false,
    filePriorities: null,
    speedMode: false,
    vpn: false,
    hashPattern: '^[a-fA-F0-9]{40}$',
  },
};

export const TORRENT_STATES = [
  'downloading',
  'seeding',
  'paused',
  'queued',
  'checking',
  'stalled',
  'error',
  'moving',
  'completed',
  'unknown',
] as const;
export const torrentStateSchema = z.enum(TORRENT_STATES);
export type TorrentState = z.infer<typeof torrentStateSchema>;

export const torrentSchema = z.object({
  hash: z.string(),
  name: z.string(),
  /** Taille voulue (fichiers sélectionnés). */
  size: z.number(),
  totalSize: z.number(),
  downloaded: z.number(),
  uploaded: z.number(),
  /** Pourcentage, une décimale. */
  progress: z.number(),
  dlSpeed: z.number(),
  upSpeed: z.number(),
  /** Secondes restantes, `null` si inconnu. */
  eta: nullableNumber,
  state: torrentStateSchema,
  rawState: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  ratio: z.number(),
  seeds: z.number(),
  leechs: z.number(),
  /** Secondes Unix. */
  addedOn: nullableNumber,
  completedOn: nullableNumber,
  savePath: z.string(),
  tracker: z.string(),
  /** Limites en octets/s, `null` = illimité. */
  dlLimit: nullableNumber,
  upLimit: nullableNumber,
  /** Drapeaux de qBittorrent (`false` ailleurs). */
  forceStart: z.boolean(),
  sequential: z.boolean(),
  firstLast: z.boolean(),
});
export type Torrent = z.infer<typeof torrentSchema>;

export const torrentStatsSchema = z.object({
  total: z.number(),
  downloading: z.number(),
  seeding: z.number(),
  paused: z.number(),
  completed: z.number(),
  errored: z.number(),
  stalled: z.number(),
  dlSpeed: z.number(),
  upSpeed: z.number(),
  /** `connected`, `firewalled`, `disconnected` (qBittorrent) ; `connected` ailleurs. */
  connection: z.string(),
  dlSession: z.number(),
  upSession: z.number(),
  dlAllTime: z.number(),
  upAllTime: z.number(),
  globalRatio: z.number(),
  freeSpace: z.number(),
  /** Limites globales en octets/s (`null` = illimité ou inconnu). */
  dlLimit: nullableNumber,
  upLimit: nullableNumber,
  /** Mode de vitesse alternatif actif (qBittorrent), `null` ailleurs. */
  altSpeed: z.boolean().nullable(),
});
export type TorrentStats = z.infer<typeof torrentStatsSchema>;

export const TORRENT_SORTS = [
  'added',
  'name',
  'size',
  'progress',
  'dlspeed',
  'upspeed',
  'ratio',
  'seeds',
  'category',
  'uploaded',
  'completed',
] as const;
export type TorrentSort = (typeof TORRENT_SORTS)[number];

export const TORRENT_FILTERS = [
  'all',
  'active',
  'downloading',
  'seeding',
  'stalled',
  'paused',
  'completed',
  'error',
] as const;
export type TorrentFilter = (typeof TORRENT_FILTERS)[number];

/** Critères de la liste (`GET /api/<client>/torrents`). */
export const torrentListQuerySchema = z.object({
  page: z.coerce.number().int().catch(1),
  perPage: z.coerce.number().int().catch(50),
  filter: z.string().catch('all'),
  search: z.string().catch(''),
  category: z.string().catch(''),
  tag: z.string().catch(''),
  sort: z.string().catch('added'),
  desc: z.string().catch('1'),
});
export type TorrentListParams = z.infer<typeof torrentListQuerySchema>;

export const torrentPaginationSchema = z.object({
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const torrentListResponseSchema = z.object({
  torrents: z.array(torrentSchema),
  stats: torrentStatsSchema,
  pagination: torrentPaginationSchema,
  /** Catégories (qBittorrent) ou labels connus, pour les filtres et l'ajout. */
  categories: z.array(z.string()),
  tags: z.array(z.string()),
});
export type TorrentListResponse = z.infer<typeof torrentListResponseSchema>;

export const torrentFileSchema = z.object({
  index: z.number(),
  name: z.string(),
  size: z.number(),
  /** Fraction 0 à 1. */
  progress: z.number(),
  priority: z.number(),
});
export const torrentTrackerSchema = z.object({
  url: z.string(),
  /** Statut normalisé (`working`, `updating`, `not_contacted`, `error`, `disabled`, `announcing`, `queued`, `active`, `idle`) ou texte du client. */
  status: z.string(),
  seeds: nullableNumber,
  leechs: nullableNumber,
  message: z.string(),
});
export const torrentPeerSchema = z.object({
  ip: z.string(),
  port: nullableNumber,
  client: z.string(),
  countryCode: z.string(),
  /** Pourcentage. */
  progress: z.number(),
  dlSpeed: z.number(),
  upSpeed: z.number(),
});
export const torrentDetailSchema = z.object({
  properties: z.object({
    name: z.string(),
    savePath: z.string(),
    totalSize: z.number(),
    pieceSize: z.number(),
    pieces: z.number(),
    comment: z.string(),
    downloaded: z.number(),
    uploaded: z.number(),
    ratio: z.number(),
    addedOn: nullableNumber,
    completedOn: nullableNumber,
    timeElapsed: z.number(),
    seedingTime: z.number(),
    eta: nullableNumber,
    seeds: z.number(),
    seedsTotal: z.number(),
    peers: z.number(),
    peersTotal: z.number(),
    dlSpeed: z.number(),
    upSpeed: z.number(),
  }),
  files: z.array(torrentFileSchema),
  trackers: z.array(torrentTrackerSchema),
  peers: z.array(torrentPeerSchema),
});
export type TorrentDetail = z.infer<typeof torrentDetailSchema>;

/** Résumé du sondage global (barre latérale, toasts) : transitions utiles. */
export const torrentPollSummarySchema = z.object({
  active: z.number(),
  items: z.array(
    z.object({ hash: z.string(), state: torrentStateSchema, name: z.string(), size: z.number() }),
  ),
});
export type TorrentPollSummary = z.infer<typeof torrentPollSummarySchema>;

/** Résolution d'un torrent vers sa fiche Radarr/Sonarr (`TorrentResolverService`). */
export const torrentResolveSchema = z.object({
  found: z.boolean(),
  id: z.number().optional(),
  title: z.string().optional(),
  /** Lien de la fiche dans Hubarr (`/medias/<slug>/films/<id>`, page de la fiche, D130). */
  url: z.string().optional(),
  /** Motif de l'échec (`unparsable`, `no_instance`, `unavailable`, `no_match`). */
  reason: z.string().optional(),
  parsed: z.object({ title: z.string(), year: nullableNumber }).optional(),
});
export type TorrentResolve = z.infer<typeof torrentResolveSchema>;

/** Carte VPN (Gluetun) de la page qBittorrent. */
export const torrentVpnSchema = z.object({
  ok: z.boolean(),
  status: nullableString,
  publicIp: nullableString,
  country: nullableString,
  city: nullableString,
  region: nullableString,
  organization: nullableString,
  timezone: nullableString,
  forwardedPort: nullableNumber,
  clientPort: nullableNumber,
  /** `true` = ports identiques, `false` = désynchronisés, `null` = inconnu. */
  portSync: z.boolean().nullable(),
});
export type TorrentVpn = z.infer<typeof torrentVpnSchema>;

const hashList = z.array(z.string()).max(5_000);

export const torrentBulkRequestSchema = z.object({ hashes: hashList });
export const torrentDeleteRequestSchema = z.object({ deleteFiles: z.boolean().optional() });
export const torrentBulkDeleteRequestSchema = z.object({
  hashes: hashList,
  deleteFiles: z.boolean().optional(),
});
export const torrentCategoryRequestSchema = z.object({ category: z.string().max(200) });
export const torrentBulkCategoryRequestSchema = z.object({
  hashes: hashList,
  category: z.string().max(200),
});
export const torrentForceStartRequestSchema = z.object({ value: z.boolean().optional() });
export const torrentFilePriorityRequestSchema = z.object({
  fileIds: z.array(z.number().int().nonnegative()).min(1).max(10_000),
  priority: z.number().int(),
});
export const torrentRenameRequestSchema = z.object({ name: z.string().max(1_000) });
export const torrentLocationRequestSchema = z.object({ location: z.string().max(4_096) });
/** Limites en octets/s : 0 = illimité ; champ absent = inchangé. */
export const torrentLimitRequestSchema = z.object({
  dl: z.number().int().nonnegative().optional(),
  up: z.number().int().nonnegative().optional(),
});
export const torrentAddUrlRequestSchema = z.object({
  urls: z.string().max(100_000),
  category: z.string().max(200).nullish(),
  savepath: z.string().max(4_096).nullish(),
  paused: z.boolean().optional(),
});
/** Fichiers `.torrent` envoyés en base64 (pas de multipart). */
export const TORRENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const torrentAddFileRequestSchema = z.object({
  files: z
    .array(z.object({ name: z.string().max(255), content: z.string() }))
    .min(1)
    .max(50),
  category: z.string().max(200).nullish(),
  savepath: z.string().max(4_096).nullish(),
  paused: z.boolean().optional(),
});
export type TorrentAddFileRequest = z.infer<typeof torrentAddFileRequestSchema>;
export const torrentAddFileResponseSchema = z.object({ ok: z.literal(true), count: z.number() });

/** Catégories reconnues comme Radarr ou Sonarr (badge cliquable de l'original). */
export const RADARR_TORRENT_CATEGORIES = ['films', 'movies', 'radarr'] as const;
export const SONARR_TORRENT_CATEGORIES = ['tv', 'tv-sonarr', 'series', 'sonarr'] as const;

export function torrentPipelineOf(category: string): 'radarr' | 'sonarr' | null {
  const value = category.toLowerCase();
  if ((RADARR_TORRENT_CATEGORIES as readonly string[]).includes(value)) return 'radarr';
  if ((SONARR_TORRENT_CATEGORIES as readonly string[]).includes(value)) return 'sonarr';
  return null;
}
