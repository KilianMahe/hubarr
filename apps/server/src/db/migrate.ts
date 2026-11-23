// SPDX-License-Identifier: AGPL-3.0-or-later
// Préparation de la base au démarrage :
//   1. refus d'une ancienne base Prismarr (Doctrine) : pas de migration de données ;
//   2. refus d'une base créée par une version plus récente de Hubarr ;
//   3. sauvegarde `hubarr.db.bak` avant d'appliquer de nouvelles migrations ;
//   4. migrations Drizzle appliquées dans une seule transaction.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase, type AppDatabase } from './client';

export const DATABASE_FILE = 'hubarr.db';
export const BACKUP_FILE = `${DATABASE_FILE}.bak`;
/** Fichier de base de Prismarr PHP (`var/data/prismarr.db`). */
export const LEGACY_DATABASE_FILE = 'prismarr.db';
/** Table créée par Doctrine Migrations dans toute base Prismarr. */
const DOCTRINE_TABLE = 'doctrine_migration_versions';
const MIGRATIONS_TABLE = '__drizzle_migrations';

/** La base (ou le dossier de données) provient de Prismarr PHP. */
export class LegacyDatabaseError extends Error {
  override readonly name = 'LegacyDatabaseError';
  constructor(readonly file: string) {
    super(
      `${file} est une base Prismarr (Doctrine) : Hubarr ne reprend pas les données de Prismarr. ` +
        'Utilisez un volume de données neuf, puis refaites l’assistant d’installation.',
    );
  }
}

/** La base contient des migrations inconnues de cette version (retour à une version antérieure). */
export class DatabaseTooNewError extends Error {
  override readonly name = 'DatabaseTooNewError';
  constructor(readonly file: string) {
    super(
      `${file} a été migrée par une version plus récente de Hubarr. ` +
        `Réinstallez cette version, ou restaurez ${BACKUP_FILE} si la mise à jour vient d’avoir lieu.`,
    );
  }
}

export interface MigrationReport {
  /** Nombre de migrations appliquées pendant cet appel. */
  applied: number;
  /** Sauvegarde écrite avant les migrations, `null` s'il n'y en a pas eu besoin. */
  backupFile: string | null;
}

export interface RunMigrationsOptions {
  migrationsFolder: string;
  /** Chemin de la sauvegarde ; sans valeur, aucune sauvegarde (base en mémoire). */
  backupFile?: string;
  /** Nom de la base dans les messages d'erreur. */
  label?: string;
}

function hasTable(database: AppDatabase, name: string): boolean {
  return (
    database.sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
}

function hasAnyTable(database: AppDatabase): boolean {
  return (
    database.sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      )
      .get() !== undefined
  );
}

/** Horodatage de la dernière migration appliquée, `null` sur une base vierge. */
function lastAppliedMigration(database: AppDatabase): number | null {
  if (!hasTable(database, MIGRATIONS_TABLE)) return null;
  const row = database.sqlite
    .prepare(
      `SELECT created_at AS createdAt FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { createdAt: number | string } | undefined;
  return row === undefined ? null : Number(row.createdAt);
}

/** Applique les migrations en attente sur une base déjà ouverte. */
export async function runMigrations(
  database: AppDatabase,
  options: RunMigrationsOptions,
): Promise<MigrationReport> {
  const label = options.label ?? DATABASE_FILE;
  if (hasTable(database, DOCTRINE_TABLE)) throw new LegacyDatabaseError(label);

  const migrations = readMigrationFiles({ migrationsFolder: options.migrationsFolder });
  const last = lastAppliedMigration(database);
  const latestKnown = Math.max(0, ...migrations.map((migration) => migration.folderMillis));
  if (last !== null && last > latestKnown) throw new DatabaseTooNewError(label);

  // Même règle que le migrateur Drizzle : toute migration postérieure à la dernière appliquée.
  const pending = migrations.filter((migration) => last === null || migration.folderMillis > last);
  if (pending.length === 0) return { applied: 0, backupFile: null };

  let backupFile: string | null = null;
  if (options.backupFile !== undefined && hasAnyTable(database)) {
    await database.sqlite.backup(options.backupFile);
    backupFile = options.backupFile;
  }

  migrate(database.db, {
    migrationsFolder: options.migrationsFolder,
    migrationsTable: MIGRATIONS_TABLE,
  });
  return { applied: pending.length, backupFile };
}

export interface PrepareDatabaseOptions {
  dataDir: string;
  migrationsFolder: string;
}

/** Ouvre `<dataDir>/hubarr.db` et la met à jour ; ferme la base en cas d'échec. */
export async function prepareDatabase(
  options: PrepareDatabaseOptions,
): Promise<{ database: AppDatabase; report: MigrationReport }> {
  mkdirSync(options.dataDir, { recursive: true });

  // Un volume Prismarr monté tel quel : on refuse plutôt que de démarrer « vide » à côté.
  const legacyFile = join(options.dataDir, LEGACY_DATABASE_FILE);
  if (existsSync(legacyFile)) throw new LegacyDatabaseError(legacyFile);

  const file = join(options.dataDir, DATABASE_FILE);
  const database = openDatabase(file);
  try {
    const report = await runMigrations(database, {
      migrationsFolder: options.migrationsFolder,
      backupFile: join(options.dataDir, BACKUP_FILE),
      label: file,
    });
    return { database, report };
  } catch (error) {
    database.close();
    throw error;
  }
}
