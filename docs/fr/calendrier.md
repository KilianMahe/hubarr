# Calendrier

Le calendrier (`/calendrier`) réunit les sorties de films (cinéma, numérique, physique) de toutes vos instances Radarr et les épisodes de toutes vos instances Sonarr, sur 90 jours avant et après aujourd'hui. Un même film suivi par deux instances (1080p et 4K, par exemple) n'apparaît qu'une fois.

## Vues et filtres

- **Mois**, **Semaine** et **Jour** (agenda détaillé) ; la vue choisie est mémorisée par le navigateur. Une adresse comme `/calendrier?view=day&date=2026-11-25` ouvre directement un jour.
- Dans le mois, cliquez sur un jour pour lister ses sorties sous la grille (le calendrier reste en vue mois). **Sur mobile**, le mois affiche une pastille de couleur par sortie. La semaine s'affiche en liste, un bloc par jour.
- Filtres par **type** (cinéma, numérique, physique, épisodes) et par **état** (suivi, non suivi, disponible).
- Un clic sur un événement ouvre son aperçu rapide.

Si une instance ne répond pas, une bannière l'indique sans masquer les autres. Un service que vous n'utilisez pas (aucune instance active) n'affiche jamais de bannière.

## Abonnement iCal

Le bouton **iCal** donne l'adresse du flux : `https://votre-hubarr/calendrier.ics`. Ajoutez-la comme calendrier abonné dans votre application (Apple Calendrier, Thunderbird…). Le flux couvre 30 jours passés et 180 jours à venir ; chaque événement garde le même identifiant d'une instance à l'autre, l'application le met donc à jour au lieu de le dupliquer.

::: warning Session requise
Le flux exige une session Hubarr : il fonctionne dans un navigateur connecté, mais pas encore dans les applications qui ne transmettent pas le cookie de session.
:::
