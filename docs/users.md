# Users and access

Hubarr can be shared: the administrator creates accounts and decides, service by service, what each person may do. Accounts are managed in **Settings → Users** (`/admin/settings#section-users`).

## Roles

| Role              | What they can do                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrator** | Everything, on every service, plus Hubarr's settings (services, instances, users, display, backup, logs)                                     |
| **User**          | Only the services the administrator opens to them, read-only or read and write. The dashboard, calendar, search and discover show only those |

The setup wizard creates the first administrator. Hubarr always keeps at least one: an administrator cannot delete their own account or remove their own administrator role.

## Create an account

1. Open **Settings → Users** and select **Add a user**.
2. Enter the e-mail address, an optional display name and a **temporary password** (at least 8 characters).
3. Choose the role. For a **User**, set the access to each service: **None**, **Read** or **Write**. The **All:** buttons apply one level to every row.
4. Select **Create account**, then give the e-mail and the temporary password to the person. They can change the password in their profile.

## Access levels

| Level     | Meaning                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **None**  | The service does not appear: no menu entry, no dashboard card, no calendar entries, no search results. Its pages lead back to the home page |
| **Read**  | Browse the service's pages (library, queue, history, indexers, requests…). Pages show a **Read-only** badge and hide the action buttons     |
| **Write** | Also act: add, edit, delete, start a search, approve a request, pause a download…                                                           |

- Radarr and Sonarr access is set **per instance**: a user can, for example, write to "Movies" and only read "Movies 4K".
- The watchlist belongs to discover: changing it needs **Write** on TMDB.
- Stopping a Tracearr stream needs **Write** on Tracearr.
- **Write** on Prowlarr manages the indexers (add, edit, test, enable, delete) and starts the app sync; Prowlarr's other commands (backup, update check…) stay with administrators.
- With **Read**, the monitored state of a movie, series, season or episode stays visible but cannot be changed.
- Some pages stay **administrator-only** whatever the access: the settings and system pages of each service (Radarr/Sonarr administration, Prowlarr settings and system, Seerr users, settings and jobs) and all of Hubarr's settings. On a Radarr or Sonarr **Server** tab, the service version is only shown to administrators.

Hubarr checks every request on the server: hiding a button is only a convenience, a user without the right gets a "Not allowed" message.

## Change or remove an account

- **Edit** changes the e-mail, name, role and access. New access applies right away, without signing in again.
- A **new temporary password** closes the account's open sessions.
- **Delete** removes the account and closes its sessions. Removing a Radarr or Sonarr instance also removes the access granted to it.
