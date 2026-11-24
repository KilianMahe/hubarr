#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Publication du code sur le dépôt public GitHub (`make publish-github
# VERSION=x.y.z`, remote `github` en SSH ; en CI, HTTPS avec un jeton).
#
# Le dépôt public a son propre historique : un commit par version, dont
# l'arbre est celui du tag `vx.y.z` sans les fichiers internes au
# développement (PRIVATE ci-dessous). Le premier commit n'a pas de parent ; les
# suivants s'enchaînent sur le `main` public. Le tag `vx.y.z` du dépôt public
# pointe sur ce commit. Rien n'est modifié dans l'historique local.
#
# Variables :
#   GITHUB_REMOTE  remote ou URL du dépôt public (`github` par défaut ; avec
#                  GITHUB_PUSH_TOKEN, `https://github.com/KilianMahe/hubarr.git`) ;
#   GITHUB_PUSH_TOKEN  jeton « Contents: write » (publication par la CI),
#                  transmis à git par en-tête HTTP via l'environnement : jamais
#                  dans l'URL, la ligne de commande ni les journaux ;
#   DRY_RUN=1      vérifie l'accès au dépôt public et prépare le commit sans
#                  rien pousser.
# Une version déjà publiée (tag présent sur le dépôt public) est laissée telle
# quelle : la commande peut être relancée sans risque.
set -eu

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo 'VERSION est requis, par exemple : make publish-github VERSION=1.0.0' >&2; exit 2; }
TAG="v$VERSION"
PRIVATE='CLAUDE.md PLAN.md MEMOIRE.md design .forgejo'
if [ -n "${GITHUB_PUSH_TOKEN:-}" ]; then
  REMOTE="${GITHUB_REMOTE:-https://github.com/KilianMahe/hubarr.git}"
  AUTH="$(printf 'x-access-token:%s' "$GITHUB_PUSH_TOKEN" | base64 | tr -d '\n')"
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0='http.https://github.com/.extraheader'
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $AUTH"
else
  REMOTE="${GITHUB_REMOTE:-github}"
fi
# `main` public, rangé à part (le remote peut être une URL sans refs de suivi).
PUBLIC_MAIN='refs/publish-github/main'

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "Tag $TAG introuvable." >&2; exit 1; }

# Accès au dépôt public, et version déjà publiée ?
REMOTE_TAGS="$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG")" || {
  echo "Dépôt public injoignable ou accès refusé : $REMOTE" >&2; exit 1;
}
if [ -n "$REMOTE_TAGS" ]; then
  echo "$TAG est déjà publié sur le dépôt public : rien à faire."
  exit 0
fi

git update-ref -d "$PUBLIC_MAIN" 2>/dev/null || true
git fetch -q "$REMOTE" "+refs/heads/main:$PUBLIC_MAIN" 2>/dev/null || true

INDEX="$(mktemp)"
trap 'rm -f "$INDEX"' EXIT
rm -f "$INDEX"
GIT_INDEX_FILE="$INDEX" git read-tree "$TAG^{tree}"
for path in $PRIVATE; do
  GIT_INDEX_FILE="$INDEX" git rm -r -q --cached --ignore-unmatch -- "$path"
done
TREE="$(GIT_INDEX_FILE="$INDEX" git write-tree)"

PARENT=''
if git rev-parse -q --verify "$PUBLIC_MAIN" >/dev/null; then
  PARENT="-p $(git rev-parse "$PUBLIC_MAIN")"
fi
# shellcheck disable=SC2086
COMMIT="$(git commit-tree "$TREE" $PARENT -m "Hubarr $VERSION")"
TAG_OBJECT="$(printf 'object %s\ntype commit\ntag %s\ntagger %s\n\nHubarr %s\n' \
  "$COMMIT" "$TAG" "$(git var GIT_COMMITTER_IDENT)" "$VERSION" | git mktag)"

if [ "${DRY_RUN:-}" = '1' ]; then
  echo "Essai : dépôt public joignable ; commit $COMMIT (parent : ${PARENT:-aucun}) et tag $TAG prêts, rien n'est poussé."
  exit 0
fi
git push "$REMOTE" "$COMMIT:refs/heads/main" "$TAG_OBJECT:refs/tags/$TAG"
echo "Publié sur le dépôt public : main = $COMMIT, tag $TAG."
