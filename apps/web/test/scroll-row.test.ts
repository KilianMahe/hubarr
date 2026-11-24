// SPDX-License-Identifier: AGPL-3.0-or-later
// Rangée horizontale commune (`ScrollRow`) : pas de barre de défilement, une
// flèche par côté seulement s'il reste à voir, défilement des trois quarts de
// la largeur visible, attributs portés par la piste.

import { resolveTheme } from '@hubarr/shared';
import { mount } from '@vue/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import ScrollRow from '../src/components/ScrollRow.vue';

const vuetify = createHubarrVuetify(resolveTheme(undefined, undefined));
const global = { plugins: [i18n, vuetify.plugin] };

beforeAll(async () => {
  await setLocale('en');
});

/** Géométrie de la piste : largeur visible 400, contenu `scrollWidth`. */
function geometry(track: HTMLElement, scrollWidth: number, scrollLeft = 0): void {
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scrollWidth });
  track.scrollLeft = scrollLeft;
}

describe('ScrollRow', () => {
  it('flèches selon la position, défilement au clic, attributs sur la piste', async () => {
    const wrapper = mount(ScrollRow, {
      global,
      attrs: { role: 'list', 'data-test': 'row' },
      props: { itemWidth: '120px' },
      slots: { default: () => [h('div', { role: 'listitem' }, 'A')] },
    });
    const track = wrapper.get('[data-test="row"]');
    expect(track.classes()).toContain('scroll-row__track');
    expect(track.attributes('role')).toBe('list');
    expect(track.attributes('style')).toContain('grid-auto-columns: 120px');
    const el = track.element as HTMLElement;
    // `v-show` : flèche masquée par `display: none`.
    const shown = (test: string) =>
      !(wrapper.get(`[data-test="${test}"]`).attributes('style') ?? '').includes('display: none');
    const prev = () => shown('scroll-prev');
    const next = () => shown('scroll-next');

    // Tout tient : aucune flèche.
    geometry(el, 400);
    await track.trigger('scroll');
    expect([prev(), next()]).toEqual([false, false]);

    // Début d'une rangée plus large : flèche suivante seulement.
    geometry(el, 1200);
    await track.trigger('scroll');
    expect([prev(), next()]).toEqual([false, true]);
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy;
    await wrapper.get('[data-test="scroll-next"]').trigger('click');
    expect(scrollBy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });

    // Milieu, puis fin.
    geometry(el, 1200, 400);
    await track.trigger('scroll');
    expect([prev(), next()]).toEqual([true, true]);
    geometry(el, 1200, 800);
    await track.trigger('scroll');
    await nextTick();
    expect([prev(), next()]).toEqual([true, false]);
    await wrapper.get('[data-test="scroll-prev"]').trigger('click');
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -300, behavior: 'smooth' });
    wrapper.unmount();
  });
});
