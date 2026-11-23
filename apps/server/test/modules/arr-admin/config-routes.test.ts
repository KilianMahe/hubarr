// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, configuration (P3b.4) : hôte (secrets), interface,
// gestion des médias et nommage, dossiers racine, chemins distants, filtres
// personnalisés, édition groupée (Radarr) — pour Radarr et Sonarr.

import { ARR_KINDS, ARR_SECRET_MASK, type HostSettingsPage } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminEnv, type AdminEnv } from './admin-env';

const host = {
  id: 1,
  bindAddress: '*',
  port: 7878,
  apiKey: 'the-api-key',
  username: 'admin',
  password: 'hunter2',
  passwordConfirmation: '',
  proxyPassword: 'proxy-pw',
  logLevel: 'info',
};

describe.each(ARR_KINDS)('configuration (%s)', (kind) => {
  let env: AdminEnv;
  beforeEach(async () => {
    env = await adminEnv(kind);
  });
  afterEach(async () => {
    await env.close();
  });

  it('général : hôte sans secret, sections annexes en échec → `null`', async () => {
    env.upstream.on('GET', '/api/v3/config/host', host);
    env.upstream.on('GET', '/api/v3/config/indexer', { id: 1, minimumAge: 0 });
    env.upstream.on('GET', '/api/v3/config/downloadclient', undefined, 500);
    env.upstream.on('GET', '/api/v3/config/importlist', { id: 1, listSyncLevel: 'disabled' });
    const response = await env.browser.get(env.url('/parametres'));
    expect(response.statusCode).toBe(200);
    const page = response.json<HostSettingsPage>();
    expect(page.host).toMatchObject({
      apiKey: ARR_SECRET_MASK,
      password: ARR_SECRET_MASK,
      proxyPassword: ARR_SECRET_MASK,
      username: 'admin',
    });
    expect(page.downloadClient).toBeNull();
    expect(page.importList).toEqual({ id: 1, listSyncLevel: 'disabled' });
    expect(JSON.stringify(page)).not.toContain('the-api-key');
    expect(JSON.stringify(page)).not.toContain('hunter2');
  });

  it('hôte absent → 404 `media.api.config_not_found`', async () => {
    env.upstream.on('GET', '/api/v3/config/host', '');
    env.upstream.on('GET', '/api/v3/config/indexer', {});
    env.upstream.on('GET', '/api/v3/config/downloadclient', {});
    env.upstream.on('GET', '/api/v3/config/importlist', {});
    const response = await env.browser.get(env.url('/parametres'));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: 'media.api.config_not_found' });
  });

  it('enregistrement de l’hôte : fusion, secrets masqués ou vides gardés, clé d’API intouchable', async () => {
    env.upstream.on('GET', '/api/v3/config/host', host);
    env.upstream.onCall('PUT', '/api/v3/config/host/1', (call) => ({
      status: 202,
      body: call.body,
    }));
    const response = await env.browser.post(env.url('/parametres/host/sauvegarder'), {
      port: 8080,
      apiKey: 'stolen',
      password: ARR_SECRET_MASK,
      proxyPassword: '',
      username: 'root',
    });
    const sent = env.upstream.callsTo('PUT', '/api/v3/config/host/1')[0]?.body;
    expect(sent).toEqual({ ...host, port: 8080, username: 'root' });
    expect(response.json()).toMatchObject({
      port: 8080,
      apiKey: ARR_SECRET_MASK,
      password: ARR_SECRET_MASK,
    });
    await env.browser.post(env.url('/parametres/host/sauvegarder'), {
      password: 'new-pw',
      passwordConfirmation: 'new-pw',
    });
    expect(env.upstream.callsTo('PUT', '/api/v3/config/host/1')[1]?.body).toMatchObject({
      password: 'new-pw',
      passwordConfirmation: 'new-pw',
    });
  });

  it('interface : configuration, langues, enregistrement fusionné', async () => {
    env.upstream.on('GET', '/api/v3/config/ui', { id: 1, firstDayOfWeek: 0, theme: 'auto' });
    env.upstream.on('GET', '/api/v3/language', [
      { id: 1, name: 'English' },
      { id: 2, name: 'French' },
    ]);
    env.upstream.onCall('PUT', '/api/v3/config/ui/1', (call) => ({ status: 202, body: call.body }));
    expect((await env.browser.get(env.url('/ui'))).json()).toEqual({
      config: { id: 1, firstDayOfWeek: 0, theme: 'auto' },
      languages: [
        { id: 1, name: 'English' },
        { id: 2, name: 'French' },
      ],
    });
    const saved = await env.browser.post(env.url('/ui/sauvegarder'), { theme: 'dark' });
    expect(saved.json()).toEqual({ id: 1, firstDayOfWeek: 0, theme: 'dark' });
  });

  it('gestion des médias : nommage et gestion, enregistrements séparés, exemples d’après les formats saisis', async () => {
    env.upstream.on('GET', '/api/v3/config/naming', { id: 1, renameMovies: false });
    env.upstream.on('GET', '/api/v3/config/mediamanagement', { id: 1, recycleBin: '' });
    env.upstream.onCall('PUT', '/api/v3/config/naming/1', (call) => ({
      status: 202,
      body: call.body,
    }));
    env.upstream.onCall('PUT', '/api/v3/config/mediamanagement/1', (call) => ({
      status: 202,
      body: call.body,
    }));
    env.upstream.on('GET', '/api/v3/config/naming/examples', {
      movieExample: 'The Movie (2010)',
      movieFolderExample: null,
      extra: 3,
    });
    expect((await env.browser.get(env.url('/gestion-medias'))).json()).toEqual({
      naming: { id: 1, renameMovies: false },
      mediaManagement: { id: 1, recycleBin: '' },
    });
    await env.browser.post(env.url('/gestion-medias/naming'), { renameMovies: true });
    expect(env.upstream.callsTo('PUT', '/api/v3/config/naming/1')[0]?.body).toEqual({
      id: 1,
      renameMovies: true,
    });
    await env.browser.post(env.url('/gestion-medias/mediamanagement'), { recycleBin: '/trash' });
    expect(env.upstream.callsTo('PUT', '/api/v3/config/mediamanagement/1')[0]?.body).toEqual({
      id: 1,
      recycleBin: '/trash',
    });
    const examples = await env.browser.get(
      env.url(
        '/gestion-medias/naming/examples?standardMovieFormat=%7BMovie%20Title%7D&renameMovies=true&bad-key=1',
      ),
    );
    expect(examples.json()).toEqual({ movieExample: 'The Movie (2010)', movieFolderExample: null });
    const query = env.upstream.callsTo('GET', '/api/v3/config/naming/examples')[0]?.query;
    expect(query?.get('standardMovieFormat')).toBe('{Movie Title}');
    expect(query?.get('renameMovies')).toBe('true');
    expect(query?.has('bad-key')).toBe(false);
  });

  it('dossiers racine : liste normalisée, ajout, chemin vide refusé, suppression', async () => {
    env.upstream.on('GET', '/api/v3/rootfolder', [
      {
        id: 1,
        path: '/data',
        accessible: true,
        freeSpace: 100,
        totalSpace: 1000,
        unmappedFolders: [],
      },
      { path: 'sans id' },
    ]);
    env.upstream.onCall('POST', '/api/v3/rootfolder', (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 2, accessible: false },
    }));
    env.upstream.on('DELETE', '/api/v3/rootfolder/2');
    expect((await env.browser.get(env.url('/dossiers-racine'))).json()).toEqual([
      { id: 1, path: '/data', accessible: true, freeSpace: 100, totalSpace: 1000 },
    ]);
    const added = await env.browser.post(env.url('/dossiers-racine/ajouter'), { path: '/media' });
    expect(added.json()).toEqual({
      id: 2,
      path: '/media',
      accessible: false,
      freeSpace: null,
      totalSpace: null,
    });
    const empty = await env.browser.post(env.url('/dossiers-racine/ajouter'), { path: ' ' });
    expect(empty.statusCode).toBe(400);
    expect((await env.browser.post(env.url('/dossiers-racine/2/supprimer'))).json()).toEqual({
      ok: true,
    });
  });

  it('chemins distants : CRUD, champs obligatoires', async () => {
    env.upstream.on('GET', '/api/v3/remotepathmapping', [
      { id: 1, host: 'qbit', remotePath: '/dl/', localPath: '/data/dl/' },
    ]);
    env.upstream.onCall('POST', '/api/v3/remotepathmapping', (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 2 },
    }));
    env.upstream.onCall('PUT', '/api/v3/remotepathmapping/2', (call) => ({
      status: 202,
      body: call.body,
    }));
    expect((await env.browser.get(env.url('/chemins-distants'))).json()).toHaveLength(1);
    const body = { host: 'sab', remotePath: '/r/', localPath: '/l/' };
    expect((await env.browser.post(env.url('/chemins-distants/ajouter'), body)).json()).toEqual({
      id: 2,
      ...body,
    });
    await env.browser.post(env.url('/chemins-distants/2/modifier'), { ...body, host: 'nzbget' });
    expect(env.upstream.callsTo('PUT', '/api/v3/remotepathmapping/2')[0]?.body).toEqual({
      ...body,
      host: 'nzbget',
      id: 2,
    });
    expect(
      (await env.browser.post(env.url('/chemins-distants/ajouter'), { host: 'x' })).statusCode,
    ).toBe(400);
  });

  it('filtres personnalisés : liste conforme, ajout, nom obligatoire', async () => {
    env.upstream.on('GET', '/api/v3/customfilter', [
      {
        id: 1,
        type: 'movieIndex',
        label: 'HD',
        filters: [{ key: 'quality', value: [7], type: 'equal' }],
      },
    ]);
    env.upstream.onCall('POST', '/api/v3/customfilter', (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 2 },
    }));
    expect((await env.browser.get(env.url('/filtres-personnalises'))).json()).toHaveLength(1);
    const created = await env.browser.post(env.url('/filtres-personnalises/ajouter'), {
      type: 'movieIndex',
      label: 'UHD',
      filters: [],
    });
    expect(created.json()).toMatchObject({ id: 2, label: 'UHD' });
    expect(
      (
        await env.browser.post(env.url('/filtres-personnalises/ajouter'), {
          type: 'movieIndex',
          label: '',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('édition groupée : Radarr seulement, `PUT /movie/editor`', async () => {
    env.upstream.on('PUT', '/api/v3/movie/editor', []);
    const response = await env.browser.post(env.url('/films/bulk-update'), {
      movieIds: [1, 2],
      monitored: false,
    });
    if (kind === 'radarr') {
      expect(response.json()).toEqual({ ok: true });
      expect(env.upstream.callsTo('PUT', '/api/v3/movie/editor')[0]?.body).toEqual({
        movieIds: [1, 2],
        monitored: false,
      });
      expect(
        (await env.browser.post(env.url('/films/bulk-update'), { movieIds: [] })).statusCode,
      ).toBe(400);
    } else {
      expect(response.statusCode).toBe(404);
    }
  });
});
