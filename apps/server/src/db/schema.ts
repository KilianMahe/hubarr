// SPDX-License-Identifier: AGPL-3.0-or-later
// Schéma de la base SQLite. Toute modification passe par `make db-generate`, qui
// écrit une nouvelle migration SQL dans `db/migrations` ; un test vérifie que
// schéma et migrations restent synchronisés.
//
// Conventions : horodatages en millisecondes (`timestamp_ms`), valeurs libres en
// JSON validé par zod côté application, e-mails stockés en minuscules.

import { ACCESS_LEVELS, MEDIA_TYPES, USER_ROLES } from '@hubarr/shared';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/** Comptes : l'admin créé par l'assistant, puis ceux qu'ajoute un admin. */
export const users = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('user'),
  displayName: text('display_name'),
  /** Nom du fichier dans `<data>/avatars`, jamais un chemin. */
  avatarFile: text('avatar_file'),
  /** Identité Tracearr associée (lectures « Vu »), jamais envoyée au navigateur. */
  tracearrUserId: text('tracearr_user_id'),
  /** Préférences du compte (`UserPreferences`), relues avec `parseUserPreferences`. */
  preferences: text('preferences', { mode: 'json' }).$type<unknown>(),
  createdAt: createdAt(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

/** Sessions HTTP (store de `@fastify/session`, P0.6). */
export const sessions = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    /** Nul tant que la session n'est pas authentifiée. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('session_expires_at_idx').on(table.expiresAt),
    index('session_user_id_idx').on(table.userId),
  ],
);

/** Réglages clé-valeur (préférences d'affichage, dashboard, thème, état de l'installation). */
export const settings = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>(),
  updatedAt: updatedAt(),
});

/**
 * Instances de **tous** les services (et plus seulement Radarr/Sonarr comme dans
 * l'original). Le multi-instances reste limité à Radarr/Sonarr dans l'UI.
 */
export const serviceInstances = sqliteTable(
  'service_instance',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** Clé d'API, ou utilisateur et mot de passe selon le service. En clair. */
    credentials: text('credentials', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** Options propres au service (`defaultQualityProfileId`…). */
    options: text('options', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('service_instance_type_slug_uq').on(table.type, table.slug),
    index('service_instance_type_position_idx').on(table.type, table.position),
  ],
);

/**
 * Droits d'un compte non admin sur un service : par instance pour
 * Radarr/Sonarr (`instance_id`), par service sinon (`instance_id` nul).
 * Supprimés avec le compte ou l'instance.
 */
export const userPermissions = sqliteTable(
  'user_permission',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    service: text('service').notNull(),
    instanceId: integer('instance_id').references(() => serviceInstances.id, {
      onDelete: 'cascade',
    }),
    level: text('level', { enum: ACCESS_LEVELS }).notNull(),
  },
  (table) => [
    index('user_permission_user_idx').on(table.userId),
    uniqueIndex('user_permission_scope_uq').on(table.userId, table.service, table.instanceId),
  ],
);

/** Watchlist TMDB, globale (sans lien avec un utilisateur, comme l'original). */
export const watchlistItems = sqliteTable(
  'watchlist_item',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tmdbId: integer('tmdb_id').notNull(),
    mediaType: text('media_type', { enum: MEDIA_TYPES }).notNull(),
    title: text('title').notNull(),
    posterPath: text('poster_path'),
    vote: real('vote'),
    year: integer('year'),
    addedAt: integer('added_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    notes: text('notes'),
  },
  (table) => [uniqueIndex('watchlist_item_tmdb_media_uq').on(table.tmdbId, table.mediaType)],
);

/**
 * Lectures Tracearr synchronisées (lot 7, « Vu ») : une ligne par lecture
 * (chaîne de reprises), pour les seules identités associées à un compte.
 * Films : `tmdbId` du film ; épisodes : `tmdbId`/`tvdbId` de la série.
 */
export const tracearrWatch = sqliteTable(
  'tracearr_watch',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tracearrUserId: text('tracearr_user_id').notNull(),
    /** Identifiant de la lecture côté Tracearr (unique). */
    recordId: text('record_id').notNull(),
    mediaType: text('media_type', { enum: ['movie', 'episode'] }).notNull(),
    tmdbId: integer('tmdb_id'),
    tvdbId: integer('tvdb_id'),
    season: integer('season'),
    episode: integer('episode'),
    watchedAt: integer('watched_at', { mode: 'timestamp_ms' }).notNull(),
    /** Progression en pourcentage (0-100). */
    percent: integer('percent').notNull().default(0),
    watched: integer('watched', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    uniqueIndex('tracearr_watch_record_uq').on(table.recordId),
    index('tracearr_watch_user_idx').on(table.tracearrUserId, table.mediaType),
  ],
);

/** État de la synchronisation, par identité Tracearr. */
export const tracearrSync = sqliteTable('tracearr_sync', {
  tracearrUserId: text('tracearr_user_id').primaryKey(),
  /** Début de la lecture la plus récente importée (curseur incrémental). */
  cursorAt: integer('cursor_at', { mode: 'timestamp_ms' }),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  /** Code d'erreur du dernier passage (`null` : réussi). */
  lastError: text('last_error'),
});
