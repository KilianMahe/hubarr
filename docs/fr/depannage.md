# Dépannage et FAQ

## Lire les journaux

### Page « Journaux » {#page-journaux}

Les administrateurs trouvent les 1 000 dernières entrées du journal dans la section **Journaux** des [Paramètres](./parametres.md#journaux) (`/admin/settings#section-logs` ; l'ancienne adresse `/admin/logs` y mène), sans ouvrir de terminal :

- filtres par niveau minimal, par service et par texte (message et détails) ;
- un clic sur une entrée affiche son détail, et **Copier** la copie en JSON pour la joindre à un rapport de bug ;
- **Télécharger** enregistre les entrées filtrées dans un fichier `.jsonl` (une entrée JSON par ligne) ;
- la liste se rafraîchit toutes les 5 secondes tant que **Actualisation auto** est active.

Quand un appel à un service échoue, l'entrée nomme le service et l'instance, la méthode et le chemin appelés, le statut HTTP ou le code de l'erreur réseau (`ECONNREFUSED`, `ENOTFOUND`, délai dépassé…), la durée, et indique si Hubarr considère désormais le service injoignable (`circuit: open` : les appels sont suspendus 10 secondes).

Les secrets sont masqués avant toute écriture, sur la page comme dans la sortie du conteneur : clés d'API, jetons, mots de passe, en-têtes `Authorization`, cookies, identifiants dans les URL et paramètres d'URL sensibles (`apikey=`, `token=`…) sont remplacés par `[redacted]`.

Les entrées sont gardées en mémoire : elles repartent de zéro à chaque redémarrage. Par défaut, la page garde le même niveau que la console (`HUBARR_LOG_LEVEL`, `warn`). Pour garder plus de détail sur la page sans rendre la console plus bavarde, définissez `HUBARR_LOG_BUFFER_LEVEL=info`.

### Sortie du conteneur

```sh
docker logs -f hubarr
```

Pour plus de détails, passez `HUBARR_LOG_LEVEL` à `info` ou `debug` et redémarrez le conteneur. Au niveau `debug`, Hubarr journalise aussi les compteurs du cache et du temps réel.

## J'ai oublié mon mot de passe

Il n'y a pas de réinitialisation par e-mail. Depuis la machine qui héberge Hubarr :

```sh
docker exec -it hubarr hubarr user:reset-password admin@exemple.fr
```

La commande demande le nouveau mot de passe deux fois, puis ferme toutes les sessions du compte.

## « Trop de tentatives » à la connexion

Après 5 échecs en 15 minutes, la connexion est bloquée pour ce compte et cette adresse IP jusqu'à la fin de la fenêtre ; après 50 échecs sur le même compte, toutes adresses confondues, elle l'est pour toutes les adresses. Une session ouverte ou `hubarr user:reset-password` restent utilisables. Derrière un reverse proxy, vérifiez que `HUBARR_TRUST_PROXY` couvre bien le proxy : sinon tous les visiteurs semblent venir de la même adresse, celle du proxy.

## Un service apparaît injoignable

1. Ouvrez **Paramètres → Services** et cliquez sur **Tester** : le message indique la cause (service injoignable, identifiants refusés, 403, 404, erreur du service, hôte refusé par SABnzbd…).
2. L'URL doit être joignable **depuis le conteneur Hubarr**, pas depuis votre navigateur. Si les services tournent dans le même réseau Docker, utilisez le nom du conteneur (`http://radarr:7878`) ; sinon, l'adresse IP de la machine. `localhost` désigne le conteneur Hubarr lui-même.
3. Après une panne, Hubarr attend 10 secondes avant de réinterroger un service : utilisez **Réessayer** dans le bandeau pour relancer aussitôt.
4. Les adresses de lien local (`169.254.x.x`) et les schémas autres que `http`/`https` sont refusés par sécurité.

## Le conteneur ne démarre pas

| Message                               | Cause et solution                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variables d'environnement invalides` | Une variable a une valeur incorrecte : le message la nomme                                                                                        |
| `EACCES` sur `/data`                  | Le conteneur tourne sous `user:` sans droit d'écriture sur le dossier : retirez `user:` et réglez `PUID`/`PGID`, ou `chown -R <uid>:<gid> ./data` |
| Base plus récente que l'application   | Vous êtes revenu à une version antérieure : réinstallez la version récente, ou restaurez `hubarr.db.bak`                                          |

## Sauvegarder et restaurer

Tout l'état de Hubarr est dans `/data` (volume `hubarr_data` par défaut) : `hubarr.db` (base), `hubarr.db.bak` (copie faite avant chaque mise à jour du schéma) et `avatars/`.

```sh
docker compose stop
# Sauvegarder le volume dans hubarr-data.tar.gz (dossier courant)
docker run --rm -v hubarr_hubarr_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/hubarr-data.tar.gz -C /data .
# Restaurer
docker run --rm -v hubarr_hubarr_data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/hubarr-data.tar.gz -C /data'
docker compose start
```

Compose préfixe le volume par le nom du projet (`docker volume ls` le confirme) ; avec un dossier de l'hôte (`./data:/data`), il suffit de copier ce dossier, conteneur arrêté.

L'**export** de **Paramètres → Sauvegarde** produit un fichier JSON avec la configuration des services et des préférences, à réimporter sur une autre installation.

## L'application ne s'installe pas sur mon téléphone

L'installation d'une PWA exige le HTTPS. Voir [Application mobile](./application-mobile.md).

## Le calendrier iCal ne se synchronise pas dans mon agenda

Le flux `/calendrier.ics` exige une session Hubarr : il fonctionne dans un navigateur connecté, mais pas encore dans les applications d'agenda qui ne transmettent pas le cookie de session.
