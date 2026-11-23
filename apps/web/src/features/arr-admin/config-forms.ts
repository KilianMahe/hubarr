// SPDX-License-Identifier: AGPL-3.0-or-later
// Formulaires des sections de configuration (P3b.4), décrits une fois pour
// Radarr et Sonarr : interface (`radarr/ui.html.twig`), nommage et gestion des
// médias (`media_management`), hôte (`settings`). Chaque champ porte la clé de
// l'API de l'instance, son type, son libellé i18n de l'original et, au besoin,
// les services qui l'ont.

import type { ArrKind } from '@hubarr/shared';

export type ConfigFieldType = 'bool' | 'text' | 'number' | 'select' | 'password' | 'language';

export interface ConfigOption {
  value: string | number;
  labelKey?: string;
  /** Libellé littéral (formats de date, types de proxy). */
  title?: string;
}

export interface ConfigField {
  key: string;
  type: ConfigFieldType;
  labelKey: string;
  hintKey?: string;
  placeholderKey?: string;
  options?: ConfigOption[];
  kinds?: readonly ArrKind[];
}

export interface ConfigSection {
  id: string;
  titleKey: string;
  fields: ConfigField[];
}

const UI = 'media.arr_admin.ui';
const MM = 'media.arr_admin.media_management';
const SET = 'media.arr_admin.settings';

const literal = (...values: string[]): ConfigOption[] =>
  values.map((value) => ({ value, title: value }));

export const UI_SECTIONS: ConfigSection[] = [
  {
    id: 'dates',
    titleKey: `${UI}.dates.title`,
    fields: [
      {
        key: 'firstDayOfWeek',
        type: 'select',
        labelKey: `${UI}.dates.first_day`,
        options: [
          { value: 0, labelKey: `${UI}.dates.sunday` },
          { value: 1, labelKey: `${UI}.dates.monday` },
        ],
      },
      {
        key: 'calendarWeekColumnHeader',
        type: 'select',
        labelKey: `${UI}.dates.calendar_header`,
        options: literal('ddd M/D', 'ddd MM/DD', 'ddd D/M', 'ddd DD/MM'),
      },
      {
        key: 'shortDateFormat',
        type: 'select',
        labelKey: `${UI}.dates.short_date`,
        options: literal(
          'MMM D YYYY',
          'DD MMM YYYY',
          'MM/D/YYYY',
          'MM/DD/YYYY',
          'DD/MM/YYYY',
          'YYYY-MM-DD',
        ),
      },
      {
        key: 'longDateFormat',
        type: 'select',
        labelKey: `${UI}.dates.long_date`,
        options: literal('dddd, MMMM D YYYY', 'dddd, D MMMM YYYY'),
      },
      {
        key: 'timeFormat',
        type: 'select',
        labelKey: `${UI}.dates.time`,
        options: [
          { value: 'h(:mm)a', labelKey: `${UI}.dates.time_12h` },
          { value: 'HH:mm', labelKey: `${UI}.dates.time_24h` },
        ],
      },
      {
        key: 'showRelativeDates',
        type: 'bool',
        labelKey: `${UI}.dates.relative`,
        hintKey: `${UI}.dates.relative_hint`,
      },
    ],
  },
  {
    id: 'style',
    titleKey: `${UI}.style.title`,
    fields: [
      {
        key: 'theme',
        type: 'select',
        labelKey: `${UI}.style.theme`,
        options: [
          { value: 'auto', labelKey: `${UI}.style.theme_auto` },
          { value: 'light', labelKey: `${UI}.style.theme_light` },
          { value: 'dark', labelKey: `${UI}.style.theme_dark` },
        ],
      },
      {
        key: 'enableColorImpairedMode',
        type: 'bool',
        labelKey: `${UI}.style.color_impaired`,
        hintKey: `${UI}.style.color_impaired_hint`,
      },
      {
        key: 'movieRuntimeFormat',
        type: 'select',
        labelKey: `${UI}.style.runtime_format`,
        kinds: ['radarr'],
        options: [
          { value: 'hoursMinutes', labelKey: `${UI}.style.runtime_hours_minutes` },
          { value: 'minutes', labelKey: `${UI}.style.runtime_minutes` },
        ],
      },
    ],
  },
  {
    id: 'language',
    titleKey: `${UI}.language.title`,
    fields: [
      {
        key: 'uiLanguage',
        type: 'language',
        labelKey: `${UI}.language.ui_language`,
        hintKey: `${UI}.language.ui_language_hint`,
      },
      {
        key: 'movieInfoLanguage',
        type: 'language',
        labelKey: `${UI}.language.info_language`,
        hintKey: `${UI}.language.info_language_hint`,
        kinds: ['radarr'],
      },
    ],
  },
];

