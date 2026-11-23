// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique de la fiche film (P2.4, P2.5) : notes, durée, badges, informations
// techniques, équipe dédoublonnée, gestionnaire de fichiers, bilan de la
// recherche, tri des releases.

import type {
  ArrRelease,
  MovieCredit,
  MovieDetail,
  MovieFile,
  MovieHistoryItem,
  MovieQueueItem,
} from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { sortReleasesBy } from '../src/components/release-sort';
import { fileName, mapLimit, reportedDownloads } from '../src/features/movies/library';
import {
  leftQueue,
  movieIdsOf,
  queueActions,
  queueProgress,
  queueState,
} from '../src/features/movies/queue';
import { diskUsage, healthColor, logColor } from '../src/features/movies/system';
import {
  addOutcome,
  bestRelease,
  castOf,
  crewOf,
  fallbackStep,
  searchOutcome,
  draftOf,
  formatRuntime,
  formatVotes,
  historyEventKey,
  isDirty,
  languageChoices,
  qualityChoicesFor,
  ratingsOf,
  statusBadges,
  techRows,
} from '../src/features/movies/movie-detail';

const credit = (overrides: Partial<MovieCredit>): MovieCredit => ({
  personName: 'X',
  personTmdbId: null,
  character: null,
  job: null,
  department: null,
  type: 'cast',
  image: null,
  ...overrides,
});

const file = (overrides: Partial<MovieFile> = {}): MovieFile => ({
  id: 1,
  relativePath: 'a.mkv',
  path: '/m/a.mkv',
  size: 10,
  dateAdded: null,
  quality: { id: 7, name: 'Bluray-1080p' },
  languages: [{ id: 2, name: 'French' }],
  releaseGroup: 'GRP',
  edition: null,
  customFormats: [],
  customFormatScore: 0,
  ...overrides,
});

describe('notes et durée', () => {
  it('votes abrégés, IMDb sur 10, TMDB en pourcentage', () => {
    expect(formatVotes(999)).toBe('999');
    expect(formatVotes(1_234)).toBe('1.2k');
    expect(formatVotes(2_100_000)).toBe('2.1M');
    expect(ratingsOf({ ratingsImdb: 8.66, ratingsImdbVotes: 1500, ratingsTmdb: 7.75 })).toEqual({
      imdb: '8.7 (1.5k)',
      tmdb: '78%',
    });
    expect(ratingsOf({ ratingsImdb: 0, ratingsImdbVotes: null, ratingsTmdb: null })).toEqual({
      imdb: null,
      tmdb: null,
    });
  });

  it('durée comme `formatRuntime` d’origine', () => {
    expect(formatRuntime(null)).toBe('');
    expect(formatRuntime(45)).toBe('45min');
    expect(formatRuntime(125)).toBe('2h 05min');
  });
});

describe('badges de statut', () => {
  it.each([
    [{ monitored: true, hasFile: true, status: 'released' }, ['monitored', 'downloaded']],
    [{ monitored: true, hasFile: false, status: 'inCinemas' }, ['monitored', 'unavailable']],
    [{ monitored: true, hasFile: false, status: 'released' }, ['monitored', 'missing']],
    [{ monitored: false, hasFile: false, status: 'announced' }, ['unmonitored', 'missing']],
  ])('%o → %o', (movie, expected) => {
    expect(statusBadges(movie)).toEqual(expected);
  });
});

describe('informations techniques', () => {
  it('lignes présentes seulement, dans l’ordre de l’original', () => {
    const movie = {
      hasFile: true,
      movieFile: {
        size: 2048,
        relativePath: 'M.mkv',
        quality: 'Bluray-1080p',
        releaseGroup: 'GRP',
        customFormats: ['HDR'],
        customFormatScore: 50,
        languages: ['French'],
        mediaInfo: {
          videoCodec: 'x265',
          videoBitrate: null,
          videoBitDepth: 10,
          videoFps: 23.976,
          videoDynamicRange: 'HDR10',
          resolution: '1920x1080',
          runTime: null,
          audioCodec: 'DTS',
          audioBitrate: null,
          audioChannels: 5.1,
          subtitles: null,
        },
      },
    } satisfies Pick<MovieDetail, 'hasFile' | 'movieFile'>;
    const rows = techRows(movie);
    expect(rows.map((row) => row.key)).toEqual([
      'path',
      'quality',
      'video',
      'hdr',
      'audio',
      'languages',
      'size',
      'group',
      'formats',
    ]);
    expect(rows.find((row) => row.key === 'video')?.text).toBe('x265 · 1920x1080 · 24fps');
    expect(rows.find((row) => row.key === 'hdr')?.text).toBe('HDR10 · 10bits');
    expect(rows.find((row) => row.key === 'formats')?.score).toBe('+50');
    expect(techRows({ hasFile: false, movieFile: null })).toEqual([]);
  });
});

