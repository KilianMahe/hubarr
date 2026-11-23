// SPDX-License-Identifier: AGPL-3.0-or-later
// Ouverture de la base SQLite et client Drizzle typé.

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** Client ou transaction : ce qu'acceptent les fonctions d'accès qui peuvent écrire dans une transaction. */
export type DbExecutor = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>;

export interface AppDatabase {
  /** Connexion brute (pragmas, sauvegarde, fermeture). */
  readonly sqlite: Database.Database;
  /** Client Drizzle. */
  readonly db: Db;
  close(): void;
}

/** Ouvre (ou crée) la base ; `':memory:'` pour les tests. */
export function openDatabase(file: string): AppDatabase {
  const sqlite = new Database(file);
  if (file !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => {
      if (sqlite.open) sqlite.close();
    },
  };
}
