// SPDX-License-Identifier: AGPL-3.0-or-later
// Champs de configuration des 15 services (`AdminSettingsController::FIELDS`,
// `SERVICE_LABELS`, `HealthService::isConfigured` et `TOGGLEABLE_SERVICES`
// d'origine). Source unique : le serveur valide et stocke, le front affiche.

import type { ServiceId } from './services';

/** Champs d'identification d'un service, stockés dans `service_instance`. */
export const SERVICE_FIELD_KEYS = ['url', 'apiKey', 'user', 'password'] as const;
export type ServiceFieldKey = (typeof SERVICE_FIELD_KEYS)[number];

/** Champs secrets : jamais renvoyés au navigateur, une saisie vide vaut « inchangé ». */
export const SECRET_FIELD_KEYS = ['apiKey', 'password'] as const satisfies ServiceFieldKey[];
export type SecretFieldKey = (typeof SECRET_FIELD_KEYS)[number];

export function isSecretField(key: ServiceFieldKey): key is SecretFieldKey {
  return (SECRET_FIELD_KEYS as readonly string[]).includes(key);
}

export interface ServiceFieldSpec {
  key: ServiceFieldKey;
  /** Clé i18n du libellé. */
  labelKey: string;
  placeholder?: string;
  /**
   * Effaçable explicitement (bouton « Effacer ») : identifiants laissés vides
   * derrière un proxy qui authentifie à la place du service (issue #10).
   */
  clearable?: boolean;
}

export interface ServiceSettingsSpec {
  /** Nom affiché (marque, non traduit). */
  label: string;
  fields: readonly ServiceFieldSpec[];
  /** Champs exigés pour que le service soit « configuré ». */
  required: readonly ServiceFieldKey[];
  /** Interrupteur « Activé » propre au service (Radarr/Sonarr : par instance). */
  toggleable: boolean;
  /** Bouton « Tester » (Gluetun n'a pas de sonde dans l'original). */
  testable: boolean;
}

const URL = (placeholder?: string): ServiceFieldSpec => ({
  key: 'url',
  labelKey: 'admin.field.url',
  ...(placeholder === undefined ? {} : { placeholder }),
});
const API_KEY = (placeholder?: string): ServiceFieldSpec => ({
  key: 'apiKey',
  labelKey: 'admin.field.api_key',
  ...(placeholder === undefined ? {} : { placeholder }),
});
const USER: ServiceFieldSpec = { key: 'user', labelKey: 'admin.field.username', clearable: true };
const PASSWORD: ServiceFieldSpec = {
  key: 'password',
  labelKey: 'admin.field.password',
  clearable: true,
};

export const SERVICE_SETTINGS = {
  tmdb: {
    label: 'TMDb',
    fields: [{ key: 'apiKey', labelKey: 'admin.field.tmdb.api_key', placeholder: '7a2f4…' }],
    required: ['apiKey'],
    toggleable: true,
    testable: true,
  },
  radarr: {
    label: 'Radarr',
    fields: [URL('http://host.docker.internal:7878'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: false,
    testable: true,
  },
  sonarr: {
    label: 'Sonarr',
    fields: [URL('http://host.docker.internal:8989'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: false,
    testable: true,
  },
  prowlarr: {
    label: 'Prowlarr',
    fields: [URL('http://host.docker.internal:9696'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  seerr: {
    label: 'Seerr',
    fields: [URL('http://host.docker.internal:5055'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  qbittorrent: {
    label: 'qBittorrent',
    fields: [URL('http://host.docker.internal:8080'), USER, PASSWORD],
    required: ['url'],
    toggleable: true,
    testable: true,
  },
  deluge: {
    label: 'Deluge',
    fields: [URL('http://host.docker.internal:8112'), PASSWORD],
    required: ['url'],
    toggleable: true,
    testable: true,
  },
  transmission: {
    label: 'Transmission',
    fields: [URL('http://host.docker.internal:9091'), USER, PASSWORD],
    required: ['url'],
    toggleable: true,
    testable: true,
  },
  sabnzbd: {
    label: 'SABnzbd',
    fields: [URL('http://host.docker.internal:8080'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  nzbget: {
    label: 'NZBGet',
    fields: [URL('http://host.docker.internal:6789'), USER, PASSWORD],
    required: ['url'],
    toggleable: true,
    testable: true,
  },
  gluetun: {
    label: 'Gluetun',
    fields: [URL(), { key: 'apiKey', labelKey: 'admin.field.api_key_if_protected' }],
    required: ['url'],
    toggleable: false,
    testable: false,
  },
  tautulli: {
    label: 'Tautulli',
    fields: [URL('http://host.docker.internal:8181'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  tracearr: {
    label: 'Tracearr',
    fields: [URL('http://host.docker.internal:3000'), API_KEY('trr_pub_…')],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  emby: {
    label: 'Emby',
    fields: [URL('http://host.docker.internal:8096'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
  bazarr: {
    label: 'Bazarr',
    fields: [URL('http://host.docker.internal:6767'), API_KEY()],
    required: ['url', 'apiKey'],
    toggleable: true,
    testable: true,
  },
} as const satisfies Record<ServiceId, ServiceSettingsSpec>;

/** Services à instances multiples (Radarr, Sonarr) : gérés par `/api/admin/instances`. */
export const INSTANCE_TYPES = ['radarr', 'sonarr'] as const;
export type InstanceType = (typeof INSTANCE_TYPES)[number];

export function isInstanceType(value: unknown): value is InstanceType {
  return value === 'radarr' || value === 'sonarr';
}

/** Services à configuration unique (une ligne `service_instance` chacun). */
export type FlatServiceId = Exclude<ServiceId, InstanceType>;

/** Regroupement de la section « Services externes » des paramètres. */
export const SETTINGS_SERVICE_GROUPS = [
  { labelKey: 'admin.services.group.media', ids: ['tmdb', 'radarr', 'sonarr'] },
  { labelKey: 'admin.services.group.indexers', ids: ['prowlarr', 'seerr'] },
  {
    labelKey: 'admin.services.group.downloads',
    ids: ['qbittorrent', 'deluge', 'transmission', 'sabnzbd', 'nzbget', 'gluetun'],
  },
  { labelKey: 'admin.services.group.monitoring', ids: ['tautulli', 'tracearr', 'emby', 'bazarr'] },
] as const satisfies readonly { labelKey: string; ids: readonly ServiceId[] }[];

/**
 * Pages internes sans service propre, masquables du menu comme les services
 * (`INTERNAL_FEATURES` d'origine).
 */
export const INTERNAL_FEATURES = ['calendar'] as const;
export type InternalFeature = (typeof INTERNAL_FEATURES)[number];

/** Catégories du diagnostic de « Tester la connexion » (`HealthService::diagnose`). */
export const DIAGNOSIS_CATEGORIES = [
  'ok',
  'unconfigured',
  'network',
  'auth',
  'forbidden',
  'not_found',
  'server_error',
  'host_whitelist',
  'unknown',
] as const;
export type DiagnosisCategory = (typeof DIAGNOSIS_CATEGORIES)[number];
