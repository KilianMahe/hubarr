// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes `/api/admin/logs*` : réservées aux admins, entrées du logger de
// l'application (secrets masqués), filtres, pagination et export JSON Lines.

import type { LogsResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { LogBuffer, createLogStream } from '../../../src/logs';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

const EMAIL = 'admin@example.com';
const PASSWORD = 'password-1';

let database: AppDatabase;
let app: FastifyInstance;
let browser: TestBrowser;

beforeEach(async () => {
  database = await createTestDatabase();
  const logBuffer = new LogBuffer({ level: 'info' });
  app = buildApp({
    database,
    dataDir: UNUSED_DATA_DIR,
    logger: {
      level: 'info',
      stream: createLogStream({ consoleLevel: 'silent', buffer: logBuffer }),
    },
    logBuffer,
  });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  browser = new TestBrowser(() => app);
  expect((await browser.login({ email: EMAIL, password: PASSWORD })).statusCode).toBe(200);
});
afterEach(async () => {
  await app.close();
});

async function list(query = ''): Promise<LogsResponse> {
  const response = await browser.get(`/api/admin/logs${query}`);
  expect(response.statusCode).toBe(200);
  return response.json<LogsResponse>();
}

describe('GET /api/admin/logs', () => {
  it('réservé aux admins', async () => {
    await createUser(database, { email: 'user@example.com', password: PASSWORD, role: 'user' });
    const user = new TestBrowser(() => app);
    await user.login({ email: 'user@example.com', password: PASSWORD });
    expect((await user.get('/api/admin/logs')).statusCode).toBe(403);
    expect((await user.get('/api/admin/logs/export')).statusCode).toBe(403);
    expect((await new TestBrowser(() => app).get('/api/admin/logs')).statusCode).toBe(401);
  });

  it('renvoie les entrées du logger, masquées, sans les traces de requêtes', async () => {
    app.log.warn(
      { service: 'sabnzbd', path: '/api', url: 'http://sab/api?apikey=topsecret', apiKey: 'k' },
      'sabnzbd: GET /api → HTTP 500',
    );
    const body = await list();
    expect(body).toMatchObject({ capacity: 1000, level: 'info', services: ['sabnzbd'] });
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      level: 'warn',
      msg: 'sabnzbd: GET /api → HTTP 500',
      service: 'sabnzbd',
      context: { path: '/api', apiKey: '[redacted]' },
    });
    expect(JSON.stringify(body)).not.toContain('topsecret');
  });

  it('filtre par niveau, service et texte ; pagine par curseur', async () => {
    app.log.info({ service: 'radarr' }, 'radarr info');
    app.log.warn({ service: 'radarr', networkCode: 'ECONNREFUSED' }, 'radarr down');
    app.log.error({ service: 'sonarr' }, 'sonarr boom');
    expect((await list('?level=warn')).entries.map((entry) => entry.msg)).toEqual([
      'sonarr boom',
      'radarr down',
    ]);
    expect((await list('?service=radarr')).total).toBe(2);
    expect((await list('?q=econnrefused')).entries.map((entry) => entry.msg)).toEqual([
      'radarr down',
    ]);
    const first = await list('?limit=2');
    expect(first.entries.map((entry) => entry.msg)).toEqual(['sonarr boom', 'radarr down']);
    expect(first.nextBefore).not.toBeNull();
    const second = await list(`?limit=2&before=${String(first.nextBefore)}`);
    expect(second.entries.map((entry) => entry.msg)).toEqual(['radarr info']);
    expect(second.nextBefore).toBeNull();
  });

  it('refuse un niveau inconnu', async () => {
    expect((await browser.get('/api/admin/logs?level=loud')).statusCode).toBe(400);
  });
});

describe('GET /api/admin/logs/export', () => {
  it('JSON Lines filtré, des plus anciennes aux plus récentes', async () => {
    app.log.warn({ service: 'radarr' }, 'premier');
    app.log.warn({ service: 'sonarr' }, 'autre');
    app.log.error({ service: 'radarr' }, 'second');
    const response = await browser.get('/api/admin/logs/export?service=radarr');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="hubarr-logs-[\d-]+\.jsonl"$/,
    );
    const lines = response.body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { msg: string });
    expect(lines.map((line) => line.msg)).toEqual(['premier', 'second']);
  });
});
