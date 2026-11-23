# Installation

Hubarr ships as a Docker image published on Docker Hub: [`naroner/hubarr`](https://hub.docker.com/r/naroner/hubarr).

## Requirements

- Docker Engine and Docker Compose v2;
- an **amd64** (x86-64) machine; on another architecture, [build the image](#building-the-image-from-source).

## Running the container

Copy [`docker-compose.example.yml`](https://github.com/KilianMahe/hubarr/blob/main/docker-compose.example.yml) to the folder that will host Hubarr, for example `/srv/hubarr/docker-compose.yml`:

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

Then, from that folder:

```sh
docker compose up -d
```

Without Compose:

```sh
docker run -d --name hubarr --restart unless-stopped \
  -p 7070:7070 -v hubarr_data:/data -e TZ=Europe/Paris \
  -e PUID=$(id -u) -e PGID=$(id -g) naroner/hubarr:latest
```

Hubarr answers on `http://<your-server>:7070`. For HTTPS access from outside, see [Reverse proxy and remote access](./reverse-proxy.md). The `hubarr_data` volume holds the database, its backup and the avatars. To keep these files in a host folder, replace it with `./data:/data`: at startup, Hubarr hands `/data` to user `PUID` and group `PGID` (1000 by default) and then runs under that identity; set yours (`id -u`, `id -g`) so the files belong to you. With `user:` in Compose, Hubarr starts directly as that user, without changing anything.

To pin a version, replace `latest` with its number (`naroner/hubarr:1.0.0`); versions are listed in the [CHANGELOG](https://github.com/KilianMahe/hubarr/blob/main/CHANGELOG.md).

## Environment variables

| Variable                 | Default                          | Purpose                                                                                 |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| `HUBARR_PORT`            | `7070`                           | Listening port inside the container                                                     |
| `HUBARR_DATA_DIR`        | `/data`                          | Persistent data folder                                                                  |
| `HUBARR_LOG_LEVEL`       | `warn`                           | `fatal`, `error`, `warn`, `info`, `debug` or `trace`                                    |
| `HUBARR_TRUST_PROXY`     | `loopback,linklocal,uniquelocal` | Trusted reverse proxies: `true`, `false` or a list of addresses/ranges                  |
| `HUBARR_FRAME_ANCESTORS` | _(empty)_                        | Origins allowed to embed Hubarr in an iframe, separated by spaces                       |
| `HUBARR_BASE_PATH`       | _(empty)_                        | Path prefix behind a reverse proxy (`/hubarr`), see [Reverse proxy](./reverse-proxy.md) |
| `HUBARR_HOST`            | `0.0.0.0`                        | Listening address inside the container                                                  |
| `PUID`, `PGID`           | `1000`                           | User and group owning the files in `/data` (see above)                                  |
| `TZ`                     | `UTC`                            | Default display time zone (unless set in preferences) and log time zone                 |

## Update

```sh
cd /srv/hubarr
docker compose pull
docker compose up -d
```

The app installed on a phone (PWA) updates itself on its next launch: it follows the image version, and nothing else.

Database migrations run at startup, after a `hubarr.db.bak` backup copy.

Copying the data folder before an update is a good precaution: see [Backup and restore](./troubleshooting.md#backup-and-restore).

::: warning Data folder
Hubarr refuses to start on a folder that holds another application's database (Prismarr in particular): use a fresh data folder.
:::

## Building the image from source

For another architecture or a modified version, you also need `git` and `make` (about 1 GB of disk during the build):

```sh
git clone https://github.com/KilianMahe/hubarr.git
cd hubarr
make build
```

`make build` produces the `hubarr:local` image (use it instead of `naroner/hubarr:latest`). The build checks that the native modules (SQLite, argon2) load in the final image and fails otherwise. Update: `git pull && make build`, then `docker compose up -d`.