const colonRadarr: ConfigOption[] = [
  { value: 'delete', labelKey: `${MM}.naming.colon_delete` },
  { value: 'dash', labelKey: `${MM}.naming.colon_dash` },
  { value: 'spaceDash', labelKey: `${MM}.naming.colon_space_dash` },
  { value: 'spaceDashSpace', labelKey: `${MM}.naming.colon_space_dash_space` },
  { value: 'smart', labelKey: `${MM}.naming.colon_smart` },
];
const colonSonarr: ConfigOption[] = colonRadarr.map((option, index) => ({
  ...option,
  value: index,
}));

export const NAMING_FIELDS: ConfigField[] = [
  { key: 'renameMovies', type: 'bool', labelKey: `${MM}.naming.rename_movies`, kinds: ['radarr'] },
  {
    key: 'renameEpisodes',
    type: 'bool',
    labelKey: `${MM}.naming.rename_episodes`,
    kinds: ['sonarr'],
  },
  { key: 'replaceIllegalCharacters', type: 'bool', labelKey: `${MM}.naming.replace_illegal` },
  {
    key: 'colonReplacementFormat',
    type: 'select',
    labelKey: `${MM}.naming.colon_replacement`,
    options: colonRadarr,
    kinds: ['radarr'],
  },
  {
    key: 'colonReplacementFormat',
    type: 'select',
    labelKey: `${MM}.naming.colon_replacement`,
    options: colonSonarr,
    kinds: ['sonarr'],
  },
  {
    key: 'standardMovieFormat',
    type: 'text',
    labelKey: `${MM}.naming.movie_format`,
    kinds: ['radarr'],
  },
  {
    key: 'movieFolderFormat',
    type: 'text',
    labelKey: `${MM}.naming.movie_folder_format`,
    kinds: ['radarr'],
  },
  {
    key: 'standardEpisodeFormat',
    type: 'text',
    labelKey: `${MM}.naming.standard_episode_format`,
    kinds: ['sonarr'],
  },
  {
    key: 'dailyEpisodeFormat',
    type: 'text',
    labelKey: `${MM}.naming.daily_episode_format`,
    kinds: ['sonarr'],
  },
  {
    key: 'animeEpisodeFormat',
    type: 'text',
    labelKey: `${MM}.naming.anime_episode_format`,
    kinds: ['sonarr'],
  },
  {
    key: 'seriesFolderFormat',
    type: 'text',
    labelKey: `${MM}.naming.series_folder_format`,
    kinds: ['sonarr'],
  },
  {
    key: 'seasonFolderFormat',
    type: 'text',
    labelKey: `${MM}.naming.season_folder_format`,
    kinds: ['sonarr'],
  },
  {
    key: 'multiEpisodeStyle',
    type: 'select',
    labelKey: `${MM}.naming.multi_episode_style`,
    kinds: ['sonarr'],
    options: ['extend', 'duplicate', 'repeat', 'scene', 'range', 'prefixed_range'].map(
      (name, index) => ({
        value: index,
        labelKey: `${MM}.naming.multi_${name}`,
      }),
    ),
  },
];

