# Connect SABnzbd

Hubarr drives [SABnzbd](https://sabnzbd.org): live download queue, actions, speed limit, adding NZBs and history. These screens are reserved for administrators.

## Configure the service

1. In SABnzbd, copy the **API key** (_Config → General → Security_).
2. In Hubarr, open **Settings → Services → SABnzbd**, enter the **URL** (for example `http://sabnzbd:8080`) and the API key.
3. **Test** checks the connection; save.

## The page

- **Header**: active and queued downloads, speed, time left, free space; **Pause all** or **Resume all** depending on the state; **Speed limit** in MB/s (empty = unlimited).
- **Queue**: refreshed every 3 seconds, filtered by state and name, sorted; list, table and compact views, in the **Display** menu. Pause, resume and delete one item (partial files are removed), or several after selecting them. An NZB being fetched shows its wait time.
- **Details**: status, category, sizes, progress, speed, time left, identifier and failure reason.
- **Add NZB**: URLs (one per line) or `.nzb` files, optional category.
- **Recent history**: the last 15 downloads, and **View all** for the full history, 50 per page.

## Troubleshooting

- **"Host not allowed"**: add SABnzbd's host name, as Hubarr uses it, to _Config → Special → host_whitelist_.
- **API key refused**: copy the API key again (not the NZB key).
