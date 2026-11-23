// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique de la page des indexeurs Prowlarr (P3c.1), port du JavaScript inline
// de `prowlarr/index.html.twig` : filtre de la liste, catalogue des
// définitions (recherche, filtres, pertinence), formulaire d'un indexeur
// (champs de niveau indexeur et champs du schéma), capacités de la fiche.
//
// Écarts : la liste est filtrée sur les données (l'original
// cherchait « Torrent » dans le HTML de la ligne) ; l'indexeur enregistré
// part de l'indexeur (ou du modèle) sans ses modèles prédéfinis, son message
// ni son statut, champs réduits à `{ name, value }` (l'original devait retirer
// les options qu'il avait lui-même injectées).

import type {
  Provider,
  ProviderField,
  ProviderSaveRequest,
  ProwlarrIndexer,
  ProwlarrIndexerFilter,
  ProwlarrOverview,
} from '@hubarr/shared';
import { fieldsPayload, initialValues } from '../arr-admin/schema-form';

/** Indexeurs affichés pour le filtre choisi. */
export function filterIndexers(
  indexers: readonly ProwlarrIndexer[],
  filter: ProwlarrIndexerFilter,
): ProwlarrIndexer[] {
  switch (filter) {
    case 'enabled':
      return indexers.filter((indexer) => indexer.enabled);
    case 'disabled':
      return indexers.filter((indexer) => !indexer.enabled);
    case 'torrent':
    case 'usenet':
      return indexers.filter((indexer) => indexer.protocol === filter);
    default:
      return [...indexers];
  }
}

/** Santé affichée d'un indexeur (colonne « Santé »). */
export function indexerHealth(indexer: ProwlarrIndexer): 'disabled' | 'error' | 'ok' {
  if (!indexer.enabled) return 'disabled';
  return indexer.status === null ? 'ok' : 'error';
}

/**
 * Page après la bascule d'un indexeur, sans la relire (l'original changeait
 * le bouton sur place) : indexeur et tuile « actifs » mis à jour.
 */
export function withIndexerEnabled(
  overview: ProwlarrOverview,
  id: number,
  enabled: boolean,
): ProwlarrOverview {
  const indexers = overview.indexers.map((indexer) =>
    indexer.id === id ? { ...indexer, enabled } : indexer,
  );
  return {
    ...overview,
    indexers,
    totals: { ...overview.totals, enabled: indexers.filter((indexer) => indexer.enabled).length },
  };
}

// ── Catalogue des définitions (ajout) ────────────────────────────────────────

/** Texte sans accents ni majuscules (recherche du catalogue). */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface CatalogFilters {
  q: string;
  protocol: string;
  privacy: string;
  language: string;
  category: string;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  q: '',
  protocol: '',
  privacy: '',
  language: '',
  category: '',
};

/** Nombre de définitions affichées au plus (l'original : 60). */
export const CATALOG_LIMIT = 60;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Catégories de premier niveau annoncées par une définition. */
function categoryNames(definition: Provider): string[] {
  const capabilities = definition.capabilities as { categories?: unknown } | null | undefined;
  const categories = Array.isArray(capabilities?.categories) ? capabilities.categories : [];
  return categories.flatMap((category: unknown) => {
    const name = (category as { name?: unknown } | null)?.name;
    return typeof name === 'string' && name !== '' ? [name] : [];
  });
}

export interface CatalogOption {
  value: string;
  count: number;
}

/**
 * Langues (ordre alphabétique) et catégories (les plus fréquentes d'abord)
 * proposées par les filtres du catalogue, avec leur effectif.
 */
export function catalogOptions(definitions: readonly Provider[]): {
  languages: CatalogOption[];
  categories: CatalogOption[];
} {
  const languages = new Map<string, number>();
  const categories = new Map<string, number>();
  for (const definition of definitions) {
    const language = str(definition.language);
    if (language !== '') languages.set(language, (languages.get(language) ?? 0) + 1);
    for (const name of categoryNames(definition)) {
      categories.set(name, (categories.get(name) ?? 0) + 1);
    }
  }
  return {
    languages: [...languages]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    categories: [...categories]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  };
}

/** Nom affiché d'une définition. */
export function definitionLabel(definition: Provider): string {
  return (
    str(definition.name) ||
    str(definition.definitionName) ||
    str(definition.implementationName) ||
    '—'
  );
}

