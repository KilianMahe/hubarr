// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration Radarr/Sonarr (P3b.1, P3b.2) : logique du formulaire à schéma
// (`schema-form`), de l'éditeur de profil de qualité et des conditions,
// registre des pages ; vues montées (navigation, étiquettes, profils de délai,
// qualité, formats personnalisés, auto-tags).

import type { Provider, ProviderField, QualityProfile } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  adminMenu,
  adminRouteName,
  adminRoutes,
  adminPagesOf,
} from '../src/features/arr-admin/admin-pages';
import {
  allowedQualities,
  clampSizes,
  cutoffLabel,
  cutoffOptions,
  editorItems,
  isDefaultDelayProfile,
  moveItem,
  profileForm,
  profilePayload,
  sizeForMinutes,
  toGiBPerHour,
} from '../src/features/arr-admin/admin-format';
import {
  controlOf,
  fieldVisible,
  fieldsPayload,
  initialValues,
  listItem,
  optionsOf,
} from '../src/features/arr-admin/schema-form';
import {
  specificationDrafts,
  specificationsPayload,
} from '../src/features/arr-admin/specifications';
import { settle } from './helpers';
import { adminApi, cleanupAdmin, click, mountAdmin, type } from './arr-admin-fixtures';
import { setViewportWidth } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupAdmin);

const field = (overrides: Partial<ProviderField>): ProviderField => ({ name: 'f', ...overrides });

describe('formulaire à schéma', () => {
  it('contrôle selon le type et la valeur', () => {
    expect(controlOf(field({ type: 'checkbox' }), false)).toBe('checkbox');
    expect(controlOf(field({ type: 'select', selectOptions: [{ value: 1, name: 'a' }] }), 1)).toBe(
      'select',
    );
    expect(controlOf(field({ type: 'select' }), 'x')).toBe('text');
    expect(controlOf(field({ type: 'select', selectOptions: [{ value: 1 }] }), [1])).toBe(
      'multiselect',
    );
    expect(controlOf(field({ type: 'select' }), [2040])).toBe('multiselect');
    expect(controlOf(field({ type: 'select' }), ['a'])).toBe('list');
    expect(controlOf(field({ type: 'tag' }), [])).toBe('list');
    expect(controlOf(field({ type: 'number' }), 3)).toBe('number');
    expect(controlOf(field({ type: 'password' }), '********')).toBe('password');
    expect(controlOf(field({ type: 'textbox' }), 'x')).toBe('text');
  });

  it('champs cachés : `hidden`, et `hiddenIfNotSet` sans valeur', () => {
    expect(fieldVisible(field({ hidden: 'hidden' }), 'x')).toBe(false);
    expect(fieldVisible(field({ hidden: 'hiddenIfNotSet' }), '')).toBe(false);
    expect(fieldVisible(field({ hidden: 'hiddenIfNotSet' }), 'x')).toBe(true);
    expect(fieldVisible(field({}), null)).toBe(true);
  });

  it('catégories Newznab de la famille des valeurs ; valeur inconnue gardée', () => {
    const options = optionsOf(
      field({ type: 'select', selectOptions: [{ value: 1, name: 'x' }] }),
      [2040, 2045],
      (key) => key,
    );
    expect(options.map((option) => option.value)).toEqual([
      2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080,
    ]);
    expect(options.find((option) => option.value === 2040)?.title).toBe('films_hd (2040)');
    const kept = optionsOf(
      field({ type: 'select', selectOptions: [{ value: 'a', name: 'A', hint: '(x)' }] }),
      'zz',
      (key) => key,
    );
    expect(kept).toEqual([
      { value: 'a', title: 'A (x)' },
      { value: 'zz', title: '#zz' },
    ]);
  });

  it('valeurs initiales et `fields[]` complets (cachés compris)', () => {
    const template: Provider = {
      implementation: 'Newznab',
      fields: [
        { name: 'baseUrl', value: 'https://default' },
        { name: 'apiKey', value: '', privacy: 'apiKey' },
        { name: 'hiddenOne', value: 7, hidden: 'hidden' },
      ],
    };
    const existing: Provider = {
      fields: [
        { name: 'baseUrl', value: 'https://mine' },
        { name: 'hiddenOne', value: 9 },
      ],
    };
    const values = initialValues(template, existing);
    expect(values).toEqual({ baseUrl: 'https://mine', apiKey: '', hiddenOne: 9 });
    expect(fieldsPayload(template, { baseUrl: 'https://new' }, existing)).toEqual([
      { name: 'baseUrl', value: 'https://new' },
      { name: 'apiKey', value: '' },
      { name: 'hiddenOne', value: 9 },
    ]);
    expect(listItem(' 12 ')).toBe(12);
    expect(listItem('abc')).toBe('abc');
  });
});

