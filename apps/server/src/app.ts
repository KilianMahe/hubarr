// SPDX-License-Identifier: AGPL-3.0-or-later
// Construction de l'instance Fastify, séparée du démarrage pour être testable
// avec `app.inject()`. La base est ouverte et migrée par l'appelant
// (`main.ts` ou les tests) ; l'application la ferme à l'arrêt.
//
// Ordre des hooks `onRequest` : session (cookie → session et utilisateur), CSRF
// des mutations, garde « installation requise », puis contrôle d'accès. Les
// routes viennent après.

import { join } from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyServerOptions,
} from 'fastify';
import type { Dispatcher } from 'undici';
import { createAppCache, type AppCache } from './cache';
import type { AppDatabase, Db } from './db/client';
import { ServiceHealthCache, type HostResolver } from './integrations/http';
import { LiveHub } from './live/hub';
import { startMetricsLog } from './live/metrics';
import { registerErrorHandling } from './http/errors';
import { createPrefixResolver, stripBasePath } from './http/base-path';
import { registerZod } from './http/zod';
import { activityRoutes } from './modules/activity/routes';
import { arrAdminRoutes } from './modules/arr-admin/routes';
import { authRoutes } from './modules/auth/routes';
import { bazarrRoutes } from './modules/bazarr/routes';
import { bootstrapRoutes } from './modules/bootstrap/routes';
import { calendarRoutes } from './modules/calendar/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { discoverRoutes } from './modules/discover/routes';
import { eventsRoutes, registerSharedInvalidation } from './modules/events/routes';
import { healthRoutes } from './modules/health/routes';
import { ServiceHealthMonitor } from './modules/health/service-health';
import { instanceRoutes } from './modules/instances/routes';
import { movieAddRoutes } from './modules/movies/add-routes';
import { movieDetailRoutes } from './modules/movies/detail-routes';
import { moviePagesRoutes } from './modules/movies/pages-routes';
import { movieReleaseRoutes } from './modules/movies/release-routes';
import { movieRoutes } from './modules/movies/routes';
import { seriesDetailRoutes } from './modules/series/detail-routes';
import { seriesEpisodeRoutes } from './modules/series/episode-routes';
import { seriesPagesRoutes } from './modules/series/pages-routes';
import { seriesRoutes } from './modules/series/routes';
import { settingsRoutes } from './modules/settings/routes';
import type { DiagnoseDeps } from './modules/services/diagnose';
import { profileRoutes } from './modules/profile/routes';
import { prowlarrRoutes } from './modules/prowlarr/routes';
import { searchRoutes } from './modules/search/routes';
import { seerrRoutes } from './modules/seerr/routes';
import { setupRoutes } from './modules/setup/routes';
import { themeRoutes } from './modules/theme/routes';
import { torrentRoutes } from './modules/torrents/routes';
import { usenetRoutes } from './modules/usenet/routes';
import { webRoutes } from './modules/web/routes';
import access from './plugins/access';
import csrf from './plugins/csrf';
import securityHeaders from './plugins/security-headers';
import serviceGuard from './plugins/service-guard';
import sessions from './plugins/sessions';
import setupGuard from './plugins/setup-guard';

declare module 'fastify' {
  interface FastifyInstance {
    /** Client Drizzle de la base de l'application. */
    db: Db;
    /** Dépendances des appels aux services (disjoncteur, agent HTTP, DNS). */
    upstream: DiagnoseDeps & { health: ServiceHealthCache };
    /** État de santé des services, en cache 10 s. */
    serviceHealth: ServiceHealthMonitor;
    /** Cache SWR, file de rafraîchissement et cache des bibliothèques. */
    cache: AppCache;
    /** Lectures partagées et pollers du flux temps réel (P5.1). */
    live: LiveHub;
  }
}

/** Corps de requête maximal (`request_body max_size` du Caddyfile d'origine). */
export const BODY_LIMIT = 20 * 1024 * 1024;

