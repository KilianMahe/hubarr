// SPDX-License-Identifier: AGPL-3.0-or-later
// Mise en place des E2E : installation de Hubarr sur une base neuve (langue,
// admin), instances Radarr « Films » et Sonarr « Séries », Prowlarr, Bazarr et
// les clients de téléchargement branchés sur les faux services, session de l'admin enregistrée pour tous les tests.

import { mkdir } from 'node:fs/promises';
import { request, type APIRequestContext } from '@playwright/test';
import {
  ACTIVITY,
  ADMIN,
  BAZARR_KEY,
  DOWNLOADS,
  MOCKS_URL,
  PROWLARR_KEY,
  RADARR_KEY,
  SEERR_KEY,
  SONARR_KEY,
  TMDB_KEY,
} from './specs/env';

async function csrf(api: APIRequestContext): Promise<string> {
  const response = await api.get('/api/auth/csrf');
  return ((await response.json()) as { token: string }).token;
}

async function post(api: APIRequestContext, url: string, token: string, data: object) {
  const response = await api.post(url, { data, headers: { 'x-csrf-token': token } });
  const text = await response.text();
  if (!response.ok()) throw new Error(`${url} : ${response.status()} ${text}`);
  // Certaines routes répondent 204 sans corps (`/api/setup/locale`).
  return (text === '' ? {} : JSON.parse(text)) as Record<string, unknown>;
}

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://e2e-app:7070',
  });
  let token = await csrf(api);
  await post(api, '/api/setup/locale', token, { locale: 'fr' });
  const admin = await post(api, '/api/setup/admin', token, {
    email: ADMIN.email,
    displayName: 'Admin E2E',
    password: ADMIN.password,
    passwordConfirm: ADMIN.password,
  });
  token = typeof admin.csrfToken === 'string' ? admin.csrfToken : await csrf(api);
  await post(api, '/api/admin/instances/radarr/add', token, {
    name: 'Films',
    url: `${MOCKS_URL}/radarr`,
    apiKey: RADARR_KEY,
  });
  await post(api, '/api/admin/instances/sonarr/add', token, {
    name: 'Séries',
    url: `${MOCKS_URL}/sonarr`,
    apiKey: SONARR_KEY,
  });
  await post(api, '/api/admin/settings', token, {
    services: {
      prowlarr: { url: `${MOCKS_URL}/prowlarr`, apiKey: PROWLARR_KEY },
      bazarr: { url: `${MOCKS_URL}/bazarr`, apiKey: BAZARR_KEY },
      qbittorrent: { url: `${MOCKS_URL}/qbittorrent`, ...DOWNLOADS.qbittorrent },
      transmission: { url: `${MOCKS_URL}/transmission-mock`, ...DOWNLOADS.transmission },
      deluge: { url: `${MOCKS_URL}/deluge`, ...DOWNLOADS.deluge },
      sabnzbd: { url: `${MOCKS_URL}/sabnzbd`, ...DOWNLOADS.sabnzbd },
      nzbget: { url: `${MOCKS_URL}/nzbget`, ...DOWNLOADS.nzbget },
      gluetun: { url: `${MOCKS_URL}/gluetun`, ...DOWNLOADS.gluetun },
      tautulli: { url: `${MOCKS_URL}/tautulli`, ...ACTIVITY.tautulli },
      tracearr: { url: `${MOCKS_URL}/tracearr`, ...ACTIVITY.tracearr },
      emby: { url: `${MOCKS_URL}/emby-mock`, ...ACTIVITY.emby },
      seerr: { url: `${MOCKS_URL}/seerr`, apiKey: SEERR_KEY },
      tmdb: { apiKey: TMDB_KEY },
    },
  });
  await mkdir('.auth', { recursive: true });
  await api.storageState({ path: '.auth/admin.json' });
  await api.dispose();
}
