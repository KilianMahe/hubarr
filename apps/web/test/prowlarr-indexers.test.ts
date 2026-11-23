// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, indexeurs (P3c.1) : logique (filtre, catalogue, formulaire,
// capacités) et page montée (tuiles, liste, bascule, test, suppression,
// test global, ajout depuis le catalogue, masse).

import type { Provider } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fillLegacy } from '../src/app/legacy-template';
import { setLocale } from '../src/app/plugins/i18n';
import { infoText } from '../src/features/arr-admin/schema-form';
import {
  capabilityRows,
  catalogOptions,
  categoryRows,
  filterCatalog,
  filterIndexers,
  indexerHealth,
  indexerLinks,
  indexerPayload,
  initialIndexerForm,
  withBaseUrlOptions,
  withIndexerEnabled,
  EMPTY_CATALOG_FILTERS,
} from '../src/features/prowlarr/indexers';
import { click, type } from './arr-admin-fixtures';
import { settle } from './helpers';
import { cleanupProwlarr, indexer, mountProwlarr, overview } from './prowlarr-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupProwlarr);

const definition = (name: string, overrides: Record<string, unknown> = {}): Provider => ({
  name,
  definitionName: name.toLowerCase(),
  implementation: 'Cardigann',
  implementationName: 'Cardigann',
  configContract: 'CardigannSettings',
  protocol: 'torrent',
  privacy: 'public',
  language: 'en-US',
  capabilities: { categories: [{ id: 2000, name: 'Movies' }] },
  fields: [],
  ...overrides,
});

describe('logique des indexeurs', () => {
  it('filtre de la liste et santé', () => {
    const list = [
      indexer(1),
      indexer(2, { enabled: false, protocol: 'usenet' }),
      indexer(3, { status: { disabledTill: null, mostRecentFailure: 'x' } }),
    ];
    expect(filterIndexers(list, 'enabled').map((item) => item.id)).toEqual([1, 3]);
    expect(filterIndexers(list, 'disabled').map((item) => item.id)).toEqual([2]);
    expect(filterIndexers(list, 'usenet').map((item) => item.id)).toEqual([2]);
    expect(filterIndexers(list, 'all')).toHaveLength(3);
    expect(list.map(indexerHealth)).toEqual(['ok', 'disabled', 'error']);
  });

  it('bascule : indexeur et tuile « actifs » mis à jour sans relire', () => {
    const page = withIndexerEnabled(overview([indexer(1), indexer(2)]), 2, false);
    expect(page.indexers[1]?.enabled).toBe(false);
    expect(page.totals.enabled).toBe(1);
  });

  it('catalogue : mots sans accents, filtres, pertinence, limite', () => {
    const list = [
      definition('Torrent Film', { description: 'films français', language: 'fr-FR' }),
      definition('1337x'),
      definition('Films Club', { protocol: 'usenet', privacy: 'private' }),
      definition('Anime', { capabilities: { categories: [{ id: 5070, name: 'Anime' }] } }),
    ];
    expect(filterCatalog(list, { ...EMPTY_CATALOG_FILTERS, q: 'FRANCAIS film' })).toHaveLength(1);
    // Terme dans le nom d'abord, en tête du nom ensuite.
    expect(
      filterCatalog(list, { ...EMPTY_CATALOG_FILTERS, q: 'film' }).map((item) => item.name),
    ).toEqual(['Films Club', 'Torrent Film']);
    expect(filterCatalog(list, { ...EMPTY_CATALOG_FILTERS, protocol: 'usenet' })).toHaveLength(1);
    expect(filterCatalog(list, { ...EMPTY_CATALOG_FILTERS, privacy: 'private' })).toHaveLength(1);
    expect(filterCatalog(list, { ...EMPTY_CATALOG_FILTERS, category: 'Anime' })).toHaveLength(1);
    expect(filterCatalog(list, EMPTY_CATALOG_FILTERS, 2)).toHaveLength(2);
    const options = catalogOptions(list);
    expect(options.languages).toEqual([
      { value: 'en-US', count: 3 },
      { value: 'fr-FR', count: 1 },
    ]);
    expect(options.categories[0]).toEqual({ value: 'Movies', count: 3 });
  });

  it('formulaire : `baseUrl` parmi les adresses, profil par défaut, charge utile', () => {
    const template = definition('YTS', {
      indexerUrls: ['https://yts.example/', 'https://yts.mirror/'],
      appProfileId: 0,
      presets: [{}],
      status: {},
      fields: [
        { name: 'definitionFile', value: 'yts', hidden: 'hidden' },
        { name: 'baseUrl', type: 'textbox', value: '' },
        { name: 'password', type: 'password', value: '' },
      ],
    });
    const prepared = withBaseUrlOptions(template, true);
    const baseUrl = prepared.fields?.find((field) => field.name === 'baseUrl');
    expect(baseUrl?.selectOptions?.map((option) => option.value)).toEqual([
      'https://yts.example/',
      'https://yts.mirror/',
    ]);
    expect(baseUrl?.value).toBe('https://yts.example/');
    const form = initialIndexerForm(prepared, [3, 4]);
    expect(form).toMatchObject({ name: 'YTS', appProfileId: 3, priority: 25, enable: true });
    const payload = indexerPayload(prepared, { ...form, name: ' Mine ', tags: [2] });
    expect(payload).toMatchObject({
      name: 'Mine',
      implementation: 'Cardigann',
      appProfileId: 3,
      tags: [2],
      fields: [
        { name: 'definitionFile', value: 'yts' },
        { name: 'baseUrl', value: 'https://yts.example/' },
        { name: 'password', value: '' },
      ],
    });
    expect(payload).not.toHaveProperty('presets');
    expect(payload).not.toHaveProperty('status');
  });

  it('fiche : capacités, catégories à plat, liens http(s) seulement', () => {
    const raw: Provider = {
      supportsRss: true,
      indexerUrls: ['https://a.example/', 'javascript:alert(1)'],
      capabilities: {
        supportsRawSearch: false,
        searchParams: ['q', 'q'],
        movieSearchParams: ['q', 'imdbId'],
        categories: [{ id: 2000, name: 'Movies', subCategories: [{ id: 2040, name: 'HD' }] }],
      },
    };
    const rows = capabilityRows(raw);
    expect(rows[0]).toMatchObject({ supported: true });
    expect(rows[2]?.params).toEqual(['q']);
    expect(rows[4]?.params).toEqual(['q', 'imdbId']);
    expect(rows[3]?.params).toEqual([]);
    expect(categoryRows(raw)).toEqual([
      { id: 2000, name: 'Movies', sub: false },
      { id: 2040, name: 'HD', sub: true },
    ]);
    expect(indexerLinks(raw).map((link) => link.href)).toEqual(['https://a.example/', null]);
  });

  it('messages à marqueurs et champs `info` en texte', () => {
    expect(fillLegacy('Supprimer « __NAME__ » ?', { NAME: '<b>x</b>' })).toBe(
      'Supprimer « <b>x</b> » ?',
    );
    expect(
      infoText({ name: 'info', type: 'info' }, 'Use <a href="x">cookie</a><br>then &amp; go'),
    ).toBe('Use cookie\nthen & go');
  });
});

