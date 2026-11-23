// SPDX-License-Identifier: AGPL-3.0-or-later
// Messages de l'original à marqueurs `__NOM__` (`confirm_delete_indexer_tpl`,
// `test_failure_tpl`…), repris tels quels des catalogues (D10) : le JavaScript
// inline de Prismarr les complétait par `replace('__NAME__', …)`. Les valeurs
// sont insérées en texte (jamais en HTML).

/** Remplace chaque `__CLÉ__` du message par sa valeur (`{ NAME: 'x' }`). */
export function fillLegacy(message: string, values: Record<string, string | number>): string {
  return message.replace(/__([A-Z0-9_]+)__/g, (marker, name: string) =>
    name in values ? String(values[name]) : marker,
  );
}
