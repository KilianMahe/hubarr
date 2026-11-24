// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages publiques d'une version, avec des jetons fournis par l'environnement
// (jamais écrits dans le dépôt ni dans la commande) :
//
//   node tools/publish-notes.js github-release 1.0.0   (GITHUB_TOKEN)
//     crée ou met à jour la release GitHub du tag v1.0.0 ; notes = section
//     de la version dans CHANGELOG.md, plus l'image Docker et la doc ;
//     (DRY_RUN=1 : affiche les notes, celles d'« Unreleased » si la version
//     n'a pas encore sa section, et vérifie le droit d'écriture du jeton
//     s'il est fourni, sans rien publier) ;
//   node tools/publish-notes.js dockerhub              (DOCKERHUB_TOKEN)
//     met à jour la description du dépôt Docker Hub (docker/DOCKERHUB.md)
//     (DRY_RUN=1 : vérifie seulement la connexion).
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
  const dryRun = process.env.DRY_RUN === '1';
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const section =
    changelogSection(changelog, version) ??
    (dryRun ? changelogSection(changelog, 'Unreleased') : null);
  if (section === null) fail(`Section [${version}] absente de CHANGELOG.md`);
  const tag = `v${version}`;
  const body = `${section}

### Install

\`\`\`sh
docker pull ${DOCKER_REPO}:${version}
\`\`\`

See the [installation guide](https://github.com/${GITHUB_REPO}/blob/${tag}/docs/installation.md) and the [example Compose file](https://github.com/${GITHUB_REPO}/blob/${tag}/docker-compose.example.yml). The documentation is also served by Hubarr itself at \`/docs\`.`;
  const headers = (token) => ({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  });
  // DRY_RUN=1 : affiche les notes ; avec un jeton, vérifie son droit d'écriture.
  if (dryRun) {
    console.log(body);
    if (process.env.GITHUB_TOKEN) {
      const repo = await call(
        `https://api.github.com/repos/${GITHUB_REPO}`,
        { headers: headers(process.env.GITHUB_TOKEN) },
        'Accès au dépôt GitHub',
      );
      if (repo.permissions?.push !== true)
        fail(`Le jeton GitHub n'a pas le droit d'écriture sur ${GITHUB_REPO}`);
      console.log(`Essai : jeton GitHub valide, écriture autorisée sur ${GITHUB_REPO}.`);
    }
    return;
  }
  const auth = headers(
    requireEnv('GITHUB_TOKEN', 'jeton GitHub avec le droit « Contents: write » sur le dépôt'),
  );
  const api = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
  // Préversion (x.y.z-rc.1) : marquée comme telle, jamais « Latest ».
  const prerelease = version.includes('-');
  const payload = {
    tag_name: tag,
    name: `Hubarr ${version}`,
    body,
    prerelease,
    make_latest: prerelease ? 'false' : 'true',
  };
  const existing = await fetch(`${api}/tags/${tag}`, { headers: auth });
  const release = existing.ok
    ? await call(
        `${api}/${(await existing.json()).id}`,
        { method: 'PATCH', headers: auth, body: JSON.stringify(payload) },
        'Mise à jour de la release',
      )
    : await call(
        api,
        { method: 'POST', headers: auth, body: JSON.stringify(payload) },
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
  if (process.env.DRY_RUN === '1') {
    console.log(`Essai : connexion à Docker Hub réussie (${username}), description non modifiée.`);
    return;
  }
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
