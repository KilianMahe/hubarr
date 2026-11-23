// SPDX-License-Identifier: AGPL-3.0-or-later
// Ressources à schéma dynamique (indexeurs, clients, listes d'import,
// notifications, métadonnées) : familles, options globales, déclencheurs des
// notifications et ressource à enregistrer (port de `collectPayload` de
// `radarr/_schema_modal.html.twig`).
//
// Écarts : la ressource enregistrée part de la ressource
// modifiée ou du modèle (champs propres gardés : profil et dossier d'une
// liste, suppression des téléchargements terminés d'un client…) au lieu d'être
// reconstruite ; les options globales dépendent de la famille (l'original
// ajoutait RSS, recherche et priorité aux clients et aux listes) ; les
// déclencheurs viennent des `supportsOn…` du modèle (ceux de Sonarr compris).

import type { Provider, ProviderSaveRequest } from '@hubarr/shared';
import { fieldsPayload } from './schema-form';

export const PROVIDER_FAMILIES = [
  'indexers',
  'downloadClients',
  'importLists',
  'notifications',
  'metadata',
] as const;
export type ProviderFamilyId = (typeof PROVIDER_FAMILIES)[number];

export interface ProviderFamily {
  id: ProviderFamilyId;
  /** Segment de l'URL (`/indexeurs`…). */
  segment: string;
  /** Préfixe des clés i18n (`media.arr_admin.<prefix>`). */
  prefix: string;
  /** Ajout permis (les métadonnées ne se créent pas). */
  canAdd: boolean;
  /** Route du test d'une ressource saisie, ou aucune. */
  testRoute: string | null;
  /** Test depuis la liste (par id pour les notifications, sinon la ressource). */
  rowTest: 'id' | 'payload' | null;
  /** Clés des libellés de la liste. */
  labels: {
    edit: string;
    delete: string;
    test: string | null;
    confirmDelete: string;
    errorDelete: string;
    titleAdd: string;
    titleEdit: string;
  };
}

export const PROVIDER_FAMILY_SPECS: Record<ProviderFamilyId, ProviderFamily> = {
  indexers: {
    id: 'indexers',
    segment: 'indexeurs',
    prefix: 'indexers',
    canAdd: true,
    testRoute: 'tester',
    rowTest: 'payload',
    labels: {
      edit: 'edit',
      delete: 'delete',
      test: 'test',
      confirmDelete: 'confirm_delete_tpl',
      errorDelete: 'error_delete',
      titleAdd: 'modal_title_add',
      titleEdit: 'modal_title_edit',
    },
  },
  downloadClients: {
    id: 'downloadClients',
    segment: 'clients-telechargement',
    prefix: 'download_clients',
    canAdd: true,
    testRoute: 'tester',
    rowTest: 'payload',
    labels: {
      edit: 'edit',
      delete: 'delete',
      test: 'test',
      confirmDelete: 'confirm_delete_tpl',
      errorDelete: 'error_delete',
      titleAdd: 'modal_title_add',
      titleEdit: 'modal_title_edit',
    },
  },
  importLists: {
    id: 'importLists',
    segment: 'listes-import',
    prefix: 'import_lists',
    canAdd: true,
    testRoute: null,
    rowTest: null,
    labels: {
      edit: 'edit',
      delete: 'delete',
      test: null,
      confirmDelete: 'confirm_delete_tpl',
      errorDelete: 'error_delete',
      titleAdd: 'modal_title_add',
      titleEdit: 'modal_title_edit',
    },
  },
  notifications: {
    id: 'notifications',
    segment: 'notifications',
    prefix: 'notifications',
    canAdd: true,
    testRoute: 'tester-payload',
    rowTest: 'id',
    labels: {
      edit: 'edit',
      delete: 'delete',
      test: 'test',
      confirmDelete: 'confirm_delete_tpl',
      errorDelete: 'error_delete',
      titleAdd: 'modal_title_add',
      titleEdit: 'modal_title_edit',
    },
  },
  metadata: {
    id: 'metadata',
    segment: 'metadata',
    prefix: 'metadata',
    canAdd: false,
    testRoute: null,
    rowTest: null,
    labels: {
      edit: 'btn_edit_title',
      delete: 'btn_delete_title',
      test: null,
      confirmDelete: 'delete_confirm_tpl',
      errorDelete: 'delete_error',
      titleAdd: 'modal_title_default',
      titleEdit: 'modal_title_default',
    },
  },
};

export type ProviderOptionType = 'bool' | 'number' | 'qualityProfile' | 'rootFolder';

export interface ProviderOption {
  key: string;
  type: ProviderOptionType;
  labelKey: string;
}

/** Options globales de chaque famille (affichées si la ressource ou le modèle les porte). */
export const FAMILY_OPTIONS: Record<ProviderFamilyId, ProviderOption[]> = {
  indexers: [
    { key: 'enableRss', type: 'bool', labelKey: 'media.arr_admin.schema_modal.opt_rss' },
    {
      key: 'enableAutomaticSearch',
      type: 'bool',
      labelKey: 'media.arr_admin.schema_modal.opt_auto_search',
    },
    {
      key: 'enableInteractiveSearch',
      type: 'bool',
      labelKey: 'media.arr_admin.schema_modal.opt_interactive_search',
    },
    { key: 'priority', type: 'number', labelKey: 'media.arr_admin.schema_modal.opt_priority' },
  ],
  downloadClients: [
    { key: 'enable', type: 'bool', labelKey: 'media.arr_admin.download_clients.col_enabled' },
    { key: 'priority', type: 'number', labelKey: 'media.arr_admin.download_clients.col_priority' },
  ],
  importLists: [
    { key: 'enabled', type: 'bool', labelKey: 'media.arr_admin.import_lists.col_enabled' },
    {
      key: 'enableAutomaticAdd',
      type: 'bool',
      labelKey: 'media.arr_admin.import_lists.col_enabled',
    },
    {
      key: 'qualityProfileId',
      type: 'qualityProfile',
      labelKey: 'media.arr_admin.import_lists.col_quality_profile',
    },
    {
      key: 'rootFolderPath',
      type: 'rootFolder',
      labelKey: 'media.arr_admin.import_lists.col_root_folder',
    },
  ],
  notifications: [],
  metadata: [{ key: 'enable', type: 'bool', labelKey: 'media.arr_admin.metadata.label_active' }],
};

