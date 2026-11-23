// SPDX-License-Identifier: AGPL-3.0-or-later
// En-têtes de sécurité de toutes les réponses : ceux que posait Caddy
// (nosniff, Referrer-Policy, HSTS, Permissions-Policy) et ceux du
// `CspHeaderSubscriber` d'origine (CSP, X-Frame-Options, `frame-ancestors`).
//
// Différences avec l'original :
// - `img-src` ne liste plus les URL des services : toutes leurs images passent
//   par le proxy du serveur, seuls restent les CDN publics des
//   affiches : TMDB (Radarr) et TheTVDB (Sonarr) ;
// - `script-src 'self'` sans `'unsafe-inline'` : le front Vite n'a pas de script inline ;
// - `X-XSS-Protection` n'est plus envoyé (obsolète, l'auditeur XSS a disparu des navigateurs).

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export interface SecurityHeadersOptions {
  /** `HUBARR_FRAME_ANCESTORS` : origines autorisées à intégrer Hubarr dans une iframe. */
  frameAncestors?: string;
}

export const IMG_HOSTS = ['https://image.tmdb.org', 'https://artworks.thetvdb.com'] as const;

/**
 * Retire les caractères de contrôle (injection d'en-tête par CR/LF), `;`
 * (fermerait la directive et en ouvrirait une autre) et `,` (scinderait la CSP en
 * plusieurs politiques dont le navigateur ferait l'intersection).
 */
export function sanitizeFrameAncestors(value: string): string {
  // eslint-disable-next-line no-control-regex -- les caractères de contrôle sont précisément la cible
  return value.replace(/[\x00-\x1F\x7F;,]/g, '').trim();
}

export function buildCsp(extraAncestors: string): string {
  const frameAncestors = ["'self'", extraAncestors].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    `img-src 'self' data: blob: ${IMG_HOSTS.join(' ')}`,
    // Vuetify injecte ses styles dynamiquement.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "script-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const STATIC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // Sans effet en HTTP ; repris derrière un proxy HTTPS qui transmet les en-têtes.
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=()',
} as const;

const securityHeadersPlugin: FastifyPluginAsync<SecurityHeadersOptions> = async (app, options) => {
  const extraAncestors = sanitizeFrameAncestors(options.frameAncestors ?? '');
  const csp = buildCsp(extraAncestors);

  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.headers(STATIC_HEADERS);
    // ALLOW-FROM est ignoré des navigateurs : pour autoriser un site tiers, on
    // retire X-Frame-Options et on s'en remet à `frame-ancestors`.
    if (extraAncestors === '') void reply.header('x-frame-options', 'SAMEORIGIN');
    else reply.removeHeader('x-frame-options');
    if (!reply.hasHeader('content-security-policy')) {
      void reply.header('content-security-policy', csp);
    }
    return payload;
  });
};

export default fp(securityHeadersPlugin, { name: 'hubarr-security-headers' });
