// SPDX-License-Identifier: AGPL-3.0-or-later
// Critères des listes *arr (P5c.5, V5, V6) : lecture tolérante, URL sans les
// valeurs par défaut, recherche par titre insensible à la casse et aux accents.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARR_LIST_QUERY,
  arrListParams,
  arrListQueryFrom,
  cutoffFiltered,
  cutoffParams,
  cutoffQueryFrom,
  foldTitle,
  titleMatches,
} from '../src';

describe('critères des listes *arr', () => {
  it('défaut : date décroissante, page 1, sans recherche', () => {
    expect(arrListQueryFrom('history', {})).toEqual(DEFAULT_ARR_LIST_QUERY);
    expect(arrListParams(DEFAULT_ARR_LIST_QUERY)).toEqual({});
  });

  it('colonnes propres à chaque liste ; sens par défaut selon la colonne', () => {
    expect(arrListQueryFrom('history', { sort: 'source' }).sort).toBe('date');
    expect(arrListQueryFrom('blocklist', { sort: 'source' })).toMatchObject({
      sort: 'source',
      dir: 'asc',
    });
    expect(arrListQueryFrom('blocklist', { sort: 'date', dir: 'asc' }).dir).toBe('asc');
    expect(arrListQueryFrom('history', { sort: ['title', 'date'], dir: 'up' }).dir).toBe('asc');
  });

  it('URL : seules les valeurs différentes du défaut', () => {
    const query = arrListQueryFrom('history', {
      sort: 'title',
      dir: 'asc',
      q: '  dune ',
      page: '3',
    });
    expect(arrListParams(query)).toEqual({ sort: 'title', page: '3', q: 'dune' });
    expect(arrListParams({ ...query, dir: 'desc' })).toMatchObject({ dir: 'desc' });
    expect(arrListQueryFrom('history', { q: 'x'.repeat(300) }).q).toHaveLength(100);
  });

  it('cutoff : recherche et profil ; filtré seulement si l’un est posé', () => {
    const query = cutoffQueryFrom({ q: 'star', profile: '4', page: '-2' });
    expect(query).toEqual({ page: 1, q: 'star', profile: 4 });
    expect(cutoffParams(query)).toEqual({ q: 'star', profile: '4' });
    expect(cutoffFiltered(query)).toBe(true);
    expect(cutoffFiltered(cutoffQueryFrom({ profile: 'abc' }))).toBe(false);
  });

  it('titres comparés sans casse ni accents', () => {
    expect(foldTitle('  Amélie   Poulain ')).toBe('amelie poulain');
    expect(titleMatches('Le Fabuleux Destin d’Amélie', 'AMELIE')).toBe(true);
    expect(titleMatches('Dune', 'dunes')).toBe(false);
    expect(titleMatches('Dune', '')).toBe(true);
  });
});
