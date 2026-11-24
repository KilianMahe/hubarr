# First start

On first launch, Hubarr opens its setup wizard: until it is finished, every page leads back to it.

## 1. Language

Pick the interface language (French or English). It becomes the instance's default language.

## 2. Administrator account

Enter an e-mail address, an optional display name and a password of at least 8 characters, typed twice. The account is created and you are signed in right away.

The wizard closes as soon as this account exists: it cannot be reopened.

## 3. Services

All that is left is to connect your services (Radarr, Sonarr, qBittorrent…) from the [settings](./settings.md). Each service is tested before it is saved.

## Home

**Home**, at the top of the side menu, gathers three pages linked by tabs: **Dashboard**, **Discover** and **Calendar**. On a computer the tabs sit at the top of the page; on mobile they form the bottom bar. Each page keeps its address (`/tableau-de-bord`, `/decouverte`, `/calendrier`). Discover is shown when TMDB is configured, the calendar when Radarr or Sonarr is; both can be hidden in **Settings → Display**. The home page chosen in the settings (`/`, also opened by the logo) is unchanged.

## On mobile

The interface adapts to narrow screens:

- **Bottom bar**: on the Home pages, the Dashboard, Discover and Calendar tabs; in each service with several pages (Radarr, Sonarr, Prowlarr, Bazarr, Seerr, SABnzbd, NZBGet), its main pages, with the main action button in the middle (add a movie, a series, an indexer, an NZB). Torrent clients have a floating add button.
- **Settings**: on the **Settings** page, the bottom bar holds its five sections. On a service's settings pages, it holds the groups (profiles, integrations, general, system…): a tap on a group lists its pages. The top bar names the service and the page, for example "Sonarr · Tasks" or "Settings · Backup".
- **Server tab** (Radarr, Sonarr): service version, library counters, other instance pages and commands. Service configuration opens from **Settings → Services**.
- **Top bar**: the menu, the service and the page (for example "Radarr · Films"), then the magnifier: global search, or in a library its own search, which opens in the bar (the cross clears it).
- **Long press** on a movie, a series or a torrent: it is selected; the top bar shows how many items are selected, "select all" and a way out of the selection, while the actions stay at the bottom. A short tap then adds or removes an item.
- **Pull down** at the top of a library or download list to refresh it.
- **Movie or series page**: the searches and refresh stay on the page, under the monitoring button; the middle button of the bottom bar edits the movie, and on a series the lightning button gathers renaming, files and editing.
- Confirmation messages appear at the top of the screen.

## Signing in

The sign-in screen asks for the e-mail address and password. After **5 failures within 15 minutes**, sign-in is blocked for that account and IP address until the window ends.

"Remember me" keeps the session open for 7 days after your last visit, even after the browser is closed.

## Forgotten password

There is no reset by e-mail. From the machine that hosts Hubarr:

```sh
docker exec -it hubarr hubarr user:reset-password admin@example.com
```

The command asks for the new password twice, without echoing it, then closes every session of the account.