/** Options présentes dans la ressource (ou le modèle). */
export function presentOptions(family: ProviderFamilyId, base: Provider): ProviderOption[] {
  return FAMILY_OPTIONS[family].filter((option) => option.key in base);
}

/** Valeurs initiales des options (valeurs de la ressource, sinon défaut raisonnable). */
export function optionValues(
  options: readonly ProviderOption[],
  base: Provider,
): Record<string, unknown> {
  return Object.fromEntries(
    options.map((option) => {
      const value = base[option.key];
      if (option.type === 'bool') return [option.key, typeof value === 'boolean' ? value : true];
      if (option.type === 'number') return [option.key, typeof value === 'number' ? value : 25];
      return [option.key, value ?? null];
    }),
  );
}

/** Libellés connus des déclencheurs (clé i18n), les autres affichent leur nom. */
const TRIGGER_LABELS: Record<string, string> = {
  onGrab: 'media.arr_admin.schema_modal.trigger.on_grab',
  onDownload: 'media.arr_admin.schema_modal.trigger.on_download',
  onUpgrade: 'media.arr_admin.schema_modal.trigger.on_upgrade',
  onRename: 'media.arr_admin.schema_modal.trigger.on_rename',
  onMovieAdded: 'media.arr_admin.schema_modal.trigger.on_movie_added',
  onMovieDelete: 'media.arr_admin.schema_modal.trigger.on_movie_delete',
  onMovieFileDelete: 'media.arr_admin.schema_modal.trigger.on_movie_file_delete',
  onMovieFileDeleteForUpgrade:
    'media.arr_admin.schema_modal.trigger.on_movie_file_delete_for_upgrade',
  onSeriesAdd: 'media.arr_admin.schema_modal.trigger.on_series_add',
  onSeriesDelete: 'media.arr_admin.schema_modal.trigger.on_series_delete',
  onEpisodeFileDelete: 'media.arr_admin.schema_modal.trigger.on_episode_file_delete',
  onEpisodeFileDeleteForUpgrade:
    'media.arr_admin.schema_modal.trigger.on_episode_file_delete_for_upgrade',
  onImportComplete: 'media.arr_admin.schema_modal.trigger.on_import_complete',
  onHealthIssue: 'media.arr_admin.schema_modal.trigger.on_health_issue',
  onHealthRestored: 'media.arr_admin.schema_modal.trigger.on_health_restored',
  onApplicationUpdate: 'media.arr_admin.schema_modal.trigger.on_application_update',
  onManualInteractionRequired:
    'media.arr_admin.schema_modal.trigger.on_manual_interaction_required',
  includeHealthWarnings: 'media.arr_admin.schema_modal.trigger.include_health_warnings',
};

export function triggerLabelKey(key: string): string | null {
  return TRIGGER_LABELS[key] ?? null;
}

/**
 * Déclencheurs d'une notification : `onX` pour chaque `supportsOnX` vrai du
 * modèle (ou de la ressource), plus `includeHealthWarnings` s'il existe.
 */
export function triggerKeys(base: Provider): string[] {
  const keys = Object.keys(base)
    .filter((key) => key.startsWith('supportsOn') && base[key] === true)
    .map((key) => `on${key.slice('supportsOn'.length)}`);
  if ('includeHealthWarnings' in base) keys.push('includeHealthWarnings');
  return keys;
}

/** Déclencheurs actifs d'une notification (colonne de la liste). */
export function activeTriggers(item: Provider): string[] {
  return triggerKeys(item).filter((key) => key !== 'includeHealthWarnings' && item[key] === true);
}

export interface ProviderForm {
  name: string;
  values: Record<string, unknown>;
  tags: number[];
  options: Record<string, unknown>;
  triggers: Record<string, boolean>;
}

/**
 * Ressource à enregistrer ou à tester : la ressource modifiée (ou le modèle)
 * sans ses modèles prédéfinis ni son message, avec le nom, les champs (tous),
 * les étiquettes, les options et les déclencheurs saisis.
 */
export function providerPayload(
  base: Provider,
  template: Provider,
  form: ProviderForm,
  editing: Provider | null,
): ProviderSaveRequest {
  const copy: Record<string, unknown> = { ...base };
  delete copy.presets;
  delete copy.message;
  return {
    ...copy,
    ...form.options,
    ...form.triggers,
    name: form.name.trim(),
    implementation: template.implementation ?? base.implementation ?? '',
    implementationName: template.implementationName ?? template.implementation ?? null,
    configContract: template.configContract ?? base.configContract ?? '',
    tags: form.tags,
    fields: fieldsPayload(template, form.values, editing),
  };
}

/** Valeur d'un champ d'une ressource (colonnes « hôte », « port »…). */
export function fieldValue(item: Provider, name: string): unknown {
  return item.fields?.find((field) => field.name === name)?.value;
}