export type BuildAppOptions = Pick<FastifyServerOptions, 'logger' | 'trustProxy'> & {
  database: AppDatabase;
  /** Dossier des données persistantes (`HUBARR_DATA_DIR`) : avatars. */
  dataDir: string;
  frameAncestors?: string;
  /** Front buildé à servir (absent en développement : Vite le sert). */
  webRoot?: string;
  /** Documentation buildée, servie sur `/docs` (absente en développement). */
  docsRoot?: string;
  /** Préfixe de chemin configuré (`HUBARR_BASE_PATH`, normalisé), `''` à la racine. */
  basePath?: string;
  /** Version affichée (`HUBARR_VERSION`). */
  version?: string;
  /** Horloge injectable (sessions, limitation des connexions) pour les tests. */
  now?: () => number;
  /** Agent HTTP des services (`MockAgent` dans les tests). */
  dispatcher?: Dispatcher;
  /** Résolution DNS de la garde SSRF (tests). */
  resolve?: HostResolver;
  /** Routes supplémentaires, enregistrées après les plugins (tests). */
  routes?: FastifyPluginAsync[];
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const basePath = options.basePath ?? '';
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: BODY_LIMIT,
    // Le proxy transmet `/hubarr/…` : les routes ne voient que `/…` (sans
    // préfixe configuré, l'URL est rendue telle quelle).
    rewriteUrl: (request) => stripBasePath(request.url ?? '/', basePath),
  });
  app.decorate('db', options.database.db);
  const upstream = {
    health: new ServiceHealthCache(options.now ? { now: options.now } : {}),
    ...(options.dispatcher ? { dispatcher: options.dispatcher } : {}),
    ...(options.resolve ? { resolve: options.resolve } : {}),
  };
  app.decorate('upstream', upstream);
  app.decorate(
    'serviceHealth',
    new ServiceHealthMonitor({
      db: options.database.db,
      deps: upstream,
      ...(options.now ? { now: options.now } : {}),
    }),
  );
  app.decorate('cache', createAppCache(app, options.now ? { now: options.now } : {}));
  app.decorate(
    'live',
    new LiveHub({ ...(options.now ? { now: options.now } : {}), logger: app.log }),
  );
  const stopMetrics = startMetricsLog(app);
  app.addHook('onClose', async () => {
    stopMetrics();
    // Les rafraîchissements en cours se terminent avant la fermeture de la base.
    await app.cache.queue.close();
    options.database.close();
  });

  const now = options.now ? { now: options.now } : {};
  registerZod(app);
  registerErrorHandling(app);
  registerSharedInvalidation(app);
  void app.register(
    securityHeaders,
    options.frameAncestors === undefined ? {} : { frameAncestors: options.frameAncestors },
  );
  void app.register(sessions, now);
  void app.register(csrf);
  void app.register(setupGuard);
  void app.register(access);
  void app.register(serviceGuard);

  void app.register(healthRoutes, now);
  void app.register(bootstrapRoutes, { version: options.version ?? '0.0.0-dev' });
  void app.register(themeRoutes);
  void app.register(setupRoutes, now);
  void app.register(authRoutes, now);
  void app.register(profileRoutes, { avatarsDir: join(options.dataDir, 'avatars') });
  void app.register(settingsRoutes, {
    version: options.version ?? '0.0.0-dev',
    dataDir: options.dataDir,
  });
  void app.register(instanceRoutes);
  void app.register(movieRoutes);
  void app.register(movieDetailRoutes);
  void app.register(movieReleaseRoutes);
  void app.register(movieAddRoutes);
  void app.register(moviePagesRoutes);
  void app.register(seriesRoutes);
  void app.register(seriesDetailRoutes, now);
  void app.register(seriesEpisodeRoutes);
  void app.register(seriesPagesRoutes);
  void app.register(arrAdminRoutes);
  void app.register(prowlarrRoutes);
  void app.register(bazarrRoutes);
  void app.register(torrentRoutes);
  void app.register(usenetRoutes);
  void app.register(activityRoutes);
  void app.register(seerrRoutes);
  void app.register(discoverRoutes);
  void app.register(calendarRoutes, now);
  void app.register(searchRoutes);
  void app.register(dashboardRoutes, now);
  void app.register(eventsRoutes);
  for (const routes of options.routes ?? []) void app.register(routes);
  // En dernier : `GET /*` ne prend que ce qu'aucune autre route ne sert.
  void app.register(webRoutes, {
    webRoot: options.webRoot,
    docsRoot: options.docsRoot,
    frameAncestors: options.frameAncestors,
    prefixOf: createPrefixResolver(basePath, options.trustProxy ?? false),
  });
  return app;
}
