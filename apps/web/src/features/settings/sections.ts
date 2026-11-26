// SPDX-License-Identifier: AGPL-3.0-or-later
// Sections (onglets) de la page des paramètres et ancre correspondante.
// Pas de section « Mises à jour ». Les journaux de l'application sont une
// section (lot 9) ; l'adresse `admin/logs` y redirige. Sur mobile, les sections sont dans la barre
// basse (`SETTINGS_BOTTOM_NAV`, `meta.bottomNav` de la route).

import {
  msFindInPage,
  msGroup,
  msInfo,
  msLan,
  msPalette,
  msSettingsBackupRestore,
  msTranslate,
} from '../../components/symbols';
import type { BottomNavItem } from '../../app/navigation';

export const SETTINGS_SECTIONS = [
  { id: 'services', labelKey: 'admin.nav.services', icon: msLan },
  { id: 'users', labelKey: 'admin.nav.users', icon: msGroup },
  { id: 'display', labelKey: 'admin.nav.display', icon: msPalette },
  { id: 'languages', labelKey: 'admin.languages.tab_label', icon: msTranslate },
  { id: 'backup', labelKey: 'admin.nav.backup', icon: msSettingsBackupRestore },
  { id: 'logs', labelKey: 'admin.nav.logs', icon: msFindInPage },
  { id: 'about', labelKey: 'admin.nav.about', icon: msInfo },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

/** `#section-<id>` → section ; inconnue ou absente → services. */
export function sectionFromHash(hash: string): SettingsSection {
  const id = hash.replace(/^#section-/, '');
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.id ?? 'services';
}

/** Section des paramètres affichée par la route (libellé du titre de la barre du haut). */
export function settingsSectionLabelKey(hash: string): string {
  const id = sectionFromHash(hash);
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.labelKey ?? '';
}

/** Barre basse de la page des paramètres (mobile) : une entrée par section. */
export const SETTINGS_BOTTOM_NAV: BottomNavItem[] = SETTINGS_SECTIONS.map((section) => ({
  labelKey: section.labelKey,
  icon: section.icon,
  to: { name: 'settings', hash: `#section-${section.id}` },
  replace: true,
  testId: `tab-${section.id}`,
  // Sans fragment (ou fragment inconnu), la page affiche « Services ».
  matches: (route) => route.name === 'settings' && sectionFromHash(route.hash) === section.id,
}));
