# Troubleshooting and FAQ

## Reading the logs

### Logs page {#logs-page}

Administrators find the last 1,000 log entries in the **Logs** section of [Settings](./settings.md#logs) (`/admin/settings#section-logs`; the former address `/admin/logs` leads there), without opening a terminal:

- filter by minimum level, by service and by text (message and details);
- click an entry to see its details, and **Copy** it as JSON to attach to a bug report;
- **Download** saves the filtered entries as a `.jsonl` file (one JSON entry per line);
- the list refreshes every 5 seconds while **Auto refresh** is on.

When a call to a service fails, the entry names the service and instance, the method and path called, the HTTP status or network error code (`ECONNREFUSED`, `ENOTFOUND`, timeout…), the duration, and whether Hubarr now considers the service unreachable (`circuit: open`: calls are skipped for 10 seconds).

Secrets are masked before anything is logged, on the page as in the container output: API keys, tokens, passwords, `Authorization` headers, cookies, credentials in URLs and sensitive URL parameters (`apikey=`, `token=`…) are replaced with `[redacted]`.

The entries are kept in memory: they start over at each restart. By default, the page keeps the same level as the console (`HUBARR_LOG_LEVEL`, `warn`). To keep more detail on the page without making the console more verbose, set `HUBARR_LOG_BUFFER_LEVEL=info`.

### Container output

```sh
docker logs -f hubarr
```

For more detail, set `HUBARR_LOG_LEVEL` to `info` or `debug` and restart the container. At `debug` level, Hubarr also logs the cache and real-time counters.

## I forgot my password

There is no e-mail reset. From the machine hosting Hubarr:

```sh
docker exec -it hubarr hubarr user:reset-password admin@example.com
```

The command asks for the new password twice, then closes all of the account's sessions.

## "Too many attempts" at login

After 5 failures in 15 minutes, login is blocked for that account and IP address until the window ends; after 50 failures on the same account, from any address, it is blocked for every address. An active session or `hubarr user:reset-password` remain available. Behind a reverse proxy, check that `HUBARR_TRUST_PROXY` covers the proxy: otherwise every visitor seems to come from the same address, the proxy's.

## A service shows as unreachable

1. Open **Settings → Services** and click **Test**: the message gives the cause (service unreachable, credentials refused, 403, 404, service error, host refused by SABnzbd…).
2. The URL must be reachable **from the Hubarr container**, not from your browser. If the services run on the same Docker network, use the container name (`http://radarr:7878`); otherwise, the machine's IP address. `localhost` is the Hubarr container itself.
3. After an outage, Hubarr waits 10 seconds before querying a service again: use **Retry** in the banner to try right away.
4. Link-local addresses (`169.254.x.x`) and schemes other than `http`/`https` are refused for security.

## The container does not start

| Message                                                               | Cause and fix                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `variables d'environnement invalides` (invalid environment variables) | A variable has an incorrect value: the message names it                                                                              |
| `EACCES` on `/data`                                                   | The container runs with `user:` and cannot write to the folder: drop `user:` and set `PUID`/`PGID`, or `chown -R <uid>:<gid> ./data` |
| Database newer than the application                                   | You went back to an older version: reinstall the recent one, or restore `hubarr.db.bak`                                              |

## Backup and restore

Hubarr's whole state lives in `/data` (the `hubarr_data` volume by default): `hubarr.db` (database), `hubarr.db.bak` (copy made before each schema update) and `avatars/`.

```sh
docker compose stop
# Back up the volume to hubarr-data.tar.gz (current folder)
docker run --rm -v hubarr_hubarr_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/hubarr-data.tar.gz -C /data .
# Restore
docker run --rm -v hubarr_hubarr_data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/hubarr-data.tar.gz -C /data'
docker compose start
```

Compose prefixes the volume with the project name (`docker volume ls` confirms it); with a host folder (`./data:/data`), just copy that folder while the container is stopped.

The **export** in **Settings → Backup** produces a JSON file with the service configuration and preferences, to import into another install.

## The app does not install on my phone

Installing a PWA requires HTTPS. See [Mobile app](./mobile-app.md).

## The iCal feed does not sync in my calendar app

The `/calendrier.ics` feed requires a Hubarr session: it works in a logged-in browser, but not yet in calendar apps that do not send the session cookie.
