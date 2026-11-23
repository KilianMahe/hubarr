# Connecter Bazarr

Hubarr pilote [Bazarr](https://www.bazarr.media) : sous-titres manquants des films et des épisodes, recherche et téléchargement chez les fournisseurs, recherche automatique, historique, et badges de sous-titres dans les bibliothèques Radarr et Sonarr. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans Bazarr, copiez la **clé d'API** (_Settings → General → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Bazarr**, renseignez l'**URL** (par exemple `http://bazarr:6767`) et la clé d'API.
3. **Tester** vérifie la connexion ; enregistrez.

## Pages

- **Recherchés** : films et épisodes sans sous-titres, fournisseurs actifs, et les éléments auxquels il manque le plus de sous-titres, avec **Recherche automatique**.
- **Films** et **Séries** : toute la bibliothèque de Bazarr, avec recherche par titre, filtres (complet, manquant, non suivi), langue manquante et tri. Un film ouvre la **recherche de sous-titres** ; une série ouvre la liste de ses épisodes.
- **Épisodes d'une série** : saison, épisode, titre, langues audio et état ; **Rechercher** sur un épisode sans sous-titres.
- **Historique** : sous-titres téléchargés pour les films et les épisodes.

La **recherche de sous-titres** liste les résultats des fournisseurs (langue, malentendants, forcé, score, version, auteur) ; **Télécharger** installe celui choisi.

## Badges dans les bibliothèques

Les affiches des bibliothèques Radarr et Sonarr portent un badge : « Manquant n » (un film ouvre la recherche de sous-titres, une série mène à ses épisodes dans Bazarr) ou « Sous-titres » quand tout est là. La fiche d'un film montre aussi ses langues présentes et manquantes.

Bazarr ne connaît qu'une instance Radarr et une instance Sonarr : les badges ne s'affichent que si une seule instance du service est active dans Hubarr.

## Chargement des données

Hubarr garde les données de Bazarr en cache et les rafraîchit en arrière-plan : les badges et les pages ne ralentissent jamais. Juste après un démarrage, la page indique que les données se chargent et se relit seule ; si elles n'arrivent pas, **Réessayer** force leur chargement. Un sous-titre téléchargé depuis Hubarr est pris en compte aussitôt ; un changement fait dans Bazarr apparaît en une minute environ.

## En cas de problème

- **« Bazarr ne répond pas »** : l'URL n'est pas joignable depuis le conteneur Hubarr, ou Bazarr est arrêté.
- **Pas de badge** : Bazarr ne suit pas l'élément (aucun profil de langues), ou plusieurs instances Radarr/Sonarr sont actives.
- **Téléchargement refusé** : le fournisseur a refusé (quota atteint, résultat expiré) ; relancez la recherche.
