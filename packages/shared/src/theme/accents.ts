// SPDX-License-Identifier: AGPL-3.0-or-later
// Couleurs d'accent (`display_theme_color`, `AdminSettingsController::DISPLAY_OPTIONS`
// d'origine). `theme_default` suit la couleur primaire du thème actif.

export const ACCENT_COLORS = {
  indigo: '#6366f1',
  red: '#ef4444',
  green: '#22c55e',
  orange: '#f59e0b',
  pink: '#ec4899',
  blue: '#3b82f6',
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;

export const THEME_DEFAULT_ACCENT = 'theme_default';

/** Valeurs admises pour `display_theme_color`, dans l'ordre du sélecteur d'origine. */
export const ACCENT_CHOICES = [
  THEME_DEFAULT_ACCENT,
  ...(Object.keys(ACCENT_COLORS) as AccentColor[]),
] as [typeof THEME_DEFAULT_ACCENT, ...AccentColor[]];
export type AccentChoice = (typeof ACCENT_CHOICES)[number];

export const DEFAULT_ACCENT: AccentChoice = THEME_DEFAULT_ACCENT;

/** Accent du mode classique quand `theme_default` est choisi (pas de primaire de préréglage). */
export const CLASSIC_ACCENT: AccentColor = 'indigo';

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === 'string' && Object.hasOwn(ACCENT_COLORS, value);
}
