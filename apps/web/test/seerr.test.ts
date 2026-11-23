// SPDX-License-Identifier: AGPL-3.0-or-later
// Seerr (P3f) : arbre des permissions, affiches TMDB ; pages montées
// (demandes et approbation, utilisateurs, fiche et permissions, services
// avec clé masquée, tâches).

import type { SeerrRequest, SeerrUserDetail } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  permissionState,
  text,
  tmdbImage,
  togglePermission,
} from '../src/features/seerr/seerr-api';
import { click } from './arr-admin-fixtures';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('logique', () => {
  it('permissions : admin, parent, prérequis, 4K', () => {
    expect(permissionState(16, 2, false)).toEqual({ checked: true, disabled: true, hidden: false });
    expect(permissionState(8192, 16, false)).toMatchObject({ checked: true, disabled: true });
    expect(permissionState(128, 0, false)).toMatchObject({ checked: false, disabled: true });
    expect(permissionState(128, 32, false)).toMatchObject({ checked: false, disabled: false });
    expect(permissionState(1024, 32, false).hidden).toBe(true);
    expect(permissionState(1024, 32, true).hidden).toBe(false);
    expect(togglePermission(32, 32)).toBe(0);
    expect(togglePermission(0, 128)).toBe(128);
  });

  it('affiches TMDB et texte tolérant', () => {
    expect(tmdbImage('/p.jpg')).toBe('https://image.tmdb.org/t/p/w185/p.jpg');
    expect(tmdbImage('http://evil/x')).toBeNull();
    expect(text(null, '', 3)).toBe('3');
    expect(text({})).toBe('');
  });
});

const request = (id: number, overrides: Partial<SeerrRequest> = {}): SeerrRequest => ({
  id,
  status: 1,
  type: 'movie',
  tmdb: {
    title: `Film ${id}`,
    overview: '',
    posterPath: null,
    backdropPath: null,
    releaseDate: '2019-01-01',
    voteAverage: null,
    genres: [],
  },
  displayStatus: 'pending',
  requestedBy: { id: 2, displayName: 'bob' },
  ...overrides,
});

