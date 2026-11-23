// SPDX-License-Identifier: AGPL-3.0-or-later
// Génère les types TypeScript d'un service à partir de sa spécification
// OpenAPI. Les spécifications sont versionnées dans
// `tools/openapi/<service>.json`, à la version épinglée ci-dessous, pour que la
// génération reste reproductible sans réseau.
//
//   node tools/generate-openapi-types.js radarr          # régénère les types
//   node tools/generate-openapi-types.js radarr --fetch  # retélécharge la spec d'abord
//
// Passer par `make openapi SERVICE=radarr [FETCH=1]` (formatage Prettier inclus).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Sources épinglées : dépôt, étiquette de version, chemin de la spec, fichier produit. */
const SPECS = {
  radarr: {
    repo: 'Radarr/Radarr',
    tag: 'v7.0.3.10918',
    path: 'src/Radarr.Api.V3/openapi.json',
    out: 'apps/server/src/integrations/radarr/openapi.ts',
  },
  sonarr: {
    repo: 'Sonarr/Sonarr',
    tag: 'v4.0.20.3014',
    path: 'src/Sonarr.Api.V3/openapi.json',
    out: 'apps/server/src/integrations/sonarr/openapi.ts',
  },
  prowlarr: {
    repo: 'Prowlarr/Prowlarr',
    tag: 'v3.0.2.5780',
    path: 'src/Prowlarr.Api.V1/openapi.json',
    out: 'apps/server/src/integrations/prowlarr/openapi.ts',
  },
};

const [service, ...flags] = process.argv.slice(2);
const spec = SPECS[service];
if (spec === undefined) {
  console.error(
    `Service inconnu : ${service ?? '(aucun)'}. Disponibles : ${Object.keys(SPECS).join(', ')}`,
  );
  process.exit(2);
}

const specFile = join(root, 'tools/openapi', `${service}.json`);

if (flags.includes('--fetch')) {
  const url = `https://raw.githubusercontent.com/${spec.repo}/${spec.tag}/${spec.path}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Téléchargement impossible (${response.status}) : ${url}`);
    process.exit(1);
  }
  // Ré-indentée pour des diffs lisibles d'une version à l'autre.
  const document = JSON.parse(await response.text());
  await writeFile(specFile, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Spécification ${service} ${spec.tag} enregistrée : ${specFile}`);
}

const document = JSON.parse(await readFile(specFile, 'utf8'));
const ast = await openapiTS(pathToFileURL(specFile), { alphabetize: true });
const header = [
  '// SPDX-License-Identifier: AGPL-3.0-or-later',
  `// Fichier généré par tools/generate-openapi-types.js depuis la spécification`,
  `// OpenAPI de ${spec.repo} ${spec.tag} (API ${document.info?.version ?? '?'}). Ne pas modifier à la main :`,
  `// make openapi SERVICE=${service}`,
  '',
  '',
].join('\n');
await writeFile(join(root, spec.out), header + astToString(ast));
console.log(`Types ${service} générés : ${spec.out}`);
