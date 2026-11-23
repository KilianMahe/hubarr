// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/theme.css` : couleurs du premier rendu (voir `theme.ts`). Publique
// (écran de connexion et assistant compris), sans session. `no-cache` + ETag :
// le navigateur revalide à chaque chargement et reçoit un 304 tant que le thème
// ne change pas.

import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { bootCss, readTheme } from './theme';

export const themeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/theme.css', { config: { access: 'public' } }, async (request, reply) => {
    const css = bootCss(readTheme(app.db));
    const etag = `"${createHash('sha256').update(css).digest('base64url').slice(0, 22)}"`;
    void reply
      .header('cache-control', 'no-cache')
      .header('etag', etag)
      .type('text/css; charset=utf-8');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return css;
  });
};
