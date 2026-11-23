# Reverse proxy et accès distant

Hubarr écoute en HTTP sur le port 7070. Pour y accéder depuis l'extérieur, placez-le derrière un **reverse proxy** qui gère le HTTPS (Traefik, Caddy, Nginx Proxy Manager, nginx…). Le HTTPS est aussi nécessaire pour installer Hubarr comme application sur un téléphone (voir [Application mobile](./application-mobile.md)).

## Sur un sous-domaine (recommandé)

`https://hubarr.exemple.fr` → `http://hubarr:7070`. Aucune configuration particulière côté Hubarr.

::: code-group

```txt [Caddy]
hubarr.exemple.fr {
    reverse_proxy hubarr:7070
}
```

```nginx [nginx]
server {
    server_name hubarr.exemple.fr;
    listen 443 ssl;
    # ssl_certificate …

    location / {
        proxy_pass http://hubarr:7070;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Flux temps réel (Server-Sent Events) : pas de mise en tampon.
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
      - traefik.http.routers.hubarr.rule=Host(`hubarr.exemple.fr`)
      - traefik.http.routers.hubarr.entrypoints=websecure
      - traefik.http.routers.hubarr.tls.certresolver=letsencrypt
      - traefik.http.services.hubarr.loadbalancer.server.port=7070
```

:::

## Sous un chemin (`/hubarr`)

`https://exemple.fr/hubarr/` → Hubarr. Deux façons de faire, au choix :

**1. Le proxy transmet le chemin complet** : déclarez le préfixe à Hubarr.

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

**2. Le proxy retire le préfixe** et l'annonce dans l'en-tête `X-Forwarded-Prefix`. Rien à configurer côté Hubarr, tant que le proxy fait partie des adresses de confiance (`HUBARR_TRUST_PROXY`, qui couvre par défaut les réseaux privés et Docker).

```yaml
# Traefik
labels:
  - traefik.http.routers.hubarr.rule=Host(`exemple.fr`) && PathPrefix(`/hubarr`)
  - traefik.http.middlewares.hubarr-strip.stripprefix.prefixes=/hubarr
  - traefik.http.routers.hubarr.middlewares=hubarr-strip
```

Traefik ajoute `X-Forwarded-Prefix` de lui-même quand il retire un préfixe. Avec nginx : `location /hubarr/ { proxy_pass http://hubarr:7070/; proxy_set_header X-Forwarded-Prefix /hubarr; }`.

Dans les deux cas, l'application, son API, le flux temps réel, la documentation (`/hubarr/docs/`), le flux iCal et la PWA fonctionnent sous le préfixe.

## Adresses de confiance

`HUBARR_TRUST_PROXY` liste les proxys dont Hubarr croit les en-têtes `X-Forwarded-For`, `X-Forwarded-Proto` et `X-Forwarded-Prefix` : adresse IP réelle des visiteurs (limitation des connexions), HTTPS (cookie `Secure`) et préfixe. Valeur par défaut : `loopback,linklocal,uniquelocal` (bouclage, lien local et réseaux privés, donc les réseaux Docker). Indiquez `false` si Hubarr est exposé directement, ou une liste d'adresses et de plages (`10.0.0.2, 172.18.0.0/16`) pour restreindre.

## Intégrer Hubarr dans une iframe

Par défaut, Hubarr refuse d'être affiché dans une page d'un autre site. Pour l'intégrer dans un portail (Homarr, Organizr…), listez les origines autorisées, séparées par des espaces :

```yaml
environment:
  HUBARR_FRAME_ANCESTORS: https://portail.exemple.fr
```

## Authentification devant Hubarr

Un proxy d'authentification (Authelia, Authentik…) peut protéger Hubarr en plus de sa propre connexion. Laissez passer sans authentification `/api/health` si votre supervision l'interroge.
