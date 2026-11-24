// SPDX-License-Identifier: AGPL-3.0-or-later
// Instances Radarr/Sonarr : port de `ServiceInstanceProvider` et de
// `ServiceInstance::slugify`. Lecture directe en base (better-sqlite3 est
// synchrone et local) : plus besoin du cache par requête de l'original.
//
// Règles reprises :
// - instance par défaut = celle marquée **et active**, sinon la première active
//   par position, sinon aucune (le service est alors « non configuré ») ;
// - la première instance d'un type devient l'instance par défaut ; supprimer
//   l'instance par défaut promeut la suivante ;
// - slug tiré du nom (ou saisi), dédoublonné par `-2`, `-3`… à la création ;
//   un slug saisi déjà pris par une autre instance est refusé à l'édition ;
// - clé d'API vide à l'édition : inchangée ;
// - URL refusée si la garde SSRF la bloque (schéma, hôte, lien local).

import { isInstanceType, type InstanceType, type ServiceInstance } from '@hubarr/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { serviceInstances } from '../../db/schema';
import { urlBlockedReason, type HostResolver } from '../../integrations/http/url-guard';

export type InstanceRow = typeof serviceInstances.$inferSelect;

export type InstanceErrorReason =
  'name_required' | 'url_required' | 'url_blocked' | 'slug_taken' | 'unknown_type';

/** Saisie refusée (`InvalidArgumentException` d'origine). */
export class InstanceError extends Error {
  override readonly name = 'InstanceError';

  constructor(
    readonly reason: InstanceErrorReason,
    readonly field: 'name' | 'url' | 'slug' | 'type',
    readonly detail?: string,
  ) {
    super(detail === undefined ? reason : `${reason} (${detail})`);
  }
}

/** `ServiceInstance::slugify` : translittération ASCII, minuscules, tirets. */
export function slugify(name: string): string {
  const ascii = name
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ø/gi, 'o')
    .replace(/đ/gi, 'd')
    .replace(/ł/gi, 'l');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'instance' : slug;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function apiKeyOf(row: InstanceRow): string | null {
  return str(row.credentials.apiKey);
}

export function defaultQualityProfileIdOf(row: InstanceRow): number | null {
  const value = row.options.defaultQualityProfileId;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** Vue publique d'une instance (sans la clé d'API). */
export function toPublicInstance(row: InstanceRow): ServiceInstance {
  return {
    id: row.id,
    type: row.type as InstanceType,
    slug: row.slug,
    name: row.name,
    url: row.url,
    hasApiKey: apiKeyOf(row) !== null,
    enabled: row.enabled,
    isDefault: row.isDefault,
    position: row.position,
    defaultQualityProfileId: defaultQualityProfileIdOf(row),
  };
}

/** Toutes les instances d'un type, par position puis id. */
export function listInstances(db: DbExecutor, type: InstanceType): InstanceRow[] {
  return db
    .select()
    .from(serviceInstances)
    .where(eq(serviceInstances.type, type))
    .orderBy(asc(serviceInstances.position), asc(serviceInstances.id))
    .all();
}

export function listEnabledInstances(db: DbExecutor, type: InstanceType): InstanceRow[] {
  return listInstances(db, type).filter((row) => row.enabled);
}

export function hasAnyEnabledInstance(db: DbExecutor, type: InstanceType): boolean {
  return listEnabledInstances(db, type).length > 0;
}

/** Instance par défaut, toujours active. */
export function getDefaultInstance(db: DbExecutor, type: InstanceType): InstanceRow | null {
  const enabled = listEnabledInstances(db, type);
  return enabled.find((row) => row.isDefault) ?? enabled[0] ?? null;
}

export function getInstanceBySlug(
  db: DbExecutor,
  type: InstanceType,
  slug: string,
): InstanceRow | null {
  return (
    db
      .select()
      .from(serviceInstances)
      .where(and(eq(serviceInstances.type, type), eq(serviceInstances.slug, slug)))
      .get() ?? null
  );
}

export function findInstanceById(db: DbExecutor, id: number): InstanceRow | null {
  const row = db.select().from(serviceInstances).where(eq(serviceInstances.id, id)).get();
  return row !== undefined && isInstanceRow(row) ? row : null;
}

function isInstanceRow(row: InstanceRow): boolean {
  return row.type === 'radarr' || row.type === 'sonarr';
}

export interface InstanceInput {
  name: string;
  url: string;
  apiKey?: string | null | undefined;
  slug?: string | null | undefined;
  enabled?: boolean | undefined;
  position?: number | null | undefined;
}

export interface InstanceStoreOptions {
  /** Résolution DNS de la garde SSRF (tests). */
  resolve?: HostResolver | undefined;
}

async function validate(
  name: string,
  url: string,
  options: InstanceStoreOptions,
): Promise<{ name: string; url: string }> {
  const cleanName = name.trim();
  const cleanUrl = url.trim();
  if (cleanName === '') throw new InstanceError('name_required', 'name');
  if (cleanUrl === '') throw new InstanceError('url_required', 'url');
  const reason = await urlBlockedReason(cleanUrl, options.resolve);
  if (reason !== null) throw new InstanceError('url_blocked', 'url', reason);
  return { name: cleanName, url: cleanUrl };
}

