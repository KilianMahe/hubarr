// SPDX-License-Identifier: AGPL-3.0-or-later
// Sections (onglets) de la page des paramètres et ancre correspondante.
// Pas de section « Mises à jour ».

export const SETTINGS_SECTIONS = [
  { id: 'services', labelKey: 'admin.nav.services' },
  { id: 'display', labelKey: 'admin.nav.display' },
  { id: 'languages', labelKey: 'admin.languages.tab_label' },
  { id: 'backup', labelKey: 'admin.nav.backup' },
  { id: 'about', labelKey: 'admin.nav.about' },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

/** `#section-<id>` → section ; inconnue ou absente → services. */
export function sectionFromHash(hash: string): SettingsSection {
  const id = hash.replace(/^#section-/, '');
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.id ?? 'services';
}
