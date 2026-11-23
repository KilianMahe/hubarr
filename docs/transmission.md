# Connect Transmission

Hubarr drives [Transmission](https://transmissionbt.com) through its RPC API, with the same page as qBittorrent. These screens are reserved for administrators.

## Configure the service

1. In Transmission, enable remote access (RPC) and, if you wish, a username and password.
2. In Hubarr, open **Settings → Services → Transmission**, enter the **URL** (for example `http://transmission:9091`) and, if any, the username and password. A URL ending with `/transmission`, `/transmission/rpc` or `/transmission/web` is accepted as is.
3. **Test** checks the connection; save.

## Differences from qBittorrent

The page is described in the [qBittorrent](./qbittorrent) guide. For Transmission:

- the **category** is the torrent's first label; filters offer the labels found on torrents;
- **Pause all** and **Resume all** act on the whole session;
- the details let you **move a torrent's data** and set its speed limits; file priority is shown but not editable;
- there are no multiple tags, no force start and no VPN card.

## Troubleshooting

- **"Unable to reach Transmission"**: the URL is not reachable, or the Hubarr container's address is not in Transmission's RPC whitelist (`rpc-whitelist`).
- **401**: wrong username or password.
