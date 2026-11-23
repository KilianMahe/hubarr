// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique sans affichage des pages d'administration (P3b), sortie des vues
// pour être testée : profil de délai par défaut, éditeur de profil de qualité
// (port du JavaScript de `radarr/quality.html.twig`), tailles des définitions.

import type {
  DelayProfile,
  NamedRef,
  QualityDefinition,
  QualityProfile,
  QualityProfileItem,
} from '@hubarr/shared';

/** Ordre du profil de délai par défaut (le dernier, sans étiquette). */
const DEFAULT_DELAY_ORDER = 2147483647;

export function isDefaultDelayProfile(profile: DelayProfile): boolean {
  return profile.id === 1 || profile.order === DEFAULT_DELAY_ORDER;
}

/** Nombre saisi (un champ numérique vidé donne `''`) ; illisible → `0`. */
export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Profil de qualité ───────────────────────────────────────────────────────

/** Élément de l'éditeur : priorité décroissante (le plus prioritaire en haut). */
export interface EditableQualityItem {
  /** Clé stable pour le rendu et le déplacement. */
  key: string;
  item: QualityProfileItem;
  allowed: boolean;
}

function isGroup(item: QualityProfileItem): boolean {
  return Array.isArray(item.items) && item.items.length > 0;
}

/** Libellé d'un élément : qualité, ou nom du groupe. */
export function qualityItemLabel(item: QualityProfileItem): string {
  return item.quality?.name ?? item.name ?? '?';
}

/** Qualités d'un groupe (badges). */
export function groupQualities(item: QualityProfileItem): string[] {
  return isGroup(item) ? (item.items ?? []).map(qualityItemLabel) : [];
}

/** Identifiant de seuil d'un élément : id de la qualité, sinon id du groupe (≥ 1000). */
export function cutoffIdOf(item: QualityProfileItem): number | null {
  if (item.quality && typeof item.quality.id === 'number') return item.quality.id;
  return typeof item.id === 'number' ? item.id : null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Éléments de l'éditeur, du plus prioritaire au moins prioritaire (l'API les
 * range dans l'ordre inverse) : ceux du profil modifié ; pour un nouveau
 * profil, ceux du premier profil, tous décochés, sinon une qualité par
 * définition.
 */
export function editorItems(
  profile: QualityProfile | null,
  profiles: readonly QualityProfile[],
  definitions: readonly QualityDefinition[],
): EditableQualityItem[] {
  let source: QualityProfileItem[];
  if (profile?.items) {
    source = clone(profile.items);
  } else if (profiles[0]?.items && profiles[0].items.length > 0) {
    source = clone(profiles[0].items).map((item) => ({ ...item, allowed: false }));
  } else {
    source = definitions.flatMap((definition) =>
      definition.quality
        ? [
            {
              quality: { id: definition.quality.id, name: definition.quality.name ?? null },
              allowed: false,
              items: [],
            },
          ]
        : [],
    );
  }
  return source.reverse().map((item, index) => ({
    key: `${cutoffIdOf(item) ?? 'x'}-${index}`,
    item,
    allowed: item.allowed ?? false,
  }));
}

/** Seuils possibles : éléments cochés, dans l'ordre de l'éditeur. */
export function cutoffOptions(
  items: readonly EditableQualityItem[],
): { value: number; title: string }[] {
  return items.flatMap((entry) => {
    const id = cutoffIdOf(entry.item);
    return entry.allowed && id !== null ? [{ value: id, title: qualityItemLabel(entry.item) }] : [];
  });
}

/** Déplace un élément (glisser-déposer ou flèches) ; renvoie une nouvelle liste. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  if (moved !== undefined) copy.splice(to, 0, moved);
  return copy;
}

export interface QualityProfileForm {
  name: string;
  upgradeAllowed: boolean;
  cutoff: number | null;
  minFormatScore: number;
  cutoffFormatScore: number;
  /** Langue (Radarr) ; `null` : service sans langue de profil. */
  languageId: number | null;
  /** Score par format (`id` du format → score). */
  scores: Record<number, number>;
}

/**
 * Profil à enregistrer : fusion avec le profil modifié (champs inconnus
 * gardés), éléments remis dans l'ordre de l'API, qualités d'un groupe cochées
 * avec lui, scores de tous les formats, langue si le service en a une.
 */
export function profilePayload(
  form: QualityProfileForm,
  items: readonly EditableQualityItem[],
  formats: readonly NamedRef[],
  languages: readonly NamedRef[],
  existing: QualityProfile | null,
): QualityProfile {
  const apiItems = items
    .map((entry) => {
      const item = clone(entry.item);
      item.allowed = entry.allowed;
      if (isGroup(item))
        item.items = (item.items ?? []).map((sub) => ({ ...sub, allowed: entry.allowed }));
      return item;
    })
    .reverse();
  const payload: QualityProfile = {
    ...(existing ?? {}),
    name: form.name.trim(),
    cutoff: form.cutoff ?? 0,
    items: apiItems,
    upgradeAllowed: form.upgradeAllowed,
    minFormatScore: Math.trunc(toNumber(form.minFormatScore)),
    cutoffFormatScore: Math.trunc(toNumber(form.cutoffFormatScore)),
    minUpgradeFormatScore: existing?.minUpgradeFormatScore ?? 1,
    formatItems: formats.map((format) => ({
      format: format.id,
      name: format.name,
      score: Math.trunc(toNumber(form.scores[format.id])),
    })),
  };
  if (form.languageId !== null) {
    payload.language = {
      id: form.languageId,
      name: languages.find((language) => language.id === form.languageId)?.name ?? 'Any',
    };
  }
  return payload;
}

