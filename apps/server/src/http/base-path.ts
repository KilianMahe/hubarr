// SPDX-License-Identifier: AGPL-3.0-or-later
// Préfixe de chemin derrière un reverse proxy (matrice n° 65, comme
// `BASE_PATH` / `X-Forwarded-Prefix` dans l'original).
//
// Deux façons de servir Hubarr sous `https://hote/hubarr/` :
// - `HUBARR_BASE_PATH=/hubarr` : le proxy transmet le chemin complet, le
//   serveur retire le préfixe à l'entrée (`rewriteUrl`) ;
// - le proxy retire lui-même le préfixe et envoie `X-Forwarded-Prefix: /hubarr`,
//   pris en compte seulement s'il vient d'un proxy de confiance
//   (`HUBARR_TRUST_PROXY`).
// Les routes ne voient jamais le préfixe : seul `index.html` (balise `<base>`)
// et la documentation (liens absolus de VitePress) en dépendent.

import type { IncomingMessage } from 'node:http';
import type { FastifyServerOptions } from 'fastify';
import proxyAddr from 'proxy-addr';

/** Segments de chemin sûrs : rien qui puisse sortir d'un attribut HTML ou d'une URL. */
const PREFIX_PATTERN = /^(\/[A-Za-z0-9._~-]+)*$/;

/** Préfixe normalisé (`/a/b`, sans barre finale ; `''` à la racine), ou `null` s'il est invalide. */
export function normalizeBasePath(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (!PREFIX_PATTERN.test(prefixed)) return null;
  if (prefixed.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return prefixed;
}

/** URL de la requête sans le préfixe configuré (inchangée si elle ne le porte pas). */
export function stripBasePath(url: string, basePath: string): string {
  if (basePath === '' || !url.startsWith(basePath)) return url;
  const rest = url.slice(basePath.length);
  if (rest === '') return '/';
  if (rest.startsWith('?')) return `/${rest}`;
  // `/hubarrX` ne porte pas le préfixe `/hubarr`.
  return rest.startsWith('/') ? rest : url;
}

type Trust = (address: string, hop: number) => boolean;

/** Même règle de confiance que Fastify (`trustProxy`) pour le pair direct. */
function trustFunction(trustProxy: FastifyServerOptions['trustProxy']): Trust | null {
  if (trustProxy === undefined || trustProxy === false) return null;
  if (trustProxy === true) return () => true;
  if (typeof trustProxy === 'number') return (_address, hop) => hop < trustProxy;
  if (typeof trustProxy === 'function') return trustProxy;
  const list = Array.isArray(trustProxy) ? trustProxy : trustProxy.split(',');
  return proxyAddr.compile(list.map((entry) => entry.trim()).filter((entry) => entry !== ''));
}

export type PrefixResolver = (request: IncomingMessage) => string;

/**
 * Préfixe public d'une requête : `HUBARR_BASE_PATH` s'il est défini, sinon
 * l'en-tête `X-Forwarded-Prefix` d'un proxy de confiance, sinon `''`.
 */
export function createPrefixResolver(
  basePath: string,
  trustProxy: FastifyServerOptions['trustProxy'] = false,
): PrefixResolver {
  if (basePath !== '') return () => basePath;
  const trust = trustFunction(trustProxy);
  if (trust === null) return () => '';
  return (request) => {
    const header = request.headers['x-forwarded-prefix'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined || value === '') return '';
    const peer = request.socket.remoteAddress;
    if (peer === undefined || !trust(peer, 0)) return '';
    return normalizeBasePath(value.split(',', 1)[0]) ?? '';
  };
}
