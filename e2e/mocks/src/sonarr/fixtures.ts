// SPDX-License-Identifier: AGPL-3.0-or-later
// Fixtures du faux Sonarr (API v3 de Sonarr 4) : une petite bibliothèque aux
// statuts variés (en cours, terminées, animé, à venir, non suivie), saisons,
// épisodes et fichiers générés de façon déterministe, profils, dossiers,
// releases. Titres inventés, sans image (aucun appel réseau sortant).

const GIB = 1_073_741_824;
const DAY = 86_400_000;

export interface MockEpisode {
  id: number;
  seriesId: number;
  tvdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string;
  airDate: string;
  airDateUtc: string;
  hasFile: boolean;
  monitored: boolean;
  episodeFileId: number;
  runtime: number;
}

export interface MockEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  path: string;
  size: number;
  dateAdded: string;
  quality: {
    quality: { id: number; name: string };
    revision: { version: number; real: number; isRepack: boolean };
  };
  languages: { id: number; name: string }[];
  releaseGroup: string;
  releaseType: string;
  indexerFlags: number;
  customFormats: { id: number; name: string }[];
  customFormatScore: number;
  mediaInfo: Record<string, unknown>;
}

export interface MockSeries {
  id: number;
  tvdbId: number;
  title: string;
  sortTitle: string;
  year: number;
  overview: string;
  status: 'continuing' | 'ended' | 'upcoming';
  ended: boolean;
  monitored: boolean;
  monitorNewItems: string;
  seriesType: 'standard' | 'anime' | 'daily';
  seasonFolder: boolean;
  network: string;
  genres: string[];
  runtime: number;
  certification: string;
  qualityProfileId: number;
  path: string;
  rootFolderPath: string;
  tags: number[];
  added: string;
  ratings: { votes: number; value: number };
  images: unknown[];
  seasons: { seasonNumber: number; monitored: boolean }[];
}

interface Seed {
  title: string;
  year: number;
  status: MockSeries['status'];
  network: string;
  genres: string[];
  seasons: number;
  episodes: number;
  /** Épisodes téléchargés : tous, aucun, ou les premiers de chaque saison. */
  files: 'all' | 'none' | number;
  monitored?: boolean;
  seriesType?: MockSeries['seriesType'];
  /** Diffusion à venir (épisodes dans le futur). */
  future?: boolean;
}

const SEEDS: Seed[] = [
  {
    title: 'Les Veilleurs',
    year: 2021,
    status: 'continuing',
    network: 'Canal Nord',
    genres: ['Drama', 'Thriller'],
    seasons: 2,
    episodes: 6,
    files: 4,
  },
  {
    title: 'Brume',
    year: 2016,
    status: 'ended',
    network: 'Horizon TV',
    genres: ['Mystery'],
    seasons: 3,
    episodes: 4,
    files: 'all',
  },
  {
    title: 'Station Polaire',
    year: 2023,
    status: 'continuing',
    network: 'Neko',
    genres: ['Animation', 'Science Fiction'],
    seasons: 1,
    episodes: 8,
    files: 4,
    seriesType: 'anime',
  },
  {
    title: 'Le Phare',
    year: 2027,
    status: 'upcoming',
    network: 'Canal Nord',
    genres: ['Drama'],
    seasons: 1,
    episodes: 6,
    files: 'none',
    future: true,
  },
  {
    title: 'Contrebande',
    year: 2014,
    status: 'ended',
    network: 'Horizon TV',
    genres: ['Crime'],
    seasons: 2,
    episodes: 5,
    files: 'none',
    monitored: false,
  },
  {
    title: 'Relais 19',
    year: 2024,
    status: 'continuing',
    network: 'Onde Libre',
    genres: ['Comedy'],
    seasons: 1,
    episodes: 10,
    files: 'all',
  },
];

export const QUALITY_PROFILES = [
  { id: 1, name: 'Any', formatItems: [] },
  { id: 4, name: 'HD-1080p', formatItems: [{ format: 1, name: 'VOSTFR', score: 20 }] },
];
export const ROOT_FOLDERS = [
  { id: 1, path: '/tv', accessible: true, freeSpace: 900 * GIB, unmappedFolders: [] },
];
export const QUALITY_DEFINITIONS = [
  {
    id: 1,
    quality: { id: 4, name: 'HDTV-720p', source: 'television', resolution: 720 },
    title: 'HDTV-720p',
    weight: 4,
  },
  {
    id: 2,
    quality: { id: 3, name: 'WEBDL-1080p', source: 'web', resolution: 1080 },
    title: 'WEBDL-1080p',
    weight: 8,
  },
  {
    id: 3,
    quality: { id: 7, name: 'Bluray-1080p', source: 'bluray', resolution: 1080 },
    title: 'Bluray-1080p',
    weight: 10,
  },
];

function iso(time: number): string {
  return new Date(time).toISOString();
}

