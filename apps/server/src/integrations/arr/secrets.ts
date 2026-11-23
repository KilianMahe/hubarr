// SPDX-License-Identifier: AGPL-3.0-or-later
// Secrets des ressources d'administration Radarr/Sonarr.
//
// L'original renvoyait au navigateur les mots de passe et clés des indexeurs,
// clients, notifications, ainsi que la clé d'API et les mots de passe de la
// configuration de l'hôte. Hubarr ne transmet jamais un secret (D64) : le
// serveur remplace leur valeur par `ARR_SECRET_MASK`, et, à l'enregistrement,
// une valeur restée masquée reprend le secret actuel de l'instance. Radarr v5
// et Sonarr v4 masquent déjà ces champs de la même façon : les deux règles se
// recouvrent sans se gêner.

import { ARR_SECRET_MASK } from '@hubarr/shared';
import type { ArrRecord } from './admin';

/** Niveaux de confidentialité des champs à masquer. */
const SECRET_PRIVACY = new Set(['password', 'apiKey']);

/** Clés secrètes des sections de configuration (hôte surtout). */
export const CONFIG_SECRET_KEYS = [
  'apiKey',
  'password',
  'passwordConfirmation',
  'proxyPassword',
  'sslCertPassword',
] as const;

function isRecord(value: unknown): value is ArrRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSecretField(field: ArrRecord): boolean {
  return typeof field.privacy === 'string' && SECRET_PRIVACY.has(field.privacy);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function fieldsOf(resource: ArrRecord): ArrRecord[] {
  return Array.isArray(resource.fields) ? resource.fields.filter(isRecord) : [];
}

/**
 * Copie d'une ressource dont les champs secrets renseignés sont masqués. Un
 * champ est secret d'après sa confidentialité, dans la ressource ou dans la
 * ressource de référence (`reference` : la ressource de l'instance, quand la
 * réponse ne reprend que les noms et valeurs envoyés).
 */
export function maskProviderSecrets<T extends ArrRecord>(
  resource: T,
  reference: ArrRecord | null = null,
): T {
  if (!Array.isArray(resource.fields)) return resource;
  const secretNames = new Set(
    [...fieldsOf(resource), ...(reference ? fieldsOf(reference) : [])]
      .filter(isSecretField)
      .map((field) => field.name),
  );
  return {
    ...resource,
    fields: fieldsOf(resource).map((field) =>
      secretNames.has(field.name) && hasValue(field.value)
        ? { ...field, value: ARR_SECRET_MASK }
        : field,
    ),
  };
}

/**
 * Restitue les secrets restés masqués d'une ressource à enregistrer ou à
 * tester, d'après la ressource actuelle de l'instance (même nom de champ).
 */
export function restoreProviderSecrets<T extends ArrRecord>(
  payload: T,
  current: ArrRecord | null,
): T {
  if (current === null || !Array.isArray(payload.fields)) return payload;
  const currentValues = new Map(fieldsOf(current).map((field) => [field.name, field.value]));
  return {
    ...payload,
    fields: fieldsOf(payload).map((field) =>
      field.value === ARR_SECRET_MASK && currentValues.has(field.name)
        ? { ...field, value: currentValues.get(field.name) }
        : field,
    ),
  };
}

/** Copie d'une section de configuration dont les secrets renseignés sont masqués. */
export function maskConfigSecrets<T extends ArrRecord>(config: T): T {
  const copy: ArrRecord = { ...config };
  for (const key of CONFIG_SECRET_KEYS) {
    if (hasValue(copy[key])) copy[key] = ARR_SECRET_MASK;
  }
  return copy as T;
}

/**
 * Modification d'une section : un secret masqué, vide ou absent n'est pas
 * modifié (il garde la valeur actuelle à la fusion) ; la clé d'API ne se
 * modifie jamais depuis Hubarr (l'original l'affichait en lecture seule).
 */
export function configPatchWithoutSecrets(patch: ArrRecord): ArrRecord {
  const secrets = new Set<string>(CONFIG_SECRET_KEYS);
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) =>
        key !== 'apiKey' &&
        !(secrets.has(key) && (value === ARR_SECRET_MASK || value === '' || value === null)),
    ),
  );
}
