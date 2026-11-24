// SPDX-License-Identifier: AGPL-3.0-or-later
// Suggestions personnelles (lot 8) : agrégation pondérée par fréquence,
// regroupement par dossier racine, état en bibliothèque réappliqué.

import type { TmdbCard } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  folderLabel,
  groupByRootFolder,
  rankRecommendations,
  withLibrary,
} from '../../../src/modules/discover/personal';
import type { LibraryIndex } from '../../../src/modules/media/library';

const rec = (id: number, vote = 7, popularity = 10) => ({
  id,
  title: `T${id}`,
  vote_average: vote,
  popularity,
});

describe('rankRecommendations', () => {
  it('la fréquence d’abord, puis la note ; sans les titres de départ ni les exclus', () => {
    const seeds = [
      { type: 'movie' as const, id: 1 },
      { type: 'movie' as const, id: 2 },
      { type: 'tv' as const, id: 3 },
    ];
    const ranked = rankRecommendations(
      seeds,
      [
        [rec(10, 5), rec(11, 9), rec(2), rec(99)],
        [rec(10, 5), rec(10, 5), rec(12, 8)],
        [rec(10, 6)],
      ],
      (type, id) => type === 'movie' && id === 99,
    );
    expect(ranked.map((r) => `${r.type}_${r.item.id as number}`)).toEqual([
      // 10 : deux titres de départ (le doublon d'une même liste ne compte pas).
      'movie_10',
      'movie_11',
      'movie_12',
      // Même id TMDB mais type différent : un autre titre.
      'tv_10',
    ]);
    expect(ranked[0]?.hits).toBe(2);
  });

  it('listes absentes ou vides : aucun résultat', () => {
    expect(rankRecommendations([{ type: 'movie', id: 1 }], [], () => false)).toEqual([]);
  });
});

describe('dossiers racine', () => {
  it('libellé : dernier segment, barres finales et chemins Windows', () => {
    expect(folderLabel('/data/Films enfants/')).toBe('Films enfants');
    expect(folderLabel('D:\\Media\\Séries')).toBe('Séries');
    expect(folderLabel('/')).toBe('/');
  });

  it('regroupe par dossier (parent du titre à défaut), les derniers ajouts d’abord', () => {
    const groups = groupByRootFolder([
      { tmdbId: 1, rootFolderPath: '/movies/', path: '/movies/A', addedAt: '2024-01-01' },
      { tmdbId: 2, rootFolderPath: '/movies', path: '/movies/B', addedAt: '2025-01-01' },
      { tmdbId: 3, rootFolderPath: null, path: '/kids/C (2020)', addedAt: null },
      { tmdbId: 4, rootFolderPath: null, path: null, addedAt: null },
    ]);
    expect(groups.map((g) => [g.path, g.titles.map((t) => t.tmdbId)])).toEqual([
      ['/kids', [3]],
      ['/movies', [2, 1]],
    ]);
  });
});

describe('withLibrary', () => {
  it('réapplique l’état en bibliothèque de l’index courant', () => {
    const card = {
      id: 603,
      type: 'movie',
      inLibrary: false,
      libStatus: null,
      libId: null,
      libSlug: null,
    } as unknown as TmdbCard;
    const index: LibraryIndex = {
      movie: new Map([[603, { id: 7, status: 'downloaded', slug: 'films' }]]),
      tv: new Map(),
    };
    expect(withLibrary(card, index)).toMatchObject({
      inLibrary: true,
      libStatus: 'downloaded',
      libId: 7,
      libSlug: 'films',
    });
    expect(withLibrary(card, { movie: new Map(), tv: new Map() }).inLibrary).toBe(false);
  });
});
