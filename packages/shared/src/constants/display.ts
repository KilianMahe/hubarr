// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences d'affichage (`AdminSettingsController::DISPLAY_OPTIONS`) et
// sections du tableau de bord (`DashboardSections`). Source unique des valeurs
// permises et des valeurs par défaut : le serveur valide, le front affiche.

import { ACCENT_CHOICES } from '../theme/accents';
import { THEME_CHOICES } from '../theme/presets';

export type DisplayOptionType = 'select' | 'switch' | 'timezone' | 'color' | 'theme';

export interface DisplayOptionSpec {
  type: DisplayOptionType;
  /** Valeur par défaut (chaîne, comme en base dans l'original). */
  default: string;
  /** Valeurs permises (`select`, `color`, `theme`). */
  options?: readonly string[];
  /** Clé i18n du libellé. */
  labelKey: string;
  helpKey?: string;
  /** Réglé dans la section « Langues », pas dans « Affichage ». */
  hidden?: boolean;
}

const REFRESH = ['1', '2', '5', '10', '0'] as const;

export const DISPLAY_OPTIONS = {
  display_home_page: {
    type: 'select',
    default: 'dashboard',
    options: ['dashboard', 'discovery', 'films', 'series', 'qbittorrent', 'last'],
    labelKey: 'admin.display.home_page.label',
    helpKey: 'admin.display.home_page.help',
  },
  display_toasts: {
    type: 'switch',
    default: '1',
    labelKey: 'admin.display.toasts.label',
    helpKey: 'admin.display.toasts.help',
  },
  display_timezone: {
    type: 'timezone',
    // Vide : fuseau du système (`TZ` du conteneur), résolu à la lecture.
    default: '',
    labelKey: 'admin.display.timezone.label',
    helpKey: 'admin.display.timezone.help',
  },
  display_date_format: {
    type: 'select',
    default: 'fr',
    options: ['fr', 'us', 'iso'],
    labelKey: 'admin.display.date_format.label',
  },
  display_time_format: {
    type: 'select',
    default: '24h',
    options: ['24h', '12h'],
    labelKey: 'admin.display.time_format.label',
  },
  display_theme_color: {
    type: 'color',
    default: 'theme_default',
    options: ACCENT_CHOICES,
    labelKey: 'admin.display.theme_color.label',
  },
  display_theme: {
    type: 'theme',
    default: 'classic',
    options: THEME_CHOICES,
    labelKey: 'admin.display.theme.label',
    helpKey: 'admin.display.theme.help',
  },
  display_qbit_refresh: {
    type: 'select',
    default: '2',
    options: REFRESH,
    labelKey: 'admin.display.qbit_refresh.label',
    helpKey: 'admin.display.qbit_refresh.help',
  },
  display_deluge_refresh: {
    type: 'select',
    default: '2',
    options: REFRESH,
    labelKey: 'admin.display.deluge_refresh.label',
    helpKey: 'admin.display.deluge_refresh.help',
  },
  display_transmission_refresh: {
    type: 'select',
    default: '2',
    options: REFRESH,
    labelKey: 'admin.display.transmission_refresh.label',
    helpKey: 'admin.display.transmission_refresh.help',
  },
  display_activity_source: {
    type: 'select',
    default: 'auto',
    options: ['auto', 'tautulli', 'tracearr'],
    labelKey: 'admin.display.activity_source.label',
    helpKey: 'admin.display.activity_source.help',
  },
  display_ui_density: {
    type: 'select',
    default: 'comfortable',
    options: ['comfortable', 'compact'],
    labelKey: 'admin.display.ui_density.label',
  },
  display_page_size: {
    type: 'select',
    default: '200',
    options: ['50', '100', '200', '500'],
    labelKey: 'admin.display.page_size.label',
    helpKey: 'admin.display.page_size.help',
  },
  display_language: {
    type: 'select',
    default: 'en',
    options: ['fr', 'en'],
    labelKey: 'admin.display.language.label',
    helpKey: 'admin.display.language.help',
    hidden: true,
  },
  display_metadata_language: {
    type: 'select',
    default: 'en-US',
    options: ['fr-FR', 'en-US', 'en-GB', 'es-ES', 'de-DE', 'it-IT', 'pt-PT', 'pt-BR', 'ja-JP'],
    labelKey: 'admin.display.metadata_language.label',
    helpKey: 'admin.display.metadata_language.help',
    hidden: true,
  },
} as const satisfies Record<string, DisplayOptionSpec>;

export type DisplayOptionKey = keyof typeof DISPLAY_OPTIONS;
export const DISPLAY_OPTION_KEYS = Object.keys(DISPLAY_OPTIONS) as DisplayOptionKey[];

/** Valeurs résolues (valeur enregistrée valide, sinon défaut). */
export type DisplayValues = Record<DisplayOptionKey, string>;

export function isDisplayOptionKey(value: unknown): value is DisplayOptionKey {
  return typeof value === 'string' && Object.hasOwn(DISPLAY_OPTIONS, value);
}

/**
 * Clé i18n du libellé d'une valeur (`admin.display.<option>.options.<valeur>`),
 * avec les exceptions de l'original (Deluge reprend les libellés de qBittorrent,
 * les codes de langue des métadonnées remplacent `-` par `_`).
 */
export function displayOptionLabelKey(key: DisplayOptionKey, value: string): string {
  const name = key.replace(/^display_/, '');
  if (key === 'display_deluge_refresh') return `admin.display.qbit_refresh.options.${value}`;
  if (key === 'display_metadata_language') {
    return `admin.display.metadata_language.options.${value.replace('-', '_')}`;
  }
  return `admin.display.${name}.options.${value}`;
}

/** Langues de métadonnées TMDB proposées dans la section « Langues » de l'original. */
export const LANGUAGES_SECTION_METADATA = ['fr-FR', 'en-US'] as const;

/** Sections du tableau de bord, dans l'ordre par défaut (`DashboardSections`). */
export const DASHBOARD_SECTIONS = [
  'upcoming',
  // Files d'attente Radarr et Sonarr (P5d.1, V21).
  'queue',
  'requests',
  'health',
  'plex',
  'emby',
  'transmission',
  'watchlist',
  'trending',
  'recent',
] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export function isDashboardSection(value: unknown): value is DashboardSection {
  return typeof value === 'string' && (DASHBOARD_SECTIONS as readonly string[]).includes(value);
}

export function dashboardSectionLabelKey(key: DashboardSection): string {
  return `dashboard.${key}.title`;
}

/** Langues proposées pour l'interface de Prowlarr (sans endpoint `/language`). */
export const PROWLARR_UI_LANGUAGES = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
} as const;

/** Langues proposées pour l'interface de Seerr. */
export const SEERR_UI_LANGUAGES = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ru: 'Русский',
} as const;

/** Valeurs par défaut de toutes les préférences (fuseau : celui indiqué). */
export function defaultDisplayValues(timezone = 'UTC'): DisplayValues {
  const out = {} as DisplayValues;
  for (const key of DISPLAY_OPTION_KEYS) out[key] = DISPLAY_OPTIONS[key].default;
  out.display_timezone = timezone;
  return out;
}
