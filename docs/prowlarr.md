# Connect Prowlarr

Hubarr drives [Prowlarr](https://prowlarr.com) (API v1): indexers, search across every indexer, synced applications, settings and system. These screens are for administrators.

## Configure the service

1. In Prowlarr, copy the **API key** (_Settings → General → Security_).
2. In Hubarr, open **Settings → Services → Prowlarr**, enter the **URL** as Hubarr reaches it (for example `http://prowlarr:9696`) and the API key.
3. **Test** checks the connection; save.

::: tip Network access
Hubarr calls Prowlarr from its own container: `localhost` is Hubarr itself. Use the Docker service name or the host address.
:::

## Indexers

The **Prowlarr** page shows the counters (indexers, enabled, failing, torrent, usenet, applications), the issues reported by Prowlarr and the indexer list: protocol, privacy, priority, RSS and search, categories, queries, grabs, failures, health and date added. A filter narrows the list to enabled, disabled, torrent or usenet indexers.

- **Add**: pick a definition from the catalogue (accent-insensitive search, filters by protocol, privacy, language and category), then fill in the name, application profile, priority, redirect, tags (created on the fly) and the indexer's own fields. **Test** before adding.
- **Indexer row**: edit, test, enable or disable, delete. The name opens its **details**: description, search capabilities, categories and recent history.
- **Test all**: every enabled indexer is tested; failing ones are named with their reason.
- **Sync apps**: pushes indexers to Radarr, Sonarr… and follows the command to completion.
- **Selection**: tick indexers to enable, disable, change their profile, priority or tags, or delete them at once.

Indexer passwords and keys are never sent to the browser: a secret field shows `********` and keeps its value unless you change it.

## Search

The **Search** card queries every enabled indexer (or just one) from two characters. Results (title, indexer, size, seeds, age) sort by column; the title links to the indexer's page when it provides one. **Grab** sends the release to the indexer's download client.

## Settings and system

These pages open from **Settings → Services → Prowlarr**, **Settings** button (group tabs, then page tabs); a **Back to settings** button leads back. The settings hold:

| Page             | Content                                                       |
| ---------------- | ------------------------------------------------------------- |
| Applications     | Synced applications (sync level) and sync profiles            |
| Download clients | Clients Prowlarr uses for its own grabs                       |
| Notifications    | Notifications (grab, health, update)                          |
| Tags             | Tags and their usage; a tag in use cannot be deleted          |
| General          | Host, security, proxy, logging (the API key is not displayed) |
| UI               | Date and time formats, theme, Prowlarr interface language     |

The **System** group shows status and health, scheduled tasks (run on demand), backups (create, delete), updates (in a container, update the image) and logs (level, search). The **History** tab lists queries, RSS and grabs, paged or since a date.

## Troubleshooting

- **"Prowlarr is not responding"**: the URL is unreachable from the Hubarr container, or Prowlarr is stopped. **Retry** checks again.
- **Add refused**: Prowlarr's message is shown as is (invalid address, rejected credentials…).
- **Search too long**: Prowlarr queries each indexer live; after 90 seconds Hubarr gives up and says so.
