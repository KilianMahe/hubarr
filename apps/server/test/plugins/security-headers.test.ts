// SPDX-License-Identifier: AGPL-3.0-or-later
// Portage de CspHeaderSubscriberTest. Les cas « URL d'un service ajoutée à
// img-src » (origine, chemin réduit, URL invalide) sont sans objet : les images
// des services passent par le proxy du serveur et img-src ne les liste plus.
import type { FastifyPluginAsync } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { buildCsp, sanitizeFrameAncestors } from '../../src/plugins/security-headers';
import { createTestDatabase, UNUSED_DATA_DIR } from '../helpers';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/page', { config: { access: 'public' } }, async () => ({ ok: true }));
  app.get('/own-csp', { config: { access: 'public' } }, async (_request, reply) => {
    void reply.header('content-security-policy', 'default-src none');
    return {};
  });
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});

async function get(url: string, frameAncestors?: string) {
  const app = buildApp({
    dataDir: UNUSED_DATA_DIR,
    database: await createTestDatabase(),
    routes: [routes],
    ...(frameAncestors === undefined ? {} : { frameAncestors }),
  });
  close = () => app.close();
  return app.inject({ method: 'GET', url });
}

describe('en-têtes de sécurité', () => {
  it('pose la CSP et les en-têtes statiques sur chaque réponse, 404 compris', async () => {
    for (const url of ['/page', '/inconnue']) {
      const response = await get(url);
      expect(response.headers['content-security-policy']).toBeTypeOf('string');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['permissions-policy']).toContain('camera=()');
      await close?.();
      close = undefined;
    }
  });

  it('inclut toujours l’hôte des affiches TMDB', () => {
    expect(buildCsp('')).toContain(
      "img-src 'self' data: blob: https://image.tmdb.org https://artworks.thetvdb.com",
    );
  });

  it('garde les directives strictes', () => {
    const csp = buildCsp('');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('préserve une CSP déjà posée par la route', async () => {
    const response = await get('/own-csp');
    expect(response.headers['content-security-policy']).toBe('default-src none');
  });

  it('envoie X-Frame-Options SAMEORIGIN par défaut', async () => {
    const response = await get('/page');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'self';");
  });

  it('élargit frame-ancestors et retire X-Frame-Options si HUBARR_FRAME_ANCESTORS est défini', async () => {
    const response = await get('/page', 'https://organizr.example.com https://dash.example.org');
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'self' https://organizr.example.com https://dash.example.org;",
    );
    expect(response.headers['x-frame-options']).toBeUndefined();
  });

  it('retire les caractères de contrôle (injection d’en-tête)', async () => {
    const response = await get('/page', 'https://evil.example\r\nSet-Cookie: x=1');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).not.toContain('\r');
    expect(csp).not.toContain('\n');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('retire les virgules (CSP scindée en plusieurs politiques)', () => {
    const csp = buildCsp(sanitizeFrameAncestors('https://a.test, https://b.test'));
    expect(csp).not.toContain(',');
    expect(csp).toContain('https://a.test');
    expect(csp).toContain('https://b.test');
  });

  it('retire les points-virgules (injection de directive)', () => {
    const csp = buildCsp(sanitizeFrameAncestors('https://a.test; default-src *'));
    expect(csp).not.toContain('a.test;');
    expect(csp).not.toContain('; default-src *');
    expect(csp).toContain("default-src 'self';");
    expect(csp).toContain('https://a.test');
  });
});
