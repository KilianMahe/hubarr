# Connecter qBittorrent

Hubarr pilote [qBittorrent](https://www.qbittorrent.org) (versions 4.x et 5.x) : liste des torrents en temps réel, actions une par une ou groupées, ajout de liens et de fichiers `.torrent`, limites de vitesse et carte VPN avec [Gluetun](./gluetun). Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans qBittorrent, activez l'**interface web** (_Outils → Options → Interface web_) et notez l'utilisateur et le mot de passe.
2. Dans Hubarr, ouvrez **Paramètres → Services → qBittorrent**, renseignez l'**URL** (par exemple `http://qbittorrent:8080`), l'utilisateur et le mot de passe.
3. **Tester** vérifie la connexion ; enregistrez.

Derrière un proxy qui authentifie à la place de qBittorrent (ou avec l'option « Ignorer l'authentification pour les clients du réseau local »), laissez l'utilisateur **ou** le mot de passe vide : Hubarr n'ouvre alors pas de session.

## La page

- **En-tête** : vitesses de réception et d'envoi, bouton **Limite** (limites alternatives), puis espace libre, ratio, session en cours (volumes, durée) ; sur grand écran, totaux téléchargés et envoyés et pics de la session.
- **Filtres** : états avec leur nombre de torrents (en puces sur mobile, dans un panneau à gauche sur grand écran, avec les catégories et étiquettes).
- **Liste** : relue toutes les 3 secondes, triée, filtrée (état, catégorie, étiquette, recherche) et paginée. Trois vues, au menu **Affichage** comme dans Radarr et Sonarr : liste, tableau (par défaut, sur ordinateur comme sur mobile, où il garde le nom, avec taille et débits en dessous, la progression et les actions), compacte ; la vue, le tri et la taille de page sont mémorisés.
- **Badge de catégorie** : une catégorie Radarr (`movies`, `films`, `radarr`) ou Sonarr (`tv`, `series`, `sonarr`…) est cliquable et ouvre la fiche du film ou de la série correspondante dans Hubarr, toutes instances confondues.
- **Sélection** : cases à cocher (Maj+clic pour une plage), puis reprendre, mettre en pause, vérifier, changer de catégorie ou supprimer (avec ou sans les fichiers).
- **Fiche d'un torrent** : propriétés, fichiers (priorité modifiable), trackers et pairs ; pause ou reprise, vérification, réannonce, suppression. Le panneau **Plus d'actions** donne le démarrage forcé, le téléchargement séquentiel, les premières et dernières pièces d'abord, le renommage, la catégorie et les limites de vitesse du torrent.
- **Ajouter** : liens magnet ou URL `.torrent` (un par ligne), fichiers `.torrent` par glisser-déposer, catégorie, dossier de destination, démarrage immédiat ou en pause. Les adresses des métadonnées cloud sont refusées.
- **Limites de vitesse** : limites globales en Mo/s (vide = illimité) et bascule des limites alternatives.

## En cas de problème

- **« Impossible de contacter qBittorrent »** : l'URL n'est pas joignable depuis le conteneur Hubarr, ou l'interface web est désactivée.
- **Identifiants refusés** : qBittorrent bannit une adresse après plusieurs échecs ; vérifiez les identifiants puis attendez la fin du bannissement.
- **Action refusée** : le message de qBittorrent est affiché tel quel.
