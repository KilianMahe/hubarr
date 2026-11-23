// SPDX-License-Identifier: AGPL-3.0-or-later
// Portage de `UserResetPasswordCommandTest`, plus la fermeture des sessions.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetPassword, type ResetPasswordIo } from '../../src/cli/reset-password';
import type { AppDatabase } from '../../src/db/client';
import { sessions, users } from '../../src/db/schema';
import { verifyPassword } from '../../src/security/password';
import { createTestDatabase, createUser } from '../helpers';

class FakeIo implements ResetPasswordIo {
  readonly output: string[] = [];
  constructor(private readonly inputs: string[]) {}
  askHidden(label: string) {
    this.output.push(label);
    const next = this.inputs.shift();
    if (next === undefined) return Promise.reject(new Error('entrée épuisée'));
    return Promise.resolve(next);
  }
  info(message: string) {
    this.output.push(message);
  }
  error(message: string) {
    this.output.push(`ERREUR ${message}`);
  }
  get display() {
    return this.output.join('\n');
  }
}

let database: AppDatabase;
let userId: number;

const hashOf = () =>
  database.db.select().from(users).where(eq(users.id, userId)).get()?.passwordHash ?? '';

beforeEach(async () => {
  database = await createTestDatabase();
  userId = await createUser(database, { email: 'joshua@example.com', password: 'old-password' });
});
afterEach(() => {
  database.close();
});

describe('hubarr user:reset-password', () => {
  it('échoue si le compte n’existe pas', async () => {
    const before = hashOf();
    const io = new FakeIo([]);
    expect(await resetPassword(database.db, 'ghost@example.com', io)).toBe(1);
    expect(io.display).toContain('Aucun compte');
    expect(hashOf()).toBe(before);
  });

  it('réinitialise le mot de passe avec deux saisies identiques', async () => {
    const io = new FakeIo(['new-password-123', 'new-password-123']);
    expect(await resetPassword(database.db, 'joshua@example.com', io)).toBe(0);
    expect(await verifyPassword(hashOf(), 'new-password-123')).toBe(true);
    expect(io.display).toContain('Mot de passe réinitialisé');
  });

  it('échoue si le mot de passe est trop court', async () => {
    const before = hashOf();
    const io = new FakeIo(['short']);
    expect(await resetPassword(database.db, 'joshua@example.com', io)).toBe(1);
    expect(io.display).toContain('au moins 8 caractères');
    expect(hashOf()).toBe(before);
  });

  it('échoue si les deux saisies diffèrent', async () => {
    const before = hashOf();
    const io = new FakeIo(['password-123', 'different-456']);
    expect(await resetPassword(database.db, 'joshua@example.com', io)).toBe(1);
    expect(io.display).toContain('ne correspondent pas');
    expect(hashOf()).toBe(before);
  });

  it('ignore les espaces et la casse de l’e-mail', async () => {
    const io = new FakeIo(['valid-password', 'valid-password']);
    expect(await resetPassword(database.db, '  Joshua@Example.com  ', io)).toBe(0);
  });

  it('ferme toutes les sessions du compte', async () => {
    database.db
      .insert(sessions)
      .values({
        id: 'a'.repeat(64),
        userId,
        data: { csrfToken: 'x', persistent: false },
        expiresAt: new Date(Date.now() + 60_000),
      })
      .run();
    const io = new FakeIo(['valid-password', 'valid-password']);
    expect(await resetPassword(database.db, 'joshua@example.com', io)).toBe(0);
    expect(database.db.select().from(sessions).all()).toHaveLength(0);
    expect(io.display).toContain('1 session(s) fermée(s)');
  });
});
