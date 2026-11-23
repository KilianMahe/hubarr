# Connecter Tracearr

[Tracearr](https://github.com/connorgallopo/Tracearr) suit l'activité de vos serveurs Plex, Jellyfin ou Emby. Hubarr en affiche les lectures en cours, les statistiques, les graphiques, l'historique et les utilisateurs. La page est ouverte à tous les utilisateurs de Hubarr.

## Configurer le service

1. Dans Tracearr, créez une **clé d'API publique** (elle commence par `trr_pub_`).
2. Dans Hubarr, ouvrez **Paramètres → Services → Tracearr**, renseignez l'**URL** (par exemple `http://tracearr:3000`) et la clé.
3. **Tester** vérifie la connexion ; enregistrez.

## La page

Un onglet par partie, en haut sur ordinateur et dans la barre du bas sur mobile : **Résumé** (`/tracearr` : compteurs, lectures en cours en lignes, cinq dernières lectures), **En cours**, **Statistiques**, **Historique** et **Utilisateurs**.

- **En cours** : une carte par lecture, avec le nom du serveur, relue toutes les 10 secondes. Toucher une lecture ouvre son détail : média, utilisateur et serveur, lecteur et appareil, réseau, qualité, décision de flux et codecs par piste, plage dynamique, débit et progression ; **Voir la fiche** ouvre l'aperçu du titre quand Tracearr le connaît.
- **Statistiques** : lectures et heures regardées aujourd'hui, utilisateurs actifs, lectures sur 30 jours, utilisateurs, violations sur 7 jours.
- **Graphiques** par période (7 jours, 30 jours, 1 an) : lectures dans le temps, par heure, par jour, par plateforme, flux simultanés, et la répartition Direct Play / Direct Stream / transcodage.
- **Historique** : 24 lectures, puis **Charger plus**.
- **Utilisateurs** : une carte par utilisateur (initiales, serveur, lectures, dernière activité, score de confiance en barre colorée), les plus récemment actifs d'abord, avec une recherche par nom au-delà de six. Toucher une carte ouvre sa **fiche** : lectures, heures regardées, films et épisodes, dernière activité, plateformes, titres les plus vus et ses 50 dernières lectures. L'API publique de Tracearr n'ayant pas d'historique par utilisateur, ces chiffres portent sur les 500 dernières lectures du serveur (la fiche le signale quand l'historique est plus long). L'adresse de la fiche est un jeton propre à Hubarr, renouvelé à chaque redémarrage : l'identifiant Tracearr de l'utilisateur n'est jamais envoyé au navigateur.

Hubarr utilise l'API v2 de Tracearr quand elle existe et revient à la v1 sinon.

## Source de l'activité

Si Tautulli et Tracearr sont tous deux configurés, la préférence **Paramètres → Affichage → Source de l'activité** choisit celle qui alimente le widget d'activité ; un service indisponible cède la place à l'autre.
