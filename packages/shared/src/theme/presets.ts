// SPDX-License-Identifier: AGPL-3.0-or-later
// Préréglages de thème (`ThemePresets` d'origine), repris à l'identique : HSL
// du fond, de la couleur primaire, du positif et du négatif, multiplicateurs
// de contraste et de saturation du texte, et indicateur « clair ». Valeurs
// tirées du modèle de thèmes de glance (https://github.com/glanceapp/glance/blob/main/docs/themes.md).
//
// `midnight` reproduit l'aspect sombre d'avant les thèmes (fond #111, primaire
// indigo) ; il sert aussi de variante sombre au mode « classique ».

import type { Hsl } from './color-math';

export interface ThemePreset {
  light: boolean;
  bg: Hsl;
  primary: Hsl;
  positive: Hsl;
  negative: Hsl;
  contrast: number;
  textSaturation: number;
}

export const THEME_PRESETS = {
  midnight: {
    light: false,
    bg: [0, 0, 6.5], // #111111
    primary: [239, 84, 66.8], // #6366f1 indigo
    positive: [142, 71, 45],
    negative: [0, 84, 60],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  nord: {
    light: false,
    bg: [220, 16, 22],
    primary: [213, 32, 70],
    positive: [92, 28, 65],
    negative: [354, 42, 56],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  catppuccin_latte: {
    light: true,
    bg: [220, 23, 95],
    primary: [220, 91, 54],
    positive: [109, 58, 40],
    negative: [347, 87, 44],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  catppuccin_frappe: {
    light: false,
    bg: [229, 19, 23],
    primary: [222, 74, 74],
    positive: [96, 44, 68],
    negative: [359, 68, 71],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  catppuccin_macchiato: {
    light: false,
    bg: [232, 23, 18],
    primary: [220, 83, 75],
    positive: [105, 48, 72],
    negative: [351, 74, 73],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  catppuccin_mocha: {
    light: false,
    bg: [240, 21, 15],
    primary: [217, 92, 83],
    positive: [115, 54, 76],
    negative: [347, 70, 65],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  dracula: {
    light: false,
    bg: [231, 15, 21],
    primary: [265, 89, 79],
    positive: [135, 94, 66],
    negative: [0, 100, 67],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  gruvbox_dark: {
    light: false,
    bg: [0, 0, 16],
    primary: [43, 59, 81],
    positive: [61, 66, 44],
    negative: [6, 96, 59],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  kanagawa_dark: {
    light: false,
    bg: [240, 13, 14],
    primary: [51, 33, 68],
    positive: [142, 40, 55],
    negative: [358, 100, 68],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  teal_city: {
    light: false,
    bg: [225, 14, 15],
    primary: [157, 47, 65],
    positive: [142, 45, 55],
    negative: [0, 75, 60],
    contrast: 1.1,
    textSaturation: 1.0,
  },
  camouflage: {
    light: false,
    bg: [186, 21, 20],
    primary: [97, 13, 80],
    positive: [142, 40, 55],
    negative: [0, 70, 60],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  tucan: {
    light: false,
    bg: [50, 1, 6],
    primary: [24, 97, 58],
    positive: [142, 45, 55],
    negative: [209, 88, 54],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  shades_of_purple: {
    light: false,
    bg: [243, 33, 25],
    primary: [50, 100, 49],
    positive: [98, 82, 71],
    negative: [12, 77, 52],
    contrast: 1.2,
    textSaturation: 1.0,
  },
  neon_pink: {
    light: false,
    bg: [240, 27, 11],
    primary: [321, 100, 71],
    positive: [165, 78, 51],
    negative: [360, 100, 71],
    contrast: 1.5,
    textSaturation: 1.0,
  },
  solarized_light: {
    light: true,
    bg: [44, 87, 94],
    primary: [205, 69, 49],
    positive: [68, 100, 30],
    negative: [1, 71, 52],
    contrast: 1.0,
    textSaturation: 1.0,
  },
  peachy: {
    light: true,
    bg: [28, 40, 77],
    primary: [155, 100, 20],
    positive: [142, 45, 40],
    negative: [0, 100, 60],
    contrast: 1.1,
    textSaturation: 0.5,
  },
  zebra: {
    light: true,
    bg: [0, 0, 95],
    primary: [0, 0, 10],
    positive: [142, 45, 40],
    negative: [0, 90, 50],
    contrast: 1.0,
    textSaturation: 1.0,
  },
} as const satisfies Record<string, ThemePreset>;

export type ThemePresetKey = keyof typeof THEME_PRESETS;

/** Préréglage de référence (variante sombre du mode classique). */
export const DEFAULT_THEME_PRESET = 'midnight' satisfies ThemePresetKey;

/**
 * Valeur « classique » de `display_theme` : pas un préréglage, mais l'aspect
 * d'origine avec la bascule clair/sombre manuelle. Valeur par défaut.
 */
export const CLASSIC_THEME = 'classic';

export const THEME_PRESET_KEYS = Object.keys(THEME_PRESETS) as ThemePresetKey[];

/** Valeurs admises pour `display_theme`, dans l'ordre du sélecteur d'origine. */
export const THEME_CHOICES = [CLASSIC_THEME, ...THEME_PRESET_KEYS] as [
  typeof CLASSIC_THEME,
  ...ThemePresetKey[],
];
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const DEFAULT_THEME: ThemeChoice = CLASSIC_THEME;

export function isThemePresetKey(value: unknown): value is ThemePresetKey {
  return typeof value === 'string' && Object.hasOwn(THEME_PRESETS, value);
}

/** Clé de traduction du libellé d'un thème (`admin.display.theme.preset.*`). */
export function themeLabelKey(choice: ThemeChoice): string {
  return `admin.display.theme.preset.${choice}`;
}