describe('crédits', () => {
  it('15 acteurs au plus ; équipe dédoublonnée et triée par poste', () => {
    const cast = Array.from({ length: 20 }, (_, i) => credit({ personName: `A${i}` }));
    expect(castOf(cast)).toHaveLength(15);
    const crew = crewOf([
      credit({ type: 'crew', personName: 'Ed', personTmdbId: 3, job: 'Editor' }),
      credit({ type: 'crew', personName: 'Lana', personTmdbId: 2, job: 'Writer' }),
      credit({ type: 'crew', personName: 'Lana', personTmdbId: 2, job: 'Director' }),
      credit({ type: 'crew', personName: 'Sans id', job: null, department: 'Sound' }),
    ]);
    expect(crew.map((entry) => [entry.person.personName, entry.jobs])).toEqual([
      ['Lana', ['Director', 'Writer']],
      ['Ed', ['Editor']],
      ['Sans id', ['Sound']],
    ]);
  });

  it('libellés d’historique', () => {
    expect(historyEventKey('grabbed')).toBe('media.films.detail.ev_grabbed');
    expect(historyEventKey('movieFolderImported')).toBe('media.films.detail.ev_movie_imported');
    expect(historyEventKey('autre')).toBeNull();
  });
});

describe('gestionnaire de fichiers', () => {
  it('modification détectée sur la qualité, le groupe ou les langues (ordre indifférent)', () => {
    const f = file({
      languages: [
        { id: 2, name: 'French' },
        { id: 1, name: 'English' },
      ],
    });
    const draft = draftOf(f);
    expect(isDirty(f, draft)).toBe(false);
    expect(isDirty(f, { ...draft, languageIds: [2, 1] })).toBe(false);
    expect(isDirty(f, { ...draft, releaseGroup: 'X' })).toBe(true);
    expect(isDirty(f, { ...draft, qualityId: 3 })).toBe(true);
    expect(isDirty(f, { ...draft, languageIds: [1] })).toBe(true);
  });

  it('langues : liste d’origine plus celles du fichier ; qualité actuelle toujours proposée', () => {
    const f = file({ languages: [{ id: 99, name: 'Klingon' }] });
    expect(languageChoices(f).at(-1)).toEqual({ id: 99, name: 'Klingon' });
    expect(languageChoices(f)).toHaveLength(13);
    expect(qualityChoicesFor(f, [{ id: 1, name: 'SD' }])).toEqual([
      { id: 7, name: 'Bluray-1080p' },
      { id: 1, name: 'SD' },
    ]);
    expect(qualityChoicesFor(f, [{ id: 7, name: 'HD' }])).toEqual([{ id: 7, name: 'HD' }]);
  });
});

describe('bilan de la recherche automatique (P2.5)', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const history = (eventType: string, date: string) => ({
    id: 1,
    movieId: 1,
    eventType,
    date,
    quality: null,
    sourceTitle: null,
    indexer: 'Idx',
    releaseTitle: null,
    importedPath: null,
    downloadClient: null,
    protocol: null,
    reason: null,
    movie: null,
  });
  const queued = { id: 3, movieId: 1, title: 'Movie', status: 'downloading' } as MovieQueueItem;

  it('file d’abord, puis grab de moins de 2 min, sinon rien', () => {
    expect(searchOutcome(1, [], [queued], now)).toEqual({
      kind: 'queue',
      title: 'Movie',
      status: 'downloading',
    });
    expect(searchOutcome(1, [history('grabbed', '2026-11-20T11:59:00Z')], [], now)).toEqual({
      kind: 'grabbed',
      indexer: 'Idx',
    });
    expect(searchOutcome(1, [history('grabbed', '2026-11-20T11:50:00Z')], [], now)).toEqual({
      kind: 'none',
    });
    expect(searchOutcome(2, [], [queued], now)).toEqual({ kind: 'none' });
  });

  it('étapes de la recherche directe toutes les 8 s ; meilleure release acceptée', () => {
    expect([0, 7, 8, 16, 24, 99].map((s) => fallbackStep(s, 4))).toEqual([0, 0, 1, 2, 3, 3]);
    const release = (guid: string, approved: boolean) => ({ guid, approved }) as ArrRelease;
    expect(bestRelease([release('a', false), release('b', true)])?.guid).toBe('b');
    expect(bestRelease([release('a', false)])).toBeNull();
  });

  it('tri des colonnes des releases', () => {
    const r = (title: string, seeders: number | null) => ({ title, seeders }) as ArrRelease;
    const list = [r('b', 5), r('A', null), r('c', 9)];
    expect(sortReleasesBy(list, 'title', true).map((x) => x.title)).toEqual(['A', 'b', 'c']);
    expect(sortReleasesBy(list, 'seeders', false).map((x) => x.title)).toEqual(['c', 'b', 'A']);
  });
});

