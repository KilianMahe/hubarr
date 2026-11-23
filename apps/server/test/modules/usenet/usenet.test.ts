// SPDX-License-Identifier: AGPL-3.0-or-later
// Usenet (P3d.5) : `UsenetStatusTest`, `SabnzbdClientTest`, `NzbgetClientTest`,
// `SabnzbdActionResultTest` et `UsenetControllerTest` portés.

import type { UsenetHistory, UsenetOverview, UsenetQueue } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  combineBytes,
  fromNzbgetHistory,
  fromNzbgetQueue,
  fromSabnzbd,
  normalizeNzbgetGroup,
  normalizeNzbgetHistory,
  normalizeSabHistorySlot,
  normalizeSabQueueSlot,
  parseClock,
  parseWaitSeconds,
} from '../../../src/integrations/usenet/clients';
import { recentHistoryKey } from '../../../src/modules/usenet/routes';
import { torrentEnv, type FakeUpstream, type TorrentEnv } from '../torrents/torrent-env';

describe('statuts', () => {
  it('SABnzbd', () => {
    expect(fromSabnzbd('Downloading')).toBe('downloading');
    expect(fromSabnzbd('Grabbing')).toBe('fetching');
    expect(fromSabnzbd('Repairing')).toBe('verifying');
    expect(fromSabnzbd('Unpacking')).toBe('extracting');
    expect(fromSabnzbd('Running')).toBe('moving');
    expect(fromSabnzbd('Failed')).toBe('failed');
    expect(fromSabnzbd('???')).toBe('unknown');
  });
  it('NZBGet, file et historique', () => {
    expect(fromNzbgetQueue('PP_QUEUED')).toBe('queued');
    expect(fromNzbgetQueue('LOADING_PARS')).toBe('verifying');
    expect(fromNzbgetQueue('UNPACKING')).toBe('extracting');
    expect(fromNzbgetQueue('EXECUTING_SCRIPT')).toBe('moving');
    expect(fromNzbgetHistory('SUCCESS/ALL')).toBe('completed');
    expect(fromNzbgetHistory('WARNING/SCRIPT')).toBe('completed');
    expect(fromNzbgetHistory('FAILURE/PAR')).toBe('failed');
    expect(fromNzbgetHistory('DELETED/MANUAL')).toBe('failed');
    expect(fromNzbgetHistory('')).toBe('unknown');
  });
});

describe('SABnzbd', () => {
  it('file : Mo en chaînes → octets, attente lue dans les labels', () => {
    const item = normalizeSabQueueSlot({
      nzo_id: 'SABnzbd_nzo_1',
      filename: 'A',
      status: 'Grabbing',
      mb: '10.5',
      mbleft: '5',
      percentage: '52',
      cat: 'tv',
      timeleft: '0:01:05',
      labels: ['Patienter 12 sec'],
    });
    expect(item).toMatchObject({
      size: 11_010_048,
      remaining: 5_242_880,
      percentage: 52,
      eta: 65,
      wait: 12,
      status: 'fetching',
    });
    expect(parseWaitSeconds(undefined)).toBeNull();
    expect(parseWaitSeconds(['DUPLICATE'])).toBeNull();
  });
  it('historique : octets bruts, message d’échec, date de fin', () => {
    expect(
      normalizeSabHistorySlot({
        nzo_id: 'x',
        name: 'n',
        status: 'Failed',
        bytes: 100,
        fail_message: 'boom',
        completed: 1700,
      }),
    ).toMatchObject({
      size: 100,
      fail: 'boom',
      percentage: 0,
      completedAt: 1700,
      history: true,
    });
    expect(normalizeSabHistorySlot({ status: 'Completed', fail_message: '' })).toMatchObject({
      percentage: 100,
      fail: null,
      completedAt: null,
    });
  });
  it('horloge', () => {
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('0:00:00')).toBeNull();
    expect(parseClock('unknown')).toBeNull();
    expect(parseClock('')).toBeNull();
  });
});

describe('NZBGet', () => {
  it('tailles Lo/Hi (non signées) ou Mo', () => {
    expect(combineBytes({ FileSizeLo: 5, FileSizeHi: 1 }, 'FileSize')).toBe(4_294_967_301);
    expect(combineBytes({ FileSizeLo: -1, FileSizeHi: 0 }, 'FileSize')).toBe(4_294_967_295);
    expect(combineBytes({ FileSizeMB: 2 }, 'FileSize')).toBe(2_097_152);
  });
  it('groupe : pourcentage borné, tiré du restant', () => {
    expect(
      normalizeNzbgetGroup({ NZBID: 7, FileSizeLo: 100, RemainingSizeLo: 25 }).percentage,
    ).toBe(75);
    expect(normalizeNzbgetGroup({ FileSizeLo: 100, RemainingSizeLo: 150 }).percentage).toBe(0);
  });
  it('historique : statut brut gardé comme motif d’échec, date de fin', () => {
    expect(
      normalizeNzbgetHistory({ NZBID: 1, Status: 'FAILURE/PAR', HistoryTime: 99 }),
    ).toMatchObject({
      status: 'failed',
      fail: 'FAILURE/PAR',
      completedAt: 99,
    });
    expect(normalizeNzbgetHistory({ Status: 'SUCCESS/ALL' })).toMatchObject({
      percentage: 100,
      fail: null,
      completedAt: null,
    });
  });
});

