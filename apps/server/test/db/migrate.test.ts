// SPDX-License-Identifier: AGPL-3.0-or-later
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_FILE,
  DATABASE_FILE,
  DatabaseTooNewError,
  LEGACY_DATABASE_FILE,
  LegacyDatabaseError,
  prepareDatabase,
} from '../../src/db/migrate';
import { createTempDir, MIGRATIONS_FOLDER } from '../helpers';

interface Journal {
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
}

function tableNames(file: string): string[] {
  const sqlite = new Database(file, { readonly: true });
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  sqlite.close();
  return rows.map((row) => row.name);
}

/** Copie des migrations réelles, complétée d'une migration fictive postérieure. */
function migrationsWithExtra(dir: string, sql: string): string {
  const folder = join(dir, 'migrations');
  cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalFile = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as Journal;
  const last = journal.entries.at(-1);
  if (last === undefined) throw new Error('journal vide');
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: '9999_extra' });
  writeFileSync(journalFile, JSON.stringify(journal));
  writeFileSync(join(folder, '9999_extra.sql'), sql);
  return folder;
}

describe('prepareDatabase', () => {
  let tmp: ReturnType<typeof createTempDir>;
  let dataDir: string;

  beforeEach(() => {
    tmp = createTempDir();
    dataDir = join(tmp.path, 'data');
  });
  afterEach(() => {
    tmp.remove();
  });

  it('crée le dossier et la base, applique la migration initiale sans sauvegarde', async () => {
    const { database, report } = await prepareDatabase({
      dataDir,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    database.close();

    expect(report).toEqual({ applied: 1, backupFile: null });
    expect(tableNames(join(dataDir, DATABASE_FILE))).toEqual([
      '__drizzle_migrations',
      'service_instance',
      'session',
      'setting',
      'user',
      'watchlist_item',
    ]);
    expect(existsSync(join(dataDir, BACKUP_FILE))).toBe(false);
  });

  it('ne fait rien au redémarrage', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    const { database, report } = await prepareDatabase({
      dataDir,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    database.close();
    expect(report).toEqual({ applied: 0, backupFile: null });
  });

  it('sauvegarde la base avant une nouvelle migration', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    const folder = migrationsWithExtra(
      tmp.path,
      'CREATE TABLE `extra` (`id` integer PRIMARY KEY);',
    );

    const { database, report } = await prepareDatabase({ dataDir, migrationsFolder: folder });
    database.close();

    expect(report).toEqual({ applied: 1, backupFile: join(dataDir, BACKUP_FILE) });
    expect(tableNames(join(dataDir, DATABASE_FILE))).toContain('extra');
    // La sauvegarde reflète l'état d'avant la migration.
    expect(tableNames(join(dataDir, BACKUP_FILE))).not.toContain('extra');
    expect(tableNames(join(dataDir, BACKUP_FILE))).toContain('user');
  });

  it('annule toute la transaction si une migration échoue', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    const folder = migrationsWithExtra(
      tmp.path,
      'CREATE TABLE `extra` (`id` integer PRIMARY KEY);\n--> statement-breakpoint\nINVALID SQL;',
    );

    await expect(prepareDatabase({ dataDir, migrationsFolder: folder })).rejects.toThrow();
    expect(tableNames(join(dataDir, DATABASE_FILE))).not.toContain('extra');
    // La base n'est pas restée verrouillée : un redémarrage avec les migrations valides fonctionne.
    const { database, report } = await prepareDatabase({
      dataDir,
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    database.close();
    expect(report.applied).toBe(0);
  });

  it('refuse une base Doctrine (Prismarr PHP)', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    const sqlite = new Database(join(dataDir, DATABASE_FILE));
    sqlite.exec('CREATE TABLE doctrine_migration_versions (version VARCHAR(191) PRIMARY KEY)');
    sqlite.close();

    await expect(
      prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER }),
    ).rejects.toBeInstanceOf(LegacyDatabaseError);
  });

  it('refuse un volume de données Prismarr (prismarr.db présent)', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    writeFileSync(join(dataDir, LEGACY_DATABASE_FILE), '');

    const error: unknown = await prepareDatabase({
      dataDir,
      migrationsFolder: MIGRATIONS_FOLDER,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LegacyDatabaseError);
    expect((error as LegacyDatabaseError).message).toContain('volume de données neuf');
  });

  it('refuse une base migrée par une version plus récente', async () => {
    (await prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER })).database.close();
    const sqlite = new Database(join(dataDir, DATABASE_FILE));
    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run('future', 9e15);
    sqlite.close();

    await expect(
      prepareDatabase({ dataDir, migrationsFolder: MIGRATIONS_FOLDER }),
    ).rejects.toBeInstanceOf(DatabaseTooNewError);
  });
});
