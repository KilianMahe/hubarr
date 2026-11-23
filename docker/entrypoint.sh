#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Point d'entrée de l'image : lance Hubarr sous l'UID et le GID choisis
# (`PUID`, `PGID`, 1000 par défaut, comme l'utilisateur `node`), pour que les
# fichiers du volume appartiennent à l'utilisateur de l'hôte.
#
# Démarré en root, il rend le dossier de données à PUID:PGID (récursivement
# seulement si son propriétaire diffère), puis abandonne ses droits avec
# `su-exec`. Démarré directement sous un autre utilisateur (`user:` de Compose,
# `--user`), il lance Hubarr tel quel.
set -eu

DATA_DIR="${HUBARR_DATA_DIR:-/data}"

if [ "$(id -u)" != 0 ]; then
  exec "$@"
fi

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
case "$PUID$PGID" in
  *[!0-9]*) echo "PUID et PGID doivent être des nombres (reçu : PUID=$PUID, PGID=$PGID)" >&2; exit 1 ;;
esac

mkdir -p "$DATA_DIR"
if [ "$(stat -c %u:%g "$DATA_DIR")" != "$PUID:$PGID" ]; then
  echo "hubarr : dossier $DATA_DIR attribué à $PUID:$PGID"
  # -h : un lien symbolique déposé dans le volume est changé lui-même, jamais
  # sa cible (le script tourne encore en root).
  chown -R -h "$PUID:$PGID" "$DATA_DIR"
fi

exec su-exec "$PUID:$PGID" "$@"
