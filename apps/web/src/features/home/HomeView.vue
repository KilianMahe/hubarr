<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
// Accueil (`home/welcome.html.twig`) : écran de bienvenue quand ni la page
// d'accueil choisie ni aucun service ne peut être ouvert (la garde du routeur
// redirige sinon, `app/home.ts`).
import { mdiDownload, mdiMagnify, mdiMovieOpen, mdiStarFourPoints } from '@mdi/js';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../../app/stores/session';
import HubarrLogo from '../../components/HubarrLogo.vue';

const { t } = useI18n();
const session = useSessionStore();

const CARDS = [
  { icon: mdiStarFourPoints, key: 'discovery' },
  { icon: mdiMovieOpen, key: 'managers' },
  { icon: mdiMagnify, key: 'indexers' },
  { icon: mdiDownload, key: 'downloads' },
];
</script>

<template>
  <v-container class="py-8" style="max-width: 1100px">
    <div class="text-center mb-8">
      <HubarrLogo :size="64" :with-name="false" />
      <h1 class="text-headline-medium mt-4 mb-2">{{ t('home.welcome.title') }}</h1>
      <p class="text-body-large text-muted">{{ t('home.welcome.subtitle') }}</p>
    </div>
    <v-row>
      <v-col v-for="card in CARDS" :key="card.key" cols="12" sm="6" lg="3">
        <v-card
          :to="session.isAdmin ? { name: 'settings', hash: '#section-services' } : undefined"
          rounded="xl"
          class="h-100 text-center pa-4"
          :data-test="`home-card-${card.key}`"
        >
          <v-icon :icon="card.icon" size="32" color="service" class="mb-3" />
          <v-card-title class="text-title-medium text-wrap">{{
            t(`home.welcome.cards.${card.key}.title`)
          }}</v-card-title>
          <v-card-text class="text-muted">{{
            t(`home.welcome.cards.${card.key}.subtitle`)
          }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
