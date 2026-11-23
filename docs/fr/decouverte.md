# Découverte et watchlist

La découverte (`/decouverte`) explore le catalogue de [TMDB](https://www.themoviedb.org/) et indique, sur chaque affiche, si le titre est déjà dans une de vos bibliothèques (disponible, manquant, annoncé, partiel, non suivi).

## Configurer TMDB

1. Créez une clé d'API sur [themoviedb.org](https://www.themoviedb.org/settings/api) (gratuite).
2. Dans Hubarr, ouvrez **Paramètres → Services → TMDb**, collez la clé, **Tester**, puis enregistrez.
3. La langue des titres et des synopsis se règle dans **Paramètres → Langues**.

## Accueil et recherche

- Tendances (film et série de la semaine), **Pour vous** (recommandations tirées de vos derniers ajouts), **Consultés récemment** (gardés dans le navigateur) et les listes TMDB : populaires, à venir, en cours de diffusion, mieux notés.
- La **recherche** (touche `/` pour y aller) classe les résultats par pertinence : titre exact, titre qui commence par la requête, popularité ; une année tapée (« dune 1984 ») choisit la bonne version. Elle corrige les fautes de frappe (« interstelar » → _Interstellar_) et propose « Vouliez-vous dire… » quand elle trouve peu ; le lien **Chercher plutôt** revient à la requête exacte. Une personne connue prend la première place quand on tape son nom.
- Filtres : type, genre, note minimale, tri, et **Masquer ce que j'ai**. Sans texte, les filtres parcourent le catalogue (« Charger plus »).

## Fiche d'un titre

Une affiche ouvre la fiche : synopsis, distribution, équipe, saisons, plateformes de streaming, classification, critiques, galerie et titres similaires. Son adresse (`/decouverte?detail=movie/603`) se partage. La bande-annonce s'ouvre sur YouTube.

## Ajout rapide

Les administrateurs ajoutent un titre à Radarr ou Sonarr depuis une affiche, une fiche, un aperçu rapide ou la recherche globale : instance cible (celles qui l'ont déjà sont signalées), profil de qualité (celui de l'instance est présélectionné), dossier racine, puis disponibilité minimale et recherche automatique (film), ou type de série, épisodes suivis, dossiers de saison et recherche des manquants (série).

## Explorateur

`/decouverte/explorer` filtre TMDB par type, genres, décennie et tri (populaires, mieux notés, plus récents, box-office), et recherche une **collection** ou un **acteur** pour afficher tous ses titres.

## Watchlist

L'étoile d'une affiche ajoute le titre à la **watchlist**, commune à tous les utilisateurs. La page `/decouverte/watchlist` la filtre (films, séries, texte), la trie, permet d'y noter un commentaire et d'en retirer un titre.

## Recherche globale

Pour les administrateurs, le champ de la barre du haut (raccourci `Ctrl+K`, plein écran sur mobile) cherche dans toutes vos bibliothèques puis en ligne via Radarr et Sonarr, avec le statut des sous-titres quand Bazarr est relié. Un résultat ouvre son aperçu rapide ; un titre absent s'ajoute en deux clics. Les dernières recherches sont gardées dans le navigateur.
