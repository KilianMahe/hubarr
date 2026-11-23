<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Assistant d'installation (`setup/_layout.html.twig`) : logo, bascule de
// thème, étapes (Accueil, Compte, Services : la dernière est la section des
// services des paramètres), carte de l'étape.
//
// À l'arrivée, `GET /api/setup` dit où en est l'installation : une
// installation à moitié faite (admin créé sans fin d'assistant) y est close, et
// le visiteur repart alors vers la connexion.
import { setupStateResponseSchema } from '@hubarr/shared';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../app/api/client';
import { useSessionStore } from '../app/stores/session';
import AuthFooter from '../components/AuthFooter.vue';
import HubarrLogo from '../components/HubarrLogo.vue';
import ThemeToggle from '../components/ThemeToggle.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const STEPS = [
  { key: 'welcome', label: 'setup.stepper.welcome' },
  { key: 'admin', label: 'setup.stepper.admin' },
  { key: 'services', label: 'setup.stepper.services' },
] as const;
const active = computed(() => (route.name === 'setup-admin' ? 2 : 1));

onMounted(async () => {
  const state = await api.get('/api/setup', setupStateResponseSchema).catch(() => null);
  if (state !== null && state.next !== 'welcome') {
    session.setupRequired = false;
    await router.replace({ name: session.authenticated ? 'home' : 'login' });
  }
});
</script>

<template>
  <v-main class="bg-background">
    <v-container class="py-6" style="max-width: 640px">
      <div class="d-flex align-center justify-space-between mb-6">
        <HubarrLogo />
        <ThemeToggle />
      </div>
      <ol
        class="setup-steps d-flex align-center ga-2 mb-4 pa-0"
        :aria-label="t('setup.layout.title')"
      >
        <template v-for="(step, index) in STEPS" :key="step.key">
          <li
            class="d-flex align-center ga-2"
            :aria-current="index + 1 === active ? 'step' : undefined"
          >
            <v-avatar
              size="28"
              :color="index + 1 <= active ? 'service' : 'surface-alt'"
              class="text-label-large"
              >{{ index + 1 }}</v-avatar
            >
            <span class="d-none d-sm-inline text-label-large">{{ t(step.label) }}</span>
          </li>
          <v-divider v-if="index < STEPS.length - 1" aria-hidden="true" />
        </template>
      </ol>
      <v-card rounded="xl" class="pa-2 pa-sm-4">
        <router-view />
      </v-card>
      <AuthFooter />
    </v-container>
  </v-main>
</template>

<style scoped>
.setup-steps {
  list-style: none;
}
</style>
