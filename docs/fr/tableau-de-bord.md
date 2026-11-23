# Tableau de bord

Le tableau de bord rassemble les signaux de tous vos services sur un seul écran. Il s'ouvre à l'adresse `/tableau-de-bord` ; c'est aussi la page d'accueil par défaut (modifiable dans **Paramètres → Affichage**).

## Bandeau

En haut, la salutation, le jour et l'heure (fuseau des préférences d'affichage), puis une mise en avant : un film de votre bibliothèque Radarr au hasard (avec une image de fond), à défaut un titre tendance de TMDB. Trois compteurs suivent : films, séries et sorties des 7 prochains jours.

## Sections

| Section             | Contenu                                                                                                                                        | Service requis       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Prochaines sorties  | Grille de 7 jours (films et épisodes), 3 titres par jour puis un lien vers le calendrier                                                       | Radarr ou Sonarr     |
| Files d'attente     | Téléchargements Radarr et Sonarr de toutes les instances, problèmes d'abord, relus toutes les 10 s ; un titre ouvre sa fiche (administrateurs) | Radarr ou Sonarr     |
| Demandes en attente | Les 5 dernières demandes Seerr en attente                                                                                                      | Seerr                |
| Santé des services  | Une pastille par instance Radarr/Sonarr et par service configuré, relue toutes les 30 s                                                        | —                    |
| Activité en cours   | Lectures en cours et récemment vues, relues toutes les 10 s                                                                                    | Tautulli ou Tracearr |
| Activité Emby       | Lectures en cours sur Emby                                                                                                                     | Emby                 |
| Transmission        | Vitesses, compteurs et téléchargements actifs                                                                                                  | Transmission         |
| Ma watchlist        | Les 16 derniers titres ajoutés à la watchlist                                                                                                  | TMDB                 |
| Tendances           | Titres tendance de la semaine                                                                                                                  | TMDB                 |
| Derniers ajouts     | Les 16 derniers titres ajoutés à vos bibliothèques                                                                                             | Radarr ou Sonarr     |

Chaque section se charge seule : un service lent ou en panne n'empêche pas les autres de s'afficher, et une section dont le service n'est pas configuré n'apparaît pas. Les bibliothèques sont partagées avec les pages Films et Séries (aucun appel en double) et les agrégats coûteux sont gardés 45 secondes.

## Aperçu rapide

Un clic sur une affiche ouvre un **aperçu rapide** : synopsis, genres, note, état dans la bibliothèque, dates de sortie (cinéma, numérique, physique ou diffusion), plateformes de streaming et distribution. Le bouton principal ouvre la fiche dans Radarr ou Sonarr si le titre y est déjà (instance exacte), sinon la fiche de la découverte ; un administrateur peut aussi l'**ajouter** directement.

## Mise en page

Un administrateur peut **modifier la mise en page** : glisser-déposer ou boutons Monter/Descendre pour l'ordre, interrupteur pour masquer une section, puis **Enregistrer**. Le même réglage existe dans **Paramètres → Affichage**. Le bandeau reste toujours en haut.

## Menu de santé

L'icône en forme de cœur de la barre du haut résume l'état des services : sa pastille est verte si tous répondent, orange si une partie seulement, rouge sinon. Le menu ne liste que les services configurés, une ligne par instance Radarr et Sonarr.
