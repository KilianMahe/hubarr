# Présentation fonctionnelle

Cette page décrit **ce que fait Hubarr** : à qui il s'adresse, les notions qu'il manipule, ce que chaque module permet et les règles qui encadrent son usage. Pour l'installation, voir [Installation](./installation.md) ; pour le fonctionnement interne, voir [Architecture technique](./architecture.md).

## En une phrase

Hubarr est une **application web self-hosted** qui réunit, derrière une seule interface et une seule connexion, les outils d'une stack média domestique : gestion des bibliothèques de films et de séries, indexeurs, sous-titres, clients de téléchargement, demandes, statistiques de lecture et découverte de nouveaux titres.

## Le problème qu'il résout

Une stack média typique compte une dizaine de services (Radarr, Sonarr, Prowlarr, Bazarr, qBittorrent, SABnzbd, Seerr, Tautulli…), chacun avec son interface, son mot de passe, son port et sa logique de navigation. Suivre un film « de la demande au visionnage » oblige à passer de l'un à l'autre, et la plupart de ces interfaces se prêtent mal à un téléphone.

Hubarr ne remplace aucun de ces services : il les **pilote** par leurs API. Il apporte :

- **un point d'entrée unique**, une seule session, la même navigation partout ;
- **une vue transversale** : tableau de bord, calendrier, recherche globale et santé des services agrègent toutes les sources ;
- **une interface pensée pour le mobile**, installable comme une application (PWA) ;
- **la sécurité de l'exposition** : le navigateur ne parle qu'à Hubarr, jamais directement aux services, dont les adresses et les clés restent côté serveur.

## Utilisateurs et rôles

| Rôle               | Qui                                 | Ce qu'il peut faire                                                                                                                                     |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrateur** | Créé par l'assistant d'installation | Tout : configuration des services, paramètres, administration de Radarr/Sonarr/Prowlarr/Bazarr/Seerr, clients de téléchargement, ajouts et suppressions |
| **Utilisateur**    | Compte non administrateur           | Consulter : tableau de bord, calendrier, découverte et watchlist, activité, profil. Les modules d'administration lui sont fermés                        |

En pratique, une installation compte souvent un seul compte, l'administrateur. Chaque compte gère son **profil** (nom affiché, e-mail, mot de passe, avatar).

## Notions clés

| Notion                       | Définition                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service**                  | Une application tierce que Hubarr pilote (15 au total, voir ci-dessous). Un service est _configuré_ (URL et identifiants enregistrés), _activé_ ou non, et _visible dans le menu_ ou non.                                                               |
| **Instance**                 | Une installation d'un service. Radarr et Sonarr acceptent **plusieurs instances** (par exemple « Films » et « Films 4K ») ; l'une est l'instance _par défaut_. Chaque instance a un **slug** qui apparaît dans les adresses (`/medias/films-4k/films`). |
| **Bibliothèque**             | L'ensemble des films (Radarr) ou des séries (Sonarr) d'une instance, avec leur état : suivi, téléchargé, manquant, sous le seuil de qualité.                                                                                                            |
| **File d'attente**           | Les téléchargements en cours vus par Radarr ou Sonarr, avec leurs problèmes éventuels (import bloqué, échec).                                                                                                                                           |
| **Release**                  | Une version téléchargeable d'un film ou d'un épisode, trouvée par les indexeurs, que l'on peut récupérer (_grab_) manuellement.                                                                                                                         |
| **Indexeur**                 | Une source de releases, gérée par Prowlarr et synchronisée vers Radarr et Sonarr.                                                                                                                                                                       |
| **Client de téléchargement** | qBittorrent, Transmission, Deluge (torrent) ou SABnzbd, NZBGet (Usenet).                                                                                                                                                                                |
| **Demande**                  | Une demande de film ou de série faite dans Seerr par un utilisateur du serveur multimédia, à approuver ou refuser.                                                                                                                                      |
| **Watchlist**                | Une liste de titres TMDB à garder en tête, commune à l'installation, avec des notes.                                                                                                                                                                    |
| **Santé**                    | L'état de joignabilité de chaque service et instance, vérifié en continu.                                                                                                                                                                               |

## Services pris en charge

| Famille                | Services                                                              | Rôle dans Hubarr                                                                          |
| ---------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Bibliothèques          | **Radarr**, **Sonarr** (multi-instances)                              | Films et séries : parcourir, ajouter, suivre, rechercher, gérer les fichiers, administrer |
| Indexeurs              | **Prowlarr**                                                          | Indexeurs, recherche manuelle, applications, système                                      |
| Sous-titres            | **Bazarr**                                                            | Sous-titres manquants, recherche manuelle et automatique, historique                      |
| Téléchargement torrent | **qBittorrent**, **Transmission**, **Deluge**, plus **Gluetun** (VPN) | Liste, détail, actions groupées, ajout, limites, état du VPN                              |
| Téléchargement Usenet  | **SABnzbd**, **NZBGet**                                               | File, historique, pause et reprise, limite de vitesse, ajout de NZB                       |
| Demandes               | **Seerr** (Jellyseerr / Overseerr)                                    | Demandes, utilisateurs, réglages                                                          |
| Activité               | **Tautulli** (Plex), **Tracearr**, **Emby**                           | Lectures en cours, historique, statistiques, graphiques                                   |
| Métadonnées            | **TMDB**                                                              | Découverte, fiches, tendances, recommandations, watchlist                                 |

## Les modules

### Tableau de bord

Page d'accueil par défaut. Un bandeau (salutation, mise en avant d'un titre), des compteurs, puis des sections indépendantes : prochaines sorties sur 7 jours, files d'attente, demandes en attente, santé des services, activité de lecture, transferts, watchlist, tendances, derniers ajouts. Chaque section se charge seule : un service en panne n'empêche pas les autres de s'afficher. L'administrateur choisit l'ordre et la visibilité des sections. Détails : [Tableau de bord](./tableau-de-bord.md).

