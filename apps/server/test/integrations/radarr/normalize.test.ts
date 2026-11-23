// SPDX-License-Identifier: AGPL-3.0-or-later
// Normalisation Radarr (`normalizeMovie`, `imageUrl`, `normalizeQueueRecords`) :
// valeurs par défaut de l'original et forme validée par le schéma partagé.

import { movieQueueItemSchema, movieSchema } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  imageUrl,
  isoDate,
  normalizeMovie,
  normalizeQueueRecord,
} from '../../../src/integrations/radarr/normalize';

describe('normalizeMovie', () => {
  it('valeurs par défaut sur un film vide', () => {
    const movie = normalizeMovie({});
    expect(movieSchema.parse(movie)).toEqual(movie);
    expect(movie).toMatchObject({
      id: null,
      title: '—',
      sortTitle: '',
      status: 'unknown',
      hasFile: false,
      monitored: false,
      minimumAvailability: 'released',
      tags: [],
      genres: [],
      sizeOnDisk: 0,
      sizeGb: null,
      collection: null,
      movieFile: null,
      language: null,
      languages: [],
    });
  });

  it('film complet', () => {
    const movie = normalizeMovie({
      id: 3,
      tmdbId: 348,
      imdbId: 'tt0078748',
      title: 'Alien',
      sortTitle: 'Alien Le Huitieme',
      year: 1979,
      status: 'released',
      hasFile: true,
      monitored: true,
      qualityProfileId: 4,
      minimumAvailability: 'announced',
      sizeOnDisk: 5_368_709_120,
      added: '2024-01-02T03:04:05Z',
      inCinemas: '1979-05-25T00:00:00Z',
      digitalRelease: null,
      genres: ['Horror'],
      runtime: 117,
      tags: [1],
      collection: { tmdbId: 8091, title: 'Alien Collection' },
      alternateTitles: [{ title: 'Alien, le huitième passager', sourceType: 'tmdb' }],
      ratings: { imdb: { value: 8.5, votes: 900_000 }, tmdb: { value: 8.1, votes: 15_000 } },
      images: [
        { coverType: 'fanart', remoteUrl: 'https://image.tmdb.org/f.jpg' },
        {
          coverType: 'poster',
          remoteUrl: 'https://image.tmdb.org/p.jpg',
          url: '/MediaCover/3/poster.jpg',
        },
      ],
      movieFile: {
        size: 5_368_709_120,
        relativePath: 'Alien (1979).mkv',
        quality: { quality: { name: 'Bluray-1080p' } },
        releaseGroup: 'GRP',
        customFormats: [{ name: 'x265' }, {}],
        customFormatScore: 10,
        languages: [{ name: 'English' }, { name: 'French' }],
        mediaInfo: { videoCodec: 'x265', resolution: '1920x800', audioChannels: 5.1 },
      },
    });
    expect(movieSchema.parse(movie)).toEqual(movie);
    expect(movie).toMatchObject({
      sortTitle: 'alien le huitieme',
      poster: 'https://image.tmdb.org/p.jpg',
      fanart: 'https://image.tmdb.org/f.jpg',
      quality: 'Bluray-1080p',
      sizeGb: 5,
      language: 'English',
      languages: ['English', 'French'],
      collection: { id: 8091, title: 'Alien Collection' },
      alternateTitles: [
        { title: 'Alien, le huitième passager', sourceType: 'tmdb', sourceId: null },
      ],
      addedAt: '2024-01-02T03:04:05.000Z',
      inCinemasAt: '1979-05-25T00:00:00.000Z',
      digitalAt: null,
      physicalAt: null,
      ratings: 8.1,
      ratingsImdb: 8.5,
      ratingsImdbVotes: 900_000,
      ratingsTmdbVotes: 15_000,
    });
    expect(movie.movieFile).toMatchObject({
      customFormats: ['x265', '?'],
      customFormatScore: 10,
      mediaInfo: {
        videoCodec: 'x265',
        resolution: '1920x800',
        audioChannels: 5.1,
        subtitles: null,
      },
    });
  });

  it('titre de tri : repli sur le titre', () => {
    expect(normalizeMovie({ title: 'Le Mépris' }).sortTitle).toBe('le mépris');
  });

  it('taille en Gio arrondie à deux décimales', () => {
    expect(normalizeMovie({ sizeOnDisk: 1_610_612_736 }).sizeGb).toBe(1.5);
    expect(normalizeMovie({ sizeOnDisk: 1_234_567_890 }).sizeGb).toBe(1.15);
  });
});

describe('imageUrl', () => {
  it('première image du type, URL distante seulement (jamais celle de l’instance)', () => {
    const movie = {
      images: [
        { coverType: 'poster' as const, url: '/MediaCover/1/poster.jpg' },
        { coverType: 'poster' as const, remoteUrl: 'https://image.tmdb.org/second.jpg' },
      ],
    };
    expect(imageUrl(movie, 'poster')).toBeNull();
    expect(imageUrl(movie, 'banner')).toBeNull();
  });
});

describe('isoDate', () => {
  it('normalise ou rejette', () => {
    expect(isoDate('2024-01-02T03:04:05Z')).toBe('2024-01-02T03:04:05.000Z');
    expect(isoDate('pas une date')).toBeNull();
    expect(isoDate('')).toBeNull();
    expect(isoDate(null)).toBeNull();
  });
});

describe('normalizeQueueRecord', () => {
  it('valeurs par défaut', () => {
    const item = normalizeQueueRecord({});
    expect(movieQueueItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      title: '—',
      size: 0,
      sizeleft: 0,
      status: 'unknown',
      trackedStatus: 'ok',
      trackedState: '',
      quality: '—',
      protocol: '—',
      statusMessages: [],
    });
  });

  it('titre du film prioritaire, messages repris', () => {
    const item = normalizeQueueRecord({
      id: 1,
      movieId: 3,
      title: 'Alien.1979.1080p.BluRay',
      movie: { title: 'Alien', year: 1979 },
      quality: { quality: { name: 'Bluray-1080p' } },
      protocol: 'torrent',
      trackedDownloadStatus: 'warning',
      trackedDownloadState: 'importPending',
      estimatedCompletionTime: '2026-11-18T10:00:00Z',
      statusMessages: [{ title: 'a.mkv', messages: ['No files found'] }, {}],
    });
    expect(movieQueueItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      title: 'Alien',
      year: 1979,
      quality: 'Bluray-1080p',
      protocol: 'torrent',
      trackedStatus: 'warning',
      trackedState: 'importPending',
      eta: '2026-11-18T10:00:00Z',
      statusMessages: [
        { title: 'a.mkv', messages: ['No files found'] },
        { title: '', messages: [] },
      ],
    });
    expect(normalizeQueueRecord({ title: 'Release.Only' }).title).toBe('Release.Only');
  });
});
