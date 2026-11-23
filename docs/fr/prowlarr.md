# Connecter Prowlarr

Hubarr pilote [Prowlarr](https://prowlarr.com) (API v1) : indexeurs, recherche sur tous les indexeurs, applications synchronisées, réglages et système. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans Prowlarr, copiez la **clé d'API** (_Settings → General → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Prowlarr**, renseignez l'**URL** telle que Hubarr la joint (par exemple `http://prowlarr:9696`) et la clé d'API.
3. **Tester** vérifie la connexion ; enregistrez.

::: tip Accès réseau
Hubarr interroge Prowlarr depuis son conteneur : `localhost` désigne Hubarr lui-même. Utilisez le nom du service Docker ou l'adresse de la machine hôte.
:::

## Indexeurs

La page **Prowlarr** affiche les compteurs (indexeurs, actifs, en erreur, torrent, usenet, applications), les problèmes signalés par Prowlarr et la liste des indexeurs : protocole, confidentialité, priorité, RSS et recherche, catégories, requêtes, grabs, échecs, santé et date d'ajout. Un filtre limite la liste aux indexeurs actifs, désactivés, torrent ou usenet.

- **Ajouter** : choisissez une définition dans le catalogue (recherche sans accents, filtres par protocole, confidentialité, langue et catégorie), puis renseignez le nom, le profil d'application, la priorité, la redirection, les étiquettes (créées à la volée) et les champs propres à l'indexeur. **Tester** avant d'ajouter.
- **Ligne d'un indexeur** : modifier, tester, activer ou désactiver, supprimer. Le nom ouvre sa **fiche** : détails, capacités de recherche, catégories et historique récent.
- **Tester tout** : chaque indexeur actif est testé ; ceux en échec sont nommés avec leur motif.
- **Synchroniser les applications** : pousse les indexeurs vers Radarr, Sonarr… et suit la commande jusqu'à sa fin.
- **Sélection** : cochez des indexeurs pour les activer, les désactiver, changer leur profil, leur priorité ou leurs étiquettes, ou les supprimer d'un coup.

Les mots de passe et clés des indexeurs ne sont jamais envoyés au navigateur : un champ secret affiche `********` et garde sa valeur si vous n'y touchez pas.

## Recherche

La carte **Recherche** interroge tous les indexeurs actifs (ou un seul) à partir de deux caractères. Les résultats (titre, indexeur, taille, seeds, âge) se trient par colonne ; le titre mène à la page de l'indexeur quand il en donne une. **Récupérer** envoie la release au client de téléchargement configuré pour l'indexeur.

## Paramètres et système

Ces pages s'ouvrent depuis **Paramètres → Services → Prowlarr**, bouton **Paramètres** (onglets des groupes, puis des pages) ; un bouton **Retour aux paramètres** y ramène. Les paramètres regroupent :

| Page            | Contenu                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| Applications    | Applications synchronisées (niveau de synchronisation) et profils de synchronisation |
| Clients téléch. | Clients utilisés par Prowlarr pour ses propres grabs                                 |
| Notifications   | Notifications (grab, santé, mise à jour)                                             |
| Tags            | Étiquettes et leur usage ; une étiquette utilisée ne peut pas être supprimée         |
| Général         | Hôte, sécurité, proxy, journalisation (la clé d'API n'est pas affichée)              |
| Interface       | Formats de date et d'heure, thème, langue de l'interface de Prowlarr                 |

Le groupe **Système** donne le statut et la santé, les tâches planifiées (lancement à la demande), les sauvegardes (création, suppression), les mises à jour (en conteneur, mettez à jour l'image) et les journaux (niveau, recherche). L'onglet **Historique** liste les requêtes, flux RSS et grabs, paginés ou depuis une date.

## En cas de problème

- **« Prowlarr ne répond pas »** : l'URL n'est pas joignable depuis le conteneur Hubarr, ou Prowlarr est arrêté. **Réessayer** relance la vérification.
- **Ajout refusé** : le message de Prowlarr est affiché tel quel (adresse invalide, identifiants refusés…).
- **Recherche trop longue** : Prowlarr interroge chaque indexeur en direct ; au-delà de 90 secondes, Hubarr abandonne et le signale.
