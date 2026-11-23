# Changelog

All notable changes to Hubarr are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-23

First public release.

### Added

- **Core**: setup wizard (language, administrator account), login with attempt throttling, 7-day sessions, administrator and user roles, profile (name, e-mail, password, avatar), command-line password reset (`hubarr user:reset-password`).
- **Services**: configuration and connection test with diagnosis for 15 services (Radarr, Sonarr, Prowlarr, Bazarr, Seerr, qBittorrent, Transmission, Deluge, SABnzbd, NZBGet, Gluetun, Tautulli, Tracearr, Emby, TMDB), multiple Radarr and Sonarr instances, continuous service health, configuration export and import.
- **Movies and shows**: filterable libraries (grid, list, table), detail pages, interactive release search and grab, file management, bulk actions, queue, history, missing, cutoff unmet, blocklist, collections, quick add from any screen.
- **Administration** of Radarr, Sonarr and Prowlarr: profiles, custom formats, indexers, clients, lists, notifications, naming, tasks, logs, backups, updates.
- **Downloads**: one view shared by the torrent clients and one by the Usenet clients, bulk actions, add by link or file, speed limits, VPN status.
- **Subtitles** (Bazarr), **requests** (Seerr), **activity** (Tautulli, Tracearr, Emby).
- Customizable **dashboard**, multi-instance **calendar** with an iCal feed, TMDB **discover** and watchlist, **global search**.
- **Real time** over Server-Sent Events, with shared pollers and a polling fallback; stale-while-revalidate cache.
- Material, mobile-first **interface**, dark by default, 17 palettes, per-service accent, in English and French; installable as an app (PWA).
- **Reverse proxy**: path prefix through `HUBARR_BASE_PATH` or `X-Forwarded-Prefix`, iframe embedding through `HUBARR_FRAME_ANCESTORS`.
- Bilingual **documentation** embedded and served at `/docs`: user guide, service pages, functional overview, technical architecture.
- Single **Docker image** published on Docker Hub (`naroner/hubarr`): the server never runs as root, file ownership configurable (`PUID`, `PGID`), health check; database migrations at startup with a prior backup; the installed PWA only updates with the image.

[Unreleased]: https://github.com/KilianMahe/hubarr/compare/v1.0.0...main
[1.0.0]: https://github.com/KilianMahe/hubarr/releases/tag/v1.0.0