/** Exemples de nommage : clé de la réponse de l'instance → libellé. */
export const NAMING_EXAMPLES: Record<ArrKind, { key: string; labelKey: string }[]> = {
  radarr: [
    { key: 'movieExample', labelKey: `${MM}.naming.preview_movie` },
    { key: 'movieFolderExample', labelKey: `${MM}.naming.preview_movie_folder` },
  ],
  sonarr: [
    { key: 'singleEpisodeExample', labelKey: `${MM}.naming.preview_single_episode` },
    { key: 'dailyEpisodeExample', labelKey: `${MM}.naming.preview_daily_episode` },
    { key: 'animeEpisodeExample', labelKey: `${MM}.naming.preview_anime_episode` },
    { key: 'multiEpisodeExample', labelKey: `${MM}.naming.preview_multi_episode` },
    { key: 'seriesFolderExample', labelKey: `${MM}.naming.preview_series_folder` },
    { key: 'seasonFolderExample', labelKey: `${MM}.naming.preview_season_folder` },
  ],
};

export const MEDIA_MANAGEMENT_FIELDS: ConfigField[] = [
  {
    key: 'autoUnmonitorPreviouslyDownloadedMovies',
    type: 'bool',
    labelKey: `${MM}.mm.auto_unmonitor_movies`,
    kinds: ['radarr'],
  },
  {
    key: 'autoUnmonitorPreviouslyDownloadedEpisodes',
    type: 'bool',
    labelKey: `${MM}.mm.auto_unmonitor_episodes`,
    kinds: ['sonarr'],
  },
  {
    key: 'createEmptyMovieFolders',
    type: 'bool',
    labelKey: `${MM}.mm.create_empty_folders`,
    kinds: ['radarr'],
  },
  {
    key: 'createEmptySeriesFolders',
    type: 'bool',
    labelKey: `${MM}.mm.create_empty_series_folders`,
    kinds: ['sonarr'],
  },
  { key: 'deleteEmptyFolders', type: 'bool', labelKey: `${MM}.mm.delete_empty_folders` },
  {
    key: 'autoRenameFolders',
    type: 'bool',
    labelKey: `${MM}.mm.auto_rename_folders`,
    kinds: ['radarr'],
  },
  { key: 'copyUsingHardlinks', type: 'bool', labelKey: `${MM}.mm.copy_hardlinks` },
  { key: 'importExtraFiles', type: 'bool', labelKey: `${MM}.mm.import_extra_files` },
  { key: 'extraFileExtensions', type: 'text', labelKey: `${MM}.mm.extra_extensions` },
  { key: 'enableMediaInfo', type: 'bool', labelKey: `${MM}.mm.enable_mediainfo` },
  {
    key: 'downloadPropersAndRepacks',
    type: 'select',
    labelKey: `${MM}.mm.propers_repacks`,
    options: [
      { value: 'preferAndUpgrade', labelKey: `${MM}.mm.prefer_upgrade` },
      { value: 'doNotUpgrade', labelKey: `${MM}.mm.do_not_upgrade` },
      { value: 'doNotPrefer', labelKey: `${MM}.mm.do_not_prefer` },
    ],
  },
  {
    key: 'fileDate',
    type: 'select',
    labelKey: `${MM}.mm.file_date`,
    kinds: ['radarr'],
    options: [
      { value: 'none', labelKey: `${MM}.mm.file_date_none` },
      { value: 'cinemas', labelKey: `${MM}.mm.file_date_cinemas` },
      { value: 'release', labelKey: `${MM}.mm.file_date_release` },
    ],
  },
  {
    key: 'fileDate',
    type: 'select',
    labelKey: `${MM}.mm.file_date`,
    kinds: ['sonarr'],
    options: [
      { value: 'none', labelKey: `${MM}.mm.file_date_none` },
      { value: 'localAirDate', labelKey: `${MM}.mm.file_date_local_air` },
      { value: 'utcAirDate', labelKey: `${MM}.mm.file_date_utc_air` },
    ],
  },
  {
    key: 'rescanAfterRefresh',
    type: 'select',
    labelKey: `${MM}.mm.rescan_after_refresh`,
    options: [
      { value: 'always', labelKey: `${MM}.mm.rescan_always` },
      { value: 'afterManual', labelKey: `${MM}.mm.rescan_after_manual` },
      { value: 'never', labelKey: `${MM}.mm.rescan_never` },
    ],
  },
  {
    key: 'recycleBin',
    type: 'text',
    labelKey: `${MM}.mm.recycle_bin_path`,
    placeholderKey: `${MM}.mm.recycle_bin_placeholder`,
  },
  { key: 'recycleBinCleanupDays', type: 'number', labelKey: `${MM}.mm.recycle_bin_cleanup` },
  { key: 'minimumFreeSpaceWhenImporting', type: 'number', labelKey: `${MM}.mm.min_free_space` },
  { key: 'setPermissionsLinux', type: 'bool', labelKey: `${MM}.mm.set_permissions` },
  { key: 'chmodFolder', type: 'text', labelKey: `${MM}.mm.chmod_folder` },
  { key: 'chownGroup', type: 'text', labelKey: `${MM}.mm.chown_group` },
];

