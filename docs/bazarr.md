# Connect Bazarr

Hubarr drives [Bazarr](https://www.bazarr.media): missing subtitles for movies and episodes, provider search and download, automatic search, history, and subtitle badges in the Radarr and Sonarr libraries. These screens are for administrators.

## Configure the service

1. In Bazarr, copy the **API key** (_Settings → General → Security_).
2. In Hubarr, open **Settings → Services → Bazarr**, enter the **URL** (for example `http://bazarr:6767`) and the API key.
3. **Test** checks the connection; save.

## Pages

- **Wanted**: movies and episodes without subtitles, enabled providers, and the items missing the most subtitles, with **Automatic search**.
- **Movies** and **Series**: Bazarr's whole library, with title search, filters (complete, missing, not tracked), missing language and sort. A movie opens the **subtitle search**; a series opens its episode list.
- **Series episodes**: season, episode, title, audio languages and status; **Search** on an episode without subtitles.
- **History**: subtitles downloaded for movies and episodes.

The **subtitle search** lists provider results (language, hearing impaired, forced, score, release, uploader); **Download** installs the chosen one.

## Badges in the libraries

Posters in the Radarr and Sonarr libraries carry a badge: "Missing n" (a movie opens the subtitle search, a series leads to its episodes in Bazarr) or "Subtitles" when everything is there. A movie's details also show its present and missing languages.

Bazarr only knows one Radarr and one Sonarr instance: badges only show when a single instance of the service is enabled in Hubarr.

## Data loading

Hubarr caches Bazarr's data and refreshes it in the background, so badges and pages never slow down. Right after a start, the page says the data is loading and reloads by itself; if it does not arrive, **Retry** forces it. A subtitle downloaded from Hubarr shows at once; a change made in Bazarr appears within about a minute.

## Troubleshooting

- **"Bazarr is not responding"**: the URL is unreachable from the Hubarr container, or Bazarr is stopped.
- **No badge**: Bazarr does not track the item (no language profile), or several Radarr/Sonarr instances are enabled.
- **Download refused**: the provider refused (quota reached, expired result); search again.
