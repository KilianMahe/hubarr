# Connect Deluge

Hubarr drives [Deluge](https://deluge-torrent.org) through its Web UI JSON API, with the same page as qBittorrent. These screens are reserved for administrators.

## Configure the service

1. Enable Deluge's **Web UI** and note its password.
2. In Hubarr, open **Settings → Services → Deluge**, enter the **URL** (for example `http://deluge:8112`) and the password.
3. **Test** checks the connection; save.

The Web UI must be connected to the Deluge daemon: if it is not, Hubarr connects it to the first known daemon. Behind an authenticating proxy, leave the password empty.

## Differences from qBittorrent

The page is described in the [qBittorrent](./qbittorrent) guide. For Deluge:

- the **category** is the torrent's label (_Label_ plugin);
- **Pause all** and **Resume all** act on the whole session;
- the details let you **move a torrent's data** and set its speed limits;
- there are no multiple tags, no force start and no VPN card.

## Troubleshooting

- **"Deluge web UI is not connected to the daemon"**: start the Deluge daemon, or connect it from the Web UI connection manager.
- **Password refused**: it is the Web UI password, not the daemon's.
