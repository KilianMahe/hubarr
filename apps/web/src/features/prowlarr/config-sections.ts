// SPDX-License-Identifier: AGPL-3.0-or-later
// Formulaires « Général » et « Interface » de Prowlarr (`prowlarr/general`,
// `prowlarr/ui`), décrits pour `ConfigForm` : clé de l'API, type, libellé de
// l'original. Écart : la clé d'API n'est ni affichée ni
// copiable (aucun secret au navigateur) ; un mot de passe vide garde l'actuel.

import type { ConfigOption, ConfigSection } from '../arr-admin/config-forms';

const G = 'prowlarr.general';
const U = 'prowlarr.ui';
const literal = (...values: [string, string][]): ConfigOption[] =>
  values.map(([value, title]) => ({ value, title }));

export const GENERAL_SECTIONS: ConfigSection[] = [
  {
    id: 'host',
    titleKey: `${G}.section_host`,
    fields: [
      {
        key: 'port',
        type: 'number',
        labelKey: `${G}.field_port`,
        hintKey: `${G}.restart_required`,
      },
      {
        key: 'urlBase',
        type: 'text',
        labelKey: `${G}.field_url_base`,
        hintKey: `${G}.restart_required`,
        placeholderKey: `${G}.field_url_base_placeholder`,
      },
      { key: 'instanceName', type: 'text', labelKey: `${G}.field_instance_name` },
    ],
  },
  {
    id: 'security',
    titleKey: `${G}.section_security`,
    fields: [
      {
        key: 'authenticationMethod',
        type: 'select',
        labelKey: `${G}.field_auth_method`,
        options: [
          { value: 'none', labelKey: `${G}.auth_none` },
          { value: 'basic', labelKey: `${G}.auth_basic` },
          { value: 'forms', labelKey: `${G}.auth_forms` },
        ],
      },
      {
        key: 'authenticationRequired',
        type: 'select',
        labelKey: `${G}.field_auth_required`,
        options: [
          { value: 'enabled', labelKey: `${G}.auth_required_enabled` },
          { value: 'disabledForLocalAddresses', labelKey: `${G}.auth_required_local` },
        ],
      },
      { key: 'username', type: 'text', labelKey: `${G}.field_username` },
      { key: 'password', type: 'password', labelKey: `${G}.field_password` },
      { key: 'passwordConfirmation', type: 'password', labelKey: `${G}.field_password_confirm` },
      {
        key: 'certificateValidation',
        type: 'select',
        labelKey: `${G}.field_cert_validation`,
        options: [
          { value: 'enabled', labelKey: `${G}.cert_enabled` },
          { value: 'disabledForLocalAddresses', labelKey: `${G}.cert_local` },
          { value: 'disabled', labelKey: `${G}.cert_disabled` },
        ],
      },
    ],
  },
  {
    id: 'proxy',
    titleKey: `${G}.section_proxy`,
    fields: [
      { key: 'proxyEnabled', type: 'bool', labelKey: `${G}.proxy_use` },
      {
        key: 'proxyType',
        type: 'select',
        labelKey: `${G}.proxy_type`,
        options: literal(['http', 'HTTP(S)'], ['socks4', 'Socks4'], ['socks5', 'Socks5']),
      },
      { key: 'proxyHostname', type: 'text', labelKey: `${G}.proxy_hostname` },
      { key: 'proxyPort', type: 'number', labelKey: `${G}.proxy_port` },
    ],
  },
  {
    id: 'logging',
    titleKey: `${G}.section_logging`,
    fields: [
      {
        key: 'logLevel',
        type: 'select',
        labelKey: `${G}.log_level`,
        options: [
          { value: 'info', labelKey: `${G}.log_info` },
          { value: 'debug', labelKey: `${G}.log_debug` },
          { value: 'trace', labelKey: `${G}.log_trace` },
        ],
      },
    ],
  },
];

/** Champs du proxy masqués tant que le proxy est désactivé (comme l'original). */
export const PROXY_KEYS = new Set(['proxyType', 'proxyHostname', 'proxyPort']);

export const UI_LANGUAGE_OPTIONS = literal(
  ['en', 'English'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['nl', 'Nederlands'],
  ['ja', '日本語'],
  ['zh', '中文'],
  ['ru', 'Русский'],
);

export const UI_SECTIONS: ConfigSection[] = [
  {
    id: 'dates',
    titleKey: `${U}.section_dates`,
    fields: [
      {
        key: 'shortDateFormat',
        type: 'select',
        labelKey: `${U}.short_date`,
        options: literal(
          ['MMM D YYYY', 'Mar 25 2014'],
          ['DD/MM/YYYY', '25/03/2014'],
          ['YYYY-MM-DD', '2014-03-25'],
          ['DD MMM YYYY', '25 Mar 2014'],
        ),
      },
      {
        key: 'longDateFormat',
        type: 'select',
        labelKey: `${U}.long_date`,
        options: literal(
          ['dddd, MMMM D YYYY', 'Tuesday, March 25, 2014'],
          ['dddd D MMMM YYYY', 'Tuesday 25 March 2014'],
        ),
      },
      {
        key: 'timeFormat',
        type: 'select',
        labelKey: `${U}.time_format`,
        options: literal(['h(:mm)a', '5pm / 5:30pm'], ['HH:mm', '17:00 / 17:30']),
      },
      { key: 'showRelativeDates', type: 'bool', labelKey: `${U}.show_relative` },
    ],
  },
  {
    id: 'style',
    titleKey: `${U}.section_style`,
    fields: [
      {
        key: 'theme',
        type: 'select',
        labelKey: `${U}.theme`,
        options: [
          { value: 'auto', labelKey: `${U}.theme_auto` },
          { value: 'light', labelKey: `${U}.theme_light` },
          { value: 'dark', labelKey: `${U}.theme_dark` },
        ],
      },
      { key: 'enableColorImpairedMode', type: 'bool', labelKey: `${U}.color_impaired` },
    ],
  },
  {
    id: 'language',
    titleKey: `${U}.section_language`,
    fields: [
      {
        key: 'uiLanguage',
        type: 'select',
        labelKey: `${U}.ui_language`,
        hintKey: `${U}.reload_required`,
        options: UI_LANGUAGE_OPTIONS,
      },
    ],
  },
];
