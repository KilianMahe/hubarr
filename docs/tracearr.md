# Connect Tracearr

[Tracearr](https://github.com/connorgallopo/Tracearr) tracks the activity of your Plex, Jellyfin or Emby servers. Hubarr shows its current streams, statistics, charts, history and users. The page is open to every Hubarr user.

## Configure the service

1. In Tracearr, create a **public API key** (it starts with `trr_pub_`).
2. In Hubarr, open **Settings → Services → Tracearr**, enter the **URL** (for example `http://tracearr:3000`) and the key.
3. **Test** checks the connection; save.

## The page

One tab per part, at the top on a computer and in the bottom bar on mobile: **Summary** (`/tracearr`: counters, current streams as lines, last five plays), **Now playing**, **Statistics**, **History** and **Users**.

- **Now playing**: one card per stream, with the server name, refreshed every 10 seconds. Tapping a stream opens its details: media, user and server, player and device, network, quality, stream decision and codecs per track, dynamic range, bitrate and progress; **Open the title** opens its preview when Tracearr knows it. Administrators also get **Stop playback**: after confirmation, Tracearr ends the stream and can show the viewer an optional message (up to 200 characters).
- **Statistics**: plays and hours watched today, active users, plays over 30 days, users, violations over 7 days.
- **Charts** per period (7 days, 30 days, 1 year): plays over time, by hour, by day, by platform, concurrent streams, and the Direct Play / Direct Stream / transcode split.
- **History**: 24 plays, then **Load more**.
- **Users**: one card per user (initials, server, plays, last activity, trust score as a coloured bar), most recently active first, with a name search beyond six users. Tapping a card opens their **profile**: plays, hours watched, movies and episodes, last activity, platforms, most watched titles and their last 50 plays. Tracearr's public API has no per-user history, so these figures cover the server's last 500 plays (the profile says so when the history is longer). The profile address is a Hubarr token, renewed on every restart: the user's Tracearr id is never sent to the browser.

Hubarr uses Tracearr's v2 API when available and falls back to v1 otherwise.

## Watched

Hubarr can mark the movies and episodes you have watched, as recorded by Tracearr.

1. Open your **Profile** (menu under your avatar). The **Tracearr** card lists the Tracearr accounts: pick yours. The card only appears when Tracearr is configured.
2. Hubarr imports your plays in the background (the card shows "Importing plays…", then the date of the last sync and the number of plays), then updates them every 15 minutes.
3. Then:
   - a **Watched** badge marks the movies you have watched, on their page and in the Radarr library (cards and list);
   - series show the number of episodes watched, for example **3/10 watched**, on their page and in the Sonarr library; each season shows its count and each episode watched is marked **Watched**;
   - on the dashboard, **Trending this week** and **Recently added to your library** carry the same badges (for a trending series, the number of episodes watched);
   - Discover shows a **Because you watched** row, recommended from your latest plays (see [Discover](./discover.md#home-and-search)).

Only plays that Tracearr considers complete count. Specials are left out of a series' count. Each Hubarr account picks its own Tracearr account; choosing **None** (the cross of the field) unlinks it and forgets the imported plays.

Administrators find a **Resynchronize** button on the card, which reimports the whole history of the linked accounts (useful after a library change in Tracearr).

This feature needs Tracearr's **v2 API**: only its history carries the TMDB ids of movies and filters plays by user. With an older Tracearr, the card says so. Movies are matched by TMDB id, series by TVDB id (Sonarr's) or TMDB id. Plays are stored in Hubarr's database (`tracearr_watch` table); the Tracearr id of your account is never sent to the browser.

## Activity source

If both Tautulli and Tracearr are configured, **Settings → Display → Activity source** picks the one feeding the activity widget; an unavailable service gives way to the other.
