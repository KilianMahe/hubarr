// SPDX-License-Identifier: AGPL-3.0-or-later
// Thème résolu, tel que le serveur l'envoie dans `GET /api/bootstrap` : couleurs
// concrètes (hex) prêtes pour Vuetify, calculées par `resolveTheme()`.

import { z } from 'zod';
import { ACCENT_CHOICES } from '../theme/accents';
import { CLASSIC_THEME, THEME_PRESET_KEYS, type ThemePresetKey } from '../theme/presets';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/);
const opacity = z.number().min(0).max(1);

/** Palette d'une variante (claire ou sombre). */
export const themePaletteSchema = z.object({
  dark: z.boolean(),
  /** Fond de la page. */
  background: hexColor,
  /** Cartes, feuilles, menus : au-dessus du fond. */
  surface: hexColor,
  /** Second niveau de surface (pied de carte, zones en retrait). */
  surfaceAlt: hexColor,
  /** Tiroir de navigation : sous le fond en sombre. */
  sidebar: hexColor,
  /** Barre du haut, rendue avec `topbarOpacity` pour laisser voir le flou. */
  topbar: hexColor,
  topbarOpacity: opacity,
  /** Bordures : couleur et opacité (`--v-border-color`, `--v-border-opacity`). */
  border: hexColor,
  borderOpacity: opacity,
  /** Texte principal et secondaire ; `null` : valeurs par défaut de Vuetify (mode classique). */
  text: hexColor.nullable(),
  textMuted: hexColor.nullable(),
  /** Positif et négatif ; `null` : valeurs par défaut de Vuetify (mode classique). */
  success: hexColor.nullable(),
  error: hexColor.nullable(),
});
export type ThemePalette = z.infer<typeof themePaletteSchema>;

const themeCommon = {
  accent: z.enum(ACCENT_CHOICES),
  /** Couleur primaire effective (accent choisi, ou primaire du thème). */
  primary: hexColor,
};

export const resolvedThemeSchema = z.discriminatedUnion('kind', [
  /** Mode classique : deux variantes, bascule clair/sombre laissée à l'utilisateur. */
  z.object({
    kind: z.literal('classic'),
    key: z.literal(CLASSIC_THEME),
    ...themeCommon,
    dark: themePaletteSchema,
    light: themePaletteSchema,
  }),
  /** Préréglage : une palette fixe pour tout le monde, sans bascule. */
  z.object({
    kind: z.literal('preset'),
    key: z.enum(THEME_PRESET_KEYS as [ThemePresetKey, ...ThemePresetKey[]]),
    ...themeCommon,
    palette: themePaletteSchema,
  }),
]);
export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;

/** Variante choisie par l'utilisateur en mode classique (gardée dans le navigateur). */
export const THEME_MODES = ['dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

/**
 * Clé `localStorage` de la variante du mode classique (`tablerTheme` d'origine).
 * Reprise telle quelle dans `apps/web/public/theme-init.js`, qui ne peut rien importer.
 */
export const THEME_MODE_STORAGE_KEY = 'hubarr.theme-mode';
