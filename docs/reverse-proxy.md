# Reverse proxy and remote access

Hubarr listens over HTTP on port 7070. To reach it from outside, put it behind a **reverse proxy** that handles HTTPS (Traefik, Caddy, Nginx Proxy Manager, nginx…). HTTPS is also required to install Hubarr as an app on a phone (see [Mobile app](./mobile-app.md)).

## On a subdomain (recommended)

`https://hubarr.example.com` → `http://hubarr:7070`. Nothing to configure on the Hubarr side.

::: code-group

```txt [Caddy]
hubarr.example.com {
    reverse_proxy hubarr:7070
}
```

```nginx [nginx]
server {
    server_name hubarr.example.com;
    listen 443 ssl;
    # ssl_certificate …

    location / {
        proxy_pass http://hubarr:7070;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Real-time stream (Server-Sent Events): no buffering.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

```yaml [Traefik (labels)]
services:
  hubarr:
    image: naroner/hubarr:latest
    labels:
      - traefik.enable=true
      - traefik.http.routers.hubarr.rule=Host(`hubarr.example.com`)
      - traefik.http.routers.hubarr.entrypoints=websecure
      - traefik.http.routers.hubarr.tls.certresolver=letsencrypt
      - traefik.http.services.hubarr.loadbalancer.server.port=7070
```

:::

## Under a path (`/hubarr`)

`https://example.com/hubarr/` → Hubarr. Two ways to do it:

**1. The proxy forwards the full path**: tell Hubarr the prefix.

```yaml
environment:
  HUBARR_BASE_PATH: /hubarr
```

```txt
# Caddy
handle /hubarr* {
    reverse_proxy hubarr:7070
}
```

**2. The proxy strips the prefix** and announces it in the `X-Forwarded-Prefix` header. Nothing to configure in Hubarr, as long as the proxy is among the trusted addresses (`HUBARR_TRUST_PROXY`, which covers private and Docker networks by default).

```yaml
# Traefik
labels:
  - traefik.http.routers.hubarr.rule=Host(`example.com`) && PathPrefix(`/hubarr`)
  - traefik.http.middlewares.hubarr-strip.stripprefix.prefixes=/hubarr
  - traefik.http.routers.hubarr.middlewares=hubarr-strip
```

Traefik adds `X-Forwarded-Prefix` by itself when it strips a prefix. With nginx: `location /hubarr/ { proxy_pass http://hubarr:7070/; proxy_set_header X-Forwarded-Prefix /hubarr; }`.

Either way, the application, its API, the real-time stream, the documentation (`/hubarr/docs/`), the iCal feed and the PWA all work under the prefix.

## Trusted addresses

`HUBARR_TRUST_PROXY` lists the proxies whose `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Prefix` headers Hubarr trusts: visitors' real IP address (login throttling), HTTPS (`Secure` cookie) and prefix. Default: `loopback,linklocal,uniquelocal` (loopback, link-local and private networks, hence Docker networks). Use `false` if Hubarr is exposed directly, or a list of addresses and ranges (`10.0.0.2, 172.18.0.0/16`) to restrict it.

## Embedding Hubarr in an iframe

By default, Hubarr refuses to be displayed inside another site's page. To embed it in a portal (Homarr, Organizr…), list the allowed origins, separated by spaces:

```yaml
environment:
  HUBARR_FRAME_ANCESTORS: https://portal.example.com
```

## Authentication in front of Hubarr

An authentication proxy (Authelia, Authentik…) can protect Hubarr on top of its own login. Let `/api/health` through without authentication if your monitoring polls it.
