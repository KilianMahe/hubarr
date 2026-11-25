# Discover and watchlist

Discover (`/decouverte`, the **Discover** tab of [**Home**](./first-start.md#home)) browses the [TMDB](https://www.themoviedb.org/) catalog and shows, on every poster, whether the title is already in one of your libraries (available, missing, announced, partial, not monitored).

## Configure TMDB

1. Create a free API key on [themoviedb.org](https://www.themoviedb.org/settings/api).
2. In Hubarr, open **Settings → Services → TMDb**, paste the key, **Test**, then save.
3. The language of titles and overviews is set in **Settings → Languages**.

## Home and search

Under the search field, four chips split the Discover home; only the rows of the chip shown are loaded. The chip is kept in the address (`/decouverte?onglet=tendances`), so it can be bookmarked and survives a reload. Without one, **For you** opens, or **Trending** when For you has nothing to show yet.

- **For you**:
  - **From your library**: recommendations based on your latest additions.
  - **Because you watched**: recommendations from the titles you watched last, when your account is linked to Tracearr (see [Tracearr](./tracearr.md#watched)). Titles you have already watched are left out; those in a library stay, marked, since owning a title does not mean having watched it.
  - **For “folder”**: one row per root folder of each Radarr and Sonarr instance, for example **For “Kids”**, subtitled with the instance (“Movies folder”). It gathers the TMDB recommendations of the titles last added to that folder (up to 20), ranks first those recommended by several of them, and leaves out titles already in a library. The rows are computed in the background and refreshed every 6 hours; a title you add disappears from them at once.
  - **Recently viewed** (kept in the browser).
- **Trending**: movie and TV show of the week, trending this week, popular movies and TV shows, upcoming theatrical releases, TV shows currently airing.
- **Top rated**: top-rated movies and TV shows.
- **By year**: **Popular in [year]**, the most popular movies or TV shows of a year, chosen in the row's selector (current year by default), with titles already in a library marked.

While you search, the results replace the chips.

Rows have no scroll bar: arrows at their edges move them, on a computer as on mobile, and each arrow disappears at the end of the row; on a touch screen, a row can also be swiped.

- **Search** (press `/`) ranks results by relevance: exact title, title starting with the query, popularity; a typed year ("dune 1984") picks the right version. It fixes typos ("interstelar" → _Interstellar_) and offers "Did you mean…" when little is found; **Search instead** goes back to the exact query. A well-known person comes first when you type their name.
- Filters: type (all, movies, TV shows or **Anime**), genre, minimum rating, sort and **Hide what I have**. Without text, filters browse the catalog ("Load more").

## Title page

A poster opens the title page: overview, cast, crew, seasons, streaming providers, rating, reviews, gallery and similar titles. Its address (`/decouverte?detail=movie/603`) can be shared. The trailer opens on YouTube.

## Quick add

Admins add a title to Radarr or Sonarr from a poster, a title page, a quick look or the global search: target instance (those that already have it are flagged), quality profile (the instance's one is preselected), root folder, then minimum availability and auto-search (movie), or series type, monitored episodes, season folders and missing search (TV show).

## Explorer

TMDB has no anime type: Hubarr treats as anime the titles of the Animation genre whose original language is Japanese, as when it sets a series' type to anime before adding it to Sonarr.

`/decouverte/explorer` (the **Explorer** tab of Home) filters TMDB by type (movies, TV shows, or **Anime** with a TV shows / movies choice), genres, decade or a precise **year** (picking one clears the other) and sort (popular, top rated, newest, box office), and finds a **collection** or an **actor** to list all their titles.

## Watchlist

A poster's star adds the title to the **watchlist**, shared by all users. The `/decouverte/watchlist` page (the **Watchlist** tab of Home) filters it (movies, TV shows, text), sorts it, lets you add a note and remove a title.

## Global search

For admins, the top bar field (`Ctrl+K`, full screen on mobile) searches all your libraries then online through Radarr and Sonarr, with the subtitle status when Bazarr is linked. A result opens its quick look; a missing title is added in two clicks. Recent searches are kept in the browser.
