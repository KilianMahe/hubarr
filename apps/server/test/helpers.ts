// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils communs aux tests du serveur.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CSRF_HEADER,
  SESSION_COOKIE_NAME,
  type UserPermissions,
  type UserRole,
} from '@hubarr/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { openDatabase, type AppDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { MIGRATIONS_FOLDER } from '../src/db/paths';
import { users } from '../src/db/schema';
import { SETTING_KEYS, setSetting } from '../src/modules/settings/settings';
import { normalizeEmail, saveUserPermissions } from '../src/modules/users/users';
import { hashPassword } from '../src/security/password';

export { MIGRATIONS_FOLDER };

/**
 * Dossier de données des tests qui n'écrivent aucun fichier (avatars) : il
 * n'est jamais créé. Les tests du profil utilisent `createTempDir()`.
 */
export const UNUSED_DATA_DIR = join(tmpdir(), 'hubarr-test-unused');

/** Base en mémoire, migrée. */
export async function createTestDatabase(): Promise<AppDatabase> {
  const database = openDatabase(':memory:');
  await runMigrations(database, { migrationsFolder: MIGRATIONS_FOLDER });
  return database;
}

/** Dossier temporaire supprimé par la fonction renvoyée. */
export function createTempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'hubarr-test-'));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

/**
 * Crée un compte (mot de passe haché en argon2id) ; renvoie son id. Par défaut,
 * l'installation est aussi marquée terminée, sans quoi la garde de l'assistant
 * bloque les routes protégées.
 */
export async function createUser(
  database: AppDatabase,
  {
    email,
    password,
    role = 'admin',
    completeSetup = true,
  }: { email: string; password: string; role?: UserRole; completeSetup?: boolean },
): Promise<number> {
  if (completeSetup) setSetting(database.db, SETTING_KEYS.setupCompleted, true);
  const [row] = database.db
    .insert(users)
    .values({ email: normalizeEmail(email), passwordHash: await hashPassword(password), role })
    .returning({ id: users.id })
    .all();
  if (row === undefined) throw new Error('utilisateur non créé');
  return row.id;
}

/** Remplace les droits d'un compte (clés `service` ou `service:slug`). */
export function grantPermissions(
  database: AppDatabase,
  userId: number,
  permissions: UserPermissions,
): void {
  saveUserPermissions(database.db, userId, permissions);
}

/**
 * Compte existant (désigné par son e-mail) passé en simple utilisateur avec
 * ces droits : relu à la requête suivante, sans reconnexion.
 */
export function demoteUser(
  database: AppDatabase,
  email: string,
  permissions: UserPermissions,
): void {
  const [row] = database.db
    .update(users)
    .set({ role: 'user' })
    .where(eq(users.email, normalizeEmail(email)))
    .returning({ id: users.id })
    .all();
  if (row === undefined) throw new Error('utilisateur inconnu');
  saveUserPermissions(database.db, row.id, permissions);
}

/** Horloge manipulable pour les tests (sessions, limitation). */
export function createClock(start = Date.UTC(2026, 10, 18, 12)): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

export function sessionCookie(response: LightMyRequestResponse) {
  return response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember?: boolean;
}

/**
 * Navigateur minimal pour `app.inject()` : garde le cookie de session et le
 * jeton CSRF, et envoie `Sec-Fetch-Site: same-origin` sur les mutations.
 * L'application est passée par un accesseur, car un test peut la remplacer.
 */
export class TestBrowser {
  cookie: string | undefined;
  csrf: string | undefined;

  constructor(private readonly app: () => FastifyInstance) {}

  private remember(response: LightMyRequestResponse) {
    const cookie = sessionCookie(response);
    if (cookie !== undefined) this.cookie = cookie.value === '' ? undefined : cookie.value;
    return response;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      ...(this.cookie === undefined ? {} : { cookie: `${SESSION_COOKIE_NAME}=${this.cookie}` }),
      ...extra,
    };
  }

  async get(url: string) {
    return this.remember(await this.app().inject({ method: 'GET', url, headers: this.headers() }));
  }

  async post(url: string, payload?: object, extra: Record<string, string> = {}) {
    const headers = this.headers({
      'sec-fetch-site': 'same-origin',
      ...(this.csrf === undefined ? {} : { [CSRF_HEADER]: this.csrf }),
      ...extra,
    });
    return this.remember(
      await this.app().inject({
        method: 'POST',
        url,
        headers,
        ...(payload === undefined ? {} : { payload }),
      }),
    );
  }

  async fetchCsrf() {
    const response = await this.get('/api/auth/csrf');
    this.csrf = response.json<{ token: string }>().token;
    return response;
  }

  async login(credentials: LoginCredentials) {
    await this.fetchCsrf();
    const response = await this.post('/api/auth/login', credentials);
    if (response.statusCode === 200) this.csrf = response.json<{ csrfToken: string }>().csrfToken;
    return response;
  }
}
