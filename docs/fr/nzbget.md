# Connecter NZBGet

Hubarr pilote [NZBGet](https://nzbget.com) par son API JSON-RPC, avec la même page que SABnzbd. Ces écrans sont réservés aux administrateurs.

## Configurer le service

1. Dans NZBGet, notez l'utilisateur et le mot de passe de contrôle (_Settings → Security_).
2. Dans Hubarr, ouvrez **Paramètres → Services → NZBGet**, renseignez l'**URL** (par exemple `http://nzbget:6789`), l'utilisateur et le mot de passe.
3. **Tester** vérifie la connexion ; enregistrez.

## Différences avec SABnzbd

La page est décrite dans la fiche [SABnzbd](./sabnzbd). Pour NZBGet :

- la vitesse est donnée par téléchargement ; le temps restant est celui de la file entière ;
- les motifs d'échec de l'historique (réparation, décompression, doublon…) sont traduits ;
- les catégories proposées à l'ajout sont celles de la configuration de NZBGet.

## En cas de problème

- **401** : utilisateur ou mot de passe faux (le compte « restreint » ne peut pas agir sur la file).
