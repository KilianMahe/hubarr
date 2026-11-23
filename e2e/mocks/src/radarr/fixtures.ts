// SPDX-License-Identifier: AGPL-3.0-or-later
// Fixtures du faux Radarr (API v3 de Radarr 5) : une petite bibliothèque aux
// statuts variés (téléchargés, manquants, non suivis, annoncés), profils,
// dossiers, étiquettes, crédits, releases, collection. Titres inventés, sans
// image (aucun appel réseau sortant pendant les tests).

export interface MockMovie {
  id: number;
  tmdbId: number;
  imdbId: string;
  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number;
  overview: string;
  status: 'released' | 'announced' | 'inCinemas';
  monitored: boolean;
  hasFile: boolean;
  qualityProfileId: number;
  minimumAvailability: string;
  path: string;
  rootFolderPath: string;
  tags: number[];
  genres: string[];
  runtime: number;
  studio: string;
  certification: string;
  added: string;
  inCinemas: string;
  digitalRelease?: string;
  sizeOnDisk: number;
  images: unknown[];
  alternateTitles: { title: string; sourceType: string }[];
  ratings: { imdb: { value: number; votes: number }; tmdb: { value: number; votes: number } };
  collection?: { tmdbId: number; title: string };
  movieFile?: Record<string, unknown>;
}

const GIB = 1_073_741_824;

interface Seed {
  title: string;
  year: number;
  genres: string[];
  status?: MockMovie['status'];
  monitored?: boolean;
  hasFile?: boolean;
  quality?: string;
  collection?: boolean;
}

const SEEDS: Seed[] = [
  {
    title: 'Orbite Basse',
    year: 2019,
    genres: ['Science Fiction', 'Drama'],
    hasFile: true,
    quality: 'Bluray-1080p',
    collection: true,
  },
  {
    title: 'Orbite Basse II',
    year: 2022,
    genres: ['Science Fiction'],
    hasFile: true,
    quality: 'WEBDL-2160p',
    collection: true,
  },
  {
    title: 'Orbite Basse III',
    year: 2026,
    genres: ['Science Fiction'],
    status: 'announced',
    collection: true,
  },
  {
    title: 'Le Phare des Brumes',
    year: 2017,
    genres: ['Mystery', 'Thriller'],
    hasFile: true,
    quality: 'Bluray-720p',
  },
  { title: 'Cartographes', year: 2021, genres: ['Adventure'] },
  {
    title: 'La Dernière Escale',
    year: 2015,
    genres: ['Drama'],
    hasFile: true,
    quality: 'HDTV-720p',
  },
  { title: 'Minuit à Valparaíso', year: 2023, genres: ['Romance', 'Drama'] },
  { title: 'Les Horlogers', year: 2012, genres: ['Comedy'], monitored: false },
  {
    title: 'Sel et Cendres',
    year: 2020,
    genres: ['Western'],
    hasFile: true,
    quality: 'Bluray-1080p',
  },
  { title: 'Tempête sur Ys', year: 2024, genres: ['Fantasy', 'Adventure'], status: 'inCinemas' },
  {
    title: 'Ascenseur pour Kepler',
    year: 2018,
    genres: ['Science Fiction', 'Comedy'],
    hasFile: true,
    quality: 'WEBDL-1080p',
  },
  { title: 'Le Jardin Suspendu', year: 2016, genres: ['Animation', 'Family'], monitored: false },
  { title: 'Brise-Glace', year: 2022, genres: ['Action', 'Thriller'] },
  {
    title: 'Néon Fantôme',
    year: 2014,
    genres: ['Crime', 'Thriller'],
    hasFile: true,
    quality: 'Bluray-1080p',
  },
  { title: 'Les Veilleurs de Lune', year: 2025, genres: ['Fantasy'] },
  { title: 'Archipel', year: 2011, genres: ['Documentary'], hasFile: true, quality: 'DVD' },
];

export const QUALITY_IDS: Record<string, number> = {
  DVD: 2,
  'HDTV-720p': 4,
  'WEBDL-1080p': 3,
  'Bluray-720p': 6,
  'Bluray-1080p': 7,
  'WEBDL-2160p': 18,
};

function movieFile(id: number, title: string, year: number, quality: string) {
  const relativePath = `${title} (${year}) ${quality}.mkv`;
  return {
    id: 100 + id,
    movieId: id,
    relativePath,
    path: `/movies/${title} (${year})/${relativePath}`,
    size: 8 * GIB,
    dateAdded: '2025-06-01T10:00:00Z',
    releaseGroup: 'HUBARR',
    edition: '',
    languages: [{ id: 2, name: 'French' }],
    quality: {
      quality: { id: QUALITY_IDS[quality] ?? 7, name: quality },
      revision: { version: 1, real: 0, isRepack: false },
    },
    customFormats: [],
    customFormatScore: 0,
    mediaInfo: {
      videoCodec: 'x265',
      videoBitDepth: 10,
      videoFps: 23.976,
      videoDynamicRange: quality.includes('2160') ? 'HDR10' : '',
      resolution: quality.includes('2160') ? '3840x2160' : '1920x1080',
      audioCodec: 'EAC3',
      audioChannels: 5.1,
      subtitles: 'French / English',
    },
  };
}

