// SPDX-License-Identifier: AGPL-3.0-or-later
// Liste des torrents partagée entre la page, le résumé global et le flux
// temps réel (P5.1) : un appel au client par fenêtre de 2 s, quel que soit le
// nombre d'onglets.

import type { TorrentClientId, TorrentPollSummary } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { torrentClient } from './clients';

export const TORRENTS_SHARED_TTL_MS = 2_000;

export function sharedTorrents(app: FastifyInstance, id: TorrentClientId) {
  return app.live.shared(`torrents.${id}`, TORRENTS_SHARED_TTL_MS, () =>
    torrentClient(app, id).torrents(),
  );
}

/** Résumé du sondage global (barre latérale, notifications). */
export async function torrentSummary(
  app: FastifyInstance,
  id: TorrentClientId,
): Promise<TorrentPollSummary> {
  const torrents = await sharedTorrents(app, id);
  return {
    active: torrents.filter((t) => t.state === 'downloading').length,
    items: torrents
      .filter((t) => ['completed', 'error', 'downloading', 'seeding'].includes(t.state))
      .map((t) => ({ hash: t.hash, state: t.state, name: t.name, size: t.size })),
  };
}
