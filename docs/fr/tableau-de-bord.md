# Tableau de bord

Le tableau de bord rassemble les signaux de tous vos services sur un seul écran. Il s'ouvre à l'adresse `/tableau-de-bord`, dans le premier onglet de l'[**Accueil**](./premier-demarrage.md#accueil) ; c'est aussi la page d'accueil par défaut (modifiable dans **Paramètres → Affichage**).

## Bandeau

En haut, la salutation, le jour et l'heure (fuseau des préférences d'affichage), puis une mise en avant : un film de votre bibliothèque Radarr au hasard (avec une image de fond), à défaut un titre tendance de TMDB. Trois compteurs suivent : films, séries et sorties des 7 prochains jours.

## Sections

| Section              | Contenu                                                                                                                                                                                                                                                         | Service requis              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Prochaines sorties   | Grille de 7 jours (films et épisodes), 3 titres par jour puis un lien vers le calendrier                                                                                                                                                                        | Radarr ou Sonarr            |
| Files d'attente      | Téléchargements Radarr et Sonarr de toutes les instances, problèmes d'abord, relus toutes les 10 s ; un téléchargement en cours ou en attente d'import ouvre la file de l'instance, un import bloqué sa gestion (administrateurs), les autres titres leur fiche | Radarr ou Sonarr            |
| Téléchargés par jour | Volume téléchargé par jour sur les 30 derniers jours, avec le total et la moyenne par jour (administrateurs)                                                                                                                                                    | Un client de téléchargement |
| Espace disque        | Occupation des disques qui portent les dossiers racines de Radarr et Sonarr, alerte au-delà de 90 % (administrateurs)                                                                                                                                           | Radarr ou Sonarr            |
| Demandes en attente  | Les 5 dernières demandes Seerr en attente                                                                                                                                                                                                                       | Seerr                       |
| Santé des services   | Une pastille par instance Radarr/Sonarr et par service configuré, relue toutes les 30 s                                                                                                                                                                         | —                           |
| Activité en cours    | Lectures en cours et récemment vues, relues toutes les 10 s ; une lecture ouvre la même fenêtre que la page Tracearr (détail du flux, avec **Arrêter la lecture** pour les administrateurs) ou Tautulli (métadonnées Plex)                                      | Tautulli ou Tracearr        |
| Activité Emby        | Lectures en cours sur Emby                                                                                                                                                                                                                                      | Emby                        |
| Transmission         | Vitesses, compteurs et téléchargements actifs                                                                                                                                                                                                                   | Transmission                |
| Ma watchlist         | Les 16 derniers titres ajoutés à la watchlist                                                                                                                                                                                                                   | TMDB                        |
| Tendances            | Titres tendance de la semaine                                                                                                                                                                                                                                   | TMDB                        |
| Derniers ajouts      | Les 16 derniers titres ajoutés à vos bibliothèques                                                                                                                                                                                                              | Radarr ou Sonarr            |

Chaque section se charge seule : un service lent ou en panne n'empêche pas les autres de s'afficher, et une section dont le service n'est pas configuré n'apparaît pas. Les bibliothèques sont partagées avec les pages Films et Séries (aucun appel en double) et les agrégats coûteux sont gardés 45 secondes.

## Statistiques

Deux sections réservées aux administrateurs résument les téléchargements et le stockage. Leurs chiffres sont relus au plus toutes les 5 minutes.

- **Téléchargés par jour** additionne la taille des téléchargements terminés chaque jour (fuseau d'affichage) sur les 30 derniers jours, pour chaque client configuré : qBittorrent, Transmission et Deluge (torrents terminés), SABnzbd et NZBGet (historique réussi). Le survol d'une barre donne le jour et son volume. Hubarr ne stocke rien : le graphique part de ce que les clients listent encore, donc un torrent ou un élément d'historique supprimé de son client n'est plus compté. Un client qui ne répond pas est nommé et laissé hors du total.
- **Espace disque** affiche une barre par disque portant un dossier racine de Radarr ou de Sonarr, avec l'espace libre, la taille totale et les dossiers qu'il porte. Un disque vu par plusieurs instances n'apparaît qu'une fois, même monté à des chemins différents dans leurs conteneurs (reconnu à sa taille et à son espace libre identiques). Un disque occupé à plus de 90 % est signalé **Presque plein**.

## Imports bloqués

Dans la section **Files d'attente**, un téléchargement dont l'import est bloqué, ou que Radarr ou Sonarr signalent en avertissement ou en erreur, affiche son motif sous son titre. Un clic ouvre sa gestion :

- **Motif** : les messages donnés par Radarr ou Sonarr.
- **Fichiers du téléchargement** : les fichiers du téléchargement tels que Radarr ou Sonarr les lisent, avec les raisons pour lesquelles ils refusent de les importer. Pour chaque fichier, vous pouvez corriger le **film** (Radarr) ou la **série, la saison et les épisodes** (Sonarr), cherchés dans la bibliothèque de l'instance, ainsi que la **qualité**, les **langues** et le **groupe de release**. Les fichiers reconnus et non refusés sont cochés ; cochez les autres vous-même pour les importer malgré tout.
- **Importer** envoie les fichiers cochés à Radarr ou Sonarr (import manuel, dans le mode d'import de l'instance : un torrent encore en partage est copié ou lié, pas déplacé). La fenêtre suit l'import jusqu'à sa fin, puis le téléchargement quitte la file.
- **Retirer de la file** sort le téléchargement de la file, en le supprimant aussi du client de téléchargement et en ajoutant la release à la liste de blocage si vous le souhaitez.

La même fenêtre s'ouvre depuis les pages **File d'attente** de [Radarr](./radarr#file-d-attente) et de [Sonarr](./sonarr#file-d-attente), avec le bouton **Gérer l'import** de la ligne.

## Aperçu rapide

Un clic sur une affiche ouvre un **aperçu rapide** : synopsis, genres, note, état dans la bibliothèque, dates de sortie (cinéma, numérique, physique ou diffusion), plateformes de streaming et distribution. Le bouton principal ouvre la fiche dans Radarr ou Sonarr si le titre y est déjà (instance exacte), sinon la fiche de la découverte ; un administrateur peut aussi l'**ajouter** directement.

## Mise en page

Un administrateur peut **modifier la mise en page** : glisser une section par sa poignée (à la souris ou au doigt) ou boutons Monter/Descendre pour l'ordre, interrupteur pour masquer une section, puis **Enregistrer**. Le même réglage existe dans **Paramètres → Affichage**. Le bandeau reste toujours en haut.

## Menu de santé

L'icône en forme de cœur de la barre du haut résume l'état des services : sa pastille est verte si tous répondent, orange si une partie seulement, rouge sinon. Le menu ne liste que les services configurés, une ligne par instance Radarr et Sonarr.
