// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `HealthServiceTest` (diagnostic) et de `HealthServiceDiagnoseTest`.

import type { ServiceId } from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { ServiceHealthCache } from '../../../src/integrations/http';
import {
  diagnose,
  diagnoseFromResponse,
  mergeOverrides,
  probeFor,
  type ProbeResponse,
} from '../../../src/modules/services/diagnose';
import { createTestDatabase } from '../../helpers';

const none = { url: '', apiKey: '', user: '', password: '' };

describe('diagnoseFromResponse', () => {
  const cases: [string, ProbeResponse, ServiceId, string, boolean][] = [
    [
      'erreur réseau',
      { http: null, body: null, err: 'Could not resolve host' },
      'radarr',
      'network',
      false,
    ],
    ['200', { http: 200, body: '{}', err: '' }, 'radarr', 'ok', true],
    ['204', { http: 204, body: '', err: '' }, 'sonarr', 'ok', true],
    ['401', { http: 401, body: '', err: '' }, 'radarr', 'auth', false],
    ['403', { http: 403, body: 'banned', err: '' }, 'qbittorrent', 'forbidden', false],
    ['404', { http: 404, body: '', err: '' }, 'seerr', 'not_found', false],
    ['500', { http: 500, body: '', err: '' }, 'tmdb', 'server_error', false],
    ['502', { http: 502, body: '', err: '' }, 'sonarr', 'server_error', false],
    [
      'qBittorrent « Fails. »',
      { http: 200, body: 'Fails.', err: '' },
      'qbittorrent',
      'auth',
      false,
    ],
    ['qBittorrent « Ok. »', { http: 200, body: 'Ok.', err: '' }, 'qbittorrent', 'ok', true],
    ['418', { http: 418, body: '', err: '' }, 'radarr', 'unknown', false],
    [
      'SABnzbd hôte refusé',
      { http: 403, body: 'Access denied - Hostname verification failed', err: '' },
      'sabnzbd',
      'host_whitelist',
      false,
    ],
    [
      'SABnzbd mauvaise clé',
      { http: 403, body: 'API Key Incorrect', err: '' },
      'sabnzbd',
      'auth',
      false,
    ],
    ['SABnzbd sain', { http: 200, body: '{"version":"5.0.3"}', err: '' }, 'sabnzbd', 'ok', true],
    [
      'NZBGet refusé',
      { http: null, body: null, err: 'Connection refused' },
      'nzbget',
      'network',
      false,
    ],
    [
      'Transmission 409',
      { http: 409, body: '{"result":"Conflict"}', err: '' },
      'transmission',
      'ok',
      true,
    ],
    ['Transmission 401', { http: 401, body: '', err: '' }, 'transmission', 'auth', false],
    [
      'Transmission 200',
      { http: 200, body: '{"result":"success"}', err: '' },
      'transmission',
      'ok',
      true,
    ],
    [
      'Deluge mauvais mot de passe',
      { http: 200, body: '{"result": false, "error": null, "id": 1}', err: '' },
      'deluge',
      'auth',
      false,
    ],
    [
      'Deluge erreur RPC',
      {
        http: 200,
        body: '{"result": null, "error": {"message": "Not authenticated"}, "id": 1}',
        err: '',
      },
      'deluge',
      'auth',
      false,
    ],
    [
      'Deluge succès',
      { http: 200, body: '{"result": true, "error": null, "id": 1}', err: '' },
      'deluge',
      'ok',
      true,
    ],
    ['Deluge illisible', { http: 200, body: '<html>', err: '' }, 'deluge', 'unknown', false],
    [
      'Tautulli clé invalide',
      { http: 200, body: '{"response":{"result":"error","message":"Invalid apikey"}}', err: '' },
      'tautulli',
      'auth',
      false,
    ],
    [
      'Tautulli succès',
      { http: 200, body: '{"response":{"result":"success"}}', err: '' },
      'tautulli',
      'ok',
      true,
    ],
  ];

  it.each(cases)('%s', (_label, response, service, category, ok) => {
    const result = diagnoseFromResponse(response, service);
    expect(result.category).toBe(category);
    expect(result.ok).toBe(ok);
    // Statut conservé, `null` sur erreur réseau.
    expect(result.http).toBe(response.err === '' ? response.http : null);
  });
});

