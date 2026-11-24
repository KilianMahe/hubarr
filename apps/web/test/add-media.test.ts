// SPDX-License-Identifier: AGPL-3.0-or-later
// Partie pure du dialogue d'ajout commun (film ou série).

import type { Movie, Series } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import {
  ADD_TEXT,
  detailTarget,
  findAddable,
  itemLabel,
  libraryLocation,
  markAdded,
  movieItem,
  seriesItem,
} from '../src/features/add-media/add-media';

const movie = (over: Partial<Movie>) =>
  ({ id: null, tmdbId: 603, title: 'Matrix', year: 1999, ...over }) as Movie;
const series = (over: Partial<Series>) =>
  ({ id: null, tvdbId: 81189, tmdbId: 1396, title: 'Breaking Bad', year: 2008, ...over }) as Series;

describe('ajout film/série : résultats', () => {
  it('clé, libellé et fiche TMDB selon le type', () => {
    const film = movieItem(movie({}));
    const show = seriesItem(series({}));
    expect(film.key).toBe('tmdb-603');
    expect(show.key).toBe('tvdb-81189');
    expect(itemLabel(film)).toBe('Matrix (1999)');
    expect(itemLabel(movieItem(movie({ year: null })))).toBe('Matrix');
    expect(detailTarget(film)).toEqual({ type: 'movie', id: 603 });
    expect(detailTarget(show)).toEqual({ type: 'tv', id: 1396 });
    expect(detailTarget(seriesItem(series({ tmdbId: null })))).toBeNull();
  });

  it('fiche Hubarr seulement pour un titre déjà dans l’instance', () => {
    expect(libraryLocation(movieItem(movie({})), 'radarr')).toBeNull();
    expect(libraryLocation(movieItem(movie({ id: 7 })), 'radarr')).toEqual({
      name: 'radarr-movie',
      params: { slug: 'radarr', id: '7' },
    });
    expect(libraryLocation(seriesItem(series({ id: 3 })), 'sonarr')).toEqual({
      name: 'sonarr-series',
      params: { slug: 'sonarr', id: '3' },
    });
  });

  it('titre ajoutable par identifiant TMDB, puis marqué « ajouté »', () => {
    const items = [movieItem(movie({})), movieItem(movie({ tmdbId: 604, id: 2 }))];
    expect(findAddable(items, 603)?.key).toBe('tmdb-603');
    expect(findAddable(items, 604)).toBeNull();
    const after = markAdded(items, 'tmdb-603', 42);
    expect(after[0]?.libraryId).toBe(42);
    expect(findAddable(after, 603)).toBeNull();
    // Identifiant inconnu après l'ajout : le titre reste marqué.
    expect(markAdded(items, 'tmdb-603', null)[0]?.libraryId).toBe(0);
  });

  it('mêmes textes pour les deux services', () => {
    expect(Object.keys(ADD_TEXT.movie).sort()).toEqual(Object.keys(ADD_TEXT.series).sort());
  });
});
