// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels typés d'après OpenAPI : gabarits de chemin, et déduction des types
// (paramètres obligatoires, requête, corps, réponse) vérifiée à la compilation.

import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { TypedApi, expandPath } from '../../../src/integrations/arr/typed-api';
import type { RadarrMovieResource, RadarrPaths } from '../../../src/integrations/radarr/types';
import { fakeArr, type FakeArr } from './fake-arr';

let fake: FakeArr | null = null;

afterEach(async () => {
  await fake?.agent.close();
  fake = null;
});

describe('expandPath', () => {
  it('remplace et encode les paramètres', () => {
    expect(expandPath('/api/v3/movie/{id}', { id: 12 })).toBe('/api/v3/movie/12');
    expect(expandPath('/api/v3/filesystem/{path}', { path: 'a b/c' })).toBe(
      '/api/v3/filesystem/a%20b%2Fc',
    );
    expect(expandPath('/api/v3/movie', undefined)).toBe('/api/v3/movie');
  });

  it('refuse un paramètre manquant', () => {
    expect(() => expandPath('/api/v3/movie/{id}', {})).toThrow(/id/);
  });
});

describe('TypedApi', () => {
  it('envoie requête et corps, renvoie le JSON', async () => {
    fake = fakeArr();
    const api = new TypedApi<RadarrPaths>(fake.http);
    fake.on('GET', '/api/v3/movie/lookup', [{ title: 'Alien' }]);
    const found = await api.get('/api/v3/movie/lookup', { query: { term: 'alien' } });
    expect(found).toEqual([{ title: 'Alien' }]);
    expect(fake.last().query.get('term')).toBe('alien');

    fake.on('PUT', '/api/v3/movie/editor', {});
    await api.put('/api/v3/movie/editor', { body: { movieIds: [1], monitored: false } });
    expect(fake.last().body).toEqual({ movieIds: [1], monitored: false });
  });

  it('les tableaux de la requête sont répétés', async () => {
    fake = fakeArr();
    const api = new TypedApi<RadarrPaths>(fake.http);
    fake.on('GET', '/api/v3/moviefile', []);
    await api.get('/api/v3/moviefile', { query: { movieFileIds: [1, 2] } });
    expect(fake.last().query.getAll('movieFileIds')).toEqual(['1', '2']);
  });

  it('déduit les types de la spec', () => {
    // Jamais appelée : les vérifications portent sur les types.
    function typeChecks(api: TypedApi<RadarrPaths>): void {
      expectTypeOf(api.get('/api/v3/movie')).resolves.toEqualTypeOf<RadarrMovieResource[] | null>();
      expectTypeOf(
        api.get('/api/v3/movie/{id}', { params: { id: 1 } }),
      ).resolves.toEqualTypeOf<RadarrMovieResource | null>();
      // @ts-expect-error paramètre de chemin obligatoire
      void api.get('/api/v3/movie/{id}');
      // @ts-expect-error paramètre de requête inconnu de l'API
      void api.get('/api/v3/movie/lookup', { query: { title: 'x' } });
      // @ts-expect-error méthode absente de ce chemin
      void api.post('/api/v3/movie/lookup');
    }
    expect(typeChecks).toBeTypeOf('function');
  });
});
