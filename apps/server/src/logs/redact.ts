// SPDX-License-Identifier: AGPL-3.0-or-later
// Masquage des secrets dans les journaux, avant la console comme avant le
// tampon de la page « Journaux » : clés d'API, jetons, mots de passe, en-têtes
// d'authentification, cookies, identifiants dans les URL et paramètres d'URL
// sensibles. Le masquage porte sur les noms de champs (à toute profondeur) et
// sur le texte (message, pile, corps de réponse).

export const REDACTED = '[redacted]';

/** Champ dont la valeur est toujours masquée, quelle que soit sa forme. */
const SENSITIVE_KEY =
  /(api[_-]?key|token|passw(or)?d|^pass$|secret|authorization|cookie|credential|session[_-]?id|^sid$)/i;

/** Paramètres d'URL sensibles (`?apikey=…`, `&token=…`, `X-Plex-Token=…`). */
const SENSITIVE_PARAM =
  /([?&;](?:api[_-]?key|apikey|[a-z-]*token|password|passwd|pass|secret|auth|key|sid|session)=)[^&#\s"'<>]+/gi;

/** Identifiants dans une URL (`http://user:pass@host`). */
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:"']+(?::[^\s/@"']*)?@/gi;

/** En-tête d'authentification recopié dans un message (`Bearer …`, `Basic …`). */
const AUTH_SCHEME = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/g;

/** Paire clé/valeur JSON ou formulaire dans un texte (`"apiKey": "…"`, `password=…`). */
const INLINE_PAIR =
  /(["']?(?:api[_-]?key|apikey|[a-z_]*token|password|passwd|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,&;}"']+)/gi;

const MAGNET = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^\s"']*/g;

/** Longueur maximale d'un texte gardé (pile d'erreur comprise). */
export const MAX_STRING_LENGTH = 4_000;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

/** Texte sans secret, tronqué. */
export function redactString(value: string): string {
  let clean = value
    .replace(MAGNET, '[magnet]')
    .replace(URL_USERINFO, `$1${REDACTED}@`)
    .replace(SENSITIVE_PARAM, `$1${REDACTED}`)
    .replace(AUTH_SCHEME, `$1 ${REDACTED}`)
    .replace(INLINE_PAIR, (match, prefix: string) =>
      // Déjà masqué par la règle des paramètres d'URL.
      match.endsWith(REDACTED) ? match : `${prefix}"${REDACTED}"`,
    );
  if (clean.length > MAX_STRING_LENGTH) clean = `${clean.slice(0, MAX_STRING_LENGTH)}…`;
  return clean;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Copie de la valeur sans secret (objets et tableaux parcourus, profondeur bornée). */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${String(value.length - MAX_ARRAY_ITEMS)}]`);
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Un booléen (`hasApiKey`) ne révèle rien ; une valeur vide non plus.
    const secret =
      isSensitiveKey(key) &&
      entry !== null &&
      entry !== undefined &&
      entry !== '' &&
      typeof entry !== 'boolean';
    out[key] = secret ? REDACTED : redact(entry, depth + 1);
  }
  return out;
}
