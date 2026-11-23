// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, intégrations, réglages et système (P3c.3) : logique des familles à
// schéma et pages montées (navigation, applications et profils, général,
// étiquettes, sauvegardes, journaux, historique, statut).

import type { Provider } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  PROWLARR_PROVIDER_FAMILIES,
  filterTemplates,
  initialProviderForm,
  presentTopFields,
  providerSavePayload,
  summaryFields,
} from '../src/features/prowlarr/providers';
import { click, type } from './arr-admin-fixtures';
import { settle } from './helpers';
import { cleanupProwlarr, mountProwlarr } from './prowlarr-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupProwlarr);

const discord: Provider = {
  name: 'Discord',
  implementation: 'Discord',
  implementationName: 'Discord',
  configContract: 'DiscordSettings',
  onGrab: false,
  onHealthIssue: false,
  includeHealthWarnings: false,
  presets: [{}],
  tags: [],
  fields: [
    { name: 'webHookUrl', value: '' },
    { name: 'username', value: 'bot' },
  ],
};

describe('familles à schéma', () => {
  it('champs de niveau ressource présents, formulaire initial, ressource à enregistrer', () => {
    const notifications = PROWLARR_PROVIDER_FAMILIES.notifications;
    expect(presentTopFields(notifications, discord).map((field) => field.key)).toEqual([
      'onGrab',
      'onHealthIssue',
      'includeHealthWarnings',
    ]);
    const form = initialProviderForm(notifications, discord);
    expect(form).toMatchObject({ name: 'Discord', top: { onGrab: false } });
    const payload = providerSavePayload(discord, {
      ...form,
      top: { ...form.top, onGrab: true },
      values: { ...form.values, webHookUrl: 'https://hook' },
    });
    expect(payload).toMatchObject({
      name: 'Discord',
      onGrab: true,
      fields: [
        { name: 'webHookUrl', value: 'https://hook' },
        { name: 'username', value: 'bot' },
      ],
    });
    expect(payload).not.toHaveProperty('presets');
    expect(initialProviderForm(PROWLARR_PROVIDER_FAMILIES.downloadClients, discord).top).toEqual(
      {},
    );
    expect(
      initialProviderForm(PROWLARR_PROVIDER_FAMILIES.downloadClients, {
        ...discord,
        priority: 3,
        enable: false,
      }).top,
    ).toEqual({ priority: 3, enable: false });
  });

  it('catalogue (30 au plus) et champs résumés sans secret', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ ...discord, name: `N${index}` }));
    expect(filterTemplates(many, '')).toHaveLength(30);
    expect(filterTemplates(many, 'n39')).toHaveLength(1);
    expect(
      summaryFields({
        fields: [
          { name: 'host', label: 'Host', value: 'qbit' },
          { name: 'port', value: 8080 },
          { name: 'username', value: '' },
          { name: 'category', privacy: 'password', value: 'x' },
          { name: 'apiKey', value: 'k' },
        ],
      }),
    ).toEqual([
      { label: 'Host', value: 'qbit' },
      { label: 'port', value: '8080' },
    ]);
  });
});

const PROFILES = [
  {
    id: 1,
    name: 'Standard',
    enableRss: true,
    enableAutomaticSearch: true,
    enableInteractiveSearch: true,
    minimumSeeders: 1,
  },
];

