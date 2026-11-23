# Connecter Tautulli

Hubarr affiche l'activité de votre serveur Plex grâce à [Tautulli](https://tautulli.com) : lectures en cours, statistiques, graphiques, historique, bibliothèques et utilisateurs. La page est ouverte à tous les utilisateurs de Hubarr.

## Configurer le service

1. Dans Tautulli, copiez la **clé d'API** (_Settings → Web Interface → API_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Tautulli**, renseignez l'**URL** (par exemple `http://tautulli:8181`) et la clé d'API.
3. **Tester** vérifie la connexion ; enregistrez.

## La page

- **En cours** : une carte par lecture (affiche, titre, utilisateur, lecteur, état, Direct Play / Direct Stream / transcodage, qualité, codecs, bande passante, progression), relue toutes les 10 secondes ; un clic ouvre la fiche du titre (résumé, genres, réalisation, distribution, caractéristiques du fichier).
- **Filtres** : période (7, 30 ou 90 jours), métrique (nombre de lectures ou durée) et utilisateur ; ils s'appliquent aux statistiques et aux graphiques.
- **Statistiques** : films et séries les plus regardés et les plus populaires, utilisateurs et plateformes les plus actifs, flux simultanés maximum.
- **Graphiques** : lectures dans le temps (par type de média ou de flux), par heure, par jour de la semaine, par plateforme, par résolution source et de flux, par utilisateur, et flux simultanés.
- **Historique** : 25 lectures, puis **Charger plus** ; **Bibliothèques** et **Utilisateurs**.

Les affiches passent par Hubarr : votre navigateur ne contacte jamais Tautulli ni Plex directement.

## En cas de problème

- **« Tautulli est injoignable »** : l'URL n'est pas joignable depuis le conteneur Hubarr.
- **« Clé API Tautulli invalide »** : recopiez la clé d'API de Tautulli.
