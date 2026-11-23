# Connect NZBGet

Hubarr drives [NZBGet](https://nzbget.com) through its JSON-RPC API, with the same page as SABnzbd. These screens are reserved for administrators.

## Configure the service

1. In NZBGet, note the control username and password (_Settings → Security_).
2. In Hubarr, open **Settings → Services → NZBGet**, enter the **URL** (for example `http://nzbget:6789`), the username and the password.
3. **Test** checks the connection; save.

## Differences from SABnzbd

The page is described in the [SABnzbd](./sabnzbd) guide. For NZBGet:

- speed is reported per download; the time left is that of the whole queue;
- history failure reasons (repair, unpack, duplicate…) are translated;
- the categories offered when adding come from NZBGet's configuration.

## Troubleshooting

- **401**: wrong username or password (the "restricted" account cannot act on the queue).
