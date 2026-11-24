# Connect Radarr

Hubarr drives one or more [Radarr](https://radarr.video) instances (v4 or v5, API v3): movie library, movie pages, searches, download queue and tracking pages. These screens are for administrators only.

## Add the instance

1. In Radarr, copy the **API key** (_Settings → General → Security_).
2. In Hubarr, open **Settings → Services → Radarr** and click **Add an instance**.
3. Fill in a **name** ("Radarr", "Radarr 4K"…), the **URL** as Hubarr reaches it (for example `http://radarr:7878` when both containers share a Docker network) and the API key.
4. **Test** checks the connection; save.
5. Optional: choose the **default quality profile**, offered whenever you add a movie.

The instance URL identifier (slug) appears in addresses: `/medias/<slug>/films`. With several instances, each one has its own entry in the side menu.

::: tip Network access
Hubarr queries Radarr from its own container: `localhost` means Hubarr itself. Use the Docker service name or the host address. Addresses on your local network are accepted.
:::

## Library

The **Movies** page shows library statistics, the **download queue** (collapsible, refreshed every two seconds) and Radarr warnings (no active indexer, health issues, blocked imports). Each warning can be closed with its cross: it stays hidden on this device as long as its text does not change.

- **Search and filters**: status (monitored, downloaded, missing, unmonitored), quality, genre, language, sort. Criteria are kept in the page address: a bookmark brings back the same selection.
- **Views**: grid, poster wall, detailed list, table or shelves by status, picked from the **Display** menu (the same on computer and mobile). The choice is remembered on the device.
- **Bookmark** on a poster: monitor or unmonitor the movie without opening it.
- **Add**: search a movie by title. Each result offers **View** (its TMDB page, or its Hubarr page when the movie is already in Radarr) and **Add**, which opens the form: the movie at the top, then its settings in two groups, **Library** (root folder, quality profile) and **Monitoring** (automatic search). The result of the addition stays in view, with **View** to open the movie's page. **Back** returns to the results with your search kept; the cross closes the window. After adding, Hubarr follows Radarr's search for a minute. Before you type, the window suggests this week's trending movies (when TMDB is configured): a click searches the title and opens its form. The **Add** button of a TMDB page opened with **View** also leads to the form.
- **Selection mode**: edit (monitoring, profile, availability, root folder), tag, rename files or delete several movies at once. On desktop, Shift+click selects a range.
- **Filter actions**: refresh the filtered movies, or search the missing movies of the filter.
- **Refresh all** and **RSS sync**, followed until they finish.

### Download queue

The queue has its own tab, **Queue** (`/medias/<slug>/films/file-attente`); it also stays at the top of the library, collapsed. In the tab, a movie title opens its page, and each line offers **Refresh** and **Scan** for its movie.

Each download shows its progress, its state (downloading, import pending, import blocked…) and Radarr's messages. You can **force the import** of a blocked download, **force the download** of a delayed item or **remove** it (also removing it from the download client, or adding it to the blocklist). When a movie leaves the queue, the library is updated.

## Movie page

Clicking a movie opens its **page**. On a computer, a column on the left stays in view while you scroll: poster, status (downloaded, missing, not yet available, with monitoring, quality and size), actions and key figures (ratings, quality, size). On the right: title, runtime, genres and links, then cards (overview, file, details, history, cast, suggestions); deleting is folded at the bottom. On mobile, the poster and title share the first row, followed by the status, actions and figures. Its address, `/medias/<slug>/films/<id>`, can be shared or bookmarked; older `?open=<id>` addresses still lead there. Long sections (releases, edit, files, full history) open in a panel, from the bottom on mobile.

- **Search**: Radarr queries its indexers; when nothing is grabbed, Hubarr queries the indexers directly and downloads the best release accepted by the profile.
- **Interactive search**: every release found (up to 90 seconds), sortable, with the custom format score breakdown and rejection reasons; download the one you want.
- **Refresh and scan**, **monitor**, **remove from Radarr**, **delete the file** or **delete everything**.
- **Naming**: current name and the name Radarr expects, renamed in one click.
- **Edit**: monitoring, minimum availability, profile, path (with a browser of the Radarr server folders) and tags.
- **Manage files**: quality, languages and release group of each file.
- Cast and crew (bookmarking a person creates a Radarr import list that adds their movies), alternative titles, history and blocklist of the movie.
- **Recommendations** and **Similar** (when TMDB is configured): two rows of TMDB titles, with those already in a library marked. A movie you own opens its Hubarr page; another one opens its TMDB page, from which you can add it.

## Instance pages

On a computer, the tabs at the top of each page lead to the other pages. On mobile, the bottom bar gives access to **Movies**, **Missing**, **Queue** and **Server**; the latter gathers the history, the other pages and the instance commands (refresh all, RSS sync, search all missing). The central **+** button adds a movie from any page of the instance.

| Page        | Content                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| History     | Radarr events, filterable (grabbed, imported, failed, deleted, renamed)  |
| Blocklist   | Blocked releases, single or bulk removal                                 |
| Missing     | Monitored movies without a file; search one by one or all missing movies |
| Cutoff      | Movies below their profile cutoff; "Upgrade" starts a new search         |
| Collections | TMDb collections, monitoring, missing movies to add                      |
| System      | Version, health, disk space, download clients, indexers, recent logs     |

History and blocklist show the most recent entries first; clicking a header (date, movie, and for the blocklist source and indexer) sorts by that column, a second click reverses it, and the search field filters by movie title. Cutoff can be filtered by title and quality profile, collections by title and state (monitored, unmonitored, with missing movies). These criteria stay in the page address.

## Troubleshooting

- **"Unable to reach Radarr"**: the URL cannot be reached from the Hubarr container, or Radarr is stopped. The page banner gives the cause; **Retry** checks again.
- **Key rejected**: the connection test says so; copy the API key again.
- **Interactive search takes too long**: some indexers are slow; Hubarr gives up after 90 seconds and says so.
- **Large library**: the list is cached and refreshed in the background; a change made in Hubarr shows up at once, a change made in Radarr within a minute.

## Administration

The instance settings (quality, indexers, clients, naming, backups…) open from **Settings → Services → Radarr**, instance **Settings** icon: see [Radarr and Sonarr administration](./arr-administration.md).
