// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { UNUSED_DATA_DIR, createTestDatabase } from './helpers';

describe('buildApp', () => {
  it('répond 404 sur une route inconnue', async () => {
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database: await createTestDatabase() });
    const response = await app.inject({ method: 'GET', url: '/inconnue' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('ferme la base à l’arrêt', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    await app.ready();
    await app.close();
    expect(database.sqlite.open).toBe(false);
  });
});
