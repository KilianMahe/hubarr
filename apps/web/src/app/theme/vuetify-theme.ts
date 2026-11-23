// SPDX-License-Identifier: AGPL-3.0-or-later
// Traduction du thème résolu par le serveur (`ResolvedTheme`) en thèmes Vuetify.
//
// Deux thèmes Vuetify sont toujours enregistrés, `hubarrDark` et `hubarrLight`.
// En mode classique, ils portent les deux variantes et la bascule passe de
// l'un à l'autre ; avec un préréglage, celui qui correspond à la palette
// (sombre ou claire) la reçoit et devient actif. Chaque définition est fusionnée
// sur le thème de base de Vuetify (`dark` ou `light`) : une couleur absente de
// la palette (texte, états du mode classique) garde la valeur du framework.

import {
  ensureContrast,
  mixHex,
  serviceAccentColors,
  type ResolvedTheme,
  type ServiceId,
  type ThemeMode,
  type ThemePalette,
} from '@hubarr/shared';
import type { ThemeDefinition, ThemeInstance } from 'vuetify';

export const THEME_NAMES = { dark: 'hubarrDark', light: 'hubarrLight' } as const;
export type HubarrThemeName = (typeof THEME_NAMES)[keyof typeof THEME_NAMES];

/** Thème tel que Vuetify le stocke (`theme.themes.value[nom]`). */
export type VuetifyTheme = ThemeInstance['themes']['value'][string];

/** Thème de base à compléter : couleurs Vuetify de tout format (hex, nombre, RGB). */
export interface BaseTheme {
  colors: Record<string, unknown>;
  variables: Record<string, unknown>;
}

const HEX = /^#[0-9a-f]{6}$/i;

function hexOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

export type Definition = Required<Pick<ThemeDefinition, 'dark'>> & {
  colors: Record<string, string>;
  variables: Record<string, string | number>;
};

/**
 * Couleurs et variables Vuetify d'une palette. Couleurs personnalisées
 * (Vuetify en tire les classes `bg-*` et `text-*`) : `surface-alt`, `sidebar`,
 * `topbar`, `muted` (texte secondaire) ; variables `border-color`,
 * `border-opacity`, `topbar-opacity`. Sans texte secondaire (mode classique),
 * `muted` est complété à la fusion (`withBase`). S'y ajoutent les couleurs
 * d'accent de service (`service`, `service-bar`…), celles de
 * l'accent du thème hors d'une vue de service.
 */
export function definitionFor(
  palette: ThemePalette,
  primary: string,
  service: ServiceId | null = null,
): Definition {
  const colors: Record<string, string> = {
    background: palette.background,
    surface: palette.surface,
    'surface-alt': palette.surfaceAlt,
    sidebar: palette.sidebar,
    topbar: palette.topbar,
    // Accessibilité (P5.5) : la primaire sert aussi de couleur de
    // texte (boutons texte, liens) ; elle atteint 4,5:1 sur les cartes.
    primary: ensureContrast(primary, palette.surface),
    ...serviceAccentColors(palette, primary, service),
  };
  if (palette.text !== null) {
    colors['on-background'] = palette.text;
    colors['on-surface'] = palette.text;
  }
  const variables: Record<string, string | number> = {
    'border-color': palette.border,
    'border-opacity': palette.borderOpacity,
    'topbar-opacity': palette.topbarOpacity,
  };
  if (palette.textMuted !== null) colors.muted = palette.textMuted;
  if (palette.success !== null) colors.success = palette.success;
  if (palette.error !== null) colors.error = palette.error;
  return { dark: palette.dark, colors, variables };
}

/**
 * Thème Vuetify complet : définition fusionnée sur le thème de base (`dark` ou
 * `light`). Sans `muted`, le texte secondaire est le texte du framework en
 * emphase moyenne, rendu opaque sur le fond (même aspect que
 * `text-medium-emphasis`, mais utilisable comme couleur).
 */
export function withBase(definition: Definition, base: BaseTheme | undefined): VuetifyTheme {
  const colors: Record<string, unknown> = { ...base?.colors, ...definition.colors };
  const variables: Record<string, unknown> = { ...base?.variables, ...definition.variables };
  if (definition.colors.muted === undefined) {
    const text = hexOr(colors['on-surface'], definition.dark ? '#ffffff' : '#000000');
    const background = hexOr(colors.background, definition.dark ? '#000000' : '#ffffff');
    const emphasis = Number(variables['medium-emphasis-opacity'] ?? 0.7);
    colors.muted = mixHex(text, background, Number.isFinite(emphasis) ? emphasis : 0.7);
  }
  // Les clés obligatoires (primary, secondary…) viennent du thème de base de Vuetify.
  return { dark: definition.dark, colors, variables } as VuetifyTheme;
}

/** Palette affichée : variante choisie en mode classique, palette fixe sinon. */
export function activePalette(theme: ResolvedTheme, mode: ThemeMode): ThemePalette {
  if (theme.kind === 'preset') return theme.palette;
  return mode === 'light' ? theme.light : theme.dark;
}

export function activeThemeName(theme: ResolvedTheme, mode: ThemeMode): HubarrThemeName {
  return activePalette(theme, mode).dark ? THEME_NAMES.dark : THEME_NAMES.light;
}

/** Définitions des deux thèmes Vuetify pour un thème résolu, et l'accent du service affiché. */
export function themeDefinitions(
  theme: ResolvedTheme,
  service: ServiceId | null = null,
): Record<HubarrThemeName, Definition> {
  if (theme.kind === 'classic') {
    return {
      [THEME_NAMES.dark]: definitionFor(theme.dark, theme.primary, service),
      [THEME_NAMES.light]: definitionFor(theme.light, theme.primary, service),
    };
  }
  // L'autre nom garde une définition valide (palette fixe dans les deux),
  // pour qu'un composant forcé sur `hubarrLight` ou `hubarrDark` reste lisible.
  const fixed = definitionFor(theme.palette, theme.primary, service);
  return { [THEME_NAMES.dark]: fixed, [THEME_NAMES.light]: fixed };
}