describe('outils des actions par film', () => {
  it('nom de fichier, téléchargements annoncés, parallélisme borné', async () => {
    expect(fileName('/a/b/c.mkv')).toBe('c.mkv');
    expect(fileName(null)).toBe('');
    expect(reportedDownloads('Completed. 2 reports downloaded')).toBe(2);
    expect(reportedDownloads('1 report grabbed')).toBe(1);
    expect(reportedDownloads('Completed')).toBeNull();
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe('suivi après l’ajout (P2.6)', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const event = (eventType: string) =>
    ({
      id: 1,
      movieId: 1,
      eventType,
      date: '2026-11-20T11:59:30Z',
      indexer: 'Idx',
    }) as MovieHistoryItem;
  const queued = { movieId: 1, indexer: 'Idx' } as MovieQueueItem;

  it('file, échec, grab sans file après 30 s, abandon après 60 s', () => {
    expect(addOutcome(1, 1, [], [queued], now)).toEqual({ kind: 'queue', indexer: 'Idx' });
    expect(addOutcome(1, 1, [event('downloadFailed')], [], now)).toEqual({ kind: 'failed' });
    expect(addOutcome(1, 3, [event('grabbed')], [], now)).toEqual({ kind: 'waiting' });
    expect(addOutcome(1, 10, [event('grabbed')], [], now)).toEqual({
      kind: 'grabbed',
      indexer: 'Idx',
    });
    expect(addOutcome(1, 19, [], [], now)).toEqual({ kind: 'waiting' });
    expect(addOutcome(1, 20, [], [], now)).toEqual({ kind: 'timeout' });
  });
});

describe('file d’attente et système (P2.7)', () => {
  const item = (overrides: Partial<MovieQueueItem>) =>
    ({
      id: 1,
      movieId: 1,
      size: 100,
      sizeleft: 25,
      status: 'downloading',
      trackedStatus: 'ok',
      trackedState: 'downloading',
      ...overrides,
    }) as MovieQueueItem;

  it('progression, état affiché (import prioritaire), actions', () => {
    expect(queueProgress(item({}))).toBe(75);
    expect(queueProgress(item({ size: 0 }))).toBe(0);
    expect(queueState(item({ trackedState: 'importBlocked' }), false)).toBe('blocked');
    expect(queueState(item({ trackedState: 'importBlocked' }), true)).toBe('importing');
    expect(queueState(item({ trackedState: 'importPending' }), false)).toBe('pending');
    expect(queueState(item({ trackedStatus: 'warning' }), false)).toBe('warning');
    expect(queueState(item({ status: 'completed', trackedState: '' }), false)).toBe('completed');
    expect(queueState(item({ status: 'delay', trackedState: '' }), false)).toBe('other');
    expect(queueActions(item({ trackedState: 'importBlocked', status: 'completed' }))).toEqual({
      import: true,
      grab: false,
    });
    expect(queueActions(item({ status: 'delay' }))).toEqual({ import: false, grab: true });
  });

  it('films sortis de la file', () => {
    expect(leftQueue(new Set([1, 2, 3]), [item({ movieId: 2 })])).toEqual([1, 3]);
    expect([...movieIdsOf([item({ movieId: null }), item({ movieId: 4 })])]).toEqual([4]);
  });

  it('disques : Go au dixième, seuils de couleur', () => {
    const gib = 1_073_741_824;
    expect(diskUsage({ freeSpace: 5 * gib, totalSpace: 100 * gib })).toEqual({
      pct: 95,
      freeGb: 5,
      totalGb: 100,
      color: 'error',
    });
    expect(diskUsage({ freeSpace: 20 * gib, totalSpace: 100 * gib }).color).toBe('warning');
    expect(diskUsage({ freeSpace: 0, totalSpace: 0 }).pct).toBe(0);
    expect(healthColor('error')).toBe('error');
    expect(logColor('warn')).toBe('warning');
    expect(logColor('debug')).toBeUndefined();
  });
});
