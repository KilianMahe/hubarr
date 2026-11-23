// SPDX-License-Identifier: AGPL-3.0-or-later
// Accès à la table clé-valeur `setting` (`SettingRepository` d'origine). Les
// valeurs sont stockées en JSON ; leur forme est validée par l'appelant.

import { eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client';
import { settings } from '../../db/schema';

/** Clés connues. Les autres préférences d'affichage et la mise en page arrivent en P1.5. */
export const SETTING_KEYS = {
  /** `true` une fois l'assistant terminé (`setup_completed` d'origine). */
  setupCompleted: 'setup_completed',
  /** Langue de l'interface (`en` ou `fr`). */
  displayLanguage: 'display_language',
  /** Thème : `classic` ou clé d'un préréglage (`THEME_CHOICES`). */
  displayTheme: 'display_theme',
  /** Accent : `theme_default` ou couleur nommée (`ACCENT_CHOICES`). */
  displayThemeColor: 'display_theme_color',
} as const;

/** Clés construites : visibilité dans le menu, mise en page du dashboard (P1.5). */
export type DynamicSettingKey =
  `sidebar_hide_${string}` | `dashboard_${string}` | `display_${string}`;
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS] | DynamicSettingKey;

/** Clé de masquage d'un service ou d'une page interne dans le menu latéral. */
export function sidebarHideKey(id: string): `sidebar_hide_${string}` {
  return `sidebar_hide_${id}`;
}

/** Valeur brute d'un réglage, `undefined` s'il est absent. */
export function getSetting(db: DbExecutor, key: SettingKey): unknown {
  return db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
    ?.value;
}

/** Supprime un réglage : la lecture suivante retombe sur la valeur par défaut. */
export function deleteSetting(db: DbExecutor, key: SettingKey): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

/** Tous les réglages (export, P1.6). */
export function listSettings(db: Db): { key: string; value: unknown }[] {
  return db.select({ key: settings.key, value: settings.value }).from(settings).all();
}

export function setSetting(db: DbExecutor, key: SettingKey, value: unknown): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run();
}
