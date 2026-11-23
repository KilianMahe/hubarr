// SPDX-License-Identifier: AGPL-3.0-or-later
// Résolution torrent → film/série (P3d.4) : `TorrentResolverServiceTest` porté.

import { describe, expect, it } from 'vitest';
import {
  normalizeTitle,
  parseReleaseName,
  resolveIn,
  type Library,
  type ResolveCandidate,
} from '../../../src/modules/torrents/resolver';

const item = (
  id: number,
  title: string,
  year: number | null,
  more: string[] = [],
): ResolveCandidate => ({ id, title, year, titles: [title, ...more] });

const lib = (slug: string, items: ResolveCandidate[] | null): Library => ({ slug, items });

describe('parseReleaseName', () => {
  it.each([
    ['Dune.Part.Two.2024.1080p.BluRay.x264', 'Dune Part Two', 2024],
    ['Dune_Part_Two.2024.2160p', 'Dune Part Two', 2024],
    ['1917.2019.1080p.BluRay', '1917', 2019],
    ['The.Matrix.BluRay.x264', 'The Matrix', null],
    ['Breaking.Bad.S01E01.720p.HDTV', 'Breaking Bad', null],
    ['random.garbage.no.markers', 'random garbage no markers', null],
  ])('%s', (raw, title, year) => {
    expect(parseReleaseName(raw)).toEqual({ title, year });
  });
});

describe('normalizeTitle', () => {
  it('accents, ponctuation, casse', () => {
    expect(normalizeTitle('Pokémon')).toBe('pokemon');
    expect(normalizeTitle("L'Échappée")).toBe('l echappee');
    expect(normalizeTitle('La traversée')).toBe('la traversee');
    expect(normalizeTitle('La.Traversee')).toBe('la traversee');
    expect(normalizeTitle('THE MATRIX')).toBe('the matrix');
  });
});

describe('resolveIn', () => {
  it('meilleure correspondance par année', () => {
    const r = resolveIn('radarr', 'Dune.2021.1080p.BluRay', [
      lib('radarr-1', [
        item(1, 'Dune', 1984),
        item(2, 'Dune', 2021),
        item(3, 'Dune Part Two', 2024),
      ]),
    ]);
    expect(r).toMatchObject({ found: true, id: 2, url: '/medias/radarr-1/films/2' });
  });

  it('inclusion ignorée pour un titre court (« It » dans « Split »)', () => {
    expect(
      resolveIn('radarr', 'It.2017.1080p.BluRay', [lib('r', [item(42, 'Split', 2016)])]).found,
    ).toBe(false);
  });

  it('sous le seuil → aucune correspondance', () => {
    expect(
      resolveIn('radarr', 'Dune.2021.1080p', [
        lib('r', [item(1, 'Completely Different Title', 2020)]),
      ]),
    ).toMatchObject({ found: false, reason: 'no_match' });
  });

  it('Sonarr : lien vers la bibliothèque de séries', () => {
    expect(
      resolveIn('sonarr', 'Breaking.Bad.S01E01.720p', [
        lib('sonarr-1', [item(99, 'Breaking Bad', 2008)]),
      ]),
    ).toMatchObject({ found: true, id: 99, url: '/medias/sonarr-1/series/99' });
  });

  it('titre original et titres alternatifs', () => {
    expect(
      resolveIn('radarr', 'Swapped.2026.MULTi.1080p.WEB.x264-FW', [
        lib('r', [item(42, 'Aventures croisées', 2026, ['Swapped'])]),
      ]),
    ).toMatchObject({ found: true, id: 42 });
    expect(
      resolveIn('radarr', 'One.Life.2023.1080p', [
        lib('r', [item(99, 'Une vie', 2023, ['One Life'])]),
      ]),
    ).toMatchObject({ found: true, id: 99 });
  });

  it('titre accentué contre une release ASCII', () => {
    expect(
      resolveIn('radarr', 'La.Traversee.2022.1080p', [lib('r', [item(17, 'La traversée', 2022)])]),
    ).toMatchObject({ found: true, id: 17 });
  });

  it('instance injoignable, aucune instance, nom illisible', () => {
    expect(resolveIn('radarr', 'Dune.2021.1080p', [lib('r', null)])).toMatchObject({
      found: false,
      reason: 'unavailable',
    });
    expect(resolveIn('radarr', 'Dune.2021.1080p', [])).toMatchObject({
      found: false,
      reason: 'no_instance',
    });
    expect(resolveIn('radarr', '...', [lib('r', [])])).toMatchObject({
      found: false,
      reason: 'unparsable',
    });
  });

  it('plusieurs instances : slug de l’instance qui a le film, une injoignable tolérée', () => {
    const r = resolveIn('radarr', 'Dune.2021.1080p', [
      lib('radarr-1080', [item(1, 'Other', 2020)]),
      lib('radarr-down', null),
      lib('radarr-4k', [item(99, 'Dune', 2021)]),
    ]);
    expect(r).toMatchObject({ found: true, id: 99, url: '/medias/radarr-4k/films/99' });
  });
});