function uniqueSlug(db: DbExecutor, type: InstanceType, base: string): string {
  if (getInstanceBySlug(db, type, base) === null) return base;
  let n = 2;
  while (getInstanceBySlug(db, type, `${base}-${n}`) !== null) n++;
  return `${base}-${n}`;
}

export async function createInstance(
  db: DbExecutor,
  type: InstanceType,
  input: InstanceInput & { defaultQualityProfileId?: number | null },
  options: InstanceStoreOptions = {},
): Promise<InstanceRow> {
  // Défense en profondeur : la route valide déjà le type.
  if (!isInstanceType(type)) throw new InstanceError('unknown_type', 'type');
  const { name, url } = await validate(input.name, input.url, options);
  const explicit = input.slug?.trim() ?? '';
  const slug = uniqueSlug(db, type, slugify(explicit !== '' ? explicit : name));
  const existing = listInstances(db, type);
  const autoPosition =
    existing.length === 0 ? 0 : Math.max(...existing.map((row) => row.position)) + 1;
  const apiKey = input.apiKey?.trim() ?? '';
  const [row] = db
    .insert(serviceInstances)
    .values({
      type,
      slug,
      name,
      url,
      credentials: apiKey === '' ? {} : { apiKey },
      options:
        input.defaultQualityProfileId == null
          ? {}
          : { defaultQualityProfileId: input.defaultQualityProfileId },
      enabled: input.enabled ?? true,
      isDefault: existing.length === 0,
      position: input.position ?? autoPosition,
    })
    .returning()
    .all();
  if (row === undefined) throw new Error('instance non créée');
  return row;
}

/**
 * `defaultQualityProfileId` : `undefined` inchangé, `null` « aucun » (premier
 * profil disponible), nombre : profil choisi.
 */
export async function updateInstance(
  db: DbExecutor,
  instance: InstanceRow,
  input: InstanceInput & { defaultQualityProfileId?: number | null | undefined },
  options: InstanceStoreOptions = {},
): Promise<InstanceRow> {
  const { name, url } = await validate(input.name, input.url, options);
  const type = instance.type as InstanceType;
  let slug = instance.slug;
  const requested = input.slug?.trim() ?? '';
  if (requested !== '' && requested !== instance.slug) {
    const next = slugify(requested);
    const clash = db
      .select({ id: serviceInstances.id })
      .from(serviceInstances)
      .where(
        and(
          eq(serviceInstances.type, type),
          eq(serviceInstances.slug, next),
          ne(serviceInstances.id, instance.id),
        ),
      )
      .get();
    if (clash !== undefined) throw new InstanceError('slug_taken', 'slug', next);
    slug = next;
  }
  const credentials = { ...instance.credentials };
  const apiKey = input.apiKey?.trim() ?? '';
  if (apiKey !== '') credentials.apiKey = apiKey;
  const instanceOptions = { ...instance.options };
  if (input.defaultQualityProfileId !== undefined) {
    if (input.defaultQualityProfileId === null) delete instanceOptions.defaultQualityProfileId;
    else instanceOptions.defaultQualityProfileId = input.defaultQualityProfileId;
  }
  const [row] = db
    .update(serviceInstances)
    .set({
      name,
      url,
      slug,
      credentials,
      options: instanceOptions,
      enabled: input.enabled ?? instance.enabled,
      position: input.position ?? instance.position,
      updatedAt: new Date(),
    })
    .where(eq(serviceInstances.id, instance.id))
    .returning()
    .all();
  if (row === undefined) throw new Error('instance introuvable');
  return row;
}

/** Efface les identifiants enregistrés d'une instance (clé d'API). */
export function clearInstanceCredentials(db: DbExecutor, instance: InstanceRow): void {
  db.update(serviceInstances)
    .set({ credentials: {}, updatedAt: new Date() })
    .where(eq(serviceInstances.id, instance.id))
    .run();
}

/** Bascule l'activation (clé d'API et autres champs inchangés). */
export function setInstanceEnabled(db: DbExecutor, instance: InstanceRow, enabled: boolean): void {
  db.update(serviceInstances)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(serviceInstances.id, instance.id))
    .run();
}

function promoteFirstToDefault(db: DbExecutor, type: InstanceType): void {
  const [first] = listInstances(db, type);
  if (first === undefined) return;
  db.update(serviceInstances)
    .set({ isDefault: true })
    .where(eq(serviceInstances.id, first.id))
    .run();
}

export function deleteInstance(db: DbExecutor, instance: InstanceRow): void {
  db.delete(serviceInstances).where(eq(serviceInstances.id, instance.id)).run();
  if (instance.isDefault) promoteFirstToDefault(db, instance.type as InstanceType);
}

/** Instance par défaut de son type ; sans effet si elle l'est déjà. */
export function setDefaultInstance(db: DbExecutor, instance: InstanceRow): void {
  if (instance.isDefault) return;
  db.update(serviceInstances)
    .set({ isDefault: false })
    .where(and(eq(serviceInstances.type, instance.type), ne(serviceInstances.id, instance.id)))
    .run();
  db.update(serviceInstances)
    .set({ isDefault: true })
    .where(eq(serviceInstances.id, instance.id))
    .run();
}
