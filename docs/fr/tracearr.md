# Connecter Tracearr

[Tracearr](https://github.com/connorgallopo/Tracearr) suit l'activité de vos serveurs Plex, Jellyfin ou Emby. Hubarr en affiche les lectures en cours, les statistiques, les graphiques, l'historique et les utilisateurs. La page est ouverte à tous les utilisateurs de Hubarr.

## Configurer le service

1. Dans Tracearr, créez une **clé d'API publique** (elle commence par `trr_pub_`).
2. Dans Hubarr, ouvrez **Paramètres → Services → Tracearr**, renseignez l'**URL** (par exemple `http://tracearr:3000`) et la clé.
3. **Tester** vérifie la connexion ; enregistrez.

## La page

Un onglet par partie, en haut sur ordinateur et dans la barre du bas sur mobile : **Résumé** (`/tracearr` : compteurs, lectures en cours en lignes, cinq dernières lectures), **En cours**, **Statistiques**, **Historique** et **Utilisateurs**.

- **En cours** : une carte par lecture, avec le nom du serveur, relue toutes les 10 secondes. Toucher une lecture ouvre son détail : média, utilisateur et serveur, lecteur et appareil, réseau, qualité, décision de flux et codecs par piste, plage dynamique, débit et progression ; **Voir la fiche** ouvre l'aperçu du titre quand Tracearr le connaît. Les administrateurs disposent aussi de **Arrêter la lecture** : après confirmation, Tracearr interrompt le flux et peut afficher au spectateur un message facultatif (200 caractères au plus).
- **Statistiques** : lectures et heures regardées aujourd'hui, utilisateurs actifs, lectures sur 30 jours, utilisateurs, violations sur 7 jours.
- **Graphiques** par période (7 jours, 30 jours, 1 an) : lectures dans le temps, par heure, par jour, par plateforme, flux simultanés, et la répartition Direct Play / Direct Stream / transcodage.
- **Historique** : 24 lectures, puis **Charger plus**.
- **Utilisateurs** : une carte par utilisateur (initiales, serveur, lectures, dernière activité, score de confiance en barre colorée), les plus récemment actifs d'abord, avec une recherche par nom au-delà de six. Toucher une carte ouvre sa **fiche** : lectures, heures regardées, films et épisodes, dernière activité, plateformes, titres les plus vus et ses 50 dernières lectures. L'API publique de Tracearr n'ayant pas d'historique par utilisateur, ces chiffres portent sur les 500 dernières lectures du serveur (la fiche le signale quand l'historique est plus long). L'adresse de la fiche est un jeton propre à Hubarr, renouvelé à chaque redémarrage : l'identifiant Tracearr de l'utilisateur n'est jamais envoyé au navigateur.

Hubarr utilise l'API v2 de Tracearr quand elle existe et revient à la v1 sinon.

## « Vu »

Hubarr peut marquer les films et les épisodes que vous avez regardés, d'après Tracearr.

1. Ouvrez votre **Profil** (menu sous votre avatar). La carte **Tracearr** liste les comptes Tracearr : choisissez le vôtre. La carte n'apparaît que si Tracearr est configuré.
2. Hubarr importe vos lectures en arrière-plan (la carte affiche « Import des lectures en cours… », puis la date de la dernière synchronisation et le nombre de lectures), puis les met à jour toutes les 15 minutes.
3. Ensuite :
   - un badge **Vu** marque les films que vous avez regardés, sur leur fiche et dans la bibliothèque Radarr (cartes et liste) ;
   - les séries affichent le nombre d'épisodes vus, par exemple **3/10 vus**, sur leur fiche et dans la bibliothèque Sonarr ; chaque saison affiche son compte et chaque épisode vu est marqué **Vu** ;
   - sur le tableau de bord, **Tendances de la semaine** et **Ajouts récents à votre bibliothèque** portent les mêmes badges (pour une série en tendance, le nombre d'épisodes vus) ;
   - la découverte affiche une rangée **D'après ce que tu as regardé**, tirée de vos dernières lectures (voir [Découverte](./decouverte.md#accueil-et-recherche)).

Seules les lectures que Tracearr considère comme terminées comptent. Les épisodes spéciaux sont exclus du compte d'une série. Chaque compte Hubarr choisit son propre compte Tracearr ; choisir **Aucun** (la croix du champ) le dissocie et oublie les lectures importées.

Les administrateurs trouvent sur la carte un bouton **Resynchroniser**, qui réimporte tout l'historique des comptes associés (utile après un changement de bibliothèque dans Tracearr).

Cette fonction demande l'**API v2** de Tracearr : seul son historique porte l'ID TMDB des films et filtre les lectures par utilisateur. Avec un Tracearr plus ancien, la carte le signale. Les films sont reconnus par leur ID TMDB, les séries par leur ID TVDB (celui de Sonarr) ou TMDB. Les lectures sont gardées dans la base de Hubarr (table `tracearr_watch`) ; l'identifiant Tracearr de votre compte n'est jamais envoyé au navigateur.

## Source de l'activité

Si Tautulli et Tracearr sont tous deux configurés, la préférence **Paramètres → Affichage → Source de l'activité** choisit celle qui alimente le widget d'activité ; un service indisponible cède la place à l'autre.
