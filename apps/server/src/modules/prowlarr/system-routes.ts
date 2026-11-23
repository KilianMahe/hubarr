// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, réglages et système (P3c.3) : général, interface et réglages des
// clients ; historique (paginé et « depuis »), étiquettes (usage, suppression),
// santé, statut, journaux, tâches, sauvegardes, mises à jour. Port de
// `ProwlarrController::general*`, `ui*`, `downloadClientConfig*`, `history`,
// `historySince`, `tagsDetail`, `tagDelete`, `health`, `status`, `logs`,
// `tasksPage`, `taskRun`, `backupsPage`, `backupCreate`, `backupDelete`,
// `updatesPage`.
//
// Écarts : configurations fusionnées avec la section actuelle
// (l'original renvoyait la page entière, clé d'API comprise) ; mots de passe
// et clé d'API jamais renvoyés ni modifiés depuis Hubarr ; formes réduites
// des sauvegardes, tâches, journaux et mises à jour (communes avec
// Radarr/Sonarr, D103) ; niveau des journaux passé à Prowlarr ; statut sans
// chemin de démarrage ni base d'URL.

import {
  PROWLARR_HISTORY_PAGE_SIZE,
  PROWLARR_LOGS_PAGE_SIZE,
  arrCommandStartedSchema,
  arrConfigPatchSchema,
  arrConfigSchema,
  arrOkSchema,
  arrPaged,
  backupSchema,
  logRecordSchema,
  prowlarrCommandRequestSchema,
  prowlarrHealthSchema,
  prowlarrHistoryPageSchema,
  prowlarrHistoryRecordSchema,
  prowlarrStatusSchema,
  prowlarrTagDetailSchema,
  systemTaskSchema,
  updatesPageSchema,
  type ProwlarrHistoryRecord,
  type ProwlarrStatus,
  type ProwlarrTagDetail,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type { ArrRecord } from '../../integrations/arr/admin';
import { configPatchWithoutSecrets, maskConfigSecrets } from '../../integrations/arr/secrets';
import {
  backupOf,
  date,
  logOf,
  num,
  record,
  taskOf,
  text,
  updateOf,
} from '../../integrations/arr/system-normalize';
import type { ProwlarrClient } from '../../integrations/prowlarr/client';
import { positiveInt, rawQuery, scalar } from '../movies/common';
import {
  PROWLARR_BASE,
  PROWLARR_CONFIG,
  orNotFound,
  prowlarrClient,
  prowlarrIdParams,
} from './common';

/** Sections de configuration exposées (`/api/v1/config/<nom>`). */
const CONFIG_ROUTES = [
  // n° 276-277 (page « Général »).
  { section: 'host', read: '/general', save: '/general/save' },
  // n° 278-279.
  { section: 'ui', read: '/ui', save: '/ui/save' },
  // n° 293-294.
  {
    section: 'downloadclient',
    read: '/downloadclient-config',
    save: '/downloadclient-config/save',
  },
] as const;

const ids = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

function historyOf(item: ArrRecord): ProwlarrHistoryRecord[] {
  if (typeof item.id !== 'number') return [];
  const data = record(item.data);
  const elapsed = Number.parseInt(scalar(data.elapsedTime), 10);
  const results = Number.parseInt(scalar(data.queryResults), 10);
  return [
    {
      id: item.id,
      indexerId: num(item.indexerId),
      date: date(item.date),
      eventType: text(item.eventType),
      successful: item.successful === true,
      source: text(data.source),
      query: text(data.query),
      queryType: text(data.queryType),
      categories: text(data.categories),
      queryResults: Number.isFinite(results) ? results : null,
      elapsedTime: Number.isFinite(elapsed) ? elapsed : null,
    },
  ];
}

function tagDetailOf(item: ArrRecord): ProwlarrTagDetail[] {
  if (typeof item.id !== 'number') return [];
  return [
    {
      id: item.id,
      label: text(item.label) ?? `#${item.id}`,
      indexerIds: ids(item.indexerIds),
      applicationIds: ids(item.applicationIds),
      notificationIds: ids(item.notificationIds),
      indexerProxyIds: ids(item.indexerProxyIds),
    },
  ];
}

function statusOf(item: ArrRecord): ProwlarrStatus {
  return {
    version: text(item.version),
    branch: text(item.branch),
    osName: text(item.osName),
    osVersion: text(item.osVersion),
    runtimeName: text(item.runtimeName),
    runtimeVersion: text(item.runtimeVersion),
    startTime: date(item.startTime),
    appData: text(item.appData),
    migrationVersion: num(item.migrationVersion),
    authentication: text(item.authentication),
    databaseType: text(item.databaseType),
    databaseVersion: text(item.databaseVersion),
    isDocker: item.isDocker === true,
  };
}

/** Section actuelle de Prowlarr (absente → 404 `media.api.config_not_found`). */
async function configOf(client: ProwlarrClient, section: string): Promise<ArrRecord> {
  const current = await orNotFound(() => client.one(`/api/v1/config/${section}`));
  if (current === null) {
    throw new ApiError(404, 'NOT_FOUND', {
      service: 'prowlarr',
      message: 'media.api.config_not_found',
    });
  }
  return current;
}

export function registerSystemRoutes(instance: FastifyInstance): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = PROWLARR_BASE;
  const config = PROWLARR_CONFIG;
  const clientOf = () => prowlarrClient(instance);

  // ── Configurations ─────────────────────────────────────────────────────────

  for (const route of CONFIG_ROUTES) {
    app.get(
      `${base}${route.read}`,
      { config, schema: { response: { 200: arrConfigSchema } } },
      async () => maskConfigSecrets(await configOf(clientOf(), route.section)),
    );
    app.post(
      `${base}${route.save}`,
      { config, schema: { body: arrConfigPatchSchema, response: { 200: arrConfigSchema } } },
      async (request) => {
        const client = clientOf();
        const current = await configOf(client, route.section);
        const id = typeof current.id === 'number' ? current.id : 1;
        const merged = { ...current, ...configPatchWithoutSecrets(request.body), id };
        const saved = await client.update(`/api/v1/config/${route.section}`, id, merged);
        return maskConfigSecrets({ ...(saved ?? merged), id });
      },
    );
  }

  // ── Historique ─────────────────────────────────────────────────────────────

  // n° 248 : 50 par page, plus récents en tête.
  app.get(
    `${base}/history`,
    { config, schema: { querystring: rawQuery, response: { 200: prowlarrHistoryPageSchema } } },
    async (request) => {
      const page = positiveInt(request.query.page, 1);
      const data = await clientOf().one('/api/v1/history', {
        page,
        pageSize: PROWLARR_HISTORY_PAGE_SIZE,
        sortKey: 'date',
        sortDirection: 'descending',
      });
      const records = Array.isArray(data?.records) ? (data.records as ArrRecord[]) : [];
      return {
        records: records.flatMap(historyOf),
        totalRecords: num(data?.totalRecords) ?? records.length,
        page,
        pageSize: PROWLARR_HISTORY_PAGE_SIZE,
      };
    },
  );

  // n° 295 : évènements depuis une date (`AAAA-MM-JJ`, 7 jours par défaut).
  app.get(
    `${base}/history/since`,
    {
      config,
      schema: { querystring: rawQuery, response: { 200: z.array(prowlarrHistoryRecordSchema) } },
    },
    async (request) => {
      const raw = scalar(request.query.date);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? raw
        : new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const records = await clientOf().list('/api/v1/history/since', { date: day });
      return records.flatMap(historyOf).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    },
  );

  // ── Étiquettes ─────────────────────────────────────────────────────────────

  // n° 296.
  app.get(
    `${base}/tags/detail`,
    { config, schema: { response: { 200: z.array(prowlarrTagDetailSchema) } } },
    async () => (await clientOf().list('/api/v1/tag/detail')).flatMap(tagDetailOf),
  );

  // n° 286.
  app.post(
    `${base}/tags/:id/supprimer`,
    { config, schema: { params: prowlarrIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await clientOf().remove('/api/v1/tag', request.params.id);
      return { ok: true as const };
    },
  );

  // ── Santé, statut, journaux ────────────────────────────────────────────────

  // n° 297.
  app.get(
    `${base}/health`,
    { config, schema: { response: { 200: z.array(prowlarrHealthSchema) } } },
    async () => clientOf().health(),
  );

  // n° 298.
  app.get(
    `${base}/status`,
    { config, schema: { response: { 200: prowlarrStatusSchema } } },
    async () => statusOf(record(await clientOf().systemStatus())),
  );

  // n° 299 : 100 par page, niveau facultatif passé à Prowlarr.
  app.get(
    `${base}/logs`,
    {
      config,
      schema: { querystring: rawQuery, response: { 200: arrPaged(logRecordSchema) } },
    },
    async (request) => {
      const page = positiveInt(request.query.page, 1);
      const level = scalar(request.query.level).toLowerCase();
      const data = await clientOf().one('/api/v1/log', {
        page,
        pageSize: PROWLARR_LOGS_PAGE_SIZE,
        sortKey: 'time',
        sortDirection: 'descending',
        ...(/^(info|debug|warn|error|fatal|trace)$/.test(level) ? { level } : {}),
      });
      const records = Array.isArray(data?.records) ? (data.records as ArrRecord[]) : [];
      return {
        records: records.map(logOf),
        totalRecords: num(data?.totalRecords) ?? records.length,
        page,
        pageSize: PROWLARR_LOGS_PAGE_SIZE,
      };
    },
  );

  // ── Tâches, sauvegardes, mises à jour ──────────────────────────────────────

  // Données de la page n° 280.
  app.get(
    `${base}/tasks`,
    { config, schema: { response: { 200: z.array(systemTaskSchema) } } },
    async () => (await clientOf().list('/api/v1/system/task')).flatMap(taskOf),
  );

  // n° 283 : nom de commande en lettres et chiffres.
  app.post(
    `${base}/taches/executer`,
    {
      config,
      schema: { body: prowlarrCommandRequestSchema, response: { 200: arrCommandStartedSchema } },
    },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf().command(request.body.name),
    }),
  );

  // Données de la page n° 281 : plus récentes en tête.
  app.get(
    `${base}/backups`,
    { config, schema: { response: { 200: z.array(backupSchema) } } },
    async () =>
      (await clientOf().list('/api/v1/system/backup'))
        .flatMap(backupOf)
        .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? '')),
  );

  // n° 284 : commande `Backup`, suivie par le front.
  app.post(
    `${base}/sauvegardes/creer`,
    { config, schema: { response: { 200: arrCommandStartedSchema } } },
    async () => ({ ok: true as const, cmdId: await clientOf().command('Backup') }),
  );

  // n° 285.
  app.post(
    `${base}/sauvegardes/:id/supprimer`,
    { config, schema: { params: prowlarrIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await clientOf().remove('/api/v1/system/backup', request.params.id);
      return { ok: true as const };
    },
  );

  // Données de la page n° 282 : installation masquée en conteneur.
  app.get(
    `${base}/updates`,
    { config, schema: { response: { 200: updatesPageSchema } } },
    async () => {
      const client = clientOf();
      const [updates, status] = await Promise.all([
        client.list('/api/v1/update'),
        client.systemStatus().catch(() => null),
      ]);
      const system = record(status);
      return {
        version: text(system.version),
        docker: system.isDocker === true || text(system.packageUpdateMechanism) === 'docker',
        updates: updates.flatMap(updateOf),
      };
    },
  );
}