### Films et séries

Pour chaque instance Radarr ou Sonarr : bibliothèque filtrable et triable (grille, liste, tableau), fiche détaillée (fichiers, historique, distribution, épisodes par saison pour les séries), recherche interactive de releases, actions groupées (suivi, profil de qualité, étiquettes, suppression), pages annexes (file d'attente, historique, manquants, seuil de qualité, blocklist, collections, calendrier). Un administrateur ajoute un titre depuis n'importe quel écran (ajout rapide). L'administration complète de Radarr et Sonarr (profils, formats personnalisés, indexeurs, clients, listes, notifications, nommage, tâches, journaux, sauvegardes…) est intégrée : voir [Administration Radarr/Sonarr](./administration-arr.md).

### Téléchargements

Une seule vue pour les trois clients torrent et une pour les deux clients Usenet : compteurs par état, vitesses, liste paginée et filtrée côté serveur, sélection multiple, actions groupées, fiche détaillée (fichiers, trackers, pairs), ajout par lien ou fichier, limites de vitesse. Le nom d'un torrent lié à un film ou une série renvoie vers sa fiche. La carte VPN (Gluetun) affiche l'IP publique et le port transféré.

### Indexeurs et sous-titres

Prowlarr : liste des indexeurs avec statistiques, tests, actions groupées, recherche manuelle et récupération d'une release, applications et paramètres. Bazarr : sous-titres manquants, recherche par fournisseur, téléchargement, historique.

### Demandes

Seerr : liste des demandes avec approbation, refus, relance et suppression ; gestion des utilisateurs (permissions, quotas, import) ; réglages du service.

### Activité

Tautulli, Tracearr et Emby : lectures en cours (qualité, transcodage, débit), historique, statistiques par utilisateur et par bibliothèque, graphiques.

### Découverte, calendrier et recherche

- **Découverte** (TMDB) : sections thématiques, filtres, fiches, collections, personnes, et pour chaque titre son état dans vos bibliothèques. **Watchlist** commune avec notes.
- **Calendrier** : sorties de films et diffusions d'épisodes de toutes les instances, vues mois, semaine et liste, et flux iCal à importer dans un agenda.
- **Recherche globale** (`Ctrl+K`) : vos bibliothèques d'abord, puis TMDB, avec historique des recherches.

### Paramètres

Réservés à l'administrateur : connexion et test des services, instances Radarr/Sonarr, préférences d'affichage (page d'accueil, formats, fuseau), thème (17 palettes, accent, clair ou sombre), mise en page du tableau de bord, langues des services, export et import de la configuration. Détails : [Paramètres](./parametres.md).

## Parcours types

**Ajouter un film demandé.** Une demande arrive dans Seerr → elle apparaît dans _Demandes en attente_ du tableau de bord → l'administrateur l'approuve → Seerr la transmet à Radarr → le téléchargement apparaît dans la _file d'attente_ et dans la vue du client → une fois importé, le film rejoint _Derniers ajouts_ et la bibliothèque.

**Remplacer une mauvaise version.** Fiche du film → _Recherche interactive_ → choix d'une release (qualité, taille, indexeur, score) → _Récupérer_ → suivi dans la file d'attente ; l'ancienne release peut être ajoutée à la blocklist.

**Diagnostiquer une panne.** L'icône de santé passe à l'orange → le menu indique le service injoignable → sa page affiche un bandeau avec la cause (délai dépassé, identifiants refusés…) et un bouton _Réessayer_ ; le test de connexion des paramètres précise le diagnostic.

## Règles de gestion

- **Installation** : tant que l'assistant n'est pas terminé, toutes les pages y renvoient. Il crée le premier administrateur et se ferme définitivement.
- **Connexion** : 5 échecs en 15 minutes bloquent la connexion pour ce compte et cette adresse IP jusqu'à la fin de la fenêtre. Une session dure 7 jours après la dernière visite.
- **Mot de passe** : au moins 8 caractères. Pas de réinitialisation par e-mail : une commande en ligne de commande s'en charge, et ferme toutes les sessions du compte.
- **Secrets** : une clé d'API ou un mot de passe enregistré n'est jamais renvoyé au navigateur ; un champ laissé vide conserve la valeur existante.
- **Adresses des services** : les schémas autres que `http`/`https` et les adresses de lien local (métadonnées des clouds) sont refusés ; les adresses du réseau local sont acceptées.
- **Services indisponibles** : un service non configuré ou désactivé disparaît du menu et sa page renvoie vers les paramètres ; un service injoignable affiche un bandeau, sans bloquer le reste de l'application.
- **Mutations** : toute action qui modifie un état (ajout, suppression, approbation…) exige une session valide et un jeton anti-CSRF.
- **Données** : Hubarr ne stocke que sa propre configuration, ses comptes et la watchlist. Les bibliothèques, files et historiques restent dans les services et sont relus (avec un cache court) à chaque consultation.

## Langues, thèmes et accessibilité

L'interface est disponible en **français** et en **anglais**. Le thème est sombre par défaut, avec 17 palettes, une couleur d'accent et un mode clair ; chaque service a sa couleur d'accent dans ses propres écrans. L'interface se manipule au clavier et respecte les contrastes recommandés.

## Origine

Hubarr s'inspire de [Prismarr](https://github.com/Shoshuo/Prismarr), dont il reprend et adapte certains éléments. Il est distribué sous licence AGPL-3.0-or-later ; voir le fichier `NOTICE.md` du dépôt.
