# Installation

Hubarr est distribué sous forme d'image Docker, publiée sur Docker Hub : [`naroner/hubarr`](https://hub.docker.com/r/naroner/hubarr).

## Prérequis

- Docker Engine et Docker Compose v2 ;
- une machine **amd64** (x86-64) ; sur une autre architecture, [construisez l'image](#construire-l-image-depuis-les-sources).

## Lancer le conteneur

Copiez [`docker-compose.example.yml`](https://github.com/KilianMahe/hubarr/blob/main/docker-compose.example.yml) dans le dossier qui accueillera Hubarr, par exemple `/srv/hubarr/docker-compose.yml` :

```yaml
name: hubarr

services:
  hubarr:
    image: naroner/hubarr:latest
    container_name: hubarr
    restart: unless-stopped
    environment:
      TZ: Europe/Paris
      PUID: 1000
      PGID: 1000
      HUBARR_LOG_LEVEL: info
    volumes:
      - hubarr_data:/data
    ports:
      - '7070:7070'

volumes:
  hubarr_data:
```

Puis, depuis ce dossier :

```sh
docker compose up -d
```

Sans Compose :

```sh
docker run -d --name hubarr --restart unless-stopped \
  -p 7070:7070 -v hubarr_data:/data -e TZ=Europe/Paris \
  -e PUID=$(id -u) -e PGID=$(id -g) naroner/hubarr:latest
```

Hubarr répond sur `http://<votre-serveur>:7070`. Pour un accès depuis l'extérieur en HTTPS, voir [Reverse proxy et accès distant](./reverse-proxy.md). Le volume `hubarr_data` contient la base, sa sauvegarde et les avatars. Pour garder ces fichiers dans un dossier de l'hôte, remplacez-le par `./data:/data` : au démarrage, Hubarr attribue `/data` à l'utilisateur `PUID` et au groupe `PGID` (1000 par défaut) puis tourne sous cette identité ; indiquez les vôtres (`id -u`, `id -g`) pour que les fichiers vous appartiennent. Avec `user:` dans Compose, Hubarr démarre directement sous cet utilisateur, sans rien modifier.

Pour figer une version, remplacez `latest` par son numéro (`naroner/hubarr:1.0.0`) ; les versions sont listées dans le [CHANGELOG](https://github.com/KilianMahe/hubarr/blob/main/CHANGELOG.md).

## Variables d'environnement

| Variable                 | Défaut                           | Rôle                                                                                              |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `HUBARR_PORT`            | `7070`                           | Port d'écoute dans le conteneur                                                                   |
| `HUBARR_DATA_DIR`        | `/data`                          | Dossier des données persistantes                                                                  |
| `HUBARR_LOG_LEVEL`       | `warn`                           | `fatal`, `error`, `warn`, `info`, `debug` ou `trace`                                              |
| `HUBARR_TRUST_PROXY`     | `loopback,linklocal,uniquelocal` | Proxys inverses de confiance : `true`, `false` ou une liste d'adresses et de plages               |
| `HUBARR_FRAME_ANCESTORS` | _(vide)_                         | Origines autorisées à intégrer Hubarr dans une iframe, séparées par des espaces                   |
| `HUBARR_BASE_PATH`       | _(vide)_                         | Préfixe de chemin derrière un reverse proxy (`/hubarr`), voir [Reverse proxy](./reverse-proxy.md) |
| `HUBARR_HOST`            | `0.0.0.0`                        | Adresse d'écoute dans le conteneur                                                                |
| `PUID`, `PGID`           | `1000`                           | Utilisateur et groupe propriétaires des fichiers de `/data` (voir ci-dessus)                      |
| `TZ`                     | `UTC`                            | Fuseau par défaut de l'affichage (si les préférences n'en fixent pas) et des journaux             |

## Mettre à jour

```sh
cd /srv/hubarr
docker compose pull
docker compose up -d
```

L'application installée sur un téléphone (PWA) se met à jour d'elle-même au lancement suivant : elle suit la version de l'image, et rien d'autre.

Les migrations de la base s'appliquent au démarrage, après une copie de sauvegarde `hubarr.db.bak`.

Avant une mise à jour, une copie du dossier de données est une bonne précaution : voir [Sauvegarder et restaurer](./depannage.md#sauvegarder-et-restaurer).

::: warning Dossier de données
Hubarr refuse de démarrer sur un dossier qui contient la base d'une autre application (Prismarr notamment) : utilisez un dossier de données neuf.
:::

## Construire l'image depuis les sources

Pour une autre architecture ou une version modifiée, il faut en plus `git` et `make` (environ 1 Go de disque pendant la construction) :

```sh
git clone https://github.com/KilianMahe/hubarr.git
cd hubarr
make build
```

`make build` produit l'image `hubarr:local` (à mettre à la place de `naroner/hubarr:latest`). La construction vérifie que les modules natifs (SQLite, argon2) se chargent bien dans l'image finale et échoue sinon. Mise à jour : `git pull && make build`, puis `docker compose up -d`.