/** Bibliothèque initiale : séries, épisodes et fichiers, dates relatives à `now`. */
export function seedLibrary(now = Date.now()): {
  series: MockSeries[];
  episodes: MockEpisode[];
  files: MockEpisodeFile[];
} {
  const series: MockSeries[] = [];
  const episodes: MockEpisode[] = [];
  const files: MockEpisodeFile[] = [];
  let episodeId = 100;
  let fileId = 500;
  SEEDS.forEach((seed, index) => {
    const id = index + 1;
    const path = `/tv/${seed.title}`;
    series.push({
      id,
      tvdbId: 70_000 + id,
      title: seed.title,
      sortTitle: seed.title.toLowerCase().replace(/^(les?|la) /, ''),
      year: seed.year,
      overview: `${seed.title} : série inventée pour les tests de Hubarr.`,
      status: seed.status,
      ended: seed.status === 'ended',
      monitored: seed.monitored ?? true,
      monitorNewItems: 'all',
      seriesType: seed.seriesType ?? 'standard',
      seasonFolder: true,
      network: seed.network,
      genres: seed.genres,
      runtime: seed.seriesType === 'anime' ? 24 : 45,
      certification: 'TV-14',
      qualityProfileId: 4,
      path,
      rootFolderPath: '/tv',
      tags: [],
      added: iso(now - (60 + id) * DAY),
      ratings: { votes: 1_000 * id, value: 7 + id / 10 },
      images: [],
      seasons: Array.from({ length: seed.seasons }, (_, season) => ({
        seasonNumber: season + 1,
        monitored: seed.monitored ?? true,
      })),
    });
    for (let season = 1; season <= seed.seasons; season += 1) {
      for (let number = 1; number <= seed.episodes; number += 1) {
        const offset = seed.future
          ? (30 + number * 7) * DAY
          : -((seed.seasons - season) * 400 + (seed.episodes - number + 1) * 7) * DAY;
        const air = now + offset;
        const downloaded =
          seed.files === 'all' ? true : seed.files === 'none' ? false : number <= seed.files;
        episodeId += 1;
        let currentFile = 0;
        if (downloaded) {
          fileId += 1;
          currentFile = fileId;
          const code = `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}`;
          files.push({
            id: fileId,
            seriesId: id,
            seasonNumber: season,
            relativePath: `Season ${String(season).padStart(2, '0')}/${seed.title} - ${code}.mkv`,
            path: `${path}/Season ${String(season).padStart(2, '0')}/${seed.title} - ${code}.mkv`,
            size: 2 * GIB,
            dateAdded: iso(air + DAY),
            quality: {
              quality: { id: 3, name: 'WEBDL-1080p' },
              revision: { version: 1, real: 0, isRepack: false },
            },
            languages: [{ id: 2, name: 'French' }],
            releaseGroup: 'HUBARR',
            releaseType: 'singleEpisode',
            indexerFlags: 0,
            customFormats: [{ id: 1, name: 'VOSTFR' }],
            customFormatScore: 20,
            mediaInfo: {
              videoCodec: 'x265',
              resolution: '1920x1080',
              audioCodec: 'EAC3',
              audioChannels: 5.1,
              audioLanguages: 'fre',
            },
          });
        }
        episodes.push({
          id: episodeId,
          seriesId: id,
          tvdbId: 900_000 + episodeId,
          seasonNumber: season,
          episodeNumber: number,
          title: `Épisode ${number}`,
          overview: '',
          airDate: iso(air).slice(0, 10),
          airDateUtc: iso(air),
          hasFile: downloaded,
          monitored: seed.monitored ?? true,
          episodeFileId: currentFile,
          runtime: 45,
        });
      }
    }
  });
  return { series, episodes, files };
}

/** Résultats de la recherche d'une série à ajouter. */
export const LOOKUP_CANDIDATES = [
  {
    title: 'Archipel Nord',
    year: 2022,
    tvdbId: 81_001,
    status: 'continuing',
    network: 'Onde Libre',
    genres: ['Drama'],
    seriesType: 'standard',
  },
  {
    title: 'Sakura Express',
    year: 2020,
    tvdbId: 81_002,
    status: 'ended',
    network: 'Neko',
    genres: ['Animation'],
    seriesType: 'anime',
  },
];

/** Releases d'une recherche interactive (épisode ou saison complète). */
export function releasesFor(seasonNumber: number, episodeNumbers: number[], fullSeason: boolean) {
  const base = fullSeason
    ? `S${String(seasonNumber).padStart(2, '0')}`
    : `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumbers[0] ?? 1).padStart(2, '0')}`;
  return [
    {
      guid: `sonarr-${base}-1080p`,
      indexerId: 1,
      indexer: 'IndexeurTest',
      title: `Release.${base}.1080p.WEB-DL.x265-HUBARR`,
      size: 3 * GIB,
      seeders: 42,
      leechers: 3,
      protocol: 'torrent',
      age: 2,
      approved: true,
      rejections: [],
      quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
      customFormats: [{ id: 1, name: 'VOSTFR' }],
      customFormatScore: 20,
      languages: [{ id: 2, name: 'French' }],
      fullSeason,
      seasonNumber,
      episodeNumbers: fullSeason ? [] : episodeNumbers,
      mappedSeasonNumber: seasonNumber,
      mappedEpisodeNumbers: episodeNumbers,
      releaseGroup: 'HUBARR',
    },
    {
      guid: `sonarr-${base}-720p`,
      indexerId: 1,
      indexer: 'IndexeurTest',
      title: `Release.${base}.720p.HDTV-OLD`,
      size: GIB,
      seeders: 3,
      leechers: 0,
      protocol: 'torrent',
      age: 900,
      approved: false,
      rejections: ['Release is older than maximum age'],
      quality: { quality: { id: 4, name: 'HDTV-720p' } },
      customFormats: [],
      customFormatScore: 0,
      languages: [{ id: 1, name: 'English' }],
      fullSeason,
      seasonNumber,
      episodeNumbers: fullSeason ? [] : episodeNumbers,
      mappedSeasonNumber: seasonNumber,
      mappedEpisodeNumbers: episodeNumbers,
      releaseGroup: 'OLD',
    },
  ];
}
