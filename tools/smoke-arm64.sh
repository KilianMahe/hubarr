#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Test de fumée de l'image sur arm64 (`make smoke-arm64`), par émulation QEMU sur
# une machine amd64. Prérequis, une fois par machine (modifie binfmt_misc du
# noyau ; `--uninstall arm64` pour revenir en arrière) :
#   docker run --privileged --rm tonistiigi/binfmt --install arm64
# Construit l'image runtime pour linux/arm64 (binaires natifs chargés pendant
# le build), la lance sur une base neuve, attend le HEALTHCHECK, puis vérifie
# l'API de santé, la SPA, la documentation et le manifeste de la PWA.
set -eu

IMAGE=hubarr:arm64-smoke
NAME=hubarr-arm64-smoke
VERSION="${1:-0.0.0-arm64-smoke}"

docker buildx build --platform linux/arm64 -f docker/Dockerfile --target runtime \
  --build-arg HUBARR_VERSION="$VERSION" -t "$IMAGE" --load .

docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" --platform linux/arm64 --tmpfs /data:uid=1000,gid=1000 "$IMAGE" >/dev/null

echo 'Attente du HEALTHCHECK (émulation : jusqu’à 3 min)…'
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ]; do
  i=$((i + 1))
  if [ "$i" -gt 90 ] || [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != true ]; then
    docker logs "$NAME"
    echo 'Échec : le conteneur arm64 ne devient pas sain.' >&2
    exit 1
  fi
  sleep 2
done

check() {
  docker exec "$NAME" node -e "
    fetch('http://127.0.0.1:7070$1').then(async (r) => {
      const body = await r.text();
      if (!r.ok || !body.includes(process.argv[1])) { console.error('$1', r.status); process.exit(1); }
      console.log('ok $1');
    }).catch((e) => { console.error(e); process.exit(1); });" "$2"
}
docker exec "$NAME" uname -m
check /api/health '"status":"ok"'
check / '<base href="/" />'
check /docs/ 'Hubarr'
check /manifest.webmanifest '"Hubarr"'
echo "Image arm64 saine (version $VERSION)."
