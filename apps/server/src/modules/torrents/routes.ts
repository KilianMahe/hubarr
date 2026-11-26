// SPDX-License-Identifier: AGPL-3.0-or-later
// Module des clients torrent (P3d.1 à P3d.4) : les routes de
// `QBittorrentController` (27), `TransmissionController` (21) et
// `DelugeController` (21), enregistrées **une fois par client** sous
// `/api/<client>` (règle R1). Une route propre à un client n'existe que si sa
// capacité est vraie (`TORRENT_CAPABILITIES`). Droit sur le client
// contrôlé par la garde de service `<client>`.
//
// Écarts :
// - erreurs communes (503 injoignable, 502 refus du client avec son message)
//   au lieu de `{ ok: false, error }` ; validation → 400 `VALIDATION` avec une
//   clé `<client>.api.*` / `<client>.upload.*` ;
// - empreinte invalide dans le chemin → 404 (route non trouvée dans l'original) ;
// - fichiers `.torrent` envoyés en JSON (base64) au lieu d'un multipart ;
// - catégories et étiquettes renvoyées avec la liste (rendues par la page dans
//   l'original) ; limites globales et mode alternatif lus avec les statistiques.

import {
  TORRENT_CAPABILITIES,
  TORRENT_CLIENTS,
  arrOkSchema,
  torrentAddFileRequestSchema,
  torrentAddFileResponseSchema,
  torrentAddUrlRequestSchema,
  torrentBulkCategoryRequestSchema,
  torrentBulkDeleteRequestSchema,
  torrentBulkRequestSchema,
  torrentCategoryRequestSchema,
  torrentDeleteRequestSchema,
  torrentDetailSchema,
  torrentFilePriorityRequestSchema,
  torrentForceStartRequestSchema,
  torrentLimitRequestSchema,
  torrentListQuerySchema,
  torrentListResponseSchema,
  torrentLocationRequestSchema,
  torrentPollSummarySchema,
  torrentRenameRequestSchema,
  torrentResolveSchema,
  torrentVpnSchema,
  type TorrentClientId,
} from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import {
  isValidHash,
  listTorrents,
  readTorrentFile,
  sanitizeHashes,
  validateTorrentUrls,
  type TorrentFile,
} from '../../integrations/torrents/common';
import { EMPTY_GLUETUN } from '../../integrations/torrents/gluetun';
import type { TorrentClient } from '../../integrations/torrents/types';
import { guardServiceModule } from '../../plugins/access';
import { gluetunClient, torrentClient } from './clients';
import { sharedTorrents, torrentSummary } from './live';
import { resolveTorrent } from './resolver';

const hashParams = z.object({ hash: z.string() });
const resolveParams = z.object({ pipeline: z.string(), hash: z.string() });
const ok = { 200: arrOkSchema };

function invalid(message: string): ApiError {
  return new ApiError(400, 'VALIDATION', { message });
}

/** Résumé VPN de la page qBittorrent (`apiVpn`) : jamais d'erreur. */
async function vpnOf(app: FastifyInstance, client: TorrentClient | null) {
  const gluetun = gluetunClient(app);
  const summary = gluetun === null ? EMPTY_GLUETUN : await gluetun.summary();
  let clientPort: number | null = null;
  try {
    clientPort = (await client?.listenPort?.()) ?? null;
  } catch (error) {
    app.log.warn({ err: error }, 'qbittorrent: port d’écoute illisible');
  }
  return {
    ...summary,
    clientPort,
    portSync:
      summary.forwardedPort !== null && clientPort !== null
        ? summary.forwardedPort === clientPort
        : null,
  };
}

