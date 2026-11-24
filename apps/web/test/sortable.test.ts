// SPDX-License-Identifier: AGPL-3.0-or-later
// Glisser-déposer des listes réordonnables (souris et doigt, Pointer Events) :
// logique pure, puis la mise en page du tableau de bord déplacée par la
// poignée dans Paramètres → Affichage et dans le mode édition du tableau de
// bord.

import type { BootstrapServices, DashboardPage } from '@hubarr/shared';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import { moveItem, targetIndex } from '../src/app/sortable';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settingsOf, settle } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('logique', () => {
  it('déplacement d’un élément, bornes respectées', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('place visée : milieux des autres lignes au-dessus du pointeur', () => {
    // Lignes de 40 px : milieux à 20, 60, 100, 140.
    const mids = [20, 60, 100, 140];
    expect(targetIndex(mids, 1, 50)).toBe(1);
    expect(targetIndex(mids, 1, 70)).toBe(1);
    expect(targetIndex(mids, 1, 101)).toBe(2);
    expect(targetIndex(mids, 1, 10)).toBe(0);
    expect(targetIndex(mids, 0, 500)).toBe(3);
  });
});

/** Lignes réordonnables de 40 px de haut, dans l'ordre du document. */
function stubRowGeometry(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rows = [...document.querySelectorAll('[data-sortable-item]')];
    const i = Math.max(0, rows.indexOf(this));
    return {
      top: i * 40,
      height: 40,
      bottom: i * 40 + 40,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: i * 40,
      toJSON: () => ({}),
    };
  });
}

/** Glisse la poignée jusqu'à `y`, comme le ferait un doigt. */
async function drag(handle: Pick<DOMWrapper<Element>, 'trigger'>, y: number): Promise<void> {
  await handle.trigger('pointerdown', { pointerType: 'touch', pointerId: 1, clientY: 0 });
  await handle.trigger('pointermove', { pointerType: 'touch', pointerId: 1, clientY: y });
  await handle.trigger('pointerup', { pointerType: 'touch', pointerId: 1, clientY: y });
  await settle();
}

describe('mise en page du tableau de bord', () => {
  it('Paramètres → Affichage : la poignée déplace la section, ordre enregistré', async () => {
    const { calls } = fakeFetch({
      'GET /api/admin/settings': () => ({ body: settingsOf() }),
      'GET /api/health/services': () => ({ status: 404 }),
      'POST /api/admin/settings': () => ({ body: settingsOf() }),
    });
    const { wrapper } = await mountApp(
      '/admin/settings#section-display',
      bootstrapOf({ user: ADMIN }),
    );
    mounted.push(wrapper);
    await settle();
    stubRowGeometry();
    const before = wrapper
      .findAll('[data-dashboard-row]')
      .map((r) => r.attributes('data-dashboard-row'));
    // Première section glissée sous la troisième (milieu de la 3e à 100 px).
    const handle = wrapper.findAll('[data-dashboard-row] [data-test="layout-drag"]')[0];
    if (handle === undefined) throw new Error('poignée absente');
    await drag(handle, 110);
    const after = wrapper
      .findAll('[data-dashboard-row]')
      .map((r) => r.attributes('data-dashboard-row'));
    expect(after).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    await wrapper.get('#section-display form').trigger('submit');
    await settle();
    const save = calls.find((c) => c.method === 'POST' && c.url === '/api/admin/settings');
    expect((save?.body as { dashboard: { order: string[] } }).dashboard.order.slice(0, 3)).toEqual(
      after.slice(0, 3),
    );
  });

  it('mode édition du tableau de bord : la poignée déplace la section', async () => {
    const layout = [
      { key: 'health', visible: true },
      { key: 'upcoming', visible: true },
      { key: 'recent', visible: true },
    ] as DashboardPage['layout'];
    const page: DashboardPage = {
      layout,
      configured: {
        radarr: true,
        sonarr: false,
        seerr: false,
        tmdb: false,
        tautulli: false,
        transmission: false,
        tracearr: false,
        emby: false,
        downloads: false,
      },
      watchlist: [],
    };
    const services: BootstrapServices = {
      states: { radarr: { configured: true, disabled: false } },
      instances: {
        radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
        sonarr: [],
      },
      sidebar: {},
    };
    const { calls } = fakeFetch({
      'GET /api/health/services': () => ({ status: 404 }),
      'GET /api/tableau-de-bord': () => ({ body: page }),
      'POST /api/admin/settings': () => ({ body: settingsOf() }),
    });
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    await wrapper.get('[data-test="layout-edit"]').trigger('click');
    await settle();
    stubRowGeometry();
    // Dernière section remontée en tête.
    await drag(wrapper.get('[data-test="layout-row-recent"] [data-test="layout-drag"]'), 5);
    await wrapper.get('[data-test="layout-save"]').trigger('click');
    await settle();
    const save = calls.find((c) => c.method === 'POST' && c.url === '/api/admin/settings');
    expect((save?.body as { dashboard: { order: string[] } }).dashboard.order).toEqual([
      'recent',
      'health',
      'upcoming',
    ]);
  });
});
