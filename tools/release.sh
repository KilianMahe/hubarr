#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Publication locale (`make release VERSION=x.y.z`) : la CI ne lance que
# `pnpm check` ; ce script enchaîne tous les contrôles et produit la version.
#
#  1. vérifie la version (semver), l'arbre de travail (propre) et le tag (absent) ;
#  2. lance `make check` et `make e2e` ;
#  3. reporte la section "Unreleased" du CHANGELOG sous la nouvelle version
#     (si `CHANGELOG.md` contient déjà la section de la version, il la garde),
#     met à jour la version des package.json ;
#  4. crée le commit `chore(release): x.y.z` et le tag annoté `vx.y.z` ; le
#     commit inclut les captures de référence que `make e2e` vient de
#     régénérer (`e2e/playwright/screenshots`), état visuel de la version ;
#  5. construit l'image et l'étiquette `hubarr:local`, `<dépôt>:x.y.z` et
#     `<dépôt>:latest` (`DOCKER_REPO`, `naroner/hubarr` par défaut).
# La publication suit le push du tag (`git push origin main --follow-tags`) :
# la CI Forgejo (`.forgejo/workflows/release.yml`) pousse l'image sur Docker
# Hub, publie le dépôt public GitHub, la release et la description Docker Hub.
# À la main, à défaut : `make publish`, `make publish-github`,
# `make github-release` et `make dockerhub-description`.
set -eu

VERSION="${1:-}"
case "$VERSION" in
  '' ) echo 'VERSION est requis, par exemple : make release VERSION=1.0.0' >&2; exit 2 ;;
esac
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "Version invalide : $VERSION (attendu : x.y.z)" >&2; exit 2
fi
TAG="v$VERSION"
if [ -n "$(git status --porcelain)" ]; then
  echo "L'arbre de travail n'est pas propre : committez ou remisez d'abord." >&2; exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Le tag $TAG existe déjà." >&2; exit 1
fi

make check
make e2e

TODAY="$(date +%Y-%m-%d)"
if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
  # Nouvelle section sous "Unreleased", qui reste en tête et vide.
  awk -v version="$VERSION" -v today="$TODAY" '
    { print }
    /^## \[Unreleased\]/ && !done { print ""; print "## [" version "] - " today; done = 1 }
  ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
fi
for manifest in package.json apps/server/package.json apps/web/package.json packages/shared/package.json docs/package.json; do
  sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$VERSION\"/" "$manifest"
done

git add CHANGELOG.md package.json apps/server/package.json apps/web/package.json packages/shared/package.json docs/package.json
git add e2e/playwright/screenshots
git commit -m "chore(release): $VERSION"
git tag -a "$TAG" -m "Hubarr $VERSION"

REPO="${DOCKER_REPO:-naroner/hubarr}"
make build VERSION="$VERSION" IMAGE="$REPO:$VERSION"
docker tag "$REPO:$VERSION" "$REPO:latest"
docker tag "$REPO:$VERSION" hubarr:local
echo "Version $VERSION prête : tag $TAG, images $REPO:$VERSION, $REPO:latest et hubarr:local."
echo "Publier : git push origin main --follow-tags (la CI Forgejo publie l'image, GitHub et les notes)."
