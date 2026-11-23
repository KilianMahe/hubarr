// SPDX-License-Identifier: AGPL-3.0-or-later
// Flux temps réel `GET /api/events` (P5.1) et test de charge du cache (P5.3) :
// serveur réellement en écoute, plusieurs connexions SSE simultanées (« cinq
// onglets »), un seul appel au client torrent par fenêtre ; sujets refusés
// selon le rôle ; lecture partagée invalidée par une mutation ; poller arrêté
// quand les onglets se ferment.

import { get, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SESSION_COOKIE_NAME } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { torrentEnv, type FakeUpstream, type TorrentEnv } from '../torrents/torrent-env';

const H = 'a'.repeat(40);

let env: TorrentEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

function qbit(upstream: FakeUpstream): void {
  upstream.on('POST /api/v2/auth/login', {
    text: 'Ok.',
    headers: { 'set-cookie': 'QBT_SID_8080=sess1; HttpOnly' },
  });
  upstream.on('GET /api/v2/torrents/info', {
    body: [{ hash: H, name: 'Dune.2021.1080p', state: 'downloading', progress: 0.5, added_on: 2 }],
  });
  upstream.on('GET /api/v2/transfer/info', { body: { dl_info_speed: 1, up_info_speed: 0 } });
  upstream.on('GET /api/v2/sync/maindata', { body: { server_state: {} } });
  upstream.on('GET /api/v2/torrents/categories', { body: {} });
  upstream.on('GET /api/v2/torrents/tags', { body: [] });
  upstream.on('POST /api/v2/torrents/stop', { text: '' });
}

interface Stream {
  events: { topic?: string; data?: unknown; accepted?: string[]; rejected?: string[] }[];
  response: IncomingMessage;
  close(): void;
  waitFor(predicate: () => boolean): Promise<void>;
}

async function openStream(base: string, path: string, cookie: string): Promise<Stream> {
  return new Promise((resolve, reject) => {
    const request = get(`${base}${path}`, { headers: { cookie } }, (response) => {
      const events: Stream['events'] = [];
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf('\n\n');
        while (index >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('');
          if (data !== '') events.push(JSON.parse(data) as Stream['events'][number]);
          index = buffer.indexOf('\n\n');
        }
      });
      resolve({
        events,
        response,
        close: () => request.destroy(),
        waitFor: async (predicate) => {
          for (let i = 0; i < 200 && !predicate(); i++) {
            await new Promise((r) => setTimeout(r, 10));
          }
          if (!predicate()) throw new Error('événement attendu non reçu');
        },
      });
    });
    request.on('error', reject);
  });
}

async function listen(current: TorrentEnv): Promise<string> {
  await current.app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(current.app.server.address() as AddressInfo).port}`;
}

describe('flux temps réel', () => {
  it('cinq onglets : un poller, un appel au client, données diffusées à tous', async () => {
    env = await torrentEnv();
    qbit(env.upstream.qbittorrent);
    const base = await listen(env);
    const cookie = `${SESSION_COOKIE_NAME}=${env.browser.cookie ?? ''}`;
    const streams = await Promise.all(
      Array.from({ length: 5 }, () =>
        openStream(base, '/api/events?topics=downloads.qbittorrent,health', cookie),
      ),
    );
    expect(streams[0]?.response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    for (const stream of streams) {
      await stream.waitFor(() => stream.events.some((e) => e.topic === 'downloads.qbittorrent'));
    }
    expect(streams[0]?.events[0]).toEqual({
      accepted: ['downloads.qbittorrent', 'health'],
      rejected: [],
    });
    const update = streams[0]?.events.find((e) => e.topic === 'downloads.qbittorrent');
    expect(update?.data).toEqual({
      active: 1,
      items: [{ hash: H, state: 'downloading', name: 'Dune.2021.1080p', size: 0 }],
    });
    expect(env.app.live.subscribers('downloads.qbittorrent')).toBe(5);
    // Les cinq onglets relisent aussi la liste : servie par la lecture partagée.
    const browser = env.browser;
    await Promise.all(Array.from({ length: 5 }, () => browser.get('/api/qbittorrent/torrents')));
    expect(env.upstream.qbittorrent.callsTo('GET /api/v2/torrents/info')).toHaveLength(1);

    // Une mutation invalide la lecture partagée : la liste suivante relit le client.
    expect((await env.browser.post(`/api/qbittorrent/torrent/${H}/pause`)).statusCode).toBe(200);
    await env.browser.get('/api/qbittorrent/torrents');
    expect(env.upstream.qbittorrent.callsTo('GET /api/v2/torrents/info')).toHaveLength(2);

    // Onglets fermés : plus d'abonné, le poller s'arrête.
    for (const stream of streams) stream.close();
    for (let i = 0; i < 100 && env.app.live.subscribers('downloads.qbittorrent') > 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(env.app.live.subscribers('downloads.qbittorrent')).toBe(0);
  });

  it('sujets refusés : rôle, service non configuré, nom invalide ; session exigée', async () => {
    env = await torrentEnv({ role: 'user' });
    const base = await listen(env);
    const cookie = `${SESSION_COOKIE_NAME}=${env.browser.cookie ?? ''}`;
    const stream = await openStream(
      base,
      '/api/events?topics=downloads.qbittorrent,activity.tautulli,queue.radarr.films,BAD!,health',
      cookie,
    );
    await stream.waitFor(() => stream.events.length > 0);
    expect(stream.events[0]).toEqual({
      accepted: ['health'],
      rejected: ['downloads.qbittorrent', 'activity.tautulli', 'queue.radarr.films', 'BAD!'],
    });
    stream.close();
    expect(
      (await env.app.inject({ method: 'GET', url: '/api/events?topics=health' })).statusCode,
    ).toBe(401);
  });
});
