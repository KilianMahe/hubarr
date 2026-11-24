# Application mobile (PWA)

Hubarr est une **application web progressive** : on l'installe sur l'écran d'accueil d'un téléphone, d'une tablette ou d'un ordinateur, et elle s'ouvre ensuite en plein écran, sans barre d'adresse, comme une application native.

## Prérequis

L'installation exige une connexion **HTTPS** (voir [Reverse proxy](./reverse-proxy.md)). Sur `http://192.168.x.x:7070`, l'application reste utilisable dans le navigateur mais ne s'installe pas.

## Installer

- **Android (Chrome, Edge)** : menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
- **iPhone et iPad (Safari)** : bouton Partager → **Sur l'écran d'accueil**.
- **Ordinateur (Chrome, Edge)** : icône d'installation à droite de la barre d'adresse.

## Ce qui est gardé hors ligne

Le service worker garde la **coquille** de l'application (page, scripts, styles, icônes) pour un démarrage rapide. Une nouvelle version de Hubarr est prise en compte au lancement suivant.

## Affichage immédiat à la réouverture

Le navigateur garde aussi, pendant 24 heures, ce que vous avez consulté en dernier dans le tableau de bord, la découverte, le calendrier, les bibliothèques et les fiches des films et des séries. Quand vous rechargez ou rouvrez Hubarr, ces écrans affichent aussitôt ce contenu, puis le mettent à jour : un fin liseré en haut de l'écran signale la mise à jour en cours.

- Les journaux, les paramètres, votre profil, l'activité et les files de téléchargement ne sont jamais gardés : ils viennent toujours de vos services.
- Cette copie est propre à votre compte et à la version de Hubarr : elle est effacée à la déconnexion, à la fin de votre session, quand un autre compte se connecte et à chaque mise à jour de Hubarr.
- Sans réseau, l'application s'ouvre sur ce contenu mais ne peut pas le mettre à jour.

## Gestes sur mobile

Les gestes propres au mobile (barre du bas, appui long pour sélectionner, tirer pour actualiser…) sont décrits dans [Premier démarrage](./premier-demarrage.md#sur-mobile).
