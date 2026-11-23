# Connect Tautulli

Hubarr shows your Plex server's activity through [Tautulli](https://tautulli.com): current streams, statistics, charts, history, libraries and users. The page is open to every Hubarr user.

## Configure the service

1. In Tautulli, copy the **API key** (_Settings → Web Interface → API_).
2. In Hubarr, open **Settings → Services → Tautulli**, enter the **URL** (for example `http://tautulli:8181`) and the API key.
3. **Test** checks the connection; save.

## The page

- **Now playing**: one card per stream (poster, title, user, player, state, Direct Play / Direct Stream / transcode, quality, codecs, bandwidth, progress), refreshed every 10 seconds; click to open the title's details (summary, genres, directors, cast, file details).
- **Filters**: period (7, 30 or 90 days), metric (play count or duration) and user; they apply to statistics and charts.
- **Statistics**: most watched and most popular movies and shows, most active users and platforms, most concurrent streams.
- **Charts**: plays over time (by media or stream type), by hour, by day of week, by platform, by source and stream resolution, by user, and concurrent streams.
- **History**: 25 plays, then **Load more**; **Libraries** and **Users**.

Posters go through Hubarr: your browser never contacts Tautulli or Plex directly.

## Troubleshooting

- **"Tautulli is unreachable"**: the URL is not reachable from the Hubarr container.
- **"Invalid Tautulli API key"**: copy Tautulli's API key again.
