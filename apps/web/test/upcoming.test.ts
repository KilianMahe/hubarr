// SPDX-License-Identifier: AGPL-3.0-or-later
// « Prochains épisodes » (P5c.6, V17) : épisodes de l'instance sur 14 jours,
// groupés par jour dans l'ordre des diffusions ; état d'un épisode.

import type { CalendarEvent } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { upcomingDays, upcomingStatus } from '../src/features/series/upcoming';

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    type: 'episode',
    releaseType: 'episode',
    date: '2026-11-22',
    airDateUtc: '2026-11-22T20:00:00Z',
    title: 'Épisode',
    seriesTitle: 'Dark',
    season: 1,
    episode: 1,
    year: null,
    poster: null,
    fanart: null,
    overview: null,
    status: null,
    hasFile: false,
    monitored: true,
    id: 1,
    runtime: null,
    studio: null,
    network: null,
    genres: [],
    certification: null,
    instanceSlug: 'sonarr',
    instanceName: 'Sonarr',
    ...overrides,
  };
}

describe('prochains épisodes', () => {
  it('instance et fenêtre de 14 jours ; jours et diffusions dans l’ordre', () => {
    const days = upcomingDays(
      [
        event({ date: '2026-11-23', airDateUtc: '2026-11-23T21:00:00Z', episode: 3 }),
        event({ date: '2026-11-23', airDateUtc: '2026-11-23T19:00:00Z', episode: 2 }),
        event({ date: '2026-11-22', episode: 1 }),
        event({ date: '2026-11-21', episode: 9 }),
        event({ date: '2026-12-06', episode: 10 }),
        event({ date: '2026-12-05', episode: 11 }),
        event({ date: '2026-11-24', instanceSlug: 'autre' }),
        event({ date: '2026-11-24', type: 'film' }),
      ],
      'sonarr',
      '2026-11-22',
    );
    expect(days.map((day) => [day.day, day.episodes.map((item) => item.episode)])).toEqual([
      ['2026-11-22', [1]],
      ['2026-11-23', [2, 3]],
      ['2026-12-05', [11]],
    ]);
  });

  it('état : disponible, manquant si déjà diffusé, sinon à venir', () => {
    const now = Date.parse('2026-11-22T21:00:00Z');
    expect(upcomingStatus(event({ hasFile: true }), now)).toBe('available');
    expect(upcomingStatus(event({}), now)).toBe('missing');
    expect(upcomingStatus(event({ airDateUtc: '2026-11-23T20:00:00Z' }), now)).toBe('upcoming');
  });
});
