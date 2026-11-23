// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration Radarr/Sonarr (P3b.4) : formulaires de configuration
// (champs par service, modification à envoyer, conditions des filtres) et vues
// montées (interface, hôte, gestion des médias, dossiers racine, chemins
// distants, filtres personnalisés).

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import { parseFilterConditions } from '../src/features/arr-admin/admin-format';
import {
  HOST_SECTIONS,
  MEDIA_MANAGEMENT_FIELDS,
  NAMING_FIELDS,
  UI_SECTIONS,
  configPatch,
  fieldsFor,
  formValues,
  sectionsFor,
} from '../src/features/arr-admin/config-forms';
import { settle } from './helpers';
import { adminApi, cleanupAdmin, click, mountAdmin, type } from './arr-admin-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupAdmin);

describe('formulaires de configuration', () => {
  it('champs propres à chaque service', () => {
    const radarrUi = sectionsFor(UI_SECTIONS, 'radarr')
      .flatMap((section) => section.fields)
      .map((field) => field.key);
    const sonarrUi = sectionsFor(UI_SECTIONS, 'sonarr')
      .flatMap((section) => section.fields)
      .map((field) => field.key);
    expect(radarrUi).toContain('movieInfoLanguage');
    expect(sonarrUi).not.toContain('movieInfoLanguage');
    expect(fieldsFor(NAMING_FIELDS, 'sonarr').map((field) => field.key)).toContain(
      'multiEpisodeStyle',
    );
    const sonarrColon = fieldsFor(NAMING_FIELDS, 'sonarr').find(
      (field) => field.key === 'colonReplacementFormat',
    );
    expect(sonarrColon?.options?.[4]?.value).toBe(4);
    const radarrColon = fieldsFor(NAMING_FIELDS, 'radarr').find(
      (field) => field.key === 'colonReplacementFormat',
    );
    expect(radarrColon?.options?.[4]?.value).toBe('smart');
    expect(
      fieldsFor(MEDIA_MANAGEMENT_FIELDS, 'radarr').filter((field) => field.key === 'fileDate'),
    ).toHaveLength(1);
  });

  it('valeurs du formulaire et modification : mots de passe vides ou masqués omis, nombres convertis', () => {
    const fields = sectionsFor(HOST_SECTIONS, 'radarr').flatMap((section) => section.fields);
    const values = formValues({ port: 7878, password: '********', enableSsl: true }, fields);
    expect(values.password).toBe('');
    expect(values.port).toBe(7878);
    const patch = configPatch(
      { ...values, port: '8080', proxyPassword: '********', password: 'new' },
      fields,
    );
    expect(patch.port).toBe(8080);
    expect(patch.password).toBe('new');
    expect('proxyPassword' in patch).toBe(false);
    expect('passwordConfirmation' in patch).toBe(false);
    expect(patch.enableSsl).toBe(true);
    expect(patch.launchBrowser).toBe(false);
  });

  it('conditions des filtres en JSON', () => {
    expect(parseFilterConditions('[{"key":"quality","value":[7],"type":"equal"}]')).toEqual([
      { key: 'quality', value: [7], type: 'equal' },
    ]);
    expect(parseFilterConditions('')).toEqual([]);
    expect(parseFilterConditions('{"key":"x"}')).toBeNull();
    expect(parseFilterConditions('[{"key":1,"type":"x"}]')).toBeNull();
    expect(parseFilterConditions('nope')).toBeNull();
  });
});

