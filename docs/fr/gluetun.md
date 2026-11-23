# Connecter Gluetun

[Gluetun](https://github.com/qdm12/gluetun) fait passer qBittorrent par un VPN. Une fois connecté, Hubarr affiche sur la page qBittorrent une **carte VPN** : état du tunnel, IP publique, pays et ville, fournisseur, port transféré par le VPN et port d'écoute de qBittorrent.

## Configurer le service

1. Activez le **serveur de contrôle** de Gluetun (port 8000 par défaut). S'il est protégé, créez une clé d'API.
2. Dans Hubarr, ouvrez **Paramètres → Services → Gluetun**, renseignez l'**URL** (par exemple `http://gluetun:8000`) et, s'il y en a une, la clé d'API.
3. Enregistrez : Gluetun n'a pas de test de connexion ; la carte VPN apparaît sur la page qBittorrent.

## Synchronisation du port

Le badge de la carte compare le port transféré par le VPN et le port d'écoute de qBittorrent :

- **✓ Sync** : qBittorrent écoute sur le port transféré ;
- **✗ Désync** : le port n'a pas été repris par qBittorrent (vérifiez le script ou le conteneur qui le met à jour) ;
- **—** : le port transféré ou qBittorrent n'est pas disponible.

Les informations sont relues toutes les 30 secondes ; une panne de Gluetun n'empêche jamais la page qBittorrent de s'afficher.
