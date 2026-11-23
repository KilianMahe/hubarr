// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import { createTestDatabase, MIGRATIONS_FOLDER } from '../helpers';

const { serviceInstances, sessions, settings, users, watchlistItems } = schema;

describe('schéma et migrations', () => {
  it('sont synchronisés (sinon : make db-generate NAME=…)', async () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as {
      entries: { idx: number }[];
    };
    const lastIdx = String(journal.entries.at(-1)?.idx ?? 0).padStart(4, '0');
    const snapshot: unknown = JSON.parse(
      readFileSync(join(MIGRATIONS_FOLDER, 'meta', `${lastIdx}_snapshot.json`), 'utf8'),
    );

    // Les types d'instantané de drizzle-kit/api ne se résolvent pas (référence à zod 3,
    // absent) : les valeurs passent donc directement, sans être nommées.
    const statements = await generateSQLiteMigration(
      snapshot,
      await generateSQLiteDrizzleJson(schema),
    );
    expect(statements).toEqual([]);
  });
});

describe('contraintes du schéma', () => {
  let database: AppDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });
  afterEach(() => {
    database.close();
  });

  const insertUser = (email: string) =>
    database.db.insert(users).values({ email, passwordHash: 'x' }).returning().get();

  it('remplit les valeurs par défaut d’un utilisateur', () => {
    const user = insertUser('admin@example.com');
    expect(user.role).toBe('user');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.lastLoginAt).toBeNull();
  });

  it('impose l’unicité de l’e-mail', () => {
    insertUser('admin@example.com');
    expect(() => insertUser('admin@example.com')).toThrow(/UNIQUE/);
  });

  it('supprime les sessions d’un utilisateur supprimé (clés étrangères actives)', () => {
    const user = insertUser('admin@example.com');
    database.db
      .insert(sessions)
      .values({
        id: 's1',
        userId: user.id,
        data: { csrf: 'abc' },
        expiresAt: new Date(Date.now() + 1000),
      })
      .run();
    database.db.delete(users).where(eq(users.id, user.id)).run();
    expect(database.db.select().from(sessions).all()).toEqual([]);
  });

  it('stocke les réglages en JSON typé', () => {
    database.db
      .insert(settings)
      .values({ key: 'display_page_size', value: { size: 50 } })
      .run();
    expect(database.db.select().from(settings).get()?.value).toEqual({ size: 50 });
  });

  it('impose l’unicité (type, slug) des instances et remplit les défauts', () => {
    const values = { type: 'radarr', slug: 'radarr', name: 'Radarr', url: 'http://radarr:7878' };
    const instance = database.db.insert(serviceInstances).values(values).returning().get();
    expect(instance).toMatchObject({
      credentials: {},
      options: {},
      isDefault: false,
      enabled: true,
      position: 0,
    });
    expect(() => database.db.insert(serviceInstances).values(values).run()).toThrow(/UNIQUE/);
    database.db
      .insert(serviceInstances)
      .values({ ...values, type: 'sonarr' })
      .run();
  });

  it('impose l’unicité (tmdb_id, media_type) de la watchlist', () => {
    const item = { tmdbId: 603, mediaType: 'movie', title: 'The Matrix' } as const;
    database.db.insert(watchlistItems).values(item).run();
    database.db
      .insert(watchlistItems)
      .values({ ...item, mediaType: 'tv' })
      .run();
    expect(() => database.db.insert(watchlistItems).values(item).run()).toThrow(/UNIQUE/);
  });
});
