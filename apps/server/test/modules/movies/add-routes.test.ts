// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajout de films et suivi de personnes (P2.6) : profil par défaut de
// l'instance, chemin explicite, listes d'import TMDb.

import type { Movie } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateInstance } from '../../../src/modules/instances/instances';
import { personFields, personIdOf } from '../../../src/modules/movies/add-routes';
import { noDns, rawMovie, radarrEnv, warmLibrary, type RadarrEnv } from './radarr-env';

let env: RadarrEnv;
beforeEach(async () => {
  env = await radarrEnv();
});
afterEach(async () => {
  await env.close();
});

describe('lookup', () => {
  it('recherche normalisée (id = déjà dans Radarr) ; terme vide → liste vide sans appel', async () => {
    env.radarr.on('GET', '/api/v3/movie/lookup', [
      rawMovie(0, { id: undefined, tmdbId: 603, title: 'The Matrix' }),
      rawMovie(7, { tmdbId: 604, title: 'The Matrix Reloaded' }),
    ]);
    const movies = (await env.browser.get(env.url('/lookup?term=matrix'))).json<Movie[]>();
    expect(movies.map((m) => [m.id, m.tmdbId])).toEqual([
      [null, 603],
      [7, 604],
    ]);
    expect(env.radarr.callsTo('GET', '/api/v3/movie/lookup')[0]?.query.get('term')).toBe('matrix');
    expect((await env.browser.get(env.url('/lookup?term=%20'))).json()).toEqual([]);
    expect(env.radarr.callsTo('GET', '/api/v3/movie/lookup')).toHaveLength(1);
  });

  it('lookup TMDb : film, ou null sans id', async () => {
    env.radarr.on('GET', '/api/v3/movie/lookup/tmdb', rawMovie(0, { id: undefined, tmdbId: 603 }));
    expect((await env.browser.get(env.url('/lookup/tmdb?tmdbId=603'))).json<Movie>().tmdbId).toBe(
      603,
    );
    expect((await env.browser.get(env.url('/lookup/tmdb'))).json()).toBeNull();
  });
});