describe('profil de qualité', () => {
  const profile: QualityProfile = {
    id: 1,
    name: 'HD',
    cutoff: 1001,
    upgradeAllowed: false,
    items: [
      { quality: { id: 1, name: 'SDTV' }, allowed: false, items: [] },
      {
        id: 1001,
        name: 'WEB 1080p',
        allowed: true,
        items: [{ quality: { id: 3, name: 'WEBDL-1080p' }, allowed: true }],
      },
      { quality: { id: 7, name: 'Bluray-1080p' }, allowed: true, items: [] },
    ],
    formatItems: [{ format: 5, name: 'Remux', score: 10 }],
    language: { id: 2, name: 'French' },
    extra: 'kept',
  };

  it('éditeur : plus prioritaire en haut, seuils parmi les qualités cochées', () => {
    const items = editorItems(profile, [], []);
    expect(items.map((entry) => entry.item.quality?.name ?? entry.item.name)).toEqual([
      'Bluray-1080p',
      'WEB 1080p',
      'SDTV',
    ]);
    expect(cutoffOptions(items)).toEqual([
      { value: 7, title: 'Bluray-1080p' },
      { value: 1001, title: 'WEB 1080p' },
    ]);
    expect(allowedQualities(profile)).toEqual(['Bluray-1080p', 'WEB 1080p']);
    expect(cutoffLabel(profile)).toBe('WEB 1080p');
  });

  it('nouveau profil : éléments du premier profil décochés, sinon les définitions', () => {
    expect(editorItems(null, [profile], []).every((entry) => !entry.allowed)).toBe(true);
    const fromDefinitions = editorItems(
      null,
      [],
      [{ id: 1, quality: { id: 4, name: 'HDTV-720p' } }],
    );
    expect(fromDefinitions.map((entry) => entry.item.quality?.id)).toEqual([4]);
  });

  it('enregistrement : ordre de l’API, groupe coché avec ses qualités, scores, langue, champs gardés', () => {
    const items = moveItem(editorItems(profile, [], []), 0, 2);
    const third = items[2];
    if (third) third.allowed = false;
    const form = { ...profileForm(profile, true), name: ' HD+ ', cutoff: 1001, scores: { 5: 25 } };
    const payload = profilePayload(
      form,
      items,
      [
        { id: 5, name: 'Remux' },
        { id: 6, name: 'HDR' },
      ],
      [{ id: 2, name: 'French' }],
      profile,
    );
    expect(payload.name).toBe('HD+');
    expect(payload.extra).toBe('kept');
    expect(payload.items?.map((item) => item.quality?.name ?? item.name)).toEqual([
      'Bluray-1080p',
      'SDTV',
      'WEB 1080p',
    ]);
    expect(payload.items?.[0]?.allowed).toBe(false);
    expect(payload.items?.[2]?.items?.[0]?.allowed).toBe(true);
    expect(payload.formatItems).toEqual([
      { format: 5, name: 'Remux', score: 25 },
      { format: 6, name: 'HDR', score: 0 },
    ]);
    expect(payload.language).toEqual({ id: 2, name: 'French' });
    const sonarr = profilePayload(profileForm(null, false), [], [], [], null);
    expect(sonarr.language).toBeUndefined();
    expect(sonarr.upgradeAllowed).toBe(true);
  });

  it('tailles : Gio/h, durées, bornes rangées', () => {
    expect(toGiBPerHour(1024)).toBe(60);
    expect(sizeForMinutes(102.4, 60)).toBe('6.0 GiB');
    expect(sizeForMinutes(0.5, 60)).toBe('0');
    expect(clampSizes(50, 10, 30, 40)).toEqual({ minSize: 40, preferredSize: 40, maxSize: 40 });
    expect(clampSizes(5, 50, 30, 400)).toEqual({ minSize: 5, preferredSize: 30, maxSize: 30 });
  });

  it('profil de délai par défaut', () => {
    expect(isDefaultDelayProfile({ id: 1 })).toBe(true);
    expect(isDefaultDelayProfile({ id: 4, order: 2147483647 })).toBe(true);
    expect(isDefaultDelayProfile({ id: 4, order: 1 })).toBe(false);
  });
});

