// SPDX-License-Identifier: AGPL-3.0-or-later
// Design system commun (P5b.3) : rendu des composants partagés,
// geste « tirer pour rafraîchir », et garde-fou contre les classes
// utilitaires absentes de Vuetify 4 (cause des textes collés, P5b.1 Q1/Q2).

import { mount } from '@vue/test-utils';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { h } from 'vue';
import BulkActionBar from '../src/components/ds/BulkActionBar.vue';
import MetaLine from '../src/components/ds/MetaLine.vue';
import PosterCard from '../src/components/ds/PosterCard.vue';
import StatTile from '../src/components/ds/StatTile.vue';
import { pullDistance, PULL_THRESHOLD } from '../src/components/ds/pull';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import { resolveTheme } from '@hubarr/shared';

const vuetify = createHubarrVuetify(resolveTheme(undefined, undefined));
const global = { plugins: [i18n, vuetify.plugin] };

beforeAll(async () => {
  await setLocale('fr');
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(vue|ts)$/.test(name) ? [path] : [];
  });
}

describe('design system', () => {
  it('aucune classe de gouttière inexistante (Vuetify 4 : gc-*, gr-*)', () => {
    const offenders = sources(join(__dirname, '../src')).filter((file) =>
      /\bga-[xy]-\d/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('chaque dialogue a la croix de fermeture commune (`DialogTitle` ou `dialog-close`)', () => {
    // Dialogues construits à la main (hors `ResponsiveDialog`, qui l'intègre).
    const offenders = sources(join(__dirname, '../src'))
      .filter((file) => file.endsWith('.vue'))
      .filter((file) => {
        const code = readFileSync(file, 'utf8');
        const opens = /<v-dialog\b|<v-bottom-sheet\b|VBottomSheet : VDialog/.test(code);
        return opens && !/<DialogTitle\b|data-test="dialog-close"|<TmdbDetailBody\b/.test(code);
      });
    expect(offenders).toEqual([]);
  });

  it('MetaLine : un séparateur entre chaque élément', () => {
    const wrapper = mount(MetaLine, {
      global,
      slots: { default: () => [h('span', 'a'), h('span', 'b'), h('span', 'c')] },
    });
    expect(wrapper.classes()).toContain('meta-line');
    expect(wrapper.findAll('.meta-line__items > span')).toHaveLength(3);
  });

  it('StatTile : bouton seulement si cliquable, état pressé', async () => {
    const plain = mount(StatTile, { global, props: { value: 4, label: 'Total' } });
    expect((plain.element as HTMLElement).tagName).toBe('DIV');
    const tile = mount(StatTile, {
      global,
      props: { value: 1, label: 'Pause', clickable: true, active: true, unit: 'Go' },
    });
    expect((tile.element as HTMLElement).tagName).toBe('BUTTON');
    expect(tile.attributes('aria-pressed')).toBe('true');
    expect(tile.text()).toContain('Go');
    await tile.trigger('click');
    expect(tile.emitted('click')).toHaveLength(1);
  });

  it('PosterCard : état en clair, qualité, sélection', async () => {
    const card = mount(PosterCard, {
      global,
      props: {
        title: 'Archipel',
        subtitle: '2011',
        status: { label: 'Téléchargé', color: 'success' },
        quality: 'Bluray-1080p',
      },
    });
    expect(card.find('[data-test="status-chip"]').text()).toBe('Téléchargé');
    expect(card.find('[data-test="quality-chip"]').attributes('title')).toBe('Bluray-1080p');
    await card.find('button').trigger('click');
    expect(card.emitted('open')).toHaveLength(1);
    await card.setProps({ selectMode: true });
    await card.find('button').trigger('click');
    expect(card.emitted('select')).toHaveLength(1);
  });

  it('BulkActionBar : compteur pluriel et sortie', async () => {
    const bar = mount(BulkActionBar, { global, props: { count: 3 } });
    expect(bar.find('[data-test="bulk-count"]').text()).toBe('3 sélectionnés');
    await bar.find('[data-test="bulk-clear"]').trigger('click');
    expect(bar.emitted('clear')).toHaveLength(1);
  });

  it('tirer pour rafraîchir : amorti, plafonné, rien vers le haut', () => {
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(60)).toBe(30);
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
    expect(pullDistance(1000)).toBe(96);
  });
});
