# Connecter Emby

Hubarr lit les sessions de votre serveur [Emby](https://emby.media) pour le widget d'activité du tableau de bord : lectures en cours, Direct Play ou transcodage, bande passante répartie entre réseau local et Internet. Emby n'a pas de page propre dans Hubarr.

## Configurer le service

1. Dans Emby, créez une **clé d'API** (_Tableau de bord → Avancé → Clés d'API_).
2. Dans Hubarr, ouvrez **Paramètres → Services → Emby**, renseignez l'**URL** (par exemple `http://emby:8096`) et la clé. Le préfixe `/emby` est ajouté s'il manque.
3. **Tester** vérifie la connexion ; enregistrez.

Les affiches passent par Hubarr : votre navigateur ne contacte jamais Emby directement.
