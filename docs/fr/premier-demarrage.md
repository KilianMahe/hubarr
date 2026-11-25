# Premier démarrage

Au premier lancement, Hubarr ouvre son assistant d'installation : tant qu'il n'est pas terminé, toutes les pages y renvoient.

## 1. Langue

Choisissez la langue de l'interface (français ou anglais). Elle devient la langue par défaut de l'instance.

## 2. Compte administrateur

Renseignez une adresse e-mail, un nom d'affichage (facultatif) et un mot de passe d'au moins 8 caractères, à saisir deux fois. Le compte est créé, et vous êtes connecté aussitôt.

L'assistant se ferme dès que ce compte existe : il ne peut plus être rouvert.

## 3. Services

Il reste à connecter vos services (Radarr, Sonarr, qBittorrent…) depuis les [paramètres](./parametres.md). Chaque service se teste avant d'être enregistré.

## Accueil

**Accueil**, en haut du menu latéral, regroupe cinq pages reliées par des onglets : **Tableau de bord**, **Découverte**, **Explorer**, **Watchlist** et **Calendrier**. Sur ordinateur, les onglets sont en haut de la page ; sur mobile, ils forment la barre du bas. Chaque page garde son adresse (`/tableau-de-bord`, `/decouverte`, `/decouverte/explorer`, `/decouverte/watchlist`, `/calendrier`). La découverte, l'explorateur et la watchlist s'affichent quand TMDB est configuré, le calendrier quand Radarr ou Sonarr l'est ; la découverte (avec l'explorateur et la watchlist) et le calendrier peuvent être masqués dans **Paramètres → Affichage**. La page d'accueil choisie dans les paramètres (`/`, ouverte aussi par le logo) ne change pas.

## Sur mobile

L'interface s'adapte aux écrans étroits :

- **Barre du bas** : sur les pages de l'accueil, les onglets Tableau de bord, Découverte, Explorer, Watchlist et Calendrier ; dans chaque service à plusieurs pages (Radarr, Sonarr, Prowlarr, Bazarr, Seerr, SABnzbd, NZBGet), ses pages principales, avec au centre le bouton de l'action principale (ajouter un film, une série, un indexeur, un NZB). Les clients torrent ont un bouton flottant d'ajout.
- **Paramètres** : sur la page **Paramètres**, la barre du bas porte ses cinq sections. Sur les pages de paramètres d'un service, elle porte les groupes (profils, intégrations, général, système…) : un appui sur un groupe liste ses pages. La barre du haut nomme le service et la page, par exemple « Sonarr · Tâches » ou « Paramètres · Sauvegarde ».
- **Onglet Serveur** (Radarr, Sonarr) : version du service, compteurs de la bibliothèque, autres pages de l'instance et commandes. La configuration des services s'ouvre depuis **Paramètres → Services**.
- **Barre du haut** : le menu, le service et la page (par exemple « Radarr · Films »), puis la loupe : recherche globale, ou dans une bibliothèque sa propre recherche, qui s'ouvre dans la barre (la croix l'efface).
- **Appui long** sur un film, une série ou un torrent : il est sélectionné ; la barre du haut affiche le nombre d'éléments sélectionnés, « tout sélectionner » et la sortie de la sélection, les actions restent en bas. Un appui court ajoute ou retire ensuite un élément.
- **Tirer vers le bas** en haut d'une bibliothèque ou d'une liste de téléchargements l'actualise.
- **Fiche d'un film ou d'une série** : les recherches et l'actualisation restent dans la page, sous le bouton de suivi ; le bouton central de la barre du bas modifie le film, et sur une série le bouton éclair regroupe le renommage, les fichiers et la modification.
- Les messages de confirmation s'affichent en haut de l'écran.

## Se connecter

L'écran de connexion demande l'adresse e-mail et le mot de passe. Après **5 échecs en 15 minutes**, la connexion est bloquée pour ce compte et cette adresse IP jusqu'à la fin de la fenêtre.

« Se souvenir de moi » garde la session ouverte 7 jours après la dernière visite, même après la fermeture du navigateur.

## Mot de passe oublié

Il n'y a pas de réinitialisation par e-mail. Depuis la machine qui héberge Hubarr :

```sh
docker exec -it hubarr hubarr user:reset-password admin@exemple.fr
```

La commande demande le nouveau mot de passe deux fois, sans l'afficher, puis ferme toutes les sessions du compte.
