// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Radarr : port de `ArrBulkDeletePayloadTest` (suppression de masse sur
// l'éditeur) et contrat de chaque appel de bibliothèque repris de
// `RadarrClient.php`, avec les noms de paramètres corrigés d'après la spec
//.

import { afterEach, describe, expect, it } from 'vitest';
import { RadarrClient } from '../../../src/integrations/radarr/client';
import type { RadarrMovieResource } from '../../../src/integrations/radarr/types';
import { fakeArr, type FakeArr } from '../arr/fake-arr';

let fake: FakeArr;
let client: RadarrClient;

function setup(): void {
  fake = fakeArr();
  client = new RadarrClient(fake.http);
}

afterEach(async () => {
  await fake.agent.close();
});

const rawAlien = {
  id: 3,
  title: 'Alien',
  sortTitle: 'Alien',
  year: 1979,
  tmdbId: 348,
  monitored: true,
  hasFile: false,
  images: [
    { coverType: 'poster' as const, remoteUrl: 'https://image.tmdb.org/t/p/original/a.jpg' },
  ],
} satisfies RadarrMovieResource;

describe('films', () => {
  it('bibliothèque normalisée, délai élargi accepté', async () => {
    setup();
    fake.on('GET', '/api/v3/movie', [rawAlien]);
    const movies = await client.movies(30_000);
    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({
      id: 3,
      title: 'Alien',
      sortTitle: 'alien',
      poster: rawAlien.images[0]?.remoteUrl,
    });
  });

  it('corps vide : bibliothèque vide', async () => {
    setup();
    fake.on('GET', '/api/v3/movie');
    await expect(client.rawMovies()).resolves.toEqual([]);
  });

  it('recherche par terme, IMDb (premier résultat ou null) et TMDB', async () => {
    setup();
    fake.onCall('GET', '/api/v3/movie/lookup', (call) => ({
      status: 200,
      body: call.query.get('term') === 'imdb:tt0078748' ? [rawAlien, { title: 'Autre' }] : [],
    }));
    fake.on('GET', '/api/v3/movie/lookup/tmdb', rawAlien);
    await expect(client.lookupMovies('nothing')).resolves.toEqual([]);
    await expect(client.lookupByImdb('tt0078748')).resolves.toMatchObject({ title: 'Alien' });
    await expect(client.lookupByImdb('tt0')).resolves.toBeNull();
    await client.lookupByTmdb(348);
    expect(fake.last().query.get('tmdbId')).toBe('348');
  });

  it('suppression : `addImportExclusion` (et non `addExclusion` de l’original)', async () => {
    setup();
    fake.on('DELETE', '/api/v3/movie/3');
    await client.deleteMovie(3, { deleteFiles: true, addImportExclusion: true });
    expect(Object.fromEntries(fake.last().query)).toEqual({
      deleteFiles: 'true',
      addImportExclusion: 'true',
    });
    await client.deleteMovie(3);
    expect(Object.fromEntries(fake.last().query)).toEqual({
      deleteFiles: 'false',
      addImportExclusion: 'false',
    });
  });

  it('suivi : relit le film et le renvoie complet', async () => {
    setup();
    fake.on('GET', '/api/v3/movie/3', rawAlien);
    fake.on('PUT', '/api/v3/movie/3', { ...rawAlien, monitored: false }, 202);
    await client.setMonitored(3, false);
    expect(fake.calls.map((call) => call.method)).toEqual(['GET', 'PUT']);
    expect(fake.last().body).toEqual({ ...rawAlien, monitored: false });
  });

  it('ajout et mise à jour renvoient le film normalisé', async () => {
    setup();
    fake.on('POST', '/api/v3/movie', rawAlien, 201);
    fake.on('PUT', '/api/v3/movie/3', { ...rawAlien, title: 'Aliens' }, 202);
    await expect(client.addMovie({ tmdbId: 348 })).resolves.toMatchObject({ id: 3 });
    await expect(client.updateMovie(3, rawAlien)).resolves.toMatchObject({ title: 'Aliens' });
  });

  it('suppression de masse sur l’éditeur (ArrBulkDeletePayloadTest)', async () => {
    setup();
    fake.on('DELETE', '/api/v3/movie/editor', {});
    await client.bulkDeleteMovies([3, 7], { deleteFiles: true, addImportExclusion: true });
    expect(fake.last()).toMatchObject({ method: 'DELETE', path: '/api/v3/movie/editor' });
    expect(fake.last().body).toEqual({
      movieIds: [3, 7],
      deleteFiles: true,
      addImportExclusion: true,
    });
  });

  it('mise à jour de masse : ids et changements dans le même corps', async () => {
    setup();
    fake.on('PUT', '/api/v3/movie/editor', {});
    await client.bulkUpdateMovies([1, 2], { tags: [4], applyTags: 'add' });
    expect(fake.last().body).toEqual({ movieIds: [1, 2], tags: [4], applyTags: 'add' });
  });
});