describe('conditions', () => {
  const templates = [
    {
      implementation: 'ReleaseTitleSpecification',
      implementationName: 'Release Title',
      fields: [{ name: 'value', value: '' }],
    },
    {
      implementation: 'SourceSpecification',
      implementationName: 'Source',
      fields: [{ name: 'value', value: 0 }],
    },
  ];

  it('brouillons des conditions existantes, puis conditions à envoyer', () => {
    const drafts = specificationDrafts(
      [
        {
          name: 'x265',
          implementation: 'ReleaseTitleSpecification',
          negate: true,
          fields: [{ name: 'value', value: 'x265' }],
        },
      ],
      templates,
    );
    expect(drafts[0]).toMatchObject({
      templateIndex: 0,
      name: 'x265',
      negate: true,
      values: { value: 'x265' },
    });
    const unnamed = {
      key: 'n',
      templateIndex: 1,
      name: ' ',
      negate: false,
      required: true,
      values: { value: 7 },
    };
    const orphan = {
      key: 'o',
      templateIndex: null,
      name: 'x',
      negate: false,
      required: false,
      values: {},
    };
    expect(specificationsPayload([...drafts, unnamed, orphan], templates)).toEqual([
      expect.objectContaining({
        name: 'x265',
        implementation: 'ReleaseTitleSpecification',
        negate: true,
        fields: [{ name: 'value', value: 'x265' }],
      }),
      expect.objectContaining({
        name: 'Source',
        implementationName: 'Source',
        required: true,
        fields: [{ name: 'value', value: 7 }],
      }),
    ]);
  });
});

describe('registre des pages', () => {
  it('pages propres à chaque service', () => {
    const radarr = adminPagesOf('radarr').map((page) => page.id);
    const sonarr = adminPagesOf('sonarr').map((page) => page.id);
    expect(radarr).toContain('quality');
    expect(sonarr).toContain('quality');
    expect(adminRouteName('sonarr', 'tags')).toBe('sonarr-tags');
    const routes = adminRoutes(() => ({}));
    expect(routes.find((route) => route.name === 'radarr-quality')?.path).toBe(
      'medias/:slug/radarr/qualite',
    );
    expect(adminMenu('radarr', 'settings').every((group) => group.pages.length > 0)).toBe(true);
    // Configuration dans les paramètres de Hubarr, usage dans la navigation (P5c.4, D140).
    expect(adminMenu('radarr', 'settings').map((group) => group.group)).toEqual([
      'profiles',
      'integrations',
      'general',
      'system',
    ]);
    expect(adminMenu('sonarr', 'service').map((group) => group.group)).toEqual([
      'activity',
      'wanted',
      'discovery',
    ]);
  });
});

