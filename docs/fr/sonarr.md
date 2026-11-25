# Connecter Sonarr

Hubarr pilote une ou plusieurs instances [Sonarr](https://sonarr.tv) (v4, API v3) : bibliothèque de séries, fiches avec saisons et épisodes, recherches, file d'attente et pages de suivi. Ces écrans sont réservés aux administrateurs.

## Ajouter l'instance

1. Dans Sonarr, copiez la **clé d'API** (_Settings → General → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Sonarr** et cliquez sur **Ajouter une instance**.
3. Renseignez un **nom** (« Sonarr », « Animés »…), l'**URL** telle que Hubarr la joint (par exemple `http://sonarr:8989` si les deux conteneurs partagent un réseau Docker) et la clé d'API.
4. **Tester** vérifie la connexion ; enregistrez.
5. Facultatif : choisissez le **profil de qualité par défaut**, proposé à chaque ajout de série.

L'identifiant URL (slug) de l'instance apparaît dans les adresses : `/medias/<slug>/series`. Avec plusieurs instances, chacune a son entrée dans le menu latéral.

::: tip Accès réseau
Hubarr interroge Sonarr depuis son conteneur : `localhost` désigne Hubarr lui-même. Utilisez le nom du service Docker ou l'adresse de la machine hôte.
:::

## Bibliothèque

La page **Séries** présente les statistiques (total, en cours, terminées, taille), la **file d'attente**, les **prochains épisodes** des 14 jours à venir (carte repliable) et les avertissements de Sonarr (problèmes de santé, imports bloqués). Chaque avertissement se ferme d'une croix : il reste masqué sur cet appareil tant que son texte ne change pas.

- **Recherche et filtres** : statut (suivies, en cours, terminées, animés, non suivies, épisodes manquants), genre, chaîne, tri (dont la progression). Les critères sont gardés dans l'adresse de la page.
- **Vues** : grille, mur d'affiches, liste détaillée, tableau ou étagères (en cours, animés, terminées, à venir, non suivies). La pastille d'une affiche indique l'état : complète, à jour, épisodes manquants, à venir ou non suivie ; la barre montre la progression des épisodes. Le menu **Affichage** (le même sur ordinateur et sur mobile) change de vue. La page s'ouvre sur la vue choisie dans votre **profil** (par défaut, grille sur ordinateur et liste détaillée sur mobile) ; une vue choisie dans le menu ne vaut que pour la visite en cours.
- **Marque-page** d'une affiche : suivre ou ne plus suivre la série sans ouvrir sa fiche.
- **Ajouter** : recherche d'une série par titre. Chaque résultat propose **Voir** (sa fiche TMDB, ou sa fiche Hubarr si la série est déjà dans Sonarr) et **Ajouter**, qui ouvre le formulaire, en deux groupes : **Bibliothèque** (dossier racine, profil de qualité, type : standard, quotidienne, animé) et **Suivi** (épisodes à suivre, dossiers par saison, recherche des manquants, étiquettes). Le compte rendu de l'ajout reste affiché, avec **Voir** pour ouvrir la fiche de la série. **Retour** revient aux résultats en conservant la recherche ; la croix ferme la fenêtre. Avant toute saisie, la fenêtre propose les séries tendance de la semaine (si TMDB est configuré) : un clic lance la recherche du titre et ouvre son formulaire. Le bouton **Ajouter** d'une fiche TMDB ouverte par **Voir** mène aussi au formulaire.
- **Mode sélection** : modifier (suivi, profil, type, dossier racine, dossiers par saison), étiqueter, renommer les fichiers ou supprimer plusieurs séries à la fois. Sur ordinateur, Maj+clic sélectionne une plage.
- **Actions sur le filtre** : actualiser les séries filtrées, ou rechercher les épisodes manquants des séries filtrées.
- **Tout actualiser** et **synchronisation RSS**, suivies jusqu'à leur fin.

### Prochains épisodes

L'onglet **Prochains** (`/medias/<slug>/series/prochains`) liste les épisodes des 14 prochains jours, un bloc par jour (aujourd'hui, demain, puis la date) : série, épisode, heure de diffusion et état (disponible, manquant s'il est déjà diffusé, à venir). Un épisode ouvre la fiche de sa série.

### File d'attente

La file a son onglet, **File d'attente** (`/medias/<slug>/series/file-attente`) ; elle reste aussi en tête de la bibliothèque, repliée. Dans l'onglet, le nom d'une série ouvre sa fiche, et chaque ligne propose **Actualiser** (relecture des informations) et **Scanner** (analyse des fichiers sur le disque) pour sa série.

Chaque téléchargement montre la série et l'épisode, sa progression, son état et les messages de Sonarr. Vous pouvez **forcer le téléchargement** d'un élément retardé ou le **supprimer** (il est aussi retiré du client de téléchargement). Un import bloqué, un avertissement ou une erreur a aussi un bouton **Gérer l'import** (icône de clé) : il ouvre la même fenêtre que le tableau de bord, pour corriger la série, la saison, les épisodes, la qualité et les langues de chaque fichier avant un import manuel, ou retirer le téléchargement avec les options de votre choix (voir [Imports bloqués](./tableau-de-bord#imports-bloques)). Quand des éléments sont en avertissement, un bandeau propose de :

- **nettoyer les doublons** : les téléchargements dont tous les fichiers sont « déjà importés » ;
- **importer les fichiers** des autres : Sonarr reconnaît les épisodes de chaque téléchargement, puis Hubarr lance l'import et donne le bilan (fichiers importés, ignorés et pourquoi).

## Fiche d'une série

Un clic sur une série ouvre sa **page**, à l'adresse `/medias/<slug>/series/<id>` (les anciennes adresses en `?open=<id>` y mènent toujours). Sur ordinateur, une colonne à gauche reste visible pendant le défilement : affiche, état (épisodes présents, suivi, statut de diffusion), actions et chiffres clés (note, saisons, taille). À droite : titre, chaîne, genres, puis des cartes (synopsis, saisons avec épisodes téléchargés, taille et manquants, suggestions, historique) ; la suppression est repliée en bas. Sur mobile, l'affiche et le titre partagent la première ligne, suivis de l'état, des actions et des chiffres. Recherche interactive, renommage, fichiers, modification et historique complet s'ouvrent en panneau, par le bas sur mobile.

- **Rechercher les manquants** : les épisodes suivis et déjà diffusés sans fichier ; une saison entièrement manquante est cherchée en pack.
- **Saisons et épisodes** : la saison la plus récente est ouverte, et dans chaque saison le dernier épisode vient en premier. Chaque saison affiche ses épisodes présents et sa progression, avec le suivi et la recherche à portée de main ; recherche interactive, gestion des fichiers, renommage et historique sont dans son menu **⋮**. Le numéro de chaque épisode prend la couleur de son état : téléchargé (vert), en téléchargement ou en attente d'import, avec sa progression (dans la file de Sonarr, couleur d'accent), manquant (orange), à venir (bleu), non suivi (gris). Pour chaque épisode : suivi (Maj+clic pour une plage), qualité, score, informations techniques, recherche, recherche interactive et suppression du fichier.
- **Recherche interactive** d'un épisode ou d'une saison : releases les plus pertinentes d'abord (acceptées, puis le classement de Sonarr lui-même), triables par colonne, avec la saison ou les épisodes couverts et la numérotation TVDB quand elle diffère.
- **Renommer les fichiers** : noms actuels et nouveaux, à cocher.
- **Gérer les fichiers** : saison et épisode (réattribution d'un fichier), qualité, langues, groupe, type de release et drapeaux d'indexeur, modifiables ligne par ligne ou pour une sélection.
- **Modifier** : suivi, nouvelles saisons, dossiers par saison, profil, type, chemin (avec un explorateur des dossiers du serveur Sonarr) et étiquettes.
- **Historique**, **actualiser et scanner**, **supprimer** (avec ou sans les fichiers).
- **Recommandations** et **Similaires** (si TMDB est configuré) : deux rangées de séries TMDB, celles déjà en bibliothèque marquées. Une série possédée ouvre sa fiche Hubarr ; une autre ouvre sa fiche TMDB, d'où l'ajouter.

## Pages de l'instance

Sur ordinateur, les onglets en haut de chaque page mènent aux autres pages. Sur mobile, la barre du bas donne accès à **Séries**, **Prochains**, **File d'attente** et **Serveur** (manquants, historique, autres pages et commandes de l'instance), avec au centre le bouton **+** d'ajout d'une série.

