# Connect Gluetun

[Gluetun](https://github.com/qdm12/gluetun) routes qBittorrent through a VPN. Once connected, Hubarr shows a **VPN card** on the qBittorrent page: tunnel status, public IP, country and city, provider, port forwarded by the VPN and qBittorrent's listening port.

## Configure the service

1. Enable Gluetun's **control server** (port 8000 by default). If it is protected, create an API key.
2. In Hubarr, open **Settings → Services → Gluetun**, enter the **URL** (for example `http://gluetun:8000`) and, if any, the API key.
3. Save: Gluetun has no connection test; the VPN card appears on the qBittorrent page.

## Port synchronisation

The card's badge compares the port forwarded by the VPN with qBittorrent's listening port:

- **✓ Sync**: qBittorrent listens on the forwarded port;
- **✗ Out of sync**: qBittorrent did not pick up the port (check the script or container that updates it);
- **—**: the forwarded port or qBittorrent is unavailable.

The information is refreshed every 30 seconds; a Gluetun outage never prevents the qBittorrent page from loading.
