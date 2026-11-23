// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages publiques d'une version, avec des jetons fournis par l'environnement
// (jamais écrits dans le dépôt ni dans la commande) :
//
//   node tools/publish-notes.js github-release 1.0.0   (GITHUB_TOKEN)
//     crée ou met à jour la release GitHub du tag v1.0.0 ; notes = section
//     de la version dans CHANGELOG.md, plus l'image Docker et la doc ;
//     (DRY_RUN=1 : affiche seulement les notes) ;
//   node tools/publish-notes.js dockerhub              (DOCKERHUB_TOKEN)
//     met à jour la description du dépôt Docker Hub (docker/DOCKERHUB.md).
//
// Cibles : `make github-release VERSION=x.y.z`, `make dockerhub-description`.

import { readFileSync } from 'node:fs';

const GITHUB_REPO = process.env.GITHUB_REPO || 'KilianMahe/hubarr';
const DOCKER_REPO = process.env.DOCKER_REPO || 'naroner/hubarr';
const SHORT_DESCRIPTION =
  'Self-hosted dashboard for your media stack: Radarr, Sonarr, Prowlarr, Seerr, download clients…';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) fail(`${name} est requis : ${hint}`);
  return value;
}

/** Section `## [version]` du CHANGELOG, sans son titre. */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && /^## \[|^\[[^\]]+\]: /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

async function call(url, init, what) {
  const response = await fetch(url, init);
  if (!response.ok) fail(`${what} : HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function githubRelease(version) {
  const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
  if (section === null) fail(`Section [${version}] absente de CHANGELOG.md`);
  const tag = `v${version}`;
  const body = `${section}

### Install

\`\`\`sh
docker pull ${DOCKER_REPO}:${version}
\`\`\`

See the [installation guide](https://github.com/${GITHUB_REPO}/blob/${tag}/docs/installation.md) and the [example Compose file](https://github.com/${GITHUB_REPO}/blob/${tag}/docker-compose.example.yml). The documentation is also served by Hubarr itself at \`/docs\`.`;
  // DRY_RUN=1 : affiche les notes sans rien publier.
  if (process.env.DRY_RUN === '1') {
    console.log(body);
    return;
  }
  const token = requireEnv(
    'GITHUB_TOKEN',
    'jeton GitHub avec le droit « Contents: write » sur le dépôt',
  );
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const api = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
  const payload = { tag_name: tag, name: `Hubarr ${version}`, body, make_latest: 'true' };
  const existing = await fetch(`${api}/tags/${tag}`, { headers });
  const release = existing.ok
    ? await call(
        `${api}/${(await existing.json()).id}`,
        { method: 'PATCH', headers, body: JSON.stringify(payload) },
        'Mise à jour de la release',
      )
    : await call(
        api,
        { method: 'POST', headers, body: JSON.stringify(payload) },
        'Création de la release',
      );
  console.log(`Release GitHub : ${release.html_url}`);
}

async function dockerHub() {
  const token = requireEnv(
    'DOCKERHUB_TOKEN',
    'jeton d’accès Docker Hub de portée « Read, Write, Delete » (seule portée qui autorise la description)',
  );
  const username = process.env.DOCKERHUB_USERNAME || DOCKER_REPO.split('/')[0];
  const login = await call(
    'https://hub.docker.com/v2/users/login/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: token }),
    },
    'Connexion à Docker Hub',
  );
  await call(
    `https://hub.docker.com/v2/repositories/${DOCKER_REPO}/`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${login.token}` },
      body: JSON.stringify({
        description: SHORT_DESCRIPTION,
        full_description: readFileSync('docker/DOCKERHUB.md', 'utf8'),
      }),
    },
    'Mise à jour de la description (portée « Read, Write, Delete » requise)',
  );
  console.log(`Description Docker Hub à jour : https://hub.docker.com/r/${DOCKER_REPO}`);
}

const [command, version] = process.argv.slice(2);
if (command === 'github-release' && version) await githubRelease(version);
else if (command === 'dockerhub') await dockerHub();
else fail('usage : node tools/publish-notes.js github-release <version> | dockerhub');