| Page       | Contenu                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| Historique | Évènements de Sonarr (capturé, importé, supprimé, renommé, échec)                     |
| Blocklist  | Releases bloquées, suppression unitaire ou groupée                                    |
| Manquants  | Épisodes suivis sans fichier ; recherche épisode par épisode ou de tous les manquants |
| Cutoff     | Épisodes sous le seuil de qualité de leur profil, avec la qualité actuelle            |
| Système    | Version, santé, espace disque, clients de téléchargement, indexeurs, journaux récents |

L'historique et la liste de blocage montrent d'abord les plus récents ; un clic sur un en-tête (date, série, et pour la liste de blocage source) trie la colonne, un second l'inverse, et le champ de recherche filtre par titre de série. Le cutoff se filtre par titre de série et par profil de qualité. Ces critères restent dans l'adresse de la page.

## En cas de problème

- **« Impossible de contacter Sonarr »** : l'URL n'est pas joignable depuis le conteneur Hubarr, ou Sonarr est arrêté. Le bandeau de la page donne la cause ; **Réessayer** relance la vérification.
- **Ajout refusé** : le message de Sonarr est affiché tel quel (série déjà présente, dossier introuvable…).
- **Import impossible** : le bilan liste les raisons données par Sonarr (épisode non reconnu, fichier déjà présent…) ; renommez les fichiers puis relancez l'import.
- **Bibliothèque volumineuse** : la liste est gardée en cache et rafraîchie en arrière-plan ; une modification faite dans Hubarr apparaît aussitôt, une modification faite dans Sonarr en moins d'une minute.

## Administration

Les réglages de l'instance (qualité, indexeurs, clients, nommage, sauvegardes…) s'ouvrent depuis **Paramètres → Services → Sonarr**, icône **Paramètres** de l'instance : voir [Administration Radarr et Sonarr](./administration-arr.md).
