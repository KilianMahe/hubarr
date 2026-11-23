// SPDX-License-Identifier: AGPL-3.0-or-later
// Pilotage du thème à l'exécution : thème résolu (du bootstrap, puis des
// réglages en P1.5), variante du mode classique et bascule. Fourni à l'appli
// par le plugin Vuetify (`useHubarrTheme()`).

import type { ResolvedTheme, ServiceId, ThemeMode } from '@hubarr/shared';
import {
  computed,
  inject,
  readonly,
  ref,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';
import type { ThemeInstance } from 'vuetify';
import { readThemeMode, syncDocument, writeThemeMode } from './mode';
import { activePalette, activeThemeName, themeDefinitions, withBase } from './vuetify-theme';

export interface ThemeController {
  readonly theme: Readonly<Ref<ResolvedTheme>>;
  readonly mode: Readonly<Ref<ThemeMode>>;
  /** Vrai en mode classique : la bascule clair/sombre est proposée. */
  readonly toggleable: ComputedRef<boolean>;
  /** Variante réellement affichée (celle du préréglage, ou celle choisie). */
  readonly dark: ComputedRef<boolean>;
  /** Remplace le thème (changement de réglage) sans recharger la page. */
  apply(theme: ResolvedTheme): void;
  setMode(mode: ThemeMode): void;
  /** Bascule clair/sombre ; sans effet avec un préréglage. */
  toggle(): void;
  /** Service dont la vue est affichée (accent par service), ou `null`. */
  readonly service: Readonly<Ref<ServiceId | null>>;
  setService(service: ServiceId | null): void;
}

export const THEME_CONTROLLER: InjectionKey<ThemeController> = Symbol('hubarr-theme');

export interface ThemeControllerOptions {
  storage?: Storage;
  document?: Document;
}

export function createThemeController(
  vuetifyTheme: ThemeInstance,
  initial: ResolvedTheme,
  options: ThemeControllerOptions = {},
): ThemeController {
  const theme = shallowRef(initial);
  const mode = ref<ThemeMode>(readThemeMode(options.storage));
  const service = ref<ServiceId | null>(null);

  function sync(): void {
    const definitions = themeDefinitions(theme.value, service.value);
    for (const [name, definition] of Object.entries(definitions)) {
      // Fusion sur le thème de base de Vuetify, comme `createVuetify` le fait au démarrage.
      const base = vuetifyTheme.themes.value[definition.dark ? 'dark' : 'light'];
      vuetifyTheme.themes.value[name] = withBase(definition, base);
    }
    // Sans transition (option `transition` désactivée) : la promesse est déjà résolue.
    void vuetifyTheme.change(activeThemeName(theme.value, mode.value));
    syncDocument(mode.value, activePalette(theme.value, mode.value), options.document);
  }

  const controller: ThemeController = {
    theme: readonly(theme),
    mode: readonly(mode),
    toggleable: computed(() => theme.value.kind === 'classic'),
    dark: computed(() => activePalette(theme.value, mode.value).dark),
    apply(next) {
      theme.value = next;
      sync();
    },
    setMode(next) {
      mode.value = next;
      writeThemeMode(next, options.storage);
      sync();
    },
    toggle() {
      if (theme.value.kind !== 'classic') return;
      controller.setMode(mode.value === 'dark' ? 'light' : 'dark');
    },
    service: readonly(service),
    setService(next) {
      if (service.value === next) return;
      service.value = next;
      sync();
    },
  };
  sync();
  return controller;
}

export function useHubarrTheme(): ThemeController {
  const controller = inject(THEME_CONTROLLER);
  if (!controller) throw new Error('useHubarrTheme() exige le plugin Vuetify de Hubarr');
  return controller;
}
