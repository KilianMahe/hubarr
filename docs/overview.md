# Functional overview

This page describes **what Hubarr does**: who it is for, the concepts it handles, what each module offers and the rules that govern its use. For installation, see [Installation](./installation.md); for the internals, see [Technical architecture](./architecture.md).

## In one sentence

Hubarr is a **self-hosted web application** that brings together, behind a single interface and a single login, the tools of a home media stack: movie and TV show libraries, indexers, subtitles, download clients, requests, playback statistics and discovery of new titles.

## The problem it solves

A typical media stack runs a dozen services (Radarr, Sonarr, Prowlarr, Bazarr, qBittorrent, SABnzbd, Seerr, Tautulli…), each with its own interface, password, port and navigation. Following a movie "from request to playback" means jumping from one to the next, and most of these interfaces are awkward on a phone.

Hubarr replaces none of these services: it **drives** them through their APIs. It brings:

- **a single entry point**, one session, the same navigation everywhere;
- **a cross-service view**: dashboard, calendar, global search and service health aggregate every source;
- **a mobile-first interface**, installable as an app (PWA);
- **safer exposure**: the browser only talks to Hubarr, never directly to the services, whose addresses and keys stay on the server.

## Users and roles

| Role              | Who                         | What they can do                                                                                                                           |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Administrator** | Created by the setup wizard | Everything: service configuration, settings, Radarr/Sonarr/Prowlarr/Bazarr/Seerr administration, download clients, additions and deletions |
| **User**          | Non-administrator account   | Browse: dashboard, calendar, discover and watchlist, activity, profile. Administration modules are closed to them                          |

In practice, an install often has a single account, the administrator. Each account manages its **profile** (display name, e-mail, password, avatar) and its **display preferences**: the view the Radarr and Sonarr libraries open on, and the view and filter of the torrent list. These preferences follow the account on every device.

## Key concepts

| Concept             | Definition                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**         | A third-party application driven by Hubarr (15 in total, see below). A service is _configured_ (URL and credentials saved), _enabled_ or not, and _shown in the menu_ or not.                                                    |
| **Instance**        | One installation of a service. Radarr and Sonarr accept **several instances** (for example "Movies" and "Movies 4K"); one is the _default_ instance. Each instance has a **slug** used in addresses (`/medias/movies-4k/films`). |
| **Library**         | All movies (Radarr) or shows (Sonarr) of an instance, with their state: monitored, downloaded, missing, below the quality cutoff.                                                                                                |
| **Queue**           | Downloads in progress as seen by Radarr or Sonarr, with their issues (import blocked, failure).                                                                                                                                  |
| **Release**         | A downloadable version of a movie or episode, found by the indexers, that can be grabbed manually.                                                                                                                               |
| **Indexer**         | A source of releases, managed by Prowlarr and synced to Radarr and Sonarr.                                                                                                                                                       |
| **Download client** | qBittorrent, Transmission, Deluge (torrent) or SABnzbd, NZBGet (Usenet).                                                                                                                                                         |
| **Request**         | A movie or show request made in Seerr by a media server user, to approve or decline.                                                                                                                                             |
| **Watchlist**       | A list of TMDB titles to keep in mind, shared by the install, with notes.                                                                                                                                                        |
| **Health**          | Whether each service and instance is reachable, checked continuously.                                                                                                                                                            |

## Supported services

| Family            | Services                                                              | Role in Hubarr                                                           |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Libraries         | **Radarr**, **Sonarr** (multi-instance)                               | Movies and shows: browse, add, monitor, search, manage files, administer |
| Indexers          | **Prowlarr**                                                          | Indexers, manual search, applications, system                            |
| Subtitles         | **Bazarr**                                                            | Missing subtitles, manual and automatic search, history                  |
| Torrent downloads | **qBittorrent**, **Transmission**, **Deluge**, plus **Gluetun** (VPN) | List, details, bulk actions, add, limits, VPN status                     |
| Usenet downloads  | **SABnzbd**, **NZBGet**                                               | Queue, history, pause and resume, speed limit, add NZB                   |
| Requests          | **Seerr** (Jellyseerr / Overseerr)                                    | Requests, users, settings                                                |
| Activity          | **Tautulli** (Plex), **Tracearr**, **Emby**                           | Active streams, history, statistics, charts                              |
| Metadata          | **TMDB**                                                              | Discover, details, trends, recommendations, watchlist                    |

