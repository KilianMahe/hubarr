# Dashboard

The dashboard gathers signals from all your services on one screen. It lives at `/tableau-de-bord`, in the first tab of [**Home**](./first-start.md#home), and is the default home page (change it in **Settings → Display**).

## Hero

At the top: greeting, day and time (display time zone), then a spotlight — a random movie from your Radarr library (with a backdrop) or, failing that, a trending TMDB title — and three counters: movies, TV shows and releases in the next 7 days.

## Sections

| Section            | Content                                                                                                                                                                                                                                  | Requires             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Upcoming releases  | 7-day grid (movies and episodes), 3 titles per day then a link to the calendar                                                                                                                                                           | Radarr or Sonarr     |
| Queues             | Radarr and Sonarr downloads of every instance, problems first, refreshed every 10 s; a download in progress or waiting for import opens the instance's queue, a blocked import its management (administrators), any other title its page | Radarr or Sonarr     |
| Downloaded per day | Data downloaded per day over the last 30 days, with total and daily average (administrators)                                                                                                                                             | A download client    |
| Disk space         | Usage of the disks holding the Radarr and Sonarr root folders, alert above 90 % (administrators)                                                                                                                                         | Radarr or Sonarr     |
| Pending requests   | The last 5 pending Seerr requests                                                                                                                                                                                                        | Seerr                |
| Services health    | One chip per Radarr/Sonarr instance and per configured service, refreshed every 30 s                                                                                                                                                     | —                    |
| Current activity   | Now playing and recently watched, refreshed every 10 s; a playback opens the same window as the Tracearr page (stream details, with **Stop playback** for administrators) or the Tautulli page (Plex metadata)                           | Tautulli or Tracearr |
| Emby activity      | Current Emby playback                                                                                                                                                                                                                    | Emby                 |
| Transmission       | Speeds, counters and active downloads                                                                                                                                                                                                    | Transmission         |
| My watchlist       | The last 16 watchlist titles                                                                                                                                                                                                             | TMDB                 |
| Trending           | Trending titles of the week                                                                                                                                                                                                              | TMDB                 |
| Recently added     | The last 16 titles added to your libraries                                                                                                                                                                                               | Radarr or Sonarr     |

Each section loads on its own: a slow or broken service never blocks the others, and a section whose service is not configured is not shown. Libraries are shared with the Movies and TV Shows pages, and expensive aggregates are kept for 45 seconds.

## Statistics

Two sections for administrators sum up downloads and storage. Their figures are read again at most every 5 minutes.

- **Downloaded per day** adds up the size of the downloads finished each day (display time zone) over the last 30 days, from every configured client: qBittorrent, Transmission and Deluge (finished torrents), SABnzbd and NZBGet (successful history entries). Hover a bar to see the day and its amount. Hubarr stores nothing: the chart is built from what the clients still list, so a torrent or history entry removed from its client no longer counts. A client that does not answer is named and left out of the total.
- **Disk space** shows one bar per disk holding a Radarr or Sonarr root folder, with free and total space and the folders it holds. A disk seen by several instances is shown once, even when mounted at different paths in their containers (recognized by the same size and free space). A disk used at more than 90 % is flagged **Almost full**.

## Blocked imports

In the **Queues** section, a download whose import is blocked, or that Radarr or Sonarr flag with a warning or an error, shows the reason under its title. Click it to open its management:

- **Reason**: the messages given by Radarr or Sonarr.
- **Downloaded files**: the files of the download, as Radarr or Sonarr read them, with the reasons they refuse to import each one. For each file you can fix the **movie** (Radarr) or the **series, season and episodes** (Sonarr), searched in the instance's library, as well as the **quality**, the **languages** and the **release group**. Files that were recognized and not refused are ticked; tick the others yourself to import them anyway.
- **Import** sends the ticked files to Radarr or Sonarr (manual import, in the instance's import mode: a torrent still seeding is copied or hard-linked, not moved). The window follows the import to its end, then the download leaves the queue.
- **Remove from queue** takes the download out of the queue, optionally removing it from the download client too and adding the release to the blocklist.

The same window opens from the **Queue** pages of [Radarr](./radarr#download-queue) and [Sonarr](./sonarr#download-queue), with the **Manage import** button of the line.

## Quick look

Clicking a poster opens a **quick look**: overview, genres, rating, library status, release dates, streaming providers and cast. The main button opens the title in Radarr or Sonarr when it is already there (exact instance), otherwise its Discover page; admins can also **add** it right away.

## Layout

Admins can **edit the layout**: drag a section by its handle (with the mouse or a finger) or use the Move up/down buttons to reorder, a switch to hide a section, then **Save**. The same setting is in **Settings → Display**. The hero always stays on top.

## Notification center

The bell in the top bar (also present in the service views' bar on mobile) keeps the latest 50 notifications, most recent first, with the number of unread ones on its badge. Torrent completions and errors only go there; action confirmations ("Saved"…) and errors also show a brief toast. Unread notifications are highlighted while the menu is open and marked as read when it closes. Each one can be removed, or the whole list cleared. The history is kept in the browser, per account, and shared between open tabs.

## Health menu

The heart icon in the top bar sums up the services' state: its dot is green when all of them respond, orange when only some do, red otherwise. The menu lists configured services only, one line per Radarr and Sonarr instance.