export const HOST_SECTIONS: ConfigSection[] = [
  {
    id: 'host',
    titleKey: `${SET}.host.title`,
    fields: [
      {
        key: 'bindAddress',
        type: 'text',
        labelKey: `${SET}.host.bind_address`,
        hintKey: `${SET}.host.bind_address_hint`,
      },
      { key: 'port', type: 'number', labelKey: `${SET}.host.port` },
      { key: 'sslPort', type: 'number', labelKey: `${SET}.host.ssl_port` },
      {
        key: 'urlBase',
        type: 'text',
        labelKey: `${SET}.host.url_base`,
        hintKey: `${SET}.host.url_base_hint`,
      },
      { key: 'instanceName', type: 'text', labelKey: `${SET}.host.instance_name` },
      { key: 'applicationUrl', type: 'text', labelKey: `${SET}.host.application_url` },
      { key: 'enableSsl', type: 'bool', labelKey: `${SET}.host.ssl` },
      { key: 'launchBrowser', type: 'bool', labelKey: `${SET}.host.launch_browser` },
    ],
  },
  {
    id: 'security',
    titleKey: `${SET}.security.title`,
    fields: [
      {
        key: 'authenticationMethod',
        type: 'select',
        labelKey: `${SET}.security.authentication`,
        options: ['none', 'basic', 'forms', 'external'].map((value) => ({
          value,
          labelKey: `${SET}.security.auth_${value}`,
        })),
      },
      {
        key: 'authenticationRequired',
        type: 'select',
        labelKey: `${SET}.security.auth_required`,
        options: [
          { value: 'enabled', labelKey: `${SET}.security.required_enabled` },
          {
            value: 'disabledForLocalAddresses',
            labelKey: `${SET}.security.required_disabled_local`,
          },
        ],
      },
      { key: 'username', type: 'text', labelKey: `${SET}.security.username` },
      {
        key: 'password',
        type: 'password',
        labelKey: `${SET}.security.password`,
        placeholderKey: `${SET}.security.password_placeholder`,
      },
      {
        key: 'passwordConfirmation',
        type: 'password',
        labelKey: `${SET}.security.password_confirm`,
        placeholderKey: `${SET}.security.password_confirm_placeholder`,
      },
      {
        key: 'certificateValidation',
        type: 'select',
        labelKey: `${SET}.security.certificate_validation`,
        options: [
          { value: 'enabled', labelKey: `${SET}.security.cert_enabled` },
          { value: 'disabledForLocalAddresses', labelKey: `${SET}.security.cert_disabled_local` },
          { value: 'disabled', labelKey: `${SET}.security.cert_disabled` },
        ],
      },
    ],
  },
  {
    id: 'proxy',
    titleKey: `${SET}.proxy.title`,
    fields: [
      { key: 'proxyEnabled', type: 'bool', labelKey: `${SET}.proxy.use_proxy` },
      {
        key: 'proxyType',
        type: 'select',
        labelKey: `${SET}.proxy.type`,
        options: [
          { value: 'http', title: 'HTTP(S)' },
          { value: 'socks4', title: 'Socks4' },
          { value: 'socks5', title: 'Socks5' },
        ],
      },
      { key: 'proxyHostname', type: 'text', labelKey: `${SET}.proxy.host` },
      { key: 'proxyPort', type: 'number', labelKey: `${SET}.proxy.port` },
      { key: 'proxyUsername', type: 'text', labelKey: `${SET}.proxy.username` },
      {
        key: 'proxyPassword',
        type: 'password',
        labelKey: `${SET}.proxy.password`,
        placeholderKey: `${SET}.security.password_placeholder`,
      },
      {
        key: 'proxyBypassFilter',
        type: 'text',
        labelKey: `${SET}.proxy.bypass_for`,
        placeholderKey: `${SET}.proxy.bypass_placeholder`,
      },
      { key: 'proxyBypassLocalAddresses', type: 'bool', labelKey: `${SET}.proxy.bypass_local` },
    ],
  },
  {
    id: 'logging',
    titleKey: `${SET}.logging.title`,
    fields: [
      {
        key: 'logLevel',
        type: 'select',
        labelKey: `${SET}.logging.level`,
        options: ['info', 'debug', 'trace'].map((value) => ({
          value,
          labelKey: `${SET}.logging.level_${value}`,
        })),
      },
      { key: 'logSizeLimit', type: 'number', labelKey: `${SET}.logging.size_limit` },
    ],
  },
  {
    id: 'analytics',
    titleKey: `${SET}.analytics.title`,
    fields: [
      {
        key: 'analyticsEnabled',
        type: 'bool',
        labelKey: `${SET}.analytics.anonymous_data`,
        hintKey: `${SET}.analytics.hint`,
      },
    ],
  },
  {
    id: 'updates',
    titleKey: `${SET}.updates.title`,
    fields: [
      { key: 'branch', type: 'text', labelKey: `${SET}.updates.branch` },
      { key: 'updateAutomatically', type: 'bool', labelKey: `${SET}.updates.auto_update` },
    ],
  },
  {
    id: 'backups',
    titleKey: `${SET}.backups.title`,
    fields: [
      { key: 'backupFolder', type: 'text', labelKey: `${SET}.backups.folder` },
      { key: 'backupInterval', type: 'number', labelKey: `${SET}.backups.interval_days` },
      { key: 'backupRetention', type: 'number', labelKey: `${SET}.backups.retention_days` },
    ],
  },
];