## Modules

### Dashboard

Default home page. A banner (greeting, a featured title), counters, then independent sections: releases over the next 7 days, queues, pending requests, service health, playback activity, transfers, watchlist, trends, recently added. Each section loads on its own: a failing service does not prevent the others from showing. The administrator picks the order and visibility of sections. Details: [Dashboard](./dashboard.md).

### Movies and shows

For each Radarr or Sonarr instance: filterable, sortable library (grid, list, table), detailed page (files, history, cast, episodes by season for shows), interactive release search, bulk actions (monitoring, quality profile, tags, deletion), extra pages (queue, history, missing, cutoff unmet, blocklist, collections, calendar). An administrator can add a title from any screen (quick add). Full Radarr and Sonarr administration (profiles, custom formats, indexers, clients, lists, notifications, naming, tasks, logs, backups…) is built in: see [Radarr/Sonarr administration](./arr-administration.md).

### Downloads

One view for the three torrent clients and one for the two Usenet clients: counters by state, speeds, server-side paginated and filtered list, multi-select, bulk actions, detail sheet (files, trackers, peers), add by link or file, speed limits. A torrent linked to a movie or show links to its page. The VPN card (Gluetun) shows the public IP and forwarded port.

### Indexers and subtitles

Prowlarr: indexer list with statistics, tests, bulk actions, manual search and grab, applications and settings. Bazarr: missing subtitles, search by provider, download, history.

### Requests

Seerr: request list with approve, decline, retry and delete; user management (permissions, quotas, import); service settings.

### Activity

Tautulli, Tracearr and Emby: active streams (quality, transcoding, bandwidth), history, statistics per user and per library, charts.

### Discover, calendar and search

- **Discover** (TMDB): themed sections, filters, details, collections, people, and for each title its state in your libraries. Shared **watchlist** with notes.
- **Calendar**: movie releases and episode air dates from every instance, month, week and list views, and an iCal feed to import into a calendar.
- **Global search** (`Ctrl+K`): your libraries first, then TMDB, with search history.

### Settings

Administrator only: service connection and testing, Radarr/Sonarr instances, display preferences (home page, formats, time zone), theme (17 palettes, accent, light or dark), dashboard layout, service languages, configuration export and import. Details: [Settings](./settings.md).

## Typical journeys

**Adding a requested movie.** A request arrives in Seerr → it shows in the dashboard's _Pending requests_ → the administrator approves it → Seerr hands it to Radarr → the download appears in the _queue_ and in the client view → once imported, the movie joins _Recently added_ and the library.

**Replacing a bad release.** Movie page → _Interactive search_ → pick a release (quality, size, indexer, score) → _Grab_ → follow it in the queue; the old release can be blocklisted.

**Diagnosing an outage.** The health icon turns orange → the menu names the unreachable service → its page shows a banner with the cause (timeout, credentials refused…) and a _Retry_ button; the connection test in settings gives the full diagnosis.

## Business rules

- **Setup**: until the wizard is complete, every page leads to it. It creates the first administrator and then closes for good.
- **Login**: 5 failures in 15 minutes block login for that account and IP address until the window ends. A session lasts 7 days after the last visit.
- **Password**: at least 8 characters. No e-mail reset: a command-line tool handles it and closes all of the account's sessions.
- **Secrets**: a saved API key or password is never sent back to the browser; a field left empty keeps the existing value.
- **Service addresses**: schemes other than `http`/`https` and link-local addresses (cloud metadata) are refused; local network addresses are accepted.
- **Unavailable services**: an unconfigured or disabled service disappears from the menu and its page points to settings; an unreachable service shows a banner without blocking the rest of the app.
- **Mutations**: any action that changes state (add, delete, approve…) requires a valid session and an anti-CSRF token.
- **Data**: Hubarr only stores its own configuration, accounts and the watchlist. Libraries, queues and history stay in the services and are read (with a short cache) on each visit.

## Languages, themes and accessibility

The interface is available in **French** and **English**. The theme is dark by default, with 17 palettes, an accent color and a light mode; each service has its own accent color in its screens. The interface can be used with the keyboard and follows recommended contrast ratios.

## Origin

Hubarr is inspired by [Prismarr](https://github.com/Shoshuo/Prismarr), from which it reuses and adapts some elements. It is released under the AGPL-3.0-or-later license; see the repository's `NOTICE.md`.
