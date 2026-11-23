# Connecter Deluge

Hubarr pilote [Deluge](https://deluge-torrent.org) par l'API JSON de son interface web, avec la même page que qBittorrent. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Activez l'**interface web** de Deluge et notez son mot de passe.
2. Dans Hubarr, ouvrez **Paramètres → Services → Deluge**, renseignez l'**URL** (par exemple `http://deluge:8112`) et le mot de passe.
3. **Tester** vérifie la connexion ; enregistrez.

L'interface web doit être reliée au démon Deluge : si elle ne l'est pas, Hubarr la relie au premier démon connu. Derrière un proxy qui authentifie, laissez le mot de passe vide.

## Différences avec qBittorrent

La page est décrite dans la fiche [qBittorrent](./qbittorrent). Pour Deluge :

- la **catégorie** est le label du torrent (greffon _Label_) ;
- **Tout mettre en pause** et **Tout reprendre** agissent sur la session entière ;
- la fiche permet de **déplacer les données** d'un torrent et d'en fixer les limites de vitesse ;
- il n'y a ni étiquettes multiples, ni démarrage forcé, ni carte VPN.

## En cas de problème

- **« L'interface web n'est pas reliée au démon »** : démarrez le démon Deluge, ou reliez-le depuis le gestionnaire de connexions de l'interface web.
- **Mot de passe refusé** : c'est le mot de passe de l'interface web, pas celui du démon.