describe('ajout', () => {
  it('profil par défaut de l’instance quand aucun n’est choisi ; recherche et cache', async () => {
    await updateInstance(
      env.database.db,
      env.instance,
      { name: 'Films', url: 'http://radarr.test', defaultQualityProfileId: 6 },
      noDns,
    );
    await warmLibrary(env);
    env.radarr.on('POST', '/api/v3/movie', rawMovie(42, { tmdbId: 603, title: 'The Matrix' }));
    const response = await env.browser.post(env.url('/add'), {
      tmdbId: 603,
      title: 'The Matrix',
      year: 1999,
      rootFolderPath: '/movies',
      monitored: true,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      movieId: 42,
      movie: { title: 'The Matrix' },
    });
    expect(env.radarr.callsTo('POST', '/api/v3/movie')[0]?.body).toEqual({
      tmdbId: 603,
      title: 'The Matrix',
      year: 1999,
      qualityProfileId: 6,
      monitored: true,
      minimumAvailability: 'released',
      addOptions: { searchForMovie: true },
      rootFolderPath: '/movies',
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('profil choisi gardé ; chemin explicite prioritaire sur le dossier racine', async () => {
    env.radarr.on('POST', '/api/v3/movie', rawMovie(1));
    await env.browser.post(env.url('/add'), {
      tmdbId: 1,
      qualityProfileId: 3,
      path: '/movies/Old (1990)',
      rootFolderPath: '/movies',
      searchForMovie: false,
    });
    const body = env.radarr.callsTo('POST', '/api/v3/movie')[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      qualityProfileId: 3,
      path: '/movies/Old (1990)',
      addOptions: { searchForMovie: false },
    });
    expect(body).not.toHaveProperty('rootFolderPath');
  });

  it('sans dossier ni chemin → 400 ; film déjà présent → 502 avec le message de Radarr', async () => {
    expect((await env.browser.post(env.url('/add'), { tmdbId: 1 })).statusCode).toBe(400);
    env.radarr.on(
      'POST',
      '/api/v3/movie',
      [{ errorMessage: 'This movie has already been added' }],
      400,
    );
    const response = await env.browser.post(env.url('/add'), { tmdbId: 1, rootFolderPath: '/m' });
    expect(response.statusCode).toBe(502);
    expect(response.json<{ message: string }>().message).toContain('already been added');
  });
});

describe('suivi de personnes', () => {
  const template = {
    implementation: 'TMDbPersonImport',
    name: '',
    fields: [
      { name: 'personId', value: '' },
      { name: 'personCast', value: false },
      { name: 'personCastDirector', value: false },
      { name: 'personCastProducer', value: false },
      { name: 'personCastWriting', value: false },
      { name: 'personCastSound', value: false },
      { name: 'other', value: 'x' },
    ],
  };

  it('cases selon le rôle ; id de la personne lu dans la liste', () => {
    const fields = personFields(template, 9, 'crew', 'Screenplay');
    expect(Object.fromEntries(fields.map((f) => [f.name, f.value]))).toEqual({
      personId: '9',
      personCast: false,
      personCastDirector: false,
      personCastProducer: false,
      personCastWriting: true,
      personCastSound: false,
      other: 'x',
    });
    expect(personIdOf({ ...template, fields })).toBe(9);
    expect(personIdOf({ implementation: 'TraktList', fields })).toBeNull();
  });

  it('following : id TMDb → id de liste, autres listes ignorées', async () => {
    env.radarr.on('GET', '/api/v3/importlist', [
      { id: 3, implementation: 'TMDbPersonImport', fields: [{ name: 'personId', value: '6384' }] },
      { id: 4, implementation: 'TraktListImport', fields: [] },
    ]);
    expect((await env.browser.get(env.url('/person/following'))).json()).toEqual({ '6384': 3 });
  });

  it('follow : crée la liste (profil par défaut, premier dossier) ; déjà suivie → already', async () => {
    await updateInstance(
      env.database.db,
      env.instance,
      { name: 'Films', url: 'http://radarr.test', defaultQualityProfileId: 8 },
      noDns,
    );
    env.radarr.on('GET', '/api/v3/importlist', []);
    env.radarr.on('GET', '/api/v3/importlist/schema', [{ implementation: 'Other' }, template]);
    env.radarr.on('GET', '/api/v3/qualityprofile', [{ id: 1 }, { id: 8 }]);
    env.radarr.on('GET', '/api/v3/rootfolder', [{ id: 1, path: '/films' }]);
    env.radarr.on('POST', '/api/v3/importlist', { id: 11 });
    const response = await env.browser.post(env.url('/person/follow'), {
      personTmdbId: 6384,
      personName: 'Keanu Reeves',
      type: 'cast',
    });
    expect(response.json()).toEqual({ ok: true, listId: 11, already: false });
    expect(env.radarr.callsTo('POST', '/api/v3/importlist')[0]?.body).toMatchObject({
      implementation: 'TMDbPersonImport',
      name: 'Keanu Reeves',
      enabled: true,
      enableAuto: false,
      searchOnAdd: false,
      qualityProfileId: 8,
      rootFolderPath: '/films',
      minimumAvailability: 'announced',
    });

    env.radarr.on('GET', '/api/v3/importlist', [
      { id: 11, implementation: 'TMDbPersonImport', fields: [{ name: 'personId', value: 6384 }] },
    ]);
    const again = await env.browser.post(env.url('/person/follow'), { personTmdbId: 6384 });
    expect(again.json()).toEqual({ ok: true, listId: 11, already: true });
  });

  it('follow sans id → 400 ; unfollow supprime la liste', async () => {
    expect(
      (await env.browser.post(env.url('/person/follow'), { personTmdbId: 0 })).statusCode,
    ).toBe(400);
    env.radarr.on('DELETE', '/api/v3/importlist/11');
    expect((await env.browser.post(env.url('/person/unfollow'), { listId: 11 })).json()).toEqual({
      ok: true,
    });
    expect(env.radarr.callsTo('DELETE', '/api/v3/importlist/11')).toHaveLength(1);
  });
});
