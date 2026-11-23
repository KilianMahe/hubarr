// SPDX-License-Identifier: AGPL-3.0-or-later
// Vérifie que toutes les dépendances installées ont une licence compatible avec
// l'AGPL-3.0-or-later. S'appuie sur `pnpm -r licenses list --json`
// (tous les paquets du workspace, pas seulement la racine), sans
// dépendance supplémentaire. Lancé par `pnpm check` (et donc `make check`).

import { execFileSync } from 'node:child_process';

/** Licences acceptées d'office (CLAUDE.md : MIT, Apache-2.0, ISC, BSD + équivalents permissifs). */
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
]);

/**
 * Exceptions examinées une par une : paquet → raison. À tenir à jour à la main.
 * Une clé couvre aussi ses variantes natives par plateforme (`<clé>-linux-x64-musl`…).
 * @type {Record<string, string>}
 */
const EXCEPTIONS = {
  lightningcss:
    'MPL-2.0, compatible AGPL (MPL §3.3) ; dépendance de build de Vite, absente du bundle livré (18/11/2026)',
  argparse:
    'Python-2.0 (PSF), permissive et compatible GPL ; tirée par openapi-typescript (js-yaml), outil de génération des types, absent de l’image (18/11/2026)',
};

/** @param {string} name */
function isException(name) {
  return Object.keys(EXCEPTIONS).some((key) => name === key || name.startsWith(`${key}-`));
}

/** Une expression SPDX « A OR B » est acceptée si l'une des branches l'est. */
function isAllowed(expression) {
  const cleaned = expression.replace(/[()]/g, '').trim();
  if (cleaned.includes(' OR ')) return cleaned.split(' OR ').some((part) => isAllowed(part));
  if (cleaned.includes(' AND ')) return cleaned.split(' AND ').every((part) => isAllowed(part));
  return ALLOWED.has(cleaned);
}

const output = execFileSync('pnpm', ['-r', 'licenses', 'list', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
/** @type {Record<string, { name: string; versions: string[] }[]>} */
const report = JSON.parse(output);

const problems = [];
let count = 0;
for (const [license, packages] of Object.entries(report)) {
  for (const pkg of packages) {
    count += 1;
    if (isAllowed(license) || isException(pkg.name)) continue;
    problems.push(`${pkg.name}@${pkg.versions.join(',')} : ${license}`);
  }
}

if (problems.length > 0) {
  console.error(`Licences non autorisées (${String(problems.length)}) :`);
  for (const line of problems) console.error(`  - ${line}`);
  console.error(
    'Ajouter une exception justifiée dans tools/check-licenses.js ou retirer le paquet.',
  );
  process.exit(1);
}
console.log(`Licences : ${String(count)} paquets vérifiés, tous compatibles.`);
