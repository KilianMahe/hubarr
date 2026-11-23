# First start

On first launch, Hubarr opens its setup wizard: until it is finished, every page leads back to it.

## 1. Language

Pick the interface language (French or English). It becomes the instance's default language.

## 2. Administrator account

Enter an e-mail address, an optional display name and a password of at least 8 characters, typed twice. The account is created and you are signed in right away.

The wizard closes as soon as this account exists: it cannot be reopened.

## 3. Services

All that is left is to connect your services (Radarr, Sonarr, qBittorrent…) from the [settings](./settings.md). Each service is tested before it is saved.

## On mobile

The interface adapts to narrow screens:

- **Bottom bar**: in each service with several pages (Radarr, Sonarr, Prowlarr, Bazarr, Seerr, SABnzbd, NZBGet), its main pages, with the main action button in the middle (add a movie, a series, an indexer, an NZB). Torrent clients have a floating add button.
- **Server tab** (Radarr, Sonarr): service version, other instance pages and commands. Service configuration opens from **Settings → Services**.
- **Top bar**: the menu, then the page search (libraries) or the service counters (Server tab).
- **Long press** on a movie, a series or a torrent: it is selected; the top bar shows how many items are selected, "select all" and a way out of the selection, while the actions stay at the bottom. A short tap then adds or removes an item.
- **Pull down** at the top of a library or download list to refresh it.
- **Movie or series page**: the lightning button gathers the searches, refresh and edit actions.
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
