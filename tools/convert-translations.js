// SPDX-License-Identifier: AGPL-3.0-or-later
// Import des traductions de Prismarr.
//
// Convertit `messages+intl-icu.{en,fr}.yaml` en `packages/shared/src/i18n/{en,fr}.json`
// en gardant les clés, leur ordre et le format ICU MessageFormat tels quels.
// Seules transformations : le nom « Prismarr » devient « Hubarr » dans les textes,
// et le domaine `errors` (outils de debug Symfony) est ignoré.
//
// Les JSON produits sont versionnés et deviennent la source des traductions de
// Hubarr : relancer cet import écrase les modifications faites depuis. À n'utiliser
// que pour reprendre des clés ajoutées dans Prismarr, en relisant le diff.
//
// Usage (dans le conteneur, via `make i18n-import PRISMARR_DIR=../Prismarr`) :
//   node tools/convert-translations.js <dossier translations source> <dossier cible>

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const LOCALES = ['en', 'fr'];
const BRAND = /\bPrismarr\b/g;

/**
 * Valide et transforme une branche du catalogue. Une valeur est une chaîne,
 * une liste de chaînes (noms de mois, de jours) ou une table de sous-clés.
 */
function convert(node, path) {
  if (typeof node === 'string') return node.replace(BRAND, 'Hubarr');
  if (Array.isArray(node)) {
    return node.map((item, index) => {
      if (typeof item !== 'string') throw new Error(`${path}.${index} : chaîne attendue`);
      return convert(item, `${path}.${index}`);
    });
  }
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`${path}.${key} : clé invalide`);
      out[key] = convert(value, path ? `${path}.${key}` : key);
    }
    return out;
  }
  throw new Error(`${path} : type non pris en charge (${node === null ? 'null' : typeof node})`);
}

function countLeaves(node) {
  if (typeof node === 'string' || Array.isArray(node)) return 1;
  return Object.values(node).reduce((sum, child) => sum + countLeaves(child), 0);
}

const [sourceDir, targetDir] = process.argv.slice(2);
if (!sourceDir || !targetDir) {
  console.error('Usage : node tools/convert-translations.js <source> <cible>');
  process.exit(2);
}

for (const locale of LOCALES) {
  const file = join(sourceDir, `messages+intl-icu.${locale}.yaml`);
  // Schéma YAML 1.2 (`core`) comme le composant Yaml de Symfony : `yes`, `no`,
  // `No` restent des chaînes. Une clé en double est une erreur.
  const catalog = convert(parse(await readFile(file, 'utf8'), { uniqueKeys: true }), '');
  const target = join(targetDir, `${locale}.json`);
  await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`${locale} : ${countLeaves(catalog)} clés → ${target}`);
}
