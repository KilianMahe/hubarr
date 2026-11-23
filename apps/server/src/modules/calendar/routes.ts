// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Calendrier (P4.2, P4.3) : `CalendrierController`, ouvert à tout
// utilisateur connecté (`ROLE_USER`).
//
//   GET /api/calendrier        données de la page `/calendrier` (n° 29) :
//                              ±90 jours, toutes instances, dédoublonnés
//   GET /api/calendrier.ics    flux iCal (n° 30), −30 / +180 jours
//   GET /calendrier.ics        même flux au chemin d'origine, conservé pour
//                              les abonnements existants
//
// Une instance en panne lève le drapeau « injoignable » de son type sans
// masquer les autres ; un type sans instance active n'affiche jamais de
// bannière (l'utilisateur ne s'en sert pas). Le flux exige la session, comme
// l'original.

import { calendarResponseSchema, type CalendarEpisode, type Movie } from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { translator } from '../../i18n/translator';
import type { ZodTypeProvider } from '../../http/zod';
import { listEnabledInstances, type InstanceRow } from '../instances/instances';
import { radarrClient, sonarrClient } from '../services/clients';
import { readResolvedPreferences } from '../settings/preferences';
import { episodeEvents, movieEvents, sortEvents, type FromInstance } from './events';
import { ICAL_DAYS_AHEAD, ICAL_DAYS_BEFORE, buildIcal } from './ical';

export interface CalendarRoutesOptions {
  now?: () => number;
}

interface Fetched<T> {
  sources: FromInstance<T>[];
  failed: boolean;
}

async function fanOut<T>(
  app: FastifyInstance,
  type: 'radarr' | 'sonarr',
  load: (row: InstanceRow) => Promise<T[]>,
): Promise<Fetched<T>> {
  let failed = false;
  const rows = listEnabledInstances(app.db, type);
  const lists = await Promise.all(
    rows.map(async (row) => {
      try {
        return { items: await load(row), slug: row.slug, name: row.name };
      } catch (error) {
        failed = true;
        app.log.warn({ err: error, instance: row.slug }, `calendrier ${type} en échec`);
        return null;
      }
    }),
  );
  return { sources: lists.filter((l): l is FromInstance<T> => l !== null), failed };
}

export const calendarRoutes: FastifyPluginAsync<CalendarRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const now = () => new Date((options.now ?? Date.now)());

  const fetchAll = (ahead: number, before: number) => {
    const at = now();
    return Promise.all([
      fanOut<Movie>(instance, 'radarr', (row) =>
        radarrClient(instance, row).calendar(ahead, before, at),
      ),
      fanOut<CalendarEpisode>(instance, 'sonarr', (row) =>
        sonarrClient(instance, row).calendar(ahead, before, at),
      ),
    ]);
  };

  app.get(
    '/api/calendrier',
    { schema: { response: { 200: calendarResponseSchema } } },
    async () => {
      const [radarr, sonarr] = await fetchAll(90, 90);
      const films = movieEvents(radarr.sources);
      const episodes = episodeEvents(sonarr.sources);
      const radarrConfigured = listEnabledInstances(instance.db, 'radarr').length > 0;
      const sonarrConfigured = listEnabledInstances(instance.db, 'sonarr').length > 0;
      return {
        events: sortEvents([...films, ...episodes]),
        totalFilms: films.length,
        totalEpisodes: episodes.length,
        radarrFailed: radarrConfigured && radarr.failed,
        sonarrFailed: sonarrConfigured && sonarr.failed,
        radarrConfigured,
        sonarrConfigured,
      };
    },
  );

  const ical = async (_request: unknown, reply: FastifyReply) => {
    const [radarr, sonarr] = await fetchAll(ICAL_DAYS_AHEAD, ICAL_DAYS_BEFORE);
    const prefs = readResolvedPreferences(instance.db);
    const body = buildIcal(radarr.sources, sonarr.sources, {
      now: now(),
      timezone: prefs.display_timezone,
      t: await translator(prefs.display_language),
    });
    return reply
      .type('text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="hubarr.ics"')
      .header('cache-control', 'private, no-cache')
      .send(body);
  };
  app.get('/api/calendrier.ics', ical);
  app.get('/calendrier.ics', ical);
};
