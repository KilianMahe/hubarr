# Settings

The **Settings** page (`/admin/settings`, from the account menu or the bottom of the side menu) is for administrators only. It has five tabs, each with its own address (`#section-services`, `#section-display`…), handy as a bookmark.

## External services

Services are grouped by category: media (TMDb, Radarr, Sonarr), indexers and requests (Prowlarr, Seerr), downloads (qBittorrent, Deluge, Transmission, SABnzbd, NZBGet, Gluetun) and monitoring (Tautulli, Tracearr, Emby, Bazarr). Connected services come first, expanded.

For each service:

- **URL** and **credentials** (API key, or username and password). A saved key or password is never shown again: leave the field empty to keep it, type a new value to replace it.
- **Test** checks the connection with the values you typed, even before saving. A failure tells you why: unreachable service, rejected credentials, access denied (403), wrong URL (404), service error, or host rejected by SABnzbd (`host_whitelist`).
- **Clear** (username and password of qBittorrent, Deluge, Transmission, NZBGet) explicitly empties the credential, useful when a proxy authenticates on the service's behalf.
- **Enabled** turns a service off without losing its configuration: Hubarr stops querying it and treats it as not configured.
- **Menu** shows or hides it in the side menu.
- **Remove** erases its whole configuration, secrets included.

`file://`, `gopher://`… URLs and link-local addresses (`169.254.x.x`, cloud metadata) are rejected. Addresses on your local network (`192.168.x.x`, `10.x.x.x`) are accepted.

### Service administration

The Prowlarr and Seerr cards have a **Settings** button next to **Save**; for Radarr and Sonarr, it is the cog icon next to each enabled instance's test button. It opens a page dedicated to the service's settings in Hubarr, with two rows of tabs: the **groups** (configuration, system…), then the group's **pages** (profiles, indexers, clients, notifications, general, status, tasks, logs, backups, updates…). Each page keeps its address and offers a **Back to settings** button.

### Several Radarr or Sonarr instances

Radarr and Sonarr accept several instances (for example "Radarr" and "Radarr 4K"):

- the first instance becomes the **default instance**; you can pick another one;
- the **URL identifier** (slug), derived from the name, shows in addresses (`/medias/radarr-4k/films`): changing it breaks bookmarks;
- a **disabled** instance leaves the menu; disabling or deleting the last enabled instance hides the service;
- the **default quality profile** is preselected for quick adds.

## Service health

The health icon in the top bar sums up the configured services (green: everything answers; orange: some do; red: none) and lists every service and instance. A coloured dot also follows each side menu entry. Health is checked every minute; a service seen unreachable is not queried again for 10 seconds.

When a service does not answer, its page shows a banner with the reason; **Retry** checks again right away. The page of a service that is not configured leads to these settings, the page of a disabled service to the home page.

## Display

- **Home page**: dashboard, search (TMDb), movies, series, qBittorrent or last visited page. If the chosen page is unavailable, Hubarr opens the first configured service.
- **Notifications**: when disabled, only errors are still shown.
- **Time zone**, **date and time formats**; the system time zone (`TZ`) by default.
- **Theme** (classic with a light/dark toggle, or one of 17 presets) and **accent colour**: applied as soon as you save.
- **Refresh rate** of qBittorrent, Deluge and Transmission, **live activity source**, **density** and **items per page**.
- **Side menu visibility** of each service and of the calendar.
- **Dashboard layout**: order (Move up/Move down buttons) and visible sections.

::: tip Refresh rate and real time
A torrent client's refresh rate drives the global watch on media pages: number of active downloads in the side menu and a notification when a download finishes (or fails), once across all tabs. `0` turns it off. Screens update through a real-time stream: Hubarr queries each service once per interval however many tabs are open, and falls back to periodic polling on its own when the stream is cut (proxy, network).
:::

**Reset** restores every preference and the dashboard layout to their defaults.

## Languages

Hubarr's interface language and TMDb metadata language, then the interface language of each connected service: Radarr (interface and movie info, per instance), Sonarr (interface, per instance), Prowlarr and Seerr. An unreachable service is flagged; the others are saved anyway.

## Backup

- **Export** downloads a JSON file with the preferences, the layout, side menu visibility, service URLs and usernames, and the Radarr/Sonarr instances. **No API key and no password** is included.
- **Import** reads such a file back (64 KB at most). Importing adds or updates, never deletes; an existing instance or service keeps its secrets, unless the file changes its scheme, host or port: its API key and password are then cleared, so that a tampered file cannot send them to another server. Type the keys and passwords again afterwards.

Prismarr exports are not accepted: a Hubarr install starts from scratch.

## About

Hubarr version, Node.js version, database location and size, server time, and links to the source code and to this documentation.
