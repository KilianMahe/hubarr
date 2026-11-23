# Radarr and Sonarr administration

Hubarr exposes the settings of your [Radarr](https://radarr.video) and [Sonarr](https://sonarr.tv) instances: quality profiles, indexers, download clients, naming, backups… The same screens serve both services, with each one's specifics. They are reserved to administrators.

## Opening the settings

An instance's configuration and system pages open from **Settings → Services**, with the instance's **Settings** icon (cog) in the Radarr or Sonarr card. Each page keeps its address (`/medias/<slug>/radarr/qualite`…) and shows a **Back to settings** button, then two rows of tabs: the groups below, then the group's pages. Day-to-day pages (commands, Sonarr calendar, library import, suggestions, exclusions) stay in the instance navigation: **More** menu on a computer, **Server** tab on mobile. Pages are grouped as in Radarr and Sonarr:

| Group        | Pages                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| Activity     | Commands; Calendar (Sonarr)                                                                  |
| Wanted       | Library import                                                                               |
| Discovery    | Suggestions (Radarr), Exclusions                                                             |
| Profiles     | Quality, Delay profiles, Custom formats, Custom filters                                      |
| Integrations | Indexers, Download clients, Import lists, Notifications                                      |
| General      | Auto-tags, Tags, Rename (Radarr), Media management, UI, Root folders, Remote paths, Metadata |
| System       | General (host), Tasks, Logs, Stats, Parse a title, Backups, Updates                          |

Every page keeps the original address: `/medias/<slug>/radarr/qualite`, `/medias/<slug>/sonarr/indexeurs`…

## Indexers, clients, lists, notifications, metadata

These items are described by the instance itself: the form shows the fields Radarr or Sonarr declares for each type.

1. **Add** opens the form; pick the **type** (Newznab, Torznab, qBittorrent, Discord…). The name is prefilled with the type.
2. Fill in the fields. Category lists offer the standard Newznab categories; free lists are edited like tags.
3. Family options appear above the fields: RSS, searches and priority of an indexer; enabled state and priority of a client; profile and root folder of a list; **triggers** of a notification (those the type supports).
4. **Test** asks the instance to check the configuration and shows its answer; **Save** creates or updates the item.

**Metadata** consumers are not created: you enable, disable or edit them.

::: info Passwords and API keys
Hubarr never displays a saved password or API key: the field shows `********`. Left untouched, it keeps the current value when saving; type a new value to replace it. The instance's own API key (**General** page) is neither shown nor editable from Hubarr.
:::

## Profiles

- **Quality**: profiles (name, upgrades, language for Radarr, minimum and cutoff custom format scores, score of each format, allowed qualities ordered by drag and drop or arrows, cutoff among the allowed qualities) and **definitions** (title, minimum, preferred and maximum sizes in GiB per hour, with the size of a 60, 90 and 120 minute movie), saved together.
- **Delay profiles**: protocols, Usenet and torrent delays, bypass; tags are picked by name. The default profile cannot be deleted.
- **Custom formats** and **auto-tags**: conditions picked among the instance's types (release title, size, genre…), with negate and required.
- **Custom filters**: filters of the instance's interface, conditions as JSON.

## Configuration

- **Media management**: naming (formats, colon replacement, multi-episode style for Sonarr) with **Preview**, which computes examples from the formats being edited, before saving; file management (empty folders, hardlinks, extra files, propers, file date, recycle bin, permissions).
- **UI**: dates, times, theme, instance languages.
- **General**: host, security, proxy, logging, updates, backups; indexer, client and list settings shown read-only.
- **Root folders**, **remote paths** and **tags** (with the number of items using each tag; a tag in use cannot be deleted).

## System

| Page                 | Content                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Commands             | Recent commands, refreshed every 5 s; cancel a queued or running command              |
| Tasks                | Scheduled tasks, last and next run; run now                                           |
| Logs                 | Log files, recent lines per page, level filter, search                                |
| Stats                | Library counters, disks, breakdown by quality, genre, decade or network               |
| Parse a title        | The instance's analysis of a release name and the matching movie or series            |
| Backups              | Creation followed until done, restore (the instance restarts), deletion               |
| Updates              | Installed and available versions; in a container, updates go through the Docker image |
| Library import       | Scan a folder, automatic lookup of each sub-folder, import of the checked rows        |
| Suggestions (Radarr) | Movies suggested by import lists, one-click add                                       |
| Rename (Radarr)      | Rename proposals for a movie and renaming                                             |
| Calendar (Sonarr)    | Episodes of the next 30 days                                                          |

Log files and backups cannot be downloaded from Hubarr.

## Troubleshooting

- **"Unable to reach Radarr/Sonarr"**: the instance is stopped or unreachable from the Hubarr container (see [Connect Radarr](./radarr.md)).
- **Save refused**: the instance's message is shown as is (missing field, connection failed…).
- **Test failed**: the instance's answer names the faulty field; fix it and test again before saving.
