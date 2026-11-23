// SPDX-License-Identifier: AGPL-3.0-or-later
// Point d'entrée de la SPA : état initial du serveur, langue, thème, puis
// Pinia, routeur, TanStack Query et montage.

import 'vuetify/styles';
import './theme/theme.css';
import '../components/ds/design-system.css';
import { APP_NAME, type ServicesHealthResponse } from '@hubarr/shared';
import { MutationCache, QueryCache, QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp, watch } from 'vue';
import App from './App.vue';
import { ApiError } from './api/client';
import { handleSessionError } from './api/errors';
import { SERVICES_HEALTH_KEY } from './health';
import { fetchBootstrap, resolveInitialTheme, resolveLocale } from './boot';
import { i18n, setLocale } from './plugins/i18n';
import { createHubarrVuetify } from './plugins/vuetify';
import { registerServiceWorker } from './pwa';
import { createHubarrRouter } from './router';
import { useSessionStore } from './stores/session';

const bootstrap = await fetchBootstrap();
await setLocale(resolveLocale(window.location.search, bootstrap));
const vuetify = createHubarrVuetify(resolveInitialTheme(bootstrap));

const pinia = createPinia();
useSessionStore(pinia).hydrate(bootstrap);

// Le routeur lit l'état de santé en cache (garde « injoignable ») ; le client
// de requêtes redirige sur une session expirée : chacun a besoin de l'autre.
// Le getter n'est appelé qu'à la navigation, une fois `queryClient` créé.
const router = createHubarrRouter(pinia, undefined, {
  health: () => queryClient.getQueryData<ServicesHealthResponse>(SERVICES_HEALTH_KEY),
});

const onError = (error: unknown) => handleSessionError(error, router);
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Inutile de rejouer une erreur de l'API (4xx) : seules les erreurs réseau le sont.
      retry: (count, error) => count < 2 && error instanceof ApiError && error.code === 'NETWORK',
    },
  },
});

// Titre de l'onglet : celui de l'écran, retraduit au changement de langue.
function updateTitle(): void {
  const to = router.currentRoute.value;
  const key = [...to.matched].reverse().find((record) => record.meta.titleKey)?.meta.titleKey;
  document.title = key ? `${i18n.global.t(key)} - ${APP_NAME}` : APP_NAME;
}
router.afterEach(updateTitle);
watch(i18n.global.locale, updateTitle);

createApp(App)
  .use(pinia)
  .use(i18n)
  .use(vuetify.plugin)
  .use(router)
  .use(VueQueryPlugin, { queryClient })
  .mount('#app');

registerServiceWorker(bootstrap?.version);
