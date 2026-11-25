# Découverte et watchlist

La découverte (`/decouverte`, onglet **Découverte** de l'[**Accueil**](./premier-demarrage.md#accueil)) explore le catalogue de [TMDB](https://www.themoviedb.org/) et indique, sur chaque affiche, si le titre est déjà dans une de vos bibliothèques (disponible, manquant, annoncé, partiel, non suivi).

## Configurer TMDB

1. Créez une clé d'API sur [themoviedb.org](https://www.themoviedb.org/settings/api) (gratuite).
2. Dans Hubarr, ouvrez **Paramètres → Services → TMDb**, collez la clé, **Tester**, puis enregistrez.
3. La langue des titres et des synopsis se règle dans **Paramètres → Langues**.

## Accueil et recherche

Sous le champ de recherche, quatre chips partagent l'accueil de la découverte ; seules les rangées de la chip affichée sont chargées. La chip est gardée dans l'adresse (`/decouverte?onglet=tendances`) : elle se met en favori et survit au rechargement. Sans elle, **Pour vous** s'ouvre, ou **Tendances** quand Pour vous n'a encore rien à montrer.

- **Pour vous** :
  - **D'après votre bibliothèque** : recommandations tirées de vos derniers ajouts ;
  - **D'après ce que tu as regardé** : recommandations tirées des derniers titres regardés, quand votre compte est associé à Tracearr (voir [Tracearr](./tracearr.md#vu)). Les titres déjà vus sont écartés ; ceux d'une bibliothèque restent, marqués, car posséder un titre ne veut pas dire l'avoir vu ;
  - **Pour « dossier »** : une rangée par dossier racine de chaque instance Radarr et Sonarr par exemple **Pour « Enfants »**, avec l'instance en sous-titre (« dossier de Films »). Elle réunit les recommandations TMDB des derniers titres ajoutés au dossier (20 au plus), place d'abord ceux que plusieurs d'entre eux recommandent, et écarte les titres déjà en bibliothèque. Les rangées sont calculées en arrière-plan et rafraîchies toutes les 6 heures ; un titre que vous ajoutez en disparaît aussitôt ;
  - **Consultés récemment** (gardés dans le navigateur).
- **Tendances** : film et série de la semaine, tendances de la semaine, films et séries populaires, prochaines sorties ciné, séries en cours de diffusion.
- **Les mieux notés** : films et séries les mieux notés.
- **Par année** : **Populaires en [année]**, les films ou les séries les plus populaires d'une année, choisie dans le sélecteur de la rangée (l'année en cours par défaut), avec les titres déjà en bibliothèque marqués.

Pendant une recherche, les résultats remplacent les chips.

Les rangées n'ont pas de barre de défilement : des flèches à leurs bords les font défiler, sur ordinateur comme sur mobile, et chaque flèche disparaît en bout de rangée ; sur écran tactile, une rangée se fait aussi glisser au doigt.

- La **recherche** (touche `/` pour y aller) classe les résultats par pertinence : titre exact, titre qui commence par la requête, popularité ; une année tapée (« dune 1984 ») choisit la bonne version. Elle corrige les fautes de frappe (« interstelar » → _Interstellar_) et propose « Vouliez-vous dire… » quand elle trouve peu ; le lien **Chercher plutôt** revient à la requête exacte. Une personne connue prend la première place quand on tape son nom.
- Filtres : type (tous, films, séries ou **Animés**), genre, note minimale, tri, et **Masquer ce que j'ai**. Sans texte, les filtres parcourent le catalogue (« Charger plus »).

## Fiche d'un titre

Une affiche ouvre la fiche : synopsis, distribution, équipe, saisons, plateformes de streaming, classification, critiques, galerie et titres similaires. Son adresse (`/decouverte?detail=movie/603`) se partage. La bande-annonce s'ouvre sur YouTube.

## Ajout rapide

Les administrateurs ajoutent un titre à Radarr ou Sonarr depuis une affiche, une fiche, un aperçu rapide ou la recherche globale : instance cible (celles qui l'ont déjà sont signalées), profil de qualité (celui de l'instance est présélectionné), dossier racine, puis disponibilité minimale et recherche automatique (film), ou type de série, épisodes suivis, dossiers de saison et recherche des manquants (série).

## Explorateur

TMDB n'a pas de type « animé » : Hubarr considère comme animés les titres du genre Animation dont la langue originale est le japonais, comme lorsqu'il règle le type d'une série sur « anime » avant de l'ajouter à Sonarr.

`/decouverte/explorer` (onglet **Explorer** de l'accueil) filtre TMDB par type (films, séries, ou **Animés** avec un choix séries / films), genres, décennie ou **année** précise (choisir l'une efface l'autre) et tri (populaires, mieux notés, plus récents, box-office), et recherche une **collection** ou un **acteur** pour afficher tous ses titres.

## Watchlist

L'étoile d'une affiche ajoute le titre à la **watchlist**, commune à tous les utilisateurs. La page `/decouverte/watchlist` (onglet **Watchlist** de l'accueil) la filtre (films, séries, texte), la trie, permet d'y noter un commentaire et d'en retirer un titre.

## Recherche globale

Pour les administrateurs, le champ de la barre du haut (raccourci `Ctrl+K`, plein écran sur mobile) cherche dans toutes vos bibliothèques puis en ligne via Radarr et Sonarr, avec le statut des sous-titres quand Bazarr est relié. Un résultat ouvre son aperçu rapide ; un titre absent s'ajoute en deux clics. Les dernières recherches sont gardées dans le navigateur.
