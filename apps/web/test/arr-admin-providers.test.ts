// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration Radarr/Sonarr (P3b.3) : ressources à schéma (familles,
// options, déclencheurs, ressource à enregistrer) et vues montées
// (indexeurs, notifications Sonarr, listes d'import, métadonnées, exclusions).

import type { Provider } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { VSelect } from 'vuetify/components';
import { setLocale } from '../src/app/plugins/i18n';
import {
  activeTriggers,
  optionValues,
  presentOptions,
  providerPayload,
  triggerKeys,
} from '../src/features/arr-admin/providers';
import { settle } from './helpers';
import { adminApi, cleanupAdmin, click, mountAdmin, type } from './arr-admin-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupAdmin);

const newznab: Provider = {
  implementation: 'Newznab',
  implementationName: 'Newznab',
  configContract: 'NewznabSettings',
  enableRss: true,
  enableAutomaticSearch: true,
  enableInteractiveSearch: true,
  priority: 25,
  protocol: 'usenet',
  tags: [],
  presets: [{ name: 'preset' }],
  fields: [
    { name: 'baseUrl', label: 'URL', type: 'textbox', value: '' },
    { name: 'apiKey', label: 'API Key', type: 'textbox', privacy: 'apiKey', value: '' },
    { name: 'categories', label: 'Categories', type: 'select', value: [2000, 2040] },
  ],
};

describe('ressources à schéma', () => {
  it('options de la famille présentes dans le modèle', () => {
    expect(presentOptions('indexers', newznab).map((option) => option.key)).toEqual([
      'enableRss',
      'enableAutomaticSearch',
      'enableInteractiveSearch',
      'priority',
    ]);
    expect(presentOptions('downloadClients', newznab).map((option) => option.key)).toEqual([
      'priority',
    ]);
    expect(
      optionValues(presentOptions('importLists', { enabled: false, qualityProfileId: 3 }), {
        enabled: false,
        qualityProfileId: 3,
      }),
    ).toEqual({
      enabled: false,
      qualityProfileId: 3,
    });
  });

  it('déclencheurs : `supportsOn…` du modèle (Sonarr compris), actifs de la ressource', () => {
    const sonarr: Provider = {
      supportsOnGrab: true,
      supportsOnSeriesAdd: true,
      supportsOnRename: false,
      includeHealthWarnings: false,
      onGrab: true,
      onSeriesAdd: false,
    };
    expect(triggerKeys(sonarr)).toEqual(['onGrab', 'onSeriesAdd', 'includeHealthWarnings']);
    expect(activeTriggers(sonarr)).toEqual(['onGrab']);
  });

  it('ressource à enregistrer : base gardée sans modèles prédéfinis, champs complets', () => {
    const payload = providerPayload(
      newznab,
      newznab,
      {
        name: ' Geek ',
        values: { baseUrl: 'https://geek' },
        tags: [2],
        options: { priority: 10 },
        triggers: {},
      },
      null,
    );
    expect(payload).toMatchObject({
      name: 'Geek',
      protocol: 'usenet',
      priority: 10,
      tags: [2],
      configContract: 'NewznabSettings',
    });
    expect(payload.presets).toBeUndefined();
    expect(payload.fields).toEqual([
      { name: 'baseUrl', value: 'https://geek' },
      { name: 'apiKey', value: '' },
      { name: 'categories', value: [2000, 2040] },
    ]);
  });
});

