// SPDX-License-Identifier: AGPL-3.0-or-later
// Résolution du thème choisi (`display_theme`) et de l'accent (`display_theme_color`)
// en couleurs concrètes : `ThemeService::resolve()` et `getThemeColorHex()` de
// `DisplayPreferencesService` d'origine. Les noms de variables Tabler disparaissent
// au profit d'une palette neutre que le front traduit en thème Vuetify.
//
// Les calculs (paliers de surface, bordure et texte selon le contraste) sont
// ceux de l'original ; seules les sorties passent en hex (Vuetify en a besoin
// pour ses tuples RGB).

import type { ResolvedTheme, ThemePalette } from '../schemas/theme';
import { ACCENT_COLORS, CLASSIC_ACCENT, THEME_DEFAULT_ACCENT, isAccentColor } from './accents';
import { clamp, ensureContrast, hslToHex } from './color-math';
import {
  CLASSIC_THEME,
  DEFAULT_THEME_PRESET,
  THEME_PRESETS,
  isThemePresetKey,
  type ThemePreset,
} from './presets';

/** Opacité de la barre du haut : le flou d'arrière-plan reste visible. */
const TOPBAR_OPACITY = 0.95;

const WHITE = '#ffffff';
const BLACK = '#000000';

/** Palette complète d'un préréglage (`ThemeService::resolvePreset`). */
export function resolvePresetPalette(preset: ThemePreset): ThemePalette {
  const { light, contrast, textSaturation } = preset;
  const [bh, bs, bl] = preset.bg;

  // Sombre : cartes au-dessus du fond, tiroir en dessous (#1c1c1c / #161616 /
  // #0d0d0d de midnight). Clair : tout tend vers le blanc.
  const surfaceL = clamp(bl + (light ? 3 : 4.5));
  const surfaceAltL = clamp(bl + (light ? 1.5 : 2));
  const sidebarL = clamp(bl + (light ? 3 : -1.5));

  // Bordure : voile noir ou blanc dont l'opacité suit le contraste.
  const borderOpacity = Math.round((light ? 0.1 : 0.08) * contrast * 1000) / 1000;

  // Texte : fort contraste avec le fond, saturation pondérée.
  const textSat = clamp(bs * textSaturation);
  const textL = light ? clamp(20 / contrast) : clamp(100 - 12 / contrast);
  const mutedL = light ? clamp(38 / contrast) : clamp(68 / contrast);

  const background = hslToHex(bh, bs, bl);
  const surface = hslToHex(bh, bs, surfaceL);
  // Accessibilité (P5.5) : le texte secondaire atteint 4,5:1 sur
  // le fond et sur les cartes (WCAG AA), au lieu de la seule formule d'origine
  // (2,4:1 sur certains préréglages).
  const textMuted = ensureContrast(
    ensureContrast(hslToHex(bh, textSat, mutedL), surface),
    background,
  );

  return {
    dark: !light,
    background,
    surface,
    surfaceAlt: hslToHex(bh, bs, surfaceAltL),
    sidebar: hslToHex(bh, bs, sidebarL),
    topbar: hslToHex(bh, bs, bl),
    topbarOpacity: TOPBAR_OPACITY,
    border: light ? BLACK : WHITE,
    borderOpacity,
    text: hslToHex(bh, textSat, textL),
    textMuted,
    success: hslToHex(...preset.positive),
    error: hslToHex(...preset.negative),
  };
}

/**
 * Variante sombre du mode classique : fond, surfaces, tiroir, barre et bordures
 * de midnight, mais ni texte ni couleurs d'état (celles du framework s'appliquent,
 * comme avant les thèmes).
 */
function classicDarkPalette(): ThemePalette {
  return {
    ...resolvePresetPalette(THEME_PRESETS[DEFAULT_THEME_PRESET]),
    text: null,
    textMuted: null,
    success: null,
    error: null,
  };
}

/** Variante claire du mode classique : valeurs écrites à la main dans l'original. */
const CLASSIC_LIGHT_PALETTE: ThemePalette = {
  dark: false,
  background: '#f4f6fb',
  surface: WHITE,
  surfaceAlt: WHITE,
  sidebar: WHITE,
  topbar: '#fafafc',
  topbarOpacity: 0.97,
  border: BLACK,
  borderOpacity: 0.08,
  text: null,
  textMuted: null,
  success: null,
  error: null,
};

/**
 * Thème effectif. Une valeur absente, `classic`, ou la clé d'un préréglage
 * disparu donnent le mode classique ; un accent inconnu vaut `theme_default`.
 */
export function resolveTheme(storedTheme: unknown, storedAccent: unknown): ResolvedTheme {
  const accent = isAccentColor(storedAccent) ? storedAccent : THEME_DEFAULT_ACCENT;

  if (!isThemePresetKey(storedTheme)) {
    return {
      kind: 'classic',
      key: CLASSIC_THEME,
      accent,
      primary: ACCENT_COLORS[accent === THEME_DEFAULT_ACCENT ? CLASSIC_ACCENT : accent],
      dark: classicDarkPalette(),
      light: CLASSIC_LIGHT_PALETTE,
    };
  }

  const preset: ThemePreset = THEME_PRESETS[storedTheme];
  return {
    kind: 'preset',
    key: storedTheme,
    accent,
    primary: accent === THEME_DEFAULT_ACCENT ? hslToHex(...preset.primary) : ACCENT_COLORS[accent],
    palette: resolvePresetPalette(preset),
  };
}
