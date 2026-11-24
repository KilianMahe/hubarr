# Calendrier

Le calendrier (`/calendrier`, onglet **Calendrier** de l'[**Accueil**](./premier-demarrage.md#accueil)) réunit les sorties de films (cinéma, numérique, physique) de toutes vos instances Radarr et les épisodes de toutes vos instances Sonarr, sur 90 jours avant et après aujourd'hui. Un même film suivi par deux instances (1080p et 4K, par exemple) n'apparaît qu'une fois.

## Vues et filtres

- **Mois**, **Semaine** et **Jour** (agenda détaillé) ; la vue choisie est mémorisée par le navigateur. Une adresse comme `/calendrier?view=day&date=2026-11-25` ouvre directement un jour.
- Dans le mois, cliquez sur un jour pour lister ses sorties sous la grille (le calendrier reste en vue mois) ; les titres affichés dans une case ne sont qu'un aperçu, les sorties s'ouvrent depuis la liste. **Sur mobile**, le mois affiche une pastille de couleur par sortie. La semaine s'affiche en liste, un bloc par jour.
- Filtres par **type** (cinéma, numérique, physique, épisodes, chacun avec son icône) et par **statut de téléchargement**.
- Un clic sur un événement ouvre son aperçu rapide.

Si une instance ne répond pas, une bannière l'indique sans masquer les autres. Un service que vous n'utilisez pas (aucune instance active) n'affiche jamais de bannière.

## Couleurs

Chaque sortie a la couleur de son **statut de téléchargement** ; les filtres de statut servent de légende :

| Couleur | Statut     | Signification                                                                                                                                                                                                           |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vert    | Téléchargé | Le fichier est présent.                                                                                                                                                                                                 |
| Orange  | En cours   | Le film ou l'épisode est dans la file de l'instance.                                                                                                                                                                    |
| Rouge   | Manquant   | Sorti (ou diffusé) et suivi, sans fichier. Pour un film, « sorti » suit sa disponibilité minimale dans Radarr : annoncé, en salle, ou sorti (sortie numérique ou physique, à défaut 90 jours après la sortie en salle). |
| Bleu    | À venir    | Suivi, pas encore sorti.                                                                                                                                                                                                |
| Gris    | Non suivi  | Non suivi et sans fichier.                                                                                                                                                                                              |

Le type de sortie (cinéma, numérique, physique, épisode) est indiqué par son icône et son libellé.

## Abonnement iCal

Le bouton **iCal** donne l'adresse du flux : `https://votre-hubarr/calendrier.ics`. Ajoutez-la comme calendrier abonné dans votre application (Apple Calendrier, Thunderbird…). Le flux couvre 30 jours passés et 180 jours à venir ; chaque événement garde le même identifiant d'une instance à l'autre, l'application le met donc à jour au lieu de le dupliquer.

::: warning Session requise
Le flux exige une session Hubarr : il fonctionne dans un navigateur connecté, mais pas encore dans les applications qui ne transmettent pas le cookie de session.
:::
