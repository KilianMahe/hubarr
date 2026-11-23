// SPDX-License-Identifier: AGPL-3.0-or-later
// Paramètres de l'application (`AdminSettingsController`), réservés aux admins :
// - `GET /api/admin/settings` : état de la page (services, instances, menu, à propos) ;
// - `POST /api/admin/settings` : enregistrement partiel (services, menu) ;
// - `POST /api/admin/settings/test/:service` : diagnostic de connexion ;
// - `POST /api/admin/settings/health/invalidate/:service` : relance la détection
//   d'un service marqué injoignable (bouton « Réessayer » de la bannière) ;
// - `POST /api/admin/settings/dashboard-layout` : ordre et sections masquées du
//   tableau de bord (mode édition du dashboard) ;
// - `POST /api/admin/settings/reset-display` : préférences et mise en page par défaut ;
// - `GET` et `POST /api/admin/settings/languages(/save)` : langues de Hubarr et
//   des services ;
// - `GET /api/admin/settings/export` et `POST /api/admin/settings/import` :
//   sauvegarde de la configuration, sans secret (`backup.ts`).
//
// Différences avec l'original : un enregistrement ne porte que ce qui change
// (pas de formulaire unique où une case décochée vaut « masqué ») ; les secrets
// ne sont jamais renvoyés au navigateur.

