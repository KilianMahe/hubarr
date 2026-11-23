#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Allège les dépendances de production déployées (cible `build` du Dockerfile) :
# ne garde que les binaires précompilés de la plateforme de l'image (Alpine,
# donc musl, architecture courante) et retire les sources C/C++ qui ne servent
# qu'à une recompilation. Le chargement réel est vérifié ensuite dans la cible
# `runtime` (garde-fou des binaires natifs).
#   usage : prune-native.sh <dossier node_modules>
set -eu

root="$1"
arch="$(node -p process.arch)"

# Dossiers `prebuilds/` (node-gyp-build) : better-sqlite3 (fichiers
# `linuxmusl-<arch>.node`), argon2 (dossier `linux-<arch>/` avec variantes musl).
find "$root" -type d -name prebuilds -prune | while read -r dir; do
  for entry in "$dir"/*; do
    case "$(basename "$entry")" in
      "linuxmusl-${arch}" | "linuxmusl-${arch}.node" | "linux-${arch}") ;;
      *) rm -rf "$entry" ;;
    esac
  done
done

# Sources de SQLite et du binding (inutiles sans recompilation).
find "$root" -type d -path '*/node_modules/better-sqlite3' -prune | while read -r pkg; do
  rm -rf "$pkg/deps" "$pkg/src" "$pkg/binding.gyp"
done