let env: TorrentEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});
async function open(options: Parameters<typeof torrentEnv>[0] = {}): Promise<TorrentEnv> {
  env = await torrentEnv({
    configure: { sabnzbd: { apiKey: 'sab-key' }, nzbget: { user: 'nz', password: 'pw' } },
    ...options,
  });
  return env;
}

function sab(upstream: FakeUpstream, modes: Record<string, unknown>) {
  upstream.on('GET /api', (call) => {
    const mode = call.query.get('mode') ?? '';
    if (call.query.get('apikey') !== 'sab-key') return { status: 403, text: 'API Key Incorrect' };
    return mode in modes
      ? { body: modes[mode] }
      : { body: { status: false, error: 'unknown mode' } };
  });
}

describe('routes', () => {
  it('non configuré → 409, utilisateur simple → 403, client inconnu → 400', async () => {
    let current = await open({ configure: {} });
    expect((await current.browser.get('/api/usenet/sabnzbd/queue')).statusCode).toBe(409);
    await current.close();
    current = await open({ role: 'user' });
    expect((await current.browser.get('/api/usenet/sabnzbd/queue')).statusCode).toBe(403);
    await current.close();
    current = await open();
    expect((await current.browser.get('/api/usenet/foo/queue')).statusCode).toBe(400);
  });

  it('SABnzbd : file normalisée et résumé', async () => {
    const current = await open();
    sab(current.upstream.sabnzbd, {
      queue: {
        queue: {
          paused: false,
          kbpersec: '100',
          speedlimit_abs: '0',
          mbleft: '1',
          timeleft: '0:00:10',
          diskspace1: '2',
          slots: [
            {
              nzo_id: 'a',
              filename: 'A',
              status: 'Downloading',
              mb: '1',
              mbleft: '0.5',
              percentage: '50',
            },
            { nzo_id: 'b', filename: 'B', status: 'Queued', mb: '1', mbleft: '1', percentage: '0' },
          ],
        },
      },
    });
    const queue = (await current.browser.get('/api/usenet/sabnzbd/queue')).json<UsenetQueue>();
    expect(queue).toMatchObject({
      speed: 102_400,
      active: 1,
      queued: 1,
      eta: 10,
      freeSpace: 2 * 1024 ** 3,
    });
    expect((await current.browser.get('/api/usenet/sabnzbd/poll-summary')).json()).toEqual({
      active: 1,
    });
  });

  it('page : historique récent mis en cache 45 s, jamais vide ; injoignable → historique vide', async () => {
    const current = await open();
    let calls = 0;
    current.upstream.sabnzbd.on('GET /api', (call) => {
      const mode = call.query.get('mode');
      if (mode === 'get_cats') return { body: { categories: ['*', 'tv', 'movies'] } };
      if (mode === 'history') {
        calls += 1;
        expect(call.query.get('limit')).toBe('15');
        return {
          body: {
            history: {
              noofslots: 40,
              slots: [{ nzo_id: 'h', name: 'H', status: 'Completed', bytes: 1 }],
            },
          },
        };
      }
      return { body: { status: false } };
    });
    const page = (await current.browser.get('/api/usenet/sabnzbd')).json<UsenetOverview>();
    expect(page).toMatchObject({ categories: ['tv', 'movies'], historyTotal: 40 });
    expect(page.recentHistory[0]).toMatchObject({ id: 'h', status: 'completed' });
    await current.browser.get('/api/usenet/sabnzbd');
    expect(calls).toBe(1);
    current.app.cache.store.delete(recentHistoryKey('sabnzbd'));
    current.upstream.sabnzbd.on('GET /api', () => ({
      body: { history: { noofslots: 0, slots: [] } },
    }));
    await current.browser.get('/api/usenet/sabnzbd');
    expect(current.app.cache.store.get(recentHistoryKey('sabnzbd'))).toBeUndefined();
  });

  it('historique paginé (50 par page), page ramenée', async () => {
    const current = await open();
    current.upstream.nzbget.on('POST /jsonrpc#history', {
      body: {
        result: Array.from({ length: 60 }, (_, i) => ({
          NZBID: i + 1,
          Name: `N${i}`,
          Status: 'SUCCESS/ALL',
        })),
      },
    });
    const history = (
      await current.browser.get('/api/usenet/nzbget/history?page=9')
    ).json<UsenetHistory>();
    expect(history).toMatchObject({ page: 2, totalPages: 2, total: 60 });
    expect(history.items).toHaveLength(10);
    expect(current.upstream.nzbget.calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from('nz:pw').toString('base64')}`,
    );
  });

  it('actions : pause, refus → 502 traduit, suppression avec fichiers partiels, vitesse en Mo/s', async () => {
    const current = await open();
    const seen: Record<string, string | null>[] = [];
    current.upstream.sabnzbd.on('GET /api', (call) => {
      seen.push(Object.fromEntries(call.query));
      if (call.query.get('mode') === 'resume') return { body: { status: false, error: 'nope' } };
      if (call.query.get('mode') === 'queue' && call.query.get('name') === 'pause')
        return { body: {} };
      return { body: { status: true } };
    });
    const b = current.browser;
    expect((await b.post('/api/usenet/sabnzbd/pause')).json()).toEqual({ ok: true });
    const refused = await b.post('/api/usenet/sabnzbd/resume');
    expect(refused.statusCode).toBe(502);
    expect(refused.json()).toMatchObject({ message: 'usenet.api.action_failed' });
    // Action sans drapeau `status` : pas un succès.
    expect((await b.post('/api/usenet/sabnzbd/item/x/pause')).statusCode).toBe(502);
    expect((await b.post('/api/usenet/sabnzbd/item/SAB_1/delete')).statusCode).toBe(200);
    expect(seen.at(-1)).toMatchObject({
      mode: 'queue',
      name: 'delete',
      value: 'SAB_1',
      del_files: '1',
    });
    expect((await b.post('/api/usenet/sabnzbd/speed-limit', { mbps: 2 })).statusCode).toBe(200);
    expect(seen.at(-1)).toMatchObject({ mode: 'config', name: 'speedlimit', value: '2048K' });
    expect((await b.post('/api/usenet/sabnzbd/item/bad id/pause')).statusCode).toBe(400);
  });

  it('ajout : URL requise, garde SSRF, transmise au client ; fichiers', async () => {
    const current = await open();
    current.upstream.nzbget.on('POST /jsonrpc#append', { body: { result: 12 } });
    const b = current.browser;
    expect((await b.post('/api/usenet/nzbget/add', { url: ' ' })).json()).toMatchObject({
      message: 'usenet.api.add_no_url',
    });
    expect(
      (await b.post('/api/usenet/nzbget/add', { url: 'file:///etc/passwd' })).json(),
    ).toMatchObject({
      message: 'usenet.api.add_bad_url',
    });
    expect(
      (
        await b.post('/api/usenet/nzbget/add', {
          url: 'https://indexer.example/a.nzb',
          category: 'tv',
        })
      ).statusCode,
    ).toBe(200);
    expect(current.upstream.nzbget.callsTo('POST /jsonrpc#append')[0]?.body).toMatchObject({
      params: ['', 'https://indexer.example/a.nzb', 'tv', 0, false, false, '', 0, 'SCORE'],
    });
    expect(
      (
        await b.post('/api/usenet/nzbget/add-file', { files: [{ name: 'x.nzb', content: '' }] })
      ).json(),
    ).toMatchObject({
      message: 'usenet.api.add_no_file',
    });
    const file = await b.post('/api/usenet/nzbget/add-file', {
      files: [{ name: 'dir/x.nzb', content: Buffer.from('<nzb/>').toString('base64') }],
    });
    expect(file.statusCode).toBe(200);
    const second = current.upstream.nzbget.callsTo('POST /jsonrpc#append')[1]?.body as {
      params: unknown[];
    };
    expect(second.params.slice(0, 2)).toEqual(['x.nzb', Buffer.from('<nzb/>').toString('base64')]);
  });

  it('actions groupées : chaque id, `ok` faux si l’un échoue, ids requis', async () => {
    const current = await open();
    current.upstream.nzbget.on('POST /jsonrpc#editqueue', (call) => {
      const params = (call.body as { params: unknown[] }).params;
      return { body: { result: (params[3] as number[])[0] !== 2 } };
    });
    const response = (
      await current.browser.post('/api/usenet/nzbget/bulk/delete', { ids: ['1', 2, '3'] })
    ).json<unknown>();
    expect(response).toEqual({ ok: false, count: 2 });
    const first = current.upstream.nzbget.callsTo('POST /jsonrpc#editqueue')[0]?.body as {
      params: unknown[];
    };
    expect(first.params).toEqual(['GroupFinalDelete', 0, '', [1]]);
    expect(
      (await current.browser.post('/api/usenet/nzbget/bulk/pause', { ids: [] })).statusCode,
    ).toBe(400);
  });
});
