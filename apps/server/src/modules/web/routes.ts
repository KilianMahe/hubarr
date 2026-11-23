// SPDX-License-Identifier: AGPL-3.0-or-later
// Service du front buildé et de la documentation embarquée.
//
// Une seule route publique `GET /*`, la moins prioritaire du routeur :
// - `/api/*` inconnu : 404 JSON, comme avant ;
// - `/docs/*` : site VitePress (`<racine>/docs`), page 404 de la doc à défaut ;
// - un fichier existant du front : servi tel quel (`/assets/*` en cache immuable,
//   noms hachés par Vite ; le reste revalidé à chaque fois) ;
// - tout autre chemin sans extension : `index.html`, la SPA route elle-même.
// Les URL des pages restent celles de l'original (CLAUDE.md) : la SPA doit donc
// répondre sur n'importe quel chemin.
//
// En développement, le front et la doc sont servis par Vite et VitePress : le
// plugin n'est pas enregistré faute de dossier.
//
// Derrière un reverse proxy avec préfixe (matrice n° 65), `index.html` reçoit
// une balise `<base href="/prefixe/">` (le front est buildé en chemins
// relatifs) et les fichiers texte de la doc voient leurs liens `/docs/`
// réécrits en `/prefixe/docs/` (VitePress est buildé avec une base absolue).

import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { PrefixResolver } from '../../http/base-path';
import { ApiError } from '../../http/errors';
import { buildCsp } from '../../plugins/security-headers';

export interface WebRoutesOptions {
  /** Dossier du front buildé (`apps/web/dist`, `/app/public` dans l'image). */
  webRoot?: string | undefined;
  /** Dossier de la doc buildée (`docs/.vitepress/dist`, `/app/docs` dans l'image). */
  docsRoot?: string | undefined;
  /** `HUBARR_FRAME_ANCESTORS`, repris dans la CSP propre à la doc. */
  frameAncestors?: string | undefined;
  /** Préfixe public de la requête (reverse proxy), `''` par défaut. */
  prefixOf?: PrefixResolver | undefined;
}

export const DOCS_PREFIX = '/docs/';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
/** Balise `<base>` de `index.html`, telle que Vite la laisse. */
const BASE_TAG = /<base href="[^"]*"\s*\/?>/;
/** Fichiers de la doc dont les liens absolus sont réécrits sous un préfixe. */
const DOCS_TEXT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** `index.html` dont la balise `<base>` pointe sur le préfixe. */
export function withBaseHref(html: string, prefix: string): string {
  return html.replace(BASE_TAG, `<base href="${prefix}/" />`);
}

/** Contenu d'un fichier texte de la doc avec ses liens `/docs/` préfixés. */
export function prefixDocsLinks(content: string, prefix: string): string {
  return prefix === '' ? content : content.replaceAll(DOCS_PREFIX, `${prefix}${DOCS_PREFIX}`);
}

/**
 * Chemin relatif sûr d'un fichier existant sous `root`, ou `null`. Un dossier
 * renvoie son `index.html` ; `withHtml` essaie aussi `<chemin>.html` (liens
 * VitePress sans extension).
 */
export async function resolveStaticFile(
  root: string,
  relative: string,
  withHtml = false,
): Promise<string | null> {
  const cleaned = normalize(relative).replace(/^([/\\])+/, '');
  if (cleaned === '..' || cleaned.startsWith(`..${sep}`) || cleaned.includes('\0')) return null;
  const candidates = [cleaned, join(cleaned, 'index.html')];
  if (withHtml && extname(cleaned) === '') candidates.push(`${cleaned}.html`);
  for (const candidate of candidates) {
    try {
      if ((await stat(join(root, candidate))).isFile()) return candidate;
    } catch {
      // absent : candidat suivant
    }
  }
  return null;
}

function pathnameOf(url: string): string {
  const raw = url.split('?', 1)[0] ?? '/';
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ApiError(400, 'VALIDATION');
  }
}

/**
 * CSP de la doc : VitePress injecte des scripts inline (thème clair/sombre,
 * données du site). Le contenu est statique et produit par le build : on y
 * autorise `'unsafe-inline'` pour les scripts, et seulement là.
 */
export function buildDocsCsp(frameAncestors: string): string {
  return buildCsp(frameAncestors).replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
}

const webRoutes: FastifyPluginAsync<WebRoutesOptions> = async (app, options) => {
  const { webRoot, docsRoot } = options;
  const roots = [webRoot, docsRoot].filter((root): root is string => root !== undefined);
  if (roots.length === 0) return;
  const docsCsp = buildDocsCsp(options.frameAncestors ?? '');
  const prefixOf = options.prefixOf ?? (() => '');
  // Fichiers relus au besoin : petits, et les builds ne changent pas sous l'image.
  const texts = new Map<string, string>();
  const readText = async (root: string, file: string): Promise<string> => {
    const key = join(root, file);
    let content = texts.get(key);
    if (content === undefined) {
      content = await readFile(key, 'utf8');
      texts.set(key, content);
    }
    return content;
  };

  await app.register(fastifyStatic, {
    root: roots,
    serve: false,
    decorateReply: true,
    index: false,
    cacheControl: false,
  });

  const send = (reply: FastifyReply, root: string, file: string, cacheControl: string) =>
    reply.header('cache-control', cacheControl).sendFile(file, root);

  app.get('/*', { config: { access: 'public' } }, async (request, reply) => {
    const path = pathnameOf(request.url);
    if (path === '/api' || path.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND');

    if (path === '/docs' || path.startsWith(DOCS_PREFIX)) {
      if (docsRoot === undefined) throw new ApiError(404, 'NOT_FOUND');
      const prefix = prefixOf(request.raw);
      if (path === '/docs') return reply.redirect(`${prefix}${DOCS_PREFIX}`, 301);
      void reply.header('content-security-policy', docsCsp);
      const relative = path.slice(DOCS_PREFIX.length);
      const resolved = await resolveStaticFile(docsRoot, relative, true);
      const file = resolved ?? '404.html';
      if (resolved === null) void reply.code(404);
      const cacheControl = file.startsWith('assets/') ? IMMUTABLE : REVALIDATE;
      const textType = DOCS_TEXT_TYPES[extname(file)];
      if (prefix === '' || textType === undefined) return send(reply, docsRoot, file, cacheControl);
      // Le préfixe dépend de la requête : pas de cache immuable partagé.
      return reply
        .header('content-type', textType)
        .header('cache-control', REVALIDATE)
        .header('vary', 'x-forwarded-prefix')
        .send(prefixDocsLinks(await readText(docsRoot, file), prefix));
    }

    if (webRoot === undefined) throw new ApiError(404, 'NOT_FOUND');
    const file = await resolveStaticFile(webRoot, path);
    if (file !== null && file !== 'index.html') {
      return send(reply, webRoot, file, file.startsWith('assets/') ? IMMUTABLE : REVALIDATE);
    }
    // Un fichier introuvable (extension) n'est pas une page de la SPA.
    if (file === null && extname(path) !== '') throw new ApiError(404, 'NOT_FOUND');
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', REVALIDATE)
      .header('vary', 'x-forwarded-prefix')
      .send(withBaseHref(await readText(webRoot, 'index.html'), prefixOf(request.raw)));
  });
};

export { webRoutes };