describe('vues', () => {
  it('indexeurs : ajout par modèle (nom pré-rempli), test, enregistrement', async () => {
    let indexers: Provider[] = [];
    const { wrapper, fetch } = await mountAdmin('/medias/radarr/radarr/indexeurs', {
      [`GET ${adminApi('radarr', '/indexeurs')}`]: () => ({ body: indexers }),
      [`GET ${adminApi('radarr', '/indexeurs/schema')}`]: () => ({ body: [newznab] }),
      [`GET ${adminApi('radarr', '/tags')}`]: () => ({ body: [{ id: 2, label: 'hd', usage: 0 }] }),
      [`POST ${adminApi('radarr', '/indexeurs/tester')}`]: () => ({
        body: { ok: false, message: 'Invalid API key' },
      }),
      [`POST ${adminApi('radarr', '/indexeurs/ajouter')}`]: () => {
        indexers = [{ ...newznab, id: 4, name: 'Newznab' }];
        return { body: indexers[0] };
      },
    });
    expect(document.querySelector('[data-test="arr-admin-title"]')?.textContent).toBe('Indexers');
    click('[data-test="provider-add"]');
    await settle();
    // Choix du modèle : piloté par le composant (le menu ne s'ouvre pas sous jsdom).
    const typeSelect = wrapper
      .findAllComponents(VSelect)
      .find((select) => select.attributes('data-test') === 'provider-type');
    typeSelect?.vm.$emit('update:modelValue', 0);
    await settle();
    expect(
      document.querySelector<HTMLInputElement>('[data-test="provider-name"] input')?.value,
    ).toBe('Newznab');
    expect(document.querySelector('[data-test="provider-option-enableRss"]')).not.toBeNull();
    type('[data-test="provider-field-baseUrl"]', 'https://geek');
    await settle();
    click('[data-test="provider-test"]');
    await settle();
    expect(document.querySelector('[data-test="provider-test-result"]')?.textContent).toContain(
      'Invalid API key',
    );
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    const sent = fetch.calls.find((call) => call.url.endsWith('/indexeurs/ajouter'))
      ?.body as Provider;
    expect(sent).toMatchObject({
      name: 'Newznab',
      implementation: 'Newznab',
      enableRss: true,
      priority: 25,
    });
    expect(sent.presets).toBeUndefined();
    expect(sent.fields?.[0]).toEqual({ name: 'baseUrl', value: 'https://geek' });
    expect(document.querySelectorAll('[data-test="provider-row"]')).toHaveLength(1);
  });

  it('notifications (Sonarr) : déclencheurs propres à Sonarr, test par id', async () => {
    const discord: Provider = {
      id: 3,
      name: 'Discord',
      implementation: 'Discord',
      implementationName: 'Discord',
      configContract: 'DiscordSettings',
      supportsOnGrab: true,
      supportsOnSeriesAdd: true,
      onGrab: true,
      onSeriesAdd: true,
      includeHealthWarnings: false,
      tags: [],
      fields: [{ name: 'webHookUrl', label: 'Webhook URL', type: 'url', value: 'https://discord' }],
    };
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/notifications', {
      [`GET ${adminApi('sonarr', '/notifications')}`]: () => ({ body: [discord] }),
      [`GET ${adminApi('sonarr', '/tags')}`]: () => ({ body: [] }),
      [`POST ${adminApi('sonarr', '/notifications/3/tester')}`]: () => ({
        body: { ok: true, message: null },
      }),
      [`POST ${adminApi('sonarr', '/notifications/3/modifier')}`]: () => ({ body: discord }),
    });
    const row = document.querySelector('[data-test="provider-row"]');
    expect(row?.textContent).toContain('Series added');
    click('[data-test="provider-row-test"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toContain(
      'Discord',
    );
    click('[data-test="provider-edit"]');
    await settle();
    expect(document.querySelector('[data-test="provider-trigger-onSeriesAdd"]')).not.toBeNull();
    expect(document.querySelector('[data-test="provider-trigger-onMovieAdded"]')).toBeNull();
    type('[data-test="provider-field-webHookUrl"]', 'https://discord/new');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    const saved = fetch.calls.find((call) => call.url.endsWith('/notifications/3/modifier'))
      ?.body as Provider;
    expect(saved).toMatchObject({
      id: 3,
      name: 'Discord',
      onGrab: true,
      onSeriesAdd: true,
      includeHealthWarnings: false,
    });
    expect(saved.fields).toEqual([{ name: 'webHookUrl', value: 'https://discord/new' }]);
  });

  it('listes d’import : nom du profil de qualité, dossier racine', async () => {
    await mountAdmin('/medias/radarr/radarr/listes-import', {
      [`GET ${adminApi('radarr', '/listes-import')}`]: () => ({
        body: [
          {
            id: 1,
            name: 'Trakt',
            implementation: 'TraktList',
            enabled: true,
            qualityProfileId: 4,
            rootFolderPath: '/movies',
            fields: [],
          },
        ],
      }),
      [`GET ${adminApi('radarr', '/tags')}`]: () => ({ body: [] }),
      'GET /api/medias/radarr/films/quality-profiles': () => ({
        body: [{ id: 4, name: 'HD-1080p' }],
      }),
      'GET /api/medias/radarr/films/root-folders': () => ({ body: [] }),
    });
    const row = document.querySelector('[data-test="provider-row"]')?.textContent ?? '';
    expect(row).toContain('HD-1080p');
    expect(row).toContain('/movies');
    expect(document.querySelector('[data-test="provider-row-test"]')).toBeNull();
  });

  it('métadonnées : pas d’ajout, bascule « Actif » avec la ressource complète', async () => {
    const kodi: Provider = {
      id: 1,
      name: 'Kodi',
      implementation: 'XbmcMetadata',
      configContract: 'XbmcMetadataSettings',
      enable: false,
      tags: [],
      fields: [{ name: 'movieMetadata', type: 'checkbox', value: true }],
    };
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/metadata', {
      [`GET ${adminApi('sonarr', '/metadata')}`]: () => ({ body: [kodi] }),
      [`GET ${adminApi('sonarr', '/tags')}`]: () => ({ body: [] }),
      [`POST ${adminApi('sonarr', '/metadata/1/modifier')}`]: () => ({
        body: { ...kodi, enable: true },
      }),
    });
    expect(document.querySelector('[data-test="provider-add"]')).toBeNull();
    click('[data-test="provider-toggle"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/metadata/1/modifier'))?.body,
    ).toMatchObject({
      id: 1,
      name: 'Kodi',
      enable: true,
      fields: [{ name: 'movieMetadata', value: true }],
    });
  });

  it('exclusions : ajout, tout cocher puis suppression groupée confirmée', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/exclusions', {
      [`GET ${adminApi('radarr', '/exclusions')}`]: () => ({
        body: {
          records: [
            { id: 1, externalId: 603, title: 'The Matrix', year: 1999 },
            { id: 2, externalId: 604, title: 'Reloaded', year: 2003 },
          ],
          totalRecords: 2,
          page: 1,
          pageSize: 50,
        },
      }),
      [`POST ${adminApi('radarr', '/exclusions/ajouter')}`]: () => ({
        body: { id: 3, externalId: 605, title: 'Revolutions', year: 2003 },
      }),
      [`POST ${adminApi('radarr', '/exclusions/bulk-supprimer')}`]: () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="exclusion-row"]')).toHaveLength(2);
    type('[data-test="exclusion-id"]', '605');
    type('[data-test="exclusion-title"]', 'Revolutions');
    await settle();
    click('[data-test="exclusion-add"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/exclusions/ajouter'))?.body).toEqual({
      externalId: 605,
      title: 'Revolutions',
      year: 0,
    });
    click('[data-test="exclusions-check-all"] input');
    await settle();
    click('[data-test="exclusions-bulk-delete"]');
    await settle();
    click('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/bulk-supprimer'))?.body).toEqual({
      ids: [1, 2],
    });
  });
});
