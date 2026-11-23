// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, profils (P3b.2) : qualité, profils de délai, formats
// personnalisés, auto-tags, étiquettes — pour Radarr et Sonarr.

import { ARR_KINDS, type ArrTagUsage, type AutoTagsPage, type QualityPage } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminEnv, type AdminEnv } from './admin-env';

describe.each(ARR_KINDS)('profils (%s)', (kind) => {
  let env: AdminEnv;
  beforeEach(async () => {
    env = await adminEnv(kind);
  });
  afterEach(async () => {
    await env.close();
  });

  it('page qualité : profils, définitions conformes, formats, langues (Radarr), limites', async () => {
    env.upstream.on('GET', '/api/v3/qualityprofile', [{ id: 1, name: 'HD', items: [] }]);
    env.upstream.on('GET', '/api/v3/qualitydefinition', [
      { id: 3, title: 'HDTV-720p', quality: { id: 4, name: 'HDTV-720p' }, minSize: 0 },
      { title: 'sans id' },
    ]);
    env.upstream.on('GET', '/api/v3/customformat', [{ id: 7, name: 'Remux' }, { name: 'x' }]);
    env.upstream.on('GET', '/api/v3/language', [{ id: -1, name: 'Any' }]);
    env.upstream.on('GET', '/api/v3/qualitydefinition/limits', { min: 0, max: 2000 });
    const response = await env.browser.get(env.url('/qualite'));
    expect(response.statusCode).toBe(200);
    const page = response.json<QualityPage>();
    expect(page.profiles).toEqual([{ id: 1, name: 'HD', items: [] }]);
    expect(page.definitions.map((definition) => definition.id)).toEqual([3]);
    expect(page.customFormats).toEqual([{ id: 7, name: 'Remux' }]);
    expect(page.languages).toEqual(kind === 'radarr' ? [{ id: -1, name: 'Any' }] : []);
    expect(page.limits).toEqual({ min: 0, max: 2000 });
    expect(env.upstream.callsTo('GET', '/api/v3/language')).toHaveLength(kind === 'radarr' ? 1 : 0);
  });

  it('limites illisibles → `null` ; page qualité malgré tout', async () => {
    env.upstream.on('GET', '/api/v3/qualityprofile', []);
    env.upstream.on('GET', '/api/v3/qualitydefinition', []);
    env.upstream.on('GET', '/api/v3/customformat', []);
    env.upstream.on('GET', '/api/v3/language', []);
    env.upstream.on('GET', '/api/v3/qualitydefinition/limits', { foo: 1 });
    expect((await env.browser.get(env.url('/qualite'))).json<QualityPage>().limits).toBeNull();
    expect((await env.browser.get(env.url('/qualite/definitions/limites'))).json()).toBeNull();
  });

  it('profil de qualité : ajout, modification avec l’id du chemin, suppression', async () => {
    env.upstream.on('POST', '/api/v3/qualityprofile', { id: 9, name: 'UHD' });
    env.upstream.on('PUT', '/api/v3/qualityprofile/9', { id: 9, name: 'UHD+' });
    env.upstream.on('DELETE', '/api/v3/qualityprofile/9');
    const created = await env.browser.post(env.url('/qualite/profils/ajouter'), {
      name: 'UHD',
      cutoff: 19,
      items: [{ quality: { id: 19, name: 'Bluray-2160p' }, allowed: true, items: [] }],
      extra: 'kept',
    });
    expect(created.json()).toEqual({ id: 9, name: 'UHD' });
    expect(env.upstream.callsTo('POST', '/api/v3/qualityprofile')[0]?.body).toMatchObject({
      name: 'UHD',
      extra: 'kept',
    });
    await env.browser.post(env.url('/qualite/profils/9/modifier'), { id: 3, name: 'UHD+' });
    expect(env.upstream.callsTo('PUT', '/api/v3/qualityprofile/9')[0]?.body).toMatchObject({
      id: 9,
      name: 'UHD+',
    });
    expect((await env.browser.post(env.url('/qualite/profils/9/supprimer'))).json()).toEqual({
      ok: true,
    });
  });

  it('profil sans nom → 400 avec la clé de l’original', async () => {
    const response = await env.browser.post(env.url('/qualite/profils/ajouter'), { name: ' ' });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain(
      'media.arr_admin.quality.error_name_required',
    );
  });

  it('refus de l’instance → 502 avec son message (validation)', async () => {
    env.upstream.on(
      'POST',
      '/api/v3/qualityprofile',
      [{ propertyName: 'Cutoff', errorMessage: 'Cutoff must be an allowed quality' }],
      400,
    );
    const response = await env.browser.post(env.url('/qualite/profils/ajouter'), { name: 'x' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      code: 'UPSTREAM_ERROR',
      message: 'Cutoff: Cutoff must be an allowed quality',
    });
  });

  it('définitions : enregistrement groupé par `PUT /qualitydefinition/update`', async () => {
    env.upstream.on('PUT', '/api/v3/qualitydefinition/update', []);
    const definitions = [{ id: 1, title: 'SD', minSize: 1, maxSize: 100, preferredSize: 50 }];
    const response = await env.browser.post(
      env.url('/qualite/definitions/sauvegarder'),
      definitions,
    );
    expect(response.json()).toEqual({ ok: true });
    expect(env.upstream.callsTo('PUT', '/api/v3/qualitydefinition/update')[0]?.body).toEqual(
      definitions,
    );
  });

  it('profils de délai triés par ordre ; CRUD', async () => {
    env.upstream.on('GET', '/api/v3/delayprofile', [
      { id: 2, order: 5, tags: [1] },
      { id: 1, order: 2147483647, tags: [] },
      { id: 3, order: 1, tags: [2] },
    ]);
    const list = await env.browser.get(env.url('/profils-delai'));
    expect(list.json<{ id: number }[]>().map((profile) => profile.id)).toEqual([3, 2, 1]);
    env.upstream.on('POST', '/api/v3/delayprofile', { id: 4 });
    env.upstream.on('PUT', '/api/v3/delayprofile/4', { id: 4, usenetDelay: 60 });
    env.upstream.on('DELETE', '/api/v3/delayprofile/4');
    await env.browser.post(env.url('/profils-delai/ajouter'), { enableUsenet: true, tags: [1] });
    const updated = await env.browser.post(env.url('/profils-delai/4/modifier'), {
      usenetDelay: 60,
    });
    expect(updated.json()).toEqual({ id: 4, usenetDelay: 60 });
    expect((await env.browser.post(env.url('/profils-delai/4/supprimer'))).statusCode).toBe(200);
  });

  it('formats : liste, modèles de conditions, CRUD', async () => {
    env.upstream.on('GET', '/api/v3/customformat', [{ id: 1, name: 'Remux', specifications: [] }]);
    env.upstream.on('GET', '/api/v3/customformat/schema', [
      { implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', type: 'textbox' }] },
    ]);
    expect((await env.browser.get(env.url('/formats'))).json()).toHaveLength(1);
    expect((await env.browser.get(env.url('/formats/schema'))).json()).toEqual([
      { implementation: 'ReleaseTitleSpecification', fields: [{ name: 'value', type: 'textbox' }] },
    ]);
    env.upstream.on('POST', '/api/v3/customformat', { id: 2, name: 'HDR' });
    const created = await env.browser.post(env.url('/formats/ajouter'), {
      name: 'HDR',
      specifications: [{ name: 'hdr', implementation: 'ReleaseTitleSpecification', fields: [] }],
    });
    expect(created.json()).toEqual({ id: 2, name: 'HDR' });
    const unnamed = await env.browser.post(env.url('/formats/ajouter'), { name: '' });
    expect(JSON.stringify(unnamed.json())).toContain('custom_formats.error_name_required');
  });

  it('auto-tags : règles, modèles de conditions et étiquettes ; modèles en échec → []', async () => {
    env.upstream.on('GET', '/api/v3/autotagging', [{ id: 1, name: 'Anime', tags: [2] }]);
    env.upstream.on('GET', '/api/v3/autotagging/schema', undefined, 500);
    env.upstream.on('GET', '/api/v3/tag', [{ id: 2, label: 'anime' }, { id: 'x' }]);
    const page = (await env.browser.get(env.url('/auto-tags'))).json<AutoTagsPage>();
    expect(page).toEqual({
      rules: [{ id: 1, name: 'Anime', tags: [2] }],
      schema: [],
      tags: [{ id: 2, label: 'anime' }],
    });
    env.upstream.on('PUT', '/api/v3/autotagging/1', { id: 1, name: 'Anime' });
    await env.browser.post(env.url('/auto-tags/1/modifier'), { name: 'Anime', tags: [2] });
    expect(env.upstream.callsTo('PUT', '/api/v3/autotagging/1')[0]?.body).toEqual({
      id: 1,
      name: 'Anime',
      tags: [2],
    });
  });

  it('étiquettes : usage compté sur toutes les listes d’ids, tri par nom', async () => {
    env.upstream.on('GET', '/api/v3/tag/detail', [
      {
        id: 2,
        label: 'zeta',
        delayProfileIds: [1],
        indexerIds: [],
        movieIds: [3, 4],
        seriesIds: [],
      },
      { id: 1, label: 'alpha', notificationIds: [] },
    ]);
    const tags = (await env.browser.get(env.url('/tags'))).json<ArrTagUsage[]>();
    expect(tags).toEqual([
      { id: 1, label: 'alpha', usage: 0 },
      { id: 2, label: 'zeta', usage: 3 },
    ]);
  });

  it('étiquettes : ajout, renommage (corps `{ id, label }`), libellé vide refusé', async () => {
    env.upstream.on('POST', '/api/v3/tag', { id: 5, label: 'hd' });
    env.upstream.on('PUT', '/api/v3/tag/5', { id: 5, label: 'uhd' });
    expect((await env.browser.post(env.url('/tags/ajouter'), { label: ' hd ' })).json()).toEqual({
      id: 5,
      label: 'hd',
    });
    expect(env.upstream.callsTo('POST', '/api/v3/tag')[0]?.body).toEqual({ label: 'hd' });
    expect((await env.browser.post(env.url('/tags/5/renommer'), { label: 'uhd' })).json()).toEqual({
      id: 5,
      label: 'uhd',
    });
    expect(env.upstream.callsTo('PUT', '/api/v3/tag/5')[0]?.body).toEqual({ id: 5, label: 'uhd' });
    const empty = await env.browser.post(env.url('/tags/5/renommer'), { label: '' });
    expect(empty.statusCode).toBe(400);
    expect(JSON.stringify(empty.json())).toContain('media.api.label_required');
  });

  it('étiquette encore utilisée → 409 `media.api.tag_still_used`', async () => {
    env.upstream.on(
      'DELETE',
      '/api/v3/tag/5',
      { message: "'hd' cannot be deleted since it's still in use" },
      409,
    );
    const response = await env.browser.post(env.url('/tags/5/supprimer'));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ message: 'media.api.tag_still_used' });
    env.upstream.on('DELETE', '/api/v3/tag/6');
    expect((await env.browser.post(env.url('/tags/6/supprimer'))).json()).toEqual({ ok: true });
  });

  it('réservé aux admins, CSRF exigé', async () => {
    const response = await env.app.inject({
      method: 'POST',
      url: env.url('/tags/ajouter'),
      payload: { label: 'x' },
    });
    expect([401, 403]).toContain(response.statusCode);
  });
});