describe('page des indexeurs', () => {
  it('tuiles, liste, bascule sur place, test d’une ligne, suppression confirmée', async () => {
    let page = overview([indexer(1), indexer(2, { protocol: 'usenet', enabled: false })]);
    const { fetch } = await mountProwlarr('/prowlarr', {
      'GET /api/prowlarr': () => ({ body: page }),
      'POST /api/prowlarr/indexer/1/toggle': () => ({ body: { ok: true, enabled: false } }),
      'GET /api/prowlarr/indexer/2': () => ({
        body: {
          id: 2,
          name: 'Indexer 2',
          implementation: 'Cardigann',
          configContract: 'C',
          fields: [],
        },
      }),
      'POST /api/prowlarr/indexer/test': () => ({ body: { ok: false, message: 'Unreachable' } }),
      'POST /api/prowlarr/indexer/2/delete': () => {
        page = overview([indexer(1)]);
        return { body: { ok: true } };
      },
    });
    expect(document.querySelector('[data-test="prowlarr-tile-indexers"]')?.textContent).toContain(
      '2',
    );
    expect(document.querySelector('[data-test="prowlarr-tile-usenet"]')?.textContent).toContain(
      '1',
    );
    expect(document.querySelectorAll('[data-test="prowlarr-indexer-row"]')).toHaveLength(2);
    expect(document.querySelector('[data-test="prowlarr-apps"]')?.textContent).toContain('Radarr');

    click('[data-test="prowlarr-indexer-toggle"] input');
    await settle();
    expect(document.querySelector('[data-test="prowlarr-tile-active"]')?.textContent).toContain(
      '0',
    );

    click('[data-test="prowlarr-indexer-test"]', 1);
    await settle();
    expect(
      fetch.calls.find((call) => call.url === '/api/prowlarr/indexer/test')?.body,
    ).toMatchObject({
      id: 2,
      name: 'Indexer 2',
    });
    expect(document.querySelector('[data-test="prowlarr-feedback"]')?.textContent).toContain(
      'Unreachable',
    );

    click('[data-test="prowlarr-indexer-delete"]', 1);
    await settle();
    expect(document.body.textContent).toContain('Indexer 2');
    const confirmButton = [...document.querySelectorAll<HTMLElement>('.v-overlay button')].at(-1);
    confirmButton?.click();
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/prowlarr/indexer/2/delete')).toBe(true);
    expect(document.querySelectorAll('[data-test="prowlarr-indexer-row"]')).toHaveLength(1);
  });

  it('tester tout : échecs nommés ; ajout depuis le catalogue avec test puis enregistrement', async () => {
    const { fetch } = await mountProwlarr('/prowlarr', {
      'GET /api/prowlarr': () => ({ body: overview([indexer(1)]) }),
      'POST /api/prowlarr/indexer/testall': () => ({
        body: { ok: false, results: [{ id: 1, isValid: false, message: 'Cloudflare' }] },
      }),
      'GET /api/prowlarr/indexer/schema': () => ({
        body: [
          definition('YTS', {
            indexerUrls: ['https://yts.example/'],
            fields: [{ name: 'baseUrl', label: 'Base URL', type: 'textbox', value: '' }],
          }),
          definition('1337x'),
        ],
      }),
      'GET /api/prowlarr/app-profiles': () => ({
        body: [
          {
            id: 1,
            name: 'Standard',
            enableRss: true,
            enableAutomaticSearch: true,
            enableInteractiveSearch: true,
            minimumSeeders: 1,
          },
        ],
      }),
      'GET /api/prowlarr/tags': () => ({ body: [] }),
      'POST /api/prowlarr/indexer/test': () => ({ body: { ok: true, message: null } }),
      'POST /api/prowlarr/indexer/add': (call) => ({ body: { ...(call.body as object), id: 9 } }),
    });
    click('[data-test="prowlarr-test-all"]');
    await settle();
    const feedback = document.querySelector('[data-test="prowlarr-feedback"]')?.textContent ?? '';
    expect(feedback).toContain('Indexer 1');
    expect(feedback).toContain('Cloudflare');

    click('[data-test="prowlarr-add"]');
    await settle();
    expect(document.querySelectorAll('[data-test="indexer-definition"]')).toHaveLength(2);
    type('[data-test="indexer-catalog-search"]', 'yts');
    await settle();
    expect(document.querySelectorAll('[data-test="indexer-definition"]')).toHaveLength(1);
    click('[data-test="indexer-definition"]');
    await settle();
    expect(
      document.querySelector<HTMLInputElement>('[data-test="indexer-name"] input')?.value,
    ).toBe('YTS');
    click('[data-test="indexer-test"]');
    await settle();
    expect(document.querySelector('[data-test="indexer-test-result"]')?.textContent).toBeTruthy();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    const added = fetch.calls.find((call) => call.url === '/api/prowlarr/indexer/add');
    expect(added?.body).toMatchObject({
      name: 'YTS',
      appProfileId: 1,
      enable: true,
      fields: [{ name: 'baseUrl', value: 'https://yts.example/' }],
    });
    expect(document.querySelector('[data-test="prowlarr-feedback"]')?.textContent).toContain(
      'Indexer added',
    );
  });

  it('sélection : activation groupée de la sélection', async () => {
    const { fetch } = await mountProwlarr('/prowlarr', {
      'GET /api/prowlarr': () => ({ body: overview([indexer(1), indexer(2), indexer(3)]) }),
      'POST /api/prowlarr/indexer/bulk/update': () => ({ body: { ok: true } }),
    });
    click('[data-test="prowlarr-select"] input', 0);
    click('[data-test="prowlarr-select"] input', 2);
    await settle();
    expect(document.querySelector('[data-test="prowlarr-bulk-count"]')?.textContent).toContain('2');
    click('[data-test="prowlarr-bulk-disable"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url === '/api/prowlarr/indexer/bulk/update')?.body,
    ).toEqual({ ids: [1, 3], enable: false });
    expect(document.querySelector('[data-test="prowlarr-bulk-bar"]')).toBeNull();
  });
});
