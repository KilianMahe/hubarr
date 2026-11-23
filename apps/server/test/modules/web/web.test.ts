// SPDX-License-Identifier: AGPL-3.0-or-later
// Service du front et de la documentation (P0.12) : repli SPA, cache, 404 de
// l'API, protection contre la sortie du dossier, CSP propre à la doc.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type BuildAppOptions } from '../../../src/app';
import { normalizeBasePath, stripBasePath } from '../../../src/http/base-path';
import { resolveStaticFile } from '../../../src/modules/web/routes';
import { createTempDir, createTestDatabase, createUser, UNUSED_DATA_DIR } from '../../helpers';

const dirs: { remove: () => void }[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.remove();
});

function fixtures() {
  const tmp = createTempDir();
  dirs.push(tmp);
  const webRoot = join(tmp.path, 'public');
  const docsRoot = join(tmp.path, 'docs');
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  mkdirSync(join(docsRoot, 'en'), { recursive: true });
  mkdirSync(join(docsRoot, 'assets'), { recursive: true });
  writeFileSync(
    join(webRoot, 'index.html'),
    '<!doctype html><head><base href="/"><title>spa</title></head>',
  );
  writeFileSync(join(webRoot, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(webRoot, 'theme-init.js'), '/* init */');
  writeFileSync(join(tmp.path, 'secret.txt'), 'secret');
  writeFileSync(
    join(docsRoot, 'index.html'),
    '<title>docs fr</title><script src="/docs/assets/app.abc.js"></script>',
  );
  writeFileSync(join(docsRoot, 'installation.html'), '<title>installation</title>');
  writeFileSync(join(docsRoot, 'en', 'index.html'), '<title>docs en</title>');
  writeFileSync(join(docsRoot, '404.html'), '<title>docs 404</title>');
  writeFileSync(join(docsRoot, 'assets', 'app.abc.js'), '1');
  return { root: tmp.path, webRoot, docsRoot };
}

async function setup(
  withSetupDone = true,
  extra: Pick<BuildAppOptions, 'basePath' | 'trustProxy'> = {},
) {
  const { webRoot, docsRoot, root } = fixtures();
  const database = await createTestDatabase();
  if (withSetupDone) await createUser(database, { email: 'a@example.com', password: 'password-1' });
  const app = buildApp({ dataDir: UNUSED_DATA_DIR, database, webRoot, docsRoot, ...extra });
  return { app, root };
}

describe('front buildé', () => {
  it('sert index.html sur toute page de la SPA, sans session, et le revalide', async () => {
    const { app } = await setup();
    for (const url of ['/', '/login', '/profil', '/setup/welcome', '/medias/films?x=1']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.body).toContain('<title>spa</title>');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.cookies).toEqual([]);
    }
    await app.close();
  });

  it('sert la SPA aussi pendant l’installation (la garde ne vise que l’API)', async () => {
    const { app } = await setup(false);
    const page = await app.inject({ method: 'GET', url: '/setup/welcome' });
    expect(page.statusCode).toBe(200);
    const api = await app.inject({ method: 'GET', url: '/api/profil' });
    expect(api.statusCode).toBe(409);
    await app.close();
  });

  it('met les assets hachés en cache immuable, les autres fichiers en revalidation', async () => {
    const { app } = await setup();
    const asset = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const init = await app.inject({ method: 'GET', url: '/theme-init.js' });
    expect(init.statusCode).toBe(200);
    expect(init.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('répond 404 à un fichier absent et à une route API inconnue, en JSON', async () => {
    const { app } = await setup();
    for (const url of ['/assets/missing.js', '/api/unknown', '/api']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.json()).toEqual({ code: 'NOT_FOUND' });
    }
    await app.close();
  });

  it('ne sort jamais du dossier servi', async () => {
    const { app } = await setup();
    for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.body, url).not.toContain('secret');
    }
    await app.close();
  });

  it('pose la CSP stricte de l’application sur la SPA', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.headers['content-security-policy']).toContain("script-src 'self';");
    await app.close();
  });
});

describe('documentation /docs', () => {
  it('redirige /docs vers /docs/ et sert les pages, avec ou sans extension', async () => {
    const { app } = await setup();
    const redirect = await app.inject({ method: 'GET', url: '/docs' });
    expect(redirect.statusCode).toBe(301);
    expect(redirect.headers.location).toBe('/docs/');
    expect((await app.inject({ method: 'GET', url: '/docs/' })).body).toContain('docs fr');
    expect((await app.inject({ method: 'GET', url: '/docs/en/' })).body).toContain('docs en');
    expect((await app.inject({ method: 'GET', url: '/docs/installation' })).body).toContain(
      'installation',
    );
    expect((await app.inject({ method: 'GET', url: '/docs/installation.html' })).statusCode).toBe(
      200,
    );
    await app.close();
  });

  it('sert la page 404 de la doc pour une page absente', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/docs/absente' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('docs 404');
    await app.close();
  });

  it('autorise les scripts inline de VitePress, sur la doc seulement', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/docs/' });
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    const asset = await app.inject({ method: 'GET', url: '/docs/assets/app.abc.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    await app.close();
  });
});

