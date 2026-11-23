# Dashboard

The dashboard gathers signals from all your services on one screen. It lives at `/tableau-de-bord` and is the default home page (change it in **Settings → Display**).

## Hero

At the top: greeting, day and time (display time zone), then a spotlight — a random movie from your Radarr library (with a backdrop) or, failing that, a trending TMDB title — and three counters: movies, TV shows and releases in the next 7 days.

## Sections

| Section           | Content                                                                                                                      | Requires             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Upcoming releases | 7-day grid (movies and episodes), 3 titles per day then a link to the calendar                                               | Radarr or Sonarr     |
| Queues            | Radarr and Sonarr downloads of every instance, problems first, refreshed every 10 s; a title opens its page (administrators) | Radarr or Sonarr     |
| Pending requests  | The last 5 pending Seerr requests                                                                                            | Seerr                |
| Services health   | One chip per Radarr/Sonarr instance and per configured service, refreshed every 30 s                                         | —                    |
| Current activity  | Now playing and recently watched, refreshed every 10 s                                                                       | Tautulli or Tracearr |
| Emby activity     | Current Emby playback                                                                                                        | Emby                 |
| Transmission      | Speeds, counters and active downloads                                                                                        | Transmission         |
| My watchlist      | The last 16 watchlist titles                                                                                                 | TMDB                 |
| Trending          | Trending titles of the week                                                                                                  | TMDB                 |
| Recently added    | The last 16 titles added to your libraries                                                                                   | Radarr or Sonarr     |

Each section loads on its own: a slow or broken service never blocks the others, and a section whose service is not configured is not shown. Libraries are shared with the Movies and TV Shows pages, and expensive aggregates are kept for 45 seconds.

## Quick look

Clicking a poster opens a **quick look**: overview, genres, rating, library status, release dates, streaming providers and cast. The main button opens the title in Radarr or Sonarr when it is already there (exact instance), otherwise its Discover page; admins can also **add** it right away.

## Layout

Admins can **edit the layout**: drag and drop or Move up/down buttons to reorder, a switch to hide a section, then **Save**. The same setting is in **Settings → Display**. The hero always stays on top.

## Health menu

The heart icon in the top bar sums up the services' state: its dot is green when all of them respond, orange when only some do, red otherwise. The menu lists configured services only, one line per Radarr and Sonarr instance.