describe('vues', () => {
  it('interface (Sonarr) : langues de l’instance, enregistrement des champs déclarés', async () => {
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/ui', {
      [`GET ${adminApi('sonarr', '/ui')}`]: () => ({
        body: {
          config: {
            id: 1,
            firstDayOfWeek: 1,
            theme: 'dark',
            uiLanguage: 2,
            showRelativeDates: true,
          },
          languages: [{ id: 2, name: 'French' }],
        },
      }),
      [`POST ${adminApi('sonarr', '/ui/sauvegarder')}`]: () => ({ body: { id: 1 } }),
    });
    expect(document.querySelector('[data-test="config-field-movieRuntimeFormat"]')).toBeNull();
    expect(document.querySelector('[data-test="config-field-uiLanguage"]')?.textContent).toContain(
      'French',
    );
    click('[data-test="config-save"]');
    await settle();
    const body = fetch.calls.find((call) => call.url.endsWith('/ui/sauvegarder'))?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      firstDayOfWeek: 1,
      theme: 'dark',
      uiLanguage: 2,
      showRelativeDates: true,
    });
    expect('id' in body).toBe(false);
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toBeTruthy();
  });

  it('général : mot de passe non renvoyé, confirmation différente refusée, sections en lecture', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/parametres', {
      [`GET ${adminApi('radarr', '/parametres')}`]: () => ({
        body: {
          host: {
            id: 1,
            port: 7878,
            apiKey: '********',
            password: '********',
            username: 'admin',
            updateMechanism: 'docker',
          },
          indexer: { minimumAge: 0, retention: 30, rssSyncInterval: 15 },
          downloadClient: null,
          importList: { listSyncLevel: 'disabled', importListSyncInterval: 24 },
        },
      }),
      [`POST ${adminApi('radarr', '/parametres/host/sauvegarder')}`]: () => ({ body: { id: 1 } }),
    });
    expect(document.body.textContent).toContain('docker');
    expect(document.body.textContent).toContain('24 min');
    expect(document.body.textContent).not.toContain('********');
    type('[data-test="config-field-password"]', 'secret');
    await settle();
    click('[data-test="config-save"]');
    await settle();
    expect(fetch.calls.some((call) => call.url.endsWith('/host/sauvegarder'))).toBe(false);
    type('[data-test="config-field-passwordConfirmation"]', 'secret');
    type('[data-test="config-field-port"]', '9000');
    await settle();
    click('[data-test="config-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/host/sauvegarder'))?.body).toMatchObject({
      port: 9000,
      password: 'secret',
      passwordConfirmation: 'secret',
      username: 'admin',
    });
  });

  it('gestion des médias : exemples d’après les formats saisis, enregistrements séparés', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/gestion-medias', {
      [`GET ${adminApi('radarr', '/gestion-medias')}`]: () => ({
        body: {
          naming: {
            id: 1,
            renameMovies: true,
            standardMovieFormat: '{Movie Title}',
            movieFolderFormat: '{Movie Title}',
          },
          mediaManagement: { id: 1, recycleBin: '', downloadPropersAndRepacks: 'preferAndUpgrade' },
        },
      }),
      [`GET ${adminApi('radarr', '/gestion-medias/naming/examples')}`]: () => ({
        body: { movieExample: 'The Movie (2010)', movieFolderExample: null },
      }),
      [`POST ${adminApi('radarr', '/gestion-medias/naming')}`]: () => ({ body: { id: 1 } }),
      [`POST ${adminApi('radarr', '/gestion-medias/mediamanagement')}`]: () => ({
        body: { id: 1 },
      }),
    });
    type('[data-test="config-field-standardMovieFormat"]', '{Movie Title} ({Release Year})');
    await settle();
    click('[data-test="naming-preview"]');
    await settle();
    const previewCall = fetch.calls.find((call) => call.url.includes('/naming/examples'));
    expect(
      new URL(previewCall?.url ?? '', 'http://x').searchParams.get('standardMovieFormat'),
    ).toBe('{Movie Title} ({Release Year})');
    expect(document.querySelector('[data-test="naming-examples"]')?.textContent).toContain(
      'The Movie (2010)',
    );
    click('[data-test="naming-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/gestion-medias/naming'))?.body,
    ).toMatchObject({
      renameMovies: true,
      standardMovieFormat: '{Movie Title} ({Release Year})',
    });
    click('[data-test="mm-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/mediamanagement'))?.body).toMatchObject({
      downloadPropersAndRepacks: 'preferAndUpgrade',
      recycleBin: '',
    });
  });

  it('dossiers racine : inaccessible signalé, ajout, chemin vide refusé', async () => {
    const { fetch } = await mountAdmin('/medias/sonarr/sonarr/dossiers-racine', {
      [`GET ${adminApi('sonarr', '/dossiers-racine')}`]: () => ({
        body: [
          { id: 1, path: '/tv', accessible: false, freeSpace: 1_073_741_824, totalSpace: null },
        ],
      }),
      [`POST ${adminApi('sonarr', '/dossiers-racine/ajouter')}`]: () => ({
        body: { id: 2, path: '/anime', accessible: true, freeSpace: null, totalSpace: null },
      }),
    });
    expect(document.querySelector('[data-test="root-folder-row"]')?.textContent).toContain('/tv');
    click('[data-test="root-folder-add"]');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-dialog-error"]')).not.toBeNull();
    type('[data-test="root-folder-path"]', '/anime');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/dossiers-racine/ajouter'))?.body).toEqual(
      { path: '/anime' },
    );
  });

  it('chemins distants : modification', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/chemins-distants', {
      [`GET ${adminApi('radarr', '/chemins-distants')}`]: () => ({
        body: [{ id: 1, host: 'qbit', remotePath: '/dl/', localPath: '/data/dl/' }],
      }),
      [`POST ${adminApi('radarr', '/chemins-distants/1/modifier')}`]: () => ({
        body: { id: 1, host: 'sab', remotePath: '/dl/', localPath: '/data/dl/' },
      }),
    });
    click('[data-test="mapping-edit"]');
    await settle();
    type('[data-test="mapping-host"]', 'sab');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/chemins-distants/1/modifier'))?.body,
    ).toEqual({
      host: 'sab',
      remotePath: '/dl/',
      localPath: '/data/dl/',
    });
  });

  it('filtres personnalisés : JSON invalide refusé, puis enregistré', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/filtres-personnalises', {
      [`GET ${adminApi('radarr', '/filtres-personnalises')}`]: () => ({ body: [] }),
      [`POST ${adminApi('radarr', '/filtres-personnalises/ajouter')}`]: () => ({
        body: { id: 1, label: 'HD', type: 'movieIndex', filters: [] },
      }),
    });
    click('[data-test="filter-add"]');
    await settle();
    type('[data-test="filter-label"]', 'HD');
    type('[data-test="filter-conditions"]', '{bad');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(document.querySelector('[data-test="arr-admin-dialog-error"]')?.textContent).toContain(
      'JSON',
    );
    type('[data-test="filter-conditions"]', '[{"key":"monitored","value":[true],"type":"equal"}]');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url.endsWith('/filtres-personnalises/ajouter'))?.body,
    ).toEqual({
      label: 'HD',
      type: 'movieIndex',
      filters: [{ key: 'monitored', value: [true], type: 'equal' }],
    });
  });
});