describe('pages', () => {
  it('applications : retour aux paramètres, cartes, ajout par modèle, profil enregistré', async () => {
    const { fetch } = await mountProwlarr('/prowlarr/apps', {
      'GET /api/prowlarr/applications': () => ({
        body: [
          {
            id: 1,
            name: 'Radarr',
            implementationName: 'Radarr',
            syncLevel: 'fullSync',
            fields: [],
          },
        ],
      }),
      'GET /api/prowlarr/application/schema': () => ({
        body: [
          {
            implementation: 'Sonarr',
            implementationName: 'Sonarr',
            configContract: 'SonarrSettings',
            syncLevel: 'addOnly',
            tags: [],
            fields: [{ name: 'baseUrl', label: 'URL', value: '' }],
          },
        ],
      }),
      'GET /api/prowlarr/tags': () => ({ body: [] }),
      'GET /api/prowlarr/app-profiles': () => ({ body: PROFILES }),
      'POST /api/prowlarr/application/add': (call) => ({
        body: { ...(call.body as object), id: 2 },
      }),
      'POST /api/prowlarr/app-profile/1/update': (call) => ({
        body: { id: 1, ...(call.body as object) },
      }),
    });
    expect(document.querySelector('[data-test="prowlarr-page-title"]')?.textContent).toContain(
      'Applications',
    );
    // Administration ouverte depuis les paramètres de Hubarr (P5c.4, D140).
    expect(document.querySelector('[data-test="prowlarr-menu-settings"]')).toBeNull();
    expect(document.querySelector('[data-test="settings-back"]')?.getAttribute('href')).toBe(
      '/admin/settings#section-services',
    );
    expect(document.querySelectorAll('[data-test="provider-card"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="provider-card"]')?.textContent).toContain(
      'Full sync',
    );

    click('[data-test="provider-add"]');
    await settle();
    click('[data-test="provider-template"]');
    await settle();
    type('[data-test="provider-field-baseUrl"]', 'http://sonarr:8989');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url === '/api/prowlarr/application/add')?.body,
    ).toMatchObject({
      name: 'Sonarr',
      syncLevel: 'addOnly',
      fields: [{ name: 'baseUrl', value: 'http://sonarr:8989' }],
    });

    click('[data-test="app-profile-edit"]');
    await settle();
    type('[data-test="app-profile-name"]', 'Auto');
    await settle();
    click(
      '[data-test="arr-admin-dialog-save"]',
      document.querySelectorAll('[data-test="arr-admin-dialog-save"]').length - 1,
    );
    await settle();
    expect(
      fetch.calls.find((call) => call.url === '/api/prowlarr/app-profile/1/update')?.body,
    ).toEqual({
      name: 'Auto',
      enableRss: true,
      enableAutomaticSearch: true,
      enableInteractiveSearch: true,
      minimumSeeders: 1,
    });
  });

  it('général : mots de passe différents refusés, modification envoyée sans clé d’API', async () => {
    const { fetch } = await mountProwlarr('/prowlarr/general', {
      'GET /api/prowlarr/general': () => ({
        body: {
          id: 1,
          port: 9696,
          instanceName: 'Prowlarr',
          apiKey: '********',
          password: '********',
        },
      }),
      'POST /api/prowlarr/general/save': (call) => ({ body: { id: 1, ...(call.body as object) } }),
    });
    type('[data-test="config-field-password"]', 'a');
    await settle();
    click('[data-test="config-save"]');
    await settle();
    expect(document.querySelector('[data-test="prowlarr-feedback"]')).not.toBeNull();
    expect(fetch.calls.some((call) => call.url === '/api/prowlarr/general/save')).toBe(false);
    type('[data-test="config-field-password"]', '');
    type('[data-test="config-field-port"]', '9697');
    await settle();
    click('[data-test="config-save"]');
    await settle();
    const body = fetch.calls.find((call) => call.url === '/api/prowlarr/general/save')
      ?.body as Record<string, unknown>;
    expect(body.port).toBe(9697);
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('password');
  });

  it('étiquettes : usage affiché, suppression refusée → « encore utilisé »', async () => {
    await mountProwlarr('/prowlarr/tags-page', {
      'GET /api/prowlarr/tags/detail': () => ({
        body: [
          {
            id: 1,
            label: 'films',
            indexerIds: [1, 2],
            applicationIds: [],
            notificationIds: [],
            indexerProxyIds: [],
          },
        ],
      }),
      'POST /api/prowlarr/tags/1/supprimer': () => ({
        status: 502,
        body: { code: 'UPSTREAM_ERROR', message: 'in use' },
      }),
    });
    expect(document.querySelector('[data-test="tag-row"]')?.textContent).toContain('2');
    click('[data-test="tag-delete"]');
    await settle();
    [...document.querySelectorAll<HTMLElement>('.v-overlay button')].at(-1)?.click();
    await settle();
    expect(document.querySelector('[data-test="prowlarr-feedback"]')?.textContent).toContain(
      'still in use',
    );
  });

  it('sauvegardes : création sans commande à suivre, liste relue', async () => {
    let backups: unknown[] = [];
    const { fetch } = await mountProwlarr('/prowlarr/backups', {
      'GET /api/prowlarr/backups': () => ({ body: backups }),
      'POST /api/prowlarr/sauvegardes/creer': () => {
        backups = [
          { id: 1, name: 'a.zip', type: 'manual', size: 1024, time: '2026-11-21T10:00:00Z' },
        ];
        return { body: { ok: true, cmdId: null } };
      },
    });
    click('[data-test="backup-create"]');
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/prowlarr/sauvegardes/creer')).toBe(true);
    expect(document.querySelectorAll('[data-test="backup-row"]')).toHaveLength(1);
  });

  it('journaux, historique « depuis » et statut', async () => {
    const { fetch, router } = await mountProwlarr('/prowlarr/logs-page?level=warn&page=2', {
      'GET /api/prowlarr/logs': () => ({
        body: {
          records: [{ time: null, level: 'warn', logger: 'X', message: 'Slow', exception: null }],
          totalRecords: 101,
          page: 2,
          pageSize: 100,
        },
      }),
      'GET /api/prowlarr/history/since': () => ({
        body: [
          {
            id: 1,
            indexerId: 1,
            date: null,
            eventType: 'releaseGrabbed',
            successful: true,
            source: 'Radarr',
            query: null,
            queryType: 'movie',
            categories: null,
            queryResults: null,
            elapsedTime: 120,
          },
        ],
      }),
      'GET /api/prowlarr/status': () => ({
        body: {
          version: '3.0.2',
          branch: 'master',
          osName: 'debian',
          osVersion: '12',
          runtimeName: '.NET',
          runtimeVersion: '8',
          startTime: null,
          appData: '/config',
          migrationVersion: 42,
          authentication: 'forms',
          databaseType: 'sqLite',
          databaseVersion: '3',
          isDocker: true,
        },
      }),
      'GET /api/prowlarr/health': () => ({ body: [] }),
    });
    expect(fetch.calls.find((call) => call.url.startsWith('/api/prowlarr/logs'))?.url).toBe(
      '/api/prowlarr/logs?page=2&level=warn',
    );
    expect(document.querySelectorAll('[data-test="log-row"]')).toHaveLength(1);

    await router.push('/prowlarr/historique?since=2026-11-01');
    await settle();
    expect(
      fetch.calls.some((call) => call.url === '/api/prowlarr/history/since?date=2026-11-01'),
    ).toBe(true);
    expect(fetch.calls.some((call) => call.url.startsWith('/api/prowlarr/history?'))).toBe(false);
    expect(document.querySelector('[data-test="history-row"]')?.textContent).toContain('120ms');

    await router.push('/prowlarr/systeme');
    await settle();
    expect(document.querySelector('[data-test="prowlarr-system-info"]')?.textContent).toContain(
      '3.0.2',
    );
    expect(document.querySelector('[data-test="prowlarr-system-health"]')?.textContent).toContain(
      'OK',
    );
  });
});
