# Connect qBittorrent

Hubarr drives [qBittorrent](https://www.qbittorrent.org) (4.x and 5.x): live torrent list, single and bulk actions, adding links and `.torrent` files, speed limits and a VPN card with [Gluetun](./gluetun). These screens are reserved for administrators.

## Configure the service

1. In qBittorrent, enable the **Web UI** (_Tools → Options → Web UI_) and note the username and password.
2. In Hubarr, open **Settings → Services → qBittorrent**, enter the **URL** (for example `http://qbittorrent:8080`), the username and the password.
3. **Test** checks the connection; save.

Behind a proxy that authenticates instead of qBittorrent (or with "Bypass authentication for clients on localhost/whitelisted subnets"), leave the username **or** the password empty: Hubarr then opens no session.

## The page

- **Header**: download and upload speeds, a **Limit** button (alternative speed limits), then free space, ratio and current session (volumes, duration); on large screens, all-time totals and session peaks.
- **Filters**: states with their torrent count (chips on mobile, a left panel on large screens, with categories and tags).
- **List**: refreshed every 3 seconds, sorted, filtered (state, category, tag, search) and paginated. Three views, in the **Display** menu as in Radarr and Sonarr: list, table (default, on computer and mobile, where it keeps the name, with size and speeds below, progress and actions), compact. The page opens on the view and the state filter chosen in your **profile** (by default, table and all torrents), for qBittorrent, Transmission and Deluge alike; a view or filter picked on the page only lasts for the current visit. Sort and page size are remembered on the device.
- **Category badge**: a Radarr category (`movies`, `films`, `radarr`) or Sonarr category (`tv`, `series`, `sonarr`…) is clickable and opens the matching movie or series in Hubarr, across all instances.
- **Selection**: checkboxes (Shift+click for a range), then resume, pause, recheck, change category or delete (with or without files).
- **Torrent details**: properties, files (editable priority), trackers and peers; pause or resume, recheck, reannounce, delete. The **More actions** panel offers force start, sequential download, first and last pieces first, rename, category and per-torrent speed limits.
- **Add**: magnet links or `.torrent` URLs (one per line), `.torrent` files by drag and drop, category, save path, start now or paused. Cloud metadata addresses are refused.
- **Speed limits**: global limits in MB/s (empty = unlimited) and the alternative speed limits toggle.

## Troubleshooting

- **"Unable to reach qBittorrent"**: the URL is not reachable from the Hubarr container, or the Web UI is disabled.
- **Credentials refused**: qBittorrent bans an address after several failures; check the credentials and wait for the ban to expire.
- **Action refused**: qBittorrent's message is shown as is.
