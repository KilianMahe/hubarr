// SPDX-License-Identifier: AGPL-3.0-or-later
// Client API (P0.12) : jeton CSRF sur les mutations, erreurs typées, rejeu
// unique après un 403 CSRF, corps binaire de l'avatar.
import { CSRF_HEADER, csrfTokenResponseSchema } from '@hubarr/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, validationMessages } from '../src/app/api/client';
import { fakeFetch } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiClient', () => {
  it('envoie le jeton CSRF sur les mutations seulement, et le corps en JSON', async () => {
    const { calls } = fakeFetch({
      'GET /api/auth/csrf': () => ({ body: { token: 't' } }),
      'POST /api/thing': () => ({ status: 204 }),
    });
    const client = new ApiClient();
    client.setCsrfToken('abc');
    await client.get('/api/auth/csrf', csrfTokenResponseSchema);
    await client.post('/api/thing', { a: 1 });
    expect(calls[0]?.headers[CSRF_HEADER]).toBeUndefined();
    expect(calls[1]?.headers[CSRF_HEADER]).toBe('abc');
    expect(calls[1]?.headers['Content-Type']).toBe('application/json');
    expect(calls[1]?.body).toEqual({ a: 1 });
  });

  it('convertit une erreur de l’API en ApiError (code, détails, Retry-After)', async () => {
    fakeFetch({
      'POST /api/auth/login': () => ({
        status: 429,
        body: { code: 'LOGIN_THROTTLED', details: { retryAfter: 900 } },
        headers: { 'retry-after': '900' },
      }),
    });
    const client = new ApiClient();
    const error = await client.post('/api/auth/login', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'LOGIN_THROTTLED', retryAfter: 900 });
  });

  it('redemande un jeton et rejoue une fois après un 403 CSRF', async () => {
    let attempts = 0;
    const { calls } = fakeFetch({
      'GET /api/auth/csrf': () => ({ body: { token: 'fresh' } }),
      'POST /api/thing': () =>
        ++attempts === 1 ? { status: 403, body: { code: 'CSRF' } } : { status: 204 },
    });
    const client = new ApiClient();
    client.setCsrfToken('stale');
    await client.post('/api/thing');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/thing',
      'GET /api/auth/csrf',
      'POST /api/thing',
    ]);
    expect(calls[2]?.headers[CSRF_HEADER]).toBe('fresh');
  });

  it('ne rejoue pas indéfiniment', async () => {
    fakeFetch({
      'GET /api/auth/csrf': () => ({ body: { token: 'x' } }),
      'POST /api/thing': () => ({ status: 403, body: { code: 'CSRF' } }),
    });
    const error = await new ApiClient().post('/api/thing').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'CSRF' });
  });

  it('envoie un fichier tel quel, sans en-tête JSON', async () => {
    const { calls } = fakeFetch({ 'POST /api/profil/avatar': () => ({ status: 204 }) });
    const file = new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' });
    await new ApiClient().post('/api/profil/avatar', file);
    expect(calls[0]?.body).toBe(file);
    expect(calls[0]?.headers['Content-Type']).toBeUndefined();
  });

  it('signale une réponse invalide et une erreur réseau', async () => {
    fakeFetch({ 'GET /api/auth/csrf': () => ({ body: { nope: true } }) });
    await expect(
      new ApiClient().get('/api/auth/csrf', csrfTokenResponseSchema),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(
      new ApiClient().get('/api/auth/csrf', csrfTokenResponseSchema),
    ).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('extrait les clés i18n des erreurs de validation', () => {
    const error = new ApiError(400, 'VALIDATION', [
      { path: ['email'], message: 'setup.error.email_invalid' },
      { path: ['password'], message: 'setup.error.password_too_short' },
    ]);
    expect(validationMessages(error)).toEqual([
      'setup.error.email_invalid',
      'setup.error.password_too_short',
    ]);
    expect(validationMessages(new Error('x'))).toEqual([]);
  });
});
