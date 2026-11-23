// SPDX-License-Identifier: AGPL-3.0-or-later
// File d'attente d'une instance Radarr/Sonarr partagée entre la page, le
// tableau de bord et le flux temps réel (P5.1) : un appel par fenêtre de 3 s.

import type { MovieQueueItem, SeriesQueueItem } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import type { InstanceRow } from '../instances/instances';
import { radarrClient, sonarrClient } from '../services/clients';

export const QUEUE_SHARED_TTL_MS = 3_000;

export function sharedMovieQueue(
  app: FastifyInstance,
  row: InstanceRow,
): Promise<MovieQueueItem[]> {
  return app.live.shared(`queue.radarr.${row.slug}`, QUEUE_SHARED_TTL_MS, () =>
    radarrClient(app, row).queue(),
  );
}

export function sharedSeriesQueue(
  app: FastifyInstance,
  row: InstanceRow,
): Promise<SeriesQueueItem[]> {
  return app.live.shared(`queue.sonarr.${row.slug}`, QUEUE_SHARED_TTL_MS, () =>
    sonarrClient(app, row).queue(),
  );
}