describe('fichiers, extras, crédits, renommage', () => {
  it('suppression groupée des fichiers : `movieFileIds`', async () => {
    setup();
    fake.on('DELETE', '/api/v3/moviefile/bulk', {});
    await client.bulkDeleteMovieFiles([10, 11]);
    expect(fake.last().body).toEqual({ movieFileIds: [10, 11] });
  });

  it('lectures par film', async () => {
    setup();
    for (const path of [
      '/api/v3/moviefile',
      '/api/v3/extrafile',
      '/api/v3/credit',
      '/api/v3/rename',
    ]) {
      fake.on('GET', path, [{ id: 1 }]);
    }
    await expect(client.movieFiles(3)).resolves.toEqual([{ id: 1 }]);
    await expect(client.extraFiles(3)).resolves.toEqual([{ id: 1 }]);
    await expect(client.credits(3)).resolves.toEqual([{ id: 1 }]);
    await expect(client.renameProposals(3)).resolves.toEqual([{ id: 1 }]);
    expect(fake.calls.every((call) => call.query.get('movieId') === '3')).toBe(true);
  });

  it('renommage : commande `RenameMovie`', async () => {
    setup();
    fake.on('POST', '/api/v3/command', { id: 5 }, 201);
    await expect(client.executeRename(3)).resolves.toBe(5);
    expect(fake.last().body).toEqual({ name: 'RenameMovie', movieIds: [3] });
  });
});

describe('historique', () => {
  it('page avec le film, date décroissante par défaut (P5c.5), filtres seulement s’ils sont donnés', async () => {
    setup();
    fake.on('GET', '/api/v3/history', { records: [] });
    await client.history();
    expect(Object.fromEntries(fake.last().query)).toEqual({
      page: '1',
      pageSize: '50',
      includeMovie: 'true',
      sortKey: 'date',
      sortDirection: 'descending',
    });
    await client.history({ page: 2, pageSize: 20, eventType: 'grabbed', movieId: 3 });
    expect(Object.fromEntries(fake.last().query)).toEqual({
      page: '2',
      pageSize: '20',
      includeMovie: 'true',
      sortKey: 'date',
      sortDirection: 'descending',
      eventType: 'grabbed',
      movieIds: '3',
    });
    await client.history({
      sort: { key: 'movieMetadata.sortTitle', direction: 'ascending' },
      movieIds: [4, 5],
    });
    expect(fake.last().query.getAll('movieIds')).toEqual(['4', '5']);
    expect(fake.last().query.get('sortKey')).toBe('movieMetadata.sortTitle');
  });

  it('depuis une date, au format de l’original (sans millisecondes)', async () => {
    setup();
    fake.on('GET', '/api/v3/history/since', []);
    await client.historySince(new Date('2026-11-18T08:09:10.123Z'), 'grabbed');
    expect(fake.last().query.get('date')).toBe('2026-11-18T08:09:10Z');
    expect(fake.last().query.get('eventType')).toBe('grabbed');
  });

  it('par film', async () => {
    setup();
    fake.on('GET', '/api/v3/history/movie', []);
    await client.movieHistory(3);
    expect(Object.fromEntries(fake.last().query)).toEqual({ movieId: '3', includeMovie: 'true' });
  });
});

