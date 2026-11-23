// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuration VitePress de la documentation utilisateur.
// Bilingue : anglais à la racine, français sous /fr/. Servie par Hubarr sur
// /docs, d'où la base.

import { defineConfig } from 'vitepress';

const SOURCE_URL = 'https://github.com/KilianMahe/hubarr';

export default defineConfig({
  base: '/docs/',
  title: 'Hubarr',
  cleanUrls: false,
  // Données du site dans un chunk à part plutôt qu'en script inline.
  metaChunk: true,
  // En dev, le front (Vite, port 5173) relaie /docs vers ce serveur sous le nom du service.
  vite: { server: { allowedHosts: ['docs'] } },
  lastUpdated: false,
  // Pas de polices ni de scripts tiers : la CSP de Hubarr les refuserait.
  head: [
    ['link', { rel: 'icon', href: '/docs/favicon.ico', sizes: '48x48' }],
    ['link', { rel: 'icon', href: '/docs/icons/hubarr.svg', type: 'image/svg+xml' }],
  ],
  themeConfig: {
    logo: '/icons/hubarr.svg',
    socialLinks: [{ icon: 'git', link: SOURCE_URL, ariaLabel: 'Source code' }],
    search: { provider: 'local' },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'Documentation for Hubarr, a self-hosted interface for your media stack.',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/installation' },
          { text: 'Overview', link: '/overview' },
          { text: 'Architecture', link: '/architecture' },
        ],
        sidebar: [
          {
            text: 'Discover',
            items: [{ text: 'Functional overview', link: '/overview' }],
          },
          {
            text: 'Getting started',
            items: [
              { text: 'Installation', link: '/installation' },
              { text: 'First start', link: '/first-start' },
              { text: 'Settings', link: '/settings' },
              { text: 'Reverse proxy and remote access', link: '/reverse-proxy' },
              { text: 'Mobile app (PWA)', link: '/mobile-app' },
              { text: 'Troubleshooting and FAQ', link: '/troubleshooting' },
            ],
          },
          {
            text: 'Using Hubarr',
            items: [
              { text: 'Dashboard', link: '/dashboard' },
              { text: 'Calendar', link: '/calendar' },
              { text: 'Discover and watchlist', link: '/discover' },
            ],
          },
          {
            text: 'Services',
            items: [
              { text: 'Connect Radarr', link: '/radarr' },
              { text: 'Connect Sonarr', link: '/sonarr' },
              { text: 'Radarr/Sonarr administration', link: '/arr-administration' },
              { text: 'Connect Prowlarr', link: '/prowlarr' },
              { text: 'Connect Bazarr', link: '/bazarr' },
              { text: 'Connect qBittorrent', link: '/qbittorrent' },
              { text: 'Connect Transmission', link: '/transmission' },
              { text: 'Connect Deluge', link: '/deluge' },
              { text: 'Connect SABnzbd', link: '/sabnzbd' },
              { text: 'Connect NZBGet', link: '/nzbget' },
              { text: 'Connect Gluetun (VPN)', link: '/gluetun' },
              { text: 'Connect Tautulli', link: '/tautulli' },
              { text: 'Connect Tracearr', link: '/tracearr' },
              { text: 'Connect Emby', link: '/emby' },
              { text: 'Connect Seerr', link: '/seerr' },
            ],
          },
          {
            text: 'Technical',
            items: [
              { text: 'Technical architecture', link: '/architecture' },
              { text: 'Developing Hubarr', link: '/development' },
            ],
          },
        ],
        footer: { message: 'Released under the AGPL-3.0-or-later license.' },
      },
    },
    fr: {
      label: 'Français',
      lang: 'fr',
      link: '/fr/',
      description: 'Documentation de Hubarr, interface self-hosted pour votre stack média.',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/fr/installation' },
          { text: 'Présentation', link: '/fr/presentation' },
          { text: 'Architecture', link: '/fr/architecture' },
        ],
        sidebar: [
          {
            text: 'Découvrir',
            items: [{ text: 'Présentation fonctionnelle', link: '/fr/presentation' }],
          },
          {
            text: 'Prise en main',
            items: [
              { text: 'Installation', link: '/fr/installation' },
              { text: 'Premier démarrage', link: '/fr/premier-demarrage' },
              { text: 'Paramètres', link: '/fr/parametres' },
              { text: 'Reverse proxy et accès distant', link: '/fr/reverse-proxy' },
              { text: 'Application mobile (PWA)', link: '/fr/application-mobile' },
              { text: 'Dépannage et FAQ', link: '/fr/depannage' },
            ],
          },
          {
            text: 'Utilisation',
            items: [
              { text: 'Tableau de bord', link: '/fr/tableau-de-bord' },
              { text: 'Calendrier', link: '/fr/calendrier' },
              { text: 'Découverte et watchlist', link: '/fr/decouverte' },
            ],
          },
          {
            text: 'Services',
            items: [
              { text: 'Connecter Radarr', link: '/fr/radarr' },
              { text: 'Connecter Sonarr', link: '/fr/sonarr' },
              { text: 'Administration Radarr/Sonarr', link: '/fr/administration-arr' },
              { text: 'Connecter Prowlarr', link: '/fr/prowlarr' },
              { text: 'Connecter Bazarr', link: '/fr/bazarr' },
              { text: 'Connecter qBittorrent', link: '/fr/qbittorrent' },
              { text: 'Connecter Transmission', link: '/fr/transmission' },
              { text: 'Connecter Deluge', link: '/fr/deluge' },
              { text: 'Connecter SABnzbd', link: '/fr/sabnzbd' },
              { text: 'Connecter NZBGet', link: '/fr/nzbget' },
              { text: 'Connecter Gluetun (VPN)', link: '/fr/gluetun' },
              { text: 'Connecter Tautulli', link: '/fr/tautulli' },
              { text: 'Connecter Tracearr', link: '/fr/tracearr' },
              { text: 'Connecter Emby', link: '/fr/emby' },
              { text: 'Connecter Seerr', link: '/fr/seerr' },
            ],
          },
          {
            text: 'Technique',
            items: [
              { text: 'Architecture technique', link: '/fr/architecture' },
              { text: 'Développer Hubarr', link: '/fr/developpement' },
            ],
          },
        ],
        outline: { label: 'Sur cette page' },
        docFooter: { prev: 'Page précédente', next: 'Page suivante' },
        darkModeSwitchLabel: 'Apparence',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Haut de page',
        langMenuLabel: 'Langue',
        footer: { message: 'Publié sous licence AGPL-3.0-or-later.' },
      },
    },
  },
});