describe('préfixe de chemin (reverse proxy, matrice n° 65)', () => {
  it('normalise HUBARR_BASE_PATH et refuse un chemin dangereux', () => {
    expect(normalizeBasePath('')).toBe('');
    expect(normalizeBasePath('/')).toBe('');
    expect(normalizeBasePath('hubarr/')).toBe('/hubarr');
    expect(normalizeBasePath('/apps/hubarr')).toBe('/apps/hubarr');
    expect(normalizeBasePath('/a"b')).toBeNull();
    expect(normalizeBasePath('/a/../b')).toBeNull();
  });

  it('retire le préfixe des URL entrantes, et lui seul', () => {
    expect(stripBasePath('/hubarr', '/hubarr')).toBe('/');
    expect(stripBasePath('/hubarr/api/health', '/hubarr')).toBe('/api/health');
    expect(stripBasePath('/hubarr?x=1', '/hubarr')).toBe('/?x=1');
    expect(stripBasePath('/hubarrx/api', '/hubarr')).toBe('/hubarrx/api');
    expect(stripBasePath('/api/health', '')).toBe('/api/health');
  });

  it('sans préfixe, la balise <base> pointe sur la racine', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'GET', url: '/films' })).body).toContain(
      '<base href="/" />',
    );
    await app.close();
  });

  it('HUBARR_BASE_PATH : routes servies sous le préfixe, <base> et doc préfixées', async () => {
    const { app } = await setup(true, { basePath: '/hubarr' });
    const page = await app.inject({ method: 'GET', url: '/hubarr/medias/films' });
    expect(page.body).toContain('<base href="/hubarr/" />');
    const health = await app.inject({ method: 'GET', url: '/hubarr/api/health' });
    expect(health.statusCode).toBe(200);
    const redirect = await app.inject({ method: 'GET', url: '/hubarr/docs' });
    expect(redirect.headers.location).toBe('/hubarr/docs/');
    const docs = await app.inject({ method: 'GET', url: '/hubarr/docs/' });
    expect(docs.body).toContain('src="/hubarr/docs/assets/app.abc.js"');
    expect(docs.headers['content-type']).toContain('text/html');
    await app.close();
  });

  it('X-Forwarded-Prefix pris en compte seulement d’un proxy de confiance', async () => {
    const headers = { 'x-forwarded-prefix': '/media/hubarr/' };
    const trusted = await setup(true, { trustProxy: 'loopback' });
    const page = await trusted.app.inject({ method: 'GET', url: '/films', headers });
    expect(page.body).toContain('<base href="/media/hubarr/" />');
    await trusted.app.close();

    const untrusted = await setup(true, { trustProxy: false });
    const ignored = await untrusted.app.inject({ method: 'GET', url: '/films', headers });
    expect(ignored.body).toContain('<base href="/" />');
    await untrusted.app.close();

    const injected = await setup(true, { trustProxy: true });
    const bad = await injected.app.inject({
      method: 'GET',
      url: '/films',
      headers: { 'x-forwarded-prefix': '/"><script>' },
    });
    expect(bad.body).toContain('<base href="/" />');
    await injected.app.close();
  });
});

describe('resolveStaticFile', () => {
  it('refuse les chemins qui remontent et accepte les dossiers à index', async () => {
    const { webRoot, docsRoot } = fixtures();
    expect(await resolveStaticFile(webRoot, '../secret.txt')).toBeNull();
    expect(await resolveStaticFile(webRoot, 'assets/../../secret.txt')).toBeNull();
    expect(await resolveStaticFile(webRoot, '')).toBe('index.html');
    expect(await resolveStaticFile(docsRoot, 'en')).toBe(join('en', 'index.html'));
    expect(await resolveStaticFile(docsRoot, 'installation', true)).toBe('installation.html');
    expect(await resolveStaticFile(docsRoot, 'installation')).toBeNull();
  });
});

describe('sans dossiers (développement)', () => {
  it('garde le 404 JSON pour toute route inconnue', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    const response = await app.inject({ method: 'GET', url: '/login' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'NOT_FOUND' });
    await app.close();
  });
});
