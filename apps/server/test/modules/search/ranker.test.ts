// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `SearchRankerTest` (classement, filtres, « vouliez-vous dire »).

import { describe, expect, it } from 'vitest';
import {
  animeDiscoverParams,
  isAnime,
  matches,
  normalize,
  sortItems,
  splitYear,
  stripAccents,
  suggest,
} from '../../../src/modules/search/ranker';

const titleOf = (item: Record<string, unknown>) => item.title ?? item.name;

describe('SearchRanker', () => {
  it('normalise : accents, casse et ponctuation retirés', () => {
    expect(normalize('  Amélie   Poulain! ')).toBe('amelie poulain');
    expect(normalize('Mad Max: Fury Road')).toBe('mad max fury road');
    expect(stripAccents('Pokémo')).toBe('Pokemo');
  });

  it('garde entiers les mots à apostrophe', () => {
    expect(normalize("JoJo's Bizarre Adventure")).toBe('jojos bizarre adventure');
    expect(normalize('Lord of the Rings: The Return of the King')).toBe(
      'lord of the rings the return of the king',
    );
  });

  it("sépare l'année finale plausible", () => {
    const now = new Date('2026-11-22T12:00:00Z');
    expect(splitYear('dune 2021', now)).toEqual(['dune', 2021]);
    expect(splitYear('Dune (1984)', now)).toEqual(['Dune', 1984]);
    expect(splitYear('blade runner 2049', now)).toEqual(['blade runner 2049', null]);
    expect(splitYear('1917', now)).toEqual(['1917', null]);
  });

  it('un titre identique passe devant un titre partiel plus populaire', () => {
    const items = [
      {
        media_type: 'movie',
        title: 'The Matrix Resurrections',
        popularity: 900,
        vote_count: 6000,
        release_date: '2021-12-16',
      },
      {
        media_type: 'movie',
        title: 'The Matrix',
        popularity: 80,
        vote_count: 25000,
        release_date: '1999-03-30',
      },
    ];
    expect(sortItems(items, 'relevance', normalize('the matrix'))[0]?.title).toBe('The Matrix');
  });

  it("l'année tapée choisit le bon remake", () => {
    const items = [
      {
        media_type: 'movie',
        title: 'Dune',
        popularity: 120,
        vote_count: 12000,
        release_date: '2021-09-15',
      },
      {
        media_type: 'movie',
        title: 'Dune',
        popularity: 30,
        vote_count: 2500,
        release_date: '1984-12-14',
      },
    ];
    expect(sortItems(items, 'relevance', 'dune', 1984)[0]?.release_date).toBe('1984-12-14');
  });

  it('correspondance sans accents sur le titre original', () => {
    const items = [
      { media_type: 'movie', title: 'Something Else', popularity: 500 },
      {
        media_type: 'movie',
        title: 'Amelie',
        original_title: "Le Fabuleux Destin d'Amélie Poulain",
        popularity: 40,
      },
    ];
    expect(sortItems(items, 'relevance', normalize('amélie'))[0]?.title).toBe('Amelie');
  });

  it('le tri par note ignore les petits nombres de votes', () => {
    const items = [
      { media_type: 'movie', title: 'Obscure', vote_average: 10, vote_count: 3 },
      { media_type: 'movie', title: 'Classic', vote_average: 8.6, vote_count: 20000 },
    ];
    expect(sortItems(items, 'vote')[0]?.title).toBe('Classic');
  });

  it('tri par nouveauté', () => {
    const items = [
      { media_type: 'tv', name: 'Old', first_air_date: '2008-01-20' },
      { media_type: 'movie', title: 'New', release_date: '2024-03-01' },
      { media_type: 'movie', title: 'Undated' },
    ];
    expect(sortItems(items, 'newest').map(titleOf)).toEqual(['New', 'Old', 'Undated']);
  });

  it('un titre célèbre qui commence pareil passe devant un titre obscur identique', () => {
    const items = [
      {
        media_type: 'movie',
        title: 'Poke',
        popularity: 2,
        vote_count: 2,
        release_date: '2020-01-01',
      },
      {
        media_type: 'tv',
        name: 'Pokémon',
        popularity: 152,
        vote_count: 2000,
        first_air_date: '1997-04-01',
      },
    ];
    expect(titleOf(sortItems(items, 'relevance', 'poke')[0] ?? {})).toBe('Pokémon');
  });

  it('corrige les fautes de frappe', () => {
    const candidates = ['Interstellar', 'Inception', 'Interview with the Vampire'];
    expect(suggest('interstelar', candidates)).toBe('Interstellar');
    expect(suggest('incepsion', candidates)).toBe('Inception');
    expect(suggest('cristopher nolan', ['Christopher Nolan', 'Chris Nolan Jr'])).toBe(
      'Christopher Nolan',
    );
  });

  it("compare aussi les premiers mots d'un titre plus long", () => {
    expect(suggest('the mtrix', ['The Matrix Reloaded', 'The Mask'])).toBe('The Matrix');
  });

  it('se tait si rien n’est proche ou si la requête est correcte', () => {
    expect(suggest('interstellar', ['Interstellar', 'Inception'])).toBeNull();
    expect(suggest('zzzzqqq', ['Interstellar'])).toBeNull();
    expect(suggest('dun', ['Dune'])).toBeNull();
    expect(suggest('alien', ['Aliens', 'Alien'])).toBeNull();
  });

  it('préfère un titre célèbre à un titre exact obscur', () => {
    const candidates = [
      { label: 'Interstelar', popularity: 0.4 },
      { label: 'Interstellar', popularity: 65 },
    ];
    expect(suggest('interstelar', candidates)).toBe('Interstellar');
    expect(
      suggest('interstelar', [
        { label: 'Interstelar', popularity: 30 },
        { label: 'Interstellar', popularity: 65 },
      ]),
    ).toBeNull();
  });

  it('complète un mot à moitié tapé quand c’est permis', () => {
    const candidates = [
      { label: 'Poke', popularity: 2 },
      { label: 'Pokémon', popularity: 152 },
    ];
    expect(suggest('pokémo', candidates, true)).toBe('Pokémon');
    const longer = [{ label: 'Pokémonia', popularity: 14 }];
    expect(suggest('pokémo', longer)).toBeNull();
    expect(suggest('pokémo', longer, true)).toBe('Pokémonia');
  });

  it('départage les distances égales par la popularité', () => {
    const candidates = [
      { label: 'Pokemen', popularity: 0.1 },
      { label: 'Pokémon', popularity: 152 },
    ];
    expect(suggest('pokumon', candidates)).toBe('Pokémon');
  });

  it('corrige mot à mot avec un dernier mot inachevé', () => {
    const candidates = [
      { label: "JoJo's Bizarre Adventure", popularity: 60 },
      { label: 'Bizarre Love Triangle', popularity: 2 },
    ];
    expect(suggest('jojo bizzare adven', candidates)).toBe("JoJo's Bizarre Adventure");
    expect(suggest('braking ba', [{ label: 'Breaking Bad', popularity: 300 }])).toBe(
      'Breaking Bad',
    );
  });

  it('reste strict sur les mots courts', () => {
    expect(suggest('red dawn', [{ label: 'Rex Dawson', popularity: 50 }])).toBeNull();
    expect(suggest('dog day', [{ label: 'Dig Dug', popularity: 50 }])).toBeNull();
  });

  it('filtres', () => {
    const movie = {
      media_type: 'movie',
      title: 'X',
      genre_ids: [28, 12],
      release_date: '2015-05-01',
      vote_average: 7.4,
    };
    const tv = {
      media_type: 'tv',
      name: 'Y',
      genre_ids: [18],
      first_air_date: '2019-01-01',
      vote_average: 8.9,
    };
    expect(matches(movie, {})).toBe(true);
    expect(matches(movie, { type: 'tv' })).toBe(false);
    expect(matches(tv, { type: 'tv', genre: 18 })).toBe(true);
    expect(matches(movie, { genre: 18 })).toBe(false);
    expect(matches(movie, { year_min: 2016 })).toBe(false);
    expect(matches(tv, { year_max: 2018 })).toBe(false);
    expect(matches(movie, { vote_min: 8 })).toBe(false);
    expect(matches({ media_type: 'person', name: 'Z' }, {})).toBe(false);
  });

  it('animés : genre Animation et langue originale japonaise', () => {
    const anime = { media_type: 'tv', name: 'A', genre_ids: [16, 10759], original_language: 'ja' };
    const cartoon = { media_type: 'movie', title: 'B', genre_ids: [16], original_language: 'en' };
    expect(isAnime(anime)).toBe(true);
    expect(isAnime(cartoon)).toBe(false);
    expect(matches(anime, { anime: true })).toBe(true);
    expect(matches(cartoon, { anime: true })).toBe(false);
    expect(matches(cartoon, { anime: false })).toBe(true);
    expect(animeDiscoverParams(null)).toEqual({ with_genres: '16', with_original_language: 'ja' });
    expect(animeDiscoverParams('35, 16,x')).toEqual({
      with_genres: '35,16',
      with_original_language: 'ja',
    });
    expect(animeDiscoverParams(10759).with_genres).toBe('10759,16');
  });
});
