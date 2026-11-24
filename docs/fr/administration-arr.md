# Administration Radarr et Sonarr

Hubarr reprend les réglages de vos instances [Radarr](https://radarr.video) et [Sonarr](https://sonarr.tv) : profils de qualité, indexeurs, clients de téléchargement, nommage, sauvegardes… Les mêmes écrans servent les deux services, avec les différences propres à chacun. Ils sont réservés aux administrateurs.

## Accéder aux réglages

Les pages de configuration et de système d'une instance s'ouvrent depuis **Paramètres → Services**, par l'icône **Paramètres** (roue dentée) de l'instance dans la carte Radarr ou Sonarr. Chaque page garde son adresse (`/medias/<slug>/radarr/qualite`…) et affiche un bouton **Retour aux paramètres**, puis deux rangées d'onglets : les groupes ci-dessous, puis les pages du groupe. Sur mobile, les groupes sont dans la barre du bas, et un appui sur un groupe liste ses pages. Les pages d'usage (commandes, calendrier Sonarr, import de bibliothèque, suggestions, exclusions) restent dans la navigation de l'instance : menu **Plus** sur ordinateur, onglet **Serveur** sur mobile. Les pages sont groupées comme dans Radarr et Sonarr :

| Groupe       | Pages                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Activité     | Commandes ; Calendrier (Sonarr)                                                                                |
| Recherché    | Import de bibliothèque                                                                                         |
| Découverte   | Suggestions (Radarr), Exclusions                                                                               |
| Profils      | Qualité, Profils de délai, Formats personnalisés, Filtres personnalisés                                        |
| Intégrations | Indexeurs, Clients de téléchargement, Listes d'import, Notifications                                           |
| Général      | Auto-tags, Tags, Renommer (Radarr), Gestion des médias, Interface, Dossiers racine, Chemins distants, Metadata |
| Système      | Général (hôte), Tâches, Logs, Stats, Parser un titre, Sauvegardes, Mises à jour                                |

Chaque page garde l'adresse de l'original : `/medias/<slug>/radarr/qualite`, `/medias/<slug>/sonarr/indexeurs`…

## Indexeurs, clients, listes, notifications, métadonnées

Ces éléments sont décrits par l'instance elle-même : le formulaire affiche les champs que Radarr ou Sonarr annonce pour chaque type.

1. **Ajouter** ouvre le formulaire ; choisissez le **type** (Newznab, Torznab, qBittorrent, Discord…). Le nom est pré-rempli avec le type.
2. Renseignez les champs. Les listes de catégories proposent les catégories Newznab standard ; les listes libres s'éditent comme des étiquettes.
3. Les options propres à la famille s'affichent au-dessus des champs : RSS, recherches et priorité d'un indexeur ; activation et priorité d'un client ; profil et dossier racine d'une liste ; **déclencheurs** d'une notification (ceux que le type prend en charge).
4. **Tester** demande à l'instance de vérifier la configuration et affiche sa réponse ; **Enregistrer** crée ou modifie l'élément.

Les consommateurs de **métadonnées** ne se créent pas : on les active, les désactive ou les modifie.

::: info Mots de passe et clés d'API
Hubarr n'affiche jamais un mot de passe ni une clé d'API enregistrés : le champ montre `********`. Laissé tel quel, il garde la valeur actuelle à l'enregistrement ; saisissez une nouvelle valeur pour la remplacer. La clé d'API de l'instance (page **Général**) n'est ni affichée ni modifiable depuis Hubarr.
:::

## Profils

- **Qualité** : profils (nom, mise à niveau, langue pour Radarr, scores minimum et seuil des formats personnalisés, score de chaque format, qualités cochées et ordonnées par glisser-déposer ou flèches, seuil parmi les qualités cochées) et **définitions** (titre, tailles minimum, préférée et maximum en Gio par heure, avec la taille d'un film de 60, 90 et 120 minutes), enregistrées ensemble.
- **Profils de délai** : protocoles, délais Usenet et torrent, contournement ; les étiquettes se choisissent par leur nom. Le profil par défaut ne se supprime pas.
- **Formats personnalisés** et **auto-tags** : conditions choisies parmi les types de l'instance (titre de la release, taille, genre…), avec inversion et caractère requis.
- **Filtres personnalisés** : filtres de l'interface de l'instance, conditions en JSON.

## Configuration

- **Gestion des médias** : nommage (formats, remplacement des deux-points, épisodes multiples pour Sonarr) avec **Prévisualiser** qui calcule les exemples d'après les formats saisis, avant enregistrement ; gestion des fichiers (dossiers vides, liens physiques, fichiers extra, propers, date des fichiers, corbeille, permissions).
- **Interface** : dates, heures, thème, langues de l'instance.
- **Général** : hôte, sécurité, proxy, journaux, mises à jour, sauvegardes ; réglages des indexeurs, clients et listes en lecture.
- **Dossiers racine**, **chemins distants** et **tags** (avec le nombre d'éléments qui utilisent chaque tag ; un tag utilisé ne se supprime pas).

## Système

| Page                   | Contenu                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Commandes              | Commandes récentes, relues toutes les 5 s ; annulation d'une commande en attente ou en cours      |
| Tâches                 | Tâches planifiées, dernière et prochaine exécution ; lancement immédiat                           |
| Logs                   | Fichiers de logs, lignes récentes par page, filtre de niveau, recherche                           |
| Stats                  | Compteurs de la bibliothèque, disques, répartition par qualité, genre, décennie ou chaîne         |
| Parser un titre        | Analyse d'un nom de release par l'instance et film ou série correspondant                         |
| Sauvegardes            | Création suivie jusqu'à la fin, restauration (l'instance redémarre), suppression                  |
| Mises à jour           | Version installée et versions disponibles ; en conteneur, la mise à jour passe par l'image Docker |
| Import de bibliothèque | Scan d'un dossier, recherche automatique de chaque sous-dossier, import des lignes cochées        |
| Suggestions (Radarr)   | Films proposés par les listes d'import, ajout en un clic                                          |
| Renommer (Radarr)      | Propositions de renommage d'un film et renommage                                                  |
| Calendrier (Sonarr)    | Épisodes des 30 prochains jours                                                                   |

Les fichiers de logs et les sauvegardes ne se téléchargent pas depuis Hubarr.

## En cas de problème

- **« Impossible de joindre Radarr/Sonarr »** : l'instance est arrêtée ou injoignable depuis le conteneur Hubarr (voir [Connecter Radarr](./radarr.md)).
- **Enregistrement refusé** : le message de l'instance est affiché tel quel (champ manquant, connexion impossible…).
- **Test en échec** : la réponse de l'instance indique le champ en cause ; corrigez-le et testez de nouveau avant d'enregistrer.