async function mount(path: string, routes: Parameters<typeof fakeFetch>[0]) {
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { seerr: true },
        instances: { radarr: [], sonarr: [] },
        ok: 1,
        total: 1,
        timestamp: '2026-11-21T12:00:00Z',
      },
    }),
    ...routes,
  });
  const services = {
    states: { seerr: { configured: true, disabled: false } },
    instances: { radarr: [], sonarr: [] },
    sidebar: {},
  };
  const app = await mountApp(path, bootstrapOf({ user: ADMIN, services }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

describe('pages', () => {
  it('demandes : compteurs, statut, approbation', async () => {
    const { fetch } = await mount('/jellyseerr', {
      'GET /api/jellyseerr': () => ({
        body: {
          requests: [request(1), request(2, { displayStatus: 'available' })],
          pageInfo: { pages: 1, results: 2, page: 1 },
          counts: { total: 2, pending: 1 },
          status: null,
        },
      }),
      'POST /api/jellyseerr/request/1/approve': () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="seerr-request"]')).toHaveLength(2);
    expect(document.querySelector('[data-test="seerr-counts"]')?.textContent).toContain('2');
    expect(document.querySelectorAll('[data-test="seerr-approve"]')).toHaveLength(1);
    click('[data-test="seerr-approve"]');
    await settle();
    expect(fetch.calls.some((c) => c.url === '/api/jellyseerr/request/1/approve')).toBe(true);
  });

  it('modification d’une demande : étiquettes du serveur envoyées à Seerr (V11)', async () => {
    const { fetch } = await mount('/jellyseerr', {
      'GET /api/jellyseerr': () => ({
        body: {
          requests: [request(1, { tags: [1], serverId: 0, profileId: 4, rootFolder: '/movies' })],
          pageInfo: { pages: 1, results: 1, page: 1 },
          counts: { total: 1, pending: 1 },
          status: null,
        },
      }),
      'GET /api/jellyseerr/service/radarr': () => ({
        body: {
          profiles: [{ id: 4, name: 'HD' }],
          rootFolders: [{ id: 1, path: '/movies' }],
          tags: [
            { id: 1, label: '4k' },
            { id: 2, label: 'enfants' },
          ],
        },
      }),
      'GET /api/jellyseerr/users': () => ({ body: [] }),
      'POST /api/jellyseerr/request/1/edit': () => ({ body: { ok: true, data: {} } }),
    });
    click('[data-test="seerr-edit"]');
    await settle();
    expect(document.querySelector('[data-test="seerr-edit-tags"]')?.textContent).toContain('4k');
    click('[data-test="seerr-edit-save"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/jellyseerr/request/1/edit');
    expect(call?.body).toMatchObject({ mediaType: 'movie', profileId: 4, tags: [1] });
  });

  it('utilisateurs : liste, création d’un utilisateur local', async () => {
    const { fetch } = await mount('/jellyseerr/utilisateurs', {
      'GET /api/jellyseerr/utilisateurs': () => ({
        body: {
          users: [
            { id: 1, displayName: 'owner', email: 'o@x', permissions: 2, role: 'admin' },
            {
              id: 4,
              displayName: 'carol',
              email: 'c@x',
              permissions: 32,
              role: 'user',
              requestCount: 3,
            },
          ],
          counts: {},
        },
      }),
      'POST /api/jellyseerr/utilisateurs/create': () => ({ body: { ok: true, data: {} } }),
    });
    expect(document.querySelectorAll('[data-test="seerr-user-row"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-test="seerr-user-delete"]')).toHaveLength(1);
    click('[data-test="seerr-user-create"]');
    await settle();
    const email = document.querySelector<HTMLInputElement>(
      '[data-test="seerr-create-email"] input',
    );
    const password = document.querySelector<HTMLInputElement>(
      '[data-test="seerr-create-password"] input',
    );
    if (!email || !password) throw new Error('champs absents');
    email.value = 'new@x';
    email.dispatchEvent(new Event('input'));
    password.value = 'longpassword';
    password.dispatchEvent(new Event('input'));
    click('[data-test="seerr-create-submit"]');
    await settle();
    expect(fetch.calls.find((c) => c.url === '/api/jellyseerr/utilisateurs/create')?.body).toEqual({
      email: 'new@x',
      password: 'longpassword',
    });
  });

  it('fiche : permissions basculées puis enregistrées', async () => {
    const detail: SeerrUserDetail = {
      user: { id: 4, displayName: 'carol', permissions: 32, role: 'user' },
      quota: null,
      settings: {},
      notifications: {},
      requests: [],
      defaultPermissions: 32,
      has4k: false,
      languages: [],
      regions: [],
    };
    const { fetch } = await mount('/jellyseerr/utilisateurs/4', {
      'GET /api/jellyseerr/utilisateurs/4': () => ({ body: detail }),
      'POST /api/jellyseerr/utilisateurs/4/permissions': () => ({ body: { ok: true } }),
    });
    click('[data-test="seerr-tab-perms"]');
    await settle();
    expect(document.querySelector('[data-test="seerr-perm-1024"]')).toBeNull();
    click('[data-test="seerr-perm-128"] input');
    await settle();
    click('[data-test="seerr-perms-save"]');
    await settle();
    expect(
      fetch.calls.find((c) => c.url === '/api/jellyseerr/utilisateurs/4/permissions')?.body,
    ).toEqual({ permissions: 160 });
  });

  it('services : serveur modifié avec la clé masquée', async () => {
    const { fetch } = await mount('/jellyseerr/parametres/services', {
      'GET /api/jellyseerr/parametres/services': () => ({
        body: {
          radarr: [
            {
              id: 1,
              name: 'Radarr',
              hostname: 'radarr',
              port: 7878,
              apiKey: '********',
              isDefault: true,
            },
          ],
          sonarr: [],
          radarrProfiles: {
            '1': { profiles: [{ id: 4, name: 'HD' }], rootFolders: [{ path: '/films' }] },
          },
          sonarrProfiles: {},
          rules: [],
          users: [],
          genres: [],
          languages: [],
        },
      }),
      'POST /api/jellyseerr/parametres/services/radarr/1/save': () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="seerr-server"]')).toHaveLength(1);
    click('[data-test="seerr-server-edit"]');
    await settle();
    click('[data-test="seerr-server-save"]');
    await settle();
    expect(
      fetch.calls.find((c) => c.url === '/api/jellyseerr/parametres/services/radarr/1/save')?.body,
    ).toMatchObject({ name: 'Radarr', apiKey: '********', port: 7878 });
  });

  it('tâches : exécution d’une tâche', async () => {
    const { fetch } = await mount('/jellyseerr/parametres/taches-cache', {
      'GET /api/jellyseerr/parametres/taches-cache': () => ({
        body: {
          jobs: [
            {
              id: 'jellyfin-sync',
              name: 'Jellyfin sync',
              running: false,
              cronSchedule: '0 0 3 * * *',
            },
          ],
          cache: { apiCaches: [] },
        },
      }),
      'POST /api/jellyseerr/job/jellyfin-sync/run': () => ({ body: { ok: true, data: {} } }),
    });
    click('[data-test="seerr-job-run"]');
    await settle();
    expect(fetch.calls.some((c) => c.url === '/api/jellyseerr/job/jellyfin-sync/run')).toBe(true);
  });
});
