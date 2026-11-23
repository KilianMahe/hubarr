// SPDX-License-Identifier: AGPL-3.0-or-later
// Variante du mode classique (sombre ou claire), propre à chaque navigateur
// comme le `tablerTheme` d'origine, et reflets dans le document : attribut lu
// par `/api/theme.css` (le même que pose `public/theme-init.js` avant le
// premier rendu) et `<meta name="theme-color">` (barre d'état sur mobile).

import {
  DEFAULT_THEME_MODE,
  THEME_MODES,
  THEME_MODE_STORAGE_KEY,
  type ThemeMode,
  type ThemePalette,
} from '@hubarr/shared';

export const THEME_MODE_ATTRIBUTE = 'data-theme-mode';

function isThemeMode(value: unknown): value is ThemeMode {
  return (THEME_MODES as readonly unknown[]).includes(value);
}

/**
 * Variante enregistrée ; sombre par défaut ou si le stockage est indisponible.
 * L'accès à `localStorage` lui-même peut lever (cookies bloqués) : il se fait
 * dans le `try`.
 */
export function readThemeMode(storage?: Storage): ThemeMode {
  try {
    const stored = (storage ?? globalThis.localStorage).getItem(THEME_MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function writeThemeMode(mode: ThemeMode, storage?: Storage): void {
  try {
    (storage ?? globalThis.localStorage).setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // Navigation privée ou stockage plein : la bascule vaut pour la page en cours.
  }
}

/** Reporte la variante et la couleur de fond sur `<html>` et la balise `theme-color`. */
export function syncDocument(
  mode: ThemeMode,
  palette: ThemePalette,
  doc: Document = document,
): void {
  doc.documentElement.setAttribute(THEME_MODE_ATTRIBUTE, mode);
  doc.documentElement.style.colorScheme = palette.dark ? 'dark' : 'light';
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.append(meta);
  }
  meta.content = palette.background;
}