function registerClient(instance: FastifyInstance, id: TorrentClientId): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = `/api/${id}`;
  const config = { service: id };
  const caps = TORRENT_CAPABILITIES[id];
  const clientOf = () => torrentClient(instance, id);
  const checkHash = (hash: string) => {
    if (!isValidHash(hash, caps)) throw new ApiError(404, 'NOT_FOUND', { service: id });
  };
  const hashesOf = (raw: unknown) => {
    const hashes = sanitizeHashes(raw, caps.hashPattern, !caps.pauseAllRoute);
    if (hashes.length === 0) throw invalid(`${id}.api.no_valid_hash`);
    return hashes;
  };

  // Résumé du sondage global (barre latérale, toasts).
  app.get(
    `${base}/poll-summary`,
    { config, schema: { response: { 200: torrentPollSummarySchema } } },
    async () => torrentSummary(instance, id),
  );

  // Liste filtrée, triée et paginée par le serveur, avec les statistiques.
  app.get(
    `${base}/torrents`,
    {
      config,
      schema: { querystring: torrentListQuerySchema, response: { 200: torrentListResponseSchema } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      const client = clientOf();
      const all = await sharedTorrents(instance, id);
      const [stats, categories, tags] = await Promise.all([
        client.stats(all),
        client.categories(all).catch(() => []),
        client.tags(all).catch(() => []),
      ]);
      const page = listTorrents(all, request.query);
      return { ...page, stats, categories, tags };
    },
  );

  // Résolution vers la fiche Radarr/Sonarr (badge de catégorie).
  app.get(
    `${base}/resolve/:pipeline/:hash`,
    { config, schema: { params: resolveParams, response: { 200: torrentResolveSchema } } },
    async (request) => {
      const { pipeline, hash } = request.params;
      if (pipeline !== 'radarr' && pipeline !== 'sonarr') {
        throw new ApiError(404, 'NOT_FOUND', { service: id });
      }
      checkHash(hash);
      const torrent = (await clientOf().torrents()).find((t) => t.hash === hash);
      if (torrent === undefined) {
        throw new ApiError(404, 'NOT_FOUND', {
          service: id,
          message: `${id}.api.torrent_not_found`,
        });
      }
      return resolveTorrent(instance, pipeline, torrent.name);
    },
  );

  // Fiche : propriétés, fichiers, trackers, pairs.
  app.get(
    `${base}/torrent/:hash`,
    { config, schema: { params: hashParams, response: { 200: torrentDetailSchema } } },
    async (request) => {
      checkHash(request.params.hash);
      const detail = await clientOf().detail(request.params.hash);
      if (detail === null) {
        throw new ApiError(404, 'NOT_FOUND', {
          service: id,
          message: `${id}.api.torrent_not_found`,
        });
      }
      return detail;
    },
  );

  // Actions sur un torrent.
  const single = (
    action: string,
    run: (client: TorrentClient, hash: string, body: unknown) => Promise<void>,
    body?: z.ZodType,
  ) =>
    app.post(
      `${base}/torrent/:hash/${action}`,
      { config, schema: { params: hashParams, ...(body ? { body } : {}), response: ok } },
      async (request) => {
        checkHash(request.params.hash);
        await run(clientOf(), request.params.hash, request.body);
        return { ok: true as const };
      },
    );

  single('pause', (c, h) => c.pause([h]));
  single('resume', (c, h) => c.resume([h]));
  single(
    'delete',
    (c, h, body) =>
      c.remove(
        [h],
        (body as z.infer<typeof torrentDeleteRequestSchema> | undefined)?.deleteFiles === true,
      ),
    torrentDeleteRequestSchema.optional(),
  );
  single('recheck', (c, h) => c.recheck([h]));
  single('reannounce', (c, h) => c.reannounce([h]));
  single(
    'limit',
    (c, h, body) => c.setLimits([h], body as z.infer<typeof torrentLimitRequestSchema>),
    torrentLimitRequestSchema,
  );

  if (caps.advanced) {
    single(
      'force-start',
      async (c, h, body) => {
        const value = (body as z.infer<typeof torrentForceStartRequestSchema> | undefined)?.value;
        await c.setForceStart?.([h], value !== false);
      },
      torrentForceStartRequestSchema.optional(),
    );
    single('sequential', async (c, h) => {
      await c.toggleSequential?.([h]);
    });
    single('first-last', async (c, h) => {
      await c.toggleFirstLast?.([h]);
    });
    single(
      'rename',
      async (c, h, body) => {
        const name = (body as z.infer<typeof torrentRenameRequestSchema>).name.trim();
        if (name === '') throw invalid(`${id}.api.empty_name`);
        await c.rename?.(h, name);
      },
      torrentRenameRequestSchema,
    );
  }
  if (caps.filePriorities !== null) {
    single(
      'files/priority',
      async (c, h, body) => {
        const { fileIds, priority } = body as z.infer<typeof torrentFilePriorityRequestSchema>;
        if (!caps.filePriorities?.includes(priority)) throw invalid(`${id}.api.invalid_priority`);
        await c.setFilePriority?.(h, fileIds, priority);
      },
      torrentFilePriorityRequestSchema,
    );
  }
  if (caps.setCategory) {
    single(
      'category',
      async (c, h, body) => {
        await c.setCategory?.([h], (body as z.infer<typeof torrentCategoryRequestSchema>).category);
      },
      torrentCategoryRequestSchema,
    );
  }
  if (caps.location) {
    single(
      'location',
      async (c, h, body) => {
        const location = (body as z.infer<typeof torrentLocationRequestSchema>).location.trim();
        if (location === '') throw invalid(`${id}.api.empty_location`);
        await c.setLocation?.(h, location);
      },
      torrentLocationRequestSchema,
    );
  }

  // Actions groupées (`['all']` vaut « tous » pour qBittorrent).
  const bulk = (action: string, run: (client: TorrentClient, hashes: string[]) => Promise<void>) =>
    app.post(
      `${base}/bulk/${action}`,
      { config, schema: { body: torrentBulkRequestSchema, response: ok } },
      async (request) => {
        await run(clientOf(), hashesOf(request.body.hashes));
        return { ok: true as const };
      },
    );
  bulk('pause', (c, hashes) => c.pause(hashes));
  bulk('resume', (c, hashes) => c.resume(hashes));
  bulk('recheck', (c, hashes) => c.recheck(hashes));
  app.post(
    `${base}/bulk/delete`,
    { config, schema: { body: torrentBulkDeleteRequestSchema, response: ok } },
    async (request) => {
      await clientOf().remove(hashesOf(request.body.hashes), request.body.deleteFiles === true);
      return { ok: true as const };
    },
  );
  if (caps.setCategory) {
    app.post(
      `${base}/bulk/category`,
      { config, schema: { body: torrentBulkCategoryRequestSchema, response: ok } },
      async (request) => {
        await clientOf().setCategory?.(hashesOf(request.body.hashes), request.body.category);
        return { ok: true as const };
      },
    );
  }
  if (caps.pauseAllRoute) {
    app.post(`${base}/pause-all`, { config, schema: { response: ok } }, async () => {
      await clientOf().pauseAll?.();
      return { ok: true as const };
    });
    app.post(`${base}/resume-all`, { config, schema: { response: ok } }, async () => {
      await clientOf().resumeAll?.();
      return { ok: true as const };
    });
  }

  // Ajout par liens (magnets, URL `.torrent`), garde SSRF.
  app.post(
    `${base}/add`,
    { config, schema: { body: torrentAddUrlRequestSchema, response: ok } },
    async (request) => {
      const urls = request.body.urls.trim();
      if (urls === '') throw invalid(`${id}.upload.invalid_url`);
      const violation = validateTorrentUrls(urls);
      if (violation !== null) throw invalid(`${id}.upload.${violation}`);
      await clientOf().addUrls(urls, {
        category: caps.setCategory ? (request.body.category ?? null) : null,
        savepath: request.body.savepath ?? null,
        paused: request.body.paused === true,
      });
      return { ok: true as const };
    },
  );

  // Ajout de fichiers `.torrent` (10 Mo chacun, bencode reconnu).
  app.post(
    `${base}/add-file`,
    {
      config,
      schema: {
        body: torrentAddFileRequestSchema,
        response: { 200: torrentAddFileResponseSchema },
      },
    },
    async (request) => {
      const files: TorrentFile[] = [];
      for (const file of request.body.files) {
        const read = readTorrentFile(file.name, file.content);
        if (typeof read === 'string') throw invalid(`${id}.upload.${read}`);
        files.push(read);
      }
      if (files.length === 0) throw invalid(`${id}.api.no_valid_file`);
      await clientOf().addFiles(files, {
        category: caps.setCategory ? (request.body.category ?? null) : null,
        savepath: request.body.savepath ?? null,
        paused: request.body.paused === true,
      });
      return { ok: true as const, count: files.length };
    },
  );

  // Limites globales (octets/s, 0 = illimité).
  app.post(
    `${base}/global-limit`,
    { config, schema: { body: torrentLimitRequestSchema, response: ok } },
    async (request) => {
      await clientOf().setGlobalLimits(request.body);
      return { ok: true as const };
    },
  );

  if (caps.speedMode) {
    app.post(`${base}/speed-mode`, { config, schema: { response: ok } }, async () => {
      await clientOf().toggleSpeedMode?.();
      return { ok: true as const };
    });
  }

  if (caps.vpn) {
    app.get(
      `${base}/vpn`,
      { config, schema: { response: { 200: torrentVpnSchema } } },
      async () => {
        let client: TorrentClient | null;
        try {
          client = clientOf();
        } catch {
          client = null;
        }
        return vpnOf(instance, client);
      },
    );
  }
}

export const torrentRoutes: FastifyPluginAsync = async (instance) => {
  guardServiceModule(instance);
  for (const id of TORRENT_CLIENTS) registerClient(instance, id);
};
