// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique du formulaire à schéma dynamique (`SchemaForm.vue`), port de
// `radarr/_schema_modal.html.twig` : choix du contrôle d'après le type du
// champ, catégories Newznab, valeurs initiales et `fields[]` à envoyer.
//
// Écarts : les textes du schéma (libellé, aide) sont rendus en
// texte, jamais en HTML (l'original les injectait tels quels) ; un champ
// `hiddenIfNotSet` vide est masqué ; les listes de valeurs deviennent des
// listes à puces au lieu d'un texte « séparé par des virgules ».

import type { ProviderField, ProviderSelectOption } from '@hubarr/shared';

/** Ressource ou modèle porteur de champs (provider, condition d'un format…). */
export interface FieldHolder {
  name?: string | null | undefined;
  implementation?: string | null | undefined;
  implementationName?: string | null | undefined;
  fields?: ProviderField[] | undefined;
}

export type FieldControl =
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'list'
  | 'number'
  | 'password'
  | 'url'
  | 'path'
  | 'info'
  | 'textarea'
  | 'text';

export interface FieldOption {
  value: number | string;
  title: string;
}

/**
 * Catégories Newznab standard (Torznab/Newznab) et leur clé i18n
 * (`media.arr_admin.schema_modal.newznab.<clé>`), proposées quand le schéma
 * ne donne pas d'options pour une liste de catégories.
 */
export const NEWZNAB_CATEGORIES: Readonly<Record<number, string>> = {
  1000: 'tv',
  1010: 'tv_webdl',
  1020: 'tv_foreign',
  1030: 'tv_sd',
  1040: 'tv_hd',
  1045: 'tv_uhd',
  1050: 'tv_other',
  1060: 'tv_sport_sub',
  1070: 'tv_anime',
  1080: 'tv_doc',
  2000: 'films',
  2010: 'films_foreign',
  2020: 'films_other',
  2030: 'films_sd',
  2040: 'films_hd',
  2045: 'films_uhd',
  2050: 'films_bluray',
  2060: 'films_3d',
  2070: 'films_dvd',
  2080: 'films_webdl',
  3000: 'audio',
  4000: 'pc',
  5000: 'tv_sport',
  5070: 'anime',
  5080: 'doc',
  6000: 'xxx',
  7000: 'books',
  8000: 'other',
};

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Champ affiché : ni `hidden`, ni `hiddenIfNotSet` sans valeur. */
export function fieldVisible(field: ProviderField, value: unknown): boolean {
  if (field.hidden === 'hidden') return false;
  if (field.hidden === 'hiddenIfNotSet') return !isEmpty(value);
  return true;
}

/** Libellé d'un champ (son nom à défaut, comme l'original). */
export function fieldLabel(field: ProviderField): string {
  return field.label ?? field.name;
}

function hasNewznabValues(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === 'number' && item in NEWZNAB_CATEGORIES)
  );
}

/** Contrôle à afficher pour un champ, d'après son type et sa valeur. */
export function controlOf(field: ProviderField, value: unknown): FieldControl {
  const options = field.selectOptions ?? [];
  switch (field.type) {
    case 'checkbox':
      return 'checkbox';
    case 'select':
      if (Array.isArray(value))
        return options.length > 0 || hasNewznabValues(value) ? 'multiselect' : 'list';
      return options.length > 0 ? 'select' : 'text';
    case 'tag':
    case 'tagSelect':
      return 'list';
    case 'textArea':
      return 'textarea';
    case 'number':
      return 'number';
    case 'password':
      return 'password';
    case 'url':
      return 'url';
    case 'path':
    case 'filePath':
      return 'path';
    case 'info':
      return 'info';
    default:
      return Array.isArray(value) ? 'list' : 'text';
  }
}

