// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/health` (P0.7), portage de `HealthControllerTest` (partie application).
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../src/app';
import { createClock, createTestDatabase, UNUSED_DATA_DIR } from '../../helpers';

describe('GET /api/health', () => {
  it('répond 200 quand la base répond, sans session ni installation', async () => {
    const clock = createClock();
    const app = buildApp({
      dataDir: UNUSED_DATA_DIR,
      database: await createTestDatabase(),
      now: clock.now,
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      db: 'ok',
      timestamp: new Date(clock.now()).toISOString(),
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.cookies).toEqual([]);
    await app.close();
  });

  it('répond 503 quand la base ne répond plus, sans divulguer l’erreur', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    await app.ready();
    database.sqlite.close();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'error', db: 'unreachable' });
    await app.close();
  });

  it('ne divulgue pas le message de l’exception', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    await app.ready();
    vi.spyOn(database.sqlite, 'prepare').mockImplementation(() => {
      throw new Error('SQLSTATE[HY000]: password for user at /var/www/db');
    });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toMatch(/SQLSTATE|\/var\/www|password/);
    vi.restoreAllMocks();
    await app.close();
  });
});