import { statSync } from 'node:fs';
import { join } from 'node:path';
import {
  dashboardLayoutRequestSchema,
  languagesResponseSchema,
  languagesSaveRequestSchema,
  languagesSaveResponseSchema,
  IMPORT_MAX_BYTES,
  INSTANCE_TYPES,
  importResultSchema,
  INTERNAL_FEATURES,
  SERVICE_IDS,
  SERVICE_SETTINGS,
  isServiceId,
  okResponseSchema,
  serviceTestRequestSchema,
  serviceTestResponseSchema,
  settingsResponseSchema,
  settingsSaveRequestSchema,
  type FlatServiceId,
  type FlatServiceState,
  type InstanceType,
  type ServiceId,
  type SettingsResponse,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { DATABASE_FILE } from '../../db/migrate';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { requireRole } from '../../plugins/access';
import { listInstances, toPublicInstance } from '../instances/instances';
import {
  applyServicePatch,
  hasRequiredFields,
  isSaved,
  readAllServiceConfigs,
} from '../services/config';
import { diagnose } from '../services/diagnose';
import { readTheme } from '../theme/theme';
import { countUsers } from '../users/users';
import { applyImport, buildExport, exportCounts, parseImport } from './backup';
import { loadLanguages, saveLanguages } from './languages';
import {
  applyDisplayPatch,
  listTimezones,
  readDashboardLayout,
  readDisplayValues,
  resetDisplay,
  saveDashboardLayout,
  systemTimezone,
} from './preferences';
import { getSetting, setSetting, deleteSetting, sidebarHideKey } from './settings';

export interface SettingsRoutesOptions {
  version: string;
  dataDir: string;
}

/** Services et pages internes qu'on peut masquer du menu latéral. */
export const SIDEBAR_IDS: readonly string[] = [...SERVICE_IDS, ...INTERNAL_FEATURES];

/** Visibilité dans le menu : seul `sidebar_hide_<id>` à vrai masque. */
export function readSidebarVisibility(db: Db): Record<string, boolean> {
  return Object.fromEntries(
    SIDEBAR_IDS.map((id) => [id, getSetting(db, sidebarHideKey(id)) !== true]),
  );
}

function flatServiceStates(db: Db): Record<FlatServiceId, FlatServiceState> {
  const configs = readAllServiceConfigs(db);
  const out = {} as Record<FlatServiceId, FlatServiceState>;
  for (const [id, config] of Object.entries(configs) as [
    FlatServiceId,
    (typeof configs)[FlatServiceId],
  ][]) {
    const spec = SERVICE_SETTINGS[id];
    out[id] = {
      saved: isSaved(config),
      configured: (!spec.toggleable || config.enabled) && hasRequiredFields(id, config),
      enabled: config.enabled,
      url: config.url,
      user: config.user,
      hasApiKey: config.apiKey !== '',
      hasPassword: config.password !== '',
    };
  }
  return out;
}

export function instancesByType(db: Db): SettingsResponse['instances'] {
  return Object.fromEntries(
    INSTANCE_TYPES.map((type: InstanceType) => [
      type,
      listInstances(db, type).map(toPublicInstance),
    ]),
  ) as SettingsResponse['instances'];
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Services dont la bannière « injoignable » peut relancer la détection. */
const INVALIDATABLE: readonly ServiceId[] = SERVICE_IDS.filter(
  (id) => id === 'radarr' || id === 'sonarr' || SERVICE_SETTINGS[id].toggleable,
);

const serviceParams = z.object({ service: z.string() });

export const settingsRoutes: FastifyPluginAsync<SettingsRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const databasePath = join(options.dataDir, DATABASE_FILE);
  const snapshot = (): SettingsResponse => ({
    services: flatServiceStates(app.db),
    instances: instancesByType(app.db),
    sidebar: readSidebarVisibility(app.db),
    display: readDisplayValues(app.db),
    systemTimezone: systemTimezone(),
    timezones: listTimezones(),
    dashboard: readDashboardLayout(app.db),
    theme: readTheme(app.db),
    backup: exportCounts(app.db),
    about: {
      version: options.version,
      nodeVersion: process.version,
      databasePath,
      databaseSize: fileSize(databasePath),
      avatarsDir: join(options.dataDir, 'avatars'),
      userCount: countUsers(app.db),
      serverTime: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  app.get(
    '/api/admin/settings',
    { schema: { response: { 200: settingsResponseSchema } } },
    async (_request, reply) => {
      void reply.header('cache-control', 'no-store');
      return snapshot();
    },
  );

  app.post(
    '/api/admin/settings',
    { schema: { body: settingsSaveRequestSchema, response: { 200: settingsResponseSchema } } },
    async (request) => {
      const { services = {}, sidebar = {}, display, dashboard } = request.body;
      app.db.transaction((tx) => {
        for (const [id, patch] of Object.entries(services) as [
          FlatServiceId,
          (typeof services)[FlatServiceId],
        ][]) {
          if (patch !== undefined) applyServicePatch(tx, id, patch);
        }
        for (const [id, visible] of Object.entries(sidebar)) {
          if (visible === undefined) continue;
          if (visible) deleteSetting(tx, sidebarHideKey(id));
          else setSetting(tx, sidebarHideKey(id), true);
        }
        if (display !== undefined) applyDisplayPatch(tx, display);
        if (dashboard !== undefined) saveDashboardLayout(tx, dashboard);
      });
      // Nouvelle configuration : états de santé et disjoncteurs à refaire.
      app.serviceHealth.invalidate();
      return snapshot();
    },
  );

  app.post(
    '/api/admin/settings/test/:service',
    {
      schema: {
        params: serviceParams,
        body: serviceTestRequestSchema.optional(),
        response: { 200: serviceTestResponseSchema },
      },
    },
    async (request, reply) => {
      const { service } = request.params;
      if (!isServiceId(service)) {
        throw new ApiError(400, 'VALIDATION', { message: 'admin.test.unknown_service' });
      }
      // « Tester » sonde toujours (jamais le court-circuit du diagnostic passif).
      const overrides = request.body ?? {};
      let diagnosis;
      try {
        app.serviceHealth.invalidate(service);
        diagnosis = await diagnose(app.db, service, overrides, app.upstream);
      } catch (error) {
        // Jamais le message d'erreur dans la réponse (chemins, clé utilisée…).
        request.log.warn({ service, err: error }, 'test de connexion en échec');
        diagnosis = { ok: false, category: 'unknown' as const, http: null };
      }
      void reply.header('cache-control', 'no-store');
      return { ...diagnosis, service: SERVICE_SETTINGS[service].label };
    },
  );

  app.post(
    '/api/admin/settings/health/invalidate/:service',
    { schema: { params: serviceParams, response: { 200: okResponseSchema } } },
    async (request) => {
      const service = request.params.service.toLowerCase();
      if (!isServiceId(service) || !INVALIDATABLE.includes(service)) {
        throw new ApiError(400, 'VALIDATION');
      }
      app.serviceHealth.invalidate(service);
      return { ok: true as const };
    },
  );

  app.post(
    '/api/admin/settings/dashboard-layout',
    { schema: { body: dashboardLayoutRequestSchema, response: { 200: okResponseSchema } } },
    async (request) => {
      saveDashboardLayout(app.db, request.body);
      return { ok: true as const };
    },
  );

  app.post(
    '/api/admin/settings/reset-display',
    { schema: { response: { 200: settingsResponseSchema } } },
    async () => {
      app.db.transaction((tx) => {
        resetDisplay(tx);
      });
      return snapshot();
    },
  );

  app.get(
    '/api/admin/settings/languages',
    { schema: { response: { 200: languagesResponseSchema } } },
    async (_request, reply) => {
      void reply.header('cache-control', 'no-store');
      return loadLanguages(app);
    },
  );

  app.post(
    '/api/admin/settings/languages/save',
    {
      schema: { body: languagesSaveRequestSchema, response: { 200: languagesSaveResponseSchema } },
    },
    async (request) => saveLanguages(app, request.body),
  );

  app.get('/api/admin/settings/export', async (_request, reply) => {
    const now = new Date();
    const body = `${JSON.stringify(buildExport(app.db, now), null, 2)}\n`;
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="hubarr-config-${now.toISOString().slice(0, 10)}.json"`,
      )
      .header('cache-control', 'no-store')
      .send(body);
  });

  // Fichier envoyé brut (corps de la requête) et lu ici : un JSON invalide reçoit
  // son propre message (`admin.import.invalid_json`), 64 Ko au plus.
  void app.register(async (scope) => {
    // L'analyseur JSON intégré passerait avant `*` : la portée lit tout en texte.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: IMPORT_MAX_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );
    scope
      .withTypeProvider<ZodTypeProvider>()
      .post(
        '/api/admin/settings/import',
        { bodyLimit: IMPORT_MAX_BYTES, schema: { response: { 200: importResultSchema } } },
        async (request) => {
          const raw = typeof request.body === 'string' ? request.body : '';
          if (raw.trim() === '')
            throw new ApiError(400, 'VALIDATION', {
              details: [{ message: 'admin.import.no_file' }],
            });
          const parsed = parseImport(raw);
          if (!parsed.ok) {
            throw new ApiError(400, 'VALIDATION', {
              details: [{ message: `admin.import.${parsed.reason}` }],
            });
          }
          const result = await applyImport(app.db, parsed.payload, {
            resolve: app.upstream.resolve,
          });
          app.serviceHealth.invalidate();
          return result;
        },
      );
  });
};
