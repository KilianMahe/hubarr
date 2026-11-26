// SPDX-License-Identifier: AGPL-3.0-or-later
// Statistiques du tableau de bord (lot 13) : octets téléchargés par jour
// (fuseau, période, clients torrent et Usenet, client injoignable) et espace
// disque (point de montage d'un dossier racine, dédoublonnage, alerte),
// réservés aux admins.

import type { DashboardDisks, DashboardDownloads, DashboardPage } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { bytesPerDay, diskUsage, mountOf } from '../../../src/modules/dashboard/stats';
import { applyServicePatch } from '../../../src/modules/services/config';
import { mediaEnv, type MediaEnv } from '../media-env';
import { fakeUpstream } from '../torrents/torrent-env';

const GIB = 1_073_741_824;
const sec = (iso: string) => Date.parse(iso) / 1000;

describe('octets par jour', () => {
  it('30 jours jusqu’à aujourd’hui, jour de fin dans le fuseau, hors période ignoré', () => {
    const days = bytesPerDay(
      [
        { completedAt: sec('2026-11-22T10:00:00Z'), bytes: 5 },
        { completedAt: sec('2026-11-22T11:00:00Z'), bytes: 7 },
        // 23 h 30 UTC le 20 = 00 h 30 le 21 à Paris.
        { completedAt: sec('2026-11-20T23:30:00Z'), bytes: 3 },
        { completedAt: sec('2026-10-01T12:00:00Z'), bytes: 100 },
        { completedAt: null, bytes: 100 },
        { completedAt: sec('2026-11-22T10:00:00Z'), bytes: 0 },
      ],
      '2026-11-22',
      'Europe/Paris',
    );
    expect(days).toHaveLength(30);
    expect(days[0]?.day).toBe('2026-10-24');
    expect(days.at(-1)).toEqual({ day: '2026-11-22', bytes: 12 });
    expect(days.find((d) => d.day === '2026-11-21')?.bytes).toBe(3);
    expect(days.find((d) => d.day === '2026-11-20')?.bytes).toBe(0);
    expect(days.reduce((sum, d) => sum + d.bytes, 0)).toBe(15);
  });
});

describe('disques', () => {
  it('point de montage : le plus long qui contient le dossier, pas un simple préfixe', () => {
    const disks = [
      { path: '/' },
      { path: '/data' },
      { path: '/data/films' },
      { path: '/database' },
    ];
    expect(mountOf('/data/films/4k', disks)?.path).toBe('/data/films');
    expect(mountOf('/data/series/', disks)?.path).toBe('/data');
    expect(mountOf('/databank', disks)?.path).toBe('/');
    expect(mountOf('/x', [{ path: '/data' }])).toBeNull();
    expect(mountOf('D:\\Films', [{ path: 'D:\\' }, { path: 'C:\\' }])?.path).toBe('D:\\');
  });

  it('dédoublonnés entre instances, disques sans dossier racine écartés, plus remplis d’abord', () => {
    const disks = diskUsage([
      {
        service: 'radarr',
        instance: 'Films',
        disks: [
          { path: '/', totalSpace: 100 * GIB, freeSpace: 90 * GIB },
          { path: '/movies', label: 'Films', totalSpace: 1000 * GIB, freeSpace: 50 * GIB },
        ],
        roots: ['/movies', '/movies/kids'],
      },
      {
        service: 'sonarr',
        instance: 'Séries',
        // Même disque, monté ailleurs dans le conteneur de Sonarr.
        disks: [{ path: '/tv', totalSpace: 1000 * GIB, freeSpace: 50 * GIB + 1000 }],
        roots: ['/tv'],
      },
      {
        service: 'sonarr',
        instance: 'Animés',
        disks: [{ path: '/anime', totalSpace: 400 * GIB, freeSpace: 300 * GIB }],
        roots: ['/anime', '/introuvable'],
      },
    ]);
    expect(disks).toEqual([
      {
        path: '/movies',
        label: 'Films',
        totalSpace: 1000 * GIB,
        freeSpace: 50 * GIB,
        usedPercent: 95,
        alert: true,
        roots: [
          { service: 'radarr', instance: 'Films', path: '/movies' },
          { service: 'radarr', instance: 'Films', path: '/movies/kids' },
          { service: 'sonarr', instance: 'Séries', path: '/tv' },
        ],
      },
      {
        path: '/anime',
        label: null,
        totalSpace: 400 * GIB,
        freeSpace: 300 * GIB,
        usedPercent: 25,
        alert: false,
        roots: [{ service: 'sonarr', instance: 'Animés', path: '/anime' }],
      },
    ]);
  });
});

let env: MediaEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

const QBIT = 'http://qbit.test:8080';
const SAB = 'http://sab.test:8080';

