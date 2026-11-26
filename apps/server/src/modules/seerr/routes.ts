// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Seerr / Jellyseerr (P3f) : les 47 routes de `JellyseerrController`
// sous `/api/jellyseerr` (R1), plus les données des pages (`GET` au chemin
// de chaque page : demandes, utilisateurs, fiche, réglages…). Demandes : droit
// sur Seerr ; utilisateurs, réglages et système : admins (garde `seerr`).
//
// Écarts : refus de Seerr → 502 avec son message (au lieu de
// `{ ok: false }` en 200) ; validations → 400 avec la clé
// `jellyseerr.api.*` ; secrets (clé d'API de Seerr, de Jellyfin, des
// serveurs Radarr/Sonarr) **jamais** renvoyés (masque) et restitués à
// l'enregistrement ou au test ; le propriétaire (id 1) reste protégé ; la
// fiche d'un utilisateur et les pages de réglages sont des réponses JSON.

import {
  SEERR_REQUEST_FILTERS,
  seerrAboutSchema,
  seerrCreateUserSchema,
  seerrImportUsersSchema,
  seerrJellyfinUsersSchema,
  seerrLogsSchema,
  seerrObjectSchema,
  seerrOkDataSchema,
  seerrOkSchema,
  seerrPasswordSchema,
  seerrPendingCountSchema,
  seerrPermissionsSchema,
  seerrRequestSchema,
  seerrRequestsPageSchema,
  seerrRequestsQuerySchema,
  seerrRoleOf,
  seerrScheduleSchema,
  seerrServiceInfoSchema,
  seerrServicesPageSchema,
  seerrServiceTestSchema,
  seerrSettingsPageSchema,
  seerrTasksSchema,
  seerrUpdatesSchema,
  seerrUserDetailSchema,
  seerrUsersPageSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { HttpClient, UpstreamError } from '../../integrations/http';
import {
  SeerrClient,
  asRow,
  asRows,
  maskSecrets,
  parseReleaseNotes,
  restoreSecret,
  textOf,
} from '../../integrations/seerr/client';
import { guardServiceModule } from '../../plugins/access';
import { apiKeyServiceClient } from '../services/clients';

const BASE = '/api/jellyseerr';
const config = { service: 'seerr' as const };
/** Utilisateurs, réglages, tâches et caches de Seerr : admins seulement (D140). */
const adminConfig = { service: 'seerr' as const, permission: 'admin' as const };
const PAGE_SIZE = 20;
const GITHUB_RELEASES = 'https://api.github.com';
const idParams = z.object({ id: z.coerce.number().int().positive() });
/** Serveurs Radarr/Sonarr de Seerr : numérotés à partir de 0. */
const serverParams = z.object({ id: z.coerce.number().int().nonnegative() });
const jobParams = z.object({ jobId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) });
const cacheParams = z.object({ cacheId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) });
const anyBody = z.looseObject({});
const ok = { 200: seerrOkSchema };

type Row = Record<string, unknown>;

function invalid(message: string): ApiError {
  return new ApiError(400, 'VALIDATION', { message });
}

const pageInfoOf = (value: unknown, page = 1) => {
  const info = asRow(value);
  return {
    pages: typeof info.pages === 'number' ? info.pages : 1,
    results: typeof info.results === 'number' ? info.results : 0,
    page: typeof info.page === 'number' ? info.page : page,
  };
};

const userWithRole = (user: Row) => ({
  ...maskSecrets(user),
  id: typeof user.id === 'number' ? user.id : 0,
  role: seerrRoleOf(typeof user.permissions === 'number' ? user.permissions : 0),
});

/**
 * Demandes par date de demande (ou de modification) décroissante, quel que
 * soit l'ordre rendu par Seerr (P5c.7, V10). Dates ISO 8601 : ordre lexical.
 */
function newestFirst(rows: Row[], sort: string): Row[] {
  const key = sort === 'modified' ? 'updatedAt' : 'createdAt';
  const date = (row: Row) => (typeof row[key] === 'string' ? row[key] : '');
  return [...rows].sort((a, b) => date(b).localeCompare(date(a)));
}

