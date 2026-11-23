# Connecter SABnzbd

Hubarr pilote [SABnzbd](https://sabnzbd.org) : file des téléchargements en temps réel, actions, limite de vitesse, ajout de NZB et historique. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans SABnzbd, copiez la **clé d'API** (_Config → General → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → SABnzbd**, renseignez l'**URL** (par exemple `http://sabnzbd:8080`) et la clé d'API.
3. **Tester** vérifie la connexion ; enregistrez.

## La page

- **En-tête** : téléchargements en cours et en attente, vitesse, temps restant, espace libre ; **Tout mettre en pause** ou **Tout reprendre** selon l'état ; **Limite de vitesse** en Mo/s (vide = illimitée).
- **File** : relue toutes les 3 secondes, filtrée par état et par nom, triée ; vues liste, tableau et compacte, au menu **Affichage**. Pause, reprise et suppression d'un élément (les fichiers partiels sont supprimés), ou de plusieurs après sélection. Un NZB en cours de récupération affiche son délai d'attente.
- **Fiche** : statut, catégorie, tailles, progression, vitesse, temps restant, identifiant et motif d'un échec.
- **Ajouter un NZB** : URL (une par ligne) ou fichiers `.nzb`, catégorie facultative.
- **Historique récent** : les 15 derniers téléchargements, et **Tout voir** pour l'historique complet, 50 par page.

## En cas de problème

- **« Hôte non autorisé »** : ajoutez le nom d'hôte de SABnzbd tel que Hubarr l'utilise dans _Config → Special → host_whitelist_.
- **Clé d'API refusée** : recopiez la clé d'API (pas la clé NZB).
