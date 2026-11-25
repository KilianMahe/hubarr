# Connecter Radarr

Hubarr pilote une ou plusieurs instances [Radarr](https://radarr.video) (v4 ou v5, API v3) : bibliothèque de films, fiches, recherches, file d'attente et pages de suivi. Ces écrans sont réservés aux administrateurs.

## Ajouter l'instance

1. Dans Radarr, copiez la **clé d'API** (_Settings → General → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Radarr** et cliquez sur **Ajouter une instance**.
3. Renseignez un **nom** (« Radarr », « Radarr 4K »…), l'**URL** telle que Hubarr la joint (par exemple `http://radarr:7878` si les deux conteneurs partagent un réseau Docker) et la clé d'API.
4. **Tester** vérifie la connexion ; enregistrez.
5. Facultatif : choisissez le **profil de qualité par défaut**, proposé à chaque ajout de film.

L'identifiant URL (slug) de l'instance apparaît dans les adresses : `/medias/<slug>/films`. Avec plusieurs instances, chacune a son entrée dans le menu latéral.

::: tip Accès réseau
Hubarr interroge Radarr depuis son conteneur : `localhost` désigne Hubarr lui-même. Utilisez le nom du service Docker ou l'adresse de la machine hôte. Les adresses de votre réseau local sont acceptées.
:::

## Bibliothèque

La page **Films** présente les statistiques de la bibliothèque, la **file d'attente** (repliable, actualisée toutes les deux secondes) et les avertissements de Radarr (aucun indexeur actif, problèmes de santé, imports bloqués). Chaque avertissement se ferme d'une croix : il reste masqué sur cet appareil tant que son texte ne change pas.

- **Recherche et filtres** : statut (suivis, téléchargés, manquants, non suivis), qualité, genre, langue, tri. Les critères sont gardés dans l'adresse de la page : un marque-page retrouve la même sélection.
- **Vues** : grille, mur d'affiches, liste détaillée, tableau ou étagères par statut, à choisir dans le menu **Affichage** (le même sur ordinateur et sur mobile). La page s'ouvre sur la vue choisie dans votre **profil** (par défaut, grille sur ordinateur et liste détaillée sur mobile) ; une vue choisie dans le menu ne vaut que pour la visite en cours.
- **Marque-page** d'une affiche : suivre ou ne plus suivre le film sans ouvrir sa fiche.
- **Ajouter** : recherche d'un film par titre. Chaque résultat propose **Voir** (sa fiche TMDB, ou sa fiche Hubarr si le film est déjà dans Radarr) et **Ajouter**, qui ouvre le formulaire : le film en tête, puis ses réglages en deux groupes, **Bibliothèque** (dossier racine, profil de qualité) et **Suivi** (recherche automatique). Le compte rendu de l'ajout reste affiché, avec **Voir** pour ouvrir la fiche du film. **Retour** revient aux résultats en conservant la recherche ; la croix ferme la fenêtre. Après l'ajout, Hubarr suit la recherche de Radarr pendant une minute. Avant toute saisie, la fenêtre propose les films tendance de la semaine (si TMDB est configuré) : un clic lance la recherche du titre et ouvre son formulaire. Le bouton **Ajouter** d'une fiche TMDB ouverte par **Voir** mène aussi au formulaire.
- **Mode sélection** : modifier (suivi, profil, disponibilité, dossier racine), étiqueter, renommer les fichiers ou supprimer plusieurs films à la fois. Sur ordinateur, Maj+clic sélectionne une plage.
- **Actions sur le filtre** : actualiser les films filtrés, ou lancer la recherche des films manquants du filtre.
- **Tout actualiser** et **synchronisation RSS**, suivies jusqu'à leur fin.

### File d'attente

La file a son onglet, **File d'attente** (`/medias/<slug>/films/file-attente`) ; elle reste aussi en tête de la bibliothèque, repliée. Dans l'onglet, le titre d'un film ouvre sa fiche, et chaque ligne propose **Actualiser** et **Scanner** pour son film.

Chaque téléchargement montre sa progression, son état (en cours, en attente d'import, import bloqué…) et les messages de Radarr. Vous pouvez **forcer l'import** d'un téléchargement bloqué, **forcer le téléchargement** d'un élément retardé ou le **supprimer** (en le retirant aussi du client de téléchargement, ou en l'ajoutant à la liste de blocage). Quand un film quitte la file, la bibliothèque est mise à jour.

Un import bloqué, un avertissement ou une erreur a aussi un bouton **Gérer l'import** (icône de clé) : il ouvre la même fenêtre que le tableau de bord, pour corriger le film, la qualité et les langues de chaque fichier avant un import manuel, ou retirer le téléchargement (voir [Imports bloqués](./tableau-de-bord#imports-bloques)).

## Fiche d'un film

Un clic sur un film ouvre sa **page**. Sur ordinateur, une colonne à gauche reste visible pendant le défilement : affiche, état (téléchargé, manquant, pas encore disponible, avec le suivi, la qualité et la taille), actions et chiffres clés (notes, qualité, taille). À droite : titre, durée, genres et liens, puis des cartes (synopsis, fichier, détails, historique, distribution, suggestions) ; la suppression est repliée en bas. Sur mobile, l'affiche et le titre partagent la première ligne, suivis de l'état, des actions et des chiffres. Son adresse, `/medias/<slug>/films/<id>`, peut être partagée ou mise en favori ; les anciennes adresses en `?open=<id>` y mènent toujours. Les sections longues (releases, modification, fichiers, historique complet) s'ouvrent en panneau, par le bas sur mobile.

- **Rechercher** : Radarr interroge ses indexeurs ; si rien n'est retenu, Hubarr interroge directement les indexeurs et télécharge la meilleure release acceptée par le profil.
- **Recherche interactive** : toutes les releases trouvées (jusqu'à 90 secondes), les plus pertinentes d'abord (acceptées, puis le classement de Radarr lui-même : qualité, score des formats personnalisés, protocole, priorité de l'indexeur, seeders), triables par colonne (un troisième clic sur un en-tête revient à la pertinence), avec le détail du score des formats personnalisés et la raison d'un refus ; téléchargez celle de votre choix.
- **Actualiser et scanner**, **suivre**, **retirer de Radarr**, **supprimer le fichier** ou **tout supprimer**.
- **Nommage** : nom actuel et nom attendu par Radarr, renommage en un clic.
- **Modifier** : suivi, disponibilité minimale, profil, chemin (avec un explorateur des dossiers du serveur Radarr) et étiquettes.
- **Gérer les fichiers** : qualité, langues et groupe de release de chaque fichier.
- Distribution et équipe (le marque-page d'une personne crée dans Radarr une liste d'import qui ajoutera ses films), titres alternatifs, historique et liste de blocage du film.
- **Recommandations** et **Similaires** (si TMDB est configuré) : deux rangées de titres TMDB, ceux déjà en bibliothèque marqués. Un film possédé ouvre sa fiche Hubarr ; un autre ouvre sa fiche TMDB, d'où l'ajouter.

## Pages de l'instance

Sur ordinateur, les onglets en haut de chaque page mènent aux autres pages. Sur mobile, la barre du bas donne accès à **Films**, **Manquants**, **File d'attente** et **Serveur** ; ce dernier onglet regroupe l'historique, les autres pages et les commandes de l'instance (tout actualiser, synchronisation RSS, rechercher tous les manquants). Le bouton central **+** ajoute un film depuis n'importe quelle page de l'instance.

| Page        | Contenu                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| Historique  | Évènements de Radarr, filtrables (capturé, importé, échec, supprimé, renommé)         |
| Blocklist   | Releases bloquées, suppression unitaire ou groupée                                    |
| Manquants   | Films suivis sans fichier ; recherche film par film ou de tous les manquants          |
| Cutoff      | Films sous le seuil de qualité de leur profil ; « Améliorer » relance une recherche   |
| Collections | Collections TMDb, suivi, films absents à ajouter                                      |
| Système     | Version, santé, espace disque, clients de téléchargement, indexeurs, journaux récents |

L'historique et la liste de blocage montrent d'abord les plus récents ; un clic sur un en-tête (date, film, et pour la liste de blocage source et indexeur) trie la colonne, un second l'inverse, et le champ de recherche filtre par titre de film. Le cutoff se filtre par titre et par profil de qualité, les collections par titre et par état (suivies, non suivies, avec des films manquants). Ces critères restent dans l'adresse de la page.

## En cas de problème

- **« Impossible de contacter Radarr »** : l'URL n'est pas joignable depuis le conteneur Hubarr, ou Radarr est arrêté. Le bandeau de la page donne la cause ; **Réessayer** relance la vérification.
- **Clé refusée** : le test de connexion l'indique ; recopiez la clé d'API.
- **Recherche interactive trop longue** : certains indexeurs sont lents ; Hubarr abandonne au bout de 90 secondes et l'indique.
- **Bibliothèque volumineuse** : la liste est gardée en cache et rafraîchie en arrière-plan ; une modification faite dans Hubarr apparaît aussitôt, une modification faite dans Radarr en moins d'une minute.

## Administration

Les réglages de l'instance (qualité, indexeurs, clients, nommage, sauvegardes…) s'ouvrent depuis **Paramètres → Services → Radarr**, icône **Paramètres** de l'instance : voir [Administration Radarr et Sonarr](./administration-arr.md).
