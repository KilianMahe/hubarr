// SPDX-License-Identifier: AGPL-3.0-or-later
// Vuetify 4 avec le thème de Hubarr. Les composants sont importés à la demande
// par `vite-plugin-vuetify` ; les styles (`vuetify/styles`) sont chargés par
// `main.ts`, pas ici, pour que les tests puissent créer l'instance sans CSS.

import type { ResolvedTheme } from '@hubarr/shared';
import { inject, type InjectionKey, type Plugin } from 'vue';
import { createVuetify } from 'vuetify';
import { VAutocomplete, VSelect, VTextField } from 'vuetify/components';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import {
  THEME_CONTROLLER,
  createThemeController,
  type ThemeController,
  type ThemeControllerOptions,
} from '../theme/controller';
import { THEME_NAMES } from '../theme/vuetify-theme';

export type UiDensity = 'comfortable' | 'compact';

export interface HubarrVuetify {
  plugin: Plugin;
  theme: ThemeController;
  /** Densité de l'interface (`display_ui_density`) : défaut global des composants. */
  setDensity(density: UiDensity): void;
}

/** Défauts communs des champs de filtre (V13). */
export const FILTER_FIELD_DEFAULTS = { rounded: 'pill', hideDetails: true } as const;

const DENSITY: InjectionKey<(density: UiDensity) => void> = Symbol('hubarr-density');

/** Change la densité de l'interface ; sans effet hors de l'application (tests isolés). */
export function useDensity(): (density: UiDensity) => void {
  return inject(DENSITY, () => undefined);
}

export function createHubarrVuetify(
  initial: ResolvedTheme,
  options: ThemeControllerOptions = {},
): HubarrVuetify {
  const vuetify = createVuetify({
    // Icônes en SVG (`@mdi/js`, importées une à une) : pas de police d'icônes.
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // Champs de recherche, de filtre et de tri (P5c.2, V13) : arrondis en pilule,
    // sans message d'aide. Les champs de formulaire gardent `v-text-field`/`v-select`.
    aliases: {
      VFilterField: VTextField,
      VFilterSelect: VSelect,
      VFilterAutocomplete: VAutocomplete,
    },
    defaults: {
      VFilterField: FILTER_FIELD_DEFAULTS,
      VFilterSelect: FILTER_FIELD_DEFAULTS,
      VFilterAutocomplete: FILTER_FIELD_DEFAULTS,
    },
    theme: {
      // Remplis par le contrôleur ; déclarés ici pour exister dès la création.
      defaultTheme: THEME_NAMES.dark,
      themes: { [THEME_NAMES.dark]: { dark: true }, [THEME_NAMES.light]: { dark: false } },
    },
  });
  const theme = createThemeController(vuetify.theme, initial, options);
  const setDensity = (density: UiDensity) => {
    // `compact` resserre listes, champs et boutons ; `comfortable` garde les défauts de Vuetify.
    vuetify.defaults.value = {
      ...vuetify.defaults.value,
      global: {
        ...vuetify.defaults.value?.global,
        density: density === 'compact' ? 'compact' : 'default',
      },
    };
  };
  return {
    theme,
    setDensity,
    plugin: {
      install(app) {
        app.use(vuetify);
        app.provide(THEME_CONTROLLER, theme);
        app.provide(DENSITY, setDensity);
      },
    },
  };
}
