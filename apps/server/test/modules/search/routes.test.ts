// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche globale (P4.5) : port de `GlobalSearchNormalizationTest`
// (accents et casse ignorés, « commence par » d'abord, départage sur le titre
// brut, titre original cherché, champs internes retirés, 12 résultats au
// plus), recherche en ligne, limitée aux instances lisibles ; vocabulaire de correction
// (`SearchVocabularyTest`).

import type { LocalSearchHit, OnlineSearchHit } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { matchAndRank, normalizeTerm } from '../../../src/modules/search/routes';
import { VOCABULARY_KEY_PREFIX } from '../../../src/modules/search/vocabulary';
import { NOW, mediaEnv, movie, series, type MediaEnv } from '../media-env';

let env: MediaEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

const row = (title: string, original = '') => ({
  title,
  nTitle: normalizeTerm(title),
  nOriginal: normalizeTerm(original),
  nSort: normalizeTerm(title),
});

describe('classement local', () => {
  it('accents et casse ignorés, « commence par » puis alphabétique sur le titre brut', () => {
    const rows = [
      row('Le Retour'),
      row('Été indien'),
      row('Amélie'),
      row('Zèbre été'),
      row('bête'),
    ];
    expect(matchAndRank(rows, 'ETE').map((r) => r.title)).toEqual([
      'Été indien',
      'bête',
      'Zèbre été',
    ]);
    expect(matchAndRank([row('Amelie', "Le Fabuleux Destin d'Amélie")], 'fabuleux')).toHaveLength(
      1,
    );
  });
});

describe('routes', () => {
  it('toutes les instances, 12 résultats, statut des sous-titres absent sans Bazarr', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', {
      body: Array.from({ length: 10 }, (_, i) =>
        movie(i + 1, { title: `Matrix ${String(i + 1).padStart(2, '0')}` }),
      ),
    });
    env.up.radarr4k.on('GET /api/v3/movie', {
      body: [movie(50, { title: 'The Matrix', originalTitle: 'Matrice' })],
    });
    env.up.sonarr.on('GET /api/v3/series', {
      body: [series(1, { title: 'Matrix Show' }), series(2, { title: 'Autre' })],
    });
    const hits = (await env.browser.get(`/api/medias/${env.radarr.slug}/search?q=matrix`)).json<
      LocalSearchHit[]
    >();
    expect(hits).toHaveLength(12);
    expect(hits[0]).toMatchObject({
      type: 'film',
      title: 'Matrix 01',
      inLibrary: true,
      instance: { slug: env.radarr.slug, name: 'Films' },
    });
    expect(hits.map((h) => h.title)).not.toContain('Autre');
    expect(hits.at(-1)?.title).toBe('The Matrix');
    expect(Object.keys(hits[0] ?? {})).not.toContain('nTitle');
    expect(hits[0]).not.toHaveProperty('subtitle');
    const byOriginal = (
      await env.browser.get(`/api/medias/${env.radarr.slug}/search?q=matrice`)
    ).json<LocalSearchHit[]>();
    expect(byOriginal.map((h) => h.id)).toEqual([50]);
    expect((await env.browser.get(`/api/medias/${env.radarr.slug}/search?q=m`)).json()).toEqual([]);
  });

  it('en ligne : déjà présent comparé par id TMDB / TheTVDB sur toutes les instances', async () => {
    env = await mediaEnv();
    env.up.radarr4k.on('GET /api/v3/movie', { body: [movie(9, { tmdbId: 603 })] });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1, { tvdbId: 81189 })] });
    env.up.radarr.on('GET /api/v3/movie/lookup', {
      body: [
        movie(0, { id: undefined, tmdbId: 603, title: 'The Matrix' }),
        movie(0, { id: undefined, tmdbId: 604, title: 'Reloaded' }),
      ],
    });
    env.up.sonarr.on('GET /api/v3/series/lookup', {
      body: [series(0, { id: undefined, tvdbId: 81189, title: 'Breaking Bad' })],
    });
    const hits = (
      await env.browser.get(`/api/medias/${env.radarr.slug}/search/online?q=matrix`)
    ).json<OnlineSearchHit[]>();
    expect(hits.map((h) => [h.type, h.id, h.inLibrary])).toEqual([
      ['film', 603, true],
      ['film', 604, false],
      ['serie', 81189, true],
    ]);
  });

  it('utilisateur simple : instances lisibles seulement, en local comme en ligne', async () => {
    env = await mediaEnv({
      role: 'user',
      permissions: ({ radarr4k }) => ({ [`radarr:${radarr4k.slug}`]: 'read' }),
    });
    env.up.radarr.on('GET /api/v3/movie', { body: [movie(1, { title: 'Matrix A' })] });
    env.up.radarr4k.on('GET /api/v3/movie', { body: [movie(2, { title: 'Matrix B' })] });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1, { title: 'Matrix Show' })] });
    env.up.radarr4k.on('GET /api/v3/movie/lookup', {
      body: [movie(0, { id: undefined, tmdbId: 700, title: 'Matrix C' })],
    });
    const local = (await env.browser.get(`/api/medias/${env.radarr.slug}/search?q=matrix`)).json<
      LocalSearchHit[]
    >();
    expect(local.map((h) => [h.title, h.instance.slug])).toEqual([['Matrix B', env.radarr4k.slug]]);
    // Instance du slug fermée : la recherche en ligne passe par l'instance lisible.
    const online = (
      await env.browser.get(`/api/medias/${env.radarr.slug}/search/online?q=matrix`)
    ).json<OnlineSearchHit[]>();
    expect(online.map((h) => h.title)).toEqual(['Matrix C']);
  });
});

