# Paramètres

La page **Paramètres** (`/admin/settings`, menu du compte ou bas du menu latéral) est réservée aux administrateurs. Elle compte cinq onglets ; chaque onglet a sa propre adresse (`#section-services`, `#section-display`…), pratique pour un marque-page.

## Services externes

Les services sont regroupés par catégorie : médias (TMDb, Radarr, Sonarr), indexeurs et demandes (Prowlarr, Seerr), téléchargements (qBittorrent, Deluge, Transmission, SABnzbd, NZBGet, Gluetun) et supervision (Tautulli, Tracearr, Emby, Bazarr). Les services déjà connectés apparaissent en premier, ouverts.

Pour chaque service :

- **URL** et **identifiants** (clé d'API, ou utilisateur et mot de passe). Une clé ou un mot de passe enregistré n'est jamais réaffiché : laissez le champ vide pour le conserver, saisissez une nouvelle valeur pour le remplacer.
- **Tester** vérifie la connexion avec les valeurs saisies, avant même d'enregistrer. Le résultat indique la cause d'un échec : service injoignable, identifiants refusés, accès refusé (403), mauvaise URL (404), erreur du service, ou hôte refusé par SABnzbd (`host_whitelist`).
- **Effacer** (utilisateur et mot de passe de qBittorrent, Deluge, Transmission, NZBGet) vide explicitement l'identifiant, utile quand un proxy authentifie à la place du service.
- **Activé** coupe un service sans perdre sa configuration : Hubarr cesse de l'interroger et le considère comme non configuré.
- **Menu** l'affiche ou le masque dans le menu latéral.
- **Retirer** efface toute sa configuration, secrets compris.

Les URL `file://`, `gopher://`… et les adresses de lien local (`169.254.x.x`, métadonnées des clouds) sont refusées. Les adresses de votre réseau local (`192.168.x.x`, `10.x.x.x`) sont acceptées.

### Administration des services

Les cartes de Prowlarr et Seerr ont un bouton **Paramètres** à côté de **Enregistrer** ; pour Radarr et Sonarr, c'est l'icône en forme de roue dentée à côté du test de chaque instance activée. Il ouvre une page dédiée aux réglages du service dans Hubarr, avec deux rangées d'onglets : les **groupes** (configuration, système…), puis les **pages** du groupe (profils, indexeurs, clients, notifications, général, état, tâches, journaux, sauvegardes, mises à jour…). Chaque page garde son adresse et propose un bouton **Retour aux paramètres**.

### Plusieurs instances Radarr ou Sonarr

Radarr et Sonarr acceptent plusieurs instances (par exemple « Radarr » et « Radarr 4K ») :

- la première instance devient l'**instance par défaut** ; vous pouvez en désigner une autre ;
- l'**identifiant URL** (slug), tiré du nom, apparaît dans les adresses (`/medias/radarr-4k/films`) : le modifier casse les marque-pages ;
- une instance **désactivée** disparaît du menu ; désactiver ou supprimer la dernière instance active masque le service ;
- le **profil de qualité par défaut** est proposé lors des ajouts rapides.

## Santé des services

L'icône de santé de la barre du haut résume l'état des services configurés (vert : tout répond ; orange : une partie ; rouge : aucun) et liste chaque service et chaque instance. Une pastille colorée accompagne aussi chaque entrée du menu latéral. L'état est vérifié toutes les minutes ; un service vu injoignable n'est pas réinterrogé pendant 10 secondes.

Quand un service ne répond pas, sa page affiche un bandeau qui en donne la raison ; **Réessayer** relance la vérification aussitôt. La page d'un service non configuré renvoie vers ces paramètres, celle d'un service désactivé vers l'accueil.

## Affichage

- **Page d'accueil** : tableau de bord, recherche (TMDb), films, séries, qBittorrent ou dernière page visitée. Si la page choisie n'est pas disponible, Hubarr ouvre le premier service configuré.
- **Notifications** : désactivées, seules les erreurs restent affichées.
- **Fuseau horaire**, **formats de date et d'heure** ; par défaut, le fuseau du système (`TZ`).
- **Thème** (classique avec bascule clair/sombre, ou l'un des 17 préréglages) et **couleur principale** : appliqués dès l'enregistrement.
- **Rafraîchissement** de qBittorrent, Deluge et Transmission, **source de l'activité en direct**, **densité** et **éléments par page**.
- **Visibilité dans le menu latéral** de chaque service et du calendrier.
- **Disposition du tableau de bord** : ordre (boutons Monter/Descendre) et sections affichées.

::: tip Rafraîchissement et temps réel
Le rafraîchissement d'un client torrent règle la surveillance globale sur les pages média : nombre de téléchargements actifs dans le menu latéral et notification à la fin (ou en erreur) d'un téléchargement, une seule fois tous onglets confondus. `0` la désactive. Les écrans se mettent à jour par un flux temps réel : Hubarr ne sollicite chaque service qu'une fois par intervalle, quel que soit le nombre d'onglets ouverts, et revient tout seul à des relectures périodiques si le flux est coupé (proxy, réseau).
:::

**Réinitialiser** remet toutes ces préférences et la disposition du tableau de bord à leurs valeurs par défaut.

## Langues

Langue de l'interface de Hubarr et langue des métadonnées TMDb, puis langue de l'interface de chaque service connecté : Radarr (interface et informations des films, par instance), Sonarr (interface, par instance), Prowlarr et Seerr. Un service injoignable est signalé ; les autres sont enregistrés quand même.

## Sauvegarde

- **Exporter** télécharge un fichier JSON avec les préférences, la disposition, la visibilité dans le menu, les URL et utilisateurs des services et les instances Radarr/Sonarr. **Aucune clé d'API ni aucun mot de passe** n'y figure.
- **Importer** relit un tel fichier (64 Ko au plus). L'import ajoute ou met à jour, sans rien supprimer ; une instance existante garde sa clé d'API. Ressaisissez ensuite les clés et mots de passe.

Les exports de Prismarr ne sont pas acceptés : une installation de Hubarr repart de zéro.

## À propos

Version de Hubarr, version de Node.js, emplacement et taille de la base, heure du serveur, et liens vers le code source et cette documentation.