describe('probeFor', () => {
  it('*arr : /system/status avec X-Api-Key', () => {
    expect(probeFor('radarr', { ...none, url: 'http://r:7878/', apiKey: 'k' })).toEqual({
      baseUrl: 'http://r:7878',
      request: {
        path: '/api/v3/system/status',
        headers: { 'x-api-key': 'k', accept: 'application/json' },
      },
    });
    expect(probeFor('prowlarr', { ...none, url: 'http://p', apiKey: 'k' })?.request.path).toBe(
      '/api/v1/system/status',
    );
    expect(probeFor('seerr', { ...none, url: 'http://s', apiKey: 'k' })?.request.path).toBe(
      '/api/v1/settings/about',
    );
    expect(probeFor('radarr', { ...none, url: 'http://r' })).toBeNull();
  });

  it('SABnzbd sonde mode=queue (valide la clé), jamais mode=version', () => {
    expect(
      probeFor('sabnzbd', { ...none, url: 'http://sab:8080', apiKey: 'k' })?.request.query,
    ).toEqual({
      mode: 'queue',
      output: 'json',
      apikey: 'k',
    });
    expect(probeFor('sabnzbd', { ...none, url: 'http://sab:8080' })).toBeNull();
  });

  it('Emby : /emby/System/Info authentifié, clé en en-tête et pas dans l’URL', () => {
    const probe = probeFor('emby', { ...none, url: 'http://emby:8096', apiKey: 'k3y' });
    expect(probe?.baseUrl).toBe('http://emby:8096/emby');
    expect(probe?.request.path).toBe('/System/Info');
    expect(probe?.request.headers?.['x-emby-token']).toBe('k3y');
    expect(
      probeFor('emby', { ...none, url: 'http://emby:8096/emby/', apiKey: 'k3y' })?.baseUrl,
    ).toBe('http://emby:8096/emby');
    expect(probeFor('emby', { ...none, url: 'http://emby:8096' })).toBeNull();
  });

  it('qBittorrent : connexion avec identifiants, sinon app/version (proxy)', () => {
    expect(
      probeFor('qbittorrent', { ...none, url: 'http://q', user: 'u', password: 'p' })?.request,
    ).toMatchObject({
      method: 'POST',
      path: '/api/v2/auth/login',
      form: { username: 'u', password: 'p' },
    });
    expect(probeFor('qbittorrent', { ...none, url: 'http://q', user: 'u' })?.request.path).toBe(
      '/api/v2/app/version',
    );
  });

  it('Deluge : auth.login, ou web.get_config sans mot de passe', () => {
    expect(probeFor('deluge', { ...none, url: 'http://d', password: 'p' })?.request.json).toEqual({
      method: 'auth.login',
      params: ['p'],
      id: 1,
    });
    expect(probeFor('deluge', { ...none, url: 'http://d' })?.request.json).toMatchObject({
      method: 'web.get_config',
    });
  });

  it('TMDB : clé seule ; NZBGet et Transmission : URL seule ; Gluetun : pas de sonde', () => {
    expect(probeFor('tmdb', { ...none, apiKey: 'k' })?.request.query).toEqual({ api_key: 'k' });
    expect(probeFor('nzbget', { ...none, url: 'http://n' })?.request.headers).toEqual({});
    expect(probeFor('transmission', { ...none, url: 'http://t' })).not.toBeNull();
    expect(
      probeFor('tracearr', { ...none, url: 'http://t', apiKey: 'trr' })?.request.headers
        ?.authorization,
    ).toBe('Bearer trr');
    expect(probeFor('gluetun', { ...none, url: 'http://g' })).toBeNull();
  });
});

describe('diagnose', () => {
  it('diagnostic passif court-circuité par le disjoncteur', async () => {
    const database = await createTestDatabase();
    const health = new ServiceHealthCache();
    health.markDown('sabnzbd');
    expect((await diagnose(database.db, 'sabnzbd', null, { health })).category).toBe('network');
    // « Tester » ignore le disjoncteur : rien d'enregistré → non configuré.
    expect((await diagnose(database.db, 'sabnzbd', {}, { health })).category).toBe('unconfigured');
    database.close();
  });

  it('une valeur vide du formulaire retombe sur la valeur enregistrée', () => {
    expect(
      mergeOverrides(
        { url: 'http://a', apiKey: 'saved', user: 'u', password: 'p' },
        { url: ' http://b ', apiKey: '' },
      ),
    ).toEqual({ url: 'http://b', apiKey: 'saved', user: 'u', password: 'p' });
  });

  it('URL de lien local refusée sans connexion → network', async () => {
    const database = await createTestDatabase();
    const result = await diagnose(
      database.db,
      'prowlarr',
      { url: 'http://169.254.169.254', apiKey: 'k' },
      { health: new ServiceHealthCache() },
    );
    expect(result).toEqual({ ok: false, category: 'network', http: null });
    database.close();
  });
});
