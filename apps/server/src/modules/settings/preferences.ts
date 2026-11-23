// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences d'affichage et mise en page du tableau de bord : port de
// `DisplayPreferencesService`, `normalizeDisplayValue`, `resetDisplay` et
// `DashboardLayoutService`.
//
// Chaque préférence est un réglage `display_*` (chaîne). Une valeur absente,
// vide ou hors liste vaut la valeur par défaut ; à l'écriture, une valeur
// refusée supprime le réglage (retour au défaut), comme l'original.

import {
  DASHBOARD_SECTIONS,
  DISPLAY_OPTIONS,
  DISPLAY_OPTION_KEYS,
  isDashboardSection,
  type DashboardLayout,
  type DashboardLayoutRequest,
  type DashboardSection,
  type DisplayOptionKey,
  type DisplayValues,
} from '@hubarr/shared';
import type { Db, DbExecutor } from '../../db/client';
import { deleteSetting, getSetting, setSetting } from './settings';

export const DASHBOARD_ORDER_KEY = 'dashboard_section_order';
export const dashboardHideKey = (key: DashboardSection) => `dashboard_hide_${key}` as const;

let timezoneList: string[] | null = null;

/** Fuseaux IANA connus du moteur JavaScript (`DateTimeZone::listIdentifiers`). */
export function listTimezones(): string[] {
  timezoneList ??= Intl.supportedValuesOf('timeZone');
  return timezoneList;
}

/** Fuseau du système (`TZ` du conteneur, issue #12 de Prismarr). */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function isAllowed(key: DisplayOptionKey, value: string): boolean {
  const spec = DISPLAY_OPTIONS[key];
  if (spec.type === 'switch') return value === '1' || value === '0';
  if (spec.type === 'timezone') return value === '' || listTimezones().includes(value);
  return 'options' in spec && (spec.options as readonly string[]).includes(value);
}

/** Valeur à enregistrer, ou `null` pour revenir à la valeur par défaut. */
export function normalizeDisplayValue(key: DisplayOptionKey, raw: string): string | null {
  const value = raw.trim();
  const spec = DISPLAY_OPTIONS[key];
  if (spec.type === 'switch') return value === '1' ? '1' : '0';
  if (spec.type === 'timezone') return listTimezones().includes(value) ? value : null;
  return isAllowed(key, value) ? value : null;
}

/** Valeurs en vigueur (enregistrées et valides, sinon par défaut). */
export function readDisplayValues(db: Db): DisplayValues {
  const out = {} as DisplayValues;
  for (const key of DISPLAY_OPTION_KEYS) {
    const stored = getSetting(db, key);
    out[key] =
      typeof stored === 'string' && stored !== '' && isAllowed(key, stored)
        ? stored
        : DISPLAY_OPTIONS[key].default;
  }
  return out;
}

/** Valeurs pour le front : le fuseau vide devient celui du système. */
export function readResolvedPreferences(db: Db): DisplayValues {
  const values = readDisplayValues(db);
  if (values.display_timezone === '') values.display_timezone = systemTimezone();
  return values;
}

/**
 * Enregistre les préférences de la section « Affichage ». Les préférences
 * masquées (langues) passent par la section « Langues » et sont ignorées ici.
 */
export function applyDisplayPatch(
  db: DbExecutor,
  patch: Partial<Record<DisplayOptionKey, string>>,
): void {
  for (const [key, raw] of Object.entries(patch) as [DisplayOptionKey, string | undefined][]) {
    if (raw === undefined || ('hidden' in DISPLAY_OPTIONS[key] && DISPLAY_OPTIONS[key].hidden))
      continue;
    const value = normalizeDisplayValue(key, raw);
    if (value === null) deleteSetting(db, key);
    else setSetting(db, key, value);
  }
}

/** Une préférence masquée (langue de l'interface, des métadonnées). */
export function setHiddenPreference(db: DbExecutor, key: DisplayOptionKey, value: string): boolean {
  if (!isAllowed(key, value)) return false;
  setSetting(db, key, value);
  return true;
}

/** Toutes les préférences et la mise en page reviennent à leurs valeurs par défaut. */
export function resetDisplay(db: DbExecutor): void {
  for (const key of DISPLAY_OPTION_KEYS) deleteSetting(db, key);
  deleteSetting(db, DASHBOARD_ORDER_KEY);
  for (const key of DASHBOARD_SECTIONS) deleteSetting(db, dashboardHideKey(key));
}

/**
 * Ordre et visibilité des sections : ordre enregistré (clés inconnues ou en
 * double ignorées), complété par les sections manquantes dans l'ordre par défaut.
 */
export function readDashboardLayout(db: DbExecutor): DashboardLayout {
  const stored = getSetting(db, DASHBOARD_ORDER_KEY);
  const order: DashboardSection[] = [];
  const raw = Array.isArray(stored) ? stored : typeof stored === 'string' ? stored.split(',') : [];
  for (const entry of raw) {
    const key = typeof entry === 'string' ? entry.trim() : '';
    if (isDashboardSection(key) && !order.includes(key)) order.push(key);
  }
  for (const key of DASHBOARD_SECTIONS) if (!order.includes(key)) order.push(key);
  return order.map((key) => ({ key, visible: getSetting(db, dashboardHideKey(key)) !== true }));
}

/** Enregistre ordre et sections masquées (`dashboardLayout` d'origine). */
export function saveDashboardLayout(db: DbExecutor, request: DashboardLayoutRequest): void {
  const order: DashboardSection[] = [];
  for (const entry of request.order) {
    const key = entry.trim();
    if (isDashboardSection(key) && !order.includes(key)) order.push(key);
  }
  if (order.length === 0) deleteSetting(db, DASHBOARD_ORDER_KEY);
  else setSetting(db, DASHBOARD_ORDER_KEY, order);
  const hidden = new Set(request.hidden.map((key) => key.trim()));
  for (const key of DASHBOARD_SECTIONS) {
    if (hidden.has(key)) setSetting(db, dashboardHideKey(key), true);
    else deleteSetting(db, dashboardHideKey(key));
  }
}