/**
 * Options d'un champ `select` ; pour une liste de catégories sans options
 * correspondantes, les catégories Newznab de la même famille (milliers) que
 * les valeurs, plus les valeurs déjà cochées. Une valeur inconnue des options
 * reste proposée (`#valeur`), pour ne jamais la perdre à l'enregistrement.
 */
export function optionsOf(
  field: ProviderField,
  value: unknown,
  newznabLabel: (key: string) => string,
): FieldOption[] {
  const schemaOptions = (field.selectOptions ?? []).map((option: ProviderSelectOption) => ({
    value: option.value,
    title: `${option.name ?? String(option.value)}${option.hint ? ` ${option.hint}` : ''}`,
  }));
  const values = Array.isArray(value) ? (value as unknown[]) : value === undefined ? [] : [value];
  const known = new Set(schemaOptions.map((option) => option.value));
  let options = schemaOptions;
  const matches = values.some((item) => known.has(item as number | string));
  if (Array.isArray(value) && !matches && hasNewznabValues(value)) {
    const families = new Set(
      values
        .filter((item): item is number => typeof item === 'number')
        .map((item) => Math.floor(item / 1000)),
    );
    options = Object.entries(NEWZNAB_CATEGORIES)
      .map(([code, key]) => ({ value: Number(code), key }))
      .filter(
        (entry) => families.has(Math.floor(entry.value / 1000)) || values.includes(entry.value),
      )
      .map((entry) => ({
        value: entry.value,
        title: `${newznabLabel(entry.key)} (${entry.value})`,
      }));
  }
  const offered = new Set(options.map((option) => option.value));
  const extra = values
    .filter((item): item is number | string => typeof item === 'number' || typeof item === 'string')
    .filter((item) => !offered.has(item))
    .map((item) => ({ value: item, title: `#${item}` }));
  return [...options, ...extra];
}

/** Valeur d'un champ dans une ressource existante (`fields[]`), sinon `undefined`. */
function existingValue(existing: FieldHolder | null, name: string): unknown {
  return existing?.fields?.find((field) => field.name === name)?.value;
}

/** Valeurs initiales : valeur existante, sinon valeur par défaut du modèle. */
export function initialValues(
  template: FieldHolder,
  existing: FieldHolder | null = null,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of template.fields ?? []) {
    const current = existingValue(existing, field.name);
    values[field.name] = current ?? field.value ?? null;
  }
  return values;
}

/**
 * `fields[]` à envoyer : **tous** les champs du modèle, cachés compris, avec
 * la valeur saisie, sinon la valeur existante, sinon la valeur par défaut.
 */
export function fieldsPayload(
  template: FieldHolder,
  values: Record<string, unknown>,
  existing: FieldHolder | null = null,
): { name: string; value: unknown }[] {
  return (template.fields ?? []).map((field) => ({
    name: field.name,
    value:
      field.name in values
        ? (values[field.name] ?? null)
        : (existingValue(existing, field.name) ?? field.value ?? null),
  }));
}

/**
 * Texte d'un champ `info` : aide du schéma, sinon sa valeur (les définitions
 * de Prowlarr y mettent du HTML, réduit ici à son texte : jamais injecté).
 */
export function infoText(field: ProviderField, value: unknown): string | null {
  const raw = field.helpText ?? (typeof value === 'string' ? value : null);
  if (raw === null) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
  return text === '' ? null : text;
}

/** Entrée libre d'une liste : nombre si elle n'a que des chiffres. */
export function listItem(raw: string): number | string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Nombre d'un champ numérique (`null` si vide ou illisible). */
export function numberValue(raw: unknown): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Libellé d'un modèle (`implementationName`, sinon `implementation`). */
export function templateLabel(template: FieldHolder): string {
  return template.implementationName ?? template.name ?? template.implementation ?? '?';
}

/** Modèle d'une ressource existante (même implémentation). */
export function templateFor<T extends FieldHolder>(
  templates: readonly T[],
  item: FieldHolder,
): T | null {
  return templates.find((template) => template.implementation === item.implementation) ?? null;
}
