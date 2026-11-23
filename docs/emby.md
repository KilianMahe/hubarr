# Connect Emby

Hubarr reads your [Emby](https://emby.media) server's sessions for the dashboard activity widget: current streams, Direct Play or transcode, bandwidth split between local network and Internet. Emby has no page of its own in Hubarr.

## Configure the service

1. In Emby, create an **API key** (_Dashboard → Advanced → API Keys_).
2. In Hubarr, open **Settings → Services → Emby**, enter the **URL** (for example `http://emby:8096`) and the key. The `/emby` prefix is added if missing.
3. **Test** checks the connection; save.

Posters go through Hubarr: your browser never contacts Emby directly.
