# Changelog

All notable changes to Hubarr are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-11-26

### Added

- **Notification center**: a bell in the top bar (on mobile too, in the service views' bar) keeps the latest 50 notifications, with the number of unread ones. Torrent completions and errors now land there only, without a pop-up; action confirmations and errors still show a brief toast and are recorded as well. Each notification shows how long ago it happened; they can be marked as read (automatically when the menu closes), removed one by one or cleared. The history is kept in the browser, per account, and shared between tabs.

- **User management with per-service access**: a new **Users** tab in **Settings** lists the accounts, with their role, access summary and last sign-in. An administrator creates an account with a temporary password, edits it (e-mail, name, role, new temporary password, which closes its sessions) or deletes it; Hubarr always keeps at least one administrator. For a user, each service gets **None**, **Read** or **Write** access, per instance for Radarr and Sonarr. A user only sees the services opened to them, in the menu as on the dashboard, calendar, search and discover; on a read-only service, pages show a **Read-only** badge and hide the action buttons. The server checks every request. Write access to Prowlarr manages the indexers and starts the app sync. Service settings and system pages, Prowlarr's other commands, Seerr users and Hubarr's settings stay administrator-only.

### Changed

- Calendar, month view: the frame now marks the selected day instead of today; today's number is shown in the accent colour.

- A non-administrator account no longer reaches Tautulli, Tracearr, Emby, TMDB (discover, watchlist), the calendar or the dashboard cards by default: their access now follows the account's rights on each service, set by an administrator. Stopping a Tracearr stream requires write access to Tracearr instead of the administrator role. Managing a blocked import from the dashboard requires write access to the Radarr or Sonarr instance.

### Security

- Every API route now declares its access policy, and the server refuses to start if one is missing. A test calls every route and checks that it answers 401 without a session and 403 to an account without rights.
- Access is checked before the request is validated and before the service configuration is looked at: an account without the right gets a plain 403, without learning the expected request format, whether a service is configured or whether a Radarr or Sonarr instance exists.
- The Radarr and Sonarr **System** pages (logs, disks, indexers, download clients) are administrator-only on the server too; the **Server** tab shows the service version to administrators only.
- Before sign-in, Hubarr no longer reveals its version or the installation's display preferences.

## [1.2.0] - 2026-11-25

### Added

- **Display preferences per account**: a new **Display preferences** card on the **Profile** page sets the view the Radarr and Sonarr libraries open on (or **Automatic**: grid on a computer, detailed list on mobile), and the view and state filter of the torrent list (qBittorrent, Transmission, Deluge; the **Stalled** filter only applies to qBittorrent). They are stored with the account and follow it on every device. Only the lines of configured services are shown.

- **Blocked imports from the dashboard** (administrators): in the **Queues** section, a blocked import, warning or error shows its reason, and a click opens its management. The download's files are listed as Radarr or Sonarr read them, with their refusal reasons; the movie, or the series, season and episodes, the quality, the languages and the release group can be fixed before a **manual import**, followed to its end. The download can also be **removed from the queue**, from the download client and added to the blocklist. The same window opens from the **Queue** pages of Radarr and Sonarr (and the queue at the top of their library), with the **Manage import** button of each affected line.

- **Stop a playback** (administrators, Tracearr): the stream details window, opened from the Tracearr **Now playing** page or from the dashboard, has a **Stop playback** button. After confirmation, Tracearr ends the stream; an optional message (up to 200 characters) is shown to the viewer.

### Changed

- **Library and torrent views**: the Radarr and Sonarr libraries and the torrent list now always open on the view (and, for torrents, the filter) set in the profile. A view picked on the page only lasts for the current visit and is no longer remembered on the device. Sort and page size of the torrent list are still remembered on the device.
- **Explorer and Watchlist tabs**: the Explorer and the Watchlist are now tabs of **Home**, next to Discover and Calendar (top of the page on a computer, bottom bar on mobile). The Watchlist and Explorer buttons of the Discover page and the Explorer's back button are gone. Addresses are unchanged.
- **Interactive search** (Radarr and Sonarr): releases are listed most relevant first: accepted ones, then in the order Radarr or Sonarr ranks them (quality, custom format score, protocol, indexer priority, seeders) instead of by score alone. On a computer, the list uses the height of the window and a wider window, shows the number of releases, and a row stays on one line: beyond two custom formats, a **+N** chip lists the others. Score, size and seeds sort largest first; a third click on a header, or **Sort by relevance**, restores the default order.
- **Now playing on the dashboard**: a playback in the **Current activity** section now opens the same window as the Tracearr page (stream details: player, network, quality, stream decisions) or the Tautulli page (Plex metadata), depending on the source, instead of the TMDB preview.
- **Dashboard queues**: a download in progress or waiting for import (for instance an episode whose title is still TBA) now opens the **Queue** page of its Radarr or Sonarr instance instead of the movie or series page.

### Security

- **Login throttling**: the limit of 50 attempts per account, whatever the IP address, no longer applies to an address from which the account has signed in within the last 30 days. Repeated failures from elsewhere could otherwise keep an administrator out indefinitely. The limits of 5 attempts per account and IP and 25 per IP still apply.

### Fixed

- **Error messages from Tracearr**: when Tracearr refuses an action, the reason it gives (for instance *Session not found in database*) is now shown instead of a generic *InternalServerError*.
- **Torrent details**: the selected tab (Files, Trackers, Peers) no longer switches back to **General** a few seconds later when the list refreshes, and fields being edited (name, location, category, limits) are no longer reset.
- **Episodes being downloaded** (series page): an episode in the Sonarr queue, downloading or waiting for import, is now shown as **Downloading** with its progress instead of **Missing**, and the page updates once it is imported.
- **Sonarr queue on mobile**: each line of the queue (Queue page and the queue at the top of the library) is now laid out as a card, so the series title uses the full width instead of being squeezed into a narrow column.

## [1.1.0] - 2026-11-24

### Added

- **Dashboard statistics** (administrators): **Downloaded per day** charts the data downloaded each day over the last 30 days, with total and daily average, from qBittorrent, Transmission, Deluge, SABnzbd and NZBGet; it is built from what the clients still list, so nothing is stored and a removed item no longer counts. **Disk space** shows the usage of each disk holding a Radarr or Sonarr root folder, once per disk, and flags those above 90 %. Both sections can be moved or hidden like the others.
- **Instant display on reload**: the dashboard, Discover, the calendar, the libraries and the movie and series pages show what you last viewed straight away when Hubarr is reloaded or reopened, then update it, with a thin bar at the top of the screen while updating. This copy is kept in the browser (IndexedDB) for 24 hours at most, per account and per Hubarr version, and is cleared on sign-out; logs, settings, profile, activity and download queues are never kept.
- **Discover suggestions**: three new rows on the Discover home. **Because you watched** recommends titles from your latest plays when your account is linked to Tracearr, leaving out what you have already watched. **For “folder”** gives one row per Radarr and Sonarr root folder, from the TMDB recommendations of the titles last added to it, ranked by how many of them recommend each title and without titles already in a library; rows are computed in the background and refreshed every 6 hours. **Popular in [year]** lists the most popular movies or TV shows of the year picked in its selector. The **Explorer** also filters by a precise **year**, as an alternative to the decade.
- **Anime in Discover**: the search offers an **Anime** type (movies and TV shows), and the Explorer an **Anime** type with a TV shows / movies choice. TMDB has no anime type: Hubarr keeps titles of the Animation genre whose original language is Japanese.
- **Watched, from Tracearr**: in their **Profile**, each user picks their Tracearr account. Their plays are imported in the background, then updated every 15 minutes; movies watched get a **Watched** badge and series show the episodes watched (**3/10 watched**) on their page and in the library (cards and list), with a count per season and a mark per episode, and on the dashboard's **Trending this week** and **Recently added to your library** rows. Administrators can **Resynchronize** the whole history. Requires Tracearr's v2 API; plays are stored in the new `tracearr_watch` table (database migration applied at startup, after a backup).
- **Suggestions on movie and series pages**: when TMDB is configured, a movie or series page shows **Recommendations** and **Similar** rows from TMDB, with titles already in a library marked. A title you own opens its Hubarr page; another one opens its TMDB page, from which it can be added.
- **Logs**: administrators find the last 1,000 log entries in the **Logs** section of **Settings** (the address `/admin/logs` leads there), filterable by minimum level, service and text, with the details of each entry, copy as JSON, download of the filtered entries as `.jsonl` and auto refresh. Entries are kept in memory; `HUBARR_LOG_BUFFER_LEVEL` keeps more detail on the page (for example `info`) without making the console more verbose.
- **Service errors in the logs**: a failed call names the service and instance, method, path, HTTP status or network error code, error kind, duration and circuit breaker state.

### Removed

- **Startup**: Hubarr no longer checks for a Prismarr database (`prismarr.db`, Doctrine tables) in the data folder.

### Changed

- **Horizontal rows**: rows of cards (Discover, dashboard, shelves of the libraries, movie and series pages, add window, Bazarr) no longer show a scroll bar. Arrows at their edges move them, on a computer as on mobile, and each one is hidden at the end of the row; rows can still be swiped on a touch screen.
- **Dashboard layout**: sections are reordered by dragging their handle with the mouse or a finger, in the layout editor of the dashboard as in **Settings → Display**, which only had Move up/down buttons. Dragging did not work on touch screens before.
- **Discover**: the home of Discover is split into four chips under the search field: **For you** (from your library, because you watched, one row per root folder, recently viewed), **Trending** (titles of the week, trending, popular, upcoming, on the air), **Top rated** (movies, TV shows) and **By year**. Only the rows of the chip shown are loaded. The chip is kept in the address (`?onglet=`); without one, For you opens, or Trending when For you has nothing to show. The **For you** row based on your library is renamed **From your library**.
- **Home**: the side menu has a single **Home** entry instead of Dashboard, Search and Calendar. These three pages are linked by tabs, at the top of the page on a computer and in the bottom bar on mobile; Discover and the calendar keep their conditions (TMDB, Radarr or Sonarr configured, side menu visibility) and every page keeps its address. The home page chosen in the settings is unchanged.
- **Icons**: the whole interface uses Material Symbols (Rounded) instead of Material Design Icons, including Vuetify's own icons (checkboxes, sorting, pagination). The `@mdi/js` dependency is removed.
- **Movie and series pages**: new layout. On a computer, a column on the left stays in view while scrolling, with the poster, the status (downloaded or missing, monitoring, quality and size; episodes present for a series), the actions and key figures; the title, details and cards are on the right, and deleting is folded at the bottom. On mobile, the poster and title share the first row, followed by the status and actions. Seasons become cards with their progress, monitoring and search, the other actions in a **⋮** menu; each episode's number is coloured by its status, and episodes not aired yet are shown as **upcoming** instead of missing.
- **Add window**: the form shows the title at the top and groups its settings into **Library** and **Monitoring** rows in the service colour; the result of the addition stays in view with **View**, which opens the new title's page.
- **Adding a movie or series**: each search result offers **View** (its TMDB page, or its Hubarr page when the title is already in Radarr or Sonarr) and **Add**, which opens the form. The form has a **Back** button that returns to the results with the search and scroll position kept; the cross closes the window. The **Add** button of a TMDB page opened from the window leads to the same form. Movies and series share one add window.
- **Side menu footer**: **Settings**, **Help** and **Source code** are listed one under the other, each with its icon, instead of a row of buttons.
- **Settings on mobile**: the sections of the **Settings** page move to the bottom bar. On a service's settings pages (Radarr, Sonarr, Prowlarr, Seerr), the bottom bar holds the groups, and a tap on a group lists its pages, instead of two rows of tabs. The top bar names the service and the page ("Sonarr · Tasks", "Settings · Backup"), as on every page of a service with a bottom bar ("Radarr · Films", "Sonarr · Server"). In libraries, the magnifier of the top bar opens the library search in its place; the Server tab shows the library counters under the version.
- **Calendar**: releases are coloured by download status instead of release type: downloaded (green), downloading, from the Radarr and Sonarr queues (orange), missing (red), upcoming (blue), not monitored (grey). The status filters follow these five statuses and act as the legend; the release type is shown by an icon. For a movie, "missing" follows its minimum availability in Radarr.
- **Movie and series pages on mobile**: the search, interactive search and refresh buttons are shown on the page, under the monitoring button, instead of being hidden in the lightning menu. On a movie, the middle button of the bottom bar opens the edit panel; on a series, the lightning menu keeps renaming, files and editing.
- **Dialogs**: every dialog and bottom sheet has a close button (cross) at the top right.
- **Calendar**: in the month view, the releases shown in a day cell are no longer clickable; a click on the cell selects the day, and its releases open from the list below the grid.

### Security

- **Logs**: API keys, tokens, passwords, `Authorization` headers, cookies, credentials in URLs and sensitive URL parameters are masked before being logged, in the container output as on the Logs page.
- **Docker image**: npm, npx, yarn and corepack are removed from the image. Hubarr never uses them, and their bundled dependencies carried known vulnerabilities (undici, brace-expansion).
- **Vulnerability scanning**: `make scan` runs Trivy on the dependencies and on the image; configuration in `trivy.yaml`, accepted exceptions in `.trivyignore.yaml`.
- **Dependencies**: `@fastify/static` 10.1.12, which brings glob 14 and minimatch 11 (denial of service through crafted glob patterns, CVE-2026-118773 and CVE-2026-118764). The documentation build uses vite 6.4 instead of vite 5 (development server vulnerabilities, CVE-2026-112942 among others).

## [1.0.1] - 2026-11-23

### Security

- **Login**: an additional limit of 50 attempts in 15 minutes per account, whatever the IP address. The default `HUBARR_TRUST_PROXY` trusts private networks, so a client on the local network could send a different `X-Forwarded-For` with each attempt and get around the per-IP limits.
- **Profile**: checking the current password before a password change is limited to 5 attempts in 15 minutes, so a stolen session cannot be used to guess it.
- **Services**: the SSRF guard now also checks each connection. A host name that resolves to a link-local address (cloud metadata) is refused, even when the URL was saved without a DNS check or the DNS answer changed after the check (DNS rebinding).
- **Configuration import**: when the file changes the scheme, host or port of an existing service or instance, its stored API key and password are cleared. Before this, a tampered file could send them to another server.
- **Docker image**: the application files belong to root, so the server process cannot overwrite them. The entrypoint no longer follows symbolic links when it hands `/data` over to `PUID:PGID`.

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

[Unreleased]: https://github.com/KilianMahe/hubarr/compare/v1.0.1...main
[1.0.1]: https://github.com/KilianMahe/hubarr/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/KilianMahe/hubarr/releases/tag/v1.0.0
