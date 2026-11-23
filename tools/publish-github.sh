#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Publication du code sur le dépôt public GitHub (`make publish-github
# VERSION=x.y.z`, remote `github`).
#
# Le dépôt public a son propre historique : un commit par version, dont
# l'arbre est celui du tag `vx.y.z` sans les fichiers internes au
# développement (PRIVATE ci-dessous). Le premier commit n'a pas de parent ; les
# suivants s'enchaînent sur `github/main`. Le tag `vx.y.z` du dépôt public
# pointe sur ce commit. Rien n'est modifié dans l'historique local.
set -eu

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo 'VERSION est requis, par exemple : make publish-github VERSION=1.0.0' >&2; exit 2; }
TAG="v$VERSION"
REMOTE="${GITHUB_REMOTE:-github}"
PRIVATE='CLAUDE.md PLAN.md MEMOIRE.md design'

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "Tag $TAG introuvable." >&2; exit 1; }
git fetch "$REMOTE" 2>/dev/null || true

INDEX="$(mktemp)"
trap 'rm -f "$INDEX"' EXIT
rm -f "$INDEX"
GIT_INDEX_FILE="$INDEX" git read-tree "$TAG^{tree}"
for path in $PRIVATE; do
  GIT_INDEX_FILE="$INDEX" git rm -r -q --cached --ignore-unmatch -- "$path"
done
TREE="$(GIT_INDEX_FILE="$INDEX" git write-tree)"

PARENT=''
if git rev-parse -q --verify "refs/remotes/$REMOTE/main" >/dev/null; then
  PARENT="-p $(git rev-parse "refs/remotes/$REMOTE/main")"
fi
# shellcheck disable=SC2086
COMMIT="$(git commit-tree "$TREE" $PARENT -m "Hubarr $VERSION")"
TAG_OBJECT="$(printf 'object %s\ntype commit\ntag %s\ntagger %s\n\nHubarr %s\n' \
  "$COMMIT" "$TAG" "$(git var GIT_COMMITTER_IDENT)" "$VERSION" | git mktag)"

git push "$REMOTE" "$COMMIT:refs/heads/main" "$TAG_OBJECT:refs/tags/$TAG"
echo "Publié sur $REMOTE : main = $COMMIT, tag $TAG."