describe('vocabulaire de recherche', () => {
  it('lecture sans appel, reconstruction en file, puis valeur fraîche', async () => {
    env = await mediaEnv();
    let calls = 0;
    const list = (results: unknown[]) => () => {
      calls += 1;
      return { body: { results } };
    };
    env.up.tmdb.on(
      'GET /3/movie/popular',
      list([{ title: 'Interstellar', original_title: 'Interstellar', popularity: 150 }]),
    );
    env.up.tmdb.on('GET /3/tv/popular', list([{ name: 'Pokémon', popularity: 152 }]));
    env.up.tmdb.on('GET /3/movie/top_rated', list([]));
    env.up.tmdb.on('GET /3/tv/top_rated', list([]));
    env.up.tmdb.on('GET /3/person/popular', list([{ name: 'Christopher Nolan', popularity: 25 }]));
    env.up.tmdb.on('GET /3/trending/all/week', list([{ title: 'interstellar', popularity: 10 }]));
    const vocabulary = env.app.cache.vocabulary;
    expect(vocabulary.read()).toEqual([]);
    expect(calls).toBe(0);
    await env.app.cache.queue.idle();
    const words = vocabulary.read();
    expect(words).toEqual(
      expect.arrayContaining([
        { label: 'Interstellar', popularity: 150 },
        { label: 'Pokémon', popularity: 152 },
        { label: 'Christopher Nolan', popularity: 25 },
      ]),
    );
    expect(words.filter((w) => w.label.toLowerCase() === 'interstellar')).toHaveLength(1);
    expect(vocabulary.key()).toBe(`${VOCABULARY_KEY_PREFIX}en-US`);
  });

  it('une reconstruction en échec garde l’ancienne valeur', async () => {
    env = await mediaEnv();
    const key = `${VOCABULARY_KEY_PREFIX}en-US`;
    // Entrée périmée (2 jours) mais encore servie (14 jours).
    env.app.cache.swr.write(key, [{ label: 'Ancien', popularity: 1 }], 14 * 86_400_000, {
      fetchedAt: NOW - 2 * 86_400_000,
    });
    env.up.tmdb.on('GET /3/movie/popular', { status: 500, text: 'boom' });
    await env.app.cache.queue.run(key);
    expect(env.app.cache.swr.read(key, 1)?.value).toEqual([{ label: 'Ancien', popularity: 1 }]);
  });
});
