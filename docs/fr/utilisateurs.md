# Utilisateurs et accès

Hubarr peut se partager : l'administrateur crée des comptes et décide, service par service, de ce que chacun peut faire. Les comptes se gèrent dans **Paramètres → Utilisateurs** (`/admin/settings#section-users`).

## Rôles

| Rôle               | Ce qu'il peut faire                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrateur** | Tout, sur tous les services, ainsi que les paramètres de Hubarr (services, instances, utilisateurs, affichage, sauvegarde, journaux)                                       |
| **Utilisateur**    | Seulement les services que l'administrateur lui ouvre, en lecture seule ou en lecture et écriture. Tableau de bord, calendrier, recherche et découverte n'affichent qu'eux |

L'assistant d'installation crée le premier administrateur. Hubarr en garde toujours au moins un : un administrateur ne peut ni supprimer son propre compte ni se retirer le rôle d'administrateur.

## Créer un compte

1. Ouvrez **Paramètres → Utilisateurs** et choisissez **Ajouter un utilisateur**.
2. Saisissez l'adresse e-mail, un nom affiché facultatif et un **mot de passe provisoire** (8 caractères au moins).
3. Choisissez le rôle. Pour un **Utilisateur**, réglez l'accès à chaque service : **Aucun**, **Lecture** ou **Écriture**. Les boutons **Tout :** appliquent un même niveau à toutes les lignes.
4. Choisissez **Créer le compte**, puis transmettez l'e-mail et le mot de passe provisoire à la personne. Elle peut changer son mot de passe dans son profil.

## Niveaux d'accès

| Niveau       | Signification                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Aucun**    | Le service n'apparaît pas : ni entrée de menu, ni carte du tableau de bord, ni sorties au calendrier, ni résultat de recherche. Ses pages ramènent à l'accueil                       |
| **Lecture**  | Consulter les pages du service (bibliothèque, file d'attente, historique, indexeurs, demandes…). Les pages affichent une pastille **Lecture seule** et masquent les boutons d'action |
| **Écriture** | Agir aussi : ajouter, modifier, supprimer, lancer une recherche, approuver une demande, mettre un téléchargement en pause…                                                           |

- L'accès à Radarr et Sonarr se règle **par instance** : un utilisateur peut par exemple écrire sur « Films » et seulement lire « Films 4K ».
- La watchlist relève de la découverte : la modifier demande l'**Écriture** sur TMDB.
- Arrêter une lecture Tracearr demande l'**Écriture** sur Tracearr.
- L'**écriture** sur Prowlarr permet de gérer les indexeurs (ajout, modification, test, activation, suppression) et de lancer la synchronisation des applications ; les autres commandes de Prowlarr (sauvegarde, recherche de mise à jour…) restent aux administrateurs.
- En **lecture**, l'état de suivi d'un film, d'une série, d'une saison ou d'un épisode reste visible mais ne peut pas être changé.
- Certaines pages restent **réservées aux administrateurs** quel que soit l'accès : les pages de réglages et de système de chaque service (administration Radarr/Sonarr, réglages et système de Prowlarr, utilisateurs, réglages et tâches de Seerr) et tous les paramètres de Hubarr. Sur l'onglet **Serveur** de Radarr ou Sonarr, la version du service n'est affichée qu'aux administrateurs.

Hubarr contrôle chaque requête sur le serveur : masquer un bouton n'est qu'un confort, un utilisateur sans le droit reçoit un message « Action non autorisée ».

## Modifier ou supprimer un compte

- **Modifier** change l'e-mail, le nom, le rôle et les accès. Les nouveaux accès s'appliquent aussitôt, sans reconnexion.
- Un **nouveau mot de passe provisoire** ferme les sessions ouvertes du compte.
- **Supprimer** retire le compte et ferme ses sessions. Supprimer une instance Radarr ou Sonarr retire aussi les accès accordés sur elle.
