// SPDX-License-Identifier: AGPL-3.0-or-later
// Choix mémorisé par appareil (P5c.2, V15) et sélecteur commun des modes (V14).

import { mount } from '@vue/test-utils';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { readStoredChoice, storeChoice } from '../src/app/view-mode';
import ViewModeMenu from '../src/components/ds/ViewModeMenu.vue';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import { resolveTheme } from '@hubarr/shared';

const vuetify = createHubarrVuetify(resolveTheme(undefined, undefined));
const global = { plugins: [i18n, vuetify.plugin] };
const MODES = ['grid', 'table'] as const;

beforeAll(async () => {
  await setLocale('fr');
});
beforeEach(() => {
  localStorage.clear();
});

describe('mode d’affichage mémorisé (V15)', () => {
  it('relit la valeur connue, ignore une valeur inconnue ou un stockage absent', () => {
    expect(readStoredChoice('k', MODES, 'grid')).toBe('grid');
    localStorage.setItem('k', 'table');
    expect(readStoredChoice('k', MODES, 'grid')).toBe('table');
    localStorage.setItem('k', 'mosaic');
    expect(readStoredChoice('k', MODES, 'grid')).toBe('grid');
    expect(readStoredChoice('k', MODES, 'grid', null)).toBe('grid');
  });

  it('un stockage qui refuse l’écriture ne fait pas échouer la vue', () => {
    const failing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(readStoredChoice('k', MODES, 'table', failing)).toBe('table');
    expect(() => {
      storeChoice('k', 'grid', failing);
    }).not.toThrow();
  });
});

describe('ViewModeMenu (V14)', () => {
  it('menu des modes avec le mode courant coché ; un choix met à jour le modèle', async () => {
    const model = ref<string>('grid');
    const wrapper = mount(ViewModeMenu, {
      global,
      attachTo: document.body,
      props: {
        options: [
          { value: 'grid', icon: 'M0', label: 'Grille' },
          { value: 'table', icon: 'M1', label: 'Tableau' },
        ],
        label: 'Affichage',
        testId: 'demo-view',
        modelValue: model.value,
        'onUpdate:modelValue': (value: string) => {
          model.value = value;
        },
      },
    });
    const activator = wrapper.get('[data-test="demo-view-menu"]');
    expect(activator.attributes('aria-label')).toBe('Affichage : Grille');
    await activator.trigger('click');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    document.querySelector<HTMLElement>('[data-test="view-table"]')?.click();
    await nextTick();
    expect(model.value).toBe('table');
    wrapper.unmount();
  });
});

describe('champs de filtre (V13)', () => {
  it('v-filter-field et v-filter-select : arrondis en pilule, sans message d’aide', () => {
    const wrapper = mount(
      {
        template:
          '<div><v-filter-field label="Q" /><v-filter-select label="S" :items="[]" /></div>',
      },
      { global },
    );
    const fields = wrapper.findAll('.v-field');
    expect(fields).toHaveLength(2);
    for (const field of fields) expect(field.classes()).toContain('rounded-pill');
    expect(wrapper.find('.v-input__details').exists()).toBe(false);
  });
});
