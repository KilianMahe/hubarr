// SPDX-License-Identifier: AGPL-3.0-or-later
// Ressources à schéma de Prowlarr (P3c.3, `prowlarr/_schema_page`,
// `apps.html.twig`, `download_clients.html.twig`, `notifications.html.twig`) :
// familles (segment d'API, clés i18n, champs de niveau ressource), catalogue
// des modèles et ressource à enregistrer.
//
// Écarts : une seule vue et un seul dialogue pour les trois
// pages ; ressource enregistrée à partir de la ressource ou du modèle, champs
// réduits à `{ name, value }` ; déclencheurs des notifications affichés
// seulement s'ils existent dans le modèle.

import type { Provider, ProviderSaveRequest } from '@hubarr/shared';
import { fieldsPayload, initialValues } from '../arr-admin/schema-form';

export type ProwlarrProviderFamilyId = 'applications' | 'downloadClients' | 'notifications';

export type TopField =
  | { key: string; type: 'bool'; labelKey: string }
  | { key: string; type: 'number'; labelKey: string; fallback: number }
  | {
      key: string;
      type: 'select';
      labelKey: string;
      options: { value: string; labelKey: string }[];
    };

export interface ProwlarrProviderFamily {
  id: ProwlarrProviderFamilyId;
  /** Segment des routes d'élément (`/api/prowlarr/<segment>/…`). */
  segment: string;
  /** Liste (`/api/prowlarr<list>`). */
  list: string;
  /** Préfixe i18n (`prowlarr.apps`…). */
  prefix: string;
  /** Champs de niveau ressource, après le nom. */
  top: TopField[];
  /** Le catalogue montre le protocole (clients). */
  showProtocol: boolean;
}

const N = 'prowlarr.notifications';

export const PROWLARR_PROVIDER_FAMILIES: Record<ProwlarrProviderFamilyId, ProwlarrProviderFamily> =
  {
    applications: {
      id: 'applications',
      segment: 'application',
      list: '/applications',
      prefix: 'prowlarr.apps',
      showProtocol: false,
      top: [
        {
          key: 'syncLevel',
          type: 'select',
          labelKey: 'prowlarr.apps.sync_level_label',
          options: [
            { value: 'disabled', labelKey: 'prowlarr.apps.sync_disabled' },
            { value: 'addOnly', labelKey: 'prowlarr.apps.sync_add_only' },
            { value: 'fullSync', labelKey: 'prowlarr.apps.sync_full' },
          ],
        },
      ],
    },
    downloadClients: {
      id: 'downloadClients',
      segment: 'downloadclient',
      list: '/download-clients',
      prefix: 'prowlarr.download_clients',
      showProtocol: true,
      top: [
        {
          key: 'priority',
          type: 'number',
          labelKey: 'prowlarr.download_clients.field_priority',
          fallback: 1,
        },
        { key: 'enable', type: 'bool', labelKey: 'prowlarr.common.enabled' },
      ],
    },
    notifications: {
      id: 'notifications',
      segment: 'notification',
      list: '/notifications',
      prefix: N,
      showProtocol: false,
      top: [
        { key: 'onGrab', type: 'bool', labelKey: `${N}.trigger_grab` },
        { key: 'onHealthIssue', type: 'bool', labelKey: `${N}.trigger_health_issue` },
        { key: 'onHealthRestored', type: 'bool', labelKey: `${N}.trigger_health_restored` },
        { key: 'onApplicationUpdate', type: 'bool', labelKey: `${N}.trigger_app_update` },
        { key: 'includeHealthWarnings', type: 'bool', labelKey: `${N}.include_warnings` },
      ],
    },
  };

/** Champs de niveau ressource présents dans la ressource ou le modèle. */
export function presentTopFields(family: ProwlarrProviderFamily, base: Provider): TopField[] {
  return family.top.filter((field) => field.key in base);
}

/** Modèles affichés : recherche sur le nom et l'implémentation, 30 au plus (l'original). */
export function filterTemplates(
  templates: readonly Provider[],
  query: string,
  limit = 30,
): Provider[] {
  const q = query.trim().toLowerCase();
  return templates
    .filter((template) =>
      q === ''
        ? true
        : `${template.name ?? ''} ${template.implementationName ?? ''}`.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export interface ProviderFormState {
  name: string;
  top: Record<string, unknown>;
  tags: number[];
  values: Record<string, unknown>;
}

export function initialProviderForm(
  family: ProwlarrProviderFamily,
  base: Provider,
): ProviderFormState {
  const top: Record<string, unknown> = {};
  for (const field of presentTopFields(family, base)) {
    const value = base[field.key];
    if (field.type === 'bool')
      top[field.key] = field.key === 'enable' ? value !== false : value === true;
    else if (field.type === 'number')
      top[field.key] = typeof value === 'number' ? value : field.fallback;
    else top[field.key] = typeof value === 'string' ? value : (field.options[0]?.value ?? null);
  }
  return {
    name: base.name ?? base.implementationName ?? '',
    top,
    tags: [...(base.tags ?? [])],
    values: initialValues(base),
  };
}

/** Ressource à enregistrer ou à tester. */
export function providerSavePayload(base: Provider, form: ProviderFormState): ProviderSaveRequest {
  const copy: Record<string, unknown> = { ...base };
  delete copy.presets;
  delete copy.message;
  return {
    ...copy,
    ...form.top,
    name: form.name.trim(),
    implementation: base.implementation ?? '',
    configContract: base.configContract ?? '',
    tags: [...form.tags],
    fields: fieldsPayload(base, form.values),
  };
}

/** Champs résumés d'une carte (non secrets ; l'original : hôte, port, catégorie, utilisateur). */
const SUMMARY_FIELDS = ['baseUrl', 'host', 'port', 'category', 'username'];

export function summaryFields(item: Provider): { label: string; value: string }[] {
  return (item.fields ?? []).flatMap((field) => {
    if (!SUMMARY_FIELDS.includes(field.name)) return [];
    if (field.privacy === 'password' || field.privacy === 'apiKey' || field.type === 'password')
      return [];
    const value = field.value;
    const text = Array.isArray(value)
      ? value.filter((item) => typeof item === 'string' || typeof item === 'number').join(', ')
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    if (text === '') return [];
    return [{ label: field.label ?? field.name, value: text }];
  });
}