/** Champs d'un service ; une clé « …_hint » propre au service se résout en `…_hint_<kind>`. */
export function fieldsFor(fields: readonly ConfigField[], kind: ArrKind): ConfigField[] {
  return fields.filter((field) => field.kinds === undefined || field.kinds.includes(kind));
}

export function sectionsFor(sections: readonly ConfigSection[], kind: ArrKind): ConfigSection[] {
  return sections
    .map((section) => ({ ...section, fields: fieldsFor(section.fields, kind) }))
    .filter((section) => section.fields.length > 0);
}

/** Clés propres au service (`…_radarr`/`…_sonarr`) : libellés et aides déclarés sans suffixe. */
export const KIND_SUFFIXED_KEYS = new Set([
  `${UI}.language.ui_language_hint`,
  `${UI}.language.info_language`,
  `${UI}.language.info_language_hint`,
  `${SET}.analytics.hint`,
]);

/** Valeurs d'une section pour le formulaire (champs déclarés seulement). */
export function formValues(
  config: Record<string, unknown> | null | undefined,
  fields: readonly ConfigField[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.type === 'password' ? '' : (config?.[field.key] ?? null),
    ]),
  );
}

/**
 * Modification à envoyer : champs déclarés, nombres convertis, mots de passe
 * vides ou masqués omis (le serveur garde alors la valeur actuelle).
 */
export function configPatch(
  values: Record<string, unknown>,
  fields: readonly ConfigField[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === 'password') {
      if (typeof value === 'string' && value !== '' && value !== '********')
        patch[field.key] = value;
      continue;
    }
    if (field.type === 'number') {
      const parsed = Number(value);
      patch[field.key] = value === '' || value === null || !Number.isFinite(parsed) ? 0 : parsed;
      continue;
    }
    if (field.type === 'bool') {
      patch[field.key] = value === true;
      continue;
    }
    patch[field.key] = value;
  }
  return patch;
}
