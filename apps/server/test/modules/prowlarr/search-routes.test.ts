// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, recherche et grab (P3c.2) : `ProwlarrGrabTest` et
// `ProwlarrSafeInfoUrlTest` portés, normalisation des résultats.

import type { ProwlarrRelease } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { safeInfoUrl } from '../../../src/integrations/prowlarr/normalize';
import { prowlarrEnv, type ProwlarrEnv } from './prowlarr-env';

let env: ProwlarrEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

async function open(): Promise<ProwlarrEnv> {
  env = await prowlarrEnv();
  return env;
}

describe('safeInfoUrl (ProwlarrSafeInfoUrlTest)', () => {
  it('garde http(s), refuse javascript:, data:, relatif au schéma, vide et non-texte', () => {
    expect(safeInfoUrl('javascript:alert(1)')).toBeNull();
    expect(safeInfoUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeInfoUrl('http://tracker.example.com/details?id=1')).toBe(
      'http://tracker.example.com/details?id=1',
    );
    expect(safeInfoUrl('https://tracker.example.com/details?id=1')).toBe(
      'https://tracker.example.com/details?id=1',
    );
    expect(safeInfoUrl('HTTPS://tracker.example.com/details?id=1')).toBe(
      'HTTPS://tracker.example.com/details?id=1',
    );
    expect(safeInfoUrl(null)).toBeNull();
    expect(safeInfoUrl(123)).toBeNull();
    expect(safeInfoUrl({ not: 'a string' })).toBeNull();
    expect(safeInfoUrl('')).toBeNull();
    expect(safeInfoUrl('//tracker.example.com/details?id=1')).toBeNull();
  });
});

describe('recherche (n° 246)', () => {
  it('résultats normalisés, sans lien de téléchargement ; paramètres transmis', async () => {
    const env = await open();
    env.prowlarr.on('GET', '/api/v1/search', [
      {
        guid: 'g1',
        title: 'Dune 2021 1080p',
        size: 2_000_000_000,
        age: 3,
        ageHours: 72,
        indexerId: 2,
        indexer: 'YTS',
        seeders: 50,
        leechers: 4,
        protocol: 'torrent',
        imdbId: 1160419,
        tmdbId: 0,
        categories: [{ id: 2000, name: 'Movies' }],
        downloadUrl: 'http://prowlarr.test:9696/2/download?apikey=prowlarr-key',
        magnetUrl: 'magnet:?xt=urn:btih:abc',
        infoUrl: 'javascript:alert(1)',
        indexerFlags: ['freeleech'],
      },
      { title: 'sans guid' },
    ]);
    const response = await env.browser.get(env.url('/search?q=dune&indexerId=2'));
    expect(response.statusCode).toBe(200);
    const releases = response.json<ProwlarrRelease[]>();
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      guid: 'g1',
      indexerId: 2,
      seeders: 50,
      imdbId: 1160419,
      tmdbId: null,
      infoUrl: null,
      categories: [{ id: 2000, name: 'Movies' }],
      indexerFlags: ['freeleech'],
    });
    expect(response.body).not.toContain('apikey');
    expect(response.body).not.toContain('magnet:');
    const call = env.prowlarr.callsTo('GET', '/api/v1/search')[0];
    expect(call?.query.get('query')).toBe('dune');
    expect(call?.query.get('type')).toBe('search');
    expect(call?.query.get('limit')).toBe('100');
    expect(call?.query.get('indexerIds')).toBe('2');
  });

  it('moins de deux caractères : aucun résultat, Prowlarr non appelé', async () => {
    const env = await open();
    expect((await env.browser.get(env.url('/search?q=%20a%20'))).json()).toEqual([]);
    expect(env.prowlarr.calls).toHaveLength(0);
  });
});

describe('grab (n° 247, ProwlarrGrabTest)', () => {
  it('grab valide transmis à Prowlarr', async () => {
    const env = await open();
    env.prowlarr.on('POST', '/api/v1/search', { id: 42 });
    const response = await env.browser.post(env.url('/grab'), { guid: 'g', indexerId: 3 });
    expect(response.json()).toEqual({ ok: true });
    expect(env.prowlarr.callsTo('POST', '/api/v1/search')[0]?.body).toEqual({
      guid: 'g',
      indexerId: 3,
    });
  });

  it('guid absent ou indexeur nul : 400 sans appeler Prowlarr', async () => {
    const env = await open();
    expect((await env.browser.post(env.url('/grab'), { indexerId: 3 })).statusCode).toBe(400);
    expect((await env.browser.post(env.url('/grab'), { guid: 'g', indexerId: 0 })).statusCode).toBe(
      400,
    );
    expect(env.prowlarr.calls).toHaveLength(0);
  });

  it('grab refusé par Prowlarr : 502 avec son message', async () => {
    const env = await open();
    env.prowlarr.on('POST', '/api/v1/search', { message: 'No download client' }, 500);
    const response = await env.browser.post(env.url('/grab'), { guid: 'g', indexerId: 3 });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ message: 'No download client' });
  });
});
