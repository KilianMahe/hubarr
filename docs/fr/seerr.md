# Connecter Seerr

Hubarr administre [Seerr](https://github.com/Fallenbagel/jellyseerr) (anciennement Jellyseerr / Overseerr) : demandes des utilisateurs, comptes et permissions, réglages, serveurs Radarr et Sonarr, tâches, cache et journaux. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans Seerr, copiez la **clé d'API** (_Paramètres → Général → Clé API_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Seerr**, renseignez l'**URL** (par exemple `http://seerr:5055`) et la clé.
3. **Tester** vérifie la connexion ; enregistrez.

## Demandes

Demandes les plus récentes d'abord. Filtres d'état avec leurs compteurs, type (films ou séries) et tri (date de demande ou de modification), conservés dans l'adresse de la page, et un champ pour filtrer la page par titre ou demandeur. Chaque carte montre l'affiche, le titre, le type, le statut, le demandeur et la date ; une demande en attente choisit son **profil de qualité** et son **dossier racine** directement sur la carte, puis s'**approuve** ou se **refuse**, une demande approuvée se **relance**, toutes se **modifient** (profil de qualité, dossier racine, étiquettes Radarr ou Sonarr, demandeur, saisons) ou se **suppriment**.

## Utilisateurs

Liste avec recherche, rôle et nombre de demandes ; **Créer un utilisateur** local, **Importer Jellyfin** (seuls les comptes pas encore importés sont proposés). La fiche d'un utilisateur regroupe ses paramètres (nom, e-mail, régions et langues, quotas), son mot de passe (8 caractères au moins), ses **permissions** (les permissions dépendantes se grisent comme dans Seerr ; celles de la 4K n'apparaissent que si un serveur 4K existe), ses notifications et ses demandes. Le compte propriétaire n'est jamais modifié depuis Hubarr, et un compte administrateur ne peut pas être supprimé.

## Réglages

Les réglages et le système de Seerr s'ouvrent depuis **Paramètres → Services → Seerr**, bouton **Paramètres** ; un bouton **Retour aux paramètres** y ramène, et deux rangées d'onglets (réglages, système, puis leurs pages) passent d'une page à l'autre.

- **Général** et **Utilisateurs par défaut** : nom et URL de l'application, régions et langues, filtres, demandes partielles ; modes de connexion, quotas et permissions par défaut.
- **Jellyfin** : paramètres en lecture seule et **analyse manuelle** des bibliothèques.
- **Services** : serveurs Radarr et Sonarr (ajout, test, modification, suppression) et règles de substitution.
- **Tâches & Cache**, **Logs**, **À propos**, **Mises à jour** (notes de version publiées sur GitHub).

Les clés d'API (celle de Seerr, de Jellyfin et des serveurs Radarr/Sonarr) ne sont jamais affichées : le champ montre `********`, et le laisser tel quel conserve la clé enregistrée.
