# Discover and watchlist

Discover (`/decouverte`) browses the [TMDB](https://www.themoviedb.org/) catalog and shows, on every poster, whether the title is already in one of your libraries (available, missing, announced, partial, not monitored).

## Configure TMDB

1. Create a free API key on [themoviedb.org](https://www.themoviedb.org/settings/api).
2. In Hubarr, open **Settings → Services → TMDb**, paste the key, **Test**, then save.
3. The language of titles and overviews is set in **Settings → Languages**.

## Home and search

- Trending (movie and TV show of the week), **For you** (recommendations based on your latest additions), **Recently viewed** (kept in the browser) and TMDB lists: popular, upcoming, on the air, top rated.
- **Search** (press `/`) ranks results by relevance: exact title, title starting with the query, popularity; a typed year ("dune 1984") picks the right version. It fixes typos ("interstelar" → _Interstellar_) and offers "Did you mean…" when little is found; **Search instead** goes back to the exact query. A well-known person comes first when you type their name.
- Filters: type, genre, minimum rating, sort and **Hide what I have**. Without text, filters browse the catalog ("Load more").

## Title page

A poster opens the title page: overview, cast, crew, seasons, streaming providers, rating, reviews, gallery and similar titles. Its address (`/decouverte?detail=movie/603`) can be shared. The trailer opens on YouTube.

## Quick add

Admins add a title to Radarr or Sonarr from a poster, a title page, a quick look or the global search: target instance (those that already have it are flagged), quality profile (the instance's one is preselected), root folder, then minimum availability and auto-search (movie), or series type, monitored episodes, season folders and missing search (TV show).

## Explorer

`/decouverte/explorer` filters TMDB by type, genres, decade and sort (popular, top rated, newest, box office), and finds a **collection** or an **actor** to list all their titles.

## Watchlist

A poster's star adds the title to the **watchlist**, shared by all users. The `/decouverte/watchlist` page filters it (movies, TV shows, text), sorts it, lets you add a note and remove a title.

## Global search

For admins, the top bar field (`Ctrl+K`, full screen on mobile) searches all your libraries then online through Radarr and Sonarr, with the subtitle status when Bazarr is linked. A result opens its quick look; a missing title is added in two clicks. Recent searches are kept in the browser.