/**
 * Définitions retenues : tous les mots de la recherche présents (nom,
 * définition, implémentation, description, langue ; accents ignorés), puis
 * protocole, confidentialité, langue et catégorie exacts ; triées par
 * pertinence quand on cherche (terme dans le nom, puis en tête, puis
 * alphabétique) ; `CATALOG_LIMIT` au plus.
 */
export function filterCatalog(
  definitions: readonly Provider[],
  filters: CatalogFilters,
  limit = CATALOG_LIMIT,
): Provider[] {
  const query = foldText(filters.q.trim());
  const words = query.split(/\s+/).filter((word) => word !== '');
  const matches = definitions.filter((definition) => {
    if (words.length > 0) {
      const haystack = foldText(
        [
          definition.name,
          definition.definitionName,
          definition.implementationName,
          definition.description,
          definition.language,
        ]
          .map(str)
          .join(' '),
      );
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    if (filters.protocol !== '' && definition.protocol !== filters.protocol) return false;
    if (filters.privacy !== '' && definition.privacy !== filters.privacy) return false;
    if (filters.language !== '' && definition.language !== filters.language) return false;
    if (filters.category !== '' && !categoryNames(definition).includes(filters.category)) {
      return false;
    }
    return true;
  });
  if (query !== '') {
    const nameOf = (definition: Provider) =>
      foldText(`${str(definition.name)} ${str(definition.definitionName)}`);
    matches.sort((a, b) => {
      const aName = nameOf(a);
      const bName = nameOf(b);
      const inName = Number(bName.includes(query)) - Number(aName.includes(query));
      if (inName !== 0) return inName;
      const starts = Number(bName.startsWith(query)) - Number(aName.startsWith(query));
      if (starts !== 0) return starts;
      return str(a.name).localeCompare(str(b.name));
    });
  }
  return matches.slice(0, limit);
}

// ── Formulaire d'un indexeur ─────────────────────────────────────────────────

/** Adresses proposées pour un indexeur (`indexerUrls`). */
function indexerUrls(base: Provider): string[] {
  return Array.isArray(base.indexerUrls)
    ? base.indexerUrls.filter((url): url is string => typeof url === 'string' && url !== '')
    : [];
}

/**
 * Copie de l'indexeur (ou du modèle) dont le champ `baseUrl` propose les
 * `indexerUrls` quand le schéma ne donne pas d'options ; un modèle sans
 * adresse choisie prend la première.
 */
export function withBaseUrlOptions(base: Provider, isTemplate: boolean): Provider {
  const urls = indexerUrls(base);
  if (urls.length === 0 || !Array.isArray(base.fields)) return base;
  return {
    ...base,
    fields: base.fields.map((field) => {
      if (field.name !== 'baseUrl' || (field.selectOptions ?? []).length > 0) return field;
      const empty = field.value === null || field.value === undefined || field.value === '';
      return {
        ...field,
        type: 'select',
        selectOptions: urls.map((url, order) => ({ value: url, name: url, order })),
        ...(isTemplate && empty ? { value: urls[0] } : {}),
      };
    }),
  };
}

/** Champs du schéma affichés (le fichier de définition reste caché, comme l'original). */
export function visibleFields(base: Provider): ProviderField[] {
  return (base.fields ?? []).filter((field) => field.name !== 'definitionFile');
}

export interface IndexerForm {
  name: string;
  appProfileId: number | null;
  priority: number;
  enable: boolean;
  redirect: boolean;
  tags: number[];
  values: Record<string, unknown>;
}

/**
 * Formulaire initial : valeurs de l'indexeur (ou du modèle). Profil
 * d'application de l'indexeur s'il existe encore, sinon le premier profil ;
 * priorité 25 et activé par défaut, comme l'original.
 */
export function initialIndexerForm(base: Provider, profileIds: readonly number[]): IndexerForm {
  const profile = typeof base.appProfileId === 'number' ? base.appProfileId : null;
  return {
    name: definitionLabel(base) === '—' ? '' : definitionLabel(base),
    appProfileId:
      profile !== null && profileIds.includes(profile) ? profile : (profileIds[0] ?? profile),
    priority: typeof base.priority === 'number' ? base.priority : 25,
    enable: base.enable !== false,
    redirect: base.redirect === true,
    tags: [...(base.tags ?? [])],
    values: initialValues(base),
  };
}

/** Indexeur à enregistrer ou à tester. */
export function indexerPayload(base: Provider, form: IndexerForm): ProviderSaveRequest {
  const copy: Record<string, unknown> = { ...base };
  delete copy.presets;
  delete copy.message;
  delete copy.status;
  return {
    ...copy,
    name: form.name.trim(),
    implementation: str(base.implementation),
    configContract: str(base.configContract),
    enable: form.enable,
    redirect: form.redirect,
    priority: form.priority,
    ...(form.appProfileId === null ? {} : { appProfileId: form.appProfileId }),
    tags: [...form.tags],
    fields: fieldsPayload(base, form.values),
  };
}

// ── Fiche d'un indexeur ──────────────────────────────────────────────────────

export interface CapabilityRow {
  labelKey: string;
  /** Capacité oui/non (RSS, recherche brute). */
  supported?: boolean;
  /** Paramètres acceptés (dédoublonnés), vide : non supportée. */
  params?: string[];
}

function params(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

/** Capacités de recherche (onglet « Détails » de la fiche). */
export function capabilityRows(indexer: Provider): CapabilityRow[] {
  const capabilities = (indexer.capabilities ?? {}) as Record<string, unknown>;
  const prefix = 'prowlarr.index.info_cap_';
  return [
    { labelKey: `${prefix}rss`, supported: indexer.supportsRss === true },
    { labelKey: `${prefix}raw_search`, supported: capabilities.supportsRawSearch === true },
    { labelKey: `${prefix}search`, params: params(capabilities.searchParams) },
    { labelKey: `${prefix}tv_search`, params: params(capabilities.tvSearchParams) },
    { labelKey: `${prefix}movie_search`, params: params(capabilities.movieSearchParams) },
    { labelKey: `${prefix}music_search`, params: params(capabilities.musicSearchParams) },
    { labelKey: `${prefix}book_search`, params: params(capabilities.bookSearchParams) },
  ];
}

/** Libellés connus des paramètres de recherche (`info_param_*`). */
const PARAM_KEYS: Record<string, string> = {
  q: 'q',
  season: 'season',
  ep: 'ep',
  imdbId: 'imdb',
  tmdbId: 'tmdb',
  tvdbId: 'tvdb',
  tvMazeId: 'tvmaze',
  year: 'year',
  genre: 'genre',
  artist: 'artist',
  album: 'album',
  label: 'label',
  title: 'title',
  author: 'author',
};

/** Clé i18n d'un paramètre de recherche, `null` s'il est inconnu (affiché tel quel). */
export function paramLabelKey(param: string): string | null {
  const key = PARAM_KEYS[param];
  return key === undefined ? null : `prowlarr.index.info_param_${key}`;
}

export interface CategoryRow {
  id: number;
  name: string;
  sub: boolean;
}

/** Catégories et sous-catégories annoncées par l'indexeur, à plat (onglet « Catégories »). */
export function categoryRows(indexer: Provider): CategoryRow[] {
  const capabilities = (indexer.capabilities ?? {}) as { categories?: unknown };
  const categories = Array.isArray(capabilities.categories) ? capabilities.categories : [];
  const rows: CategoryRow[] = [];
  for (const raw of categories as { id?: unknown; name?: unknown; subCategories?: unknown }[]) {
    if (typeof raw.id !== 'number') continue;
    rows.push({ id: raw.id, name: str(raw.name), sub: false });
    const subs = Array.isArray(raw.subCategories) ? raw.subCategories : [];
    for (const sub of subs as { id?: unknown; name?: unknown }[]) {
      if (typeof sub.id === 'number') rows.push({ id: sub.id, name: str(sub.name), sub: true });
    }
  }
  return rows;
}

/** Adresse affichée en lien : http(s) seulement (garde des liens `javascript:`). */
export function safeLink(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

/** Adresses de l'indexeur pour la fiche. */
export function indexerLinks(indexer: Provider): { url: string; href: string | null }[] {
  return indexerUrls(indexer).map((url) => ({ url, href: safeLink(url) }));
}
