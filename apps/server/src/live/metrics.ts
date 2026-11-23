// SPDX-License-Identifier: AGPL-3.0-or-later
// Métriques du cache et du temps réel (P5.3), journalisées en mode debug
// (`HUBARR_LOG_LEVEL=debug`) toutes les minutes, seulement si elles ont bougé :
// lectures fraîches, périmées et absentes du cache SWR, fetchs, demandes de
// rafraîchissement, lectures partagées servies du cache ou relues, pollers
// actifs et leurs abonnés.

import type { FastifyInstance } from 'fastify';

export const METRICS_INTERVAL_MS = 60_000;

export function metricsSnapshot(app: FastifyInstance) {
  const live = app.live.stats();
  return {
    swr: app.cache.swr.metrics(),
    shared: { hits: live.sharedHits, loads: live.sharedLoads },
    topics: live.topics.filter((topic) => topic.subscribers > 0),
  };
}

/** Démarre la journalisation périodique ; renvoie la fonction d'arrêt. */
export function startMetricsLog(
  app: FastifyInstance,
  intervalMs = METRICS_INTERVAL_MS,
): () => void {
  let last = '';
  const timer = setInterval(() => {
    if (app.log.level !== 'debug' && app.log.level !== 'trace') return;
    const snapshot = metricsSnapshot(app);
    const serialized = JSON.stringify(snapshot);
    if (serialized === last) return;
    last = serialized;
    app.log.debug(snapshot, 'métriques du cache');
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
