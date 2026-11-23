# Connecter Transmission

Hubarr pilote [Transmission](https://transmissionbt.com) par son API RPC, avec la même page que qBittorrent. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans Transmission, activez l'accès distant (RPC) et, si vous le souhaitez, un utilisateur et un mot de passe.
2. Dans Hubarr, ouvrez **Paramètres → Services → Transmission**, renseignez l'**URL** (par exemple `http://transmission:9091`) et, s'il y en a, l'utilisateur et le mot de passe. Une URL qui se termine par `/transmission`, `/transmission/rpc` ou `/transmission/web` est acceptée telle quelle.
3. **Tester** vérifie la connexion ; enregistrez.

## Différences avec qBittorrent

La page est décrite dans la fiche [qBittorrent](./qbittorrent). Pour Transmission :

- la **catégorie** est le premier label du torrent ; les filtres proposent les labels présents sur les torrents ;
- **Tout mettre en pause** et **Tout reprendre** agissent sur la session entière ;
- la fiche permet de **déplacer les données** d'un torrent et d'en fixer les limites de vitesse ; la priorité des fichiers est affichée sans être modifiable ;
- il n'y a ni étiquettes multiples, ni démarrage forcé, ni carte VPN.

## En cas de problème

- **« Impossible de contacter Transmission »** : l'URL n'est pas joignable, ou l'adresse du conteneur Hubarr n'est pas dans la liste blanche RPC (`rpc-whitelist`) de Transmission.
- **401** : utilisateur ou mot de passe faux.