export const seerrRoutes: FastifyPluginAsync = async (instance) => {
  guardServiceModule(instance);
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const seerr = () => new SeerrClient(apiKeyServiceClient(instance, 'seerr'));
  /** Le propriétaire (id 1) n'est jamais modifié depuis Hubarr. */
  const notOwner = (id: number) => {
    if (id === 1) throw invalid('jellyseerr.api.owner_protected');
  };

  // ── Demandes (n° 71, 72, 107-112) ────────────────────────────────────────
  app.get(
    BASE,
    {
      config,
      schema: { querystring: seerrRequestsQuerySchema, response: { 200: seerrRequestsPageSchema } },
    },
    async (request) => {
      const client = seerr();
      const filter = (SEERR_REQUEST_FILTERS as readonly string[]).includes(request.query.filter)
        ? request.query.filter
        : 'all';
      const type = ['movie', 'tv'].includes(request.query.type) ? request.query.type : '';
      const sort = ['added', 'modified'].includes(request.query.sort)
        ? request.query.sort
        : 'added';
      const page = Math.max(1, request.query.page);
      const apiFilter = filter === 'all' || filter === 'partial' ? null : filter;
      const status = await client.optional(client.get<Row>('/status'), null);
      let results: Row[];
      let pageInfo: { pages: number; results: number; page: number };
      if (filter === 'partial' || type !== '') {
        // Filtres que Seerr ne connaît pas : 500 demandes, filtrées par Hubarr.
        const all = newestFirst(
          asRows((await client.requests(500, 0, apiFilter, sort)).results),
          sort,
        )
          .filter((r) => type === '' || r.type === type)
          .filter((r) => filter !== 'partial' || asRow(r.media).status === 4);
        pageInfo = {
          pages: Math.max(1, Math.ceil(all.length / PAGE_SIZE)),
          results: all.length,
          page,
        };
        results = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      } else {
        const data = await client.requests(PAGE_SIZE, (page - 1) * PAGE_SIZE, apiFilter, sort);
        results = asRows(data.results);
        pageInfo = pageInfoOf(data.pageInfo, page);
      }
      results = newestFirst(results, sort);
      const [counts, requests] = await Promise.all([
        client.optional(client.get<Row>('/request/count'), {}),
        Promise.all(results.map((r) => client.enrich(r))),
      ]);
      return {
        requests: requests as z.infer<typeof seerrRequestSchema>[],
        pageInfo,
        counts: asRow(counts),
        status: status === null ? null : maskSecrets(asRow(status)),
      };
    },
  );

  app.get(
    `${BASE}/pending-count`,
    { config, schema: { response: { 200: seerrPendingCountSchema } } },
    async () => {
      const counts = asRow(await seerr().get('/request/count'));
      return { pending: typeof counts.pending === 'number' ? counts.pending : 0 };
    },
  );

  app.get(
    `${BASE}/request/:id`,
    { config, schema: { params: idParams, response: { 200: seerrRequestSchema } } },
    async (request) => {
      const client = seerr();
      try {
        return (await client.enrich(
          asRow(await client.get(`/request/${request.params.id}`)),
        )) as z.infer<typeof seerrRequestSchema>;
      } catch (error) {
        if (error instanceof UpstreamError && error.kind === 'http' && error.info.status === 404) {
          throw new ApiError(404, 'NOT_FOUND', {
            service: 'seerr',
            message: 'jellyseerr.api.request_not_found',
          });
        }
        throw error;
      }
    },
  );
  for (const action of ['approve', 'decline', 'retry'] as const) {
    app.post(
      `${BASE}/request/:id/${action}`,
      { config, schema: { params: idParams, response: ok } },
      async (request) => {
        await seerr().send('POST', `/request/${request.params.id}/${action}`);
        return { ok: true as const };
      },
    );
  }
  app.post(
    `${BASE}/request/:id/delete`,
    { config, schema: { params: idParams, response: ok } },
    async (request) => {
      await seerr().send('DELETE', `/request/${request.params.id}`);
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/request/:id/edit`,
    { config, schema: { params: idParams, body: anyBody, response: { 200: seerrOkDataSchema } } },
    async (request) => {
      if (Object.keys(request.body).length === 0) throw invalid('jellyseerr.api.empty_data');
      const data = await seerr().send('PUT', `/request/${request.params.id}`, request.body);
      return { ok: true as const, data: maskSecrets(data) };
    },
  );

  // ── Utilisateurs (n° 73-82, 115, 117) ────────────────────────────────────
  app.get(
    `${BASE}/utilisateurs`,
    { config: adminConfig, schema: { response: { 200: seerrUsersPageSchema } } },
    async () => {
      const client = seerr();
      const [users, counts] = await Promise.all([
        client.get<Row>('/user', { take: 100, skip: 0 }),
        client.optional(client.get<Row>('/request/count'), {}),
      ]);
      return { users: asRows(users.results).map(userWithRole), counts: asRow(counts) };
    },
  );

  app.get(
    `${BASE}/utilisateurs/:id`,
    { config: adminConfig, schema: { params: idParams, response: { 200: seerrUserDetailSchema } } },
    async (request) => {
      const id = request.params.id;
      notOwner(id);
      const client = seerr();
      let user: Row;
      try {
        user = asRow(await client.get(`/user/${id}`));
      } catch (error) {
        if (error instanceof UpstreamError && error.kind === 'http' && error.info.status === 404) {
          throw new ApiError(404, 'NOT_FOUND', {
            service: 'seerr',
            message: 'jellyseerr.api.user_not_found',
          });
        }
        throw error;
      }
      const [quota, requests, settings, notifications, main, radarr, sonarr, languages, regions] =
        await Promise.all([
          client.optional(client.get<Row>(`/user/${id}/quota`), null),
          client.optional(client.get<Row>(`/user/${id}/requests`, { take: 50, skip: 0 }), {}),
          client.optional(client.get<Row>(`/user/${id}/settings/main`), {}),
          client.optional(client.get<Row>(`/user/${id}/settings/notifications`), {}),
          client.optional(client.get<Row>('/settings/main'), {}),
          client.optional(client.get('/settings/radarr'), []),
          client.optional(client.get('/settings/sonarr'), []),
          client.optional(client.get('/languages'), []),
          client.optional(client.get('/regions'), []),
        ]);
      const recent = await Promise.all(
        asRows(asRow(requests).results).map((r) => client.enrich(r)),
      );
      return {
        user: userWithRole(user),
        quota: quota === null ? null : asRow(quota),
        settings: maskSecrets(asRow(settings)),
        notifications: maskSecrets(asRow(notifications)),
        requests: recent as z.infer<typeof seerrRequestSchema>[],
        defaultPermissions:
          typeof asRow(main).defaultPermissions === 'number'
            ? (asRow(main).defaultPermissions as number)
            : 0,
        has4k: [...asRows(radarr), ...asRows(sonarr)].some((srv) => srv.is4k === true),
        languages: asRows(languages),
        regions: asRows(regions),
      };
    },
  );

  app.post(
    `${BASE}/utilisateurs/create`,
    {
      config: adminConfig,
      schema: { body: seerrCreateUserSchema, response: { 200: seerrOkDataSchema } },
    },
    async (request) => {
      const { email, password } = request.body;
      if (email.trim() === '' || password === '')
        throw invalid('jellyseerr.api.email_password_required');
      const data = await seerr().send('POST', '/user', { email: email.trim(), password });
      return { ok: true as const, data: maskSecrets(data) };
    },
  );
  app.post(
    `${BASE}/utilisateurs/import-jellyfin`,
    { config: adminConfig, schema: { body: seerrImportUsersSchema, response: ok } },
    async (request) => {
      if (request.body.jellyfinUserIds.length === 0)
        throw invalid('jellyseerr.api.no_user_selected');
      await seerr().send('POST', '/user/import-from-jellyfin', {
        jellyfinUserIds: request.body.jellyfinUserIds,
      });
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/utilisateurs/:id/delete`,
    { config: adminConfig, schema: { params: idParams, response: ok } },
    async (request) => {
      const id = request.params.id;
      if (id === 1) throw invalid('jellyseerr.api.cannot_delete_owner');
      const client = seerr();
      const user = asRow(await client.get(`/user/${id}`).catch(() => null));
      if (Object.keys(user).length === 0) throw invalid('jellyseerr.api.user_not_found');
      const perms = typeof user.permissions === 'number' ? user.permissions : 0;
      if (perms & 2 || perms & 4 || perms & 8) throw invalid('jellyseerr.api.cannot_delete_admin');
      await client.send('DELETE', `/user/${id}`);
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/utilisateurs/:id/password`,
    { config: adminConfig, schema: { params: idParams, body: seerrPasswordSchema, response: ok } },
    async (request) => {
      notOwner(request.params.id);
      if (request.body.password.length < 8) throw invalid('jellyseerr.api.password_too_short');
      await seerr().send('POST', `/user/${request.params.id}/settings/password`, {
        newPassword: request.body.password,
      });
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/utilisateurs/:id/notifications`,
    { config: adminConfig, schema: { params: idParams, body: anyBody, response: ok } },
    async (request) => {
      notOwner(request.params.id);
      await seerr().send('POST', `/user/${request.params.id}/settings/notifications`, request.body);
      return { ok: true as const };
    },
  );
  for (const path of ['settings', 'quotas']) {
    app.post(
      `${BASE}/utilisateurs/:id/${path}`,
      { config: adminConfig, schema: { params: idParams, body: anyBody, response: ok } },
      async (request) => {
        notOwner(request.params.id);
        await seerr().send('POST', `/user/${request.params.id}/settings/main`, request.body);
        return { ok: true as const };
      },
    );
  }
  app.post(
    `${BASE}/utilisateurs/:id/permissions`,
    {
      config: adminConfig,
      schema: { params: idParams, body: seerrPermissionsSchema, response: ok },
    },
    async (request) => {
      notOwner(request.params.id);
      await seerr().send('POST', `/user/${request.params.id}/settings/permissions`, {
        permissions: request.body.permissions,
      });
      return { ok: true as const };
    },
  );
  app.get(
    `${BASE}/users`,
    { config, schema: { response: { 200: z.array(seerrObjectSchema) } } },
    async () =>
      asRows((await seerr().get<Row>('/user', { take: 100, skip: 0 })).results).map(userWithRole),
  );
  app.get(
    `${BASE}/service/jellyfin-users`,
    { config: adminConfig, schema: { response: { 200: seerrJellyfinUsersSchema } } },
    async () => {
      const client = seerr();
      const [jellyfin, existing, main] = await Promise.all([
        client.get('/settings/jellyfin/users'),
        client.optional(client.get<Row>('/user', { take: 200, skip: 0 }), {}),
        client.optional(client.get<Row>('/settings/main'), {}),
      ]);
      const imported = new Set(
        asRows(asRow(existing).results).flatMap((u) =>
          typeof u.jellyfinUserId === 'string' ? [u.jellyfinUserId] : [],
        ),
      );
      return {
        users: asRows(jellyfin).filter((u) => !imported.has(textOf(u.id) ?? '')),
        mediaServerLogin: asRow(main).mediaServerLogin === true,
      };
    },
  );

  // ── Réglages (n° 83-86, 98-101, 114) ─────────────────────────────────────
  const settingsPage = async () => {
    const client = seerr();
    const [main, languages, regions] = await Promise.all([
      client.get<Row>('/settings/main'),
      client.optional(client.get('/languages'), []),
      client.optional(client.get('/regions'), []),
    ]);
    return {
      main: maskSecrets(asRow(main)),
      languages: asRows(languages),
      regions: asRows(regions),
    };
  };
  for (const path of ['/parametres', '/parametres/utilisateurs']) {
    app.get(
      `${BASE}${path}`,
      { config: adminConfig, schema: { response: { 200: seerrSettingsPageSchema } } },
      settingsPage,
    );
  }
  app.post(
    `${BASE}/parametres/save`,
    { config: adminConfig, schema: { body: anyBody, response: ok } },
    async (request) => {
      // La clé d'API de Seerr ne se modifie jamais depuis Hubarr.
      const data = Object.fromEntries(
        Object.entries(request.body).filter(([key]) => key !== 'apiKey'),
      );
      await seerr().send('POST', '/settings/main', data);
      return { ok: true as const };
    },
  );
  app.get(
    `${BASE}/service/settings-main`,
    { config: adminConfig, schema: { response: { 200: seerrObjectSchema } } },
    async () => maskSecrets(asRow(await seerr().get('/settings/main'))),
  );
  app.get(
    `${BASE}/parametres/jellyfin`,
    { config: adminConfig, schema: { response: { 200: seerrObjectSchema } } },
    async () => maskSecrets(asRow(await seerr().get('/settings/jellyfin'))),
  );
  app.post(
    `${BASE}/service/jellyfin-sync`,
    { config: adminConfig, schema: { response: ok } },
    async () => {
      await seerr().send('POST', '/settings/jellyfin/sync');
      return { ok: true as const };
    },
  );
  app.get(
    `${BASE}/parametres/a-propos`,
    { config: adminConfig, schema: { response: { 200: seerrAboutSchema } } },
    async () => {
      const client = seerr();
      const [about, status, requestCounts, users, issueCounts] = await Promise.all([
        client.get<Row>('/settings/about'),
        client.optional(client.get<Row>('/status'), {}),
        client.optional(client.get<Row>('/request/count'), {}),
        client.optional(client.get<Row>('/user', { take: 1, skip: 0 }), {}),
        client.optional(client.get<Row>('/issue/count'), {}),
      ]);
      return {
        about: maskSecrets(asRow(about)),
        status: maskSecrets(asRow(status)),
        requestCounts: asRow(requestCounts),
        totalUsers: pageInfoOf(asRow(users).pageInfo).results,
        issueCounts: asRow(issueCounts),
      };
    },
  );
  app.get(
    `${BASE}/parametres/mises-a-jour`,
    { config: adminConfig, schema: { response: { 200: seerrUpdatesSchema } } },
    async () => {
      const client = seerr();
      const status = asRow(await client.optional(client.get<Row>('/status'), {}));
      const github = new HttpClient({
        service: 'seerr',
        baseUrl: GITHUB_RELEASES,
        health: instance.upstream.health,
        logger: instance.log,
        timeoutMs: 10_000,
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'Hubarr' },
        ...(instance.upstream.dispatcher ? { dispatcher: instance.upstream.dispatcher } : {}),
      });
      const releases = await github
        .get('/repos/Fallenbagel/jellyseerr/releases', { per_page: 15 }, { trackHealth: false })
        .catch(() => []);
      const current = typeof status.version === 'string' ? status.version : null;
      return {
        status: maskSecrets(status),
        releases: asRows(releases).map((rel) => {
          const tag = typeof rel.tag_name === 'string' ? rel.tag_name : '';
          const version = tag.replace(/^v/, '');
          const url =
            typeof rel.html_url === 'string' && rel.html_url.startsWith('https://github.com/')
              ? rel.html_url
              : '';
          return {
            version,
            tag,
            date: typeof rel.published_at === 'string' ? rel.published_at : null,
            url,
            current: current !== null && version === current,
            sections: parseReleaseNotes(typeof rel.body === 'string' ? rel.body : ''),
          };
        }),
      };
    },
  );
  app.get(
    `${BASE}/parametres/logs`,
    {
      config: adminConfig,
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().catch(1),
          filter: z.string().catch(''),
        }),
        response: { 200: seerrLogsSchema },
      },
    },
    async (request) => {
      const page = Math.max(1, request.query.page);
      const filter = ['debug', 'info', 'warn', 'error'].includes(request.query.filter)
        ? request.query.filter
        : '';
      const data = asRow(
        await seerr().get('/settings/logs', {
          take: 50,
          skip: (page - 1) * 50,
          ...(filter ? { filter } : {}),
        }),
      );
      return { logs: asRows(data.results), pageInfo: pageInfoOf(data.pageInfo, page) };
    },
  );
  app.get(
    `${BASE}/parametres/taches-cache`,
    { config: adminConfig, schema: { response: { 200: seerrTasksSchema } } },
    async () => {
      const client = seerr();
      const [jobs, cache] = await Promise.all([
        client.get('/settings/jobs'),
        client.optional(client.get<Row>('/settings/cache'), {}),
      ]);
      return { jobs: asRows(jobs), cache: asRow(cache) };
    },
  );

  // ── Tâches et cache (n° 102-106) ─────────────────────────────────────────
  for (const action of ['run', 'cancel'] as const) {
    app.post(
      `${BASE}/job/:jobId/${action}`,
      { config: adminConfig, schema: { params: jobParams, response: { 200: seerrOkDataSchema } } },
      async (request) => ({
        ok: true as const,
        data: await seerr().send('POST', `/settings/jobs/${request.params.jobId}/${action}`),
      }),
    );
  }
  app.post(
    `${BASE}/job/:jobId/schedule`,
    {
      config: adminConfig,
      schema: {
        params: jobParams,
        body: seerrScheduleSchema,
        response: { 200: seerrOkDataSchema },
      },
    },
    async (request) => {
      const schedule = request.body.schedule.trim();
      if (schedule === '') throw invalid('jellyseerr.api.schedule_required');
      return {
        ok: true as const,
        data: await seerr().send('POST', `/settings/jobs/${request.params.jobId}/schedule`, {
          schedule,
        }),
      };
    },
  );
  app.post(`${BASE}/cache/flush`, { config: adminConfig, schema: { response: ok } }, async () => {
    await seerr().send('POST', '/settings/cache/flush');
    return { ok: true as const };
  });
  app.post(
    `${BASE}/cache/:cacheId/flush`,
    { config: adminConfig, schema: { params: cacheParams, response: ok } },
    async (request) => {
      await seerr().send('POST', `/settings/cache/${request.params.cacheId}/flush`);
      return { ok: true as const };
    },
  );

  // ── Services Radarr/Sonarr et règles (n° 87-97, 116) ─────────────────────
  app.get(
    `${BASE}/parametres/services`,
    { config: adminConfig, schema: { response: { 200: seerrServicesPageSchema } } },
    async () => {
      const client = seerr();
      const [radarr, sonarr, rules, users, moviesGenres, tvGenres, languages] = await Promise.all([
        client.get('/settings/radarr'),
        client.get('/settings/sonarr'),
        client.optional(client.get('/overrideRule'), []),
        client.optional(client.get<Row>('/user', { take: 100, skip: 0 }), {}),
        client.optional(client.get('/genres/movie'), []),
        client.optional(client.get('/genres/tv'), []),
        client.optional(client.get('/languages'), []),
      ]);
      const profiles = async (kind: 'radarr' | 'sonarr', servers: Row[]) =>
        Object.fromEntries(
          await Promise.all(
            servers.map(async (srv) => {
              const id = typeof srv.id === 'number' ? srv.id : 0;
              const info = await client.optional(client.get<Row>(`/service/${kind}/${id}`), null);
              return [String(id), info === null ? null : maskSecrets(asRow(info))] as const;
            }),
          ),
        );
      const genres = new Map<string, Row>();
      for (const genre of [...asRows(moviesGenres), ...asRows(tvGenres)])
        genres.set(textOf(genre.id) ?? '', genre);
      return {
        radarr: maskSecrets(asRows(radarr)),
        sonarr: maskSecrets(asRows(sonarr)),
        radarrProfiles: await profiles('radarr', asRows(radarr)),
        sonarrProfiles: await profiles('sonarr', asRows(sonarr)),
        rules: asRows(rules),
        users: asRows(asRow(users).results).map(userWithRole),
        genres: [...genres.values()],
        languages: asRows(languages),
      };
    },
  );
  app.get(
    `${BASE}/parametres/services/rules`,
    { config: adminConfig, schema: { response: { 200: z.array(seerrObjectSchema) } } },
    async () => asRows(await seerr().get('/overrideRule')),
  );
  app.post(
    `${BASE}/parametres/services/rules/save`,
    { config: adminConfig, schema: { body: anyBody, response: ok } },
    async (request) => {
      const { id, ...data } = request.body;
      if (typeof id === 'number' && id > 0) await seerr().send('PUT', `/overrideRule/${id}`, data);
      else await seerr().send('POST', '/overrideRule', data);
      return { ok: true as const };
    },
  );
  app.post(
    `${BASE}/parametres/services/rules/:id/delete`,
    { config: adminConfig, schema: { params: idParams, response: ok } },
    async (request) => {
      await seerr().send('DELETE', `/overrideRule/${request.params.id}`);
      return { ok: true as const };
    },
  );
  /** Serveur *arr enregistré (pour restituer sa clé d'API masquée). */
  const currentServer = async (client: SeerrClient, kind: 'radarr' | 'sonarr', id: unknown) =>
    typeof id === 'number'
      ? asRows(await client.get(`/settings/${kind}`)).find((srv) => srv.id === id)
      : undefined;
  for (const kind of ['radarr', 'sonarr'] as const) {
    app.post(
      `${BASE}/parametres/services/${kind}/create`,
      { config: adminConfig, schema: { body: anyBody, response: ok } },
      async (request) => {
        await seerr().send('POST', `/settings/${kind}`, request.body);
        return { ok: true as const };
      },
    );
    app.post(
      `${BASE}/parametres/services/${kind}/:id/save`,
      { config: adminConfig, schema: { params: serverParams, body: anyBody, response: ok } },
      async (request) => {
        const client = seerr();
        const data = restoreSecret(
          request.body,
          await currentServer(client, kind, request.params.id),
        );
        await client.send('PUT', `/settings/${kind}/${request.params.id}`, data);
        return { ok: true as const };
      },
    );
    app.post(
      `${BASE}/parametres/services/${kind}/:id/delete`,
      { config: adminConfig, schema: { params: serverParams, response: ok } },
      async (request) => {
        await seerr().send('DELETE', `/settings/${kind}/${request.params.id}`);
        return { ok: true as const };
      },
    );
  }
  app.post(
    `${BASE}/parametres/services/test`,
    {
      config: adminConfig,
      schema: { body: seerrServiceTestSchema, response: { 200: seerrOkDataSchema } },
    },
    async (request) => {
      const { type, ...rest } = request.body;
      const kind = type === 'sonarr' ? 'sonarr' : 'radarr';
      const client = seerr();
      const data = restoreSecret(rest, await currentServer(client, kind, rest.id));
      return {
        ok: true as const,
        data: maskSecrets(await client.send('POST', `/settings/${kind}/test`, data)),
      };
    },
  );
  app.get(
    `${BASE}/service/:type`,
    {
      config,
      schema: {
        params: z.object({ type: z.enum(['radarr', 'sonarr']) }),
        response: { 200: seerrServiceInfoSchema },
      },
    },
    async (request) => {
      const client = seerr();
      const servers = asRows(await client.get(`/settings/${request.params.type}`));
      const server = servers.find((srv) => srv.isDefault === true) ?? servers[0];
      const id = typeof server?.id === 'number' ? server.id : 0;
      const data = await client.optional(
        client.get<Row>(`/service/${request.params.type}/${id}`),
        null,
      );
      return data === null ? { profiles: [], rootFolders: [] } : maskSecrets(asRow(data));
    },
  );
};
