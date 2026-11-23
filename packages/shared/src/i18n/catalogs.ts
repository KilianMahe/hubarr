// SPDX-License-Identifier: AGPL-3.0-or-later
// Catalogues de traductions FR et EN (importés de Prismarr).
//
// Chaque langue est un fichier JSON chargé à la demande (import dynamique) :
// Vite en fait un chunk séparé, seule la langue active est téléchargée.
// Clés hiérarchiques `section.sous_section.element`, valeurs au format ICU.

import type { Locale } from '../constants/i18n';

/** Arbre de messages : texte ICU, liste de textes (mois, jours) ou sous-clés. */
export interface MessageCatalog {
  [key: string]: string | readonly string[] | MessageCatalog;
}

const LOADERS: Record<Locale, () => Promise<MessageCatalog>> = {
  en: () => import('./en.json').then((module) => module.default),
  fr: () => import('./fr.json').then((module) => module.default),
};

export function loadMessages(locale: Locale): Promise<MessageCatalog> {
  return LOADERS[locale]();
}

/**
 * Aplatit un catalogue en `clé pointée → message` (les listes donnent
 * `clé.0`, `clé.1`…, comme le chargeur YAML de Symfony).
 */
export function flattenMessages(catalog: MessageCatalog): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (node: MessageCatalog | readonly string[], path: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const full = path ? `${path}.${key}` : key;
      if (typeof value === 'string') out.set(full, value);
      else visit(value, full);
    }
  };
  visit(catalog, '');
  return out;
}