/** Formulaire initial d'un profil (nouveau : mise à niveau permise, langue « Any »). */
export function profileForm(
  profile: QualityProfile | null,
  withLanguage: boolean,
): QualityProfileForm {
  const scores: Record<number, number> = {};
  for (const item of profile?.formatItems ?? []) scores[item.format] = item.score;
  return {
    name: profile?.name ?? '',
    upgradeAllowed: profile ? (profile.upgradeAllowed ?? false) : true,
    cutoff: profile?.cutoff ?? null,
    minFormatScore: profile?.minFormatScore ?? 0,
    cutoffFormatScore: profile?.cutoffFormatScore ?? 0,
    languageId: withLanguage ? (profile?.language?.id ?? -1) : null,
    scores,
  };
}

/** Qualités cochées d'un profil (colonne « Qualités incluses »), plus prioritaire en premier. */
export function allowedQualities(profile: QualityProfile): string[] {
  return [...(profile.items ?? [])]
    .reverse()
    .filter((item) => item.allowed)
    .map(qualityItemLabel);
}

/** Libellé du seuil d'un profil. */
export function cutoffLabel(profile: QualityProfile): string {
  const item = (profile.items ?? []).find((candidate) => cutoffIdOf(candidate) === profile.cutoff);
  return item ? qualityItemLabel(item) : '—';
}

// ── Définitions de qualité ──────────────────────────────────────────────────

/** Mo par minute → Gio par heure (unité affichée par l'original). */
export function toGiBPerHour(mbPerMinute: number): number {
  return (mbPerMinute * 60) / 1024;
}

export function fromGiBPerHour(gibPerHour: number): number {
  return (gibPerHour * 1024) / 60;
}

/** Taille d'un film de `minutes` à ce débit, en Gio (`0` sous 0,1 Gio). */
export function sizeForMinutes(mbPerMinute: number, minutes: number): string {
  const gib = (mbPerMinute * minutes) / 1024;
  return gib < 0.1 ? '0' : `${gib.toFixed(1)} GiB`;
}

/** Bornes d'une définition, rangées (min ≤ préférée ≤ max ≤ limite). */
export function clampSizes(
  min: number,
  preferred: number,
  max: number,
  limit: number,
): { minSize: number; preferredSize: number; maxSize: number } {
  const minSize = Math.min(Math.max(0, min), limit);
  const maxSize = Math.min(Math.max(minSize, max), limit);
  const preferredSize = Math.min(Math.max(minSize, preferred), maxSize);
  return { minSize, preferredSize, maxSize };
}

// ── Filtres personnalisés ───────────────────────────────────────────────────

/** Écrans de l'instance qui ont des filtres personnalisés. */
export const CUSTOM_FILTER_TYPES = {
  radarr: [
    'movieIndex',
    'collection',
    'releases',
    'interactiveImport',
    'history',
    'blocklist',
    'queue',
  ],
  sonarr: [
    'seriesIndex',
    'releases',
    'interactiveImport',
    'history',
    'blocklist',
    'queue',
    'importList',
  ],
} as const satisfies Record<'radarr' | 'sonarr', readonly string[]>;

/** Conditions saisies en JSON : tableau d'objets `{ key, value, type }`, sinon `null`. */
export function parseFilterConditions(
  raw: string,
): { key: string; value: unknown; type: string }[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim() === '' ? '[]' : raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const conditions: { key: string; value: unknown; type: string }[] = [];
  for (const item of parsed as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.type !== 'string') return null;
    conditions.push({ key: record.key, value: record.value, type: record.type });
  }
  return conditions;
}

// ── Système ─────────────────────────────────────────────────────────────────

/** Intervalle d'une tâche (minutes), dans l'unité la plus grande qui tombe juste (`Intl`). */
export function formatInterval(minutes: number | null, locale: string): string {
  if (minutes === null || minutes <= 0) return '—';
  const [value, unit] =
    minutes % 1440 === 0
      ? [minutes / 1440, 'day']
      : minutes % 60 === 0
        ? [minutes / 60, 'hour']
        : [minutes, 'minute'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
}

/** Lignes de journal qui contiennent la recherche (message, source, exception). */
export function filterLogs<
  T extends { message: string | null; logger: string | null; exception: string | null },
>(records: readonly T[], search: string | null): T[] {
  const needle = (search ?? '').trim().toLowerCase();
  if (needle === '') return [...records];
  return records.filter((record) =>
    [record.message, record.logger, record.exception].some((value) =>
      (value ?? '').toLowerCase().includes(needle),
    ),
  );
}

/** Épisodes groupés par date locale de diffusion, dans l'ordre chronologique. */
export function groupByAirDate<T extends { airDate: string | null; airDateUtc: string | null }>(
  episodes: readonly T[],
): { date: string; episodes: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const episode of episodes) {
    const date = episode.airDate ?? episode.airDateUtc?.slice(0, 10) ?? null;
    if (date === null) continue;
    groups.set(date, [...(groups.get(date) ?? []), episode]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      episodes: [...list].sort((a, b) => (a.airDateUtc ?? '').localeCompare(b.airDateUtc ?? '')),
    }));
}