describe('vues', () => {
  it('page de configuration : retour aux paramètres au lieu des onglets (D140)', async () => {
    await mountAdmin('/medias/radarr/radarr/tags', {
      'GET /api/medias/radarr/radarr/tags': () => ({ body: [] }),
    });
    expect(document.querySelector('[data-test="arr-admin-title"]')?.textContent).toBe('Tags');
    expect(document.querySelector('[data-test="arr-admin-menu"]')).toBeNull();
    expect(document.querySelector('[data-test="settings-back"]')?.getAttribute('href')).toBe(
      '/admin/settings#section-services',
    );
    // Onglets à deux niveaux (P5d.3, D149) : groupes, puis pages du groupe courant.
    const groups = document.querySelectorAll('[data-test="admin-group"]');
    expect(groups.length).toBeGreaterThan(1);
    expect([...groups].filter((tab) => tab.className.includes('v-tab--selected'))).toHaveLength(1);
    const tags = document.querySelector('[data-test="admin-link-radarr-tags"]');
    expect(tags?.getAttribute('href')).toBe('/medias/radarr/radarr/tags');
    expect(tags?.className).toContain('v-tab--selected');
    // Les pages d'un autre groupe (système) ne sont pas dans la seconde rangée.
    expect(document.querySelector('[data-test="admin-link-radarr-system"]')).toBeNull();
  });

  it('page de configuration sur mobile : groupes dans la barre basse, page dans la barre du haut', async () => {
    const desktopWidth = window.innerWidth;
    setViewportWidth(412);
    try {
      await mountAdmin('/medias/radarr/radarr/tags', {
        'GET /api/medias/radarr/radarr/tags': () => ({ body: [] }),
      });
      const t = (key: string) => i18n.global.t(key);
      const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
      // Ni onglets de groupes ni onglets de pages : seul le retour reste dans la page.
      expect($('[data-test="service-settings-groups"]')).toBeNull();
      expect($('[data-test="settings-back"]')).not.toBeNull();
      const groups = [
        ...document.querySelectorAll('[data-test="service-bottom-nav"] [data-test="admin-group"]'),
      ];
      expect(groups).toHaveLength(4);
      expect(groups.filter((tab) => tab.classList.contains('v-btn--active'))).toHaveLength(1);
      expect($('[data-test="topbar-title"]')?.textContent.trim()).toBe(
        `Radarr · ${t('media.item.tags')}`,
      );
      // Le groupe ouvre la liste de ses pages, la page courante active.
      click('[data-test="admin-group"]', 2);
      await settle();
      expect($('[data-test="admin-link-radarr-tags"]')?.className).toContain('active');
      expect($('[data-test="admin-link-radarr-tags"]')?.getAttribute('href')).toBe(
        '/medias/radarr/radarr/tags',
      );
    } finally {
      setViewportWidth(desktopWidth);
    }
  });

  it('page d’usage : menu « Plus » sans les pages de configuration, page active', async () => {
    await mountAdmin('/medias/radarr/radarr/exclusions', {
      'GET /api/medias/radarr/radarr/exclusions': () => ({
        body: { records: [], totalRecords: 0, page: 1, pageSize: 50 },
      }),
    });
    expect(document.querySelector('[data-test="settings-back"]')).toBeNull();
    click('[data-test="arr-admin-menu"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-link-radarr-commands"]')).not.toBeNull();
    expect(document.querySelector('[data-test="arr-admin-link-radarr-quality"]')).toBeNull();
    expect(
      document.querySelector('[data-test="arr-admin-link-radarr-exclusions"]')?.className,
    ).toContain('active');
  });

  it('étiquettes (Sonarr) : ajout, renommage, suppression refusée avec le message traduit', async () => {
    let tags = [{ id: 1, label: 'anime', usage: 2 }];
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/tags', {
      [`GET ${adminApi('sonarr', '/tags')}`]: () => ({ body: tags }),
      [`POST ${adminApi('sonarr', '/tags/ajouter')}`]: () => {
        tags = [...tags, { id: 2, label: 'hd', usage: 0 }];
        return { body: { id: 2, label: 'hd' } };
      },
      [`POST ${adminApi('sonarr', '/tags/1/renommer')}`]: () => ({
        body: { id: 1, label: 'anime2' },
      }),
      [`POST ${adminApi('sonarr', '/tags/1/supprimer')}`]: () => ({
        status: 409,
        body: { code: 'VALIDATION', message: 'media.api.tag_still_used' },
      }),
    });
    expect(document.querySelectorAll('[data-test="tag-row"]')).toHaveLength(1);
    type('[data-test="tag-new-label"]', 'hd');
    await settle();
    click('[data-test="tag-add"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/tags/ajouter'))?.body).toEqual({
      label: 'hd',
    });
    expect(document.querySelectorAll('[data-test="tag-row"]')).toHaveLength(2);
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toContain('hd');

    click('[data-test="tag-rename"]');
    await settle();
    type('[data-test="tag-rename-label"]', 'anime2');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/tags/1/renommer'))?.body).toEqual({
      label: 'anime2',
    });

    click('[data-test="tag-delete"]');
    await settle();
    click('[data-test="confirm"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toContain(
      'still in use',
    );
  });

  it('page injoignable : message propre au service', async () => {
    await mountAdmin('/medias/radarr/radarr/profils-delai', {
      'GET /api/medias/radarr/radarr/profils-delai': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE' },
      }),
      'GET /api/medias/radarr/radarr/tags': () => ({ body: [] }),
    });
    expect(document.querySelector('[data-test="arr-admin-error"]')?.textContent).toContain(
      'Radarr',
    );
  });

  it('profils de délai : étiquettes par nom, profil par défaut non supprimable, ajout', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/profils-delai', {
      'GET /api/medias/radarr/radarr/profils-delai': () => ({
        body: [
          {
            id: 2,
            order: 1,
            tags: [5],
            enableUsenet: true,
            enableTorrent: true,
            preferredProtocol: 'torrent',
            usenetDelay: 10,
            torrentDelay: 0,
          },
          { id: 1, order: 2147483647, tags: [], enableUsenet: true, enableTorrent: true },
        ],
      }),
      'GET /api/medias/radarr/radarr/tags': () => ({ body: [{ id: 5, label: 'anime', usage: 1 }] }),
      'POST /api/medias/radarr/radarr/profils-delai/ajouter': () => ({ body: { id: 3 } }),
    });
    const rows = document.querySelectorAll('[data-test="delay-row"]');
    expect(rows[0]?.textContent).toContain('anime');
    expect(rows[0]?.textContent).toContain('Torrent');
    expect(rows[1]?.querySelector('[data-test="delay-delete"]')).toBeNull();
    click('[data-test="delay-add"]');
    await settle();
    type('[data-test="delay-usenet"]', '60');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/profils-delai/ajouter'))?.body,
    ).toMatchObject({
      enableUsenet: true,
      usenetDelay: 60,
      tags: [],
    });
  });

  it('qualité : profils, définitions enregistrées en Mo/min, profil modifié', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/qualite', {
      'GET /api/medias/radarr/radarr/qualite': () => ({
        body: {
          profiles: [
            {
              id: 1,
              name: 'HD',
              cutoff: 7,
              items: [
                { quality: { id: 1, name: 'SDTV' }, allowed: false, items: [] },
                { quality: { id: 7, name: 'Bluray-1080p' }, allowed: true, items: [] },
              ],
            },
          ],
          definitions: [
            {
              id: 3,
              title: 'Bluray-1080p',
              quality: { id: 7, name: 'Bluray-1080p' },
              minSize: 10.24,
              maxSize: 102.4,
              preferredSize: 51.2,
            },
          ],
          customFormats: [{ id: 5, name: 'Remux' }],
          languages: [{ id: -1, name: 'Any' }],
          limits: { min: 0, max: 400 },
        },
      }),
      'POST /api/medias/radarr/radarr/qualite/definitions/sauvegarder': () => ({
        body: { ok: true },
      }),
      'POST /api/medias/radarr/radarr/qualite/profils/1/modifier': () => ({
        body: { id: 1, name: 'HD' },
      }),
    });
    expect(document.querySelector('[data-test="quality-profile-row"]')?.textContent).toContain(
      'Bluray-1080p',
    );
    click('[data-test="quality-definitions-save"]');
    await settle();
    const definitions = fetch.calls.find((call) => call.url.endsWith('/definitions/sauvegarder'))
      ?.body as {
      minSize: number;
      maxSize: number;
    }[];
    expect(definitions[0]?.minSize).toBeCloseTo(10.24, 1);
    expect(definitions[0]?.maxSize).toBeCloseTo(102.4, 1);

    click('[data-test="quality-profile-edit"]');
    await settle();
    expect(document.querySelectorAll('[data-test="quality-profile-item"]')).toHaveLength(2);
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    const saved = fetch.calls.find((call) => call.url.endsWith('/profils/1/modifier'))
      ?.body as QualityProfile;
    expect(saved).toMatchObject({
      id: 1,
      name: 'HD',
      cutoff: 7,
      language: { id: -1, name: 'Any' },
    });
    expect(saved.formatItems).toEqual([{ format: 5, name: 'Remux', score: 0 }]);
  });

  it('formats : conditions éditées avec les modèles de l’instance', async () => {
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/formats', {
      'GET /api/medias/sonarr/sonarr/formats': () => ({
        body: [
          {
            id: 1,
            name: 'x265',
            specifications: [
              {
                name: 'x265',
                implementation: 'ReleaseTitleSpecification',
                fields: [{ name: 'value', value: 'x265' }],
              },
            ],
          },
        ],
      }),
      'GET /api/medias/sonarr/sonarr/formats/schema': () => ({
        body: [
          {
            implementation: 'ReleaseTitleSpecification',
            implementationName: 'Release Title',
            fields: [{ name: 'value', label: 'Regular Expression', type: 'textbox', value: '' }],
          },
        ],
      }),
      'POST /api/medias/sonarr/sonarr/formats/1/modifier': () => ({
        body: { id: 1, name: 'x265' },
      }),
    });
    expect(document.querySelector('[data-test="format-row"]')?.textContent).toContain('x265');
    click('[data-test="format-edit"]');
    await settle();
    expect(document.querySelectorAll('[data-test="spec-card"]')).toHaveLength(1);
    type('[data-test="spec-0-field-value"]', 'HEVC');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/formats/1/modifier'))?.body,
    ).toMatchObject({
      name: 'x265',
      specifications: [
        {
          name: 'x265',
          implementation: 'ReleaseTitleSpecification',
          fields: [{ name: 'value', value: 'HEVC' }],
        },
      ],
    });
  });

  it('auto-tags : étiquettes par nom, règle sans nom refusée', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/auto-tags', {
      'GET /api/medias/radarr/radarr/auto-tags': () => ({
        body: {
          rules: [{ id: 1, name: 'Anime', tags: [2], specifications: [] }],
          schema: [],
          tags: [{ id: 2, label: 'anime' }],
        },
      }),
    });
    expect(document.querySelector('[data-test="autotag-row"]')?.textContent).toContain('anime');
    click('[data-test="autotag-add"]');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-dialog-error"]')?.textContent).toContain(
      'required',
    );
    expect(fetch.calls.some((call) => call.url.endsWith('/auto-tags/ajouter'))).toBe(false);
  });
});