describe("file d'attente, calendrier, commandes", () => {
  it('file normalisée, 50 éléments avec le film', async () => {
    setup();
    fake.on('GET', '/api/v3/queue', {
      records: [
        { id: 1, movieId: 3, movie: { title: 'Alien', year: 1979 }, size: 100, sizeleft: 40 },
      ],
    });
    const queue = await client.queue();
    expect(queue[0]).toMatchObject({ id: 1, title: 'Alien', year: 1979, sizeleft: 40 });
    expect(Object.fromEntries(fake.last().query)).toEqual({
      pageSize: '50',
      includeMovie: 'true',
    });
  });

  it('calendrier : bornes en jours autour de maintenant', async () => {
    setup();
    fake.on('GET', '/api/v3/calendar', [rawAlien]);
    const movies = await client.calendar(30, 7, new Date('2026-11-18T23:30:00Z'));
    expect(movies).toHaveLength(1);
    expect(Object.fromEntries(fake.last().query)).toEqual({
      start: '2026-11-11',
      end: '2026-12-18',
    });
  });

  it('commandes de film et globales', async () => {
    setup();
    fake.on('POST', '/api/v3/command', { id: 9 }, 201);
    const expected: [() => Promise<number | null>, Record<string, unknown>][] = [
      [() => client.searchMovie(3), { name: 'MoviesSearch', movieIds: [3] }],
      [() => client.searchAllMissing(), { name: 'MissingMoviesSearch' }],
      [() => client.refreshMovie(3), { name: 'RefreshMovie', movieIds: [3] }],
      [() => client.rescanMovie(3), { name: 'RescanMovie', movieId: 3 }],
      [() => client.refreshAllMovies(), { name: 'RefreshMovie' }],
      [() => client.rssSync(), { name: 'RssSync' }],
    ];
    for (const [run, body] of expected) {
      await expect(run()).resolves.toBe(9);
      expect(fake.last().body).toEqual(body);
    }
  });
});

describe('releases', () => {
  it('recherche interactive et grab', async () => {
    setup();
    fake.on('GET', '/api/v3/release', [{ guid: 'g1', indexerId: 2 }]);
    fake.on('POST', '/api/v3/release', {});
    await expect(client.releases(3)).resolves.toEqual([{ guid: 'g1', indexerId: 2 }]);
    expect(fake.last().query.get('movieId')).toBe('3');
    await client.grabRelease('g1', 2);
    expect(fake.last().body).toEqual({ guid: 'g1', indexerId: 2 });
  });

  it('un grab refusé remonte le message de Radarr', async () => {
    setup();
    fake.on('POST', '/api/v3/release', { message: 'Release already grabbed' }, 409);
    await expect(client.grabRelease('g1', 2)).rejects.toThrow('Release already grabbed');
  });
});

describe('manquants, cutoff, collections, liste de blocage, import manuel', () => {
  it('manquants et cutoff : tri par sortie en salle, suivis seulement', async () => {
    setup();
    fake.on('GET', '/api/v3/wanted/missing', { records: [] });
    fake.on('GET', '/api/v3/wanted/cutoff', { records: [] });
    const query = {
      page: '2',
      pageSize: '25',
      sortKey: 'inCinemas',
      sortDirection: 'descending',
      monitored: 'true',
    };
    await client.missing(2, 25);
    expect(Object.fromEntries(fake.last().query)).toEqual(query);
    await client.cutoff(2, 25);
    expect(Object.fromEntries(fake.last().query)).toEqual(query);
  });

  it('collection : profil envoyé seulement s’il est choisi ; mise à jour groupée', async () => {
    setup();
    fake.on('PUT', '/api/v3/collection/4', {}, 202);
    fake.on('PUT', '/api/v3/collection', {}, 202);
    await client.updateCollection(4, true);
    expect(fake.last().body).toEqual({ monitored: true });
    await client.updateCollection(4, false, 6);
    expect(fake.last().body).toEqual({ monitored: false, qualityProfileId: 6 });
    await client.bulkUpdateCollections([4, 5], true);
    expect(fake.last().body).toEqual({ collectionIds: [4, 5], monitored: true });
  });

  it('liste de blocage par date décroissante, et par film', async () => {
    setup();
    fake.on('GET', '/api/v3/blocklist', { records: [] });
    fake.on('GET', '/api/v3/blocklist/movie', []);
    await client.blocklist();
    expect(Object.fromEntries(fake.last().query)).toEqual({
      page: '1',
      pageSize: '50',
      sortKey: 'date',
      sortDirection: 'descending',
    });
    await client.movieBlocklist(3);
    expect(fake.last().query.get('movieId')).toBe('3');
  });

  it('import manuel : aperçu puis commande de déplacement', async () => {
    setup();
    fake.on('GET', '/api/v3/manualimport', [{ path: '/dl/a.mkv' }]);
    fake.on('POST', '/api/v3/command', { id: 12 }, 201);
    await client.manualImportPreview('/dl', false);
    expect(Object.fromEntries(fake.last().query)).toEqual({
      folder: '/dl',
      filterExistingFiles: 'false',
    });
    const files = [{ path: '/dl/a.mkv', movieId: 3 }];
    await expect(client.manualImport(files)).resolves.toBe(12);
    expect(fake.last().body).toEqual({ name: 'ManualImport', importMode: 'move', files });
  });
});
