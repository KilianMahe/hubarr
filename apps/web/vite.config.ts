// SPDX-License-Identifier: AGPL-3.0-or-later
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  // Build en chemins relatifs : `index.html` les résout contre sa balise
  // `<base href>`, que le serveur adapte au préfixe du reverse proxy (matrice n° 65).
  base: command === 'build' ? './' : '/',
  // Composants et directives Vuetify importés à la demande (tree-shaking).
  plugins: [vue(), vuetify({ autoImport: true })],
  // Drapeaux de compilation de vue-i18n : API Composition seule, et compilateur
  // de messages retiré du bundle (remplacé par le compilateur ICU).
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_DROP_MESSAGE_COMPILER__: true,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Accès par le nom du service depuis les autres conteneurs (navigateur Playwright).
    allowedHosts: ['web'],
    // Polling activable pour Docker Desktop ou un dépôt sur un disque Windows.
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    // En dev, l'API est servie par le conteneur `server`.
    proxy: {
      '/api': process.env.HUBARR_API_URL ?? 'http://server:7070',
      // Documentation servie par VitePress (service `docs`), sous /docs comme en prod.
      '/docs': process.env.HUBARR_DOCS_URL ?? 'http://docs:5174',
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'happy-dom',
    // Montage complet du shell (Vuetify, routeur, i18n) : plus de 5 s quand
    // `make check` fait tourner les tests serveur en même temps ;
    // 30 s depuis P5 (le tiroir monte aussi la pastille et le badge Seerr).
    testTimeout: 30_000,
    // Vuetify importe ses feuilles de style depuis ses modules : à transformer par Vite.
    server: { deps: { inline: ['vuetify'] } },
  },
}));