describe('routes', () => {
  it('téléchargements : non configuré → carte masquée ; utilisateur sans droit → cartes masquées', async () => {
    env = await mediaEnv();
    const page = (await env.browser.get('/api/tableau-de-bord')).json<DashboardPage>();
    expect(page.configured.downloads).toBe(false);
    const body = (
      await env.browser.get('/api/tableau-de-bord/widget/downloads')
    ).json<DashboardDownloads>();
    expect(body.available).toBe(false);
    await env.close();

    env = await mediaEnv({ role: 'user', permissions: () => ({}) });
    applyServicePatch(env.database.db, 'qbittorrent', { url: QBIT, user: 'u', password: 'p' });
    for (const card of ['downloads', 'disks']) {
      const response = await env.browser.get(`/api/tableau-de-bord/widget/${card}`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ available: false });
    }
  });

  it('téléchargements : torrents terminés et historique Usenet réussi, par jour', async () => {
    env = await mediaEnv({ timezone: 'UTC' });
    applyServicePatch(env.database.db, 'qbittorrent', { url: QBIT, user: 'u', password: 'p' });
    applyServicePatch(env.database.db, 'sabnzbd', { url: SAB, apiKey: 'sab' });
    const qbit = fakeUpstream(env.agent, QBIT);
    qbit.on('POST /api/v2/auth/login', {
      text: 'Ok.',
      headers: { 'set-cookie': 'SID=s; HttpOnly' },
    });
    qbit.on('GET /api/v2/torrents/info', {
      body: [
        {
          hash: 'a'.repeat(40),
          name: 'A',
          progress: 1,
          size: 4 * GIB,
          completion_on: sec('2026-11-22T08:00:00Z'),
        },
        { hash: 'b'.repeat(40), name: 'B', progress: 0.5, size: 9 * GIB, completion_on: -1 },
        {
          hash: 'c'.repeat(40),
          name: 'C',
          progress: 1,
          size: 9 * GIB,
          completion_on: sec('2026-01-01T08:00:00Z'),
        },
      ],
    });
    const sab = fakeUpstream(env.agent, SAB);
    sab.on('GET /api', (call) =>
      call.query.get('mode') === 'history'
        ? {
            body: {
              history: {
                noofslots: 3,
                slots: [
                  {
                    nzo_id: '1',
                    name: 'X',
                    status: 'Completed',
                    bytes: 2 * GIB,
                    completed: sec('2026-11-21T12:00:00Z'),
                  },
                  {
                    nzo_id: '2',
                    name: 'Y',
                    status: 'Failed',
                    bytes: 5 * GIB,
                    completed: sec('2026-11-21T12:00:00Z'),
                  },
                  {
                    nzo_id: '3',
                    name: 'Z',
                    status: 'Completed',
                    bytes: 1 * GIB,
                    completed: sec('2026-11-22T09:00:00Z'),
                  },
                ],
              },
            },
          }
        : { status: 404 },
    );
    const page = (await env.browser.get('/api/tableau-de-bord')).json<DashboardPage>();
    expect(page.configured.downloads).toBe(true);
    const body = (
      await env.browser.get('/api/tableau-de-bord/widget/downloads')
    ).json<DashboardDownloads>();
    expect(body.available).toBe(true);
    expect(body.days).toHaveLength(30);
    expect(body.days.at(-1)).toEqual({ day: '2026-11-22', bytes: 5 * GIB });
    expect(body.days.at(-2)).toEqual({ day: '2026-11-21', bytes: 2 * GIB });
    expect(body.total).toBe(7 * GIB);
    expect(body.average).toBe(Math.round((7 * GIB) / 30));
    expect(body.clients).toEqual([
      { id: 'qbittorrent', ok: true },
      { id: 'sabnzbd', ok: true },
    ]);
    // Gardé 5 min : pas de nouvel appel aux clients.
    const calls = qbit.callsTo('GET /api/v2/torrents/info').length;
    await env.browser.get('/api/tableau-de-bord/widget/downloads');
    expect(qbit.callsTo('GET /api/v2/torrents/info')).toHaveLength(calls);
  });

  it('téléchargements : client injoignable signalé, les autres comptés, rien gardé', async () => {
    env = await mediaEnv({ timezone: 'UTC' });
    applyServicePatch(env.database.db, 'sabnzbd', { url: SAB, apiKey: 'sab' });
    applyServicePatch(env.database.db, 'nzbget', { url: 'http://nzbget.test:6789' });
    const sab = fakeUpstream(env.agent, SAB);
    sab.on('GET /api', { status: 500 });
    const nzbget = fakeUpstream(env.agent, 'http://nzbget.test:6789');
    nzbget.on('POST /jsonrpc#history', {
      body: {
        result: [
          {
            NZBID: 1,
            Name: 'N',
            Status: 'SUCCESS/ALL',
            FileSizeMB: 1024,
            HistoryTime: sec('2026-11-22T01:00:00Z'),
          },
        ],
      },
    });
    const body = (
      await env.browser.get('/api/tableau-de-bord/widget/downloads')
    ).json<DashboardDownloads>();
    expect(body.clients).toEqual([
      { id: 'sabnzbd', ok: false },
      { id: 'nzbget', ok: true },
    ]);
    expect(body.total).toBe(GIB);
    expect(env.app.cache.store.get('dash.downloads')).toBeUndefined();
  });

  it('disques : dossiers racines des instances Radarr et Sonarr, instance injoignable nommée', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/diskspace', {
      body: [{ path: '/movies', label: 'movies', freeSpace: 50 * GIB, totalSpace: 1000 * GIB }],
    });
    env.up.radarr.on('GET /api/v3/rootfolder', { body: [{ id: 1, path: '/movies' }] });
    env.up.radarr4k.on('GET /api/v3/diskspace', { status: 500 });
    env.up.sonarr.on('GET /api/v3/diskspace', {
      body: [{ path: '/tv', label: 'tv', freeSpace: 600 * GIB, totalSpace: 2000 * GIB }],
    });
    env.up.sonarr.on('GET /api/v3/rootfolder', { body: [{ id: 1, path: '/tv/series' }] });
    const body = (
      await env.browser.get('/api/tableau-de-bord/widget/disks')
    ).json<DashboardDisks>();
    expect(body.available).toBe(true);
    expect(body.failed).toEqual(['Films 4K']);
    expect(body.disks.map((d) => [d.path, d.usedPercent, d.alert])).toEqual([
      ['/movies', 95, true],
      ['/tv', 70, false],
    ]);
    expect(body.disks[1]?.roots).toEqual([
      { service: 'sonarr', instance: 'Séries', path: '/tv/series' },
    ]);
  });
});
