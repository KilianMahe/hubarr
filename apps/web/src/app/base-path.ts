// SPDX-License-Identifier: AGPL-3.0-or-later
// Préfixe de chemin derrière un reverse proxy (`HUBARR_BASE_PATH` ou
// `X-Forwarded-Prefix`, matrice n° 65). Le serveur l'écrit dans la balise
// `<base href>` de `index.html` ; le front le relit ici pour préfixer les appels
// à l'API, le flux temps réel et l'historique du routeur. Les URL relatives
// (`api/…`, `docs/`, images proxifiées) se résolvent seules contre `<base>`.

/** Préfixe sans barre finale (`''` à la racine, `/hubarr` derrière un proxy). */
export function basePath(doc?: Pick<Document, 'baseURI'>): string {
  const source = doc ?? (typeof document === 'undefined' ? undefined : document);
  if (source === undefined) return '';
  try {
    return new URL(source.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** Chemin absolu de l'application (`/api/…`) préfixé ; une URL complète est rendue telle quelle. */
export function appUrl(path: string, prefix: string = basePath()): string {
  return path.startsWith('/') && !path.startsWith('//') ? `${prefix}${path}` : path;
}

/** URL absolue (origine comprise) d'un chemin de l'application, pour un lien à copier. */
export function absoluteAppUrl(path: string): string {
  return `${window.location.origin}${appUrl(path)}`;
}
