# Application mobile (PWA)

Hubarr est une **application web progressive** : on l'installe sur l'écran d'accueil d'un téléphone, d'une tablette ou d'un ordinateur, et elle s'ouvre ensuite en plein écran, sans barre d'adresse, comme une application native.

## Prérequis

L'installation exige une connexion **HTTPS** (voir [Reverse proxy](./reverse-proxy.md)). Sur `http://192.168.x.x:7070`, l'application reste utilisable dans le navigateur mais ne s'installe pas.

## Installer

- **Android (Chrome, Edge)** : menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
- **iPhone et iPad (Safari)** : bouton Partager → **Sur l'écran d'accueil**.
- **Ordinateur (Chrome, Edge)** : icône d'installation à droite de la barre d'adresse.

## Ce qui est gardé hors ligne

Le service worker garde la **coquille** de l'application (page, scripts, styles, icônes) pour un démarrage rapide. Les **données** (bibliothèques, téléchargements, activité) ne sont jamais mises en cache : sans réseau, l'application s'ouvre mais ne peut rien afficher de vos services. Une nouvelle version de Hubarr est prise en compte au lancement suivant.

## Gestes sur mobile

Les gestes propres au mobile (barre du bas, appui long pour sélectionner, tirer pour actualiser…) sont décrits dans [Premier démarrage](./premier-demarrage.md#sur-mobile).
