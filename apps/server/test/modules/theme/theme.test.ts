// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/theme.css` (P0.10), adaptation de `ThemeRenderTest` : le thème est
// posé avant le premier rendu, sans script inline.
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import { SETTING_KEYS, setSetting } from '../../../src/modules/settings/settings';
import { createTestDatabase, createUser, UNUSED_DATA_DIR } from '../../helpers';

async function setup() {
  const database = await createTestDatabase();
  const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
  return { app, database };
}

describe('GET /api/theme.css', () => {
  it('mode classique par défaut : sombre, et variante claire selon l’attribut de bascule', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/api/theme.css' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(response.body).toContain(
      ':root,:root[data-theme-mode="dark"]{color-scheme:dark;--hubarr-boot-background:#111111}',
    );
    // #f4f6fb : fond clair écrit à la main, propre au mode classique.
    expect(response.body).toContain(
      ':root[data-theme-mode="light"]{color-scheme:light;--hubarr-boot-background:#f4f6fb}',
    );
    await app.close();
  });

  it('un préréglage fixe la palette, sans variante de bascule', async () => {
    const { app, database } = await setup();
    setSetting(database.db, SETTING_KEYS.displayTheme, 'catppuccin_latte');
    const { body } = await app.inject({ method: 'GET', url: '/api/theme.css' });
    expect(body).toMatch(/^:root\{color-scheme:light;--hubarr-boot-background:#[0-9a-f]{6};/m);
    expect(body).not.toContain('data-theme-mode');
    await app.close();
  });

  it('est public, avant comme après l’installation, et n’ouvre pas de session', async () => {
    const { app, database } = await setup();
    const before = await app.inject({ method: 'GET', url: '/api/theme.css' });
    expect(before.statusCode).toBe(200);
    expect(before.cookies).toEqual([]);

    await createUser(database, { email: 'a@example.com', password: 'password-1' });
    const after = await app.inject({ method: 'GET', url: '/api/theme.css' });
    expect(after.statusCode).toBe(200);
    expect(after.cookies).toEqual([]);
    await app.close();
  });

  it('se revalide par ETag et change avec le thème', async () => {
    const { app, database } = await setup();
    const first = await app.inject({ method: 'GET', url: '/api/theme.css' });
    expect(first.headers['cache-control']).toBe('no-cache');
    const etag = first.headers.etag;
    expect(etag).toEqual(expect.any(String));

    const cached = await app.inject({
      method: 'GET',
      url: '/api/theme.css',
      headers: { 'if-none-match': String(etag) },
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe('');

    setSetting(database.db, SETTING_KEYS.displayTheme, 'dracula');
    const changed = await app.inject({
      method: 'GET',
      url: '/api/theme.css',
      headers: { 'if-none-match': String(etag) },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
    await app.close();
  });
});
