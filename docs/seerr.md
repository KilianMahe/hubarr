# Connect Seerr

Hubarr administers [Seerr](https://github.com/Fallenbagel/jellyseerr) (formerly Jellyseerr / Overseerr): user requests, accounts and permissions, settings, Radarr and Sonarr servers, jobs, cache and logs. These screens are reserved for administrators.

## Configure the service

1. In Seerr, copy the **API key** (_Settings → General → API Key_).
2. In Hubarr, open **Settings → Services → Seerr**, enter the **URL** (for example `http://seerr:5055`) and the key.
3. **Test** checks the connection; save.

## Requests

Most recent requests first. State filters with their counts, type (movies or shows) and sort (request or modification date), kept in the page address, plus a field that filters the page by title or requester. Each card shows the poster, title, type, status, requester and date; a pending request picks its **quality profile** and **root folder** right on the card, then can be **approved** or **declined**, an approved one **retried**, and any request **edited** (quality profile, root folder, Radarr or Sonarr tags, requester, seasons) or **deleted**.

## Users

List with search, role and request count; **Create user** (local), **Import from Jellyfin** (only accounts not imported yet are offered). A user's page gathers their settings (name, email, regions and languages, quotas), password (at least 8 characters), **permissions** (dependent permissions are greyed out as in Seerr; 4K ones only appear when a 4K server exists), notifications and requests. The owner account is never changed from Hubarr, and an administrator account cannot be deleted.

## Settings

Seerr's settings and system pages open from **Settings → Services → Seerr**, **Settings** button; a **Back to settings** button leads back, and two rows of tabs (settings, system, then their pages) switch between pages.

- **General** and **Default users**: application name and URL, regions and languages, filters, partial requests; login modes, default quotas and permissions.
- **Jellyfin**: read-only settings and **manual library scan**.
- **Services**: Radarr and Sonarr servers (add, test, edit, delete) and override rules.
- **Jobs & Cache**, **Logs**, **About**, **Updates** (release notes published on GitHub).

API keys (Seerr's, Jellyfin's and the Radarr/Sonarr servers') are never shown: the field displays `********`, and leaving it unchanged keeps the saved key.
