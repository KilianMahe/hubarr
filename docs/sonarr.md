# Connect Sonarr

Hubarr drives one or more [Sonarr](https://sonarr.tv) instances (v4, API v3): series library, series pages with seasons and episodes, searches, download queue and tracking pages. These screens are reserved for administrators.

## Add the instance

1. In Sonarr, copy the **API key** (_Settings → General → Security_).
2. In Hubarr, open **Settings → Services → Sonarr** and click **Add an instance**.
3. Enter a **name** ("Sonarr", "Anime"…), the **URL** as Hubarr reaches it (for example `http://sonarr:8989` when both containers share a Docker network) and the API key.
4. **Test** checks the connection; save.
5. Optional: pick the **default quality profile**, offered whenever you add a series.

The instance URL identifier (slug) appears in addresses: `/medias/<slug>/series`. With several instances, each one gets its own entry in the side menu.

::: tip Network access
Hubarr calls Sonarr from its own container: `localhost` means Hubarr itself. Use the Docker service name or the host machine address.
:::

## Library

The **Series** page shows statistics (total, continuing, ended, size), the **download queue**, the **upcoming episodes** of the next 14 days (collapsible card) and Sonarr warnings (health issues, blocked imports). Each warning can be closed with its cross: it stays hidden on this device as long as its text does not change.

- **Search and filters**: status (monitored, continuing, ended, anime, unmonitored, missing episodes), genre, network, sort (including progress). The criteria are kept in the page address.
- **Views**: grid, poster wall, detailed list, table or shelves (continuing, anime, ended, upcoming, unmonitored). A poster's dot shows its state: complete, up to date, missing episodes, upcoming or unmonitored; the bar shows episode progress. The **Display** menu (the same on computer and mobile) switches views; the choice is remembered on the device.
- **Bookmark** on a poster: monitor or unmonitor the series without opening it.
- **Add**: search a series by title. Each result offers **View** (its TMDB page, or its Hubarr page when the series is already in Sonarr) and **Add**, which opens the form, in two groups: **Library** (root folder, quality profile, type: standard, daily, anime) and **Monitoring** (episodes to monitor, season folders, search for missing episodes, tags). The result of the addition stays in view, with **View** to open the series page. **Back** returns to the results with your search kept; the cross closes the window. Before you type, the window suggests this week's trending series (when TMDB is configured): a click searches the title and opens its form. The **Add** button of a TMDB page opened with **View** also leads to the form.
- **Selection mode**: edit (monitoring, profile, type, root folder, season folders), tag, rename files or delete several series at once. On desktop, Shift+click selects a range.
- **Filter actions**: refresh the filtered series, or search the missing episodes of the filtered series.
- **Refresh all** and **RSS sync**, tracked until they finish.

### Upcoming episodes

The **Upcoming** tab (`/medias/<slug>/series/prochains`) lists the episodes of the next 14 days, one block per day (today, tomorrow, then the date): series, episode, air time and state (available, missing if already aired, upcoming). An episode opens its series page.

### Download queue

The queue has its own tab, **Queue** (`/medias/<slug>/series/file-attente`); it also stays at the top of the library, collapsed. In the tab, a series name opens its page, and each line offers **Refresh** (reload information) and **Scan** (analyse files on disk) for its series.

Each download shows the series and episode, its progress, its state and Sonarr's messages. You can **force the download** of a delayed item or **remove** it (it is also removed from the download client). When items are in warning, a banner offers to:

- **clean duplicates**: downloads whose files are all "already imported";
- **import the files** of the others: Sonarr matches each download's episodes, then Hubarr starts the import and reports the outcome (files imported, skipped and why).

## Series page

Clicking a series opens its **page**, at `/medias/<slug>/series/<id>` (older `?open=<id>` addresses still lead there). On a computer, a column on the left stays in view while you scroll: poster, status (episodes present, monitoring, airing status), actions and key figures (rating, seasons, size). On the right: title, network, genres, then cards (overview, seasons with downloaded episodes, size and missing count, suggestions, history); deleting is folded at the bottom. On mobile, the poster and title share the first row, followed by the status, actions and figures. Interactive search, renaming, files, edit and full history open in a panel, from the bottom on mobile.

- **Search missing**: monitored episodes already aired without a file; a season missing entirely is searched as a pack.
- **Seasons and episodes**: the latest season is open, and within each season the latest episode comes first. Each season shows its episodes present and progress, with monitoring and search at hand; interactive search, file management, renaming and history are in its **⋮** menu. Each episode's number takes the colour of its status: downloaded (green), missing (orange), upcoming (blue), not monitored (grey). For each episode: monitoring (Shift+click for a range), quality, score, technical details, search, interactive search and file deletion.
- **Interactive search** for an episode or a season: sortable releases, with the season or episodes they cover and the TVDB numbering when it differs.
- **Rename files**: current and new names, to tick.
- **Manage files**: season and episode (reassign a file), quality, languages, group, release type and indexer flags, editable row by row or for a selection.
- **Edit**: monitoring, new seasons, season folders, profile, type, path (with a browser of the Sonarr server folders) and tags.
- **History**, **refresh and scan**, **delete** (with or without files).
- **Recommendations** and **Similar** (when TMDB is configured): two rows of TMDB series, with those already in a library marked. A series you own opens its Hubarr page; another one opens its TMDB page, from which you can add it.

## Instance pages

On a computer, the tabs at the top of each page lead to the other pages. On mobile, the bottom bar gives access to **Series**, **Upcoming**, **Queue** and **Server** (missing, history, other pages and instance commands), with the **+** button in the middle to add a series.

| Page      | Content                                                                 |
| --------- | ----------------------------------------------------------------------- |
| History   | Sonarr events (grabbed, imported, deleted, renamed, failed)             |
| Blocklist | Blocked releases, single or bulk removal                                |
| Missing   | Monitored episodes without a file; search one by one or all missing     |
| Cutoff    | Episodes below their profile's quality cutoff, with the current quality |
| System    | Version, health, disk space, download clients, indexers, recent logs    |

History and blocklist show the most recent entries first; clicking a header (date, series, and for the blocklist source) sorts by that column, a second click reverses it, and the search field filters by series title. Cutoff can be filtered by series title and quality profile. These criteria stay in the page address.

## Troubleshooting

- **"Unable to reach Sonarr"**: the URL cannot be reached from the Hubarr container, or Sonarr is stopped. The page banner gives the cause; **Retry** runs the check again.
- **Add refused**: Sonarr's message is shown as is (series already added, folder not found…).
- **Import impossible**: the outcome lists Sonarr's reasons (episode not recognised, file already present…); rename the files and run the import again.
- **Large library**: the list is cached and refreshed in the background; a change made in Hubarr shows up immediately, a change made in Sonarr within a minute.

## Administration

The instance settings (quality, indexers, clients, naming, backups…) open from **Settings → Services → Sonarr**, instance **Settings** icon: see [Radarr and Sonarr administration](./arr-administration.md).
