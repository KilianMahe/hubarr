# Notice

**Hubarr** is a self-hosted application for managing a media stack, released under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`), see [`LICENSE`](LICENSE).

- Hubarr source code: <https://github.com/KilianMahe/hubarr>.

## Origin

Hubarr is inspired by **Prismarr**, by Shoshuo and contributors (<https://github.com/Shoshuo/Prismarr>, reference version v1.3.0), released under the `AGPL-3.0-or-later` license.

Hubarr is written in TypeScript (Node.js, Fastify, Vue, Vuetify), with its own architecture and interface.

## Included third-party files

- `tools/openapi/radarr.json`, `tools/openapi/sonarr.json`, `tools/openapi/prowlarr.json`: OpenAPI specifications of the Radarr (<https://github.com/Radarr/Radarr>), Sonarr (<https://github.com/Sonarr/Sonarr>) and Prowlarr (<https://github.com/Prowlarr/Prowlarr>) APIs, under the GNU GPL v3.0, compatible with the AGPL v3 (GPL §13). The `apps/server/src/integrations/<service>/openapi.ts` types are generated from them (`make openapi SERVICE=<service>`).

- `apps/web/src/components/symbols.ts`: icon paths from Material Symbols by Google (<https://github.com/google/material-design-icons>, `@material-symbols/svg-400`, Rounded style), under the Apache License 2.0.

## Trademarks

Radarr, Sonarr, Prowlarr, Bazarr, Seerr, Jellyseerr, Overseerr, qBittorrent, Transmission, Deluge, SABnzbd, NZBGet, Gluetun, Tautulli, Plex, Tracearr, Emby and TMDB are trademarks of their respective owners. Hubarr is not affiliated with any of these projects; it names them to indicate which services it works with. This product uses the TMDB API but is not endorsed or certified by TMDB.
