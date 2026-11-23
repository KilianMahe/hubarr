// SPDX-License-Identifier: AGPL-3.0-or-later
// Thème actif (`ThemeService` d'origine) : lu dans les réglages à chaque appel,
// sans cache (deux lectures de clé primaire ; un changement de thème s'applique
// donc sans redémarrage, ce que l'original obtenait par `reset()`).
//
// `bootCss()` produit la feuille de `GET /api/theme.css`, chargée de façon
// bloquante par `index.html` : le fond et le schéma de couleurs sont posés
// avant le premier rendu, sans script inline (CSP). Vuetify
// prend le relais au montage avec le thème complet du bootstrap.

import { resolveTheme, type ResolvedTheme, type ThemePalette } from '@hubarr/shared';
import type { Db } from '../../db/client';
import { SETTING_KEYS, getSetting } from '../settings/settings';

export function readTheme(db: Db): ResolvedTheme {
  return resolveTheme(
    getSetting(db, SETTING_KEYS.displayTheme),
    getSetting(db, SETTING_KEYS.displayThemeColor),
  );
}

/** Attribut posé sur `<html>` par `theme-init.js` (variante du mode classique). */
export const THEME_MODE_ATTRIBUTE = 'data-theme-mode';

function declarations(palette: ThemePalette): string {
  return [
    `color-scheme:${palette.dark ? 'dark' : 'light'}`,
    `--hubarr-boot-background:${palette.background}`,
    ...(palette.text === null ? [] : [`--hubarr-boot-text:${palette.text}`]),
  ].join(';');
}

/** Feuille minimale du premier rendu : fond, couleur du texte et `color-scheme`. */
export function bootCss(theme: ResolvedTheme): string {
  const rules =
    theme.kind === 'classic'
      ? [
          // Sombre par défaut, comme l'original (`tablerTheme` absent → dark).
          `:root,:root[${THEME_MODE_ATTRIBUTE}="dark"]{${declarations(theme.dark)}}`,
          `:root[${THEME_MODE_ATTRIBUTE}="light"]{${declarations(theme.light)}}`,
        ]
      : [`:root{${declarations(theme.palette)}}`];
  return [
    `/* Hubarr : thème ${theme.key}, accent ${theme.accent} */`,
    ...rules,
    'html,body{margin:0;background-color:var(--hubarr-boot-background);color:var(--hubarr-boot-text,CanvasText)}',
    '',
  ].join('\n');
}