export function seedMovies(): MockMovie[] {
  return SEEDS.map((seed, index) => {
    const id = index + 1;
    const hasFile = seed.hasFile ?? false;
    const quality = seed.quality ?? 'Bluray-1080p';
    return {
      id,
      tmdbId: 9000 + id,
      imdbId: `tt90000${String(id).padStart(2, '0')}`,
      title: seed.title,
      originalTitle: seed.title,
      sortTitle: seed.title.toLowerCase(),
      year: seed.year,
      overview: `Synopsis de « ${seed.title} », un film inventé pour les tests de Hubarr.`,
      status: seed.status ?? 'released',
      monitored: seed.monitored ?? true,
      hasFile,
      qualityProfileId: id % 3 === 0 ? 4 : 1,
      minimumAvailability: 'released',
      path: `/movies/${seed.title} (${seed.year})`,
      rootFolderPath: '/movies',
      tags: id % 4 === 0 ? [1] : [],
      genres: seed.genres,
      runtime: 90 + id * 3,
      studio: 'Studio Fictif',
      certification: 'PG-13',
      added: `2025-0${(id % 9) + 1}-15T12:00:00Z`,
      inCinemas: `${seed.year}-03-01T00:00:00Z`,
      ...(seed.status === undefined ? { digitalRelease: `${seed.year}-06-01T00:00:00Z` } : {}),
      sizeOnDisk: hasFile ? 8 * GIB : 0,
      images: [],
      alternateTitles: [{ title: `${seed.title} (alt)`, sourceType: 'tmdb' }],
      ratings: {
        imdb: { value: 6 + (id % 4) * 0.7, votes: 1000 * id },
        tmdb: { value: 6.5 + (id % 3) * 0.5, votes: 500 },
      },
      ...(seed.collection
        ? { collection: { tmdbId: 7001, title: 'Orbite Basse — la collection' } }
        : {}),
      ...(hasFile ? { movieFile: movieFile(id, seed.title, seed.year, quality) } : {}),
    };
  });
}

/** Films trouvés par la recherche d'ajout (`/movie/lookup`), absents de la bibliothèque. */
export const LOOKUP_CANDIDATES = [
  { tmdbId: 9501, title: 'Le Grand Détour', year: 2020, genres: ['Comedy'], runtime: 104 },
  { tmdbId: 9502, title: 'Détour par Osaka', year: 2023, genres: ['Drama'], runtime: 118 },
];

export const QUALITY_PROFILES = [
  { id: 1, name: 'HD-1080p', formatItems: [{ format: 1, name: 'HDR', score: 50 }] },
  { id: 4, name: 'Ultra-HD', formatItems: [{ format: 1, name: 'HDR', score: 100 }] },
];

export const ROOT_FOLDERS = [{ id: 1, path: '/movies', accessible: true, freeSpace: 500 * GIB }];

export const QUALITY_DEFINITIONS = Object.entries(QUALITY_IDS).map(([name, id], index) => ({
  id: index + 1,
  title: name,
  weight: index + 1,
  quality: { id, name },
}));

export const CREDITS = [
  {
    personName: 'Camille Ardent',
    personTmdbId: 501,
    character: 'Commandante Ivo',
    type: 'cast',
    images: [],
  },
  {
    personName: 'Noé Valin',
    personTmdbId: 502,
    character: 'Le navigateur',
    type: 'cast',
    images: [],
  },
  {
    personName: 'Inès Morel',
    personTmdbId: 503,
    job: 'Director',
    department: 'Directing',
    type: 'crew',
    images: [],
  },
  {
    personName: 'Inès Morel',
    personTmdbId: 503,
    job: 'Screenplay',
    department: 'Writing',
    type: 'crew',
    images: [],
  },
];

export function releasesFor(movie: MockMovie) {
  const base = movie.title.replace(/[^A-Za-z0-9]+/g, '.');
  return [
    {
      guid: `${movie.id}-best`,
      indexerId: 1,
      indexer: 'IndexeurTest',
      title: `${base}.${movie.year}.1080p.BluRay.x265-HUBARR`,
      quality: { quality: { id: 7, name: 'Bluray-1080p' } },
      size: 9 * GIB,
      seeders: 120,
      leechers: 4,
      protocol: 'torrent',
      age: 12,
      approved: true,
      rejections: [],
      customFormatScore: 50,
      customFormats: [{ id: 1, name: 'HDR' }],
      languages: [{ id: 2, name: 'French' }],
      infoUrl: 'https://indexer.example/t/1',
    },
    {
      guid: `${movie.id}-web`,
      indexerId: 1,
      indexer: 'IndexeurTest',
      title: `${base}.${movie.year}.1080p.WEB-DL-GRP`,
      quality: { quality: { id: 3, name: 'WEBDL-1080p' } },
      size: 4 * GIB,
      seeders: 35,
      leechers: 2,
      protocol: 'torrent',
      age: 40,
      approved: true,
      rejections: [],
      customFormatScore: 0,
      customFormats: [],
      languages: [{ id: 1, name: 'English' }],
    },
    {
      guid: `${movie.id}-cam`,
      indexerId: 2,
      indexer: 'AutreIndexeur',
      title: `${base}.${movie.year}.CAM-XYZ`,
      quality: { quality: { id: 0, name: 'CAM' } },
      size: 1 * GIB,
      seeders: 3,
      leechers: 20,
      protocol: 'torrent',
      age: 1,
      approved: false,
      rejections: ['Not wanted in profile'],
      customFormatScore: 0,
      customFormats: [],
      languages: [],
    },
  ];
}
