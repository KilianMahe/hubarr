# Connect Tracearr

[Tracearr](https://github.com/connorgallopo/Tracearr) tracks the activity of your Plex, Jellyfin or Emby servers. Hubarr shows its current streams, statistics, charts, history and users. The page is open to every Hubarr user.

## Configure the service

1. In Tracearr, create a **public API key** (it starts with `trr_pub_`).
2. In Hubarr, open **Settings → Services → Tracearr**, enter the **URL** (for example `http://tracearr:3000`) and the key.
3. **Test** checks the connection; save.

## The page

One tab per part, at the top on a computer and in the bottom bar on mobile: **Summary** (`/tracearr`: counters, current streams as lines, last five plays), **Now playing**, **Statistics**, **History** and **Users**.

- **Now playing**: one card per stream, with the server name, refreshed every 10 seconds. Tapping a stream opens its details: media, user and server, player and device, network, quality, stream decision and codecs per track, dynamic range, bitrate and progress; **Open the title** opens its preview when Tracearr knows it.
- **Statistics**: plays and hours watched today, active users, plays over 30 days, users, violations over 7 days.
- **Charts** per period (7 days, 30 days, 1 year): plays over time, by hour, by day, by platform, concurrent streams, and the Direct Play / Direct Stream / transcode split.
- **History**: 24 plays, then **Load more**.
- **Users**: one card per user (initials, server, plays, last activity, trust score as a coloured bar), most recently active first, with a name search beyond six users. Tapping a card opens their **profile**: plays, hours watched, movies and episodes, last activity, platforms, most watched titles and their last 50 plays. Tracearr's public API has no per-user history, so these figures cover the server's last 500 plays (the profile says so when the history is longer). The profile address is a Hubarr token, renewed on every restart: the user's Tracearr id is never sent to the browser.

Hubarr uses Tracearr's v2 API when available and falls back to v1 otherwise.

## Activity source

If both Tautulli and Tracearr are configured, **Settings → Display → Activity source** picks the one feeding the activity widget; an unavailable service gives way to the other.
